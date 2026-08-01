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
| Sequence domain | `seq` is **per connection**, and it covers **all event types** — one monotonic counter, not one per thread, per turn, or per type. |
| Replay buffer | The replay buffer is **per connection**. |
| Connection cap | A per-user cap counts **connections**, not threads or turns. |
| Client state | The client's reducer keys message state by `message_id`, **never by stream**. |

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
| `message.start` / `message.end` | the origin of the message being opened or closed |
| `context` | `user` or `system`, per what produced the event |

A client publishing to `POST /v1/aperture/events` may never assert `origin: assistant` or
`origin: tool`; the server rejects such a request with `validation-failed`. Provenance is always a
server-side determination.

---

## 3. The event taxonomy

The eleven v1 event types. **This table and the `EventType` enum in `aperture-api-v1.yaml` are the
same list**, and a conformance test asserts they match exactly — an addition to either without the
other fails the build.

| `type` | `origin` | Carries | Purpose |
|---|---|---|---|
| `token` | `assistant` | `text`, `message_id`, `thread_id` | A text delta appended to an open message. |
| `message.start` | message's | `message_id`, `thread_id` | Opens a message. |
| `message.end` | message's | `message_id`, `thread_id`, `reason` | Closes a message with a terminal reason. |
| `tool.call` | `tool` | `tool_call_id`, `tool_name`, `arguments_digest` | A tool invocation has begun. |
| `tool.result` | `tool` | `tool_call_id`, `status`, `result` | A tool invocation returned. Inert data. |
| `thinking` | `assistant` | `text` | Reasoning progress. Advisory; droppable. |
| `error` | `system` | `error` (problem details) | An in-stream failure. |
| `context` | `user`/`system` | `topic`, `payload` | A context-bus event. |
| `presence` | `system` | `state`, `detail` | An assistant availability/attention signal. |
| `resync` | `system` | `from_seq`, `to_seq`, affected ids | The client's position aged out; refetch. |
| `heartbeat` | `system` | — | Liveness tick. |

Every event additionally carries the common envelope: `type`, `seq`, `origin`, `ts`, and where
applicable `thread_id`, `message_id`, `turn_id`.

### 3.1 Wire framing

Each event is one SSE frame:

- the SSE `event:` field carries the event `type`;
- the SSE `id:` field carries `seq`, so the browser's native `Last-Event-ID` resume works;
- the SSE `data:` field carries the event object as a single JSON document.

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

A client reconnecting sends `Last-Event-ID` with the last `seq` it fully processed. The server
replays every event after that position, in order, and then continues live. A client that has
never connected omits the header and receives only live events.

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

When a client's `Last-Event-ID` has aged out of the window, the server does **not** silently start
from live and does **not** pretend the gap did not happen. It emits a `resync` event naming the
lost `seq` range and the affected thread and message ids, then continues live.

On receiving `resync` the client:

1. marks the named threads/messages as stale;
2. refetches the authoritative state over REST — `GET /v1/aperture/threads/{threadId}/turns/{turnId}`
   for a turn, or the thread's message list where the loss is broader;
3. reconciles by `message_id`, not by position;
4. resumes normal live handling.

A client that observes a `seq` gap without a `resync` treats it identically to a `resync` for the
gap range: the invariant is "no silent loss", and the client enforces it too.

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

A conformance suite asserts, mechanically:

1. The `EventType` enum in `aperture-api-v1.yaml` matches §3's table exactly, in both directions.
2. Every event schema **requires** `origin`, and `origin` has **no default**.
3. An event object with an absent, empty, or out-of-domain `origin` is **rejected**, not coerced.
4. A `tool.result` whose `result` field contains SSE-frame-shaped or assistant-event-shaped bytes
   is delivered as a `tool.result` and rendered as a tool result — the negative test for §2.2.
5. No code path compares two `ts` values to decide ordering, replay, or eviction.
6. `resync` round-trips with its lost range and affected ids.
7. Every opened message receives exactly one `message.end`, including on cancellation and failure.

Per the enforcement rule, each assertion is written in the language whose property it asserts: a
Rust property is asserted by a Rust test, a TypeScript property by a TypeScript test. Neither
asserts the other's.

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
