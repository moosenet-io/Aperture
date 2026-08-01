# Security policy

Aperture is a client for a **self-hosted** system. Almost every deployment is a single
operator running their own backend on their own hardware. That shapes this policy: there is no
hosted service to page, and there is no fleet of installations we can patch on your behalf.
What we can do is fix the defect quickly, describe it honestly, and make the fixed version
easy to get.

## Supported versions

| Version | Supported |
|---|---|
| `main` | Yes — fixes land here first |
| Latest tagged release | Yes |
| Any earlier release | No — upgrade to the latest release |

There is no long-term-support branch. Aperture is pre-1.0 and moving quickly; a fix is
delivered by moving forward, not by backporting.

## Reporting a vulnerability

**Do not open a public issue for a security defect, and do not include a working exploit in
any public discussion.**

Report it privately through the **hosting platform's private vulnerability reporting facility
for this repository**. That is the intended channel and the only one that is guaranteed to
reach a maintainer without disclosing the issue first. It is available from the repository's
own security page.

The report goes to the **project maintainer role**. This project deliberately publishes no
contact address: an address in a public file is a phishing target and, for a self-hosted
project, tends to leak details of somebody's infrastructure. Use the platform channel.

If the platform's private reporting facility is unavailable to you, open a public issue
containing **only** the words "security report — requesting a private channel" and no
technical detail whatsoever. A maintainer will open one.

### What to include

- What the defect lets an attacker do, in one sentence.
- The affected version or commit, and the target (web, desktop, or mobile).
- Reproduction steps, minimal and precise.
- Whether it requires an authenticated session, an operator-configured endpoint, or neither.
- Anything you already know about the fix.

Please **redact your own infrastructure** — hostnames, addresses, tokens, and endpoints — from
the report. Describe the shape of the configuration rather than pasting it. We do not need
your deployment's details to reproduce a client defect, and a report is only as private as its
least careful line.

## What to expect

| Stage | Target |
|---|---|
| Acknowledgement that a human has read the report | Within **5 days** |
| An initial assessment — severity, whether it reproduces, intended fix | Within **14 days** |
| Fix released for a confirmed high-severity defect | Within **30 days** of confirmation |

These are targets for a small project, not a contractual SLA. If a deadline is going to slip,
you will be told that it is slipping rather than left in silence.

## Disclosure

Coordinated disclosure. We ask that you give us **90 days** from acknowledgement before
publishing, or until a fix ships — whichever comes first. If a defect is being actively
exploited, that window compresses and we will say so.

When the fix ships, the advisory names the defect, the affected versions, and the fix. It
credits the reporter by whatever name they ask for, or not at all if they prefer. Credit is
never given without asking first.

## Scope

**In scope** — defects in this repository: the client bundles, the backend-for-frontend that
serves them, the API contract, the packaging and update path, and the pipeline configuration
that governs what gets published.

Particularly interesting:

- Anything that lets untrusted content — a tool result, a model response, a file — be rendered
  or attributed as if it came from the assistant or the user.
- Anything that gets a secret, a token, or a session into a client bundle, into storage, or
  into a log.
- Anything that causes an outbound request to a host the operator did not configure. Aperture
  makes no external fetches at runtime; a violation of that is a security defect, not a bug.
- Anything that leaves cached conversation data readable after logout or device revocation.
- Any second access path to the backend that bypasses the sanctioned door.

**Out of scope** — the security of an individual operator's deployment (their network, their
TLS, their host hardening), defects in third-party dependencies that are already public and
already have an upstream advisory, and reports whose only content is automated-scanner output
with no demonstrated impact.

## Hardening this repository already assumes

These are enforced properties, not aspirations. If you can defeat one, that is a finding worth
reporting:

- No secret is ever compiled into a client bundle. Secrets resolve at runtime from the vault.
- No telemetry, no analytics, no external CDN, no remote fonts, no phone-home. The build fails
  if an external origin appears in a bundle.
- No infrastructure values — addresses, hostnames, ports, credentials, personal emails — in
  source, config, tests, or documentation. Scanned on every change, and again before anything
  is published.
- `main` is protected: force-push blocked, deletion blocked, direct push whitelist-gated.
- Every change passes an independent review gate before merge. The gates are not bypassable.

See [docs/PIPELINE.md](docs/PIPELINE.md) for how those are enforced.
