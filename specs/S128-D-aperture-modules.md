# Aperture Sprint D — Modules & The Context Bus
plane_project: APTR
module: Aperture
prefix: APTR
spec_id: S128-aperture-client

## Metadata
- **Author:** Operator (Moose)
- **Session:** S128
- **Date:** 2026-08-01
- **Module version:** Aperture v0.1.0
- **Estimated total:** ~92h (13 items in this repo plus APTR-52, which lands in the media
  module's repository as a prerequisite PR)
- **North-Star layer:** shell — Gate 2 justified in `specs/S128-aperture-epic.md`. This sprint
  is where the gate is *paid off*: the three live modules stop being three silos behind three
  surfaces and start sharing one typed context bus.
- **Module-Contract:** this sprint implements the clauses Sprint A only declared.
  Clause 1 (Terminus-fronted) — every module surface here reaches its backend through the BFF →
  `terminus-client`, with zero direct service clients. Clause 2 (capability-gated presentation) —
  every surface added here renders inert-with-reason under a non-`available` descriptor, enforced
  by a shared conformance harness (APTR-51) and a mechanical sweep (APTR-59). Clause 3
  (context-bus citizen) — APTR-47..50 build the bus; every module surface in this sprint both
  publishes and consumes at least one topic, asserted mechanically. Clause 4 (assistant-operable) —
  APTR-59 is the parity gate: a user-facing module action without a tool counterpart fails the
  build. Clause 5 (embeddable presentation) — Muse and Harmony render as surfaces the Aperture
  shell hosts; neither ships a router, shell chrome, or design language of its own. Clause 6
  (sovereign + private) — the bus is memory-first, user-inspectable, user-clearable, per-topic
  opt-outable, and provably non-egressing (APTR-50). Clause 7 (standalone-excellent first) —
  Muse and Harmony were each built standalone in prior sprints; nothing here rewrites them.
- **Assistant-Layer Soul Contract:** clause 1 (speak, never template) — the spec draft in
  APTR-57 and every cross-module answer in APTR-60 is *generated* by the assistant through the
  persona assembler, never assembled from a string template; templates are a render-failure
  fallback only. Clause 2 (presence has a budget) — context-bus events are inputs to the
  assistant's existing prioritized knock quota, not a notification source; this sprint adds no
  tray, no badge count, and no independent alert path. Clause 3 (show the becoming) — the bus
  carries the assistant's own state changes as first-class topics rather than burying them.
  Clause 4 (continuity survives every swap) — no item here resets memory, traits, or lore;
  the bus is additive context, and APTR-50's clear operation is explicitly scoped to bus
  contents only, with a negative test asserting Engram memory is untouched.
- **Context:** After Sprint C, Aperture is an excellent chat client. That is not the point of
  Aperture. This sprint is the transition from *chat app* to *shell*: a typed publish/consume
  context bus over the SSE `context` channel and `POST /v1/aperture/events`, plus the two live
  module surfaces embedded into the shell as first-class citizens of that bus.

  The Muse surface is real media, not a link-out: browse, search, detail with metadata and
  artwork, and genuine in-shell playback with a resume position that the assistant can read.
  The Harmony surface is real build orchestration: runs, dispatch, PR/review state, and a spec
  browser. And the marquee capability — **spec-ingest-from-chat** — closes the loop the epic's
  Gate 2 argument was built on: select a range of a conversation, have the assistant draft a
  spec from it, review and edit that spec in the client, then ingest it through the ONE
  sanctioned Plane door so it becomes tracked work with recorded provenance.

  Every capability here already exists behind the kernel. This sprint does not build media
  scanning, metadata providers, dispatch, or ingest — it *surfaces* them, wires them to one
  another through the bus, and makes each of them assistant-operable.

## Pre-flight
- **Blocked by Sprint C** (`S128-C-aperture-web-chat.md`) — the shell, thread model, SSE
  consumer, and settings surface all land there; this sprint composes onto them.
- Depends on Sprint A contracts: `contracts/aperture-api-v1.yaml` (APTR-06),
  `contracts/aperture-events-v1.md` (APTR-06), `contracts/aperture-modules-v1.md` and
  `client/src/modules/ModuleGate.tsx` (APTR-08), `client/src/api/client.ts` (APTR-07),
  `contracts/aperture-errors-v1.md` (APTR-10).
- Backend capabilities assumed LIVE and reached **only** through `terminus-client`: the media
  module (library, metadata, artwork, playback), the build orchestrator (runs, dispatch, PRs,
  reviews, specs, ingest), the Plane tool family, and the Atlas knowledge-graph tools
  (`kg_query`, `kg_search`, `kg_neighbors`, `kg_subgraph`, `kg_rules`).
- Named inference proxies only (`lumina-fast`, `lumina-deep`). No model id, engine name,
  backend tag, or size suffix may appear in client or BFF code.
- Vault secrets required (names only): `APERTURE_SESSION_SIGNING_KEY`. This sprint introduces
  **no new secret**; any module credential stays kernel-side and is never proxied to the client.
- New config keys introduced here (names only, no values, documented in `docs/CONFIGURATION.md`):
  `APERTURE_CONTEXT_RETENTION_EVENTS`, `APERTURE_CONTEXT_RETENTION_TTL_SECONDS`,
  `APERTURE_CONTEXT_PUBLISH_RATE_LIMIT`, `APERTURE_CONTEXT_MAX_PAYLOAD_BYTES`,
  `APERTURE_MEDIA_STREAM_TICKET_TTL_SECONDS`, `APERTURE_MEDIA_READ_CHUNK_BYTES`,
  `APERTURE_MEDIA_READ_MAX_LENGTH_BYTES`, `APERTURE_MEDIA_READ_IDLE_TIMEOUT_SECONDS`,
  `APERTURE_SPEC_DRAFT_MAX_TRANSCRIPT_CHARS`.
- **Media byte-serving does not exist today.** The media module has no byte-serving route, and
  the sanctioned door carries a JSON request body with no arbitrary-header parameter and no
  caller-visible response status or headers — so HTTP range semantics cannot cross it. APTR-52
  adds a typed ranged-read capability in the media module's own repository as a prerequisite;
  it is a separate PR that merges before APTR-53's Aperture-side work.
- Baseline tests: whatever Sprint C leaves green. Every item must leave them green.
- Baseline verify: the shell renders, streams, and gates modules; Muse and Harmony currently
  render as inert descriptors only.

---

### APTR-47: Context-bus contract v1 — topic taxonomy, payload schemas, retention, privacy
- **Priority:** Critical
- **Labels:** aperture, context-bus, contract, privacy
- **Agent:** claude
- **Estimate:** 6h
- **Description:** Author the contract that turns "the SSE `context` channel" from a name in the
  Sprint A event taxonomy into a real, typed, enforceable publish/consume bus. This is a
  **contract plus machine-readable schema**, not an implementation — APTR-48 and APTR-49 code
  against it, and every module item in this sprint declares its topics here first.

  The bus is not a generic event firehose. Every topic is enumerated, versioned, schema'd,
  retention-classed, and privacy-classed up front, because the bus is the one place in Aperture
  where "what the user is doing" becomes durable enough for the assistant to reason over. An
  open-ended bus would be a privacy liability; a closed, enumerated one is an asset.

  ## FILES
  - `contracts/aperture-context-bus-v1.md` — the normative contract: topic taxonomy, ordering
    and delivery guarantees, retention classes, privacy classes, opt-out semantics, versioning
  - `contracts/aperture-context-bus-v1.schema.json` — JSON Schema for the envelope and every
    topic payload, one `$defs` entry per topic
  - `contracts/aperture-api-v1.yaml` — extend the `events` route group: `POST /v1/aperture/events`
    (publish), `GET /v1/aperture/events` (inspect), `DELETE /v1/aperture/events` (clear),
    `GET /v1/aperture/events/topics` (topic registry + per-topic opt-out state)
  - `contracts/aperture-events-v1.md` — cross-reference the `context` SSE event to this document

  ## APPROACH
  1. Define a single envelope, identical for every topic: `topic` (dotted, registry-validated),
     `schema_version` (integer, per topic), `seq` (monotonic per session, shares the Sprint B
     stream sequence space so `Last-Event-ID` resume works unchanged), `ts` (RFC-3339),
     `origin` (`client` | `bff` | `module` | `assistant`), `subject` (opaque session-scoped id),
     `payload` (topic-schema'd), and `ttl_class`. Unknown envelope fields are **rejected**, not
     ignored — an open envelope is how a bus becomes a firehose.
  2. Enumerate the v1 topic registry. Each entry declares: id, direction (who may publish, who
     may consume), payload schema, retention class, privacy class, and whether it is opt-outable.
     The v1 set is exactly:
     - `shell.focus` — which module surface and route the user is on
     - `chat.thread` — active workspace + thread identity (opaque ids, never message content)
     - `chat.selection` — a user-selected transcript range (ids + range bounds, never raw text)
     - `muse.browse` — current library view: filter, sort, and selected item id
     - `muse.playback` — media item id, playback state, position, duration
     - `harmony.run` — build run id and status the user is watching
     - `harmony.spec` — spec id or draft id being viewed or edited
     - `memory.recall` — assistant-published pointer to what it recalled and why (consume-only
       for the UI; this is Soul Contract clause 3, "show the becoming", made legible)
     - `module.capability` — a module's capability state changed (drives the APTR-08 revalidate)
  3. Retention classes, and no others: `ephemeral` (fan-out only, never stored),
     `session` (bounded ring buffer, dies with the session), `pinned` (survives the session,
     **only** for topics whose entry explicitly allows it — v1 allows exactly one:
     `muse.playback`, so "resume where I was" works across a reload). Bounds come from
     `APERTURE_CONTEXT_RETENTION_EVENTS` and `APERTURE_CONTEXT_RETENTION_TTL_SECONDS`;
     the contract states the names, never the values.
  4. Privacy classes: every topic is `user-visible` — there is no hidden class, and the contract
     says so normatively. Every topic carries `opt_outable: true` except `module.capability`
     (which carries no user activity, only backend health). Opt-out is enforced at **publish**,
     server-side: an opted-out topic is dropped at the BFF boundary and never stored, never
     fanned out, and never reaches the assistant. Client-side suppression alone is not compliance.
  5. State the sovereignty invariants normatively, as testable sentences: the bus never leaves
     the fleet; no bus content is transmitted to any third party; no analytics, telemetry, or
     metrics product ever receives a bus event; aggregate counters, if any, carry no payload.
  6. Delivery guarantees: at-most-once fan-out over SSE, ordered per topic per session by `seq`,
     with gap detection (a consumer seeing a `seq` jump requests a snapshot rather than
     silently believing it has the current state). No cross-session delivery in v1 — the bus is
     single-user and single-session by construction, and multi-user fan-out is explicitly a
     future-version concern, not a v1 hole.
  7. Versioning: additive topics and additive optional payload fields bump the topic's
     `schema_version` and stay on v1. A removed field or changed semantics mints a v2 topic id;
     both are served through a deprecation window. Consumers **must** ignore unknown *topics*
     while **rejecting** unknown *envelope* fields — the asymmetry is deliberate and documented.
  8. Every host, port, and address in this contract is a placeholder or env-var name. This file
     ships to the public mirror.

  ## TEST PLAN
  - `contracts/aperture-context-bus-v1.schema.json` validates as JSON Schema in CI
  - Every topic in the markdown registry has a matching `$defs` entry in the schema, and vice
    versa — a mechanical cross-check script, not a human read
  - Every topic entry declares all six required attributes (direction, schema, retention class,
    privacy class, opt-outable, schema_version)
  - `contracts/aperture-api-v1.yaml` still validates as OpenAPI 3.1 after the `events` extension
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute user paths in
    new/modified files
  - Negative: a topic added to the markdown registry without a schema `$defs` entry FAILS the
    cross-check; add one, confirm the failure, revert
  - Negative: an envelope example carrying an undeclared extra field FAILS schema validation
    (proving the envelope is closed, not open)

  ## EDGE CASES
  - A topic that is genuinely useful but privacy-hostile (e.g. raw transcript text on
    `chat.selection`) — the contract must carry ids and bounds, never content; the consumer
    re-fetches content through the normal authorized route if it needs it
  - `pinned` retention creeping to new topics by convenience — the contract names the allowed
    set explicitly, so adding one is a contract change with review, not an implementation detail
  - Sequence-space collision with the Sprint B stream sequence — share one space per session
    rather than minting a parallel counter that resume logic would have to reconcile
  - A future multi-device session where two clients publish `shell.focus` concurrently — v1
    documents last-writer-wins per `origin` and does not pretend to merge

- **Acceptance criteria:**
  - [ ] Topic registry enumerates exactly the v1 topics, each with direction, schema, retention
        class, privacy class, opt-outable flag, and schema version
  - [ ] Envelope is closed: unknown envelope fields are specified as rejected, unknown topics as
        ignored, and both are covered by schema examples
  - [ ] Retention classes are exactly `ephemeral`/`session`/`pinned`, with `pinned` restricted to
        an explicitly named topic set
  - [ ] Sovereignty invariants written as testable sentences: no egress, no telemetry, no third
        party, user-inspectable, user-clearable
  - [ ] Opt-out is specified as enforced at publish, server-side — not as client-side suppression
  - [ ] No literal hosts, ports, addresses, org names, or personal identifiers in any contract file
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README updated to point at the context-bus contract as the source of truth for Sprint D

---

### APTR-48: Context-bus BFF — publish endpoint, fan-out, retention, and opt-out enforcement
- **Priority:** Critical
- **Labels:** aperture, context-bus, bff, rust, privacy
- **Agent:** claude
- **Estimate:** 7h
- **Blocked by:** APTR-47
- **Description:** Implement the server side of the bus inside the Aperture BFF: accept typed
  publishes, validate them against the registry, apply retention, fan them out on the SSE
  `context` channel, and enforce opt-out and rate limits at the boundary. This is the component
  that makes the bus trustworthy — if privacy is enforced anywhere else, it is not enforced.

  ## FILES
  - `docs/CONTEXT-BUS.md` (this repo) — operator-facing description of what the bus stores,
    for how long, and how to inspect and clear it
  - **Agent-core repo (sibling PR):** an `aperture::context` module with the topic registry,
    envelope validation, the retention store, the fan-out hook into the existing SSE broadcaster,
    and the four `events` routes

  ## APPROACH
  1. Two PRs per the multi-repo rule: the agent-core PR (implementation) merges first, the
     Aperture-repo PR (`docs/CONTEXT-BUS.md` and any contract clarification) second.
  2. The topic registry is a compile-time table derived from the APTR-47 contract, not a runtime
     config file — an unknown topic is a `validation-failed` problem-details response with the
     stable URN from APTR-10, never a silently accepted passthrough.
  3. Validation order, fail-closed at every step: authenticate session → resolve topic in the
     registry → reject unknown envelope fields → enforce `APERTURE_CONTEXT_MAX_PAYLOAD_BYTES` →
     check the per-topic opt-out state → check `APERTURE_CONTEXT_PUBLISH_RATE_LIMIT` → validate
     payload against the topic schema → assign `seq` → store per retention class → fan out.
     A publish that fails any step is dropped and reported; it is never partially applied.
  4. Retention store: an in-memory ring buffer per topic per session, bounded by
     `APERTURE_CONTEXT_RETENTION_EVENTS` and aged out by
     `APERTURE_CONTEXT_RETENTION_TTL_SECONDS`. `ephemeral` topics are fanned out and dropped
     without ever entering the buffer. `pinned` topics additionally write through to the
     kernel's own durable store **via `terminus-client`** — the BFF opens no database, no file,
     and no second persistence path of its own.
  5. Fan-out reuses the Sprint B SSE broadcaster and the shared per-session sequence space. No
     second stream, no second socket, no polling fallback that hits a service URL directly.
  6. `GET /v1/aperture/events` returns exactly what is retained, with its retention class and
     age, so the privacy surface in APTR-50 can render truth rather than a plausible summary.
     `DELETE /v1/aperture/events` clears the bus — optionally scoped to one topic — and clears
     **only** the bus.
  7. Publishes originating from a module or the assistant carry `origin` accordingly and are
     subject to the same registry validation and the same opt-out check as client publishes.
     There is no privileged publish path.
  8. All backend access through `terminus-client`. No `reqwest` client against a service URL.
     Secrets through `SecretManager::get()`. Chord addressed by named proxy only. No `unwrap()`
     or `expect()` on any request path.

  ## TEST PLAN
  - Unit: a valid publish for each v1 topic validates, stores per its retention class, and fans out
  - Unit: an unknown topic returns `validation-failed` problem-details and stores nothing
  - Unit: an `ephemeral` topic fans out and leaves the retention store empty
  - Unit: ring-buffer bound is respected — publishing bound+N events retains exactly bound
  - Unit: TTL expiry removes aged events from `GET /v1/aperture/events`
  - Unit: `DELETE /v1/aperture/events` scoped to one topic leaves other topics intact
  - Integration: `seq` is monotonic and shares the stream sequence space; a `Last-Event-ID`
    resume after a drop replays without a gap
  - Integration: kernel unreachable ⇒ `pinned` write-through degrades to session-only with a
    reported reason; the bus keeps working, the BFF does not crash
  - `grep` confirms zero direct HTTP clients against a service URL and zero `std::env::var`
    reads of token/key/password/secret-shaped names in the new module
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute user paths in
    new/modified files
  - Negative: with a topic opted out, a publish is **dropped server-side** — assert it is absent
    from `GET /v1/aperture/events`, absent from the SSE fan-out, and absent from what the
    assistant can read; a client-side-only suppression must FAIL this test
  - Negative: an oversized payload is rejected with `payload-too-large` and nothing is stored
  - Negative: a publish burst past the rate limit returns `rate-limited` and does not evict
    already-retained events

  ## EDGE CASES
  - A publish arriving during session teardown — must not resurrect a dead session's buffer
  - Clock skew making `ts` non-monotonic while `seq` is monotonic — ordering is by `seq`, and
    `ts` is documented as advisory
  - A slow SSE consumer applying backpressure — drop from the head of that consumer's queue
    with an explicit `gap` marker rather than stalling the publisher or growing unbounded
  - Opt-out toggled mid-flight — already-retained events for that topic are purged on opt-out,
    not merely hidden from subsequent reads
  - A `pinned` write-through succeeding kernel-side while the session buffer is full — the two
    stores must not disagree; kernel state is authoritative on read-back

- **Acceptance criteria:**
  - [ ] All four `events` routes implemented per contract, with problem-details errors
  - [ ] Opt-out enforced server-side at publish: opted-out events are never stored, never fanned
        out, and never readable by the assistant
  - [ ] Retention classes honored, with bounds and TTL from named config keys and no literal values
  - [ ] Fan-out reuses the existing SSE stream and sequence space; no second stream or polling path
  - [ ] All backend access through `terminus-client`; zero direct service HTTP clients
  - [ ] Kernel unreachable degrades to session-only retention with a reason, never a crash
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] All existing tests still pass

---

### APTR-49: Context-bus client runtime — typed publish/consume, module registration, parity plumbing
- **Priority:** Critical
- **Labels:** aperture, context-bus, web, contract
- **Agent:** codex
- **Estimate:** 6h
- **Blocked by:** APTR-47
- **Description:** The client half of the bus: a small typed runtime that every module surface
  in this sprint uses to publish what the user is doing and to consume what other modules
  published. Typed end-to-end from the APTR-47 schema, so a topic-payload mismatch is a build
  failure rather than a runtime shrug.

  This runtime is also where Module Contract clause 3 becomes mechanical: a module surface
  registers its published and consumed topics, and those registrations are what APTR-59's
  parity gate and APTR-08's descriptor cross-check read.

  ## FILES
  - `client/src/context-bus/types.ts` — types generated from the APTR-47 schema (checked in)
  - `client/src/context-bus/bus.ts` — the runtime: publish, subscribe, snapshot, gap recovery
  - `client/src/context-bus/useContextTopic.ts` — React hooks for consume and publish
  - `client/src/context-bus/registration.ts` — per-module declaration of published/consumed topics
  - `client/scripts/gen-context-types.mjs` — generation script
  - `client/scripts/assert-context-types-current.mjs` — regenerate-and-diff drift gate
  - `client/src/context-bus/bus.test.ts`, `client/src/context-bus/registration.test.ts`

  ## APPROACH
  1. Generate `types.ts` from `contracts/aperture-context-bus-v1.schema.json` into a checked-in
     file, exactly as APTR-07 does for the API — the build never needs network access, and drift
     is a CI failure via `assert-context-types-current.mjs`.
  2. `publish(topic, payload)` is typed such that the payload type is inferred from the topic
     literal. Publishing a `muse.playback` payload on `harmony.run` must not typecheck.
  3. All transport goes through the single `client/src/api/client.ts` fetch wrapper from APTR-07.
     The bus constructs no `fetch` of its own and never an absolute URL.
  4. Consume rides the existing SSE consumer's `context` events. On a `seq` gap the runtime
     requests a snapshot via `GET /v1/aperture/events` rather than assuming continuity — a
     consumer that silently believes stale state is worse than one that refetches.
  5. Publishes are coalesced client-side: high-frequency topics (`muse.playback` position,
     `shell.focus` during navigation) are debounced and deduplicated so the bus carries state
     changes, not a mouse-move log. Coalescing never drops a *terminal* event (playback stopped,
     surface unmounted) — those flush immediately.
  6. `registration.ts` exports a `registerModuleTopics(moduleId, { publishes, consumes })` call.
     Registrations are asserted against the module's APTR-08 descriptor: a module that publishes
     a topic it did not declare is a test failure, not a warning.
  7. Opt-out state is read from `GET /v1/aperture/events/topics` and used to render UI honestly
     (an opted-out topic's dependent affordance shows as off, with a reason). The client
     **never** treats its local view of opt-out as the enforcement point — APTR-48 enforces.
  8. No telemetry, no analytics, no external fetch. The bus is same-origin only.

  ## TEST PLAN
  - Unit: publishing a mismatched payload for a topic fails `tsc --noEmit`
  - Unit: subscribe receives fan-out events in `seq` order for its topic
  - Unit: a `seq` gap triggers exactly one snapshot refetch, not a refetch storm
  - Unit: high-frequency publishes coalesce; a terminal event flushes immediately and is not lost
  - Unit: a module publishing an undeclared topic fails the registration assertion test
  - `node client/scripts/gen-context-types.mjs && node client/scripts/assert-context-types-current.mjs`
    — clean, no diff
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute user paths in
    new/modified files
  - Negative: edit the bus schema without regenerating; confirm the drift gate FAILS
  - Negative: assert `fetch` is constructed nowhere under `client/src/context-bus/` — a
    grep-based test that FAILS if a second transport appears
  - Negative: with a topic opted out server-side, assert the client renders the affordance as off
    and that a forced client publish is rejected by the BFF rather than silently accepted

  ## EDGE CASES
  - A surface unmounting mid-debounce — flush the terminal event on unmount, never on a timer
    that outlives the component
  - Two surfaces publishing `shell.focus` during a route transition — last-writer-wins per the
    contract, with the incoming surface winning deterministically
  - Snapshot arriving out of order with live fan-out — reconcile by `seq`, discarding snapshot
    entries older than what is already applied
  - SSE reconnect storm producing repeated snapshot requests — back off, and cap concurrent
    snapshot requests at one
  - An unknown topic arriving from a newer backend — ignore it per contract, and never let it
    throw into the shell's render path

- **Acceptance criteria:**
  - [ ] Topic payload types are inferred from the topic literal; a mismatch fails typecheck
  - [ ] Bus transport uses the single API client; no `fetch` and no absolute URL in the bus
  - [ ] `seq` gaps trigger exactly one snapshot recovery, with backoff on repeats
  - [ ] Publishes coalesce without ever dropping a terminal event
  - [ ] A module publishing an undeclared topic fails a test
  - [ ] Context-type drift fails CI
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] All existing tests still pass

---

### APTR-50: Context-bus privacy surface — inspect, export, clear, and per-topic opt-out
- **Priority:** Critical
- **Labels:** aperture, context-bus, privacy, security, web
- **Agent:** claude
- **Estimate:** 6h
- **Blocked by:** APTR-48, APTR-49
- **Description:** The bus is only acceptable if the user can see all of it, clear all of it, and
  refuse any part of it. This item ships that surface and the mechanical assertions that make the
  sovereignty claim in the epic a tested property rather than a promise in a README.

  This is deliberately a *first-class* surface, not a settings sub-tab footnote: the bus is the
  most intimate data Aperture holds, and the epic's Module Contract clause 6 makes its
  legibility a requirement, not a courtesy.

  ## FILES
  - `client/src/context-bus/PrivacyPanel.tsx` — the inspect/clear/opt-out surface
  - `client/src/context-bus/TopicToggle.tsx` — per-topic opt-out control with a plain-language
    description of what the topic carries and why
  - `client/src/context-bus/export.ts` — local-only JSON export of retained bus contents
  - `client/src/context-bus/PrivacyPanel.test.tsx`
  - `client/scripts/assert-no-egress.mjs` — build-time sweep asserting no bus payload can reach
    any non-same-origin destination
  - `docs/PRIVACY.md` — what the bus holds, retention, opt-out, clearing, and the no-egress claim

  ## APPROACH
  1. The panel lists every registered topic with: plain-language description, what it carries
     (fields, in words), retention class, current retained count and oldest age, publish/consume
     modules, and its opt-out toggle. **Nothing is summarized away** — a "view raw events"
     affordance shows the actual retained envelopes.
  2. Clear is offered at two scopes: one topic, or the entire bus. Both call
     `DELETE /v1/aperture/events`. Clearing is immediate, confirmed, and reports what it removed.
  3. Export writes a JSON file **locally, through the browser's own download path**. It uploads
     nothing, posts nothing, and contacts nothing. The exporter is a pure function over retained
     events plus a `Blob` download; a test asserts no network call occurs during export.
  4. Opt-out toggles call the BFF and reflect server state on read-back, never optimistic local
     state — the user must never be shown "off" while the server still accepts the topic. On a
     failed toggle, the UI reports the failure and shows the true server state.
  5. `assert-no-egress.mjs` extends the Sprint A external-host assertion specifically for bus
     code paths: it fails the build if any module under `client/src/context-bus/` references an
     absolute origin, an analytics global, a beacon API, or an image/pixel construction. This is
     the mechanical form of "nothing leaves the fleet".
  6. **Continuity guard (Soul Contract clause 4):** clearing the bus clears the bus. It must not
     touch assistant memory, personality traits, relationship lore, thread history, or Muse
     watch history in the media module's own store. This gets an explicit negative test, because
     a "clear my context" button that quietly amnesias the assistant would be a catastrophic
     misreading of the feature.
  7. `docs/PRIVACY.md` states, in the plainest possible language: the bus is memory-first, it is
     single-user, it never leaves the fleet, no third party ever receives it, there is no
     telemetry, and here is exactly how to see and delete everything in it.

  ## TEST PLAN
  - Unit: every registered topic appears in the panel with description, retention class, and count
  - Unit: raw-event view renders the actual retained envelopes, not a derived summary
  - Unit: clearing one topic leaves other topics' retained events intact
  - Unit: export produces a valid JSON document containing exactly the retained events
  - Integration: toggling opt-out reflects **server** state on read-back; a failed toggle shows
    the true server state and an error, not the optimistic one
  - `node client/scripts/assert-no-egress.mjs` passes on the clean tree
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute user paths in
    new/modified files
  - Negative: during export, assert zero network requests are issued (a spy on the API client and
    on `fetch` both record nothing)
  - Negative: add a `navigator.sendBeacon` call under `client/src/context-bus/`; confirm
    `assert-no-egress.mjs` FAILS the build; revert
  - Negative (**continuity**): clear the entire bus, then assert assistant memory recall,
    personality traits, relationship lore, and existing thread history are all unchanged — this
    test FAILS if clearing the bus touches any of them

  ## EDGE CASES
  - A topic with zero retained events — render it with an explicit "nothing retained" state
    rather than hiding it; a hidden topic reads as a concealed one
  - Opt-out for a topic a currently-mounted surface depends on — the surface degrades with a
    stated reason and keeps working, never silently loses a feature
  - Clear racing an in-flight publish — the publish that lands after the clear is retained and
    visible; the panel must not imply the bus is permanently empty
  - Export of a large retained set — stream/chunk the serialization so the tab does not freeze
  - A user opting out of everything — the shell and the assistant both keep working, with
    cross-module answers degrading to "I don't have that context" rather than erroring

- **Acceptance criteria:**
  - [ ] Every topic is listed with a plain-language description, retention class, count, and age
  - [ ] Raw retained envelopes are viewable, not just a summary
  - [ ] Clear works at both topic and whole-bus scope and reports what it removed
  - [ ] Export is local-only with zero network requests, proven by a negative test
  - [ ] Opt-out reflects server state on read-back; optimistic-only state is a test failure
  - [ ] Clearing the bus provably does not touch memory, traits, lore, or thread history
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README and `docs/PRIVACY.md` document the bus's contents, retention, and controls

---

### APTR-51: Muse surface — library browse, search, and item detail, embedded and capability-gated
- **Priority:** High
- **Labels:** aperture, muse, modules, web
- **Agent:** claude
- **Estimate:** 8h
- **Blocked by:** APTR-49
- **Description:** Embed the media module's library as a first-class Aperture surface: browse the
  scanned library, filter and sort it, search it, and open a single item's detail view with its
  metadata, artwork, and availability/lifecycle state. This is the first real module surface in
  the shell, so it also lands the **capability-gating conformance harness** every later module
  surface in this sprint reuses.

  Prior art exists in the fleet's two standing web surfaces (a poster-tile grid, availability
  badges, filter chips, a dense table view). Adopt the *interaction model and vocabulary*; do
  not copy component code across repos — Aperture composes the Sprint A design-system primitives.

  **Deliberate scope reduction, recorded here rather than left implicit:** browse/search and item
  detail were originally scoped as two items. They are merged so this sprint can carry the media
  ranged-read prerequisite (APTR-52) without exceeding its item range. To keep this item honestly
  inside its estimate, **per-field metadata provenance UI is dropped from this sprint** — the
  reveal of which provider supplied which field, and the inspectable provider-disagreement view.
  Detail renders the module's already-reconciled values. Provenance display is a presentation
  enhancement, not a contract obligation: no Module Contract or Soul Contract clause depends on
  it, and no other item in this sprint consumes it. It is a follow-up, and Sprint G's review
  should file it as one rather than treating its absence as an oversight.

  ## FILES
  - `client/src/modules/muse/LibrarySurface.tsx` — the browse grid/table surface
  - `client/src/modules/muse/LibraryFilters.tsx` — filter/sort chips over library facets
  - `client/src/modules/muse/LibrarySearch.tsx` — search input and result rendering
  - `client/src/modules/muse/DetailSurface.tsx` — the single-item detail layout
  - `client/src/modules/muse/ArtworkFrame.tsx` — artwork with placeholder and aspect handling
  - `client/src/modules/muse/AvailabilityState.tsx` — lifecycle/availability presentation
  - `client/src/modules/muse/api.ts` — typed calls through the generated SDK only
  - `client/src/modules/muse/register.ts` — module registration: routes, topics, actions
  - `client/src/modules/testing/inertConformance.tsx` — the shared capability-gating harness
  - `client/src/modules/muse/LibrarySurface.test.tsx`, `client/src/modules/muse/DetailSurface.test.tsx`
  - **Agent-core repo (sibling PR):** BFF routes proxying library list/search/detail and artwork
    through `terminus-client`, plus the Muse module descriptor's capability probe

  ## APPROACH
  1. All data enters through the BFF, which reaches the media module through `terminus-client`.
     The client never calls a media service, never holds a media credential, and never builds an
     absolute URL. Artwork is served through a BFF-mediated path, not a third-party image host —
     an external poster URL rendered directly would be both an egress violation and a leak.
  2. Two view modes over one data model: a poster grid and a dense table. Both are built from the
     Sprint A primitives with token-only styling; the adherence lint keeps them honest.
  3. Filtering and sorting are URL-state-backed so a view is linkable and survives reload, and so
     Sprint E's deep links have something to address.
  4. Search calls the module's own search capability through the door. It does not reimplement
     matching client-side beyond trivial local refinement of an already-fetched page.
  5. Pagination is cursor-based with an explicit "nothing more" terminal state. A library of tens
     of thousands of items must not be fetched eagerly; virtualize the grid.
  6. Item detail is one request for the item plus artwork through the BFF artwork path with
     strong caching headers. Availability/lifecycle state reuses the module's existing vocabulary
     (requested, grabbing, available, failed, and so on) — read from the backend, never a parallel
     set of states invented in the client. Detail is deep-linkable by item id, so Sprint E deep
     links and assistant-driven navigation both address it.
  7. Detail is the launch point for playback (APTR-53) and exposes that affordance only when the
     playback capability is `available`; otherwise the affordance is present but inert with a
     reason, so the user learns *why* rather than finding a missing button.
  8. **Bus citizenship:** publishes `muse.browse` (filter, sort, selected item id) on a debounce
     and on detail mount; consumes `shell.focus` so the surface knows when it is foregrounded and
     can stop publishing when it is not, and consumes `muse.playback` so an item currently or
     recently playing is visibly marked as such — including its resume position once APTR-54
     lands. Registered via APTR-49's `registerModuleTopics`.
  9. **The inert-conformance harness** (`inertConformance.tsx`) renders any module surface under
     a forced `unavailable` and a forced `degraded` descriptor and asserts: `unavailable` renders
     the inert tile with a human reason and never the surface's data-fetching children;
     `degraded` renders children plus a banner; neither throws, blanks, or leaves a spinner
     spinning forever. Every module surface in this sprint runs through this harness, and
     APTR-59 sweeps for surfaces that skipped it.

  ## TEST PLAN
  - Unit: grid and table modes render the same data model and are switchable
  - Unit: filter/sort state round-trips through the URL
  - Unit: search issues one request per settled query, not one per keystroke
  - Unit: cursor pagination terminates cleanly with an explicit end state
  - Unit: `muse.browse` publishes on selection, filter change, and detail mount, debounced, and
    stops when `shell.focus` moves away
  - Unit: detail renders title, metadata fields, artwork, and availability/lifecycle state
  - Unit: playback affordance is inert-with-reason when the playback capability is not available
  - Unit: consuming a `muse.playback` event for the open item marks it as playing/resumable
  - Conformance: both the browse surface and the detail surface pass `inertConformance` for
    `unavailable` and `degraded`
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute user paths in
    new/modified files
  - Negative: with the media capability `unavailable`, assert the surface issues **zero** data
    requests and renders the inert tile with a reason — a surface that fetches-then-fails must
    FAIL this test
  - Negative: assert no artwork `<img src>` resolves to an external origin (grep + render test)
  - Negative: an item detail payload containing an external artwork URL must NOT be rendered as
    an image source — assert it is routed through the BFF path or dropped, never fetched directly

  ## EDGE CASES
  - An item with no artwork — render a token-styled placeholder, never a broken image icon
  - A library item whose metadata is mid-scan and partially populated — render what exists and
    mark the rest pending, rather than hiding the item
  - Search returning before an earlier slower search — discard out-of-order responses by request id
  - Extremely long titles or unusual scripts in metadata — truncate visually without clipping
    accessible text, and never assume Latin script for sort
  - Capability flipping to `available` mid-session — the surface lights up on the
    `module.capability` bus event without a page reload
  - An item that exists in the library but has no provider match at all — render the file-derived
    facts and state plainly that metadata matching has not succeeded
  - Very large artwork causing layout shift — reserve aspect-ratio space before load
  - An item deleted from the library while its detail is open — surface a clear removed state,
    not a 404 error page

- **Acceptance criteria:**
  - [ ] Library browse renders in both grid and table modes, virtualized, cursor-paginated
  - [ ] Search and filter/sort work and round-trip through URL state
  - [ ] Item detail renders metadata, artwork, and availability state from the backend's own
        vocabulary, and is deep-linkable by item id
  - [ ] All data and artwork flow through the BFF → `terminus-client`; zero external origins
  - [ ] Publishes `muse.browse`, consumes `shell.focus` and `muse.playback`, all declared
  - [ ] Both surfaces pass the inert-conformance harness, issuing zero requests when unavailable;
        the playback affordance is inert-with-reason when playback is gated
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README updated to document the Muse surface and the deferred provenance display

---

### APTR-52: Media module — ticket-bound ranged-read capability (prerequisite for playback)
- **Priority:** Critical
- **Labels:** muse, media, capability, security, rust, prerequisite
- **Agent:** claude
- **Estimate:** 6h
- **Description:** Aperture cannot play media because **the media module does not serve media
  bytes at all today** — there is no byte-serving route, no `206 Partial Content`, and no
  `Content-Range` anywhere in its source. This item adds the capability Aperture will consume.

  It is written deliberately as a **typed JSON capability, not an HTTP byte-range proxy.** The
  sanctioned door's streaming entry points (`forward_stream` and
  `forward_stream_with_idle_timeout`) take a JSON request body and yield a raw byte stream; they
  expose no arbitrary-request-header parameter and no response status or header surface to the
  caller. A `Range:` request header therefore cannot be passed through, and a `206` /
  `Content-Range` response could not be read back even if one were produced. The expedient fix —
  extending the door to forward arbitrary headers — is **rejected on architectural grounds**: it
  would convert a clean, typed, auditable JSON door into a general HTTP proxy and erode the
  single-door property that makes the whole system reviewable.

  Instead, range semantics become **typed, validated, server-enforced parameters**:
  `{ item_id, ticket, offset, length }` in, a bounded chunk stream out. Seeking is "issue a new
  ranged read at a new offset", which the existing transport supports natively with no new
  plumbing. This is strictly better here: offset validation and per-ticket bounds enforcement
  live server-side and fail closed, rather than riding in on a header the door would have to
  trust.

  **This lands in the media module's own repository.** Per the multi-repo rule it is a separate
  PR that **merges before** APTR-53's Aperture-side work, and it carries its own ingest, review,
  merge, and post-merge gate in that repo.

  ## FILES
  - **Media module repo:** a `media_read` capability handler — request/response types, offset and
    length validation, ticket verification, bounded chunk streaming
  - **Media module repo:** ticket minting and verification — issue, verify, revoke; single-item
    binding; TTL from `APERTURE_MEDIA_STREAM_TICKET_TTL_SECONDS`
  - **Media module repo:** capability descriptor advertising `media_read` so Aperture's module
    probe can gate on it, and tests for all of the above
  - **This repo:** `contracts/aperture-media-read-v1.md` — the request/response shape Aperture
    codes against, the ticket semantics, and the explicit statement that no HTTP range semantics
    cross the door

  ## APPROACH
  1. Request shape: `{ item_id, ticket, offset, length }`. Response: a bounded byte-chunk stream
     plus a typed header frame carrying total size, content type, and the actual granted
     `(offset, length)` — because the caller must be able to learn that its request was clamped
     without inspecting HTTP status codes it cannot see.
  2. **Ticket authorization is the security boundary and is fail-closed.** A ticket authorizes
     **exactly one item**. `item_id` is validated against the ticket's bound item on every read;
     a mismatch is refused. A ticket cannot be widened by a crafted offset, a negative offset, an
     offset beyond end-of-file, a length exceeding the configured maximum, or an integer that
     overflows on `offset + length`. Every one of those is refused, not clamped-then-served,
     except the single documented clamp: a read that starts in range and extends past EOF is
     served truncated to EOF with the granted length reported honestly.
  3. Tickets are short-lived, session-bound, and revocable. Session revocation invalidates
     outstanding tickets immediately — a ticket must **not** remain honored until its TTL.
  4. No library file path, storage location, mount point, or backend credential ever appears in a
     response, an error body, or a log line the caller can see. Errors map to the module's
     existing structured error shape and are redacted.
  5. Chunk size is bounded by `APERTURE_MEDIA_READ_CHUNK_BYTES` and maximum read length by
     `APERTURE_MEDIA_READ_MAX_LENGTH_BYTES` — names only, values from config, so a single
     enormous read cannot be used to pin memory.
  6. Reads are cancellable: an abandoned stream releases its file handle promptly rather than
     holding it for the life of the ticket.
  7. Secrets via the secret manager, never `std::env::var` for anything token/key/secret-shaped.
     No new outbound network path is opened by this capability.

  ## TEST PLAN
  - Unit: a valid `{item_id, ticket, offset, length}` read returns exactly the requested bytes and
    reports the granted offset/length and total size
  - Unit: a read starting in range and extending past EOF is truncated to EOF with the granted
    length reported honestly
  - Unit: sequential reads at differing offsets reconstruct the item byte-for-byte
  - Unit: an abandoned stream releases its file handle promptly
  - Unit: chunk size and maximum read length are enforced from named config, with no literal values
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute user paths in
    new/modified files
  - Negative: a ticket bound to item A used with item B is REFUSED — this is the primary
    authorization test and a pass here with any other outcome is a security failure
  - Negative: a negative offset, an offset past EOF, a length over the maximum, and an
    `offset + length` that overflows are each REFUSED (not clamped, not served)
  - Negative: after session revocation an outstanding, unexpired ticket is REFUSED
  - Negative: assert no file path, storage location, mount point, or credential appears in any
    response, error body, or caller-visible log line

  ## EDGE CASES
  - A zero-length read — refuse it rather than returning an empty stream a caller could mistake
    for EOF
  - An item whose file changes size between ticket mint and read — report the current total size
    in the header frame; never serve stale bounds
  - An item removed while a read is in flight — terminate the stream with a typed error rather
    than a silent truncation the caller would read as EOF
  - Many concurrent tickets for the same item — permitted; bound total concurrent reads so a
    single session cannot exhaust file handles
  - A clock change affecting TTL evaluation — evaluate expiry monotonically, not on wall clock

- **Acceptance criteria:**
  - [ ] `media_read` accepts `{item_id, ticket, offset, length}` over the existing JSON door and
        returns a bounded chunk stream plus granted offset/length and total size
  - [ ] **No HTTP range semantics cross the door** — no `Range` header forwarding, no `206`, no
        `Content-Range`, and no change to the door's header surface
  - [ ] A ticket authorizes exactly one item and cannot be widened by any crafted offset, length,
        or overflow; every such attempt is refused
  - [ ] Session revocation invalidates outstanding tickets immediately, ahead of TTL
  - [ ] No file path, storage location, mount point, or credential is caller-visible anywhere
  - [ ] Chunk and length bounds come from named config; secrets via the secret manager
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] All existing tests still pass

---

### APTR-53: Muse playback — genuine in-shell media playback, not a link-out
- **Priority:** High
- **Labels:** aperture, muse, playback, modules, web, security
- **Agent:** claude
- **Estimate:** 7h
- **Blocked by:** APTR-51, APTR-52
- **Description:** Play media inside Aperture. This is a real capability with a real player — a
  button that opens another application would defeat the entire point of the shell, and would
  make "what was I watching" unanswerable. The player is a first-class surface with transport
  controls, seeking, subtitle/audio track selection where the backend offers them, and a
  compact persistent mode that survives navigation within the shell.

  Playback consumes the **typed ranged-read capability** landed by APTR-52 —
  `{ item_id, ticket, offset, length }` in, a bounded chunk stream out. There are no HTTP range
  semantics anywhere in this path: no `Range` request header, no `206`, no `Content-Range`, and
  no extension of the door's header surface. Seeking is not a header; it is a new ranged read at
  a new offset. That is a constraint the client is built around from the start, not a degraded
  fallback.

  ## FILES
  - `client/src/modules/muse/PlayerSurface.tsx` — the full player surface
  - `client/src/modules/muse/MiniPlayer.tsx` — the compact persistent player
  - `client/src/modules/muse/playbackEngine.ts` — media element lifecycle, buffer feeding, error mapping
  - `client/src/modules/muse/rangedReader.ts` — offset-driven read scheduling, cancellation, backpressure
  - `client/src/modules/muse/tracks.ts` — subtitle/audio track selection
  - `client/src/modules/muse/playbackEngine.test.ts`, `client/src/modules/muse/rangedReader.test.ts`,
    `client/src/modules/muse/PlayerSurface.test.tsx`
  - `docs/PLAYBACK.md` — what plays natively, what requires backend transcode, and the failure modes
  - **Agent-core repo (sibling PR):** a BFF playback route that mints a **short-lived,
    single-item, session-bound stream ticket** and issues ranged reads via
    `forward_stream_with_idle_timeout`; TTL from `APERTURE_MEDIA_STREAM_TICKET_TTL_SECONDS`

  ## APPROACH
  1. **Security first.** The client never receives a library file path, a storage location, or a
     backend credential. It receives an opaque, short-lived, single-item, session-bound ticket
     and requests bounded chunks from a same-origin BFF path. A ticket is not reusable for another
     item, does not survive session revocation, and expires on its configured TTL. Every bound is
     re-validated server-side by APTR-52 — the client's correctness is convenience, not the
     security boundary.
  2. **Ranged reads, not byte-range HTTP.** `rangedReader.ts` maintains a read cursor and feeds
     the media element from bounded chunks. A seek **cancels the in-flight read and starts a new
     one at the new offset** — reads are never interleaved, because two concurrent readers feeding
     one buffer is a corruption bug, not a performance win. Read-ahead depth is bounded so a fast
     link cannot pull an entire film into memory.
  3. **The BFF uses `forward_stream_with_idle_timeout`, not `forward_stream`.** Playback is a
     fundamentally different workload shape from an agentic turn: chunks either arrive
     continuously or the read is dead, so an agent-sized idle tolerance would leave a stalled
     player hanging for minutes with no signal. Use a playback-appropriate idle timeout of
     **15 seconds**, from `APERTURE_MEDIA_READ_IDLE_TIMEOUT_SECONDS` — long enough to survive a
     disk seek or a brief network hiccup, short enough that a genuinely stalled read surfaces as
     buffering-then-error within a few seconds rather than an indefinite spinner.
  4. The player is a standard media element driven by `playbackEngine.ts` — no third-party player
     library is vendored. Ideas from prior art may be cited; code may not be copied.
  5. Codec/container reality is handled honestly: probe playability, and when the browser cannot
     play an item natively, request the module's transcode capability if it reports `available`,
     and otherwise state plainly that this item cannot play in this client and why. A silent
     black rectangle is the failure mode this item exists to prevent.
  6. Track selection (subtitles, audio) is offered only for tracks the backend actually reports.
  7. `MiniPlayer` keeps playback alive while the user navigates to other module surfaces within
     the shell, because "keep watching while I check a build" is exactly the shell's value.
  8. **Bus citizenship:** publishes `muse.playback` (item, state, position, duration) on state
     transitions and on a coalesced position cadence; consumes `shell.focus` to decide between
     full and mini presentation. Position persistence is APTR-54's job — this item publishes,
     it does not yet resume.
  9. Errors map to the APTR-10 problem-details taxonomy: an expired ticket surfaces as a
     recoverable auth-ish error the player retries once by re-minting at the current offset, not
     a dead player. An idle-timeout termination is a distinct, stated buffering failure — not
     silently retried forever, and never presented as end-of-stream.

  ## TEST PLAN
  - Unit: transport controls drive the engine (play/pause/seek/rate) and reflect real element state
  - Unit: a seek issues a new ranged read at the new offset and does not restart from zero
  - Unit: read-ahead depth is bounded; a fast link does not buffer the whole item into memory
  - Unit: an unplayable codec produces a stated reason and a transcode offer when that capability
    is available, and a plain explanation when it is not
  - Unit: track selection lists only backend-reported tracks
  - Unit: `muse.playback` publishes on every state transition and at a coalesced position cadence
  - Integration: navigating to another module surface keeps `MiniPlayer` playing
  - Integration: an expired ticket triggers exactly one re-mint and resumes at the current offset
  - Integration: sequential ranged reads reconstruct the item and play through to its end
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute user paths in
    new/modified files
  - Negative: assert no library file path, storage location, or credential appears in any client
    payload or in the DOM — a response containing one must FAIL the test
  - Negative: assert the playback path sets **no** `Range` request header and reads **no**
    response status or header surface from the door — a build that reintroduces HTTP range
    semantics FAILS this test
  - Negative: a seek during an in-flight read must CANCEL the prior read — a test asserting two
    concurrently-live reads feeding one buffer FAILS
  - Negative: after session revocation, an outstanding ticket must be REJECTED, not honored to TTL

  ## EDGE CASES
  - **A seek during an in-flight read** — cancel the prior read, discard its buffered remainder,
    and start a new read at the new offset. Reads are never interleaved and a late chunk from a
    cancelled read is dropped by generation counter, not merged into the buffer.
  - **An offset past end-of-file** — the capability refuses it (APTR-52); the player clamps the
    requested seek to the known total size before issuing, and treats a refusal as a bug to
    surface, not a condition to retry
  - **A ticket expiring mid-playback** — re-mint once, transparently, and resume at the current
    offset with no visible interruption beyond buffering. A second consecutive failure to re-mint
    surfaces a stated auth error and pauses; it does not silently loop.
  - **A stalled stream hitting the idle timeout mid-playback** — surface buffering, then a stated
    "stream stalled" error with a retry affordance. It must never be presented as end-of-stream,
    and must never retry indefinitely without telling the user.
  - Autoplay policy blocking playback without a user gesture — surface an explicit "press play"
    state rather than appearing broken
  - Seeking into a not-yet-available region of a still-transcoding item — clamp to what the
    capability reports as available and explain
  - Two tabs playing the same item — both are valid; `muse.playback` last-writer-wins per the
    contract and the privacy panel shows why the position moved
  - The user opting out of `muse.playback` — playback still works fully; only the bus publication
    stops, and resume (APTR-54) degrades with a stated reason
  - Very long items where position coalescing could lose the final position — the terminal
    pause/stop event flushes immediately

- **Acceptance criteria:**
  - [ ] Media plays in-shell with working transport and track selection, driven by typed ranged
        reads (`{item_id, ticket, offset, length}`) — never an HTTP `Range` header or a `206`
  - [ ] Seeking issues a new ranged read and cancels the in-flight one; reads never interleave
  - [ ] The BFF uses `forward_stream_with_idle_timeout` with a playback-appropriate idle timeout
        from named config, not the default agentic-turn tolerance
  - [ ] Client receives only an opaque short-lived single-item session-bound ticket — never a
        path, location, or credential
  - [ ] A ticket expiring mid-playback re-mints once and resumes at the current offset; a stalled
        read surfaces a stated error and is never presented as end-of-stream
  - [ ] No third-party player source vendored
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README and `docs/PLAYBACK.md` document playback support and its failure modes

---

### APTR-54: Resume position — durable playback state on the bus, assistant-readable
- **Priority:** High
- **Labels:** aperture, muse, context-bus, modules
- **Agent:** claude
- **Estimate:** 5h
- **Blocked by:** APTR-53
- **Description:** Make "resume where I left off" real, and make it the worked example of the
  `pinned` retention class from APTR-47. Playback position survives reload, session end, and
  device change, and — because it lives on the bus — the assistant can answer "what was I
  watching" without being told, which is the concrete Muse × assistant win the epic's Gate 2
  argument named.

  ## FILES
  - `client/src/modules/muse/resume.ts` — resume resolution and write-through policy
  - `client/src/modules/muse/ResumeAffordance.tsx` — "resume" vs "start over" presentation
  - `client/src/modules/muse/resume.test.ts`
  - **Agent-core repo (sibling PR):** `pinned` write-through for `muse.playback` to the media
    module's own watch-state store via `terminus-client`, and the resume read path

  ## APPROACH
  1. The bus is the transport; the media module's own store is the **authority**. The BFF writes
     `muse.playback` positions through to the module via `terminus-client` and reads resume state
     back from it. Aperture does not become a second source of truth for watch state — that would
     guarantee a disagreement with every other client of the media module.
  2. Write-through is throttled and idempotent: positions are written on terminal transitions
     (pause, stop, unmount, tab hide) and on a coarse periodic cadence, not on every tick.
  3. Resume resolution rules, stated explicitly: below a near-start threshold, treat as unwatched
     and start from zero; above a near-end threshold, treat as completed and offer start-over;
     otherwise offer resume with the recorded position, always with an explicit start-over option.
     Thresholds are named config, never magic numbers scattered in components.
  4. `ResumeAffordance` never resumes silently on load — it states the position it would resume
     from. A player that jumps somewhere unexplained is a bug that feels like data loss.
  5. **Assistant-readable:** the retained `muse.playback` state is exactly what the assistant reads
     to answer "what was I watching". No separate assistant-facing store, no duplicated shape.
  6. **Opt-out honored:** if the user opts out of `muse.playback`, nothing is published and nothing
     is written through; resume degrades to unavailable with a stated reason. It must not fall
     back to a hidden local cache — a privacy control the client routes around is not a control.

  ## TEST PLAN
  - Unit: resume resolution honors near-start, near-end, and mid thresholds from named config
  - Unit: write-through throttles and is idempotent — repeated identical positions write once
  - Unit: terminal transitions (pause, stop, unmount, tab hide) each flush a write
  - Integration: play, reload the client, and confirm the resume affordance offers the recorded
    position and that start-over is always available
  - Integration: the assistant, reading only retained bus state, can name the most recent item
    and its position
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute user paths in
    new/modified files
  - Negative: with `muse.playback` opted out, assert no position is published, none is written
    through, and **no local fallback cache is written** — a client-side stash must FAIL this test
  - Negative: a position conflict where the module's store is newer than the bus must resolve to
    the module's store, not the bus

  ## EDGE CASES
  - Two devices watching the same item — the module's store is authoritative; the later write wins
    and the affordance shows the position it will actually resume from
  - A resume position beyond the item's duration after a re-encode changed length — clamp and
    offer start-over rather than seeking into nothing
  - Kernel unreachable at write time — retain in the session buffer and write through on recovery;
    never drop silently and never claim the position was saved
  - The user clearing the bus — bus contents clear, but the media module's own watch state is the
    module's own data and is not deleted by an Aperture bus clear; the privacy panel must say so
    explicitly so the user is not misled about what "clear" cleared

- **Acceptance criteria:**
  - [ ] Positions write through to the media module's store as the authority, throttled and idempotent
  - [ ] Resume offers the recorded position explicitly, never resumes silently, always offers start-over
  - [ ] Near-start/near-end thresholds come from named config, not inline constants
  - [ ] The assistant can answer "what was I watching" from retained bus state alone
  - [ ] Opt-out fully suppresses publication and write-through with no local fallback cache
  - [ ] Bus clear does not delete the media module's own watch state, and the UI says so
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] All existing tests still pass

---

### APTR-55: Harmony surface — build runs, dispatch status, and PR/review state
- **Priority:** High
- **Labels:** aperture, harmony, modules, web
- **Agent:** claude
- **Estimate:** 7h
- **Blocked by:** APTR-49
- **Description:** Embed the build orchestrator as an Aperture surface: what is running, what is
  dispatched to which agent, and where each item stands in PR and review. This is the surface
  that makes the shell useful to the operator during a build, and it is the consumer half of the
  marquee spec-ingest loop — work ingested from chat shows up here, live.

  ## FILES
  - `client/src/modules/harmony/RunsSurface.tsx` — run list and run detail
  - `client/src/modules/harmony/DispatchStatus.tsx` — per-item agent/worktree/phase status
  - `client/src/modules/harmony/ReviewState.tsx` — PR state, review verdicts, gate outcomes
  - `client/src/modules/harmony/api.ts` — typed calls through the generated SDK only
  - `client/src/modules/harmony/register.ts` — routes, topics, and actions registration
  - `client/src/modules/harmony/RunsSurface.test.tsx`
  - **Agent-core repo (sibling PR):** BFF routes proxying runs, dispatch, and PR/review state
    through `terminus-client`, plus the Harmony descriptor's capability probe

  ## APPROACH
  1. All build state arrives through the BFF → `terminus-client`. **No raw forge API call, no
     raw Plane API call, no direct orchestrator HTTP client** — not from the client, not from the
     BFF. This is the epic's single-door rule at its most tempting to violate, and violating it
     here is a review rejection.
  2. Run list is filterable by state and recency; run detail shows the item breakdown with each
     item's phase (ingested, worktree, implementing, test gate, review, merged, verified).
  3. Review state renders the *outcome and the gate*, not just a colour: which reviewers ran,
     what each returned, and whether the post-merge gate ran and what it reported. A merge shown
     as "done" without its gate outcome would reproduce, in UI form, exactly the reporting failure
     the pipeline rules exist to prevent.
  4. Live updates ride the existing SSE stream. No polling loop against a service URL, and no
     second stream.
  5. **Bus citizenship:** publishes `harmony.run` when the user opens or watches a run; consumes
     `harmony.spec` so opening a spec elsewhere highlights its related runs, and consumes
     `shell.focus`.
  6. Surface is read-and-observe plus the narrow, explicitly-enumerated actions that APTR-59's
     parity gate covers (e.g. open run, watch run, open PR view). Destructive build operations
     are out of scope for this sprint — the shell observes the pipeline, it does not gain a
     side-channel to mutate it.
  7. Long-running runs must not accumulate unbounded DOM; virtualize item lists and cap rendered
     log excerpts with an explicit "truncated" marker.

  ## TEST PLAN
  - Unit: run list filters by state and recency; run detail renders per-item phases
  - Unit: review state renders reviewer identities, verdicts, and the post-merge gate outcome
  - Unit: a merged item with **no** recorded gate outcome renders as "gate not run", not as done
  - Unit: publishes `harmony.run` on open/watch; consumes `harmony.spec` to highlight related runs
  - Integration: live phase transitions arrive over the existing SSE stream with no polling
  - Conformance: passes `inertConformance` for `unavailable` and `degraded`
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute user paths in
    new/modified files
  - Negative: grep-based test asserting zero forge, Plane, or orchestrator URLs and zero direct
    HTTP clients in the Harmony module's client and BFF code
  - Negative: with the build capability `unavailable`, the surface issues zero requests and
    renders inert-with-reason

  ## EDGE CASES
  - A run with hundreds of items — virtualize; never render every item's full log
  - An item whose review returned a mixed panel verdict — show every reviewer's verdict rather
    than collapsing to a single pass/fail
  - A mirror step reporting `needs_operator_rebaseline` — surface it prominently as an operator
    decision, and offer **no** force affordance anywhere in the UI
  - A run that ended abnormally with no terminal event — render "unknown, last seen at …"
    rather than an indefinite in-progress spinner
  - Clock skew between orchestrator timestamps and client — display relative times computed from
    server-provided timestamps, not client-local assumptions

- **Acceptance criteria:**
  - [ ] Run list, run detail, dispatch status, and PR/review state all render from live backend state
  - [ ] Post-merge gate outcome is shown; a merge without a recorded gate outcome never reads as done
  - [ ] Zero forge/Plane/orchestrator URLs and zero direct HTTP clients in client or BFF code
  - [ ] No force-push or mirror-override affordance exists anywhere in the UI
  - [ ] Publishes `harmony.run`, consumes `harmony.spec` and `shell.focus`, all declared
  - [ ] Passes the inert-conformance harness with zero requests when unavailable
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README updated to document the Harmony surface

---

### APTR-56: Harmony spec browser — read specs, items, and their tracked state
- **Priority:** Medium
- **Labels:** aperture, harmony, modules, web
- **Agent:** codex
- **Estimate:** 5h
- **Blocked by:** APTR-55
- **Description:** Browse and read the specs the build pipeline runs on: the spec list, a rendered
  spec document, its enumerated items, and each item's tracked state. This is the reading half of
  the spec loop — APTR-57 drafts a spec and APTR-58 ingests it, and both hand off to this surface
  so a freshly ingested spec is immediately legible in the same place as every other one.

  ## FILES
  - `client/src/modules/harmony/SpecList.tsx` — spec index with filters
  - `client/src/modules/harmony/SpecDocument.tsx` — rendered spec with item anchors
  - `client/src/modules/harmony/SpecItemState.tsx` — per-item tracked state and links to runs
  - `client/src/modules/harmony/markdown.ts` — the constrained markdown renderer
  - `client/src/modules/harmony/SpecDocument.test.tsx`
  - **Agent-core repo (sibling PR):** BFF routes serving spec list/detail through `terminus-client`

  ## APPROACH
  1. Specs are fetched through the door. The client never reads a repository path and never
     addresses a forge.
  2. `markdown.ts` renders spec markdown with a **strict allowlist** of elements and attributes.
     No raw HTML passthrough, no script, no external image or link auto-fetch. Spec content is
     partly machine-authored and must be treated as untrusted input; a permissive renderer here
     would be a straightforward injection vector into the shell.
  3. Item anchors are addressable (`#APTR-57`), so the assistant and deep links can point at a
     single item rather than a document.
  4. Each rendered item shows its tracked state pulled from the same source as APTR-55, with a
     link to any run that touched it. Where an item has **no** tracked counterpart, say so
     plainly — an untracked item silently rendering as ordinary text is how the fleet's historical
     tracking gap stayed invisible.
  5. **Bus citizenship:** publishes `harmony.spec` on open (spec id, and item id when anchored);
     consumes `harmony.run` to mark items with active runs.
  6. External links inside spec content are rendered as inert, copyable text rather than
     auto-linked navigation — no runtime fetch to an external origin, ever.

  ## TEST PLAN
  - Unit: spec list filters and renders; spec document renders with per-item anchors
  - Unit: item state renders from tracked data; an item with no tracked counterpart says so
  - Unit: publishes `harmony.spec` on open and on anchor change
  - Conformance: passes `inertConformance` for `unavailable` and `degraded`
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute user paths in
    new/modified files
  - Negative: spec markdown containing a `<script>` tag, an `onerror` attribute, and an external
    `<img>` must render inert — none executes, none fetches; a permissive render FAILS this test
  - Negative: a spec containing an internal-looking hostname must render as text and must not
    become a navigable link

  ## EDGE CASES
  - A very large spec document — virtualize or lazily render sections rather than blocking paint
  - A spec whose items use a prefix the client does not know — render them, do not filter them out
  - Duplicate item ids within a document — render both and flag the duplication rather than
    silently deduplicating
  - Malformed markdown from a partial write — render what parses and show a parse-warning band
  - A spec deleted or renamed while open — surface a clear removed state

- **Acceptance criteria:**
  - [ ] Spec list, rendered spec document, and per-item tracked state all render through the door
  - [ ] Markdown rendering is allowlist-based; no raw HTML, script execution, or external fetch
  - [ ] Items with no tracked counterpart are explicitly labelled as untracked
  - [ ] Per-item anchors are addressable for deep links and assistant references
  - [ ] Publishes `harmony.spec` and consumes `harmony.run`
  - [ ] Passes the inert-conformance harness
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] All existing tests still pass

---

### APTR-57: Spec-draft-from-chat — select a conversation range, draft a spec, review and edit it
- **Priority:** Critical
- **Labels:** aperture, harmony, marquee, assistant, context-bus, web
- **Agent:** claude
- **Estimate:** 8h
- **Blocked by:** APTR-49, APTR-56
- **Description:** **The marquee capability of this epic**, first half. Select a range of a
  conversation, have the assistant draft a real spec from it, and review and edit that draft in
  the client until it is right. APTR-58 ingests it; this item produces something worth ingesting.

  This is the capability the epic's Gate 2 argument rests on: it is only possible when chat and
  build share a context bus, and it is structurally impossible in a chat room. It is also the
  place where sloppiness would be most expensive — a spec drafted from a conversation and ingested
  without provenance is untraceable work, which is precisely the failure the fleet has already
  lived through once.

  ## FILES
  - `client/src/modules/harmony/spec-draft/RangeSelection.tsx` — transcript range selection UI
  - `client/src/modules/harmony/spec-draft/DraftPanel.tsx` — draft review/edit surface
  - `client/src/modules/harmony/spec-draft/DraftEditor.tsx` — structured editor over the draft
  - `client/src/modules/harmony/spec-draft/provenance.ts` — provenance record construction
  - `client/src/modules/harmony/spec-draft/validate.ts` — client-side spec-shape validation
  - `client/src/modules/harmony/spec-draft/DraftPanel.test.tsx`,
    `client/src/modules/harmony/spec-draft/provenance.test.ts`
  - `contracts/aperture-spec-draft-v1.md` — the draft and provenance record schema
  - **Agent-core repo (sibling PR):** BFF draft routes — create draft from a range, update draft,
    fetch draft — with drafting performed through the assistant via a **named proxy**

  ## APPROACH
  1. **Range selection.** The user selects a contiguous or multi-block range of messages in a
     thread. Selection publishes `chat.selection` on the bus as **ids and range bounds only**,
     never raw text, per the APTR-47 contract. The drafting request re-fetches the actual message
     content server-side through the normal authorized thread path — the transcript never makes a
     round trip through the bus.
  2. **Drafting.** The BFF asks the assistant to draft a spec from the selected range, addressed
     by **named proxy** (`lumina-deep` class of work — a long-context reasoning draft), never by
     model id, engine name, or backend tag. The draft is *generated*, passing through the persona
     assembler per Soul Contract clause 1; a raw string template is a render-failure fallback only.
  3. **The draft is shaped, not freeform.** The drafting prompt and the returned structure target
     the fleet's spec shape: title, metadata block, pre-flight, and enumerated items with
     priority, labels, agent, estimate, description, and acceptance criteria. `validate.ts`
     checks that shape client-side and reports what is missing, item by item.
  4. **Review and edit is mandatory, not optional.** The draft opens in an editor. Nothing about
     this flow permits going from a selection straight to ingest — APTR-58 requires an explicitly
     reviewed draft, and this item makes review the only path forward. Every edit is the user's;
     the assistant can be asked to revise, but a revision produces a new draft revision, tracked.
  5. **Provenance is constructed here and is non-optional.** The provenance record captures:
     source workspace and thread ids, the exact message id range and message count, a stable
     content digest of the selected range (so later drift is detectable), the drafting proxy name
     (not a model id), the draft creation timestamp, the revision chain, and the identity that
     performed the review. `provenance.ts` refuses to produce a record with any of these missing,
     and a draft without a complete record cannot reach APTR-58.
  6. **Truncation is explicit.** A selection exceeding
     `APERTURE_SPEC_DRAFT_MAX_TRANSCRIPT_CHARS` is refused with a clear message naming the limit,
     not silently truncated — a spec drafted from a quietly clipped conversation is worse than no
     spec at all.
  7. **Bus citizenship:** publishes `chat.selection` and `harmony.spec` (draft id); consumes
     `chat.thread` so the selection surface knows its source thread.
  8. Drafts are stored server-side through `terminus-client` and are never written to a local
     file, a browser storage bucket that survives logout, or any second persistence path.

  ## TEST PLAN
  - Unit: range selection produces ids and bounds; assert **no raw message text** appears in the
    published `chat.selection` payload
  - Unit: `validate.ts` reports each missing required field per item, by item id
  - Unit: `provenance.ts` refuses to construct a record missing any required field
  - Unit: a revision produces a new tracked revision rather than mutating the prior draft in place
  - Unit: a selection over the configured character limit is refused with the limit named
  - Integration: draft creation reaches the assistant through a named proxy; grep asserts zero
    model ids, engine names, backend tags, or size suffixes in client or BFF draft code
  - Conformance: passes `inertConformance` for `unavailable` and `degraded`
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute user paths in
    new/modified files
  - Negative: attempt to reach the ingest path with an unreviewed draft — it must be REFUSED here
    and again in APTR-58 (defence in depth, both asserted)
  - Negative: attempt to construct a draft whose provenance omits the source thread — construction
    FAILS and no draft is created
  - Negative: assert draft content is not persisted to browser storage that survives logout

  ## EDGE CASES
  - A selection spanning messages the user no longer has access to — refuse with a clear reason
    rather than drafting from a partial range
  - Source messages edited or deleted after drafting — the content digest makes the drift
    detectable; the draft surfaces "source has changed since drafting" rather than pretending
  - The assistant returning prose instead of a shaped spec — `validate.ts` reports it plainly and
    the user can request a revision; never silently ingest unshaped output
  - A drafting request that times out — the draft is not half-created; surface the timeout and
    allow retry without losing the selection
  - A selection containing secrets or credentials pasted into chat — the draft surface runs the
    repo's PII/secret sweep over the draft before it can be marked reviewed, and flags findings
    for the user to remove; a draft with unresolved findings cannot proceed
  - Multi-thread selection — v1 scopes a draft to a single thread and says so, rather than
    silently drafting from a mixed source it cannot provenance cleanly

- **Acceptance criteria:**
  - [ ] A transcript range can be selected and produces a shaped spec draft generated by the
        assistant via a **named proxy only** — zero model ids, engine names, or backend tags
  - [ ] `chat.selection` carries ids and bounds only; raw transcript text never crosses the bus
  - [ ] The draft opens in an editor and review is the only path forward; there is no
        selection-to-ingest shortcut
  - [ ] Provenance records source thread, message range, content digest, proxy name, timestamp,
        revision chain, and reviewer; construction fails if any is missing
  - [ ] Over-limit selections are refused with the limit named, never silently truncated
  - [ ] A draft with unresolved PII/secret findings cannot be marked reviewed
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README updated to document spec-draft-from-chat

---

### APTR-58: Spec ingest through the one sanctioned door — reviewed draft becomes tracked work
- **Priority:** Critical
- **Labels:** aperture, harmony, marquee, pipeline, security
- **Agent:** claude
- **Estimate:** 7h
- **Blocked by:** APTR-57
- **Description:** **The marquee capability, second half.** Take a reviewed draft and ingest it
  into the build pipeline so it becomes tracked work items — through the **one sanctioned Plane
  door, the Terminus Plane tool**, obeying every rule the normal ingest path obeys, with the
  chat provenance recorded on the created work.

  The security posture of this item is the whole item. Ingest creates durable, tracked,
  organization-visible state. There is exactly one door to it, and this feature is not permitted
  to become a second one.

  ## FILES
  - `docs/SPEC-INGEST.md` — the ingest flow, its guarantees, and what it refuses to do
  - `contracts/aperture-spec-draft-v1.md` — extended with the ingest request/response shape and
    the provenance fields written onto created work items
  - `client/src/modules/harmony/spec-draft/IngestPanel.tsx` — preflight, confirm, and result
  - `client/src/modules/harmony/spec-draft/IngestPanel.test.tsx`
  - **Agent-core repo (sibling PR):** the BFF ingest route, calling the Terminus Plane tool
    through `terminus-client` — and nothing else

  ## APPROACH
  1. **Single door, absolutely.** Ingest calls the Terminus Plane tool through `terminus-client`.
     It does **not** call a Plane REST endpoint, does not construct an HTTP client against a
     tracker URL, does not read a tracker token, and does not reach into the build orchestrator's
     own internal tracker code. Any of those is a second access path and a review rejection on
     sight. If the Plane tool is unreachable, ingest reports `capability-unavailable` with a clear
     reason and **stops** — it never improvises an alternate route.
  2. **No bypass of normal ingest rules.** Chat-drafted specs go through the same validation,
     the same prefix rules, the same project resolution, and the same item-shape requirements as
     any other spec. This path is a different *authoring surface*, not a different *pipeline*.
     A field the normal ingest requires is required here.
  3. **Preflight before create.** The panel shows exactly what will be created — target project,
     prefix, the item list with titles and priorities, and the provenance that will be attached —
     and requires explicit confirmation. Nothing is created before confirmation.
  4. **Provenance is written onto the created work**, not just kept client-side: each created
     item records that it was drafted from a chat range, with the source thread id, message range,
     content digest, drafting proxy name, draft revision id, and reviewer identity. A reader six
     months later must be able to answer "where did this come from" from the work item alone.
  5. **Idempotency.** The ingest request carries an idempotency key derived from the draft
     revision. A retry after a network failure must not create a duplicate set of items. A
     partially-applied ingest is reported item-by-item with what was created and what was not,
     and is resumable — never silently re-run from the top.
  6. **Rate discipline.** The tracker is rate-sensitive; ingest paces its calls and batches where
     the tool supports it, rather than firing a burst that trips a limit mid-creation.
  7. **Result hands off to APTR-56.** On success the user lands on the ingested spec in the spec
     browser with its items tracked, and `harmony.spec` publishes the new spec id.
  8. `docs/SPEC-INGEST.md` documents the guarantees and, explicitly, the refusals: no direct API
     calls, no bypass of validation, no creation without confirmation, no duplicate on retry.

  ## TEST PLAN
  - Unit: preflight renders the exact project, prefix, item list, and provenance to be created
  - Unit: nothing is created without explicit confirmation
  - Unit: the idempotency key derives from the draft revision and is stable across retries
  - Integration: a successful ingest creates the expected items, each carrying the full provenance
  - Integration: a retry with the same key creates nothing additional
  - Integration: a partial failure reports per-item outcomes and is resumable without duplication
  - Integration: with the Plane tool unreachable, ingest reports `capability-unavailable` and
    creates nothing
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute user paths in
    new/modified files
  - Negative (**single door**): a grep-based test asserting the ingest path contains no tracker
    URL, no direct HTTP client, no tracker token read, and no call into the orchestrator's own
    internal tracker code — this test FAILS the build if a second door appears
  - Negative: an unreviewed draft is REFUSED at the ingest route, independently of the UI guard
  - Negative: a draft whose provenance is incomplete is REFUSED, and nothing is created
  - Negative: a draft failing normal spec validation is REFUSED with the same errors the normal
    ingest path would produce — a relaxed validation for this surface FAILS this test

  ## EDGE CASES
  - The tracker rate-limits mid-ingest — pace, retry with backoff, and report partial state
    truthfully rather than reporting success for uncreated items
  - The target project or prefix does not exist — refuse with a clear message and a pointer to
    the prefix-promotion path; do not create a project on the fly
  - The draft was reviewed, then its source thread changed — the content digest mismatch is
    surfaced at preflight so the reviewer re-confirms deliberately
  - Two clients ingesting the same draft revision concurrently — the idempotency key serializes;
    the loser reports "already ingested" and links to the existing items
  - An ingest that succeeds while the response is lost — the next attempt with the same key must
    detect the existing items rather than duplicating them
  - A draft containing an item the validator accepts but that is over-scoped — out of scope for
    mechanical enforcement here; the reviewer is the gate, and the docs say so plainly

- **Acceptance criteria:**
  - [ ] Ingest goes exclusively through the Terminus Plane tool via `terminus-client` — a test
        FAILS the build on any tracker URL, direct HTTP client, tracker token read, or call into
        the orchestrator's internal tracker code
  - [ ] Chat-drafted specs pass the same validation and rules as any other spec; no relaxed path
  - [ ] Preflight shows exactly what will be created and requires explicit confirmation
  - [ ] Every created item carries source thread, message range, content digest, proxy name,
        draft revision, and reviewer identity
  - [ ] Retry with the same idempotency key creates no duplicates; partial failure is resumable
  - [ ] Plane tool unreachable ⇒ `capability-unavailable`, nothing created, no alternate route
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README and `docs/SPEC-INGEST.md` document the flow and its explicit refusals

---

### APTR-59: Assistant-operable parity gate — every UI action has a tool counterpart, mechanically
- **Priority:** Critical
- **Labels:** aperture, modules, assistant, contract, ci
- **Agent:** claude
- **Estimate:** 7h
- **Blocked by:** APTR-51, APTR-53, APTR-55, APTR-56, APTR-57
- **Description:** Module Contract clause 4 says every meaningful module action must be invocable
  by the assistant as a tool, not only as a button. A checklist cannot hold that line — the first
  time someone ships a button in a hurry, the parity silently lapses and nobody notices until the
  assistant is asked to do the obvious thing and can't.

  This item makes parity **mechanical**: every user-facing module action is declared in a
  manifest, the manifest is cross-checked against both the UI and the tool surface, and a new UI
  action without a tool counterpart **fails the build**.

  ## FILES
  - `contracts/aperture-actions-v1.md` — the action manifest contract: what counts as an action,
    what a declaration carries, and what parity means
  - `client/src/modules/actions/manifest.ts` — the declared action manifest (all modules)
  - `client/src/modules/actions/declareAction.ts` — the declaration helper every action uses
  - `client/src/modules/actions/parity.test.ts` — the gate
  - `client/scripts/assert-action-parity.mjs` — CI-invocable form of the gate
  - `.gitea/workflows/ci.yml` — wire the parity job
  - `docs/ASSISTANT-PARITY.md` — how to add an action correctly
  - **Agent-core repo (sibling PR):** the BFF endpoint enumerating the tool surface available for
    Aperture module actions, resolved through `terminus-client`

  ## APPROACH
  1. Define "action" precisely in the contract, so the gate is not gameable: any user-initiated
     operation that changes module state or navigates to a distinct module capability. Pure
     presentation toggles (theme, view mode, column widths) are explicitly excluded and the
     exclusion list is itself declared, so excluding something is a visible, reviewable choice
     rather than an omission.
  2. Every action is declared through `declareAction({ id, module, title, params, toolName,
     capability })`. The declaration is the single source of truth: the UI control is *built from*
     the declaration, and the tool name it names is what parity is checked against.
  3. **The gate has three legs, all mechanical:**
     - **Leg 1 — no undeclared UI actions.** A static sweep of module surfaces finds interactive
       controls that invoke a mutating or navigating handler without a corresponding
       `declareAction` reference, and fails on a hit. This is the leg that catches the
       shipped-in-a-hurry button.
     - **Leg 2 — every declared action resolves to a real tool.** The manifest is checked against
       the live tool surface enumerated through the door. A declaration naming a tool that does
       not exist fails.
     - **Leg 3 — parameter compatibility.** Each declared action's params are checked against the
       named tool's parameter schema, so parity is not merely nominal. A UI action that can
       express a request the tool cannot fails.
  4. Enumerate and declare, at minimum: Muse — open library, search library, apply filter, open
     item detail, start playback, pause/resume playback, seek, select track, resume from position;
     Harmony — open run, watch run, open PR/review state, open spec, open spec item, create spec
     draft from a chat range, revise draft, ingest reviewed draft; Shell/bus — inspect bus, clear
     bus (topic and whole), toggle topic opt-out, export bus.
  5. Actions that are **deliberately** not assistant-invocable must be declared as such with a
     written reason (e.g. an action requiring in-person confirmation). An undeclared exception is
     a failure; a declared one is a reviewable decision. There is no silent third state.
  6. The gate runs in CI as a blocking job and is reproducible locally. Leg 2 and leg 3 require
     the door; when the door is unreachable, the job **fails closed** with a clear reason —
     absence of a tool surface is never read as parity.
  7. Every declared action's control is also capability-gated: the gate additionally asserts each
     action's declared `capability` matches a real module descriptor capability, so an action
     cannot be reachable on a surface that should be inert.

  ## TEST PLAN
  - The parity gate passes on the clean tree with all three legs green
  - Unit: the manifest covers every action enumerated in the contract, with no duplicates
  - Unit: declared exceptions each carry a written reason
  - Unit: each action's declared capability resolves to a real module descriptor capability
  - `node client/scripts/assert-action-parity.mjs` runs in CI as a blocking job
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute user paths in
    new/modified files
  - Negative (**the point of the item**): add a new UI button that mutates module state without a
    `declareAction` declaration; confirm leg 1 FAILS the build; revert
  - Negative: point a declared action at a non-existent tool name; confirm leg 2 FAILS; revert
  - Negative: widen a declared action's params beyond its tool's schema; confirm leg 3 FAILS; revert
  - Negative: with the door unreachable, confirm the gate FAILS CLOSED rather than passing

  ## EDGE CASES
  - A control rendered by a shared primitive rather than a module file — the sweep must follow
    the declaration, not the file location, so shared components are not a parity blind spot
  - An action that is genuinely presentation-only today and mutating tomorrow — the exclusion list
    is reviewed as part of any change to that control
  - A tool renamed backend-side — leg 2 catches it at build time, which is exactly the intent
  - Dynamically-constructed action ids — forbidden by the contract; ids must be static literals so
    the sweep can see them
  - A module surface added in a later sprint (desktop, mobile) reusing these actions — the
    manifest is shared, so parity extends without duplication

- **Acceptance criteria:**
  - [ ] The action manifest declares every user-facing module action across Muse, Harmony, and the
        bus surfaces, with an explicit, reasoned exclusion list
  - [ ] Leg 1 fails the build on a UI action with no declaration
  - [ ] Leg 2 fails the build on a declaration naming a non-existent tool
  - [ ] Leg 3 fails the build on a param shape the named tool cannot accept
  - [ ] The gate fails closed when the tool surface cannot be enumerated
  - [ ] Every declared action's capability resolves to a real module descriptor capability
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README and `docs/ASSISTANT-PARITY.md` document how to add an action correctly

---

### APTR-60: Cross-module scenarios as tested behaviours — the three the epic promised
- **Priority:** Critical
- **Labels:** aperture, modules, context-bus, assistant, behavior, testing
- **Agent:** claude
- **Estimate:** 7h
- **Blocked by:** APTR-54, APTR-58, APTR-59
- **Description:** The epic justified a shell layer on the claim that at least three modules
  visibly benefit from shared context. This item turns that claim into **executable behaviours
  with tests that fail when the benefit stops being real** — because a gate justified by
  scenarios and then never tested is a gate justified by hope.

  Three scenarios, each end-to-end across a module boundary, each named in the epic:
  **"what was I watching"** (Muse × assistant), **"turn this into a spec"** (Harmony × assistant),
  and **"what did I change last week"** (Atlas KG × assistant).

  ## FILES
  - `tests/behaviors/cross-module.md` — the three scenarios written as behaviour contracts:
    given / when / then, with explicit non-goals and explicit failure expectations
  - `tests/behaviors/what-was-i-watching.test.ts`
  - `tests/behaviors/turn-this-into-a-spec.test.ts`
  - `tests/behaviors/what-did-i-change.test.ts`
  - `tests/behaviors/harness.ts` — the shared harness: a seeded session, a controllable bus, and
    a door stub that fails the test on any request path that is not the sanctioned one
  - `docs/CROSS-MODULE.md` — user-facing description of what the shell can answer across modules

  ## APPROACH
  1. **Scenario 1 — "what was I watching."** Given playback occurred and `muse.playback` was
     published and written through (APTR-53/54), when the user asks the assistant, then the
     assistant names the item and the position **from retained bus and module state**, and offers
     the resume action **through its declared tool** (APTR-59), not through a UI-only path.
     Negative leg: with `muse.playback` opted out, the assistant must answer that it does not have
     that context — it must **not** recover the answer from a side channel. A test that passes
     under opt-out is a test that proves the privacy control is fake.
  2. **Scenario 2 — "turn this into a spec."** Given a conversation range, when the user asks the
     assistant to turn it into a spec, then a draft is produced (APTR-57), review is required, and
     on confirmation the ingest creates tracked items through the single door with full provenance
     (APTR-58). Negative leg: the scenario must FAIL if any created item lacks provenance, and
     must FAIL if the ingest path is exercised without an explicit review step.
  3. **Scenario 3 — "what did I change last week."** Given repository activity, when the user
     asks, then the assistant answers by querying the Atlas knowledge graph through the door
     (`kg_query` / `kg_search` / `kg_neighbors`) combined with build-run state from the Harmony
     surface, and cites what it drew on. Negative leg: with the KG capability unavailable, the
     assistant states that plainly and does not fabricate a change list — a confidently invented
     answer must FAIL this test.
  4. **The harness is adversarial about the single door.** Its stub fails the test on any outbound
     request that is not a `terminus-client`-mediated call: a direct forge call, a tracker REST
     call, a media service call, or any external origin. Every scenario therefore doubles as a
     single-door regression test.
  5. **Voice, not template (Soul Contract clause 1).** Each scenario asserts the answer was
     generated through the persona assembler and addressed by named proxy. A scenario that passes
     against a hardcoded string response must fail — assert on the generation path, not on exact
     prose, so the tests are not brittle against the assistant's actual voice.
  6. **Presence budget (Soul Contract clause 2).** Assert that none of these scenarios creates a
     notification, a badge, or a tray entry. Cross-module context informs the assistant's existing
     prioritized presence; it does not mint a second channel.
  7. **Continuity (Soul Contract clause 4).** Assert that running all three scenarios leaves
     memory, traits, and lore unchanged.
  8. These behaviours are the input to Sprint G's behavior-contract and e2e work; write them so
     Sprint G extends them rather than replacing them.

  ## TEST PLAN
  - All three scenario tests pass end-to-end against the harness
  - Each scenario asserts its answer came through the persona assembler via a named proxy — grep
    additionally confirms zero model ids, engine names, or backend tags in scenario code
  - The harness fails a scenario on any non-sanctioned outbound request (proven by a deliberate
    stub violation in a harness self-test)
  - Assert no notification, badge, or tray entry is produced by any scenario
  - Assert memory, traits, and lore are unchanged after all three scenarios run
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute user paths in
    new/modified files
  - Negative: with `muse.playback` opted out, scenario 1 must answer "no context" — recovering the
    answer anyway FAILS
  - Negative: scenario 2 must FAIL if any ingested item lacks provenance or if review was skipped
  - Negative: with the KG capability unavailable, scenario 3 must decline rather than fabricate —
    a plausible invented change list FAILS

  ## EDGE CASES
  - Flakiness from timing-dependent bus fan-out — the harness drives the bus deterministically
    rather than sleeping; no scenario may depend on a wall-clock wait
  - A scenario passing for the wrong reason (the assistant guessing correctly without the bus) —
    seed a value the assistant could not know without the bus, so the test measures the bus
  - A module capability flapping mid-scenario — the harness pins capability state per scenario and
    has a separate case for the flap
  - Scenario 3's KG being stale rather than unavailable — the assistant must caveat freshness
    rather than presenting stale data as current
  - Over-fitting to prose — assert on structure, cited sources, and the generation path, never on
    exact sentences

- **Acceptance criteria:**
  - [ ] All three named scenarios exist as executable behaviour tests with written contracts
  - [ ] Each scenario asserts the answer came through the persona assembler via a named proxy
  - [ ] The harness fails any scenario that makes a non-sanctioned outbound request
  - [ ] Opt-out, missing-provenance, skipped-review, and unavailable-KG negative legs all fail as
        specified — no scenario can pass by routing around a privacy or pipeline control
  - [ ] No notification, badge, or tray entry is produced by any scenario
  - [ ] Memory, traits, and lore are unchanged after all scenarios run
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README and `docs/CROSS-MODULE.md` document what the shell can answer across modules
