# Aperture stream events — contract v1

**Status:** normative. This document and `contracts/aperture-api-v1.yaml` are one contract read
from two directions. Server-Sent Events are not naturally expressible in OpenAPI, so the schema
carries the machine-readable event shapes (`#/components/schemas/StreamEvent`) and this document
carries the ordering, provenance, and resume rules that a schema cannot express. Neither is
optional and neither may be extended without the other.

Companion documents: `contracts/aperture-transport-v1.md` (per-target transport, auth, CSP),
`contracts/README.md` (versioning and shared conventions), `contracts/aperture-errors-v1.md`
(the problem-details URN taxonomy).

---

## 1. A stream is ONE CONNECTION

This is the definition, not a suggestion, and it is the single most commonly mis-read part of
this contract. Three reviews found `stream_id` being read three incompatible ways — one
connection, one thread, one turn — with each reader quietly picking a different one.

> **A stream is one connection.** Not one thread. Not one turn. Not one message.

Everything else follows from that:

| Consequence | Statement |
|---|---|
| Demultiplexing | `thread_id` and `message_id` demultiplex many threads and many turns **inside a single connection**. A client does not open a connection per thread. |
| `stream_id` | **`stream_id` is the connection id.** Not a thread id, not a turn id, not a message id. Every event carries it. Values are unguessable and never sequential. |
| Sequence domain | `seq` is **per `stream_id`**, and it covers **all event types** — one monotonic counter, not one per thread, per turn, or per type. |
| Replay buffer | The replay buffer is **per `stream_id`**. |
| Connection cap | A per-user cap counts **connections**, not threads or turns. |
| Client state | The client's reducer keys message state by `message_id`, **never by `stream_id`**. |

The `thread_id` query parameter on `GET /v1/aperture/stream` is a server-side **filter, not a
scope**. It narrows what is delivered. It does not create a per-thread stream, does not change the
sequence domain, and does not license a second connection model.

A **turn** is a separate entity from a stream. A turn is refcounted by its subscribers; its
lifetime rules are in §6.

### Worked example — one connection, two threads, interleaved turns

```
seq  event          thread   message   origin      note
---  -------------  -------  --------  ----------  ------------------------------------------
101  message.start  T-a      M-1       system      turn A opens
102  token          T-a      M-1       assistant
103  message.start  T-b      M-2       system      turn B opens on a DIFFERENT thread,
                                                   on the SAME connection
104  token          T-a      M-1       assistant   interleaving is normal, not an error
105  tool.call      T-b      M-2       tool
106  token          T-a      M-1       assistant
107  tool.result    T-b      M-2       tool        inert data — never coalesced into 104/106
108  message.end    T-a      M-1       system      reason: completed
109  token          T-b      M-2       assistant
110  heartbeat      —        —         system      consumes a seq like anything else
111  message.end    T-b      M-2       system      reason: completed
```

Every row above shares **one** `stream_id`, because they share one connection. The SSE `id:` of
the last frame is `"{stream_id}:111"`.

A client that assumed one stream per thread would treat `seq` 103 as a protocol violation. It is
not. Interleaving across threads on one connection is the normal case.

---

## 2. Provenance — the `origin` discriminator

**Every stream event and every stored message carries a mandatory `origin`.** There is no exempt
event type: `heartbeat` carries one exactly as `token` does, because an exemption is how a
mandatory invariant erodes.

| Value | Means |
|---|---|
| `assistant` | Produced by the assistant's own generation. |
| `tool` | Produced by a tool invocation, including everything a tool returned. |
| `system` | Produced by the platform: lifecycle, presence, errors, resync, heartbeat. |
| `user` | Produced by a human principal. |

### 2.1 The client rule

> **Clients derive visual voice, framing, labelling, styling, ordering into a speaker column, and
> screen-reader announcement from `origin` and the event variant ONLY — never from content.**

No sniffing. No heuristics. No "the text begins with a name, so that must be the speaker". No
"this looks like JSON, so render it as a tool result". The server decides provenance, the client
renders provenance, and content never gets a vote. This is the UI half of prompt-injection
containment.

### 2.2 The transport rule

> **A `tool.result` can never be emitted as, or coalesced into, an assistant token event,
> regardless of what bytes the tool returned.**

A tool result is **inert data**. If a tool returns something shaped like an SSE frame, an
assistant message, an event envelope, or a complete `data:` line, it is still delivered as a
`tool.result` and still rendered as a tool result. It is never parsed as an event, never merged
into a token stream, and never re-attributed.

### 2.3 It describes the producer, not the subject

`origin` answers *who produced this object*, not *what it is about*.

- A `system` event reporting that a tool failed is `origin: system`, not `origin: tool`.
- A user's own message echoed back on the stream is `origin: user`. It arrives on the same
  connection the assistant speaks on, and the client must still not render it as assistant text.

### 2.4 No defaulting, ever

There is no default value, no fallback, no inference, and no `other(String)` escape hatch. An
event or message whose `origin` is absent, empty, or outside the four values is **rejected at
deserialization** — never coerced, never defaulted. A defaulted `origin` would silently launder a
tool payload into assistant attribution, which is precisely the path this field exists to close.

A fifth value requires a contract amendment and an operator decision, not a code change.

### 2.5 Fixed origins per event type

Some event types have a fixed `origin`, asserted by the schema:

| Event type | `origin` |
|---|---|
| `token` | always `assistant` |
| `thinking` | always `assistant` |
| `tool.call` | always `tool` |
| `tool.result` | always `tool` |
| `error` | always `system` |
| `presence` | always `system` |
| `resync` | always `system` |
| `heartbeat` | always `system` |
| `message.start` / `message.end` | always `system` — see below |
| `context` | `user` or `system` only, **constrained in the schema** |

Every one of these is a schema-level `const` or a restricted `enum`, not a description. A
constraint that lives only in prose is a constraint six sprints will code past.

**Lifecycle events are `origin: system`, and carry `message_origin` separately.** A
`message.start` is produced by the platform, not by whatever the message will go on to contain,
so its own `origin` is `system` — consistent with §2.3. The provenance of the **message** is a
separate mandatory field, `message_origin`, and that is what a client binds its attribution to.
`message.end` repeats it and must repeat it identically; a mismatch is a protocol violation and
the client keeps what it recorded at `message.start`.

A client publishing to `POST /v1/aperture/events` may never assert `origin: assistant` or
`origin: tool`; the schema restricts `context` to `user | system` and the server rejects anything
else with `validation-failed`. Provenance is always a server-side determination.

### 2.6 The message-association invariant — closing the indirect path

Pinning `token` to `assistant` and `tool.result` to `tool` closes the **direct** laundering path.
It does not close the **indirect** one, which runs through the message an event is associated
with:

> If a `tool.result` could be associated with a message opened as `message_origin: assistant`,
> then a client faithfully following this contract would render tool output inside an assistant
> message. Every individual event would validate. The tool payload would have been laundered by
> association rather than by label.

That is the same failure D9 exists to prevent, reached one step sideways. It is closed by three
rules:

1. **`message_origin` is declared once, at `message.start`, and is immutable.** It has no
   default, cannot be inferred, and is never revised — not by `role_hint`, not by content, not by
   a later event claiming otherwise.
2. **`tool.call`, `tool.result`, and `token` all carry a required `message_id`.** The association
   is explicit. It is never inferred from adjacency in the stream, which was the previous
   implicit and unstateable rule.
3. **The association must agree with the provenance:**
   - a `token` may only reference a message opened `message_origin: assistant`;
   - a `tool.call` or `tool.result` may only reference a message opened `message_origin: tool`.

**This constraint spans two events and is therefore not expressible in OpenAPI.** No `$ref`,
`allOf`, `oneOf`, or `discriminator` can reach back to a previously emitted event and check what
it declared. Rather than leave that as an unstated gap, it is stated here in those words and
enforced by conformance test **T-ORIGIN-5**, which asserts it on both sides:

- the **server** MUST NOT emit an event violating it, and the test drives the server to try;
- a **client** receiving one MUST fail closed — render it under tool framing, or discard it.
  Rendering it where it landed is not an option, and neither is trusting the association.

The generalized rule, worth stating because it is the one a future event type must also obey:
**an event is attributed by the provenance of the message it belongs to and by its own `origin`,
and where those two disagree, the event is invalid rather than resolved in either direction.**

---

## 3. The event taxonomy

The eleven v1 event types. **This table and the `EventType` enum in `aperture-api-v1.yaml` are the
same list**, and a conformance test asserts they match exactly — an addition to either without the
other fails the build.

| `type` | `origin` | Carries | Purpose |
|---|---|---|---|
| `token` | `assistant` | `text`, `message_id`, `thread_id` | A text delta appended to an open message. |
| `message.start` | `system` | `message_id`, `thread_id`, **`message_origin`** | Opens a message and declares its provenance. |
| `message.end` | `system` | `message_id`, `thread_id`, `reason`, **`message_origin`** | Closes a message with a terminal reason. |
| `tool.call` | `tool` | `tool_call_id`, `tool_name`, `arguments_digest`, **`message_id`** | A tool invocation has begun. |
| `tool.result` | `tool` | `tool_call_id`, `status`, `result`, **`message_id`** | A tool invocation returned. Inert data. |
| `thinking` | `assistant` | `text` | Reasoning progress. Advisory; droppable. |
| `error` | `system` | `error` (problem details) | An in-stream failure. |
| `context` | `user`/`system` | `topic`, `payload` | A context-bus event. |
| `presence` | `system` | `state`, `detail` | An assistant availability/attention signal. |
| `resync` | `system` | `reason`, `lost_range`, affected ids | Events were not delivered; refetch. |
| `heartbeat` | `system` | — | Liveness tick. |

Every event additionally carries the common envelope: `type`, `stream_id`, `seq`, `origin`, `ts`,
and where applicable `thread_id`, `message_id`, `turn_id`.

### 3.1 Wire framing

Each event is one SSE frame:

- the SSE `event:` field carries the event `type`;
- the SSE `id:` field carries the composite **`"{stream_id}:{seq}"`**, so the browser's native
  `Last-Event-ID` resume works and carries enough information to be interpreted;
- the SSE `data:` field carries the event object as a single JSON document.

The `id:` is composite rather than a bare `seq` because a `seq` is only meaningful inside its
connection. Without the `stream_id` half, a server receiving `Last-Event-ID: 412` cannot
distinguish "resume this connection from 412" from "that connection is gone and 412 means
nothing", and would have to guess. It does not guess — see §5.3.

`heartbeat` is a real event with a real `seq`, not an SSE comment line. A comment would not be
replayable and would not be visible to a non-browser client's reducer.

### 3.2 Advisory versus load-bearing

`thinking`, `presence`, and `heartbeat` are **advisory**: a client may render, collapse, or ignore
them, and dropping them never breaks message reconstruction. Everything else is load-bearing — a
client that discards a `tool.result` or a `message.end` has an incomplete transcript.

---

## 4. Ordering guarantees

1. **`seq` is strictly increasing with no gaps within a connection.** A client that observes a gap
   has lost events and MUST treat it as a resync condition (§5).
2. **Ordering is decided by `seq` and never by `ts`.** No code path — client or server — compares
   two timestamps to decide ordering, replay position, or eviction. Wall-clock values are for
   display and audit only. A clock step must never be able to reorder a conversation.
3. **Per message: `message.start` … `token`\* … `message.end`.** Exactly one `message.start`
   precedes any `token` for a given `message_id`, and exactly one `message.end` follows.
4. **Every opened message is closed exactly once** — on success, on cancellation, and on failure.
   A stream never simply stops mid-message. The only exception is the connection itself dying,
   which is what resume exists for.
5. **`tool.call` precedes its `tool.result`** for the same `tool_call_id`. A `tool.result` without
   a preceding `tool.call` on the same connection is a protocol violation.
6. **Across threads there is no ordering guarantee** beyond the shared `seq`. Events for different
   `thread_id`s interleave freely, as in §1's worked example.
7. **`token` text is append-only and concatenation-ordered.** Concatenating the `text` of every
   `token` for a `message_id` in `seq` order reproduces the message body exactly. Tokens are never
   re-sent, re-ordered, or revised.
8. **An in-stream `error` is followed by a `message.end`** where a message was open. An error
   never leaves a message dangling.

### 4.1 Clocks

Four rules, cited rather than re-derived by anything that touches time:

- **(a)** Ordering and resume use `seq`, never timestamps.
- **(b)** All interval and window arithmetic — heartbeat, grace window, limiter windows, lockouts
  — uses a **monotonic** clock, so an NTP step or a manual clock adjustment cannot extend a
  lockout or collapse a grace window.
- **(c)** Wall-clock `ts` values are for display and audit only. They are UTC ISO-8601 with an
  explicit offset, in one documented format, rendered in the viewer's local zone by the client.
- **(d)** Verification leeway for signed material is a small **named, documented, bounded**
  allowance — never unbounded, and never zero.

---

## 5. Resume, the bounded replay window, and `resync`

### 5.1 Resume

A client reconnecting sends `Last-Event-ID` with the composite `"{stream_id}:{seq}"` of the last
event it fully processed. The server replays every buffered event for that `stream_id` after that
`seq`, in order, and then continues live. A client that has never connected omits the header and
receives only live events.

A client persists the highest `seq` it has seen **per `stream_id`** across reconnects.

The three input cases are distinguished, and there is no fourth:

| `Last-Event-ID` | Meaning | Result |
|---|---|---|
| **Absent** | First connection. The client is not asking to resume. | Live delivery, **no** `resync`. Lossless. |
| **Parses, position live** | Resume from a known position. | Replay from that `seq`, then live. |
| **Parses, position aged out or `stream_id` unknown** | Resume from a position the server cannot honour. | Fresh `stream_id` + `resync` — §5.3, §5.4. |
| **Malformed** | The client is asking to resume from *somewhere*. | Fresh `stream_id` + `resync(reason: unparseable_position)` — §5.4. **Never treated as absent, never parse-guessed.** |

A malformed value is **not** the same as an absent one, and the difference is the whole point:
absent means "I have never connected", malformed means "resume me", and answering the second with
silent live delivery loses continuity without telling the client.

### 5.2 The window is bounded

Replay is served from a buffer bounded on **both** an event count and a wall-clock retention,
each a named configuration key:

| Bound | Configuration key |
|---|---|
| Maximum buffered events per connection | `APERTURE_STREAM_REPLAY_MAX_EVENTS` |
| Maximum buffer retention | `APERTURE_STREAM_REPLAY_MAX_SECONDS` |
| Heartbeat interval | `APERTURE_STREAM_HEARTBEAT_SECONDS` |
| Maximum concurrent connections per user | `APERTURE_STREAM_MAX_CONNECTIONS_PER_USER` |
| Turn cancellation grace window | `APERTURE_STREAM_TURN_GRACE_SECONDS` |

Values are operator configuration and live in `docs/CONFIGURATION.md`. This contract names keys
only. **Resume is never unbounded**, and no client may assume otherwise.

### 5.3 `resync`

Whenever events could not be delivered, the server says so. It does **not** silently start from
live and does **not** pretend the gap did not happen.

**The four cases, and there are only four** — the `reason` field always names which one:

| `reason` | When | `lost_range` |
|---|---|---|
| `window_aged_out` | The position was valid but has fallen out of the bounded buffer. | Present |
| `gap_detected` | The server detected a gap in its own emission. | Present |
| `unknown_stream` | The `stream_id` is not one the server has — restart, or the connection was reaped. | **Absent** |
| `unparseable_position` | The `Last-Event-ID` did not parse. | **Absent** |

This table is **enforced by the schema**, not just documented: `ResyncEvent` carries an
`if`/`then`/`else` requiring `lost_range` for the first two reasons and **forbidding** it for the
last two. Absent means absent — a fabricated range for a position the server never had would be
trusted by a client and cause it to under-refetch.

#### The sequence domain of the reported range

This is the part two implementers would otherwise read two ways, so it is pinned:

- The `resync` event's **envelope** `stream_id` and `seq` belong to the **current** connection —
  the one the client is reading right now.
- The **lost events** belong to whichever connection they were numbered in, which after a
  reconnect is the **previous** one.
- Therefore `lost_range` carries its **own** `stream_id`, and that is the domain `from_seq` and
  `to_seq` are expressed in. It is frequently *not* equal to the envelope's `stream_id`, and a
  client must never assume it is.

#### Inclusive, and never self-referential

- `from_seq` and `to_seq` are **inclusive on both ends**. The closed interval
  `[from_seq, to_seq]` is exactly the set of `seq` values that were not delivered.
- `from_seq == to_seq` means **precisely one** lost event.
- `from_seq <= to_seq` always. This is a **cross-property** comparison and is therefore *not*
  expressible in JSON Schema — no keyword can compare two sibling values, and `minimum` cannot
  reference another field. It is enforced by conformance test **T-RESYNC-3**, which asserts the
  server never emits an inverted range and that a client **rejects** one rather than normalizing
  it by swapping the ends. Swapping would turn a server bug into a plausible-looking refetch over
  the wrong range, which is worse than a visible failure.
- A `resync` is **never inside its own reported range**. It is a delivered event in the current
  domain; the range describes undelivered events, in a domain it names explicitly. There is no
  case in which a client should subtract the `resync` itself from the range.

Where the loss cannot be expressed as a range — `unknown_stream`, `unparseable_position` — the
server has no trustworthy prior position to subtract from, so it omits `lost_range` entirely
rather than inventing a plausible one. The client then refetches the affected threads wholesale.

#### What the client does

1. Marks the named threads/messages stale.
2. Refetches authoritative state over REST — `GET /v1/aperture/threads/{threadId}/turns/{turnId}`
   for a turn, or the thread's message list where the loss is broader, or wholesale where
   `lost_range` is absent.
3. Reconciles by `message_id`, **not** by position.
4. Resumes normal live handling.

A client that observes a `seq` gap without a `resync` treats it identically to a `resync` with
`reason: gap_detected` for the gap range: the invariant is "no silent loss", and the client
enforces it too.

### 5.4 An unknown or unparseable resume position

**Unknown `stream_id`.** The server restarted, or the connection was reaped. The server issues a
**fresh** `stream_id` with its own `seq` domain and immediately emits a `resync` with
`reason: unknown_stream`, so the client refetches rather than assuming continuity. It does not
silently pretend the old position was honoured, and it does not reject the connection.

**Unparseable `Last-Event-ID`. This is NOT treated as absent.** Absent means "I have never
connected, start me at live" — a legitimate, lossless request. Malformed means "resume me from
somewhere", and quietly answering that with live delivery loses continuity without telling the
client, which is precisely the silent loss this section forbids. The server therefore treats it
exactly like an unknown stream: fresh `stream_id`, immediate `resync` with
`reason: unparseable_position`, no `lost_range`. It never parse-guesses the value.

The only case that starts at live with no `resync` is a genuine first connection with no
`Last-Event-ID` at all.

Two tabs resuming the same `stream_id` concurrently is permitted: both may replay. Emission
remains single-writer per `stream_id`, so `seq` stays strictly increasing and gapless for each.

The term "gap marker" does not appear in this contract. The event is `resync`.

---

## 6. Turn lifecycle, cancellation, and multi-subscriber

Cancel-on-disconnect, resume-after-drop, and two devices watching one turn cannot all hold
naively: the first disconnect would kill generation for the surviving device, and resume would
then always resume a cancelled turn. The resolution:

1. **A turn is refcounted by its subscribers.**
2. **A transport drop does not cancel a turn.** Cancellation happens when the refcount reaches
   **zero** *and* a grace window (`APERTURE_STREAM_TURN_GRACE_SECONDS`) elapses. A second device
   watching keeps the turn alive.
3. **Explicit user "stop generation" cancels immediately and unconditionally**, regardless of
   refcount. It is `POST /v1/aperture/threads/{threadId}/turns/{turnId}/stop`, and it is a
   **different action** from a transport drop. The two are never conflated, and the difference is
   observable in the terminal reason.
4. **Resume within the replay window reattaches to a live turn** and increments the refcount.
   Resume after the turn ended replays from the buffer.

### 6.1 Terminal reasons on `message.end`

| `reason` | Means |
|---|---|
| `completed` | The turn finished normally. |
| `stopped_by_user` | An explicit user stop. A deliberate human decision. |
| `abandoned` | Refcount reached zero and the grace window elapsed. Nobody was listening. |
| `upstream_error` | An upstream failure. Paired with an in-stream `error` event. |
| `upstream_timeout` | An upstream inactivity timeout. Paired with an in-stream `error` event. |

`stopped_by_user` and `abandoned` are distinct on purpose. A client renders a user stop as a
deliberate, non-error state — never styled as a failure — and an abandonment as neither.

---

## 7. Backpressure and non-interference

Aperture is one subscriber among several channels on a shared generation path. It must never be
able to degrade the others.

- Publishing an event into the fan-out is **non-blocking** and **must not panic**. Blocking on a
  slow subscriber stalls the turn for **every** channel, not just Aperture.
- On a full per-subscriber buffer the server **drops and resyncs** rather than blocking: the slow
  subscriber loses its position and receives a `resync`, and everyone else is unaffected.
- A slow or hostile Aperture client can therefore cost itself a resync. It can never cost another
  channel its turn.

---

## 8. Producers

Token deltas are not the only thing that may produce events. `tool.call`, `tool.result`,
`thinking`, lifecycle, `presence`, and `context` events all have permitted producers, and all
publish into the **same per-turn fan-out** as the token deltas — the same sequence, the same
buffer, the same connection.

What is prohibited is narrow and specific:

- **no second token path**, and
- **no second SSE frame parser** anywhere.

One parser, one fan-out, one sequence. An implementation that grows a parallel stream, a parallel
sequence counter, or a second frame parser has broken this contract even if every event it emits
is individually well-formed.

---

## 9. Conformance tests this document requires

Each test below has a **stable id**, cited from `aperture-api-v1.yaml` wherever a constraint is
stated in prose because it cannot be stated in the schema. Where this contract says "enforced by
T-*", that is a commitment that the test exists — not a euphemism for "we wrote it down and hoped".

**A constraint that no schema can express and no test enforces is not a constraint.** Every such
gap in this contract is named as one, in those words, and given a test id here.

| Id | Asserts | Enforceable in the schema? |
|---|---|---|
| **T-ORIGIN-1** | The `EventType` enum matches §3's taxonomy table exactly, in both directions. | Yes — schema/doc drift check |
| **T-ORIGIN-2** | Every event schema **requires** `origin`, and `origin` has **no default**. | Yes |
| **T-ORIGIN-3** | An event with an absent, empty, or out-of-domain `origin` is **rejected**, never coerced. | Yes |
| **T-ORIGIN-4** | The fixed origins of §2.5 hold: `token`/`thinking` are `assistant`, `tool.call`/`tool.result` are `tool`, `error`/`presence`/`resync`/`heartbeat`/`message.start`/`message.end` are `system`, and `context` is `user\|system` and nothing else. | Yes — `const` / restricted `enum` |
| **T-ORIGIN-5** | **The message-association invariant of §2.6.** A `token` may only reference a message opened `message_origin: assistant`; a `tool.call`/`tool.result` may only reference one opened `message_origin: tool`. Asserted on **both** sides: the server refuses to emit a violation when driven to, and a client receiving one fails closed rather than rendering it in place. | **No — spans two events.** This test is the only enforcement. |
| **T-ORIGIN-6** | A `tool.result` whose `result` contains SSE-frame-shaped or assistant-event-shaped bytes is delivered as a `tool.result` and rendered as a tool result. The §2.2 negative test. | Partly — the rest is behavioural |
| **T-ORIGIN-7** | `message.end.message_origin` equals the value declared at `message.start`; a mismatch is rejected and the client keeps the recorded value. | **No — spans two events.** |
| **T-ORIGIN-8** | **The REST representation obeys the same provenance rule as the stream.** Round-trip: content that arrived as a `tool.result` is stored `origin: tool` and served over REST as `origin: tool`; no code path re-parents stored content from one origin to another; and a stored message's `origin` agrees with the `message_origin` its `message.start` declared. | **Partly.** The `origin` ↔ `tool_call_id` binding is schema-enforced; **byte provenance is not checkable by any schema** and this test is its only enforcement. |
| **T-RESYNC-1** | `resync` round-trips with `reason`, `lost_range` (including its own `stream_id` domain), and affected ids; `from_seq`/`to_seq` are honoured as **inclusive**; `lost_range` is absent exactly for `unknown_stream` and `unparseable_position`. | Partly |
| **T-RESYNC-3** | `from_seq <= to_seq` on every emitted `resync`, and a client **rejects** an inverted range rather than normalizing it by swapping the ends. | **No — cross-property comparison.** The `reason` ↔ `lost_range` relationship beside it *is* schema-enforced. |
| **T-RESYNC-2** | An **unparseable** `Last-Event-ID` produces a fresh stream plus a `resync` with `reason: unparseable_position` — **never** silent live delivery. An unknown `stream_id` likewise, with `reason: unknown_stream`. A genuine first connection produces neither. | No — behavioural |
| **T-CLOCK-2** | Every timestamp field `$ref`s `Timestamp` or `TimestampOrNull`; no field re-declares `format: date-time` inline; and the UTC pattern rejects a non-zero offset such as `+02:00`. | Yes — pattern + contract lint |
| **T-CLOCK-1** | No code path compares two `ts` values to decide ordering, replay, or eviction. | No — static/grep gate |
| **T-LIFECYCLE-1** | Every opened message receives exactly one `message.end`, including on cancellation and failure. | No — behavioural |
| **T-PROBLEM-1** | Every error response is `application/problem+json`; `Problem.type` matches the `urn:aperture:error:<class>` pattern; the object is **closed**, so an extension member is rejected rather than passed through. | Yes |
| **T-CORS-1** | No response on `/v1/aperture/*` carries a CORS header, and no route in the contract declares one. | Yes — contract lint |

Per the enforcement rule, each assertion is written in the language whose property it asserts: a
Rust property is asserted by a Rust test, a TypeScript property by a TypeScript test. Neither
asserts the other's. **T-ORIGIN-5** and **T-ORIGIN-7** exist in both languages, because both a
server and a client can violate them independently.

---

## 10. Extending this document

The event taxonomy is versioned with the API contract and follows the same policy
(`contracts/README.md`): **adding** an event type, or an optional field to an existing one, is an
additive minor change that stays on `/v1`; **removing** a type, renaming one, tightening a
required field, or changing an ordering guarantee is breaking and mints `/v2`.

Because clients must tolerate additive change, a v1 client **ignores an event type it does not
recognize** — it advances `seq`, it does not error, and it does not drop the connection. It must
not, however, guess at an unknown type's meaning, and it must never render an unrecognized event
with assistant attribution.
