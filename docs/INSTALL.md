# Installing Aperture

Aperture is the client layer for a Lumina Constellation deployment. It is **not** a standalone
application — it needs a MooseNet backend to talk to. This guide covers standing up that
backend surface, then installing each client target.

Two readers are assumed throughout:

- **The operator** standing Aperture up on their own fleet.
- **An external reader** evaluating the project, who has none of that infrastructure. Where a
  step is fleet-specific, it says so plainly rather than inventing a plausible-looking value.

> **A note on addresses.** This document never contains a real hostname, IP address, or port.
> Everywhere a deployment-specific value belongs, you will see an environment-variable **name**
> in `UPPER_SNAKE_CASE`. Substitute your own. This is not coyness — it is the same rule the
> codebase enforces, and the reason this repository can be published at all.

---

## 0. Before you start

### What you need

| Requirement | Why | Notes |
|---|---|---|
| A running agent core | Aperture's backend-for-frontend lives inside it | The `aperture` cargo feature must be enabled |
| A reachable kernel (tool hub) | The single door to every capability | Aperture never bypasses it |
| A reachable inference layer | Chat, embeddings, transcription, parsing | Addressed by **named proxy**, never by model name |
| Node.js ≥ 20 and npm | Building the client bundle | Only on a build host — deploy hosts do not need it |
| Rust toolchain (pinned) | Building the agent core | Use the repository's pinned toolchain, not an ad-hoc `rustup update` |
| A secret store / vault | Every credential is resolved at runtime | Nothing is authored into a file |

### What you do *not* need

- A cloud account of any kind.
- An API key for a hosted model provider, unless you deliberately configure one upstream.
- Any outbound internet access at runtime. Aperture is designed to run air-gapped; all fonts
  and assets are bundled and the build fails if an external origin appears in the output.

### Decide your deployment tier

The secret layer supports three tiers. Pick one before you begin; it determines how the
signing key reaches the process.

| Tier | Key provider | Typical use |
|---|---|---|
| Self-hosted / homelab | `file` — key material on disk, permissions-restricted | A fleet you control |
| Cloud / VPS | `env` — injected by the platform | Managed hosting |
| Developer / evaluation | `interactive` — passphrase at start | Local evaluation only |

All three must work without an external secret backend. If the backend is unreachable, the
last known good cached values are used — the service degrades, it does not hard-fail.

---

## 1. Provision secrets

Aperture needs the following secrets. **Create them in your vault by name.** Do not write
values into a file, a unit definition, or an environment file you author by hand — those are
runtime *materializations* of the vault, not places to author values.

| Secret name | Purpose | Required |
|---|---|---|
| `APERTURE_SESSION_SIGNING_KEY` | Signs session tokens | Yes |
| `APERTURE_VAPID_PUBLIC_KEY` | Web Push subscription (mobile) | Only for push |
| `APERTURE_VAPID_PRIVATE_KEY` | Web Push signing (mobile) | Only for push |

Generate the session signing key with at least 32 bytes of cryptographically secure random
data. Rotate it deliberately: sessions signed with a previous key **fail closed to re-auth**,
which is correct behaviour, so plan a rotation for a quiet window.

> **If a secret is absent, the affected capability reports `unavailable` with a reason and the
> rest of Aperture still works.** This is deliberate. Do not invent a stopgap default value to
> get past a missing secret — a default signing key is a security hole, not a convenience.

Verify what the process can actually see — the vault status endpoint reports which names
resolved, and **never returns values**:

```bash
curl -fsS "${APERTURE_API_URL}/v1/aperture/health/secrets"
```

---

## 2. Configure

Every configuration key is documented by name in [CONFIGURATION.md](CONFIGURATION.md). The
ones you are most likely to change:

| Key | What it controls | Sensible default |
|---|---|---|
| `APERTURE_ENABLED` | Master switch for the BFF | `false` — opt in deliberately |
| `APERTURE_SESSION_TTL_SECS` | How long a session lives before refresh | 1 hour |
| `APERTURE_REFRESH_TTL_SECS` | How long a refresh token lives | 30 days |
| `APERTURE_UPLOAD_MAX_BYTES` | Attachment size ceiling | Set it deliberately; the default is conservative |
| `APERTURE_STREAM_HEARTBEAT_SECS` | SSE keepalive interval | 15 seconds |
| `APERTURE_MODULE_PROBE_TTL_SECS` | Capability re-probe interval | 30 seconds |
| `APERTURE_ALLOW_SIGNUP` | Whether self-signup is open | `false` — invite-only by default |

`.env.example` in the repository root lists **names only, with no values**. Copy it, fill in
your own, and materialize it through your secret tooling — do not commit the result.

---

## 3. Build and enable the backend

The Aperture BFF is a feature-gated module inside the agent core. A build without the feature
is byte-compatible with the existing binary, so enabling it is a deliberate, reversible act.

```bash
# On a BUILD-CAPABLE host. Deploy hosts with limited memory must never build.
cargo build --release --features aperture
```

> **Build-host discipline.** On a shared host, submit the build through the fleet's compiler
> tool rather than running `cargo` ad hoc — it owns host selection, the pinned toolchain, the
> shared compile cache, and the memory cap that keeps a build from disturbing co-located
> services. An uncapped `cargo test` on a shared box is how you take out something unrelated.

### Serving the client bundle

The built SPA is embedded into the binary and served by the agent core. **This is the step
that most often goes wrong**, so it is worth stating explicitly:

> **A deploy host without Node.js cannot build the SPA.** If the bundle is built on the deploy
> host, the embed step silently falls back to a tiny placeholder and the service comes up
> serving a stub page that looks like a broken app rather than a failed deploy.
>
> **Always build the client bundle on a build-capable host and ship the built artifact.**
> Then assert it: the post-deploy check compares the served bundle's size and hash against the
> built artifact and fails the deploy if they differ. A deploy that serves a several-hundred-byte
> "index" is this bug, every time.

```bash
npm --prefix client ci
npm --prefix client run build          # produces client/dist
node client/scripts/assert-no-external-hosts.mjs
# then build the core with the bundle present, and verify after deploy:
curl -fsS "${APERTURE_API_URL}/" | wc -c   # must be the real bundle, not a stub
```

### Health check

```bash
curl -fsS "${APERTURE_API_URL}/v1/aperture/health"
curl -fsS "${APERTURE_API_URL}/v1/aperture/modules"   # capability states per module
```

A module reporting `unavailable` is **not** a failure of Aperture — it means that backend is
not reachable, and the client will render an inert tile explaining why rather than a broken
screen. Fix the backend, and the module lights up without a client reload.

---

## 4. Web: first run

1. Open `${APERTURE_API_URL}` in a browser.
2. On a fresh deployment you are taken to **first-run onboarding**, which creates the initial
   administrator account. This flow is available exactly once; after an admin exists it is
   permanently closed, and hitting it again returns a 404 rather than an invitation.
3. Sign in. Create your first workspace.
4. In workspace settings, choose the **named proxy** for the workspace (for example a fast
   route for conversation and a deeper route for analysis). You are choosing a logical route,
   not a model — the inference layer owns the actual model selection, tiering, and lifecycle.
5. Send a message. You should see tokens stream in, not a spinner followed by a wall of text.
   If you get the latter, see *Streaming stalls* in troubleshooting.

### Adding other people

Self-signup is off by default. Invite from **Admin → Users → Invite**. Roles are `admin` and
`member`; workspace access is granted per user. Everything is private by default — nothing is
shared until you share it.

---

## 5. Desktop: Windows and macOS

> **Status: Sprint E.** The desktop shell is a core deliverable of this build, not an
> afterthought, but the signed installers are not published yet. This section documents the
> intended flow; it will be completed with real artifacts and checksums when Sprint E lands.
> It is written here rather than omitted so the shape is reviewable now.

The desktop client is a Tauri v2 shell around the same React bundle as web — one codebase, no
forked UI, no bundled browser runtime.

### Windows

1. Download the signed installer and verify its checksum before running it.
2. Install per-user (no administrator rights needed) or per-machine.
3. On first run, enter the address of your MooseNet deployment. The application ships with
   **no default address** — it does not know where your fleet is, by design.
4. Credentials are stored in the Windows Credential Manager, never in a file on disk.
5. Auto-update verifies the signature of every update **before** applying it, and refuses to
   install an unsigned or unverifiable artifact. That refusal is the feature.

### macOS

1. Download the signed and notarized disk image and verify its checksum.
2. Drag the application to Applications. Because it is notarized and stapled, Gatekeeper
   should not prompt; if it does, the artifact is wrong — **do not** work around it by
   right-click-opening.
3. First run asks for your deployment address, as on Windows.
4. Credentials are stored in the macOS Keychain.
5. Both Apple Silicon and Intel are supported.

### Uninstalling

Both platforms remove the application, its cached bundle, and its stored credentials.
Server-side data — your threads, memory, and files — lives on your backend and is untouched.

---

## 6. Mobile: installable PWA

> **Status: Sprint F.**

Aperture installs as a Progressive Web App from the same address as the web client.

- **Android / Chromium:** open the site, then *Install app* from the browser menu.
- **iOS / Safari:** open the site, then *Share → Add to Home Screen*.

Honest limitations, stated rather than glossed:

| Capability | Android/Chromium | iOS/Safari |
|---|---|---|
| Offline shell and cached threads | Yes | Yes |
| Install to home screen | Yes, with prompt | Yes, manual via Share |
| Web Push notifications | Yes | Only when installed to the home screen |
| Background sync | Yes | Limited |
| Share target | Yes | Not supported |

Anything requiring more than this is a native-app workstream, deliberately deferred. Push
notifications are a **transport for the assistant's existing presence budget** — quiet hours,
opt-out, and its notification rate limit all still apply. Aperture does not have its own
notification tray and will not grow one.

---

## 7. Channels

Aperture is one channel; the others continue to work exactly as before.

| Channel | To enable |
|---|---|
| **Matrix** | Unchanged. Retained and first-class. No action needed, nothing deprecated. |
| **Aperture** | Set `APERTURE_ENABLED` and complete the steps above. |
| **Telegram** | Build the core with the `telegram` feature and provide its credentials through the vault. **Off by default.** |
| **Signal** | **Not configurable.** A stub adapter exists and permanently reports `unavailable`. There is no provisioning path yet, deliberately. |

If you were expecting to turn Signal on: you cannot, yet, and the stub is honest about it
rather than failing confusingly at runtime.

---

## 8. Verifying the install

A working installation satisfies all of these:

```bash
# 1. The BFF is up
curl -fsS "${APERTURE_API_URL}/v1/aperture/health"

# 2. Modules report their real capability state
curl -fsS "${APERTURE_API_URL}/v1/aperture/modules"

# 3. The served bundle is the real one, not a fallback stub
test "$(curl -fsS "${APERTURE_API_URL}/" | wc -c)" -gt 2000

# 4. The stream endpoint holds open and heartbeats
curl -fsS -N "${APERTURE_API_URL}/v1/aperture/stream" --max-time 40
```

And, in the browser: tokens stream visibly, a tool call renders as a labelled inline block,
and an unavailable module shows an explained tile rather than an empty page.

---

## 9. Troubleshooting

**The page loads but is nearly empty, and the HTML is tiny.**
The client bundle was not embedded — almost always because the build ran on a host without
Node.js and silently fell back to a placeholder. Rebuild the bundle on a build-capable host
and redeploy. See §3.

**Streaming stalls: the reply appears all at once after a long pause.**
Something between the client and the BFF is buffering the response. Confirm the
anti-buffering headers survive your reverse proxy, and that proxy response buffering is off
for the stream route specifically. This is a proxy configuration problem, not a client bug.

**Every module says `unavailable`.**
The BFF cannot reach the kernel. Aperture is behaving correctly by degrading instead of
crashing. Check the kernel is running and that the client library is configured. Do **not**
work around this by pointing Aperture at a backend service directly — that is a second door,
and it will be rejected in review.

**Login succeeds, then immediately logs out.**
The session signing key changed, or differs between processes. Sessions signed with a previous
key fail closed by design. Confirm every process resolves the same `APERTURE_SESSION_SIGNING_KEY`.

**Uploads fail at a certain size.**
`APERTURE_UPLOAD_MAX_BYTES`, or a smaller body limit on a proxy in front. Check both; the
proxy limit is the one people forget.

**Push notifications never arrive on iOS.**
The PWA must be installed to the home screen first — Safari does not deliver push to a tab.
Also confirm quiet hours are not active: a suppressed notification is the presence budget
working, not a bug.

**A build or test starts returning nonsense — zero counts, no output, sub-minute completions.**
Check the host's kernel log for I/O errors and its volume group for a partial state **before**
debugging the code. On this fleet, storage failure presents as inexplicable tooling behaviour
rather than an obvious disk alarm, and has burned a full debugging cycle before.

---

## 10. Upgrading

Server-side upgrades follow the fleet's normal module update path: the built image is pulled,
its signature verified before anything is extracted, the binary swapped atomically, the
service restarted, and health-gated with automatic rollback on failure.

Two rules learned the hard way:

- **Never close an upgrade with a hand-built binary swap on a module managed by the updater.**
  The updater compares the registry image digest against the local marker; a hand-written
  marker can never match, so the next nightly run reverts your deploy to the older image.
  Publish properly and let the updater apply it.
- **Apply database migrations with or before the image swap.** They are not applied at service
  startup. Shipping code that needs a migration without applying it breaks the live read path.

Desktop clients update themselves through the signed update channel and refuse unverifiable
artifacts. The PWA updates its service worker on next launch and **prompts** rather than
swapping the shell mid-session.
