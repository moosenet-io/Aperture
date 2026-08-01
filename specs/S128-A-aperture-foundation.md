# Aperture Sprint A — Foundation, Contract, Brand
plane_project: APTR
module: Aperture
prefix: APTR
spec_id: S128-aperture-client

## Metadata
- **Author:** Operator (Moose)
- **Session:** S128
- **Date:** 2026-08-01
- **Module version:** Aperture v0.1.0
- **Estimated total:** ~46h
- **North-Star layer:** shell — Gate 2 justified in `specs/S128-aperture-epic.md`
- **Module-Contract:** meets §4 clauses 1–7 (clause 2 capability-gating and clause 6
  sovereignty are *implemented* in this sprint; the rest are established as contracts here
  and exercised in Sprints C–D)
- **Assistant-Layer Soul Contract:** clause 2 (presence budget) and clause 6-adjacent
  sovereignty constraints are encoded in the BFF contract authored here
- **Context:** Stand up the Aperture repo, the design-system foundation, the versioned BFF
  API contract that every later sprint codes against, CI, and the brand assets. Nothing in
  this sprint ships user-visible chat — it makes the following six sprints buildable in
  parallel without contract churn.

## Pre-flight
- Repository: `moosenet/Aperture` on the internal forge (created)
- Public mirror target: `moosenet-io/aperture` (exists; bootstrap is APTR-13)
- Dependencies: `node` ≥ 20, `npm`, `rustup` + pinned toolchain, `cargo`
- Vault secrets required: `GITEA_PAT_MOOSE`, `GITHUB_PAT_HARMONY`
- Infrastructure: internal forge reachable, Plane reachable, Terminus door reachable
- Baseline tests: 0 (new repo)
- Baseline verify: N/A (new repo)

---

### APTR-01: Repo scaffold — Vite + React + TypeScript client workspace
- **Priority:** Critical
- **Labels:** aperture, scaffold, web
- **Agent:** claude
- **Estimate:** 4h
- **Description:** Stand up the Aperture client workspace as a Vite + React 18 + TypeScript
  SPA, matching the toolchain already proven in the constellation's two existing web surfaces
  (Vite 5, React 18.3, react-router-dom 6, vitest, tsc `--noEmit` in the build script).
  **No Tailwind** — the constellation design system is token-based CSS. No runtime CDN,
  font, or analytics fetches of any kind (Module Contract clause 6).

  ## FILES
  - `client/package.json` — workspace manifest, scripts (`dev`, `build`, `typecheck`, `test`, `lint:adherence`)
  - `client/tsconfig.json` — strict mode on
  - `client/vite.config.ts` — build config, no external CDN plugins
  - `client/index.html` — app shell, no external `<link>`/`<script>` hosts
  - `client/src/main.tsx` — entry
  - `client/src/App.tsx` — router root
  - `client/src/routes.tsx` — route table placeholder
  - `client/.gitignore`
  - `README.md` — created here in stub form; APTR-04 fills it out

  ## APPROACH
  1. Mirror the dependency set proven in the existing constellation web surfaces: React 18.3,
     react-router-dom 6, vite 5, typescript 5.4+, vitest. Pin exact versions.
  2. `build` script MUST be `tsc --noEmit && vite build` so type errors fail the build.
  3. Add `@fontsource/*` packages for any webfont so fonts are **bundled, never fetched**.
     Assert in `vite.config.ts` that no `external` host is configured.
  4. Add an `assert-no-external-hosts.mjs` build post-step that greps the built bundle for
     `http://` / `https://` origins that are not same-origin relative paths, and fails the
     build on a hit. This is the mechanical enforcement of Module Contract clause 6.
  5. No secret, token, IP, or hostname literal anywhere. All backend addressing is
     same-origin relative (`/v1/aperture/...`).

  ## TEST PLAN
  - `npm --prefix client ci && npm --prefix client run build` — clean build, zero type errors
  - `npm --prefix client run test` — vitest runs (may be 0 tests at this point)
  - `node client/scripts/assert-no-external-hosts.mjs` — passes on the built bundle
  - Verify no hardcoded IPs, hostnames, or org names in new/modified files
  - Negative: add a temporary `fetch("https://example.invalid")` and confirm the
    external-host assertion FAILS the build; remove it

  ## EDGE CASES
  - A transitive dependency injecting a CDN preconnect — the assertion must catch it in the
    built output, not just source
  - `tsc --noEmit` passing while `vite build` fails — both must run, in that order
  - Windows line endings from a contributor — add `.gitattributes` normalizing to LF

- **Acceptance criteria:**
  - [ ] `npm run build` produces a clean bundle with zero TypeScript errors
  - [ ] Build FAILS when any external origin appears in the built output
  - [ ] Zero Tailwind dependencies present
  - [ ] All fonts bundled, no runtime font fetch
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README updated to document the client workspace and its scripts
  - [ ] All existing tests still pass

---

### APTR-02: Import the constellation design system as Aperture's only styling layer
- **Priority:** Critical
- **Labels:** aperture, design-system, web
- **Agent:** claude
- **Estimate:** 5h
- **Description:** Aperture uses the same token-based design system as the constellation's
  existing web surfaces — the same CSS custom properties, the same component vocabulary
  (`.card`, `.badge-*`, `.table`, `.btn-*`, `var(--bg-primary)` …), the same light/dark
  behavior. Port the token layer and primitives, and add the adherence lint that mechanically
  rejects hardcoded colors and inline styles.

  ## FILES
  - `client/src/styles/constellation.css` — token layer (colors, spacing, type, radii, motion)
  - `client/src/styles/primitives.css` — `.card`, `.btn-*`, `.badge-*`, `.table`, `.input`
  - `client/src/components/primitives/` — typed React wrappers over the CSS primitives
  - `client/scripts/adherence-lint.mjs` — the enforcement script
  - `client/package.json` — wire `lint:adherence` into `build`

  ## APPROACH
  1. Port the token set from the existing constellation web surface verbatim — do NOT invent a
     parallel palette. Aperture must be visually continuous with the rest of the fleet.
  2. Support light and dark via `prefers-color-scheme` plus an explicit `data-theme` override
     on the root element, with the override winning in both directions.
  3. `adherence-lint.mjs` fails on: any `style="` attribute in `.tsx`, any hex/rgb/hsl color
     literal outside `constellation.css`, any `<style>` block outside the styles directory,
     and any font-family literal outside the token layer.
  4. Wrap primitives as typed React components so downstream sprints compose components, not
     raw class strings.
  5. Include a focus-visible treatment and a minimum 4.5:1 contrast check on token pairs —
     accessibility is cheaper to establish now than to retrofit in Sprint G.

  ## TEST PLAN
  - `npm --prefix client run lint:adherence` — passes on the clean tree
  - Negative: introduce `style={{color:'#fff'}}` in a component, confirm the lint FAILS, revert
  - Negative: introduce a raw `#1a1a1a` in a `.tsx`, confirm the lint FAILS, revert
  - `npm --prefix client run test` — primitive render tests pass in both themes
  - Verify no hardcoded infrastructure values in new/modified files

  ## EDGE CASES
  - A color literal inside a code-syntax-highlighting theme (legitimately needed) — allow via
    an explicit, documented allowlist file, never via a blanket lint disable
  - SVG `fill="currentColor"` must be permitted; literal fills must not
  - Theme flash on first paint — set the theme attribute before first render

- **Acceptance criteria:**
  - [ ] Token layer matches the existing constellation design system (no parallel palette)
  - [ ] `lint:adherence` fails on inline styles, hardcoded colors, and stray `<style>` blocks
  - [ ] Light and dark both render correctly; explicit override beats the media query
  - [ ] Primitives are typed React components with render tests
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README updated to document the design-system rules for contributors
  - [ ] All existing tests still pass

---

### APTR-03: Pipeline config, mirror whitelisting, and branch protection
- **Priority:** Critical
- **Labels:** aperture, pipeline, mirror, security
- **Agent:** claude
- **Estimate:** 3h
- **Description:** Register Aperture with the build pipeline: opt the repo into the git-public
  mirror engine, declare the public remote, and protect `main`. The mirror engine must have
  this repo whitelisted so **every merge** runs Stage 7d, and the doc-target config must be
  declared so the doc engine knows what to render at capstone time.

  ## FILES
  - `.moosenet-pipeline.yaml` — `mirror_ready: true`, `github_remote`, doc-target config
  - `docs/PIPELINE.md` — what runs when, for contributors and future agents
  - `.gitattributes` — LF normalization

  ## APPROACH
  1. Author `.moosenet-pipeline.yaml` in the same shape the sibling repos use:
     `mirror_ready: true` plus the public `github_remote` for this repo. **This file must
     never contain a token** — mirror auth is the runtime credential via the secret store.
  2. Declare the doc-target config (`targets`) so the capstone's `docgen_run` has something to
     render. Do NOT wire `docgen_run` into any per-merge step — it is capstone-gated.
  3. Protect `main` via `gitea_edit_branch_protection` (the sanctioned tool — never raw API):
     block force-push and deletion, whitelist direct push to the merge-queue identity only.
  4. Document in `docs/PIPELINE.md` that a merge is not complete until the post-merge gate has
     run, and that a `needs_operator_rebaseline` result is surfaced, never force-resolved.
  5. Verify the mirror engine sees the repo: call `git_public_mirror_status` for `Aperture`
     and record the result in the PR body.

  ## TEST PLAN
  - `git_public_mirror_status` for this repo returns a status (not "unknown repo")
  - `gitea_edit_branch_protection` is idempotent — run twice, second run is a no-op update
  - Confirm `.moosenet-pipeline.yaml` contains no token, key, IP, or hostname literal
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: confirm a direct force-push to `main` is refused after protection is applied

  ## EDGE CASES
  - Branch protection applied before the first commit exists on `main` — apply after the
    initial merge, and say so in the PR body if deferred
  - A `github_remote` pointing at a repo that does not exist — the mirror engine skips rather
    than pushing; verify the remote resolves first
  - Mirror reports `needs_operator_rebaseline` on first run — expected pre-bootstrap; APTR-13
    handles it. Do NOT force-push.

- **Acceptance criteria:**
  - [ ] `.moosenet-pipeline.yaml` sets `mirror_ready: true` with the correct public remote
  - [ ] No token, key, IP, or hostname literal in the pipeline config
  - [ ] `main` is protected: force-push and deletion blocked
  - [ ] Doc-target config declared; `docgen_run` NOT wired to any per-merge step
  - [ ] `docs/PIPELINE.md` documents the post-merge gate as indivisible from the merge
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] All existing tests still pass

---

### APTR-04: README, brand assets, and repo identity
- **Priority:** High
- **Labels:** aperture, docs, brand
- **Agent:** claude
- **Estimate:** 4h
- **Description:** Write the repo README to the same standard as the sibling constellation
  repos, and wire in the brand SVG set. Sibling repos carry `assets/banner.svg`,
  `assets/architecture.svg`, `assets/badges.svg`, and (where branded) icon/wordmark/favicon
  variants — Aperture matches that convention exactly.

  ## FILES
  - `README.md` — full rewrite from the APTR-01 stub
  - `assets/banner.svg` — repo banner
  - `assets/architecture.svg` — the client/BFF/kernel diagram
  - `assets/badges.svg` — status badge strip
  - `assets/aperture-icon-32.svg`, `assets/aperture-wordmark.svg`, `assets/aperture-favicon.svg`
  - `docs/BRAND.md` — palette, usage rules, what not to do

  ## APPROACH
  1. README sections, in order: banner, one-line positioning, badges, What Aperture is / is not,
     Architecture (embedding `assets/architecture.svg`), Targets (web/desktop/mobile), Channel
     policy table, Quick start, Install (link to `docs/INSTALL.md`), Contributing, Pipeline,
     Licence.
  2. All SVGs are **hand-authored, self-contained, theme-aware** — `currentColor` or CSS
     custom properties where possible so they read on light and dark forge/mirror pages. No
     embedded raster, no external font reference (convert text to paths or use a generic stack).
  3. Brand palette derives from the constellation design system tokens, not a new palette.
  4. README must contain **no internal hostnames, IPs, ports, org-internal URLs, or personal
     identifiers** — this file ships to the public mirror. Use env var names and placeholders.
  5. Cross-reference the sibling repos by name only, never by internal URL.

  ## TEST PLAN
  - Render each SVG headlessly and confirm it is non-empty and parses as valid XML
  - Confirm each SVG references no external URL and embeds no raster payload
  - Run the repo PII scan over `README.md`, `docs/`, and `assets/` — zero findings
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: confirm the PII scan FLAGS a deliberately inserted internal hostname; revert

  ## EDGE CASES
  - An SVG with a hardcoded dark-only fill becoming invisible on a light mirror page — test both
  - Banner too wide for the mirror's README column — cap at a sane max width with `viewBox`
  - A badge SVG that implies a CI status not yet wired — use neutral/pending badges until APTR-09

- **Acceptance criteria:**
  - [ ] README covers positioning, architecture, targets, channel policy, quick start, install
  - [ ] All six SVGs present, self-contained, theme-aware, and valid XML
  - [ ] Zero external references or raster payloads in any SVG
  - [ ] Zero PII findings across README, docs, and assets
  - [ ] `docs/BRAND.md` documents palette and usage rules
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] All existing tests still pass

---

### APTR-05: Aperture BFF crate skeleton inside the agent core
- **Priority:** Critical
- **Labels:** aperture, bff, rust, lumina-core
- **Agent:** claude
- **Estimate:** 5h
- **Description:** Create the Aperture backend-for-frontend as a feature-gated module inside
  the existing agent core crate — not a new service. It mounts under `/v1/aperture/*`, reuses
  the core's existing HTTP server, and reaches every backend capability through
  `terminus-client`. It holds no secrets of its own and opens no egress.

  ## FILES
  - `docs/BFF-PLACEMENT.md` (this repo) — records the placement decision and the exact
    module paths in the agent-core repo that this sprint's sibling PR adds
  - **Agent-core repo (separate PR, same item):** a new `aperture` module with `mod.rs`,
    `routes.rs`, `state.rs`, `error.rs`, feature-gated behind an `aperture` cargo feature

  ## APPROACH
  1. This item spans two repos. Per the multi-repo rule, split into **two PRs**: the
     agent-core PR (the BFF module) merges first; the Aperture-repo PR (the placement doc and
     contract stub) merges second.
  2. The BFF module registers routes on the core's existing HTTP server behind a cargo feature
     so a build without the feature is byte-compatible with today's binary.
  3. All outbound calls go through `terminus-client`. **No `reqwest` client constructed against
     any service URL** — that would be a second door and is a reviewable violation.
  4. Any secret is read via `SecretManager::get()` / `vault::manager().get()`. **No
     `std::env::var` for anything token/key/password/secret-shaped.**
  5. Chord is addressed by **named proxy** only. No model IDs, engine names, or backend tags.
  6. Define a single error type mapping to RFC-9457 problem-details JSON (APTR-10 formalizes
     the shape); no `unwrap()` on any request path.

  ## TEST PLAN
  - Agent-core test gate via the compiler tool, `mode=test` — full workspace tests pass
  - Build with and without the `aperture` feature; both compile clean
  - `grep` confirms zero `std::env::var` reads of token/key/secret-shaped names in the new module
  - `grep` confirms zero direct HTTP clients constructed against a service URL
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: a request to an unmounted `/v1/aperture/*` path returns a structured 404, not a panic

  ## EDGE CASES
  - Feature-off build must not leave dead-code warnings that break a `-D warnings` gate
  - `terminus-client` unreachable at startup — the BFF must start degraded and report
    capability `unavailable`, never crash the agent core
  - Route collision with an existing core route — namespace strictly under `/v1/aperture/`

- **Acceptance criteria:**
  - [ ] BFF module compiles with and without the `aperture` feature
  - [ ] All backend access routes through `terminus-client`; zero direct service HTTP clients
  - [ ] Secrets accessed via `SecretManager`, not env vars
  - [ ] Chord addressed by named proxy only; no model/engine names in code
  - [ ] Unreachable kernel degrades to `unavailable`, never a crash
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README updated to document the BFF and its feature flag
  - [ ] All existing tests still pass

---

### APTR-06: Versioned BFF API contract v1 (the document every later sprint codes against)
- **Priority:** Critical
- **Labels:** aperture, contract, api
- **Agent:** claude
- **Estimate:** 6h
- **Description:** Author the versioned Aperture client↔BFF contract. This is the single
  artifact that lets Sprints B–F be built in parallel without churn. It is a **contract
  document plus a machine-readable schema**, not an implementation.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — OpenAPI 3.1 description of every `/v1/aperture/*` route
  - `contracts/aperture-events-v1.md` — the SSE event taxonomy and ordering guarantees
  - `contracts/README.md` — versioning and breaking-change policy

  ## APPROACH
  1. Define these route groups: `auth` (login, refresh, logout, device list/revoke),
     `threads` (workspace + thread + message CRUD), `stream` (SSE), `attachments`
     (upload, status, delete), `modules` (capability descriptors), `events` (context-bus
     publish), `settings`, `admin`.
  2. Define the SSE event taxonomy precisely: `token`, `message.start`, `message.end`,
     `tool.call`, `tool.result`, `thinking`, `error`, `context`, `presence`, `heartbeat`.
     Specify ordering guarantees, the monotonic sequence number, and the resume semantics
     (`Last-Event-ID`) that Sprint B implements.
  3. Every error response is RFC-9457 problem-details with a stable `type` URN.
  4. Version policy: additive changes bump the minor and stay on `/v1`; any breaking change
     mints `/v2` and both are served through a deprecation window. Write this down.
  5. **Contract-first is enforced**: schemas here are the source of truth for the generated
     client SDK in APTR-07, and a CI job (APTR-09) fails on drift.
  6. Use placeholder/env-var notation for every host and port. No literal addresses.

  ## TEST PLAN
  - `contracts/aperture-api-v1.yaml` validates as OpenAPI 3.1 in CI
  - Every route in the spec carries at least one documented error response
  - Every SSE event type in `aperture-events-v1.md` appears in the schema's enum
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: an intentionally malformed schema fails the CI validation step

  ## EDGE CASES
  - SSE is not naturally expressible in OpenAPI — document the stream endpoint's media type in
    the schema and put the event taxonomy in the companion markdown, cross-referenced both ways
  - Attachment upload size limits must be in the contract, not discovered at runtime
  - Long-lived streams behind a proxy that buffers — the contract must mandate the
    anti-buffering headers so Sprint B implements them

- **Acceptance criteria:**
  - [ ] OpenAPI 3.1 schema covers all eight route groups and validates in CI
  - [ ] SSE event taxonomy documented with ordering, sequence, and resume semantics
  - [ ] Every error is RFC-9457 problem-details with a stable type URN
  - [ ] Versioning and breaking-change policy documented
  - [ ] No literal hosts, ports, or addresses anywhere in the contract
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README updated to point at the contract as the source of truth
  - [ ] All existing tests still pass

---

### APTR-07: Generated TypeScript client SDK with drift detection
- **Priority:** High
- **Labels:** aperture, sdk, web, contract
- **Agent:** codex
- **Estimate:** 4h
- **Description:** Generate a typed TypeScript client from the APTR-06 contract so every UI
  sprint consumes types rather than hand-written fetch calls, and so contract drift is a build
  failure rather than a runtime surprise.

  ## FILES
  - `client/src/api/generated/` — generated types and operation signatures (checked in)
  - `client/src/api/client.ts` — thin hand-written transport wrapper over the generated types
  - `client/scripts/gen-api.mjs` — generation script
  - `client/scripts/assert-api-current.mjs` — regenerate-and-diff drift check

  ## APPROACH
  1. Generate types from `contracts/aperture-api-v1.yaml` into a checked-in directory so the
     build never needs network access.
  2. `client.ts` is the only place a `fetch` is constructed. It handles credentials
     (same-origin cookie or bearer from the session store), retries idempotent GETs with
     backoff, and normalizes problem-details into a typed error.
  3. `assert-api-current.mjs` regenerates into a temp dir and diffs against the checked-in
     output — a mismatch fails CI. This is the contract-drift gate.
  4. Never construct an absolute URL. Every request is same-origin relative.
  5. The SDK must not embed any default host, port, token, or model name.

  ## TEST PLAN
  - `node client/scripts/gen-api.mjs` then `assert-api-current.mjs` — clean, no diff
  - Unit tests: problem-details response normalizes to the typed error shape
  - Unit tests: a non-idempotent POST is NOT retried; an idempotent GET is
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: edit the contract without regenerating; confirm `assert-api-current` FAILS

  ## EDGE CASES
  - A generator version bump silently reformatting output and failing the drift check — pin the
    generator version exactly
  - Retry storm on a 5xx — cap attempts and use jittered backoff
  - A 401 mid-stream must surface as a typed auth error the UI can act on, not a generic failure

- **Acceptance criteria:**
  - [ ] Types generated from the contract and checked in
  - [ ] `fetch` is constructed in exactly one file
  - [ ] Contract drift fails CI
  - [ ] Problem-details normalize to a typed error; retries only on idempotent verbs
  - [ ] No absolute URLs, hosts, ports, tokens, or model names in the SDK
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] All existing tests still pass

---

### APTR-08: Module descriptor registry and capability gating
- **Priority:** High
- **Labels:** aperture, modules, bff, contract
- **Agent:** claude
- **Estimate:** 5h
- **Description:** Implement Module Contract clause 2 mechanically. The BFF exposes
  `GET /v1/aperture/modules` returning a descriptor per module (assistant, Muse, Harmony, and
  any future one) with its capability state; the shell renders a module only when its backend
  capability is actually present, and renders an inert explained tile when it is not.

  ## FILES
  - `contracts/aperture-modules-v1.md` — the descriptor schema and capability-state semantics
  - `client/src/modules/registry.ts` — client-side registry keyed off the descriptors
  - `client/src/modules/ModuleGate.tsx` — the gating component
  - **Agent-core repo (sibling PR):** the `modules` route implementation

  ## APPROACH
  1. A descriptor carries: stable `id`, display name, icon token, capability state
     (`available` | `degraded` | `unavailable`), a human-readable reason when not available,
     the routes it claims, and the context-bus topics it publishes and consumes.
  2. Capability state is **probed through `terminus-client`**, never assumed from config, and
     never by pinging a service URL directly.
  3. `ModuleGate` renders children only on `available`; on `degraded` it renders children plus
     a banner; on `unavailable` it renders an inert tile with the reason. **Never a broken
     screen, never a blank route.**
  4. Descriptors are cached with a short TTL and revalidated on the SSE `context` channel so a
     backend coming up mid-session lights the module up without a reload.
  5. No module may be hardcoded into the shell's navigation — navigation is derived from the
     descriptor list.

  ## TEST PLAN
  - Unit: `unavailable` renders the inert tile with the reason and never the children
  - Unit: `degraded` renders children plus banner
  - Unit: navigation derives entirely from descriptors — removing a descriptor removes the nav entry
  - Integration: kernel unreachable → every module reports `unavailable`, shell still renders
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: a descriptor with an unknown capability state is treated as `unavailable`, not as available

  ## EDGE CASES
  - Unknown/forward-compatible capability state from a newer backend — fail closed to `unavailable`
  - A module claiming a route another module already claims — reject the duplicate, log once
  - Descriptor fetch failing entirely — render the shell with all modules inert, never a white screen

- **Acceptance criteria:**
  - [ ] `GET /v1/aperture/modules` returns descriptors with capability state and reason
  - [ ] Capability probed through the sanctioned door, never a direct service call
  - [ ] Navigation derives from descriptors; no hardcoded module list in the shell
  - [ ] Unknown capability states fail closed to `unavailable`
  - [ ] Kernel unreachable still renders the shell with inert tiles
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README updated to document the module descriptor contract
  - [ ] All existing tests still pass

---

### APTR-09: CI workflow — build, test, contract, adherence, and vulnerability gates
- **Priority:** High
- **Labels:** aperture, ci, security
- **Agent:** codex
- **Estimate:** 4h
- **Description:** Per-push CI for the Aperture repo, matching the fleet's CI conventions:
  build + test + audit, running on the off-node non-root runner.

  ## FILES
  - `.gitea/workflows/ci.yml` — the workflow
  - `ci/README.md` — what each job gates and how to reproduce it locally

  ## APPROACH
  1. Jobs: `client-build` (`npm ci`, `typecheck`, `lint:adherence`, `build`,
     `assert-no-external-hosts`, `assert-api-current`), `client-test` (vitest),
     `contract-validate` (OpenAPI 3.1 validation), `audit` (dependency vulnerability scan,
     vulnerabilities blocking, unmaintained/yanked as warnings), `pii-scan`.
  2. The audit gate **fails closed** on a malformed or missing report — absence is never read
     as zero. Any accepted advisory needs an in-file rationale comment.
  3. Cache `node_modules` by lockfile hash; never cache across lockfile changes.
  4. No secret is echoed, no token appears on a command line, and nothing is printed that could
     leak an internal host.
  5. The workflow must not require network access to a registry the runner cannot reach — pin
     and vendor where necessary.

  ## TEST PLAN
  - Push a branch; confirm all jobs run and pass
  - Negative: push a type error; confirm `client-build` FAILS
  - Negative: push a contract edit without regenerating the SDK; confirm the drift job FAILS
  - Negative: feed the audit job a truncated report; confirm it FAILS CLOSED rather than passing
  - Verify no hardcoded infrastructure values in new/modified files

  ## EDGE CASES
  - Runner without a network route to a public registry — document the vendored fallback
  - A vulnerability with no upstream fix — accept-list it with a rationale comment, never a blanket ignore
  - Flaky job masking a real failure — no automatic job-level retries on the gating jobs

- **Acceptance criteria:**
  - [ ] CI runs build, typecheck, adherence, external-host, contract-drift, test, audit, PII jobs
  - [ ] Audit gate fails closed on a malformed or missing report
  - [ ] Accepted advisories carry an in-file rationale
  - [ ] No secrets or internal hosts appear in workflow files or job output
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README updated with a CI status section
  - [ ] All existing tests still pass

---

### APTR-10: Error model, problem-details, and the no-silent-failure rule
- **Priority:** High
- **Labels:** aperture, bff, contract, reliability
- **Agent:** claude
- **Estimate:** 3h
- **Description:** One error model across BFF and client. Every failure surfaces as typed,
  actionable, RFC-9457 problem-details — never a swallowed exception, never a bare 500, never
  a leaked internal detail.

  ## FILES
  - `contracts/aperture-errors-v1.md` — the URN taxonomy and what each means to a user
  - `client/src/api/errors.ts` — typed error classes and user-facing message mapping
  - **Agent-core repo (sibling PR):** the BFF error type and its response mapping

  ## APPROACH
  1. Stable type URNs per failure class: auth-required, auth-expired, forbidden, not-found,
     rate-limited, capability-unavailable, upstream-timeout, upstream-error, validation-failed,
     payload-too-large, internal.
  2. **Redaction is mandatory**: a problem-details body must never contain an internal host,
     path, token, stack frame, or upstream error string. Map to a class and a stable message;
     the detail goes to the server log with a correlation id the response echoes.
  3. The client maps each URN to a user-facing message and, where applicable, a recovery
     action (re-auth, retry, open settings).
  4. No `unwrap()`/`expect()` on any request path. No `catch {}` that discards.
  5. Audit-log entries for error paths sanitize arguments: keys and tokens redacted, values
     over 1 KB truncated with an explicit marker.

  ## TEST PLAN
  - Unit: each URN maps to exactly one user-facing message and recovery action
  - Unit: an upstream error containing an internal hostname is redacted before it reaches the body
  - Unit: correlation id present on every error response and echoed to the client
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: assert a synthetic upstream error string with a token in it does NOT appear in the response

  ## EDGE CASES
  - An error during SSE streaming — must emit an `error` event in-stream, not truncate silently
  - A validation error with a field path that itself contains user content — escape, don't echo raw
  - Correlation id collision — use a sufficiently wide random id, not a counter

- **Acceptance criteria:**
  - [ ] Stable URN taxonomy documented and implemented on both sides
  - [ ] No internal host, path, token, or stack frame can reach a response body
  - [ ] Every error carries a correlation id echoed to the client
  - [ ] Zero `unwrap()`/`expect()` on request paths; zero discarding catches
  - [ ] Audit-log arguments sanitized (keys/tokens redacted, >1KB truncated)
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] All existing tests still pass

---

### APTR-11: Configuration and secrets discipline for the BFF
- **Priority:** High
- **Labels:** aperture, security, bff, secrets
- **Agent:** claude
- **Estimate:** 3h
- **Description:** Establish, and mechanically enforce, that Aperture holds no secrets: all
  configuration flows through the core's config helpers and all secrets through the secret
  manager, materialized at runtime from the vault. Nothing is authored into a file.

  ## FILES
  - `docs/CONFIGURATION.md` — every config key by name, with defaults and tiers
  - `.env.example` — documented **names only**, no values, with an explicit warning banner
  - **Agent-core repo (sibling PR):** config accessors for the Aperture keys

  ## APPROACH
  1. Enumerate Aperture's config surface by env-var **name**: session TTLs, upload limits,
     stream heartbeat interval, module probe TTL, push keys. Never a value, never an address.
  2. Secrets (`APERTURE_SESSION_SIGNING_KEY`, the push keypair) are read exclusively via
     `SecretManager::get()`. Any `std::env::var` of a secret-shaped name is a review rejection.
  3. Must work across all three deployment tiers (file / env / interactive key provider) and
     **without** the external secret backend — fall back to cached vault values, never hard-fail.
  4. Secret values must never reach stdout, logs, or an error body — rely on the redacting
     display impl and assert it in a test.
  5. If a required secret is absent, the affected capability reports `unavailable` with a clear
     reason. **Do not invent a stopgap value.**

  ## TEST PLAN
  - Works with the file key provider; works with the env key provider
  - Works with vault-only (external secret backend unreachable) — cached values used
  - Unit: a secret rendered via its display impl prints a redaction marker, not the value
  - `grep` confirms zero `std::env::var` reads of token/key/password/secret-shaped names
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: with the signing key absent, auth reports `unavailable` and does not start with a default key

  ## EDGE CASES
  - Secret rotation mid-session — sessions signed with the previous key must fail closed to
    re-auth, never silently accept
  - `.env.example` drifting from the real key set — a test asserts every documented key exists in code
  - A log line interpolating a config struct that contains a secret — assert the struct's debug
    impl redacts

- **Acceptance criteria:**
  - [ ] Works with file key provider
  - [ ] Works with env key provider
  - [ ] Works without the external secret backend (vault-only mode)
  - [ ] Secrets never written to logs, stdout, or error bodies
  - [ ] Missing secret ⇒ capability `unavailable`, never a default/stopgap value
  - [ ] Zero `std::env::var` reads of secret-shaped names
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README updated to point at `docs/CONFIGURATION.md`

---

### APTR-12: Promote the APTR prefix to the durable registry
- **Priority:** Medium
- **Labels:** aperture, pipeline, registry
- **Agent:** claude
- **Estimate:** 1h
- **Description:** The `APTR` prefix is claimed in the runtime overlay only. Promote it into
  the git-versioned baseline registry so the claim survives a restart and is visible to every
  instance.

  ## FILES
  - (kernel repo, via the sanctioned tool) the prefix registry baseline entry

  ## APPROACH
  1. Call `plane_prefix_promote` for `APTR` with the owning project, name, description, and
     originating spec id. The tool writes the baseline entry and opens a PR through the normal
     pipeline in a throwaway worktree.
  2. Do **not** hand-edit the registry file and do **not** open the PR by another path — the
     promote tool is the sanctioned door.
  3. The resulting PR goes through the standard review gate like any other change.

  ## TEST PLAN
  - `plane_prefix_get` for `APTR` returns the entry after the promote PR merges
  - Re-running `plane_prefix_promote` for `APTR` is a no-op (idempotent)
  - Verify no hardcoded infrastructure values in new/modified files

  ## EDGE CASES
  - The owning-project validator may not yet know `APTR` — if it rejects, report it and file a
    follow-up to add the project to the validator's allowed set. **Do not work around the
    validator by hand-editing the baseline.**
  - A concurrent promote of a different prefix racing on the same file — the tool serializes;
    retry once on conflict

- **Acceptance criteria:**
  - [ ] `APTR` present in the durable baseline registry after the promote PR merges
  - [ ] Promote is idempotent on re-run
  - [ ] Registry file was not hand-edited
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] All existing tests still pass

---

### APTR-13: Operator — bootstrap the public mirror lineage for Aperture
- **Priority:** High
- **Labels:** aperture, mirror, human-action
- **Agent:** <operator>
- **Estimate:** 30m
- **Type:** human-action
- **Description:** The public mirror for this repo exists but shares no lineage with the swept
  work-dir derivative. The first mirror therefore needs the one-time, operator-blessed
  force re-baseline that establishes shared history. Every push after this is fast-forward only.
- **Steps:**
  1. After APTR-03 has merged and at least one substantive commit is on `main`, run
     `git_public_mirror_prepare` for the Aperture repo to produce the gate-clean, swept snapshot.
  2. Spot-check the snapshot for leaks — read the diff, do not just trust the gate.
  3. If, and only if, the sweep reports **0 residual violations**, bless it and perform the
     one-time force re-baseline of the public mirror to that snapshot. This is the single
     sanctioned use of force on this repo, recorded here.
  4. Confirm a subsequent `git_public_mirror_push` is a plain fast-forward.
  5. Confirm `git_public_history_status` reports `lineage_established`.
- **Notes for the executing agent:** do **not** perform step 3 autonomously. A
  `needs_operator_rebaseline` result from any later merge is surfaced and left for the
  operator — never force-resolved, never escalated through the snapshot path on a
  full-history repo.

---

### APTR-14: Installation documentation skeleton
- **Priority:** Medium
- **Labels:** aperture, docs
- **Agent:** gemini
- **Estimate:** 3h
- **Type:** documentation
- **Description:** Author the installation guide skeleton that Sprints E and F fill in with
  real desktop and mobile steps. It ships to the public mirror, so it must be genuinely usable
  by someone outside the fleet.

  ## AUDIENCE
  Two readers: the operator standing Aperture up on the fleet, and an external reader
  evaluating the project from the public mirror who has none of the fleet's infrastructure.

  ## OUTLINE
  - Overview and what you need before you start (~200 words)
  - Prerequisites by target: server-side, web, desktop (Windows/macOS), mobile (~400 words)
  - Server-side setup: enabling the BFF feature, config keys by name, secret provisioning
    through the vault, health check (~600 words)
  - Web: build, serve, first-run onboarding, creating the first account (~400 words)
  - Desktop: placeholder sections for Windows and macOS installers, signing notes,
    auto-update — marked clearly as filled in by Sprint E (~200 words)
  - Mobile: placeholder for PWA install and push enablement — Sprint F (~200 words)
  - Channel configuration: Matrix (retained), Telegram (optional), Signal (stub, not
    configurable yet) (~300 words)
  - Verifying the install: what "working" looks like, and the three most common failures (~400 words)
  - Troubleshooting (~400 words)

  ## SOURCES
  - `contracts/aperture-api-v1.yaml`
  - `docs/CONFIGURATION.md`
  - `docs/PIPELINE.md`
  - The epic overview's channel policy table

  ## TONE
  Technical reference, direct, no filler, no marketing. Every command copy-pasteable.
  **No internal hostnames, IPs, ports, or personal identifiers** — env var names and
  placeholders only; this file ships publicly. Where a value is fleet-specific, say so
  explicitly rather than inventing a plausible-looking address.
