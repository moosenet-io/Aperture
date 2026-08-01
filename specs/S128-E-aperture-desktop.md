# Aperture Sprint E — Desktop: Windows and macOS
plane_project: APTR
module: Aperture
prefix: APTR
spec_id: S128-aperture-client

## Metadata
- **Author:** Operator (Moose)
- **Session:** S128
- **Date:** 2026-08-01
- **Module version:** Aperture v0.1.0
- **Estimated total:** 124h (exact sum of the 22 item estimates below, per D12:
  7+5+8+7+8+6+5+5+8+8+8+1 = 76h for APTR-61..72, plus 7+6+5+4+4+5+4+3+5+5 = 48h for APTR-180..189)
- **North-Star layer:** shell — desktop target of the single Aperture client. Gate 2 is
  justified once, in `specs/S128-aperture-epic.md`; this sprint inherits it and adds no new
  shell surface, only a new *packaging* of the surface Sprint C already built.
- **Module-Contract:** clause 1 (Terminus-fronted — the desktop process's only network peer is
  the Aperture BFF, and the BFF's only door is `terminus-client`), clause 2 (capability gating
  survives packaging — an unreachable backend yields inert explained tiles, never a white
  window), clause 5 (no forked UI: desktop hosts the *same* React bundle, no second design
  language), clause 6 (sovereign — zero telemetry, zero external CDN/font/asset fetch, and the
  update feed itself is served by the user's own backend, not a vendor endpoint).
- **Assistant-Layer Soul Contract:** clause 2 is the binding constraint of this sprint.
  Desktop gets native notifications, a tray, and a dock/taskbar presence — every one of which
  is a **transport for the assistant's existing prioritized presence budget**, honoring quiet
  hours and opt-out. Aperture desktop ships **no independent notification tray** and no code
  path that can raise an OS notification without a budgeted `presence` event upstream.
  Clause 4 (continuity) is load-bearing here too: installing, re-installing, re-pointing at a
  different endpoint, or auto-updating the desktop app MUST NOT reset assistant memory,
  personality traits, or relationship lore. Items that touch session or identity carry an
  explicit continuity negative test.
- **Context:** The desktop client is a **core deliverable of this build, not an afterthought**.
  It is how the operator and any other user actually live with Lumina all day: always
  available, native to the OS, launchable from a deep link, resident in the tray, and able to
  say something useful when the backend is down. The fleet is Rust-first, so the shell is
  **Tauri v2** — it reuses the platform webview instead of shipping a browser runtime (small
  signed artifacts, fast cold start, an update payload measured in megabytes rather than
  hundreds), and its host process is Rust, matching the toolchain, review culture, and
  supply-chain gates the rest of the constellation already runs. The rule that makes this
  sprint tractable is **one codebase, no forked UI**: everything under `client/src` is shared
  byte-for-byte with web, and every platform difference lives behind the single abstraction
  authored in APTR-62. The rule that makes it safe is **no hardcoded server address, ever** —
  the desktop app is a client to a MooseNet backend the *user* configures at first run, and
  ships knowing nothing about any particular deployment.

## Pre-flight
- **Item numbers are IDENTIFIERS, NOT AN ORDERING.** Sprint E owns `APTR-61..72`; the items added
  by the S128 decision round are numbered `APTR-180..189` because `APTR-95..179` are being
  consumed concurrently by other sprints. A higher number does **not** mean later work — several
  `APTR-18x` items are foundational and block `APTR-61..72` items. **Required merge order is
  expressed only by `- **Blocked by:**`**, never by numeric sequence. Existing items are never
  renumbered; do not "tidy" the range.
- **Binding decisions:** `specs/S128-DECISIONS.md` is authoritative over this file. The ones that
  reshape this sprint are **D1** (desktop transport topology — settled below and in APTR-64/65),
  **D8** (a gate must be implementable in the language whose property it asserts),
  **D10 item 13** (private-CA / certificate pinning becomes a real item — APTR-180), and
  **D12** (the header estimate equals the exact sum of item estimates).
- **D1 — desktop transport topology, decided here, not by the implementing agent.** The desktop
  base URL is the operator-configured endpoint stored in OS secure storage. Auth is a **bearer
  token**, never a cookie: a cross-origin cookie cannot be `SameSite=Strict`, and the cookie flags
  must **not** be loosened to make one work. The CSP `connect-src` contains **exactly** the
  configured endpoint and nothing else. **No CORS headers are ever served on the Aperture API** —
  the desktop reaches it as a native HTTP client, not as a browser `fetch` subject to CORS, so
  there is nothing for CORS to permit. Nobody may "fix" a desktop connectivity problem by adding
  CORS headers; a request that needs CORS is a request coming from the wrong place. There is no
  PR-body escape hatch from any part of this paragraph.
- **Linux desktop is explicitly OUT OF SCOPE for Sprint E**, with a stated reason: this sprint's
  fail-closed release discipline is built on per-OS signing hosts (Authenticode, Developer ID +
  notarization) and there is no equivalent third packaging host, signing identity, or update-apply
  story provisioned in APTR-72. Shipping an unsigned third target would contradict APTR-69/70's
  fail-closed rule. **This is a packaging decision, not an architectural one:** APTR-62's platform
  abstraction MUST NOT bake in a two-OS assumption — no `Windows | macOS` union type, no boolean
  `is_macos` branch in shared code, and tray/menu semantics expressed as runtime capabilities
  rather than a closed OS enum, so a Linux implementation is a third implementation of a known
  interface rather than a rewrite. APTR-62 carries the negative test for this.
- Sprint dependency: **Sprint C blocks Sprint E** (the desktop shell wraps the web chat surface
  Sprint C builds). Sprint A's contract (`contracts/aperture-api-v1.yaml`) and Sprint B's
  session/auth model are prerequisites and are assumed merged.
- Repository: the Aperture repo on the internal forge; public mirror opted in (Sprint A)
- Dependencies: `node` ≥ 20, `rustup` + pinned toolchain, Tauri v2 CLI, and per-host toolchains
  — Windows packaging needs a Windows build host with the MSVC toolchain, WiX, and NSIS;
  macOS packaging needs a macOS build host with Xcode command-line tools. Cross-signing and
  notarization cannot be faked from another OS; the release workflow must run each target on
  its own host.
- Vault secrets required (**names only** — values live in the secret store and are provisioned
  by the operator in APTR-72):
  `APERTURE_WINDOWS_CODESIGN_CERT`, `APERTURE_WINDOWS_CODESIGN_CERT_PASSWORD`,
  `APERTURE_WINDOWS_TIMESTAMP_URL`, `APERTURE_MACOS_CODESIGN_CERT`,
  `APERTURE_MACOS_CODESIGN_CERT_PASSWORD`, `APERTURE_MACOS_CODESIGN_IDENTITY`,
  `APERTURE_APPLE_TEAM_ID`, `APERTURE_APPLE_NOTARY_ISSUER_ID`, `APERTURE_APPLE_NOTARY_KEY_ID`,
  `APERTURE_APPLE_NOTARY_PRIVATE_KEY`, `APERTURE_UPDATE_SIGNING_PRIVATE_KEY`
- Build-config keys (names only, no values in the repo): `APERTURE_BUNDLE_IDENTIFIER`,
  `APERTURE_UPDATE_PUBLIC_KEY`, `APERTURE_DESKTOP_KEYCHAIN_SERVICE`,
  `APERTURE_DEEP_LINK_SCHEME`
- Infrastructure: internal forge reachable, Plane reachable, Terminus door reachable, a
  Windows packaging host and a macOS packaging host reachable by the release workflow
- Baseline tests: the Sprint A–D suite, green
- Baseline verify: the Sprint C web surface builds and serves; desktop adds exactly one new BFF
  route — the update feed, which is owned by **APTR-181** (it is no longer an unowned "sibling PR")

---

### APTR-61: Tauri v2 desktop shell wrapping the same React bundle — one codebase, no forked UI
- **Priority:** Critical
- **Labels:** aperture, desktop, tauri, rust, shell
- **Agent:** claude
- **Estimate:** 7h
- **Description:** Add a Tauri v2 host process that loads the **identical** React bundle the
  web target serves. There is no `desktop/src` UI tree, no desktop-only component library, no
  second router, and no `#ifdef`-style forking of screens. The desktop crate is a *host*: it
  creates windows, owns the OS-facing surface area, and exposes a deliberately tiny command
  set that the shared bundle reaches through the APTR-62 abstraction. If a reviewer can find
  a React component that exists only for desktop, the item is wrong.

  This item also owns window lifecycle — window state persistence and multi-window — because
  those are properties of the host process, not of the UI, and splitting them out would force
  a second crate-level design pass for no benefit.

  ## FILES
  - `desktop/Cargo.toml` — the Tauri v2 host crate, pinned dependency versions
  - `desktop/tauri.conf.json` — app config; **no literal host, port, URL, or identifier**;
    the bundle identifier is injected from `APERTURE_BUNDLE_IDENTIFIER` at build time
  - `desktop/src/main.rs` — process entry, single-instance guard, window bootstrap
  - `desktop/src/windows.rs` — window creation, labels, and the multi-window registry
  - `desktop/src/window_state.rs` — persistence of size/position/maximized/monitor per window label
  - `desktop/src/build_config.rs` — build-time config injection with a fail-closed validator
  - `desktop/build.rs` — resolves build-config keys; fails the build when a required key is absent
  - `client/src/app/entrypoint.ts` — shared entry, unchanged for desktop beyond a runtime flag
  - `client/src/platform/loader.web.ts`, `client/src/platform/loader.desktop.ts` — the **only**
    files permitted to differ between targets (the two-artifact rule)
  - `client/scripts/assert-two-artifact.mjs` — the shared-bundle hash comparison and the
    enumerated loader allowlist it is allowed to except
  - `client/package.json` — a `build:desktop` script that emits the *same* shared bundle plus the
    desktop loader
  - `docs/DESKTOP.md` — architecture of the desktop host, and the one-codebase rule as a
    contributor-facing constraint
  - `.gitignore` — desktop build outputs

  ## APPROACH
  1. Ground first: `kg_query` / `kg_search` for the existing client entrypoint, bundle build,
     and any prior Tauri usage in the fleet; `kg_neighbors` on the client build scripts for
     blast radius; `kg_rules` for the client scope. Desktop packaging is a risky scope — run
     `cortex_scope` before writing code and record the `cortex_review` risk score in the PR body.
  2. Create `desktop/` as a Tauri v2 crate in the repo's Cargo workspace. Pin Tauri and every
     transitive Tauri plugin to exact versions — an unpinned shell is an unreviewable shell.
  3. The webview loads the **built client bundle from the app's own resources**, not from a
     remote origin. The desktop app never loads its UI over the network; that would make every
     backend outage a white window and every network attacker a UI attacker.
  4. **The two-artifact rule (resolves the bundle-identity contradiction).** "One byte-identical
     bundle" and "`build:desktop` registers the desktop adapter at build time" cannot both be
     true of a single artifact, so the build emits **two** distinct things:
     - the **shared bundle** — every module under `client/src` except the loader, compiled once
       per commit and **byte-identical across web and desktop**; and
     - a **target loader** — a single, tiny, enumerated entry file per target
       (`client/src/platform/loader.web.ts`, `client/src/platform/loader.desktop.ts`) whose only
       job is to register the platform adapter and set the entry flag before handing control to
       the shared bundle.
     The loader is the **only** file permitted to differ between targets, and the set of loader
     files is an explicit allowlist in the build config — not a glob, not a directory convention.
     The hash comparison in the TEST PLAN covers the shared bundle and asserts the desktop
     artifact contains no differing file **outside** the enumerated loader allowlist. Adding a
     file to that allowlist is a reviewable config change, not something the bundler can do on
     its own. `client/src` still contains zero `if (isDesktop)` branches in screens; platform
     branching is legal in exactly one directory and nowhere else, and APTR-62 lints it.
  5. Single-instance guard: launching a second copy focuses the existing main window (and hands
     off any deep-link payload to APTR-67) rather than starting a second backend session.
  6. Window state: persist per-window-label geometry, maximized state, and monitor identity to
     an OS-appropriate app-data location. Restore on launch **only after validating** the saved
     geometry lands on a currently-attached monitor; otherwise fall back to a centered default.
  7. Multi-window: a main window plus additional named windows (a detached thread, a Muse
     player, a Harmony run view). Windows share one session and one SSE connection through the
     host — never N independent authenticated streams. Closing the last window follows the
     platform convention (macOS: app stays resident with the tray/dock; Windows: app minimizes
     to tray if enabled, otherwise exits) and this is configurable, not assumed.
  8. `tauri.conf.json` carries **no address of any kind**. There is no default server, no
     fallback endpoint, and no baked-in origin. The connection target comes from APTR-63.
  9. `build.rs` fails closed: a missing `APERTURE_BUNDLE_IDENTIFIER` fails the build with a
     clear message. It never substitutes a placeholder identifier — a wrong identifier silently
     breaks signing, keychain scoping, and update targeting all at once.

  ## TEST PLAN
  - `cargo build -p aperture-desktop` through the compiler tool (not ad-hoc cargo on a shared
    host) — clean build on both packaging hosts
  - Two-artifact hash comparison: assert the **shared bundle** embedded in the desktop artifact is
    byte-identical to the one the web target ships for the same commit, and that the only files
    differing between the two artifacts are members of the enumerated loader allowlist
  - Unit: saved geometry referencing a monitor that no longer exists falls back to centered
    default and does not restore off-screen
  - Unit: second-instance launch focuses the existing window and creates no second session
  - Integration: open three windows, confirm exactly one SSE connection is established
  - Verify no hardcoded IPs, hostnames, ports, org names, or absolute user paths in
    new/modified files — including `tauri.conf.json`
  - Negative: remove `APERTURE_BUNDLE_IDENTIFIER` from the build environment and confirm the
    build **FAILS** rather than emitting a placeholder identifier
  - Negative: add a desktop-only React component under `client/src` and confirm the
    one-codebase lint (APTR-62) **FAILS**
  - Negative: make the desktop build emit a differing file that is **not** in the loader
    allowlist and confirm the two-artifact comparison **FAILS**

  ## EDGE CASES
  - A saved window position on a monitor that was disconnected while the app was closed —
    validate against live monitor geometry, never trust the stored rect
  - Fractional/mixed DPI across monitors on Windows: restoring a rect saved on a 200% display
    onto a 100% display must not produce a hairline window
  - macOS full-screen (a separate Space) saved as "maximized" — persist the platform's own
    fullscreen flag rather than inferring it from geometry
  - Rapid double-launch from a file association or deep link racing the single-instance guard —
    the guard must be process-level and race-free, not a flag file written after window creation
  - A crash before state is flushed — write window state atomically (temp + rename) and treat a
    corrupt state file as absent, never as a fatal error

- **Acceptance criteria:**
  - [ ] Two-artifact rule holds: shared bundle byte-identical across targets; only enumerated loader files differ
  - [ ] Zero desktop-only UI components under `client/src`; branching confined to the platform layer
  - [ ] Window state persists and restores safely, with off-screen and DPI fallbacks covered
  - [ ] Multi-window shares one session and one stream; single-instance guard focuses, not duplicates
  - [ ] `tauri.conf.json` and the desktop crate contain no address, host, port, or identifier literal
  - [ ] Build fails closed when a required build-config key is absent
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README updated to document the desktop target and the one-codebase rule

---

### APTR-62: Platform abstraction layer — every platform difference behind one interface
- **Priority:** Critical
- **Labels:** aperture, desktop, web, architecture
- **Agent:** claude
- **Estimate:** 5h
- **Blocked by:** APTR-61
- **Description:** Define a single `Platform` interface the shared UI programs against, with a
  web implementation and a desktop implementation, so that "does this run in a browser or in
  Tauri?" is answered in exactly one place. Without this, platform conditionals metastasize
  into screens and the one-codebase rule dies quietly over three sprints. With it, Sprint F's
  mobile/PWA target becomes a third implementation of a known interface rather than a rewrite.

  ## FILES
  - `client/src/platform/index.ts` — the `Platform` interface and the resolver
  - `client/src/platform/capabilities.ts` — the capability enum and feature-detection result type
  - `client/src/platform/web.ts` — browser implementation (the default)
  - `client/src/platform/desktop.ts` — Tauri implementation, the only file allowed to import
    the Tauri JS API
  - `client/src/platform/__tests__/` — conformance suite run against every implementation
  - `client/scripts/lint-platform-boundary.mjs` — the enforcement lint
  - `desktop/src/commands/mod.rs` — the Rust side of the interface: the complete, minimal
    command surface, one command per interface method, no general-purpose escape hatch
  - `contracts/aperture-platform-v1.md` — the interface contract, its capability semantics,
    and the rule that adding a method requires adding it to every implementation
  - `docs/DESKTOP.md` — extended with the platform-layer rules

  ## APPROACH
  1. Ground in the KG for the existing client module layout and any capability-gating helpers
     from APTR-08 — reuse that vocabulary (`available` / `degraded` / `unavailable`) rather
     than minting a parallel one.
  2. The interface covers exactly the surfaces the desktop needs and nothing speculative:
     secure credential storage, endpoint configuration storage, notification delivery, deep-link
     subscription, window controls, tray/menu action registration, update state, open-external,
     and file save/open dialogs.
  3. **Capability-shaped, not boolean-shaped.** Every method is paired with a capability state,
     so the UI asks "is secure storage available?" and receives `available | degraded |
     unavailable` with a reason — matching the module-descriptor semantics already in the shell.
     A method whose capability is `unavailable` throws a typed, catchable error; it never
     returns a plausible-looking fake.
  4. The web implementation is the **honest default**: everything it cannot do reports
     `unavailable` with a human-readable reason. It never shims a desktop capability with a
     weaker substitute (no `localStorage` pretending to be a keychain — that is exactly the
     class of "helpful" fallback that leaks tokens to disk).
  5. `lint-platform-boundary.mjs` fails the build on: any import of a Tauri API outside
     `client/src/platform/desktop.ts`; any reference to `window.__TAURI__` or a user-agent
     sniff outside the platform directory; any `isDesktop`/`isTauri` identifier in a component
     file. Wire it into `lint:adherence` so CI already gates it.
  6. The Rust command surface is enumerated in the contract and is **closed**: there is no
     generic `invoke(name, args)` passthrough, no eval-shaped command, and no command that
     takes a path or URL without validation. APTR-65 scopes capabilities to exactly this list.
  7. **No two-OS assumption.** Linux desktop is out of scope for this sprint's *packaging* (see
     Pre-flight) but must not be foreclosed by this *interface*. There is no closed
     `Windows | macOS` union type, no `is_macos` / `is_windows` boolean in shared code, and no
     capability whose presence is inferred from an OS constant. Per-OS differences are expressed
     as runtime capability states — including tray semantics, which differ enough across desktop
     environments that a closed enum would have to be rewritten rather than extended. Adding a
     third implementation must require zero edits to `client/src/platform/index.ts`.
  8. A shared conformance test suite runs against both implementations, asserting that each
     method either fulfils its contract or reports `unavailable` — never silently no-ops. A
     silent no-op is the failure mode that makes a notification "work" in dev and vanish in prod.

  ## TEST PLAN
  - Conformance suite passes against the web implementation and the desktop implementation
  - Unit: calling a method whose capability is `unavailable` throws the typed error and does
    not return a fabricated success value
  - Unit: the web implementation reports `unavailable` for secure storage with a reason string
  - `lint-platform-boundary` passes on the clean tree
  - Verify no hardcoded IPs, hostnames, ports, org names, or absolute user paths in
    new/modified files
  - Negative: import a Tauri API from a component file and confirm the boundary lint **FAILS**
  - Negative: add an interface method to `desktop.ts` only, and confirm the conformance suite
    **FAILS** for the web implementation rather than passing by omission
  - Negative (no two-OS assumption): add a closed `Windows | macOS` OS union or an `is_macos`
    branch to shared code and confirm the boundary lint **FAILS**; separately, add a stub third
    implementation and assert it conforms with **zero** edits to `client/src/platform/index.ts`

  ## EDGE CASES
  - A method added to the interface but forgotten in one implementation — the conformance suite
    must enumerate the interface reflectively so omission is a failure, not an untested gap
  - A capability that is available at startup and revokes later (notification permission
    withdrawn by the OS) — capabilities are re-probed on use, not cached for the process lifetime
  - Tauri API import pulled in transitively by a shared utility — the lint must inspect the
    resolved import graph, not just literal import statements in component files
  - A desktop capability that exists on macOS but not Windows — expressed as a capability state
    at runtime, never as a compile-time platform constant in the UI

- **Acceptance criteria:**
  - [ ] One `Platform` interface with web and desktop implementations and a reflective conformance suite
  - [ ] Capability-shaped results (`available`/`degraded`/`unavailable` + reason), never silent no-ops
  - [ ] Web implementation never shims a desktop capability with a weaker substitute
  - [ ] Boundary lint fails on Tauri imports or platform sniffing outside the platform directory
  - [ ] The Rust command surface is closed and enumerated in `contracts/aperture-platform-v1.md`
  - [ ] No two-OS assumption: no closed OS union or OS boolean in shared code; a third implementation needs no interface edit
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README updated to document the platform abstraction and how to add a method

---

### APTR-63: Connection manager — first-run server configuration and graceful offline behaviour
- **Priority:** Critical
- **Labels:** aperture, desktop, connection, ux, reliability
- **Agent:** claude
- **Estimate:** 8h
- **Blocked by:** APTR-62
- **Description:** The desktop app ships knowing **nothing** about any deployment. There is no
  default server, no fallback address, no "try this first" heuristic, and no address literal
  anywhere in the tree. On first run the user is asked where their MooseNet backend lives; the
  value they enter is validated, probed, and stored in OS-appropriate app configuration (the
  *credentials* for it go to the keychain in APTR-64 — the endpoint and the secret are stored
  separately and neither implies the other).

  The same subsystem owns what happens when that endpoint stops answering, because they are one
  state machine, not two: `unconfigured → configuring → probing → connected → degraded →
  offline → reconnecting`. The binding requirement is that **no state renders a white window**.
  A backend outage must produce a legible, honest screen with the cached shell, the last known
  content marked stale, and a retry affordance — never a blank webview, never a spinner with no
  timeout, never a raw error string.

  ## FILES
  - `client/src/connection/machine.ts` — the connection state machine and its transitions
  - `client/src/connection/store.ts` — endpoint profiles, active profile, last-known state
  - `client/src/connection/probe.ts` — endpoint validation and capability probe
  - `contracts/aperture-api-v1.yaml` — the two distinct descriptor shapes: minimal pre-auth,
    rich post-auth (separate schemas, not one schema with optional fields)
  - `client/src/screens/FirstRun/` — first-run connection flow (shared UI, desktop-gated route)
  - `client/src/screens/Offline/` — the offline/degraded surface
  - `client/src/platform/desktop.ts` — endpoint-config read/write via the platform interface
  - `desktop/src/commands/config.rs` — Rust-side config persistence in the OS app-config dir
  - `docs/DESKTOP.md` — the connection model, documented for users and reviewers
  - `docs/INSTALL.md` — the desktop first-run section (fills the Sprint A placeholder)

  ## APPROACH
  1. Ground in the KG for the Sprint B session model and the Sprint C shell bootstrap, and run
     `cortex_scope` — this item touches auth and streaming, both flagged risky by the epic.
  2. **First-run flow**: the user supplies an endpoint. Validate it as a URL with an explicit
     scheme allowlist (encrypted transport required; plaintext permitted only for a loopback
     address the user typed themselves, and then only with an explicit, dismissible warning —
     never silently). Reject credentials embedded in the URL, reject non-standard schemes,
     normalize and canonicalize before storing.
  3. **Probe before accept, with a minimal pre-auth descriptor.** Hit the BFF's descriptor
     surface through the generated SDK and show the user what they connected to *before*
     persisting, so a mistyped endpoint fails at configuration time rather than three screens
     later as a broken chat. But the descriptor is fetched **unauthenticated**, which makes it a
     fingerprinting surface on every deployment on the internet, and the epic forbids leaking
     infrastructure detail. So the **pre-auth** descriptor contains exactly three fields:
     product name, API contract version, and a deployment-chosen display name (operator-set,
     defaulting to empty). It carries **no** backend version, no build/commit identifier, no
     module list, no capability list, no hostname, and no component inventory. Server version and
     the available-module list move to the **post-auth** descriptor, where they are already
     needed by capability gating and are no longer world-readable. The first-run UI therefore
     shows the display name and "speaks Aperture contract vN" pre-auth, and fills in modules and
     versions after the user authenticates. This is a contract change — record it in
     `contracts/aperture-api-v1.yaml` as two distinct descriptor shapes, not one shape with
     optional fields, so a future handler cannot accidentally serve the rich one unauthenticated.
  4. Support **multiple named endpoint profiles** with one active — an operator with a lab and a
     live deployment should not retype anything, and profile switching must be explicit and
     visible in the UI (a status element naming the active profile) so nobody streams a private
     conversation to the wrong backend by accident.
  5. **Continuity (Soul Contract clause 4):** switching profiles, re-running first-run, or
     reinstalling scopes only *client-side* state. It never issues anything that resets Engram
     memory, personality traits, or relationship lore server-side, and the local caches it
     clears are presentation caches only. This is asserted by a negative test.
  6. **Offline behaviour**: the shell is served from app resources (APTR-61) so it always
     renders. On loss of connectivity, transition to `degraded` (stream lost, REST still
     answering) or `offline` (nothing answering), render the cached thread list and last
     messages **explicitly marked stale with the time of the last successful sync**, disable
     composition with an explained reason rather than a dead input, and expose a manual retry
     alongside automatic jittered exponential backoff with a cap.
  7. Never fabricate an assistant reply while offline, never queue a message silently, and never
     let a queued draft appear to have been sent. A draft written offline is preserved as a
     **draft**, labelled as such, and sent only on an explicit user action after reconnect. The
     *storage, durability, and lifecycle* of drafts are **owned by APTR-184**, not by this item —
     this item only guarantees the offline draft is labelled a draft and never appears sent.
  8. All state transitions are logged through the single redacting subscriber owned by
     **APTR-185**, with the endpoint reduced to scheme+host-shape only; never write a full
     endpoint or any token into a log. This item does not stand up its own logger.
  9. **Certificate handling.** There is still no "continue anyway" and no verification-disable
     switch. The sanctioned path for a self-hosted private CA or a pinned leaf is **APTR-180**,
     which this item's probe and transport call into; a certificate failure with no configured
     trust anchor surfaces as a distinct, honest error that *offers the APTR-180 flow* rather
     than offering to skip verification.

  ## TEST PLAN
  - Unit: scheme allowlist accepts encrypted endpoints, rejects plaintext non-loopback, rejects
    URLs carrying embedded credentials, rejects unknown schemes
  - Unit: the state machine reaches every state and every transition is covered
  - Integration: with the backend killed mid-session, the app transitions to `offline`, renders
    the cached shell with a stale marker, and never presents a blank window
  - Integration: on backend recovery, the app reconnects and clears the stale marker without a
    manual reload
  - Unit: backoff is jittered, capped, and stops on an explicit user cancel
  - Verify no hardcoded IPs, hostnames, ports, org names, or absolute user paths in
    new/modified files — this item is the single highest risk for an address literal, so grep
    the whole `desktop/` and `client/src/connection/` trees explicitly
  - Negative: assert a fresh install with no configuration presents the first-run flow and makes
    **zero** network requests before the user supplies an endpoint
  - Negative (pre-auth minimality): fetch the descriptor unauthenticated and assert the response
    body contains **no** version, build, commit, module-list, capability-list, hostname, or
    component-inventory field — asserted against the full serialized body, not a field allowlist
  - Negative (continuity): configure profile A, hold a conversation, switch to profile B and
    back; assert assistant memory, traits, and relationship lore are unchanged and no
    reset/clear call was issued to any backend

  ## EDGE CASES
  - A DNS-resolvable but wrong endpoint (some other service answering) — the capability probe
    must reject a response that is not a valid Aperture BFF descriptor, rather than half-loading
  - An endpoint reachable at configure time and unreachable at launch — launch into `offline`
    with the cached shell, never into the first-run flow (which would look like data loss)
  - Certificate errors on an encrypted endpoint — surface as a distinct, honest failure with no
    "continue anyway" that silently disables verification; offer the APTR-180 trust-anchor flow
  - Clock skew causing a session to appear expired immediately after a successful probe — treat
    as an auth failure with a clear message, never as an endpoint failure
  - Laptop sleep/wake and network-interface changes — treat as a normal transition to
    `reconnecting`, not as an error state requiring user action
  - A profile deleted while it is the active profile — fall back to explicit re-selection, never
    to an implicit "first profile in the list"

- **Acceptance criteria:**
  - [ ] No default, fallback, or literal server address exists anywhere in the desktop or client tree
  - [ ] First run validates, probes, and shows what it connected to before persisting the endpoint
  - [ ] Pre-auth descriptor is product name + contract version + display name only; version/module list are post-auth (negative test)
  - [ ] Multiple named profiles supported, with the active profile always visible in the UI
  - [ ] Backend unreachable renders the cached shell with a stale marker — never a white window; offline drafts never appear sent and no reply is fabricated
  - [ ] Continuity preserved across profile switches and re-runs of first run (negative test)
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README and `docs/INSTALL.md` updated to document the connection model

---

### APTR-64: Secure credential storage via the OS keychain — never a plaintext token on disk
- **Priority:** Critical
- **Labels:** aperture, desktop, security, secrets
- **Agent:** claude
- **Estimate:** 7h
- **Blocked by:** APTR-62
- **Description:** Session credentials on desktop live in the OS credential store — Windows
  Credential Manager on Windows, Keychain Services on macOS — reached through one keychain
  abstraction behind the APTR-62 platform interface. No token, refresh token, device key, or
  session cookie is ever written to a plaintext file, a config file, `localStorage`, IndexedDB,
  a log line, or a crash report. If the OS credential store is unavailable, the capability
  reports `unavailable` and the app falls back to **in-memory-only** credentials that require
  re-auth on relaunch — it does **not** fall back to disk. A weaker store is not a fallback; it
  is the vulnerability.

  ## FILES
  - `desktop/src/credentials/mod.rs` — the keychain abstraction and its error taxonomy
  - `desktop/src/credentials/windows.rs` — Windows Credential Manager backend
  - `desktop/src/credentials/macos.rs` — macOS Keychain Services backend
  - `desktop/src/credentials/memory.rs` — explicit in-memory fallback, non-persistent by design
  - `desktop/src/commands/credentials.rs` — the narrow command surface exposed to the webview
  - `client/src/platform/desktop.ts` — credential methods bound to the interface
  - `client/src/auth/session.ts` — desktop session persistence routed through the platform layer
  - `contracts/aperture-platform-v1.md` — credential method semantics and failure modes
  - `docs/SECURITY.md` — the desktop credential model, threat notes, and what is deliberately not done

  ## APPROACH
  1. Ground in the KG for the Sprint B session/device model; run `cortex_scope` (auth scope).
  2. One entry per endpoint profile, scoped by a service name derived from
     `APERTURE_DESKTOP_KEYCHAIN_SERVICE` plus the profile identifier — so two profiles cannot
     read each other's credentials and uninstall can enumerate and remove exactly what it wrote.
  3. Store the **minimum**: the refresh/session token and the device identity issued by Sprint B.
     Never store the user's password. Never store a long-lived bearer that outlives the server's
     own session policy — the desktop must respect server-side revocation, so a revoked device
     fails closed on next use and clears its entry.
  4. macOS: request the appropriate access control on the keychain item and do **not** mark it
     synchronizable — a session token must not ride iCloud Keychain to other machines. Keep the
     item accessible only when the device is unlocked.
  5. Windows: use Credential Manager's per-user generic credential storage; do not roam. Set the
     persistence scope to local machine per-user, not enterprise-roaming.
  6. **Transport topology — decided by D1, not by the implementing agent.** The previous version
     of this item said "the Rust side attaches credentials to outbound requests" while APTR-65
     said `connect-src` includes the configured endpoint so the webview reaches it directly.
     Those are two different architectures, and the "say so in the PR body" clause was an
     unbounded downgrade path inside a Critical security item. Both are removed. The settled
     topology, binding on this item and APTR-65:
     - The **base URL is the operator-configured endpoint**, read from OS secure storage. It is
       injected into the SDK transport; it is never a compiled-in constant and never a default.
     - **Auth is a bearer token on the `Authorization` header. Never a cookie.** A cross-origin
       cookie cannot be `SameSite=Strict`, and the cookie flags must not be relaxed to make one
       work — if an implementation finds itself wanting `SameSite=Lax` or `None` on desktop, the
       implementation is wrong, not the flag.
     - The webview holds a **short-lived access token** and never sees the long-lived refresh
       token or the device key. Those stay in the keychain, reachable only from Rust through the
       narrow `credentials.rs` command surface. A webview compromise therefore costs the
       remaining lifetime of one access token, not the credential itself.
     - Refresh is a **Rust-side** operation: the webview asks for a fresh access token, Rust
       performs the refresh using the stored refresh token, and returns only the access token. No
       command returns the refresh token or the device key to the webview, ever, in any shape.
     - Access-token lifetime is bounded and short (a config key, not a literal), and the token is
       held in memory in the webview only — never `localStorage`, never IndexedDB, never a cookie.
     - **No CORS headers are served on the Aperture API, ever.** The desktop reaches it as a
       native HTTP client, not a browser `fetch` subject to CORS. This is stated in the contract
       so nobody later "fixes" a connectivity failure by adding CORS headers — that would weaken
       the web target for no desktop benefit.
  7. Any Rust-side secret type gets a redacting `Debug`/`Display` impl, asserted by test. No
     `std::env::var` of anything token/key/password/secret-shaped; where the desktop needs a
     server-provisioned secret it comes from the BFF, which reads it via `SecretManager::get()`.
  8. Logout and "forget this profile" delete the keychain entry, and deletion is verified by
     read-back rather than assumed from a success return code.
  9. **Continuity:** clearing local credentials is a *local* action. It never issues a
     server-side memory, trait, or lore reset, and re-authenticating restores the same
     assistant relationship. Asserted by negative test.

  ## TEST PLAN
  - Integration on a Windows host: store, read back, and delete a credential via Credential
    Manager; confirm deletion by read-back
  - Integration on a macOS host: same against Keychain Services; confirm the item is not marked
    synchronizable
  - Filesystem assertion: after a full login → use → relaunch cycle, grep the entire app-data,
    config, cache, and log directories for the token value — **zero** hits
  - Unit: the credential type's `Debug` and `Display` impls emit a redaction marker, not the value
  - Unit: keychain unavailable ⇒ capability `unavailable`, in-memory mode engaged, nothing written to disk
  - `grep` confirms zero `std::env::var` reads of token/key/password/secret-shaped names
  - Verify no hardcoded IPs, hostnames, ports, org names, or absolute user paths in
    new/modified files
  - Unit: the desktop transport attaches a bearer `Authorization` header and sets **no** cookie;
    assert no `Set-Cookie`/`Cookie` handling exists on the desktop path
  - Negative: with the OS credential store unavailable, assert the app does **not** persist
    credentials to any file and requires re-auth after relaunch
  - Negative (topology): enumerate every command in the surface and assert **none** returns the
    refresh token or device key to the webview; add a command that does and confirm the test
    **FAILS**
  - Negative (continuity): log out, clear credentials, log back in; assert assistant memory,
    traits, and relationship lore are intact and no reset call was issued

  ## EDGE CASES
  - macOS Keychain prompting for access after the app is re-signed with a different identity —
    detect the access-denied class distinctly and guide the user to re-authenticate rather than
    silently looping
  - A locked keychain at launch (user cancels the unlock prompt) — degrade to in-memory, tell
    the user why, do not retry-loop the prompt
  - Windows roaming profiles and credential size limits — keep stored blobs small and chunk-free;
    fail loudly if a value would exceed the store's limit rather than truncating
  - Two profiles pointed at the same endpoint — service-name scoping must include the profile id,
    not just the endpoint, or one will overwrite the other
  - Server-side device revocation while the app is offline — the stored credential must fail
    closed on the next successful reach and clear itself, never retry indefinitely with a dead token
  - A crash reporter or debug dump capturing process memory — no crash-dump upload path exists
    at all (sovereignty), and this must be asserted, not assumed

- **Acceptance criteria:**
  - [ ] Credentials stored in Windows Credential Manager and macOS Keychain via one abstraction; deletion verified by read-back and items are non-synchronizable
  - [ ] D1 topology: bearer token on `Authorization`, never a cookie; no cookie flag is relaxed for desktop
  - [ ] Refresh token and device key never leave Rust; the webview holds only a short-lived access token (negative test)
  - [ ] Zero plaintext credential material in any file, cache, or log — verified by filesystem grep
  - [ ] Keychain unavailable ⇒ in-memory only + re-auth on relaunch; never a disk fallback
  - [ ] Secret types redact in `Debug`/`Display`; secrets read via the secret manager, with zero `std::env::var` of secret-shaped names
  - [ ] Continuity preserved across logout and re-auth (negative test)
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass

---

### APTR-65: Desktop security hardening — CSP, minimum capabilities, IPC reduction, webview containment
- **Priority:** Critical
- **Labels:** aperture, desktop, security, hardening
- **Agent:** claude
- **Estimate:** 8h
- **Blocked by:** APTR-61
- **Description:** A desktop shell turns "a bug in a web page" into "code running on the user's
  machine". This item closes that gap deliberately rather than trusting the framework's
  defaults. Scope the Tauri v2 capability set to the exact command list enumerated in APTR-62
  and nothing more, enforce a strict CSP with no `unsafe-inline`/`unsafe-eval` and no remote
  origins, block navigation and window-open to any non-local origin, disable every IPC surface
  the app does not use, and assert all of it mechanically so a later item cannot loosen it
  without failing CI.

  The threat model to write down and defend against: **a malicious or compromised page (or an
  injected string rendered as markup) inside the webview attempting to reach the filesystem,
  spawn a process, exfiltrate the session, or navigate the shell to an attacker origin.**

  ## FILES
  - `desktop/capabilities/default.json` — the capability set, minimal and explicit
  - `desktop/tauri.conf.json` — CSP, asset protocol scoping, window options
  - `desktop/src/security/navigation.rs` — navigation and window-open guards
  - `desktop/src/security/csp.rs` — the custom protocol handler that serves app resources and
    generates the per-load `Content-Security-Policy` response header from the active profile
  - `desktop/src/security/mod.rs` — the hardening module and its configured-policy startup assertions
  - `desktop/tests/security_posture.rs` — the posture test suite (the enforcement)
  - `desktop/tests/arch_spawn_single_site.rs` — the Rust architectural test asserting exactly one
    process-spawn call site, module-private and unreachable from IPC
  - `client/scripts/assert-csp.mjs` — asserts the built bundle needs no inline script or eval
  - `docs/SECURITY.md` — the desktop threat model and every hardening decision, with rationale
  - `.gitea/workflows/ci.yml` — wire the posture suite into CI

  ## APPROACH
  1. Ground in the KG and run `cortex_scope` — this is a security-critical scope and the epic
     requires it. Consult `kg_rules` for learned rules on fail-closed enforcement; the
     constellation's own history is explicit that allowlists beat denylists here.
  2. **Capabilities are an allowlist of the APTR-62 command list, enumerated one by one.** No
     wildcards, no whole-plugin grants, no `fs` scope broader than the specific app-data
     subdirectories the app writes, and **no webview-reachable `shell` execute capability**.
     `shell.open` is permitted only through the validated open-external path (APTR-67's
     validator), never raw.
  3. **The single sanctioned spawn path (resolves the APTR-65 vs APTR-71 conflict).** "No shell
     execute capability at all" was unimplementable: the Windows updater must launch the NSIS
     installer, and the macOS swap may need a helper. Blanket-banning process spawn would have
     forced the implementing agent to either violate this item or block APTR-71. The rule is
     therefore narrowed, not waived — process spawn exists at **exactly one call site** with
     these properties, all of which are asserted:
     - It is one Rust function, `apply_verified_update()`, private to the updater module. It is
       **not** a Tauri command, **not** in the capability set, and **not** reachable from IPC or
       from any webview-invocable path — the webview can *request an update apply* only by
       setting an intent that the host process acts on; it can never name what is executed.
     - Its only argument is the staged-artifact handle produced by APTR-71's verifier. It takes
       no caller-supplied path, no caller-supplied argument vector, and no string that reaches a
       shell. It spawns the executable directly (no shell interpreter, no `cmd`, no `sh`, no
       argument-string interpolation).
     - It re-verifies the staged artifact's digest against the pinned value **immediately before**
       spawning, so a TOCTOU write into the staging directory between verification and apply is
       caught. It refuses to spawn anything outside the app's own staging directory.
     - Every other process-spawn API is banned tree-wide by a Rust architectural test, so a later
       item cannot add a second spawn site without failing CI.
  4. **CSP**: `default-src 'self'`; no `unsafe-inline`, no `unsafe-eval`, no remote origin in any
     directive except `connect-src`, `object-src 'none'`, `frame-ancestors 'none'`,
     `base-uri 'none'`, `form-action 'none'`. Per **D1**, `connect-src` is `'self'` plus
     **exactly the one configured endpoint and nothing else** — no wildcard, no scheme-only
     source, no second host, never a literal in the config file. The desktop reaches the API as a
     native HTTP client; **no CORS headers are served on the Aperture API, ever**, and a
     connectivity failure is never to be "fixed" by adding them.
  5. **The `connect-src` mechanism, stated concretely.** A platform webview's CSP comes from the
     served document or the webview configuration, not from a runtime setter, so "injected at
     runtime" must name a mechanism. It is: the host registers a **custom protocol handler** that
     serves the app resources, and that handler emits the `Content-Security-Policy` **response
     header**, generated per-load from the active endpoint profile. Switching profiles therefore
     regenerates the policy and performs a **controlled reload** of the webview through the host —
     it does not mutate a live document's policy, because it cannot. The reload is not optional:
     until it completes, the window keeps the previous profile's policy and must not be used to
     issue requests against the new one.
  6. **Navigation guard**: intercept every navigation and window-open request. Same-origin
     app-resource navigations proceed; everything else is blocked and, if it is a legitimate
     user-initiated external link, handed to the OS browser through the validated open-external
     path. A page inside the webview must not be able to relocate the shell.
  7. Disable devtools in release builds; keep them behind an explicit debug build flag, not a
     runtime toggle a page could reach.
  8. Remove or refuse every unused IPC surface: no generic invoke passthrough, no eval-shaped
     command, no command accepting an arbitrary filesystem path, no command that reflects its
     input into a shell argument. Every command validates its arguments at the boundary and
     returns typed errors — the argument validator is the trust boundary, not the caller.
  9. **Startup posture assertions — over the CONFIGURED policy, and named as such (D8).** The
     earlier wording said "assert the effective CSP"; a platform webview's *effective* CSP is not
     generally introspectable at runtime, so that assertion is not implementable and would have
     been quietly weakened to "assert the config file" — a different and weaker guarantee wearing
     the strong one's name. What is asserted, explicitly and in these words in code comments,
     logs, and `docs/SECURITY.md`, is: **the policy string this process is configured to serve**,
     read back from the protocol handler's own generated header (not from a static file, not from
     a duplicated copy), plus the capability list and the devtools state. The app refuses to start
     if any of those does not match the expected posture. What is **not** asserted, and is stated
     as a known limitation rather than left implied: that the webview honoured the policy it was
     handed. That gap is covered *behaviourally* instead, by the integration tests below that
     attempt real blocked operations (external navigation, external `connect-src` fetch,
     `window.open`) and assert they fail — a behavioural test observes the effective policy's
     consequences even though the policy itself cannot be read back.
  10. Add a supply-chain gate for the desktop crate: a dependency vulnerability scan that
     **fails closed** on a missing or malformed report (absence is never read as zero), matching
     the Sprint A audit gate's discipline. Accepted advisories carry an in-file rationale.

  ## TEST PLAN
  - `desktop/tests/security_posture.rs`: asserts the capability list equals the enumerated
    command list exactly — a superset fails
  - Posture test: the **configured** policy (read back from the protocol handler's generated
    header) contains no `unsafe-inline`, no `unsafe-eval`, and a `connect-src` whose only remote
    source is the active endpoint — no wildcard, no scheme-only source, no second host
  - Posture test: devtools disabled in release configuration
  - Behavioural (covers what the configured-policy assertion cannot): a page fetch to an origin
    other than the configured endpoint is **blocked** by the webview at runtime
  - Integration: after a profile switch and controlled reload, the webview **cannot** reach the
    previous profile's origin
  - Rust architectural test: exactly one process-spawn call site exists in the desktop crate, it
    is module-private, and it appears in no capability set and no command registration
  - Unit: `apply_verified_update()` re-verifies the staged digest immediately before spawn and
    refuses a path outside the staging directory
  - Integration: a page attempting `window.location = <external origin>` is blocked and the
    shell stays on the app resource
  - Integration: a `window.open` to an external origin does not create a webview window
  - `node client/scripts/assert-csp.mjs` — the built bundle requires no inline script or eval
  - Dependency audit for the desktop crate passes; fails closed on a truncated report
  - Verify no hardcoded IPs, hostnames, ports, org names, or absolute user paths in
    new/modified files
  - Negative: add a wildcard capability grant and confirm the posture suite **FAILS**
  - Negative: add `unsafe-inline` to the CSP and confirm the posture suite **FAILS**
  - Negative: invoke a command with a path-traversal argument (`..` segments, absolute path,
    symlink target outside the app-data scope) and confirm it is **rejected** at the boundary
  - Negative: add a second process-spawn call site, or expose `apply_verified_update()` as a
    Tauri command, and confirm the Rust architectural test **FAILS**
  - Negative: add a CORS header to an Aperture API response and confirm the contract test
    **FAILS** — no CORS is served on this API on any target

  ## EDGE CASES
  - A dependency that injects an inline style or script at build time — the CSP assertion must
    run against the built bundle, not the source, or it will pass and then fail on a user's machine
  - `connect-src` needing the runtime-configured endpoint — generated into the protocol handler's
    response header per load and re-applied by a controlled reload on profile switch; never
    widened to `*`, a scheme-only source, or a second host as a shortcut
  - A profile switch racing an in-flight request — the reload must complete before the window is
    usable against the new endpoint; a request must never be issued under a stale policy
  - A legitimate external link a user clicks (documentation, a media source) — route through the
    validated open-external path with scheme allowlisting; never let the webview navigate itself
  - Drag-and-drop of a file into the webview granting implicit filesystem reach — scope the drop
    handler to explicit, user-initiated attachment upload only
  - macOS and Windows differing in default webview behaviour — the posture suite runs on both
    hosts in CI, not just one
  - A future item needing a new command — it must add the command to the enumerated list *and*
    the capability set in the same PR; the posture test makes a partial change fail

- **Acceptance criteria:**
  - [ ] Capability set exactly equals the enumerated command list; wildcards and whole-plugin grants absent
  - [ ] `connect-src` is `'self'` plus exactly the configured endpoint; no `unsafe-inline`/`unsafe-eval`; served as a header by the app's protocol handler and re-applied by controlled reload on profile switch
  - [ ] Startup asserts the **configured** policy (not the effective one) and says so; the behavioural blocked-request tests cover what cannot be introspected
  - [ ] No CORS headers on the Aperture API on any target (negative test)
  - [ ] Exactly one process-spawn site: module-private `apply_verified_update()`, digest-re-verified, staging-scoped, unreachable from IPC — enforced by a Rust architectural test
  - [ ] Navigation and window-open to non-local origins are blocked; external links go to the OS browser via a validated path
  - [ ] Devtools disabled in release; every command validates arguments at the boundary; path traversal rejected; dependency audit fails closed
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass; `docs/SECURITY.md` documents the threat model, the spawn path, and the configured-vs-effective CSP limitation

---

### APTR-66: Native integration — system tray, native menus, and assistant-operable parity
- **Priority:** High
- **Labels:** aperture, desktop, ux, native, assistant-operable
- **Agent:** claude
- **Estimate:** 6h
- **Blocked by:** APTR-62
- **Description:** Make Aperture feel like an application on each OS rather than a web page in a
  frame: a system tray/menu-bar presence, a real native menu bar with correct platform
  conventions, and standard keyboard shortcuts. Per the epic's assistant-operable parity rule,
  **every action reachable from the tray or a menu must also be invocable by the assistant as a
  tool** — the menu is a second front-end onto the same action registry, not a parallel
  implementation. That constraint is what stops the desktop growing capabilities the assistant
  cannot see.

  The tray is a *launcher and status surface*, explicitly **not** a notification channel — that
  is APTR-68's job and is budget-governed.

  ## FILES
  - `desktop/src/tray.rs` — tray/menu-bar icon, tooltip, and menu
  - `desktop/src/menu.rs` — native application menu, per-platform layout
  - `desktop/src/actions/mod.rs` — the shared action registry both surfaces bind to
  - `client/src/actions/registry.ts` — client-side action definitions and their tool mapping
  - `client/src/platform/desktop.ts` — action registration through the platform interface
  - `contracts/aperture-actions-v1.md` — the action registry contract and the parity rule
  - `docs/DESKTOP.md` — tray and menu behaviour, and platform convention notes
  - `assets/tray/` — tray icon set (theme-aware, template-rendered on macOS, multi-DPI on Windows)

  ## APPROACH
  1. Ground in the KG for Sprint D's assistant-operable action work and **reuse that registry**
     rather than defining a second one. If Sprint D's registry exists, this item binds to it;
     if the shapes differ, reconcile in the contract rather than forking.
  2. Every action is declared once with: stable id, label, platform accelerator(s), enablement
     predicate, and the Terminus tool it corresponds to. A tray or menu entry with **no** tool
     mapping fails a parity test — that is the mechanical enforcement of the epic rule.
  3. Native menu layout follows each platform's conventions rather than a lowest-common
     denominator: on macOS the application menu carries About/Preferences/Quit and the window
     menu behaves natively; on Windows the same items live where Windows users expect them.
     Accelerators are platform-correct (the platform's primary modifier, not a hardcoded key).
  4. Tray menu content is small and honest: show/hide the main window, active endpoint profile
     and connection state (from APTR-63), quiet-hours state (from APTR-68) with a toggle,
     check-for-updates (APTR-71), and quit. Connection state in the tooltip must reflect the
     real state machine, never a stale cached string.
  5. Tray icon assets are theme-aware: macOS template images that invert correctly in light and
     dark menu bars, Windows multi-resolution icons that stay legible at small sizes and on
     high-DPI displays. No external asset fetch — icons are bundled (Module Contract clause 6).
  6. Tray behaviour is **configurable, not assumed**: close-to-tray, start-minimized, and
     launch-at-login are user settings that default off. Launch-at-login in particular is never
     enabled silently by an installer.
  7. Menu and tray actions dispatch into the same registry the UI uses — no duplicated logic, no
     direct backend calls from the Rust side that bypass the BFF path.

  ## TEST PLAN
  - Unit: every tray and menu entry resolves to a registered action id
  - **Parity test**: every registered action exposes a corresponding assistant-invocable tool
    mapping; an action without one fails the suite
  - Unit: enablement predicates disable actions correctly when offline (from the APTR-63 state)
  - Integration on macOS: menu-bar layout places About/Preferences/Quit in the application menu
  - Integration on Windows: accelerators use the platform primary modifier
  - Icon assertion: tray assets are bundled, contain no external reference, and provide the
    required DPI variants
  - Verify no hardcoded IPs, hostnames, ports, org names, or absolute user paths in
    new/modified files
  - Negative: add a tray entry with no tool mapping and confirm the parity test **FAILS**
  - Negative: assert launch-at-login is **off** on a fresh install and is not set by the installer

  ## EDGE CASES
  - A Linux-style tray assumption leaking into the macOS menu-bar implementation — they are
    different surfaces with different conventions; do not unify them into a wrong middle
  - Tray icon invisible on a light menu bar or a high-contrast Windows theme — test both themes
  - Close-to-tray hiding the only window with no visible way back (tray icon suppressed by the
    OS overflow area) — always offer a documented relaunch path that re-shows the window
  - Accelerator collision with an OS-reserved shortcut — detect and fall back rather than
    registering and silently failing
  - Actions whose enablement depends on a capability that flips mid-session — predicates are
    re-evaluated on menu open, not cached at registration

- **Acceptance criteria:**
  - [ ] Tray/menu-bar presence with connection state, quiet-hours toggle, and update check
  - [ ] Native menus follow per-platform conventions with correct accelerators on both platforms
  - [ ] Every tray/menu action resolves to a registered action **and** an assistant-invocable tool (parity test)
  - [ ] Tray assets bundled, theme-aware, multi-DPI, with zero external references
  - [ ] Close-to-tray, start-minimized, and launch-at-login default off and are user-configurable
  - [ ] Tray is a launcher/status surface only — it raises no notifications of its own
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README updated to document tray and menu behaviour

---

### APTR-67: Deep links — custom URL scheme registration with strict payload validation
- **Priority:** High
- **Labels:** aperture, desktop, deeplink, security
- **Agent:** claude
- **Estimate:** 5h
- **Blocked by:** APTR-62
- **Description:** Register a custom URL scheme (name supplied by `APERTURE_DEEP_LINK_SCHEME`,
  never a literal in code) so the assistant, the web surface, and the OS can open Aperture
  directly at a thread, a media item, or a build run. A deep link is **hostile input by
  default**: it can be triggered by any web page the user visits, any document they open, and
  any other application on the machine. The validator is therefore the whole point of this item,
  and the routing is the easy part.

  ## FILES
  - `desktop/src/deeplink/mod.rs` — scheme registration and OS event plumbing
  - `desktop/src/deeplink/parser.rs` — the fail-closed parser and validator
  - `desktop/src/deeplink/routes.rs` — the closed set of accepted link targets
  - `client/src/deeplink/handler.ts` — client-side dispatch to a route, post-validation
  - `desktop/src/security/external.rs` — the validated open-external path (used by APTR-65/66)
  - `contracts/aperture-deeplinks-v1.md` — the accepted link grammar and rejection rules
  - `docs/SECURITY.md` — extended with the deep-link threat model
  - `docs/DESKTOP.md` — user-facing description of supported links

  ## APPROACH
  1. Ground in the KG for the client route table and run `cortex_scope` — untrusted external
     input crossing into a privileged process is exactly the risky-item case.
  2. **Fail-closed allowlist parsing.** A closed enum of accepted targets (thread, media item,
     build run, settings pane) with typed, format-validated parameters. Anything not matching an
     enumerated target is rejected and logged once — never "best effort" routed, never passed
     through to a generic router, never reflected back into the UI as text.
  3. Explicit rejections, each with a test: path traversal segments; absolute or UNC paths;
     embedded credentials; nested schemes (`aperture://...?next=javascript:...` and
     `file:`/`data:`/`javascript:` payloads in any parameter); over-length payloads; control
     characters; percent-encoding tricks (decode exactly once, then validate — never
     validate-then-decode); Unicode homoglyph and bidi-override characters in identifiers.
  4. Identifiers are validated against their expected format (opaque id charset and length),
     not merely non-empty. An id that does not match its format never reaches a request.
  5. **A deep link never carries a credential and never authenticates.** If the app is not
     authenticated, the link is held, the user authenticates normally, and the link is then
     applied. A link must not be able to elevate, switch endpoint profiles, change security
     settings, disable quiet hours, trigger an update, or initiate any destructive action.
  6. Second-instance handling (APTR-61) forwards the payload to the running instance, which
     validates it identically — the validator runs in one place, on every path, cold start and
     warm.
  7. The validated open-external path lives here too, since it is the inverse problem: opening a
     link *out* to the OS browser with a scheme allowlist (`http`/`https` only), no local
     schemes, no file paths, and no shell interpolation.
  8. Rate-limit deep-link handling so a page firing links in a loop cannot lock the UI or spam
     window focus.

  ## TEST PLAN
  - Unit: each enumerated target parses and routes correctly with well-formed parameters
  - Unit: a full rejection corpus — traversal, absolute/UNC paths, embedded credentials, nested
    `javascript:`/`data:`/`file:` payloads, over-length input, control characters, double-encoded
    sequences, homoglyph/bidi identifiers — every case rejected, none routed
  - Unit: decode-once-then-validate ordering asserted explicitly
  - Integration: cold start with a link, and warm second-instance with a link, take the identical
    validation path
  - Unit: unauthenticated deep link is held and applied only after normal authentication
  - Unit: open-external rejects non-`http(s)` schemes and never interpolates into a shell
  - Verify no hardcoded IPs, hostnames, ports, org names, or absolute user paths in
    new/modified files — the scheme name comes from config, not a literal
  - Negative: a deep link attempting to switch endpoint profile, alter a security setting,
    disable quiet hours, or trigger an update is **rejected**, and the test asserts no state changed
  - Negative: a link storm (many links in rapid succession) is rate-limited and does not lock the UI

  ## EDGE CASES
  - macOS delivers deep links as an application event that can arrive **before** the window
    exists — queue and replay after bootstrap, never drop
  - Windows delivers via command-line arguments to a new process — the single-instance handoff
    must forward the raw payload without shell re-interpretation
  - Scheme registration failing (unprivileged install, a competing registration) — report it as
    a capability, not a crash, and continue without deep links
  - Uninstall leaving a dangling scheme registration — APTR-69/70 must remove it (asserted there)
  - A link to a resource the user cannot access on the configured backend — a clean "not found or
    not permitted" surface, with no distinction that leaks existence
  - A link arriving while the app is offline — hold it against reconnect rather than failing it

- **Acceptance criteria:**
  - [ ] Custom scheme registered on both platforms; scheme name sourced from config, never a literal
  - [ ] Closed allowlist of link targets with typed, format-validated parameters; everything else rejected
  - [ ] Full rejection corpus passes: traversal, nested schemes, encoding tricks, homoglyphs, over-length
  - [ ] Cold-start and warm second-instance links take the identical validation path
  - [ ] A deep link cannot authenticate, elevate, switch profiles, change security settings, or trigger an update
  - [ ] Open-external allows only `http(s)`, with no shell interpolation
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] `docs/SECURITY.md` and README updated to document the link grammar and rejections

---

### APTR-68: Native notifications as a transport for the assistant's presence budget
- **Priority:** Critical
- **Labels:** aperture, desktop, notifications, soul-contract, presence
- **Agent:** claude
- **Estimate:** 5h
- **Blocked by:** APTR-62
- **Description:** Desktop notifications are a **transport**, never a source. Soul Contract
  clause 2 is explicit: presence has a budget, and Aperture ships no independent notification
  tray. The only thing that may raise an OS notification is a `presence` event that the
  assistant's own prioritized, trait-scaled knock quota already approved upstream, with quiet
  hours and opt-out honoured. There is no local heuristic, no "you have 3 unread" counter
  generating its own knock, no module raising its own toast around the budget.

  Concretely: the desktop notification path has exactly one input — the budgeted `presence`
  event from the SSE stream — and the code must be structured so that no other call site *can*
  reach the OS notification API. That is enforced by an architectural test, not by convention.

  ## FILES
  - `desktop/src/notifications/mod.rs` — the sole OS notification sink
  - `desktop/src/notifications/budget.rs` — client-side enforcement of quiet hours and opt-out
  - `client/src/presence/consumer.ts` — presence-event consumption and routing
  - `client/src/presence/settings.ts` — quiet hours, per-category opt-out, and their persistence
  - `client/src/platform/desktop.ts` — the notify method bound to the interface
  - `desktop/tests/arch_notification_sink.rs` — **the** single-sink enforcement: a Rust
    architectural test over the Rust crate, where the sink and every bypass risk actually live
  - `client/scripts/lint-notification-sink.mjs` — the **TS-side** lint only: asserts no TypeScript
    module reaches a notification API except through the platform interface. It makes no claim
    about Rust call sites and its name and header comment say so.
  - `contracts/aperture-presence-v1.md` — the presence-event contract as consumed by desktop
  - `docs/DESKTOP.md` — notification behaviour and settings, written for users

  ## APPROACH
  1. Ground in the KG for the presence/knock-budget implementation already in the assistant core
     and the Sprint B SSE `presence` event. **Consume the existing budget; do not reimplement
     or re-score it client-side.** The client's job is to honour the decision, plus apply the
     user's local quiet hours and opt-out as an *additional* filter — never as an override that
     lets more through.
  2. **Single sink, enforced in the language that owns it (D8).** Exactly one function in the
     desktop crate may call the OS notification API; every other path routes to it. The previous
     wording named `lint-notification-sink.mjs` — a Node script — as the enforcement for a
     property of **Rust** call sites, which it cannot see and therefore cannot enforce. Split the
     enforcement to match the languages:
     - **Rust (the real gate):** the OS notification call is made from one module-private function
       in `desktop/src/notifications/mod.rs`. Module-private visibility means the *compiler*
       enforces "exactly one caller path" (D8 prefers visibility over a test). On top of that,
       `desktop/tests/arch_notification_sink.rs` asserts that no other item in the crate
       references any OS notification API, so a later item cannot add a sibling sink by making it
       `pub(crate)`.
     - **TypeScript (a narrower claim):** `lint-notification-sink.mjs` asserts only that no TS
       module reaches a notification API except through the platform interface. It is documented,
       in its own header and in `docs/DESKTOP.md`, as covering the TS side only — so nobody reads
       a green JS lint as evidence about Rust.
     The same split governs the badge/attention surface in **APTR-187**, which extends the Rust
     architectural test rather than adding a second enforcement mechanism.
  3. Quiet hours are evaluated in the **user's local timezone**, with correct handling of ranges
     that cross midnight and of DST transitions (a repeated or skipped local hour must not open
     a gap in quiet hours).
  4. Opt-out is per category (assistant message, module event, build completion, media event,
     system) and defaults conservatively. A category with no explicit opt-in that the user has
     never seen must not start notifying loudly.
  5. Notification content passes through the assistant's voice (Soul Contract clause 1): the
     text is what the assistant said, not a templated "New message in Thread 4". A raw template
     is a render-failure fallback only, and is marked as such.
  6. Notification bodies must not leak content the user would not want on a lock screen — respect
     a "hide content in notifications" setting that shows presence without the message body.
  7. Clicking a notification routes through the **deep-link validator** (APTR-67), not a
     separate ad-hoc dispatcher — one validated entry path for every external activation.
  8. OS permission state is a capability: denied ⇒ report `unavailable` with a reason and a
     pointer to the OS setting; never nag, never retry-loop the permission prompt.
  9. Suppression and coalescing: a burst of budgeted events collapses into a single summary
     notification rather than a stack of toasts. Coalescing must never *increase* the number of
     knocks beyond what the budget approved.

  ## TEST PLAN
  - Unit: a presence event outside the budget produces **zero** OS notifications
  - Unit: quiet hours suppress delivery; the event is still available in-app
  - Unit: quiet-hours ranges crossing midnight, and DST spring-forward/fall-back, behave correctly
  - Unit: per-category opt-out suppresses only its category
  - Unit: "hide content" mode delivers a notification with no message body
  - **Rust** architectural test (`desktop/tests/arch_notification_sink.rs`): exactly one call site
    reaches the OS notification API, and it is module-private
  - JS lint: no TS module reaches a notification API outside the platform interface (TS side only)
  - Unit: notification activation dispatches through the APTR-67 validator
  - Verify no hardcoded IPs, hostnames, ports, org names, or absolute user paths in
    new/modified files
  - Negative: a module attempting to raise a notification directly (bypassing the presence
    stream) is **blocked**; adding a second **Rust** notification call site makes the Rust
    architectural test **FAIL**, and adding a direct TS notification call makes the JS lint **FAIL**
  - Negative: with OS notification permission denied, assert the capability reports `unavailable`
    and no retry-prompt loop occurs

  ## EDGE CASES
  - macOS Focus/Do Not Disturb already suppressing notifications — do not double-count or
    re-deliver on focus release; a suppressed knock is spent, not queued forever
  - Windows notification centre retaining a stale notification after the referenced thread is
    deleted — activation must fail gracefully to a "no longer available" surface
  - The app in the foreground with the thread already visible — suppress the OS notification;
    an in-app presence indicator is sufficient and the budget should not be spent
  - Clock change or timezone change while running — re-evaluate quiet hours on system clock
    events, not only at startup
  - A presence event arriving during reconnect backlog replay — deduplicate by event id so a
    resumed stream does not re-knock for events already delivered
  - Multiple windows open — one notification per event, not one per window

- **Acceptance criteria:**
  - [ ] OS notifications are raised only by budgeted `presence` events; no independent tray or local knock source
  - [ ] Exactly one OS-notification call site, module-private, enforced by a **Rust** architectural test; the JS lint covers the TS side only and says so
  - [ ] Quiet hours (local tz, midnight-crossing, DST-correct) and per-category opt-out honoured
  - [ ] Notification text carries the assistant's voice; templates are a render-failure fallback only
  - [ ] Activation routes through the deep-link validator; permission denial degrades to `unavailable` without nagging
  - [ ] Resumed-stream replay does not re-knock (dedupe by event id)
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README updated to document notification behaviour and settings

---

### APTR-69: Windows packaging — MSI and NSIS installers, code signing, SmartScreen, clean uninstall
- **Priority:** High
- **Labels:** aperture, desktop, windows, packaging, release, security
- **Agent:** codex
- **Estimate:** 8h
- **Blocked by:** APTR-61
- **Description:** Produce signed, installable Windows artifacts and the CI job that builds them
  reproducibly. **Both** installer formats ship, with distinct purposes: **NSIS per-user** is the
  primary published artifact (no administrator rights, installs into the per-user application
  directory, and — critically — is the format the auto-updater in APTR-71 can apply without an
  elevation prompt on every update); **MSI per-machine** ships as a secondary artifact for
  managed/multi-user deployment, where auto-update is deliberately disabled in favour of the
  administrator's own tooling. Shipping only per-machine would make auto-update require
  elevation forever; shipping only per-user would make Aperture undeployable in a managed
  environment. Both are cheap in the same build; the *default download* is the per-user NSIS.

  Code signing is **fail-closed**: a release build with signing material absent fails the build.
  It never silently emits an unsigned artifact, because an unsigned artifact that reaches a user
  is worse than a failed build — it trains users to click through SmartScreen.

  ## FILES
  - `desktop/packaging/windows/nsis/` — NSIS template overrides and install/uninstall hooks
  - `desktop/packaging/windows/wix/` — WiX fragments for the MSI (per-machine)
  - `desktop/packaging/windows/sign.ps1` — signing wrapper; reads material via the secret manager
  - `desktop/packaging/windows/verify.ps1` — post-build signature and integrity verification
  - `.gitea/workflows/release-windows.yml` — the Windows build/sign/verify/publish job
  - `desktop/packaging/reproducible.md` — the determinism recipe and known non-deterministic inputs
  - `docs/INSTALL.md` — the Windows section (fills the Sprint A placeholder)
  - `docs/SECURITY.md` — signing, SmartScreen reputation, and verification instructions for users

  ## APPROACH
  1. Ground in the KG for the fleet's existing release-workflow conventions and artifact
     publishing; reuse them rather than inventing a parallel release shape. Run `cortex_scope` —
     packaging is named as a risky scope in the epic.
  2. Build on a Windows host with the MSVC toolchain. Emit: NSIS per-user installer, MSI
     per-machine installer, and a portable unpacked build for inspection. Each artifact gets a
     SHA-256 checksum file, and a single signed manifest lists all artifacts with their digests.
  3. **Reproducibility**: pin the Rust toolchain and every dependency version, set
     `SOURCE_DATE_EPOCH` from the commit, strip or normalize embedded timestamps and paths, and
     ensure no absolute build-host path is embedded in the binary. A same-commit rebuild must
     produce identical digests for the unpacked payload; document any input that is genuinely
     non-deterministic (the signature and its timestamp) in `reproducible.md` and exclude it from
     the comparison rather than pretending it does not exist.
  4. **Signing**: sign the executable and both installers. Material comes from the secret manager
     by name (`APERTURE_WINDOWS_CODESIGN_CERT`, `APERTURE_WINDOWS_CODESIGN_CERT_PASSWORD`) and is
     never written to the workspace, never echoed, never passed on a command line where it could
     land in a process list. Use an RFC-3161 timestamp from `APERTURE_WINDOWS_TIMESTAMP_URL` so
     signatures remain valid after the certificate expires.
  5. **Fail closed**: if any signing input is absent in a release build, the job fails with a
     clear message. A separate, explicitly-labelled `dev-unsigned` build mode exists for local
     work; it refuses to publish, and its artifact filename carries the `-unsigned` marker so it
     cannot be mistaken for a release.
  6. **SmartScreen**: document the reputation reality honestly — a new signing identity accrues
     reputation over downloads and time, and an EV identity starts with reputation immediately.
     Do not attempt to work around SmartScreen. Ship consistent publisher metadata across every
     release (changing it resets reputation), publish checksums, and document for users exactly
     what a legitimate warning looks like and how to verify the signature themselves.
  7. **Uninstall cleanliness**: the uninstaller removes the application directory, Start-menu and
     desktop shortcuts, the deep-link scheme registration (APTR-67), the launch-at-login entry
     if set (APTR-66), and the update staging directory. It **prompts** about user data
     (configuration, caches) and defaults to keeping it. It **always** removes credentials from
     Credential Manager on an explicit "remove my data" choice, and never leaves an orphaned
     credential entry behind when the user asked for removal.
  8. Install and upgrade must not require the app to be running or force a reboot. An in-place
     upgrade over a running instance closes it cleanly (or refuses with a clear message) rather
     than corrupting the installation.

  ## TEST PLAN
  - CI: the Windows job builds NSIS, MSI, and portable artifacts and emits checksums for each
  - Verification: `verify.ps1` confirms every shipped binary and installer carries a valid,
    timestamped signature with the expected publisher identity
  - Reproducibility: build the same commit twice and assert the unpacked payload digests match
  - Integration on a clean Windows VM: per-user NSIS installs without administrator rights and
    launches to the first-run flow
  - Integration: MSI installs per-machine and launches for a second, non-installing user account
  - Uninstall test: after uninstall with "remove my data", assert zero residual files, shortcuts,
    scheme registrations, launch-at-login entries, and **zero** credential entries
  - Binary inspection: no absolute build-host path or username string embedded in the artifact
  - Verify no hardcoded IPs, hostnames, ports, org names, or absolute user paths in
    new/modified files, including the packaging templates
  - Negative: remove the signing secrets and confirm the release job **FAILS** rather than
    producing an unsigned artifact
  - Negative: tamper with a byte of a signed artifact and confirm verification **FAILS**

  ## EDGE CASES
  - A user upgrading from a per-user install to a per-machine install (or the reverse) — detect
    and refuse with an explanation rather than producing two parallel installations
  - Antivirus quarantining an unsigned dev build mid-CI — dev builds are clearly marked and never
    published; do not add an exclusion request to the pipeline
  - Certificate expiry mid-release-window — timestamping covers already-signed artifacts, but the
    job must fail clearly on an expired certificate rather than emitting an invalid signature
  - Long-path and non-ASCII usernames in the per-user install path — must work; do not assume
    an ASCII path
  - An upgrade while the app is running with unsaved drafts — close cleanly, preserving drafts
  - The publisher display name drifting between releases and resetting SmartScreen reputation —
    assert publisher metadata against an expected value in `verify.ps1`

- **Acceptance criteria:**
  - [ ] NSIS per-user (primary) and MSI per-machine (secondary) artifacts build in CI with checksums
  - [ ] Every binary and installer is signed and RFC-3161 timestamped; verification asserts publisher identity
  - [ ] Release build **fails closed** when signing material is absent; dev-unsigned builds cannot publish
  - [ ] Same-commit rebuild produces identical payload digests; non-deterministic inputs documented
  - [ ] Uninstall removes files, shortcuts, scheme registration, launch-at-login, and credentials on "remove my data"
  - [ ] No absolute build-host path or username embedded in any artifact
  - [ ] Secrets accessed via the secret manager, not env vars, and never echoed or written to the workspace
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass; `docs/INSTALL.md` Windows section complete

---

### APTR-70: macOS packaging — universal .app, DMG, hardened runtime, notarization and stapling
- **Priority:** High
- **Labels:** aperture, desktop, macos, packaging, release, security
- **Agent:** codex
- **Estimate:** 8h
- **Blocked by:** APTR-61
- **Description:** Produce a signed, notarized, stapled macOS application and the CI job that
  builds it. **Decision: one universal (arm64 + x86_64) binary in one `.app` in one DMG** —
  not two per-architecture artifacts. Justification: a single download removes the entire class
  of "user downloaded the Intel build onto Apple Silicon and it runs under translation, slowly,
  forever", it halves the notarization and support surface, it keeps the auto-update manifest
  single-target (APTR-71) instead of requiring architecture-aware update routing, and the cost —
  roughly double binary size — is small in absolute terms for a Tauri app that does not embed a
  browser runtime. The saving from thin binaries would be measured in tens of megabytes; the
  cost of arch-mismatched installs is measured in support incidents and silent performance
  complaints.

  Notarization is **fail-closed**: a release build without notarization credentials fails. An
  un-notarized `.app` is not shippable — Gatekeeper will refuse it and the only workaround is
  teaching users to bypass Gatekeeper, which is unacceptable.

  ## FILES
  - `desktop/packaging/macos/entitlements.plist` — the minimal entitlement set
  - `desktop/packaging/macos/Info.plist.in` — templated; identifier from `APERTURE_BUNDLE_IDENTIFIER`
  - `desktop/packaging/macos/sign.sh` — signing wrapper; material via the secret manager
  - `desktop/packaging/macos/notarize.sh` — submission, polling, and stapling
  - `desktop/packaging/macos/verify.sh` — signature, notarization, and Gatekeeper assessment checks
  - `desktop/packaging/macos/dmg/` — DMG layout and background asset (bundled, no external fetch)
  - `.gitea/workflows/release-macos.yml` — the macOS build/sign/notarize/staple/verify/publish job
  - `docs/INSTALL.md` — the macOS section (fills the Sprint A placeholder)
  - `docs/SECURITY.md` — entitlements rationale and user-side verification instructions

  ## APPROACH
  1. Ground in the KG for existing release conventions; run `cortex_scope` (packaging scope).
  2. Build both architecture slices and `lipo` them into a universal binary; assemble the `.app`;
     produce a DMG with a bundled background asset and an Applications symlink. Emit SHA-256
     checksums for the DMG and the zipped `.app`.
  3. **Entitlements are minimal and justified line by line** in `docs/SECURITY.md`. Enable the
     hardened runtime. Do **not** enable JIT, unsigned executable memory, library validation
     disabling, or `com.apple.security.cs.allow-dyld-environment-variables` unless the webview
     genuinely requires it — and if it does, document exactly why, because each of these is a
     hole in the runtime's defence. Request user-facing permissions (notifications, and network
     client access) and nothing else. No camera, microphone, location, contacts, or full-disk
     access — Aperture needs none of them, and requesting them would be both a privacy smell and
     a review risk.
  4. **Signing**: sign every nested binary, framework, and helper inside the bundle
     (inside-out ordering), then the bundle, then the DMG, with a Developer ID identity resolved
     by name from the secret manager (`APERTURE_MACOS_CODESIGN_IDENTITY`,
     `APERTURE_MACOS_CODESIGN_CERT`, `APERTURE_MACOS_CODESIGN_CERT_PASSWORD`,
     `APERTURE_APPLE_TEAM_ID`). Use a temporary, ephemeral keychain created for the job and
     destroyed on exit — never the host's login keychain, never a persisted keychain on a shared
     builder.
  5. **Notarization**: submit with API-key credentials (`APERTURE_APPLE_NOTARY_ISSUER_ID`,
     `APERTURE_APPLE_NOTARY_KEY_ID`, `APERTURE_APPLE_NOTARY_PRIVATE_KEY`) read via the secret
     manager, wait for the result, and **staple** the ticket to both the `.app` and the DMG so a
     first launch works without network access. A rejected submission fails the job and its log
     is fetched and surfaced — never retried blindly.
  6. **Fail closed**: absent signing or notarization material in a release build fails the job.
     A `dev-adhoc` local mode exists for development, is ad-hoc signed, is named with an explicit
     `-unsigned` marker, and cannot publish.
  7. **Reproducibility**: pin the toolchain, set `SOURCE_DATE_EPOCH`, normalize embedded paths,
     and assert a same-commit rebuild produces identical pre-signature payload digests. Document
     signature/notarization as the expected non-deterministic layer.
  8. The bundle identifier comes from `APERTURE_BUNDLE_IDENTIFIER` at build time — it is never a
     literal in the repo, because a literal identifier is both an org-identifying string and a
     value that must match the operator's signing identity to work at all.

  ## TEST PLAN
  - CI: the macOS job produces a universal `.app` and a DMG with checksums
  - Architecture assertion: the binary reports both `arm64` and `x86_64` slices
  - Verification: codesign verification passes with strict checks on the bundle and every nested
    binary; Gatekeeper assessment accepts the app
  - Stapling: notarization ticket is stapled and validates **with networking disabled**
  - Entitlement assertion: the effective entitlement set equals the documented minimal set — a
    superset fails the job
  - Reproducibility: same-commit rebuild produces identical pre-signature payload digests
  - Integration on a clean macOS host: DMG mounts, app installs by drag, and first launch reaches
    the first-run flow without a Gatekeeper warning
  - Verify no hardcoded IPs, hostnames, ports, org names, or absolute user paths in
    new/modified files, including plists and packaging scripts
  - Negative: remove the notarization credentials and confirm the release job **FAILS** rather
    than shipping an un-notarized artifact
  - Negative: add a disallowed entitlement (e.g. camera access) and confirm the entitlement
    assertion **FAILS**

  ## EDGE CASES
  - A nested helper binary left unsigned — inside-out signing order matters; strict verification
    must catch it, and the test must assert on a bundle that contains a nested binary
  - Notarization latency spikes — poll with a generous timeout and surface the submission id;
    never silently proceed to publish on a timeout
  - Stapling succeeding on the `.app` but not the DMG (or vice versa) — verify both independently
  - The bundle published to the update feed must ship **already stapled**, because APTR-71's
    self-applied swap can only preserve a ticket that is already there — it cannot staple one
  - Quarantine attribute behaviour differing between a DMG download and a zip download — test the
    DMG path, which is what ships
  - An Apple Silicon host producing an x86_64 slice that was never actually exercised — run at
    least a launch smoke test of the translated slice, or state explicitly in the PR body that it
    was not exercised
  - An expired or revoked Developer ID mid-window — fail clearly at signing rather than emitting
    an artifact Gatekeeper will reject on users' machines

- **Acceptance criteria:**
  - [ ] Universal (arm64 + x86_64) `.app` and DMG build in CI with checksums; both slices verified present
  - [ ] Hardened runtime enabled; effective entitlements equal the documented minimal set (superset fails)
  - [ ] Bundle, nested binaries, and DMG signed with a Developer ID from an ephemeral job keychain
  - [ ] Notarized and stapled; ticket validates with networking disabled
  - [ ] Release build **fails closed** without signing or notarization material; dev-adhoc builds cannot publish
  - [ ] Same-commit rebuild produces identical pre-signature payload digests
  - [ ] Secrets accessed via the secret manager, not env vars, and never written to a persisted keychain or the workspace
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass; `docs/INSTALL.md` macOS section complete

---

### APTR-71: Signed auto-update — manifest, staged rollout, rollback safety, and the release pipeline that feeds it
- **Priority:** Critical
- **Labels:** aperture, desktop, update, release, security
- **Agent:** claude
- **Estimate:** 8h
- **Blocked by:** APTR-69, APTR-70, APTR-72, APTR-181
- **Description:** Auto-update is the highest-privilege code path in the entire client: it
  fetches an artifact and runs it as the user. The governing rule, stated once and enforced
  everywhere, is **never auto-update to an unsigned or unverifiable artifact — fail closed,
  every time, with no override, no "trust this once", and no configuration flag that disables
  verification.** An update that cannot be verified is not applied, and the user is told the
  update was skipped and why.

  Sovereignty shapes the design: the update feed is served by **the user's own configured
  backend** (a BFF route), not a vendor endpoint or a CDN. The desktop app's only network peer
  remains the endpoint the user configured in APTR-63 — auto-update introduces no second door
  and no external egress, consistent with Module Contract clause 6.

  This item also owns the release side of that contract: the workflow that takes the signed
  artifacts from APTR-69/70, produces the signed update manifest, and publishes it with a
  staged rollout.

  ## FILES
  - `desktop/src/updater/mod.rs` — update check, download, verify, stage, apply
  - `desktop/src/updater/verify.rs` — signature and digest verification; the fail-closed core
  - `desktop/src/updater/rollout.rs` — staged-rollout cohort evaluation
  - `desktop/src/updater/rollback.rs` — health check after update and rollback to the prior version
  - `contracts/aperture-update-v1.md` — the manifest schema, signing scheme, and rollout semantics
  - `.gitea/workflows/release-publish.yml` — manifest generation, signing, and staged publication
  - `desktop/packaging/manifest/` — manifest templates and the signing wrapper
  - *(The BFF update-feed route and the artifact supply path are **not** in this item's files —
    they are owned by **APTR-181**, which this item is blocked by. They are no longer an unowned
    "sibling PR".)*
  - `docs/SECURITY.md` — the update threat model and the fail-closed rule, verbatim
  - `docs/INSTALL.md` — update behaviour, channels, and how to verify an update by hand

  ## APPROACH
  1. Ground in the KG for the fleet's existing signed-artifact and release-gate patterns; the
     constellation already runs signature verification fail-closed elsewhere and this must match
     that discipline rather than invent a weaker one. Run `cortex_scope` — this is the riskiest
     item in the sprint.
  2. **Manifest**: version, per-platform artifact entries (URL relative to the configured
     endpoint — never absolute, never a literal host), SHA-256 digest, artifact signature,
     minimum-supported-version, release notes reference, rollout cohort parameters, and a
     manifest-level signature over the whole document. The verification public key
     (`APERTURE_UPDATE_PUBLIC_KEY`) is **embedded at build time**; the private key
     (`APERTURE_UPDATE_SIGNING_PRIVATE_KEY`) lives only in the secret store and only the release
     job reads it.
  3. **Verification order, non-negotiable**: verify the manifest signature → verify the artifact
     digest → verify the artifact's own platform signature (Authenticode / codesign) → only then
     stage and apply. Every failure at any step aborts, deletes the staged artifact, records the
     reason, and surfaces "update skipped" to the user. There is no code path that applies an
     artifact that failed any check, and there is no setting that skips a check.
  4. **Downgrade and replay protection**: refuse a manifest with a version at or below the
     installed version unless it is an operator-signed explicit rollback record; include a
     monotonic manifest sequence and a freshness bound so a captured old manifest cannot be
     replayed to pin users to a vulnerable build.
  5. **Staged rollout**: each installation derives a stable cohort value from its own device
     identity (a local hash, not a server-assigned tracker — no telemetry, no per-install
     reporting). The manifest declares the rollout percentage; an installation outside the
     current cohort simply does not see the update yet. A "check for updates" user action
     bypasses the cohort gate, because a user explicitly asking should not be told to wait.
  6. **Rollback safety**: keep the previous version's payload until the new version has completed
     a successful launch-and-health check (starts, renders the shell, reaches the connection
     manager). Failure to pass the health check within a bounded number of attempts restores the
     previous version automatically and reports it. Never delete the fallback before the new
     version has proven itself.
  7. **Application timing**: never apply an update under a user's hands. Download and verify in
     the background, then apply on a user-approved restart or on next launch. On Windows the
     per-user NSIS install applies without elevation; the per-machine MSI install **disables**
     auto-update and defers to administrator tooling (stated in the manifest and enforced
     client-side). On Windows the apply step runs through the single sanctioned spawn path
     (`apply_verified_update()`, APTR-65) — the only place in the app that starts a process.

     **On macOS: stapling, stated correctly.** The previous wording — "atomic swap preserving the
     quarantine/stapling state" — was a category error twice over. A self-applied update is
     **not** quarantined (the quarantine attribute is applied by the *downloading* agent, e.g. a
     browser; an app updating itself does not set one and must not be written as if it inherits
     one), and a notarization ticket belongs to the **new** bundle, not the old one, so there is
     no old state to "preserve". The correct requirement: the staged bundle arrives from the feed
     **already stapled** by APTR-70's release job, its ticket is verified as part of the
     verification chain before staging, and the atomic swap **must not strip the ticket** —
     meaning the swap moves the bundle wholesale (rename/exchange of the bundle directory) and
     never rebuilds, re-zips, re-signs, or copies file-by-file in a way that drops the extended
     attributes carrying the ticket. Verify the ticket validates **with networking disabled**
     after the swap, which is the only check that proves the ticket actually survived.
  8. **Release notes are untrusted content.** The manifest's release-notes reference resolves to
     text rendered *inside the privileged shell*, so it goes through the same sanitized markdown
     pipeline as chat: no raw HTML, no inline event handlers, no remote image or asset load (the
     D5 click-to-load carve-out does not apply to shell chrome), and no script. A valid manifest
     signature proves provenance, not safety — a compromised backend serving a correctly signed
     manifest is exactly the threat the signature scheme exists to bound, so signed notes are
     still never rendered as HTML.
  9. Channels (`stable`, `beta`) are user-selectable and default to `stable`. A channel change
     never silently downgrades; it takes effect at the next equal-or-higher version.
  10. The release workflow signs the manifest, publishes artifacts and checksums, and sets the
     initial rollout percentage low with a documented ramp. Publication is the only step that
     touches the signing key, and it fails closed if the key is absent.

  ## TEST PLAN
  - Unit: manifest with an invalid signature is **rejected**, nothing staged, nothing applied
  - Unit: valid manifest with a mismatched artifact digest is **rejected**
  - Unit: valid manifest and digest, but an artifact whose platform signature fails verification,
    is **rejected** — this is the "verifiable but unsigned" case and must not slip through
  - Unit: verification order asserted explicitly; a test proves no apply path exists that skips a step
  - Unit: a manifest with a version at or below installed is refused; a replayed old manifest is
    refused on the freshness/sequence bound
  - Unit: cohort derivation is stable across restarts and reports nothing to the server
  - Integration: a new version that fails its post-update health check triggers automatic rollback
    to the previous version, and the app ends up usable
  - Integration: per-machine install reports auto-update disabled and never stages an artifact
  - Integration (macOS stapling): after the atomic swap, the **new** bundle's notarization ticket
    validates **with networking disabled** — proving the swap did not strip the ticket
  - Unit: release notes containing raw HTML, an inline event handler, a `javascript:` URL, and a
    remote image reference render inert through the sanitized markdown pipeline, even when the
    enclosing manifest signature is valid
  - Integration: the Windows apply path invokes `apply_verified_update()` (APTR-65) and no other
    process-spawn call site exists
  - Verify no hardcoded IPs, hostnames, ports, org names, or absolute user paths in
    new/modified files — manifest artifact references are endpoint-relative
  - Negative: attempt to apply an unsigned artifact by every reachable path (direct staging dir
    write, tampered manifest, downgraded manifest) and assert **every** path fails closed
  - Negative: assert no configuration key, environment variable, or build flag exists that
    disables signature verification

  ## EDGE CASES
  - Update downloaded but the machine is offline at apply time — apply is local; it must not
    require reaching the endpoint again
  - Power loss mid-apply — the swap must be atomic (staged then renamed) so a half-applied
    installation is impossible; on next launch either the old or the new version runs, never a mix
  - Two windows open and one triggers a restart-to-update — coordinate through the single-instance
    host, preserve drafts, and confirm with the user
  - A staged artifact left behind after a failed verification — always deleted, and asserted, so a
    partially-trusted artifact never lingers on disk
  - Disk full during download — fail cleanly, keep the current version, and do not leave a
    partial artifact that a later run might treat as complete (verify by digest, not by presence)
  - Clock skew defeating the manifest freshness bound — bound generously and treat failure as
    "skip this update", never as "apply anyway"
  - The user on a per-machine install clicking "check for updates" — inform them their
    installation is administrator-managed rather than silently doing nothing

- **Acceptance criteria:**
  - [ ] Manifest signature, artifact digest, and platform signature verified in that order before any apply, and **no** code path, config key, env var, or build flag can apply an unsigned or unverifiable artifact
  - [ ] Downgrade and manifest replay are refused; cohort-based staged rollout works with zero telemetry
  - [ ] Failed post-update health check rolls back automatically to the previous version
  - [ ] Update feed and artifacts are served by the user's configured endpoint; no external egress, no absolute URLs
  - [ ] Per-machine Windows installs disable auto-update and say so; apply is atomic, power-loss safe, and runs only via `apply_verified_update()`
  - [ ] macOS: the staged bundle ships stapled and the swap does not strip its ticket — validated with networking disabled
  - [ ] Release notes render through the sanitized markdown pipeline; a valid signature never authorizes HTML
  - [ ] Secrets via the secret manager with the signing key touched only by the publish job; no hardcoded infrastructure values; all existing tests still pass; `docs/SECURITY.md` states the fail-closed rule

---

### APTR-72: Operator — provision desktop code-signing, notarization, and update-signing material
- **Priority:** Critical
- **Labels:** aperture, desktop, human-action, secrets, release
- **Agent:** <operator>
- **Estimate:** 1h
- **Type:** human-action
- **Description:** The desktop release pipeline is deliberately fail-closed: without signing and
  notarization material it refuses to produce artifacts rather than producing unsigned ones.
  That material is operator-provisioned and cannot be created by an agent — it requires a
  purchased Windows code-signing identity, an Apple Developer Program identity, and a
  freshly-generated update-signing keypair. All of it is referenced by **name only** in the
  repo and in this spec; no value ever appears in a file, a workflow, a log, or a PR body.
  Until this item is done, APTR-69 and APTR-70 can be developed and tested in their explicitly
  marked unsigned/ad-hoc modes, and APTR-71 cannot publish at all.
- **Steps:**
  1. Obtain or confirm a Windows code-signing identity. An EV identity is strongly preferred: it
     carries SmartScreen reputation from the first release, where a standard OV identity must
     accrue reputation over downloads and time — which in practice means early users see a
     warning. Note the publisher display name chosen; it must stay identical across releases or
     SmartScreen reputation resets.
  2. Store the Windows material in the secret store under exactly these names:
     `APERTURE_WINDOWS_CODESIGN_CERT`, `APERTURE_WINDOWS_CODESIGN_CERT_PASSWORD`, and the
     RFC-3161 timestamp service under `APERTURE_WINDOWS_TIMESTAMP_URL`.
  3. Obtain or confirm an Apple Developer Program membership and a **Developer ID Application**
     certificate (not a Mac App Store certificate — Aperture ships outside the store). Store it
     as `APERTURE_MACOS_CODESIGN_CERT` with `APERTURE_MACOS_CODESIGN_CERT_PASSWORD`, the
     identity string as `APERTURE_MACOS_CODESIGN_IDENTITY`, and the team identifier as
     `APERTURE_APPLE_TEAM_ID`.
  4. Create a notarization API key and store it as `APERTURE_APPLE_NOTARY_ISSUER_ID`,
     `APERTURE_APPLE_NOTARY_KEY_ID`, and `APERTURE_APPLE_NOTARY_PRIVATE_KEY`. Prefer an API key
     over an app-specific password — it is scopeable and revocable without touching the account
     password.
  5. Generate a fresh update-signing keypair on a trusted machine. Store the private half as
     `APERTURE_UPDATE_SIGNING_PRIVATE_KEY` in the secret store, restricted to the release
     publish job only. Provide the public half as `APERTURE_UPDATE_PUBLIC_KEY` for build-time
     embedding — it is not a secret, but it **is** the root of trust for every future update, so
     record it somewhere durable. If it is lost, every installed client must be re-installed by
     hand to accept updates again.
  6. Decide and record the bundle identifier value for `APERTURE_BUNDLE_IDENTIFIER`. It must
     match the Apple Developer identity's namespace or signing will fail, and changing it later
     orphans keychain entries and update targeting.
  7. Confirm a Windows packaging host and a macOS packaging host are reachable by the release
     workflow. Neither target can be signed or notarized from the other OS.
  8. Confirm the release workflow reads every one of the above **through the secret manager** and
     that none appears in workflow files, job logs, process lists, or PR bodies. Spot-check one
     release job's log for leakage rather than assuming.
- **Notes for the executing agent:** do **not** attempt to create, purchase, self-sign, or
  substitute any of this material, and do **not** disable a signing or notarization step to get
  a green build. If a secret is absent, the correct outcome is the build failing closed and this
  item being surfaced as a blocker — an unsigned artifact reaching a user is a worse outcome
  than a red pipeline. Never write any of these values into a file, a commit, a comment, or a
  PR body; reference them by name only.

---

## Items added by the S128 decision round (APTR-180..189)

These close findings from the Fable review of this sprint and from `specs/S128-DECISIONS.md`.
**Their numbers are identifiers, not an ordering** (see Pre-flight): APTR-180 and APTR-181 in
particular are prerequisites of items numbered lower than they are. Read `Blocked by`, not the
number.

---

### APTR-180: Private-CA and certificate-pinning trust anchors for self-hosted TLS
- **Priority:** Critical
- **Labels:** aperture, desktop, security, tls, connection
- **Agent:** claude
- **Estimate:** 7h
- **Blocked by:** APTR-63
- **Description:** Required by **D10 item 13**. The audience for this client is people running a
  MooseNet backend on their own hardware, and a large share of them terminate TLS with a private
  CA, an internal step-CA, or a self-signed leaf. APTR-63 correctly refuses to offer "continue
  anyway" — but refusal with no sanctioned alternative is not security, it is a support incident
  that ends with the user terminating TLS badly or abandoning the app. The review names this the
  **#1 real-world first-run failure** for this audience, and today the spec has nothing.

  This item adds the sanctioned path: a **per-profile trust anchor** — either an imported CA
  certificate or a pinned leaf SPKI hash — presented with its fingerprint for the user to
  verify out-of-band at the moment they configure the endpoint, stored with the profile, and
  scoped to that profile alone. What it deliberately does **not** add, in any form, is a global
  "disable certificate verification" switch, an "accept all", a "remember this bad cert", or a
  per-request override. Verification is never disabled; the set of things it verifies against is
  what the user extends, deliberately, once, with the fingerprint in front of them.

  ## FILES
  - `desktop/src/tls/mod.rs` — trust-anchor store and the custom certificate verifier
  - `desktop/src/tls/anchor.rs` — anchor types (CA certificate, pinned SPKI hash), parsing, and
    fingerprint computation
  - `desktop/src/tls/store.rs` — per-profile anchor persistence in the OS app-config directory
  - `desktop/src/commands/tls.rs` — the narrow command surface: list, add-after-confirm, remove
  - `client/src/connection/trust.ts` — the trust-anchor client state and its capability wiring
  - `client/src/screens/FirstRun/TrustAnchor/` — the fingerprint-confirmation UI
  - `contracts/aperture-platform-v1.md` — trust-anchor method semantics and failure modes
  - `docs/SECURITY.md` — the trust model, what pinning does and does not protect against
  - `docs/INSTALL.md` — the self-hosted-TLS section, written for a user with a private CA

  ## APPROACH
  1. Ground in the KG for the existing HTTP client construction in the desktop crate and any
     prior custom-verifier work in the fleet; run `cortex_scope` — a certificate verifier is
     security-critical by definition and a wrong one silently disables TLS.
  2. Two anchor kinds, both explicit, no third: **(a) a CA certificate** the user imports, which
     is added to the trust store **for that profile only** and used to build a normal chain — full
     hostname and validity checking still applies; **(b) a pinned leaf SPKI hash**, which matches
     the presented leaf's public-key hash and is the right tool for a self-signed leaf that will
     be rotated by the same operator.
  3. **The verifier is additive, never subtractive.** The platform trust store still applies; an
     anchor adds a path to success, and no anchor ever suppresses expiry checking, hostname
     verification, basic-constraints checking, or signature validation. There is no code path in
     which a certificate error is converted into a success by anything other than a matching,
     user-confirmed anchor for that specific profile.
  4. **Fingerprint confirmation is the security boundary.** On a certificate failure the UI shows
     the presented chain's subject, issuer, validity window, and a SHA-256 fingerprint in a
     readable grouped form, and states plainly that the user must confirm this fingerprint
     **through a channel other than this connection** — because an attacker in the path controls
     everything shown on screen. The accept action is not the default focus and is not reachable
     by pressing Enter through the dialog.
  5. Anchors are **per profile**, keyed by profile id and endpoint host-shape. Adding an anchor
     for one profile grants nothing to another, and switching profiles switches the verifier's
     anchor set. Two profiles at the same host-shape do not share anchors.
  6. Rotation and expiry: an anchor that no longer matches is a failure, not a silent re-prompt
     loop. The user is told the anchor no longer matches, shown both fingerprints (stored and
     presented), and must explicitly replace it — an anchor is never auto-updated to whatever is
     currently presented, which would defeat pinning entirely.
  7. Anchors are public certificate material, not secrets: they live in app config, not the
     keychain. They are still enumerated by the uninstall/remove-my-data paths (APTR-69, APTR-186)
     so removal is complete.
  8. Everything logged about a certificate failure goes through the APTR-185 redacting subscriber:
     fingerprints and subjects are fine, the full endpoint is not.

  ## TEST PLAN
  - Unit: a self-signed leaf fails without an anchor; succeeds with a matching pinned SPKI hash;
    still fails with a non-matching one
  - Unit: a certificate signed by an imported private CA validates; the **same** certificate with
    a wrong hostname still **fails** (anchors do not suppress hostname verification)
  - Unit: an expired certificate fails even with a matching CA anchor present
  - Unit: fingerprint computation is stable and matches an independently computed SHA-256
  - Unit: anchors are profile-scoped — an anchor added to profile A does not validate profile B
  - Integration: first-run against a private-CA endpoint completes end to end after confirmation
  - Verify no hardcoded IPs, hostnames, ports, org names, or absolute user paths in new/modified
    files — anchors are user-supplied at runtime, never bundled
  - **Negative:** grep the tree and assert **no** global verification-disable exists — no
    `danger_accept_invalid_certs`-shaped call, no accept-all verifier, no config key, env var, or
    build flag that turns verification off; adding one **FAILS** the test
  - **Negative:** a rotated certificate not matching the stored anchor is **rejected** and the
    stored anchor is **not** silently replaced

  ## EDGE CASES
  - A user pasting a certificate chain in the wrong order or with stray whitespace — parse
    strictly and reject with a specific reason, never partially accept
  - An anchor imported for a host-shape the profile later stops using — orphaned anchors are shown
    in settings and removable; they are never applied to a different host
  - A CA certificate that is actually a public CA the platform already trusts — accept, but tell
    the user it was already trusted so they do not believe pinning is active when it is not
  - An intermediate-only import (no root) — detect and explain rather than failing opaquely later
  - Clock skew making a valid certificate look expired — distinguish this failure from an
    untrusted-issuer failure in the message; they have different fixes
  - Anchor storage corrupted or unreadable — treat as absent (fail closed to normal verification),
    never as "trust everything"

- **Acceptance criteria:**
  - [ ] Per-profile trust anchors supported as an imported CA certificate or a pinned leaf SPKI hash
  - [ ] Verification is additive only: hostname, expiry, and chain checks still apply with an anchor present
  - [ ] Fingerprint shown for out-of-band confirmation; accept is not the default action
  - [ ] Anchors are profile-scoped and enumerated by the remove-my-data paths
  - [ ] Anchor mismatch on rotation is rejected and never auto-replaced (negative test)
  - [ ] **No** global verification-disable exists in any form — asserted by a tree-wide negative test
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] `docs/SECURITY.md` and `docs/INSTALL.md` document the self-hosted-TLS trust model

---

### APTR-181: Update feed — BFF route, and how signed artifacts reach an arbitrary self-hosted backend
- **Priority:** Critical
- **Labels:** aperture, desktop, update, bff, release, supply-chain
- **Agent:** claude
- **Estimate:** 6h
- **Description:** Closes the review defect that APTR-71's update feed was a "sibling PR in the
  agent-core repo" with no item, no owner, and no acceptance criteria — a Critical item depending
  on unscheduled work. It also answers the question the spec never answered: the feed is served by
  the *user's own* backend (correct, and required by Module Contract clause 6), but nothing said
  **how a signed manifest and its artifacts get from the release job onto a stranger's
  self-hosted deployment.** Without that, APTR-71 is testable only against the operator's own
  machine and every other user's update feed is empty forever.

  This item owns both halves: the BFF route that serves the feed, and the ingestion path that
  fills it.

  ## FILES
  - `bff/src/routes/updates.rs` — the update-feed route: manifest and artifact serving
  - `bff/src/updates/ingest.rs` — the ingestion job that fetches and verifies a release bundle
  - `bff/src/updates/store.rs` — local cache of verified manifests and artifacts
  - `bff/src/updates/verify.rs` — **server-side** manifest signature verification before serving
  - `contracts/aperture-update-v1.md` — extended with the feed route shape and the ingestion contract
  - `docs/INSTALL.md` — how an operator enables, disables, or manually seeds the update feed
  - `docs/SECURITY.md` — why the backend verifies before serving even though the client verifies again

  ## APPROACH
  1. Ground in the KG for the BFF's existing route conventions and its `terminus-client` usage;
     run `cortex_scope` — this is supply-chain code.
  2. **Two ingestion modes, both operator-controlled, neither on by default:**
     - **Pull:** the backend periodically fetches the signed release bundle (manifest + artifacts
       + checksums) from the project's public release location, at an interval and source the
       operator configures by name. This is the only outbound fetch in the whole design and it is
       the backend's, not the client's — the desktop app still has exactly one network peer.
     - **Manual seed:** the operator drops a downloaded release bundle into a configured directory
       and the same verification path ingests it. This is the offline/air-gapped answer and it
       must work with no outbound network at all.
  3. **Verify server-side before serving, not merely before applying.** The BFF checks the manifest
     signature against the same public key the client embeds, and each artifact's digest, before
     anything enters the served cache. This does not replace client verification — the client
     still verifies everything itself, because the backend is not trusted for this — it means a
     tampered bundle is rejected once, centrally, rather than by every client separately after a
     wasted download.
  4. The route serves manifest and artifacts at **endpoint-relative** paths so APTR-71's manifest
     entries stay relative and no absolute URL ever appears. The route is unauthenticated only if
     the deployment says so; default is authenticated, because an update feed is a fingerprinting
     surface (consistent with APTR-63's pre-auth minimality).
  5. **A deployment that has never ingested a bundle serves an explicit empty feed**, not a 404 and
     not an error. The client renders "no updates available from this backend" — an honest state,
     not a broken one. The operator is told, in `docs/INSTALL.md`, that this is expected until
     they enable ingestion.
  6. Ingestion is **fail-closed and non-destructive**: a bundle that fails verification is
     discarded and never replaces the currently-served one, so a bad publish cannot empty a
     working feed. Failures are surfaced to the operator, not silently retried forever.
  7. Serving respects the rollout parameters in the manifest as-published; the BFF does **not**
     rewrite, re-sign, or re-cohort the manifest. It is a cache and a verifier, never an author —
     if it could re-sign, the user's backend would become a second root of trust.

  ## TEST PLAN
  - Unit: a manifest with an invalid signature is **rejected** at ingest and never cached
  - Unit: a manifest whose artifact digest does not match the fetched artifact is **rejected**
  - Unit: manual-seed ingestion succeeds with **zero** outbound network access
  - Integration: a deployment with no ingested bundle returns an explicit empty feed, not an error
  - Integration: a failed ingest leaves the previously-served bundle intact and serving
  - Unit: served manifest bytes are byte-identical to the ingested ones — no rewrite, no re-sign
  - Verify no hardcoded IPs, hostnames, ports, org names, or absolute user paths in new/modified
    files — the pull source is a configured name, artifact paths are endpoint-relative
  - **Negative:** attempt to serve an artifact whose digest does not match its manifest entry and
    confirm the route **refuses**
  - **Negative:** assert no code path lets the BFF sign or re-sign a manifest, and that the
    update-signing private key is not readable by the BFF at all

  ## EDGE CASES
  - Ingest running concurrently with a client download — serve from an immutable committed version,
    never from a directory being written into
  - A partially downloaded artifact during pull — verify by digest before commit; presence on disk
    is never evidence of completeness
  - Disk pressure on the backend — bound the cache to a configured number of retained versions and
    evict oldest-first, but never evict the version a rollback might need
  - The public release source unreachable — the existing feed keeps serving; this is a warning, not
    an outage, and never causes the feed to empty
  - An operator seeding a bundle for a different product or an older contract version — reject on
    the manifest's product and contract fields rather than serving a mismatched artifact
  - Two backends behind one deployment — ingestion must be idempotent and safe to run on both

- **Acceptance criteria:**
  - [ ] BFF update-feed route serves manifest and artifacts at endpoint-relative paths, authenticated by default
  - [ ] Two ingestion modes: operator-configured periodic pull, and manual seed that works fully offline
  - [ ] Manifest signature and artifact digests verified **server-side before serving**; client verification unchanged
  - [ ] A backend with no ingested bundle serves an explicit empty feed, never an error
  - [ ] Failed ingest is non-destructive — the previously-served bundle keeps serving
  - [ ] The BFF never rewrites, re-cohorts, or re-signs a manifest, and cannot read the signing key (negative test)
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] `docs/INSTALL.md` documents enabling, seeding, and the expected empty-feed default

---

### APTR-182: First-run migration from the web client — adopt this session, or pair a new device
- **Priority:** High
- **Labels:** aperture, desktop, onboarding, session, continuity
- **Agent:** claude
- **Estimate:** 5h
- **Blocked by:** APTR-63, APTR-64
- **Description:** Closes a MISSING finding: **this is the very first thing the operator will do.**
  Every user of the desktop app arrives already using the web client, and the spec never said
  what happens to their existing session. Two answers were possible and the ambiguity had to be
  resolved rather than left to the implementing agent.

  **Decision: the desktop is always a NEW device pairing. It never adopts an existing web
  session.** Reasons, in order of weight: a session cookie is scoped to the browser and cannot be
  handed to a native client without exporting credential material through a channel neither side
  controls; per **D1** the two targets do not even use the same credential *kind* (cookie vs
  bearer), so there is nothing shared to adopt; and per-device revocation (APTR-64, D6) is only
  meaningful if desktop and browser are distinct devices — adopting a session would make revoking
  the laptop's browser silently kill the desktop app too.

  What the user actually experiences must not feel like starting over, and that is the work in
  this item: pairing is short, the endpoint is pre-filled where it can be discovered honestly, and
  **conversation history, memory, traits, and relationship lore are the server's, not the
  device's** — so the new device shows the same assistant, mid-relationship, on first launch.

  ## FILES
  - `client/src/screens/FirstRun/Pairing/` — the pairing flow and its explanatory copy
  - `client/src/connection/pairing.ts` — pairing state and the device-registration call
  - `desktop/src/commands/pairing.rs` — the Rust side: receive and store the issued credential
  - `client/src/screens/FirstRun/copy.ts` — the strings, in the assistant's voice, in the catalogue
  - `docs/INSTALL.md` — "I already use Aperture in a browser" section
  - `docs/DESKTOP.md` — the device model and why desktop is a separate device

  ## APPROACH
  1. Ground in the KG for Sprint B's device registration and revocation model; reuse it exactly —
     this item registers a device, it does not define a second device concept. Run `cortex_scope`
     (auth scope).
  2. Pairing uses Sprint B's existing device-registration flow: the user authenticates once in the
     desktop app against the endpoint they configured in APTR-63, and a device-scoped credential
     is issued and stored per APTR-64. No credential is ever copied from the browser, exported,
     pasted, or transported through a QR code that encodes a token.
  3. **Endpoint pre-fill is honest, never guessed.** If the user launched the desktop app from a
     deep link the web surface generated (APTR-67), the endpoint travels in that link as an
     endpoint *identifier to confirm*, shown to the user for confirmation before use — never
     silently applied, and never accompanied by a credential (APTR-67 already forbids that).
     Otherwise the field starts empty. There is no probing, no scanning, and no "try this first".
  4. **Continuity is the whole point (Soul Contract clause 4).** First launch after pairing shows
     existing threads, memory, and the assistant's current traits — because those live server-side.
     The assistant does **not** greet the user as a stranger. If any state is genuinely
     device-local and therefore absent (window layout, local drafts), say so plainly rather than
     presenting a blank slate as if the history were gone.
  5. The web session is **untouched**: pairing a desktop device does not log the browser out,
     invalidate its session, or alter it in any way. The user ends with two devices, both listed
     in device management, each independently revocable.
  6. Explain the model in one short screen, in the assistant's voice: this is a new device, here
     is what it can see, here is how to remove it later. Users who understand the device model do
     not panic about "why do I have to log in again".

  ## TEST PLAN
  - Integration: pair a desktop device against an endpoint with an existing web session; assert
    the web session remains valid and both devices appear in device management
  - Unit: a deep-link-supplied endpoint is presented for confirmation and not applied silently
  - Unit: a pairing link carrying anything credential-shaped is **rejected** (APTR-67 validator)
  - Integration: first launch after pairing renders existing threads and current assistant traits
  - Unit: revoking the desktop device does not affect the web session, and vice versa
  - Verify no hardcoded IPs, hostnames, ports, org names, or absolute user paths in new/modified files
  - **Negative (continuity):** pair a new desktop device and assert assistant memory, traits, and
    relationship lore are unchanged and no reset call was issued to any backend
  - **Negative:** assert **no** code path reads, imports, or accepts a browser cookie, exported
    session blob, or pasted token as a desktop credential

  ## EDGE CASES
  - A user with several browser sessions pairing several desktops — every device is independent;
    no device count limit is invented here that Sprint B does not already define
  - Pairing interrupted midway (app closed at the auth step) — no half-registered device is left
    behind server-side, and relaunch restarts pairing cleanly
  - The user pairing against the wrong profile by habit — the active profile is named on the
    pairing screen, per APTR-63's always-visible-profile rule
  - A deep link from a *different* deployment than the configured profile — treat as a profile
    proposal requiring explicit confirmation, never an automatic switch (APTR-67 forbids the switch)
  - Reinstalling the desktop app — this is a new pairing and must be described as one, but the
    conversation history is unchanged because it was never device-local

- **Acceptance criteria:**
  - [ ] Desktop first run is always a new device pairing; no session, cookie, or token is ever adopted from a browser (negative test)
  - [ ] Pairing leaves the existing web session valid; both devices are listed and independently revocable
  - [ ] Endpoint pre-fill only from a deep link, shown for explicit confirmation, never silently applied or guessed
  - [ ] First launch after pairing shows existing threads, memory, and current traits — no blank slate, no stranger greeting
  - [ ] Continuity preserved across pairing (negative test); device-local absences are stated honestly
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] `docs/INSTALL.md` and `docs/DESKTOP.md` explain the device model to a web user

---

### APTR-183: Proxy environments — honour the OS proxy, and fail loudly rather than looking like an outage
- **Priority:** Medium
- **Labels:** aperture, desktop, network, connection, diagnostics
- **Agent:** claude
- **Estimate:** 4h
- **Blocked by:** APTR-63
- **Description:** Closes a MISSING finding. Corporate and school networks put an HTTP proxy in
  front of everything, and the review's point is the real risk: **silent failure here looks
  exactly like "the backend is down"**, sending the user to debug the wrong machine.

  **Decision, stated rather than left implicit: system proxy configuration is SUPPORTED;
  PAC-script evaluation and proxy authentication are explicitly NOT supported in v1.** The
  supported part is cheap — the platform HTTP client already reads the OS proxy settings, so this
  is mostly about not fighting it and about reporting it. The unsupported parts are declined for
  stated reasons: a PAC script is arbitrary JavaScript that would have to be evaluated inside a
  security-hardened process (directly against APTR-65's posture), and proxy authentication means
  prompting for and storing a *second* credential class with its own storage, lifetime, and
  revocation story that nothing in this sprint models. Both are declined loudly, with a specific
  diagnostic, not silently.

  ## FILES
  - `desktop/src/net/proxy.rs` — OS proxy detection, client configuration, and the unsupported-case classifier
  - `desktop/src/net/client.rs` — the shared HTTP client construction (proxy + APTR-180 anchors)
  - `client/src/connection/diagnostics.ts` — proxy state surfaced in the connection UI
  - `docs/INSTALL.md` — the proxy section: what is supported, what is not, and what to do instead
  - `docs/DESKTOP.md` — proxy behaviour in the connection model

  ## APPROACH
  1. Ground in the KG for existing HTTP client construction in the fleet; build **one** client
     configuration path shared by REST, SSE, and the updater, so proxy behaviour cannot differ
     between them — a proxy that works for REST and not for SSE is the worst version of this bug.
  2. Read the OS proxy configuration through the platform's own mechanism and apply it. Honour the
     standard proxy-bypass list so a loopback or LAN endpoint is not sent through the proxy.
  3. **Classify and name the unsupported cases** rather than failing generically: if the system is
     configured with a PAC/auto-config script, or the proxy answers with an authentication
     challenge, the connection manager enters a distinct state with a specific message naming the
     proxy as the cause and stating that it is unsupported — never the generic "backend
     unreachable" surface, which would point the user at the wrong machine.
  4. Proxy state is visible in the connection diagnostics surface: whether a proxy is in use, and
     whether the current failure is attributable to it. Values are redacted through APTR-185's
     layer to host-shape only.
  5. A proxy performing TLS interception presents a certificate the client will not trust. That is
     the APTR-180 case and must route to it — the user may add the interception CA as a
     per-profile anchor if they choose. There is still no verification-disable.
  6. Nothing here introduces a configuration key for a proxy address inside Aperture. The OS owns
     proxy configuration; duplicating it would create two sources of truth that disagree.

  ## TEST PLAN
  - Unit: an OS-configured proxy is applied identically to the REST client, the SSE client, and the updater
  - Unit: a bypass-list entry matching the endpoint results in a direct connection
  - Unit: a PAC/auto-config configuration produces the specific unsupported-proxy state, not the generic offline state
  - Unit: a `407`-style proxy authentication challenge produces the specific unsupported state with an actionable message
  - Unit: a TLS-intercepting proxy surfaces as the APTR-180 trust-anchor flow, not as a generic failure
  - Verify no hardcoded IPs, hostnames, ports, org names, or absolute user paths in new/modified files
  - **Negative:** assert Aperture defines **no** proxy address configuration key of its own, and
    that no proxy value is written to any log at more than host-shape redaction
  - **Negative:** assert an unsupported proxy case never presents as "backend unreachable"

  ## EDGE CASES
  - Proxy configuration changing while the app runs (laptop moving between networks) — re-read on
    network-change events rather than only at startup
  - A proxy that permits REST but breaks long-lived SSE connections — detect the pattern and say
    so specifically; this is a common and very confusing failure
  - A loopback endpoint on a machine with a system-wide proxy — must connect directly via the
    bypass list, not through the proxy
  - Conflicting proxy settings between OS-level and shell-level configuration — the platform
    mechanism is the single source of truth; do not merge them
  - A proxy silently returning a captive-portal page instead of the API — the APTR-63 descriptor
    check already rejects a non-Aperture response; report it as an interception, not as a bad endpoint

- **Acceptance criteria:**
  - [ ] OS proxy configuration honoured identically by REST, SSE, and the updater, with bypass-list support
  - [ ] PAC evaluation and proxy authentication are explicitly unsupported, with the reasons documented
  - [ ] Unsupported and proxy-attributable failures get a distinct, specific state — never generic "backend unreachable" (negative test)
  - [ ] TLS-intercepting proxies route to the APTR-180 anchor flow; no verification-disable is introduced
  - [ ] Aperture defines no proxy address key of its own; proxy values are redacted in logs
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] `docs/INSTALL.md` states what is supported, what is not, and the workaround

---

### APTR-184: Draft persistence — one owner, durable across crash, restart, and update
- **Priority:** High
- **Labels:** aperture, desktop, drafts, persistence, ux
- **Agent:** claude
- **Estimate:** 4h
- **Blocked by:** APTR-62
- **Description:** Closes a MISSING finding: drafts are referenced by APTR-63 ("preserved as a
  draft"), APTR-69 ("preserving drafts" on upgrade), and APTR-71 ("preserve drafts" on
  restart-to-update) — **and owned by none of them**. Three items promise a durability guarantee
  that no item implements. This item owns it.

  A draft is **user content, not a credential**: it belongs in local app-data, not the keychain,
  and it is exactly the kind of thing "remove my data" must delete. The guarantee is narrow and
  testable: a draft survives an unexpected process death, a clean restart, and an applied update,
  and is never confused with a sent message.

  ## FILES
  - `client/src/drafts/store.ts` — per-thread draft state and the debounced persistence policy
  - `client/src/platform/index.ts` — the draft persistence methods on the platform interface
  - `desktop/src/commands/drafts.rs` — Rust-side atomic persistence in app-data
  - `client/src/drafts/__tests__/` — durability and lifecycle tests
  - `contracts/aperture-platform-v1.md` — draft method semantics and durability guarantees
  - `docs/DESKTOP.md` — where drafts live, how long they last, and how to remove them

  ## APPROACH
  1. Ground in the KG for Sprint C's composer state; drafts are its persistence layer, not a
     second composer. Reuse the existing draft *concept* if Sprint C defined one and extend it.
  2. Drafts are **per thread**, keyed by thread id, plus one scratch draft for the not-yet-created
     thread case. Storage is the OS app-data directory on desktop and the platform's own storage
     on web — one interface, two implementations, per APTR-62.
  3. **Atomic writes only**: temp file plus rename, so a crash mid-write leaves either the previous
     draft or the new one, never a truncated file. A corrupt draft file is treated as absent and
     logged once — never fatal, never surfaced as a scary error.
  4. Persistence is **debounced, not per-keystroke**, with a bounded interval and a forced flush on
     window blur, window close, restart-to-update (APTR-71), and app quit. The forced flush on the
     update path is what makes APTR-69/71's "preserving drafts" promise true rather than aspirational.
  5. A draft is cleared **only** when its message is confirmed sent by the server, or when the user
     explicitly discards it. A failed or aborted send restores the draft with its text intact — a
     send failure must never eat what the user typed.
  6. Drafts are **not** synced to the server and not shared between devices in v1: they are local
     by design, which keeps them out of the server's message store and out of the multi-device
     conflict problem entirely. Say this in `docs/DESKTOP.md` so the absence reads as a decision.
  7. Drafts are enumerated by uninstall and "remove my data" (APTR-69, APTR-186) and by the D6
     offline-purge-on-logout requirement — a revoked device must not keep the user's unsent words.
  8. Draft content is user content and never goes to a log at any level, redacted or otherwise.

  ## TEST PLAN
  - Unit: a draft round-trips per thread and does not leak between threads
  - Unit: writes are atomic — a simulated crash mid-write leaves a valid previous or new state
  - Unit: a corrupt draft file is treated as absent and does not throw
  - Integration: kill the process mid-composition, relaunch, and assert the draft is intact
  - Integration: apply an update with an unsent draft present and assert it survives the restart
  - Unit: a failed send restores the draft rather than discarding it
  - Verify no hardcoded IPs, hostnames, ports, org names, or absolute user paths in new/modified files
  - **Negative:** assert draft content appears in **no** log output at any level
  - **Negative:** assert logout/revocation and "remove my data" delete every draft file, verified
    by filesystem scan rather than by a success return code

  ## EDGE CASES
  - Two windows composing in the same thread — last writer wins per thread with a visible
    indication, never a silent merge that scrambles both
  - A very large pasted draft — bound the stored size and tell the user, rather than writing an
    unbounded file into app-data
  - A draft for a thread deleted server-side — retain locally but mark orphaned; offer to discard
    rather than silently dropping the user's text
  - Disk full at flush time — surface it in-app; a draft that cannot be persisted must not be
    reported as persisted
  - The debounce interval racing an immediate quit — the forced flush on quit is not optional and
    must complete before the process exits

- **Acceptance criteria:**
  - [ ] Drafts are per-thread, persisted atomically to app-data through the platform interface
  - [ ] Drafts survive process kill, clean restart, and an applied update (integration tests)
  - [ ] Drafts clear only on confirmed send or explicit discard; a failed send restores the text
  - [ ] Drafts are local-only by decision, documented as such, and never written to any log (negative test)
  - [ ] Logout/revocation and remove-my-data delete every draft, verified by filesystem scan
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] `docs/DESKTOP.md` documents draft location, lifetime, and removal

---

### APTR-185: Log lifecycle — one redacting subscriber, bounded rotation, and a cross-crate guarantee
- **Priority:** High
- **Labels:** aperture, desktop, logging, privacy, observability
- **Agent:** claude
- **Estimate:** 5h
- **Blocked by:** APTR-61
- **Description:** Closes a MISSING finding. Several items say things are "logged locally at debug
  level" with the endpoint "redacted", but **nothing owns rotation, size caps, location, or the
  redaction guarantee across crates**. The review states the failure mode precisely: ten items
  each log carefully, and one of them does not. A redaction guarantee that lives in ten places is
  not a guarantee.

  One subscriber, installed once in the host process, with a redacting layer every crate's output
  passes through, bounded rotating files in app-data, and a CI test that proves it.

  ## FILES
  - `desktop/src/logging/mod.rs` — the single `tracing` subscriber installed at process start
  - `desktop/src/logging/redact.rs` — the redacting layer: endpoints, tokens, and secret-shaped fields
  - `desktop/src/logging/rotate.rs` — bounded rotating file appender in app-data
  - `desktop/tests/log_redaction.rs` — the cross-crate redaction test
  - `client/src/logging/bridge.ts` — the TS-side bridge routing client logs through the same sink
  - `docs/SECURITY.md` — the redaction guarantee and its known limits
  - `docs/DESKTOP.md` — where logs live, how large they get, and how to remove them

  ## APPROACH
  1. Ground in the KG for the fleet's existing `tracing` conventions and reuse them; do not mint a
     parallel logging vocabulary.
  2. **Exactly one subscriber**, installed once in `main.rs` before anything else can log. No crate
     installs its own, and no crate writes to a file directly. The single-installation property is
     enforced by module-private construction (D8: visibility over test where possible), so a second
     installation does not compile.
  3. **The redacting layer is the boundary, not the call sites.** It reduces any endpoint-shaped
     value to scheme+host-shape, replaces anything matching the token/key/password/secret shape
     with a redaction marker, and drops known-sensitive fields entirely. Call sites are *allowed*
     to be careless; the layer is what makes the guarantee, which is the only structure that
     survives ten items written by different agents.
  4. Draft and message **content is never logged at any level** — not redacted, not truncated,
     not at trace. It is excluded by the layer, not by discipline.
  5. **Bounded rotation**: files in the OS app-data log directory, capped per-file size and a
     capped number of retained files, oldest evicted. Logs never grow unbounded and never land
     outside app-data. Default level is conservative; verbose levels are opt-in per session and do
     not persist across restarts, so nobody leaves debug logging on for a year.
  6. The TS side bridges into the same sink rather than using the platform console in release, so
     one rotation policy and one redaction layer cover both languages.
  7. Logs are enumerated by uninstall and remove-my-data (APTR-69, APTR-186) and are the input to
     the connection diagnostics surface. There is **no** upload path, no crash reporter, and no
     external egress from logging — sovereignty, asserted rather than assumed.

  ## TEST PLAN
  - Unit: the redacting layer reduces an endpoint to scheme+host-shape and marks token-shaped values
  - Unit: message and draft content passed to a log macro is dropped, not merely truncated
  - Unit: rotation evicts oldest files and respects the per-file and total caps
  - Integration: run a full session (configure, pair, chat, update check) and grep the produced log
    files for the token value, the full endpoint, and message content — **zero** hits
  - Unit: verbose level does not persist across a restart
  - Verify no hardcoded IPs, hostnames, ports, org names, or absolute user paths in new/modified files
  - **Negative:** attempt to install a second subscriber, or write to a log file directly from
    another module, and confirm it **does not compile** / the architectural test **FAILS**
  - **Negative:** assert **no** log upload, crash-report submission, or external network egress
    exists anywhere in the logging path

  ## EDGE CASES
  - A log emitted before the subscriber is installed — installation happens first in `main`, and a
    test asserts no logging macro is reachable earlier
  - A panic message containing a secret — the panic hook routes through the same redaction layer
  - Log directory unwritable (permissions, read-only volume) — degrade to in-memory ring buffer for
    the diagnostics surface and tell the user; never crash, never fall back to a writable temp path
    outside app-data
  - A structured field whose *name* is innocuous but whose value is a token — the layer matches on
    value shape as well as field name, because field names cannot be trusted across ten crates
  - Very high event volume during a reconnect storm — rate-limit the sink so logging cannot become
    the reason the app is slow

- **Acceptance criteria:**
  - [ ] Exactly one subscriber, installed once, enforced so a second installation does not compile
  - [ ] Redaction happens in the layer, not at call sites: endpoints reduced to host-shape, token-shaped values marked
  - [ ] Message and draft content never logged at any level (negative test)
  - [ ] Bounded rotating files in app-data only; verbose level does not persist across restart
  - [ ] Full-session integration run produces logs with zero token, full-endpoint, or content hits
  - [ ] No log upload, crash report, or external egress exists in the logging path (negative test)
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] `docs/SECURITY.md` states the guarantee and its limits; `docs/DESKTOP.md` says where logs live

---

### APTR-186: macOS uninstall — "Remove Aperture from this Mac…" with the same semantics as Windows
- **Priority:** Medium
- **Labels:** aperture, macos, uninstall, privacy, parity
- **Agent:** claude
- **Estimate:** 4h
- **Blocked by:** APTR-70, APTR-184, APTR-185
- **Description:** Closes a MISSING finding. APTR-69 gives Windows a careful uninstaller with a
  "remove my data" choice; macOS gets drag-to-trash, which removes the bundle and **orphans
  everything else** — keychain items, application support data, the launch-at-login agent, the
  deep-link scheme registration, trust anchors, drafts, logs, and the update staging directory.
  The result is that the strictest of the two platforms in every other respect has the weakest
  data-removal story.

  This item adds an in-app "Remove Aperture from this Mac…" action (plus a documented `--uninstall`
  invocation for scripted removal) that enumerates and removes **exactly** what this sprint's items
  wrote — nothing more, nothing less — mirroring the Windows semantics including the
  keep-or-remove-my-data choice.

  ## FILES
  - `desktop/src/uninstall/mod.rs` — the removal orchestration and its enumerated target list
  - `desktop/src/uninstall/targets.rs` — the single registry of everything the app writes, by owner item
  - `desktop/src/uninstall/macos.rs` — macOS removal: keychain, app support, login item, scheme, staging
  - `client/src/screens/Settings/RemoveApp/` — the confirmation UI and its honest copy
  - `desktop/tests/uninstall_completeness.rs` — the completeness test
  - `docs/INSTALL.md` — the macOS removal section
  - `docs/DESKTOP.md` — what "remove my data" means, per platform

  ## APPROACH
  1. Ground in the KG for APTR-69's Windows uninstall enumeration and **share the target
     registry** — one list, two platform implementations. Two independently maintained lists is
     precisely how an orphaned keychain item survives for a year.
  2. The registry is derived from what the sprint's items actually write: keychain entries
     (APTR-64), endpoint profiles and window state (APTR-61/63), trust anchors (APTR-180), drafts
     (APTR-184), logs (APTR-185), update staging and retained versions (APTR-71), the login item
     (APTR-66), and the deep-link scheme registration (APTR-67). Each entry names its owning item,
     so a future item that writes something new has an obvious place to declare it.
  3. **Two-tier removal, matching Windows**: remove the app and its machinery, and *separately*
     ask about user data, defaulting to **keeping** it. "Remove my data" is the explicit choice
     that clears keychain entries, profiles, drafts, and logs.
  4. Removal is **local only and never server-side.** It does not revoke the device (the user may
     have chosen to remove the app, not to end their relationship with the assistant), does not
     delete threads, and never resets memory, traits, or lore. If the user *also* wants the device
     revoked, that is a separate, explicitly labelled action — conflating them would let an
     uninstall quietly destroy server-side history.
  5. Removal verifies rather than assumes: after each target, read back and confirm absence, and
     report anything that could not be removed with a specific reason instead of claiming success.
  6. The action cannot remove the running bundle from under itself — sequence the bundle removal
     last, via a detached step, and make partial completion safe to re-run. Re-running on an
     already-clean system is a no-op, not an error.
  7. A macOS `--uninstall` flag performs the same enumeration non-interactively for scripted or
     managed removal, with an explicit flag required to include user data.

  ## TEST PLAN
  - Integration on macOS: install, configure, pair, compose a draft, then remove **with** "remove my
    data" and assert zero residual keychain items, profiles, anchors, drafts, logs, staging files,
    login item, and scheme registration
  - Integration: remove **without** "remove my data" and assert user data remains while machinery is gone
  - Unit: the target registry is shared with the Windows implementation — a target added for one
    platform is enumerated by both
  - Unit: re-running removal on a clean system is a no-op and reports success, not an error
  - Unit: a target that cannot be removed is reported specifically, not swallowed
  - Verify no hardcoded IPs, hostnames, ports, org names, or absolute user paths in new/modified files
  - **Negative:** assert removal issues **no** server-side call — no revoke, no delete, no memory,
    trait, or lore reset (continuity preserved; reinstall and re-pair restores the same relationship)
  - **Negative:** add a new written-target to one platform only and confirm the completeness test **FAILS**

  ## EDGE CASES
  - The app removed by drag-to-trash without ever running the action — document the leftovers and
    make the `--uninstall` path work from a re-downloaded copy
  - Keychain locked at removal time — prompt once, and if declined report exactly what remains
    rather than reporting a clean removal
  - Multiple user accounts on one Mac — removal is per-user; never touch another account's data
  - A profile added after the app was last updated — enumeration is dynamic over the store, not a
    snapshot taken at build time
  - Removal interrupted midway — safe to re-run, with the bundle removal sequenced last

- **Acceptance criteria:**
  - [ ] In-app "Remove Aperture from this Mac…" plus a documented `--uninstall` invocation
  - [ ] Target registry shared with the Windows uninstaller; a one-platform addition fails the completeness test
  - [ ] Two-tier removal matching Windows: machinery always, user data only on explicit choice (default keep)
  - [ ] With "remove my data": zero residual keychain items, profiles, anchors, drafts, logs, staging, login item, scheme
  - [ ] Removal is local only — no revoke, no server-side delete, no memory/trait/lore reset (negative test)
  - [ ] Removal verifies by read-back and reports what it could not remove; re-running is a safe no-op
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] `docs/INSTALL.md` documents macOS removal and what each choice deletes

---

### APTR-187: Badge, dock bounce, and attention requests are presence transports, not a second channel
- **Priority:** High
- **Labels:** aperture, desktop, soul-contract, presence, notifications
- **Agent:** claude
- **Estimate:** 3h
- **Blocked by:** APTR-68
- **Description:** Closes a MISSING finding with direct Soul Contract weight. APTR-68 governs OS
  notifications strictly, but **badges, dock bounces, taskbar flashes, and attention requests are
  notifications by another name** and are currently unregulated. Nothing in the spec stops a later
  item adding an unread-count badge or a `requestUserAttention()` call, which would be a second
  knock channel routed around the presence budget — a direct violation of the presence-budget
  clause, achieved without touching the notification code at all.

  **Decision: these surfaces exist, but they are budget-governed exactly like notifications.** A
  badge is set only by a budgeted `presence` event and cleared on read; dock bounce and attention
  requests are *critical-category only* and are subject to quiet hours and opt-out. A locally
  computed unread count may never drive any of them, because a local count is precisely the
  independent knock source the Soul Contract forbids.

  ## FILES
  - `desktop/src/notifications/attention.rs` — badge, dock bounce, and attention-request surfaces,
    routed through the APTR-68 sink module
  - `desktop/tests/arch_notification_sink.rs` — **extended** (not duplicated) to cover these APIs
  - `client/src/presence/settings.ts` — badge and attention opt-out, defaulting conservatively
  - `contracts/aperture-presence-v1.md` — badge/attention semantics as presence transports
  - `docs/DESKTOP.md` — what the badge means and how to turn it off

  ## APPROACH
  1. Ground in the KG for the APTR-68 sink and **extend it** — badge and attention calls live
     behind the same module-private sink, so the existing Rust architectural test covers them by
     construction rather than needing a parallel mechanism (D8).
  2. The badge value is derived from budgeted `presence` events only. There is no path from a
     local unread count, a thread-list computation, or an SSE message count to the badge. Adding
     one fails the extended architectural test.
  3. The badge clears on read of the referenced content, and on nothing else — never on a timer,
     never on app focus alone if the content was not actually read.
  4. Dock bounce, taskbar flash, and attention requests are reserved for the **critical** presence
     category, honour quiet hours and per-category opt-out, and default **off**. A repeated bounce
     for the same event is forbidden — one attention request per budgeted event, maximum.
  5. Coalescing follows APTR-68's rule: collapsing events must never increase the number of
     attention-grabbing actions beyond what the budget approved.
  6. Every surface here is a capability: platforms differ in what they expose, and an unavailable
     surface reports `unavailable` with a reason rather than silently no-opping (APTR-62's rule).

  ## TEST PLAN
  - Unit: a locally computed unread count produces **zero** badge changes
  - Unit: a budgeted presence event sets the badge; reading the referenced content clears it
  - Unit: quiet hours suppress dock bounce and attention requests; the badge follows the same opt-out
  - Unit: one budgeted event produces at most one attention request, and coalescing never increases the count
  - Extended Rust architectural test: badge/bounce/attention APIs are reachable only from the single sink
  - Verify no hardcoded IPs, hostnames, ports, org names, or absolute user paths in new/modified files
  - **Negative:** add a `setBadgeCount(unread)`-style call outside the sink and confirm the extended
    architectural test **FAILS**
  - **Negative:** assert an unavailable attention surface reports `unavailable` and does not silently no-op

  ## EDGE CASES
  - The OS clearing the badge itself (user dismissed it) — do not fight it or re-set it; a spent
    knock is spent
  - Multiple windows open — one badge for the app, not one per window
  - A presence event whose referenced content is deleted before it is read — clear the badge rather
    than leaving a permanent count pointing at nothing
  - Platform differences in badge semantics (numeric vs dot) — expressed as a capability, never as
    an OS constant in shared code (APTR-62's no-two-OS-assumption rule)
  - A reconnect replaying already-delivered presence events — dedupe by event id, per APTR-68, so
    the badge does not re-inflate

- **Acceptance criteria:**
  - [ ] Badge, dock bounce, taskbar flash, and attention requests route through the single APTR-68 sink
  - [ ] Badge is driven only by budgeted presence events; a local unread count can never set it (negative test)
  - [ ] Attention-grabbing surfaces are critical-category only, quiet-hours-aware, opt-out-able, and default off
  - [ ] The extended Rust architectural test fails on any badge/attention call site outside the sink
  - [ ] Unavailable surfaces report `unavailable` with a reason rather than no-opping silently
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] `docs/DESKTOP.md` documents badge meaning and how to disable it

---

### APTR-188: Idle, lock, and sleep behaviour for the in-memory credential, plus optional app auto-lock
- **Priority:** High
- **Labels:** aperture, desktop, security, session, idle
- **Agent:** claude
- **Estimate:** 5h
- **Blocked by:** APTR-64
- **Description:** Closes a MISSING finding. APTR-64 defines an in-memory credential mode for when
  the OS credential store is unavailable, but never says what happens to it across an OS lock,
  sleep, hibernate, or a long idle — and never says whether the app itself locks. On a device that
  holds a lifelong AI relationship, "the laptop was locked but the transcript was on screen" is a
  real exposure, and an in-memory token surviving hibernate is a different risk than one surviving
  a screensaver.

  This item states the behaviour explicitly for each case and adds an opt-in app auto-lock.

  ## FILES
  - `desktop/src/session/idle.rs` — OS idle, lock, sleep, and wake event subscription
  - `desktop/src/session/lock.rs` — app lock state and credential lifecycle across it
  - `desktop/src/credentials/memory.rs` — extended: zeroize-on-lock behaviour for the in-memory mode
  - `client/src/session/lockscreen.tsx` — the in-app lock surface
  - `client/src/session/settings.ts` — auto-lock timeout and behaviour settings
  - `docs/SECURITY.md` — the idle/lock threat model and each decision
  - `docs/DESKTOP.md` — user-facing description of auto-lock

  ## APPROACH
  1. Ground in the KG for APTR-64's credential abstraction and Sprint B's session lifetime; run
     `cortex_scope` (auth scope).
  2. **In-memory credential (APTR-64 fallback mode), stated per event:** it survives a screen lock
     and a short idle (the session is still live and the user is still there); it is **zeroized on
     hibernate/suspend-to-disk**, because a memory image written to disk is exactly the plaintext-
     on-disk outcome APTR-64 exists to prevent; and it is zeroized on app lock and on quit.
     Zeroization uses the same zeroize-on-drop discipline as D7's vault cache.
  3. **App auto-lock is opt-in and off by default**, with a configurable idle timeout. When locked:
     message content is hidden behind the lock surface, notification content is suppressed
     (presence still shows, per APTR-68's hide-content mode), and the in-memory credential is
     cleared. Keychain-backed credentials are *not* deleted — unlocking re-reads them, which is the
     whole point of having a keychain.
  4. **Locking never ends the server-side session or the assistant relationship.** It is a local
     display and credential-access boundary only. Continuity is asserted by negative test: lock,
     unlock, and the same conversation, memory, traits, and lore are present.
  5. Unlock re-authenticates against whatever the credential situation allows: keychain-backed
     unlocks with the OS credential store (optionally gated on user presence where the platform
     offers it — Touch ID / Windows Hello, opt-in, and a capability so a failure to register
     degrades honestly rather than locking the user out); in-memory mode requires full re-auth,
     because there is nothing left to unlock with, and the UI says so plainly instead of failing
     mysteriously.
  6. Sleep/wake is otherwise the APTR-63 `reconnecting` path, not an error state. This item adds
     only the credential and lock semantics on top of it.
  7. Idle detection uses OS idle signals, not a JS timer in the webview — a webview timer is
     throttled when backgrounded and would produce an auto-lock that fires late or never.

  ## TEST PLAN
  - Unit: in-memory credential survives screen lock and short idle; is zeroized on hibernate, app
    lock, and quit — asserted by inspecting the zeroized buffer, not by a return code
  - Unit: auto-lock is off by default; when enabled it fires on the configured OS idle threshold
  - Unit: locking clears the in-memory credential but does **not** delete keychain entries
  - Unit: while locked, message content is hidden and notification content is suppressed
  - Integration: lock, unlock via the keychain, and resume the same session without re-pairing
  - Unit: user-presence gating is a capability — a platform without it reports `unavailable` and
    does not block unlocking
  - Verify no hardcoded IPs, hostnames, ports, org names, or absolute user paths in new/modified files
  - **Negative (continuity):** lock and unlock, and assert assistant memory, traits, and relationship
    lore are unchanged and no server-side session end or reset was issued
  - **Negative:** assert no credential material remains readable in process memory after zeroization
    on the hibernate path

  ## EDGE CASES
  - Hibernate on a machine where the OS gives no suspend-to-disk signal — prefer the conservative
    reading and zeroize on the general suspend signal rather than assuming it was only a sleep
  - Auto-lock firing mid-composition — the draft is flushed by APTR-184 before the lock surface
    appears; unsent text is never lost to a lock
  - A stream in flight at lock time — the connection is held per D3's refcount rules, not killed,
    so locking a laptop does not cancel a generation another device is also watching
  - The user disabling auto-lock while locked — settings are not reachable from the lock surface
  - Biometric enrolment changing (a new fingerprint added) — treat the presence gate as invalidated
    and require full re-auth, per the platform's own re-enrolment semantics
  - A clock jump making the idle timer fire immediately on wake — clamp to a sane minimum rather
    than locking the instant the lid opens

- **Acceptance criteria:**
  - [ ] In-memory credential behaviour stated and tested per event: survives lock/idle, zeroized on hibernate, app lock, and quit
  - [ ] Opt-in app auto-lock, off by default, driven by OS idle signals rather than a webview timer
  - [ ] Locking hides content and suppresses notification bodies, and clears in-memory credentials without deleting keychain entries
  - [ ] Optional user-presence unlock gating is a capability that degrades honestly, never a lockout
  - [ ] Locking never ends the server-side session; continuity preserved across lock/unlock (negative test)
  - [ ] Zeroization verified by memory inspection, not by return code (negative test)
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] `docs/SECURITY.md` and `docs/DESKTOP.md` document the idle/lock model

---

### APTR-189: Accessibility of the Rust-owned native chrome — tray, menus, notifications, first-run
- **Priority:** High
- **Labels:** aperture, desktop, accessibility, a11y, native
- **Agent:** claude
- **Estimate:** 5h
- **Blocked by:** APTR-63, APTR-66, APTR-68
- **Description:** Closes a MISSING finding with a clear ownership gap: **Sprint G covers the
  accessibility of the web bundle, and nothing covers the native chrome this sprint invents.** The
  tray menu, the application menu bar, OS notifications, the first-run window, and the lock surface
  are all Rust-owned or window-level surfaces that a web accessibility audit does not reach. For a
  resident assistant that a user may rely on precisely *because* it is always available, an
  unreachable tray is not a cosmetic gap.

  ## FILES
  - `desktop/src/tray.rs`, `desktop/src/menu.rs` — accessible labels, roles, and accelerator exposure
  - `desktop/src/windows.rs` — window titles, roles, and focus order on creation
  - `desktop/src/a11y/mod.rs` — the accessibility helpers and the naming rules for native items
  - `desktop/tests/a11y_native.rs` — the automated native-chrome accessibility assertions
  - `client/src/screens/FirstRun/` — focus management and announcement for the first-run flow
  - `docs/ACCESSIBILITY.md` — the desktop section: what is covered, what is verified manually, and how
  - `docs/DESKTOP.md` — keyboard reachability of every native surface

  ## APPROACH
  1. Ground in the KG for Sprint G's accessibility criteria and **reuse its standard and
     vocabulary** rather than defining a desktop-specific bar. The target is the same; only the
     surfaces differ.
  2. **Every native item carries an accessible name.** Tray icon, tray menu entries, menu-bar
     items, and window titles are named — never icon-only with no label, never a name that is just
     the app name repeated. Names come from the centralized string catalogue, so they are
     translatable and consistent with the UI's own wording rather than a second set of strings.
  3. **Keyboard reachability is the hard requirement.** Every action available from the tray must
     also be reachable without a pointer — via the menu bar, an accelerator, or the in-app command
     surface. A tray-only action is an accessibility failure and fails the test, because the tray
     is the least keyboard-reachable surface on both platforms.
  4. First-run and the lock surface get explicit **focus management**: focus lands on the first
     meaningful control, focus is trapped within the modal surface, state changes (probing,
     failure, success) are announced to assistive technology rather than only shown visually, and
     the certificate-fingerprint dialog from APTR-180 in particular must be readable and confirmable
     without sight of a fingerprint's visual grouping.
  5. Notification content must be usable by screen readers, which means the assistant's text rather
     than an opaque template, and the "hide content" mode must still announce *that* something
     arrived rather than being silently invisible.
  6. Respect OS accessibility preferences: reduced motion (no animated tray states or window
     transitions), increased contrast (tray icons legible in high-contrast themes, already partly
     covered by APTR-66), and larger text where the native surface honours it.
  7. Automate what can be automated (accessible names present, keyboard reachability of every
     registered action, focus order on window creation) and **state honestly** in
     `docs/ACCESSIBILITY.md` what requires manual verification with a real screen reader on each
     platform — an accessibility claim that was never tested with the actual assistive technology
     is a claim, not a result.

  ## TEST PLAN
  - Automated: every tray entry, menu item, and window has a non-empty accessible name sourced from
    the string catalogue
  - Automated: every action in the APTR-66 registry is reachable without a pointer — a tray-only
    action fails the suite
  - Automated: first-run and lock surfaces place initial focus on a meaningful control and trap focus
  - Unit: reduced-motion preference disables tray and window animation
  - Manual (documented, per platform): screen-reader pass over tray, menu bar, first-run,
    notification activation, and the fingerprint dialog, with results recorded in `docs/ACCESSIBILITY.md`
  - Verify no hardcoded IPs, hostnames, ports, org names, or absolute user paths in new/modified files
  - **Negative:** add a tray entry with no accessible name, and a tray-only action with no keyboard
    path, and confirm the suite **FAILS** for both
  - **Negative:** assert the "hide content" notification mode still announces arrival rather than
    producing a silent, invisible event

  ## EDGE CASES
  - A tray icon in the OS overflow area, unreachable by keyboard on some configurations — the
    documented relaunch/menu path from APTR-66 is the accessible fallback and must be tested as one
  - Accelerators colliding with assistive-technology shortcuts — detect and fall back rather than
    registering and silently failing (APTR-66 already requires collision handling; this asserts it)
  - A notification arriving while a screen reader is mid-announcement — do not interrupt; queue
  - Platform screen readers differing in how they expose menu-bar items — verify on both, and record
    which was verified rather than generalizing from one
  - First-run failure states (bad endpoint, certificate failure) announced only visually — every
    connection-state transition that the user must act on is announced

- **Acceptance criteria:**
  - [ ] Every tray entry, menu item, and window has an accessible name from the centralized string catalogue
  - [ ] Every registered action is keyboard-reachable; a tray-only action fails the suite (negative test)
  - [ ] First-run, certificate-fingerprint, and lock surfaces manage and trap focus and announce state changes
  - [ ] Notification content is screen-reader usable; hide-content mode still announces arrival (negative test)
  - [ ] OS reduced-motion and high-contrast preferences honoured by the native chrome
  - [ ] Automated checks in CI on both hosts; manual screen-reader results recorded per platform
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] `docs/ACCESSIBILITY.md` covers the desktop chrome and states what is manually verified
