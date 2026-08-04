<p align="center">
  <img src="assets/banner.svg" alt="Aperture" width="100%">
</p>

<p align="center">
  <img src="assets/badges.svg" alt="status pre-1.0 · pipeline review-gated · targets web, desktop and mobile · licence MIT · telemetry none" width="800">
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
npm --prefix client run build      # drift + SDK + SVG gates, tsc --noEmit, source lints, vite build, egress lint
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
| `npm --prefix client run build` | the drift gate → the SDK static gate → the SVG safety gate → `tsc --noEmit` → the adherence lint → the no-bare-strings gate → `vite build` → the egress lint. Any of them failing fails the build |
| `npm --prefix client run test` | vitest |
| `npm --prefix client run gen:api` | regenerate the typed SDK from `contracts/aperture-api-v1.yaml` |
| `npm --prefix client run assert-api-current` | the contract-drift gate — regenerate and diff |
| `npm --prefix client run assert-sdk-clean` | the SDK static gate — no absolute URL, no default endpoint, one request site |
| `npm --prefix client run lint:adherence` | the design-system adherence lint, over the source tree |
| `npm --prefix client run assert-no-external-hosts` | the egress lint, against an existing `client/dist` |
| `npm --prefix client run assert-svg-safe` | the SVG safety gate, over `assets/` and `client/public/` |
| `npm --prefix client run assert-no-bare-strings` | the no-bare-strings gate — user-facing text must resolve through the typed catalogue |

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
  may not be *named* elsewhere at all — including through a string-literal bracket access
  (`globalThis['fetch']`) or a local alias of a global object (`const g = globalThis; g['fetch']`).
  A computed access on a recognised global is reported as **unresolvable** rather than passed
  over. **Deliberate indirection through arbitrary expressions is not detected** — a global
  obtained from a function call, read off an object property, or threaded through a module
  boundary defeats the rule, because closing that would mean a dataflow analyser inside a build
  lint. The control for deliberate obfuscation is the runtime CSP, and a test **records** the
  undetected case so the boundary is pinned rather than implied.
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
  retrying early. The tests **derive** their cases by iterating the two sets rather than
  restating their members, and assert set membership against a recorded classification in both
  directions — so a status added to a set with no policy decision fails, and a status removed
  from one fails too. A test that merely agrees with the code is not a guard.
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
| [docs/BFF-PLACEMENT.md](docs/BFF-PLACEMENT.md) | Where the backend lives, why it is a feature-gated module in the agent core, and which repository's gate proves which criterion |
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

Aperture uses the shared constellation design system — the same token-based CSS custom
properties as the fleet's other web surfaces, so Aperture looks like part of the same product
rather than a cousin of it. **There is no Tailwind and no parallel palette.**

The rules, in the order they bite:

1. **Colour, type, spacing, radius, elevation and motion come from tokens.**
   `client/src/styles/constellation.css` is the token layer and **the only file in the client
   where a colour literal or a font stack may appear.** Everything else says `var(--…)`.
2. **Compose the primitives, not class strings.** `client/src/components/primitives/` wraps
   `.card`, `.btn-*`, `.badge-*`, `.table`, `.input` and the tracked label as typed React
   components. Their props omit `style` and `dangerouslySetInnerHTML`, so the direct case
   (`<Card style={…} />`) is a **type error** before it is a lint error — but a JSX *spread* is
   checked for assignability only, with no excess-property check, so `<Card {...propsBag} />`
   slips both past the type checker whenever the bag shares any other prop. Every wrapper
   therefore also strips the two keys **at runtime** before spreading onto the DOM. The type
   layer is the fast, in-editor half of the guarantee; the runtime strip is what makes it hold.
3. **Colour is semantic, never decorative.** Blue is inbound/source, green is
   outbound/endpoint/free, amber is cloud/gated/cost, rose is alert/hot, violet is the core.
   Badge and status variants are therefore named `success` / `warning` / `error` / `info` /
   `accent` — never `green` / `amber` / `rose` / `blue`. If you want a colour because it looks
   nice, that is the signal to stop.
4. **Glow is the elevation system.** A drop shadow says "floating above a page"; a glow says
   "lit from within". Glow is an interaction signal — hover, focus, active, primary — never
   ambient decoration.
5. **Pill radius belongs to badges and status pills.** Cards and panels use `--radius-lg`.
6. **Inter for UI, JetBrains Mono for code, telemetry, and tracked uppercase labels.** Both are
   bundled; neither is ever fetched.

### Light and dark

Dark is the base. Light comes from `prefers-color-scheme`, and an explicit `data-theme`
attribute on the root element overrides the media query **in both directions** — an explicit
dark choice wins on a light-preferring OS and vice versa. `client/src/theme.ts` owns that
attribute and writes it before the first render, so no content paints under the wrong theme;
the residual gap before the entry module executes is documented in that file rather than
glossed over. Choosing "system" removes the attribute rather than freezing today's answer, so
a later OS change still reaches the user.

`prefers-reduced-motion` and `forced-colors` behaviour are declared in the token layer.
`forced-color-adjust: none` — the one property that can defeat a user's own palette — is
rejected outright by the lint, in every file including the token layer. Structural hairlines are
**neutral in both themes**; violet is reserved for the active/accent edge, which is the live
system's rule and applies to the authored light theme exactly as it does to the ported dark one.
Where a component replaces the focus outline with a glow, a test asserts it restores a real
outline under forced colours, since glow is stripped there.

### The adherence lint

`client/scripts/adherence-lint.mjs` runs on every build, over the **source** tree, and fails on:

- a `style` attribute in TSX (`style={{…}}` and `style="…"` alike) or in HTML/SVG;
- a `<style>` element — as JSX, as markup, or via `createElement('style')`;
- a hex, `rgb()`, `hsl()`, `hwb()`, `lab()`, `oklch()` or `color()` literal — and, in CSS and
  markup, a CSS **named** colour — anywhere outside the token layer;
- a font-family literal outside the token layer, **including one hidden in a custom property**;
- a raw `px` dimension outside the token layer — in a declaration **or in an at-rule's params**,
  matched case-insensitively — unless it carries an inline `/* dimension-literal: … */` reason.
  Control geometry lives in the token layer with the rest of the design system's constants, and
  a genuinely optical value (or a breakpoint, which cannot be a token because `var()` does not
  resolve inside a media condition) has to say so where it sits;
- **malformed CSS** — an unknown at-rule, an at-rule sitting where a declaration belongs, an
  at-rule with no block outside the small blockless allowlist, or a property name that is not a
  valid ident;
- `el.style.x = …`, `style.setProperty(…)`, `cssText = …`, `setAttribute('style', …)` and
  `dangerouslySetInnerHTML` — the JavaScript routes to the same holes;
- `forced-color-adjust: none`.

TypeScript is parsed by the TypeScript compiler and CSS by postcss — both already in the tree —
so comments, string boundaries and regex literals are correct **by construction** rather than by
a stripping pass. It **fails closed**: a file that will not parse, a file whose extension has no
registered parser, a missing scan target, a scan that matched nothing, and a malformed allowlist
are all errors. An unparseable file is not evidence of compliance.

**"postcss parsed it" is much weaker than "it is valid CSS", and that is not theoretical.**
`.x { @@@ display: flex; … }` shipped on this branch and passed a green build: postcss read
`@@` as an at-rule *name* with `display: flex` as its *params*, so there was no parse error and
the fail-closed path was never engaged — and the swallowed declaration was never walked as a
declaration. Measured cost of a swallow: the font, dimension and forced-colours rules all walk
declarations. Measured after at-rule params gained a px scan: the colour and dimension rules
survive a swallow, because params are scanned for both; the font and forced-colours rules still
go blind. `malformed-css` reports the *shape* regardless of what was swallowed, which is why it
is the rule that matters here. It does **not** make this a CSS validator — a well-formed but
wrong declaration (`color: notacolour`) still passes.

**Its registries are allowlists, on purpose.** An earlier revision listed the at-rules that
*require* a block; `@property` and `@viewport` were not on it and walked straight through,
swallowing declarations exactly as `@@@` did. Extending that list would have fixed two cases and
left the next at-rule CSS gains to re-open the hole silently. So the check is inverted: inside a
style rule a declaration is expected and an at-rule is the anomaly, so only `@media`, `@supports`
and `@container` may nest, and only `@charset`, `@import`, `@namespace` and `@layer` may be
blockless. Anything else — including an at-rule that does not exist yet, and including real CSS
like a nested `@starting-style` — fails. That is a false positive a reviewer resolves with a
source change, which is the right trade for a rule whose whole purpose is catching what nobody
anticipated. **Enumeration was the failure mode three times in this item; where a check can be
inverted so the unanticipated case fails rather than passes, it is.**

**What it cannot do**, stated plainly so a green run is not mistaken for a proof:

- a colour **assembled at runtime** — string concatenation, a template substitution, character
  codes, fetched data — is invisible to it. The static text of a template literal *is* scanned;
  its substitutions are not.
- the dimension rule covers **`px` only**. `rem`, `em`, `%`, `ch`, `vh`, `fr` and unitless
  numbers are not checked: the design system's scale is expressed in px, and a rule over every
  unit would fire on `100%`, `1fr` and `line-height: 1.3` — noise that gets a rule switched off.
  It matches the CSS Syntax L3 `<number-token>` grammar, so exponent forms (`1e3px`) and case
  variants (`7PX`) are caught; a **CSS escape in the unit** (`7p\78`) and a px value *computed*
  by `calc()` from non-px operands are not, and are documented as non-goals in the script.
- a colour reaching the DOM through a **CSS custom property set at runtime** is not detected as
  a colour. The routes by which this app's own code could set one are closed by the
  programmatic-style rule, but a value handed to a third-party component's colour prop is not
  seen. (There is no such dependency today.)
- CSS **named** colours are checked in CSS, in markup presentation attributes and in JSX
  presentation attributes — not in ordinary TypeScript strings, where the false-positive cost on
  prose is not worth it. In JSX every **statically known** value counts, whatever the spelling.
  The rule is about the value, not the syntax, and a test asserts the JSX and markup scanners
  return identical findings for the same element.

  That is a **general property, not a list**. The lint resolves a JSX attribute value through
  `ts.skipOuterExpressions` — TypeScript's own definition of a wrapper that does not change the
  value (parentheses, `as`/`satisfies`/angle-bracket assertions, non-null `!`, and any future
  member of `OuterExpressionKinds`). It replaced a hand-written case list that four separate
  reviews found incomplete, each time by a wrapper nobody had thought of; a wrapper the language
  adds next is now handled by construction.

  It is deliberately **not** the type checker: that answers "does this have a string-literal
  *type*", which is a different question. `fill={'red' as string}` widens to `string` while its
  runtime value is plainly `"red"`, so type-identity would report a static value as dynamic.

  What is genuinely *not* covered: a value computed at runtime (`fill={colour}`, a template
  **with** substitutions, a call, a value from props or state) and a colour handed to a
  third-party component's own prop. Both are outside what a source lint can resolve.
- other CSSOM routes to a stylesheet (`insertRule`, `adoptedStyleSheets`, an aliased tag name)
  are not detected.
- the HTML/SVG scanner is **partial** — a hand-written scanner, not a spec tokenizer. An
  attribute value containing `>` desynchronizes it and behaviour after that point is
  **unmodelled**. It deliberately does not skip comments: it errs toward the false alarm.
- only a **presentation attribute** is treated as a CSS value — in markup *and* in JSX, from one
  shared registry, so a `<circle fill="red" />` gets the same verdict in a `.tsx` file as in an
  `.svg` one. A colour-shaped string in an ordinary attribute — `class`, `title`, `data-*`, `id`
  — is data and is not reported; lexing every attribute reported `class="red"` as a colour.

  **That registry is bounded, and its edges are declared rather than chased.** It covers
  `style`, `color`, `fill`, `stroke`, `stop-color`, `flood-color`, `lighting-color`,
  `solid-color`, `background-color`, `border-color`, `outline-color`, `caret-color`,
  `text-decoration`, `text-decoration-color`, `text-emphasis-color`, `column-rule-color` and
  `bgcolor`. It is **not** the full SVG 2 presentation-attribute set, and three things follow
  that are recorded, not hidden:
  - **SVG animation attributes are not handled.** In `<animate attributeName="fill" from="red">`
    the colour lives in `from`/`to`/`values`/`by`, and whether those hold a colour at all depends
    on `attributeName` — target-aware resolution across elements, which is out of scope for a
    source lint.
  - **The registry is name-based, not element-aware**, so a listed attribute on an element where
    it is not presentational (`<div fill="red">`) is reported anyway. That is a false positive.
    (`background`, the legacy HTML image-URL attribute, *was* in the registry and has been
    removed — that one was removable without opening the element question.)

    **The allowlist is not the remedy for these**, and an earlier version of this page said it
    was. `color-allowlist.json` admits only syntax-theme CSS paths, so a markup or TSX finding
    cannot be allowlisted at all — pointing at a door that does not exist is worse than saying
    there is none. Remediation is a **source change**, or a reviewed change to the code-owned
    registry. Keeping the allowlist narrow is deliberate: widening it to markup would reopen the
    configuration-widening hole that complete functional-colour capture closed.
  - The enforcing control for anything this misses is, as ever, the **runtime CSP**.

  Each of those cases is pinned by a test that records the current behaviour and fails with an
  instruction to widen the claim if it ever changes. Those recordings assert **no errors as well
  as no findings**: a recording that checks only findings cannot tell silence from failure, and
  would quietly record "not detected" when the truth was "did not run".
- it scans **source**, so a dependency's stylesheet is out of scope; and it checks that a raw
  value is not used, not that the *right* token was chosen. Contrast and motion gating is a
  separate item.

Every one of those limitations is pinned by a test asserting it is currently NOT detected, so
the list cannot quietly drift away from the code.

**Exceptions.** `client/scripts/color-allowlist.json` is the only exception path, and it is
deliberately weak: only the colour-literal rule is allowlistable, only files matching a
code-owned path registry (a syntax-highlighting theme) may appear in it, every entry names an
exact file, an exact value and a reason, and a **stale entry fails the lint**. A CDN, a
component, or a primitive cannot be allowlisted by editing configuration at all. There is no
pragma, flag, or environment variable that turns a rule off.

**Contrast.** `client/scripts/token-layer.test.mjs` parses the token layer and asserts 4.5:1 in
both themes, with real alpha compositing for tinted surfaces, and checks that the two light
blocks have not drifted apart.

The surface set is **derived, not enumerated**: every semantic surface token, plus every stop of
every gradient token, with translucent stops composited onto each opaque surface. That matters
because a component does not sit on "the panel" — a badge sits inside a `.card`, whose fill is a
gradient, so the surface behind it is a range. An earlier revision listed four surfaces and
composited onto the most favourable one, and passed a light success badge that measured 3.89:1
against the darker end. A new surface token or gradient endpoint now enters the suite by
existing.

The measured minimum across the whole cross-product is **4.834:1**, in dark, for `--on-error`
over `--tint-error` composited on `--surface-chip`. That figure is computed by the test suite
from the same cross-product the assertions use and checked against the documented constant, so
it cannot go stale: change the palette and the build fails until the number is updated. (It was
stale once — a previous revision quoted the light theme's minimum as if it were the global one.)

`--text-faint` and `--text-disabled` are excluded **by rule**, not by convenience: faint is
de-emphasised metadata beside an already-labelled value, and a disabled control is exempt from
WCAG 1.4.3. Both say so where they are declared, and a separate test asserts the primitives
layer never applies either as live text outside that scope — a contrast suite cannot police a
token it excludes. That check **resolves aliases**, so reaching an excluded token through an
intermediate custom property is caught too.

### State primitives — loading, empty, error, progress

`client/src/components/state/` ships the four situations every screen has, as typed components,
so seven sprints render them one way instead of seven:

| situation | control |
|---|---|
| content is coming, and its shape is known | `Skeleton` / `SkeletonGroup` |
| a short indeterminate wait (< `SPINNER_MAX_WAIT_MS`, 1s) | `Spinner` |
| a measurable amount of work | `ProgressBar` |
| there is legitimately nothing to show | `EmptyState` |
| a request failed | `ErrorState` |
| a component threw while rendering | `ErrorBoundary` |
| a message about the thing you are looking at | `InlineNotice` |

Four properties are worth stating because they are enforced rather than intended:

- **A skeleton mirrors a shape.** `shape` is required and its union has no generic option, so
  there is no `<Skeleton />` that renders an anonymous grey box.
- **Loading is announced once.** The bars are `aria-hidden`; a polite live region carries the
  state, and its text never changes, so it speaks on mount and not again. A `SkeletonGroup`
  renders **one** region for a whole region of skeletons.
- **Motion is withheld, not frozen, under `prefers-reduced-motion`** — and the preference is read
  fail-safe: when it cannot be determined, the answer is "reduced". A frozen shimmer is still a
  decorative artefact; a skeleton that never had one is a placeholder.
- **A skeleton that never resolves is a failure state.** `SkeletonGroup`'s optional `timeout` is
  a single `{ afterMs, fallback }` object, so a timeout cannot be armed without saying what
  replaces the skeleton when it fires. No request that dies silently leaves an endless shimmer.

`ErrorState` renders a typed SDK error's **class**, never its text. The mapping from error URN to
words and a recovery action is `Record<keyof typeof ERROR_URN, …>`, so a URN added to the SDK
stops this file compiling until someone decides what the user should be told. The server's
`title`/`detail` are deliberately not displayed: the URN is the stable identity, the prose is
attacker-influenceable, and rendering it would give upstream text the interface's own voice.
**Neither is the URN itself** — it can carry arbitrary text (`urn:aperture:error:token-abcdef`),
so it is used as a lookup key and discarded. The `correlation_id` **is** shown, validated against
the contract's `Id` shape first: it is an opaque reference, and it is the one thing that lets a
user and an operator talk about the same request.

`describeError` is **total** — it returns a presentation for every input and throws for none.
That is the property `ErrorState` depends on: a classifier that can throw turns a handled failure
into an unhandled one at the exact moment the UI is trying to recover. Every read of an untrusted
body goes through an own-property descriptor access that never invokes a getter and never walks a
prototype chain, every `instanceof` is wrapped (a Proxy can throw from `getPrototypeOf` and abort
the dispatch before any branch is reached), and the whole classification sits behind a boundary
whose recovery path is a frozen constant and calls nothing.

> **Interim, by design.** APTR-10 owns Aperture's error model and has hardened `src/api/errors.ts`
> against hostile values over eight review rounds. The classification path in
> `components/state/error-presentation.ts` is a **temporary stand-in** that exists only because
> APTR-10 is unmerged and this workspace must build. Two answers to "how do we read a hostile
> problem safely" is worse than either, so it is written to APTR-10's standard, its `RecoveryKind`
> is APTR-10's `RecoveryAction` union member for member, and every per-URN recovery value already
> matches APTR-10's table — the merge is a deletion, not a reconciliation.
> `scripts/aptr10-handoff.test.mjs` **fails the build the moment `src/api/errors.ts` exports
> `describeError`**, so the duplicate cannot quietly survive. One shape still needs arbitration:
> APTR-10 carries one `message` per URN, this catalogue carries `title` + `detail`.

`ErrorBoundary` renders that fallback for a thrown render, with a reference, instead of a blank
page. When the failure never reached the server it mints its own id, prefixed `client-` so nobody
searches a server log for it. There is no remote reporting and there will not be: no telemetry,
no analytics, no external fetch.

**`InlineNotice` is render-only, and that is a boundary rather than a limitation.** It is not a
toast tray, not a queue, not a store, and not a second notification channel. The module holds no
state — no emitter, no context, no portal, no global mount point — and three tests assert that
structurally. A notification that reaches the user *out of band* spends the assistant's
prioritized presence budget (Soul Contract clause 2), which is arbitrated in one place; a
component library that grew its own tray would be a second, unarbitrated channel, built by
accident one convenience helper at a time.

### The string catalogue, and no bare strings

**Every user-facing string in Aperture lives in `client/src/strings/catalogue.ts`** and is
rendered through `t(key)` or, when it carries a value, `format(key, params)`. English-only for
now; the pattern is established now because retrofitting one across seven sprints is a rewrite.

What the **compiler** holds — these are type errors, not lint findings, and no test is what makes
them true:

- **Completeness.** `StringKey` is declared independently of the table, which is checked against
  `Record<StringKey, string>` by `satisfies`. A key with no entry, or an entry with no key, does
  not compile.
- **Lookup validity.** `t('nope')` does not compile.
- **Placeholder completeness.** Placeholders are recovered from each string's literal type, so a
  missing or misspelled `format` parameter is a type error rather than a `{name}` on screen.
- **Plain vs parameterized.** `t()` accepts only a key with no placeholders and `format()` only a
  key with some.
- **Text props.** `t()` returns a branded `UiString`, and every text prop on the state primitives
  is typed as one, so **a bare literal cannot satisfy one by ordinary structural typing**:
  `<EmptyState title="No threads" />` is a **type error**. That is the guarantee at its true
  strength, and it is the case that actually occurs.

**The brand is not unforgeable, and TypeScript cannot make a string brand cast-proof.** Two paths
mint one, and both are made visible rather than implied:

- **A cast.** `value as unknown as UiString` works, as does anything laundered through `any`. So
  `assert-no-bare-strings` rejects a cast naming `UiString` anywhere except
  `client/src/strings/index.ts`, the module that declares it. A cast through `any` names nothing
  and stays undetected — recorded as a non-goal in that script.
- **`fromUserContent()`**, deliberately, for text that belongs to the user — a thread title, a
  filename — which must never be translated or catalogued. It is a **listed** exception: the gate
  prints every call site on a green run, so "where does text bypass the catalogue" has an answer
  a reader can check rather than trust.

What `client/scripts/assert-no-bare-strings.mjs` adds is what types cannot reach: an **arbitrary
DOM element**. `<h1>Aperture</h1>` type-checks perfectly, because `ReactNode` accepts any string.
So the gate reads the JSX and fails on literal text between tags, a string or template rendered
as a child, a static string on an attribute that is not in its technical registry, a `content:`
string in a stylesheet, a catalogue key assembled at a call site, a key the catalogue does not
contain, and a cast to `UiString` outside the module that owns the brand.

**The attribute registry is an allowlist, and that is the whole design.** Listing the *user-facing*
attributes would be a denylist that lags by construction — invisible to the next such attribute
and to every prop of every component a later sprint writes. Instead the script names the
attributes whose value is a machine-facing token (a class, a route, an ARIA enumeration, an SVG
path) and reports every other static string. A new technical prop therefore fails the build until
someone adds it, with a reason, in a reviewed diff. There is no configuration file, no pragma, and
no allowlist JSON.

**An exemption holds only where its justification does.** The `onX` handler exemption existed
because React rejects a string handler — which is true of a *native* element and not of a custom
component, which may legally declare `onTitle: string` and render it. So it is narrowed to native
elements, identified by React's own rule that a lowercase-initial tag is intrinsic; on a component
only the explicit registry applies. `data-*` is deliberately not narrowed the same way, because
its justification is a DOM convention rather than React's typings — the residual case, a component
that renders a `data-` prop as text, is a documented non-goal with a test pinning it.

**Lookups and escapes are resolved by binding, not by spelling.** `t`, `format` and
`fromUserContent` are recognised through the import that bound them — as a named import, a renamed
one, or a member of a namespace import (`import * as strings`; that form previously walked past
both the key check and the escape listing). Where a binding cannot be resolved the run **stops**
rather than guessing: a name that is both imported from the catalogue and declared locally, a
default import, and an `import … = require()` are all errors, because a wrong finding costs more
than a missing one.

It **fails closed**: an unparseable file, an unregistered extension, a missing scan target, a scan
that matched nothing, a catalogue it cannot read or whose keys it cannot resolve, and a missing
compiler capability are all errors.

Every walked file lands in exactly one of **three** disjoint sets — `scanned` (a parser ran over
it to completion), `excluded` (a test module, with its reason recorded), or `errored` (it could
not be analysed). Both **coverage** and **disjointness** are asserted on every run: a file in none
of the three is a file nothing read, and a file in two means "scanned" would mean two different
things. Errors that are not about a walked file — a missing scan target, an unreadable catalogue —
are not part of the partition, because they are not files. `*.test.tsx` files are excluded —
fixture text is not product text — and that exclusion is made safe rather than convenient by a
rule that fails if application code ever imports a test module.

It is a **lexical tripwire, not a proof**, and its own header lists what it cannot see: text
routed through a variable is the largest gap, and the `UiString` brand is what closes that for
Aperture's own components. Each non-goal is pinned by a test that goes red if it is ever closed.

## Brand and assets

The Aperture mark is an **iris** — a six-blade camera diaphragm closed onto a hexagonal
opening. It was chosen because it is literal without being illustrative: a diaphragm is the
part of an optical instrument that decides how much of the world reaches the sensor, which is
what this client is. The full rationale, the construction parameters, the palette, and the
usage rules — including what not to do with the mark — are in **[docs/BRAND.md](docs/BRAND.md)**.

| Asset | Size | Use |
|---|---|---|
| [`assets/aperture-icon-32.svg`](assets/aperture-icon-32.svg) | 32×32 | The mark alone — app icon, tab strips, repo avatar |
| [`assets/aperture-favicon.svg`](assets/aperture-favicon.svg) | 64×64 | Browser tab — wider blade gaps and higher contrast so it survives 16px |
| [`assets/aperture-wordmark.svg`](assets/aperture-wordmark.svg) | 220×44 | Mark plus "Aperture" and its subtitle |
| [`assets/banner.svg`](assets/banner.svg) | 1280×640 | The README hero above |
| [`assets/architecture.svg`](assets/architecture.svg) | 1280×720 | The system diagram above |
| [`assets/badges.svg`](assets/badges.svg) | 800×40 | The fact strip above |

`client/public/favicon.svg` is the served copy of the favicon and is byte-identical to the
`assets/` original; a test asserts that, so the two cannot drift apart unnoticed.

Every one of them is **hand-authored and self-contained**: no external reference, no embedded
raster payload, no remote font, nothing fetched when the file is opened. That is not a
convention this page asks you to trust — see the gate below.

**On theme.** Each asset paints its own opaque backing behind any text it carries: the marks
sit on a deep-space tile, the banner and the diagram paint a full-canvas gradient, and each
badge is a filled panel. So none of them can go invisible on a light forge or mirror page.
Only the wordmark *adapts* — it carries an inline `prefers-color-scheme` rule that swaps its
text ink in light mode. That rule follows the **viewer's OS preference**, not the page's
background, because an SVG rendered through `<img>` cannot see the page it sits in;
`docs/BRAND.md` records the one combination where that gives the wrong answer. The banner and
the architecture diagram are deliberately dark-only pieces rather than adaptive ones.

**On the badges.** They state only *static properties of this repository* — its pre-1.0
status, that changes are review-gated, its target set, its licence, and that it ships no
telemetry. **None of them reports a build or test status**, because a committed SVG cannot
observe one: it would state whatever was true on the day it was drawn and then go wrong
silently. This strip previously read "build passing" with no CI in the repository at all, and
"tests pending" beside a test suite that already existed and passed — one badge wrong in each
direction, which is what a status nobody can observe drifts into. Live
status badges need a CI service to render them, and CI arrives with **APTR-09**; there is no
`ci/` directory on `main` yet.

### The SVG safety gate

`client/scripts/assert-svg-safe.mjs` runs on every build and over both directories that ship
vector assets. **It is a security gate, not a style check.** A README renders `banner.svg`
through an `<img>`, which is inert — but the same file is one click away from being opened
directly on the public mirror, where it is a full document with script execution and
subresource loading, and `client/public/favicon.svg` is served by the app itself.

It rejects `<script>`, `<foreignObject>`, `on*` event handlers, any `href`/`xlink:href` that
is not a same-document fragment, embedded rasters, and `javascript:`/`data:`/`vbscript:`/
`file:`/`blob:` schemes anywhere — in an attribute, in a `url()` functional IRI, or in a
`<style>` body. A legitimate `xlink:href="#gradient"` is permitted, and a test pins that.

Two things make it stronger than the other two scanners in that directory, and one thing makes
it weaker:

- **Elements and attributes are allowlisted, not denylisted, and there is exactly one
  registry for each.** A denylist of hazards someone thought of passes forever on the next one
  SVG gains, and SVG has a history of gaining them. Anything not in the code-owned registry
  fails by default; a test proves this by rejecting a real element that has no named rule at
  all. Widening a registry is a source change a reviewer sees — there is no allowlist file,
  pragma, or environment variable that turns a rule off.

  Review found the first revision had a denylist *inside* the allowlist and a second registry
  in front of it, so three classes slipped through: reference attributes such as `src` and
  `action` were admitted by a reference path that ran before the allowlist and never consulted
  it; a CSS check that matched the literal text `url(` was defeated by any equivalent spelling
  (`u\72l(…)`, `u/**/rl(…)`); and character data was never validated, so ill-formed XML passed
  a gate whose contract is that it fails. All three are fixed and pinned by regression tests,
  and two derived invariants now assert the registries cannot disagree again.

  The consequences are visible in the assets: the **`style` attribute is not permitted at all**
  — presentation attributes express everything these files need, and removing the attribute
  removes an entire CSS grammar that would otherwise have to be tokenized correctly forever. A
  `<style>` **element** is still permitted, because the wordmark's `prefers-color-scheme` rule
  needs one, but its body must match a deliberately tiny grammar: plain style rules, one
  optional `@media (prefers-color-scheme: …)` wrapper, and declaration values drawn from a
  character set with no function, string, escape or entity in it. Valid CSS outside that shape
  fails, which is the right trade for a body that only ever sets a few fills.
- **It parses SVG as strict XML and refuses to recover.** The egress lint and the adherence
  lint both document that an attribute value containing `>` desynchronizes their markup scanner
  and that detection past that point is unmodelled — an inherent consequence of HTML permitting
  unquoted values. XML does not, so this gate handles that case correctly, and it decodes XML
  character references before inspecting a value. Both claims are pinned by tests. An asset that
  does **not** parse is a **failure**, never a skip: an unchecked asset is not evidence of safety.

  Three properties of that strictness are worth stating because each closed a real gap. **A
  character gets the same verdict however it is spelled** — one shared predicate decides both
  the literal character and the `&#…;` reference, and a test asserts the two agree at every
  boundary of the XML `Char` production, so neither path can be widened alone. The file is
  decoded as **strict UTF-8**: an invalid byte sequence is rejected rather than replaced with
  U+FFFD, because U+FFFD is itself legal and a lenient decode would turn a malformed file into
  a well-formed document that is not the one on disk. And whitespace in markup means **XML's
  `S` production** — exactly `#x20`, `#x9`, `#xA`, `#xD` — not JavaScript's `\s`, which also
  accepts U+00A0, U+2028, U+2029 and U+FEFF.

  Those three were the same bug in three places, and the generalisation is the useful part:
  **when a specification defines a character class, define it — do not reach for the host
  language's approximation of it.** Each time, the surrounding code was strict and the borrowed
  primitive was lenient, so the leniency arrived pre-installed and invisible. `String.fromCodePoint`
  substituting U+FFFD, `readFileSync(…, 'utf8')` repairing malformed bytes, `\s` meaning Unicode
  whitespace, and `TextDecoder` silently swallowing a byte order mark are all one mistake.
  **Substitution is not validation**: when the input is malformed, the gate fails on it rather
  than quietly repairing it into something that parses.
- **It does not render.** It cannot tell you an asset is visually correct, legible at its
  minimum size, or well-composed. Those are `docs/BRAND.md` rules that a human checks. And it
  stops a hazard being *committed*; the runtime CSP is what stops one *acting*.

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
