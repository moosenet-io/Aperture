# Aperture — The Lumina Constellation Rich Client (Epic Overview)
plane_project: APTR
module: Aperture
prefix: APTR
spec_id: S128-aperture-client

## Metadata
- **Author:** Operator (Moose)
- **Session:** S128
- **Date:** 2026-08-01
- **Lumina version:** constellation-wide
- **Module version:** Aperture v0.1.0 (new repo, `moosenet/Aperture`)
- **Estimated total:** ~340h autonomous agent work across 7 sprints
- **North-Star layer:** shell (with three module surfaces: assistant, Muse, Harmony)
- **Module-Contract:** meets §4 clauses 1–7 for every module surface Aperture hosts; see
  "Module Contract compliance" below. The shell layer itself is gated — see "Gate 2 justification".
- **Assistant-Layer Soul Contract:** all 4 clauses addressed; see "Soul Contract compliance".
- **Context:** Lumina today is reachable only through Matrix. That works, but it caps the
  experience at what a chat room can render: no rich media, no document management, no build
  surface, no first-class desktop or mobile app, and no way for anyone but the operator to
  meaningfully use the constellation. Aperture is the client layer that removes that cap —
  a single React codebase shipped as web, desktop (Windows + macOS), and installable PWA, over
  a thin Rust BFF inside `lumina-core`, reaching every capability through the one sanctioned
  Terminus door. Matrix is **retained as a first-class transport option**, never removed;
  Telegram is promoted from feature-gated to a selectable option; Signal is stubbed for later.

---

## Gate 2 justification (required for a shell-layer spec)

The north star gates shell/super-app work behind "≥2–3 modules visibly benefit from shared
context". That gate is met, and has been for two sprints:

| Module | Status | What shared context buys it |
|---|---|---|
| **Assistant (Lumina)** | LIVE — `lumina-core` on the agent host, Chord-backed inference, Engram memory | Can act on what the user is watching/building without being told |
| **Muse** (media) | LIVE — acquisition (S119), library scan + metadata (S119b), web surface (S120/S126/S127) | "Resume what I was watching" / "why did this grab fail" become assistant-operable |
| **Harmony** (build orchestration) | LIVE — spec ingest, dispatch, conductor, TUI, web surface | Spec ingest **from a chat transcript** is only possible when chat and build share a context bus |
| **Engram / Atlas KG** (memory) | LIVE — semantic memory, per-project code graph | Cross-module recall is the whole point of a bus |

Three shipping user-facing modules plus a memory layer, each currently siloed behind its own
surface (Matrix room, `harmony-web`, `constellation-web`). The cross-module wins are concrete
and named, not speculative: **spec-ingest-from-chat** (Harmony × assistant) and
**assistant-operable playback** (Muse × assistant) are both scoped as work items in this epic
(Sprint D). The gate is met on evidence, not ambition.

Sequencing discipline is preserved: Aperture does **not** rewrite the modules. Each module
already had to be standalone-excellent first (Module Contract clause 7), and each keeps its
existing backend. Aperture adds the shell and the context bus; it does not rescue anything.

---

## What Aperture is (and explicitly is not)

**Is:** a thin, rich client over the fat sovereign MooseNet backend. One React codebase, three
shipping targets, one API contract, one door.

**Is not:** a fork or vendoring of any third-party client. AnythingLLM was studied closely as
prior art and its *ideas* are cited where adopted (workspace→thread→message model, per-workspace
provider overrides, document-manager UX, agent-builder framing). Its **code is not imported**.
Two reasons, both load-bearing:

1. Its ~100k-LOC Express server reimplements what Chord already serves natively
   (`/v1/chat/completions`, `/v1/embeddings`, `/v1/rerank`, `/v1/audio/*`, `/v1/images/*`,
   `/v1/documents/parse`, `/v1/tools/*`, `/v1/agent/execute`) — and reimplements it *worse*,
   with no knowledge of GPU arbitration, keep-resident working sets, MINT sweeps, or idle reaping.
2. Its ~128k-LOC frontend is Tailwind-based and would collide head-on with the constellation
   design system landed across S126/S127.

**No third-party client source may be vendored into this repo.** An item whose approach imports
or copies upstream client code is rejected on that basis alone.

---

## Architecture

```
                        Aperture (single React + Vite + TypeScript codebase)
                        constellation design system tokens — NO Tailwind
   ┌──────────────────────┬──────────────────────────┬────────────────────────┐
   │  web                 │  desktop (Tauri v2)      │  mobile                │
   │  served by           │  Windows + macOS         │  installable PWA       │
   │  lumina-core         │  signed installers       │  (native later)        │
   └──────────┬───────────┴────────────┬─────────────┴───────────┬────────────┘
              │                        │                         │
              └────────────────────────┴─────────────────────────┘
                                       │  SSE + REST, one versioned contract
                                       ▼
                    Aperture BFF  (new, inside lumina-core, Rust)
                    /v1/aperture/{auth,threads,stream,attachments,modules,events}
                                       │
                                       ▼  terminus-client — THE ONE DOOR
                    ┌──────────────────┴───────────────────┐
                    │            Terminus (kernel)          │
                    └──┬─────────┬──────────┬───────────┬───┘
                       ▼         ▼          ▼           ▼
                    Chord     Harmony     Muse      Engram/Atlas KG
                  inference    build      media        memory
```

**Non-negotiable:** Aperture's browser/desktop/mobile bundles talk **only** to the Aperture BFF.
They never hold a backend secret, never call Chord/Terminus/Harmony/Muse directly, and never
open their own egress. The BFF holds no secrets either — it resolves everything through
`terminus-client` and `SecretManager::get()`.

---

## Sprint map

| Sprint | File | Items | Theme |
|---|---|---:|---|
| **A** | `S128-A-aperture-foundation.md` | APTR-01..14 | Repo scaffold, design system import, BFF contract, CI, brand |
| **B** | `S128-B-aperture-transport-auth.md` | APTR-15..28 | SSE streaming, auth/session/devices, channel adapters (Matrix kept, Telegram promoted, Signal stubbed) |
| **C** | `S128-C-aperture-web-chat.md` | APTR-29..46 | Workspaces, threads, streaming chat, attachments, tool-call rendering, documents, settings, admin |
| **D** | `S128-D-aperture-modules.md` | APTR-47..60 | Context bus, Muse module, Harmony module (spec-ingest-from-chat), assistant-operable actions |
| **E** | `S128-E-aperture-desktop.md` | APTR-61..72 | Tauri v2 shell, Windows + macOS packaging, signing, auto-update, deep links, tray |
| **F** | `S128-F-aperture-mobile.md` | APTR-73..82 | PWA, offline shell, Web Push, share-target, install flow |
| **G** | `S128-G-aperture-hardening.md` | APTR-83..92 | Behavior contracts, e2e, a11y, perf budgets, security review, docs, deploy |

Sprint dependencies: **A blocks B**; **B blocks C**; **C blocks D, E, F**; **G closes**.
Within a sprint, items are independent unless an explicit `Blocked by` says otherwise.

---

## Module Contract compliance (§4, all 7 clauses)

1. **Terminus-fronted.** Every backend capability reaches Aperture through the BFF →
   `terminus-client` → Terminus. The client bundle receives vault *references* and short-lived
   session tokens, never secret values. Chord is addressed by **named proxy** only
   (`lumina-fast`, `lumina-deep`, …) — no model IDs, engine names, or backend tags in client
   or BFF code.
2. **Capability-gated presentation.** Each module registers a descriptor at
   `GET /v1/aperture/modules`; the shell renders a module only when its backend capability is
   present. A missing backend yields an inert, explained tile — never a broken screen.
3. **Context-bus citizen.** `POST /v1/aperture/events` + the SSE `context` channel carry
   what the user is doing (thread, media item, build run) so the assistant can reason across
   modules. Every module in this epic both publishes and consumes.
4. **Assistant-operable.** Every meaningful module action is exposed as a Terminus tool the
   assistant can invoke, not only as a button. Sprint D includes an explicit parity check item.
5. **Embeddable presentation.** Modules render as embeddable surfaces the shell hosts; no
   module ships its own shell, router, or design language.
6. **Sovereign + private by construction.** Zero telemetry, zero third-party analytics, zero
   external CDN or font fetches at runtime. All assets are bundled. Cross-user features are
   opt-in and default-private.
7. **Standalone-excellent first.** Muse and Harmony were each built standalone across prior
   sprints. Aperture adds cross-module context; it does not rescue a weak module.

## Soul Contract compliance (all 4 clauses)

1. **Speak, never template.** Every user-facing string generated on behalf of the assistant
   passes through the persona/prompt assembler. Raw templates are a render-failure fallback only.
   Aperture surfaces the assistant's voice; it never substitutes its own.
2. **Presence has a budget.** Module and context-bus events reach the user through the
   assistant's prioritized, trait-scaled knock quota — quiet hours and opt-out honored.
   Aperture ships **no independent notification tray**; Web Push (Sprint F) is a *transport*
   for the assistant's existing presence budget, not a second channel around it.
3. **Show the becoming.** Trait drift, new principles, and revised opinions from consolidation
   are rendered on a first-class surface in Aperture, not buried in logs.
4. **Continuity survives every swap.** Adding Aperture as a channel MUST NOT reset Engram
   memory, personality traits, or relationship lore. Sprint B carries an explicit
   continuity-preservation item with a negative test.

---

## Channel policy (operator decision, S128)

| Channel | Status after this epic | Notes |
|---|---|---|
| **Matrix** | **RETAINED, first-class, unchanged** | Not deprecated, not removed. Dual-transport is the steady state, not a migration step. |
| **Aperture** | NEW, first-class | Adds rich surfaces Matrix structurally cannot render |
| **Telegram** | Promoted to a selectable option | Adapter already exists feature-gated; this epic exposes and documents it. **Not enabled by default.** |
| **Signal** | **STUBBED ONLY** | Adapter skeleton + capability descriptor + config keys. **No account provisioning, no live registration, no credentials.** Explicitly deferred by operator instruction. |
| **CLI** | Unchanged | |

A Signal item that provisions an account, registers a number, or requests a credential is
**out of scope and must be rejected**. The stub compiles, registers as `unavailable`, and is
covered by a test asserting it stays inert.

---

## Pre-flight

- Repository: `moosenet/Aperture` on the internal forge — **created 2026-08-01**
- Public mirror: `moosenet-io/aperture` — exists; requires the one-time operator-blessed
  bootstrap re-baseline before the first `git_public_mirror_push` (Sprint A human-action item)
- Plane project: `APTR` (Aperture) — exists
- Prefix: `APTR` — claimed in the overlay; durable promotion is a Sprint A item
- Working directory: repo-relative only
- Dependencies: `rustup` + pinned toolchain, `node` ≥ 20, `cargo`, Tauri v2 prerequisites on
  the packaging hosts
- Vault secrets required (names only — values live in the secret store):
  `GITEA_PAT_MOOSE`, `GITHUB_PAT_HARMONY`, `APERTURE_SESSION_SIGNING_KEY`,
  `APERTURE_VAPID_PUBLIC_KEY`, `APERTURE_VAPID_PRIVATE_KEY`
- Infrastructure: internal forge reachable, Plane reachable, Terminus door reachable,
  Chord reachable
- Baseline tests: 0 (new repo)
- Baseline verify: N/A (new repo) — Sprint G establishes the behavior-verify baseline

---

## Pipeline obligations for every item in this epic

These are restated here because this epic will be executed by fanned-out agents, and each
agent must carry them without re-reading the whole skill:

1. **Ground in the Atlas KG before implementing** — `kg_query` / `kg_search` for the entities
   touched, `kg_neighbors` / `kg_subgraph` for blast radius, and **`kg_rules`** for the learned
   rules governing the scope. For any item touching auth, streaming, or the module runtime,
   also run **`cortex_scope`** for a remote whole-graph blast radius before writing code.
2. **One isolated worktree per item**, branched off fresh `origin/main`. Never share a worktree.
3. **Test gate through the compiler tool** — no ad-hoc `cargo test` on a shared host.
4. **Review gate through `review_run`** — the single review door. Never a raw reviewer CLI.
5. **Post-merge gate is indivisible from the merge.** Immediately after every `gitea_merge_pr`,
   run the post-merge script for `APTR`. It performs Stage 7d (public mirror) and Stage 7c
   (Atlas KG refresh). A merge reported without the gate's outcome is an incomplete report.
6. **Never force-push a diverged mirror.** Surface `needs_operator_rebaseline` and continue.
7. **`docgen_run` is capstone-gated.** Do not call it per merge. It fires once, at the end of
   the Epic Review capstone, and only on an APPROVE verdict.
8. **Cortex contributes**: `cortex_scope` pre-change on risky items, `cortex_review` post-change
   risk score recorded in the PR body. `kg_rule_crystallize` runs once at epic end (Sprint G).

---

## Epic Review capstone (Sprint G closes the build)

After every item across all seven sprints is merged and verified, and the sprint-end worktree
sweep has run, the build closes with a single `review_run(structure="epic", …)` over the whole
repository against these contracts. Royal panel: `opus` + `codex` + `gpt56` + `agy` + `free`
+ `claude-fable-5`. Pass `project` + `spec_id` + `project_id` + `repo_path` + `module_path` +
`git_ref` in `context` so the capstone fires the KG refresh unconditionally and the doc engine
on APPROVE. Findings become Plane items in `APTR`, filed through the Terminus Plane tool. The
build is done when the capstone has run **and** its findings are triaged — not when the last
item merged.
