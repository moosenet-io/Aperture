# Aperture configuration reference

Every key below is listed **by name only**. This file contains no values, no addresses and no
credentials — and it never will. Configuration is supplied at runtime; secrets are resolved
from the vault through the secret manager, never read from a plain environment variable and
never authored into a file.

Two categories, and the distinction is load-bearing:

- **Behavioural configuration** — feature flags, timeouts, limits. Plain configuration, read
  through the core's config helpers.
- **Secrets** — anything token-, key-, password-, or signing-shaped. Resolved exclusively via
  the secret manager. A direct environment read of one of these names is a review rejection,
  regardless of how carefully it is handled.

## How this file is kept honest

The two tables below are not maintained by hand against memory. They are **checked**, by
`npm --prefix client run assert-config-documented`, against
[`contracts/aperture-config-v1.json`](../contracts/aperture-config-v1.json) — the machine-readable
key manifest — in **both directions**:

- a key in the manifest that this file does not name is a failure;
- a key this file names that the manifest does not is a failure;
- a **purpose** or a **default** that differs from the manifest is a failure;
- a **shape the checker cannot read** is a failure, not a skip: a line in `.env.example` that is
  not exactly `NAME=`, an assignment hidden in a comment, a key placed in an HTML table, a
  blockquoted table or a table without a leading `|`, and a manifest entry missing one of its
  members. Equality over only the rows a regex happened to match would report agreement while a
  key sat somewhere invisible;
- and [`.env.example`](../.env.example) is held to the same equality, so all three artifacts
  name exactly the same set.

The manifest is itself compared, in the agent-core repository, against the key set the BFF's
code actually reads — the same both-directions equality, over the same names, purposes and
defaults. So "documented" here means "the code reads exactly these keys", not "someone wrote
these down". A count check would pass while a key was both missing and extra; set equality
will not.

**The one link that is not mechanical** is that the manifest is carried in two repositories.
Each repository proves its own half against its own copy; nothing gates the two copies being
byte-identical. That step is review, and it is named here rather than implied to be gated.

---

## Secrets

| Name | Purpose | Absent ⇒ |
|---|---|---|
| `APERTURE_SESSION_SIGNING_KEY` | Signs and verifies session tokens | Auth reports `unavailable`. **No default key is generated, derived, or randomly minted.** |
| `APERTURE_VAPID_PUBLIC_KEY` | Web Push subscription key | Push reports `unavailable`; everything else works |
| `APERTURE_VAPID_PRIVATE_KEY` | Web Push signing key | As above |

Rotation behaviour: the backend is consulted on **every** resolution, so a rotated secret takes
effect on the next use rather than at the end of a cache lifetime, and the superseded value is
wiped from memory as soon as its last holder releases it. Sessions signed with a superseded key
**fail closed to re-authentication**; they are never silently accepted. Rotate in a quiet window.

Never logged, never printed, never included in an error body. Secret material is held in a type
with no serializer at all and a formatting implementation that renders a fixed redaction marker
with no length and no prefix — properties the compiler and the test suite check rather than
prose asking for care. Error bodies are mapped to a class rather than echoing an upstream string.

### The fallback cache

When the external secret backend cannot be reached, a previously resolved value may be reused.
That cache is **memory-only**: it is never written to a file, a temporary file, a database, a
serialized snapshot, or a log line, and its buffers are overwritten when they are dropped —
including while a panic is unwinding. Its lifetime is bounded by
`APERTURE_SECRET_CACHE_TTL_SECS`; an entry older than that is evicted and treated as absent
rather than served, so an outage cannot keep a dead deployment limping on a key nobody can
rotate.

A **cold cache plus an unreachable backend is `unavailable`, with a reason.** It is never a
generated key, never a default key, and never a key derived from anything. There is no code
path that can produce one.

---

## Behavioural configuration

Every value is parsed strictly and **refused rather than coerced**: a `bool` accepts only
`true` or `false` in any case — not `1`, not `yes`, not `on` — an unsigned value refuses `0`
and anything non-numeric, and a comma-separated list refuses an entry set that comes out empty.
A refused value falls back to the default below and is reported in the log by **name**, never
by value. An exported name with a blank value counts as unset, because that is what an operator
who left it blank meant.

### Feature and access

| Name | Purpose | Default |
|---|---|---|
| `APERTURE_ENABLED` | Master switch for the BFF | `false` |
| `APERTURE_ALLOW_SIGNUP` | Whether self-signup is open | `false` |
| `APERTURE_ADMIN_BOOTSTRAP` | Whether first-run onboarding is reachable | `true` |

`APERTURE_ENABLED` and `APERTURE_ALLOW_SIGNUP` default off: exposure is opted into deliberately,
and the instance is invite-only until it is not. First-run onboarding closes permanently once an
admin exists, regardless of what `APERTURE_ADMIN_BOOTSTRAP` says — the key can only keep it
shut, never reopen it.

### Sessions and devices

| Name | Purpose | Default |
|---|---|---|
| `APERTURE_SESSION_TTL_SECS` | Session lifetime before refresh, in seconds | `3600` |
| `APERTURE_REFRESH_TTL_SECS` | Refresh-token lifetime, in seconds | `2592000` |
| `APERTURE_MAX_DEVICES_PER_USER` | Registered-device ceiling per user | `8` |
| `APERTURE_AUTH_RATE_LIMIT_PER_MIN` | Auth attempts per minute per source | `10` |

### Streaming

| Name | Purpose | Default |
|---|---|---|
| `APERTURE_STREAM_HEARTBEAT_SECS` | Stream keepalive interval, in seconds | `15` |
| `APERTURE_STREAM_MAX_IDLE_SECS` | Idle stream reaped after, in seconds | `300` |
| `APERTURE_STREAM_RESUME_WINDOW_SECS` | How long a stream may be resumed by event id, in seconds | `120` |
| `APERTURE_STREAM_MAX_CONCURRENT` | Concurrent streams per user | `4` |
| `APERTURE_TURN_CANCEL_GRACE_SECS` | Grace window after a turn's last subscriber leaves before it is cancelled, in seconds | `30` |

Cancellation is real, and it is refcounted: a turn ends when its **last** subscriber has been
gone for the grace window, not when any one client drops. An explicit "stop generation" is a
different action and cancels immediately. Beyond the resume window a client is told to refetch
rather than being replayed from a buffer that no longer holds its position.

### Attachments

| Name | Purpose | Default |
|---|---|---|
| `APERTURE_UPLOAD_MAX_BYTES` | Per-file attachment size ceiling, in bytes | `26214400` |
| `APERTURE_UPLOAD_MAX_FILES_PER_THREAD` | Attachment count ceiling per thread | `20` |
| `APERTURE_UPLOAD_ALLOWED_TYPES` | Permitted attachment content types, as an allowlist | `image/png, image/jpeg, image/webp, image/gif, application/pdf, text/plain, text/markdown` |

The allowlist is deliberate, and so is what is missing from it. Fail-closed allowlists beat
denylists for anything parsing untrusted input — a denylist only blocks what you thought of.
SVG and HTML are absent because both are executable in a browser context.

### Modules and context

| Name | Purpose | Default |
|---|---|---|
| `APERTURE_MODULE_PROBE_TTL_SECS` | Capability re-probe interval, in seconds | `30` |
| `APERTURE_CONTEXT_RETENTION_SECS` | How long context-bus entries are retained, in seconds | `604800` |
| `APERTURE_CONTEXT_ENABLED` | Master switch for the context bus | `true` |

Capability state is **probed through the kernel**, never assumed from configuration and never
by contacting a backend service directly.

### Secret resolution

| Name | Purpose | Default |
|---|---|---|
| `APERTURE_SECRET_CACHE_TTL_SECS` | How long a cached secret stays usable when the secret backend is unreachable, in seconds | `300` |

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
- **No secret-cache persistence.** There is no key that would let the fallback cache be written
  to disk, because there is no code that could write it.

---

## Deployment tiers

All configuration must work across three tiers without modification:

| Tier | Key provider | External secret backend |
|---|---|---|
| Self-hosted / homelab | `file` | Optional |
| Cloud / VPS | `env` (platform-injected) | Optional |
| Developer / evaluation | `interactive` (passphrase) | None |

The key provider unlocks the **vault**; the Aperture secrets live inside it. All three are
exercised against a real encrypted vault in the agent-core test suite, so "works across the
tiers" is a test result rather than an intention.

**The external secret backend is never assumed available.** When it is unreachable, a cached
value within its bounded lifetime is used and the capability stays `available`. When there is
nothing cached, the capability is `unavailable` with a reason. It degrades, and it degrades
honestly; it neither hard-fails the process nor invents a key to keep going.
