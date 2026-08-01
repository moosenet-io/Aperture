# Contributing to Aperture

Thank you for looking. Before you write anything, read this file and
[docs/PIPELINE.md](docs/PIPELINE.md). Aperture has a small number of constraints that are
genuinely non-negotiable, and a change that violates one is rejected on that basis alone — no
matter how well it is written. They are listed below so nobody discovers them at review time.

Every rule here traces back to a work item in [specs/](specs/). The item ids are cited so you
can read the rationale rather than take the rule on faith.

---

## The route a change takes

There is one route, and it is the same for a one-line fix as for a new module:

> tracked work item → isolated worktree → implement → test gate → independent review gate →
> merge → post-merge gate → verify → docs → cleanup

**The gates are not bypassable.** Not for a typo fix, not for a revert, not under time
pressure. If a gate is failing and you believe it is wrong, prove it is wrong against the
source and say so — do not route around it. The full stage-by-stage description, including
what the post-merge gate does and why it is treated as part of the merge rather than a step
after it, is in [docs/PIPELINE.md](docs/PIPELINE.md).

`main` is protected: force-push and deletion are blocked, and direct push is restricted to the
merge-queue identity. Work on a branch, open a pull request.

---

## The non-negotiable rules

### 1. Contract first (APTR-06)

The versioned client↔backend API contract in [contracts/](contracts/) is the source of truth,
not a description of the code. **A change to the contract lands before the code that
implements it**, and both the client and the backend are written against the contract rather
than against each other.

If you find the code and the contract disagree, that is a defect in the code even when the
code is the thing that works. Fix the code, or change the contract deliberately and version it.

### 2. One door

All backend access goes through the client SDK into the sanctioned door. A direct HTTP client
against a service, a raw forge or tracker API call, a second transport "just for this one
case" — all rejected. A second access path is unaudited by definition, and being well-written
does not make it audited.

### 3. Named proxies only

Inference is addressed by **logical route** (`lumina-fast`, `lumina-deep`). A model id, engine
name, backend tag, or size suffix must never appear in client or backend-for-frontend code.
The routing decision belongs to the inference layer. Hardcoding a model there silently pins
behaviour that the operator is supposed to control.

### 4. No hardcoded infrastructure values

No addresses, internal hostnames, ports, organisation paths, emails, credentials, or absolute
paths containing a username — in source, config, tests, **or documentation**. Configuration is
referenced by environment-variable *name*; secrets resolve at runtime from the vault and are
never written to a file in any form.

Product and platform names (Aperture, Lumina, Muse, Windows, macOS, iOS) are fine. This is
scanned mechanically on every change, and again before anything is published.

### 5. No runtime external fetch (D5)

No telemetry, no analytics, no external CDN, no remote fonts, no phone-home. The build fails if
an external origin appears in a bundle. There is exactly **one** carve-out, recorded in
[specs/S128-DECISIONS.md](specs/S128-DECISIONS.md): click-to-load remote images in rendered
markdown — user-initiated, default-off, never preloaded, and the user is told what will be
fetched before it is fetched. Any further carve-out requires an operator decision written into
that file. Do not add one in a pull request.

### 6. No vendoring (APTR-04)

Prior art was studied closely and good ideas are credited generously. **No upstream client
source is imported.** Do not copy a component, a hook, a parser, or a stylesheet from another
project into this tree. A dependency with an incompatible licence is vendoring with extra
steps and is gated the same way (APTR-106).

### 7. Design-system adherence (APTR-02)

Aperture uses the shared constellation design system and nothing else: token-based CSS custom
properties, the deep-space violet palette, glow as the elevation system, node-dot iconography.

**There is no Tailwind and no parallel palette.** An adherence lint fails the build on inline
styles, hardcoded colour literals, and stray style blocks. If a token you need does not exist,
add the token — do not reach for a literal. See [docs/BRAND.md](docs/BRAND.md).

### 8. Every user-visible string goes in the catalogue (APTR-100)

No user-facing string is written inline in a component. Strings live in the central catalogue,
alongside the loading, empty, error, and progress primitives. This is what makes the interface
consistent and what makes translation possible later rather than never.

### 9. Attribution comes from provenance, never from content (D9)

Every event and stored message carries an `origin` discriminator: `assistant`, `tool`,
`system`, or `user`. Clients derive visual attribution **from `origin` only**. A tool result
can never be rendered as, or coalesced into, an assistant message, regardless of what bytes
the tool returned. This is prompt-injection containment; treat it as a security boundary,
because it is one.

### 10. The README lands with the change (rule 7 of the build contract)

If your change adds, renames, or materially alters a user-facing feature, the README and docs
update is in the **same** change set. Not a follow-up, not "when someone remembers". A public
repository shipping code ahead of the documentation that describes it is a defect.

---

## Practical notes

### Setup

```bash
npm --prefix client ci
npm --prefix client run build      # tsc --noEmit && vite build
npm --prefix client run test
npm --prefix client run lint:adherence
```

Full setup, including per-target installation, is in [docs/INSTALL.md](docs/INSTALL.md).
Configuration keys are listed by name in [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

### Before you open a pull request

- Tests and the build pass locally.
- The adherence lint passes.
- No infrastructure value appears in anything you touched — including comments and docs.
- No secret-shaped environment read bypasses the secret manager.
- The README is current for anything user-facing you changed.
- The licence field in the client manifest still matches [LICENSE](LICENSE). They are checked
  against each other, not assumed to agree (APTR-105).

### Reviews

Review findings are checked against the source before they are acted on. A reviewer sometimes
sees only part of a diff and reports that something is missing when it lives in a file outside
their view. A finding disproven in the tree is not a gate — say so, and show where.

Equally: an infrastructure artifact such as a reviewer timeout is not a verdict. It is re-run,
never recorded as a pass and never allowed to deadlock a merge.

### Commits and branches

One branch per work item, branched from a fresh `main`, named for the item. Commit messages
lead with the item id — `feat(aperture): APTR-42 — short description`. Commit incrementally;
a reviewable history is worth more than a tidy one.

---

## Security

Do not report a security defect through a pull request or a public issue. See
[SECURITY.md](SECURITY.md) for the private reporting path.

## Licence

By contributing, you agree that your contributions are licensed under the MIT Licence, the
same terms as the rest of the project. See [LICENSE](LICENSE).
