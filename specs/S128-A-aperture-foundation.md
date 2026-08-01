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
- **Estimated total:** 106.5h (56.5h across APTR-01..14 + 50h across APTR-95..107)
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
- **Revision:** revised 2026-08-01 to fold in the completed Fable expert review of this sprint
  and the binding cross-sprint decisions in `specs/S128-DECISIONS.md`. Where this file and
  `S128-DECISIONS.md` disagree, **the decisions file wins and this file is wrong.**

## Pre-flight

### ⚠ ITEM NUMBERS ARE IDENTIFIERS, NOT AN ORDERING — READ THIS FIRST

This sprint owns **APTR-01..14** and **APTR-95..107**. The gap is not a mistake and the high
numbers do not mean "last", "optional", or "lower priority".

- Ranges **15–94 are allocated to Sprints B–G** and were already handed to other authoring
  agents when this revision was written.
- The thirteen items added by this revision (**APTR-95..107**) were therefore **appended above
  the allocated ranges**, contiguously, after range allocation.
- **No existing item was renumbered, and none ever may be.** Plane issue ids, branch names,
  and cross-sprint `Blocked by` references in Sprints B–G already point at APTR-01..14.
- Several APTR-95..107 items are **Critical** and must merge **before** items with lower
  numbers. Merge order is stated explicitly and *only* via `- **Blocked by:**` on each item.
  Do not infer order from the number.

**Required merge order (the only authority is each item's `Blocked by` line):**

1. **Wave 1 — no dependencies:** APTR-01, APTR-03, APTR-06, APTR-12, APTR-105
2. **Wave 2 — contract extensions (all gate on APTR-06):** APTR-95, APTR-96, APTR-97, APTR-103
3. **Wave 3 — foundation code:** APTR-02, APTR-05, APTR-07, APTR-09, APTR-10
4. **Wave 4:** APTR-98, APTR-99, APTR-100, APTR-102, APTR-106, APTR-107, APTR-11
5. **Wave 5:** APTR-04, APTR-08, APTR-101, APTR-104
6. **Wave 6 — after `main` has substantive content:** APTR-13, APTR-14

### Environment
- Repository: `moosenet/Aperture` on the internal forge (created)
- Public mirror target: `moosenet-io/aperture` (exists; bootstrap is APTR-13)
- Dependencies: `node` ≥ 20, `npm`, `rustup` + pinned toolchain, `cargo`
- Vault secrets required: `GITEA_PAT_MOOSE`, `GITHUB_PAT_HARMONY`
- Infrastructure: internal forge reachable, Plane reachable, Terminus door reachable
- Baseline tests: 0 (new repo)
- Baseline verify: N/A (new repo)

### Binding decisions applied in this revision
- **D1** — the SDK transport is injectable with a base URL; APTR-07's criterion is amended to
  *no hardcoded absolute URL and no compiled-in default endpoint*. Cookie-vs-bearer and CSP are
  specified **per target** in APTR-06, with an explicit "no CORS headers on `/v1/aperture/*`,
  ever".
- **D7** — the vault fallback cache is memory-only, zeroize-on-drop, bounded TTL, never on disk
  (APTR-11).
- **D8** — every mechanical gate is implementable in the language whose property it asserts.
- **D9** — a mandatory `origin` discriminator on every SSE event and stored message (APTR-06).
- **D10 items 1–7** — now real items: APTR-99, APTR-98, APTR-95, APTR-96, APTR-97, APTR-101,
  APTR-100.
- **D12** — the header estimate equals the exact sum of item estimates.

---

### APTR-01: Repo scaffold — Vite + React + TypeScript client workspace
- **Priority:** Critical
- **Labels:** aperture, scaffold, web
- **Agent:** claude
- **Estimate:** 5h
- **Description:** Stand up the Aperture client workspace as a Vite + React 18 + TypeScript
  SPA, matching the toolchain already proven in the constellation's two existing web surfaces
  (Vite 5, React 18.3, react-router-dom 6, vitest, tsc `--noEmit` in the build script).
  **No Tailwind** — the constellation design system is token-based CSS. No runtime CDN,
  font, or analytics fetches of any kind (Module Contract clause 6).

  **Review defect fixed here:** `assert-no-external-hosts.mjs` as originally specified fails
  every clean build. A bundled inline SVG legitimately carries `xmlns="http://www.w3.org/2000/svg"`,
  and dependency licence banners routinely contain project URLs. The naive grep therefore hits on
  a correct build while its negative test still appears to pass — a gate that is red-on-green.
  The fix is a **documented XML-namespace allowlist plus comment-stripped scanning**, both
  specified below and both directly tested.

  ## FILES
  - `client/package.json` — workspace manifest, scripts (`dev`, `build`, `typecheck`, `test`, `lint:adherence`)
  - `client/tsconfig.json` — strict mode on
  - `client/vite.config.ts` — build config, no external CDN plugins
  - `client/index.html` — app shell, no external `<link>`/`<script>` hosts
  - `client/src/main.tsx` — entry
  - `client/src/App.tsx` — router root
  - `client/src/routes.tsx` — route table placeholder
  - `client/scripts/assert-no-external-hosts.mjs` — the egress gate
  - `client/scripts/external-host-allowlist.json` — the XML-namespace allowlist (data, not code)
  - `client/.gitignore`, `.gitattributes`
  - `README.md` — created here in stub form; APTR-04 fills it out

  ## APPROACH
  1. Mirror the dependency set proven in the existing constellation web surfaces: React 18.3,
     react-router-dom 6, vite 5, typescript 5.4+, vitest. Pin exact versions.
  2. `build` script MUST be `tsc --noEmit && vite build` so type errors fail the build.
  3. Add `@fontsource/*` packages for any webfont so fonts are **bundled, never fetched**.
     Assert in `vite.config.ts` that no `external` host is configured.
  4. `assert-no-external-hosts.mjs` runs as a build post-step over the **built** output and:
     a. **Strips comments before scanning.** JS `//` and `/* */` and CSS `/* */` are removed
        from each emitted asset first, so dependency licence banners (which legitimately carry
        upstream project URLs) cannot trip the gate. Stripping is for scanning only; the emitted
        bundle is not rewritten.
     b. Scans the comment-stripped text for absolute `http://` / `https://` origins.
     c. **Exact-matches** each hit against `external-host-allowlist.json`, which contains only
        **XML/HTML namespace URIs** — the SVG, XLink, XHTML, and XML namespaces. Matching is
        exact-string, never prefix or substring, so a lookalike origin sharing a namespace
        prefix is still a failure.
     d. Every allowlist entry carries a mandatory `reason` field. An entry without one fails
        the script. Adding a non-namespace entry is a review rejection, not a config change.
     e. Fails the build on any surviving hit, printing the asset, line, and matched origin.
  5. No secret, token, IP, or hostname literal anywhere. Backend addressing is supplied by the
     injectable transport (APTR-07) — this scaffold hardcodes no endpoint of any kind.

  ## TEST PLAN
  - `npm --prefix client ci && npm --prefix client run build` — clean build, zero type errors,
    and the egress gate **passes** on a bundle that contains both an inline SVG with an `xmlns`
    attribute and at least one dependency licence banner containing a URL (the exact
    false-positive pair the defect describes)
  - `npm --prefix client run test` — vitest runs (may be 0 tests at this point)
  - Verify no hardcoded IPs, hostnames, or org names in new/modified files
  - Negative: add a temporary `fetch("https://example.invalid")` and confirm the gate FAILS the
    build; remove it
  - Negative: add a URL inside a code comment only and confirm the gate does NOT fail (comment
    stripping works)
  - Negative: add an origin that shares a prefix with an allowlisted namespace URI but is not
    exactly equal, and confirm the gate FAILS (allowlist is exact-match, not prefix-match)

  ## EDGE CASES
  - A transitive dependency injecting a CDN preconnect — the gate must catch it in the built
    output, not just source
  - A minifier that strips comments already — the stripper must be idempotent and tolerate
    zero comments
  - A URL inside a string that *looks* like a namespace but is fetched at runtime — exact-match
    allowlisting plus the runtime CSP in APTR-99 is why the static gate is advisory, not sole
  - `tsc --noEmit` passing while `vite build` fails — both must run, in that order
  - Windows line endings from a contributor — `.gitattributes` normalizes to LF

- **Acceptance criteria:**
  - [ ] `npm run build` produces a clean bundle with zero TypeScript errors and the egress gate
        PASSES on a bundle containing inline-SVG `xmlns` attributes and licence-banner URLs
  - [ ] Build FAILS when any non-allowlisted external origin appears in the comment-stripped output
  - [ ] Allowlist contains only XML/HTML namespace URIs, is exact-match, and every entry has a `reason`
  - [ ] Zero Tailwind dependencies present; all fonts bundled, no runtime font fetch
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README updated to document the client workspace, its scripts, and the allowlist policy

---

### APTR-02: Import the constellation design system as Aperture's only styling layer
- **Priority:** Critical
- **Labels:** aperture, design-system, web
- **Agent:** claude
- **Estimate:** 5h
- **Blocked by:** APTR-01
- **Description:** Aperture uses the same token-based design system as the constellation's
  existing web surfaces — the same CSS custom properties, the same component vocabulary
  (`.card`, `.badge-*`, `.table`, `.btn-*`, `var(--bg-primary)` …), the same light/dark
  behavior. Port the token layer and primitives, and add the adherence lint that mechanically
  rejects hardcoded colors and inline styles. Automated contrast/motion gating is **APTR-107**;
  state primitives (skeleton/empty/spinner) are **APTR-100**.

  ## FILES
  - `client/src/styles/constellation.css` — token layer (colors, spacing, type, radii, motion)
  - `client/src/styles/primitives.css` — `.card`, `.btn-*`, `.badge-*`, `.table`, `.input`
  - `client/src/components/primitives/` — typed React wrappers over the CSS primitives
  - `client/scripts/adherence-lint.mjs` — the enforcement script
  - `client/scripts/color-allowlist.json` — documented exceptions (syntax-highlight themes)
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
  5. Declare `prefers-reduced-motion` and `forced-colors` token behavior in the token layer now;
     APTR-107 mechanically gates it.
  6. Include a focus-visible treatment on every interactive primitive.

  ## TEST PLAN
  - `npm --prefix client run lint:adherence` — passes on the clean tree
  - `npm --prefix client run test` — primitive render tests pass in both themes
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: introduce `style={{color:'#fff'}}` in a component, confirm the lint FAILS, revert
  - Negative: introduce a raw `#1a1a1a` in a `.tsx`, confirm the lint FAILS, revert

  ## EDGE CASES
  - A color literal inside a code-syntax-highlighting theme (legitimately needed) — allow via
    the explicit documented allowlist file, never via a blanket lint disable
  - SVG `fill="currentColor"` must be permitted; literal fills must not
  - Theme flash on first paint — set the theme attribute before first render
  - `forced-colors: active` must not be defeated by token fallbacks

- **Acceptance criteria:**
  - [ ] Token layer matches the existing constellation design system (no parallel palette)
  - [ ] `lint:adherence` fails on inline styles, hardcoded colors, and stray `<style>` blocks
  - [ ] Light and dark both render correctly; explicit override beats the media query
  - [ ] `prefers-reduced-motion` and `forced-colors` behavior declared in the token layer
  - [ ] Primitives are typed React components with render tests and focus-visible treatment
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README updated to document the design-system rules for contributors

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
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass

---

### APTR-04: README, brand assets, and repo identity
- **Priority:** High
- **Labels:** aperture, docs, brand
- **Agent:** claude
- **Estimate:** 4h
- **Blocked by:** APTR-01, APTR-105
- **Description:** Write the repo README to the same standard as the sibling constellation
  repos, and wire in the brand SVG set. Sibling repos carry `assets/banner.svg`,
  `assets/architecture.svg`, `assets/badges.svg`, and (where branded) icon/wordmark/favicon
  variants — Aperture matches that convention exactly. Governance files (LICENSE, SECURITY.md,
  CONTRIBUTING.md, CODEOWNERS) are **APTR-105**; this item links them.

  ## FILES
  - `README.md` — full rewrite from the APTR-01 stub
  - `assets/banner.svg`, `assets/architecture.svg`, `assets/badges.svg`
  - `assets/aperture-icon-32.svg`, `assets/aperture-wordmark.svg`, `assets/aperture-favicon.svg`
  - `docs/BRAND.md` — palette, usage rules, what not to do
  - `client/scripts/assert-svg-safe.mjs` — SVG sanitization check

  ## APPROACH
  1. README sections, in order: banner, one-line positioning, badges, What Aperture is / is not,
     Architecture (embedding `assets/architecture.svg`), Targets (web/desktop/mobile), Channel
     policy table, Quick start, Install (link to `docs/INSTALL.md`), Contributing (link to
     `CONTRIBUTING.md`), Security (link to `SECURITY.md`), Pipeline, Licence.
  2. All SVGs are **hand-authored, self-contained, theme-aware** — `currentColor` or CSS
     custom properties where possible so they read on light and dark forge/mirror pages. No
     embedded raster, no external font reference (convert text to paths or use a generic stack).
  3. `assert-svg-safe.mjs` parses every file under `assets/` and **rejects** `<script>`,
     `<foreignObject>`, `on*` event-handler attributes, `href`/`xlink:href` values that are not
     same-document fragments, and any embedded raster data URI. These files render on the public
     mirror, so this is a security gate, not a style check. Wire it into CI (APTR-09).
  4. Brand palette derives from the constellation design system tokens, not a new palette.
  5. README must contain **no internal hostnames, IPs, ports, org-internal URLs, or personal
     identifiers** — this file ships to the public mirror. Use env var names and placeholders.
     Cross-reference sibling repos by name only, never by internal URL.

  ## TEST PLAN
  - Render each SVG headlessly and confirm it is non-empty and parses as valid XML
  - `node client/scripts/assert-svg-safe.mjs` passes over `assets/`
  - Run the repo PII scan over `README.md`, `docs/`, and `assets/` — zero findings
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: insert a `<script>` and an `onload=` attribute into a test SVG and confirm
    `assert-svg-safe.mjs` FAILS on both; revert
  - Negative: confirm the PII scan FLAGS a deliberately inserted internal hostname; revert

  ## EDGE CASES
  - An SVG with a hardcoded dark-only fill becoming invisible on a light mirror page — test both
  - Banner too wide for the mirror's README column — cap at a sane max width with `viewBox`
  - A badge SVG that implies a CI status not yet wired — use neutral/pending badges until APTR-09
  - A legitimate same-document `xlink:href="#gradient"` must be permitted; an external one must not

- **Acceptance criteria:**
  - [ ] README covers positioning, architecture, targets, channel policy, quick start, install,
        and links CONTRIBUTING/SECURITY/LICENSE
  - [ ] All six SVGs present, self-contained, theme-aware, and valid XML
  - [ ] `assert-svg-safe.mjs` rejects script, foreignObject, event handlers, external hrefs, rasters
  - [ ] Zero PII findings across README, docs, and assets
  - [ ] `docs/BRAND.md` documents palette and usage rules
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass

---

### APTR-05: Aperture BFF crate skeleton inside the agent core
- **Priority:** Critical
- **Labels:** aperture, bff, rust, lumina-core
- **Agent:** claude
- **Estimate:** 5h
- **Blocked by:** APTR-06
- **Description:** Create the Aperture backend-for-frontend as a feature-gated module inside
  the existing agent core crate — not a new service. It mounts under `/v1/aperture/*`, reuses
  the core's existing HTTP server, and reaches every backend capability through
  `terminus-client`. It holds no secrets of its own and opens no egress.

  **Review defect fixed here:** this item spans two repos, and the Aperture-repo PR's gate can
  exercise **none** of the behavioural criteria — they all live in the agent-core repo. Without
  attribution the Aperture PR merges green while proving nothing. Every acceptance criterion
  below is therefore tagged with the repo whose gate proves it, and the Aperture-repo PR is
  explicitly a documentation PR that claims only the doc criterion.

  ## FILES
  - `docs/BFF-PLACEMENT.md` (this repo) — records the placement decision, the exact module
    paths the sibling PR adds, **and the gate-attribution table below**
  - **Agent-core repo (separate PR, same item):** a new `aperture` module with `mod.rs`,
    `routes.rs`, `state.rs`, `error.rs`, feature-gated behind an `aperture` cargo feature

  ## APPROACH
  1. Split into **two PRs**: the agent-core PR (the BFF module) merges **first**; the
     Aperture-repo PR (placement doc) merges **second** and links the merged agent-core PR by id.
  2. **Gate attribution is mandatory and written into `docs/BFF-PLACEMENT.md`:** a table with
     one row per acceptance criterion naming the repo, the gate (compiler-tool test run, grep
     gate, or doc review), and the evidence artefact. The Aperture-repo PR body must state
     "this PR proves only the documentation criterion; behavioural criteria are proven by
     agent-core PR #N" — an unlinked Aperture PR is not mergeable.
  3. The BFF module registers routes on the core's existing HTTP server behind a cargo feature
     so a build without the feature is byte-compatible with today's binary.
  4. All outbound calls go through `terminus-client`. **No `reqwest` client constructed against
     any service URL** — that would be a second door and is a reviewable violation. Per D8 this
     is enforced by a **Rust** test plus module-private visibility on the transport handle, not
     by a Node lint that cannot see Rust.
  5. Any secret is read via `SecretManager::get()` / `vault::manager().get()`. **No
     `std::env::var` for anything token/key/password/secret-shaped.**
  6. Chord is addressed by **named proxy** only. No model IDs, engine names, or backend tags.
  7. Define a single error type mapping to RFC-9457 problem-details (APTR-10 formalizes the
     shape); no `unwrap()` on any request path.

  ## TEST PLAN
  - Agent-core test gate via the compiler tool, `mode=test` — full workspace tests pass
  - Build with and without the `aperture` feature; both compile clean
  - Rust test asserts zero `std::env::var` reads of token/key/secret-shaped names in the module
  - Rust test asserts no HTTP client type is constructed outside the `terminus-client` wrapper
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: a request to an unmounted `/v1/aperture/*` path returns a structured 404, not a panic
  - Negative: an Aperture-repo PR whose body does not link a merged agent-core PR is rejected at review

  ## EDGE CASES
  - Feature-off build must not leave dead-code warnings that break a `-D warnings` gate
  - `terminus-client` unreachable at startup — the BFF must start degraded and report
    capability `unavailable`, never crash the agent core
  - Route collision with an existing core route — namespace strictly under `/v1/aperture/`
  - The two PRs merging out of order — the Aperture PR is blocked on the agent-core PR id

- **Acceptance criteria:**
  - [ ] *(agent-core gate)* BFF module compiles with and without the `aperture` feature
  - [ ] *(agent-core gate)* All backend access routes through `terminus-client`; enforced by a
        Rust test plus module-private visibility, zero direct service HTTP clients
  - [ ] *(agent-core gate)* Secrets accessed via `SecretManager`, not env vars
  - [ ] *(agent-core gate)* Chord addressed by named proxy only; no model/engine names in code
  - [ ] *(agent-core gate)* Unreachable kernel degrades to `unavailable`, never a crash
  - [ ] *(Aperture-repo gate)* `docs/BFF-PLACEMENT.md` carries the gate-attribution table and
        links the merged agent-core PR id
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README updated to document the BFF and its feature flag

---

### APTR-06: Versioned BFF API contract v1 (the document every later sprint codes against)
- **Priority:** Critical
- **Labels:** aperture, contract, api
- **Agent:** claude
- **Estimate:** 8h
- **Description:** Author the versioned Aperture client↔BFF contract. This is the single
  artifact that lets Sprints B–F be built in parallel without churn. It is a **contract
  document plus a machine-readable schema**, not an implementation. Session/CSRF semantics
  (APTR-95), idempotency (APTR-96) and version skew (APTR-97) are extensions authored against
  this item and gate on it.

  **Review defect fixed here:** v1 originally listed an `auth` route group with zero security
  semantics, no event provenance, and a transport rule (`same-origin relative only`) that the
  desktop target cannot satisfy. All three are now specified, per D1 and D9.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — OpenAPI 3.1 description of every `/v1/aperture/*` route
  - `contracts/aperture-events-v1.md` — SSE event taxonomy, provenance, ordering, replay
  - `contracts/aperture-transport-v1.md` — per-target transport, auth, and CSP rules
  - `contracts/README.md` — versioning, breaking-change policy, and shared conventions

  ## APPROACH
  1. Route groups: `auth` (login, refresh, logout, device list/revoke), `threads`
     (workspace + thread + message CRUD), `stream` (SSE), `attachments` (upload, status,
     delete, **serve** — isolation rules in APTR-98), `modules` (capability descriptors),
     `events` (context-bus publish), `settings`, `admin`, plus `GET /v1/aperture/health`
     (liveness), `GET /v1/aperture/ready` (readiness), and `GET /v1/aperture/version`
     returning the **contract version only** — explicitly no build hashes, host names, or
     upstream component versions. The infrastructure-leak rule applies to health endpoints.
  2. **Event provenance (D9).** Every SSE event **and every stored message object** carries a
     mandatory `origin` discriminator: `assistant | tool | system | user`. The contract states
     that clients MUST derive visual voice and attribution **from `origin` only, never from
     content**, and that a `tool.result` payload may never be emitted as, or coalesced into, an
     assistant token event regardless of the bytes the tool returns.
  3. **SSE taxonomy:** `token`, `message.start`, `message.end`, `tool.call`, `tool.result`,
     `thinking`, `error`, `context`, `presence`, `resync`, `heartbeat`. Specify ordering
     guarantees and the monotonic sequence number. Per D3, **a stream is one connection**;
     `thread_id` and message id demultiplex within it.
  4. **Replay is bounded.** `Last-Event-ID` resume is served from a bounded buffer (both an
     event-count and a wall-clock bound, each a named config key). When a client's id has aged
     out, the server emits `resync`, instructing a REST refetch of thread state. Resume is never
     unbounded and the contract says so.
  5. **Per-target transport (D1)** in `aperture-transport-v1.md`, stated per target, not globally:
     - **Web (and mobile PWA):** empty base URL, same-origin relative. Auth is the session
       **cookie** — `__Host-` prefixed, `HttpOnly`, `Secure`, `SameSite=Strict`.
       CSP `connect-src 'self'`.
     - **Desktop:** base URL is the operator-configured endpoint held in OS secure storage. Auth
       is a **bearer token, never a cookie** — a cross-origin cookie cannot be `SameSite=Strict`
       and must not be loosened to make one work. CSP `connect-src` lists exactly the configured
       endpoint and nothing else.
     - **CORS:** state explicitly and prominently that **no CORS headers are ever served on
       `/v1/aperture/*`**. The desktop reaches the API as a native HTTP client, not a browser
       fetch subject to CORS.
  6. Every error response is RFC-9457 problem-details with a stable `type` URN (taxonomy in
     APTR-10). Version policy: additive changes bump the minor and stay on `/v1`; any breaking
     change mints `/v2` and both are served through a deprecation window.
  7. **Shared conventions, stated once in `contracts/README.md`:** cursor pagination shape;
     sort/filter query conventions; ETag + `If-Match` optimistic concurrency for thread and
     settings mutation; global max body size, max JSON nesting depth, and max array length per
     route; and that **all API timestamps are UTC ISO-8601 with an explicit offset, rendered in
     the client's local zone** — never a local-time string on the wire.
  8. Use placeholder/env-var notation for every host and port. No literal addresses.

  ## TEST PLAN
  - `contracts/aperture-api-v1.yaml` validates as OpenAPI 3.1 in CI
  - Every route carries at least one documented error response and a documented size limit
  - Every SSE event type in `aperture-events-v1.md` appears in the schema's enum, and every
    event schema requires `origin`
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: an intentionally malformed schema fails the CI validation step
  - Negative: a schema-conformance test asserts an event object **without** `origin` is rejected
    by the schema, and that `origin` has no default value

  ## EDGE CASES
  - SSE is not naturally expressible in OpenAPI — document the stream endpoint's media type in
    the schema and put the taxonomy in the companion markdown, cross-referenced both ways
  - Attachment upload size limits must be in the contract, not discovered at runtime
  - Long-lived streams behind a buffering proxy — the contract mandates the anti-buffering headers
  - A future target that is neither browser nor native — the transport doc must be extended, not
    reinterpreted; say so

- **Acceptance criteria:**
  - [ ] OpenAPI 3.1 schema covers all route groups plus health/ready/version and validates in CI
  - [ ] Every SSE event and stored message requires an `origin` of `assistant|tool|system|user`,
        and the contract states clients derive attribution from `origin` only, never content
  - [ ] SSE taxonomy documents ordering, monotonic sequence, one-connection semantics, a bounded
        replay window, and the `resync` event
  - [ ] Per-target transport documented: web/PWA `__Host-` cookie + `connect-src 'self'`;
        desktop bearer + configured endpoint; explicit "no CORS headers on `/v1/aperture/*`, ever"
  - [ ] Every error is RFC-9457 problem-details with a stable type URN; versioning policy documented
  - [ ] Pagination, ETag/`If-Match` concurrency, request-size/nesting/array limits, and UTC
        ISO-8601 timestamp convention stated once in `contracts/README.md`
  - [ ] `/v1/aperture/version` returns the contract version only — no build hash, host, or
        upstream component version
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass

---

### APTR-07: Generated TypeScript client SDK with injectable transport and drift detection
- **Priority:** High
- **Labels:** aperture, sdk, web, contract
- **Agent:** codex
- **Estimate:** 5h
- **Blocked by:** APTR-06
- **Description:** Generate a typed TypeScript client from the APTR-06 contract so every UI
  sprint consumes types rather than hand-written fetch calls, and so contract drift is a build
  failure rather than a runtime surprise.

  **Review defect fixed here (D1):** the original criterion "never construct an absolute URL"
  is unsatisfiable for the desktop target, whose webview origin is a custom scheme that does not
  resolve to the fleet. Sprint E would have had to violate a Sprint A criterion to reach the
  backend at all. The criterion is **amended to: no hardcoded absolute URL and no compiled-in
  default endpoint**, and the transport becomes injectable with a base URL.

  ## FILES
  - `client/src/api/generated/` — generated types and operation signatures (checked in)
  - `client/src/api/transport.ts` — the injectable transport (the only `fetch` construction site)
  - `client/src/api/client.ts` — typed operation wrappers over the generated types
  - `client/scripts/gen-api.mjs` — generation script
  - `client/scripts/assert-api-current.mjs` — regenerate-and-diff drift check

  ## APPROACH
  1. Generate types from `contracts/aperture-api-v1.yaml` into a checked-in directory so the
     build never needs network access.
  2. **One injectable transport, not a global constant.** `createTransport({ baseUrl, auth })`
     returns the object every operation takes. `baseUrl` is a **required constructor argument
     with no default**: the web/PWA target passes the empty string (same-origin relative), the
     desktop target passes the operator-configured endpoint read from OS secure storage at
     runtime. There is no compiled-in fallback endpoint and no module-level singleton pointing
     anywhere.
  3. **Auth is per-target and explicit**: `auth: { mode: 'cookie' }` sends credentials
     same-origin and attaches nothing; `auth: { mode: 'bearer', getToken }` attaches a bearer
     from a caller-supplied async getter. A cookie mode with a non-empty `baseUrl` is a
     **construction-time error**, matching D1's rule that a cross-origin cookie is never loosened.
  4. `transport.ts` is the only place a `fetch` is constructed. It normalizes problem-details
     into a typed error and retries only idempotent verbs with jittered, capped backoff.
  5. `assert-api-current.mjs` regenerates into a temp dir and diffs against the checked-in
     output — a mismatch fails CI. This is the contract-drift gate.
  6. The SDK embeds no host, port, token, or model name of any kind.

  ## TEST PLAN
  - `node client/scripts/gen-api.mjs` then `assert-api-current.mjs` — clean, no diff
  - Unit: problem-details response normalizes to the typed error shape
  - Unit: a non-idempotent POST is NOT retried; an idempotent GET is
  - Unit: a transport built with an empty `baseUrl` issues same-origin relative requests; one
    built with an explicit base URL issues absolute requests to exactly that origin
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: constructing a transport with `auth.mode === 'cookie'` **and** a non-empty
    `baseUrl` THROWS
  - Negative: a static gate asserts no absolute-URL string literal and no default `baseUrl`
    value exists anywhere under `client/src/api/`
  - Negative: edit the contract without regenerating; confirm `assert-api-current` FAILS

  ## EDGE CASES
  - A generator version bump silently reformatting output and failing the drift check — pin the
    generator version exactly
  - Retry storm on a 5xx — cap attempts and use jittered backoff
  - A 401 mid-stream must surface as a typed auth error the UI can act on, not a generic failure
  - A caller passing a base URL with a path suffix or trailing slash — normalize once, document it

- **Acceptance criteria:**
  - [ ] Types generated from the contract and checked in; contract drift fails CI
  - [ ] `fetch` is constructed in exactly one file, behind an injectable transport whose
        `baseUrl` is a required argument
  - [ ] **No hardcoded absolute URL and no compiled-in default endpoint** anywhere in the SDK
  - [ ] Cookie auth with a non-empty base URL is a construction-time error
  - [ ] Problem-details normalize to a typed error; retries only on idempotent verbs
  - [ ] No hosts, ports, tokens, or model names in the SDK
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass

---

### APTR-08: Module descriptor registry and capability gating
- **Priority:** High
- **Labels:** aperture, modules, bff, contract
- **Agent:** claude
- **Estimate:** 6h
- **Blocked by:** APTR-05, APTR-06, APTR-07
- **Description:** Implement Module Contract clause 2 mechanically. The BFF exposes
  `GET /v1/aperture/modules` returning a descriptor per module (assistant, Muse, Harmony, and
  any future one) with its capability state; the shell renders a module only when its backend
  capability is actually present, and renders an inert explained tile when it is not.

  **Review defect fixed here:** descriptor revalidation was specified "on the SSE `context`
  channel", but that channel is built in Sprint B, which is blocked by this sprint — making the
  item untestable as written. Sprint A therefore ships a **polling revalidation fallback** as the
  primary mechanism, with the SSE path documented as a Sprint B upgrade that must not change the
  descriptor contract.

  ## FILES
  - `contracts/aperture-modules-v1.md` — descriptor schema, capability-state and revalidation semantics
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
  4. **Revalidation, Sprint A behaviour:** descriptors are cached with a short TTL (named config
     key) and revalidated by **polling on that TTL, plus an immediate revalidate on window
     focus**. A backend coming up mid-session lights the module up without a reload.
  5. **Forward dependency, documented, not assumed:** `aperture-modules-v1.md` states that Sprint B
     adds SSE `context`-channel push revalidation as an *optimization* which replaces the poll
     interval but changes neither the descriptor schema nor the gating semantics. Sprint A's
     tests must pass unchanged after that upgrade. The poll is the durable fallback, kept forever
     for the case where the stream is down.
  6. No module may be hardcoded into the shell's navigation — navigation derives from descriptors.

  ## TEST PLAN
  - Unit: `unavailable` renders the inert tile with the reason and never the children
  - Unit: `degraded` renders children plus banner
  - Unit: navigation derives entirely from descriptors — removing a descriptor removes the nav entry
  - Unit: with a fake timer, a module flipping to `available` upstream is reflected after one poll
    interval with no reload, and immediately on a simulated window focus
  - Integration: kernel unreachable → every module reports `unavailable`, shell still renders
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: a descriptor with an unknown capability state is treated as `unavailable`, not available
  - Negative: no test in this item references an SSE channel, proving the item is testable without Sprint B

  ## EDGE CASES
  - Unknown/forward-compatible capability state from a newer backend — fail closed to `unavailable`
  - A module claiming a route another module already claims — reject the duplicate, log once
  - Descriptor fetch failing entirely — render the shell with all modules inert, never a white screen
  - Poll storm from many tabs — jitter the interval and suppress a poll within the TTL of the last

- **Acceptance criteria:**
  - [ ] `GET /v1/aperture/modules` returns descriptors with capability state and reason
  - [ ] Capability probed through the sanctioned door, never a direct service call
  - [ ] Navigation derives from descriptors; no hardcoded module list in the shell
  - [ ] Unknown capability states fail closed to `unavailable`; kernel unreachable still renders inert tiles
  - [ ] Revalidation works by TTL poll + focus revalidate with **no dependency on Sprint B's stream**,
        and the contract documents the SSE path as a later, schema-preserving optimization
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README updated to document the module descriptor contract

---

### APTR-09: CI workflow — build, test, contract, adherence, and vulnerability gates
- **Priority:** High
- **Labels:** aperture, ci, security
- **Agent:** codex
- **Estimate:** 4h
- **Blocked by:** APTR-01
- **Description:** Per-push CI for the Aperture repo, matching the fleet's CI conventions:
  build + test + audit, running on the off-node non-root runner. Bundle-size and licence gates
  are **APTR-106**; accessibility gates are **APTR-107**.

  ## FILES
  - `.gitea/workflows/ci.yml` — the workflow
  - `ci/README.md` — what each job gates and how to reproduce it locally

  ## APPROACH
  1. Jobs: `client-build` (`npm ci`, `typecheck`, `lint:adherence`, `build`,
     `assert-no-external-hosts`, `assert-api-current`), `client-test` (vitest),
     `contract-validate` (OpenAPI 3.1 validation), `assets-safe` (`assert-svg-safe`),
     `audit` (dependency vulnerability scan, vulnerabilities blocking, unmaintained/yanked as
     warnings), `pii-scan`.
  2. The audit gate **fails closed** on a malformed or missing report — absence is never read
     as zero. Any accepted advisory needs an in-file rationale comment.
  3. Cache `node_modules` by lockfile hash; never cache across lockfile changes.
  4. No secret is echoed, no token appears on a command line, and nothing is printed that could
     leak an internal host.
  5. The workflow must not require network access to a registry the runner cannot reach — pin
     and vendor where necessary.

  ## TEST PLAN
  - Push a branch; confirm all jobs run and pass
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: push a type error; confirm `client-build` FAILS
  - Negative: push a contract edit without regenerating the SDK; confirm the drift job FAILS
  - Negative: feed the audit job a truncated report; confirm it FAILS CLOSED rather than passing

  ## EDGE CASES
  - Runner without a network route to a public registry — document the vendored fallback
  - A vulnerability with no upstream fix — accept-list it with a rationale comment, never a blanket ignore
  - Flaky job masking a real failure — no automatic job-level retries on the gating jobs

- **Acceptance criteria:**
  - [ ] CI runs build, typecheck, adherence, external-host, contract-drift, assets-safe, test,
        audit, and PII jobs
  - [ ] Audit gate fails closed on a malformed or missing report
  - [ ] Accepted advisories carry an in-file rationale
  - [ ] No secrets or internal hosts appear in workflow files or job output
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README updated with a CI status section

---

### APTR-10: Error model, problem-details, and the no-silent-failure rule
- **Priority:** High
- **Labels:** aperture, bff, contract, reliability
- **Agent:** claude
- **Estimate:** 3h
- **Blocked by:** APTR-06
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
     payload-too-large, **conflict**, **precondition-failed**, **contract-version-unsupported**,
     internal. The last three pair with the ETag/`If-Match` concurrency and version-skew
     conventions in APTR-06 and APTR-97.
  2. **Redaction is mandatory**: a problem-details body must never contain an internal host,
     path, token, stack frame, or upstream error string. Map to a class and a stable message;
     the detail goes to the server log with a correlation id the response echoes.
  3. The client maps each URN to a user-facing message and, where applicable, a recovery
     action (re-auth, retry, open settings). User-facing strings come from the APTR-100 catalogue.
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
  - [ ] Stable URN taxonomy documented and implemented on both sides, including conflict,
        precondition-failed, and contract-version-unsupported
  - [ ] No internal host, path, token, or stack frame can reach a response body
  - [ ] Every error carries a correlation id echoed to the client
  - [ ] Zero `unwrap()`/`expect()` on request paths; zero discarding catches
  - [ ] Audit-log arguments sanitized (keys/tokens redacted, >1KB truncated)
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass

---

### APTR-11: Configuration and secrets discipline for the BFF
- **Priority:** High
- **Labels:** aperture, security, bff, secrets
- **Agent:** claude
- **Estimate:** 4h
- **Blocked by:** APTR-05
- **Description:** Establish, and mechanically enforce, that Aperture holds no secrets: all
  configuration flows through the core's config helpers and all secrets through the secret
  manager, materialized at runtime from the vault. Nothing is authored into a file.

  **Review defect fixed here (D7):** "fall back to cached vault values, never hard-fail" named
  no cache location, protection, or staleness bound — an agent could have satisfied it by writing
  plaintext secrets to disk. The cache is now fully specified and disk persistence is a
  tested-negative.

  ## FILES
  - `docs/CONFIGURATION.md` — every config key by name, with defaults and tiers
  - `.env.example` — documented **names only**, no values, with an explicit warning banner
  - **Agent-core repo (sibling PR):** config accessors and the secret cache for the Aperture keys

  ## APPROACH
  1. Enumerate Aperture's config surface by env-var **name**: session TTLs, upload limits,
     stream heartbeat interval, replay-window bounds, module probe TTL, secret-cache TTL, push
     keys. Never a value, never an address.
  2. Secrets (`APERTURE_SESSION_SIGNING_KEY`, the push keypair) are read exclusively via
     `SecretManager::get()`. Any `std::env::var` of a secret-shaped name is a review rejection.
  3. **The vault fallback cache (D7), normative:**
     - **Memory-only.** It is **never written to disk in any form** — no file, no temp file, no
       sqlite, no serialized snapshot, no log line, no core-dump-friendly long-lived buffer.
     - **Zeroize-on-drop.** Cached material is held in a zeroizing wrapper whose `Drop`
       overwrites the bytes; the wrapper's `Debug`/`Display` render a redaction marker only.
     - **Bounded TTL** from a named config key. An entry past its TTL is evicted and treated as
       absent — a stale secret is never served indefinitely to paper over a dead backend.
     - **Cold cache + unreachable backend ⇒ capability `unavailable` with a reason.**
       **Never a generated key, never a default key, never a derived-from-anything key.**
  4. Must work across all three deployment tiers (file / env / interactive key provider).
  5. Secret values must never reach stdout, logs, or an error body — rely on the redacting
     display impl and assert it in a test.

  ## TEST PLAN
  - Works with the file key provider; works with the env key provider
  - Works with the external secret backend unreachable **but the cache warm** — cached value used,
    capability stays `available`
  - Unit: a cache entry past its TTL is evicted and reported as absent, not served
  - Unit: a secret rendered via its display impl prints a redaction marker, not the value
  - Rust test confirms zero `std::env::var` reads of token/key/password/secret-shaped names
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: **cold cache + unreachable backend** ⇒ auth reports `unavailable` with a reason and
    the process does NOT start with a generated or default signing key
  - Negative: run the full secret lifecycle under a filesystem-write watch and assert **zero**
    writes referencing cached secret material anywhere on disk

  ## EDGE CASES
  - Secret rotation mid-session — sessions signed with the previous key must fail closed to
    re-auth, never silently accept
  - `.env.example` drifting from the real key set — a test asserts every documented key exists in code
  - A log line interpolating a config struct that contains a secret — assert the struct's debug
    impl redacts
  - A panic mid-request leaving cached material alive — zeroizing wrapper must run on unwind

- **Acceptance criteria:**
  - [ ] Works with file key provider, env key provider, and interactive key provider
  - [ ] Vault fallback cache is memory-only, zeroize-on-drop, and TTL-bounded; a filesystem-write
        test proves nothing is persisted to disk
  - [ ] Cold cache + unreachable backend ⇒ capability `unavailable` with a reason, **never a
        generated or default key**
  - [ ] Secrets never written to logs, stdout, or error bodies
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
  - Negative: confirm a hand-edit of the baseline file is rejected at review

  ## EDGE CASES
  - The owning-project validator may not yet know `APTR` — if it rejects, report it and file a
    follow-up to add the project to the validator's allowed set. **Do not work around the
    validator by hand-editing the baseline.**
  - A concurrent promote of a different prefix racing on the same file — the tool serializes;
    retry once on conflict

- **Acceptance criteria:**
  - [ ] `APTR` present in the durable baseline registry after the promote PR merges
  - [ ] Promote is idempotent on re-run; registry file was not hand-edited
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass

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
- **Blocked by:** APTR-06, APTR-11, APTR-95
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
    through the vault, health/readiness check (~600 words)
  - Web: build, serve, first-run onboarding, **first-account bootstrap** (cross-reference
    APTR-95's zero-users trust model rather than restating it) (~400 words)
  - Desktop: placeholder sections for Windows and macOS installers, signing notes,
    auto-update — marked clearly as filled in by Sprint E. Include the note that the desktop
    target uses a configured endpoint plus bearer auth, never a cookie (~250 words)
  - Mobile: placeholder for PWA install and push enablement — Sprint F (~200 words)
  - Channel configuration: Matrix (retained), Telegram (optional, off by default), Signal
    (stub, not configurable yet) (~300 words)
  - Verifying the install: what "working" looks like, and the three most common failures (~400 words)
  - **Removing Aperture, and rolling back a bad deploy**: disabling the cargo feature, revoking
    sessions and devices, clearing PWA caches and unregistering the service worker, and the
    rollback path if a deploy is bad. Sovereignty includes a clean exit (~350 words)
  - Troubleshooting (~400 words)

  ## SOURCES
  - `contracts/aperture-api-v1.yaml`, `contracts/aperture-transport-v1.md`
  - `docs/CONFIGURATION.md`, `docs/PIPELINE.md`, `docs/THREAT-MODEL.md`
  - The epic overview's channel policy table

  ## TONE
  Technical reference, direct, no filler, no marketing. Every command copy-pasteable.
  **No internal hostnames, IPs, ports, or personal identifiers** — env var names and
  placeholders only; this file ships publicly. Where a value is fleet-specific, say so
  explicitly rather than inventing a plausible-looking address.

---

## Items added by the 2026-08-01 revision (APTR-95..107)

> Reminder: these numbers are identifiers appended after ranges 15–94 were allocated to
> Sprints B–G. Several are Critical and merge before lower-numbered items. Order comes from
> `Blocked by`, never from the number.

---

### APTR-95: Session, CSRF, and first-account bootstrap semantics in the contract
- **Priority:** Critical
- **Labels:** aperture, contract, security, auth
- **Agent:** claude
- **Estimate:** 4h
- **Blocked by:** APTR-06
- **Description:** D10 item 3. APTR-06 defines an `auth` route group; this item defines the
  security half of it, which is precisely the part Sprint B would otherwise invent. Contract
  work only — no implementation.

  ## FILES
  - `contracts/aperture-auth-v1.md` — session, CSRF, bootstrap, and deep-link semantics
  - `contracts/aperture-api-v1.yaml` — auth route schemas, headers, and error responses
  - `contracts/README.md` — cross-reference from the shared conventions section

  ## APPROACH
  1. **Session cookie (web/PWA target):** `__Host-` prefixed, `HttpOnly`, `Secure`,
     `SameSite=Strict`, path `/`, no `Domain` attribute. State the TTL and refresh key names.
  2. **Session-id rotation on login** (fixation defence) and on privilege change; the old id is
     invalidated server-side, not merely unset on the client.
  3. **CSRF:** every mutating route (POST/PUT/PATCH/DELETE) requires an `Origin` or
     `Sec-Fetch-Site` check that fails **closed** when the header is absent or unrecognized.
     Specify a fail-closed allowlist of accepted values, never a denylist.
  4. **No CORS headers on `/v1/aperture/*`, ever** — restated here with the reason: the desktop
     target is a native HTTP client, not a browser fetch subject to CORS, so CORS is never the
     mechanism that makes desktop work. Loosening it is a defect, not a fix.
  5. **Desktop bearer sessions:** token lifetime, refresh, revocation, and the requirement that
     a bearer session is never accepted from a browser-origin request carrying cookies.
  6. **First-account bootstrap (zero-users state):** define the trust model explicitly — a
     one-time bootstrap token materialized from the secret manager and surfaced only to the
     operator on the server side, single-use, TTL-bounded, invalidated the instant the first
     account exists. **No unauthenticated create-first-user route may ever be reachable once a
     user exists**, and the route must not exist at all in a build with users present.
  7. **Deep-link scheme reservation:** reserve the Aperture custom-scheme deep-link namespace and
     its validation rules now (allowed route shapes, no credential-bearing links, no
     redirect-to-arbitrary-target parameter, unknown paths fail closed) so Sprint E registers
     against a contract instead of minting one.
  8. Device list/revoke semantics: revoking a device invalidates its session server-side
     immediately and is the hook Sprint F's offline purge (D6) fires on.

  ## TEST PLAN
  - Schema validation: every mutating route declares the CSRF-relevant headers and a
    `forbidden` problem-details response
  - A contract-conformance test asserts the auth doc names cookie flags, rotation, fail-closed
    origin checking, bootstrap, and deep-link rules — each as an addressable section
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: a lint over the contract FAILS if any auth route declares a CORS response header,
    or if any cookie definition omits `HttpOnly`, `Secure`, or `SameSite=Strict`
  - Negative: a conformance test asserts the bootstrap route is documented as absent (not merely
    guarded) once a user exists

  ## EDGE CASES
  - A browser that sends neither `Origin` nor `Sec-Fetch-Site` — fail closed; document that this
    is intentional and costs a legacy-browser class we do not support
  - A same-site subdomain — `__Host-` prefix forbids `Domain`, which is the point; do not relax
  - Bootstrap token leaked into a log — it is secret-shaped and must go through the redacting path
  - Clock skew shortening a TTL — specify tolerance rather than leaving it to implementers

- **Acceptance criteria:**
  - [ ] Cookie spec: `__Host-` prefix, `HttpOnly`, `Secure`, `SameSite=Strict`, no `Domain`
  - [ ] Session-id rotation on login and privilege change, with server-side invalidation
  - [ ] Fail-closed `Origin`/`Sec-Fetch-Site` checking on every mutating route
  - [ ] Explicit "no CORS headers on `/v1/aperture/*`, ever" with the reason stated
  - [ ] First-account bootstrap trust model: single-use, TTL-bounded, route absent once a user exists
  - [ ] Deep-link scheme and its fail-closed validation rules reserved in v1
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass

---

### APTR-96: Idempotency keys for message send
- **Priority:** High
- **Labels:** aperture, contract, bff, reliability
- **Agent:** claude
- **Estimate:** 3h
- **Blocked by:** APTR-06
- **Description:** D10 item 4. A network blip during a message POST plus a client retry
  double-sends the user's message. Define an `Idempotency-Key` contract and its server-side
  dedupe semantics now, so every later sprint's send path inherits it.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — `Idempotency-Key` header on message create and other
    non-idempotent mutating routes
  - `contracts/aperture-idempotency-v1.md` — key format, retention, replay, and conflict rules
  - **Agent-core repo (sibling PR):** the dedupe store and middleware

  ## APPROACH
  1. Client generates an opaque, high-entropy key per **logical** send (not per HTTP attempt) and
     replays the same key on retry. Key format and max length are specified.
  2. Server records `(user, route, key) → response` for a bounded retention window (named config
     key). A repeat within the window returns the **original recorded response**, not a new send.
  3. A repeat with the same key but a **different request body** is a hard error
     (`conflict` URN from APTR-10), never a silent overwrite and never a second message.
  4. The dedupe record stores a response **hash and status plus the created resource id**, not
     the message content, so the store is not a second copy of the user's conversation.
  5. An in-flight duplicate (first request still running) returns a retry-after style
     `conflict`, never a second upstream turn.
  6. Extend the same header to attachment create and any future action-invocation route.

  ## TEST PLAN
  - Unit: two POSTs with the same key and body within the window produce one message and two
    identical responses
  - Unit: same key, different body ⇒ `conflict` problem-details
  - Unit: a key replayed after the retention window ⇒ treated as new (documented behaviour)
  - Unit: an in-flight duplicate returns `conflict`, not a second upstream turn
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: a send **without** an `Idempotency-Key` on a route that requires one is rejected
    with `validation-failed`, not silently accepted
  - Negative: assert the dedupe store contains no message body text

  ## EDGE CASES
  - Client regenerating a key on a user-visible retry button — document that a user-initiated
    resend is a **new** logical send and gets a new key
  - Two devices sending concurrently — keys are per-device-generated and never collide by design
  - Store growth — retention is bounded and eviction is tested
  - Key reuse across users — scope the record by user; a cross-user key hit must never replay

- **Acceptance criteria:**
  - [ ] `Idempotency-Key` specified for message create and other non-idempotent mutating routes
  - [ ] Same key + same body within the window replays the recorded response; exactly one message
  - [ ] Same key + different body returns `conflict`; in-flight duplicate returns `conflict`
  - [ ] Dedupe records store no message body content and are retention-bounded
  - [ ] Missing key on a requiring route is rejected, not silently accepted
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass

---

### APTR-97: Contract version header and client version-skew behaviour
- **Priority:** High
- **Labels:** aperture, contract, reliability, web
- **Agent:** codex
- **Estimate:** 3h
- **Blocked by:** APTR-06, APTR-07
- **Description:** D10 item 5 and the review's "no item owns version skew" MISSING finding. A
  cached PWA bundle (Sprint F) and an installed desktop build (Sprint E) will both outlive BFF
  deploys. Define the header and the client's behaviour so skew is a prompt, never silent breakage.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — the response header on every route
  - `contracts/README.md` — the skew policy
  - `client/src/api/transport.ts` — header capture and skew classification
  - `client/src/api/version.ts` — the skew handler and its typed events

  ## APPROACH
  1. Every BFF response carries a contract version header (major.minor of the API contract,
     **not** a build hash, commit, or host — that would be an infrastructure leak).
  2. The generated SDK embeds the contract version it was generated against. The transport
     compares on every response and classifies: **match**, **server-newer-minor** (compatible,
     log once, no user impact), **server-newer-major** or **server-older-major**
     (incompatible), **server-older-minor** (client feature may 404 — degrade that call).
  3. Incompatible skew raises a typed, app-level event exactly once per session. The shell shows
     a **soft-reload prompt** — "a newer version is available, reload to continue" — never a
     forced reload mid-typing, never a silent white screen, and never an infinite reload loop.
  4. On incompatible skew the client **stops issuing new mutating requests** but keeps existing
     UI readable, so an in-flight draft is not destroyed by the upgrade.
  5. Requests that fail purely from skew map to the `contract-version-unsupported` URN (APTR-10),
     which the client renders as the reload prompt rather than a generic error.
  6. Sprint F's service-worker cache-busting keys off this header; state that here so the PWA
     sprint implements against a defined contract instead of inventing one.

  ## TEST PLAN
  - Unit: each skew class is classified correctly from a synthetic header value
  - Unit: an incompatible skew raises the app event exactly once across many responses
  - Unit: on incompatible skew, mutating calls are blocked and read state stays rendered
  - Unit: `contract-version-unsupported` renders the reload prompt, not a generic error
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: a response header containing a build hash or host-shaped value FAILS a contract
    conformance test — the header carries the contract version and nothing else
  - Negative: assert the client never auto-reloads without user action (no reload loop possible)

  ## EDGE CASES
  - A missing version header from an old deploy — treat as unknown and degrade, do not crash
  - A malformed version string — fail closed to "incompatible", never parse-guess
  - Skew detected mid-SSE-stream — surface the prompt, let the stream finish its current turn
  - A user who dismisses the prompt — do not nag; re-raise only on the next session

- **Acceptance criteria:**
  - [ ] Every response carries a contract version header containing the contract version only
  - [ ] SDK embeds its generated-against version and classifies all skew cases
  - [ ] Incompatible skew shows a soft-reload prompt once per session; never a forced or looping reload
  - [ ] Mutating requests are blocked on incompatible skew while existing UI stays readable
  - [ ] `contract-version-unsupported` maps to the reload prompt
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass

---

### APTR-98: Attachment serving isolation
- **Priority:** Critical
- **Labels:** aperture, security, bff, attachments
- **Agent:** claude
- **Estimate:** 4h
- **Blocked by:** APTR-05, APTR-06
- **Description:** D10 item 2. The contract defined attachment **upload** but not **serving** —
  which is where stored XSS lives. An uploaded SVG or HTML file served inline from the app origin
  executes with full session authority. This item kills that before Sprint C exists.

  ## FILES
  - `contracts/aperture-attachments-v1.md` — serving rules, MIME allowlist, isolation model
  - `contracts/aperture-api-v1.yaml` — the serve route, its headers, and error responses
  - **Agent-core repo (sibling PR):** the serve handler, sniffing, and header middleware

  ## APPROACH
  1. **Server-side MIME determination only.** The stored content type is derived by sniffing
     bytes on ingest; the client-supplied `Content-Type` and filename extension are recorded as
     untrusted metadata and never used to choose a response type.
  2. **Explicit allowlist, fail closed.** Only allowlisted types are ever served with their real
     type (common raster images, plain text, PDF as a download). Everything else — including
     anything unrecognized — is served as a generic binary download. Denylists are forbidden.
  3. **SVG and HTML are never served inline, ever.** They are always
     `Content-Disposition: attachment` with a generic binary type. There is no "trusted uploader"
     exception and no query parameter that re-enables inline rendering.
  4. **Per-response isolation headers** on every attachment response:
     `Content-Disposition: attachment` (except for allowlisted inline-safe raster images),
     `Content-Security-Policy: sandbox; default-src 'none'`, `X-Content-Type-Options: nosniff`,
     `Referrer-Policy: no-referrer`, and no caching of authenticated content in shared caches.
  5. Filenames in `Content-Disposition` are sanitized and encoded — no CRLF, no directory
     separators, no unencoded non-ASCII.
  6. Attachment routes are authenticated and authorized per-attachment; an id is not a capability.
     Ids are unguessable, and enumeration returns `not-found`, never `forbidden` (no oracle).
  7. Size and count limits reference the shared limits defined in APTR-06.

  ## TEST PLAN
  - Unit: an uploaded SVG is served as a download with the sandbox CSP, never as `image/svg+xml`
  - Unit: an HTML upload is served as a download, never `text/html`
  - Unit: a file whose declared type disagrees with its sniffed bytes is served per the **sniffed**
    result, and the declared type never influences the response
  - Unit: every attachment response carries the full isolation header set
  - Unit: a filename containing CRLF and path separators is sanitized in `Content-Disposition`
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: an unrecognized/unknown MIME type is served as a generic download, **not** inline
  - Negative: a polyglot file (valid raster header, embedded script payload) is not served inline
    with a script-executable type
  - Negative: requesting another user's attachment id returns `not-found`, never `forbidden`

  ## EDGE CASES
  - A legitimate user-uploaded SVG the user wants to view — the client renders it in a sandboxed
    context it controls, never by trusting an inline response type; document this explicitly
  - Range requests on large media — permitted for allowlisted types, isolation headers unchanged
  - A shared/CDN cache in front of the BFF — `Cache-Control: private, no-store` on authenticated
    attachment responses
  - An empty or zero-byte upload — reject at ingest with `validation-failed`

- **Acceptance criteria:**
  - [ ] MIME is determined by server-side sniffing; client-declared type never selects the response type
  - [ ] Fail-closed allowlist; unknown types are served as generic downloads
  - [ ] SVG and HTML are never served inline under any condition
  - [ ] Every attachment response carries `Content-Disposition`, sandbox CSP, `nosniff`,
        `no-referrer`, and private no-store caching
  - [ ] Filenames sanitized; unguessable ids; cross-user access returns `not-found` with no oracle
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README updated to document the attachment serving model

---

### APTR-99: Runtime CSP and security headers served by the BFF
- **Priority:** Critical
- **Labels:** aperture, security, bff, web
- **Agent:** claude
- **Estimate:** 4h
- **Blocked by:** APTR-05, APTR-06, APTR-95
- **Description:** D10 item 1, and the review's largest MISSING finding. The sprint's only
  clause-6 enforcement was a static grep over the built bundle, which string concatenation
  defeats trivially. This item adds the **runtime** enforcement: the BFF serves a real CSP and a
  full security-header set with the app shell, so egress and script injection are blocked by the
  browser, not by a build-time hope.

  ## FILES
  - `contracts/aperture-headers-v1.md` — the normative header set, per target
  - **Agent-core repo (sibling PR):** the header middleware for shell and API responses
  - `client/src/api/__tests__/headers.test.ts` — client-side conformance assertions
  - `docs/SECURITY-HEADERS.md` — what each header buys and why it is not negotiable

  ## APPROACH
  1. **Web/PWA shell CSP:** `default-src 'none'; script-src 'self'; connect-src 'self';
     img-src 'self' blob: data:; style-src 'self'; font-src 'self'; media-src 'self' blob:;
     form-action 'none'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'`.
     No `unsafe-inline`, no `unsafe-eval`, no wildcard. If a build step needs an inline style or
     script, it uses a per-response nonce — never a blanket relaxation.
  2. **Desktop CSP** is the same policy except `connect-src` lists **exactly** the operator's
     configured endpoint and nothing else (D1). The policy is composed from configuration at
     runtime, never a compiled-in literal.
  3. Additional headers on every response: `X-Content-Type-Options: nosniff`,
     `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`,
     `Cross-Origin-Resource-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`,
     `Permissions-Policy` denying geolocation, camera, microphone, and payment by default.
     `Strict-Transport-Security` is served when the deployment terminates TLS, with the max-age
     as a named config key.
  4. **Report-only is a rollout tool, not a destination.** A report-only mode may exist behind a
     config key for the initial rollout; the enforcing policy is the default and a test asserts
     the shipped default is enforcing.
  5. Per D8, the assertion is over the **configured/served** policy — the response headers the
     BFF emits and the webview policy actually configured — and the doc says so. Do **not**
     specify asserting a webview's *effective* runtime CSP; it is not generally introspectable.
  6. The static bundle grep (APTR-01) is explicitly demoted in the docs to **advisory
     defence-in-depth**; this item is the enforcement of Module Contract clause 6.

  ## TEST PLAN
  - Integration: the app-shell response carries the full header set, and the CSP string matches
    the normative policy byte-for-byte
  - Integration: API responses carry `nosniff`, `no-referrer`, and the CORP/COOP set
  - Unit: the desktop policy composer emits a `connect-src` containing exactly the configured
    endpoint, from configuration, with no compiled-in literal present in the binary
  - Unit: the shipped default is the enforcing policy, not report-only
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: a policy containing `unsafe-inline`, `unsafe-eval`, or a `*` source FAILS a
    conformance test
  - Negative: with no endpoint configured, the desktop policy composer errors rather than
    emitting a permissive `connect-src`

  ## EDGE CASES
  - A dependency injecting an inline style at runtime — nonce it or fix the dependency; never relax
  - COEP `require-corp` breaking a legitimate same-origin blob — test blob media loads explicitly
  - A deployment terminating TLS upstream — HSTS emission must be configurable, not assumed
  - Report-only left enabled in a deploy — a startup log warns loudly and a test asserts the default

- **Acceptance criteria:**
  - [ ] BFF serves the normative CSP with the app shell; no `unsafe-inline`, `unsafe-eval`, or wildcard
  - [ ] Desktop `connect-src` is composed from configuration and contains exactly the configured
        endpoint; no compiled-in endpoint literal exists
  - [ ] Full header set served: nosniff, no-referrer, COOP/CORP/COEP, Permissions-Policy, HSTS-when-TLS
  - [ ] Shipped default is enforcing, not report-only
  - [ ] Assertions target the configured/served policy, and the docs state that explicitly
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README updated to document the runtime security-header model

---

### APTR-100: Loading, empty, error, and progress primitives with a centralized string catalogue
- **Priority:** High
- **Labels:** aperture, design-system, web, a11y
- **Agent:** claude
- **Estimate:** 6h
- **Blocked by:** APTR-02
- **Description:** D10 item 7, plus the review's "no skeleton/spinner/empty-state vocabulary"
  MISSING finding and the message-catalogue enhancement. Every later sprint needs these on day
  one; retrofitting inline strings across seven sprints is a rewrite.

  ## FILES
  - `client/src/components/state/` — `Skeleton`, `Spinner`, `EmptyState`, `ErrorState`,
    `ProgressBar`, `InlineNotice`, and a top-level `ErrorBoundary`
  - `client/src/styles/state.css` — the state-primitive token usage
  - `client/src/strings/catalogue.ts` — typed string catalogue (English-only)
  - `client/src/strings/index.ts` — the typed lookup with compile-time key checking
  - `client/scripts/assert-no-bare-strings.mjs` — the enforcement script

  ## APPROACH
  1. **Skeleton** mirrors the shape of the content it replaces (no generic grey box), respects
     `prefers-reduced-motion` by dropping the shimmer, and is `aria-hidden` with a polite live
     region announcing loading state once.
  2. **Spinner** is only for indeterminate waits under a threshold; over it, use `Skeleton`.
     Document the threshold so sprints do not each invent one.
  3. **EmptyState** takes a title, an explanation, and an optional primary action — never a bare
     "No data". **ErrorState** takes a typed APTR-10 error and renders its message plus its
     recovery action.
  4. **ErrorBoundary** is a typed top-level React boundary rendering an `ErrorState` fallback and
     reporting through the APTR-10 correlation-id pipeline — never a blank screen on a render throw.
  5. **InlineNotice** is the single render-only notification primitive. It is documented as
     **render-only**: it is not a tray, not a queue, and not a second notification channel. Any
     notification that reaches the user out-of-band goes through the assistant's existing
     prioritized presence budget (Soul Contract clause 2), and this item says so in the README so
     nobody builds a parallel surface around it.
  6. **String catalogue:** all user-facing strings are typed keys in one module. Establish the
     pattern now even English-only; the lookup is typed so a missing key is a compile error.
  7. `assert-no-bare-strings.mjs` fails on user-facing literal text in `.tsx` outside the
     catalogue, with a documented allowlist for non-user-facing strings (test ids, tokens).

  ## TEST PLAN
  - Render tests for every primitive in both themes
  - Unit: `Skeleton` drops the shimmer under `prefers-reduced-motion`
  - Unit: `ErrorBoundary` catches a thrown render and shows the fallback with the correlation id
  - Unit: `ErrorState` renders the recovery action for a typed APTR-10 error
  - Unit: a missing catalogue key fails typecheck
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: add a bare user-facing string literal to a component; `assert-no-bare-strings` FAILS
  - Negative: assert `InlineNotice` exposes no queue, no persistence, and no global mount point —
    a test asserts there is no module-level notification store

  ## EDGE CASES
  - A skeleton that never resolves because the request silently failed — a timeout flips it to
    `ErrorState`, never an indefinite shimmer
  - A string containing user content — interpolation is parameterized, never concatenated markup
  - Screen-reader chatter from repeated live-region updates — announce transitions, not every tick
  - `ErrorBoundary` itself throwing — the fallback uses no dynamic data beyond the correlation id

- **Acceptance criteria:**
  - [ ] Skeleton, Spinner, EmptyState, ErrorState, ProgressBar, InlineNotice, and ErrorBoundary
        shipped as typed components with render tests in both themes
  - [ ] `prefers-reduced-motion` honoured; loading state announced once, not continuously
  - [ ] ErrorBoundary renders a design-system fallback with a correlation id, never a blank screen
  - [ ] All user-facing strings resolve through the typed catalogue; a missing key fails typecheck
  - [ ] `assert-no-bare-strings` fails on user-facing literals outside the catalogue
  - [ ] InlineNotice is render-only with no queue or global store; presence budget documented
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README updated to document the state primitives and the string catalogue rule

---

### APTR-101: Command registry and Cmd/Ctrl-K palette as a foundation capability
- **Priority:** High
- **Labels:** aperture, web, ux, a11y
- **Agent:** claude
- **Estimate:** 6h
- **Blocked by:** APTR-02, APTR-08, APTR-100
- **Description:** D10 item 6. This has to be architectural to work: if it is not a foundation
  capability, Sprints C–F hardcode their own menus and Sprint G retrofits a palette over surfaces
  that cannot register into it. Every later sprint registers threads, module actions, and settings
  into **one** surface.

  ## FILES
  - `client/src/commands/registry.ts` — `registerCommand`, `unregisterCommand`, subscription
  - `client/src/commands/types.ts` — the `Command` type and scope model
  - `client/src/commands/Palette.tsx` — the `Cmd/Ctrl-K` palette
  - `client/src/commands/match.ts` — deterministic fuzzy matching and ranking
  - `docs/COMMANDS.md` — how a sprint registers commands and the naming conventions

  ## APPROACH
  1. `registerCommand({ id, title, keywords, group, scope, when, handler })` returns a disposer.
     Ids are namespaced by module (`<module>.<action>`); a duplicate id is a **hard error at
     registration**, not a silent overwrite.
  2. Commands are **capability-aware**: a command whose owning module descriptor (APTR-08) is not
     `available` is filtered out of the palette rather than shown and failing. `when` predicates
     handle finer context gating.
  3. **Assistant-operable parity:** the registry entry carries the tool name the assistant invokes
     for the same action, and `docs/COMMANDS.md` states that a user-facing module action must be
     registered here **and** invocable by the assistant as a tool — a command with no assistant
     path is a documented, deliberate exception, not an oversight.
  4. Matching is deterministic and testable: exact-prefix, then subsequence, then keyword, with a
     stable tiebreak. No opaque scoring that cannot be asserted.
  5. Full keyboard and screen-reader support: `Cmd/Ctrl-K` opens, arrows navigate, Enter runs,
     Escape closes with focus restored to the invoking element, results announced via a live
     region, and a documented combobox/listbox ARIA pattern.
  6. All palette strings come from the APTR-100 catalogue; all visuals from APTR-02 primitives.
  7. The palette holds no state of its own beyond query and selection — it is a view over the
     registry.

  ## TEST PLAN
  - Unit: register, list, and dispose; disposal removes the command
  - Unit: duplicate id registration throws
  - Unit: a command from an `unavailable` module is not offered
  - Unit: matching order is deterministic across a fixed fixture set
  - Unit: keyboard flow — open, navigate, run, escape restores focus
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: a command handler that throws surfaces an `ErrorState`, does not close silently, and
    does not leave the palette in a stuck open state
  - Negative: assert no module hardcodes a menu entry bypassing the registry (static check over
    the shell's navigation and action surfaces)

  ## EDGE CASES
  - A module registering commands then going `unavailable` mid-session — filtered live, no reload
  - Two modules wanting the same shortcut — the registry owns shortcut assignment; conflicts are
    a registration error
  - Very large command sets — matching is bounded and results are capped with a stable cutoff
  - A platform where `Cmd/Ctrl-K` is taken by the browser — document the alternate binding

- **Acceptance criteria:**
  - [ ] `registerCommand` with namespaced ids; duplicate registration is a hard error
  - [ ] Palette opens on `Cmd/Ctrl-K` with full keyboard + screen-reader support and focus restore
  - [ ] Commands from unavailable modules are filtered out, live, without a reload
  - [ ] Matching is deterministic and asserted against a fixture set
  - [ ] Registry entries carry the assistant tool name; `docs/COMMANDS.md` states the parity rule
  - [ ] Shell navigation and actions route through the registry; no bypassing hardcoded menus
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README updated to document the command registry as the single action surface

---

### APTR-102: Typed SSE stream client in the SDK
- **Priority:** High
- **Labels:** aperture, sdk, web, contract
- **Agent:** codex
- **Estimate:** 4h
- **Blocked by:** APTR-06, APTR-07
- **Description:** Review enhancement 4 (P1). Without one wrapper, Sprints B–D each hand-roll
  `EventSource` handling, resume, and heartbeat detection — three divergent implementations of the
  hardest client code in the project. Ship it once, generated from the contract.

  ## FILES
  - `client/src/api/events.ts` — the discriminated-union event type, generated from the contract enum
  - `client/src/api/stream.ts` — the `ApertureStream` wrapper
  - `client/scripts/gen-api.mjs` — extended to emit the event union
  - `client/src/api/__tests__/stream.test.ts`

  ## APPROACH
  1. Generate a **discriminated union** of every SSE event from the APTR-06 enum, discriminated on
     event type, with `origin` as a required field on every variant (D9). An event missing `origin`
     fails to typecheck and is rejected at runtime.
  2. `ApertureStream` handles: connection over the injectable transport (APTR-07), `Last-Event-ID`
     resume, monotonic sequence tracking, heartbeat-timeout detection, and jittered capped backoff.
  3. **`resync` is a first-class outcome**, not an error: on `resync` the wrapper surfaces a typed
     signal telling the consumer to refetch thread state via REST, and does not attempt an
     unbounded replay (D3).
  4. Per D3, **a stream is one connection**; the wrapper demultiplexes by `thread_id` and message
     id and exposes per-thread subscriptions over the single connection. It never opens a second
     connection per thread.
  5. Per D9, the wrapper **must not** coalesce a `tool.result` into an assistant token buffer. Token
     accumulation is keyed by `origin === 'assistant'` and message id only. This is a hard
     invariant with a negative test, not a convention.
  6. Unknown event types are ignored forward-compatibly and counted, never thrown on.
  7. The wrapper is transport-agnostic: it takes the transport, never constructs a URL itself.

  ## TEST PLAN
  - Unit: a synthetic stream of every event type parses into the correct union variant
  - Unit: `Last-Event-ID` is sent on reconnect and resume continues the sequence
  - Unit: a missed heartbeat past the threshold triggers reconnect with backoff, not a hang
  - Unit: `resync` surfaces the refetch signal and no replay is attempted
  - Unit: two thread subscriptions share one connection
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative (D9): a `tool.result` whose payload contains SSE-frame-shaped and assistant-event-shaped
    JSON stays inert data, is delivered as a tool result, and **never** enters the assistant token
    buffer or renders as assistant text
  - Negative: an event object without `origin` is rejected at runtime and fails typecheck

  ## EDGE CASES
  - Out-of-order or duplicate sequence numbers — detect and surface, never silently reorder
  - A stream that connects but never emits — heartbeat timeout must still fire
  - Backoff storm across many tabs — jitter, and cap total attempts before surfacing a typed error
  - A very large single event exceeding the contract's size limit — reject and surface, do not buffer

- **Acceptance criteria:**
  - [ ] Event union generated from the contract; `origin` required on every variant
  - [ ] One wrapper handles resume, sequence tracking, heartbeat timeout, and jittered backoff
  - [ ] `resync` surfaces a typed refetch signal; no unbounded replay is attempted
  - [ ] One connection multiplexes all thread subscriptions
  - [ ] A `tool.result` can never enter the assistant token buffer, whatever bytes it carries
  - [ ] Unknown event types are ignored forward-compatibly, never thrown on
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass

---

### APTR-103: Threat model document for the Aperture surface
- **Priority:** Medium
- **Labels:** aperture, docs, security
- **Agent:** gemini
- **Estimate:** 3h
- **Blocked by:** APTR-06, APTR-95, APTR-98, APTR-99
- **Type:** documentation
- **Description:** Review MISSING finding and enhancement 17. A short STRIDE pass over the BFF
  surface written **now**, so Sprint G's security review verifies against a baseline instead of
  inventing one at the end and so every sprint knows which threats its item owns.

  ## AUDIENCE
  The implementing agents of Sprints B–G, and the Sprint G security reviewer. Assumed competent
  in web security; not assumed familiar with this codebase.

  ## OUTLINE
  - Scope, trust boundaries, and explicit non-goals (~250 words)
  - Assets worth protecting: conversation content, session material, vault-backed secrets,
    attachments, device registrations (~250 words)
  - Trust boundaries diagram-in-prose: browser ↔ BFF, BFF ↔ sanctioned door, desktop ↔ BFF,
    and the tool-output boundary that motivates the `origin` discriminator (~300 words)
  - STRIDE pass per surface — auth/session, stream, attachments, events/context bus, settings
    and admin. For each: the threat, the control, and the item that owns the control by APTR id
    (~1000 words, table-heavy)
  - Prompt-injection containment: why tool output is untrusted data, how `origin` and the
    no-coalescing invariant contain it, and what is explicitly **not** solved (~300 words)
  - Residual risk and deliberate acceptances, each with a reason (~250 words)
  - How to update this document when a sprint adds a surface (~150 words)

  ## SOURCES
  - `contracts/aperture-api-v1.yaml`, `aperture-auth-v1.md`, `aperture-attachments-v1.md`,
    `aperture-headers-v1.md`, `aperture-events-v1.md`, `aperture-errors-v1.md`
  - `specs/S128-DECISIONS.md` (D1, D5, D7, D9)
  - The epic's sovereignty and channel-policy sections

  ## TONE
  Terse, tabular, engineering-facing. Every threat names the control **and** the owning APTR item —
  a threat with no owning item is listed under residual risk, never left implied. **No internal
  hostnames, IPs, ports, or personal identifiers**; this ships to the public mirror. Describe
  topology in role terms ("the configured backend endpoint"), never as an address.

---

### APTR-104: End-to-end test scaffold and dev component gallery
- **Priority:** Medium
- **Labels:** aperture, ci, testing, web
- **Agent:** codex
- **Estimate:** 5h
- **Blocked by:** APTR-01, APTR-02, APTR-100
- **Description:** Review MISSING finding, plus enhancement 15. E2E tooling appears only in
  Sprint G; standing the harness up in A lets Sprints C–F ship e2e tests **with** their features
  instead of retroactively. Ships the harness and a smoke test, not a suite.

  ## FILES
  - `e2e/` — harness config, fixtures, and the smoke specs
  - `e2e/README.md` — how to run locally and in CI, and what belongs here vs a unit test
  - `client/src/dev/Gallery.tsx` — the component gallery route
  - `client/vite.config.ts` — dev-only route inclusion
  - `.gitea/workflows/ci.yml` — the e2e job

  ## APPROACH
  1. Use a self-hosted browser-automation harness with its browser dependency **pinned and
     vendored** — no runtime download from a public CDN, matching Module Contract clause 6.
  2. Ship exactly three smoke specs: app shell renders, theme toggle works in both directions,
     and an unauthenticated route redirects to the auth surface. Later sprints add their own.
  3. **Dev gallery** at a `/dev/gallery` route rendering every primitive from APTR-02 and
     APTR-100 in both themes. It is **stripped from production builds** at build time — not
     merely route-guarded — and a test asserts the string does not appear in a production bundle.
  4. The e2e job runs against a locally served production build with a stubbed BFF; it never
     depends on a live fleet service, and it hardcodes no endpoint (the transport's base URL is
     injected by the fixture).
  5. Fixtures for auth state and stubbed SSE live here so every later sprint reuses one set.
  6. **Deliberate scope limit:** pixel-diff visual regression is *not* enabled in this sprint —
     the runner cannot be assumed to produce stable rendering, and an unstable baseline is worse
     than none. The gallery and harness make it a config change when Sprint G establishes a
     stable baseline; `e2e/README.md` records this explicitly.

  ## TEST PLAN
  - `npm --prefix client run e2e` passes locally against a served production build
  - The e2e CI job runs and passes on a branch push
  - Unit: a production build contains no gallery route string
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: break the theme toggle and confirm the e2e smoke spec FAILS; revert
  - Negative: confirm the harness FAILS fast with a clear message when its vendored browser is
    missing, rather than attempting a network download

  ## EDGE CASES
  - A runner without a display — use headless mode and document the required system packages
  - Flake from timing — use explicit awaited conditions, never fixed sleeps; no job-level retries
  - The stub BFF drifting from the contract — the stub is generated from the contract schema
  - Gallery growing into a second design surface — it renders existing primitives only, never new ones

- **Acceptance criteria:**
  - [ ] E2E harness runs locally and in CI with a pinned, vendored browser and no runtime download
  - [ ] Three smoke specs pass; reusable auth and stubbed-SSE fixtures are provided
  - [ ] Dev gallery renders every primitive in both themes and is stripped from production builds
  - [ ] The harness injects its base URL; no endpoint is hardcoded anywhere in `e2e/`
  - [ ] Visual-regression deferral is recorded with its reason in `e2e/README.md`
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass

---

### APTR-105: Repo governance files — LICENSE, SECURITY.md, CONTRIBUTING.md, CODEOWNERS
- **Priority:** Medium
- **Labels:** aperture, docs, governance, mirror
- **Agent:** claude
- **Estimate:** 2h
- **Description:** Review MISSING finding and enhancement 19. This repo ships to a public mirror
  **in this very sprint** (APTR-13) with no licence, no vulnerability reporting path, and no
  contribution guidance. That is a governance gap on a public artefact, not a nicety.

  ## FILES
  - `LICENSE` — the project licence text
  - `SECURITY.md` — supported versions and the vulnerability reporting path
  - `CONTRIBUTING.md` — how to contribute, and the constraints that are non-negotiable
  - `CODEOWNERS` — review ownership by path
  - `client/package.json` — `license` field matching `LICENSE`

  ## APPROACH
  1. `LICENSE` matches the licence the sibling constellation repos ship. The `license` field in
     the client manifest must match it exactly; a mismatch is checked, not assumed.
  2. `SECURITY.md` states supported versions and a **reporting channel by role, not by address** —
     no operator email, no internal tracker URL. Describe the contact mechanism generically and
     let the mirror's own reporting facility carry it. State the disclosure expectation and the
     acknowledgement window.
  3. `CONTRIBUTING.md` covers: the design-system adherence rules (APTR-02), the string catalogue
     rule (APTR-100), the contract-first rule (changes to `contracts/` precede code), the
     no-vendoring rule, the no-runtime-external-fetch rule, and the fact that the pipeline gates
     are not bypassable. Reference the item ids so a contributor can find the rationale.
  4. `CODEOWNERS` assigns review ownership by path — contracts, client, e2e, assets, CI — using
     the forge's team/role identifiers only. **No personal names or emails.**
  5. Every one of these files ships publicly: PII-scan all of them in CI.

  ## TEST PLAN
  - CI PII scan over all four files returns zero findings
  - A test asserts the `license` field in the client manifest equals the `LICENSE` identifier
  - `CODEOWNERS` parses and every referenced path pattern matches at least one real path
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: insert an operator email into `SECURITY.md` and confirm the PII scan FLAGS it; revert
  - Negative: change the manifest `license` field and confirm the consistency test FAILS; revert

  ## EDGE CASES
  - A `CODEOWNERS` pattern matching nothing — a stale rule silently disables review; the test
    catches it
  - `SECURITY.md` naming a reporting address that would leak infrastructure — role-based only
  - Licence text with a copyright line containing a personal name — use the project/org name

- **Acceptance criteria:**
  - [ ] `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, and `CODEOWNERS` present and mirror-clean
  - [ ] Manifest `license` field matches `LICENSE`, asserted by a test
  - [ ] `SECURITY.md` gives a role-based reporting path with no address, email, or internal URL
  - [ ] `CONTRIBUTING.md` documents adherence, string-catalogue, contract-first, no-vendoring,
        and no-external-fetch rules with item references
  - [ ] `CODEOWNERS` patterns all match real paths and name no individuals
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass

---

### APTR-106: Bundle-size budget and licence-compliance CI gates
- **Priority:** Medium
- **Labels:** aperture, ci, performance, licensing
- **Agent:** codex
- **Estimate:** 3h
- **Blocked by:** APTR-01, APTR-09
- **Description:** Review enhancements 18, 20, and 23. PWA and mobile performance die by a
  thousand cuts, and Sprint G is too late to establish a baseline. A dependency with an
  incompatible licence is vendoring with extra steps — the mechanical twin of the no-vendoring rule.

  ## FILES
  - `client/scripts/assert-bundle-budget.mjs` — per-entry-chunk byte budgets
  - `client/bundle-budget.json` — the budgets, with a rationale per entry
  - `client/scripts/assert-licences.mjs` — dependency licence allowlist gate
  - `client/licence-allowlist.json` — permitted SPDX identifiers, with rationale
  - `.gitea/workflows/ci.yml` — both jobs plus per-branch concurrency cancellation

  ## APPROACH
  1. Budgets are **per entry chunk**, measured on the compressed artefact, checked into the repo,
     and enforced on every push. Exceeding a budget fails the build; raising a budget is a
     reviewed diff with a written reason, never a silent bump.
  2. Establish the baseline from the first clean build in this sprint and record the date — a
     budget with no recorded origin is a number nobody will defend later.
  3. The licence gate walks the resolved dependency tree, maps each package to an SPDX identifier,
     and **fails closed**: an unknown, missing, or unparseable licence is a failure, never a pass.
     Denylists are forbidden; the allowlist is the mechanism.
  4. Per-package exceptions require an in-file rationale field; a blanket ignore is rejected.
  5. Add per-branch CI concurrency cancellation so a superseded push cancels its predecessor,
     keeping the no-retry policy on gating jobs affordable. Cancellation must never mark a
     gating job as passed.

  ## TEST PLAN
  - Both jobs run and pass on a clean branch
  - Unit: the budget script reports the actual measured size alongside the budget on failure
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: add a large dummy dependency to an entry chunk and confirm the budget job FAILS; revert
  - Negative: feed the licence gate a package with an unknown/absent licence and confirm it FAILS
    CLOSED rather than passing
  - Negative: confirm a cancelled superseded run is not recorded as a passing gate

  ## EDGE CASES
  - Compression variance between environments — pin the compression settings used for measurement
  - A dual-licensed package — record which licence is being relied on, in the rationale
  - A package with a licence file but no SPDX metadata — fails closed; add it explicitly with a reason
  - A legitimate large one-off (a bundled font) — give it its own budgeted chunk rather than
    inflating the app chunk

- **Acceptance criteria:**
  - [ ] Per-entry-chunk byte budgets enforced in CI; exceeding a budget fails the build
  - [ ] Budgets carry a rationale and a recorded baseline date
  - [ ] Licence gate fails closed on unknown, missing, or unparseable licences; allowlist-only
  - [ ] Per-package licence exceptions carry an in-file rationale; no blanket ignores
  - [ ] Per-branch CI concurrency cancellation active; a cancelled run never counts as a pass
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass

---

### APTR-107: Automated accessibility gates — contrast, reduced motion, forced colors
- **Priority:** Medium
- **Labels:** aperture, a11y, ci, design-system
- **Agent:** codex
- **Estimate:** 3h
- **Blocked by:** APTR-02, APTR-100
- **Description:** Review enhancement 14. APTR-02 *describes* a 4.5:1 contrast requirement but
  mechanizes nothing, so nothing catches a broken dark theme. Accessibility is far cheaper to
  gate now than to retrofit in Sprint G.

  ## FILES
  - `client/scripts/assert-contrast.mjs` — parses the token layer and computes contrast
  - `client/contrast-pairs.json` — the declared foreground/background token pairs to check
  - `client/scripts/assert-motion-tokens.mjs` — reduced-motion and forced-colors assertions
  - `.gitea/workflows/ci.yml` — the a11y job

  ## APPROACH
  1. `assert-contrast.mjs` parses `constellation.css`, resolves token values in **both** themes,
     and computes the WCAG contrast ratio for every declared pair in `contrast-pairs.json`.
     Body text and interactive text require ≥ 4.5:1; large text and non-text UI boundaries
     require ≥ 3:1, with the threshold declared per pair.
  2. **A pair not present in the declaration file is a failure, not a skip** — otherwise a new
     token silently escapes the gate. The script cross-checks that every foreground token in the
     layer appears in at least one declared pair.
  3. `assert-motion-tokens.mjs` asserts a `prefers-reduced-motion: reduce` block exists and that
     every animation/transition token is neutralized inside it, and that a `forced-colors: active`
     block exists and does not re-assert token colors over system colors.
  4. Failures print the pair, both theme values, the computed ratio, and the required threshold —
     an a11y gate nobody can act on gets disabled.
  5. Run as its own CI job so an a11y failure is legible in the job list rather than buried.

  ## TEST PLAN
  - The a11y job passes on the clean tree in both themes
  - Unit: the contrast calculator matches known reference values for a fixture set of colour pairs
  - Unit: a token defined only in one theme is reported, not silently skipped
  - Verify no hardcoded infrastructure values in new/modified files
  - Negative: darken a foreground token below threshold in the dark theme only and confirm the
    job FAILS naming that pair and theme; revert
  - Negative: add a new foreground token without a declared pair and confirm the job FAILS

  ## EDGE CASES
  - A token defined via another token — resolve references transitively, and fail on a cycle
  - Semi-transparent tokens — composite against the declared background before computing
  - A pair that is legitimately decorative — declare it with the non-text 3:1 threshold and a
    rationale, never exclude it
  - `forced-colors` tests requiring a real browser — assert the declared CSS, per D8, and say so

- **Acceptance criteria:**
  - [ ] Contrast computed for every declared pair in both themes and gated in CI
  - [ ] An undeclared foreground token fails the gate; nothing is silently skipped
  - [ ] Reduced-motion and forced-colors blocks asserted present and correct
  - [ ] Failure output names the pair, theme, computed ratio, and threshold
  - [ ] Calculator validated against a reference fixture set
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
