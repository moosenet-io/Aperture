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
| `crates/lumina-core/src/aperture/mod.rs` | The mount, the contract version and its response header, the correlation-id helper, the closed route-identity enum, the log sanitizer, and the Rust source-scan gates |
| `crates/lumina-core/src/aperture/routes.rs` | The `/v1/aperture` route table: `health`, `ready`, `version`, the prefix-scoped catch-all, and a method-not-allowed fallback on each route |
| `crates/lumina-core/src/aperture/state.rs` | Shared state; the outbound door as a private handle with no accessor; the bounded, single-flight reachability probe behind the capability report |
| `crates/lumina-core/src/aperture/error.rs` | The single error type and its closed RFC-9457 problem-details representation |
| `crates/lumina-core/Cargo.toml` | The `aperture` feature (implies `http`) |
| `crates/lumina-core/src/lib.rs`, `src/main.rs` | The feature-gated module declarations |
| `crates/lumina-core/src/http_server.rs` | The feature-gated mount on the existing server |
| `README.md` | The BFF and its feature flag, documented where an operator will look |

### What it ships behind the flag

The three unauthenticated `meta` operations the contract declares with `security: []` —
`GET /v1/aperture/health`, `GET /v1/aperture/ready`, `GET /v1/aperture/version` (the contract
version only) — plus a catch-all so that **every other path under the prefix** answers in
problem-details form, and a method-not-allowed fallback so that a wrong method on a route that
*does* exist does too, rather than the bodiless `405` a router emits by default. The `auth`,
`threads`, `stream`, `attachments`, `modules`, `events`, `settings` and `admin` groups are later
items; until they exist, those paths honestly report `not-found` rather than a bare 404 or a
panic.

### The properties it holds, and how

- **One door.** Every backend capability is reached through the agent core's in-process
  `terminus-client` wrapper. The handle is a private field of the **`state` module**, so nothing
  outside that module and its descendants can obtain it — that much the Rust compiler enforces
  (D8), rather than a lint in another language. **Separately**, and as a fact about the code
  rather than a compiler guarantee, no accessor exists today, so a later item needing a backend
  call adds a method to the `Door` trait rather than receiving the client. A source scan
  additionally rejects a list of known client spellings; that scan is a regression tripwire, not
  the proof, and criterion 2 below states exactly what the compiler does and does not cover.
- **Named proxies only.** No model id, engine name, backend tag or size suffix appears in the
  module.
- **No secrets of its own.** The module performs no environment read of any kind; the door is
  *read* from the process rather than constructed, so credential handling stays in one place.
- **Degraded, never fatal — and continuously, not just at startup.** Nothing is probed at
  construction; readiness is answered from a **bounded-TTL reachability sample**, so a door that
  is unconfigured, unreachable, or newly recovered is reflected as such within a bounded lag,
  in both directions. In every degraded case the capability reports `unavailable` with a vetted
  reason and `GET /v1/aperture/ready` answers `503` in problem-details form, while the agent core
  keeps serving its other channels. The probe is single-flight, survives cancelled requests, and
  cannot be wedged by a panicking probe. **The lag is real and deliberate:** a cached success can
  hold `/ready` at `200` for up to one TTL after the door dies, so this is a bounded-staleness
  signal and not a liveness check.
- **Redaction of response bodies, enforced by type rather than by filtering.** Every member of a
  problem-details body is either a compile-time constant or a value this process generated:
  `detail` is constant per error class, `instance` is a **closed route-identity enum** with no
  constructor that accepts a string, and a capability's `reason` is a **closed enum** of vetted
  text. Nothing a client sent — path, header — and nothing an upstream said can be serialized
  into a body at all. The problem object is closed, and the serialization-failure fallback
  carries the true status and the same correlation id rather than a hardcoded guess.
- **Operator logs are a weaker boundary than the response bodies, and the difference is real.**
  An earlier revision of this document claimed every free-form log line is correlation-keyed and
  sanitized. That is **not** what merged `8aec7ca` does, and the accurate position is worth
  stating precisely, because "the sanitizer exists" is not the same as "every logging site uses
  it". Of the module's five logging sites:
  - two — both in the error path — are keyed by the `correlation_id` the response echoes, and the
    client-derived text reaching them (request path, method) is sanitized at the call site to a
    bounded printable subset before it is passed;
  - two are fixed strings with no interpolated data;
  - one, the tool-door probe-failure line, interpolates the **upstream error verbatim**: not
    sanitized, not length-bounded, not correlation-keyed. It is upstream-controlled text, so it
    can carry control characters — the log-forging and flooding shape the sanitizer exists to
    prevent — and it can carry infrastructure identifiers into the log.

  **No part of this reaches a client**: response bodies are unaffected, and the body-redaction
  guarantee above still holds without exception. It is a log-hygiene defect, not a disclosure one.
  It is **filed as its own work item against the merged code** rather than fixed here, because
  this is a documentation change and the code has already landed and been gated.
- **No CORS header, ever**, on any response under the prefix.

---

## Gate attribution

**This is the part of this document that does the work.** The item spans two repositories, and
**the Aperture-repo PR's gate can exercise none of the behavioural criteria** — every one of them
is a property of Rust code that lives in the agent-core repository. Without this table an
Aperture-side PR merges green while proving nothing, which is a defect that has already happened
once on this item.

**This change proves exactly one criterion: the documentation one.** Everything else is proven by
the agent-core PR, which merged **first** — `moosenet/Lumina` #247.

That was not true for most of this document's life, and the history is worth keeping as history.
Criterion 6 requires a **merged** agent-core PR id, so until #247 existed the criterion was held
deliberately open with a blocking placeholder, and this change was marked not mergeable in its
own text. A placeholder was the right call precisely because the alternative — describing
behavioural criteria as proven before the code proving them had landed — is the failure this
criterion exists to prevent. The placeholder has since been redeemed rather than removed.

### Evidence classes — read this before the table

A table that says "gated" where it means "ran on a laptop" is the same drift this whole item
exists to prevent, so every row below is labelled with **how** its evidence was obtained, not just
what it claims:

| Class | Meaning |
|---|---|
| **GATED** | Proved by the fleet compiler tool — pinned toolchain, capped scope, single build door. This is the only class that is evidence in the process's own sense. |
| **LOCAL** | Proved by a run on the developer host. Real output, real pass/fail, but not the sanctioned gate: not the pinned toolchain, not reproducible on demand by a reviewer, and not recorded by the build system. |
| **STRUCTURAL** | Proved by the language rather than by a run — typically a visibility rule the compiler enforces. Strongest where available, because it holds for code nobody has written yet. It is only ever as broad as the rule it rests on, so a structural claim must state its scope; see criterion 2. |
| **TRIPWIRE** | A lexical scan over a named token list. It catches the mistake it enumerates and **nothing else**. It is not proof of a general property; it is a regression alarm for a specific known-bad spelling. |
| **REVIEW** | Proved, if at all, by a human reading it. |

**How a claim in this table was checked, and how that method failed once.** Claims were verified
against the merged tree rather than against the branch they were written alongside. For a
"nothing does X" claim that is not enough on its own: an earlier revision asserted that all
free-form log text is sanitized, and the check was a grep confirming the sanitizer **exists** and
is called. It does and it is — but presence of the safe helper only shows the safe path exists,
never that every site takes it, and one logging site did not. The reliable method for a negative
claim is to **enumerate every site that could violate it and show each one does not**, which is
what the log-boundary bullet above now reports. This is the same presence-is-not-reachability
error that was this item's very first review finding, reappearing in the verification method
rather than in the code.

Two facts constrain what could be GATED at all, and both are recorded rather than papered over:

- **The compiler tool has no cargo-feature argument** (`TERM #593`). Its inputs are module, ref,
  mode, profile, target, bin, host, source_dir, request_id — nothing selects a feature. It is
  therefore **structurally incapable** of exercising the `aperture` feature, and every
  feature-on result below is LOCAL by necessity, not by shortcut. This blocks every
  feature-gated item in the fleet the same way.
- **The compiler gate was intermittently red for an infrastructure reason** unrelated to this
  change: runs died in dependency compilation with `sccache: Failed to create temp dir`
  (exit 254), one build's scratch directory being removed while another used it as `TMPDIR`.
  It was reproduced on `main` as well as on the item branch, so it was an infrastructure
  artifact rather than a verdict. **That outage has since cleared** and the run cited below is
  a clean one.

The gate run cited in the table was taken **after the merge, against `main`**, so it describes
the code that actually landed rather than an intermediate branch head. It ran the
**default-feature** suite: **4753 passed, 4 failed**. The four are two pre-existing tests counted
across two test binaries — `engram::resurfacing::tests::ledger_save_failure_suppresses_callbacks`
and `presence::tests::tick_budget_persist_failure_skips_send_no_consume` — both unrelated to
Aperture, both passing locally, and both failing identically on `main` before this item and after
it. With the feature off this change compiles no new code at all, which is why that is the
expected result rather than a concerning one.

### The table

| # | Acceptance criterion | Proving repo | Class | Evidence, and its exact limit |
|---|---|---|---|---|
| 1 | The BFF module compiles with and without the `aperture` feature | agent-core | Feature-off: **GATED** + **LOCAL**. Feature-on: **LOCAL only** | **GATED, on the merged commit:** the compiler tool built and ran the default-feature (feature-**off**) suite against `main` after the merge — 4753 passed, 4 failed, those four being the two pre-existing unrelated tests described above. That is the whole of what a gate has touched on this criterion. **LOCAL:** feature-on and feature-off builds both complete with no warning from the module; the feature-off binary contains **zero** occurrences of the route prefix and the feature-on binary contains it; the feature-on suite is 5304 passed, 0 failed, of which 52 are this module's own tests. **Not gated, and why:** the compiler tool cannot select a cargo feature at all (`TERM #593`), so no gate can observe the feature-on state — the 52 module tests have never run under a gate and cannot until that is fixed. |
| 2 | All backend access routes through the tool-door client; zero direct service HTTP clients | agent-core | **STRUCTURAL** (primary, narrow) + **TRIPWIRE** (secondary) | **What the compiler strictly guarantees:** *nothing outside the **`state` module** can obtain this state's door handle.* The boundary is the **module**, not the file. Rust privacy has no notion of files: a private item is visible to its module **and every descendant module**, which need not live in the same source file. Today that module is one file, so file and module coincide — but that is a convention, not the guarantee, and `state`'s own `#[cfg(test)] mod tests` is a live in-tree example of a descendant reading the private field directly, with no visibility change and no complaint from the compiler. **Separately, and as a verified fact about the code rather than a compiler guarantee:** no accessor exists today — checked against the merged tree, zero hits — so a later item needing a backend call adds a method to the `Door` trait rather than receiving the client. **These two are not the same guarantee and are deliberately not merged into one sentence:** "the compiler prevents this" and "nobody has written it yet" fail differently, and conflating them is the error this item spent five review cycles unlearning. **What neither covers — see "The two limits" below.** **Secondary tripwire:** a source scan rejects a named list of client spellings. **Its limit:** a name list is an enumeration. An alias, a re-export, a differently-named client, a raw socket, or a crate nobody thought of all pass it. It proves those specific spellings are absent — **not** that all backend access goes through the tool door. |
| 3 | Secrets accessed via the secret manager, not environment reads | agent-core | **TRIPWIRE** + **REVIEW** | A source scan finds zero occurrences of the direct environment-read spellings anywhere in the module's shipping half, which subsumes the token-, key-, password- and secret-shaped names the rule is about. **Its limit:** the scan proves those spellings are absent; that the module reads no secret **at all** is a claim about its 4 files, established by reading them, not by the scan. |
| 4 | Inference addressed by named proxy only; no model, engine or backend name in code | agent-core | **TRIPWIRE** | A source scan rejects a list of model ids, engine names, backend tags and size suffixes. **Its limit:** it catches the names on the list. A model name nobody enumerated would pass. The module currently issues no inference call at all, which is the substantive reason this holds. |
| 5 | An unreachable door degrades to `unavailable`, never a crash | agent-core | **LOCAL** (behavioural tests) | Readiness reflects a **probed** door, not a configured one: a door that is present but does not answer a bounded probe reports `unavailable`, distinguishably from one that was never activated, and `/ready` answers `503` problem details naming the capability. The reported state moves in both directions, so a door that dies degrades and one provisioned later recovers without a restart. The probe is single-flight and survives its waiters: a burst produces one probe, dropped requests do not each start another, and a **panicking** probe cannot wedge the flight slot — an RAII guard clears it on unwind, and a test asserts the capability recovers afterwards rather than merely re-probing. **Its limit, and it is deliberate:** a cached success can keep `/ready` at `200` for up to one probe-TTL after the door dies. That is inherent in bounded staleness, is documented in the module, and is not a defect to be closed by probing per request. **Not gated:** these tests live behind the `aperture` feature, which no gate can select (`TERM #593`). |
| 6 | **`docs/BFF-PLACEMENT.md` carries the gate-attribution table and links the merged agent-core PR id** | **Aperture (this repo)** | **REVIEW** | **SATISFIED.** The table is above; the merged agent-core PR is **`moosenet/Lumina` #247**, merged before this change, with the details in "The agent-core change this document describes" below. It was deliberately held open as an explicit blocking placeholder until that PR actually merged, because a document claiming behavioural criteria are proven, before the code proving them has landed, is the precise failure this criterion exists to prevent. |
| 7 | No hardcoded infrastructure value in new/modified code; all existing tests still pass | agent-core | **TRIPWIRE** + **LOCAL** | A source scan rejects a literal address, scheme, or filesystem path in the shipping half of every module file, and a behavioural test asserts no response body carries one. **The scan's limit:** it is a pattern list — a dotted quad, two URL schemes, two path prefixes. An internal hostname without a scheme, or a port on its own line, would pass it. The response-body assertions are the stronger half, because they test what actually reaches a client: hostile request paths and headers are fed in and asserted absent from the body. **"All existing tests still pass":** GATED for the default-feature suite on the merged `main` commit, modulo the two pre-existing unrelated failures; LOCAL for the feature-on suite. |
| 8 | README documents the BFF and its feature flag | agent-core | **REVIEW** | The agent-core `README.md` gains an "Aperture BFF" section in the same change set. Nothing mechanical checks that prose is accurate; a reviewer does. |

### Criterion 2 — the two limits, and one piece of evidence struck

The structural claim above is narrow on purpose. Two things it does **not** cover, recorded here
because they are the honest frame for the whole criterion rather than footnotes to it:

1. **The single-door property survives; the one-chokepoint property does not.**
   `terminus_egress::global()` is `pub` and is already called from several other modules in the
   agent core. The compiler does not prevent a future Aperture handler from calling it directly
   and bypassing this state entirely. Such a handler would still reach **the same single door**,
   so "all backend access goes through the tool door" is not violated by it — but "this state is
   the one chokepoint" is, and only the tripwire scan covers that.
2. **Visibility is enforced as declared, not as a rule — and a descendant needs no declaration
   at all.** Anyone editing the `state` module can widen the field or add an accessor, and the
   compiler will happily enforce the new, weaker declaration. Worse, and more easily missed: a
   future **child module** of `state` — `mod inner;` in `state.rs`, its body in `state/inner.rs`
   — inherits access to that private field with **no visibility change whatsoever**, so the
   widening leaves no diff a reviewer can grep for. What would detect that today is a
   **review of the `state` module**, which is why the access boundary
   and its limits are documented in that module's own doc comment rather than only here. A cheap
   mechanical backstop is available and not yet written: a source-scan assertion that the door
   field's declaration is followed by no accessor returning it, in the same style as the existing
   scans — a tripwire, with a tripwire's limits, but one that fails the build on the most likely
   accidental widening. It belongs with the module, so it is noted here and filed there, not
   claimed as evidence this document already has.

**One piece of evidence is struck from this criterion.** An earlier revision offered "the
`aperture` feature adds no new runtime dependency" as structural support, and the reviewing
coordinator endorsed it as "closer to the property than any name list". **It is not, and it is
withdrawn.** The agent core already carries a general-purpose HTTP client for reasons predating
Aperture, so the absence of a *new* dependency proves nothing about a second door: the capability
was already present, a second client is one `use` away, and only the lexical tripwire stands
against it. The statement was true and very nearly vacuous, which is the most dangerous kind of
evidence to leave in a table — it reads as load-bearing.

That correction came from the implementer re-deriving the claim on request rather than from the
review that asserted it, and is recorded here in those terms, because a table that quietly drops
a discredited row teaches nobody anything.

### What this PR cannot prove — stated plainly

Criteria **1, 2, 3, 4, 5, 7 and 8** are **not testable from this repository at all**. There is no
Rust code here, the CI here does not build the agent core, and no gate here can observe a cargo
feature, a Rust visibility rule, or an HTTP response from the agent core's server. Any impression
that a green pipeline on this PR says something about them is false, and this paragraph exists so
that nobody has to infer that from the table.

Concretely, this repository's gate can check that this file exists, that it is well-formed, that
it contains no infrastructure identifier, and that it names an agent-core commit. That is the
whole of it.

Criterion 6 is the one criterion this repository's gate **can** reach, and it is now satisfied:
the link below names merged PR `moosenet/Lumina` #247. While that link was a placeholder it was
not satisfied, because a document that promises a link and carries a placeholder proves the
promise, not the link — which is why it was held open rather than assumed.

### Merge order

1. The **agent-core** PR merges **first**. It carries the module and every behavioural criterion.
   **Done: `moosenet/Lumina` #247, merged.**
2. This PR merges **second**, and its body states: *"this PR proves only the documentation
   criterion; behavioural criteria are proven by agent-core PR `moosenet/Lumina` #247."* **An
   Aperture-side PR that does not link a merged agent-core PR is not mergeable** — that is a
   review rule, and the reviewer applying it is the gate. The rule was enforced on this very
   change: it sat blocked on an explicit placeholder until #247 landed.

### The agent-core change this document describes

- Repository: **`moosenet/Lumina`** on the internal forge, crate `lumina-core`
- **Merged PR: `moosenet/Lumina` #247** — *APTR-05: Aperture BFF module (feature-gated) in
  lumina-core*
- Branch: `APTR-05-aperture-bff`, head commit `46a782c80821a65a839d3c7321bb1c19cfd7ed7a`
- Merge commit on `main`: `8aec7ca`
- Review: five cycles, each of which found a real defect; the final cycle approved unanimously
- Post-merge: the public mirror serves the module (verified by fetching its content, not by
  comparing revisions) and the code knowledge graph was rebuilt

> **The repository is `moosenet/Lumina`, not `lumina-constellation`.** It was renamed; the old
> name survives only as a redirect that read requests follow and write requests fail on. Use the
> current name — this document previously carried the old one, which is the kind of detail that
> works when you click it and breaks when you script it.

---

## Contract conformance notes

Three things were found while implementing against the merged v1 contract for the first time.
They are recorded here rather than fixed silently, because the contract is normative and an
implementation that quietly diverges from it is the failure mode the contract exists to prevent.

1. **A method mismatch on a known route has no error class, and v1 needs one.** The taxonomy has
   no `405` URN, while the shared conventions say every failure is problem details without
   exception. Those two cannot both be satisfied with a declared URN *and* an accurate status.

   **What the merged implementation does**, since the earlier revision of this note described the
   defect rather than the fix: a wrong method on a route that exists (a `POST` to the health
   route, say) returns **problem details** with the **`validation-failed`** class — the closest
   *declared* class, a wrong method being a request that does not match the operation's documented
   contract — carrying the accurate **`405`** status, and the body's `status` member agrees with
   the response. Minting `urn:aperture:error:method-not-allowed` was rejected deliberately: it
   would satisfy the schema's URN *pattern* while breaking the taxonomy's closure, and a class no
   client switches on is indistinguishable from a broken server.

   **The contract gap is real and remains open.** v1 should either add the class or state
   explicitly that a method mismatch maps to `validation-failed` with a `405`. Until it does, an
   implementer either invents a URN or reproduces this compromise by reasoning, and the two
   implementations disagree. It should not be left to each implementer, which is the whole
   argument for fixing it in the contract rather than in each server.

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
