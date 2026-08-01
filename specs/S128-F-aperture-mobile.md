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
- **Estimated total:** ~69h across 11 items (APTR-73..82 plus the out-of-sequence APTR-93 —
  see the numbering note in Pre-flight)
- **North-Star layer:** shell — mobile target of the single Aperture client codebase; Gate 2
  justified in `specs/S128-aperture-epic.md`
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

**Numbering note — read before "fixing" anything.** This sprint contains **11 items**: APTR-73
through APTR-82, plus **APTR-93**. APTR-93 is numerically out of sequence on purpose. It was
split out of APTR-73 after Sprint G had already been allocated APTR-83..92, so the next free
number was 93. **Numbering is an identifier, not an ordering.** APTR-93 is the *first* item that
must merge in this sprint — APTR-73 is `Blocked by` it — and nobody should renumber, reorder, or
"correct" it. Execution order is given by `Blocked by`, never by the number.

**Grounding, for every item in this sprint:** run `kg_query` / `kg_search` for the entities
touched and `kg_neighbors` / `kg_subgraph` for blast radius before writing code, and consult
`kg_rules` for the scope. APTR-74, APTR-76, APTR-77, APTR-79 and APTR-93 additionally touch
caching, durable client state, push credentials, or live production code in another repository —
run `cortex_scope` pre-change on those five and record a `cortex_review` risk score in the PR body.

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
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute paths in new/modified files
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
  - A user who installs, uninstalls, and reinstalls must land in their existing session with
    memory and lore intact — local state is a cache, not the record.
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
  - [ ] Exactly one web app manifest is served on the origin (APTR-93 merged first; re-verified here)
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README and `docs/INSTALL.md` updated to document installation on each platform
  - [ ] All existing tests still pass

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
  - `client/src/modules/ModuleGate.tsx` — extend the APTR-08 gate with an offline reason
  - `docs/OFFLINE.md` — the user-facing "what works offline" section
  - `client/src/offline/__tests__/` — store, eviction, and surface-state tests

  ## APPROACH
  1. IndexedDB via a thin typed wrapper, with an explicit schema version and forward migrations.
     Store: workspaces, threads, messages, tool-call records, module descriptors, and attachment
     metadata (+ thumbnails only, under a byte ceiling). **Never** store a session token, a
     signing key, or any secret in IndexedDB.
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
  - Unit: every module surface renders a defined offline state — a test enumerates surfaces and
    fails if one lacks a registered state (this is the anti-omission gate)
  - Integration: boot offline, open a previously-read thread, read it end to end
  - **Negative:** assert no session token, signing key, or secret-shaped value is ever written to
    IndexedDB (scan the object stores after a full session simulation)
  - **Negative:** clearing all offline data and reloading online restores the same memory,
    traits, and lore — no continuity reset
  - **Negative:** a surface with content but a stale cache must NOT present it as fresh — assert
    the staleness affordance is rendered
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute paths in new/modified files

  ## EDGE CASES
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
  - [ ] No secret, token, or signing key is ever persisted to client storage, and clearing offline
        data does not reset memory, traits, or relationship lore
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] All existing tests still pass

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
     `superseded` (the same user sent a semantically-overlapping message from another client).
  2. Taxonomy → default policy, written in the contract before it is coded:
     - `clean` → append, no prompt.
     - `advanced` with only the user's own messages since → append with a visible "sent while you
       were offline, composed before the messages above" marker. Do not prompt; the marker is enough.
     - `diverged` → **prompt**. Offer: send anyway (with context marker), edit before sending, or
       discard. Default is *prompt*, never auto-send — this is the case where auto-append reads as
       the client putting words in the user's mouth.
     - `unavailable` → terminal, preserve the text, offer "send to a new thread" or copy out.
     - `superseded` → prompt with both texts side by side; never silently drop either.
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
  - Unit: `advanced`-with-own-messages appends with a marker and does not prompt
  - Unit: `diverged` prompts and does **not** send until the user chooses
  - Unit: three stale messages in one thread produce one batched prompt
  - Unit: `unavailable` preserves text and offers a new-thread destination
  - Integration: compose offline, let the assistant answer something else, reconnect, resolve
    "send anyway" — the delivered message carries composed-at provenance
  - **Negative:** assert a `diverged` conflict NEVER auto-appends, under any timing, including when
    the prompt is dismissed by navigation (it stays queued, it does not send)
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
  - [ ] `diverged` and `superseded` always prompt; nothing auto-sends into a moved-on thread
  - [ ] Conflicts are batched per thread, one prompt per thread
  - [ ] Delivered messages carry composed-at / delivered-at provenance
  - [ ] No path discards user text without an explicit user action, and conflict resolution never
        resets memory, traits, or relationship lore
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] All existing tests still pass

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
    and the **single chokepoint** that only the presence layer may call

  ## APPROACH
  1. **Architecture first: one chokepoint.** The BFF exposes exactly one internal function that can
     send a push, and its only caller is the assistant's presence/knock decision path. There is no
     "notify" endpoint the client, a module, or the context bus can call directly. A module wanting
     the user's attention raises a presence candidate through the existing budget; the budget
     decides. Enforce with a test that asserts the dispatch function has exactly one caller, and
     with a review note pointing at it.
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
  - Unit: the push dispatch chokepoint has exactly one caller — the presence decision path — and a
    test fails if a second caller appears
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
    three are impossible: no route exists, and the dispatch function rejects an unauthorised caller
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
  - [ ] Push has exactly one dispatch chokepoint, callable only by the presence decision path
  - [ ] No client-callable, module-callable, or context-bus-callable notification route exists
  - [ ] Quiet hours, opt-out, and the trait-scaled knock quota are honored by construction, with tests
  - [ ] VAPID keys are resolved only via the secret manager by name; the private key never leaves the
        BFF and cannot reach a response body, error body, or log line; the public key is not bundled
  - [ ] Missing key ⇒ capability `unavailable`; no stopgap key is ever generated
  - [ ] Permission is requested only after an explicit user action and never re-requested after denial;
        revocation is immediate and complete and stale subscriptions are pruned
  - [ ] No hardcoded infrastructure values in new/modified code; README documents push behaviour
  - [ ] All existing tests still pass

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
- **Blocked by:** APTR-73, APTR-74, APTR-79, APTR-80
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
    not supported**. No aspirational cells (~table)
  - What would require going native, and what it would buy: background execution, richer notification
    surfaces, deeper OS integration, hardware access beyond the web platform, store distribution —
    each with the concrete Aperture behaviour it would unlock. Explicitly scoped as a later
    workstream with no date claimed (~600 words)
  - Troubleshooting: the install did not appear; the app is stuck on an old version; push arrives on
    one device but not another; offline shows nothing; the composer is hidden by the keyboard
    (~500 words)

  ## SOURCES
  - `contracts/aperture-offline-v1.md`, `contracts/aperture-conflict-v1.md`,
    `contracts/aperture-push-v1.md`
  - `docs/OFFLINE.md`, `docs/MOBILE.md`, `docs/INSTALL.md`, `docs/CONFIGURATION.md`
  - The epic's Soul Contract compliance section, clause 2 in particular
  - The implemented capability-detection code from APTR-73, APTR-79, and APTR-80 — the matrix must be
    derived from what the code actually detects, not from a vendor support table

  ## TONE
  Technical reference, direct, no marketing, no hedging in either direction. Where a platform limits
  us, name the limit and move on — no apology, no blame, no speculation about future platform
  support. **No internal hostnames, IPs, ports, org names, personal identifiers, or absolute paths** —
  env-var names and placeholders only; this file ships publicly. Every claim in the capability matrix
  must be traceable to a test or to detection code in this repo; if it cannot be, mark it "not
  verified" rather than asserting it.
