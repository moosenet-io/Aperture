# How changes reach `main` — and the public mirror

Every change to this repository goes through the same pipeline. **There is no informal path
and no exception for small changes.** A one-line fix takes the same route as a new module.

The only things outside this pipeline are operational actions that touch no source: a service
restart, a host config edit, secret rotation, disk cleanup.

---

## The stages

```
ground → ingest → worktree → implement → test gate → review gate
      → merge → POST-MERGE GATE → verify → docs → cleanup
                                                   ↳ once per build: epic capstone
```

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
are blocked.

**7. THE POST-MERGE GATE — not optional.**

> The moment a merge succeeds, the post-merge gate runs. It performs the public mirror and the
> knowledge-graph refresh. **Treat "merged" and "mirrored + graph refreshed" as one indivisible
> action**, the way you would a commit and its tests.
>
> **A merge reported without the gate's outcome is an incomplete report.** Name the repo and
> say what the gate returned. An unrun gate and a gate that reported a problem are both
> "not done" — neither is success.

This is a hard gate rather than a reminder because it was documented for a long time and still
got skipped: an agent merges, reports success, moves on, and the public mirror silently drifts
behind for days before anyone notices. Anything depending on someone remembering a final step
eventually does not happen.

**8. Verify.** Tests pass on `main` after the merge. A branch that was green can still break
on `main`; that is what this catches. Fix forward via a hotfix branch — never revert `main`.

**9. Docs.** The in-repo README and docs are confirmed current for what just landed. This runs
**before** the mirror so the public repository never ships code ahead of the documentation that
describes it.

**10. Cleanup.** Worktree removed, branches deleted. At sprint end, a sweep removes every
merged, clean worktree and **leaves any unmerged or dirty one intact**, reported rather than
silently destroyed.

---

## The public mirror

This repository is flagged `mirror_ready`, so mirroring is **mandatory on every merge**, not
best-effort.

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

The per-merge documentation obligations are the cheap ones: the in-repo README check and the
knowledge-graph refresh.

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
