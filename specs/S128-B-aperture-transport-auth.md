# Aperture Sprint B — Transport & Identity
plane_project: APTR
module: Aperture
prefix: APTR
spec_id: S128-aperture-client

## Metadata
- **Author:** Operator (Moose)
- **Session:** S128
- **Date:** 2026-08-01
- **Module version:** Aperture v0.1.0
- **Estimated total:** 138h (exact sum of the item estimates below, per D12)
- **North-Star layer:** shell — Gate 2 justified in `specs/S128-aperture-epic.md`
- **Module-Contract:** this sprint implements clause 1 (Terminus-fronted — every stream token
  and every auth decision resolves through `terminus-client`, never a second door), clause 3
  (context-bus citizen — the SSE `context` and `presence` channels are stood up here), and
  clause 6 (sovereign by construction — no external transport, no telemetry, no third-party
  auth provider). Clauses 2, 4, 5, 7 are inherited from Sprint A and exercised in Sprints C–D.
- **Assistant-Layer Soul Contract:** clause 2 (presence has a budget) is enforced at the
  transport layer here — the SSE `presence` event is a *transport* for the assistant's existing
  prioritized knock quota, and this sprint ships **no independent notification tray**.
  Clause 4 (continuity survives every swap) is the subject of APTR-28, which carries the
  epic-mandated negative test. Clause 1 (speak, never template) is respected: the BFF frames
  and sequences assistant output but never authors user-facing assistant prose.
- **Context:** Sprint A produced a repo, a design system, a BFF skeleton, and a versioned
  contract. Nothing yet moves. Sprint B is **the unblocker for every downstream sprint**: it
  builds the streaming transport that makes chat feel alive, the identity layer that makes
  Aperture multi-user and multi-device, and the channel adapter that makes Aperture a
  first-class citizen of the *existing* agent loop rather than a parallel path around it.
  Two constraints dominate every item below and are worth stating up front:

  1. **Streaming is greenfield in the emitting direction only — the consuming direction already
     exists and is mature.** Be precise about the split, because it changes what this sprint
     builds and what it must not rebuild:

     *Already exists (reuse, do not reinvent):* `crates/lumina-core/src/chord.rs` provides
     `ChordClient::chat_completion_streaming(...)` with an `on_delta` callback (LSTR-01), backed
     by a real incremental SSE **frame parser** (`ChatSseState` — `push_chunk` / `push_str` /
     `handle_frame` / `flush_tail`) that appends `choices[0].delta.content` and hands each
     non-empty delta to `on_delta` as it arrives, correctly across chunk boundaries that split a
     frame. It returns `StreamedCompletion { text, truncated }`, where `truncated` marks an
     abnormal end (per-read inactivity timeout, LSTR-02, or a mid-stream transport drop) with only
     partial text; and `ChatSseState::saw_frame` distinguishes a genuine stream from an upstream
     that ignored `stream: true` and returned one buffered body, with a documented fallback to a
     buffered consume. `crates/lumina-core/src/agent_loop.rs` already calls this behind the
     `router.stream_deep` flag with `crate::config::stream_idle_timeout_secs()` — **passing a
     no-op `|_delta| {}` closure**, with the in-code comment noting that LSTR-03 wires the
     incremental emit through that same callback. The core also already serves an
     OpenAI-compatible `/v1/chat/completions` route of its own.

     *Genuinely absent (this sprint's real job):* there is **no `axum::Sse`, no `sse::Event`, no
     `Body::from_stream`, no `StreamBody`** anywhere in the crate, and no server-side streaming
     route. Every `text/event-stream` occurrence in `agent_loop.rs` and `chord.rs` is inside a
     **test mock server**, not production response code. So there is no client-facing stream
     endpoint at all — the *emitting* half is what Sprint B builds, to the taxonomy already frozen
     in `contracts/aperture-events-v1.md`.

     **Consequence for every item below — read the narrowed form, not the old absolute (D2).**
     The prohibition is exactly two things: **no second token path, and no second SSE frame
     parser.** `ChatSseState` is reused as-is and remains the only place in the crate that parses
     upstream SSE frames; the per-read idle-timeout and buffered-fallback semantics are reused, not
     reimplemented.

     What is **permitted and required** (this corrects an earlier over-absolute instruction that
     produced three contradictions in review): additional producers for `tool.call`, `tool.result`,
     `thinking`, and turn-lifecycle events. `on_delta` carries text only, so four of the ten
     contracted event types had no lawful producer under the old wording. Those producers publish
     into the **same per-turn fan-out** the token deltas publish into — one fan-out, several
     producers, one subscriber-facing stream (APTR-122).

     Also permitted (D2): `crates/lumina-core/src/chord.rs` **may** gain a cancellation token
     parameter, because cancellation has to reach `chat_completion_streaming` to be real. The
     former "`chord.rs` unmodified" grep gate is **withdrawn** and replaced everywhere in this
     sprint by: *no duplicate SSE parsing logic anywhere outside `ChatSseState`.*

     The one rule that gets **stronger**, not weaker: the `on_delta` closure runs inside the
     upstream body-read loop. Publishing from it MUST be non-blocking and MUST NOT panic. Blocking
     there stalls the turn for **every** channel — Matrix and CLI included — not just Aperture.
     Drop on a full buffer; never block, never `unwrap`, never propagate an error out of the
     closure.
  2. **There is already an `EDGE-08` `Channel` trait and `ChannelRegistry`** with Matrix, CLI,
     HTTP, and (feature-gated, real, non-stub) Telegram adapters, all feeding one shared
     `mpsc::Sender<ChannelMessage>` so every message crosses the same guarded agent loop.
     Aperture **registers into that registry**. Any approach that builds a second inference or
     tool path around the agent loop is a review rejection, not a design choice.

## Pre-flight
- **`specs/S128-DECISIONS.md` is binding and outranks this file.** Where a line here still
  contradicts a decision there, the decision wins and this file is wrong. The decisions this
  sprint materially depends on are D2 (what may produce events; what `chord.rs` may become),
  D3 (stream lifecycle, refcounted cancellation, bounded resume), D9 (mandatory `origin`
  provenance), D10 items 8 and 9 (audit log; trusted proxy), and D12 (header estimate = exact
  sum of item estimates). Do not re-litigate them per item.
- **Item numbers are IDENTIFIERS, NOT AN ORDERING.** `APTR-120`+ are additions made during the
  post-review revision; a higher number does not mean "later", "optional", or "lower priority".
  Several of them are prerequisites of the original `APTR-15..28` items. **The only authority on
  sequencing is the `Blocked by` field** — read it on every item before scheduling. Existing item
  numbers are never renumbered, because they are already referenced by the epic, the other sprint
  specs, and the tracker.
- **Required merge order** (dependencies only; anything not named here may land in parallel):
  1. `APTR-120` (events-contract amendment: stream lifecycle, `origin`, error classes, clocks)
     merges **before** `APTR-15`, `APTR-16`, `APTR-19`, `APTR-122`, `APTR-123`. It changes the
     contract every one of them codes against.
  2. `APTR-127` (audit log definition) merges **before** `APTR-20`, `APTR-22`, `APTR-23`, which
     all cite an audit log that no item previously defined.
  3. `APTR-15` → `APTR-16` → `APTR-124` (resync + minimal turn fetch) → `APTR-19`.
  4. `APTR-26` → `APTR-122` (non-token producers) → `APTR-123` (provenance invariant).
  5. `APTR-18` + `APTR-121` (refcount + grace window) are one design and must be reviewed
     together; `APTR-121` merges immediately after `APTR-18` and before Sprint C consumes either.
  6. `APTR-125` (auth-boundary hardening) merges with or immediately after `APTR-20`/`APTR-21`;
     `APTR-126` (password/account lifecycle) and `APTR-128` (trusted proxy) follow `APTR-21`/
     `APTR-24` respectively.
- **Blocked by Sprint A in full.** APTR-06 (`contracts/aperture-api-v1.yaml`,
  `contracts/aperture-events-v1.md`), APTR-05 (BFF module skeleton), APTR-07 (generated SDK),
  APTR-10 (error model) and APTR-11 (config/secrets discipline) are hard prerequisites.
  Do not begin an item in this sprint against an unmerged Sprint A contract.
- Repository: `moosenet/Aperture` on the internal forge; sibling PRs land in the agent-core repo
- Vault secrets required (names only — values live in the secret store):
  `APERTURE_SESSION_SIGNING_KEY`
- Existing code this sprint extends (agent-core repo, repo-relative):
  `crates/lumina-core/src/channels/mod.rs` (the `Channel` trait + `ChannelRegistry`),
  `crates/lumina-core/src/channels/{matrix,cli,http,telegram}.rs`,
  `crates/lumina-core/src/users/identity.rs` (`ChannelType`, `ChannelIdentity`, `UserStore`),
  `crates/lumina-core/src/conversation/{buffer,summarizer,engram_flush}.rs`,
  `crates/lumina-core/src/agent_loop.rs`, `crates/lumina-core/src/api/` (12 route modules),
  `crates/lumina-core/src/chord.rs` (`chat_completion_streaming`, `ChatSseState`,
  `StreamedCompletion`)
- **Existing streaming flag — `router.stream_deep`.** This flag already gates whether the
  deep-tier synthesis in `agent_loop.rs` runs through `chat_completion_streaming` (with the
  currently no-op `on_delta`) or through a buffered consume. **Decision for this sprint: Aperture
  streaming is *dependent on* `router.stream_deep`, not independent of it.** Justification: the
  flag is the switch that decides whether deltas exist at all upstream, so an "independent"
  Aperture stream would either have to open a second inference call (a parallel path around the
  agent loop — forbidden by APTR-26) or silently degrade. Instead, Aperture subscribes to whatever
  the loop produces: with `stream_deep` on, the user sees token-by-token output; with it off, the
  turn arrives as a single `token` event followed by `message.end`. **The SSE contract is
  identical either way** — same event sequence, same terminal guarantee — so no client code
  branches on the flag, and enabling it later is a pure experience upgrade with no contract change.
  The BFF reports the current granularity in the module descriptor (APTR-08) so the UI can
  explain, not guess.
- **Existing config key — `stream_idle_timeout_secs()`** governs the per-read inactivity timeout on
  the *upstream* consume. Aperture's heartbeat and idle-reap settings (APTR-17) are **downstream**
  and must be reconciled with it rather than contradict it; see that item.
- Dependencies: `node` ≥ 20, `rustup` + pinned toolchain, `cargo`
- Infrastructure: internal forge reachable, Plane reachable, Terminus door reachable,
  Chord reachable **by named proxy only**
- Baseline tests: the agent-core workspace suite must be green before the first item merges;
  record the baseline count in the first PR body
- Baseline verify: N/A (Aperture repo is new) — Sprint G establishes the behavior-verify baseline

---

### APTR-15: SSE stream endpoint — event framing and the full v1 event taxonomy
- **Priority:** Critical
- **Labels:** aperture, bff, streaming, sse, rust
- **Agent:** claude
- **Estimate:** 8h
- **Blocked by:** APTR-120
- **Description:** Implement `GET /v1/aperture/stream` in the BFF as a Server-Sent Events
  endpoint that emits the complete event taxonomy frozen in `contracts/aperture-events-v1.md`:
  `token`, `message.start`, `message.end`, `tool.call`, `tool.result`, `thinking`, `error`,
  `context`, `presence`, `heartbeat`. This is the foundational transport item — every other
  streaming item in this sprint and every chat surface in Sprint C sits on it.

  **Scope boundary — read this before writing a line.** The core already *consumes* SSE from
  upstream and does it well; what it has never done is *emit* SSE to a client. This item builds
  only the emitting half: there is no `axum::Sse`, `sse::Event`, `Body::from_stream`, or
  `StreamBody` in the crate today, and no server-side streaming route. **You must not write a new
  SSE frame parser.** `ChatSseState` in `crates/lumina-core/src/chord.rs` already parses upstream
  frames correctly across split chunk boundaries and is covered by tests; the deltas it produces
  are the input to this endpoint, delivered through the existing `on_delta` callback (wired in
  APTR-26). A second parser would be duplicated logic with half the test coverage.

  **What this item does *not* own (D2).** The token path only. Producers for `tool.call`,
  `tool.result`, `thinking`, and turn-lifecycle events are **APTR-122's** job — they are permitted
  and required, they publish into the same per-turn fan-out, and this endpoint frames whatever
  arrives on that fan-out without caring which producer wrote it. This item defines the wire
  shapes for all ten types and ships the token/lifecycle path end to end; APTR-122 lights up the
  remaining producers. Do not stub the four types out of the enum to "unblock" yourself.

  **Stream lifecycle is settled — do not reinterpret it (D3, normative in APTR-120).**
  **A stream is ONE CONNECTION.** It is not one thread and not one turn. `thread_id` and the
  message id **demultiplex** multiple threads and multiple turns within a single connection.
  Every field, cap, buffer, and reducer in this sprint uses that meaning and no other.

  It is a **one-way server→client** stream; the client sends messages over ordinary REST. That
  asymmetry is deliberate: SSE survives proxies, reconnects natively, and needs no second
  protocol. WebSocket is explicitly **not** adopted in this sprint.

  ## FILES
  - `contracts/aperture-events-v1.md` — extend only where the implementation discovers an
    under-specified guarantee; the taxonomy itself is frozen and must not be widened silently
  - `contracts/aperture-api-v1.yaml` — the stream endpoint's media type, query parameters
    (including the `thinking` parameter above), the thread-settings route carrying
    `thinking_visible`, and documented error responses
  - `client/src/api/events.ts` — the TypeScript discriminated union for every event type,
    generated-adjacent and asserted against the contract enum
  - **Agent-core repo (sibling PR):** an `aperture/stream` module with the SSE responder built on
    `axum::Sse` (new), an event enum with a serialization test per variant, and the emitter handle
    the agent loop writes into. **No new frame parser** — `chord.rs`'s `ChatSseState` stays the
    single upstream parser and is not modified beyond what APTR-26 needs

  ## APPROACH
  1. Model the event set as a **Rust enum with one variant per event type**, serialized to the
     SSE wire format with an explicit `event:` name and a JSON `data:` payload. Adding a variant
     without adding it to the contract enum must fail a test — the contract is the source of
     truth, not the code.
  2. Every event carries: `seq` (monotonic, APTR-16), `stream_id`, `thread_id`, `ts`, a
     mandatory **`origin` discriminator** (`assistant | tool | system | user`, D9), and a
     type-specific payload. `token` carries the delta text only — never the accumulated
     buffer — so a long response does not degrade to O(n²) bytes on the wire. `origin` is a
     non-optional field on every variant: it is what clients derive visual attribution from, and
     they derive it **from `origin` only, never from content**. A variant that can be constructed
     without an `origin` must not compile.
  3. `message.start` opens a logical assistant turn and carries the message id the client will
     key on; `message.end` closes it and carries the terminal reason (`complete`, `cancelled`,
     `error`, `budget_exhausted`). **A stream may never end without a terminal event** — a
     silently truncated stream is the single worst failure mode of this design and every
     shutdown path must emit `message.end` or `error` first. Because a stream is one connection
     carrying many turns, "terminal" means *per turn*: exactly one terminal event per message id,
     and the connection outliving a turn is normal, not an error.
     `message.end` additionally carries the **canonical message id, the total byte length, and a
     content hash** of the persisted assistant text, so a client can verify its assembled delta
     concatenation matches what the server stored. A mismatch is a detected gap and a REST refetch
     (APTR-124), not silent divergence — this converts delta loss, the worst latent bug of any SSE
     transport, from invisible into observable at runtime.
  4. `tool.call` / `tool.result` render the assistant's tool use transparently. Payloads are
     **sanitized before framing**: arguments and results have keys/tokens redacted and values
     over 1 KB truncated with an explicit marker, reusing the APTR-10 sanitizer. A tool result
     is never streamed raw.
  5. `thinking` carries reasoning-visible content where the named proxy supplies it, always with
     `origin: assistant` and always as a **separate variant** that no reducer may merge into
     message text. It is **opt-in and defaults off**, and the opt-in mechanism is now named
     rather than implied (it was previously untestable as written):
     - **Persisted, per thread:** a `thinking_visible` boolean on the thread settings record,
       default `false`, written through the thread-settings route in
       `contracts/aperture-api-v1.yaml` and readable by the owning user only.
     - **Per connection, subordinate:** the stream endpoint accepts a `thinking` query parameter
       with values `off` (default) and `thread`. `off` suppresses `thinking` events for that
       connection unconditionally; `thread` honours each thread's persisted setting.
     - **Resolution is AND, never OR:** an event is emitted only when the connection asked for
       `thread` **and** that thread's `thinking_visible` is true. A client cannot opt itself in
       for a thread the user has not enabled, and the absence of the parameter is `off`.
     This makes the acceptance criterion "opt-in and off by default" mechanically testable: three
     tests, one per position of the AND.
  6. `context` and `presence` are reserved on this endpoint and stood up as pass-throughs here;
     Sprint D fills the context bus and the presence budget wires into the assistant's existing
     prioritized knock quota. **This item ships no notification tray and no independent
     alerting path** (Soul Contract clause 2).
  7. Set the anti-buffering headers the contract mandates: `Content-Type: text/event-stream`,
     `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, and the
     proxy-buffering-off hint. Additionally emit a short padding comment line at stream open so
     an intermediary that buffers by byte count flushes immediately.
  8. **Map the existing upstream outcomes onto the taxonomy — do not reinvent them.** Three
     concrete bindings, each of which must be implemented and tested rather than left to the
     implementer's judgment:
     - `StreamedCompletion.truncated == true` (abnormal end: LSTR-02 per-read inactivity timeout,
       or a mid-stream transport drop, with only partial text) ⇒ emit the already-received tokens,
       then an in-stream `error` event of the upstream-timeout or upstream-error class, then
       `message.end` with reason `error`. **The partial text is kept, never discarded**, and the
       abnormality is always surfaced. A `truncated` completion silently presented as a complete
       answer is the single most misleading failure this endpoint could produce.
     - `ChatSseState::saw_frame == false` (upstream ignored `stream: true` and returned one
       buffered body; the existing documented fallback consumes it whole) ⇒ the client-visible
       behaviour is a **normal, well-formed turn** — `message.start`, exactly one `token` event
       carrying the full text, then `message.end` with reason `complete`. The client must never
       need to know this happened; it is a granularity difference, not an error. Surface the
       granularity in the module descriptor (APTR-08), never as a stream error.
     - `crate::config::stream_idle_timeout_secs()` bounds upstream inactivity. Aperture's
       heartbeat interval (APTR-17) is downstream and independent, but the two must be *reconciled*:
       the heartbeat must be materially shorter than the upstream idle timeout, so a client
       distinguishes "the server is alive and waiting on a slow model" from "the connection died".
       Assert the ordering relationship in a test rather than trusting two separately-tuned values.
  9. Backend access is through `terminus-client` only. Chord is addressed by **named proxy**
     (`lumina-fast`, `lumina-deep`) — no model id, engine name, backend tag, or size suffix
     appears anywhere in BFF or client code.
  10. No `unwrap()`/`expect()` on the stream path. A panic inside a stream task must be caught at
      the task boundary and converted into an in-stream `error` event plus `message.end`.

  ## TEST PLAN
  - Unit: every enum variant round-trips to its contracted wire shape; a variant missing from
    `contracts/aperture-events-v1.md` fails the test
  - Unit: `token` payloads carry deltas, never accumulated text (assert total bytes for an
    N-token response is linear in N)
  - Unit: a tool result containing a secret-shaped key is redacted before framing
  - Integration: a full turn emits `message.start` → `token`* → `message.end` in order
  - Integration: the response carries all four anti-buffering headers
  - Integration: `thinking` events are absent unless explicitly requested — three cases:
    parameter absent ⇒ none; parameter `thread` with `thinking_visible` false ⇒ none;
    parameter `thread` with `thinking_visible` true ⇒ present
  - Unit: every event variant serializes a non-empty `origin` in `assistant | tool | system | user`;
    a variant constructed without one fails to compile or fails the test
  - Unit: `message.end` carries the canonical message id, byte length, and content hash, and the
    hash matches the concatenation of the emitted `token` deltas for the same message id
  - Integration: one connection carrying two interleaved threads demultiplexes correctly by
    `thread_id`/message id, and each turn gets exactly one terminal event
  - Integration: an upstream `StreamedCompletion` with `truncated == true` yields the partial
    tokens, then an `error` event, then `message.end` with reason `error` — partial text retained
  - Integration: an upstream that ignored `stream: true` (`saw_frame == false`) yields a normal
    single-`token` turn ending `complete`, with no error surfaced to the client
  - Unit: assert the heartbeat interval is materially shorter than `stream_idle_timeout_secs()`
  - `grep` gate: the new stream module contains no SSE frame-parsing logic — `ChatSseState` in
    `chord.rs` remains the only upstream parser in the crate
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - Verify no model id, engine name, or backend tag appears in BFF or client code (grep gate)
  - **Negative:** force a panic inside the generation task; assert the client receives an
    `error` event followed by `message.end`, and that the stream is never silently truncated
  - **Negative:** assert an event type not present in the contract enum is rejected at compile
    time or by test, not serialized
  - **Negative:** assert a `truncated` completion is never presented to the client as a normal
    `complete` turn — the abnormal end always surfaces

  ## EDGE CASES
  - An intermediary that buffers regardless of headers — the open-padding comment plus the
    heartbeat (APTR-17) must together defeat it; document the observed floor
  - A `token` delta containing a lone UTF-8 surrogate half from a chunked decoder — buffer at
    the char boundary, never emit invalid UTF-8 into a `data:` line
  - Payload text containing a literal newline — SSE frames are newline-delimited, so JSON-encode
    the payload and never interpolate raw text into the frame
  - Zero-token response (the assistant declines to answer) — still emits `message.start` and
    `message.end`; the client must render an empty turn, not hang
  - A tool that returns megabytes — truncate at the framing boundary with a marker, and expose
    the full result through a REST fetch rather than the stream
  - `truncated` arriving with **zero** received text — still emit `message.start`, the `error`
    event, and `message.end`; the client shows a failed turn, not a phantom pending one
  - `router.stream_deep` off, so every turn arrives as one buffered `token` — the event sequence
    and terminal guarantee are unchanged, and no client code may branch on it (see Pre-flight)

- **Acceptance criteria:**
  - [ ] All ten contracted event types implemented and round-trip-tested; `token` events carry
        deltas only, so wire bytes are linear in response length
  - [ ] Every **turn** terminates with `message.end` or `error` — no silent truncation on any path;
        one connection demultiplexes many threads/turns by `thread_id` and message id
  - [ ] Every event carries a mandatory `origin`; tool call/result payloads sanitized (keys
        redacted, >1KB truncated) before framing
  - [ ] `truncated` maps to a surfaced in-stream `error` with partial text retained;
        `saw_frame == false` maps to a normal single-`token` turn; no new SSE parser is written
  - [ ] All anti-buffering headers present; `thinking` requires the connection parameter **and**
        the thread setting, and is off when either is absent
  - [ ] `message.end` carries message id, byte length, and a content hash matching the emitted deltas
  - [ ] Chord addressed by named proxy only; zero model/engine/backend identifiers in code
  - [ ] No hardcoded infrastructure values in new/modified code, and all existing tests still pass

---

### APTR-16: Monotonic sequence numbers, replay buffer, and Last-Event-ID resume
- **Priority:** Critical
- **Labels:** aperture, bff, streaming, reliability
- **Agent:** claude
- **Estimate:** 6h
- **Blocked by:** APTR-120, APTR-15
- **Description:** A mobile client on a flaky connection will drop a stream mid-generation.
  Without resume, the user loses the turn. Implement the sequencing and replay half of the
  contract's resume semantics: a strictly monotonic per-stream sequence number emitted as the
  SSE `id:` field, a bounded server-side replay buffer, and `Last-Event-ID` handling that
  resumes exactly where the client left off.

  **The lifecycle this item keys off is now settled (D3, normative in APTR-120).** A `stream_id`
  identifies **one connection**, not a thread and not a turn; `thread_id` and message id
  demultiplex within it. A turn is separately **refcounted by its subscribers** (APTR-121), so a
  resume within the window **reattaches to a live turn and increments that refcount** rather than
  starting anything. A resume after the turn has ended replays from the buffer. Resume is
  explicitly **not unbounded**: the replay window is a bounded config key, and a position that has
  aged out gets a `resync` event, not a best-effort guess.

  ## FILES
  - `contracts/aperture-events-v1.md` — pin the resume contract precisely: sequence domain,
    replay window, and what the server does when the requested id has aged out
  - **Agent-core repo (sibling PR):** the stream registry (`stream_id` → sequencer + ring
    buffer), the `Last-Event-ID` request handler, and the resume path

  ## APPROACH
  1. Every emitted event gets `seq = previous + 1` within its `stream_id`. The sequence is
     **per stream, not global** — a global counter leaks concurrency information and creates a
     contention point. The SSE `id:` field is `"{stream_id}:{seq}"` so a resume request is
     self-describing.
  2. Keep a bounded ring buffer per active stream — size it by **both** event count and total
     bytes, whichever binds first, so one enormous tool result cannot evict a whole turn's
     tokens. The bound is a config key by name (APTR-11), never a literal in code.
  3. On reconnect with `Last-Event-ID: {stream_id}:{seq}`, replay every buffered event with
     `seq > n` in order, then continue live. Replay and live emission must be **serialized
     through the same sender** so an event cannot interleave ahead of its replay.
  4. If the requested `seq` has aged out of the buffer, do **not** silently skip and do **not**
     improvise. Emit the contracted **`resync` event** (APTR-120) naming the lost range and
     instructing the client to refetch the affected turn over REST via the minimal turn-fetch
     route from APTR-124, then resume live. Silent gaps are worse than declared ones, and a
     declared gap with no recovery route is barely better — which is why the route is in this
     sprint rather than deferred to Sprint C.
  5. The replay window is bounded in **three** dimensions, all config keys by name (APTR-11),
     none a literal: event count, total bytes, and wall-clock retention. Whichever binds first
     wins. Retention is what makes "resume after a long mobile tunnel" a defined answer instead
     of an unbounded memory commitment.
  6. **Buffer only post-sanitization events.** The APTR-10 sanitizer runs *before* an event
     enters the replay buffer, never after. Otherwise a replay could emit a pre-redaction tool
     result that the live path would have redacted — a redaction bypass reachable by simply
     reconnecting. Assert the ordering with a test; it is not observable by inspection.
  7. If the `stream_id` is entirely unknown (server restarted, stream reaped), respond with a
     fresh stream plus a `resync` rather than a 4xx — the client should recover, not error out.
  8. Resume must be **authorization-checked on every reconnect**, not trusted from the id. A
     `Last-Event-ID` from another user's stream is a forbidden problem-details response, and
     `stream_id` values are unguessable random ids, never sequential.
  9. Retire buffers on the retention bound and on stream reap. A turn's buffer is **not** dropped
     the instant `message.end` fires: a client that dropped just before the terminal event must
     still be able to resume and observe it. Retention (item 5) is what bounds this, together with
     the APTR-121 grace window — an unbounded map of dead streams is a memory leak with a long fuse,
     but a zero-retention one loses exactly the events people reconnect to see.

  ## TEST PLAN
  - Unit: sequence is strictly monotonic per stream and independent across concurrent streams
  - Unit: ring buffer evicts by count bound and by byte bound, whichever binds first
  - Integration: disconnect mid-turn, reconnect with `Last-Event-ID`, assert the received event
    set is exactly the original set with no gap and no duplicate
  - Integration: reconnect with an aged-out id yields a `resync` event naming the lost range and
    pointing at the APTR-124 turn-fetch route, then live events
  - Integration: reconnect with an unknown `stream_id` yields a fresh stream plus a `resync`,
    not a 4xx
  - Unit: the buffer evicts on the wall-clock retention bound as well as count and bytes
  - Unit: an event carrying a secret-shaped value is already redacted **in the buffer** — assert
    the sanitizer ran before insertion, by inspecting buffer contents directly
  - Integration: resume within the window while the turn is still live reattaches and increments
    the APTR-121 subscriber refcount rather than starting a second turn
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - **Negative:** a `Last-Event-ID` referencing a stream owned by a different user is refused
    with a forbidden problem-details response and replays nothing
  - **Negative:** assert dead-stream buffers are dropped after the grace window (no unbounded
    growth over a thousand short streams)

  ## EDGE CASES
  - Two tabs resuming the same `stream_id` concurrently — both may replay; emission stays
    serialized and neither observes an out-of-order sequence
  - A resume arriving *while* the turn is still generating — replay must not stall live emission
    past the heartbeat interval
  - Clock skew — resume keys off `seq` only, never off `ts`; assert no code path compares
    timestamps to decide replay
  - Server restart with in-flight streams — all buffers are lost by definition; the unknown-id
    path is the contract for that, and it must be tested, not assumed
  - A client sending a malformed `Last-Event-ID` — treat as absent, start fresh, never panic

- **Acceptance criteria:**
  - [ ] `seq` is strictly monotonic per stream (one stream = one connection) and emitted as `id:`
  - [ ] Replay buffer is bounded by event count, bytes, and wall-clock retention — all config keys
        by name, never literals
  - [ ] Resume with a valid `Last-Event-ID` yields no gap and no duplicate; resume onto a live turn
        reattaches and increments the subscriber refcount
  - [ ] Aged-out and unknown-stream resumes emit `resync` pointing at the turn-fetch route,
        never a silent skip
  - [ ] Events are sanitized **before** buffering; a replay can never emit a pre-redaction payload
  - [ ] Resume is authorization-checked per reconnect; cross-user resume is refused
  - [ ] Dead-stream buffers are reaped on the retention bound; no unbounded growth
  - [ ] No hardcoded infrastructure values in new/modified code, and all existing tests still pass

---

### APTR-17: Heartbeat, backpressure, and the per-user connection budget
- **Priority:** High
- **Labels:** aperture, bff, streaming, reliability
- **Agent:** claude
- **Estimate:** 5h
- **Blocked by:** APTR-15
- **Description:** Keep idle streams alive through intermediaries that reap quiet connections,
  and make a slow or malicious consumer unable to exhaust server memory. These are the two
  failure modes that turn a working SSE implementation into an outage.

  ## FILES
  - `docs/CONFIGURATION.md` — heartbeat interval, per-user stream cap, per-stream queue depth,
    slow-consumer eviction threshold — **names and semantics only, no values**
  - **Agent-core repo (sibling PR):** the heartbeat ticker, the bounded per-stream send queue,
    the slow-consumer policy, and the connection-budget guard

  ## APPROACH
  1. Emit a `heartbeat` event on a configurable interval whenever no other event has been sent
    within that window. It carries the current `seq` so a client can detect a gap even on an
    idle stream. Use an SSE comment line in addition to the typed event so byte-counting
    intermediaries also see traffic.

     **Reconcile with the existing upstream timeout, do not contradict it.**
     `crate::config::stream_idle_timeout_secs()` already bounds per-read inactivity on the
     *upstream* consume in `chord.rs`. The Aperture heartbeat is a *downstream* concern and stays
     a separate key, but the two must hold an explicit ordering invariant:
     `heartbeat_interval < stream_idle_timeout` by a clear margin, and the client's
     missed-heartbeat threshold sits between them. That ordering is what lets a client correctly
     read a slow first token as "alive and thinking" rather than "dead", and it must be **asserted
     in a test**, not left to whoever tunes the two values next. Likewise the idle *reaper* bound
     must exceed the upstream idle timeout, or Aperture will reap streams that upstream was still
     legitimately working on.
  2. Each stream has a **bounded** send queue. When the queue is full, apply an explicit policy
     in this order: (a) coalesce adjacent `token` deltas into one larger delta — lossless and
     the common case; (b) drop `heartbeat` and stale `presence` events — lossy but harmless;
     (c) if the queue is still full past the eviction threshold, terminate the stream with an
     `error` event of the rate/backpressure class and close. **Never grow the queue unbounded,
     and never drop a `token`, `tool.call`, `tool.result`, `message.start`, or `message.end`.**
  3. Enforce a per-user concurrent-stream cap. Exceeding it closes the **oldest** stream with a
     typed `error`, so a user opening a seventh tab loses their first tab's stream rather than
     being locked out of the new one. Cap is a config key by name.
  4. Enforce a global concurrent-stream ceiling as a last line of defence; refuse over the
     ceiling with a rate-limited problem-details response, never by degrading everyone.
  5. Every stream registers in a registry with an owner, a created-at, and a last-activity
     stamp, and a reaper closes streams idle past a bound. The reaper must emit `message.end`
     before closing (APTR-15 rule: no silent truncation).
  6. Backpressure must never propagate into the agent loop as a stall. If the consumer is slow,
     the stream degrades or dies; **generation must not block on a socket**. Assert this — a
     blocked writer holding the agent loop hostage is the failure this item exists to prevent.

  ## TEST PLAN
  - Unit: with no traffic, a `heartbeat` arrives within the configured interval and carries `seq`
  - Unit: queue-full coalesces `token` deltas losslessly (concatenated text equals the original)
  - Unit: queue-full drops `heartbeat`/`presence` but never a token or lifecycle event
  - Integration: a deliberately stalled reader past the eviction threshold is terminated with a
    typed `error` and the server's memory returns to baseline
  - Integration: opening one more than the per-user cap closes the oldest stream with a typed error
  - Integration: the idle reaper closes a stale stream and emits `message.end` first
  - Unit: the ordering invariant holds — heartbeat interval < client missed-heartbeat threshold <
    `stream_idle_timeout_secs()` < idle-reaper bound
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - **Negative:** assert a stalled consumer does **not** block the agent loop — a second user's
    turn completes normally while the first stream is wedged
  - **Negative:** assert no configuration value (interval, cap, threshold) appears as a literal
    in code

  ## EDGE CASES
  - Heartbeat racing a `message.end` — the terminal event wins; no heartbeat may follow a terminal
  - A consumer that reads exactly slowly enough to stay just under the eviction threshold —
    coalescing must be bounded too, or one delta grows without limit
  - Per-user cap evaluated across devices — a user on phone and desktop must not be capped out by
    normal use; pick a default that accommodates several devices and document it by name
  - Reaper firing during a long tool call that legitimately produces no events — tool activity
    must refresh the activity stamp, not just event emission

- **Acceptance criteria:**
  - [ ] `heartbeat` emitted on the configured idle interval, carrying the current `seq`, with the
        ordering invariant against `stream_idle_timeout_secs()` asserted in a test
  - [ ] Send queue is bounded; token deltas coalesce losslessly under pressure
  - [ ] No lifecycle, token, or tool event is ever dropped by the backpressure policy
  - [ ] Slow consumers are evicted with a typed error; memory returns to baseline
  - [ ] Per-user and global stream caps enforced; oldest-closed-first on per-user overflow
  - [ ] A stalled consumer cannot block the agent loop
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] All existing tests still pass

---

### APTR-18: Clean cancellation — client disconnect actually stops the generation
- **Priority:** Critical
- **Labels:** aperture, bff, streaming, reliability, cost
- **Agent:** claude
- **Review:** high-assurance panel — widen the `review_run` provider list for this item; a shallow implementation here is expensive to discover later.
- **Estimate:** 5h
- **Blocked by:** APTR-15
- **Description:** When a user closes a tab, navigates away, or presses stop mid-generation, the
  generation must **actually stop** — the upstream inference request cancelled, in-flight tool
  calls abandoned at the next safe point, and the turn's partial output persisted rather than
  lost. An orphaned generation burns GPU on a shared, arbitrated pool for output nobody will
  ever read, and it is the classic bug of every naive SSE implementation.

  **Read this before implementing: cancellation is NOT per-disconnect (D3).** The naive rule
  "client disconnect ⇒ cancel" contradicts two other things this sprint promises — resume after a
  drop (APTR-16) and two devices watching one turn (APTR-26). Under the naive rule the first
  disconnect kills generation for the surviving device, and every resume resumes a turn that was
  already cancelled. The binding model instead:
  - A **turn is refcounted by its subscribers.** A transport drop **decrements** the refcount.
  - Cancellation on transport loss happens only when the refcount reaches **zero AND** a grace
    window (config key, default 30s) elapses with no reattachment. The mechanics of the refcount
    and the grace timer are **APTR-121**; this item owns the token, the propagation, and the
    teardown, and consumes the signal APTR-121 produces.
  - **Explicit user "stop generation" cancels immediately and unconditionally**, regardless of
    refcount, grace window, or how many devices are watching. It is a **distinct event** from a
    transport drop — a different route, a different audit entry, and a different terminal reason —
    and it must never be inferred from a disconnect, nor a disconnect from it.
  - Device revocation (APTR-23) also cancels immediately and unconditionally; it is a security
    action, not a transport event.

  ## FILES
  - `contracts/aperture-events-v1.md` — document the `cancelled` terminal reason and the
    partial-persistence guarantee
  - `contracts/aperture-api-v1.yaml` — the explicit `stop` route for the deliberate case
  - **Agent-core repo (sibling PR):** cancellation token plumbing from the SSE responder through
    the turn executor to the `terminus-client` call, and the partial-turn persistence path

  ## APPROACH
  1. Every turn executes under a cancellation token owned by **the turn**, not by any one
     connection — a turn outliving the connection that started it is the normal case now, not an
     edge case. Explicit stop, device revocation (APTR-23), stream reap (APTR-17), and the
     refcount-zero-plus-grace signal from APTR-121 all trip the **same** token: one cancellation
     mechanism with four triggers, not four mechanisms. The trigger is recorded on the token so
     the terminal reason and the audit entry can distinguish them.
  2. Detect disconnect on the write path (a failed send) **and** proactively via the connection's
     closed signal. Relying on write failure alone means an idle-but-dead connection is still
     counted as a live subscriber until the next token, which for a slow first token can be many
     seconds. A detected disconnect **decrements the refcount** — it does not cancel.
  3. Propagate cancellation into the upstream inference request so it is genuinely cancelled, not
     merely ignored locally. Concretely: the deep-tier synthesis runs through
     `ChordClient::chat_completion_streaming` in `crates/lumina-core/src/chord.rs`, so cancellation
     must reach **that** call and stop the body read, not just drop the SSE writer downstream of
     it. **`crates/lumina-core/src/chord.rs` MAY be modified to take a cancellation token
     parameter — this is explicitly permitted (D2), and the previous "`chord.rs` unmodified" grep
     gate is withdrawn.** What remains prohibited is a *second SSE frame parser*: the token
     parameter threads through the existing `chat_completion_streaming` and `ChatSseState` path,
     and adding a parameter must not fork the parsing. Every existing caller keeps compiling — add
     the parameter in a way that gives current callers a non-cancelling default rather than
     rewriting each call site. Assert with a test that observes the upstream request terminate —
     **a locally-dropped
     future that leaves the backend generating is exactly the bug this item forbids**, and it is
     especially costly here because the GPU is a shared, arbitrated, idle-reaped pool.
     Note this is distinct from the existing LSTR-02 inactivity timeout: that fires when the
     *upstream* goes quiet; this fires when the *client* goes away. Both must end the same call
     cleanly, and neither may leave the other's teardown half-run.
  4. In-flight tool calls are abandoned **at the next safe point**, never mid-write. A tool with
     side effects must complete or roll back its current operation; cancellation is cooperative
     for tools and pre-emptive only for pure inference. Document which is which.
  5. Persist the partial assistant turn to the conversation buffer with an explicit
     `cancelled` marker so the transcript reflects what actually happened. It flows through the
     normal conversation buffer and Engram flush path — **cancellation must not bypass memory**,
     or the assistant develops holes in its recollection of the conversation.
  6. Cancellation is idempotent and racy-safe: cancelling an already-finished turn is a no-op,
     and a token arriving after cancellation is discarded, not emitted.
  7. Emit `message.end` with reason `cancelled` if the socket is still writable; if it is not,
     still run the full server-side teardown. Teardown must never depend on the client being there.

  ## TEST PLAN
  - Integration: sole subscriber disconnects and does not return; assert the upstream request is
    cancelled once the grace window elapses, and **not before**
  - Integration: one of two subscribed devices disconnects; assert generation continues
    uninterrupted for the survivor and no cancellation occurs
  - Integration: sole subscriber disconnects and reattaches within the grace window; assert no
    cancellation, no gap, and no duplicate token
  - Integration: explicit stop mid-generation; assert cancellation is immediate regardless of
    refcount, and `message.end` carries reason `cancelled` with the stop trigger recorded
  - Unit: an explicit stop and a transport drop produce **distinct** triggers/terminal records;
    neither is ever inferred from the other
  - Integration: partial output is persisted to the conversation buffer with the cancelled marker
    and reaches the Engram flush path
  - Unit: cancelling twice is a no-op; a post-cancellation token is discarded, not emitted
  - Unit: disconnect with no pending write still trips cancellation via the closed signal
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - **Negative:** assert that after the last subscriber leaves **and** the grace window expires,
    **zero** further upstream inference tokens are requested — the orphaned-generation regression
    test, and the reason this item exists
  - **Negative:** assert a single disconnect with a surviving subscriber cancels nothing — the
    regression test for the contradiction this revision fixes
  - **Negative:** assert a tool mid-write is not severed — it reaches a safe point before abandon

  ## EDGE CASES
  - Disconnect during the very first token, before `message.start` — teardown must still run and
    still persist an empty cancelled turn, or the thread shows a phantom pending message forever
  - Cancel arriving while a tool result is being framed — finish framing, then stop; a
    half-written frame corrupts the stream for a resuming client
  - A client that reconnects with `Last-Event-ID` **after** an explicit stop — resume must observe
    the cancelled terminal, not restart generation and not resurrect the turn by re-incrementing
    the refcount
  - A reattachment arriving in the same instant the grace window expires — the cancellation
    decision is made once, under the refcount lock; a late reattach onto an already-cancelled turn
    sees the cancelled terminal rather than a half-cancelled stream
  - Cancellation racing `message.end` for a naturally-complete turn — the first terminal wins and
    the second is suppressed; exactly one terminal event per turn, always

- **Acceptance criteria:**
  - [ ] Refcount-zero-plus-grace, explicit stop, revocation, and reap all trip one shared
        cancellation token, with the trigger recorded and distinguishable
  - [ ] A disconnect with a surviving subscriber cancels nothing; a reattach inside the grace
        window cancels nothing
  - [ ] Explicit stop cancels immediately and unconditionally, and is never inferred from a drop
  - [ ] Cancellation propagates to the upstream inference request (a cancellation parameter on
        `chat_completion_streaming` is permitted); zero orphaned generation
  - [ ] Partial turns persist with a `cancelled` marker and still reach the memory flush path
  - [ ] Exactly one terminal event per turn; post-cancellation tokens are discarded; server-side
        teardown completes even when no client is present
  - [ ] No duplicate SSE parsing logic outside `ChatSseState` in new/modified code
  - [ ] No hardcoded infrastructure values in new/modified code, and all existing tests still pass

---

### APTR-19: Client stream consumer — reconnect, resume, de-duplication, and the typed reducer
- **Priority:** Critical
- **Labels:** aperture, web, streaming, sdk
- **Agent:** codex
- **Estimate:** 8h
- **Blocked by:** APTR-16
- **Description:** The client half of the transport. A single, well-tested stream consumer that
  every UI surface in Sprints C–F builds on: it connects, survives network loss with jittered
  backoff, resumes from `Last-Event-ID`, suppresses duplicates and out-of-order arrivals, and
  reduces the typed event union into immutable view state. Getting this right once means no UI
  sprint ever hand-rolls stream handling — and no UI sprint gets to.

  ## FILES
  - `client/src/stream/connection.ts` — connection lifecycle, backoff, resume, teardown
  - `client/src/stream/reducer.ts` — the pure typed reducer over `ApertureEvent`
  - `client/src/stream/store.ts` — the subscribable stream-state store the UI binds to
  - `client/src/stream/dedupe.ts` — sequence-window duplicate and reorder suppression
  - `client/src/stream/index.ts` — the single public entry point
  - `client/src/stream/__tests__/` — the test suite, including a scripted-event harness

  ## APPROACH
  1. Build on the platform `EventSource` where its semantics suffice, and fall back to a
     `fetch`-based reader where request headers are required (auth, explicit resume control).
     Either way the transport is constructed in **exactly one file**, consistent with the
     APTR-07 rule that `fetch` lives in one place. URLs are built from the **injectable transport
     base URL** (D1): empty for web/PWA targets (same-origin relative, cookie auth) and the
     operator-configured endpoint for desktop (bearer auth). **No hardcoded absolute URL and no
     compiled-in default endpoint** — that, not "never an absolute URL", is the rule, because a
     desktop shell's own origin does not resolve to the fleet at all.
  2. Reconnect with **exponential backoff plus full jitter**, capped, with an attempt ceiling
     after which the store enters a `disconnected` state that the UI can surface with a manual
     retry. Never a bare retry loop: a fleet-wide backend blip must not become a thundering herd
     from every open tab.
  3. Track the highest `seq` seen per `stream_id` and persist it across reconnects so
     `Last-Event-ID` is always accurate. Drop any event with `seq <= highest` as a duplicate.
     Hold briefly-out-of-order events in a small window keyed by `seq` and release them in order;
     if the window's low end does not arrive within a bounded wait, declare a gap explicitly
     rather than reordering around it.
  4. Honour the server's explicit `resync` event (APTR-16/APTR-120) by exposing a `gap` flag in
     the store **and** performing the recovery: refetch the affected turn through the minimal
     turn-fetch route from APTR-124, then reconcile. **A gap is surfaced, never smoothed over**,
     and because the route ships in this sprint the recovery path is real rather than aspirational.
     Verify `message.end`'s byte length and content hash against the locally assembled text; a
     mismatch is treated exactly like a `resync` — flag the gap, refetch, reconcile.
  5. The reducer is a **pure function** `(state, event) => state` with exhaustive switching over
     the discriminated union — a new event type added to the contract must produce a TypeScript
     compile error here until handled. That is the mechanism that keeps client and contract from
     drifting.
  6. Reducer semantics: `message.start` opens a message keyed by id; `token` appends a delta;
     `tool.call`/`tool.result` attach to the current message as ordered structured entries;
     `thinking` accumulates into a separately-toggleable region; `message.end` finalizes with
     its terminal reason; `error` attaches a typed error to the message and the connection;
     `context`/`presence` route to their own slices, not into message text.
     **Attribution comes from `origin` and from the event variant — never from payload content**
     (D9). A `tool.result` is stored in the tool slice as inert data; there is no code path by
     which its bytes can be appended to assistant message text, however they are shaped. The
     reducer's switch is on the discriminant only; it never sniffs a payload to decide where
     something goes.
  6b. Transport decision, frozen here so two implementers do not choose differently: use the
     **fetch-reader path everywhere** and **disable `EventSource`'s built-in auto-reconnect**.
     The custom backoff owns reconnection; the server's `retry:` field is informational and does
     not override the client's ceiling. Record this in the contract, not just in code.
  7. Visibility-aware: on tab hide, keep the connection but stop rendering work; on tab restore
     after a long hide, reconnect-and-resume rather than assuming the socket is still live.
  8. No telemetry, no analytics, no external fetch of any kind. Ever.

  ## TEST PLAN
  - Unit: scripted event sequence produces exactly the expected reduced state (golden test)
  - Unit: a duplicate `seq` is dropped; an out-of-order `seq` inside the window is reordered;
    a permanently missing `seq` surfaces a gap
  - Unit: backoff is exponential with jitter, capped, and stops at the attempt ceiling
  - Unit: reducer exhaustiveness — a synthetic unhandled event type fails typechecking
  - Unit: `token` deltas concatenate to the exact original text under reordering and duplication
  - Property: sever and resume the stream at **every event boundary** of a scripted turn (and
    mid-frame), asserting the reduced state equals the uninterrupted run in every case — one
    sample point does not catch off-by-one resume bugs
  - Integration: a `resync` event triggers a turn refetch through the APTR-124 route and the
    reconciled state matches the uninterrupted run
  - Unit: a `message.end` whose hash disagrees with the assembled text raises the gap flag
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - **Negative:** assert the consumer never replays a duplicated `token` into the message text,
    and never routes a `tool.result` payload into assistant message text regardless of its shape
  - **Negative:** assert no external origin is contacted (the APTR-01 external-host assertion
    covers the bundle; add a runtime spy asserting the same for this module)

  ## EDGE CASES
  - Reconnect storm from many tabs after a backend restart — jitter plus a per-origin connection
    guard; assert reconnects are spread, not simultaneous. The structural fix (one shared
    connection across tabs, so N tabs are not N reconnects and not N of the browser's ~6
    per-origin connections) is **APTR-129**; this module must be written so that swapping its
    transport for the shared one changes no consumer
  - Browser `EventSource` auto-reconnect fighting the custom backoff — resolved above: built-in
    reconnect disabled, fetch-reader path used, decision recorded in the contract
  - Long hide/restore on mobile where the socket is dead but not reported — treat a missed
    heartbeat window as a dead connection and reconnect proactively
  - A `message.end` arriving twice after a resume replay — the reducer is idempotent per message id
  - A very long turn exceeding the browser's practical buffer — the reducer stores structured
    deltas, and the UI virtualizes; the store must not retain a growing duplicate of the text

- **Acceptance criteria:**
  - [ ] Reconnect uses capped exponential backoff with full jitter and an attempt ceiling;
        `EventSource` auto-reconnect is disabled and the fetch-reader path is used
  - [ ] Resume reproduces the identical final state as an uninterrupted stream, proven by the
        every-boundary property test, not a single sample
  - [ ] Duplicates dropped, in-window reorders corrected; `resync` and hash mismatch both trigger
        an APTR-124 turn refetch and reconcile
  - [ ] Reducer is pure and exhaustive; a new contract event type fails typechecking until handled
  - [ ] Attribution derives from `origin` and the event variant only, never from payload content
  - [ ] Transport constructed in exactly one file, through the injectable base URL of D1 (no
        hardcoded absolute URL, no compiled-in default endpoint)
  - [ ] No telemetry, analytics, or external fetch of any kind
  - [ ] No hardcoded infrastructure values in new/modified code, and all existing tests still pass

---

### APTR-20: First-run onboarding and admin bootstrap
- **Priority:** Critical
- **Labels:** aperture, bff, auth, onboarding, security
- **Agent:** claude
- **Estimate:** 6h
- **Blocked by:** APTR-127
- **Description:** Aperture today has no way to create its first account. Implement the first-run
  flow: an unconfigured instance detects that no administrator exists, offers a one-time
  bootstrap that creates the first admin, and then **permanently closes that door**. This is the
  highest-consequence security surface in the sprint — a bootstrap endpoint that stays open is a
  total compromise, so it fails closed at every ambiguity.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — the bootstrap status and bootstrap-complete routes
  - `client/src/routes/onboarding/` — the first-run screens (state detection, admin creation,
    completion), composed from the APTR-02 primitives
  - `docs/CONFIGURATION.md` — bootstrap-related config keys by name
  - **Agent-core repo (sibling PR):** the bootstrap state machine, admin creation, and the
    single-use guard, reusing the existing user store and onboarding module rather than a new one

  ## APPROACH
  1. `GET /v1/aperture/auth/bootstrap` reports one of `required`, `in_progress`, `complete`.
     It leaks nothing else — no user count, no instance metadata, no version detail to an
     unauthenticated caller.
  2. Bootstrap is permitted **only** when zero administrators exist. The check and the creation
     happen in **one transaction** against the existing user store, so two concurrent bootstrap
     requests cannot both succeed. Test that race explicitly.
     **The transaction is not sufficient on its own — it defeats concurrent attackers, not the
     first one through the door.** As written this design is *first-visitor-wins*: on a
     network-reachable instance, whoever loads the page before the operator becomes the admin.
     The out-of-band bootstrap token that closes that race is **APTR-125**, which must merge with
     or before this item; this item's bootstrap-complete handler takes the token as a required
     parameter and rejects the call without it.
  3. Reuse the existing identity layer — the user store, `ChannelIdentity`, and the existing
     onboarding module. **Do not mint a parallel user table for Aperture.** An Aperture account
     is a Lumina user reached over a new channel, which is precisely why continuity (APTR-28)
     holds.
  4. Credentials are stored as a modern memory-hard password hash with per-user salt and
     parameters recorded alongside the hash so they can be raised later without invalidating
     existing users. **No plaintext, no reversible encoding, no home-grown hashing, ever.**
  5. Enforce a password policy: minimum length well above the legacy norm, a check against a
     bundled list of common passwords (bundled — **no external breach-API call**, that would be
     both a second door and a privacy leak), and rejection of the username as substring.
  6. On success, issue a session (APTR-21) and mark bootstrap `complete` durably. Re-invoking
     bootstrap after completion returns a forbidden problem-details response, **is rate limited**
     (APTR-24) and **is audit-logged through the audit sink defined in APTR-127** — which is a
     real, defined sink as of this revision, not the dangling reference it was.
  7. If the session signing key is absent from the secret store, auth reports capability
     `unavailable` per APTR-11 and bootstrap refuses to run. **Never generate a fallback key** —
     an instance that silently self-signs with an ephemeral key is worse than one that will not start.
  8. The onboarding UI must state plainly that this creates the instance administrator, and must
     not offer a "skip" that leaves the instance open.

  ## TEST PLAN
  - Integration: fresh instance reports `required`; after bootstrap reports `complete`
  - Integration: a second bootstrap attempt after completion is refused and audit-logged
  - Unit: two concurrent bootstrap requests — exactly one succeeds, the other is refused
  - Unit: password policy rejects short, common, and username-derived passwords
  - Unit: stored credential is a memory-hard hash with recorded parameters; the plaintext appears
    nowhere in the store or logs
  - Integration: with the signing key absent, bootstrap refuses and auth reports `unavailable`
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - **Negative:** assert the bootstrap status endpoint reveals no user count, version, or instance
    detail to an unauthenticated caller
  - **Negative:** assert no fallback/ephemeral signing key is ever generated when the secret is missing

  ## EDGE CASES
  - Instance restarted mid-bootstrap — state is derived from "does an admin exist", not from a
    flag file, so a crash cannot strand the instance in `in_progress` forever
  - An operator who deletes the only admin — the instance must not silently reopen bootstrap;
    require an explicit, audited recovery path rather than an automatic reopen
  - A pre-existing Lumina user (from Matrix) present but no Aperture admin — existing users are
    **not** destroyed or reset; the bootstrap grants the admin role, it does not recreate the user
  - Password containing multi-byte characters — normalize consistently before hashing, and test
    round-trip with non-ASCII input

- **Acceptance criteria:**
  - [ ] Bootstrap runs only when zero admins exist, guarded transactionally against races **and**
        gated on the APTR-125 out-of-band token, so first-visitor-wins is closed
  - [ ] Bootstrap closes permanently after completion; re-attempts are refused and written to the
        APTR-127 audit sink
  - [ ] Existing user store reused — no parallel Aperture user table
  - [ ] Credentials stored with a memory-hard hash and recorded parameters; never plaintext
  - [ ] Password policy enforced against a bundled list; no external breach-API call
  - [ ] Missing signing key ⇒ capability `unavailable`; no fallback key is ever generated
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] Secrets accessed via the secret manager, not env vars

---

### APTR-21: Session issuance, refresh, logout, and secure token handling
- **Priority:** Critical
- **Labels:** aperture, bff, auth, security, secrets
- **Agent:** claude
- **Estimate:** 8h
- **Blocked by:** APTR-20
- **Description:** The session layer every authenticated route and every stream depends on:
  login, short-lived access tokens signed with `APERTURE_SESSION_SIGNING_KEY`, rotating refresh
  tokens, logout that genuinely invalidates, and cookie handling that is safe in a browser and
  workable from the desktop shell. Sessions must be **revocable server-side** — a purely
  stateless token that cannot be killed makes device revocation (APTR-23) impossible.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — login, refresh, logout, and session-introspection routes
  - `client/src/auth/session.ts` — client session state, refresh scheduling, 401 handling
  - `client/src/routes/auth/` — login and logout surfaces
  - `docs/CONFIGURATION.md` — access/refresh TTL key names and semantics
  - **Agent-core repo (sibling PR):** session signing/verification, the session record store,
    the refresh-rotation logic, and the auth extractor used by every protected route

  ## APPROACH
  1. The signing key is read **exclusively** via `SecretManager::get()`. Any `std::env::var` of a
     token/key/password/secret-shaped name is a review rejection (skill S7, APTR-11). The key is
     never logged, never in an error body, and its holder type has a redacting `Debug`/`Display`.
  2. Short-lived signed access token + longer-lived refresh token. Every access token carries a
     `session_id` that resolves to a **server-side session record** — that record is what makes
     revocation real. Verification checks the signature *and* the record's live status.
  3. **Refresh tokens rotate on every use** and are single-use. Presenting an already-consumed
     refresh token is treated as theft: invalidate the entire session family, audit-log it, and
     force re-authentication. This is the standard reuse-detection defence and is not optional.
  4. Browser transport: `HttpOnly`, `Secure`, `SameSite=Lax` (or `Strict` where the flow allows)
     cookies scoped to the app path, so the token is never reachable from JavaScript. Desktop and
     PWA use the same cookie flow where the platform allows; where a bearer header is genuinely
     required, the token is held in memory only — **never in `localStorage`**, and a lint asserts it.
  5. State-changing routes are CSRF-protected (double-submit token or origin check, documented in
     the contract). The SSE stream endpoint is included — an EventSource is a GET, but session
     binding must still be verified per connection.
  6. Logout invalidates the session record server-side, clears the cookie, and terminates the
     user's in-flight streams for that session (via the APTR-18 cancellation token). A logout that
     leaves a stream alive is a real leak, not a cosmetic one.
  7. Key rotation: sessions signed with a retired key **fail closed to re-auth**, never silently
     accepted. Support a bounded overlap window keyed by an explicit key id in the token so a
     rotation does not log the whole fleet out at once.
  8. Timing discipline: credential verification is constant-time with respect to whether the user
     exists — a login response must not distinguish "no such user" from "wrong password", by
     content or by latency.

  ## TEST PLAN
  - Unit: token signed with the current key verifies; token signed with a retired key past the
    overlap window is refused
  - Unit: refresh rotates; presenting a consumed refresh token invalidates the whole family and
    audit-logs the reuse
  - Integration: logout invalidates the session, clears the cookie, and terminates in-flight streams
  - Integration: an access token whose session record is revoked fails verification even though its
    signature is valid
  - Unit: cookies carry `HttpOnly`, `Secure`, and the documented `SameSite`
  - Unit: unknown-user and wrong-password logins are indistinguishable in body and in timing
  - `grep` gate: zero `std::env::var` reads of secret-shaped names in new/modified code
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - **Negative:** assert the signing key value appears in no log line, error body, or debug output
  - **Negative:** assert no token is ever written to `localStorage` or `sessionStorage` (lint + test)

  ## EDGE CASES
  - Refresh racing two tabs — both present the same refresh token near-simultaneously; a short
    grace on the immediately-preceding token prevents a false theft alarm, but the grace must be
    tight and tested at both edges
  - Clock skew between issuance and verification — allow a small documented leeway, never unbounded
  - A desktop shell without cookie support for the app origin — the in-memory bearer path covers it;
    assert it never persists to disk
  - Signing key rotated while a stream is open — the stream's session is re-verified on the next
    heartbeat boundary and closed with a typed auth error if it no longer validates
  - Session record store unavailable — **fail closed** (reject the request), never fail open to
    signature-only verification

- **Acceptance criteria:**
  - [ ] Signing key read via the secret manager only; zero `std::env::var` of secret-shaped names
  - [ ] Access tokens bind to a server-side session record; revocation defeats a valid signature
  - [ ] Refresh tokens rotate and are single-use; reuse invalidates the family and is audit-logged
  - [ ] Cookies are `HttpOnly` + `Secure` + `SameSite`; no token ever reaches web storage
  - [ ] Logout invalidates server-side and terminates that session's in-flight streams
  - [ ] Retired-key sessions fail closed to re-auth; session store unavailable fails closed
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] Secrets accessed via the secret manager, not env vars

---

### APTR-22: Multi-user roles and invitations
- **Priority:** High
- **Labels:** aperture, bff, auth, multi-user
- **Agent:** claude
- **Estimate:** 6h
- **Blocked by:** APTR-20, APTR-127
- **Description:** Aperture is the first surface where anyone other than the operator can
  meaningfully use the constellation. That requires a real authorization model: two roles
  (`admin`, `member`), an invite flow so an admin can add a member without sharing credentials,
  and enforcement that is **centralized and default-deny** rather than sprinkled per-route.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — invite create/accept/list/revoke, user list, role change
  - `client/src/routes/admin/users/` — user list, invite management, role assignment
  - `client/src/auth/roles.ts` — client-side role predicates for presentation only
  - **Agent-core repo (sibling PR):** the role model, the authorization guard, and the invite
    store, extending the existing permissions module rather than replacing it

  ## APPROACH
  1. Two roles only, deliberately: `admin` (instance configuration, user management, module
     enablement) and `member` (their own threads, their own settings, their own devices). Resist
     a permission matrix in v1; it is easy to add and painful to remove.
  2. Authorization is a **single guard** applied by default to every `/v1/aperture/*` route, with
     an explicit, reviewable allowlist of unauthenticated routes (bootstrap status, login,
     refresh). **Default-deny:** a newly added route with no annotation is admin-only and is
     covered by a test that enumerates routes and asserts none is accidentally public.
  3. Client-side role predicates are **presentation only**. Every protected action is enforced
     server-side, and a test asserts a `member` calling an admin route is refused regardless of
     what the UI rendered. Hiding a button is not authorization.
  4. Invites are single-use, expiring, high-entropy tokens bound to a role and optionally to an
     email-shaped identifier the operator supplies. The invite record stores a **hash** of the
     token, never the token itself, so a store dump does not yield usable invites.
  5. Accepting an invite creates a Lumina user through the existing user store, with an Aperture
     `ChannelIdentity`. Existing users linking a new channel identity keep everything — see
     APTR-28.
  6. An admin cannot demote or delete the last remaining admin; enforce transactionally, so a
     concurrent double-demotion cannot lock the instance out of administration.
  7. Every role change, invite creation, invite acceptance, and revocation is written to the
     audit sink **defined in APTR-127** (schema, retention, and per-user visibility live there;
     this item is a producer, not a definer) with actor, target, and timestamp — arguments
     sanitized per APTR-10.
  8. **Assistant-operable parity:** user listing, invite creation, and invite revocation are also
     exposed as assistant-invocable operations, not admin-UI-only buttons (Module Contract
     clause 4). The assistant's invocation passes through the identical authorization guard.

  ## TEST PLAN
  - Unit: route enumeration asserts every `/v1/aperture/*` route is authenticated unless explicitly
    allowlisted — the default-deny regression test
  - Integration: `member` calling every admin route is refused with a typed forbidden response
  - Unit: invite token is stored hashed; the plaintext token exists only in the creation response
  - Unit: an expired invite, a consumed invite, and an unknown invite are all refused identically
  - Unit: demoting the last admin is refused, including under concurrent attempts
  - Integration: role change and invite lifecycle events land in the audit log with sanitized args
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - **Negative:** assert a member cannot read another member's threads, devices, or settings
  - **Negative:** assert the assistant-invoked path is subject to the same guard as the HTTP path

  ## EDGE CASES
  - Invite accepted by someone who already has an account — link the Aperture channel identity to
    the existing user; **never create a duplicate user and never reset their memory**
  - Two people racing to accept the same single-use invite — exactly one succeeds, transactionally
  - Role changed while the user has a live session — re-evaluate authorization per request, not
    only at issuance, so a demotion takes effect immediately
  - Invite created and the instance restarted before acceptance — invites are durable, not in-memory
  - **Removing** a member rather than adding one — deliberately not this item's job; account
    deactivation and deletion, and what happens to the deactivated user's threads, devices,
    sessions and read state, are **APTR-126**. This item must not grow a half-implemented delete
  - An email-shaped identifier supplied by the operator — treat as opaque data, never validate
    against or transmit to any external service

- **Acceptance criteria:**
  - [ ] Two roles implemented with a single default-deny guard over all Aperture routes
  - [ ] Route enumeration test proves no route is accidentally unauthenticated
  - [ ] Server-side enforcement independent of UI; member is refused on every admin route
  - [ ] Invites are single-use, expiring, stored hashed, and refused uniformly when invalid
  - [ ] The last admin cannot be demoted or deleted, even under concurrency
  - [ ] User/invite operations are assistant-invocable through the same authorization guard
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] All existing tests still pass

---

### APTR-23: Device registry, listing, and revocation that reaches in-flight streams
- **Priority:** High
- **Labels:** aperture, bff, auth, devices, security
- **Agent:** claude
- **Estimate:** 6h
- **Blocked by:** APTR-21, APTR-127
- **Description:** With web, desktop, and mobile targets, one user will routinely hold four or
  five live sessions. They need to see them and be able to kill one — a lost phone is the
  motivating case. Revocation must be **immediate and total**: the session dies, the refresh
  token dies, and any stream that device is holding open is terminated within a bounded window.
  A revocation that leaves a stream alive is a revocation that did not happen.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — device list, device rename, device revoke, revoke-all-others
  - `client/src/routes/settings/devices/` — the device list and revocation surface
  - **Agent-core repo (sibling PR):** the device record model, the session↔device binding, the
    revocation broadcaster, and the stream-registry hook that enforces it

  ## APPROACH
  1. Every session issued in APTR-21 binds to a device record: stable device id, user-supplied or
     derived label, target kind (`web` / `desktop` / `mobile`), created-at, last-seen, and the
     current session id. **Store a coarse, non-fingerprinting descriptor** — no precise client
     fingerprint, no IP retention beyond what is operationally required and documented. Aperture
     is sovereign and private by construction (Module Contract clause 6); a device list must not
     become a surveillance log.
  2. Device id is generated server-side and delivered to the client with the session; it is not
     derived from client-supplied entropy the user cannot rotate.
  3. Revoking a device: invalidate its session record and refresh family, then publish a
     revocation to the stream registry so every stream owned by that session trips the shared
     cancellation token from APTR-18 and closes with a typed auth `error`. Bound and test the
     propagation window — "eventually" is not an acceptable answer for a lost phone.
     **Revocation cancels immediately and unconditionally** — it does **not** wait for the
     refcount grace window of APTR-121, and it is not a transport drop. A turn that another of the
     user's devices is still watching keeps running for that device; only the revoked device's
     subscription dies. Both halves of that sentence are tested.
  4. `revoke-all-others` is a single audited operation that leaves the calling session alive.
     Offer it prominently in the UI; it is the action a user actually wants after a device loss.
  5. Revocation is idempotent; revoking an already-revoked device is a no-op success.
  6. A user may revoke only their own devices. An admin may revoke another user's devices, and
     every such cross-user action is written to the APTR-127 audit sink with actor and target.
     Because APTR-127 makes a user's own security events visible to them, a user can see that a
     device of theirs was revoked and by whom-class (self vs. admin) — revocation is not silent.
  7. Last-seen updates are **throttled**, not written per request — an unthrottled last-seen turns
     the device table into a write-amplification hot spot on every streamed token.
  8. **Assistant-operable parity:** listing and revoking devices are assistant-invocable, subject
     to the same guard (Module Contract clause 4).

  ## TEST PLAN
  - Integration: revoke a device holding an open stream; assert the stream closes with a typed auth
    error within the bounded propagation window — the headline test of this item
  - Integration: revoked device's refresh token is refused and its access token fails verification
  - Unit: revocation is idempotent; a second revoke is a no-op success
  - Unit: a user cannot revoke another user's device; an admin can, and it is audit-logged
  - Unit: last-seen writes are throttled (N streamed events produce at most one write per window)
  - Unit: the device record contains no precise fingerprint and no retained network address beyond
    the documented field set
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - **Negative:** assert a revoked device cannot resume a stream via `Last-Event-ID` — resume
    re-authorizes per APTR-16 and must refuse
  - **Negative:** assert revoking one device does not disturb the user's other live streams

  ## EDGE CASES
  - Device revoked while it is mid-reconnect-backoff — the reconnect must fail with a typed auth
    error and stop retrying rather than backing off forever against a dead session
  - Same physical device reinstalled — a new device record; do **not** attempt to re-identify a
    device across installs, which would require exactly the fingerprinting this item forbids
  - A user revoking their own current session — treat as logout, and say so in the UI
  - Very large device list from a user who never prunes — paginate, and offer bulk revoke-others
  - Revocation broadcast lost due to a restart — sessions are checked against the store on
    reconnect, so a restart closes the window rather than reopening it

- **Acceptance criteria:**
  - [ ] Every session binds to a device record with a coarse, non-fingerprinting descriptor
  - [ ] Revocation kills session, refresh family, and in-flight streams within a bounded window
  - [ ] A revoked device cannot resume a stream via `Last-Event-ID`
  - [ ] `revoke-all-others` works, is audited, and preserves the calling session
  - [ ] Cross-user revocation is admin-only and audit-logged; revocation is idempotent
  - [ ] Last-seen updates are throttled; devices are assistant-invocable to list and revoke
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] All existing tests still pass

---

### APTR-24: Rate limiting and abuse protection on the auth surface
- **Priority:** High
- **Labels:** aperture, bff, auth, security, reliability
- **Agent:** claude
- **Review:** high-assurance panel — widen the `review_run` provider list for this item; a shallow implementation here is expensive to discover later.
- **Estimate:** 5h
- **Blocked by:** APTR-21, APTR-128
- **Description:** The auth endpoints are the instance's only unauthenticated attack surface.
  Without limits, login is an online password-guessing oracle and refresh is a free CPU sink.
  Add layered, fail-closed rate limiting and abuse protection — and make the limiter itself
  incapable of becoming a denial-of-service vector against legitimate users.

  ## FILES
  - `contracts/aperture-errors-v1.md` — the rate-limit URN, its `Retry-After` semantics, and what
    a client should do about it
  - `docs/CONFIGURATION.md` — limiter window, burst, and lockout key names — names only
  - `client/src/auth/session.ts` — client-side handling of a rate-limited response (surface, back
    off, never hammer)
  - **Agent-core repo (sibling PR):** the limiter middleware, the per-account failure tracker, and
    the audit hooks

  ## APPROACH
  1. Two independent dimensions, because either alone is trivially bypassed: **per-source** (a
     coarse network identity, to stop one host brute-forcing many accounts) and **per-account**
     (to stop a distributed attack on one account). Both must trip.
     **"Per-source" is meaningless until the proxy question is answered, and it is answered in
     APTR-128, not here.** Behind a reverse proxy every request arrives from the same peer
     address, so a naive implementation is either one shared bucket for the whole instance
     (useless) or blindly trusts `X-Forwarded-For` (spoofable — an attacker mints a fresh source
     per attempt and the limiter never trips). This item **consumes** the trusted-proxy-derived
     source identity that APTR-128 provides and must not invent its own.
  2. Token-bucket with a burst allowance, so a user fat-fingering a password twice is not punished
     while a scripted attempt is throttled within a few tries.
  3. Progressive delay then temporary lockout on repeated per-account failure. Lockout is
     **time-bounded and self-clearing** — a permanent lockout triggered by an attacker is itself
     the denial of service. Expose the remaining window through `Retry-After`.
  4. Cover login, refresh, invite acceptance, bootstrap, and password change **and** admin-initiated
     password reset — all of which are built in APTR-125/APTR-126, so this item's coverage list is
     no longer referencing routes that nothing creates. Deliberately do
     **not** rate-limit the SSE stream by request count — that is APTR-17's connection budget, and
     conflating them would throttle legitimate reconnects during a network blip.
  5. Responses are uniform: a rate-limited login must not reveal whether the account exists, and
     must not differ in timing (pairs with APTR-21's constant-time verification).
  6. Limiter state is in-process with a bounded, evicting map. **No external dependency is
     introduced for this** — a new backing service would be a second door and a new failure mode.
     Document the single-instance assumption explicitly so a future multi-instance deployment
     revisits it deliberately rather than discovering it.
  7. **Fail closed:** if the limiter's own state is unavailable or corrupt, deny rather than allow.
     An open limiter is the same as no limiter.
  8. Sustained abuse is written to the APTR-127 audit sink once per window with a counter, not
     once per attempt — per-attempt logging is itself an amplification vector against the log.
     Counters for limiter trips and lockouts are exported to the operational surface in APTR-130,
     because these thresholds are otherwise tuned blind.

  ## TEST PLAN
  - Unit: burst allowance permits a small number of rapid attempts, then throttles
  - Unit: per-source and per-account limits trip independently — a distributed attack on one
    account is caught by the account dimension
  - Unit: lockout is time-bounded and self-clears; `Retry-After` reflects the true remaining window
  - Unit: rate-limited responses do not distinguish existing from non-existent accounts
  - Unit: the limiter map is bounded and evicts — a million distinct sources do not exhaust memory
  - Integration: the client surfaces a rate-limited response and backs off rather than retrying
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - **Negative:** assert a corrupt/unavailable limiter state **denies** rather than allows
  - **Negative:** assert stream reconnects are not throttled by the auth limiter during a simulated
    network blip

  ## EDGE CASES
  - Many legitimate users behind one shared network path — the per-source dimension must be
    generous enough to not lock out a household or office; document the tradeoff
  - An attacker deliberately locking out a known account — progressive delay with a bounded
    self-clearing lockout, never an admin-unlock-required state
  - Clock adjustment moving a lockout window — use a monotonic clock for window arithmetic
  - Limiter contention under load becoming its own bottleneck — sharded or lock-light structure;
    assert throughput does not collapse under concurrent attempts
  - A legitimate scripted client (the desktop shell refreshing on wake) tripping the refresh limit —
    refresh limits are per-session-family and sized for real device counts

- **Acceptance criteria:**
  - [ ] Per-source and per-account limiting both enforced, tripping independently, with source
        identity taken from the APTR-128 trusted-proxy resolution rather than invented here
  - [ ] Progressive delay and a time-bounded, self-clearing lockout with accurate `Retry-After`
  - [ ] Login, refresh, invite acceptance, bootstrap, and password change all covered
  - [ ] Rate-limited responses reveal nothing about account existence, in body or timing
  - [ ] Limiter state is bounded and evicting; no external dependency introduced
  - [ ] Limiter failure denies rather than allows; abuse is audit-logged per window, not per attempt
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] All existing tests still pass

---

### APTR-25: Multi-device sync — read/unread and thread position, modelled explicitly
- **Priority:** High
- **Labels:** aperture, bff, sync, multi-device
- **Agent:** claude
- **Estimate:** 6h
- **Blocked by:** APTR-21
- **Description:** Matrix gives read receipts and per-device read markers for free, and the moment
  Aperture becomes a second surface that convenience disappears unless it is built. Model it
  explicitly: per-user-per-thread read position, unread counts, and last-viewed thread state that
  converges across devices without a server round-trip on every scroll tick.

  This is a **Matrix-parity** item, not a Matrix-replacement item. Matrix keeps its own receipts
  untouched; this state is Aperture's, and where a thread is shared across both transports the
  two must not fight (see edge cases).

  ## FILES
  - `contracts/aperture-api-v1.yaml` — read-position read/write routes and the sync payload shape
  - `contracts/aperture-events-v1.md` — the `context` sub-shape carrying a read-position update
  - `client/src/sync/readState.ts` — client read-state store, debouncing, and optimistic update
  - **Agent-core repo (sibling PR):** the read-position store, the convergence rule, and the
    fan-out onto the user's other live streams

  ## APPROACH
  1. Model per `(user_id, thread_id)`: the highest-read message position, a last-updated stamp,
     and the originating device. Unread counts are **derived** from that position, never stored
     independently — two sources of truth for a counter always diverge.
     **The position domain is a server-assigned, monotonic, per-thread message index**, contracted
     as such in `contracts/aperture-api-v1.yaml`. Not a client-observed ordinal, not a timestamp,
     not an offset into a rendered list: those disagree between devices and do not survive edits,
     deletions, or thread compaction, and "highest read" needs a total order every device agrees
     on. The index is allocated where the message is persisted, so every channel — including
     Matrix-originated messages in a shared thread — gets one.
  2. Convergence rule: **monotonic maximum wins.** A device reporting an *older* position never
     moves the marker backwards. This makes the operation idempotent, commutative, and safe to
     replay after a reconnect — which is exactly what a flaky mobile client will do.
  3. Provide an explicit "mark unread" that sets the position backwards deliberately, carried as a
     distinct operation with its own stamp so it is not swallowed by the monotonic rule. A user
     choosing to mark unread is intent, not a stale write.
  4. Client writes are **debounced and coalesced** — scrolling emits one write per settle window,
     not per frame. Optimistic local update, reconciled from the server's echo. Where several tabs
     of one device are open, the write is issued by the leader tab only (APTR-129); the monotonic
     rule makes a duplicate write harmless, but N tabs writing per scroll is still N times the
     load for no benefit.
  5. Updates fan out to the user's other live streams as a `context` event so a second device
     updates without polling. Fan-out is scoped strictly to that user's own streams.
  6. Last-viewed thread and thread-list ordering hints ride the same mechanism, so "open where I
     left off" works across web, desktop, and PWA.
  7. Presence-adjacent but **not** notifications: this item ships no tray, no badge-driven alert
     path, and no push. Unread counts are state the shell may render; any *knock* remains the
     assistant's prioritized presence budget with quiet hours and opt-out (Soul Contract clause 2,
     Sprint F for transport).
  8. All state is per-user and default-private. No cross-user read visibility in v1 — Aperture does
     not tell another user when you read something.

  ## TEST PLAN
  - Unit: monotonic maximum convergence — out-of-order and duplicated updates yield the same result
  - Unit: explicit mark-unread moves the position backwards and survives a subsequent stale update
  - Unit: unread counts derive from position; no independent counter exists in the store
  - Integration: two simulated devices converge to the same read state without a manual refresh
  - Integration: a read-position change fans out as a `context` event to the same user's other
    streams and to no one else's
  - Unit: client write debouncing — a burst of scroll events produces one server write
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - **Negative:** assert a stale position from a slow device never moves the marker backwards
  - **Negative:** assert no read-state event is ever delivered to a different user's stream

  ## EDGE CASES
  - A thread carried on both Matrix and Aperture — Aperture's marker is authoritative for Aperture
    surfaces only; **do not write to or overwrite Matrix receipts**, and document the two-marker
    reality rather than papering over it
  - Device offline for a long period then reconnecting with a stale position — monotonic rule
    handles it with no special case, which is the point of choosing it
  - Message deleted or a thread compacted below the stored position — clamp to the current head
    rather than showing a negative or absurd unread count
  - A very large thread list — the sync payload must paginate or delta rather than sending all
    positions on every connect
  - Clock skew between devices — convergence uses position ordering, not wall-clock, with the stamp
    used only for the deliberate mark-unread case

- **Acceptance criteria:**
  - [ ] Read position stored per user-per-thread over a **server-assigned monotonic per-thread
        message index**; unread counts derived, never stored separately
  - [ ] Convergence is monotonic-maximum: idempotent, commutative, replay-safe
  - [ ] Explicit mark-unread is honoured and not swallowed by a stale update
  - [ ] Updates fan out as `context` events to the same user's streams only
  - [ ] Client writes are debounced and optimistically applied, then reconciled
  - [ ] Matrix receipts are never written to or overwritten; no cross-user read visibility
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] All existing tests still pass

---

### APTR-26: The `aperture` Channel adapter — one agent loop, not a parallel path
- **Priority:** Critical
- **Labels:** aperture, channels, rust, lumina-core, architecture
- **Agent:** claude
- **Review:** high-assurance panel — widen the `review_run` provider list for this item; a shallow implementation here is expensive to discover later.
- **Estimate:** 6h
- **Description:** This is the architecturally load-bearing item of the sprint. The agent core
  already has an `EDGE-08` `Channel` trait and a `ChannelRegistry` in which Matrix, CLI, HTTP, and
  (feature-gated) Telegram adapters all feed a single shared `mpsc::Sender<ChannelMessage>`, so
  **every message crosses the same guarded pipeline regardless of origin** — input guard, tool
  gate, router rules, cost caps, audit log, conversation buffer, Engram flush.

  Aperture registers into that registry as the `aperture` channel. It does **not** get its own
  inference path, its own tool dispatch, or its own memory write path. An implementation that
  calls the model directly from the BFF, bypassing the agent loop, is rejected outright — it
  would fork the assistant's guarding, its memory, and ultimately its personality.

  **The token-level hook already exists — this item wires it, it does not invent it.**
  `agent_loop.rs` already invokes `ChordClient::chat_completion_streaming` behind the
  `router.stream_deep` flag with `crate::config::stream_idle_timeout_secs()`, passing an
  `on_delta` callback that is **currently a no-op `|_delta| {}` closure**, with an in-code comment
  stating that LSTR-03 wires the incremental emit through exactly that callback. So the work here
  is *routing*: replace the no-op with a fan-out that publishes each delta to a per-turn
  broadcast the SSE endpoint (APTR-15) subscribes to. `ChatSseState` already turns upstream frames
  into deltas correctly.

  **The prohibition here is narrowed — read the corrected form (D2).** An earlier instruction said
  "no new agent-loop hook, `chord.rs` unmodified", and that absolute produced three contradictions
  in review. What actually holds:
  - **Prohibited:** a **second token path**, and a **second SSE frame parser**. `ChatSseState` is
    reused as-is and remains the only SSE parsing logic in the crate.
  - **Prohibited:** any inference or tool path that bypasses the guarded agent loop. This is
    unchanged and remains the item's central assertion.
  - **Permitted and required:** additional producers for `tool.call`, `tool.result`, `thinking`,
    and turn-lifecycle events, publishing into the **same per-turn fan-out** this item builds.
    They are implemented in APTR-122; this item's job is to make the fan-out able to carry them —
    a typed event, not a bare string — so APTR-122 adds producers without reshaping anything.
  - **Permitted:** a cancellation token parameter on `chord.rs` (APTR-18). **The
    "`chord.rs` unmodified" grep gate is WITHDRAWN.** It is replaced by:
    *no duplicate SSE parsing logic anywhere outside `ChatSseState`.*
  The reviewer verifies both directions: that the existing delta hook was used rather than a
  second token path, *and* that no parallel inference path was built around the loop.

  ## FILES
  - `docs/ARCHITECTURE-CHANNELS.md` (this repo) — the adapter's place in the registry, the
    message/response flow, and an explicit statement of the no-parallel-path rule for reviewers
  - **Agent-core repo (sibling PR):** `crates/lumina-core/src/channels/aperture.rs` implementing
    `Channel`; registration in `crates/lumina-core/src/channels/mod.rs`; an `Aperture` variant
    added to `ChannelType` in `crates/lumina-core/src/users/identity.rs`; the per-turn delta
    fan-out; and a **small, surgical edit at the existing `stream_deep` call site in
    `crates/lumina-core/src/agent_loop.rs`** replacing the no-op `|_delta| {}` closure with the
    publishing closure. `crates/lumina-core/src/chord.rs` may be touched **only** to thread the
    APTR-18 cancellation parameter; it must not gain parsing logic, a second callback, or a second
    streaming entry point

  ## APPROACH
  1. Implement `Channel` for an `ApertureChannel`: `name()` returns `"aperture"`; `start()` wires
     the BFF's inbound message queue into the shared `mpsc::Sender<ChannelMessage>`; `stop()`
     drains and closes cleanly.
  2. Inbound: a REST message post becomes a `ChannelMessage` with `source_channel: "aperture"`,
     the resolved Lumina `user_id` as `sender_id`, and a `MessageContext` carrying `thread_id` and
     `request_id` so the response can be routed back to the right stream. Reuse the existing
     context fields — do not widen the struct unless genuinely required, and if widened, keep every
     existing channel compiling and behaving identically.
  3. Outbound: `send_response` is the aggregate path (a whole response), but Aperture's value is
     *streaming*. Bridge these by having the adapter register a per-turn emitter handle keyed by
     `request_id`, and **publish into it from the existing `on_delta` callback**: at the
     `router.stream_deep` call site in `agent_loop.rs`, replace the current no-op `|_delta| {}`
     with a closure that looks up the emitter for the in-flight turn and pushes the delta as a
     `token` event. `send_response` then finalizes the turn (`message.end`). The fan-out is a
     bounded broadcast so multiple subscribers (two devices on one turn) each receive it, and so a
     slow subscriber applies the APTR-17 backpressure policy instead of blocking the loop. It
     carries a **typed event**, not a bare string, so APTR-122's `tool.call` / `tool.result` /
     `thinking` / lifecycle producers publish into the identical fan-out without a second channel.
     The fan-out also owns the **subscriber refcount** APTR-121 and APTR-18 key off: subscribe
     increments, drop decrements.

     **The `on_delta` closure must never block, never panic, and never fail the turn (D2), and
     this is the hardest rule in the item to satisfy by accident.** It executes *inside the
     upstream body-read loop*. If it blocks, the read loop stalls — which stalls the turn for
     **every** channel, Matrix and CLI included, not just Aperture. Concretely: publish through a
     **bounded, non-blocking** sender; on a full buffer **drop the delta**, never await capacity,
     never `block_on`, never take a lock that another task can hold across an await; no `unwrap`,
     `expect`, indexing, or arithmetic that can panic; no allocation-heavy formatting on the hot
     path; and no error propagated out of the closure. With no live subscriber the delta is
     dropped and the turn still completes normally through the buffered path, exactly as today —
     preserving current Matrix/CLI behaviour byte-for-byte, which is the whole reason the edit is
     surgical rather than structural. A slow Aperture subscriber must be **structurally incapable**
     of degrading another channel.
  4. With `router.stream_deep` off, `on_delta` is never invoked — no deltas exist to route. The
     adapter then emits the completed response as a single `token` followed by `message.end`,
     which is the contracted behaviour from APTR-15. Aperture streaming is therefore *dependent*
     on that flag by design (see Pre-flight); it must not open its own second inference call to
     get finer granularity, which would be precisely the parallel path this item forbids.
  5. Add `ChannelType::Aperture` to the identity enum with its `as_str`/`from_db_str` mappings. The
     enum already has an `Other(String)` catch-all — **do not** ship Aperture as `Other("aperture")`;
     a first-class channel gets a first-class variant, and existing rows must continue to
     round-trip unchanged.
  6. An Aperture account resolves to a Lumina `user_id` via `ChannelIdentity`, exactly as Matrix and
     Telegram do. One user, many channel identities. This is what makes APTR-28's continuity
     property true by construction rather than by careful copying.
  7. Registration is feature-gated consistently with the BFF's `aperture` cargo feature, so a build
     without the feature is byte-compatible with today's binary and the Matrix path is untouched.
  8. Failure isolation: an Aperture adapter failing to start must not prevent Matrix or CLI from
     starting — the registry already logs and continues, and a test must assert that behaviour is
     preserved.

  ## TEST PLAN
  - Unit: `ApertureChannel` implements `Channel`; `start`/`stop` are clean and idempotent
  - Integration: a message posted through the BFF traverses the **same** guarded agent-loop path as
    a Matrix message — assert the input guard, tool gate, and audit log all observe it
  - Integration: with `router.stream_deep` on, deltas delivered through the existing `on_delta`
    callback reach the SSE emitter as `token` events and the turn finalizes through `send_response`
  - Integration: with `router.stream_deep` off, the turn arrives as one `token` plus `message.end`
  - Unit: with no live subscriber, the publishing closure drops the delta and the turn still
    completes normally — Matrix/CLI behaviour is unchanged
  - `grep` gate (**replaces the withdrawn "`chord.rs` unmodified" gate**): no SSE frame-parsing
    logic exists anywhere outside `ChatSseState` — assert on the whole diff, not just the new
    module. Any `chord.rs` diff is limited to the cancellation parameter and is called out in the
    PR body
  - Unit: the fan-out carries a typed event and accepts a non-token variant without reshaping, so
    APTR-122's producers attach to it unchanged
  - Unit: the publishing closure is non-blocking under a full buffer — a full-capacity fan-out
    drops the delta and returns immediately; assert with a timing bound, not by inspection
  - **Negative:** a subscriber that never reads cannot slow a concurrent Matrix turn — measure the
    Matrix turn's completion with the Aperture subscriber wedged, and assert it is unaffected
  - **Negative:** a panicking subscriber-side handler does not propagate out of `on_delta` and
    does not fail or truncate the turn for any channel
  - Unit: `ChannelType::Aperture` round-trips through `as_str`/`from_db_str`; existing stored values
    for matrix/telegram/http round-trip unchanged
  - Unit: one user with Matrix and Aperture identities resolves to a single `user_id`
  - Integration: feature-off build compiles and behaves identically to the pre-change binary
  - Integration: Aperture failing to start leaves Matrix and CLI running
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - **Negative — the item's central assertion:** assert the BFF constructs **no** inference or tool
    call of its own. A grep gate plus a behavioural test proving that with the agent loop stubbed
    out, an Aperture message produces **no** model output by any other route
  - **Negative:** assert no existing channel's behaviour changes (Matrix regression suite green)

  ## EDGE CASES
  - Two Aperture devices sending concurrently for the same user — each turn keys off its own
    `request_id`; responses must not cross-deliver to the wrong stream
  - A response arriving after its stream has closed (client gone) — persist the turn and drop the
    delivery; never panic, never block the loop (pairs with APTR-18)
  - The `MessageContext` lacking a field Aperture needs — extend deliberately with defaults so every
    existing channel compiles unchanged; a breaking struct change to a shared type is a review flag
  - Backpressure from the shared `mpsc` channel under load — apply the APTR-17 policy at the BFF
    boundary rather than blocking the loop's sender
  - The `on_delta` closure is called from inside the upstream body-read loop, so **any blocking or
    panicking there stalls or kills the turn for every channel, not just Aperture**. Publish into
    a bounded non-blocking sender and drop on overflow; assert a wedged Aperture subscriber cannot
    slow a Matrix turn
  - A turn where `stream_deep` is on but the upstream ignored `stream: true` (`saw_frame == false`)
    — `on_delta` fires once or not at all; the adapter must still produce a well-formed turn
  - A user whose Aperture identity exists but whose Lumina user was removed — fail closed with a
    typed auth error; **never auto-create a replacement user**, which would present as amnesia

- **Acceptance criteria:**
  - [ ] `ApertureChannel` implements `Channel` and registers in the existing `ChannelRegistry`;
        `ChannelType::Aperture` is a first-class variant and existing identity rows round-trip
  - [ ] Aperture messages traverse the identical guarded agent loop as every other channel
  - [ ] The BFF constructs no independent inference or tool path — proven by grep gate and test
  - [ ] Streaming is wired through the **existing** `on_delta` callback at the `stream_deep` call
        site — no second token path and **no duplicate SSE parsing outside `ChatSseState`** (the
        "`chord.rs` unmodified" gate is withdrawn; a cancellation parameter there is permitted)
  - [ ] The publishing closure is non-blocking and panic-free, drops on a full buffer, and is
        proven unable to stall or fail a turn for any channel — Matrix included
  - [ ] The per-turn fan-out carries typed events and owns the subscriber refcount, so APTR-122's
        non-token producers and APTR-121's grace-window logic attach without reshaping it
  - [ ] Feature-off build is byte-compatible; Matrix and CLI unaffected by an Aperture start failure
  - [ ] No hardcoded infrastructure values in new/modified code, and all existing tests still pass

---

### APTR-27: Channel policy realized — Matrix retained, Telegram promoted, Signal stubbed inert
- **Priority:** High
- **Labels:** aperture, channels, telegram, signal, matrix, docs
- **Agent:** claude
- **Estimate:** 6h
- **Blocked by:** APTR-26
- **Description:** Implement the epic's channel policy table exactly, no more and no less.
  **Matrix stays first-class and unchanged.** **Telegram** is promoted from a bare feature gate to
  a documented, selectable, **off-by-default** option — the adapter is already real (a substantial,
  working implementation, not a stub), so this exposes and documents it rather than rewriting it.
  **Signal is a stub only**: a skeleton, a capability descriptor reporting `unavailable`, config key
  *names*, and a test asserting it stays inert.

  The Signal scope boundary is absolute and is the reason this item names it in the title: **no
  account provisioning, no phone-number registration, no credential handling, no live send or
  receive, no linked-device flow.** An implementation that does any of those is out of scope and
  must be rejected in review even if it works.

  ## FILES
  - `docs/CHANNELS.md` (this repo) — the policy table, how to enable Telegram, why Signal is inert,
    and the explicit statement that Matrix is retained and not deprecated
  - `README.md` — channel policy section updated to match
  - **Agent-core repo (sibling PR):** promote the Telegram adapter to a runtime-selectable channel
    with a default-off config switch; add `crates/lumina-core/src/channels/signal.rs` as an inert
    skeleton implementing `Channel` and reporting `unavailable`; register both through the module
    descriptor mechanism from APTR-08

  ## APPROACH
  1. **Matrix:** touch nothing functional. Add a regression assertion that the Matrix adapter starts,
     registers, and round-trips a message exactly as before. Any diff to the Matrix adapter beyond
     comments or shared-type accommodation is a review flag.
  2. **Telegram — expose, do not rewrite.** Keep the cargo feature for compile-time inclusion, and
     add a **runtime** enablement switch that defaults to **off**. Enabling it requires the operator
     to turn it on *and* for the adapter's credential to be present in the secret store — read via
     `SecretManager::get()`, **never** `std::env::var`, and never authored into a file. With the
     feature compiled in but the switch off, the adapter must not start, must not connect, and must
     report `unavailable` in its descriptor.
  3. **Enabling Telegram requires an explicit in-product consent step**, not just a config switch:
     the enable flow states plainly what leaves the sovereignty boundary (conversation content) and
     what the third party sees, and requires a deliberate confirmation. A doc is not read at the
     moment of decision; this is the one place in the sprint where a real sovereignty exception is
     turned on, so it is confirmed where it is turned on.
  4. **Telegram documentation** is the real deliverable here: what it is for, its privacy posture
     relative to Matrix, the config key names, how to enable it, how to disable it, and that it is
     off by default. Written for the public mirror — key names and placeholders only.
  5. **Signal — inert skeleton.** Implement `Channel` with `name()` returning `"signal"`, a `start()`
     that logs once and returns without connecting to anything, a `send_response()` that returns a
     typed capability-unavailable error, and a `stop()` that is a no-op. Declare the config key
     **names** it will one day need, documented as reserved and non-functional. **No network client
     is constructed. No credential is read. No number is registered.**
  6. Signal's module descriptor reports `unavailable` with the reason "deferred by operator
     decision", so the shell renders an inert explained tile per APTR-08 rather than a broken screen.
  7. `ChannelType` gains a `Signal` variant only if it can be added without implying support; if in
     doubt, leave Signal out of the identity enum entirely until it is real. Record the decision in
     `docs/CHANNELS.md`.
  8. Every channel appears in the module descriptor list with an accurate capability state, so the
     shell's channel settings surface is derived from descriptors, never a hardcoded list.

  ## TEST PLAN
  - Integration: Matrix regression — starts, registers, round-trips a message unchanged
  - Unit: Telegram with the runtime switch off does not start and reports `unavailable`
  - Unit: Telegram with the switch on but the credential absent reports `unavailable` with a clear
    reason and does **not** start with a placeholder credential
  - Unit: Telegram credential is read via the secret manager; grep gate asserts no `std::env::var`
    of a secret-shaped name
  - Unit: the Signal adapter's `start()` opens no connection and its `send_response()` returns a
    typed capability-unavailable error
  - Unit: Signal's descriptor reports `unavailable` with a reason
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - **Negative — the Signal inertness test:** assert the Signal module constructs no network client,
    reads no credential, and performs no registration; a source-level assertion plus a behavioural
    test that `start()` produces zero outbound activity
  - **Negative:** assert Telegram is off in a default configuration — a fresh instance with no
    channel configuration starts Matrix and Aperture only

  ## EDGE CASES
  - Telegram compiled out entirely — the descriptor must still be present and report `unavailable`,
    so the settings surface explains the absence rather than hiding the channel
  - An operator enabling Telegram with a malformed credential — fail to `unavailable` with a clear
    reason; never retry-loop against the upstream, and never log the credential
  - Someone later extending the Signal stub — `docs/CHANNELS.md` must state the scope boundary
    explicitly so a future agent does not treat the skeleton as an invitation
  - Signal's presence in the descriptor list tempting the UI into rendering an enable toggle — the
    descriptor must mark it non-configurable, not merely unavailable
  - A shared-type change from APTR-26 touching the Matrix adapter — permitted only as a mechanical
    accommodation, and called out explicitly in the PR body

- **Acceptance criteria:**
  - [ ] Matrix is functionally unchanged and covered by a passing regression assertion
  - [ ] Telegram is runtime-selectable and **off by default** (off means not started, not
        connected), and enabling it requires an explicit consent step stating what leaves the boundary
  - [ ] Telegram credentials read via the secret manager only; absent credential ⇒ `unavailable`
  - [ ] Signal ships as an inert skeleton with a descriptor reporting `unavailable` and a reason
  - [ ] Signal performs no provisioning, registration, credential read, or network activity — tested
  - [ ] `docs/CHANNELS.md` documents the policy, the Telegram enablement steps, and the Signal boundary
  - [ ] No hardcoded infrastructure values in new/modified code; all existing tests still pass
  - [ ] README updated to document the channel policy and Telegram's off-by-default status

---

### APTR-28: CONTINUITY — adding Aperture must not reset memory, traits, or relationship lore
- **Priority:** Critical
- **Labels:** aperture, continuity, soul-contract, memory, engram
- **Agent:** claude
- **Review:** high-assurance panel — widen the `review_run` provider list for this item; a shallow implementation here is expensive to discover later.
- **Estimate:** 5h
- **Blocked by:** APTR-26
- **Description:** Soul Contract clause 4: **continuity survives every swap.** The assistant has
  months of Engram memory, drifted personality traits, and accumulated relationship lore built up
  over the Matrix channel. Adding Aperture as a new channel must not reset, shadow, fork, or
  quietly re-baseline any of it. A user who has talked to Lumina for months and then opens Aperture
  for the first time must be met by the *same* assistant — same recollection, same voice, same
  relationship — not a polite stranger.

  This item is the epic-mandated continuity item. It is primarily a **test and verification** item
  with whatever minimal wiring the tests prove is missing, and it is deliberately scheduled after
  APTR-26 so it validates the real integration rather than a hypothetical one.

  ## FILES
  - `docs/CONTINUITY.md` (this repo) — the continuity invariants, why they hold structurally, and
    the standing rule that no future item may reset identity state
  - **Agent-core repo (sibling PR):** the continuity test suite spanning
    `crates/lumina-core/src/users/identity.rs`, `crates/lumina-core/src/conversation/`
    (buffer, summarizer, engram_flush), `crates/lumina-core/src/engram/`, and the persona/prompt
    assembler; plus any minimal wiring the tests reveal as missing

  ## APPROACH
  1. State the invariants explicitly, then test each one:
     - **I1 — one user, many channels.** An Aperture `ChannelIdentity` linked to an existing user
       resolves to the same `user_id`; no duplicate user is created.
     - **I2 — memory is user-scoped, not channel-scoped.** Engram recall for a turn arriving over
       Aperture returns the same memories as the identical turn over Matrix.
     - **I3 — traits persist.** Personality traits and their drift state are read from the same
       store regardless of channel; registering a new channel performs no trait reset or
       re-initialization.
     - **I4 — relationship lore persists.** Accumulated relationship context is unchanged by
       channel registration.
     - **I5 — conversation continuity.** The conversation buffer, summarizer, and Engram flush
       operate on the same user scope; a cross-channel conversation summarizes as one relationship,
       not two.
     - **I6 — persona voice is unchanged.** The prompt assembler produces the same persona framing
       for the same user over Aperture as over Matrix (Soul Contract clause 1: speak, never template).
  2. Build a fixture that seeds a user with Matrix history, engram memories, drifted traits, and
     relationship lore; then registers an Aperture identity for that user; then asserts every
     invariant holds **byte-for-byte where the data is deterministic** and semantically where it is
     not.
  3. The headline **negative test**: capture the full identity state (memories, traits, lore,
     summaries) before Aperture registration, register Aperture, capture again, and assert **zero
     destructive delta** — nothing removed, nothing zeroed, nothing re-initialized. Additive change
     is permitted; loss is a hard failure. This test is the item's deliverable and must be named so
     it is obvious in the suite.
  4. Also test the **new-user** path so the invariants do not accidentally require pre-existing
     Matrix history: a user created via Aperture invite gets a normal, fully-functional identity.
  5. Where a test reveals genuinely missing wiring (for example a code path keyed on channel where
     it should be keyed on user), fix it minimally and precisely. **Do not opportunistically
     refactor the memory subsystem inside a continuity item** — a broad refactor here is exactly the
     kind of change that causes the loss this item exists to prevent.
  6. Document in `docs/CONTINUITY.md` that these tests are a **standing gate**: any future item in
     Sprints C–G that touches identity, session, or memory must keep them green, and a change that
     requires weakening them needs an explicit operator decision, not an agent's judgment call.
  7. Add a first-class assertion that Aperture never writes to a *new* memory store — it uses the
     existing Engram path or it is wrong.

  ## TEST PLAN
  - Unit: I1 — linking an Aperture identity to an existing user yields one `user_id`, no duplicate
  - Integration: I2 — identical prompts over Matrix and Aperture recall the same memory set
  - Unit: I3 — trait values and drift state are identical before and after Aperture registration
  - Unit: I4 — relationship lore is unchanged before and after registration
  - Integration: I5 — a conversation spanning both channels summarizes and flushes as one scope
  - Unit: I6 — persona framing for the same user is equivalent across channels
  - Unit: new-user-via-Aperture path produces a normal, complete identity
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - **Negative — the mandated continuity test:** full identity-state snapshot before and after
    Aperture registration asserts **zero destructive delta**; the test fails loudly on any removal,
    zeroing, or re-initialization of memory, traits, or lore
  - **Negative:** assert Aperture writes to no new or parallel memory store — the existing Engram
    path or nothing

  ## EDGE CASES
  - A user whose Matrix identity and Aperture identity are created in the opposite order — the
    invariants must hold symmetrically; test both orders
  - Two Aperture identities for one user (two accounts, one person) — the operator's intent decides;
    the default is that a linked identity joins the existing user, and an unlinked signup is a new
    user, with no silent merging of two people's memories in either direction
  - A trait store schema migration landing concurrently — the continuity suite must fail on data
    loss even across a migration, which is precisely when it is most needed
  - Deliberate user-initiated memory deletion — out of scope here and must not be conflated with a
    reset; the test asserts *incidental* loss, not the absence of an explicit delete feature
  - An empty-memory new user producing a trivially-passing snapshot comparison — the fixture must
    seed non-trivial state, and a test asserts the fixture itself is non-empty

- **Acceptance criteria:**
  - [ ] All six continuity invariants (I1–I6) are covered by explicit passing tests
  - [ ] The mandated negative test proves zero destructive delta to memory, traits, or lore
  - [ ] Aperture writes to no new or parallel memory store; the existing Engram path is used
  - [ ] Identity linking is symmetric — both creation orders tested and passing
  - [ ] New-user-via-Aperture produces a normal, complete identity
  - [ ] `docs/CONTINUITY.md` records the invariants and the standing-gate rule for later sprints
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] All existing tests still pass

---

### APTR-120: Events-contract amendment — stream lifecycle, `origin` provenance, error classes, clock discipline
- **Priority:** Critical
- **Labels:** aperture, contract, streaming, security, architecture
- **Agent:** claude
- **Estimate:** 5h
- **Description:** Four things that every streaming item in this sprint independently assumed, and
  therefore four things that four agents would have assumed differently. This item writes them into
  `contracts/aperture-events-v1.md` as **normative** text with mechanical drift tests, and it merges
  **before** APTR-15/16/19/122/123 because those items code against it.

  It exists because the review found `stream_id` readable three incompatible ways (one connection,
  one thread, one turn), each item quietly picking one; because attribution was left to be derived
  from content, which is a prompt-injection surface; because four items minted in-stream `error`
  classes informally; and because three items independently invented their own clock rules.

  ## FILES
  - `contracts/aperture-events-v1.md` — the four normative sections below
  - `contracts/aperture-errors-v1.md` — the frozen in-stream `error` class list and per-class
    client behaviour
  - `client/src/api/events.ts` — the discriminated union gains the mandatory `origin` field and the
    `resync` variant
  - **Agent-core repo (sibling PR):** the Rust event enum's `origin` field and `resync` variant, plus
    the contract-drift tests that fail when code and contract disagree

  ## APPROACH
  1. **Stream lifecycle (D3), normative.** Write it as an unambiguous definition, not a suggestion:
     *a stream is **one connection**.* Not one thread, not one turn. `thread_id` and the message id
     demultiplex many threads and many turns inside a single connection. A **turn** is a separate,
     refcounted entity whose lifetime is governed by APTR-121. State the consequences explicitly so
     no item has to re-derive them: `seq` is per connection; the replay buffer is per connection;
     the per-user cap counts connections; the reducer keys message state by message id, not by
     stream. Add a worked example of one connection carrying two threads with interleaved turns.
  2. **`origin` provenance (D9), mandatory on every event.** A required discriminator with exactly
     four values: `assistant | tool | system | user`. Normative client rule: **attribution is
     derived from `origin` and the event variant only, never from payload content.** Normative
     transport rule: **a `tool.result` can never be emitted as, or coalesced into, an assistant
     token event, regardless of what bytes the tool returns** — enforcement and its negative test
     are APTR-123. Also state that every *stored* message carries the same discriminator, so
     Sprint C renders from provenance rather than from heuristics.
  3. **Resume bounds and the `resync` event.** Contract the bounded replay window (count, bytes,
     retention — all named config keys) and add the `resync` event type: it names the lost `seq`
     range and the affected thread/message ids, and instructs the client to refetch that turn over
     REST (APTR-124). Replace every informal "gap marker" reference in the contract with `resync`.
  4. **Freeze the in-stream `error` class taxonomy** in `contracts/aperture-errors-v1.md`:
     upstream-timeout, upstream-error, rate/backpressure, auth (session invalid / device revoked),
     cancelled-by-user, contract-skew, internal. Each class carries a prescribed client behaviour —
     retry with backoff, re-authenticate, refetch, or give up — so two clients do not react
     differently to the same class. Add the same enum-drift test the event taxonomy already has.
  5. **"Clocks in Aperture" — one short section, four rules.** (a) Ordering and resume use `seq`,
     never timestamps; no code path may compare `ts` to decide replay or ordering. (b) All interval
     and window arithmetic (heartbeat, grace window, limiter windows, lockouts) uses a **monotonic**
     clock, so an NTP step or a manual clock adjustment cannot extend a lockout or collapse a grace
     window. (c) Wall-clock `ts` values are for display and audit only, are UTC, and are serialized
     in one documented format. (d) Verification leeway for signed tokens is a small **named,
     documented, bounded** allowance — never unbounded and never zero. Every item that touches time
     cites this section rather than inventing a fifth rule.
  6. The contract is the source of truth: code adds a variant only after the contract does, enforced
     by test in both languages (D8 — the Rust property is enforced by a Rust test, the TypeScript
     property by a TypeScript test; neither asserts the other's).

  ## TEST PLAN
  - Unit (Rust): every event variant serializes a non-empty `origin` in the contracted set; a
    variant without one does not compile
  - Unit (Rust): the event-type enum matches the contract list exactly — an addition on either side
    fails the drift test
  - Unit (TypeScript): the discriminated union matches the contract list exactly, and `origin` is a
    required field on every member
  - Unit: the `error` class enum matches `contracts/aperture-errors-v1.md` exactly, in both languages
  - Unit: `resync` round-trips with its lost range and affected ids
  - `grep` gate: no code path compares two `ts` values to decide ordering, replay, or eviction
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - **Negative:** an event constructed with an `origin` outside the four values is rejected at
    deserialization, not coerced to a default — a defaulted `origin` would silently launder a tool
    payload into assistant attribution
  - **Negative:** assert the contract contains no wall-clock-based ordering rule that a future item
    could cite

  ## EDGE CASES
  - An event type that is genuinely internal and never leaves the server — it still gets an
    `origin`; there is no "exempt" path, because exemptions are how the invariant erodes
  - A `system` event describing a tool failure — `origin: system`, not `tool`; the discriminator
    describes *who produced this event*, not what it talks about
  - A user's own message echoed back on the stream — `origin: user`; the client must not render it
    as assistant text even though it arrives on the assistant's connection
  - Contract and code merging in the wrong order — the drift test fails closed, which is the point;
    the contract change is part of the same PR, not a follow-up
  - A future third-party channel wanting a fifth `origin` value — requires a contract amendment and
    an operator decision, not an `Other(String)` escape hatch

- **Acceptance criteria:**
  - [ ] `aperture-events-v1.md` normatively defines a stream as one connection, with `thread_id`/
        message id demultiplexing and turns as separately refcounted entities
  - [ ] `origin` is mandatory on every event and every stored message, with the four-value domain
        and the derive-attribution-from-origin-only rule stated normatively
  - [ ] The bounded replay window and the `resync` event are contracted; "gap marker" no longer
        appears informally anywhere in the contract
  - [ ] The in-stream `error` class list is frozen with per-class client behaviour, drift-tested
  - [ ] A "clocks in Aperture" section fixes seq-not-timestamp ordering, monotonic windows, UTC
        display stamps, and bounded verification leeway
  - [ ] Contract-drift tests exist in **both** Rust and TypeScript, each asserting its own language
  - [ ] No hardcoded infrastructure values in new/modified code, and all existing tests still pass

---

### APTR-121: Turn refcounting, the resume grace window, and explicit stop as a distinct action
- **Priority:** Critical
- **Labels:** aperture, bff, streaming, reliability, architecture
- **Agent:** claude
- **Review:** high-assurance panel — widen the `review_run` provider list for this item; a shallow implementation here is expensive to discover later.
- **Estimate:** 6h
- **Blocked by:** APTR-18, APTR-120
- **Description:** The mechanism that makes cancellation, resume, and multi-device viewing hold
  simultaneously (D3). Before this item they contradicted each other: disconnect-cancels killed the
  surviving device's turn and guaranteed that every resume resumed an already-cancelled turn. This
  item owns the refcount, the grace timer, and the distinction between *the transport went away*
  and *the human said stop* — APTR-18 owns the cancellation token those signals trip.

  This is a small amount of code with an unusually high density of race conditions, which is why it
  is its own item rather than a paragraph inside APTR-18.

  ## FILES
  - `contracts/aperture-events-v1.md` — the turn lifecycle state machine and the two distinct
    cancellation causes with their distinct terminal reasons
  - `contracts/aperture-api-v1.yaml` — the explicit stop route, and its documented difference from
    simply closing the connection
  - `docs/CONFIGURATION.md` — the resume grace window key, by name, with its default stated as 30s
  - **Agent-core repo (sibling PR):** the per-turn subscriber refcount, the grace timer, the
    stop route handler, and the state machine tying them to APTR-18's token

  ## APPROACH
  1. Every turn holds a **subscriber refcount**, incremented on subscribe (including a resume that
     reattaches per APTR-16) and decremented on disconnect, unsubscribe, or eviction. The count and
     the cancellation decision live behind **one** lock or one actor — a refcount checked outside
     the critical section that decides cancellation is the bug this whole item exists to prevent.
  2. **Refcount reaching zero starts a grace timer**, it does not cancel. The timer's duration is a
     named config key with a **default of 30 seconds**, measured on a monotonic clock (APTR-120).
     If the count rises above zero before it fires, the timer is cancelled and the turn continues
     with no gap and no observable event.
  3. When the timer fires with the count still zero, trip APTR-18's cancellation token with cause
     `abandoned`. Terminal reason on `message.end` is `cancelled`, and the audit entry (APTR-127)
     records `abandoned` so an operator can tell abandonment from a deliberate stop.
  4. **Explicit stop is a different action entirely.** `POST` to the stop route, authenticated and
     authorized to the turn's owner, trips the token **immediately and unconditionally** — refcount
     irrelevant, grace window irrelevant, other subscribers irrelevant (they receive the terminal
     event and see the turn stop, which is correct: the user stopped it). Cause is `user_stop`, the
     terminal reason is `cancelled`, and the audit entry distinguishes it. **A stop must never be
     inferred from a disconnect, and a disconnect must never be reported as a stop** — a UI that
     shows "you stopped this" when the user's train went into a tunnel is lying to them.
  5. Device revocation (APTR-23) also cancels immediately, with cause `revoked`, and is likewise
     never conflated with a transport drop.
  6. The grace window is aligned with, and must not exceed, the replay retention window from
     APTR-16 — a turn that can be reattached to must still have the buffer needed to reattach
     without a gap. Assert the ordering relationship in a test rather than trusting two tuned values.
  7. Bound the whole structure: a per-turn refcount map that never releases entries is a leak. Turns
     are removed on terminal plus retention, and a test walks a thousand turns asserting the map
     returns to baseline.
  8. **Assistant-operable parity:** stopping the current generation is invocable by the assistant
     through the same authorized path, not only by a UI button (Module Contract clause 4).

  ## TEST PLAN
  - Unit: subscribe/unsubscribe move the refcount correctly, including a resume reattachment
  - Integration: two subscribers, one disconnects — no timer starts, generation continues untouched
  - Integration: sole subscriber disconnects and reattaches inside the window — timer cancelled, no
    gap, no duplicate, no terminal event emitted
  - Integration: sole subscriber disconnects and stays away — cancellation fires **after** the
    window, with cause `abandoned`, and not before
  - Integration: explicit stop with two live subscribers — immediate cancellation, both see the
    terminal, cause is `user_stop`
  - Unit: the grace window is monotonic-clock based; a simulated wall-clock jump neither shortens
    nor extends it
  - Unit: grace window ≤ replay retention window, asserted as an invariant
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - **Negative:** assert a transport drop is never recorded or reported as a user stop, and a user
    stop is never recorded as an abandonment — the two causes are distinguishable in every artifact
  - **Negative:** assert the turn map returns to baseline after a thousand turns; no leak

  ## EDGE CASES
  - Reattachment landing in the same instant the timer fires — one lock, one decision, made once;
    the loser observes a cancelled turn rather than a half-cancelled stream
  - A subscriber that is technically connected but wedged (APTR-17 slow-consumer eviction) —
    eviction decrements the refcount, otherwise a dead subscriber keeps a turn alive forever
  - Stop arriving for a turn that already ended — idempotent no-op success, not an error
  - Stop arriving from a different user's session for someone else's turn — refused as forbidden,
    audit-logged, and it must not reveal whether that turn exists
  - Server restart with turns in the grace window — those turns are gone; the unknown-stream
    `resync` path (APTR-16) is the contract for that and must be tested, not assumed
  - A user with the same turn open on three devices closing all three within a second — one timer,
    one cancellation, not three

- **Acceptance criteria:**
  - [ ] Turns are refcounted by subscribers; the count and the cancellation decision are made under
        one critical section
  - [ ] Refcount zero starts a named, monotonic, 30s-default grace window; reattachment inside it
        cancels the timer with no gap and no terminal event
  - [ ] Cancellation on abandonment fires only after the window expires with the count still zero
  - [ ] Explicit stop cancels immediately and unconditionally and is a **distinct** cause from a
        transport drop in the event, the terminal reason, and the audit entry
  - [ ] Revocation cancels immediately and is likewise distinguishable
  - [ ] Grace window ≤ replay retention, asserted; the turn map is bounded and leak-free
  - [ ] Stopping a generation is assistant-invocable through the same authorization path
  - [ ] No hardcoded infrastructure values in new/modified code, and all existing tests still pass

---

### APTR-122: Producers for `tool.call`, `tool.result`, `thinking`, and turn lifecycle
- **Priority:** Critical
- **Labels:** aperture, bff, streaming, rust, lumina-core, architecture
- **Agent:** claude
- **Estimate:** 5h
- **Blocked by:** APTR-26, APTR-120
- **Description:** Four of the ten contracted event types had **no lawful producer** — `on_delta`
  carries text only, and the sprint's original prohibition forbade any other emission point. D2
  corrects this: additional producers are **permitted and required**. They publish into the *same*
  per-turn fan-out APTR-26 builds, so there is still exactly one token path and exactly one SSE
  parser; what changes is that the fan-out now carries the events the taxonomy always promised.

  This item is deliberately narrow. It adds emission at **aggregate boundaries** the agent loop
  already has — tool dispatch start, tool dispatch completion, reasoning availability, and turn
  start/end. It does **not** add a second token-level hook, and it does not restructure the loop.

  ## FILES
  - `contracts/aperture-events-v1.md` — the payload shapes for the four types, if the implementation
    finds them under-specified; the taxonomy itself is frozen
  - **Agent-core repo (sibling PR):** a per-turn event emitter handle carried on `MessageContext`,
    publication calls at the existing tool-dispatch and turn-lifecycle seams, and the `thinking`
    opt-in resolution

  ## APPROACH
  1. Thread a **per-turn emitter handle** through the existing `MessageContext` — the same struct
     that already carries `thread_id` and `request_id` (APTR-26). It is an `Option`, so every
     non-Aperture channel is unaffected and every existing construction site keeps compiling.
     Nothing new is threaded through function signatures across the loop.
  2. Publish at exactly four **aggregate-level** seams, all of which already exist:
     - turn start ⇒ `message.start` (`origin: assistant`)
     - tool dispatch start ⇒ `tool.call` (`origin: tool`), arguments sanitized per APTR-10
     - tool dispatch completion ⇒ `tool.result` (`origin: tool`), result sanitized and truncated
     - turn completion ⇒ `message.end` with its terminal reason, id, byte length, and content hash
     These are aggregate events, not token-level, so the one-token-path rule is untouched.
  3. `thinking` (`origin: assistant`) is published where the named proxy supplies reasoning content,
     gated by the AND resolution defined in APTR-15: connection parameter `thread` **and** the
     thread's `thinking_visible`. Resolve the gate **at publication time**, not at render time — an
     event that should not be visible must never be framed, let alone buffered.
  4. **Every producer obeys the same non-blocking, non-panicking discipline as `on_delta` (D2).**
     Some of these seams run inside the same body-read or dispatch path; a blocking publish there
     stalls the turn for every channel. Bounded non-blocking sender, drop on full, no panic, no
     error propagated into the loop. A tool dispatch must not fail because nobody was listening.
  5. Ordering within a turn is the loop's natural order, carried by `seq`. Tool events for a turn
     always fall between that turn's `message.start` and `message.end`; assert it, because a
     tool event escaping its turn boundary breaks every client reducer.
  6. With no Aperture subscriber, every publication is a cheap no-op — the `Option` is `None` and
     nothing is constructed, so there is no serialization cost on the Matrix/CLI path. Assert this,
     rather than assuming the compiler will elide it.
  7. **No new incremental-output hook, no second SSE parser, no second token path.** The token path
     remains exactly the `on_delta` closure from APTR-26.

  ## TEST PLAN
  - Integration: a turn using a tool emits `message.start`, `tool.call`, `tool.result`, `token`*,
    `message.end` in a valid order with monotonic `seq`
  - Unit: `tool.call`/`tool.result` payloads are sanitized and truncated before publication, and
    carry `origin: tool`
  - Unit: `thinking` is published only when the connection parameter and the thread setting are both
    set; the other three combinations publish nothing
  - Unit: with no subscriber, publication constructs no event and performs no serialization
  - Unit: every non-Aperture channel compiles and behaves unchanged with the `MessageContext`
    addition — Matrix regression suite green
  - Unit: tool events for a turn always fall strictly between its `message.start` and `message.end`
  - `grep` gate: no new token-level hook and no SSE frame parsing outside `ChatSseState`
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - **Negative:** a publisher whose subscriber buffer is full drops the event and the tool dispatch
    still completes normally — assert the dispatch's timing is unaffected
  - **Negative:** assert a `thinking` event that fails the opt-in gate is never framed **and** never
    enters the replay buffer, so a later resume cannot surface it

  ## EDGE CASES
  - A tool that never returns (hangs) — `tool.call` was emitted and `tool.result` never is; the turn
    still terminates via the upstream idle timeout path, and the client shows an unfinished tool
    entry rather than hanging
  - A tool returning megabytes — truncated at publication with a marker, full result available via
    REST (APTR-124), matching APTR-15's framing rule
  - Nested or parallel tool calls — each carries its own call id so results attach to the right call;
    a result with no matching call is a contract violation and fails a test
  - A turn cancelled between `tool.call` and `tool.result` — the terminal event still fires; the
    client must render an abandoned tool entry, not a pending one forever
  - The named proxy supplying reasoning content for a thread that later disables `thinking_visible`
    mid-turn — the gate is evaluated per publication, so the change takes effect immediately

- **Acceptance criteria:**
  - [ ] `tool.call`, `tool.result`, `thinking`, and turn-lifecycle events all have a real producer
        publishing into the **same** per-turn fan-out as the token deltas
  - [ ] Emission happens only at existing aggregate seams via an `Option` emitter on `MessageContext`;
        no new token-level hook, no second SSE parser, no second token path
  - [ ] All producers are non-blocking and panic-free; a full buffer drops the event and never
        delays or fails a tool dispatch or a turn on any channel
  - [ ] `thinking` publishes only when the connection parameter and the thread setting both allow it,
        resolved at publication time so a gated event is never framed or buffered
  - [ ] Tool payloads are sanitized before publication and carry `origin: tool`; tool events stay
        within their turn's start/end boundary
  - [ ] With no subscriber, publication is a no-op with no serialization cost; Matrix/CLI unchanged
  - [ ] No hardcoded infrastructure values in new/modified code, and all existing tests still pass

---

### APTR-123: Transport-layer provenance invariant — a tool result can never become assistant text
- **Priority:** Critical
- **Labels:** aperture, bff, security, prompt-injection, streaming
- **Agent:** claude
- **Review:** high-assurance panel — widen the `review_run` provider list for this item; a shallow implementation here is expensive to discover later.
- **Estimate:** 4h
- **Blocked by:** APTR-120, APTR-122
- **Description:** Enforce D9 at the transport layer, where it can actually be enforced, rather than
  leaving it as a rendering convention for Sprint C to honour. **A `tool.result` payload can never
  be emitted as, or coalesced into, an assistant token event, regardless of what bytes the tool
  returns.** A tool that returns text shaped exactly like an SSE frame, or exactly like an
  assistant-event JSON object, is returning *data*. It stays data.

  This is the containment boundary for tool-mediated prompt injection: a compromised or hostile
  tool result must not be able to impersonate the assistant's own voice on the wire, because a user
  who cannot distinguish the assistant from a tool's payload cannot make a safe decision about
  anything the assistant says.

  ## FILES
  - `contracts/aperture-events-v1.md` — the invariant stated normatively as a transport guarantee,
    not a client convention
  - **Agent-core repo (sibling PR):** type-level separation of tool payloads from token payloads,
    the coalescing-path guard, and the negative-test corpus

  ## APPROACH
  1. **Make it structural before making it checked.** Tool payloads and assistant token text are
     **distinct types** with no `From`/`Into`, no `Deref`, and no shared constructor between them.
     The only way to produce a token event is from assistant delta text; there is no function
     anywhere that accepts a tool payload and returns a token event. Per D8, enforce with
     module-private visibility so the **compiler** rejects the conversion, rather than relying on a
     test to notice it later.
  2. **Guard the coalescing path specifically.** APTR-17 coalesces adjacent `token` deltas under
     backpressure. Coalescing must be restricted to same-message, same-`origin`, token-variant
     events only. A tool event is never a coalescing candidate — this is the one place where a
     "merge adjacent events" optimisation could plausibly launder a payload, so it gets its own
     test rather than being covered by the general rule.
  3. Payloads are **always JSON-encoded into the `data:` field**, never interpolated. A payload
     containing `\n\n`, `event:`, `data:`, or `id:` at any position is inert by construction because
     it never reaches the frame writer as raw text. Combined with (1), there are two independent
     barriers, which is the right number for an injection boundary.
  4. The `origin` discriminator is set by the **producer**, from the emission seam, and is never
     derived from, influenced by, or overridable by payload content. A tool payload containing an
     `"origin": "assistant"` field is just a JSON object with a field in it.
  5. Build a small **negative-test corpus** of hostile tool results and run every one through the
     full path: a complete SSE frame; a partial frame with an unterminated `data:`; an
     assistant-shaped event JSON with `origin: assistant`; a payload with thousands of newlines;
     one with `\r\n` line endings; one with a null byte; one with a lone UTF-8 surrogate half; one
     that is a valid `message.end` with a forged content hash. Every one must arrive at the client
     as an inert `tool.result` and change no message text.
  6. Assert the same property **after a resume replay**, because replay is a second emission path
     and a second emission path is exactly where an invariant gets forgotten.

  ## TEST PLAN
  - Unit: no code path converts a tool payload into a token event — enforced by module-private
    visibility so the conversion does not compile, per D8
  - Unit: the coalescing path accepts only same-message, same-origin token events; a tool event
    adjacent to token events is never merged
  - Unit: every payload is JSON-encoded into `data:`; no raw interpolation exists on the frame path
  - Integration: the full hostile corpus round-trips as inert `tool.result` events, with assistant
    message text byte-identical to a run where the tools returned benign values
  - Integration: the same corpus replayed through a `Last-Event-ID` resume yields the same result
  - Unit: a tool payload containing an `"origin"` field does not affect the event's `origin`
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - **Negative — the mandated D9 test:** a tool result whose body is SSE-frame-shaped and
    assistant-event-shaped JSON is delivered as a `tool.result` with `origin: tool`, contributes
    **zero** bytes to assistant message text, and does not terminate, split, or forge any frame
  - **Negative:** assert no test in the suite passes by rendering the payload as text and comparing
    strings — the assertion is on event type and origin, not on appearance

  ## EDGE CASES
  - A tool result that is legitimately long assistant-style prose (a summarization tool) — still a
    `tool.result`; provenance is about the producer, never about how the content reads
  - A tool result arriving after its turn's `message.end` — dropped with an audit entry, never
    attached to the next turn's message, which would be cross-turn laundering
  - Truncation of a hostile payload splitting a multi-byte character — truncate at a char boundary;
    the marker is added by the framer and cannot be spoofed by the payload ending in the same bytes
  - A future coalescing optimisation added by a later sprint — the compiler-enforced separation
    survives it; the visibility rule is the durable guarantee, the tests are the tripwire
  - A tool that returns an empty result — an inert empty `tool.result`, never an omitted event,
    because a missing event is indistinguishable from a dropped one

- **Acceptance criteria:**
  - [ ] Tool payloads and token text are distinct types with no conversion; the conversion is
        rejected by the compiler via module-private visibility, not merely by a test
  - [ ] Coalescing accepts only same-message, same-origin token events; tool events are never merged
  - [ ] All payloads are JSON-encoded into `data:`; no raw interpolation exists on the frame path
  - [ ] `origin` is set by the producer and is never derived from or overridable by payload content
  - [ ] The hostile-corpus negative test passes on the live path **and** on the replay path, with
        assistant text byte-identical to a benign run
  - [ ] The invariant is stated normatively in the events contract as a transport guarantee
  - [ ] No hardcoded infrastructure values in new/modified code, and all existing tests still pass

---

### APTR-124: Minimal turn-fetch route so gap recovery is real, not deferred
- **Priority:** High
- **Labels:** aperture, bff, streaming, reliability, api
- **Agent:** claude
- **Estimate:** 4h
- **Blocked by:** APTR-16
- **Description:** APTR-16 and APTR-19 both instruct a client to "refetch the turn via REST" when a
  `resync` fires — but the message/turn REST routes belong to Sprint C, so as written the recovery
  path referenced a route that does not exist yet, and the gap test would have had nothing to assert
  against. Rather than deferring recovery (which would leave a declared gap with no remedy — worse
  than a smoothed-over one), this sprint ships the **minimal** read route the recovery path needs.

  Deliberately minimal: this is not the Sprint C thread/history API and must not become it. One
  route, one turn, no listing, no pagination over threads, no search. Sprint C's richer API
  supersedes it and may replace this handler outright; the contract is written so that it can.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — the single turn-fetch route, its response shape, and an
    explicit note that Sprint C may supersede it
  - `client/src/api/turns.ts` — the typed client call, used by the APTR-19 recovery path only
  - **Agent-core repo (sibling PR):** the read handler over the existing conversation buffer/store

  ## APPROACH
  1. One route: fetch a single turn by thread id and message id, returning the persisted assistant
     text, its `origin`, its ordered tool entries, the terminal reason, the byte length, and the
     content hash — the same values `message.end` carries, so the client can reconcile a partial
     local assembly against the authoritative record.
  2. **Read-only, no side effects.** It does not mark read, does not touch presence, does not create
     or resume anything. A recovery path with side effects turns a flaky network into state churn.
  3. Authorization through the same default-deny guard as every other route (APTR-22): a user reads
     only their own turns. Test the cross-user refusal explicitly — a recovery route is exactly the
     kind of "small helper" that gets added outside the guard.
  4. Serve from the **existing** conversation buffer/store. **No new store, no cache, no parallel
     persistence path** — the same rule that governs the rest of the sprint.
  5. Payloads are sanitized identically to the stream path (APTR-10), so recovery cannot become a
     redaction bypass — an unsanitized REST twin of a sanitized stream event is the classic version
     of that bug.
  6. Provenance holds here too (APTR-123): tool entries are returned as tool entries with
     `origin: tool`, never merged into the assistant text field.
  7. A turn that no longer exists (deleted, compacted) returns a typed not-found problem-details
     response the client renders as "this turn is no longer available", rather than an empty turn
     the user would read as the assistant having said nothing.

  ## TEST PLAN
  - Integration: after a forced `resync`, the client fetches the turn and reconciles to the same
    state as an uninterrupted stream — the end-to-end recovery test that previously could not exist
  - Unit: the response carries text, `origin`, ordered tool entries, terminal reason, byte length,
    and a content hash matching `message.end`
  - Unit: the route is read-only — read state, presence, and turn state are unchanged after a call
  - Unit: payloads are sanitized identically to the stream path (same fixture, same expected output)
  - Unit: a missing turn yields a typed not-found, never an empty-but-successful turn
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - **Negative:** a user fetching another user's turn is refused by the default-deny guard, and the
    response does not reveal whether that turn exists
  - **Negative:** assert the route reads the existing conversation store and constructs no new store,
    cache, or parallel persistence path

  ## EDGE CASES
  - A turn still generating when fetched — return what is persisted so far with a terminal reason of
    "in progress"; the client reconciles and keeps streaming rather than replacing live state
  - A turn whose tool result was truncated on the stream — the REST record may carry more of it, and
    the contract says which; the two must not disagree silently
  - A very large turn — bound the response and say so in the contract; recovery must not become an
    unbounded read amplification
  - Sprint C landing its richer route later — this route is documented as supersedable, and the
    client's recovery call sits behind one function so the swap is a one-line change
  - A turn belonging to a thread the user has since had revoked access to — refused by the guard at
    fetch time, not by whatever was true when the stream started

- **Acceptance criteria:**
  - [ ] A single, read-only turn-fetch route exists, returning text, `origin`, ordered tool entries,
        terminal reason, byte length, and content hash
  - [ ] APTR-19's `resync` recovery uses it end to end, and the gap test asserts against it rather
        than against a deferred capability
  - [ ] Served from the existing conversation store; no new store, cache, or persistence path
  - [ ] Sanitization is identical to the stream path; provenance separation is preserved
  - [ ] Covered by the default-deny guard; cross-user fetch refused without revealing existence
  - [ ] Contract marks the route as minimal and supersedable by Sprint C
  - [ ] No hardcoded infrastructure values in new/modified code, and all existing tests still pass

---

### APTR-125: Auth-boundary hardening — bootstrap token, session-id regeneration, absolute lifetime, origin checks
- **Priority:** Critical
- **Labels:** aperture, bff, auth, security
- **Agent:** claude
- **Review:** high-assurance panel — widen the `review_run` provider list for this item; a shallow implementation here is expensive to discover later.
- **Estimate:** 6h
- **Blocked by:** APTR-20, APTR-21
- **Description:** Four hardening measures at the authentication boundary, grouped because they are
  one review surface and one set of tests. Each closes a specific hole the review identified:
  first-visitor-wins bootstrap, session fixation, an unbounded refresh chain, and cross-site use of
  a valid session.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — the bootstrap token parameter, and the documented
    `Origin`/`Sec-Fetch-Site` requirements per route class
  - `contracts/aperture-errors-v1.md` — the typed errors for a bad bootstrap token, an expired
    absolute session, and a cross-site refusal
  - `docs/CONFIGURATION.md` — the max-session-age key and the bootstrap-token behaviour, by name
  - **Agent-core repo (sibling PR):** bootstrap token generation and verification, session-id
    regeneration at the auth boundary, absolute-lifetime enforcement, and the origin guard

  ## APPROACH
  1. **Out-of-band bootstrap token, closing first-visitor-wins.** On startup with no administrator,
     the instance generates a high-entropy single-use token and **prints it to the server console
     and process log** — the operator has that access by definition; a network visitor does not. The
     bootstrap-complete call requires it. Also accept it from a CLI subcommand for operators who
     drive the instance headlessly. The token is regenerated on each restart while bootstrap remains
     required, is stored **hashed**, is compared in constant time, and is destroyed on completion.
     It costs the legitimate operator one paste and costs an attacker the whole attack.
  2. **Session-id regeneration at the auth boundary (session fixation).** Any pre-authentication
     identifier — bootstrap state, CSRF token, or any anonymous session that ever exists — is
     **discarded and reissued** on successful login, invite acceptance, and password change. A
     value that existed before authentication must never remain valid after it. Test that the
     pre-auth identifier is rejected post-login.
  3. **Absolute session lifetime cap.** Rotating refresh tokens with no ceiling means a stolen
     refresh chain lives forever if the victim's device goes quiet. Add a named max-session-age key
     measured from **original authentication**, not from the last rotation; past it, refresh fails
     closed to re-authentication regardless of how healthy the rotation chain looks. Test at both
     edges of the boundary.
  4. **Origin enforcement and a deny-all CORS posture (D1).** Reject any state-changing request, and
     any stream connection, whose `Origin`/`Sec-Fetch-Site` indicates cross-site — even with a
     perfectly valid session cookie. Ship **no CORS headers on `/v1/aperture/*`, ever**: the desktop
     target reaches the API as a native HTTP client with a bearer token, not as a browser fetch
     subject to CORS, so there is no legitimate cross-origin browser caller to accommodate. State
     this in the contract so a future agent does not "fix" a desktop problem by adding CORS.
  5. Cookie naming follows D1: the web session cookie carries the `__Host-` prefix, so the browser
     itself enforces `Secure`, no `Domain`, and `Path=/`. Desktop uses a bearer token and never a
     cookie. Neither target's rule is applied to the other.
  6. Every event here — bootstrap token failure, fixation-guard trigger, absolute-lifetime expiry,
     cross-site refusal — is written to the APTR-127 audit sink and is visible to the affected user.

  ## TEST PLAN
  - Integration: bootstrap without the token is refused; with a wrong token refused; with the correct
    token succeeds exactly once and the token is then invalid
  - Unit: the bootstrap token is stored hashed, compared in constant time, and regenerated on restart
    while bootstrap is still required
  - Integration: a pre-authentication identifier captured before login is rejected after login —
    the session-fixation test
  - Unit: refresh past the absolute max-session-age fails closed to re-auth even with a valid,
    correctly-rotated refresh token; tested just inside and just outside the boundary
  - Integration: a state-changing request and a stream connection with a cross-site `Origin` are
    refused despite a valid session cookie
  - Unit: no CORS header is emitted on any `/v1/aperture/*` response, including error responses
  - Unit: the web session cookie carries the `__Host-` prefix and its implied constraints
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - **Negative:** assert the bootstrap token is never returned in any HTTP response body, header, or
    error — console and CLI only
  - **Negative:** assert a cross-origin EventSource/fetch with a valid cookie is refused, and that
    refusal is audit-logged

  ## EDGE CASES
  - An operator who cannot see the console (a managed restart) — the CLI subcommand covers it; both
    paths are documented in the deployment posture doc (APTR-131)
  - Restart between token display and use — the token is regenerated and the old one is dead; the
    operator reads the new one, which is correct behaviour, not a bug to work around by persisting it
  - A browser that omits `Sec-Fetch-Site` — fall back to `Origin`; if both are absent on a
    state-changing request, **refuse**, because fail-open here defeats the whole control
  - The desktop target sending no `Origin` at all — it is not a browser and uses bearer auth; the
    rule is applied per target as D1 requires, and the bearer path is tested separately
  - A long-lived desktop session hitting the absolute cap mid-use — it re-authenticates cleanly with
    a clear message, and an in-flight stream closes with a typed auth error rather than hanging
  - Clock adjustment near the absolute-lifetime boundary — monotonic where the window is an interval,
    with the documented bounded leeway from APTR-120 where it is an absolute instant

- **Acceptance criteria:**
  - [ ] Bootstrap requires an out-of-band token shown on the console and via CLI, stored hashed,
        constant-time compared, single-use, and never present in any HTTP response
  - [ ] Any pre-authentication identifier is discarded and reissued at the auth boundary, tested
  - [ ] An absolute max-session-age, measured from original authentication, fails refresh closed
  - [ ] Cross-site state-changing requests and stream connections are refused despite a valid session
  - [ ] Zero CORS headers on `/v1/aperture/*`, including error responses, stated in the contract
  - [ ] Web sessions use a `__Host-`-prefixed cookie; desktop uses bearer and never a cookie
  - [ ] All four event classes reach the APTR-127 audit sink and are visible to the affected user
  - [ ] No hardcoded infrastructure values in new/modified code, and all existing tests still pass

---

### APTR-126: Password change, admin reset, and account lifecycle beyond creation
- **Priority:** High
- **Labels:** aperture, bff, auth, multi-user, security
- **Agent:** claude
- **Estimate:** 5h
- **Blocked by:** APTR-21, APTR-22
- **Description:** The sprint rate-limits "password change" and invites members, but nothing builds
  a password change, nothing offers a recovery path for a member who forgets their password, and
  nothing can remove a member once invited. An instance where an admin can add but never remove, and
  where a forgotten password is terminal, is not a multi-user instance. This item completes the
  lifecycle.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — password change, admin-initiated reset, account deactivation
    and deletion, with their session-invalidation semantics documented
  - `client/src/routes/settings/security/` — the self-service password-change surface
  - `client/src/routes/admin/users/` — admin reset and deactivation controls (extends APTR-22)
  - **Agent-core repo (sibling PR):** the change/reset/deactivate/delete handlers over the existing
    user store, and the session-invalidation fan-out

  ## APPROACH
  1. **Self-service password change requires the current password**, verified with the same
     constant-time comparison as login. It re-hashes with current parameters, and on success
     **revokes all of that user's OTHER sessions and refresh families** while keeping the calling
     session alive — that is what makes a password change a meaningful response to a suspected
     compromise rather than a cosmetic act.
  2. **Admin-initiated reset**, because a self-hosted instance has no email recovery and must not
     grow an external dependency to get one (that would be both a second door and a privacy leak).
     The admin triggers a reset; **the admin never sets or sees the user's password**. It issues a
     single-use, expiring, hashed reset token delivered through the same out-of-band channel as
     invites, invalidates **all** of that user's sessions immediately, and forces a new-password flow
     on next use. Reusing the invite machinery rather than inventing a parallel one.
  3. **Deactivation** disables authentication immediately, revokes all sessions, refresh families,
     and devices, and terminates in-flight streams via APTR-18's token — while **preserving the
     user's threads and memory untouched**. Deactivation is reversible by an admin and is the
     default removal action.
  4. **Deletion** is a distinct, explicitly-confirmed admin action. State plainly in the contract and
     the UI what it does to threads, devices, sessions, and read state. **It must not delete or reset
     the assistant's memory of shared conversations belonging to other users**, and it must never be
     reachable by a single mis-click from deactivation. If full data deletion cannot be done safely
     within this item's scope, the contract states so and deletion is limited to what it can do
     correctly — an honest partial is better than a destructive approximation.
  5. The **last admin cannot be deactivated or deleted**, enforced transactionally, consistent with
     APTR-22's last-admin rule — same guard, not a second copy of it.
  6. All four operations are rate-limited (APTR-24) and written to the APTR-127 audit sink with actor
     and target. A user can see their own password changes and resets in their security events.
  7. **Continuity:** deactivating and reactivating a user must not reset memory, traits, or
     relationship lore. This is the APTR-28 continuity gate applied to the lifecycle path, and it
     carries its own negative test rather than trusting the general one.
  8. **Assistant-operable parity:** password change is initiated by the user, not the assistant, but
     deactivation and reset are admin operations and are assistant-invocable through the same guard.

  ## TEST PLAN
  - Integration: password change with the correct current password succeeds, revokes the user's other
    sessions, and leaves the calling session alive
  - Unit: password change with a wrong current password is refused, rate-limited, and audit-logged
  - Unit: the new password is subject to the same policy and hashing parameters as APTR-20
  - Integration: admin reset invalidates all sessions immediately and forces a new-password flow; the
    admin never learns the resulting password
  - Unit: the reset token is single-use, expiring, and stored hashed — same properties as an invite
  - Integration: deactivation revokes sessions, refresh families, devices, and in-flight streams,
    and blocks subsequent authentication
  - Unit: the last admin cannot be deactivated or deleted, including under concurrent attempts
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - **Negative — continuity:** deactivate and reactivate a user with seeded memory, traits, and lore;
    assert zero destructive delta, per the APTR-28 standing gate
  - **Negative:** assert no external service is contacted for recovery — no email, no SMS, no
    third-party identity provider, in any code path

  ## EDGE CASES
  - A user changing their password while holding an open stream on another device — that stream
    closes with a typed auth error, which is the intended and documented behaviour
  - A reset token issued and then a second one issued before use — the first is invalidated; exactly
    one live reset token per user
  - Deactivating a user with an in-flight turn — the turn is cancelled through the shared token
    (immediately, like revocation; not via the APTR-121 grace window) and the partial persists
  - An admin deactivating themselves while they are the last admin — refused by the last-admin guard
    before any session is touched
  - A deactivated user's threads appearing in another user's shared context — preserved and readable
    where they already were; deactivation is an authentication action, not a content purge
  - Reactivation after a long period — a normal login, no re-onboarding, no memory reset

- **Acceptance criteria:**
  - [ ] Self-service password change requires the current password and revokes all other sessions
        while preserving the calling one
  - [ ] Admin reset issues a single-use expiring hashed token, invalidates all sessions, and never
        exposes the password to the admin
  - [ ] Deactivation revokes sessions, devices, and in-flight streams while preserving threads
        and memory; deletion is a distinct, explicitly-confirmed action with documented scope
  - [ ] The last admin cannot be deactivated or deleted, enforced transactionally by the same guard
  - [ ] All four operations are rate-limited and audit-logged; users see their own security events
  - [ ] The continuity negative test proves deactivate/reactivate causes zero destructive delta
  - [ ] No external recovery dependency exists in any code path
  - [ ] No hardcoded infrastructure values in new/modified code, and all existing tests still pass

---

### APTR-127: The audit log — sink, schema, retention, and per-user visibility
- **Priority:** High
- **Labels:** aperture, bff, audit, security, observability
- **Agent:** claude
- **Estimate:** 4h
- **Description:** Five items in this sprint say "audit-logged" and, before this revision, **no item
  defined an audit log**. A retroactive "this never happened" assertion with no evidence source is
  prose, not a control (D8). This item defines the sink, the schema, the retention, and who can see
  what — and every other item in the sprint becomes a producer against it.

  It merges **before** APTR-20, APTR-22, and APTR-23, all of which cite it.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — the per-user security-events route and the admin audit route
  - `client/src/routes/settings/security/` — the user-visible security-events surface
  - `docs/CONFIGURATION.md` — retention key names and semantics, names only
  - **Agent-core repo (sibling PR):** the audit sink, the typed event schema, the retention job, and
    the two read paths. **First check whether agent-core already has an audit log** (the agent loop
    is documented as writing one) and **extend it rather than minting a second** — a second audit
    log is a second door and half the evidence.

  ## APPROACH
  1. **Reuse before you build.** If an audit facility already exists in the agent core, extend it
     with the Aperture event types and record the module path in the PR body. Only if none exists
     does this item create one. Two audit logs is the failure mode this item must not produce.
  2. **Typed schema, not free text.** Every entry carries: event type (a closed enum), timestamp
     (UTC, per APTR-120's clock rules), actor (user id or `system`), target (user/device/session/
     turn id), outcome (`success` / `refused` / `error`), a cause discriminator where one applies
     (`user_stop` vs `abandoned` vs `revoked`, per APTR-121), and a **sanitized** detail map. Free
     text would make it unqueryable, and unqueryable evidence is not evidence.
  3. **The event-type enum covers everything the sprint already claims to log:** bootstrap attempts
     and completion, bootstrap-token failure, login success and failure, session-fixation guard
     trips, refresh rotation and **refresh reuse detection**, absolute-lifetime expiry, logout,
     invite creation/acceptance/revocation, role change, device registration/rename/revocation,
     cross-user admin actions, password change, admin reset, deactivation/deletion, rate-limit
     lockouts (per window, with a counter — never per attempt), and cross-site refusals.
  4. **Never log a secret or a credential.** No password, no token value, no signing key, no invite
     or reset token — hashes and ids only. The APTR-10 sanitizer runs on every detail map before
     write, and a test feeds a secret-shaped value through every producer to prove it is redacted.
  5. **Retention is bounded and configured by name**, with a documented default. Entries older than
     the window are purged by a job that is itself audited. An unbounded audit log is a disk-fill
     outage waiting for the day you most need the instance up.
  6. **Two read paths, two scopes.** (a) **Per-user:** an authenticated user sees **their own**
     security events — recent logins, refresh-reuse alarms, lockouts, device revocations, password
     changes. On a sovereign instance the user has nowhere else to look. (b) **Admin:** the full
     log, behind the admin guard. A member must never see another user's entries, and the per-user
     view must not leak actor identity for admin actions beyond the class of actor.
  7. **Fail-safe, not fail-silent.** If the sink is unavailable, a security-relevant operation
     **fails closed** rather than proceeding unlogged. State which operations are security-relevant;
     do not make routine reads depend on the audit path.
  8. **Assistant-operable parity:** a user can ask the assistant "has anything odd happened with my
     account" and get their own security events through the same authorization guard.

  ## TEST PLAN
  - Unit: every entry validates against the typed schema; a free-text-only entry is impossible
  - Unit: each producing item's events appear with the correct type, actor, target, outcome, and
    cause discriminator
  - Integration: a user sees their own security events and **only** their own; an admin sees all
  - Unit: retention purges entries past the window and the purge itself is audited
  - Unit: the sink reuses the existing agent-core audit facility where one exists — asserted by
    module path, not by prose
  - Integration: the assistant-invoked path returns the calling user's events, subject to the guard
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - **Negative:** feed a secret-shaped value through every producer; assert no password, token,
    key, or invite/reset token value appears in any entry
  - **Negative:** assert a security-relevant operation with an unavailable sink **fails closed**
    rather than proceeding unlogged

  ## EDGE CASES
  - A burst of failed logins — one entry per window with a counter, never one per attempt, so the
    log cannot be used to amplify an attack against itself
  - An admin acting on a member's account — visible in the member's own view as an admin action, so
    administrative power is accountable to the person it is used on
  - The log growing faster than retention purges under sustained abuse — a bounded write rate plus
    the per-window aggregation; assert the bound holds under a flood
  - A deleted user's entries — retained for the retention window with the id preserved; an audit log
    that forgets on deletion cannot answer the question it exists for
  - Two instances of the sprint's items writing the same event twice — event ids are idempotent per
    operation, so a retry does not double-log

- **Acceptance criteria:**
  - [ ] A single audit sink exists — the existing agent-core facility extended where one exists,
        asserted by module path, never a second parallel log
  - [ ] A typed closed-enum schema covers every event class the sprint claims to log, with actor,
        target, outcome, cause discriminator, and a sanitized detail map
  - [ ] No secret, token, key, or credential value can appear in any entry — proven by a producer-wide
        negative test
  - [ ] Retention is bounded, configured by name, and the purge is itself audited
  - [ ] Users see their own security events; admins see all; cross-user leakage is refused
  - [ ] Security-relevant operations fail closed when the sink is unavailable
  - [ ] Security events are assistant-queryable through the same authorization guard
  - [ ] No hardcoded infrastructure values in new/modified code, and all existing tests still pass

---

### APTR-128: Trusted-proxy resolution so per-source rate limiting means something
- **Priority:** High
- **Labels:** aperture, bff, security, reliability, config
- **Agent:** claude
- **Estimate:** 3h
- **Description:** APTR-24's per-source dimension does not do what it claims behind a reverse proxy.
  Every request arrives from the proxy's address, so the limiter is either **one shared bucket for
  the entire instance** (which locks out a household the moment anyone fat-fingers a password) or it
  trusts `X-Forwarded-For` blindly (which lets an attacker mint a fresh source per attempt and never
  trip a limit at all). Both are worse than no limiter, because both look like one. This item
  defines the resolution rule once, so every rate-limited surface uses the same source identity.

  ## FILES
  - `docs/CONFIGURATION.md` — the trusted-proxy hop configuration, by name, with the security
    consequence of setting it wrong stated plainly in both directions
  - `docs/DEPLOYMENT.md` — cross-reference from the deployment posture doc (APTR-131)
  - **Agent-core repo (sibling PR):** the source-identity extractor used by the APTR-24 limiter and
    by any future per-source control

  ## APPROACH
  1. A named config key declares the **trusted proxy hops** — either a count of trusted hops or a
     list of trusted proxy addresses, whichever the deployment can state accurately. **Default:
     zero trusted hops**, i.e. use the direct peer address and ignore forwarding headers entirely.
     A safe default matters more than a convenient one: an instance deployed without reading the
     docs must be un-spoofable, merely coarse.
  2. With N trusted hops configured, derive source identity from the **rightmost entry that is not
     itself a trusted proxy** — walking from the right, skipping trusted hops, and taking the first
     untrusted value. Never the leftmost entry, which is entirely attacker-controlled.
  3. If the header is absent, malformed, shorter than the configured hop count, or contains a
     syntactically invalid address, **fall back to the direct peer address** — never to an
     attacker-supplied value, and never to a wildcard that shares one bucket with everyone.
     Fail-closed here means "coarse", not "open".
  4. Normalize before bucketing: canonical address form, and group by network prefix rather than by
     exact address, so an attacker with a large address range cannot mint a fresh bucket per attempt.
     The prefix widths are named config keys with documented defaults, not literals.
  5. **Retain no more than the limiter needs.** The derived identity is used for bucketing and may
     be recorded in an audit entry, but Aperture is sovereign and private (Module Contract clause 6)
     and this must not become a per-request address log. Consistent with APTR-23's no-retention rule
     for device records.
  6. One extractor, used by every per-source control. If a second surface needs source identity
     later, it calls this; it does not re-derive it. Enforce with module-private visibility (D8) so
     the raw header is not reachable from elsewhere.
  7. Document the tradeoff honestly: a shared household or office is one source and will share a
     bucket, so the per-source dimension is sized generously and the **per-account** dimension is
     what actually stops targeted brute force.

  ## TEST PLAN
  - Unit: with zero trusted hops (the default), forwarding headers are ignored entirely and the peer
    address is used
  - Unit: with N trusted hops, the identity is the rightmost non-trusted entry — table-driven across
    several hop counts and header shapes
  - Unit: absent, malformed, too-short, and syntactically invalid headers all fall back to the peer
    address, never to a supplied value
  - Unit: bucketing is by normalized network prefix; many addresses in one prefix share a bucket
  - Unit: the raw forwarding header is not reachable outside the extractor module (visibility gate)
  - Integration: with the extractor wired, APTR-24's per-source limit trips correctly for a single
    attacker behind the proxy
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files or docs — the
    configuration is described by key name and shape only, with no example address values
  - **Negative — the spoofing test:** an attacker supplying a crafted forwarding header with many
    fabricated entries cannot escape their bucket at any hop configuration, including zero
  - **Negative:** assert the derived identity is not written to a per-request log or retained beyond
    the limiter window and the audit entry

  ## EDGE CASES
  - A misconfigured hop count larger than the real chain — the walk runs out of untrusted entries and
    falls back to the peer address rather than trusting a fabricated one
  - A proxy that appends versus one that replaces the header — the rightmost-untrusted walk is
    correct for both; test both shapes
  - Multiple forwarding header instances on one request — treat the concatenation in wire order, and
    test the split form explicitly, because this is where naive parsers break
  - A direct connection with no proxy while hops are configured — falls back to the peer address
  - A legitimate large shared network sharing one bucket — documented as the accepted tradeoff, with
    the per-account dimension carrying the real protection
  - A future multi-instance deployment where limiter state is per-process — already documented as a
    single-instance assumption in APTR-24; this item does not change it

- **Acceptance criteria:**
  - [ ] Trusted proxy hops are a named config key defaulting to **zero**, so an unconfigured instance
        ignores forwarding headers entirely
  - [ ] Source identity is the rightmost non-trusted entry; the leftmost, attacker-controlled entry
        is never used
  - [ ] Absent/malformed/short/invalid headers fall back to the peer address, never to a supplied value
  - [ ] Bucketing is by normalized network prefix with named, documented widths
  - [ ] One extractor, module-private, used by every per-source control; the raw header is unreachable
        elsewhere
  - [ ] The spoofing negative test passes at every hop configuration; no per-request address retention
  - [ ] No hardcoded infrastructure values (including example addresses) in new/modified code or docs
  - [ ] All existing tests still pass

---

### APTR-129: Cross-tab coordination — one shared connection, one leader, no duplicate work
- **Priority:** High
- **Labels:** aperture, web, streaming, sdk, reliability
- **Agent:** codex
- **Estimate:** 4h
- **Blocked by:** APTR-19
- **Description:** A user with several tabs open is the normal case, and every tab currently opens
  its own stream, refreshes its own token, and writes its own read positions. That produces three
  distinct families of bug — browsers cap concurrent connections per origin at roughly six on
  HTTP/1.1, so a few tabs plus REST traffic wedges the app entirely; two tabs racing a rotating
  refresh token trip the reuse-detection alarm and log the user out; and duplicate read-position and
  focus writes fight each other. One coordination mechanism fixes all three.

  ## FILES
  - `client/src/stream/shared/worker.ts` — the shared worker owning the single connection
  - `client/src/stream/shared/leader.ts` — leader election, heartbeat, and takeover on leader death
  - `client/src/stream/index.ts` — unchanged public API; the sharing is invisible to consumers
  - `client/src/auth/session.ts` — refresh is performed by the leader only
  - `client/src/stream/__tests__/` — multi-context tests
  - `docs/DEPLOYMENT.md` — the HTTP/2 recommendation and the fallback behaviour

  ## APPROACH
  1. **One connection per origin, not per tab.** A `SharedWorker` owns the stream and fans events out
     to every tab over a broadcast channel. Consumers keep the APTR-19 API unchanged — this is a
     transport swap beneath a stable interface, which is exactly why APTR-19 was required to build
     its transport in one file.
  2. **Leader election with a heartbeat and takeover.** Where `SharedWorker` is unavailable (some
     mobile browsers), fall back to leader election among tabs over a broadcast channel plus durable
     storage: one leader holds the connection, followers receive fan-out. The leader heartbeats; on
     missed heartbeats a follower takes over. Takeover must be **idempotent and single-winner** —
     two leaders is worse than none, because it silently doubles every write.
  3. **The leader alone performs token refresh.** Followers await the leader's refreshed state. This
     removes the race that APTR-21's refresh-grace window was patching around — that grace stays as
     defence in depth, but it is no longer the primary mechanism, which is the right ordering.
  4. **The leader alone writes read positions and focus/presence signals** (APTR-25). Followers
     render optimistically from the shared state. Two tabs must never double-emit a focus event or
     fight over read state.
  5. **Resume is shared state.** The highest-seen `seq` and the `stream_id` live in the shared
     context, so a takeover resumes from the true position rather than from whatever the new leader
     happened to see.
  6. **Document the deployment posture** (APTR-131): HTTP/2 is **recommended** because it removes the
     six-connection limit entirely; the shared connection makes the app correct on HTTP/1.1 rather
     than merely lucky. State that explicitly so a future agent does not remove the sharing after
     enabling HTTP/2 and reintroduce the refresh and read-state races, which are protocol-independent.
  7. No telemetry, no external fetch, no persistence of message content into shared storage beyond
     what the store already holds. Coordination metadata only.

  ## TEST PLAN
  - Unit: leader election converges to exactly one leader from a simultaneous multi-context start
  - Unit: leader death is detected on missed heartbeats and exactly one follower takes over
  - Integration: three simulated tabs share **one** stream connection; assert one connection, not three
  - Integration: three tabs, one token refresh — assert exactly one refresh call and no reuse alarm
  - Integration: three tabs scrolling — exactly one read-position write per settle window
  - Unit: takeover resumes from the shared highest `seq`, with no gap and no duplicate
  - Unit: with `SharedWorker` unavailable, the leader-election fallback provides the same guarantees
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - **Negative:** assert two leaders can never coexist — drive a partition/recovery sequence and
    assert single-winner at every step
  - **Negative:** assert closing the leader tab does not drop the turn for the remaining tabs — the
    APTR-121 refcount is not decremented to zero by a leadership change

  ## EDGE CASES
  - The leader tab closing mid-turn — takeover reconnects and resumes inside the APTR-121 grace
    window, so the turn is never cancelled by a tab close
  - All tabs closing — the refcount reaches zero legitimately and the grace window governs, exactly
    as designed
  - A tab in a different profile or a private window — a separate context by definition; it gets its
    own connection and that is correct
  - Storage disabled or partitioned — fall back to per-tab connections with a documented degradation,
    never to a broken shared state
  - A follower tab restored from bfcache with stale shared state — revalidate on restore rather than
    trusting the cached view
  - A slow follower — it is a fan-out consumer, not a stream subscriber; it can never apply
    backpressure to the server-side stream

- **Acceptance criteria:**
  - [ ] Tabs of one origin share **one** stream connection via a shared worker, with a leader-election
        fallback providing the same guarantees where it is unavailable
  - [ ] Exactly one leader at all times, proven across partition and recovery; takeover is idempotent
  - [ ] Token refresh, read-position writes, and focus/presence signals are performed by the leader only
  - [ ] Resume position is shared state, so takeover resumes with no gap and no duplicate
  - [ ] The APTR-19 public API is unchanged — no consumer knows sharing exists
  - [ ] A leadership change never cancels a turn; closing all tabs falls through to the grace window
  - [ ] No hardcoded infrastructure values in new/modified code, and all existing tests still pass

---

### APTR-130: Operational visibility for the stream registry and the limiter
- **Priority:** Medium
- **Labels:** aperture, bff, observability, admin
- **Agent:** claude
- **Estimate:** 3h
- **Blocked by:** APTR-17, APTR-22
- **Description:** This sprint creates a stream registry, a backpressure policy, a connection budget,
  a rate limiter, and a replay buffer — every one with a tunable threshold, and not one with a
  counter. Those knobs are currently tuned blind. Expose the counters on an authenticated admin
  route so an operator can see what the instance is actually doing.

  **Zero telemetry leaves the box.** These are local counters on a local route — that is precisely
  what makes them acceptable under the sovereignty rule, and the item must not grow an exporter, a
  scrape target for anything outside the instance, or any external dependency.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — the admin counters route and its response shape
  - `client/src/routes/admin/status/` — a plain admin surface rendering the counters
  - **Agent-core repo (sibling PR):** the counter registry and the read handler

  ## APPROACH
  1. Counters, all in-process and cheap: active streams (total and per user), streams opened/closed
     by reason, per-user cap hits, global ceiling refusals, slow-consumer evictions, coalescing
     events, replay-gap/`resync` emissions, resume attempts and successes, turns cancelled by cause
     (`user_stop` / `abandoned` / `revoked` / `reap`), limiter trips per dimension, and lockouts.
     Each maps to a threshold this sprint made configurable — a counter with no corresponding knob
     is noise, and a knob with no counter is guesswork.
  2. Counters are **monotonic** with a process start time, plus a small set of current gauges
     (active streams, buffered bytes). No histograms, no time series, no retention — an operator
     reading two samples can compute a rate, and that is enough.
  3. Behind the **admin guard** from APTR-22, default-deny like every other route. A member reading
     instance-wide operational data is an information leak about other users' activity.
  4. **No per-user identifying detail in the aggregate view** beyond counts. "Which user is at their
     cap" is answerable, "what that user is doing" is not.
  5. Counters must be **cheap enough to be always-on** — atomics on the hot path, never a lock. A
     counter that slows the stream path is a worse bug than the blindness it fixes. Assert the
     stream path's throughput is unchanged with counters enabled.
  6. **Assistant-operable parity:** an admin can ask the assistant "how is the instance doing" and
     get these counters through the same guard (Module Contract clause 4), which is the natural
     interface on a self-hosted instance with no dashboard.
  7. No external exporter, no scrape endpoint reachable off-instance, no analytics, no upload. Ever.

  ## TEST PLAN
  - Unit: each counter increments on its triggering event and on no other
  - Integration: driving the APTR-17 scenarios (cap hit, eviction, coalescing) moves exactly the
    expected counters
  - Integration: a member is refused on the admin counters route; an admin succeeds
  - Unit: the response contains no user-identifying content beyond counts and per-user cap-hit tallies
  - Unit: counters are lock-free on the stream path; assert throughput is statistically unchanged
    with counters enabled versus a build without them
  - Integration: the assistant-invoked path returns the same data subject to the same guard
  - Verify no hardcoded IPs, hostnames, ports, or org names in new/modified files
  - **Negative:** assert no counter data is ever sent anywhere — no exporter, no outbound request, no
    external scrape target exists in any code path
  - **Negative:** assert an unauthenticated request to the counters route is refused, and the refusal
    reveals nothing about the instance

  ## EDGE CASES
  - Counter overflow on a long-running instance — use a width where overflow is not reachable in
    practice, and document the wrap behaviour rather than leaving it undefined
  - Process restart resetting counters — expose the process start time so an operator reads rates
    correctly rather than seeing a phantom drop
  - A counter added by a later sprint — the registry is additive and the route's shape is documented
    as extensible, so a new counter is not a contract break
  - An admin polling the route aggressively — it is cheap, but it is still rate-limited like any
    other route; it must not become its own load source
  - Gauges read while streams are opening and closing — a slightly stale gauge is acceptable and
    documented; taking a lock to make it exact would violate the hot-path rule

- **Acceptance criteria:**
  - [ ] Counters exist for every threshold this sprint made configurable, plus current gauges
  - [ ] Exposed on an admin-guarded, default-deny route; members and unauthenticated callers refused
  - [ ] No user-identifying detail beyond counts; no per-request or per-message data
  - [ ] Counters are lock-free and do not measurably slow the stream path
  - [ ] Admin-queryable by the assistant through the same authorization guard
  - [ ] No exporter, no outbound request, no external scrape target — proven by negative test
  - [ ] No hardcoded infrastructure values in new/modified code, and all existing tests still pass

---

### APTR-131: Deployment and TLS posture documentation
- **Priority:** Medium
- **Labels:** aperture, docs, deployment, security
- **Agent:** claude
- **Type:** documentation
- **Estimate:** 3h
- **Blocked by:** APTR-128
- **Description:** Several controls in this sprint are only correct under deployment assumptions that
  nothing writes down. `Secure` cookies and the `__Host-` prefix require HTTPS. Web Push in Sprint F
  requires HTTPS. The trusted-proxy hop count (APTR-128) is a security-critical setting whose safe
  value depends entirely on the deployment shape. HTTP/2 removes the browser connection limit that
  APTR-129 works around. An operator who gets any of these wrong gets a silently weaker instance, not
  an error message. This document is what stands between them and that.

  Written for the public mirror: **key names, shapes, and reasoning only — no addresses, no
  hostnames, no ports, no example values that resolve to anything.**

  ## AUDIENCE
  The operator deploying a self-hosted instance, and the agent implementing a later sprint who needs
  to know which assumptions they are allowed to rely on. Assumed competent with a reverse proxy and
  TLS; not assumed to have read this sprint's specs.

  ## OUTLINE
  1. **TLS is required, not recommended.** Which controls silently degrade without it: `Secure` and
     `__Host-` cookies, Web Push (Sprint F), and the general confidentiality of bearer tokens on the
     desktop target. State that the instance should refuse to issue a `__Host-` cookie over plaintext
     rather than downgrading the flags.
  2. **Reverse proxy expectations.** Buffering **must** be disabled for `text/event-stream`, and
     compression **must** be exempted for it — either will re-buffer the stream and defeat both the
     anti-buffering headers and the open-padding trick from APTR-15, turning a live stream into a
     wall of text at the end. Name the behaviour required, not a specific product's directive.
  3. **Trusted proxy hops.** Cross-reference APTR-128: what the key means, why the default is zero,
     what setting it too high costs (spoofable rate limiting), and what leaving it at zero costs
     (coarser per-source buckets). Both failure directions, plainly.
  4. **HTTP/2 recommended.** Why: it removes the per-origin connection cap that shapes APTR-129.
     And the explicit warning that enabling it is **not** a licence to remove cross-tab sharing —
     the refresh and read-state races it also prevents are protocol-independent.
  5. **Targets and auth, per D1.** Web and mobile PWA use same-origin cookies; desktop uses a
     configured endpoint with a bearer token held in OS secure storage. **No CORS headers are served
     on the Aperture API, ever**, and the reason: the desktop client is a native HTTP client, not a
     browser fetch subject to CORS. Warn explicitly against "fixing" a desktop issue with CORS.
  6. **Bootstrap.** The out-of-band token (APTR-125) appears on the server console and via the CLI
     subcommand; it is regenerated on restart while bootstrap remains required. What to do if the
     console is not visible.
  7. **Secrets.** Every credential is resolved through the secret manager at runtime. `.env` files
     are a runtime materialization, never a place to author a value. Names only, in this document.
  8. **Private CA and self-signed certificates** — noted as **deferred to Sprint E** (D10 item 13),
     with the current position stated honestly: a publicly-trusted certificate is assumed for now.
  9. **A pre-flight checklist** an operator can run down before first start, each line traceable to a
     control in this sprint.

  ## SOURCES
  - `specs/S128-DECISIONS.md` (D1, D10 items 9 and 13)
  - This sprint's APTR-15 (anti-buffering), APTR-121 (grace window), APTR-125 (bootstrap token,
    cookies, CORS), APTR-128 (trusted proxy), APTR-129 (connection sharing)
  - `docs/CONFIGURATION.md` for the authoritative key names — this document explains, it does not
    duplicate, and where they disagree `CONFIGURATION.md` wins

  ## TONE
  Direct and consequence-first: for each setting, say what breaks and how it will present when it is
  wrong, because a silently weaker instance is the failure mode being defended against. No product
  recommendations, no copy-paste configuration blocks that would need real values in them.

- **Acceptance criteria:**
  - [ ] TLS requirement documented with the specific controls that degrade without it
  - [ ] SSE proxy requirements documented — no buffering, no compression for `text/event-stream`
  - [ ] Trusted-proxy hops explained in both failure directions, cross-referenced to APTR-128
  - [ ] HTTP/2 recommended, with the explicit warning against removing cross-tab sharing
  - [ ] Per-target auth and the no-CORS-ever rule documented per D1, with the anti-pattern named
  - [ ] Bootstrap token retrieval, secret-manager discipline, and the deferred private-CA position
        all stated, plus a pre-flight checklist
  - [ ] No IPs, hostnames, ports, emails, or absolute user paths anywhere in the document
  - [ ] README links to the deployment posture doc
