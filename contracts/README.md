# Aperture contracts

This directory is the interface between the Aperture clients and the Aperture backend-for-frontend
(BFF). It is the artifact that lets the client sprints be built in parallel without contract
churn: if something is not in here, it is not agreed, and an implementation that invents it will
be found by the drift gate rather than by a user.

Everything in this directory is **normative**. These are contracts, not documentation of an
implementation, and where an implementation and a contract disagree, the contract is right and the
implementation is a defect.

---

## The documents

| File | Owns | Added by |
|---|---|---|
| `aperture-api-v1.yaml` | The OpenAPI 3.1 description of every `/v1/aperture/*` route: paths, schemas, headers, error responses, declared limits. | v1 baseline |
| `aperture-events-v1.md` | The SSE event taxonomy, `origin` provenance, ordering guarantees, bounded replay, `resync`, turn lifecycle. | v1 baseline |
| `aperture-transport-v1.md` | Per-target transport, auth (cookie vs bearer), CSP, and the no-CORS rule. | v1 baseline |
| `README.md` | This file: versioning policy, breaking-change policy, and the conventions shared by every route. | v1 baseline |

Later work extends this set rather than editing the baseline's meaning. Extension documents that
are expected, each owned by its own work item: `aperture-errors-v1.md` (the problem-details URN
taxonomy), `aperture-auth-v1.md` (session, CSRF, first-account bootstrap, deep links),
`aperture-idempotency-v1.md`, `aperture-attachments-v1.md`, `aperture-headers-v1.md`,
`aperture-modules-v1.md`, `aperture-context-bus-v1.md`. **This directory is shared** — an
extension document is added alongside the baseline, never in place of it.

---

## Versioning policy

The API is versioned in its **path**: every route lives under `/v1/aperture`. The contract also
carries a `major.minor` version, reported by `GET /v1/aperture/version` and on the
`X-Aperture-Contract-Version` response header of **every** response.

### Additive change — bump the minor, stay on `/v1`

An additive change is one that a conforming existing client cannot observe as a break:

- adding a route;
- adding an **optional** request field, query parameter, or header;
- adding a response field;
- adding a new event type, or an optional field to an existing event;
- adding a new problem-details URN;
- adding an enum value **to a response** where clients are already required to tolerate unknowns
  (`CapabilityState`, `EventType` — see "forward compatibility" below).

Additive changes bump the **minor** version. `/v1` continues to serve them.

### Breaking change — mint `/v2`

A breaking change is anything else:

- removing or renaming a route, field, header, event type, or enum value;
- making an optional field required, or a required field optional in a response clients rely on;
- narrowing a type, a range, or a `maxLength`;
- changing the meaning of an existing field without changing its name — **the most dangerous kind,
  because no schema check catches it**;
- changing an ordering guarantee, the sequence domain, replay semantics, or a terminal reason's
  meaning;
- changing an authentication mechanism for an existing target;
- adding a value to `Origin`. The provenance domain is deliberately closed.

A breaking change **mints `/v2`**. It is never applied in place to `/v1`.

### Deprecation window

When `/v2` is minted:

1. `/v1` and `/v2` are served **simultaneously** for the deprecation window.
2. `/v1` responses gain a `Deprecation` header and a `Sunset` header naming the end of the window.
3. The window's length is an operator decision recorded with the change, and it is long enough for
   an installed desktop build and a cached PWA to have been updated at least once.
4. `/v1` is withdrawn only after the window elapses. It is never withdrawn early because "everyone
   has upgraded" — a self-hosted deployment has no way to know that.

### Forward compatibility — the client's half of the bargain

Because additive change happens on `/v1`, a conforming client:

- **ignores unknown response fields** rather than erroring;
- **ignores unknown SSE event types** — it advances `seq`, does not error, and does not drop the
  connection. It must not guess an unknown type's meaning, and must never render an unrecognized
  event with assistant attribution;
- **fails closed on unknown enum values in a security- or capability-relevant position**. An
  unrecognized `CapabilityState` is treated as `unavailable`. An unrecognized `origin` is
  **rejected**, never defaulted. Forward compatibility never means "guess generously".

### Version skew

Every response carries `X-Aperture-Contract-Version` with the contract's `major.minor` and
**nothing else** — never a build hash, a commit id, a host name, a container identifier, or an
upstream component version. Those are infrastructure leaks and a conformance test asserts their
absence.

A client embeds the contract version it was generated against and classifies each response:

| Class | Client behaviour |
|---|---|
| match | Normal operation. |
| server newer, minor | Compatible. Log once. No user impact. |
| server older, minor | A client feature may not exist yet. Degrade that call; do not break the app. |
| major mismatch, either direction | **Incompatible.** |
| header absent | Unknown. Degrade; do not crash. |
| header malformed | Fail closed to incompatible. Never parse-guess. |

On **incompatible** skew the client raises a typed app-level event **once per session** and shows a
soft reload prompt. It never forces a reload mid-typing, never white-screens, and never enters a
reload loop. It **stops issuing new mutating requests** while keeping existing UI readable, so an
in-flight draft survives the upgrade. Requests that fail purely from skew map to the
`contract-version-unsupported` problem-details URN, which the client renders as the reload prompt
rather than a generic error.

---

## Shared conventions

These hold on **every** route unless that route explicitly says otherwise. They are stated once,
here, so that seven sprints do not each invent a slightly different answer.

### Timestamps

**All timestamps on the wire are UTC ISO-8601 with an explicit offset** — `2026-08-01T09:41:00Z`.
A local-time string never appears on the wire, in either direction. Rendering into the viewer's
local zone is a **client** concern and happens at the render boundary, not in the transport, not
in the store, and not on the server.

Timestamps are for **display and audit only**. Ordering, replay position, and eviction are decided
by `seq` (streams) or by cursors (collections), never by comparing timestamps. Durations and
windows are measured on a **monotonic** clock so that a clock step cannot extend a lockout or
collapse a grace window.

### Pagination

Every collection route is **cursor-paginated**. Offset pagination is not offered anywhere.

Request: `?cursor=<opaque>&limit=<n>`.
Response: `{ "items": [...], "page": { "next_cursor": "<opaque>|null", "has_more": <bool> } }`.

- **Cursors are opaque.** A client never constructs, parses, decodes, orders, or does arithmetic
  on one. It passes back exactly what it received.
- `limit` is clamped server-side to the maximum named by `APERTURE_MAX_PAGE_ITEMS`. Exceeding it
  is clamped, not an error.
- **Total counts are not returned.** They cost a second query and are stale the moment they are
  computed. Where a count genuinely matters it is a separate, explicitly-documented field.
- `has_more: false` with a `null` `next_cursor` is the only end-of-collection signal. An empty
  `items` array is not, on its own, a reliable one.

### Sorting and filtering

- `?sort=` takes a comma-separated field list, each optionally prefixed `-` for descending:
  `-updated_at,name`.
- `?filter=` takes a comma-separated list of `field:value` predicates, ANDed.
- **Both are fail-closed.** Only fields documented as sortable or filterable for that route are
  accepted. An unknown field, operator, or value shape is `validation-failed` — it is **never**
  silently ignored, because silently ignoring a filter returns more data than the caller asked
  for, which is a disclosure bug wearing a usability costume.

### Optimistic concurrency

Every mutable resource returns an **`ETag`**. Every mutating route on such a resource takes
**`If-Match`**.

- On `PATCH /threads/{threadId}` and `PUT /settings`, `If-Match` is **required**. A missing header
  is `validation-failed`; a stale one is `precondition-failed`.
- **`If-Match: *` is not accepted as a concurrency bypass** on any route.
- On `precondition-failed` the client refetches, reapplies its change to the fresh
  representation, and retries. It never retries blind, and it never presents last-write-wins as
  success.

### Idempotency

Non-idempotent mutating routes take an **`Idempotency-Key`** header; it is **required** on message
create and attachment create.

- The client generates one opaque, high-entropy key per **logical** operation — not per HTTP
  attempt — and replays it unchanged across transport retries.
- A **user-initiated** resend is a new logical operation and gets a **new** key.
- Same key + same body within the retention window replays the **recorded** response. Exactly one
  message is created.
- Same key + different body is `conflict`. Never a silent overwrite, never a second message.
- A duplicate arriving while the first is still in flight is `conflict`, never a second upstream
  turn.
- A missing key on a route that requires one is `validation-failed`, never silently accepted.
- The dedupe record stores a response status, a hash, and the created resource id — **not** the
  message content, so the dedupe store never becomes a second copy of the user's conversation.

### Errors

**Every** error response is RFC-9457 problem details, served as `application/problem+json`, with a
stable `type` URN of the form `urn:aperture:error:<class>`.

`validation-failed`, `auth-required`, `auth-expired`, `forbidden`, `not-found`, `conflict`,
`precondition-failed`, `payload-too-large`, `rate-limited`, `capability-unavailable`,
`upstream-timeout`, `upstream-error`, `contract-version-unsupported`, `internal`.

The URN is part of the contract: clients switch on it, so it is never reworded, re-cased, or
repurposed. The full taxonomy — each URN's meaning, its user-facing message, and its recovery
action — is owned by `aperture-errors-v1.md`.

Two rules that apply to every error everywhere:

- **Redaction is mandatory.** A problem-details body must never contain an internal host, address,
  port, file path, token, stack frame, or verbatim upstream error string. The server maps to a
  class and a safe message; the detail goes to the server log keyed by `correlation_id`, which the
  response echoes so an operator can join the two.
- **`not-found` over `forbidden` wherever existence is itself a secret.** A cross-principal fetch
  returns `not-found`. An error code must never become an existence oracle.

### Limits

Limits are **declared in the contract, not discovered at runtime**. Every operation carries an
`x-aperture-limits` block naming the configuration keys that bound it: request body size, JSON
nesting depth, maximum array length, page size, and any route-specific bound.

The contract names **keys**; `docs/CONFIGURATION.md` holds the operator-tunable values. That split
is deliberate — a value in a contract becomes a de-facto API that cannot be tuned per deployment,
and a limit discovered only by hitting it is not a contract at all.

Recurring keys: `APERTURE_MAX_REQUEST_BYTES`, `APERTURE_MAX_JSON_DEPTH`,
`APERTURE_MAX_PAGE_ITEMS`, `APERTURE_MAX_MESSAGE_ATTACHMENTS`, `APERTURE_ATTACHMENT_MAX_BYTES`,
`APERTURE_ATTACHMENT_MAX_PER_WORKSPACE`, `APERTURE_STREAM_HEARTBEAT_SECONDS`,
`APERTURE_STREAM_REPLAY_MAX_EVENTS`, `APERTURE_STREAM_REPLAY_MAX_SECONDS`,
`APERTURE_STREAM_MAX_CONNECTIONS_PER_USER`, `APERTURE_STREAM_TURN_GRACE_SECONDS`,
`APERTURE_MODULE_PROBE_TTL_SECONDS`, `APERTURE_CONTEXT_MAX_PAYLOAD_BYTES`,
`APERTURE_CONTEXT_PUBLISH_RATE_LIMIT`.

A request exceeding a declared limit is rejected with `payload-too-large` **before** the body is
consumed, not after.

### Provenance

Every stored message and every stream event carries a mandatory `origin` of
`assistant | tool | system | user`. Clients derive attribution from `origin` only, never from
content. This is specified in full in `aperture-events-v1.md` §2 and is not restated here, but it
applies to REST responses exactly as it applies to the stream.

### Streaming

`GET /v1/aperture/stream` is the only streaming route. A stream is **one connection**; `thread_id`
and message id demultiplex within it; `seq` is one monotonic sequence per connection over all
event types; replay is bounded and ages out into a `resync`. See `aperture-events-v1.md`.

**Anti-buffering headers are mandatory on that route** — `Cache-Control: no-cache, no-store,
no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no` — because a buffering reverse
proxy turns a token stream into a wall of text delivered all at once. A deployment that cannot
honour `no-transform` end-to-end is misconfigured; that is an operator problem, not grounds for
relaxing the contract.

### No infrastructure identifiers, anywhere

No response body, header, error detail, log line surfaced to a client, or field in this directory
may contain a host name, an IP address, a port, an internal path, a build hash, a commit id, a
container identifier, or an upstream component version. `GET /version` returns the contract
version and nothing else. Placeholders and configuration-key **names** are used throughout; this
directory is mirrored publicly.

---

## Changing a contract in this directory

1. **The contract changes first.** Code adds a route, a field, or an event variant only after this
   directory does. Both live in the same change set — never a follow-up.
2. **Classify the change** as additive or breaking using the policy above, and bump accordingly. If
   the classification is arguable, it is breaking.
3. **Regenerate the client SDK** in the same change set. The drift gate regenerates into a
   temporary directory and diffs against the checked-in output; a mismatch fails the build. That
   gate is the reason contract drift is a build failure rather than a runtime surprise.
4. **Keep the schema and the markdown in step.** The event taxonomy table in
   `aperture-events-v1.md` and the `EventType` enum in `aperture-api-v1.yaml` are asserted equal in
   both directions; the same is true of the error URN list and `aperture-errors-v1.md`.
5. **Validation runs in CI.** `aperture-api-v1.yaml` must validate as OpenAPI 3.1, every route must
   carry at least one documented error response and a declared limit, and a scan must find zero
   literal addresses.

## Validating locally

`aperture-api-v1.yaml` is a standard OpenAPI 3.1 document and validates with any conforming 3.1
validator. The CI `contract-validate` job asserts, at minimum:

1. the document parses and validates as OpenAPI **3.1**;
2. every operation declares at least one error response;
3. every operation declares an `x-aperture-limits` block;
4. the `EventType` enum equals the taxonomy table in `aperture-events-v1.md`;
5. every event schema requires `origin`, and `origin` has no default;
6. no route declares a CORS response header;
7. no file in this directory contains a literal host, address, or port.
