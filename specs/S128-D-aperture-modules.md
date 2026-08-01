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
- **Estimated total:** 141h across 22 items — 20 in this repo, plus APTR-52 and APTR-160, which
  land in the media module's own repository as prerequisite PRs. This figure is the exact sum of
  the per-item estimates below and was re-derived after the Fable review re-scoped playback
  (D4), the parity gate (D8), and the ingest ledger. A header that disagrees with the sum is a
  defect, not a rounding choice.
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
  carries the assistant's own state changes as first-class topics rather than burying them, **and
  APTR-164 renders them on an actual surface.** The review was right that a topic definition with
  no consumer is not compliance; clause 3 is satisfied by the recall/becoming panel, not by the
  `memory.recall` entry in the topic registry.
  Clause 4 (continuity survives every swap) — no item here resets memory, traits, or lore;
  the bus is additive context, and APTR-50's clear operation is explicitly scoped to bus
  contents only, with a negative test asserting Engram memory is untouched.
- **Context:** After Sprint C, Aperture is an excellent chat client. That is not the point of
  Aperture. This sprint is the transition from *chat app* to *shell*: a typed publish/consume
  context bus over the SSE `context` channel and `POST /v1/aperture/events`, plus the two live
  module surfaces embedded into the shell as first-class citizens of that bus.

  The Muse surface is real media, not a link-out: browse, search, detail with metadata and
  artwork, and genuine in-shell playback — **for content that can be remuxed to fragmented MP4
  without transcoding** — with a resume position that the assistant can read. Playback is
  deliberately narrower than it first looked (decision D4): Media Source Extensions accepts only
  fragmented MP4/WebM, so feeding a media element raw chunks of a stock MP4 or an MKV cannot work.
  Content requiring a full transcode is **explicitly deferred** to a later sprint and renders an
  honest "not playable in-client yet" state. Resume-position tracking is unaffected either way —
  it is fed by the bus and by other clients of the media module, not by Aperture's player.
  The Harmony surface is real build orchestration: runs, dispatch, PR/review state, and a spec
  browser. And the marquee capability — **spec-ingest-from-chat** — closes the loop the epic's
  Gate 2 argument was built on: select a range of a conversation, have the assistant draft a
  spec from it, review and edit that spec in the client, then ingest it through the ONE
  sanctioned Plane door so it becomes tracked work with recorded provenance.

  Every capability here already exists behind the kernel. This sprint does not build media
  scanning, metadata providers, dispatch, or ingest — it *surfaces* them, wires them to one
  another through the bus, and makes each of them assistant-operable.

## Pre-flight
- **Item numbers are IDENTIFIERS, NOT AN ORDERING.** Sprint D owns APTR-47..60; items added
  after the Fable review continue at **APTR-160..167**, because APTR-95..159 are being consumed
  concurrently by other sprints in this epic and reusing them would collide. A higher number does
  not mean later work, and no existing item is ever renumbered. **Required merge order is
  expressed only by `Blocked by`** — read the dependency edges, never the numeric sequence. In
  particular APTR-160 (remux capability) and APTR-163 (chat/shell publishers) are prerequisites
  for lower-numbered items.
- **Binding cross-sprint decisions** in `specs/S128-DECISIONS.md` take precedence over anything in
  this file. This sprint reflects **D3** (a stream is one connection; `thread_id` and message id
  demultiplex within it; context events share the per-session sequence space), **D4** (playback is
  re-scoped to remuxable content only), **D8** (a gate must be implementable in the language whose
  property it asserts), and **D12** (the header estimate equals the sum of the item estimates).
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
  `APERTURE_MEDIA_REMUX_SEGMENT_SECONDS`, `APERTURE_MEDIA_REMUX_MAX_CONCURRENT`,
  `APERTURE_CHAT_SELECTION_MAX_MESSAGES`, `APERTURE_CONTEXT_READ_AUDIT_RETENTION_EVENTS`,
  `APERTURE_INGEST_LEDGER_RETENTION_DAYS`, `APERTURE_SPEC_DRAFT_MAX_TRANSCRIPT_CHARS`.
  **No config value appears anywhere in this spec — names only.** Recommended defaults, including
  the playback idle timeout, live in `docs/CONFIGURATION.md` as recommendations, never as
  normative literals in a spec item.
- **Media byte-serving does not exist today.** The media module has no byte-serving route, and
  the sanctioned door carries a JSON request body with no arbitrary-header parameter and no
  caller-visible response status or headers — so HTTP range semantics cannot cross it. APTR-52
  adds a typed ranged-read capability in the media module's own repository as a prerequisite;
  it is a separate PR that merges before APTR-53's Aperture-side work.
- **Neither does remuxing, and playback needs it.** Media Source Extensions accepts fragmented
  MP4 and WebM only. A stock MP4 with a trailing `moov` atom, and any MKV, cannot be appended to a
  SourceBuffer — and no third-party demuxer may be vendored. Playback therefore additionally
  requires **APTR-160**, a remux-to-fragmented-MP4 capability in the media module's repository,
  merging before APTR-53. Per D4 this sprint attempts playback **only** for content remuxable
  without transcoding; a full transcode is out of scope and renders an honest unavailable state
  (APTR-161).
- **Transcode is NOT assumed to exist.** Unlike byte-serving, the media module's transcode
  capability was never established as live. No item in this sprint depends on it. Where a codec
  cannot be remuxed, the answer is the deferred-state surface in APTR-161, not an unverified
  transcode call.
- **Streams follow D3.** A stream is **one connection**; `thread_id` and message id demultiplex
  within it. Context-bus events share the per-session sequence space defined in
  `contracts/aperture-events-v1.md`. This sprint references that model and defines no parallel
  one — no second stream, no second sequence counter, no bus-specific resume semantics.
- Baseline tests: whatever Sprint C leaves green. Every item must leave them green.
- Baseline verify: the shell renders, streams, and gates modules; Muse and Harmony currently
  render as inert descriptors only.

---

### APTR-47: Context-bus contract v1 — topic taxonomy, payload schemas, retention, privacy
- **Priority:** Critical
- **Labels:** aperture, context-bus, contract, privacy
- **Agent:** claude
- **Estimate:** 7h
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
     `schema_version` (integer, per topic), `seq` (monotonic per session, **sharing the per-session
     stream sequence space defined by decision D3** so `Last-Event-ID` resume works unchanged),
     `ts` (RFC-3339),
     `origin` (`client` | `bff` | `module` | `assistant`), `subject` (opaque session-scoped id),
     `payload` (topic-schema'd), and `ttl_class`. Unknown envelope fields are **rejected**, not
     ignored — an open envelope is how a bus becomes a firehose.
  2. Enumerate the v1 topic registry. Each entry declares: id, direction (who may publish, who
     may consume), **the item that implements its publisher**, payload schema, retention class,
     privacy class, and whether it is opt-outable. A topic with no implementing publisher item is
     a contract defect — the registry's cross-check script (below) enforces this, because the
     original draft defined `chat.thread` and `chat.selection` with no publisher anywhere in the
     sprint and APTR-57 would have discovered the gap only at integration time.
     The v1 set is exactly:
     - `shell.focus` — which module surface and route the user is on (publisher: APTR-163)
     - `chat.thread` — active workspace + thread identity (opaque ids, never message content).
       **Publisher: APTR-163**, which retrofits `registerModuleTopics` onto the Sprint C chat and
       shell surfaces that predate this bus.
     - `chat.selection` — a user-selected transcript range (ids + range bounds, never raw text),
       bounded by `APERTURE_CHAT_SELECTION_MAX_MESSAGES` so a pathological selection cannot
       produce a bloated payload. Publisher: APTR-163 (mechanism) and APTR-57 (selection UI).
     - `muse.browse` — current library view: filter, sort, and selected item id
     - `muse.playback` — media item id, playback state, position, duration
     - `harmony.run` — build run id and status the user is watching
     - `harmony.spec` — spec id or draft id being viewed or edited
     - `memory.recall` — assistant-published pointer to what it recalled and why (consume-only
       for the UI; this is Soul Contract clause 3, "show the becoming", made legible, and its
       consumer is **APTR-164**, without which the clause-3 claim is unbacked)
     - `module.capability` — a module's capability state changed (drives the APTR-08 revalidate)
  3. Retention classes, and no others:
     - `ephemeral` — fan-out only, never stored.
     - `session` — bounded ring buffer, dies with the session. Bounds from
       `APERTURE_CONTEXT_RETENTION_EVENTS` and `APERTURE_CONTEXT_RETENTION_TTL_SECONDS`; the
       contract states the names, never the values.
     - `pinned` — **defined as a read-through projection of the owning module's own store, not as
       durable bus state.** This resolves the direct contradiction the review found: the bus is
       single-session by construction, so it cannot itself be the thing that survives session end
       and device change. What survives is the media module's watch state (authoritative per
       APTR-54); `pinned` means "on read, the BFF resolves this topic's current value from the
       owning module through `terminus-client` and projects it into the session's view." v1 allows
       exactly one pinned topic, `muse.playback`. This also dissolves the dual-source-of-truth
       tension between the ring buffer and the module store: there is one authority, and the bus
       is a view of it.
     - Consequence, stated normatively: a bus clear removes the session's bus contents and **does
       not** delete module-owned state; the privacy surface must say so (APTR-50).
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
     silently believing it has the current state). Fan-out rides the **single connection** of
     decision D3 — `thread_id` and message id demultiplex within it — and never a second stream.
     No cross-session delivery in v1 — the bus is single-user and single-session by construction,
     and multi-user fan-out is explicitly a future-version concern, not a v1 hole. The only state
     that crosses a session boundary is module-owned state projected through `pinned` (point 3),
     which is not bus delivery.
  6a. **Inspection scope is per-session, stated normatively.** `GET /v1/aperture/events` returns
     the *current session's* bus only. Two browsers signed in as the same user have two independent
     ring buffers, and neither can see the other's. The contract says this in the same breath as
     the inspection routes, and the privacy surface must render it (APTR-50) — an unqualified "see
     everything the bus holds" claim would be quietly false. Module-owned `pinned` state is
     inspected separately, through the owning module, and is labelled as such.
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
  - Every topic entry declares all seven required attributes (direction, implementing publisher
    item, schema, retention class, privacy class, opt-outable, schema_version)
  - The cross-check script FAILS on a topic whose declared publisher item does not exist in the
    sprint's item set — the mechanical form of "no topic without a publisher"
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
  - A reader concluding `pinned` means the bus is durable — the contract must state the
    read-through definition at the point of first use, not only in a footnote, because the
    original wording read as durable bus state and directly contradicted the single-session claim
  - Sequence-space collision with the stream sequence — share one space per session per D3
    rather than minting a parallel counter that resume logic would have to reconcile
  - A user with two sessions open assuming the panel shows both — the contract's per-session
    scoping (6a) is what the panel renders; a fleet-wide view is explicitly not a v1 capability
  - A future multi-device session where two clients publish `shell.focus` concurrently — v1
    documents last-writer-wins per `origin` and does not pretend to merge

- **Acceptance criteria:**
  - [ ] Topic registry enumerates exactly the v1 topics, each with direction, implementing
        publisher item, schema, retention class, privacy class, opt-outable flag, schema version —
        and the cross-check FAILS on a topic with no publisher item
  - [ ] Envelope is closed: unknown envelope fields are specified as rejected, unknown topics as
        ignored, and both are covered by schema examples
  - [ ] `pinned` is defined as read-through to the owning module's store, not durable bus state,
        with no remaining wording that contradicts the single-session claim
  - [ ] `seq` shares the per-session stream sequence space of D3 and the contract references the
        one-connection model rather than defining a parallel stream lifecycle
  - [ ] Inspection scope is stated as per-session, with module-owned state inspected separately
  - [ ] Sovereignty invariants written as testable sentences, and opt-out specified as enforced at
        publish server-side — not as client-side suppression
  - [ ] No literal hosts, ports, addresses, config values, org names, or personal identifiers in
        any contract file; all existing tests still pass
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
     without ever entering the buffer. `pinned` topics are **not durable bus state**: per the
     APTR-47 definition the BFF writes the value through to the owning module's store **via
     `terminus-client`** and resolves it back from there on read. The BFF opens no database, no
     file, and no second persistence path of its own, and the session buffer is a cache of the
     module's value, never a competing copy of it.
  5. Fan-out reuses the existing SSE broadcaster on the **single connection** of decision D3 and
     the shared per-session sequence space, demultiplexing by `thread_id` and message id. No
     second stream, no second socket, no bus-specific resume path, no polling fallback that hits a
     service URL directly.
  6. `GET /v1/aperture/events` returns exactly what **the current session** retains, with its
     retention class and age, plus an explicit `scope: session` marker so the privacy surface in
     APTR-50 can render truth — including the truth that another session's bus is not visible here
     — rather than a plausible summary. `pinned` entries are marked as module-owned projections.
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
  - [ ] Retention classes honored, with bounds and TTL from named config keys and no literal
        values; `pinned` resolves through the owning module and is marked as a projection
  - [ ] Fan-out reuses the single D3 connection and its per-session sequence space; no second
        stream, no bus-specific resume path, no polling fallback
  - [ ] Inspection responses are session-scoped and say so explicitly
  - [ ] All backend access through `terminus-client`; zero direct service HTTP clients
  - [ ] Kernel unreachable degrades to session-only retention with a reason, never a crash
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass

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
  4. Consume rides the existing SSE consumer's `context` events on the **single connection** of
     decision D3, demultiplexing by `thread_id` and message id; the runtime opens no connection of
     its own and implements no second resume protocol. On a `seq` gap it requests a snapshot via
     `GET /v1/aperture/events` rather than assuming continuity — a consumer that silently believes
     stale state is worse than one that refetches. A `resync` instruction from the server (aged-out
     replay position, per D3) is honored as a REST refetch, not as a reconnect loop.
  5. Publishes are coalesced client-side: high-frequency topics (`muse.playback` position,
     `shell.focus` during navigation) are debounced and deduplicated so the bus carries state
     changes, not a mouse-move log. Coalescing never drops a *terminal* event (playback stopped,
     surface unmounted) — those flush immediately.
  6. `registration.ts` exports a `registerModuleTopics(moduleId, { publishes, consumes })` call.
     It is consumed not only by this sprint's new module surfaces but by **APTR-163**, which
     retrofits it onto the pre-existing Sprint C chat and shell surfaces so `chat.thread`,
     `chat.selection`, and `shell.focus` have a real publisher rather than a contract entry.
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

  **"All of it" is scoped honestly, per APTR-47 §6a.** Inspection is **per-session**: this panel
  shows the current session's bus. Another signed-in session has its own ring buffer and is not
  visible here, and module-owned `pinned` state is a projection of the owning module's store, not
  bus state. The panel says both of those in plain language on the surface itself. An unqualified
  "see all of it" claim would be quietly false, and a privacy surface that overstates its own
  coverage is worse than one that admits its edges.

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
     affordance shows the actual retained envelopes. Each entry is labelled with its scope:
     session-retained, or a module-owned projection (`pinned`). The panel header states that
     inspection covers this session only and points at where module-owned state is managed.
     Where APTR-167's read-audit is present, each topic additionally shows when the assistant last
     read it; the panel degrades gracefully if that data is absent rather than asserting "never
     read".
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
  - Unit: every registered topic appears in the panel with description, retention class, count,
    and an explicit scope label (session-retained vs module-owned projection)
  - Unit: the panel states that inspection is per-session; a rendering that claims fleet-wide or
    all-session coverage FAILS this test
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
  - [ ] Every topic is listed with a plain-language description, retention class, count, and age,
        and raw retained envelopes are viewable rather than only a summary
  - [ ] Inspection scope is stated honestly on the surface: per-session bus contents, with
        module-owned `pinned` state labelled as a projection managed by its owning module
  - [ ] Clear works at both topic and whole-bus scope and reports what it removed
  - [ ] Export is local-only with zero network requests, proven by a negative test
  - [ ] Opt-out reflects server state on read-back; optimistic-only state is a test failure
  - [ ] Clearing the bus provably does not touch memory, traits, lore, or thread history
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
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
     playback capability is `available` **and APTR-161 classifies the item as playable via remux**;
     otherwise the affordance is present but inert with a reason — including the D4 deferred
     reason, "not playable in this client yet" — so the user learns *why* rather than finding a
     missing button or a broken player. Empty-but-healthy library states are APTR-165's.
  7a. Artwork rides the BFF media path and inherits its response-header discipline (APTR-53 §1a):
     `nosniff`, an authoritative non-sniffed `Content-Type`, and raster formats only — a
     script-bearing SVG must be refused or transcoded, never served inline.
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
  - Negative: a script-bearing SVG offered as artwork is refused or rasterized — serving it inline
    FAILS this test
  - Negative: for an item classified as needing a transcode, the playback affordance renders inert
    with the deferred reason and mounting a player FAILS the test

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
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README updated to document the Muse surface and the deferred provenance display

---

### APTR-52: Media module — ticket-bound ranged-read capability (prerequisite for playback)
- **Priority:** Critical
- **Labels:** muse, media, capability, security, rust, prerequisite
- **Agent:** claude
- **Estimate:** 7h
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
  3. **Ownership of minting and verification is settled here, in one place.** The review found it
     split ambiguously across two repositories with no mechanism connecting them, so:
     - **The media module owns mint, verify, and revoke.** All three are implemented by this item.
       The BFF never mints a ticket itself, never signs one, and holds no ticket-signing key.
     - The BFF **requests** a mint through the sanctioned door, presenting `{ item_id,
       session_epoch }`. The media module has no concept of an Aperture session and must not grow
       one; `session_epoch` is an **opaque, monotonically increasing integer** the BFF derives from
       its own session record. The media module stores it on the ticket and compares it — it never
       interprets it, never resolves it to a user, and never calls back into Aperture.
     - **Revocation mechanism, stated explicitly:** ending or revoking an Aperture session bumps
       that session's epoch, and the BFF calls a door operation to raise the media module's
       recorded floor for that opaque session key. Any ticket carrying an epoch **below** the floor
       is refused on its next verify, ahead of its TTL. This is what "session-bound" means; it is
       one direction of data flow, one door, and no shared secret between the repositories.
     - Verification is fail-closed on an **unknown or absent** epoch floor: refuse, never default
       to honoring the ticket.
  3a. Tickets are short-lived and travel in the **request body only, never a query parameter or a
     URL path segment**, so a live capability token cannot land in an access log, browser history,
     or a referrer-adjacent surface. A grep-based negative test asserts this on both sides.
  3b. Outstanding tickets are **bounded per session key** — minting past the bound revokes the
     oldest rather than growing without limit, so the mint path cannot be used to accumulate
     thousands of live tokens.
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
  - Unit: mint, verify, and revoke are all implemented in this module; a grep asserts the BFF-side
    code contains no ticket construction and no ticket-signing key read
  - Negative: after the session epoch floor is raised, an outstanding, unexpired ticket carrying
    the older epoch is REFUSED on its next verify — this is the revocation mechanism, and honoring
    it to TTL is a security failure
  - Negative: a ticket presenting an epoch for which no floor is recorded is REFUSED (fail-closed),
    not honored by default
  - Negative: a ticket supplied as a query parameter or path segment rather than in the request
    body is REFUSED, and a grep test FAILS the build if either side constructs such a URL
  - Negative: minting past the per-session outstanding-ticket bound revokes the oldest ticket
    rather than growing the live set without limit
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
  - [ ] Mint, verify, and revoke all live in this module; the BFF requests a mint through the door
        with an opaque `session_epoch` and never constructs or signs a ticket
  - [ ] Revocation works by raising the recorded epoch floor: a ticket below the floor is refused
        ahead of TTL, and an unknown floor fails closed
  - [ ] Tickets travel in the request body only — never a query parameter or path segment — and
        outstanding tickets are bounded per session key
  - [ ] No file path, storage location, mount point, or credential is caller-visible anywhere
  - [ ] Chunk and length bounds come from named config; secrets via the secret manager; no
        hardcoded infrastructure values in new/modified code; all existing tests still pass

---

### APTR-53: Muse playback — in-shell playback of remuxable content, honest about the rest
- **Priority:** High
- **Labels:** aperture, muse, playback, modules, web, security
- **Agent:** claude
- **Estimate:** 8h
- **Blocked by:** APTR-51, APTR-52, APTR-160, APTR-161
- **Description:** Play media inside Aperture. This is a real capability with a real player — a
  button that opens another application would defeat the entire point of the shell, and would
  make "what was I watching" unanswerable. The player is a first-class surface with transport
  controls, seeking, track selection within the scope APTR-161 defines, and a compact persistent
  mode that survives navigation within the shell.

  **Scope, per decision D4 — read this before the file list.** The original draft assumed a media
  element could be fed raw chunks of a library file. It cannot. Media Source Extensions accepts
  **fragmented MP4 and WebM only**; a stock MP4 carries its `moov` atom at the end and an MKV is a
  different container entirely, and neither can be appended to a `SourceBuffer`. Vendoring a
  third-party demuxer is forbidden by the epic. So:
  - This item plays content the media module can deliver as **fragmented MP4 via the remux
    capability of APTR-160** — a container rewrite of already-compatible codecs, no re-encoding.
  - Content whose **codecs** are not natively playable requires a full transcode. That is
    **explicitly deferred out of this sprint.** APTR-161 classifies it and renders an honest "not
    playable in this client yet" state with the reason. A deferred item never reaches this player,
    and this player never renders a black rectangle, an infinite spinner, or a dead element.
  - The remux path is **APTR-160's** item and estimate, deliberately not folded into this one, so
    the sprint cannot again hide its hardest problem inside a player estimate.
  - **Resume-position tracking (APTR-54) is independent of all of this.** It is fed by the bus and
    by other clients of the media module, so "what was I watching" keeps working for an item this
    client cannot itself play. APTR-54 is not blocked on playback.

  Playback consumes the **typed ranged-read capability** landed by APTR-52 —
  `{ item_id, ticket, offset, length }` in, a bounded chunk stream out — reading the fragmented
  output APTR-160 produces. There are no HTTP range semantics anywhere in this path: no `Range`
  request header, no `206`, no `Content-Range`, and no extension of the door's header surface.
  Seeking is not a header; it is a new ranged read at a new offset, aligned to a fragment boundary
  the remux capability reports. That is a constraint the client is built around from the start,
  not a degraded fallback.

  ## FILES
  - `client/src/modules/muse/PlayerSurface.tsx` — the full player surface
  - `client/src/modules/muse/MiniPlayer.tsx` — the compact persistent player
  - `client/src/modules/muse/playbackEngine.ts` — media element and `MediaSource` lifecycle,
    `SourceBuffer` append scheduling, error mapping
  - `client/src/modules/muse/rangedReader.ts` — offset-driven read scheduling, cancellation, backpressure
  - `client/src/modules/muse/playbackEngine.test.ts`, `client/src/modules/muse/rangedReader.test.ts`,
    `client/src/modules/muse/PlayerSurface.test.tsx`
  - `docs/PLAYBACK.md` — the support matrix: what plays via remux, what is deferred pending
    transcode, and every failure mode with its user-visible wording
  - **Agent-core repo (sibling PR):** a BFF playback route that **requests** a short-lived,
    single-item, session-bound stream ticket from the media module (APTR-52 owns minting; the BFF
    supplies the opaque `session_epoch` and holds no signing key) and issues ranged reads via
    `forward_stream_with_idle_timeout`; TTL and idle timeout from
    `APERTURE_MEDIA_STREAM_TICKET_TTL_SECONDS` and `APERTURE_MEDIA_READ_IDLE_TIMEOUT_SECONDS`

  ## APPROACH
  1. **Security first.** The client never receives a library file path, a storage location, or a
     backend credential. It receives an opaque, short-lived, single-item, session-bound ticket —
     **minted by the media module (APTR-52) at the BFF's request, never by the BFF itself** — and
     requests bounded chunks from a same-origin BFF path. The ticket travels in the request body
     only, never a query parameter or path segment. A ticket is not reusable for another item, is
     refused once its session's epoch floor is raised (the revocation mechanism defined in
     APTR-52), and expires on its configured TTL. Every bound is re-validated server-side by
     APTR-52 — the client's correctness is convenience, not the security boundary.
  1a. **Response-header discipline on the BFF media path.** The BFF serves attacker-influenceable
     file bytes from the app's own origin, which makes header sloppiness a same-origin XSS vector.
     Every media and artwork response carries `X-Content-Type-Options: nosniff`, an authoritative
     `Content-Type` taken from APTR-52's typed header frame and **never sniffed from content**,
     and `Content-Disposition: attachment` for anything that is not being fed to a media element.
     Negative test: a file whose bytes are HTML, fetched through the media path, must never be
     renderable as a document.
  2. **Ranged reads, not byte-range HTTP.** `rangedReader.ts` maintains a read cursor and feeds
     the `SourceBuffer` from bounded chunks of the **fragmented** stream APTR-160 produces. A seek
     **cancels the in-flight read and starts a new one at the fragment-aligned offset** reported by
     the remux capability's fragment index — reads are never interleaved, because two concurrent
     readers feeding one buffer is a corruption bug, not a performance win. Appending at an
     arbitrary byte offset is not valid MSE input and the reader must not attempt it. Read-ahead
     depth is bounded so a fast link cannot pull an entire film into memory.
  3. **The BFF uses `forward_stream_with_idle_timeout`, not `forward_stream`.** Playback is a
     fundamentally different workload shape from an agentic turn: chunks either arrive
     continuously or the read is dead, so an agent-sized idle tolerance would leave a stalled
     player hanging for minutes with no signal. The timeout is read from
     `APERTURE_MEDIA_READ_IDLE_TIMEOUT_SECONDS`. **This spec states no value for it** — a
     playback-appropriate recommended default, and the reasoning for it, belong in
     `docs/CONFIGURATION.md`. A normative literal in a spec item that also claims the value comes
     from config is a contradiction, and the pre-flight says names only.
  4. The player is a standard media element driven by `playbackEngine.ts` over `MediaSource` — no
     third-party player library, demuxer, or remuxer is vendored. Ideas from prior art may be
     cited; code may not be copied. The remuxing itself happens backend-side in APTR-160,
     which is precisely why no client-side demuxer is needed.
  5. **Playability is decided before the player mounts, by APTR-161's classifier, never by the
     player discovering failure.** Given a `playable-via-remux` classification the player mounts
     and plays. Given `deferred-needs-transcode` or `unsupported`, the player **does not mount at
     all**: the detail surface renders APTR-161's honest unavailable state instead. There is no
     probe-then-fail path, no transcode request (this sprint assumes no transcode capability), and
     no silent black rectangle — which is the failure mode this item exists to prevent.
  6. Track selection UI is presented by APTR-161, which also owns what the backend can actually
     deliver; this item consumes that selection and applies it to the media element.
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
  - Unit: a seek issues a new ranged read at the fragment-aligned offset and does not restart from
    zero; an unaligned append is never attempted
  - Unit: read-ahead depth is bounded; a fast link does not buffer the whole item into memory
  - Unit: given a `deferred-needs-transcode` or `unsupported` classification, the player **does not
    mount** and APTR-161's stated-reason surface renders instead
  - Unit: the BFF media response carries `nosniff` and an authoritative non-sniffed `Content-Type`
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
  - Negative: after the session epoch floor is raised, an outstanding ticket must be REJECTED, not
    honored to TTL
  - Negative: feed the engine a **non-fragmented** MP4 fixture; the engine must refuse before
    mounting and surface the deferred state — an attempt to append it to a `SourceBuffer` FAILS
    this test, since that is exactly the assumption the review found broken
  - Negative: a file whose bytes are HTML, fetched through the BFF media path, must not be
    renderable as a document — a response lacking `nosniff` or with a sniffed content type FAILS
  - Negative: grep asserts the ticket never appears in a URL, query string, or path segment

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
  - Seeking into a not-yet-remuxed region of an item still being fragmented — clamp to what
    APTR-160 reports as available and explain, rather than appending a gap
  - An item reclassified mid-session (a remux completing, or a codec probe correcting itself) —
    the surface re-evaluates on the `module.capability` bus event rather than requiring a reload
  - An item that is deferred rather than playable — the MiniPlayer must not appear for it at all;
    a persistent player chrome around content that cannot play is worse than no chrome
  - Two tabs playing the same item — both are valid; `muse.playback` last-writer-wins per the
    contract and the privacy panel shows why the position moved
  - The user opting out of `muse.playback` — playback still works fully; only the bus publication
    stops, and resume (APTR-54) degrades with a stated reason
  - Very long items where position coalescing could lose the final position — the terminal
    pause/stop event flushes immediately

- **Acceptance criteria:**
  - [ ] Content classified `playable-via-remux` plays in-shell with working transport, driven by
        typed ranged reads (`{item_id, ticket, offset, length}`) over fragmented MP4 — never an
        HTTP `Range` header, never a `206`, never a raw non-fragmented container
  - [ ] Content requiring a full transcode **never mounts a player** and renders APTR-161's stated
        deferred surface instead; no probe-then-fail path and no transcode call exist in this item
  - [ ] Seeking issues a new fragment-aligned ranged read and cancels the in-flight one; reads
        never interleave
  - [ ] The BFF uses `forward_stream_with_idle_timeout` with the timeout read from named config;
        **no timeout value appears in this spec**
  - [ ] Client receives only an opaque short-lived single-item session-bound ticket, minted by the
        media module and carried in the request body — never a path, location, credential, or URL
  - [ ] BFF media responses set `nosniff` and an authoritative non-sniffed `Content-Type`; HTML
        bytes served through the media path are not renderable as a document
  - [ ] No third-party player, demuxer, or remuxer source vendored; no hardcoded infrastructure
        values in new/modified code; all existing tests still pass
  - [ ] README and `docs/PLAYBACK.md` document the support matrix, the deferred class, and the
        failure modes

---

### APTR-54: Resume position — durable playback state on the bus, assistant-readable
- **Priority:** High
- **Labels:** aperture, muse, context-bus, modules
- **Agent:** claude
- **Estimate:** 5h
- **Blocked by:** APTR-51, APTR-49
- **Description:** Make "resume where I left off" real, and make it the worked example of the
  `pinned` retention class from APTR-47. Playback position survives reload, session end, and
  device change, and — because it is projected onto the bus — the assistant can answer "what was I
  watching" without being told, which is the concrete Muse × assistant win the epic's Gate 2
  argument named.

  **This item is deliberately NOT blocked on playback (decision D4).** Position state is fed by the
  bus and by other clients of the media module, so "what was I watching" must work for an item
  Aperture cannot itself play — which, after the D4 re-scope, is a whole class of the library. A
  resume feature gated on the client's own player would have silently shrunk to the remuxable
  subset. It reads and writes the media module's watch state, and the player (APTR-53) is one
  publisher among several, not a prerequisite.

  Note on `pinned`: per the corrected APTR-47 definition, `pinned` is a **read-through projection
  of the media module's store**, not durable bus state. That is what makes surviving session end
  and device change consistent with the bus being single-session — the survival lives in the
  module, and the bus shows it.

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
  - Integration: the assistant, reading only projected bus state, can name the most recent item
    and its position
  - Integration: with the in-client player disabled entirely, a position written by another client
    still resolves, renders, and is assistant-readable — resume must not depend on APTR-53
  - Verify no hardcoded IPs, hostnames, org names, ports, or absolute user paths in
    new/modified files
  - Negative: with `muse.playback` opted out, assert no position is published, none is written
    through, and **no local fallback cache is written** — a client-side stash must FAIL this test
  - Negative: a position conflict where the module's store is newer than the bus must resolve to
    the module's store, not the bus

  ## EDGE CASES
  - An item Aperture cannot play in-client (deferred per D4) that has a position recorded by
    another client — resume state still renders and the assistant can still answer about it; the
    resume *action* states that playback is not available in this client yet
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
  - [ ] The assistant can answer "what was I watching" from projected bus state alone, **including
        for an item this client cannot play**, with no dependency on APTR-53 having run
  - [ ] Opt-out fully suppresses publication and write-through with no local fallback cache
  - [ ] Bus clear does not delete the media module's own watch state, and the UI says so
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass

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
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
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
- **Blocked by:** APTR-49, APTR-56, APTR-163
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
     `chat.thread` so the selection surface knows its source thread. **`chat.thread` and the
     `chat.selection` publish mechanism are delivered by APTR-163**, which retrofits topic
     registration onto the Sprint C chat and shell surfaces. That is a hard dependency, declared
     here rather than discovered at integration time — the review correctly flagged that this item
     consumed topics nothing published.
  7a. The selection is bounded by `APERTURE_CHAT_SELECTION_MAX_MESSAGES` at the contract level in
     addition to the character limit, so a pathological range cannot bloat the bus payload.
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
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README updated to document spec-draft-from-chat

---

### APTR-58: Spec ingest through the one sanctioned door — reviewed draft becomes tracked work
- **Priority:** Critical
- **Labels:** aperture, harmony, marquee, pipeline, security
- **Agent:** claude
- **Estimate:** 8h
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
  5. **Idempotency, with a named state store.** The review was right that "retry creates no
     duplicates" and "an ingest that succeeded while the response was lost is detected" are
     untestable promises without durable server-side state. That state is specified here as an
     **ingest ledger, kernel-side, reached through `terminus-client`** — not a BFF-local map, not
     an in-memory table that dies with a restart, and not a second database the BFF opens.
     - Key: the idempotency key derived from the draft revision id (stable across retries).
     - Value: a ledger record created **before** any work item is created, holding the key, the
       draft revision, the target project and prefix, the planned item list, and a per-planned-item
       completion record (`pending` → `created` with the created item id, or `failed` with a
       reason).
     - Flow: consult the ledger first. No record ⇒ create the record, then create items, writing
       each completion as it lands. A complete record ⇒ return "already ingested" with the existing
       item ids and create nothing. An incomplete record ⇒ **resume from the first `pending`
       entry**, never from the top.
     - A lost response is therefore indistinguishable from a retry, which is the point: the next
       attempt with the same key reads the ledger and reports the true state.
     - Two concurrent ingests of the same revision serialize on the ledger record; the loser
       reports "already ingested" and links to the existing items rather than racing.
     - Ledger records are retained long enough to be useful for provenance and audit, bounded by a
       named config key, and carry no transcript content — only ids.
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
  - Unit: the ledger record is written **before** the first item is created; a crash between the
    two leaves a resumable record, not an orphaned creation
  - Integration: a retry with the same key reads the ledger, creates nothing additional, and
    returns the existing item ids
  - Integration: a partial failure leaves per-planned-item completion records; the next attempt
    resumes from the first `pending` entry and never re-creates a `created` one
  - Integration: an ingest that succeeds while the response is dropped is detected on the next
    attempt via the ledger and reported as already-ingested
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
  - Two clients ingesting the same draft revision concurrently — they serialize on the ledger
    record; the loser reports "already ingested" and links to the existing items
  - An ingest that succeeds while the response is lost — the next attempt with the same key reads
    the ledger's completion records and reports the existing items rather than duplicating them
  - The ledger itself unreachable — refuse the ingest with `capability-unavailable` and create
    nothing; ingesting without the ability to record what was created is how duplicates are born
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
  - [ ] Idempotency and resume are backed by a named durable store — a kernel-side ingest ledger
        reached through `terminus-client`, written before creation, with per-item completion
        records — so retry creates no duplicates and a partial failure resumes from `pending`
  - [ ] Plane tool unreachable ⇒ `capability-unavailable`, nothing created, no alternate route
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README and `docs/SPEC-INGEST.md` document the flow and its explicit refusals

---

### APTR-59: Assistant-operable parity gate — every UI action has a tool counterpart, mechanically
- **Priority:** Critical
- **Labels:** aperture, modules, assistant, contract, ci
- **Agent:** claude
- **Estimate:** 8h
- **Blocked by:** APTR-51, APTR-53, APTR-55, APTR-56, APTR-57, APTR-162
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
  - `client/src/modules/actions/parity.test.ts` — the gate (legs 2 and 3)
  - (`client/src/modules/actions/declareAction.ts` and the leg-1 enforcement are **APTR-162's**,
    which is why this item is blocked by it rather than defining them twice)
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
  3. **The gate has three legs, all mechanical — and per decision D8, each is implementable in
     the language whose property it asserts.** The original Leg 1 was specified as "a static sweep
     finds interactive controls that invoke a mutating or navigating handler," which is not
     buildable: statically classifying an arbitrary handler as mutating is undecidable, so the
     acceptance criterion "fails the build on a UI action with no declaration" could not have been
     met in general. Leg 1 is therefore **re-specified and moved to its own item, APTR-162**, which
     replaces the undecidable classification with an enforceable one: design-system action
     components accept their handler **only** as a `declareAction` reference (a typed constraint
     the compiler checks), an ESLint rule enforces that no raw handler is passed, and a runtime
     registry assertion in tests confirms every rendered action control resolves to a manifest
     entry. Same guarantee, actually buildable. This item owns legs 2 and 3 and consumes APTR-162's
     leg 1 result.
     - **Leg 1 — no undeclared UI actions.** Delivered by **APTR-162**. Its claim is narrowed to
       exactly what is checkable: *no design-system action component receives a handler that is not
       a `declareAction` reference*, plus *every action control rendered in the test suite resolves
       to a manifest entry*. It does not claim to detect a mutating handler on an arbitrary
       element, because nothing can.
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
     bus (topic and whole), toggle topic opt-out, export bus, open the recall/becoming panel.
  5. Actions that are **deliberately** not assistant-invocable, and whole action families
     **deliberately deferred**, must be declared as such with a written reason. An undeclared
     exception is a failure; a declared one is a reviewable decision. There is no silent third
     state. The declared deferral list is maintained in `docs/DEFERRALS.md` (APTR-166) and read by
     the gate, and it explicitly includes **Muse acquisition actions** (request, grab, retry,
     cancel) — the review was right that silence there reads as an oversight against the epic's
     own Gate 2 prose, and that this sprint's Muse surface is read-and-play by deliberate choice.
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
  - Unit: every entry on the declared deferral list carries a written reason, and the Muse
    acquisition family appears there explicitly
  - Negative (**the point of the item**): point a declared action at a non-existent tool name;
    confirm leg 2 FAILS the build; revert
  - Negative: widen a declared action's params beyond its tool's schema; confirm leg 3 FAILS; revert
  - Negative: with the door unreachable, confirm the gate FAILS CLOSED rather than passing

  ## EDGE CASES
  - A control rendered by a shared primitive rather than a module file — enforcement follows the
    declaration through the component's typed handler prop, not the file location, so shared
    components are not a parity blind spot
  - An action that is genuinely presentation-only today and mutating tomorrow — the exclusion list
    is reviewed as part of any change to that control
  - A tool renamed backend-side — leg 2 catches it at build time, which is exactly the intent
  - Dynamically-constructed action ids — forbidden by the contract; ids must be static literals so
    the sweep can see them
  - A module surface added in a later sprint (desktop, mobile) reusing these actions — the
    manifest is shared, so parity extends without duplication

- **Acceptance criteria:**
  - [ ] The action manifest declares every user-facing module action across Muse, Harmony, and the
        bus surfaces, with an explicit, reasoned exclusion list and a declared deferral list that
        names the Muse acquisition family
  - [ ] Leg 1's claim is narrowed to what APTR-162 can actually enforce, and this item asserts no
        undecidable property — no criterion here depends on statically classifying an arbitrary
        handler as mutating
  - [ ] Leg 2 fails the build on a declaration naming a non-existent tool
  - [ ] Leg 3 fails the build on a param shape the named tool cannot accept
  - [ ] The gate fails closed when the tool surface cannot be enumerated
  - [ ] Every declared action's capability resolves to a real module descriptor capability
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
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
     answer must FAIL this test. **Triage note, stated plainly so a failure lands in the right
     repository:** this scenario exercises kernel behaviour (the assistant's KG tools and build
     state) through an Aperture harness. **Aperture's own contribution here is the door-discipline
     assertion and the decline-rather-than-fabricate leg**; nothing else in this scenario is built
     by this sprint. A failure of the answer's *content* is a kernel issue, not an Aperture one,
     and the behaviour contract says so in writing.
  3a. **Scenario 1 is likewise scoped honestly after D4:** it asserts resume state and the declared
     tool path (APTR-54, APTR-59), **not** that the item plays in-client. An item in the deferred
     class must still produce a correct "what was I watching" answer, so the scenario seeds one.
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
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README and `docs/CROSS-MODULE.md` document what the shell can answer across modules

---

## Items added by the 2026-08-01 review revision (APTR-160..167)

> Reminder, repeated here because it is the easiest thing to get wrong: **these numbers are
> identifiers, not an ordering.** Sprint D owns APTR-47..60; APTR-95..159 are allocated to other
> sprints in this epic and are being consumed concurrently, so the additions continue at 160.
> Several of these are Critical and merge **before** lower-numbered items — APTR-160 before
> APTR-53, APTR-162 before APTR-59, APTR-163 before APTR-57. Order comes from `Blocked by`, never
> from the number, and no existing item was renumbered.

---

### APTR-160: Media module — remux to fragmented MP4, the prerequisite playback actually needs
- **Priority:** Critical
- **Labels:** muse, media, playback, capability, rust, prerequisite
- **Agent:** claude
- **Estimate:** 8h
- **Blocked by:** APTR-52
- **Description:** Playback in a browser means Media Source Extensions, and MSE accepts
  **fragmented MP4 or WebM only**. Real library content is neither: a stock MP4 keeps its `moov`
  atom at the end of the file, and MKV is a different container. Appending either to a
  `SourceBuffer` fails, and the epic forbids vendoring a third-party demuxer to work around it.
  Decision D4 therefore makes remuxing a first-class prerequisite with **its own item and its own
  estimate**, deliberately not folded into the player — the review found the sprint's hardest
  problem hidden inside one confident sentence in a 7h player item, and this is the correction.

  **Remux is a container rewrite, not a re-encode.** Compatible elementary streams are repackaged
  into fragmented MP4 with an initialization segment and fixed-duration fragments. Nothing is
  decoded, nothing is re-encoded, and content whose **codecs** are not natively playable is out of
  scope entirely — it is classified as deferred by APTR-161 and never enters this path.

  **This lands in the media module's own repository** as a separate PR that merges before
  APTR-53's Aperture-side work, carrying its own ingest, review, merge, and post-merge gate there.

  ## FILES
  - **Media module repo:** a `media_remux` capability — request/response types, compatibility
    probe, initialization-segment generation, fragment-index generation, and the fragmented output
    exposed for reading through the existing `media_read` capability from APTR-52
  - **Media module repo:** capability descriptor advertising `media_remux` with a per-item
    classification result, so Aperture can gate before it mounts a player, plus tests
  - **This repo:** `contracts/aperture-media-remux-v1.md` — the classification vocabulary, the
    fragment-index shape Aperture seeks against, and the explicit statement that transcoding is
    not part of this capability

  ## APPROACH
  1. **Classification first, work second.** A probe reports one of exactly three results for an
     item: `playable-via-remux` (compatible codecs, container rewrite only), `needs-transcode`
     (incompatible codecs — **refused by this capability**, deferred per D4), or `unsupported`
     (unreadable or unrecognized). The vocabulary is closed and lives in the contract, so client
     and module cannot drift into disagreeing about what "playable" means.
  2. A `needs-transcode` classification is a **terminal, honest answer**, not a fallback path into
     a transcode this sprint does not assume exists. The capability refuses; APTR-161 renders it.
  3. Output is fragmented MP4: one initialization segment plus fixed-duration fragments sized from
     `APERTURE_MEDIA_REMUX_SEGMENT_SECONDS`. A **fragment index** — fragment ordinal, byte offset,
     start time, duration — is returned so a seek maps to a fragment-aligned byte offset the
     APTR-52 ranged read can request. Seeking to an arbitrary byte offset is not valid MSE input,
     so the index is what makes seeking correct rather than approximate.
  4. Remuxed output is addressed through the **existing** `media_read` capability and the same
     ticket model. This item opens no second byte-serving route, no second authorization model,
     and no HTTP range semantics — every constraint APTR-52 established still holds.
  5. Concurrency is bounded by `APERTURE_MEDIA_REMUX_MAX_CONCURRENT` so remuxing cannot be used to
     exhaust the host. Work is cancellable, and an abandoned request releases its resources
     promptly rather than running to completion unwatched.
  6. No library file path, storage location, mount point, or backend credential appears in any
     response, error body, or caller-visible log line — the same redaction posture as APTR-52.
  7. Secrets via the secret manager, never `std::env::var` for anything token/key/secret-shaped.
     No new outbound network path is opened. No third-party remuxer source is vendored into
     Aperture; the module uses its own existing media tooling.

  ## TEST PLAN
  - Unit: a compatible-codec source classifies `playable-via-remux` and produces an initialization
    segment plus fragments that a `SourceBuffer` accepts
  - Unit: the fragment index maps a requested time to a fragment-aligned byte offset, and
    sequential fragment reads reconstruct a playable stream
  - Unit: remux is lossless at the elementary-stream level — no re-encode occurs (assert stream
    parameters are unchanged between source and output)
  - Unit: concurrency is bounded from named config; an abandoned request is cancelled and releases
    its resources
  - Verify no hardcoded IPs, hostnames, org names, ports, config values, or absolute user paths in
    new/modified files
  - Negative (**the D4 correction**): a non-fragmented MP4 and an MKV are each rejected as direct
    MSE input, and the capability produces fragmented output for them instead — a test asserting
    raw chunks are appendable FAILS, which is precisely the assumption the review broke
  - Negative: an incompatible-codec source classifies `needs-transcode` and the capability
    **REFUSES** rather than attempting a transcode or emitting a broken stream
  - Negative: assert no file path, storage location, mount point, or credential appears in any
    response, error body, or caller-visible log line

  ## EDGE CASES
  - An item with multiple audio tracks or embedded subtitles — remux carries what is compatible and
    reports the rest to APTR-161 rather than silently dropping tracks
  - A variable-frame-rate or malformed source whose timestamps are non-monotonic — refuse with a
    typed reason rather than emitting fragments a player will stall on
  - An item modified on disk mid-remux — terminate with a typed error; never emit a mixed-source
    stream that would decode as corruption
  - A very large item where remuxing the whole file up front would be wasteful — produce fragments
    progressively and report how far the index currently extends, so the player clamps its seeks
  - A remux requested concurrently for the same item by two sessions — deduplicate rather than
    doing the work twice

- **Acceptance criteria:**
  - [ ] `media_remux` classifies every item as exactly one of `playable-via-remux`,
        `needs-transcode`, or `unsupported`, from a closed contract vocabulary
  - [ ] `playable-via-remux` items produce fragmented MP4 (init segment plus fragments) that a
        `SourceBuffer` accepts, with a fragment index enabling fragment-aligned seeking
  - [ ] Remux performs no re-encode; `needs-transcode` is REFUSED, never silently transcoded
  - [ ] Output is served exclusively through the existing `media_read` capability and ticket model
        — no second byte route, no second authorization model, no HTTP range semantics
  - [ ] Concurrency bounded from named config; work is cancellable and releases resources
  - [ ] No file path, storage location, mount point, or credential is caller-visible anywhere
  - [ ] No third-party remuxer vendored into Aperture; secrets via the secret manager
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass

---

### APTR-161: Playability classification, the honest deferred state, and track delivery scope
- **Priority:** High
- **Labels:** aperture, muse, playback, modules, web
- **Agent:** codex
- **Estimate:** 6h
- **Blocked by:** APTR-51, APTR-160
- **Description:** The client-side half of decision D4: decide, **before any player mounts**,
  whether an item can play in this client, and render an honest state when it cannot. This is the
  item that guarantees the D4 promise — *never a broken player* — and it is separate from APTR-53
  precisely so the "we can't play this yet" path gets designed rather than becoming whatever the
  player does when it fails.

  It also settles subtitles, which the review correctly identified as the same class of hidden gap
  APTR-52 was written to close: track **selection** was specified while track **delivery** was not.
  External sidecar tracks ride the existing ranged read; embedded tracks require extraction
  backend-side. This sprint scopes subtitles to what APTR-160 can actually deliver — sidecar files
  and tracks the remux carries — and **explicitly defers** embedded-track extraction with a stated
  reason rather than implying support that does not exist.

  ## FILES
  - `client/src/modules/muse/playability.ts` — consumes APTR-160's classification and resolves it
    to a client-side decision: play, defer, or unsupported
  - `client/src/modules/muse/NotPlayableState.tsx` — the honest deferred/unsupported surface
  - `client/src/modules/muse/tracks.ts` — subtitle/audio track model, selection, and the delivery
    scope this sprint supports
  - `client/src/modules/muse/TrackSelector.tsx` — track selection UI over available tracks only
  - `client/src/modules/muse/playability.test.ts`, `client/src/modules/muse/tracks.test.ts`
  - `docs/PLAYBACK.md` — the support matrix (shared with APTR-53): what plays, what is deferred,
    what is unsupported, and the exact user-visible wording for each

  ## APPROACH
  1. Classification is **read from the backend** (APTR-160), never inferred from a filename,
     extension, or a client-side guess. The client owns presentation of the answer, not the answer.
  2. Three states, three distinct presentations, no fourth:
     - `playable-via-remux` — the playback affordance is live and APTR-53 mounts.
     - `needs-transcode` — **"not playable in this client yet"**, with the reason in plain language
       (the codec is not one browsers decode, and in-client transcoding is not available in this
       version), the item's metadata and artwork still fully rendered, and resume state still shown
       because APTR-54 is independent of playback. No player element is created.
     - `unsupported` — the item cannot be read or recognized; say that, and say what is known.
  3. **A deferred item is not a degraded item.** Browse, search, detail, artwork, resume state, and
     every assistant-facing capability continue to work for it. The only thing missing is the
     in-client player, and the surface says exactly that rather than implying the item is broken.
  4. Track delivery scope, stated rather than assumed: **sidecar subtitle files** are fetched
     through the same ranged-read path as media bytes and attached as text tracks; **tracks the
     remux carries through** are selectable; **embedded tracks requiring backend extraction are
     deferred**, listed as present-but-unavailable with a reason, not hidden. Hiding them would
     recreate exactly the gap this item exists to close.
  5. Subtitle content is untrusted input rendered as **text only** — parsed into cues, never
     injected as markup, and never permitted to introduce a link, a style, or a fetch.
  6. The deferred state is a declared, assistant-visible condition, not just pixels: the reason is
     available through the module's action/capability surface so the assistant can answer "why
     can't I play this" without screen-scraping.
  7. No transcode is requested anywhere in this item. This sprint does not assume that capability
     exists, and a UI that offers an action the backend cannot perform is worse than one that
     explains the limit.

  ## TEST PLAN
  - Unit: each of the three classifications renders its own distinct, stated presentation
  - Unit: a `needs-transcode` item still renders metadata, artwork, and resume state, and creates
    **no** media element
  - Unit: track selector lists sidecar and remux-carried tracks as selectable and embedded-only
    tracks as present-but-unavailable with a reason
  - Unit: a subtitle cue containing markup renders as literal text — no element, no link, no fetch
  - Unit: the deferred reason is exposed through the capability surface, not only in the DOM
  - Verify no hardcoded IPs, hostnames, org names, ports, config values, or absolute user paths in
    new/modified files
  - Negative (**the D4 guarantee**): for a `needs-transcode` item, assert no `<video>`/`<audio>`
    element and no `MediaSource` is created and no playback request is issued — a mounted-then-
    failed player FAILS this test
  - Negative: assert no transcode request is issued anywhere in this item's code paths
  - Negative: an embedded-only track must not be silently omitted from the track list — omitting it
    FAILS, because a hidden gap is the failure mode this item was written to prevent

  ## EDGE CASES
  - Classification unavailable because the media module is degraded — render "playability unknown"
    and offer no player, rather than optimistically mounting one
  - An item reclassified after a remux completes — the surface updates on the `module.capability`
    bus event without a reload
  - A sidecar subtitle file that is enormous or malformed — bound what is fetched and render a
    parse-warning state rather than freezing the tab
  - An item with no tracks at all — say so plainly instead of rendering an empty selector
  - A user who opts out of `muse.playback` — classification and the deferred state still render;
    only the bus publication stops

- **Acceptance criteria:**
  - [ ] Playability is read from the backend classification, never guessed client-side, and
        resolves to exactly one of play / deferred / unsupported
  - [ ] A `needs-transcode` item renders an honest "not playable in this client yet" state with a
        plain-language reason and creates no player element — never a broken or blank player
  - [ ] Deferred items retain full browse, detail, artwork, and resume behaviour
  - [ ] Track scope is explicit: sidecar and remux-carried tracks are selectable, embedded-only
        tracks are listed as unavailable with a reason and never silently hidden
  - [ ] Subtitle content renders as text only — no markup, link, style, or fetch
  - [ ] No transcode is requested anywhere; the deferred reason is assistant-visible
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README and `docs/PLAYBACK.md` document the support matrix and the deferred class

---

### APTR-162: Parity leg 1, made enforceable — declaration-bound action controls
- **Priority:** Critical
- **Labels:** aperture, modules, assistant, ci, contract
- **Agent:** claude
- **Estimate:** 6h
- **Blocked by:** APTR-49
- **Description:** Decision D8 says a mechanical gate must be implementable in the language whose
  property it asserts. The parity gate's leg 1 was specified as "a static sweep finds interactive
  controls that invoke a mutating or navigating handler without a `declareAction` reference" —
  which cannot be built, because statically classifying an arbitrary handler as mutating is
  undecidable. The acceptance criterion that depended on it was therefore untestable in general.

  This item replaces the undecidable check with an enforceable one that delivers the same
  practical guarantee: **make the declaration the only way to wire an action control at all.** If
  a design-system action component cannot accept a raw handler, there is nothing left to classify.

  ## FILES
  - `client/src/modules/actions/declareAction.ts` — the declaration helper and its branded
    `ActionRef` type; the single way an action is expressed
  - `client/src/modules/actions/registry.ts` — the runtime registry every `ActionRef` registers in
  - `client/src/design-system/actionable.ts` — the typed prop contract action-capable primitives
    (button, menu item, and the rest) must accept
  - `client/eslint-rules/require-declared-action.mjs` — the lint rule
  - `client/eslint-rules/require-declared-action.test.mjs` — rule tests, valid and invalid cases
  - `client/src/modules/actions/registryAssertion.test.tsx` — the runtime leg
  - `docs/ASSISTANT-PARITY.md` — the "how to add an action" section this item makes true

  ## APPROACH
  1. **Compiler-enforced shape.** `declareAction` returns a branded `ActionRef`. Action-capable
     design-system primitives accept `action: ActionRef` and **do not accept** a bare
     `onClick`/`onSelect` handler prop at all. A raw function is a type error, not a lint warning —
     the strongest available enforcement, and D8's preferred one.
  2. **ESLint rule for what types cannot see:** the rule flags an action-capable primitive rendered
     without an `action` prop, an `ActionRef` constructed inline rather than from the manifest, and
     any attempt to re-add a handler prop through a spread. The rule ships with its own valid and
     invalid test cases, because an unlint-tested lint rule is a suggestion.
  3. **Runtime registry assertion** closes the escape hatch of a hand-rolled element: rendering the
     full surface tree in tests, every registered action control must resolve to a manifest entry,
     and every manifest entry that claims a UI presence must have been rendered. This is a real
     analysis step over real renders, not a grep over source text.
  4. **The claim is narrowed to what is true.** Leg 1 asserts: *no action-capable primitive
     receives a handler that is not a declared `ActionRef`*, and *every rendered action control
     resolves to a manifest entry*. It does **not** claim to detect an arbitrary mutating handler
     on an arbitrary element, and the contract says so — an honest narrower gate beats a broad
     claim nothing enforces.
  5. Action ids are **static literals** by contract; a dynamically constructed id is a lint error,
     so the manifest is statically enumerable.
  6. The escape hatch that remains — someone hand-writing a raw `<button>` outside the design
     system — is addressed by the design-system adherence lint that already forbids raw elements in
     module surfaces, and this item states that dependency explicitly rather than pretending the
     three legs are airtight on their own.
  7. Runs in CI as a blocking job and is reproducible locally. It needs no network and no door, so
     unlike legs 2 and 3 it cannot be blocked by an unreachable backend.

  ## TEST PLAN
  - Unit: `tsc --noEmit` FAILS when a raw function is passed where an `ActionRef` is required
  - Unit: the lint rule's valid cases pass and its invalid cases each produce the expected error
  - Unit: the runtime registry assertion passes on the clean tree, with every rendered action
    control resolving to a manifest entry
  - Unit: a dynamically constructed action id is a lint error
  - Verify no hardcoded IPs, hostnames, org names, ports, config values, or absolute user paths in
    new/modified files
  - Negative (**the point of the item**): add an action-capable primitive with no `action` prop;
    confirm the lint rule FAILS the build; revert
  - Negative: render an action control whose `ActionRef` is absent from the manifest; confirm the
    runtime assertion FAILS; revert
  - Negative: attempt to smuggle a handler through a props spread; confirm the rule FAILS

  ## EDGE CASES
  - A conditionally-rendered action that never appears in the test tree — the manifest entry
    declares its surface, and an entry never rendered anywhere is reported rather than assumed fine
  - A shared primitive used by both a module surface and shell chrome — enforcement follows the
    typed prop, so location is irrelevant
  - A legacy Sprint C control predating this contract — inventoried and either migrated or added to
    the declared exclusion list with a reason; there is no silent grandfathering
  - A presentation-only control that later becomes mutating — the type change forces the
    declaration, which is exactly the intended pressure

- **Acceptance criteria:**
  - [ ] `declareAction` returns a branded `ActionRef`, and action-capable primitives accept it
        instead of a raw handler — passing a bare function is a **type error**
  - [ ] The ESLint rule flags missing `action` props, inline refs, spread-smuggled handlers, and
        dynamic action ids, and ships with its own valid/invalid rule tests
  - [ ] A runtime registry assertion confirms every rendered action control resolves to a manifest
        entry, and reports manifest entries never rendered
  - [ ] Leg 1's claim in the contract is narrowed to these two enforceable properties and makes no
        undecidable assertion about arbitrary handlers
  - [ ] The gate runs in CI as a blocking job, needs no network or door, and is reproducible locally
  - [ ] The remaining escape hatch and its mitigation are stated explicitly, not papered over
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] `docs/ASSISTANT-PARITY.md` documents how to add an action under the new constraint

---

### APTR-163: Chat and shell become bus publishers — `chat.thread`, `chat.selection`, `shell.focus`
- **Priority:** Critical
- **Labels:** aperture, context-bus, chat, shell, web, integration
- **Agent:** codex
- **Estimate:** 6h
- **Blocked by:** APTR-49
- **Description:** The review found a real hole: `chat.thread` and `chat.selection` are defined in
  the bus contract and **consumed** by APTR-57, but nothing in the sprint published them. The
  Sprint C chat and shell surfaces predate the bus runtime entirely, so retrofitting
  `registerModuleTopics` onto them is genuine integration work — and it was assigned to no item.
  Left as it was, APTR-57 would have discovered the gap at integration time, which is the most
  expensive possible moment.

  This item makes the shell and chat first-class bus citizens on the publish side, so every topic
  in the v1 registry has a real implementing publisher.

  ## FILES
  - `client/src/shell/busRegistration.ts` — shell-side `registerModuleTopics` and `shell.focus`
    publication on route and surface changes
  - `client/src/chat/busRegistration.ts` — chat-side registration and `chat.thread` publication
  - `client/src/chat/selectionSource.ts` — the `chat.selection` publish mechanism (ids and bounds
    only) that APTR-57's selection UI drives
  - `client/src/shell/busRegistration.test.ts`, `client/src/chat/busRegistration.test.ts`

  ## APPROACH
  1. **Retrofit, do not rewrite.** The Sprint C surfaces keep their existing structure; this adds a
     registration call and publication at the points where state already changes. No re-architecture
     of chat, no change to the thread model, no change to the SSE consumer.
  2. `shell.focus` publishes on route change and on module surface mount/unmount, debounced through
     APTR-49's coalescing, with the terminal (unmount) event flushed immediately.
  3. `chat.thread` publishes the active workspace and thread identity as **opaque ids only** — never
     a title, never a message, never a preview. The consumer re-fetches anything it needs through
     the normal authorized thread path.
  4. `chat.selection` publishes ids and range bounds only, bounded by
     `APERTURE_CHAT_SELECTION_MAX_MESSAGES`. Raw transcript text never crosses the bus; this is the
     mechanism, and APTR-57 supplies the UI that drives it.
  5. All three registrations declare their published topics through `registerModuleTopics`, so
     APTR-49's undeclared-publish assertion covers them exactly as it covers the module surfaces.
  6. **Multi-tab honesty.** Two tabs in one session both publish `shell.focus`; the contract's
     last-writer-wins per `origin` applies, and this item does not invent a merge. Publication stops
     when a tab is hidden, so a background tab does not fight a foreground one over focus state.
  7. Opt-out is respected exactly as everywhere else: the client renders the affordance honestly and
     the BFF is the enforcement point.

  ## TEST PLAN
  - Unit: a route change publishes `shell.focus`, debounced, with unmount flushing immediately
  - Unit: opening a thread publishes `chat.thread` with opaque ids only
  - Unit: a selection publishes `chat.selection` with ids and bounds within the configured bound
  - Unit: all three topics are declared via `registerModuleTopics` and pass APTR-49's
    undeclared-publish assertion
  - Unit: a hidden tab stops publishing `shell.focus`
  - Verify no hardcoded IPs, hostnames, org names, ports, config values, or absolute user paths in
    new/modified files
  - Negative: assert **no message text, title, or preview** appears in any `chat.thread` or
    `chat.selection` payload — a payload carrying content FAILS this test
  - Negative: a selection exceeding `APERTURE_CHAT_SELECTION_MAX_MESSAGES` is refused rather than
    published truncated
  - Negative: publishing any of these topics without declaring it FAILS the registration assertion

  ## EDGE CASES
  - A thread switched rapidly (keyboard navigation through a list) — coalesce so the bus carries the
    settled thread, not every intermediate one
  - Sign-out or session end mid-publish — publication stops and no event resurrects a dead session
  - A selection spanning a message deleted between selection and publish — publish the bounds and
    let the consumer discover the gap through the authorized path; do not silently reshape it
  - Two tabs where one is playing media and the other is browsing specs — both publish honestly;
    the privacy panel shows why focus state moved
  - A user opted out of `chat.thread` — APTR-57's drafting surface degrades with a stated reason
    rather than silently failing to find a source thread

- **Acceptance criteria:**
  - [ ] `shell.focus`, `chat.thread`, and `chat.selection` each have a real publisher, closing the
        gap where the contract defined topics nothing produced
  - [ ] The Sprint C chat and shell surfaces are retrofitted, not rewritten
  - [ ] Payloads carry opaque ids and bounds only — no message text, title, or preview
  - [ ] Selections beyond the configured message bound are refused, not truncated
  - [ ] All three topics are declared through `registerModuleTopics` and pass the undeclared-publish
        assertion; a hidden tab stops publishing focus
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README updated to note that chat and shell are bus publishers

---

### APTR-164: The becoming surface — render `memory.recall` so Soul Contract clause 3 is real
- **Priority:** High
- **Labels:** aperture, context-bus, assistant, soul-contract, web
- **Agent:** claude
- **Estimate:** 6h
- **Blocked by:** APTR-49
- **Description:** The metadata claims Soul Contract clause 3 — "show the becoming... rendered on a
  first-class surface" — and the bus contract defines a `memory.recall` topic. **No item rendered
  it.** As the review put it, clause-3 compliance was being asserted by a topic definition nobody
  consumes. This item builds the surface, which is the only thing that makes the claim true.

  The surface answers, at a glance: what did the assistant just recall, why did it surface that,
  and what has changed in how it understands things. It is the difference between an assistant that
  *has* memory and one whose memory the user can *see* — which is the whole point of the clause.

  ## FILES
  - `client/src/assistant/BecomingPanel.tsx` — the first-class recall/becoming surface
  - `client/src/assistant/RecallCard.tsx` — one recall event: what, why, when, and its source
  - `client/src/assistant/DriftView.tsx` — trait and opinion drift over the session
  - `client/src/assistant/becoming.ts` — consumption, grouping, and ordering of `memory.recall`
  - `client/src/assistant/BecomingPanel.test.tsx`
  - `docs/BECOMING.md` — what this surface shows, what it deliberately does not, and why

  ## APPROACH
  1. Consume `memory.recall` through APTR-49's runtime. The topic is **consume-only for the UI**
     per the APTR-47 registry: this surface never publishes it, and never writes to memory.
  2. Each recall renders as: what was recalled (a pointer, not a dump), why it surfaced, when, and
     what the assistant did with it. Where the payload carries only a pointer, the surface fetches
     the referenced content through the normal authorized path — the bus never carries memory
     content, and this surface does not become the exception that makes it.
  3. **Drift is shown, not summarized away.** Where the assistant's traits or stated opinions
     changed during the session, show the before, the after, and the recall that occasioned it.
     "Show the becoming" means showing change, and a surface that only shows the current state
     shows being, not becoming.
  4. **Read-only, absolutely.** No affordance here edits, deletes, corrects, or resets memory,
     traits, or lore. Continuity is a hard constraint of this epic; a "forget this" button would be
     a different feature with a different review, and its absence is asserted by a test.
  5. Capability-gated like every other surface: with the memory capability unavailable, render the
     inert state with a reason through the shared `inertConformance` harness, and issue no requests.
  6. Honest when empty: a session with no recalls yet says so and explains what would appear here,
     rather than rendering a blank panel that reads as broken (shared vocabulary with APTR-165).
  7. Opt-out honored: if `memory.recall` is opted out, the surface says the user turned it off and
     how to turn it back on. It does not reach for a side channel to populate itself.

  ## TEST PLAN
  - Unit: recall events render with what, why, when, and source, ordered deterministically by `seq`
  - Unit: a recall carrying only a pointer fetches its content through the authorized path
  - Unit: drift renders before/after with the occasioning recall
  - Unit: an empty session renders the explained empty state, not a blank panel
  - Unit: with `memory.recall` opted out, the surface states that plainly and fetches nothing
  - Conformance: passes `inertConformance` for `unavailable` and `degraded`
  - Verify no hardcoded IPs, hostnames, org names, ports, config values, or absolute user paths in
    new/modified files
  - Negative (**continuity**): assert this surface exposes **no** mutation path — no edit, delete,
    correct, or reset of memory, traits, or lore; adding one FAILS this test
  - Negative: assert no memory content is read from the bus payload itself — content must come from
    the authorized fetch, so a payload carrying content is not silently rendered
  - Negative: with the memory capability unavailable, the surface issues zero requests

  ## EDGE CASES
  - A very long session with hundreds of recalls — group and virtualize; never render everything
  - A recall referencing content the user can no longer access — show the recall and state the
    content is unavailable, rather than hiding that the recall happened
  - Drift with no clear occasioning recall — show the change and say the cause is not recorded,
    rather than inventing an attribution
  - A recall arriving while the panel is closed — it appears in order when opened; nothing is lost
    and nothing knocks, because presence has a budget and this surface is not a notification source
  - Clearing the bus — recall history in the panel clears with it, while the assistant's actual
    memory is untouched; the panel says which of the two just happened

- **Acceptance criteria:**
  - [ ] A first-class surface consumes `memory.recall` and renders what was recalled, why, when,
        and its source — clause 3 is satisfied by this surface, not by a topic definition
  - [ ] Trait and opinion drift render as before/after with the occasioning recall
  - [ ] Memory content is fetched through the authorized path; the bus carries pointers only
  - [ ] The surface is strictly read-only — no memory, trait, or lore mutation path exists, proven
        by a negative test
  - [ ] Capability-gated via the shared harness, issuing zero requests when unavailable
  - [ ] Empty and opted-out states are explained honestly rather than rendered blank
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README and `docs/BECOMING.md` document the surface and its deliberate read-only scope

---

### APTR-165: Empty-but-healthy and first-run states across every module surface
- **Priority:** Medium
- **Labels:** aperture, modules, web, ux
- **Agent:** codex
- **Estimate:** 4h
- **Blocked by:** APTR-51, APTR-55, APTR-56
- **Description:** The sprint covers unavailable and degraded states exhaustively and never covers
  **empty-but-healthy**. A freshly scanned library with nothing in it, an orchestrator with zero
  runs, and a spec browser with no specs are all *working* systems with nothing to show — and each
  currently renders as a void that is indistinguishable from a failure. That is the cheapest
  possible way to make a healthy system look broken.

  Empty is a designed state with a designed vocabulary, shared across surfaces so it reads as one
  system rather than three improvisations.

  ## FILES
  - `client/src/modules/EmptyState.tsx` — the shared empty/first-run primitive: what would fill
    this, why it is empty, and the relevant next action
  - `client/src/modules/emptyStates.ts` — the per-surface copy, drawn from the centralized string
    catalogue rather than inlined in components
  - `client/src/modules/testing/emptyConformance.tsx` — the harness asserting every module surface
    renders a designed empty state, mirroring `inertConformance`
  - `client/src/modules/EmptyState.test.tsx`

  ## APPROACH
  1. One primitive, three ingredients every time: what this surface shows when populated, why it is
     empty right now, and the single most relevant action (which is a **declared action** per
     APTR-162, so empty states do not become a parity blind spot).
  2. Distinguish **empty** from **unavailable** from **filtered-to-nothing**, because they are three
     different truths and collapsing them is what makes a healthy system look broken. A search with
     no results says the search found nothing and offers to clear the filter; a library with nothing
     scanned says scanning has not run; an unavailable capability keeps its existing inert tile.
  3. First-run is a special case of empty and reuses the same primitive with different copy, so
     there is no second component and no second vocabulary.
  4. `emptyConformance` renders every module surface with an empty successful response and asserts a
     designed state — never a bare container, never a permanent spinner, never zero pixels. Every
     surface in this sprint runs through it, exactly as it runs through `inertConformance`.
  5. Copy lives in the centralized string catalogue, so it is reviewable in one place and does not
     drift per surface.
  6. Accessibility is part of the state, not decoration: the empty state is announced, focusable,
     and its action is reachable by keyboard.

  ## TEST PLAN
  - Unit: the primitive renders all three ingredients and its action is a declared action
  - Unit: empty, unavailable, and filtered-to-nothing render as three distinguishable states
  - Unit: first-run copy differs from steady-state empty copy for the same surface
  - Conformance: library, runs, specs, and the becoming panel each pass `emptyConformance`
  - Unit: the empty state is announced to assistive technology and its action is keyboard-reachable
  - Verify no hardcoded IPs, hostnames, org names, ports, config values, or absolute user paths in
    new/modified files
  - Negative: a surface returning an empty successful response must not render a bare container or a
    persistent spinner — either FAILS `emptyConformance`
  - Negative: an empty state whose action is not a declared action FAILS, so empty states cannot
    become a parity hole

  ## EDGE CASES
  - A library that is empty because a scan is *in progress* — that is a distinct in-progress state,
    not empty; say scanning is running and roughly where it is
  - A filter combination that can never match — offer to clear the filter rather than implying the
    library is empty
  - An orchestrator with zero runs on first install versus one where runs aged out of retention —
    different copy, because they are different truths
  - Empty arriving after a populated render (everything deleted while open) — transition to the
    empty state explicitly rather than leaving stale content on screen
  - A surface that is empty *and* opted out of its bus topic — state both, in priority order, and do
    not let one message hide the other

- **Acceptance criteria:**
  - [ ] A shared empty/first-run primitive renders what would fill the surface, why it is empty, and
        a relevant declared action
  - [ ] Empty, unavailable, and filtered-to-nothing are three distinguishable designed states
  - [ ] `emptyConformance` covers library, runs, specs, and the becoming panel, and fails a bare
        container or a persistent spinner
  - [ ] First-run reuses the same primitive with distinct copy; all copy comes from the string
        catalogue
  - [ ] Empty states are announced to assistive technology and keyboard-reachable
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README updated to document the empty-state vocabulary

---

### APTR-166: Declared deferrals for Sprint D — what this sprint deliberately does not ship
- **Priority:** Medium
- **Labels:** aperture, documentation, scope, modules
- **Agent:** claude
- **Estimate:** 3h
- **Blocked by:** APTR-59
- **Type:** documentation
- **Description:** Write the sprint's declared deferral list, so that everything absent from Sprint
  D is absent **on purpose and in writing**. The review flagged the sharpest example: the epic
  describes Muse as including acquisition ("why did this grab fail"), and this sprint's action
  manifest enumerates no request, grab, retry, or cancel action — with no statement either way.
  Silence there reads as an oversight against the epic's own Gate 2 prose, and a reader cannot tell
  a scoping decision from a forgotten one. This document makes that distinction legible, and the
  parity gate (APTR-59) reads it, so a deferral is a reviewable declaration rather than a gap.

  ## AUDIENCE
  Sprint G's reviewers, the operator deciding what a later sprint picks up, and any implementing
  agent who notices something missing and needs to know whether to build it or leave it.

  ## OUTLINE
  1. **How to read this file.** A deferral is a decision with a reason and an owner-sprint
     suggestion. Anything not listed here and not implemented is a defect, not a deferral.
  2. **Muse acquisition actions — deferred.** Request, grab, retry, and cancel are not in this
     sprint's manifest. Reason: this sprint's Muse surface is deliberately read-and-play; the
     acquisition write-path is a distinct safety surface (it spends bandwidth and mutates a library)
     and deserves its own dual-confirmation design rather than a bolt-on to a browse surface. The
     read-side "why did this grab fail" *status* remains visible through availability/lifecycle
     state, so the epic's diagnostic promise is not lost — only the write actions are deferred.
  3. **Full-transcode playback — deferred (decision D4).** Only remuxable content plays in-client;
     everything else renders APTR-161's honest deferred state. Reason and re-entry conditions.
  4. **Embedded subtitle-track extraction — deferred (APTR-161).** Sidecar and remux-carried tracks
     ship; embedded extraction needs backend work.
  5. **Per-field metadata provenance UI — deferred (APTR-51).** Restated here so it lives on one
     list rather than only inside an item description.
  6. **Destructive build operations — out of scope (APTR-55).** The shell observes the pipeline; it
     does not gain a side-channel to mutate it. This one is closer to a standing policy than a
     deferral, and the file says which entries are policy and which are timing.
  7. **Multi-user and cross-session bus fan-out — a v2 concern (APTR-47).**
  8. **Fleet-wide bus inspection — not v1 (APTR-47 §6a).** Inspection is per-session; the privacy
     panel says so.
  9. **How the parity gate consumes this file**, and what happens when an entry is removed: removing
     a deferral without implementing the actions makes the gate fail, which is the intended pressure.

  ## SOURCES
  `specs/S128-aperture-epic.md` (Gate 2 prose and the Muse description),
  `specs/S128-DECISIONS.md` (D4 especially), the Fable review of this sprint, and items APTR-51,
  APTR-53, APTR-55, APTR-59, APTR-161 in this file.

  ## TONE
  Plain, decisive, and unapologetic. A deferral stated with its reason is a sign of a spec that
  knows its own edges; hedging makes it read like an excuse. Every entry answers "why not now" in
  one or two sentences and never more. No infrastructure identifiers, no config values — this file
  mirrors publicly.

---

### APTR-167: Assistant read-audit — who consumed the bus, not just what it holds
- **Priority:** Medium
- **Labels:** aperture, context-bus, privacy, transparency, rust, web
- **Agent:** claude
- **Estimate:** 5h
- **Blocked by:** APTR-48, APTR-50
- **Description:** The privacy panel shows what the bus retains. It does not show **who read it**.
  That gap is the difference between an abstract sovereignty story and a visceral one: "the
  assistant can see this" lands very differently from "the assistant read this four minutes ago."
  This item adds a lightweight read-audit so access transparency is a rendered fact rather than a
  documented policy.

  It is deliberately small and deliberately honest: a per-topic last-read timestamp and a
  per-session read count, recorded where the read actually happens, with no attempt to reconstruct
  intent.

  ## FILES
  - `client/src/context-bus/ReadAudit.tsx` — the per-topic audit line in the privacy panel
  - `client/src/context-bus/ReadAudit.test.tsx`
  - `docs/PRIVACY.md` — extended with what the audit records, what it does not, and its retention
  - **Agent-core repo (sibling PR):** read-accounting in the `aperture::context` module — every
    assistant-facing read of retained bus state records topic, timestamp, and reader class — plus
    an audit projection on `GET /v1/aperture/events`

  ## APPROACH
  1. **Record at the read, not at the caller.** Accounting lives in the single place bus state is
     read for the assistant, so a new consumer cannot forget to declare itself. A read path that
     bypasses accounting is a bug the tests catch, not a documentation problem.
  2. What is recorded, exactly: topic, timestamp, and reader class (`assistant` or `module`). What
     is **not** recorded: prompts, answers, message content, or any inference about why. The audit
     is a transparency feature, not a second surveillance surface — recording more would betray the
     purpose of the feature.
  3. Retention is bounded by `APERTURE_CONTEXT_READ_AUDIT_RETENTION_EVENTS`, it dies with the
     session exactly as `session` retention does, and it is cleared by the same
     `DELETE /v1/aperture/events` the user already has. The audit never outlives what it audits.
  4. The panel renders one line per topic: last read by the assistant, and reads this session. A
     topic never read says "never read this session" — an absent line would be ambiguous, and the
     ambiguity always resolves in the system's favour, which is exactly wrong for a privacy surface.
  5. Opted-out topics are never read and therefore show no reads; the panel states that this follows
     from the opt-out rather than from luck.
  6. The audit is itself bus-adjacent data and inherits every sovereignty invariant: no egress, no
     telemetry, no third party, user-inspectable, user-clearable.

  ## TEST PLAN
  - Unit: an assistant read of a topic records topic, timestamp, and reader class — and nothing else
  - Unit: the panel renders last-read and read-count per topic, with an explicit never-read state
  - Unit: retention is bounded from named config and the audit clears with the bus
  - Integration: a read through the assistant path is accounted; a read path added without
    accounting FAILS a test
  - Verify no hardcoded IPs, hostnames, org names, ports, config values, or absolute user paths in
    new/modified files
  - Negative: assert the audit record contains **no** prompt, answer, or message content — a record
    carrying any of it FAILS this test
  - Negative: an opted-out topic records zero reads, because it is never read — a recorded read for
    an opted-out topic FAILS and would prove the opt-out is not enforced
  - Negative: assert the audit never leaves the fleet (it passes `assert-no-egress.mjs`)

  ## EDGE CASES
  - A high-frequency reader inflating the count into noise — coalesce reads within a short window
    into one recorded read, and say in the panel that reads are coalesced
  - A read occurring while the panel is open — the line updates live from the existing stream rather
    than requiring a refresh
  - Audit retention filling before bus retention — say "older reads aged out" rather than implying
    there were none
  - A module read rather than an assistant read — distinguish the reader class, since "the media
    module read your playback state" is a materially different statement from "the assistant did"
  - Clearing the bus — the audit clears with it, and the panel says both were cleared

- **Acceptance criteria:**
  - [ ] Every assistant-facing read of retained bus state is accounted at the read site, with topic,
        timestamp, and reader class
  - [ ] The privacy panel shows last-read and read-count per topic, with an explicit never-read state
  - [ ] The audit records no prompt, answer, or message content, proven by a negative test
  - [ ] An opted-out topic records zero reads; a recorded read there fails the build
  - [ ] Audit retention is bounded from named config, dies with the session, and clears with the bus
  - [ ] The audit passes the no-egress sweep and inherits every sovereignty invariant
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] `docs/PRIVACY.md` documents what the audit records, what it does not, and its retention
