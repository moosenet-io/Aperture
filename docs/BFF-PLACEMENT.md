# Where the Aperture backend lives

**Status:** normative for placement. **Scope of this document: placement and gate attribution.**
The wire contract is `contracts/`; the implementation is in the agent-core repository.

---

## The decision

Aperture's backend-for-frontend is **a feature-gated module inside the agent core**, not a new
service. It is compiled into the agent core's binary behind an `aperture` cargo feature and mounts
under the path prefix `/v1/aperture` on the HTTP server that binary already runs.

### Why not a separate service

- **Nothing to gain.** The BFF's whole job is to compose capabilities the agent core already
  reaches. A separate process would reach them by making a network hop to the agent core, which is
  latency and a failure mode bought for no capability.
- **A second service is a second door.** It would need its own credentials, its own outbound
  client, its own deployment, and its own auth surface — every one of them a place the single-door
  rule could quietly stop holding.
- **A self-hosted deployment is one thing to run.** Aperture is for people running their own
  fleet. "One more service, one more unit file, one more port" is a real cost paid by every
  operator, forever, to save a cargo feature.

### Why feature-gated rather than always-on

An operator who does not run Aperture gets the binary they had before it existed: no route, no
symbol, no string, no dependency. The gate is what makes "Aperture is optional" a compile-time
fact rather than a promise.

---

## What the sibling change adds

In the agent-core repository, crate `lumina-core`:

| Path | What it is |
|---|---|
| `crates/lumina-core/src/aperture/mod.rs` | The mount, the contract version and its response header, the correlation-id helper, and the Rust source-scan gates |
| `crates/lumina-core/src/aperture/routes.rs` | The `/v1/aperture` route table: `health`, `ready`, `version`, and the prefix-scoped catch-all |
| `crates/lumina-core/src/aperture/state.rs` | Shared state; the outbound door as a module-private handle; the capability report |
| `crates/lumina-core/src/aperture/error.rs` | The single error type and its closed RFC-9457 problem-details representation |
| `crates/lumina-core/Cargo.toml` | The `aperture` feature (implies `http`; adds no runtime dependency) |
| `crates/lumina-core/src/lib.rs`, `src/main.rs` | The feature-gated module declarations |
| `crates/lumina-core/src/http_server.rs` | The feature-gated mount on the existing server |
| `README.md` | The BFF and its feature flag, documented where an operator will look |

### What it ships behind the flag

The three unauthenticated `meta` operations the contract declares with `security: []` —
`GET /v1/aperture/health`, `GET /v1/aperture/ready`, `GET /v1/aperture/version` (the contract
version only) — plus a catch-all so that **every other path under the prefix** answers in
problem-details form. The `auth`, `threads`, `stream`, `attachments`, `modules`, `events`,
`settings` and `admin` groups are later items; until they exist, those paths honestly report
`not-found` rather than a bare 404 or a panic.

### The properties it holds, and how

- **One door.** Every backend capability is reached through the agent core's in-process
  `terminus-client` wrapper. The handle is a private field with an accessor visible only inside
  the module, so the "exactly one transport" property is enforced by the Rust compiler (D8), not
  by a lint in another language — and the feature adds no runtime dependency, so no new
  HTTP-client crate enters the binary with it. A source scan additionally rejects a list of known
  client spellings; that scan is a regression tripwire, not the proof (see "Evidence classes").
- **Named proxies only.** No model id, engine name, backend tag or size suffix appears in the
  module.
- **No secrets of its own.** The module performs no environment read of any kind; the door is
  *read* from the process rather than constructed, so credential handling stays in one place.
- **Degraded, never fatal.** An unconfigured or unreachable door is a degraded start: the
  capability reports `unavailable` with a reason and `GET /v1/aperture/ready` answers `503` in
  problem-details form. The agent core keeps serving its other channels regardless.
- **Redaction.** A problem-details body carries a class-level `detail` that is constant per error
  class. The real cause goes to the server log keyed by the `correlation_id` the response echoes.
  The problem object is closed, which is what stops an upstream string reaching a client body.
- **No CORS header, ever**, on any response under the prefix.

---

## Gate attribution

**This is the part of this document that does the work.** The item spans two repositories, and
**the Aperture-repo PR's gate can exercise none of the behavioural criteria** — every one of them
is a property of Rust code that lives in the agent-core repository. Without this table an
Aperture-side PR merges green while proving nothing, which is a defect that has already happened
once on this item.

**This PR is intended to prove exactly one criterion: the documentation one — and as of this
commit it does not yet prove even that (see criterion 6).** Everything else is proven by the
agent-core PR, which merges **first**.

### Evidence classes — read this before the table

A table that says "gated" where it means "ran on a laptop" is the same drift this whole item
exists to prevent, so every row below is labelled with **how** its evidence was obtained, not just
what it claims:

| Class | Meaning |
|---|---|
| **GATED** | Proved by the fleet compiler tool — pinned toolchain, capped scope, single build door. This is the only class that is evidence in the process's own sense. |
| **LOCAL** | Proved by a run on the developer host. Real output, real pass/fail, but not the sanctioned gate: not the pinned toolchain, not reproducible on demand by a reviewer, and not recorded by the build system. |
| **STRUCTURAL** | Proved by the language or the manifest rather than by a run — a visibility rule the compiler enforces, or a dependency the manifest does not contain. Strongest where available, because it holds for code nobody has written yet. |
| **TRIPWIRE** | A lexical scan over a named token list. It catches the mistake it enumerates and **nothing else**. It is not proof of a general property; it is a regression alarm for a specific known-bad spelling. |
| **REVIEW** | Proved, if at all, by a human reading it. |

Two facts constrain what could be GATED at all, and both are recorded rather than papered over:

- **The compiler tool has no cargo-feature argument** (`TERM #593`). Its inputs are module, ref,
  mode, profile, target, bin, host, source_dir, request_id — nothing selects a feature. It is
  therefore **structurally incapable** of exercising the `aperture` feature, and every
  feature-on result below is LOCAL by necessity, not by shortcut. This blocks every
  feature-gated item in the fleet the same way.
- **The compiler gate is currently red for an infrastructure reason** unrelated to this change:
  runs die in dependency compilation with `sccache: Failed to create temp dir` (exit 254), one
  build's scratch directory being removed while another uses it as `TMPDIR`. Reproduced on
  `main` as well as on this branch, so it is an infrastructure artifact, not a verdict.

The two compiler runs that **did** complete, on branch head `455bc7b`, ran the **default-feature**
suite: 4753 passed, 4 failed. The four are two pre-existing tests counted across two test binaries
— `engram::resurfacing::tests::ledger_save_failure_suppresses_callbacks` and
`presence::tests::tick_budget_persist_failure_skips_send_no_consume` — both unrelated to Aperture,
both passing locally, and with the feature off this change compiles no new code at all.

### The table

| # | Acceptance criterion | Proving repo | Class | Evidence, and its exact limit |
|---|---|---|---|---|
| 1 | The BFF module compiles with and without the `aperture` feature | agent-core | Feature-off: **GATED** (partially) + **LOCAL**. Feature-on: **LOCAL only** | **GATED:** the compiler tool built and ran the default-feature (feature-**off**) suite on branch head `455bc7b`, with the four pre-existing failures noted above — this is the only part of criterion 1 a gate has touched. **LOCAL:** feature-on and feature-off builds both complete with no warning from the module; the feature-off binary contains **zero** occurrences of the route prefix and the feature-on binary contains it. **Not gated, and why:** the compiler tool cannot select a cargo feature at all (`TERM #593`), so no gate can currently observe the feature-on state; the gate is additionally red for the `sccache` reason above. |
| 2 | All backend access routes through the tool-door client; zero direct service HTTP clients | agent-core | **STRUCTURAL** (primary) + **TRIPWIRE** (secondary) | **Primary, compiler-enforced:** the egress handle is a **private field** on the module's state with an accessor visible only inside the module (`pub(in crate::aperture)`). No caller outside the module can reach it, and that holds for code not yet written. **Also structural:** the `aperture` feature adds **no runtime dependency** — the manifest change is the feature declaration plus one *dev*-dependency, so the module introduces no new HTTP-client crate to the shipped binary. **Secondary tripwire:** a source scan rejects a named list of client spellings. **Its limit, stated:** a name list is an enumeration. An alias, a re-export, a differently-named client, a raw socket, or a crate nobody thought of all pass it. It proves those specific spellings are absent — **not** that all backend access goes through the tool door. The structural evidence is what carries this criterion; the scan is a regression alarm. |
| 3 | Secrets accessed via the secret manager, not environment reads | agent-core | **TRIPWIRE** + **REVIEW** | A source scan finds zero occurrences of the direct environment-read spellings anywhere in the module's shipping half, which subsumes the token-, key-, password- and secret-shaped names the rule is about. **Its limit:** the scan proves those spellings are absent; that the module reads no secret **at all** is a claim about its 4 files, established by reading them, not by the scan. |
| 4 | Inference addressed by named proxy only; no model, engine or backend name in code | agent-core | **TRIPWIRE** | A source scan rejects a list of model ids, engine names, backend tags and size suffixes. **Its limit:** it catches the names on the list. A model name nobody enumerated would pass. The module currently issues no inference call at all, which is the substantive reason this holds. |
| 5 | An unreachable door degrades to `unavailable`, never a crash | agent-core | **LOCAL** (behavioural tests) | State construction with no door is infallible and reports the capability `unavailable` with a reason; the readiness route answers `503` problem details naming the capability; the router builds with no door present. Exercised through the real router. **Not gated:** these tests live behind the `aperture` feature, which no gate can select (`TERM #593`). |
| 6 | **`docs/BFF-PLACEMENT.md` carries the gate-attribution table and links the merged agent-core PR id** | **Aperture (this repo)** | **REVIEW** | **UNSATISFIED as of this commit.** The table is present; the **merged agent-core PR link is not** — see "The agent-core change this document describes" below, which carries a branch and a commit SHA and an explicit placeholder. A branch name and a commit SHA are **not** a merged-PR link. **This PR is not mergeable in this state**, by the rule in "Merge order" below. |
| 7 | No hardcoded infrastructure value in new/modified code; all existing tests still pass | agent-core | **TRIPWIRE** + **LOCAL** | A source scan rejects a literal address, scheme, or filesystem path in the shipping half of every module file, and a behavioural test asserts no response body carries one. **The scan's limit:** it is a pattern list — a dotted quad, two URL schemes, two path prefixes. An internal hostname without a scheme, or a port on its own line, would pass it. The response-body assertion is the stronger half, because it tests what actually reaches a client. **"All existing tests still pass":** LOCAL for the feature-on suite; GATED for the default-feature suite modulo the four pre-existing failures. |
| 8 | README documents the BFF and its feature flag | agent-core | **REVIEW** | The agent-core `README.md` gains an "Aperture BFF" section in the same change set. Nothing mechanical checks that prose is accurate; a reviewer does. |

### What this PR cannot prove — stated plainly

Criteria **1, 2, 3, 4, 5, 7 and 8** are **not testable from this repository at all**. There is no
Rust code here, the CI here does not build the agent core, and no gate here can observe a cargo
feature, a Rust visibility rule, or an HTTP response from the agent core's server. Any impression
that a green pipeline on this PR says something about them is false, and this paragraph exists so
that nobody has to infer that from the table.

Concretely, this repository's gate can check that this file exists, that it is well-formed, that
it contains no infrastructure identifier, and that it names an agent-core commit. That is the
whole of it.

And it does **not** stretch to criterion 6 either, until the link below is filled in: a document
that promises a link and carries a placeholder proves the promise, not the link.

### Merge order

1. The **agent-core** PR merges **first**. It carries the module and every behavioural criterion.
2. This PR merges **second**, and its body states: *"this PR proves only the documentation
   criterion; behavioural criteria are proven by agent-core PR #N."* **An Aperture-side PR that
   does not link a merged agent-core PR is not mergeable** — that is a review rule, and the
   reviewer applying it is the gate.

### The agent-core change this document describes

- Repository: the agent core (`lumina-constellation`), crate `lumina-core`
- Branch: `APTR-05-aperture-bff`
- Head commit: `8670bd1cbd6376bd34f7503e6ecff34451228ca6`
- Merged PR: **NOT YET LINKED — criterion 6 is UNSATISFIED and this PR is NOT MERGEABLE.**

> **Blocking placeholder, deliberately left in.** The agent-core PR does not exist yet: that
> branch has not been gated. The link is filled in **after** the agent-core PR merges, and only
> then does criterion 6 become satisfied and this PR become mergeable. Replacing this block with
> a branch name, a commit SHA, or an unmerged PR number does **not** satisfy it — the criterion
> names a *merged* PR id, because the whole point of the merge order is that the behavioural
> criteria are already proven when this document claims they are.
>
> A reviewer who finds this paragraph still present is looking at an unmergeable PR, and that is
> the intended reading, not an oversight.

---

## Contract conformance notes

Three things were found while implementing against the merged v1 contract for the first time.
They are recorded here rather than fixed silently, because the contract is normative and an
implementation that quietly diverges from it is the failure mode the contract exists to prevent.

1. **A method mismatch on a known route has no error class.** The taxonomy has no `405` URN, and
   the shared conventions say every failure is problem details without exception. As implemented,
   an unknown path answers `not-found` for every method, but a wrong method on a *known* route
   (say a `POST` to the health route) is answered by the web framework with a bare `405` and no
   body. Either the contract should name the class such a request maps to, or it should say that
   `405` is the one status served without a body. It should not be left to each implementer.

2. **The catch-all needs the trailing-slash form spelled out.** `/v1/aperture/` — the prefix with
   a bare trailing slash — is a distinct path from the prefix itself and from any deeper path, and
   a routing layer will not necessarily treat it as "under the prefix". It is worth one sentence
   in the contract saying that the prefix, the prefix with a trailing slash, and anything deeper
   all answer in problem-details form, because an implementation that misses it produces exactly
   the bare 404 the contract is trying to abolish.

3. **`GET /ready` reports capabilities in two different shapes.** Success is a `Readiness` body;
   failure is a `Problem` with a `capabilities` member. That is correct and deliberate — it is
   what keeps "every error is problem details" true — but it means a client parses the same
   information two ways on the same route. Worth an explicit note in `aperture-errors-v1.md` so
   the next implementer does not "simplify" it back into one shape.
