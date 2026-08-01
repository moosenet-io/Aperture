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
- **Estimated total:** ~79h
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
- Baseline verify: the Sprint C web surface builds and serves; desktop adds no new BFF route
  except the update feed introduced in APTR-71

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
  - `client/package.json` — a `build:desktop` script that emits the *same* bundle with the
    desktop platform adapter registered
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
  4. Register the desktop platform adapter (APTR-62) at bundle entry via a build-time flag, so
     `client/src` contains exactly one entrypoint and zero `if (isDesktop)` branches in screens.
     Platform branching is legal in exactly one directory and nowhere else; APTR-62 lints it.
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
  - Client bundle hash comparison: assert the bundle embedded in the desktop artifact is
    byte-identical to the bundle the web target ships for the same commit
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
  - [ ] Desktop hosts the same React bundle as web; bundle bytes verified identical per commit
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
  7. A shared conformance test suite runs against both implementations, asserting that each
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
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README updated to document the platform abstraction and how to add a method
  - [ ] All existing tests still pass

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
  3. **Probe before accept**: hit the BFF's capability/health surface through the generated SDK
     and show the user what they connected to (server name, version, available modules) before
     persisting. A mistyped endpoint should fail *at configuration time* with a clear reason,
     not three screens later as a broken chat.
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
     **draft**, labelled as such, and sent only on an explicit user action after reconnect.
  8. All state transitions are logged locally at debug level with the endpoint **redacted to
     scheme+host-shape only**; never write a full endpoint or any token into a log.

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
  - Negative (continuity): configure profile A, hold a conversation, switch to profile B and
    back; assert assistant memory, traits, and relationship lore are unchanged and no
    reset/clear call was issued to any backend

  ## EDGE CASES
  - A DNS-resolvable but wrong endpoint (some other service answering) — the capability probe
    must reject a response that is not a valid Aperture BFF descriptor, rather than half-loading
  - An endpoint reachable at configure time and unreachable at launch — launch into `offline`
    with the cached shell, never into the first-run flow (which would look like data loss)
  - Certificate errors on an encrypted endpoint — surface as a distinct, honest failure with no
    "continue anyway" that silently disables verification
  - Clock skew causing a session to appear expired immediately after a successful probe — treat
    as an auth failure with a clear message, never as an endpoint failure
  - Laptop sleep/wake and network-interface changes — treat as a normal transition to
    `reconnecting`, not as an error state requiring user action
  - A profile deleted while it is the active profile — fall back to explicit re-selection, never
    to an implicit "first profile in the list"

- **Acceptance criteria:**
  - [ ] No default, fallback, or literal server address exists anywhere in the desktop or client tree
  - [ ] First run validates, probes, and shows what it connected to before persisting the endpoint
  - [ ] Multiple named profiles supported, with the active profile always visible in the UI
  - [ ] Backend unreachable renders the cached shell with an explicit stale marker — never a white window
  - [ ] Offline drafts are preserved as drafts and never appear sent; no fabricated replies
  - [ ] Continuity preserved across profile switches and re-runs of first run (negative test)
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README and `docs/INSTALL.md` updated to document the connection model

---

### APTR-64: Secure credential storage via the OS keychain — never a plaintext token on disk
- **Priority:** Critical
- **Labels:** aperture, desktop, security, secrets
- **Agent:** claude
- **Estimate:** 6h
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
  6. **Never surface a secret to the webview.** The webview receives an opaque handle plus
     "have credentials: yes/no"; the Rust side attaches credentials to outbound requests. This
     is the difference between a webview compromise costing a session and costing the token
     itself. If the architecture makes this impractical for a given call path, the item must
     say so explicitly in the PR body rather than quietly downgrading.
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
  - Negative: with the OS credential store unavailable, assert the app does **not** persist
    credentials to any file and requires re-auth after relaunch
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
  - [ ] Credentials stored in Windows Credential Manager and macOS Keychain via one abstraction
  - [ ] Zero plaintext credential material in any file, cache, or log — verified by filesystem grep
  - [ ] Keychain unavailable ⇒ in-memory only + re-auth on relaunch; never a disk fallback
  - [ ] Secret types redact in `Debug`/`Display`; zero `std::env::var` of secret-shaped names
  - [ ] Deletion on logout/forget verified by read-back, and keychain items are non-synchronizable
  - [ ] Continuity preserved across logout and re-auth (negative test)
  - [ ] Secrets accessed via the secret manager, not env vars
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass

---

### APTR-65: Desktop security hardening — CSP, minimum capabilities, IPC reduction, webview containment
- **Priority:** Critical
- **Labels:** aperture, desktop, security, hardening
- **Agent:** claude
- **Estimate:** 7h
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
  - `desktop/src/security/mod.rs` — the hardening module and its startup assertions
  - `desktop/tests/security_posture.rs` — the posture test suite (the enforcement)
  - `client/scripts/assert-csp.mjs` — asserts the built bundle needs no inline script or eval
  - `docs/SECURITY.md` — the desktop threat model and every hardening decision, with rationale
  - `.gitea/workflows/ci.yml` — wire the posture suite into CI

  ## APPROACH
  1. Ground in the KG and run `cortex_scope` — this is a security-critical scope and the epic
     requires it. Consult `kg_rules` for learned rules on fail-closed enforcement; the
     constellation's own history is explicit that allowlists beat denylists here.
  2. **Capabilities are an allowlist of the APTR-62 command list, enumerated one by one.** No
     wildcards, no whole-plugin grants, no `fs` scope broader than the specific app-data
     subdirectories the app writes, no `shell` execute capability at all. `shell.open` is
     permitted only through the validated open-external path (APTR-67's validator), never raw.
  3. **CSP**: `default-src 'self'`; no `unsafe-inline`, no `unsafe-eval`, no remote origin in any
     directive, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'none'`,
     `form-action 'none'`. `connect-src` is `'self'` plus the *configured* endpoint injected at
     runtime from the connection manager — never a literal in the config file. Assert that the
     built bundle requires no inline script (Sprint A's build already forbids external hosts;
     this extends the same discipline into the shell).
  4. **Navigation guard**: intercept every navigation and window-open request. Same-origin
     app-resource navigations proceed; everything else is blocked and, if it is a legitimate
     user-initiated external link, handed to the OS browser through the validated open-external
     path. A page inside the webview must not be able to relocate the shell.
  5. Disable devtools in release builds; keep them behind an explicit debug build flag, not a
     runtime toggle a page could reach.
  6. Remove or refuse every unused IPC surface: no generic invoke passthrough, no eval-shaped
     command, no command accepting an arbitrary filesystem path, no command that reflects its
     input into a shell argument. Every command validates its arguments at the boundary and
     returns typed errors — the argument validator is the trust boundary, not the caller.
  7. **Startup posture assertions**: on launch (debug and release), assert the effective CSP,
     capability list, and devtools state match the expected posture, and refuse to start if they
     do not. A misconfigured release build should fail loudly on the developer's machine, not
     ship quietly.
  8. Add a supply-chain gate for the desktop crate: a dependency vulnerability scan that
     **fails closed** on a missing or malformed report (absence is never read as zero), matching
     the Sprint A audit gate's discipline. Accepted advisories carry an in-file rationale.

  ## TEST PLAN
  - `desktop/tests/security_posture.rs`: asserts the capability list equals the enumerated
    command list exactly — a superset fails
  - Posture test: CSP contains no `unsafe-inline`, no `unsafe-eval`, and no remote origin literal
  - Posture test: devtools disabled in release configuration
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

  ## EDGE CASES
  - A dependency that injects an inline style or script at build time — the CSP assertion must
    run against the built bundle, not the source, or it will pass and then fail on a user's machine
  - `connect-src` needing the runtime-configured endpoint — inject at window creation from the
    connection manager, and re-apply on profile switch; never widen to `*` as a shortcut
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
  - [ ] CSP has no `unsafe-inline`, no `unsafe-eval`, and no remote origin; asserted in CI on both hosts
  - [ ] Navigation and window-open to non-local origins are blocked; external links go to the OS browser via a validated path
  - [ ] Devtools disabled in release; no runtime toggle reachable from page content
  - [ ] Every command validates arguments at the boundary; path traversal rejected (negative test)
  - [ ] Desktop dependency audit fails closed on a missing or malformed report
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] `docs/SECURITY.md` documents the threat model and every hardening decision

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
  - `client/scripts/lint-notification-sink.mjs` — the single-sink enforcement lint
  - `contracts/aperture-presence-v1.md` — the presence-event contract as consumed by desktop
  - `docs/DESKTOP.md` — notification behaviour and settings, written for users

  ## APPROACH
  1. Ground in the KG for the presence/knock-budget implementation already in the assistant core
     and the Sprint B SSE `presence` event. **Consume the existing budget; do not reimplement
     or re-score it client-side.** The client's job is to honour the decision, plus apply the
     user's local quiet hours and opt-out as an *additional* filter — never as an override that
     lets more through.
  2. Exactly one function in the desktop crate may call the OS notification API. Every other
     path routes to it. `lint-notification-sink.mjs` fails on any other call site.
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
  - Architectural test: exactly one call site reaches the OS notification API
  - Unit: notification activation dispatches through the APTR-67 validator
  - Verify no hardcoded IPs, hostnames, ports, org names, or absolute user paths in
    new/modified files
  - Negative: a module attempting to raise a notification directly (bypassing the presence
    stream) is **blocked**, and the single-sink lint **FAILS** if such a call site is added
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
  - [ ] Exactly one OS-notification call site, enforced by lint and an architectural test
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
- **Blocked by:** APTR-69, APTR-70, APTR-72
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
  - **Agent-core repo (sibling PR):** the BFF update-feed route serving the manifest and artifacts
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
     client-side). On macOS the staged bundle replaces the installed bundle with an atomic swap,
     preserving the quarantine/stapling state.
  8. Channels (`stable`, `beta`) are user-selectable and default to `stable`. A channel change
     never silently downgrades; it takes effect at the next equal-or-higher version.
  9. The release workflow signs the manifest, publishes artifacts and checksums, and sets the
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
  - [ ] Manifest signature, artifact digest, and platform signature all verified, in that order, before any apply
  - [ ] **No** code path, config key, env var, or build flag can apply an unsigned or unverifiable artifact
  - [ ] Downgrade and manifest replay are refused; cohort-based staged rollout works with zero telemetry
  - [ ] Failed post-update health check rolls back automatically to the previous version
  - [ ] Update feed and artifacts are served by the user's configured endpoint; no external egress, no absolute URLs
  - [ ] Per-machine Windows installs disable auto-update and say so; apply is atomic and power-loss safe
  - [ ] Secrets accessed via the secret manager; the signing key is touched only by the publish job
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass; `docs/SECURITY.md` states the fail-closed rule

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
