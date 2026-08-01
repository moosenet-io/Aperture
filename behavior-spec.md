# Aperture Behavior Specification
spec_id: S128-aperture-client
module: Aperture
prefix: APTR
version: 1.0

This is the verify baseline for Aperture: the client shell (web, desktop, mobile/PWA) and the
Aperture BFF that ships inside the agent core. It states what the system must do, in a form the
verify runner can check.

**Addressing rule (enforced):** every URL, host, port, and path argument below is an env-var
placeholder resolved by the verify runner at execution time. A literal address, port, hostname,
org name, or absolute user path anywhere in this file is a spec violation.

**Placeholders used here:**
`${APERTURE_API_URL}` (BFF base), `${APERTURE_STREAM_URL}`, `${APERTURE_WEB_URL}` (served
client), `${APERTURE_HEALTH_URL}`, `${APERTURE_READY_URL}`, `${APERTURE_METRICS_URL}`,
`${APERTURE_BFF_HOST}`, `${APERTURE_BFF_PORT}`, `${APERTURE_STATE_DIR}`,
`${APERTURE_FIXTURE_DIR}`, `${APERTURE_DESKTOP_BIN}`, `${APERTURE_DESKTOP_UPDATE_URL}`,
`${APERTURE_SERVICE_PROCESS}`, `${APERTURE_SESSION_SIGNING_KEY}`,
`${APERTURE_VAPID_PUBLIC_KEY}`.

**These placeholder and state-file names are authoritative for the behaviour contract.** A sprint
that has adopted a different name for the same thing reconciles **toward** these names, not away
from them — a behaviour contract whose identifiers have drifted from the implementation is worse
than no contract at all, because it fails silently rather than loudly, and it is always cheaper to
rename in code than to re-derive the contract.

**Verification harness:** the `aperture-verify` subcommands invoked by the `command_exit_code` and
`command_output_contains` checks below are built in **APTR-94**. Exit semantics are uniform:
`0` = assertion held, `1` = assertion violated, `2` = could not run. **`2` is a failure of the
verify run, never a skip and never a pass.**

---

## States

### State: BFF_STARTING
- entry: agent core starts with the `aperture` cargo feature enabled
- exit: routes mounted and dependency probe completes → BFF_SERVING or BFF_DEGRADED
- invariant: the process never blocks startup on kernel reachability
- verify:
  - process_count("${APERTURE_SERVICE_PROCESS}") >= 1
  - api_health("${APERTURE_HEALTH_URL}") == true
  - api_call("GET", "${APERTURE_READY_URL}", null, 503)
  - json_field("${APERTURE_STATE_DIR}/aperture-state.json", "phase", "starting")

### State: BFF_SERVING
- entry: routes mounted, the sanctioned kernel door reachable, session signing key resolved
- exit: kernel unreachable → BFF_DEGRADED; shutdown signal → BFF_STOPPED
- invariant: all backend access is via the single sanctioned door; no second egress path exists
- verify:
  - process_count("${APERTURE_SERVICE_PROCESS}") >= 1
  - port_listening("${APERTURE_BFF_HOST}", "${APERTURE_BFF_PORT}")
  - api_health("${APERTURE_HEALTH_URL}") == true
  - api_call("GET", "${APERTURE_READY_URL}", null, 200)
  - json_field("${APERTURE_STATE_DIR}/aperture-state.json", "phase", "serving")
  - api_call("GET", "${APERTURE_API_URL}/v1/aperture/modules", null, 200)
  - command_output_contains("aperture-verify capability-state --module assistant", "available")

### State: BFF_DEGRADED
- entry: the sanctioned kernel door is unreachable, or a required secret is unresolved
- exit: dependency recovers → BFF_SERVING (no restart, no reload required)
- invariant: **liveness stays green while readiness degrades.** The shell must still render and
  every affected module must report `unavailable` with a human-readable reason. A kernel blip
  must never cause an orchestrator to restart a healthy process.
- verify:
  - process_count("${APERTURE_SERVICE_PROCESS}") >= 1
  - api_health("${APERTURE_HEALTH_URL}") == true
  - api_call("GET", "${APERTURE_READY_URL}", null, 503)
  - json_field("${APERTURE_STATE_DIR}/aperture-state.json", "phase", "degraded")
  - json_field("${APERTURE_STATE_DIR}/aperture-state.json", "degraded_reason_present", "true")
  - api_call("GET", "${APERTURE_API_URL}/v1/aperture/modules", null, 200)
  - command_output_contains("aperture-verify capability-state --module muse", "unavailable")
  - api_call("GET", "${APERTURE_WEB_URL}/", null, 200)

### State: BFF_MISSING_SECRET
- entry: `${APERTURE_SESSION_SIGNING_KEY}` cannot be resolved from the secret manager
- exit: secret resolved → BFF_SERVING
- invariant: **never invent a stopgap key.** Auth reports `unavailable`; the process does not
  start with a default, generated, or empty signing key.
- verify:
  - process_count("${APERTURE_SERVICE_PROCESS}") >= 1
  - api_call("POST", "${APERTURE_API_URL}/v1/aperture/auth/login", "{}", 503)
  - command_output_contains("aperture-verify capability-state --module auth", "unavailable")
  - command_exit_code("aperture-verify assert-no-default-signing-key", 0)

### State: SESSION_AUTHENTICATED
- entry: credentials verified; a fresh session identifier issued
- exit: logout, expiry, device revocation, or signing-key rotation → SESSION_NONE
- invariant: the pre-authentication identifier is dead the instant authentication succeeds
- verify:
  - api_call("GET", "${APERTURE_API_URL}/v1/aperture/threads", null, 200)
  - api_call("GET", "${APERTURE_API_URL}/v1/aperture/auth/devices", null, 200)
  - command_exit_code("aperture-verify session-id-rotated-on-auth", 0)
  - command_output_contains("aperture-verify cookie-flags", "HttpOnly")
  - command_output_contains("aperture-verify cookie-flags", "SameSite")

### State: SESSION_NONE
- entry: no session, expired session, or a revoked device
- exit: successful authentication → SESSION_AUTHENTICATED
- invariant: every protected route and every stream refuses; nothing partially serves
- verify:
  - api_call("GET", "${APERTURE_API_URL}/v1/aperture/threads", null, 401)
  - api_call("GET", "${APERTURE_STREAM_URL}", null, 401)
  - command_output_contains("aperture-verify problem-details --last", "urn:aperture:error:auth-required")

### State: STREAM_OPEN
- entry: client opens the SSE stream with a valid session
- exit: completion, client close, revocation, or transport failure → STREAM_CLOSED
- invariant: sequence numbers are monotonic; heartbeats keep an idle connection alive
- verify:
  - command_output_contains("aperture-verify stream-open --count", "1")
  - command_exit_code("aperture-verify stream-sequence-monotonic", 0)
  - command_exit_code("aperture-verify stream-heartbeat-within-interval", 0)
  - command_output_contains("aperture-verify stream-headers", "no-transform")

### State: STREAM_RESUMING
- entry: a dropped stream reconnects presenting `Last-Event-ID`
- exit: missed events replayed → STREAM_OPEN; resume token unhonorable → STREAM_RESYNC_REQUIRED
- invariant: **exactly-once** delivery across the gap — no duplicates, no silent gaps
- verify:
  - command_exit_code("aperture-verify stream-resume-exactly-once", 0)
  - screen_not_contains("duplicate-event")
  - command_exit_code("aperture-verify stream-no-gap", 0)

### State: STREAM_RESYNC_REQUIRED
- entry: the resume buffer for that stream has been evicted or the token is too old
- exit: client refetches thread state and opens a fresh stream → STREAM_OPEN
- invariant: an unhonorable resume is an **explicit** recoverable error. A silent partial replay
  is forbidden — the user must never be shown a history that is quietly incomplete.
- verify:
  - command_output_contains("aperture-verify problem-details --last", "urn:aperture:error:stream-resync-required")
  - screen_contains("Reconnected")
  - screen_not_contains("silent-partial")

### State: SHELL_OFFLINE
- entry: the PWA/web client loses network connectivity
- exit: connectivity restored → SHELL_ONLINE with stream resume
- invariant: the app shell, cached threads, and the composer remain usable; queued messages are
  visibly marked as pending and are never silently dropped
- verify:
  - screen_contains("Offline")
  - screen_not_contains("Application error")
  - json_field("${APERTURE_STATE_DIR}/aperture-offline-queue.json", "dropped", "0")
  - command_exit_code("aperture-verify offline-shell-renders", 0)

### State: DESKTOP_UPDATE_PENDING
- entry: the desktop shell discovers an update at `${APERTURE_DESKTOP_UPDATE_URL}`
- exit: signature verified → DESKTOP_UPDATE_APPLIED; verification fails → DESKTOP_UPDATE_REFUSED
- invariant: verification precedes any write to the installed application
- verify:
  - command_exit_code("aperture-verify update-signature-checked-before-apply", 0)
  - file_exists("${APERTURE_STATE_DIR}/aperture-update-manifest.json")
  - json_valid("${APERTURE_STATE_DIR}/aperture-update-manifest.json")

### State: DESKTOP_UPDATE_REFUSED
- entry: the update is unsigned, signed by an untrusted key, or its hash does not match
- exit: operator action or a subsequent valid update
- invariant: **fail closed.** The running application is untouched, the update is discarded, and
  the refusal is surfaced to the user — never retried into an install, never "applied anyway".
- verify:
  - command_output_contains("aperture-verify update-state", "refused")
  - file_not_exists("${APERTURE_STATE_DIR}/aperture-update-staged.bin")
  - command_exit_code("aperture-verify desktop-binary-unchanged", 0)
  - screen_contains("Update refused")

### State: MODULE_INERT
- entry: a module descriptor reports `unavailable`, or its capability state is unrecognized
- exit: capability becomes `available` on a descriptor revalidation → MODULE_ACTIVE
- invariant: an inert module renders an explained tile. **Never a broken screen, never a blank
  route, never a white page.** An unknown capability state fails closed to inert.
- verify:
  - screen_contains("Unavailable")
  - screen_not_contains("undefined")
  - screen_not_contains("Cannot read")
  - command_exit_code("aperture-verify unknown-capability-fails-closed", 0)

### State: MODULE_ACTIVE
- entry: the descriptor reports `available` and the module's routes are claimed
- exit: capability drops → MODULE_INERT (no reload required)
- invariant: navigation is derived entirely from descriptors; no module is hardcoded in the shell
- verify:
  - command_exit_code("aperture-verify nav-derived-from-descriptors", 0)
  - api_call("GET", "${APERTURE_API_URL}/v1/aperture/modules", null, 200)

---

## Transitions

### Transition: BFF_STARTING → BFF_SERVING
- trigger: startup completes with the kernel door reachable and the signing key resolved
- guard: the `aperture` feature is enabled; routes mount without collision under `/v1/aperture/`
- action: mount routes, probe module capabilities via the sanctioned door, write the state file
- verify:
  - api_call("GET", "${APERTURE_READY_URL}", null, 200)
  - json_field("${APERTURE_STATE_DIR}/aperture-state.json", "phase", "serving")
  - command_exit_code("aperture-verify assert-single-door", 0)

### Transition: BFF_SERVING → BFF_DEGRADED
- trigger: the sanctioned kernel door becomes unreachable
- guard: none — degradation is unconditional and immediate
- action: flip affected module capability states to `unavailable` with a reason, publish the
  change on the SSE `context` channel, keep liveness green
- verify:
  - api_health("${APERTURE_HEALTH_URL}") == true
  - api_call("GET", "${APERTURE_READY_URL}", null, 503)
  - command_output_contains("aperture-verify capability-state --module harmony", "unavailable")
  - api_call("GET", "${APERTURE_WEB_URL}/", null, 200)

### Transition: BFF_DEGRADED → BFF_SERVING
- trigger: the kernel door becomes reachable again
- guard: descriptor revalidation succeeds
- action: modules light up in-session via the SSE `context` channel
- verify:
  - api_call("GET", "${APERTURE_READY_URL}", null, 200)
  - command_exit_code("aperture-verify module-relit-without-reload", 0)
  - screen_not_contains("Unavailable")

### Transition: SESSION_NONE → SESSION_AUTHENTICATED
- trigger: successful credential verification
- guard: signing key resolvable; CSRF token valid; request origin allowlisted
- action: **regenerate the session identifier**, register the device, issue the session cookie
- verify:
  - command_exit_code("aperture-verify session-id-rotated-on-auth", 0)
  - api_call("GET", "${APERTURE_API_URL}/v1/aperture/auth/devices", null, 200)
  - command_exit_code("aperture-verify old-session-id-rejected", 0)

### Transition: SESSION_AUTHENTICATED → SESSION_NONE (device revoked)
- trigger: the user revokes a device from the device list
- guard: the revoking session is itself valid
- action: invalidate the device's session **and terminate its open SSE stream immediately**
- verify:
  - api_call("GET", "${APERTURE_API_URL}/v1/aperture/threads", null, 401)
  - command_output_contains("aperture-verify stream-open --count", "0")
  - command_exit_code("aperture-verify revoked-stream-terminated", 0)
  - command_exit_code("aperture-verify revoked-cannot-reconnect", 0)

### Transition: SESSION_AUTHENTICATED → SESSION_NONE (signing key rotated)
- trigger: `${APERTURE_SESSION_SIGNING_KEY}` is rotated
- guard: none
- action: sessions signed with the previous key **fail closed to re-auth**
- verify:
  - api_call("GET", "${APERTURE_API_URL}/v1/aperture/threads", null, 401)
  - command_output_contains("aperture-verify problem-details --last", "urn:aperture:error:auth-expired")
  - command_exit_code("aperture-verify no-silent-acceptance-of-old-signature", 0)

### Transition: STREAM_OPEN → STREAM_RESUMING
- trigger: transport failure or client suspend/resume (laptop sleep, PWA backgrounded)
- guard: a valid session and a `Last-Event-ID` within the retained buffer
- action: reconnect with **exponential backoff plus full jitter**, capped; replay missed events
- verify:
  - command_exit_code("aperture-verify backoff-is-jittered", 0)
  - command_exit_code("aperture-verify stream-resume-exactly-once", 0)
  - command_exit_code("aperture-verify suspend-resume-consumes-no-device-slot", 0)

### Transition: STREAM_RESUMING → STREAM_RESYNC_REQUIRED
- trigger: the resume buffer for the stream has been evicted
- guard: none
- action: emit an explicit resync problem-details; the client refetches thread state
- verify:
  - command_output_contains("aperture-verify problem-details --last", "urn:aperture:error:stream-resync-required")
  - command_exit_code("aperture-verify no-silent-partial-replay", 0)

### Transition: MASS_DISCONNECT → RECONNECT_STORM_ABSORBED
- trigger: every open stream drops simultaneously
- guard: none
- action: clients back off with independent jitter; the BFF sheds over-limit reconnects with a
  typed `rate-limited` problem-details and a `Retry-After`
- verify:
  - command_exit_code("aperture-verify reconnect-arrivals-spread", 0)
  - command_output_contains("aperture-verify shed-response", "Retry-After")
  - command_exit_code("aperture-verify existing-streams-unharmed", 0)

### Transition: MODULE_ACTIVE → MODULE_INERT
- trigger: the module's backend capability drops, or the descriptor reports an unknown state
- guard: none — unknown always fails closed to inert
- action: render the explained inert tile; remove the module's nav entry
- verify:
  - screen_contains("Unavailable")
  - screen_not_contains("undefined")
  - command_exit_code("aperture-verify nav-entry-removed", 0)

### Transition: SHELL_ONLINE → SHELL_OFFLINE
- trigger: connectivity lost
- guard: the service worker is installed and the app shell is cached
- action: serve the cached shell, mark the connection state, queue outbound messages as pending
- verify:
  - screen_contains("Offline")
  - screen_not_contains("Application error")
  - json_field("${APERTURE_STATE_DIR}/aperture-offline-queue.json", "dropped", "0")

### Transition: SHELL_OFFLINE → SHELL_ONLINE
- trigger: connectivity restored
- guard: the session is still valid
- action: flush the pending queue in order, resume the stream, reconcile thread state
- verify:
  - json_field("${APERTURE_STATE_DIR}/aperture-offline-queue.json", "pending", "0")
  - command_exit_code("aperture-verify queue-flush-ordered", 0)
  - command_exit_code("aperture-verify no-duplicate-send-after-flush", 0)

### Transition: CHANNEL_ADDED (Aperture added alongside Matrix)
- trigger: Aperture is enabled as a channel for an assistant that already has Matrix
- guard: none
- action: register the channel. **Matrix is retained, first-class, and unchanged.**
- verify:
  - command_output_contains("aperture-verify channels", "matrix:enabled")
  - command_output_contains("aperture-verify channels", "aperture:enabled")
  - command_output_contains("aperture-verify channels", "telegram:disabled")
  - command_output_contains("aperture-verify channels", "signal:unavailable")
  - command_exit_code("aperture-verify continuity-preserved", 0)

### Transition: DESKTOP_UPDATE_PENDING → DESKTOP_UPDATE_REFUSED
- trigger: signature absent, untrusted, or hash mismatched
- guard: none
- action: discard the staged payload, leave the installed application untouched, surface the refusal
- verify:
  - file_not_exists("${APERTURE_STATE_DIR}/aperture-update-staged.bin")
  - command_exit_code("aperture-verify desktop-binary-unchanged", 0)
  - screen_contains("Update refused")

---

## API Contracts

### API: GET /v1/aperture/modules
- input: authenticated session
- output: `{"modules":[{"id","name","capability","reason","routes","publishes","consumes"}]}`
- verify:
  - api_call("GET", "${APERTURE_API_URL}/v1/aperture/modules", null, 200)
  - command_exit_code("aperture-verify descriptor-schema-valid", 0)
  - command_exit_code("aperture-verify capability-enum-closed", 0)
- error_cases:
  - no session → 401 `urn:aperture:error:auth-required`
  - kernel unreachable → 200 with every module `unavailable` and a reason (**never** a 5xx —
    the shell must still render)
  - unknown capability value from a newer backend → treated as `unavailable`, not `available`

### API: GET /v1/aperture/stream
- input: authenticated session; optional `Last-Event-ID`
- output: `text/event-stream` of `token`, `message.start`, `message.end`, `tool.call`,
  `tool.result`, `thinking`, `error`, `context`, `presence`, `heartbeat`
- verify:
  - api_call("GET", "${APERTURE_STREAM_URL}", null, 200)
  - command_output_contains("aperture-verify stream-headers", "text/event-stream")
  - command_output_contains("aperture-verify stream-headers", "no-transform")
  - command_exit_code("aperture-verify stream-sequence-monotonic", 0)
  - command_exit_code("aperture-verify heartbeat-present-when-idle", 0)
- error_cases:
  - no session → 401, stream never opens
  - revoked device → open stream terminates immediately; reconnect refused at establishment
  - resume token evicted → in-band `error` event with `urn:aperture:error:stream-resync-required`
  - upstream failure mid-stream → an in-band `error` event, **never** a silent truncation

### API: POST /v1/aperture/auth/login
- input: `{"identifier":"string","secret":"string"}` with a valid CSRF token
- output: `{"session":{"expires_at"},"device":{"id","name"}}`
- verify:
  - command_exit_code("aperture-verify session-id-rotated-on-auth", 0)
  - command_output_contains("aperture-verify cookie-flags", "HttpOnly")
  - command_output_contains("aperture-verify cookie-flags", "Secure")
- error_cases:
  - missing/invalid CSRF token → 403 `urn:aperture:error:forbidden`
  - signing key unresolved → 503 `urn:aperture:error:capability-unavailable` (**not** a default key)
  - repeated failures → 429 `urn:aperture:error:rate-limited` with `Retry-After`
  - credential value present in any response body or log → contract violation

### API: POST /v1/aperture/auth/devices/{id}/revoke
- input: authenticated session, target device id
- output: `{"revoked":true}`
- verify:
  - api_call("POST", "${APERTURE_API_URL}/v1/aperture/auth/devices/self/revoke", "{}", 200)
  - command_exit_code("aperture-verify revoked-stream-terminated", 0)
  - command_exit_code("aperture-verify continuity-preserved", 0)
- error_cases:
  - unknown device id → 404, and no other device is affected
  - revoking the last device → permitted, but the response states the consequence explicitly
  - revocation must **never** clear assistant memory, traits, or relationship lore

### API: POST /v1/aperture/events (context bus publish)
- input: `{"topic":"string","subject":"string","payload":{}}`
- output: `{"accepted":true,"correlation_id":"string"}`
- verify:
  - api_call("POST", "${APERTURE_API_URL}/v1/aperture/events", "{\"topic\":\"muse.playback\",\"subject\":\"item\",\"payload\":{}}", 202)
  - command_exit_code("aperture-verify context-event-observed-by-assistant", 0)
  - command_exit_code("aperture-verify correlation-id-echoed", 0)
- error_cases:
  - unknown topic → 400 `urn:aperture:error:validation-failed`; the bus is not a free-text channel
  - topic published by a module that did not declare it in its descriptor → 403
  - oversized payload → 413 `urn:aperture:error:payload-too-large`
  - a context event must **never** be rendered to the user as an assistant turn

### API: POST /v1/aperture/attachments
- input: multipart upload within the contract's size limit
- output: `{"id","status","content_type"}`
- verify:
  - command_exit_code("aperture-verify content-type-sniffed-server-side", 0)
  - command_exit_code("aperture-verify filename-neutralized", 0)
- error_cases:
  - over the limit → 413 with the limit stated
  - client-declared content type disagreeing with sniffed type → sniffed type wins
  - filename containing traversal, control, or bidi-override characters → neutralized, never echoed raw
  - SVG upload → stored, but **never** inlined into the DOM on any preview path

### API: GET /v1/aperture/healthz
- input: none
- output: `{"status":"ok","build_id":"string"}`
- verify:
  - api_health("${APERTURE_HEALTH_URL}") == true
  - command_exit_code("aperture-verify healthz-independent-of-kernel", 0)
- error_cases:
  - kernel unreachable → still 200 (liveness is not readiness)
  - never includes an internal address, a secret, or an upstream error string

### API: GET /v1/aperture/readyz
- input: none
- output: `{"ready":bool,"dependencies":[{"name","state","reason"}]}`
- verify:
  - api_call("GET", "${APERTURE_READY_URL}", null, 200)
  - command_exit_code("aperture-verify readyz-names-degraded-dependency", 0)
- error_cases:
  - kernel unreachable → 503 with a named dependency and a reason
  - dependency names are logical, never an address

### API: GET /v1/aperture/metrics
- input: authorized request
- output: local exposition format
- verify:
  - api_call("GET", "${APERTURE_METRICS_URL}", null, 200)
  - command_exit_code("aperture-verify metric-cardinality-bounded", 0)
  - command_exit_code("aperture-verify no-user-or-thread-id-labels", 0)
- error_cases:
  - unauthorized → 401; metrics are not a public surface
  - a high-cardinality label → rejected at registration, not silently accepted

### API: Error envelope (all routes)
- output: RFC-9457 problem-details with a stable `type` URN and a `correlation_id`
- verify:
  - command_exit_code("aperture-verify problem-details-shape", 0)
  - command_exit_code("aperture-verify correlation-id-present-on-errors", 0)
  - command_exit_code("aperture-verify no-internal-detail-in-body", 0)
- error_cases:
  - an upstream error string containing an internal address or token → redacted before the body
  - a stack frame in a response body → contract violation
  - a bare 500 with no URN → contract violation

---

## Data Contracts

### Data: ${APERTURE_STATE_DIR}/aperture-state.json
- format: JSON, atomic writes (tempfile + rename)
- required_fields: ["phase", "build_id", "features", "degraded_reason_present"]
- verify:
  - file_exists("${APERTURE_STATE_DIR}/aperture-state.json")
  - json_valid("${APERTURE_STATE_DIR}/aperture-state.json")
  - json_field("${APERTURE_STATE_DIR}/aperture-state.json", "build_id_present", "true")
  - command_exit_code("aperture-verify state-file-has-no-secret", 0)
  - file_permissions("${APERTURE_STATE_DIR}/aperture-state.json", "0640")

### Data: release/bundle-manifest.json
- format: JSON produced on a build-capable host
- required_fields: ["total_bytes", "assets", "build_id", "source_commit"]
- invariant: the served bundle must match this manifest. A build-on-dest host without a node
  toolchain must fail at build time, never embed a fallback stub.
- verify:
  - file_exists("release/bundle-manifest.json")
  - json_valid("release/bundle-manifest.json")
  - command_exit_code("node release/assert-served-bundle.mjs --target ${APERTURE_WEB_URL}", 0)
  - command_exit_code("bash release/preflight.sh", 0)
  - command_output_contains("node release/assert-served-bundle.mjs --report", "hash-match")

### Data: ${APERTURE_STATE_DIR}/aperture-offline-queue.json
- format: JSON, bounded, atomic writes
- required_fields: ["pending", "dropped", "items"]
- invariant: `dropped` is always 0 — an offline message is queued or explicitly rejected to the
  user, never silently discarded
- verify:
  - json_valid("${APERTURE_STATE_DIR}/aperture-offline-queue.json")
  - json_field("${APERTURE_STATE_DIR}/aperture-offline-queue.json", "dropped", "0")
  - command_exit_code("aperture-verify queue-bounded", 0)

### Data: ${APERTURE_STATE_DIR}/aperture-update-manifest.json
- format: JSON with a detached signature reference
- required_fields: ["version", "hash", "signature_ref"]
- invariant: an update whose signature does not verify is never staged and never applied
- verify:
  - json_valid("${APERTURE_STATE_DIR}/aperture-update-manifest.json")
  - command_exit_code("aperture-verify update-signature-checked-before-apply", 0)
  - file_not_exists("${APERTURE_STATE_DIR}/aperture-update-staged.bin")

### Data: .env.example
- format: documented key **names only**, zero values
- invariant: no secret value, address, port, or org name is ever authored into a file
- verify:
  - file_exists(".env.example")
  - command_exit_code("aperture-verify env-example-has-no-values", 0)
  - command_exit_code("aperture-verify env-example-matches-code-keys", 0)
  - env_var_set("APERTURE_SESSION_SIGNING_KEY_NAME")

### Data: Client log ring buffer (support bundle export)
- format: JSON lines, bounded, redacting, local-only
- required_fields: ["ts", "level", "correlation_id", "event"]
- invariant: never contains message content, attachment bytes, filenames beyond a hash, tokens,
  or an internal address; leaves the device only by explicit user action
- verify:
  - command_exit_code("aperture-verify client-log-redaction", 0)
  - command_exit_code("aperture-verify client-log-bounded", 0)
  - command_exit_code("aperture-verify no-automatic-log-egress", 0)

---

## UI Contracts

### UI: Shell — BFF_DEGRADED
- when: readiness reports degraded
- display: the shell renders fully; affected module tiles are inert with a stated reason
- verify:
  - screen_contains("Unavailable")
  - screen_not_contains("Application error")
  - screen_not_contains("undefined")
  - screen_not_contains("White screen")

### UI: Message stream — assistant speaking
- when: a `message.start` has been received and tokens are arriving
- display: the assistant's turn renders in the assistant's own chrome, streaming visibly
- verify:
  - screen_contains("Assistant")
  - command_exit_code("aperture-verify live-region-announces-at-boundaries", 0)
  - command_exit_code("aperture-verify no-per-token-announcement", 0)
  - screen_not_contains("[object Object]")

### UI: Tool result — provenance chrome is non-forgeable
- when: a `tool.result` renders
- display: framed as a tool result, structurally outside the assistant-voice region
- invariant: **untrusted content can never render as an assistant turn.** Prompt-injected text
  imitating assistant chrome renders as literal text inside the tool-result frame.
- verify:
  - screen_contains("Tool result")
  - command_exit_code("aperture-verify hostile-transcript-cannot-forge-speaker", 0)
  - screen_not_contains("<script")
  - screen_not_contains("javascript:")

### UI: Untrusted content rendering
- when: any model output, tool result, or uploaded document is displayed
- display: sanitized through the single fail-closed allowlist chokepoint
- verify:
  - command_exit_code("node client/scripts/assert-no-raw-html.mjs", 0)
  - command_exit_code("aperture-verify hostile-corpus-inert", 0)
  - screen_not_contains("onerror=")
  - command_exit_code("aperture-verify svg-never-inlined", 0)

### UI: Presence — no independent notification tray
- when: a module or context event would like the user's attention
- display: it reaches the user **only** through the assistant's prioritized presence budget,
  honoring quiet hours and opt-out
- invariant: Aperture ships no notification tray, no badge counter, and no second channel around
  the budget. Web Push is a transport for the budget, not a parallel one.
- verify:
  - screen_not_contains("Notifications (")
  - command_exit_code("aperture-verify no-independent-tray", 0)
  - command_exit_code("aperture-verify push-routes-through-presence-budget", 0)
  - command_exit_code("aperture-verify quiet-hours-honored", 0)

### UI: Module tile — unavailable
- when: a descriptor reports `unavailable` or an unrecognized capability
- display: an inert tile naming the module and the reason, with no dead-end click
- verify:
  - screen_contains("Unavailable")
  - screen_not_contains("404")
  - command_exit_code("aperture-verify inert-tile-has-reason", 0)

### UI: Offline
- when: SHELL_OFFLINE
- display: an explicit offline indicator; cached content readable; composer accepts input and
  marks it pending
- verify:
  - screen_contains("Offline")
  - screen_contains("Pending")
  - screen_not_contains("Failed to fetch")

### UI: Desktop — update refused
- when: DESKTOP_UPDATE_REFUSED
- display: a plain statement that the update was refused because it could not be verified, with
  no "install anyway" affordance
- verify:
  - screen_contains("Update refused")
  - screen_not_contains("Install anyway")
  - command_exit_code("aperture-verify desktop-binary-unchanged", 0)

### UI: Accessibility — streaming live regions
- when: any state in which text streams
- display: message region `aria-live="polite"`, `aria-atomic="false"`, announced at meaningful
  boundaries; status changes announced in a **separate** status region, exactly once each
- verify:
  - command_exit_code("node client/scripts/a11y-audit.mjs", 0)
  - command_exit_code("aperture-verify status-region-separate-from-message-region", 0)
  - command_exit_code("aperture-verify announce-on-completion-preference-honored", 0)
  - command_exit_code("aperture-verify focus-not-stolen-by-stream", 0)

---

## Performance Contracts

### Performance: Client bundle
- condition: production build, per entry and per lazy chunk, compressed as served
- verify:
  - command_exit_code("node perf/measure-bundle.mjs --check perf/budgets.json", 0)
  - command_exit_code("node perf/report.mjs --fail-closed", 0)
  - command_output_contains("node perf/report.mjs --summary", "within-budget")

### Performance: First paint and interactivity
- condition: cold load of the served client against the deterministic fake
- verify:
  - api_latency("GET", "${APERTURE_WEB_URL}/", null, 1500)
  - command_exit_code("node perf/measure-paint.mjs --check perf/budgets.json", 0)

### Performance: Streaming latency to first token (client share)
- condition: fake emits the first token → first pixel change; median of N runs
- verify:
  - api_latency("GET", "${APERTURE_STREAM_URL}", null, 1000)
  - command_exit_code("node perf/measure-stream.mjs --check perf/budgets.json", 0)

### Performance: Long-session memory
- condition: scripted transcript of many messages, attachments, and tool calls
- invariant: heap growth is bounded and flat after warm-up; a monotonic climb fails even at a
  small absolute number
- verify:
  - command_exit_code("node perf/measure-memory.mjs --check perf/budgets.json", 0)
  - command_exit_code("aperture-verify no-monotonic-heap-growth", 0)

### Performance: Concurrent SSE streams
- condition: ramped concurrent streams against a kernel-faked BFF
- invariant: beyond capacity the BFF sheds cleanly; existing streams are unharmed
- verify:
  - command_exit_code("node load/harness.ts --scenario concurrent-streams --check load/thresholds.json", 0)
  - command_exit_code("aperture-verify existing-streams-unharmed", 0)
  - command_output_contains("aperture-verify shed-response", "Retry-After")

### Performance: Long-lived connection soak
- condition: extended soak with heartbeats and idle gaps
- verify:
  - command_exit_code("node load/harness.ts --scenario long-lived --check load/thresholds.json", 0)
  - command_exit_code("aperture-verify handles-flat-over-soak", 0)
  - command_exit_code("aperture-verify half-open-detected-within-bound", 0)

### Performance: Reconnect storm
- condition: all streams dropped simultaneously
- verify:
  - command_exit_code("node load/harness.ts --scenario reconnect-storm --check load/thresholds.json", 0)
  - command_exit_code("aperture-verify reconnect-arrivals-spread", 0)
  - command_exit_code("aperture-verify backoff-is-jittered", 0)

### Performance: BFF request latency
- condition: normal serving state, non-stream routes
- verify:
  - api_latency("GET", "${APERTURE_API_URL}/v1/aperture/modules", null, 300)
  - api_latency("GET", "${APERTURE_READY_URL}", null, 200)

---

## Stall Conditions

### Stall: Stream open but no events and no heartbeat
- condition: a stream has been established and neither a data event nor a `heartbeat` has arrived
  within the contract's heartbeat interval plus tolerance
- recovery: client closes and reconnects with jittered backoff and `Last-Event-ID`; server reaps
  the dead registry entry
- verify:
  - command_exit_code("aperture-verify stall-detected-within-bound", 0)
  - command_output_contains("aperture-verify stream-open --count", "1")
  - command_exit_code("aperture-verify stream-resume-exactly-once", 0)

### Stall: Tokens arrive in a burst instead of streaming
- condition: a full message body arrives as one chunk — the signature of a buffering intermediary
- recovery: assert the anti-buffering headers mandated by the API contract are present; surface
  the condition to the operator rather than hiding it behind a smooth-scrolling animation
- verify:
  - command_output_contains("aperture-verify stream-headers", "no-transform")
  - command_exit_code("aperture-verify tokens-not-batched", 0)

### Stall: Half-open connection believed healthy by both ends
- condition: the transport is dead but neither side has noticed within the detection bound
- recovery: heartbeat timeout closes the stream; the registry entry is reaped; the client resumes
- verify:
  - command_exit_code("aperture-verify half-open-detected-within-bound", 0)
  - command_exit_code("aperture-verify registry-entry-reaped", 0)

### Stall: Reconnect storm sustains an outage
- condition: reconnect attempts arrive spiked rather than spread after a mass disconnect
- recovery: enforce jittered capped backoff client-side and shed with `Retry-After` server-side
- verify:
  - command_exit_code("aperture-verify reconnect-arrivals-spread", 0)
  - command_exit_code("aperture-verify no-fixed-retry-interval", 0)

### Stall: Module descriptor probe hangs
- condition: a capability probe through the sanctioned door exceeds its timeout
- recovery: the probe is abandoned, the module is marked `unavailable` with a reason, the shell
  renders; the probe retries on the next TTL. **The shell never waits on a probe to paint.**
- verify:
  - api_call("GET", "${APERTURE_WEB_URL}/", null, 200)
  - command_output_contains("aperture-verify capability-state --module muse", "unavailable")
  - command_exit_code("aperture-verify shell-paints-without-probe", 0)

### Stall: Attachment stuck in processing
- condition: an upload has remained in a non-terminal status beyond its bound
- recovery: transition to a terminal failed status with a typed problem-details; the user is told;
  the record is not left pending forever
- verify:
  - command_exit_code("aperture-verify attachment-reaches-terminal-state", 0)
  - screen_not_contains("Processing…")
  - command_output_contains("aperture-verify problem-details --last", "urn:aperture:error:upstream-timeout")

### Stall: Deploy green but the app is a stub
- condition: liveness passes, the port answers, and the served bundle does not match the built
  manifest — the failure mode that is expensive precisely because every dashboard is green
- recovery: the post-deploy assertion fails the deploy and names the mismatched asset; roll back
  to the previous module version and re-run the assertion
- verify:
  - command_exit_code("node release/assert-served-bundle.mjs --target ${APERTURE_WEB_URL}", 0)
  - command_output_contains("node release/assert-served-bundle.mjs --report", "hash-match")
  - command_exit_code("aperture-verify liveness-alone-does-not-satisfy-deploy-gate", 0)

### Stall: Offline queue never flushes
- condition: connectivity has returned but pending items have not drained within their bound
- recovery: retry with backoff, then surface a per-item actionable failure. Items are **never**
  silently dropped.
- verify:
  - json_field("${APERTURE_STATE_DIR}/aperture-offline-queue.json", "dropped", "0")
  - command_exit_code("aperture-verify queue-flush-ordered", 0)
  - screen_contains("Pending")

### Stall: Continuity check — memory or traits reset
- condition: after adding Aperture as a channel, or after a device revocation and re-auth,
  assistant memory, personality traits, or relationship lore are absent
- recovery: **this is a hard failure, not a degradation.** Halt and report; do not "re-seed" the
  assistant, which destroys the evidence and the relationship at once.
- verify:
  - command_exit_code("aperture-verify continuity-preserved", 0)
  - command_output_contains("aperture-verify channels", "matrix:enabled")
  - command_exit_code("aperture-verify traits-present-after-revocation-cycle", 0)
  - command_exit_code("aperture-verify memory-present-after-channel-add", 0)
