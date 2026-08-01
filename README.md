<p align="center">
  <img src="assets/banner.svg" alt="Aperture" width="100%">
</p>

<p align="center">
  <img src="assets/badges.svg" alt="Status badges" width="800">
</p>

# Aperture

**The rich client for the Lumina Constellation — web, desktop, and mobile.**

Aperture is the surface a person actually uses. One React codebase ships as a web app, a
signed desktop application for Windows and macOS, and an installable mobile PWA, all speaking
one versioned contract to a thin Rust backend-for-frontend that reaches every capability
through a single sanctioned door into the kernel.

It is a thin, luminous client over a fat sovereign backend. It holds no secrets, opens no
egress of its own, sends no telemetry anywhere, and never talks to a model provider directly.

---

## What Aperture is

- **Full-featured chat** with token-by-token streaming, workspaces and threads, message
  editing and branching, attachments, and first-class rendering of tool calls and their results.
- **A media surface.** Muse — library browsing, metadata, artwork, and playback — embedded as
  a module, not linked out to.
- **A build surface.** Harmony — runs, dispatch, reviews, and specs — with the marquee
  capability: **turn a conversation into a tracked spec** and ingest it into the build pipeline.
- **A memory surface.** Browse and search what the assistant remembers, and see how it is
  changing over time.
- **Three real targets.** Web, desktop (Windows + macOS, signed and notarized, auto-updating),
  and an installable PWA with offline support and push.

## What Aperture is not

- **Not a fork or vendoring of any third-party client.** Prior art was studied closely and
  good ideas are credited, but no upstream client source is imported. The constellation
  already serves inference, embeddings, rerank, audio, images, document parsing, tools, and
  agent execution natively — a bundled JavaScript server reimplementing those would be a
  downgrade, not a head start.
- **Not a replacement for Matrix.** Matrix remains a first-class, fully supported transport.
  Aperture is an addition, not a migration.
- **Not a telemetry surface.** No analytics, no external CDN, no remote fonts, no phone-home.
  A build-time lint fails the build if an external origin appears in the bundle, and the
  runtime CSP served by the backend is what actually enforces it.

---

## Architecture

<p align="center">
  <img src="assets/architecture.svg" alt="Aperture architecture" width="100%">
</p>

```
  web              desktop (Tauri)        mobile (PWA)
   └──────────────────────┴──────────────────────┘
                          │  SSE + REST — one versioned contract
                          ▼
                  Aperture BFF  (Rust, inside the agent core)
                  /v1/aperture/{auth,threads,stream,attachments,modules,events}
                          │
                          ▼  the single sanctioned door
                       Kernel
        ┌────────────┬─────┴──────┬─────────────┐
        ▼            ▼            ▼             ▼
    inference      build        media        memory
```

The client bundles never hold a backend secret and never address a backend service directly.
Inference is reached by **named proxy** (a logical route), never by model or engine name — the
routing decision belongs to the inference layer, not to the client.

---

## Targets

| Target | Status | Notes |
|---|---|---|
| **Web** | In development | Served by the agent core; installable as a PWA |
| **Desktop — Windows** | Planned (Sprint E) | Tauri v2, signed installer, auto-update |
| **Desktop — macOS** | Planned (Sprint E) | Tauri v2, signed + notarized, Apple Silicon and Intel |
| **Mobile — PWA** | Planned (Sprint F) | Offline shell, Web Push, share target |
| **Mobile — native** | Deferred | A separate, later workstream — not overclaimed here |

## Channels

Aperture is one channel among several. The assistant's channel adapters all feed the same
guarded agent loop, so behaviour is identical regardless of where a message arrives from.

| Channel | Status | Notes |
|---|---|---|
| **Matrix** | Retained, first-class | Not deprecated and not scheduled for removal |
| **Aperture** | New, first-class | Adds surfaces a chat room cannot render |
| **Telegram** | Optional | Adapter exists; selectable and documented, **off by default** |
| **Signal** | Stub only | Skeleton and capability descriptor; reports unavailable. No provisioning |
| **CLI** | Unchanged | |

---

## Quick start

```bash
# client workspace — Node >= 20
npm --prefix client ci
npm --prefix client run build      # contract-drift + SDK gates, tsc --noEmit, vite build, egress lint
npm --prefix client run test
```

The backend feature ships with the agent core behind a cargo feature. Full setup — including
secret provisioning, first-run onboarding, and per-target installation — is in
**[docs/INSTALL.md](docs/INSTALL.md)**.

## The client workspace

`client/` is a Vite + React 18 + TypeScript single-page app. Dependency versions are pinned
exactly — no ranges — so every machine and every CI run builds the same tree. There is no
Tailwind: styling is the shared constellation token layer (see **Design system** below).

| Script | What it does |
|---|---|
| `npm --prefix client run dev` | Vite dev server |
| `npm --prefix client run typecheck` | `tsc --noEmit` under `strict` |
| `npm --prefix client run build` | the drift gate → the SDK static gate → `tsc --noEmit` → `vite build` → the egress lint. Any of them failing fails the build |
| `npm --prefix client run test` | vitest |
| `npm --prefix client run gen:api` | regenerate the typed SDK from `contracts/aperture-api-v1.yaml` |
| `npm --prefix client run assert-api-current` | the contract-drift gate — regenerate and diff |
| `npm --prefix client run assert-sdk-clean` | the SDK static gate — no absolute URL, no default endpoint, one request site |
| `npm --prefix client run assert-no-external-hosts` | the egress lint, against an existing `client/dist` |

Fonts are **bundled**, not fetched: the `@fontsource/*` packages emit the woff2 files into the
build output, so no font host is contacted at runtime. Backend addressing is never compiled in
— no absolute URL and no default endpoint anywhere in the client. The transport's base URL is
injected per target.

### The generated API client

`client/src/api/` is the only way the client talks to the backend.

- **`generated/`** — types, an operation table, and the contract version, generated from
  `contracts/aperture-api-v1.yaml` by `openapi-typescript` at an exactly pinned version and
  **checked in**, so a build never needs the network or the generator to have run.
- **`transport.ts`** — the injectable transport. It is the **only** file in the client that
  constructs a request. A gate over the parsed syntax tree enforces this as a **reference**
  rule, not a call rule: `fetch`, `XMLHttpRequest`, `EventSource`, `WebSocket` and `sendBeacon`
  may not be *named* elsewhere at all, so an alias or a bracket access fails just as a call
  does. A computed access on a global object is reported as unresolvable rather than passed
  over; a name assembled at runtime is the one case no static rule reaches, and it is flagged
  rather than silently allowed.
- **`client.ts`** — `call(transport, operationId, …)`. The compiler derives the method, path,
  parameters, request body, and success body from the generated types, so there is no
  hand-written second copy of the contract to drift.

**The base URL is a required constructor argument with no default.** There is no compiled-in
endpoint anywhere, and the two targets differ:

| Target | `baseUrl` | Auth | Cookies on the wire |
|---|---|---|---|
| Web, mobile PWA | `''` — every request same-origin relative | the `__Host-` session cookie | `credentials: 'same-origin'` |
| Desktop | the operator-configured endpoint, read at runtime from OS secure storage | a bearer token | `credentials: 'omit'` |

Cookie auth with a non-empty base URL **throws at construction**, and so does bearer auth with
an empty one: a cross-origin cookie cannot be `SameSite=Strict`, and the flags are never
loosened to make one work. **No CORS headers are served on `/v1/aperture/*`, ever** — the web
targets are same-origin, and the desktop reaches the API as a native HTTP client (it injects
its own `fetch`), which is not subject to the same-origin policy.

Error and retry behaviour, stated exactly:

- Every problem-details response becomes a typed error carrying the closed `Problem` object;
  `auth-required` and `auth-expired` become `ApertureAuthError`, which the UI can act on. A
  response that is **not** conforming problem details becomes `ApertureMalformedResponseError`
  — no `Problem` is synthesized, because inventing a contract error URN for a body that never
  carried one would put a fabricated error identity in front of a caller switching on identity.
- **Which verbs.** Automatically, idempotent ones only (`GET`, `HEAD`, `OPTIONS`, `PUT`,
  `DELETE`, `TRACE`); a `POST` is never retried automatically, even carrying an
  `Idempotency-Key`. That restriction governs the **default** decision: an explicit
  `retry: true` on a request overrides it, which is how a caller that knows the route
  implements the dedupe store opts in. `retry: false` opts out.
- **Which statuses.** 408, 502 and 504 are retried on the transport's own full-jitter
  exponential backoff. **429 and 503 are retried only when the server supplies a usable
  `Retry-After`** — a server that declined to name an interval has not asked to be retried at a
  time of the client's choosing, and guessing one is how a thundering herd starts. Nothing else
  is ever retried, including 500 and including under an explicit `retry: true`. `Retry-After` is
  honoured and never shortened; if it exceeds the delay cap the transport gives up rather than
  retrying early. A table-driven test asserts the attempt count for every status in the policy,
  with and without the header, so the stated policy and the code cannot drift apart.
- A 401 on the event stream is normalized like any other response, so it surfaces as a typed
  auth error at connect and at every reconnect. **The SDK does not parse SSE frames**, so an
  authorization failure delivered as an event *inside* an already-200 stream body is not
  something it can detect, and it does not claim to.

#### The contract-drift gate

`assert-api-current.mjs` regenerates into memory and diffs against what is checked in. A
mismatch fails the build, so contract drift is a build failure rather than a runtime surprise.
Because a prose-only contract edit produces byte-identical types, every generated file embeds
`sha256` of the contract source — the gate is therefore sensitive to *any* change to the
contract file. **Both gates are proven red on every test run** (`client/scripts/gates.test.mjs`
edits the contract, asserts the gate fails, and restores it); a gate nobody has seen fail is a
gate nobody has verified. Neither gate says anything about whether a running server implements
the contract — that is the BFF's conformance suite, not this.

### The egress lint — what it guarantees, and what it does not

`client/scripts/assert-no-external-hosts.mjs` runs as the last step of every build, over the
**built** output, and fails the build if an absolute `http(s)` origin appears in an emitted
asset.

**It is a defence-in-depth lint. It is not a security boundary.** A static scanner over
emitted JavaScript cannot establish "this client never fetches anything external": a URL can
be assembled at runtime from fragments, character codes, or decoded data. **The enforcing
control is the runtime CSP served by the BFF**, applied by the browser at request time. Do not
read a green lint as a proof of sovereignty — an overclaimed control is worse than a modest
one, because people stop looking past it.

What the lint reliably catches, and why it runs on every build:

- an accidental `fetch()`, `<script src>`, or `@font-face src` pointing at a CDN or an API
- **dependency drift** — a dependency that grows a phone-home, a beacon, or a remote font
  between upgrades. This is the common real-world regression.
- a font or asset host sneaking back in after being removed
- an origin assembled by static string concatenation (`"https:" + "//host"`), which is folded
  before comparison

What it cannot catch: deliberate obfuscation, and any URL built at runtime from values not
present in the bundle.

**JavaScript, CSS and JSON are parsed** rather than pattern-matched: JavaScript through
Rollup's parser (`rollup/parseAst`), CSS through `postcss` — both already Vite's own
dependencies, so nothing is added to the tree — and JSON through `JSON.parse`. Comments, regex
literals, and string boundaries are therefore correct **by construction**: a licence banner's
URL is inert because comments do not exist in an AST, not because a stripping pass removed it.
An asset that is scanned but cannot be parsed **fails** — an unparseable asset is not evidence
of safety, and an asset with no registered parser is skipped only if it matches a known binary
format's signature — everything else is reported rather than skipped, so an unrecognised asset
is never passed over in silence.

**HTML and SVG are the exception: they are scanned by a partial, hand-written scanner, not an
HTML parser.** No HTML parser is in the dependency tree and one is not being added for a
control that is not the security boundary. It skips comments and declarations, reads quoted and
unquoted attribute values and text between tags, splits `srcset`/`imagesrcset` into their
candidates, routes a `style` attribute through the CSS scanner, and routes `<script>` and
`<style>` bodies to the JavaScript, JSON, or CSS scanner — so a `<script>` body is never
treated as comment-strippable text.

**Documented non-goals — accepted limitations, not silent gaps.** Each is covered by the
runtime CSP. Most have a test recording the current behaviour so a change goes red; where one
does not, it says so:

- **HTML character references are not decoded.** An origin written as `&#x2F;&#x2F;evil…` is
  not detected.
- **CSS escapes are not decoded.** An origin written as `\68 ttps://evil…` is not detected.
- **An attribute value containing `>` desynchronizes the markup scanner.** Detection after that
  point is **unmodelled**: an origin there may be missed, or reported as a garbled fragment.
  Do not rely on it.
- **A binary signature identifies format, not intent.** An asset is skipped only if it matches a
  known binary format's signature, and binary content is never scanned. An asset deliberately
  crafted to begin with a known signature, and a structurally genuine binary carrying an origin
  in its metadata or trailing data, are both skipped. That is deliberate obfuscation — the case
  this lint already delegates to the CSP. Closing it would mean parsing container structure and
  scanning printable strings inside binaries, which is a different and much larger tool.
  **Test coverage is partial:** the crafted-signature half is recorded by two tests; the
  conforming-binary-with-an-origin-in-its-metadata half is **documented but untested**, because
  it needs a real conforming fixture and the CSP is the control either way.

Candidate values are compared **whole and never truncated at a delimiter**. That is what makes
`http://www.w3.org/2000/svg;payload` and `…/2000/svg?exfil=1` fail rather than reduce to an
allowlisted URI.

**The allowlist.** The set of allowlistable URIs is a **code-owned registry** of XML/HTML
namespace URIs inside the script itself. `client/scripts/external-host-allowlist.json` can
only say *which* of them are in use and *why* — every entry carries a mandatory `reason`, and
an entry that is not in the registry, is a duplicate, or is missing a reason fails the lint. An
empty allowlist fails too, rather than silently allowing everything. **A CDN, a font host, or
an API endpoint therefore cannot be allowlisted by configuration at all** — widening the
registry is a source change a reviewer has to approve.

Where a dependency bakes an external URL into a *string* rather than a comment (react-dom's
minified-error documentation link), it is neutralized at build time by an exact replacement,
**scoped to the chunk containing that dependency**, declared with its reason in
`client/scripts/vendor-url-neutralization.ts` and covered by a regression test proving the
error **code**, its invariant and its `&args[]` all still survive the message formatting. The
replacement is not a working link — `react-error-decoder` is not a route this app serves — so
the code is preserved for manual lookup only; a same-origin decoder route would be needed to
make the message directly actionable, and that is a follow-up, not part of this scaffold. A
rule that matches nothing fails the build rather than rotting silently.

## Documentation

| Document | What it covers |
|---|---|
| [docs/INSTALL.md](docs/INSTALL.md) | Installation for every target, start to finish |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Every configuration key, by name |
| [docs/PIPELINE.md](docs/PIPELINE.md) | How changes reach `main` and the public mirror |
| [docs/BRAND.md](docs/BRAND.md) | The Aperture mark, palette, and usage rules |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute, and the rules that are non-negotiable |
| [SECURITY.md](SECURITY.md) | Supported versions and the private vulnerability reporting path |
| [CODEOWNERS](CODEOWNERS) | Review ownership by path |
| [contracts/](contracts/) | The versioned client↔BFF API contract — the source of truth |
| [contracts/aperture-api-v1.yaml](contracts/aperture-api-v1.yaml) | OpenAPI 3.1: every `/v1/aperture/*` route, schema, header, and error |
| [contracts/aperture-events-v1.md](contracts/aperture-events-v1.md) | The SSE event taxonomy, provenance, ordering, and replay |
| [contracts/aperture-transport-v1.md](contracts/aperture-transport-v1.md) | Per-target transport, auth, and CSP rules |
| [contracts/README.md](contracts/README.md) | Versioning policy and the conventions shared by every route |
| [behavior-spec.md](behavior-spec.md) | Verifiable behavioural contracts |
| [specs/](specs/) | The build specs this repo is being built from |

---

## Design system

Aperture uses the shared constellation design system: token-based CSS custom properties, a
deep-space violet palette, glow as the elevation system, and the node-dot iconography
language. **There is no Tailwind and no parallel palette.** An adherence lint fails the build
on inline styles, hardcoded colour literals, and stray style blocks. The token layer, the
primitives, and that lint (`lint:adherence`) arrive with the design-system import; the
scaffold ships only a colour-free base layer so the two cannot collide.

## Contributing

Every change — including a one-line fix — goes through the full pipeline: tracked work item,
isolated worktree, implementation, test gate, independent review gate, merge, and then the
post-merge gate — one indivisible phase that verifies `main`, confirms the docs are current,
publishes the public mirror, and refreshes the knowledge graph, in that order. There is no
informal path. `main` is
protected: force-push and deletion are blocked, and direct push is restricted to the
merge-queue identity. Read **[CONTRIBUTING.md](CONTRIBUTING.md)** first, then
[docs/PIPELINE.md](docs/PIPELINE.md); review ownership is in [CODEOWNERS](CODEOWNERS).

Two rules worth stating up front, because they are the ones most often broken:

1. **No hardcoded infrastructure values.** No addresses, hostnames, ports, org names, emails,
   or credentials in source, config, docs, or tests. Configuration is by environment-variable
   name; secrets are resolved at runtime from the vault.
2. **One door.** All backend access goes through the client library into the kernel. A second
   access path — a direct HTTP client against a service, a raw forge or tracker API call — is
   rejected on that basis alone, however well-written it is.

## Security

Found a vulnerability? **Do not open a public issue.** Use the private reporting path
described in [SECURITY.md](SECURITY.md), which also lists supported versions, the disclosure
expectation, and the acknowledgement window.

## Licence

MIT. See [LICENSE](LICENSE).
