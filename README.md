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
  The build fails if an external origin appears in the bundle.

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
npm --prefix client run build      # tsc --noEmit && vite build && egress gate
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
| `npm --prefix client run build` | `tsc --noEmit` → `vite build` → the egress gate. A type error fails the build |
| `npm --prefix client run test` | vitest |
| `npm --prefix client run assert-no-external-hosts` | the egress gate, against an existing `client/dist` |

Fonts are **bundled**, not fetched: the `@fontsource/*` packages emit the woff2 files into the
build output, so no font host is contacted at runtime. Backend addressing is never compiled in
— no absolute URL and no default endpoint anywhere in the client. The transport's base URL is
injected per target.

### The egress gate and its allowlist policy

`client/scripts/assert-no-external-hosts.mjs` runs as the last step of every build, over the
**built** output, and fails the build if an absolute `http(s)` origin survives in an emitted
asset. Two properties keep it honest, and both are directly tested:

1. **Comments are stripped before scanning.** Dependency licence banners legitimately carry
   upstream project URLs; they are inert text and must not fail a correct build. The stripper
   is string-aware, so the `//` inside a real URL is never mistaken for a comment — that
   mistake would delete the very violation the gate exists to catch. Stripping affects the
   scan only; the emitted bundle is never rewritten by it.
2. **`client/scripts/external-host-allowlist.json` holds XML/HTML namespace URIs and nothing
   else.** Bundled inline SVG legitimately carries `xmlns="…/2000/svg"`; a namespace URI is an
   identifier, never an address. Matching is **exact string** — a URI that merely shares a
   prefix with an entry still fails — and every entry carries a mandatory `reason`. An entry
   without one fails the gate.

**Adding a non-namespace entry (a CDN, a font host, an API endpoint) is a review rejection,
not a configuration change.** If a build needs an external origin, the build is wrong. Where a
dependency bakes an external URL into a *string* (react-dom's minified-error documentation
link, for example), it is neutralized at build time by an exact, reason-annotated replacement
declared in `client/vite.config.ts` — never by widening the allowlist. A stale replacement
entry fails the build rather than rotting silently.

The gate is static and therefore necessary but not sufficient: a URL can be assembled at
runtime. The runtime CSP served by the BFF is the enforcing control.

## Documentation

| Document | What it covers |
|---|---|
| [docs/INSTALL.md](docs/INSTALL.md) | Installation for every target, start to finish |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Every configuration key, by name |
| [docs/PIPELINE.md](docs/PIPELINE.md) | How changes reach `main` and the public mirror |
| [docs/BRAND.md](docs/BRAND.md) | The Aperture mark, palette, and usage rules |
| [contracts/](contracts/) | The versioned client↔BFF API contract — the source of truth |
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
isolated worktree, implementation, test gate, independent review gate, merge, post-merge
verification, documentation check, and public mirror. There is no informal path. See
[docs/PIPELINE.md](docs/PIPELINE.md).

Two rules worth stating up front, because they are the ones most often broken:

1. **No hardcoded infrastructure values.** No addresses, hostnames, ports, org names, emails,
   or credentials in source, config, docs, or tests. Configuration is by environment-variable
   name; secrets are resolved at runtime from the vault.
2. **One door.** All backend access goes through the client library into the kernel. A second
   access path — a direct HTTP client against a service, a raw forge or tracker API call — is
   rejected on that basis alone, however well-written it is.

## Licence

MIT. See [LICENSE](LICENSE).
