# S128 Aperture — binding cross-sprint decisions

Authority: these resolve contradictions found by the Fable review that span more than one sprint.
They are **binding on every sprint spec and every implementing agent.** Where a sprint spec still
contradicts this file, this file wins and the spec is wrong.

Do not re-litigate these per item. If one is genuinely unworkable during implementation, say so
and stop — do not quietly pick a different answer, because the whole point is that seven agents
give the same answer.

---

## D1 — Client transport: injectable base URL, per-target auth

**Problem.** Sprint A mandates "never construct an absolute URL; every request is same-origin
relative." The desktop app's origin is `tauri://localhost`, so a same-origin relative path does
not resolve to the fleet at all. Sprint G additionally mandates `connect-src 'self'` and
`SameSite=Strict`. Those cannot all hold. Found independently in three reviews.

**Decision.**
- The SDK exposes **one injectable transport** with a base URL. It is not a global constant.
- **Web target:** base URL is empty (same-origin relative). Auth is the session **cookie** —
  `__Host-` prefixed, `HttpOnly`, `Secure`, `SameSite=Strict`. CSP `connect-src 'self'`.
- **Desktop target:** base URL is the operator-configured endpoint, stored in OS secure storage
  (Keychain / Credential Manager). Auth is a **bearer token**, never a cookie — a cross-origin
  cookie cannot be `SameSite=Strict` and must not be loosened to make one work. CSP
  `connect-src` includes exactly the configured endpoint and nothing else.
- **Mobile PWA** is a web target and follows the web rules.
- The **contract** (APTR-06) states cookie-vs-bearer and CSP rules **per target**, not globally.
- Sprint A's acceptance criterion is amended: *no hardcoded absolute URL, and no compiled-in
  default endpoint* — not "no absolute URL ever".
- CORS: **no CORS headers on `/v1/aperture/*`, ever.** The desktop reaches the API as a native
  HTTP client, not a browser fetch subject to CORS. Say so explicitly in the contract.

## D2 — Streaming: what may produce events, and what `chord.rs` may become

**Problem.** Sprint B was told "the `on_delta` hook exists, route it; no new agent-loop hook;
expect `chord.rs` unmodified." That was right about reuse and **wrong as an absolute**: `on_delta`
carries text only, so `tool.call`, `tool.result`, `thinking`, and lifecycle events had no
permitted producer; and cancellation must reach `chat_completion_streaming`, which needs a
parameter in `chord.rs`.

**Decision.**
- The prohibition is narrowed to: **no second token path, and no second SSE frame parser.**
  `ChatSseState` is reused as-is.
- Additional producers for `tool.call` / `tool.result` / `thinking` / lifecycle events **are
  permitted and required**. They publish into the same per-turn fan-out as the token deltas.
- `chord.rs` **may** gain a cancellation token parameter. The "`chord.rs` unmodified" grep gate is
  **withdrawn** and replaced by: *no duplicate SSE parsing logic anywhere outside `ChatSseState`.*
- The `on_delta` callback runs inside the upstream body-read loop. Publishing from it MUST be
  non-blocking and MUST NOT panic — blocking there stalls the turn for **every** channel, not just
  Aperture. Drop on a full buffer rather than block; a slow Aperture subscriber must never be able
  to degrade Matrix or CLI.

## D3 — Stream lifecycle, cancellation, resume, and multi-subscriber

**Problem.** Cancel-on-disconnect, resume-after-drop, and two devices on one turn cannot all hold:
the first disconnect would kill generation for the surviving device, and resume would then always
resume a cancelled turn.

**Decision.**
- **A stream is one connection.** `thread_id` and message id demultiplex within it. This is now
  normative in `aperture-events-v1.md`; every item keying off `stream_id` uses this meaning.
- A **turn** is refcounted by its subscribers. Cancellation is by **refcount reaching zero plus a
  grace window** (default 30s, config key), not by any single client disconnecting.
- Explicit user "stop generation" cancels immediately and unconditionally, regardless of refcount.
  That is a different action from a transport drop and must be a distinct event.
- Resume within the replay window reattaches to a live turn and increments the refcount. Resume
  after the turn ended replays from the buffer.
- The replay window is **bounded** (config key). When a client's position has aged out, the server
  emits a `resync` event instructing a REST refetch. Resume is not unbounded.

## D4 — Media playback is re-scoped

**Problem.** Two independent blockers. The door carries a JSON body and cannot pass an HTTP
`Range` header (already corrected). And Media Source Extensions will not accept non-fragmented
MP4 or MKV, so feeding a media element raw file chunks does not work for real library content.

**Decision.**
- Playback requires a **remux to fragmented MP4** for compatible codecs, and is **not attempted**
  for incompatible codecs in v1.
- Sprint D ships: library browse, search, detail, artwork, and **playback only for content that
  can be remuxed without transcoding**. Anything requiring a full transcode is **explicitly
  deferred** and must render an honest "not playable in-client yet" state — never a broken player.
- The remux path is its own item with its own estimate. Do not fold it into the player item.
- Resume-position tracking survives regardless of whether playback is available, because it is fed
  by the context bus and other clients.

## D5 — Sovereignty carve-outs must be written down

**Decision.** The "no runtime external fetch" constraint has exactly **two** permitted carve-outs,
both explicit, both user-initiated, both default-off:
1. **Click-to-load remote images** in rendered markdown. Never automatic, no preloading, no
   referrer, and the user is told what will be fetched before it is fetched.
2. Nothing else. Any further carve-out requires an operator decision recorded in this file.

The desktop update feed is **not** a carve-out — it is served by the user's own configured backend.

## D6 — Offline data is purged on logout and revocation

**Decision.** Ending a session or revoking a device MUST clear that device's cached threads,
outbox, drafts, and any cached attachment content. A revoked device must not remain a readable
copy of the user's conversations. This is a first-class item in Sprint F with a negative test, not
a line in an existing item.

## D7 — Secret caching

**Decision.** The vault fallback cache is **memory-only**, zeroize-on-drop, with a bounded TTL.
It is never written to disk in any form. A cold cache plus an unreachable backend yields
capability `unavailable` with a reason — **never a generated or default key**.

## D8 — Enforcement must be able to enforce

**Decision.** Every mechanical gate must be implementable in the language whose property it
asserts. Specifically:
- A property of Rust call sites is enforced by a **Rust** test or by module-private visibility so
  the compiler enforces it — never by a Node lint that cannot see Rust.
- "Exactly one caller" is enforced by visibility, not by a unit test.
- Do not specify asserting a webview's *effective* CSP at runtime; it is not generally
  introspectable. Assert the configured policy and say that is what is being asserted.
- Heap/GC measurement requires an instrumented run; name the mechanism or drop the gate.
- A retroactive "this never happened" assertion requires an audit trail; if no item creates one,
  the assertion is prose and must be removed or given a real evidence source.

## D9 — Event provenance (prompt-injection containment)

**Decision.** Every SSE event and every stored message carries a mandatory `origin` discriminator:
`assistant | tool | system | user`. Clients derive visual attribution **from `origin` only, never
from content**. A `tool.result` payload can never be emitted as, or coalesced into, an assistant
token event, regardless of what bytes the tool returns. Negative test: a tool result containing
SSE-frame-shaped or assistant-event-shaped JSON stays inert data and renders as a tool result.

## D10 — Cross-cutting additions that become real items

These were "missing entirely" findings. They are now required:

| # | Addition | Sprint |
|---|---|---|
| 1 | Runtime CSP + security headers served by the BFF (the bundle grep is static and bypassable) | A |
| 2 | Attachment **serving** isolation: `Content-Disposition: attachment`, sandboxed CSP, MIME allowlist, SVG/HTML never inline | A |
| 3 | Session/CSRF semantics in the contract: cookie flags, session-id rotation on login, `Origin`/`Sec-Fetch-Site` checks on mutating routes | A |
| 4 | Idempotency keys on message send | A |
| 5 | Contract version header + defined client behaviour on skew | A |
| 6 | Command registry + `Cmd/Ctrl-K` palette as a **foundation** capability | A |
| 7 | Skeleton / empty / spinner primitives and a centralized string catalogue | A |
| 8 | Audit log definition — sink, schema, retention, per-user visibility | B |
| 9 | Trusted-proxy specification so per-source rate limiting is neither one shared bucket nor `X-Forwarded-For`-spoofable | B |
| 10 | **Data export / portability** — sovereignty without export is not sovereignty | C |
| 11 | **Pre-Aperture history**: decide and state whether prior transcripts surface; if not, the assistant says so on first run rather than presenting a blank slate | C |
| 12 | Multi-tab model: shared connection or server-side dedupe, so two tabs do not double-emit focus events or fight over read state | C |
| 13 | Private-CA / certificate-pinning path for self-hosted TLS | E |
| 14 | Offline purge on logout/revocation (D6) | F |
| 15 | Remux path for playback (D4) | D |

## D11 — Concurrency and process rules for this build

Learned during the review round, binding on the fan-out:
- **Do not restart the tool gateway while reviews are in flight.** Three Sprint C reviews were
  lost to this.
- **Cap reviewer concurrency at 3.** Seven concurrent reviewers overloaded the review daemon.
- An `unavailable` / `UNKNOWN` provider result is an **infrastructure artifact, not a verdict**.
  Re-run it. Never record it as a pass, and never deadlock a merge on it.
- Before treating a reviewer's blocking finding as real, **verify it against the source**.
  Reviewers see partial diffs and report absent things that exist in files outside their view.

## D12 — Estimates

Sprint headers have been wrong twice (D said 76h against a 91h sum; F said 69h against 76h).
Every sprint header estimate must equal the sum of its item estimates. Items re-scoped by these
decisions need their estimates revised, not carried forward.
