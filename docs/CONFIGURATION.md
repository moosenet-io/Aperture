# Aperture configuration reference

Every key below is listed **by name only**. This file contains no values, no addresses, and no
credentials — and it never will. Configuration is supplied at runtime; secrets are resolved
from the vault through the secret manager, never read from a plain environment variable and
never authored into a file.

Two categories, and the distinction is load-bearing:

- **Behavioural configuration** — feature flags, timeouts, limits. Plain configuration, read
  through the core's config helpers.
- **Secrets** — anything token-, key-, password-, or signing-shaped. Resolved exclusively via
  the secret manager. A direct environment read of one of these names is a review rejection,
  regardless of how carefully it is handled.

---

## Secrets

| Name | Purpose | Required | Absent ⇒ |
|---|---|---|---|
| `APERTURE_SESSION_SIGNING_KEY` | Signs and verifies session tokens | Yes | Auth reports `unavailable`. **No default key is generated.** |
| `APERTURE_VAPID_PUBLIC_KEY` | Web Push subscription key | Push only | Push reports `unavailable`; everything else works |
| `APERTURE_VAPID_PRIVATE_KEY` | Web Push signing key | Push only | As above |

Rotation behaviour: sessions signed with a superseded key **fail closed to re-authentication**.
They are never silently accepted. Rotate in a quiet window.

Never logged, never printed, never included in an error body. The redacting display
implementation is asserted by test, and error bodies are mapped to a class rather than echoing
an upstream string.

---

## Behavioural configuration

### Feature and access

| Name | Controls | Default |
|---|---|---|
| `APERTURE_ENABLED` | Master switch for the BFF | `false` — opt in deliberately |
| `APERTURE_ALLOW_SIGNUP` | Whether self-signup is open | `false` — invite-only |
| `APERTURE_ADMIN_BOOTSTRAP` | Whether first-run onboarding is reachable | Auto-closes permanently once an admin exists |

### Sessions and devices

| Name | Controls | Default |
|---|---|---|
| `APERTURE_SESSION_TTL_SECS` | Session lifetime before refresh | 3600 |
| `APERTURE_REFRESH_TTL_SECS` | Refresh token lifetime | 2592000 |
| `APERTURE_MAX_DEVICES_PER_USER` | Registered device ceiling | Conservative; raise deliberately |
| `APERTURE_AUTH_RATE_LIMIT_PER_MIN` | Auth attempts per minute per source | Conservative |

### Streaming

| Name | Controls | Default |
|---|---|---|
| `APERTURE_STREAM_HEARTBEAT_SECS` | SSE keepalive interval | 15 |
| `APERTURE_STREAM_MAX_IDLE_SECS` | Idle stream reaped after | 300 |
| `APERTURE_STREAM_RESUME_WINDOW_SECS` | How long a stream can be resumed by event id | 120 |
| `APERTURE_STREAM_MAX_CONCURRENT` | Concurrent streams per user | Bounded, never unlimited |

Cancellation is real: when a client disconnects mid-generation, the upstream generation is
**actually stopped**, not orphaned to run to completion unread.

### Attachments

| Name | Controls | Default |
|---|---|---|
| `APERTURE_UPLOAD_MAX_BYTES` | Per-file size ceiling | Conservative |
| `APERTURE_UPLOAD_MAX_FILES_PER_THREAD` | Attachment count ceiling | Bounded |
| `APERTURE_UPLOAD_ALLOWED_TYPES` | Permitted content types | **Allowlist, not a denylist** |

The allowlist is deliberate. Fail-closed allowlists beat denylists for anything parsing
untrusted input — a denylist only blocks what you thought of.

### Modules and context

| Name | Controls | Default |
|---|---|---|
| `APERTURE_MODULE_PROBE_TTL_SECS` | Capability re-probe interval | 30 |
| `APERTURE_CONTEXT_RETENTION_SECS` | How long context-bus entries are retained | Bounded and user-clearable |
| `APERTURE_CONTEXT_ENABLED` | Master switch for the context bus | `true`, user-opt-outable |

Capability state is **probed through the kernel**, never assumed from configuration and never
by contacting a backend service directly.

---

## What is deliberately *not* configurable

Some things are not knobs, on purpose:

- **No telemetry endpoint.** There is no analytics configuration because there is no analytics.
- **No external asset host.** Fonts and assets are bundled; the build fails if an external
  origin appears in the output.
- **No model name or engine selection.** Inference is addressed by **named proxy** — a logical
  route. The routing decision, model tiering, and lifecycle belong to the inference layer, not
  to the client. A configuration key naming a model would move that decision to the wrong place.
- **No signing-verification bypass** for desktop updates. An unsigned or unverifiable artifact
  is refused; there is no flag to accept one.
- **No PII-gate override** on the mirror path.

---

## Deployment tiers

All configuration must work across three tiers without modification:

| Tier | Key provider | External secret backend |
|---|---|---|
| Self-hosted / homelab | `file` | Optional |
| Cloud / VPS | `env` (platform-injected) | Optional |
| Developer / evaluation | `interactive` (passphrase) | None |

**The external secret backend is never assumed available.** When it is unreachable, cached
values from the last known good state are used. It degrades; it does not hard-fail.

---

## Keeping this file honest

`.env.example` lists these names with no values. A test asserts that every key documented here
exists in code and that every configuration key read by code is documented here — so this file
cannot silently drift from reality.
