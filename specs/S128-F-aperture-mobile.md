# Aperture Sprint F — Mobile: Installable PWA
plane_project: APTR
module: Aperture
prefix: APTR
spec_id: S128-aperture-client

## Metadata
- **Author:** Operator (Moose)
- **Session:** S128
- **Date:** 2026-08-01
- **Module version:** Aperture v0.1.0
- **Estimated total:** 110h across 17 items — APTR-73..82, the out-of-sequence APTR-93, and
  APTR-200..205 (see the numbering note in Pre-flight). This figure is the **exact sum** of the
  per-item estimates below (6+8+8+8+7+8+8+6+7+5+5 = 76h for the original eleven, plus
  8+5+6+6+4+5 = 34h for the six items added by the S128 decision round), per Decision D12.
  If an item's estimate is revised, this line is revised with it.
- **North-Star layer:** shell — mobile target of the single Aperture client codebase; Gate 2
  justified in `specs/S128-aperture-epic.md`
- **Binding decisions:** this sprint is governed by `specs/S128-DECISIONS.md`. Where that file
  and this one disagree, that file wins. The decisions that bite hardest here are **D1** (the
  mobile PWA is a **web target**: base URL empty / same-origin relative, auth is the `__Host-`
  prefixed `HttpOnly` `Secure` `SameSite=Strict` **session cookie**, CSP `connect-src 'self'`;
  the desktop bearer-token rules do **not** apply on mobile and must not be copied here),
  **D6** (offline data is purged on logout and revocation — APTR-200), **D8** (a mechanical gate
  must be implementable in the language whose property it asserts), and **D12** (the header
  estimate equals the exact sum of item estimates).
- **Module-Contract:** meets §4 clauses 1–7. Clause 1 (Terminus-fronted) holds unchanged on
  mobile — the PWA talks only to the Aperture BFF, same-origin, and never opens its own egress.
  Clause 2 (capability gating) is exercised hard here: a module that is unreachable offline
  renders an inert, explained tile, never a broken screen. Clause 6 (sovereign, no telemetry,
  no external CDN) is *stricter* on mobile, because a service worker is the easiest place in a
  web app to accidentally introduce third-party fetches — this sprint adds a mechanical check
  that the precache manifest and every runtime-caching route are same-origin only.
- **Assistant-Layer Soul Contract:** clause 2 (**presence has a budget**) is the load-bearing
  clause of this sprint and gets its own item with its own negative test (APTR-79). Web Push is
  a **transport** for the assistant's existing prioritized, trait-scaled knock quota — quiet
  hours and opt-out honored. Aperture ships **no independent notification tray** on mobile and
  no notification that did not come from the assistant's presence decision. Clause 1 (speak,
  never template) applies to push bodies: the notification text is the assistant's own words,
  not a client-side string template. Clause 4 (continuity) applies to the offline outbox and to
  install/uninstall: installing, uninstalling, or clearing the PWA's caches MUST NOT reset
  Engram memory, personality traits, or relationship lore — local caches are a *view*, never
  the source of truth.
- **Context:** The agent core carries a legacy `pwa` module (~340 LOC) that serves a bare
  manifest, a near-empty service worker, and a server-rendered mobile dashboard page. That is
  not a client — it is a bookmark with a theme colour. This sprint replaces it with a real
  installable PWA built from **the same React bundle as web and desktop**, with a deliberate
  caching strategy, genuine offline behaviour, mobile-first touch interaction, and Web Push
  wired to the assistant's presence budget rather than to a notification tray.
  **Mobile-native is explicitly a later workstream.** Nothing in this sprint ships or scaffolds
  a native app. Where the PWA cannot do something on a given platform, the honest answer is
  documented (APTR-82) rather than worked around with a plausible-sounding claim.

## Pre-flight
- Depends on Sprint C (`APTR-29..46`) being merged — the mobile target renders the same
  workspace/thread/streaming surfaces; this sprint adapts and caches them, it does not
  re-implement them.
- **Depends on Sprint B's session shape** in two specific, named ways, and this is a real
  dependency rather than an assumption: (a) the session is a `__Host-` prefixed `HttpOnly`
  `Secure` `SameSite=Strict` cookie per Decision D1, so client JavaScript can never read it and
  offline boot cannot validate it (APTR-75); and (b) session revocation and the device record
  emit an event this sprint can act on (APTR-200). If either is not yet true when an agent picks
  up those items, that is a blocker to surface — not a licence to invent a client-readable token.
- Repository: the Aperture repo on the internal forge
- Dependencies: `node` ≥ 20, `npm`, the client workspace from APTR-01, the design system from
  APTR-02, the generated SDK from APTR-07, the SSE transport from Sprint B
- Vault secrets required (names only — values live in the secret store):
  `APERTURE_VAPID_PUBLIC_KEY`, `APERTURE_VAPID_PRIVATE_KEY`, `APERTURE_SESSION_SIGNING_KEY`
- Infrastructure: internal forge reachable, Plane reachable, Terminus door reachable
- Test devices: one device from each of the two major mobile platform families (one with the
  promptless install model, one with the prompt-driven model), plus one deliberately
  **mid-range** device or an equivalently throttled emulation profile for the performance budget
  in APTR-81. A budget validated only on a flagship is not a budget.
- Baseline tests: the Sprint C suite, green
- Baseline verify: the Sprint C behavior baseline

**Numbering note — read before "fixing" anything.** This sprint contains **17 items**: APTR-73
through APTR-82, plus **APTR-93**, plus **APTR-200 through APTR-205**.

**Numbering is an IDENTIFIER, NOT AN ORDERING.** This sprint already proves the point twice over
and neither case is a mistake:
- **APTR-93** was split out of APTR-73 after Sprint G had already been allocated APTR-83..92, so
  the next free number was 93. Despite carrying the highest number of the original set, APTR-93
  is the **first** item that must merge — APTR-73 is `Blocked by` it.
- **APTR-200..205** were added by the S128 decision round after APTR-95..199 had been claimed by
  other sprints running concurrently, so 200 was the next free block. They are **not** the last
  work of the sprint: APTR-200 (offline purge, Decision D6) is a Critical privacy item, and
  APTR-203 defines the storage contract that APTR-201 and APTR-202 both rely on.

Consequences, all mandatory: **execution order is given exclusively by `Blocked by`**, never by
the number; **nobody renumbers, reorders, or "corrects" an item** to make the sequence look tidy;
a renumbering PR will be rejected on sight because Plane issue ids, branch names, and review
records are all keyed to these identifiers. If the order looks wrong to you, read the `Blocked by`
lines — that is the order.

**Required merge order (restated from the `Blocked by` lines for convenience only — those lines are
the normative source):**
1. **APTR-93** — no blocker; merges first despite the highest original number.
2. **APTR-73** (blocked by 93) → **APTR-74** (blocked by 73) → **APTR-75** (blocked by 74).
3. Then, in parallel: **APTR-80** (blocked by 73), **APTR-79** and **APTR-81** (blocked by 74),
   **APTR-76**, **APTR-202** and **APTR-203** (blocked by 75).
4. **APTR-201** (blocked by 75, 203) → **APTR-77** (blocked by 76) → **APTR-200** (blocked by 77,
   201) → **APTR-82** (blocked by 73, 74, 79, 80, 200, 202, 203, 205), which merges last because it
   documents everything else.
5. **APTR-78**, **APTR-204** and **APTR-205** carry no blocker and may land at any point.

**Grounding, for every item in this sprint:** run `kg_query` / `kg_search` for the entities
touched and `kg_neighbors` / `kg_subgraph` for blast radius before writing code, and consult
`kg_rules` for the scope. APTR-74, APTR-76, APTR-77, APTR-79, APTR-93, APTR-200 and APTR-202
additionally touch caching, durable client state, push credentials, session/revocation paths, the
streaming transport, or live production code in another repository — run `cortex_scope` pre-change
on those seven and record a `cortex_review` risk score in the PR body.

---

### APTR-73: Installable PWA — web app manifest, icon set, and install flow
- **Priority:** Critical
- **Labels:** aperture, mobile, pwa, manifest
- **Agent:** claude
- **Estimate:** 6h
- **Blocked by:** APTR-93
- **Description:** Make Aperture genuinely installable from the same bundle web and desktop
  ship from. Author a complete web app manifest driven by the design tokens, produce the full
  icon matrix (including correctly-safe-zoned maskable icons), and implement install-prompt
  handling that is *offered*, never nagged. Retiring the legacy server-rendered mobile surface
  and its stub manifest in the agent core is **not** part of this item — it is live production
  code in another repository and is scoped as its own cross-repo item, **APTR-93**, which must
  merge first. This item assumes that removal has already landed, so that the manifest authored
  here is the only manifest on the origin.

  ## FILES
  - `client/public/manifest.webmanifest` — the single source of manifest truth
  - `client/src/pwa/manifest.config.ts` — token-derived values (theme/background colour, name,
    display, orientation) consumed by the build step that emits the manifest
  - `client/scripts/gen-manifest.mjs` — emits the manifest at build time from tokens + config
  - `client/scripts/gen-icons.mjs` — renders the icon matrix from the brand SVGs (APTR-04)
  - `client/public/icons/` — generated PNG matrix + maskable variants (checked in, deterministic)
  - `client/src/pwa/InstallPrompt.tsx` — deferred-prompt capture, the install affordance, and
    the iOS manual-install explainer
  - `client/src/pwa/useInstallState.ts` — installed / installable / unsupported state hook
  - `client/index.html` — manifest link, theme-colour meta, viewport with `viewport-fit=cover`
  - `docs/INSTALL.md` — the mobile install section (fills the Sprint A placeholder)

  ## APPROACH
  1. Emit the manifest from the design tokens at build time rather than hand-authoring it, so
     `theme_color` and `background_color` can never drift from `constellation.css`. A drift here
     shows up as a flash of the wrong colour on splash and is invisible in review.
  2. Icon matrix: `192`, `256`, `384`, `512` PNG (any-purpose) plus `192` and `512` **maskable**,
     an `apple-touch-icon` at `180`, and a monochrome SVG for platforms that accept one. Maskable
     variants must respect the 40% safe zone — generate them by compositing the icon at ≤80%
     scale on a token-coloured field, not by relabelling the any-purpose icon `maskable`.
  3. `display: standalone`, `display_override` preferring `standalone` then `browser`,
     `orientation: any` (Aperture is usable in both; locking portrait would break tablet and
     is a hostile default), `scope` and `start_url` **relative** so the app installs correctly
     under any mount path and no absolute origin is ever baked into the bundle.
  4. Declare `shortcuts` for "New thread" and "Continue last thread". Declare
     `share_target` only as a placeholder key here — APTR-80 owns its semantics and tests.
  5. Install prompt handling: capture the deferred install event, do **not** call it
     automatically. Surface a single, dismissible install affordance in settings and one
     contextual offer after the user has had a genuine session (a real interaction threshold,
     not a timer). **Dismissal is durable** — record it and never re-offer for the configured
     cooldown, and never at all if the user chose "don't ask again". Nagging is a presence-budget
     violation in spirit even though it is not a push.
  6. iOS has no install-prompt event. Detect the standalone-capable-but-promptless case and show
     an honest explainer with the actual manual steps, clearly marked as platform-imposed. Do
     **not** claim parity we do not have; APTR-82 documents the full limitation set.
  6a. **iOS install does NOT carry the session over, and the explainer must say so.** On that
     platform an installed PWA runs in a **separate storage partition** from the browser: cookies
     and IndexedDB written in the browser are **not** visible to the installed app. The session
     cookie is therefore gone, and so is any cached thread data. The honest behaviour, and the
     only one to implement, is: **install → re-authenticate once → server-side memory, traits and
     relationship lore intact.** Say this in the explainer copy *before* the user installs, so the
     login screen after install is an expected step rather than a suspected bug, and repeat it in
     `docs/INSTALL.md`. Do **not** attempt to bridge the partition — there is no supported
     mechanism, and every workaround shape (a token in the `start_url`, a token in local storage
     read by a bootstrap page, a token passed through the manifest) is a credential-in-URL or
     credential-in-JS-readable-storage bug. Per Decision D1 the session stays an `HttpOnly`
     cookie; a fresh partition simply means a fresh login.
  6b. The re-authentication after install must land the user back in **their existing account with
     their existing history**, not in a new-user experience — the first post-install render shows
     their threads, and the assistant does not greet them as a stranger. This is Soul Contract
     clause 4 and it is the difference between "you logged in again" and "we lost you".
  7. No absolute URLs, no external icon host, no analytics on the install funnel. The only thing
     recorded about installs is the local dismissal state, in local storage, on the device.

  ## TEST PLAN
  - Build, then assert `manifest.webmanifest` validates against the W3C manifest schema in CI
  - Assert every icon declared in the manifest exists in the built output at the declared size
    (parse the PNG header — do not trust the filename)
  - Assert maskable icons keep the icon inside the 40% safe zone (compare rendered alpha bounds)
  - Assert `theme_color` and `background_color` equal the corresponding design-system token values
  - Unit: dismissing the install offer sets durable state; a re-render does not re-offer
  - Unit: the promptless (iOS-shaped) capability profile renders the manual explainer, never a
    dead "Install" button
  - Unit: the promptless capability profile's explainer copy states, before install, that the user
    will sign in once after installing and that their history and memory are unaffected
  - Integration: simulate the separate-storage-partition case (empty cookie jar + empty IndexedDB
    against the same account), authenticate once, and assert the first render shows the user's
    existing threads and that memory, traits, and lore are unchanged
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute paths in new/modified files
  - **Negative:** assert no session token, and no credential-shaped value, is ever placed in
    `start_url`, in the manifest, in a query parameter, or in JS-readable storage as a way of
    bridging the storage partition — the partition is crossed by logging in again, never by
    carrying a secret across it
  - **Negative:** set `start_url` to an absolute origin and confirm the build FAILS the
    same-origin assertion; revert
  - **Negative:** mark an any-purpose icon as `maskable` without safe-zoning and confirm the
    safe-zone check FAILS; revert

  ## EDGE CASES
  - Two manifests on one origin (the legacy agent-core stub plus this one) — install identity
    becomes browser-dependent and updates stop applying. APTR-93 removes the legacy one and is a
    hard prerequisite; if it has not merged, do not start this item, because the resulting bug is
    intermittent, browser-specific, and will be misattributed to the manifest authored here.
  - Already-installed detection is unreliable across browsers — treat `display-mode: standalone`
    as the only trustworthy signal and degrade to "we're not sure" rather than asserting wrongly.
  - **Install on the promptless platform starts a new storage partition — this is expected, not a
    bug.** A user who installs, uninstalls, or reinstalls there must re-authenticate once, because
    cookies and IndexedDB do not cross the partition boundary. What must survive is everything that
    lives server-side: memory, personality traits, relationship lore, and thread history. Local
    state is a cache, not the record, so losing it costs a login and nothing else. The explainer
    (APPROACH 6a) sets this expectation up front and APTR-82's matrix records it per platform;
    without both, testers file the platform as a defect and someone "fixes" it by loosening the
    cookie or stashing a token, which is a genuine security regression.
  - On the prompt-driven platform the installed app generally *does* share storage with the
    browser, so the same user sees different behaviour on their two phones. Do not write copy that
    asserts either behaviour universally — drive it from the detected capability profile.
  - In-app browsers (a link opened from a messaging app) can neither install nor prompt — detect
    and explain, do not render a control that silently does nothing.
  - Icon regeneration must be deterministic; a renderer version bump that reflows anti-aliasing
    would churn the diff every build. Pin the renderer and check the PNGs in.

- **Acceptance criteria:**
  - [ ] Manifest is generated from design tokens, validates in CI, and uses relative `start_url`
        and `scope` with no absolute origin anywhere in the manifest or bundle
  - [ ] Full icon matrix present, including correctly safe-zoned maskable variants, verified mechanically
  - [ ] Install offer is dismissible and durably suppressed after dismissal; never auto-prompts
  - [ ] Promptless platforms get an honest manual-install explainer, not a dead control
  - [ ] On the promptless platform the explainer states **before install** that the installed app
        gets a separate storage partition, so the user re-authenticates once after installing while
        server-side memory, traits, lore and thread history are unaffected; no session token or
        credential is ever carried across the partition
  - [ ] Exactly one web app manifest is served on the origin (APTR-93 merged first; re-verified here)
  - [ ] README and `docs/INSTALL.md` updated to document installation and the post-install
        re-authentication step on each platform
  - [ ] No hardcoded infrastructure values in new/modified code, and all existing tests still pass

---

### APTR-74: Service worker — app-shell precache, per-class runtime caching, versioning, and a safe update flow
- **Priority:** Critical
- **Labels:** aperture, mobile, pwa, service-worker, caching
- **Agent:** claude
- **Estimate:** 8h
- **Blocked by:** APTR-73
- **Description:** A service worker with a *deliberate*, written-down caching strategy — not a
  generated catch-all that caches whatever moves. Precache the app shell so it boots offline;
  apply an explicitly chosen strategy per resource class; version and evict caches so an old
  build's assets cannot linger forever; and ship an update flow with the two classic failure
  modes designed out: **no stale shell forever**, and **no surprise mid-session swap**. The
  update is offered; the user decides when it applies.

  ## FILES
  - `client/src/sw/service-worker.ts` — the worker (TypeScript, compiled as a separate entry)
  - `client/src/sw/strategies.ts` — the per-resource-class strategy table, exported and testable
  - `client/src/sw/cache-names.ts` — cache name + version derivation from the build id
  - `client/src/sw/precache-manifest.d.ts` — typing for the build-injected precache list
  - `client/src/pwa/useServiceWorker.ts` — registration, update detection, activation control
  - `client/src/pwa/UpdateBanner.tsx` — the "a new version is ready" affordance
  - `client/scripts/assert-sw-same-origin.mjs` — fails the build if any precache entry or runtime
    route can match a cross-origin URL
  - `client/vite.config.ts` — service-worker entry + precache-manifest injection
  - `docs/OFFLINE.md` — the caching strategy table, written for a human, kept in sync by test
  - `contracts/aperture-offline-v1.md` — cache classes, TTLs, eviction policy, update semantics

  ## APPROACH
  1. **Write the strategy table first, in `contracts/aperture-offline-v1.md`**, then implement
     against it. Classes and strategies:
     | Class | Strategy | Notes |
     |---|---|---|
     | App shell (HTML entry, JS, CSS, fonts, icons) | precache, cache-first | versioned by build id; the only class that is precached |
     | Thread/message reads | stale-while-revalidate into the offline store (APTR-75) | bounded per-thread |
     | Module descriptors (`/modules`) | network-first, short TTL, cache fallback | drives capability gating offline |
     | Attachments/media | cache-first, LRU, hard byte ceiling | opt-in for large items |
     | SSE stream | **never cached, never intercepted** | a cached stream is a hang |
     | Auth, session, and all mutations | **network-only, never cached** | a replayed auth response is a security bug |
  2. `strategies.ts` is a pure, exported table so the policy is unit-testable **without** a
     service-worker runtime. Every route in the table declares its class explicitly; there is no
     default-catch-all. An unmatched request is passed straight to the network.
  3. **Never intercept the SSE endpoint or any mutating verb.** Bypass by explicit predicate,
     asserted by a test — a service worker that buffers a stream produces a "the assistant never
     replies" bug that looks like a backend fault and costs a day.
  4. Cache names embed the build id; `activate` deletes every cache whose name does not appear in
     the current name set. Add a hard total-bytes ceiling with LRU eviction for the media class,
     and handle quota-exceeded by evicting and retrying once, then degrading to network-only —
     never by throwing inside a fetch handler.
  5. **Update flow:** the new worker installs and precaches but does **not** `skipWaiting` on its
     own. `useServiceWorker` detects the waiting worker and shows `UpdateBanner`. The user
     applies it; only then does the client message the worker to activate and reload. Two
     exceptions, both explicit: (a) if there is no live thread and no queued outbox work, the
     banner may apply on the next navigation; (b) a build flagged as carrying a breaking contract
     change activates on next load with an explanation. Never mid-stream.
  6. **Stale-shell insurance:** on every load, if the active worker's build id is older than a
     configured maximum age *and* an update is waiting, escalate the banner to a blocking prompt.
     A shell that can never be replaced is worse than no service worker at all.
  7. Same-origin only, mechanically: `assert-sw-same-origin.mjs` fails the build on any precache
     entry or runtime route pattern that could match another origin. This is Module Contract
     clause 6 enforcement at the layer most likely to violate it.
  8. Run `cortex_scope` before implementing and record the `cortex_review` risk score in the PR
     body — this item can brick the client for every installed user, and it deserves the scan.

  ## TEST PLAN
  - Unit: every entry in the strategy table resolves to exactly one class; an unmatched request
    resolves to pass-through, not to a cache
  - Unit: the SSE endpoint and every mutating verb are excluded from interception
  - Unit: `activate` deletes caches from prior build ids and retains the current set
  - Unit: quota-exceeded triggers LRU eviction, one retry, then network-only degradation
  - Integration (headless): second load with the network offline serves the shell from precache
  - Integration: a waiting worker does NOT activate until the client sends the apply message
  - `node client/scripts/assert-sw-same-origin.mjs` passes on the clean tree
  - Assert `docs/OFFLINE.md`'s strategy table matches `strategies.ts` (test parses both)
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute paths in new/modified files
  - **Negative:** add a cross-origin precache entry and confirm the same-origin assertion FAILS; revert
  - **Negative:** simulate a waiting worker while a stream is active and confirm it does NOT
    activate mid-stream

  ## EDGE CASES
  - A cached HTML shell referencing hashed assets deleted by a newer activation — precache the
    shell and its assets as one atomic version set; never mix versions within a load.
  - Two tabs, one updating — the apply action must coordinate (claim clients, reload all) rather
    than leaving one tab on the old shell talking a new contract.
  - iOS evicting storage under pressure — treat cache loss as normal, not exceptional; the app
    must reboot cleanly from an empty cache with a network path.
  - A user who never closes the app: the max-shell-age escalation is what saves them.
  - Redirects to a login page cached as if they were the shell — never cache an opaque or
    redirected response for the shell class.
  - Development builds must be able to bypass the worker entirely (a documented kill switch), or
    every future frontend bug becomes a caching investigation first.

- **Acceptance criteria:**
  - [ ] Per-resource-class strategy table exists in `contracts/aperture-offline-v1.md` and is
        implemented as an exported, unit-tested table with no catch-all default
  - [ ] SSE and all mutating requests are never intercepted or cached
  - [ ] Caches are versioned by build id; stale-version caches are deleted on activate
  - [ ] Update installs silently but activates only on explicit user action, never mid-stream, and a
        shell older than the configured max age with an update waiting escalates to a blocking prompt
  - [ ] Build FAILS if any precache entry or runtime route can match a cross-origin URL
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README / `docs/OFFLINE.md` document the caching strategy and the update flow
  - [ ] All existing tests still pass

---

### APTR-75: Offline data layer — read previously-seen threads, and an honest offline state on every surface
- **Priority:** Critical
- **Labels:** aperture, mobile, offline, ux
- **Agent:** claude
- **Estimate:** 8h
- **Blocked by:** APTR-74
- **Description:** Offline must mean *usable*, not *apologetic*. Threads the user has already
  read are readable offline, with their messages, tool-call summaries, and attachment thumbnails
  where cached. Everything that genuinely cannot work offline says so plainly, in the assistant's
  register, on the surface where the user is standing — not as a global red bar and not as a
  spinner that never resolves. Every module surface gets an explicit offline state; a surface
  without one is an incomplete surface.

  ## FILES
  - `client/src/offline/store.ts` — IndexedDB schema, migrations, and typed accessors
  - `client/src/offline/threadCache.ts` — read-through cache with per-thread bounds and LRU
  - `client/src/offline/useOnlineStatus.ts` — connectivity state with reachability confirmation
  - `client/src/offline/OfflineState.tsx` — the per-surface offline state primitive
  - `client/src/offline/policy.ts` — what is retained, for how long, and how much
  - `client/src/offline/identity.ts` — the non-secret "last authenticated user" marker, its
    derivation, its use as the store namespace, and its validation-on-reconnect path
  - `client/src/modules/ModuleGate.tsx` — extend the APTR-08 gate with an offline reason
  - `docs/OFFLINE.md` — the user-facing "what works offline" section
  - `client/src/offline/__tests__/` — store, eviction, and surface-state tests

  ## APPROACH
  1. IndexedDB via a thin typed wrapper, with an explicit schema version and forward migrations.
     Store: workspaces, threads, messages, tool-call records, module descriptors, and attachment
     metadata (+ thumbnails only, under a byte ceiling). **Never** store a session token, a
     signing key, or any secret in IndexedDB.
  1a. **Offline boot identity — state the dependency, do not paper over it.** Per Decision D1 the
     session on this target is an `HttpOnly` cookie: JavaScript cannot read it, and offline there
     is no server to validate it against, so a cold start with no network genuinely cannot prove
     who the user is. The resolution is explicit rather than implicit. **Never store a session
     token, and never store anything from which one could be derived** — that prohibition is
     absolute and is not traded away to make offline boot work. Instead:
     - `identity.ts` persists a **non-secret "last authenticated user" marker**: an opaque,
       server-issued, non-reusable-as-a-credential user identifier (plus a display name for the
       UI), written on successful login and used for two things only — **namespacing the object
       stores** and **deciding which cached content to render on an offline cold start**.
     - The marker authorises **nothing**. Possessing it grants no access to the BFF; every network
       request still carries the cookie or fails. It is a cache key with a name on it, not a
       credential, and the contract says so in those words.
     - **Full validation happens on reconnect.** The first successful online exchange after a cold
       start confirms the session and the identity behind it. If the session is gone, or the
       server says the authenticated user is a *different* user than the marker names, the client
       treats every store namespaced to the old marker as unreadable and hands off to the purge
       path in APTR-200 before rendering anything further.
     - Therefore an offline cold start renders cached content **with the honest caveat that it is
       unverified local data**, alongside the staleness affordance from APPROACH 4. It never
       claims a live session and never shows a "signed in" state it cannot substantiate.
     - This is exactly where the promptless platform's separate storage partition (APTR-73) shows
       up: after install there is no marker and no cache, so the first boot is a login, not an
       offline read. That is correct behaviour, not data loss.
  2. Read-through: a thread render reads the cache first, then revalidates from the BFF and
     reconciles. Retention policy in `policy.ts`: the N most recently viewed threads, the last M
     messages per thread, a global byte ceiling, LRU eviction, and an explicit user-visible
     "clear offline data" action in settings.
  3. **Connectivity is confirmed, not assumed.** The browser's online flag lies (captive portals,
     dead-but-associated Wi-Fi). Confirm with a cheap same-origin reachability probe against the
     BFF before declaring "online", and treat repeated stream failures as offline regardless of
     what the flag says.
  4. `OfflineState` takes what the surface *can* do and what it cannot, and renders one honest
     state: readable content plus a quiet, non-alarming indicator; or an explained inert state
     with a retry. **No infinite spinners, no silently empty lists, no lies about freshness** —
     cached content carries a "last updated" affordance.
  5. Extend the module capability gate: offline is a legitimate `degraded`/`unavailable` *reason*,
     rendered as an inert explained tile per Module Contract clause 2 — a module that needs a live
     backend must not present controls that will silently fail.
  6. Any offline explanatory copy attributed to the assistant goes through the persona assembler
     (Soul Contract clause 1). Templated strings are the render-failure fallback only. Aperture
     does not put words in the assistant's mouth because the network dropped.
  7. **Continuity:** clearing offline data, or the browser evicting it, must not touch server-side
     memory, traits, or lore. Assert this explicitly — this is the Sprint-F face of Soul Contract
     clause 4.

  ## TEST PLAN
  - Unit: read-through returns cached content when the network is unavailable, then reconciles on reconnect
  - Unit: retention policy evicts by LRU at the thread count, message count, and byte ceilings
  - Unit: schema migration from version n-1 to n preserves cached threads
  - Unit: a captive-portal profile (flag says online, probe fails) resolves to offline
  - Unit: offline cold start with a marker present renders that user's cached threads, labelled as
    unverified local data, and never renders a confirmed "signed in" state
  - Unit: on reconnect, a session that resolves to a **different** user than the marker names
    causes the old namespace to be treated as unreadable and hands off to the APTR-200 purge
    before any further render
  - Unit: object stores are namespaced by the marker; a second marker's stores are not reachable
    through the accessors for the first
  - Unit: every module surface renders a defined offline state — a test enumerates surfaces and
    fails if one lacks a registered state (this is the anti-omission gate)
  - Integration: boot offline, open a previously-read thread, read it end to end
  - **Negative:** assert no session token, signing key, or secret-shaped value is ever written to
    IndexedDB or any other client storage (scan the object stores after a full session simulation),
    and assert specifically that the identity marker is **not** accepted as authentication — a
    request made with the marker and no valid session is rejected by the BFF
  - **Negative:** clearing all offline data and reloading online restores the same memory,
    traits, and lore — no continuity reset
  - **Negative:** a surface with content but a stale cache must NOT present it as fresh — assert
    the staleness affordance is rendered
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute paths in new/modified files

  ## EDGE CASES
  - An offline cold start with **no** marker (first run, post-install on a partitioned platform, or
    after a purge) — render the signed-out shell with an honest "you'll need a connection to sign
    in" state. Never guess an identity, and never fall back to whatever namespace happens to exist.
  - A marker present but the cached data belonging to a session revoked while the device was
    offline — the device cannot know until it reconnects; on reconnect the revocation resolves
    through APTR-200's purge. Document this window honestly in the offline contract rather than
    implying revocation is instantaneous on a disconnected device.
  - Private browsing with IndexedDB unavailable — degrade to in-memory only, tell the user offline
    reading is off, and keep the app fully functional online.
  - Storage evicted between sessions — indistinguishable from a first run; must not look like data loss.
  - A thread edited server-side while cached — reconcile on revalidate and prefer the server, but
    never silently drop a locally queued message (APTR-76 owns that interaction).
  - Large threads: cap what is retained per thread and paginate from cache, or a single long thread
    consumes the whole budget.
  - Two tabs writing the same store concurrently — use a single writer path and versioned records.
  - A cached attachment thumbnail whose underlying attachment was deleted server-side — evict on
    reconcile, do not render a ghost.

- **Acceptance criteria:**
  - [ ] Previously-read threads are readable offline, including tool-call records and cached thumbnails
  - [ ] Retention policy enforces thread count, per-thread message count, and a global byte ceiling with LRU eviction
  - [ ] Connectivity is confirmed by reachability probe; a captive portal resolves to offline
  - [ ] Every surface has a defined offline state; a surface without one fails the enumeration test
  - [ ] Cached content is never presented as fresh — staleness is always visible
  - [ ] Offline boot trusts a **non-secret** "last authenticated user" marker to namespace stores and
        choose what to render, authorises nothing with it, and fully validates the session on
        reconnect — handing off to the APTR-200 purge if the session is gone or resolves to another user
  - [ ] No secret, token, or signing key is ever persisted to client storage, and clearing offline
        data does not reset memory, traits, or relationship lore
  - [ ] No hardcoded infrastructure values in new/modified code, and all existing tests still pass

---

### APTR-76: Offline compose — durable outbox with ordered, idempotent replay
- **Priority:** Critical
- **Labels:** aperture, mobile, offline, outbox, reliability
- **Agent:** claude
- **Estimate:** 8h
- **Blocked by:** APTR-75
- **Description:** Composing offline must feel like composing. The message is accepted, visibly
  marked as queued, survives a reload and a cold start, and replays in order when connectivity
  returns — exactly once. The failure modes this item exists to prevent are the ones users
  actually hit: the message that vanishes on reload, the message sent twice, and the message
  that sits in a queue forever with no way to see or cancel it.

  ## FILES
  - `client/src/offline/outbox.ts` — durable queue: enqueue, peek, mark, drop, drain
  - `client/src/offline/replay.ts` — the drain loop, backoff, and terminal-failure handling
  - `client/src/offline/idempotency.ts` — client-generated idempotency key derivation
  - `client/src/chat/QueuedMessage.tsx` — queued / sending / failed message states with actions
  - `client/src/offline/OutboxPanel.tsx` — see the queue, retry one, cancel one, cancel all
  - `contracts/aperture-offline-v1.md` — outbox semantics, idempotency contract, ordering guarantees
  - **Agent-core repo (sibling PR):** BFF honors the client idempotency key on message send —
    a repeated key returns the original result rather than creating a second message

  ## APPROACH
  1. The outbox is an IndexedDB queue (same store, own object store) with records carrying: a
     client-generated id, the target thread, the payload, attachment references, an idempotency
     key, an enqueue timestamp, an attempt count, and a state
     (`queued` | `sending` | `failed` | `conflicted`).
  2. **Idempotency is client-generated and stable across retries.** The key is derived once at
     enqueue and never regenerated — regenerating on retry is exactly how duplicates happen. The
     BFF sibling PR stores the key and returns the original result on a repeat, so a response lost
     in flight cannot produce a second message.
  3. Drain is **serial per thread** to preserve order, and may run in parallel across threads.
     Exponential backoff with jitter; a capped attempt count moves the record to `failed` with a
     reason and a user-visible retry, never an infinite silent loop.
  4. Optimistic rendering: the queued message appears immediately in the thread in a visually
     distinct queued state — not styled as sent. Sent-state transition happens only on a
     confirmed server acknowledgement.
  5. `OutboxPanel` makes the queue inspectable and cancellable. A queue the user cannot see is a
     queue the user cannot trust. Cancel removes the record; if a send was already acknowledged,
     cancelling locally must not claim to have unsent it.
  6. Attachments queued offline: store the blob under the media byte ceiling, or refuse the
     enqueue with a clear reason. Never accept an attachment you cannot actually hold.
  7. **Replay must never resurrect a cleared session.** If auth expired while queued, the drain
     stops and prompts re-auth; it does not silently re-authenticate or send under a different
     identity. Assert this.
  8. Drain is triggered by the confirmed-online transition from APTR-75, by app foreground, and by
     an explicit user retry. Background Sync is used **where available only**, as an optimisation
     — never as the sole path, because it does not exist on every platform (APTR-82 documents this).

  ## TEST PLAN
  - Unit: enqueue → reload → the record survives with the same idempotency key
  - Unit: serial drain preserves per-thread order across a mixed multi-thread queue
  - Unit: a 5xx retries with backoff; a 4xx validation failure goes terminal with a reason
  - Unit: attempt cap moves the record to `failed` and surfaces a retry action
  - Integration: offline compose, three messages, reconnect — exactly three messages server-side
  - Integration: acknowledged-but-response-lost replay produces **one** message, not two
  - **Negative:** force a duplicate replay of an already-acknowledged record and assert the server
    returns the original message and no duplicate is created
  - **Negative:** expire the session while messages are queued; assert the drain halts and prompts
    re-auth rather than sending, and that the queue is preserved intact
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute paths in new/modified files

  ## EDGE CASES
  - The app is killed mid-`sending` — on restart the record is still `sending`; treat it as
    replayable because idempotency makes replay safe, and say so in the contract.
  - Clock skew making timestamps useless for ordering — order by a monotonic local sequence, not wall clock.
  - The thread was deleted server-side while a message was queued — terminal failure with an
    honest explanation and the text preserved so the user can copy it out. Never discard user text.
  - Quota exhausted at enqueue time — refuse clearly at the point of composing, not silently later.
  - Two tabs draining the same queue — a single-drainer lock, with the lock expiring so a crashed
    tab cannot wedge the queue permanently.
  - A queued message whose thread has moved on — that is APTR-77's problem, and the outbox must
    hand it over rather than resolving it by guessing.

- **Acceptance criteria:**
  - [ ] Queued messages survive reload and cold start with a stable idempotency key
  - [ ] Replay is serial per thread and preserves compose order
  - [ ] A lost-response replay produces exactly one server-side message
  - [ ] Queued messages are visually distinct from sent, inspectable, retryable, and cancellable
  - [ ] Terminal failures preserve the user's text, give an honest reason, and expired auth halts the
        drain and prompts re-auth rather than sending under a changed identity
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README / `docs/OFFLINE.md` document outbox behaviour and its guarantees
  - [ ] All existing tests still pass

---

### APTR-77: Conflict resolution when a queued message replays into a thread that moved on
- **Priority:** High
- **Labels:** aperture, mobile, offline, conflict, ux
- **Agent:** claude
- **Estimate:** 7h
- **Blocked by:** APTR-76
- **Description:** The interesting offline case is not the send — it is what happens when the
  send lands late. The user typed "yes, do it" offline; by the time it replays, the assistant has
  already answered something else, the user sent a different message from the desktop client, or
  the thread was summarised, branched, or archived. Appending a stale message as if nothing
  happened produces a genuinely confusing conversation. This item defines and implements the
  conflict policy, and makes the resolution visible rather than magic.

  ## FILES
  - `contracts/aperture-conflict-v1.md` — conflict taxonomy, detection, and resolution policy
  - `client/src/offline/conflict.ts` — detection and classification
  - `client/src/offline/resolution.ts` — the resolution strategies
  - `client/src/chat/ConflictPrompt.tsx` — the user-facing resolution surface
  - `client/src/offline/__tests__/conflict.test.ts`
  - **Agent-core repo (sibling PR):** message send accepts an optional `expected_head` (the last
    message id the client saw) and returns a structured conflict result — not a bare 409 — naming
    what changed since

  ## APPROACH
  1. **Detect, don't guess.** Every outbox record captures the thread head the user was looking at
     when they composed. On replay, the BFF compares it with the current head and returns a
     structured result: `clean`, `advanced` (new messages since), `diverged` (an assistant turn is
     in flight or completed answering something else), `unavailable` (thread archived/deleted), or
     `superseded` — defined **mechanically** below.
  1a. **`superseded` is a deterministic predicate, not a judgement.** "Semantically overlapping"
     is not implementable and not testable, so it is not the contract. The BFF classifies a
     replayed message as `superseded` when **all** of the following hold, and never otherwise:
     - the replayed message's author is the **same user** as the candidate message's author; **and**
     - the candidate message was sent to the **same `thread_id`**; **and**
     - the candidate was **received by the server** at a time inside the replayed message's
       **offline window** — the closed interval from the replayed message's composed-at to its
       delivered-at (that is, it arrived while the replaying device was disconnected); **and**
     - the candidate arrived from a **different client/device record** than the replaying one.
     Every term there is a field the server already has. There is no similarity metric, no
     embedding comparison, no threshold to tune, and no model call in the detection path — a
     detection path that called a model would also be a second door and a latency hazard on the
     send path.
  1b. **The semantic judgement moves to the human, at the prompt.** Because the predicate is
     deliberately broad (it will fire on messages that are unrelated as well as on genuine
     duplicates), `superseded` **always prompts and never resolves itself**. The prompt shows both
     texts side by side with their times and their originating device, and asks the user which
     they meant — that is where "is this the same thing I already said?" gets answered, by the
     only party who actually knows. Prompt copy may be spoken by the assistant through the persona
     assembler (APPROACH 6), and the assistant may *offer an opinion* about whether the two
     overlap; it may not act on that opinion. Nothing auto-sends and nothing auto-discards.
  1c. Precedence, so classification is total and unambiguous: `unavailable` > `diverged` >
     `superseded` > `advanced` > `clean`. A message can satisfy more than one predicate; the
     highest-precedence class wins, and the contract states this ordering explicitly so client
     and server cannot disagree about a mixed case.
  2. Taxonomy → default policy, written in the contract before it is coded:
     - `clean` → append, no prompt.
     - `advanced` with only the user's own messages since → append with a visible "sent while you
       were offline, composed before the messages above" marker. Do not prompt; the marker is enough.
     - `diverged` → **prompt**. Offer: send anyway (with context marker), edit before sending, or
       discard. Default is *prompt*, never auto-send — this is the case where auto-append reads as
       the client putting words in the user's mouth.
     - `unavailable` → terminal, preserve the text, offer "send to a new thread" or copy out.
     - `superseded` → **always prompt**, with both texts side by side, their times, and which
       device each came from; never silently drop either, and never auto-resolve. The predicate in
       APPROACH 1a is deliberately over-inclusive precisely because the resolution is a prompt: a
       false positive costs one question, whereas a missed duplicate costs a confused conversation.
  3. Resolution is **explicit and reversible where possible**. Whatever is chosen, the resulting
     message carries provenance metadata (composed-at, delivered-at, resolution taken) so the
     assistant can reason about the delay rather than being confused by it — the assistant should
     be able to say "you wrote that before my last message, so —" and mean it.
  4. Conflicts are **batched per thread**: three stale messages into one diverged thread produce
     one prompt with all three, not three prompts. Prompt fatigue is how users start discarding
     things they meant to send.
  5. Nothing here silently discards user text, ever. Discard is always a user action, and the text
     stays recoverable until the user leaves the surface.
  6. Any explanatory prose spoken as the assistant goes through the persona assembler
     (Soul Contract clause 1). The client narrates mechanics; the assistant speaks in its own voice.
  7. Continuity: a conflict resolution must not fork or reset thread memory. Assert that resolving
     a conflict leaves prior memory, traits, and lore untouched.

  ## TEST PLAN
  - Unit: each conflict class is detected correctly from head comparison + turn state
  - Unit (`superseded`, table-driven over the four predicate terms): a candidate from the same
    user, same thread, inside the offline window, from a different device ⇒ `superseded`; flipping
    **any one** term (different user / different thread / arrival outside the offline window /
    same device) ⇒ **not** `superseded`. No similarity input exists in the function signature.
  - Unit: the precedence order `unavailable` > `diverged` > `superseded` > `advanced` > `clean`
    holds for a case that satisfies several predicates at once
  - Unit: `advanced`-with-own-messages appends with a marker and does not prompt
  - Unit: `diverged` prompts and does **not** send until the user chooses
  - Unit: three stale messages in one thread produce one batched prompt
  - Unit: `unavailable` preserves text and offers a new-thread destination
  - Integration: compose offline, let the assistant answer something else, reconnect, resolve
    "send anyway" — the delivered message carries composed-at provenance
  - **Negative:** assert a `diverged` conflict NEVER auto-appends, under any timing, including when
    the prompt is dismissed by navigation (it stays queued, it does not send)
  - **Negative:** assert `superseded` never auto-resolves in either direction — neither text is
    sent nor discarded without an explicit user choice, and the detection path makes **no** model
    call and performs **no** similarity comparison (assert by inspecting the classifier's inputs)
  - **Negative:** assert no resolution path discards user text without an explicit user action
  - **Negative:** assert resolving a conflict does not reset thread memory, traits, or lore
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute paths in new/modified files

  ## EDGE CASES
  - The assistant is *mid-stream* when the replay lands — treat as `diverged` and hold; injecting a
    user turn into an in-flight completion is the worst version of this bug.
  - Conflict on a thread the user is not currently viewing — surface it in the outbox panel and via
    the assistant's presence budget (APTR-79), never as a modal that hijacks the current screen.
  - The same conflict resolved differently in two tabs — first resolution wins; the second finds the
    record gone and says so plainly.
  - Very old queued messages (days) — offer discard as the *suggested* default while still requiring
    a user action, and show the age prominently.
  - `expected_head` unknown because the thread was never fully loaded — treat as `diverged` and
    prompt; failing closed to a prompt is always safer than failing open to a send.

- **Acceptance criteria:**
  - [ ] Conflict taxonomy documented in `contracts/aperture-conflict-v1.md` and implemented end to end
  - [ ] Detection uses an explicit expected-head, not a timestamp heuristic
  - [ ] `superseded` is defined and implemented as the deterministic four-term predicate (same user,
        same thread, arrival inside the offline window, different device) with a stated precedence
        order — no similarity metric, no model call, no "semantic" criterion anywhere in detection
  - [ ] `diverged` and `superseded` always prompt; nothing auto-sends into a moved-on thread
  - [ ] Conflicts are batched per thread, one prompt per thread
  - [ ] Delivered messages carry composed-at / delivered-at provenance
  - [ ] No path discards user text without an explicit user action, and conflict resolution never
        resets memory, traits, or relationship lore
  - [ ] No hardcoded infrastructure values in new/modified code, and all existing tests still pass

---

### APTR-78: Mobile-first layout and interaction — touch targets, safe areas, keyboard, pull-to-refresh, scroll anchoring
- **Priority:** Critical
- **Labels:** aperture, mobile, ux, layout, design-system
- **Agent:** claude
- **Estimate:** 8h
- **Description:** Make the existing Sprint C surfaces genuinely good on a phone held in one hand.
  This is the item that fixes the classic mobile-chat failures: the composer hidden behind the
  virtual keyboard, content under the notch or home indicator, tap targets sized for a mouse,
  a browser pull-to-refresh that nukes a half-typed message, and a message list that jumps around
  while the assistant streams into it. Adaptation happens through the design system's tokens and
  responsive primitives — **no mobile fork of the component tree**, because a fork guarantees the
  two versions diverge within a sprint.

  ## FILES
  - `client/src/styles/mobile.css` — responsive layer: breakpoints, safe-area insets, touch sizing
  - `client/src/layout/MobileShell.tsx` — mobile navigation shell (bottom-anchored, thumb-reachable)
  - `client/src/chat/useVisualViewport.ts` — visual-viewport-driven keyboard handling
  - `client/src/chat/Composer.tsx` — keyboard-aware composer positioning and growth
  - `client/src/chat/useScrollAnchor.ts` — stick-to-bottom with an intentional-scroll escape
  - `client/src/chat/PullToRefresh.tsx` — scoped, semantically-correct refresh gesture
  - `client/scripts/adherence-lint.mjs` — extend with a minimum-touch-target rule
  - `docs/MOBILE.md` — the interaction rules and why each exists

  ## APPROACH
  1. Safe areas: consume `env(safe-area-inset-*)` throughout, with `viewport-fit=cover` set in
     APTR-73. Bottom-anchored navigation and the composer both respect the home indicator. Test in
     landscape too, where the left/right insets are the ones that bite.
  2. Touch targets: minimum 44×44 CSS px hit area for every interactive element, achieved by
     padding or a pseudo-element expansion rather than by inflating visual size. Add a lint rule to
     `adherence-lint.mjs` that fails on interactive primitives declaring a smaller fixed size — a
     rule beats a review comment, permanently.
  3. **Virtual keyboard:** drive layout from the Visual Viewport API, not from window resize
     events, which do not fire consistently and lie about the occluded region. The composer sits
     above the keyboard, the message list shortens rather than scrolling under it, and the last
     message stays visible when the keyboard opens. Provide a documented fallback for the
     no-Visual-Viewport case (fixed positioning plus a scroll-into-view on focus) — degraded, but
     never a composer the user cannot see.
  4. **Scroll anchoring during streaming:** stick to bottom while the user is at the bottom;
     the moment the user scrolls up intentionally, stop following and show a "jump to latest"
     affordance with an unread count. Never yank the viewport back mid-read. Anchor on a stable
     element so that streamed tokens growing the last message do not shift what is being read, and
     account for late-loading images/attachments resizing above the viewport.
  5. **Pull-to-refresh:** disable the browser's native overscroll refresh on the chat surface
     (`overscroll-behavior`) — losing a half-typed message to a stray swipe is unforgivable — and
     implement an explicit, scoped refresh only where refresh has real meaning (thread list, module
     surfaces). Refresh means *revalidate from the BFF*; it never clears the outbox or offline data.
  6. Everything is token-driven and lives in the shared component tree behind responsive
     primitives. No `isMobile ? <A/> : <B/>` component forks for anything structural.
  7. Interaction targets: no hover-only affordances, no gesture without a visible alternative, and
     no destructive action reachable by a single unconfirmed swipe.

  ## TEST PLAN
  - Unit: `useScrollAnchor` follows while pinned to bottom, releases on intentional upward scroll,
    and re-pins on the jump-to-latest action
  - Unit: `useVisualViewport` computes composer offset from the visual viewport, with the documented
    fallback exercised when the API is absent
  - Unit: refresh triggers revalidation only; it does not clear outbox or offline stores
  - Integration (headless, mobile viewport + notch profile): the composer remains fully visible with
    the keyboard open, in portrait and landscape
  - Integration: streaming a long response while the user reads earlier content does not move the viewport
  - Lint: minimum-touch-target rule passes on the tree
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute paths in new/modified files
  - **Negative:** shrink an interactive primitive below the minimum target and confirm
    `lint:adherence` FAILS; revert
  - **Negative:** assert an overscroll gesture on the chat surface does NOT trigger a browser
    refresh and does not discard composer content

  ## EDGE CASES
  - Keyboard with an autocomplete/suggestion strip changes the occluded height mid-session — react
    to viewport changes continuously, not once on focus.
  - Landscape on a notched device: horizontal insets matter and are the ones usually forgotten.
  - An external hardware keyboard reports no visual-viewport shrink — layout must be correct anyway.
  - Text scaled up by the OS pushing the composer off screen — layout must reflow, never clip
    (APTR-81 covers the dynamic-type audit).
  - A streamed message containing a very tall code block or image mid-stream — anchoring must not
    fight the growth.
  - Browser chrome that hides on scroll changing viewport height constantly — debounce, but never
    to the point of a visibly lagging composer.

- **Acceptance criteria:**
  - [ ] Safe-area insets respected on all four edges, in portrait and landscape
  - [ ] Every interactive element meets the 44×44 minimum, enforced by lint
  - [ ] Composer stays visible above the virtual keyboard, with a documented fallback path
  - [ ] Streaming never moves the viewport while the user is reading earlier content
  - [ ] Browser overscroll refresh is disabled on chat; scoped refresh revalidates only, and there is
        no mobile fork of the component tree — responsive primitives only
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README / `docs/MOBILE.md` document the interaction rules
  - [ ] All existing tests still pass

---

### APTR-79: Web Push as a transport for the assistant's presence budget (not a notification tray)
- **Priority:** Critical
- **Labels:** aperture, mobile, push, soul-contract, security
- **Agent:** claude
- **Estimate:** 8h
- **Blocked by:** APTR-74
- **Description:** Web Push, implemented as a **transport** for the assistant's existing
  prioritized presence budget — never as an independent notification tray. Every push originates
  from a presence decision the assistant already makes (trait-scaled knock quota, quiet hours,
  per-user opt-out); Aperture adds a delivery channel and nothing else. This is Soul Contract
  clause 2, and it is the one item in this sprint whose *architecture* is the requirement: if
  Aperture can emit a notification that the presence budget did not authorise, the item has
  failed regardless of how well the plumbing works.

  ## FILES
  - `client/src/push/subscribe.ts` — subscription lifecycle: subscribe, refresh, revoke
  - `client/src/push/permission.tsx` — the permission request UX
  - `client/src/sw/push-handler.ts` — `push` and `notificationclick` handlers in the worker
  - `client/src/settings/PushSettings.tsx` — enable/disable, per-device list, quiet-hours link
  - `contracts/aperture-push-v1.md` — the presence-budget-to-push contract and payload shape
  - **Agent-core repo (sibling PR):** the push dispatch path — subscription storage, VAPID signing,
    and the **single chokepoint**, declared module-private inside the presence module so only the
    presence layer can call it, plus the `compile_fail` cases and the CI symbol check that keep it
    that way (see APPROACH 1a)

  ## APPROACH
  1. **Architecture first: one chokepoint.** The BFF exposes exactly one internal function that can
     send a push, and its only caller is the assistant's presence/knock decision path. There is no
     "notify" endpoint the client, a module, or the context bus can call directly. A module wanting
     the user's attention raises a presence candidate through the existing budget; the budget
     decides.
  1a. **How "exactly one caller" is enforced — by the compiler, not by a unit test.** Per Decision
     D8, a property of Rust call sites must be enforced in Rust, and "exactly one caller" is a
     static-analysis property that no runtime unit test can assert. Do **not** write a test that
     claims to count callers. The enforcement is three concrete, checkable things:
     - **Module-private visibility (primary).** The dispatch function is declared with no `pub` at
       all — plain private — inside the presence module, and the presence decision path is a
       sibling in that same module. Any call site outside the module is then a **compile error**,
       which is the strongest and cheapest gate available. The dispatch function is **never**
       `pub`, never `pub(crate)`, and never re-exported; the module's public surface is the
       presence-candidate API only.
     - **A CI symbol check (secondary, catches the loosening).** A CI job greps the crate for the
       dispatch function's identifier and **fails** if it appears in any file outside the presence
       module's own directory, and separately fails if the declaration ever acquires a `pub`,
       `pub(crate)`, or `pub(super)` qualifier or appears in a `pub use`. This catches the exact
       regression the visibility gate cannot catch on its own: someone widening the visibility to
       make a new call site compile. Wire it into the same CI file as the other Rust gates.
     - **A doc comment on the declaration** stating that its visibility is a Soul Contract clause 2
       enforcement mechanism and must not be widened, with a pointer to `contracts/aperture-push-v1.md`.
     What a *test* can and does assert is the behavioural half, and those tests stay: that no
     client-, module-, or context-bus-reachable route exists (route-table assertion), and that
     quiet hours / opt-out / quota decline paths dispatch nothing.
  2. Quiet hours, opt-out, and the trait-scaled quota are honored **by construction**, because the
     decision happens upstream of push. Aperture does not re-implement, re-check, or override any
     of them — a duplicate policy implementation is a second policy that will drift.
  3. **Keys by name only.** `APERTURE_VAPID_PUBLIC_KEY` and `APERTURE_VAPID_PRIVATE_KEY` are
     resolved **exclusively** through `SecretManager::get()` in the BFF — never `std::env::var`,
     never a literal, never a file. **The private key is used only inside the signing call: it can
     never reach a response body, an error body, a log line, stdout, a metric label, or a debug
     format.** The struct holding it carries a redacting `Debug`/`Display` impl and that redaction
     is asserted by test. The public key is served to the client through an authenticated BFF
     endpoint at subscribe time — it is **not** baked into the bundle, so rotation does not require
     a client rebuild. If either key is absent, push reports capability `unavailable` with a clear
     reason and **no stopgap key is generated**.
  4. **Permission UX that does not nag:** never request permission on load. Request only after an
     explicit user action in settings, or a single in-context offer at a moment where it is
     obviously relevant. Denial is durable and final — no re-prompt, and an honest explanation that
     the OS-level permission must be changed by the user. Track nothing about the funnel.
  5. Subscription lifecycle: subscribe → store server-side against the device record from Sprint B →
     re-subscribe transparently on `pushsubscriptionchange` → revoke on logout, on device revocation,
     and on push-disable. **Revocation must be complete**: a revoked device stops receiving
     immediately, asserted by test. Prune subscriptions the push service reports as gone rather than
     retrying them forever.
  6. Payload discipline: the push body carries the assistant's own words (Soul Contract clause 1 —
     generated upstream through the persona assembler, not templated in the client) plus the minimum
     routing metadata to open the right thread. **No sensitive content beyond what the user chose to
     surface**, respecting a "hide content on lock screen" setting; the fallback is a content-free
     knock. Payloads are encrypted per the Web Push standard; nothing else is logged about them.
  7. `notificationclick` focuses an existing client if one is open (never opening a duplicate) and
     deep-links to the exact thread. No notification is shown that the presence layer did not
     authorise — including the "a push arrived with no decoding key" case, which is dropped rather
     than shown as a generic placeholder where the platform allows.
  8. Run `cortex_scope` pre-change (credentials + a user-visible interrupt path) and record the
     `cortex_review` risk score in the PR body.

  ## TEST PLAN
  - **Compile gate:** the dispatch function is module-private, so a call site outside the presence
    module does not build. Prove it with a `compile_fail` doctest / trybuild-style case that calls
    it from another module and asserts the build FAILS. (This is the D8-compliant replacement for
    the "assert exactly one caller" unit test, which is not implementable and must not be written.)
  - **CI check:** the symbol check fails if the dispatch identifier appears in any file outside the
    presence module directory, or if its declaration gains `pub` / `pub(crate)` / `pub(super)` or a
    `pub use` re-export
  - Unit: the BFF route table contains no client-, module-, or context-bus-reachable notify route
  - Unit: quiet hours in effect → the presence layer declines → **no push is dispatched**
  - Unit: user opted out → no subscription is used, no dispatch attempted
  - Unit: quota exhausted for the window → no dispatch
  - Unit: permission is never requested without a preceding explicit user action
  - Unit: a denied permission is never re-requested
  - Unit: `pushsubscriptionchange` transparently re-subscribes and replaces the stored subscription
  - Integration: revoke a device → a subsequent presence-authorised push does not reach it
  - Integration: `notificationclick` focuses an existing client and routes to the correct thread
  - `grep` confirms zero `std::env::var` reads of the VAPID key names; both go through `SecretManager`
  - `grep` confirms no VAPID key material and no push endpoint literal in the client bundle
  - Unit: the private-key holder's debug/display renders a redaction marker, not the value
  - **Negative:** force an error on the signing path and assert the private key appears in **no**
    response body, error body, log line, or metric label emitted during the failure
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute paths in new/modified files
  - **Negative (the Soul Contract test):** attempt to dispatch a notification bypassing the presence
    budget — from a module, from the context bus, and from a client-callable route — and assert all
    three are impossible: no such route exists in the route table (runtime assertion), and each
    direct call attempt **fails to compile** (`compile_fail` cases), which is the enforcement, not
    a runtime rejection
  - **Negative:** with `APERTURE_VAPID_PRIVATE_KEY` absent, push reports `unavailable` and does NOT
    generate or fall back to a default key

  ## EDGE CASES
  - iOS delivers Web Push only to an app installed to the Home Screen, and permission must follow a
    user gesture — detect, explain honestly, and link to the install flow (APTR-73); do not present a
    toggle that cannot work. APTR-82 documents this in full.
  - The push service returns "gone" for a stale subscription — prune it; never retry indefinitely.
  - Multiple installed devices for one user — presence decides once; delivery fans out to the user's
    active devices without multiplying the knock quota.
  - A push arriving while the app is foregrounded on that thread — suppress the notification; the
    user is already there. An interruption for something already on screen is a budget waste.
  - Key rotation — subscriptions signed with the previous key must be re-established rather than
    silently failing; surface a re-subscribe rather than a mystery of silence.
  - A platform that shows a generic "site updated" notification when a payload cannot be decoded —
    accept it, document it (APTR-82), and never rely on it to carry meaning.

- **Acceptance criteria:**
  - [ ] Push has exactly one dispatch chokepoint, enforced by **module-private visibility** (never
        `pub`, `pub(crate)`, `pub(super)`, or re-exported) so an outside call site fails to compile,
        proven by a `compile_fail` case — not by a unit test claiming to count callers
  - [ ] A CI symbol check fails if the dispatch identifier appears outside the presence module or if
        its declaration is ever made more visible
  - [ ] No client-callable, module-callable, or context-bus-callable notification route exists
  - [ ] Quiet hours, opt-out, and the trait-scaled knock quota are honored by construction, with tests
  - [ ] VAPID keys are resolved only via the secret manager by name; the private key never leaves the
        BFF and cannot reach a response body, error body, or log line; the public key is not bundled
  - [ ] Missing key ⇒ capability `unavailable`; no stopgap key is ever generated
  - [ ] Permission is requested only after an explicit user action and never re-requested after denial;
        revocation is immediate and complete and stale subscriptions are pruned
  - [ ] No hardcoded infrastructure values in new/modified code; README documents push behaviour;
        all existing tests still pass

---

### APTR-80: OS integration — share target and media capture into a thread
- **Priority:** High
- **Labels:** aperture, mobile, share-target, media, capture
- **Agent:** claude
- **Estimate:** 6h
- **Blocked by:** APTR-73
- **Description:** Let the phone hand things to the assistant. Register Aperture as a share target
  so text, links, and images shared from any app land in a thread, and add photo and voice capture
  from the composer where the platform allows. Voice capture feeds the **existing** transcription
  capability through the sanctioned door — the BFF reaches it via `terminus-client` and addresses
  the model by **named proxy** only. Aperture does not gain a second media pipeline and does not
  learn any model names.

  ## FILES
  - `client/src/pwa/manifest.config.ts` — the `share_target` declaration (POST, multipart)
  - `client/src/share/ShareReceiver.tsx` — the landing surface: pick or create a thread, preview,
    edit, then send
  - `client/src/share/normalize.ts` — normalize shared payloads into attachment/message shapes
  - `client/src/capture/PhotoCapture.tsx` — camera/library capture with a client-side size guard
  - `client/src/capture/VoiceCapture.tsx` — record, review, cancel, send
  - `client/src/capture/useMediaCapability.ts` — feature/permission detection with honest states
  - `client/src/sw/service-worker.ts` — handle the share-target POST and route to the receiver
  - **Agent-core repo (sibling PR):** BFF transcription route — `terminus-client` only, named proxy
    only, size and duration limits enforced server-side

  ## APPROACH
  1. Declare `share_target` with `method: POST`, `enctype: multipart/form-data`, accepting `title`,
     `text`, `url`, and image files. The service worker intercepts the share POST, stashes the
     payload in the offline store, and navigates to `ShareReceiver` — a share must survive a cold
     start, since the app is frequently not running when a share arrives.
  2. **Nothing sends itself.** A share always lands in a review surface: choose the thread (default:
     most recent, plus "new thread"), see exactly what will be sent, edit the accompanying text,
     then send. A share that auto-posts to whatever thread was last open is a data-leak shape.
  3. Shared payloads route through the **existing** attachment pipeline from Sprint C and the
     outbox from APTR-76 — so a share received offline queues like anything else. No parallel upload path.
  4. Photo capture uses the platform file/camera input with a client-side dimension and byte guard,
     downscaling before upload where it helps; the server-side limit remains authoritative.
  5. Voice capture records locally with a visible level meter, a duration cap, and explicit
     review-before-send. Transcription is requested from the BFF, which calls the existing
     capability through `terminus-client`, addressing the model by **named proxy**. **No model id,
     engine name, backend tag, or size suffix appears in client or BFF code.** The transcript is
     shown for correction before sending — never auto-sent, because transcription is wrong sometimes
     and "send my mistake instantly" is not a feature.
  6. Permissions: request camera/microphone only at the moment of use, and render an honest inert
     state when denied or unsupported, with the platform-appropriate explanation. Never a control
     that silently does nothing.
  7. Captured media is discarded from local storage once acknowledged, or held in the outbox under
     its byte ceiling if queued. No capture is retained beyond its purpose, and nothing is uploaded
     anywhere except through the BFF.
  8. **Assistant-operable parity** (Module Contract clause 4): the share-into-thread action is
     available to the assistant as a Terminus tool, not only as a UI flow. Verify parity rather than
     assuming it.

  ## TEST PLAN
  - Integration: a share POST while the app is closed cold-starts into the receiver with the payload intact
  - Unit: text, link, image, and multi-file shares all normalize to the expected shapes
  - Unit: a share received offline enqueues to the outbox and replays on reconnect
  - Unit: the transcription request addresses a named proxy; a test asserts no model id, engine name,
    or backend tag appears anywhere in client or BFF code for this path
  - Unit: denied camera/microphone permission renders an explained inert state, not a dead control
  - Unit: an oversized capture is refused at capture time with a clear reason
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute paths in new/modified files
  - **Negative:** assert a shared payload is NEVER sent without an explicit user confirmation, including
    when the receiver is dismissed by navigation
  - **Negative:** assert a voice transcript is never auto-sent without user review
  - **Negative:** assert no direct HTTP client against any service URL is constructed on the
    transcription path — everything goes through `terminus-client`

  ## EDGE CASES
  - A share arriving while the user is logged out — hold the payload, authenticate, then resume to
    the receiver rather than dropping it.
  - A very large shared video or a file type Aperture does not handle — refuse clearly at the receiver
    with the reason, and never truncate silently.
  - A share arriving mid-stream in the target thread — queue behind the in-flight turn.
  - Browsers that support `share_target` for text but not files — degrade per capability, do not
    advertise file sharing where it will fail.
  - Microphone unavailable because another app holds it — distinguish "denied" from "busy" in the copy.
  - The transcription capability being unavailable — voice capture still records and can be sent as
    audio; it must not become a dead end.

- **Acceptance criteria:**
  - [ ] Share target accepts text, links, and images and survives a cold start
  - [ ] Every share lands in a review surface; nothing auto-sends
  - [ ] Shares and captures use the existing attachment pipeline and outbox — no parallel upload path
  - [ ] Transcription goes through `terminus-client` and addresses the model by named proxy only
  - [ ] Voice transcripts are reviewable and correctable before sending, and denied or unsupported
        capture renders an explained inert state
  - [ ] Share-into-thread is invocable by the assistant as a tool, not only as a button
  - [ ] No hardcoded infrastructure values in new/modified code; README updated
  - [ ] All existing tests still pass

---

### APTR-81: Mobile quality gates — performance budget and touch accessibility, both CI-enforced
- **Priority:** High
- **Labels:** aperture, mobile, performance, accessibility, ci
- **Agent:** codex
- **Estimate:** 7h
- **Blocked by:** APTR-74
- **Description:** Two mobile qualities that only survive if a machine defends them: **performance**
  (a bundle ceiling and a time-to-interactive target on a *mid-range* device) and **touch
  accessibility** (a screen-reader-correct streaming region, dynamic type without clipping, and
  honored reduced-motion). Both get a written budget, an automated check, and a CI job that **fails**
  when the budget is exceeded — not a warning, not a dashboard. A budget nobody enforces is a wish.

  ## FILES
  - `client/perf-budget.json` — per-chunk and total byte ceilings, TTI target, device profile
  - `client/scripts/check-perf-budget.mjs` — measures the built output, fails over budget
  - `client/scripts/check-tti.mjs` — headless throttled-profile TTI measurement
  - `client/scripts/check-a11y.mjs` — automated accessibility audit over the mobile surfaces
  - `client/src/chat/StreamingRegion.tsx` — the live region wrapper for streamed output
  - `client/src/styles/mobile.css` — dynamic-type and reduced-motion rules
  - `.gitea/workflows/ci.yml` — wire `perf-budget`, `tti`, and `a11y` jobs into CI
  - `docs/MOBILE.md` — the budgets, the device profile, and how to reproduce a failure locally

  ## APPROACH
  1. **Budget as data, not as folklore.** `perf-budget.json` declares: initial-route JS byte ceiling
     (compressed and uncompressed), CSS ceiling, total initial transfer ceiling, per-lazy-chunk
     ceiling, and the TTI target with its throttling profile (CPU multiplier + network profile) so
     the number means something reproducible.
  2. `check-perf-budget.mjs` walks the built output, sums per entry point, and fails with a table
     showing what regressed and by how much. Route-level code splitting is expected: the chat route
     must not pay for the Harmony or Muse module bundles.
  3. TTI is measured headlessly against the throttled mid-range profile on a fixed, seeded fixture —
     no live backend, so the number measures the client, not the network. Take the median of several
     runs and fail on the median to keep flakiness from either passing or blocking spuriously.
  4. **Streaming and screen readers:** the streamed assistant response lives in a polite live region
     that announces coherent increments, **not** every token — token-by-token announcement makes the
     app unusable with a screen reader and is the single most common streaming-a11y failure. Announce
     on sentence/segment boundaries with a floor interval, announce start and completion, and expose
     tool-call activity as status rather than as content noise.
  5. **Dynamic type:** all type scales from relative units off the token layer; nothing clips or
     becomes unreachable at large OS text sizes. The a11y check renders key surfaces at the largest
     supported scale and fails on overflow or clipped interactive elements.
  6. **Reduced motion:** `prefers-reduced-motion` removes non-essential animation, including
     streaming cursor pulses and transition slides, while keeping state changes perceivable. Assert
     it — reduced motion is respected in tokens, then broken by one hand-written keyframe, every time.
  7. The a11y job runs an automated audit (roles, names, contrast, focus order, target size) across
     the mobile surfaces and fails on any violation at the configured severity. Automated auditing
     catches maybe half of real problems — record that honestly in `docs/MOBILE.md`, and note that
     Sprint G's a11y item carries the manual pass.
  8. Gates fail **closed**: a missing or malformed measurement is a failure, never an implicit pass.

  ## TEST PLAN
  - `node client/scripts/check-perf-budget.mjs` passes on the clean build and prints the table
  - `node client/scripts/check-tti.mjs` produces a median TTI under target on the throttled profile
  - `node client/scripts/check-a11y.mjs` passes on the mobile surfaces at default and largest type scale
  - Unit: the streaming live region announces on segment boundaries, not per token
  - Unit: `prefers-reduced-motion` disables non-essential animation while state changes stay perceivable
  - CI: all three jobs run on every push and are required
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute paths in new/modified files
  - **Negative:** add a large dependency to the initial route and confirm the budget job FAILS; revert
  - **Negative:** feed the perf and a11y jobs a truncated/missing report and confirm they FAIL CLOSED
  - **Negative:** make the live region `aria-live="assertive"` per token and confirm the a11y test FAILS

  ## EDGE CASES
  - A CI runner slower or faster than the reference machine skewing TTI — normalize via the declared
    CPU multiplier and treat the profile as part of the budget; changing the profile is a budget change
    that needs review, not a quiet edit.
  - A legitimate, deliberate budget increase — allowed, but only by editing `perf-budget.json` in a PR
    with a rationale. Never by adding an ignore.
  - Lazy chunks technically keeping the initial route under budget while the first interaction pulls
    3 MB — budget the first meaningful interaction path too, not just the initial load.
  - Fonts dominating the budget — they are bundled (APTR-01), so subset them rather than fetching.
  - A screen reader that ignores live-region politeness — do not compensate with `assertive`; document
    the platform difference.
  - Reduced motion disabling something load-bearing (e.g. the only cue that a response is streaming) —
    replace with a static indicator, never remove the signal.

- **Acceptance criteria:**
  - [ ] `perf-budget.json` declares byte ceilings, a TTI target, and an explicit throttled device profile
  - [ ] CI fails when the bundle exceeds its ceiling or median TTI exceeds the target
  - [ ] Perf and a11y gates fail closed on a missing or malformed report
  - [ ] Streamed output announces on segment boundaries in a polite live region, never per token
  - [ ] Largest supported dynamic type causes no clipping or unreachable interactive elements, and
        `prefers-reduced-motion` removes non-essential animation while state changes stay perceivable
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README / `docs/MOBILE.md` document the budgets and how to reproduce a failure locally
  - [ ] All existing tests still pass

---

### APTR-82: Documentation — what the PWA can and cannot do, per platform, honestly
- **Priority:** High
- **Labels:** aperture, mobile, docs, honesty
- **Agent:** gemini
- **Estimate:** 5h
- **Type:** documentation
- **Blocked by:** APTR-73, APTR-74, APTR-79, APTR-80, APTR-200, APTR-202, APTR-203, APTR-205
- **Description:** The one document that tells the truth about the mobile target: what installs,
  what works offline, what push actually does on each platform, what is degraded, and what would
  genuinely require a native app later. It ships to the public mirror, and its whole value is that
  a reader can trust it. Overclaiming here costs more than the feature gap does — a reader who
  discovers an undocumented limitation stops trusting the documented ones. Mobile-native remains a
  **later** workstream; this document scopes what that would buy, without promising a date.

  ## AUDIENCE
  Three readers: the operator deciding whether the PWA is sufficient for daily use; a user hitting a
  limitation and needing to know whether it is a bug or the platform; and a future agent scoping the
  native workstream who needs the honest gap list rather than a rediscovery exercise.

  ## OUTLINE
  - What the mobile target is, and what it deliberately is not — one React bundle, installed, no
    native app in this sprint and none implied (~200 words)
  - Install, per platform: what the prompt-driven flow looks like where it exists, and the manual
    route where it does not; how to tell whether you are actually running installed (~500 words)
  - **Install and your session — the one that gets filed as a bug:** on the promptless platform an
    installed PWA gets a **separate storage partition** from the browser, so cookies and IndexedDB
    do not carry over. Installing therefore means signing in **once** in the installed app, after
    which memory, personality traits, relationship lore and full thread history are exactly as they
    were — nothing server-side is affected, and nothing is lost. State plainly that this is the
    platform's storage model and not an Aperture defect, that we deliberately do **not** work around
    it (every workaround would mean carrying a credential somewhere it must never go), and that
    offline caches start empty in the installed app until it has been used online once. Give the
    prompt-driven platform's contrasting behaviour in the same breath so nobody generalises from one
    phone to both (~400 words)
  - **Your data on the device:** what is stored locally (cached threads and messages, tool-call
    records, thumbnails, the outbox, drafts), that it is stored **unencrypted by the app** and
    relies on the OS's device encryption and app sandboxing, what that does and does not protect
    against, and the two actions that erase it — "clear offline data", and automatic purge on
    logout or device revocation. Reproduce the at-rest decision recorded in
    `contracts/aperture-offline-v1.md` in plain language rather than restating the contract
    verbatim (~450 words)
  - **Storage pressure and eviction:** that mobile platforms evict storage without asking, which
    data is protected against that and which is best-effort, what the user sees if it happens, and
    how to check current usage in settings (~300 words)
  - **Language:** the v0.1 posture — English-only, with all user-facing strings centralized so a
    locale can be added without touching components, and the current state of RTL layout support
    (~200 words)
  - Offline: what is available offline (shell, previously-read threads, composing into the outbox),
    what is not (fresh module data, live streaming, anything needing the kernel), how long cached
    content is kept, what "clear offline data" does — and the explicit assurance that clearing local
    data never touches assistant memory, traits, or lore (~600 words)
  - Updates: how a new version arrives, why it waits for you rather than swapping mid-session, how
    to force one, and the kill switch (~300 words)
  - Push notifications: that every notification comes from the assistant's presence budget and not
    from a notification tray; that quiet hours and opt-out govern it; the per-platform reality —
    including that installation to the Home Screen is a precondition on some platforms, that
    permission must follow a user gesture, that delivery is best-effort and platform-throttled, and
    that a platform may show a generic notification when a payload cannot be decoded (~700 words)
  - Sharing and capture: what the OS share sheet can hand over per platform, what photo and voice
    capture support, and where a platform restricts background capture (~400 words)
  - Background behaviour: the honest section — background sync and periodic sync are not universal,
    a suspended PWA does not poll, and message delivery while closed depends entirely on push
    (~400 words)
  - The per-platform capability matrix: one table, one row per capability, one column per platform,
    with values limited to supported / degraded / unavailable **and a one-line reason for anything
    not supported**. No aspirational cells. The matrix MUST include an explicit
    **"session carries over from browser to installed app"** row — `unavailable` on the promptless
    platform with the reason "installed app uses a separate storage partition; sign in once after
    installing" — plus rows for stream resume after a network change, background sync, persistent
    storage, drafts surviving an OS kill, and offline purge on revocation (~table)
  - What would require going native, and what it would buy: background execution, richer notification
    surfaces, deeper OS integration, hardware access beyond the web platform, store distribution —
    each with the concrete Aperture behaviour it would unlock. Explicitly scoped as a later
    workstream with no date claimed (~600 words)
  - Troubleshooting: the install did not appear; the app is stuck on an old version; push arrives on
    one device but not another; offline shows nothing; the composer is hidden by the keyboard; **"it
    asked me to sign in again after I installed it"** (expected — the storage-partition section
    above); **"my cached threads vanished"** (either storage eviction or a purge after logout /
    device revocation — both are working as designed); **"the response stopped when I walked out of
    Wi-Fi"** (what resume does and does not recover) (~700 words)

  ## SOURCES
  - `contracts/aperture-offline-v1.md`, `contracts/aperture-conflict-v1.md`,
    `contracts/aperture-push-v1.md`
  - `docs/OFFLINE.md`, `docs/MOBILE.md`, `docs/INSTALL.md`, `docs/CONFIGURATION.md`
  - The epic's Soul Contract compliance section, clause 2 in particular
  - `contracts/aperture-purge-v1.md` (APTR-200) and the i18n posture note from APTR-205
  - The implemented capability-detection code from APTR-73, APTR-79, APTR-80, APTR-200, APTR-202 and
    APTR-203 — the matrix must be derived from what the code actually detects and what the WebKit-engine
    CI job (APTR-204) actually proves, not from a vendor support table

  ## TONE
  Technical reference, direct, no marketing, no hedging in either direction. Where a platform limits
  us, name the limit and move on — no apology, no blame, no speculation about future platform
  support. **No internal hostnames, IPs, ports, org names, personal identifiers, or absolute paths** —
  env-var names and placeholders only; this file ships publicly. Every claim in the capability matrix
  must be traceable to a test or to detection code in this repo; if it cannot be, mark it "not
  verified" rather than asserting it.

---

### APTR-93: Retire the legacy PWA module in the agent core (cross-repo, merges FIRST)
- **Priority:** Critical
- **Labels:** aperture, mobile, pwa, agent-core, cleanup, cross-repo
- **Agent:** claude
- **Estimate:** 5h
- **Description:** Remove the legacy `pwa` module from the agent core — its stub web app manifest,
  its near-empty service worker, and its server-rendered mobile dashboard route — so that the
  Aperture PWA is the only installable surface on the origin. Two manifests on one origin makes
  install identity browser-dependent and can stop updates applying entirely, and a stale legacy
  service worker can keep serving an old shell long after the server-side code is gone. This is
  live production code in a **different repository**, so per the multi-repo rule it is its own item
  and its own PR, reviewed on its own merits, with its own rollback story.

  **Numbering:** this item is numerically out of sequence. It was split out of APTR-73 after Sprint
  G had already been allocated APTR-83..92, so 93 was the next free number. **The number is an
  identifier, not an ordering** — APTR-93 is the FIRST item of Sprint F to merge, and APTR-73 is
  `Blocked by` it. Do not renumber it, and do not infer execution order from it.

  ## FILES
  - **Agent-core repo (its own PR — merges before every other item in this sprint):** delete the
    `pwa` module (the manifest handler, the service-worker handler, the mobile dashboard route,
    their templates/assets, and their registration in the router); remove now-dead helpers and
    tests that existed only to serve it; update the crate's route table and any feature flag that
    gated it
  - **This repo:** `docs/BFF-PLACEMENT.md` — record the removal, the route disposition decision,
    and the rollback note, so the decision is discoverable from the Aperture side
  - **This repo:** `docs/INSTALL.md` — a short "migrating from the old mobile page" note

  ## APPROACH
  1. **Inventory before deleting.** Enumerate exactly what the legacy module serves today: the
     manifest route, the service-worker script route, the server-rendered mobile dashboard route,
     and any icon/asset routes hanging off it. Record the list in the PR body — a deletion PR whose
     body does not enumerate what was served is not reviewable.
  2. **Confirm nothing else references those routes.** Search the agent-core repo and every sibling
     module surface for links, redirects, bookmarks in docs, tests, health checks, or reverse-proxy
     rules that point at them. Ground the search in the Atlas KG (`kg_search` for the module,
     `kg_neighbors` / `kg_subgraph` for inbound references) rather than grep alone, and run
     `cortex_scope` for the remote whole-graph blast radius before writing the deletion. Record the
     `cortex_review` risk score in the PR body.
  3. **Route disposition — decision, with justification.** The manifest and service-worker routes
     **404** after removal; the mobile dashboard route **redirects** to the Aperture shell.
     Rationale: a redirected manifest or service-worker script is worse than a missing one, because
     browsers treat a redirected service-worker script as an error but may cache a redirected
     manifest and bind install identity to the wrong document — a clean 404 makes the browser drop
     the registration and is the only unambiguous signal. The dashboard route, by contrast, is a
     *human* entry point that people have bookmarked, so it redirects rather than 404s. State this
     decision in `docs/BFF-PLACEMENT.md`, not only in the PR.
  4. **Actively unregister the stale worker.** Removing the server-side route does not remove a
     service worker already installed in someone's browser — it can keep serving its cached shell
     more or less indefinitely. Before/with the deletion, serve a final **self-unregistering
     service worker** at the legacy script path for one deploy window: a worker whose `install`
     calls `skipWaiting`, whose `activate` calls `self.registration.unregister()`, deletes every
     cache it owns, and reloads its clients. Only after that window does the path move to 404.
     This is the single most important step in the item — skipping it converts a clean removal
     into a class of "some users are stuck on a page that no longer exists" reports that are
     extremely hard to reproduce.
  4a. **The window is fixed here, in the spec, and it is time-based and generous: at minimum
     30 calendar days** from the deploy of the transitional worker. It is **not** left to the PR
     body, and it is **not** measured in deploys, in traffic, or in "when it looks quiet". The
     reasoning is mechanical and should be reproduced in `docs/BFF-PLACEMENT.md` so nobody
     shortens it later on a hunch:
     - Browsers recheck a service-worker script **at most once every 24 hours**, so the fastest
       possible pickup for any given client is a day — and that is a ceiling on frequency, not a
       guarantee of occurrence.
     - That recheck only happens **on navigation**. A worker sitting in a dormant install performs
       no navigation, so it does not check at all. Installed-but-rarely-opened is the *normal*
       state for a bookmark-grade mobile surface, which is exactly what the legacy module was.
     - There is **zero telemetry** in this project by design (Module Contract clause 6), so there
       is no signal that would ever tell us the window can close early. With no measurement
       available, the only defensible choice is a long, fixed, documented window.
     Record the deploy date of the transitional worker and the resulting earliest-404 date in
     `docs/BFF-PLACEMENT.md`. Closing the window early is a decision that needs a fresh operator
     call, not a judgement made mid-cleanup; the cost of waiting longer is one static route, and
     the cost of closing early is a permanently bricked installed client.
  4b. **The transitional worker script MUST be served with `Cache-Control: no-store`**, and so
     must the legacy script path for the whole window. This is not hygiene — it is the mechanism.
     A legacy worker that has the old script sitting in an HTTP cache can revalidate against that
     cache and never see the replacement, which silently converts the 30-day window into no window
     at all. `no-store` guarantees that the moment a client does navigate, it fetches the
     transitional script bytes from the origin and the unregistration actually runs. Assert the
     header in a test; a missing header here fails silently in exactly the population it was meant
     to reach, which is the worst possible failure shape.
  5. **Rollback note (explicit).** The change is a revert of one PR: restoring the module restores
     all routes, and no data migration, schema change, or persisted state is involved. The one
     asymmetry is the unregistration in step 4 — browsers that already unregistered will not
     re-register the legacy worker on rollback; they simply fall back to the network, which is the
     correct degraded behaviour. Write this in the PR body and in `docs/BFF-PLACEMENT.md`, and say
     plainly that rollback restores the server but not the previously-installed clients.
  6. **Continuity:** removing this module must not touch sessions, Engram memory, personality
     traits, or relationship lore. The legacy surface is a rendering path, not a store — assert it.
  7. Feature-flag hygiene: if the module sat behind a cargo feature, remove the feature and its
     references too, so no build configuration can resurrect a second manifest later.

  ## TEST PLAN
  - Agent-core test gate through the compiler tool — full workspace tests pass after the deletion
  - Build with every feature combination that previously existed; no dead-code or unused-import
    warnings that would break a `-D warnings` gate
  - Assert the manifest and service-worker routes return 404 after the unregistration window
  - Assert the legacy dashboard route redirects to the Aperture shell and does not 404
  - Assert the transitional self-unregistering worker unregisters itself, clears its caches, and
    reloads clients when exercised in a headless browser
  - Assert the legacy service-worker script path responds with `Cache-Control: no-store` for the
    whole window (header assertion against the route, not a manual check)
  - Assert `docs/BFF-PLACEMENT.md` records the transitional-worker deploy date and an
    earliest-404 date at least 30 days later, and that the routes still serve the transitional
    worker (not a 404) before that date
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute paths in new/modified files
  - **Negative (the point of the item):** crawl the origin and assert exactly **ONE** web app
    manifest is served — the test fails if a second manifest is reachable at any path
  - **Negative:** serve the transitional worker **with** a cacheable `Cache-Control` and assert the
    header test FAILS; and assert a legacy client holding a cached copy of the old script never
    picks up the replacement in that configuration. Revert to `no-store`.
  - **Negative:** a browser with the legacy PWA already installed degrades predictably — it lands on
    the Aperture shell (or a clear explanation) and never on a blank page, a raw 404 body, or an
    indefinitely-cached stale shell
  - **Negative:** assert no session, memory, trait, or lore state is read or written by the removal
    path — continuity is untouched


  ## EDGE CASES
  - **A user who already installed the legacy PWA.** Their home-screen icon points at the legacy
    start URL. After the change that URL redirects to the Aperture shell, so the installed app keeps
    working in a degraded but coherent way; the install identity, name, and icon remain the legacy
    ones until they reinstall. `docs/INSTALL.md` must tell them to remove and reinstall, and APTR-73's
    install affordance should be visible to them when they land.
  - **A cached legacy service worker still live in a browser.** The nasty one: it can serve its
    cached shell forever with no server involvement, and the user sees an app that no longer exists
    while every server-side test passes. The transitional self-unregistering worker in step 4 is the
    fix; a plain 404 on the script path is *not* reliably sufficient on its own and must not be
    treated as the whole answer.
  - A reverse proxy or cache in front of the origin still serving the legacy manifest from its own
    cache after the deletion — verify the origin *and* the edge, and purge if needed.
  - The unregistration window overlapping the APTR-73 deploy — sequence them: unregister window
    completes, then the legacy paths 404, then APTR-73's manifest ships. Overlapping produces two
    live manifests, which is the exact bug being removed. Note the practical consequence of the
    30-day floor: **this item merges first but its window outlives the sprint**, so the final
    404 flip is a scheduled follow-up ops action, not a step inside this PR. Say that plainly in
    the PR body so nobody treats the still-live legacy path as an incomplete merge.
  - Pressure to shorten the window because "surely everyone has opened it by now" — there is no
    telemetry that could support that claim, which is precisely why the window is fixed at ≥30
    days rather than judged. Do not shorten it without a fresh operator decision.
  - An edge cache or reverse proxy stripping or overriding `Cache-Control: no-store` on the
    transitional script — verify the header **as observed by a client**, not only as set by the
    origin, because the whole mechanism depends on it surviving the last hop.
  - A health check or uptime probe pointed at the legacy dashboard route — find it in step 2 and
    repoint it, or the removal shows up as a false outage.
  - Deep links in old chat history or documentation pointing at the legacy page — the redirect covers
    them; that is a second reason the dashboard route redirects rather than 404s.

- **Acceptance criteria:**
  - [ ] Legacy `pwa` module fully removed from the agent core, including its feature flag and
        now-dead helpers, in its own PR against that repository
  - [ ] Every route the module served is inventoried in the PR body, with all inbound references
        found (KG-grounded, plus `cortex_scope`) and repointed or removed
  - [ ] Manifest and service-worker paths 404; the mobile dashboard path redirects to the Aperture
        shell — with the rationale recorded in `docs/BFF-PLACEMENT.md`
  - [ ] A transitional self-unregistering service worker is shipped at the legacy script path for a
        fixed, time-based window of **at least 30 calendar days**, served with `Cache-Control:
        no-store`, with the deploy date and earliest-404 date recorded in `docs/BFF-PLACEMENT.md` —
        the window length is set here in the spec, not deferred to the PR body
  - [ ] Exactly ONE web app manifest is served on the origin, asserted by a crawling negative test
  - [ ] An already-installed legacy PWA degrades predictably, never to a blank page or a permanently
        stale shell
  - [ ] Removal touches no session, memory, trait, or lore state, and the rollback note is recorded
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass

---

### APTR-200: Purge all local data on logout and on device revocation (Decision D6)
- **Priority:** Critical
- **Labels:** aperture, mobile, offline, security, privacy, sovereignty
- **Agent:** claude
- **Estimate:** 8h
- **Blocked by:** APTR-77, APTR-201
- **Description:** Ending a session or revoking a device MUST erase that device's local copy of the
  user's conversations. Today nothing does. Everything Sprint F builds — the thread cache, the
  outbox, drafts, cached attachment blobs and thumbnails, the pending-share payload, the push
  subscription — is durable client-side storage that currently outlives the session that created
  it, so a logged-out or revoked device remains a **fully readable offline copy** of the user's
  conversations. For a project whose entire premise is sovereignty, that is the most serious
  omission in the sprint: revocation that leaves the data behind is not revocation, it is a
  password change. This item makes purge a first-class, mandatory, tested path. Per Decision D6 it
  is its own item with its own negative test, and it is **not** a line inside APTR-75 or APTR-76,
  because a purge that lives as a footnote in another item is a purge that gets partially
  implemented and never fully tested.

  ## FILES
  - `client/src/offline/purge.ts` — the single purge entry point: enumerate, erase, verify
  - `client/src/offline/purgeRegistry.ts` — the registry every durable store must register with
  - `client/src/auth/useSessionLifecycle.ts` — logout, session-invalid, and revocation triggers
  - `client/src/settings/SignOutFlow.tsx` — sign-out UX including the unsent-work review step
  - `client/src/offline/__tests__/purge.test.ts` — completeness, idempotence, and crash-resume tests
  - `client/scripts/check-purge-registry.mjs` — build-time check that every durable store is registered
  - `contracts/aperture-purge-v1.md` — what is erased, on which triggers, in what order, and the
    guarantees and non-guarantees (including the offline-revocation window)
  - `contracts/aperture-offline-v1.md` — cross-reference: every cache class names its purge behaviour
  - **Agent-core repo (sibling PR):** device revocation is observable to the client — the session
    check returns a distinguishable `revoked` outcome, and revoking a device also invalidates its
    stored push subscription server-side

  ## APPROACH
  1. **One purge entry point, and a registry that makes omission a build failure.** Every durable
     client store — the IndexedDB databases from APTR-75, the outbox from APTR-76, drafts from
     APTR-201, the pending-share payload from APTR-80, the identity marker, the push subscription,
     and every service-worker cache carrying **user data** — registers itself in `purgeRegistry.ts`
     with an erase function. `purge.ts` iterates the registry; it never hardcodes a list.
     `check-purge-registry.mjs` fails the build if a module creates a durable store (an IndexedDB
     `open`, a `caches.open`, a `localStorage` write) without a registry entry. This is the
     anti-omission gate, and it is the reason a *future* store cannot silently reintroduce the hole.
  2. **Triggers — all four, explicitly.** (a) explicit user sign-out; (b) the server reporting the
     session invalid or expired; (c) the server reporting this device **revoked** (from another
     device or by the operator); (d) the identity marker not matching the authenticated user on
     reconnect (the account-switch case from APTR-75). Every path lands in the same `purge.ts`
     call — there is no second erase implementation and no partial variant.
  3. **The app-shell precache is deliberately NOT purged.** It contains no user data, and erasing
     it turns every sign-out into a full re-download and can leave a device unable to boot offline
     to show its own signed-out state. `contracts/aperture-purge-v1.md` states this distinction —
     *user data is erased, application code is not* — so the exclusion is a written decision rather
     than something a reviewer has to infer.
  4. **Unsent user text: the one place logout and revocation differ, and they differ on purpose.**
     - **Explicit user sign-out** is a cooperative act, and Sprint F's standing rule is that user
       text is never discarded without user action. If the outbox or drafts are non-empty, sign-out
       first shows what is unsent, offers copy-out (and send-now if online), and requires an
       explicit confirmation before erasing. The user can still choose to sign out and lose it —
       they simply cannot do so *unknowingly*.
     - **Revocation and session-invalid are adversarial**, so they purge **immediately and
       unconditionally**, with no review step and no confirmation. The device may be lost or stolen;
       preserving unsent text on it would defeat the entire point. Say this trade-off out loud in
       the contract: on revocation, unsent local text is destroyed, and that is the correct outcome.
  5. **Purge is atomic-in-effect, idempotent, and crash-resumable.** Write a purge-pending marker
     **before** erasing anything and clear it only after the verification pass succeeds. If the app
     is killed mid-purge, the marker is found at next boot and the purge restarts before any data
     is rendered. Rendering is **blocked** on the purge completing — never render cached content
     while a purge is pending, because a half-purged store is exactly the state an attacker wants.
  6. **Verify, do not assume.** After erasing, re-enumerate every registered store and assert it is
     empty (or absent). If any store cannot be erased — a store held open by another tab, a quota
     error, a browser refusing deletion — the purge does **not** report success: it retries, and if
     it still cannot complete it surfaces an honest, non-dismissable warning naming what remains,
     and retries on next boot. A purge that silently fails is worse than no purge, because it
     produces false confidence in exactly the situation where confidence matters.
  7. **Multi-tab.** Purge broadcasts to every open client, which must drop in-memory state and
     navigate to the signed-out shell. One tab still holding a hydrated thread list in memory after
     another tab signed out is the same leak wearing a different hat.
  8. **Offline revocation is a bounded, documented window, not a lie.** A device with no network
     cannot learn it has been revoked, so it keeps its cache until it next reaches the server —
     at which point the purge runs before anything renders. State this honestly in
     `contracts/aperture-purge-v1.md` and in APTR-82's matrix. Do **not** claim instantaneous
     remote wipe; a web client cannot deliver that, and overclaiming it is worse than the gap.
  9. **Continuity is untouched.** Purge is local-only. It erases a *view*; it must never issue any
     call that deletes, resets, or modifies Engram memory, personality traits, relationship lore,
     or server-side thread history. Signing back in restores everything from the server. Assert
     this, because "clear the user's data" is exactly the phrasing under which someone eventually
     deletes the wrong thing.
  10. Run `cortex_scope` pre-change (session, revocation, and durable-state paths) and record the
     `cortex_review` risk score in the PR body.

  ## TEST PLAN
  - Unit: the purge registry contains an entry for every durable store the client creates; adding a
    store without registering it fails `check-purge-registry.mjs`
  - Unit: all four triggers (sign-out, session-invalid, revoked, identity mismatch) invoke the same
    single purge entry point
  - Unit: purge is idempotent — running it twice succeeds and leaves the same empty state
  - Unit: a purge interrupted mid-way leaves the pending marker set, and the next boot completes the
    purge **before** any cached content is rendered
  - Unit: an unerasable store causes purge to report failure and retry, never a false success
  - Unit: explicit sign-out with a non-empty outbox or drafts requires confirmation and offers
    copy-out; revocation purges unconditionally with no review step
  - Integration (multi-tab): sign-out in one tab drops in-memory state and signs out every open tab
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute paths in new/modified files
  - **Negative (the point of the item):** authenticate, cache several threads, queue outbox
    messages, save drafts, cache attachment thumbnails — then sign out, then **boot the app fully
    offline** and assert that **no** thread content, message text, draft, queued message,
    attachment, thumbnail, or identity marker is readable through the app *or* present in raw
    IndexedDB / Cache Storage when inspected directly. Repeat the identical assertion for the
    device-revocation trigger. This test must inspect the raw storage layer, not only the rendered
    UI — a UI that merely refuses to display retained data has not purged anything.
  - **Negative:** assert purge issues no request and no local call that deletes or resets Engram
    memory, personality traits, relationship lore, or server-side thread history — sign back in and
    assert all of it is intact

  ## EDGE CASES
  - A second tab holding an IndexedDB connection open, blocking a database delete — coordinate via
    the broadcast in APPROACH 7, close connections, then delete; treat a persistent block as a purge
    failure per APPROACH 6 rather than as done.
  - Sign-out while the outbox is mid-drain — stop the drain first, then apply the APPROACH 4 rules;
    never purge a record that is in-flight in a way that could double-send on the next session.
  - Revocation arriving mid-stream — terminate the stream, purge, then render the signed-out shell.
    Do not let the tail of a response render after the device has been revoked.
  - Storage the browser refuses to delete in private-browsing or restricted modes — surface it
    honestly; a warning naming what remains beats a green checkmark that is wrong.
  - A user signing out purely to fix a glitch and losing their offline cache as a side effect —
    acceptable and correct, but the sign-out copy should say that offline data will be cleared, so
    it is an informed choice.
  - A future store added by another sprint (Sprint G, or the native workstream) — the registry check
    is what catches it. Do not weaken the check to unblock a build; register the store.
  - Purge on a device that was **already** signed out — a no-op that must still succeed and still
    clear a stale pending marker, because boot-time purge resumption runs unconditionally.

- **Acceptance criteria:**
  - [ ] A single purge entry point erases every durable local store — thread cache, messages,
        tool-call records, drafts, outbox, cached attachments and thumbnails, pending shares, the
        identity marker, and the push subscription — driven by a registry, not a hardcoded list
  - [ ] The build FAILS if any module creates a durable store without a purge-registry entry
  - [ ] Sign-out, session-invalid, device-revoked, and identity-mismatch all trigger the same purge;
        revocation purges immediately and unconditionally, while explicit sign-out first offers
        copy-out of unsent text and requires confirmation
  - [ ] Purge is idempotent and crash-resumable, and no cached content is rendered while a purge is
        pending; a purge that cannot complete reports failure and retries — never a false success
  - [ ] **Negative test passes:** after sign-out or revocation, an offline boot exposes no thread
        content, drafts, queued messages, or attachments through the app **or** in raw client storage
  - [ ] `contracts/aperture-purge-v1.md` documents what is erased, what is deliberately not (the
        app-shell precache), and the offline-revocation window, with no overclaim of remote wipe
  - [ ] Purge never deletes or resets Engram memory, personality traits, relationship lore, or
        server-side history — signing back in restores everything
  - [ ] No hardcoded infrastructure values in new/modified code; README updated; all existing tests pass

---

### APTR-201: Per-thread composer draft persistence that survives a crash, an eviction, or an OS kill
- **Priority:** High
- **Labels:** aperture, mobile, offline, drafts, ux
- **Agent:** claude
- **Estimate:** 5h
- **Blocked by:** APTR-75, APTR-203
- **Description:** The half-typed message is the most valuable unsent thing in the app, and right
  now **no draft persistence exists anywhere in the build**. APTR-78 defends the composer against a
  stray pull-to-refresh gesture, which is one of several ways to lose it and by far the least
  likely on a phone: the app is far more often killed by the OS under memory pressure, evicted from
  a background tab, crashed, or simply left for two days. The outbox (APTR-76) protects messages the
  user has already **sent**; nothing protects the one they were still writing. This item persists
  per-thread drafts to the offline store and restores them, so composing something long on a phone
  stops being an act of faith.

  ## FILES
  - `client/src/offline/drafts.ts` — draft store: save (debounced), load, clear, enumerate, evict
  - `client/src/chat/useDraft.ts` — the composer hook binding a thread's draft to the input
  - `client/src/chat/Composer.tsx` — restore on mount, clear on successful enqueue (APTR-78 file)
  - `client/src/chat/DraftIndicator.tsx` — the "unsent draft" affordance in the thread list
  - `client/src/offline/purgeRegistry.ts` — register the draft store (APTR-200)
  - `contracts/aperture-offline-v1.md` — draft retention, size caps, and the durability guarantee
  - `client/src/offline/__tests__/drafts.test.ts`

  ## APPROACH
  1. A draft is keyed by `(identity marker, thread_id)` — the same namespacing as every other store
     from APTR-75, so drafts can never leak across accounts and are purged with everything else by
     APTR-200. A pending "new thread" draft gets a stable synthetic key so it survives too.
  2. **Save on a debounce, and on the events that actually precede death.** Debounced input saving
     (a few hundred ms) is the baseline, but a debounce alone loses the last keystrokes when the OS
     kills the app. Also flush synchronously on `visibilitychange` to hidden and on `pagehide` —
     these are the only lifecycle events reliably delivered before a mobile PWA is frozen or
     terminated. `beforeunload` is **not** reliable on mobile and must not be the mechanism.
  3. Restore on composer mount for that thread, without stealing focus or re-triggering send. A
     restored draft is visually indicated as restored so the user is not surprised by text they do
     not remember typing being there — and never auto-sent under any circumstance.
  4. Clear the draft **only** on a confirmed enqueue into the outbox, not on the send *gesture* — if
     the enqueue fails (quota, validation), the text must still be in the composer. Clearing on the
     gesture is how "I pressed send and my message evaporated" happens.
  5. Bounds: a per-draft character cap, a total-drafts cap, and LRU eviction of the oldest drafts
     under APTR-203's byte budget. Drafts are small; they get a modest reserved share and are among
     the **last** things evicted, because a lost draft is user-authored content while a cached
     thread is re-fetchable.
  6. Surface drafts: the thread list shows an "unsent draft" indicator, and settings can enumerate
     and discard them. A draft the user cannot find is a draft they lost anyway.
  7. Attachments staged but not sent are **referenced** by the draft, not duplicated into it, and
     follow the existing attachment byte ceiling. If a staged attachment was evicted, restore the
     text and say plainly that the attachment is gone rather than restoring a broken reference.
  8. **Never auto-send a restored draft**, never send one on reconnect, and never move a draft into
     the outbox without an explicit user send. A draft is not a queued message and the two stores
     stay separate.

  ## TEST PLAN
  - Unit: typing then simulating a hidden/`pagehide` lifecycle persists the latest text, including
    keystrokes inside the debounce window
  - Unit: cold start restores the draft for the right thread and only that thread
  - Unit: drafts are namespaced by identity marker — a second identity does not see the first's drafts
  - Unit: a failed enqueue leaves the draft intact; a confirmed enqueue clears it
  - Unit: eviction under the byte budget removes cached threads before drafts
  - Unit: the draft store is registered in the purge registry and is erased by APTR-200's purge
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute paths in new/modified files
  - **Negative:** assert a restored draft is NEVER sent automatically — not on restore, not on
    reconnect, not on outbox drain — and that no code path moves a draft into the outbox without an
    explicit user send action

  ## EDGE CASES
  - Two tabs editing the same thread's draft — last write wins on a per-thread basis with a version
    stamp; do not merge text, and do not let a stale tab's flush overwrite newer text.
  - A draft for a thread that was deleted or archived server-side — keep the text, surface it as
    orphaned with copy-out, and offer "send to a new thread". Never discard it silently.
  - IndexedDB unavailable (private browsing) — degrade to in-memory drafts and say so; do not
    pretend durability that is not there.
  - A very long draft approaching the character cap — warn at the boundary rather than truncating.
  - A restored draft in a thread whose conversation has since moved on — that is APTR-77's territory
    only once the user sends; until then it is just a draft and must not trigger a conflict prompt.
  - The user deliberately clearing the composer — that clears the draft; an empty composer must not
    resurrect old text on the next mount.

- **Acceptance criteria:**
  - [ ] Per-thread drafts persist on debounced input and flush on `visibilitychange`/`pagehide`, and
        survive reload, tab eviction, crash, and OS termination of the PWA
  - [ ] Drafts are namespaced per identity, registered in the purge registry, and erased by APTR-200
  - [ ] Restore is non-destructive and visibly indicated; a failed enqueue keeps the text, and only a
        confirmed enqueue clears it
  - [ ] Drafts are enumerable and discardable from the thread list and settings, with a per-draft and
        total cap, and are evicted after re-fetchable cached content, not before
  - [ ] **Negative test passes:** a restored draft is never auto-sent and never enters the outbox
        without an explicit user send
  - [ ] `contracts/aperture-offline-v1.md` documents draft retention, caps, and the durability guarantee
  - [ ] No hardcoded infrastructure values in new/modified code; README updated; all existing tests pass

---

### APTR-202: Stream resume across mobile network handoff, mid-response
- **Priority:** Critical
- **Labels:** aperture, mobile, streaming, sse, reliability
- **Agent:** claude
- **Estimate:** 6h
- **Blocked by:** APTR-75
- **Description:** The single most common mobile failure mode has no item and no test in this
  sprint: the user walks out of Wi-Fi onto cellular, or through a tunnel, or the radio hands off
  between cells, **while the assistant is mid-response**. The connection dies, and the current
  behaviour is a response that stops halfway with no recovery — the worst possible outcome, because
  the turn is still running on the server and the user has no way to see the rest of it. Sprint B
  owns the resume mechanism; this item owns making it work under real mobile conditions and proving
  it with a test that actually kills the radio. Per Decision D3, a stream is one connection, a turn
  is refcounted with a grace window, resume within the replay window reattaches to the live turn,
  and an aged-out position produces a `resync` event. This item consumes that contract; it must not
  invent a second one.

  ## FILES
  - `client/src/stream/resume.ts` — resume policy: last-received event id, backoff, attempt budget
  - `client/src/stream/useStreamConnection.ts` — detect death fast, reconnect, reattach, dedupe
  - `client/src/stream/StreamStatus.tsx` — the honest reconnecting / resumed / resync indicator
  - `client/src/offline/useOnlineStatus.ts` — network-change signals feed resume (APTR-75 file)
  - `client/src/stream/__tests__/resume.test.ts`
  - `contracts/aperture-events-v1.md` — cross-reference the mobile resume expectations (do not
    redefine the event contract; Sprint B owns it)
  - `docs/MOBILE.md` — what resume recovers, and what it does not

  ## APPROACH
  1. **Detect death quickly, because mobile does not send a close frame.** A handed-off radio leaves
     a socket that is open-but-dead. Rely on a server heartbeat/comment interval plus a client-side
     inactivity timeout — **never** on the browser's online flag, and never on waiting for a TCP
     timeout that can take minutes. Treat network-change and visibility-restored events as
     *hints to probe*, not as truth (APTR-75's reachability confirmation is the arbiter).
  2. **Resume by position, not by restart.** The client tracks the last event id it processed and
     reconnects with it, per the Sprint B resume mechanism. Within the replay window this reattaches
     to the still-live turn and increments its refcount (Decision D3), so the response continues.
     **Never re-issue the user's message to "get the answer again"** — that is a duplicate send, and
     the idempotency work in APTR-76 exists precisely so nothing is tempted to do it here.
  3. **Deduplicate on reattach.** Replayed events overlapping what was already rendered must be
     discarded by event id, so the response never shows a repeated fragment. This is the failure
     that makes resume look worse than no resume, and it gets its own test.
  4. **Honour the refcount grace window rather than fighting it.** A dropped mobile connection must
     not cancel the turn: cancellation is refcount-zero **plus** the grace window (Decision D3), and
     the grace window is what covers a handoff. The client does not send an explicit cancel on a
     transport drop — explicit "stop generation" is a *different*, deliberate action and must remain
     distinguishable from a radio hiccup.
  5. **Bounded, honest degradation.** Reconnect with exponential backoff and jitter, capped in both
     interval and attempts. On `resync` (position aged out, per D3) fetch the thread over REST and
     render the completed turn — the user gets the whole answer, just not as a stream. If resume
     genuinely fails, say so plainly and offer a refresh; never leave a truncated response looking
     like the assistant simply stopped talking mid-sentence.
  6. **Status is visible and truthful.** A brief, non-alarming "reconnecting" indicator during the
     gap; a silent recovery when it works. Do not show a scary error for a 900ms handoff, and do not
     hide a failure that lasted a minute.
  7. Backgrounding is not a network failure: on resume-from-background, probe and reattach the same
     way. A phone that was in a pocket for two minutes takes the same path as a tunnel.
  8. Run `cortex_scope` pre-change (streaming transport) and record the `cortex_review` risk score
     in the PR body.

  ## TEST PLAN
  - Unit: an inactivity timeout with no heartbeat classifies the stream as dead without waiting on
    the browser's online flag
  - Unit: reconnect sends the last processed event id and reattaches; overlapping replayed events are
    deduplicated by id and rendered exactly once
  - Unit: backoff is exponential with jitter and capped in interval and attempt count
  - Unit: a `resync` outcome falls back to a REST refetch that renders the complete turn
  - Integration (headless, throttled mobile profile): start a response, **drop connectivity
    mid-stream**, restore it, and assert the response completes with no duplicated and no missing
    tokens, and that exactly one user message exists server-side
  - Integration: background the app mid-stream, return after the heartbeat interval, assert reattach
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute paths in new/modified files
  - **Negative:** assert a transport drop NEVER re-sends the user's message and NEVER emits an
    explicit cancel — the turn survives the grace window and the server sees one turn, not two

  ## EDGE CASES
  - Handoff during the very first token, before any event id exists — resume from the stream's start
    position rather than treating the turn as unstarted; do not resend.
  - A captive portal on the new network intercepting the reconnect with an HTML login page — the
    reachability probe (APTR-75) must classify this as offline rather than as a malformed stream.
  - Repeated flapping (a train window) — backoff must not thrash, and the status indicator must not
    strobe; debounce the visible state even while retrying underneath.
  - The turn genuinely finished during the gap — reattach finds a completed turn and replays its
    tail; this is a success, not an error state.
  - The replay window aged out *and* the REST refetch fails — one honest failure state with a retry,
    and the user's message preserved in the thread.
  - Two devices on the same turn where one drops (Decision D3) — the survivor's stream is unaffected;
    assert the drop does not curtail the other device's response.

- **Acceptance criteria:**
  - [ ] A dead stream is detected via heartbeat/inactivity timeout, not via the browser online flag
  - [ ] Resume reconnects by last processed event id and reattaches to the live turn within the
        replay window, with replayed events deduplicated so nothing renders twice
  - [ ] An aged-out position produces a `resync` fallback that renders the complete turn over REST
  - [ ] **Negative test passes:** a transport drop never re-sends the user's message and never emits
        an explicit cancel; exactly one turn and one user message exist server-side
  - [ ] Integration test kills connectivity mid-stream on a throttled mobile profile and the response
        completes with no missing or duplicated tokens
  - [ ] Reconnect status is visible and truthful, with capped backoff and an honest final failure state
  - [ ] No hardcoded infrastructure values in new/modified code; `docs/MOBILE.md` documents what
        resume recovers and what it does not; all existing tests still pass

---

### APTR-203: Local data at rest — the written posture, persistence request, and eviction contract
- **Priority:** High
- **Labels:** aperture, mobile, offline, storage, security, contract
- **Agent:** claude
- **Estimate:** 6h
- **Blocked by:** APTR-75
- **Description:** Two things are currently implicit that must be written down and enforced. First,
  **local data at rest**: cached threads and queued message text sit in plaintext IndexedDB. That
  is very likely the right trade-off — device-level encryption and app sandboxing are the operating
  system's job, and an app-layer key would have to be stored on the same device to be usable, which
  buys little and costs a great deal — but *the decision must be recorded rather than assumed*,
  because an unwritten security posture is one a reviewer cannot check and a user cannot consent to.
  Second, **eviction under storage pressure**: mobile platforms discard site storage without asking,
  and right now the offline queue and drafts have no defined loss-or-survive contract, so their
  behaviour under pressure is whatever the browser happens to do. This item writes both decisions
  down, implements the storage-persistence request and usage surfacing, and makes eviction
  behaviour a tested contract instead of an accident.

  ## FILES
  - `contracts/aperture-offline-v1.md` — the at-rest posture section and the eviction contract
  - `client/src/offline/persistence.ts` — persistent-storage request, quota estimate, pressure handling
  - `client/src/offline/policy.ts` — per-class eviction priority and reserved budgets (APTR-75 file)
  - `client/src/settings/StorageSettings.tsx` — usage display, persistence state, clear-data action
  - `client/src/offline/__tests__/persistence.test.ts`
  - `docs/OFFLINE.md` — the user-facing version of both decisions

  ## APPROACH
  1. **Write the at-rest posture, explicitly, in `contracts/aperture-offline-v1.md`.** It states:
     what is stored locally (threads, messages, tool-call records, thumbnails, cached attachment
     blobs, the outbox, drafts, the identity marker); that it is stored **unencrypted at the
     application layer**; that confidentiality therefore rests on OS full-disk encryption, the
     device lock screen, and browser origin isolation; and the explicit reasoning for that choice —
     an app-layer key would have to live on the same device to permit offline reads, so it would
     stop an unsophisticated file-copy and nothing else, while costing key management, a new failure
     mode, and a false sense of protection. It also states plainly what this does **not** protect
     against: an unlocked, unencrypted device in someone else's hands. The mitigations that *do*
     apply are named and linked: the purge on logout and revocation (APTR-200), per-identity
     namespacing (APTR-75), and the fact that **no secret, token, or key is ever stored locally**.
  2. **Never widen the local footprint on the strength of this posture.** The at-rest decision
     covers conversation content the user has already seen on that device. It is not a licence to
     cache credentials, secrets, or anything the user has not already been shown.
  3. **Request persistent storage, honestly.** Call the storage-persistence request at a sensible
     moment (after the user has genuinely adopted the app, not on first load), and treat denial as
     normal — it is not an error and must not be retried in a loop or nagged about. Record the
     resulting state and surface it in settings in plain language: whether the browser has agreed to
     protect this data from routine eviction, or has not.
  4. **Surface usage.** Show current usage against the available quota in settings ("Offline data:
     X of Y"), next to the existing clear-offline-data action, so the byte ceiling from APTR-75 is
     legible rather than mysterious. No telemetry — this number is computed and displayed locally
     and never leaves the device.
  5. **Write the eviction contract, per class, with priorities.** Under pressure, classes are shed
     in a defined order, and the ordering principle is: **re-fetchable server-held content goes
     first; user-authored content that exists nowhere else goes last.** The declared order is
     cached attachment blobs and thumbnails → cached thread bodies → cached thread metadata →
     drafts → outbox. The **outbox and drafts have reserved budgets** and are the last to be
     touched, because a queued message and a half-written one are the only local data whose loss is
     unrecoverable. If eviction reaches them, that is a user-visible event with an honest message,
     never a silent deletion.
  6. **Platform eviction is not always ours to control, and the contract says so.** A platform may
     discard the entire origin's storage without notice or ordering. The contract states this
     directly, states that the app treats total loss as a normal first-run state (APTR-75 already
     requires this), and states what the user sees. Do not claim a durability guarantee the platform
     does not offer — the eviction contract governs *our* eviction ordering, plus best-effort
     protection via the persistence request.
  7. **Enqueue-time refusal beats after-the-fact loss.** When usage nears the ceiling, refuse new
     large attachments at the point of composing with a clear reason (APTR-76 already requires
     this) rather than accepting them and evicting something the user cared about.

  ## TEST PLAN
  - Unit: eviction under a simulated budget sheds classes in the declared priority order
  - Unit: the outbox and drafts reserved budgets are respected — pressure evicts cached content down
    to the floor before touching either
  - Unit: eviction that does reach the outbox or drafts raises a user-visible event, never a silent drop
  - Unit: a denied persistence request is recorded, surfaced honestly, and not retried in a loop
  - Unit: usage/quota display computes locally and issues no network request
  - Assert `contracts/aperture-offline-v1.md` contains the at-rest posture section and the per-class
    eviction table, and that a test parses the table and compares it to `policy.ts` (the doc and the
    code cannot drift)
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute paths in new/modified files
  - **Negative:** assert nothing secret-shaped is ever written to any local store under the at-rest
    posture — re-run the APTR-75 storage scan and additionally assert the posture section does not
    grant any exception for credentials
  - **Negative:** simulate a total platform eviction of the origin's storage and assert the app boots
    cleanly as a first run, with no data-loss error state and no crash

  ## EDGE CASES
  - A browser that reports a quota far smaller than the configured ceiling — the smaller number wins;
    never write against a ceiling the platform will not honour.
  - Persistence granted then later revoked by the platform — re-check on boot rather than trusting a
    cached answer.
  - Quota reported as unavailable or zero by a private-browsing profile — degrade to in-memory and
    display "not available" rather than a misleading "0 of 0".
  - A single enormous thread consuming the reserved outbox headroom — the per-thread caps in APTR-75
    prevent this; assert the interaction rather than assuming it.
  - The user clearing site data from browser settings rather than in-app — indistinguishable from
    eviction, and must behave identically (a clean first run).
  - Pressure arriving mid-drain of the outbox — never evict a record that is in-flight.

- **Acceptance criteria:**
  - [ ] `contracts/aperture-offline-v1.md` records the local-data-at-rest posture explicitly: what is
        stored, that it is unencrypted at the app layer, the reasoning, what it does not protect
        against, and the mitigations that do apply
  - [ ] The posture grants no exception for secrets, tokens, or keys, and the storage scan still passes
  - [ ] Persistent storage is requested at an appropriate moment, denial is handled honestly without
        nagging, and usage against quota is displayed locally in settings with no network call
  - [ ] A per-class eviction priority table exists in the contract and in `policy.ts`, verified equal
        by test, with the outbox and drafts last and holding reserved budgets
  - [ ] Eviction reaching the outbox or drafts is user-visible; total platform eviction boots cleanly
        as a first run with no error state
  - [ ] The contract states plainly that platform-level eviction can discard everything without notice
        and claims no durability guarantee the platform does not provide
  - [ ] No hardcoded infrastructure values in new/modified code; `docs/OFFLINE.md` updated; all
        existing tests still pass

---

### APTR-204: WebKit-engine coverage in CI
- **Priority:** High
- **Labels:** aperture, mobile, ci, testing, webkit
- **Agent:** codex
- **Estimate:** 4h
- **Description:** The test-device list in Pre-flight covers install models, but the CI plan never
  says the headless integration suite runs on a **WebKit** engine — and WebKit is precisely where
  PWA behaviour diverges most: service-worker lifecycle and update timing, storage partitioning for
  installed apps, IndexedDB quirks, storage eviction under pressure, visual-viewport behaviour with
  the virtual keyboard, and Web Push's install-first precondition. A mobile sprint validated only on
  a Chromium engine is validated on the platform that was never going to be the problem. This item
  adds a WebKit engine job to CI so the divergences are caught by machines on every push instead of
  by a user on a train — and so Sprint G does not inherit the gap.

  ## FILES
  - `.gitea/workflows/ci.yml` — add the WebKit-engine integration job to the matrix
  - `client/playwright.config.ts` — WebKit project alongside the existing engine project(s), with the
    mobile viewport and throttling profile from APTR-81
  - `client/tests/integration/` — engine-conditional annotations for genuinely unsupported cases
  - `client/tests/support/engineCapabilities.ts` — the single place an engine-conditional skip may be
    declared, with a mandatory reason string
  - `docs/MOBILE.md` — which engines CI covers, and what CI cannot cover

  ## APPROACH
  1. Run the existing headless integration suite on a WebKit engine in addition to the current
     engine, as a **required** job — not an allowed-failure or informational one. A job that can go
     red without blocking is a job nobody reads.
  2. Prioritise the tests that actually diverge, and make sure each has a WebKit run: service-worker
     registration, update-waiting and activation (APTR-74); offline boot from precache (APTR-74/75);
     IndexedDB schema migration and the storage scan (APTR-75); outbox durability across reload
     (APTR-76); draft flush on `pagehide` (APTR-201); stream resume after a connectivity drop
     (APTR-202); eviction behaviour (APTR-203); and the purge negative test (APTR-200) — that last
     one especially, because storage deletion semantics differ by engine and a purge that passes on
     one engine and silently leaves data on another is the worst possible outcome for D6.
  3. **Skips are explicit, justified, and enumerable.** Where a capability genuinely does not exist
     on the engine, the test is annotated through `engineCapabilities.ts` with a **mandatory reason
     string**, never silently skipped and never deleted. A test asserts the skip list is
     enumerable, and the enumerated reasons are a direct input to APTR-82's capability matrix — so a
     platform limitation becomes documentation automatically instead of being rediscovered.
  4. Keep the job honest about what it is: a headless WebKit engine is **not** an iPhone. It catches
     engine-level divergence, not OS-level behaviour (real install flows, real push delivery, real
     background termination). State that limitation in `docs/MOBILE.md` so a green matrix is not
     mistaken for device validation, and keep the physical test devices in Pre-flight as the
     complement rather than the alternative.
  5. Fail closed: a missing, empty, or malformed WebKit report is a CI failure, consistent with
     APTR-81's gate discipline. An engine job that quietly does not run is worse than no job.
  6. Keep runtime sane by sharing fixtures with the existing suite and running the two engines in
     parallel. No new test corpus, no forked assertions — one suite, two engines. Forked assertions
     would drift within a sprint.

  ## TEST PLAN
  - CI: the WebKit integration job runs on every push and is required to pass
  - CI: the same integration suite executes on both engines from one source of truth — a test asserts
    there is no engine-forked copy of the suite
  - Unit: `engineCapabilities.ts` rejects a skip declared without a reason string
  - Unit: the enumerated skip list is machine-readable and non-empty entries all carry reasons
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute paths in new/modified files
  - **Negative:** delete or truncate the WebKit report and confirm the job FAILS CLOSED rather than
    reporting a pass; revert
  - **Negative:** introduce a change that works on the current engine but breaks service-worker
    update-waiting on WebKit and confirm the WebKit job FAILS; revert

  ## EDGE CASES
  - The WebKit build available to CI lagging the shipping browser — pin the version, record it in
    `docs/MOBILE.md`, and treat a bump as a reviewed change rather than a silent drift.
  - A test that is merely flaky on WebKit rather than genuinely unsupported — fix or quarantine it
    with a tracked reason; never convert flakiness into a permanent capability skip, which would
    launder a bug into a documented limitation.
  - Web Push not exercisable headlessly — assert what can be asserted (subscription lifecycle,
    handler logic) and mark delivery as device-verified only, in the skip list with its reason.
  - Doubled CI time — parallelise; if wall-clock becomes a problem, shard the suite rather than
    dropping engine coverage.
  - A divergence that is a genuine WebKit bug with no workaround — document it in APTR-82's matrix
    with the reason, and keep the test skipped-with-reason rather than deleted, so it re-enables
    when the engine fixes it.

- **Acceptance criteria:**
  - [ ] The headless integration suite runs on a WebKit engine in CI as a required job on every push
  - [ ] Both engines run the same suite from one source — no engine-forked copy of the tests
  - [ ] The service-worker, offline-boot, IndexedDB, outbox, draft-flush, stream-resume, eviction and
        purge tests all have a passing WebKit run
  - [ ] Engine-conditional skips are declared in one place, each with a mandatory reason, enumerable,
        and feed APTR-82's capability matrix
  - [ ] The job fails closed on a missing or malformed report
  - [ ] `docs/MOBILE.md` states which engines CI covers and that a headless engine is not a device
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass

---

### APTR-205: i18n and RTL posture — English-only for v0.1, with every string centralized
- **Priority:** Medium
- **Labels:** aperture, mobile, i18n, rtl, a11y, design-system
- **Agent:** claude
- **Estimate:** 5h
- **Description:** Push bodies, offline copy, conflict prompts, install explainers and purge warnings
  are all user-facing prose, and not one item in this sprint says anything about locale or
  right-to-left layout. The answer does not have to be "we support twelve languages" — but it does
  have to be an **answer**, because the cost of retrofitting i18n rises with every hardcoded string
  and every `margin-left`. The posture for v0.1 is: **English-only, no locale switcher, no
  translation files — and every user-facing string centralized, plus logical CSS properties
  throughout so an RTL locale is a configuration change rather than a rewrite.** This item
  establishes and enforces that posture. Note the interaction with APTR-78: safe-area work uses
  directional insets, and those are exactly the properties that break under RTL.

  ## FILES
  - `client/src/strings/catalogue.ts` — the central string catalogue (extends the Sprint A catalogue
    from Decision D10 item 7 rather than creating a parallel one)
  - `client/src/strings/index.ts` — the accessor every surface uses
  - `client/scripts/check-strings.mjs` — build check: no user-facing literal outside the catalogue
  - `client/scripts/check-logical-properties.mjs` — lint: no physical directional CSS properties
  - `client/src/styles/mobile.css` — convert directional properties to logical equivalents
  - `docs/MOBILE.md` — the i18n/RTL posture, written down
  - `contracts/aperture-push-v1.md` — cross-reference: push bodies are assistant-generated prose and
    are **not** catalogue strings

  ## APPROACH
  1. **State the posture in `docs/MOBILE.md`, in one short section, unambiguously:** v0.1 ships
     English only; there is no locale selector and no translation mechanism; all user-facing strings
     live in one catalogue; layout uses logical CSS properties so RTL is a configuration change
     rather than a rewrite; and adding a locale later means adding a catalogue, not touching
     components. Say what is *not* done as clearly as what is, so a future reader does not assume a
     translation layer exists.
  2. **Centralize every user-facing string this sprint introduces** — install explainers, offline
     states, update banner, outbox and conflict copy, purge and revocation warnings, storage and
     eviction messages, permission explanations, capability-unavailable reasons — into the existing
     catalogue. A build check fails on a user-facing literal in a component. Centralization is also
     what makes the copy reviewable as copy: right now these strings are scattered across a dozen
     components and nobody has ever read them as a set.
  3. **The assistant's words are NOT catalogue strings, and the distinction is load-bearing.** Soul
     Contract clause 1 requires the assistant to speak, never template. Push bodies, offline
     explanations attributed to the assistant, and conflict prompts spoken in its voice come from
     the persona assembler at runtime. The catalogue holds **client chrome** — button labels, status
     text, error reasons, mechanical descriptions. Do not "centralize" assistant prose into the
     catalogue in the name of i18n; that would turn the assistant into a string table, which is the
     exact failure clause 1 exists to prevent. The catalogue accessor and the persona path are
     separate call sites and a test asserts no assistant-attributed copy is sourced from the catalogue.
  4. **Logical properties throughout.** Replace physical directional CSS (`margin-left`,
     `padding-right`, `left`, `right`, `text-align: left`) with logical equivalents
     (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `text-align: start`)
     across the mobile layer, and lint against reintroduction. Handle the safe-area interaction from
     APTR-78 explicitly: `env(safe-area-inset-left/right)` are **physical** by definition and must be
     mapped through a direction-aware layer rather than assumed to be start/end — this is the one
     place where a naive logical-property conversion is silently wrong in landscape RTL.
  5. **Prove RTL does not collapse, without shipping a locale.** Add a `dir="rtl"` snapshot of the
     key mobile surfaces to the test suite so gross layout breakage is caught now. This is a
     smoke test, not a claim of RTL support, and `docs/MOBILE.md` says so in those words.
  6. Declare `lang` and `dir` in the document and in the manifest, matching the shipped locale.
  7. Do **not** build a locale switcher, translation files, plural rules, or a formatting layer.
     Scope discipline is the point: the posture is that the *cost of adding* i18n stays low, not
     that i18n is delivered.

  ## TEST PLAN
  - Unit: every user-facing string in the sprint's surfaces resolves through the catalogue accessor
  - `node client/scripts/check-strings.mjs` passes on the clean tree
  - `node client/scripts/check-logical-properties.mjs` passes on the mobile style layer
  - Snapshot: key mobile surfaces render under `dir="rtl"` without overlap, clipping, or
    off-screen interactive elements
  - Unit: `lang` and `dir` are declared in the document and manifest and match the shipped locale
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute paths in new/modified files
  - **Negative:** add a user-facing literal directly in a component and confirm `check-strings.mjs`
    FAILS; add a `margin-left` to the mobile layer and confirm the logical-properties check FAILS; revert both
  - **Negative:** assert no assistant-attributed copy (push bodies, assistant-voiced offline or
    conflict prose) is sourced from the catalogue — those must come from the persona assembler

  ## EDGE CASES
  - Safe-area insets in landscape RTL — physical by definition; map them through a direction-aware
    layer, and assert both orientations, or the notch inset lands on the wrong edge.
  - Assistant prose in a language the client chrome does not ship — the assistant may reply in any
    language regardless of the UI locale; message rendering must handle mixed-direction content per
    message, and must not force the thread's direction onto message bodies.
  - Strings containing interpolated values — the catalogue must support parameters, or developers
    will concatenate around it and defeat the check.
  - `aria-label`s and other accessibility strings are user-facing too and are frequently missed by a
    naive literal check — include them in the check's scope explicitly.
  - Text expansion in a future locale overflowing fixed-width mobile controls — the dynamic-type work
    in APTR-81 already forbids fixed-width text containers; assert the two rules do not conflict.
  - A third-party or generated component emitting its own literals — exempt it explicitly in the
    check's configuration with a reason, never by weakening the rule.

- **Acceptance criteria:**
  - [ ] `docs/MOBILE.md` states the v0.1 posture explicitly: English-only, no locale switcher, all
        client strings centralized, logical properties throughout, and what is deliberately not built
  - [ ] Every user-facing client-chrome string in this sprint resolves through the central catalogue,
        enforced by a build check that fails on a literal in a component
  - [ ] Assistant-attributed prose comes from the persona assembler and never from the catalogue,
        asserted by test (Soul Contract clause 1)
  - [ ] The mobile style layer uses logical CSS properties, enforced by lint, with safe-area insets
        mapped through a direction-aware layer and asserted in both orientations
  - [ ] An RTL smoke snapshot of the key mobile surfaces passes without overlap or clipping, and is
        documented as a smoke test rather than a claim of RTL support
  - [ ] `lang` and `dir` are declared in the document and manifest
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
