# How changes reach `main` — and the public mirror

Every change to this repository goes through the same pipeline. **There is no informal path
and no exception for small changes.** A one-line fix takes the same route as a new module.

The only things outside this pipeline are operational actions that touch no source: a service
restart, a host config edit, secret rotation, disk cleanup.

---

## The stages

```
ground → ingest → worktree → implement → test gate → review gate → merge
      → POST-MERGE GATE ─┬─ verify                                → cleanup
                         ├─ docs current                             ↳ once per build:
                         ├─ public mirror                              epic capstone
                         └─ knowledge-graph refresh
```

The post-merge gate is **one phase, not four stages.** Its four actions run in the order
shown, as a single indivisible unit with the merge. Nothing between the merge and the end of
that phase is a separate step you can report on, defer, or skip independently.

**0. Ground.** Before scoping or writing code, consult the project's knowledge graph for the
entities the change touches and their blast radius, and read the **learned rules** for that
scope — durable rules crystallized from recurring review findings, which tell you the mistakes
not to repeat *before* you make them. For risky changes (auth, streaming, packaging, the module
runtime) also take a whole-graph blast-radius reading first.

**1. Ingest.** A tracked work item exists in the `APTR` project before implementation starts,
created through the sanctioned tracker tool. If no formal spec exists, a thin ad-hoc item is
still created. "It's small" is not a reason to skip this.

**2. Worktree.** One isolated worktree per item, branched from a fresh `main`. Never shared
between agents, never the main checkout.

**3. Implement.** Follow the item's stated approach. Commit incrementally. If the item adds,
renames, or materially changes a user-facing feature, the README update lands in the same
change set — not later, not "when someone remembers".

**4. Test gate.** Submitted through the fleet's compiler tool, never an ad-hoc build on a
shared host. The gate runs tests, the PII scan, the secret-access scan, the build, and the
documentation check. All must pass before review is requested.

**5. Review gate.** A single call to the sanctioned review tool with an independent panel;
every provider must approve. Shelling out to a reviewer CLI directly is itself a rejectable
violation — it is an unaudited second door.

Two things worth knowing when you are on the receiving end of a review:

- **Verify a blocking finding against the source before acting on it.** Reviewers sometimes
  see only a partial diff and report "you didn't do X" when X lives in a file outside their
  view. A finding disproven in the tree is not a gate.
- **A lone `UNKNOWN` from an infrastructure artifact is not a rejection.** A reviewer timeout
  or a parse failure is not a finding. Do not deadlock a merge on one.

**6. Merge.** Through the sanctioned forge tool. `main` is protected: force-push and deletion
are blocked, and direct push is whitelist-gated to the merge-queue identity. See
[Branch protection](#branch-protection).

**7. THE POST-MERGE GATE — one phase, not optional.**

> The moment a merge succeeds, the post-merge gate runs. **Treat "merged" and "verified +
> documented + mirrored + graph refreshed" as one indivisible action**, the way you would a
> commit and its tests.
>
> **A merge reported without the gate's outcome is an incomplete report.** Name the repo and
> say what the gate returned. An unrun gate and a gate that reported a problem are both
> "not done" — neither is success.

This is a hard gate rather than a reminder because it was documented for a long time and still
got skipped: an agent merges, reports success, moves on, and the public mirror silently drifts
behind for days before anyone notices. Anything depending on someone remembering a final step
eventually does not happen.

Inside the phase, four actions run **in this order**:

**First — verify.** Tests pass on `main` after the merge. A branch that was green can still
break on `main`; that is what this catches. Fix forward via a hotfix branch — never revert
`main`.

**Second — docs current.** The in-repo README and docs are confirmed current for what just
landed. This runs **before the mirror push**, so the public repository never ships code ahead
of the documentation that describes it. It is not a later stage that happens to precede the
mirror — it is inside the same phase, ahead of it, by construction.

**Third — public mirror** (the fleet's *Stage 7d*). The PII-swept derivative is published. See
[The public mirror](#the-public-mirror) for the two failure modes and how to diagnose a
reported divergence.

**Fourth — knowledge-graph refresh** (the fleet's *Stage 7c*). Incremental, so the graph the
next task grounds against is never stale. Non-blocking: a failure here is logged and never
reverts a merge.

> **The fleet's stage letters are labels, not an execution order.** The knowledge graph is
> "7c" and the mirror is "7d", but the mirror runs first. Do not infer sequence from the
> letters — read the order above. Conflating the two is what produced the contradiction this
> section replaced.

**8. Cleanup.** Worktree removed, branches deleted. At sprint end, a sweep removes every
merged, clean worktree and **leaves any unmerged or dirty one intact**, reported rather than
silently destroyed.

---

## Branch protection

`main` is protected. The posture is declared in `.moosenet-pipeline.yaml` under
`branch_protection` and enforced by the forge:

| Property | Setting |
|---|---|
| Force-push to `main` | **Blocked** |
| Deletion of `main` | **Blocked** |
| Direct push to `main` | **Whitelist-gated** — the merge-queue identity only |
| Required signed commits | Off |
| Block merge on outdated branch | Off |

Everything else reaches `main` through a pull request merged by the sanctioned forge tool.
This is deliberate, and it applies to agents and to the orchestrator as much as to a human:
after protection is enabled, a direct push to `main` from an ordinary identity is refused.
That refusal is the feature working, not an outage. Push your feature branch and merge it.

**Protection is configured only through the sanctioned forge branch-protection tool** —
never by a raw forge API call, which is a second, unaudited access path and rejectable on
that basis alone. The call is **idempotent**: the first run creates the rule, every later run
with the same arguments updates it to the same state. Re-running it to confirm the posture is
safe, and is the correct way to verify.

The identity on the push whitelist is deliberately **not named in the config file**. The
config ships to the public mirror; the whitelist itself lives in the forge, which is the
source of truth. The `branch_protection` block records the intended *shape* so that a drift
between intent and reality is visible in review.

---

## The public mirror

This repository is flagged `mirror_ready`, so mirroring is **mandatory on every merge**, not
best-effort.

### Registration and how to check it

The repository is registered with the mirror engine and the public lineage is **established**
— it is not a pending bootstrap. Mirror credentials and the engine's own source/work roots are
host configuration resolved at runtime; none of it is committed here, and changing it is an
operations action, not a code change.

Aperture is a **full-history** repository (`mirror_engine: full_history`), which matters for
how you read its status. There are two mirror engines and they answer different questions:

| Engine | Status call | What it tells you |
|---|---|---|
| **Full-history** (the one that publishes Aperture) | `git_public_history_status` | `lineage_established`, `commits_behind`, internal vs mirrored commit counts. **This is the authoritative read.** |
| **Snapshot** (not used for this repo) | `git_public_mirror_status` | The snapshot work dir's own approval tags and drift |

Reading the *snapshot* status for a full-history repo produces a false alarm: it will report
outstanding commits and a `needs_prepare` state that mean nothing here, because a different
engine is doing the publishing. This has caused real mis-escalations. **Check
`git_public_history_status` first, and confirm against the published files themselves rather
than comparing commit hashes** — the mirrored history is a scrubbed replay, so its hashes are
expected to differ from internal ones.

Worse than a false alarm: escalating this repo through the snapshot path
(`prepare` → `approve` → `push`) mints a second, parallel lineage that can never fast-forward
onto what is already published. One engine per repository. Do not mix them.

What is published is not this repository's `main`. It is a **PII-swept derivative** with its
own lineage. Internal `main` is never pushed. That is what makes mandatory mirroring safe: a
tree containing internal values produces a swept derivative rather than blocking the pipeline.

### The two failure modes are not the same

| Result | Meaning | What to do |
|---|---|---|
| `withheld_residual_pii` | The PII gate did its job | **Never override, never escalate past it.** Fix the content or leave it withheld. A withheld mirror is a working gate, not a bug. |
| `needs_operator_rebaseline` | Public and internal lineage have diverged | Report it, name the repo, continue with other work. It blocks the mirror, not the merge. |

### Never force-push the mirror

A force-push destroys curated public history. The single sanctioned use of force is the
one-time, operator-blessed bootstrap that establishes shared lineage for a new repository.
Everything after that is fast-forward only.

**Diagnose a reported divergence before believing it.** The gate has cried wolf before. Check,
in order:

1. **Already at target.** Compare the remote head against the mirror's work head. If they are
   the *same commit*, there is no divergence — the "non-fast-forward" is spurious.
2. **Two lineages fighting.** There are two mirror paths, and they produce different histories.
   Escalating a full-history repository through the snapshot path mints a parallel lineage that
   can never fast-forward. **Use one path per repository.**
3. **Genuine replay drift.** Replay is deterministic given its marks state; if that state is
   lost, every replay mints new commit hashes. This is the case that legitimately needs an
   operator re-baseline — and the marks state must be fixed too, or it recurs.

---

## Documentation generation

The heavyweight documentation engine is **capstone-gated**. It fires once, at the end of the
Epic Review capstone, and only when the capstone verdict is approve. It is **not** wired to any
per-merge step, and adding it to one is a regression.

The per-merge documentation obligation is the cheap one: the in-repo README and docs check,
which runs inside the post-merge phase ahead of the mirror push.

## The knowledge graph and Cortex

The graph is the connective tissue, refreshed on **every** merge and **every** review pass, so
the next task never grounds against a stale picture. Reviews also write their findings back
onto it; recurring findings crystallize into candidate rules, which are promoted to active only
after an adversarial panel argues they are genuinely earned. Promotion to anything work-gating
is operator-blessed, never automatic.

Cortex contributes at both ends: a blast-radius reading before a risky change, and a risk score
after it, recorded in the pull request. At epic end, crystallization runs over everything the
reviewers caught during the build.

## The capstone

A build is not done when the last item merges. It is done when the Epic Review capstone has run
over the whole repository against these contracts with the full panel, **and its findings have
been triaged into tracked work items**. The capstone never edits code — it produces work.
