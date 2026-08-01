# Aperture transport — contract v1

**Status:** normative. Per-target transport, authentication, and Content-Security-Policy rules.

This document exists because a single global transport rule is impossible. "Every request is
same-origin relative" is correct for a browser and meaningless for a native desktop shell whose
webview origin is a custom scheme that does not resolve to the backend at all. "`SameSite=Strict`
everywhere" and "the desktop talks to a configured remote endpoint" cannot both hold with a
cookie. Three independent reviews found the same contradiction.

The resolution is not a compromise. It is **one injectable transport with per-target rules**, and
the rules are stated per target below — never globally, and never merged into a lowest common
denominator.

---

## 1. One injectable transport

- The SDK exposes **one transport**, constructed with a base URL and an auth mode. It is not a
  global constant and not a module-level singleton.
- **`baseUrl` is a required constructor argument with no default.** There is no compiled-in
  fallback endpoint, and no endpoint literal appears anywhere in this contract, in the SDK, or in
  any shipped client bundle.
- The transport is the **only** place a network request is constructed. Every operation takes it
  as an argument.
- The API is always mounted at the path prefix `/v1/aperture`. The base URL is prefixed to that,
  and for the web target the base URL is the empty string, which makes the prefix the whole URL.

---

## 2. Web target, and mobile PWA

**The mobile PWA is a web target and follows these rules exactly.** It is not a third case.

| Property | Value |
|---|---|
| Base URL | **Empty string** — every request is same-origin relative. |
| Auth | The **session cookie**. |
| Cookie name prefix | **`__Host-`** |
| Cookie flags | `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, **no `Domain` attribute** |
| CSP `connect-src` | **`'self'`** |
| Bearer token | **Never.** |

Notes that are part of the contract, not commentary:

- The `__Host-` prefix *forbids* a `Domain` attribute. That is the point: the session must not be
  shared with a sibling subdomain. It is never relaxed to accommodate one.
- The cookie is `HttpOnly` and therefore **unreadable by client JavaScript, by design**. A client
  cannot validate its own session offline, and must not be given a client-readable token to work
  around that. Offline boot renders cached state and revalidates on reconnect.
- Because the session is cookie-borne, **every non-GET route is CSRF-able by default**. Every
  mutating route therefore carries a fail-closed `Origin` / `Sec-Fetch-Site` check: an absent,
  unrecognized, or unparseable value is **rejected**. The allowlist of accepted values is
  fail-closed; a denylist is never used. A browser sending neither header is rejected, which
  deliberately costs a legacy-browser class Aperture does not support.
- The session id is **rotated on login and on any privilege change**, with the previous id
  invalidated server-side, not merely unset on the client.

---

## 3. Desktop target

| Property | Value |
|---|---|
| Base URL | The **operator-configured endpoint**, held in OS secure storage (platform keychain / credential manager), read at runtime. |
| Auth | A **bearer token**. |
| Cookie | **Never.** |
| CSP `connect-src` | **Exactly** the configured endpoint, and nothing else. |
| Compiled-in default endpoint | **None.** |

Notes that are part of the contract:

- **A cross-origin cookie cannot be `SameSite=Strict`, and the flags must not be loosened to make
  one work.** That is the whole reason the desktop target uses a bearer token. "Change
  `SameSite=Strict` to `Lax` or `None` so the desktop works" is a defect, not a fix, and there is
  no PR-body escape hatch from this paragraph.
- **A cookie auth mode combined with a non-empty base URL is a construction-time error** in the
  SDK. It fails loudly at construction rather than silently producing a request that either
  strips the cookie or requires loosened flags.
- **A bearer session is never accepted from a browser-origin request carrying cookies**, and a
  cookie session is never accepted with a non-empty base URL. The mechanisms do not mix per
  request.
- The desktop CSP is composed **from configuration at runtime**. No endpoint literal is compiled
  into the binary. With no endpoint configured, the policy composer **errors** rather than
  emitting a permissive `connect-src`.
- The bearer token lives in OS secure storage and nowhere else. It is never written to a
  configuration file, a log, a crash report, or any client-side persistent store other than the
  platform keystore.

---

## 4. CORS — the rule everyone will want to break

> **No CORS headers are ever served on `/v1/aperture/*`. Ever.**

Not `Access-Control-Allow-Origin`, not `Access-Control-Allow-Credentials`, not a preflight
handler, not "just for development", not behind a configuration key.

The reason, stated so nobody has to re-derive it under deadline pressure:

- The **web and PWA** targets are same-origin. There is nothing for CORS to permit.
- The **desktop** target reaches the API as a **native HTTP client**, not as a browser `fetch`
  subject to the same-origin policy. CORS is a browser mechanism; a native client is not asking
  for permission, so granting it changes nothing about whether the desktop works.

Therefore: **adding CORS headers can never fix a desktop connectivity problem.** If a request
appears to need CORS, it is coming from the wrong place — a browser pointed at a cross-origin
backend — and the correct response is to fix the deployment topology, not to widen the API.
Enabling CORS would do nothing for the desktop and would hand a cookie-bearing, `SameSite=Strict`
web session a cross-origin attack surface it does not currently have.

A conformance test asserts that no response on `/v1/aperture/*` carries a CORS header, and a lint
over this contract fails if any route ever declares one.

---

## 5. Security headers

The web/PWA shell CSP is served **at runtime by the backend**, not merely hoped for by a
build-time bundle grep:

```
default-src 'none'; script-src 'self'; connect-src 'self'; img-src 'self' blob: data:;
style-src 'self'; font-src 'self'; media-src 'self' blob:; form-action 'none';
base-uri 'none'; frame-ancestors 'none'; object-src 'none'
```

No `unsafe-inline`, no `unsafe-eval`, no wildcard source. An inline style or script that a build
step genuinely needs uses a per-response nonce — never a blanket relaxation.

The desktop policy is the same policy with `connect-src` replaced by exactly the configured
endpoint (§3).

Additional headers on every response: `X-Content-Type-Options: nosniff`,
`Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`,
`Cross-Origin-Resource-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, and a
`Permissions-Policy` denying geolocation, camera, microphone, and payment by default.
`Strict-Transport-Security` is served where the deployment terminates TLS, with its max-age as a
named configuration key.

Attachment responses carry their own stricter set — see
`contracts/aperture-attachments-v1.md` and the serve route in `aperture-api-v1.yaml`.

**What is asserted.** Conformance tests assert the **configured and served** policy: the response
headers the backend emits, and the policy the webview is configured with. They do **not** attempt
to assert a webview's *effective* runtime CSP, which is not generally introspectable. The
distinction is deliberate and is stated so nobody writes a gate that cannot pass honestly.

**Report-only is a rollout tool, not a destination.** A report-only mode may exist behind a
configuration key for an initial rollout; the enforcing policy is the shipped default, and a test
asserts it.

---

## 6. No runtime external fetch

No telemetry, no analytics, no external CDN, no remote font, no remote asset fetch at runtime, on
any target. Fonts are bundled. Assets are bundled.

There is exactly **one** carve-out, and it is written down rather than implied:

1. **Click-to-load remote images in rendered markdown.** Never automatic, never preloaded, no
   referrer sent, and the user is told what will be fetched before it is fetched.
2. Nothing else.

Any further carve-out requires an explicit operator decision recorded in the binding decisions
document. The desktop update feed is **not** a carve-out: it is served by the user's own
configured backend.

---

## 7. Session lifetime obligations on the client

Ending a session or having a device revoked obliges the client to **purge that device's local
copy of the user's data**: cached threads, the outbox, drafts, and any cached attachment content.
A logged-out or revoked device must not remain a readable copy of the user's conversations. This
is a client obligation with a negative test, not a best-effort cleanup.

---

## 8. A future target that is neither browser nor native

This document is **extended**, not reinterpreted. A target that is neither a browser origin nor a
native HTTP client gets its own section stating its base URL rule, its auth mechanism, and its
CSP — decided deliberately, in a contract change, reviewed. Nobody may infer its rules by
analogy with the two targets here, and nobody may relax an existing target's rules to accommodate
it.
