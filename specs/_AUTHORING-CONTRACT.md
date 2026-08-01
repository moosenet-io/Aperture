# Spec-authoring contract for the S128 Aperture epic (read before writing any sprint file)

This file is internal scaffolding for the authoring agents. It is NOT a deliverable spec.

## Read these first, in this order
1. `specs/S128-aperture-epic.md` — the epic: architecture, gate justification, channel policy,
   module/soul contract compliance, sprint map, pipeline obligations.
2. `specs/S128-A-aperture-foundation.md` — the **canonical template**. Match its structure,
   depth, and tone exactly. Every item in your sprint should be as thoroughly enriched as
   APTR-01 through APTR-11 are.
3. `contracts/` — if a contract file already exists, code your items against it rather than
   inventing a parallel shape.

## Non-negotiable format rules
- File starts with: title line, then `plane_project: APTR`, `module: Aperture`,
  `prefix: APTR`, `spec_id: S128-aperture-client`, then a `## Metadata` block that includes
  **North-Star layer**, **Module-Contract**, **Assistant-Layer Soul Contract**, and **Context**.
- Then a `## Pre-flight` block.
- Then items as `### APTR-NN: title` with, in this order:
  `- **Priority:**` (Critical/High/Medium/Low), `- **Labels:**`, `- **Agent:**`
  (claude/codex/gemini/vector/opus/<operator>/any), `- **Estimate:**`, `- **Description:**`
  containing inline `## FILES`, `## APPROACH`, `## TEST PLAN`, `## EDGE CASES`, then
  `- **Acceptance criteria:**` as a checkbox list of 3–8 testable criteria.
- Documentation items use `## AUDIENCE`, `## OUTLINE`, `## SOURCES`, `## TONE` instead, with
  `- **Type:** documentation`.
- Human-action items use `- **Type:** human-action` and a `- **Steps:**` list; no enrichment
  sections, no acceptance-criteria checkboxes.
- Use `- **Blocked by:** APTR-NN` where a real dependency exists. Do not invent dependencies.

## Every code item's acceptance criteria MUST include
- [ ] No hardcoded infrastructure values in new/modified code
- [ ] All existing tests still pass
- [ ] (if the item adds/renames/changes a user-facing feature) README updated to document it
- [ ] (if the item touches secrets) Secrets accessed via the secret manager, not env vars

## Every code item's TEST PLAN MUST include
- A line verifying no hardcoded IPs, hostnames, or org names in new/modified files
- At least one explicit **negative** test

## HARD SECURITY RULES — a violation makes the spec rejectable
- **No literal IP addresses, internal hostnames, internal domains, ports, internal org paths,
  emails, personal names, API keys, tokens, or absolute paths containing a username.**
  Anywhere. Use env-var NAMES (e.g. `APERTURE_SESSION_SIGNING_KEY`) and repo-relative paths.
  This repo mirrors publicly.

  **CLARIFICATION (ruling, 2026-08-01).** The rule targets *infrastructure identifiers* — the
  things that would let a reader locate or reach the fleet. It does **not** ban names.
  Explicitly PERMITTED, and expected, in specs and docs:
  - **Product and module names:** MooseNet, Lumina, Aperture, Muse, Harmony, Terminus, Chord,
    Engram, Atlas. These already appear throughout the public mirrors and the published design
    system. Do not obfuscate them.
  - **Platform, standard, and vendor-neutral technical terms:** Windows, macOS, iOS, Android,
    Safari, Chromium, Tauri, Vite, `apple-touch-icon`, "Add to Home Screen", VAPID, WCAG, SSE.
  - **Public package and licence names.**
  Explicitly FORBIDDEN, and the actual target of the rule:
  - Any address that resolves to fleet infrastructure — an IP, an internal hostname, an
    internal domain, a `host:port`, or an internal forge/tracker URL.
  - Container/host identifiers (e.g. a `CT###`-style tag), operator names, operator emails.
  - Any credential value, or an absolute path containing a username.
  If in doubt: would this string help a stranger reach or identify the operator's machines?
  If yes, it is forbidden. If it only names a product or a public standard, it is fine.
- **File paths are repo-relative only.** Never a forge URL, never `/home/<user>/...`.
- **Secrets** are read via `SecretManager::get()` / `vault::manager().get()`. Never
  `std::env::var` for anything token/key/password/secret-shaped. Never a value in a file.
- **Single door.** All backend access goes through `terminus-client` → Terminus. Never a
  direct HTTP client against a service URL, never raw forge/Plane API calls, never a second
  access path. An item whose approach builds one must be rewritten.
- **Chord is addressed by NAMED PROXY only** (e.g. `lumina-fast`, `lumina-deep`). Never a
  model id, engine name, backend tag, or size suffix in client or BFF code.
- **No third-party client source may be vendored.** Ideas may be cited; code may not be copied.
- **No telemetry, no analytics, no external CDN/font/asset fetch at runtime.** Ever.

## Behavioural rules specific to this epic
- **Matrix is RETAINED and first-class.** Nothing in any sprint removes, deprecates, or
  degrades it. Aperture is an addition.
- **Telegram** is promoted from feature-gated to a selectable, documented option, **off by
  default**. The adapter largely exists already — expose and document it, do not rewrite it.
- **Signal is a STUB ONLY**: adapter skeleton, capability descriptor reporting `unavailable`,
  config key names, and a test asserting it stays inert. **No account provisioning, no phone
  registration, no credential handling, no live send/receive.** An item that does any of that
  is out of scope and must not be written.
- **Continuity clause:** no item may reset assistant memory, personality traits, or
  relationship lore. Where an item touches identity or session, add an explicit negative test
  asserting continuity survives.
- **Presence budget:** Aperture must not grow an independent notification tray. Any
  notification/push work is a *transport* for the assistant's existing prioritized presence
  budget, honoring quiet hours and opt-out.
- **Assistant-operable parity:** any user-facing module action must also be invocable by the
  assistant as a tool, not only as a button.

## Pipeline obligations to reflect in items where relevant
- Ground in the Atlas knowledge graph (`kg_query`/`kg_search`/`kg_neighbors`/`kg_subgraph`)
  and consult `kg_rules` for the scope before implementing. For risky items (auth, streaming,
  packaging, module runtime) also run `cortex_scope` pre-change and record a `cortex_review`
  risk score in the PR body.
- Test gate runs through the compiler tool, not ad-hoc cargo on a shared host.
- Review gate runs through `review_run` — the single review door.
- The post-merge gate (public mirror + KG refresh) is indivisible from the merge.
- `docgen_run` is capstone-gated — never wire it per-merge.
- Never force-push a diverged mirror; surface `needs_operator_rebaseline`.

## Sizing
Aim for the item count stated for your sprint in the epic's sprint map. Keep each item at
≤8h and ≤8 acceptance criteria; split rather than over-scope. Number items strictly within
your assigned range so the sprints compose without collision.
