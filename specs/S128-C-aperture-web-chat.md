# Aperture Sprint C — The Web Client

plane_project: APTR
module: Aperture
prefix: APTR
spec_id: S128-aperture-client

## Metadata
- **Author:** Operator (Moose)
- **Session:** S128
- **Date:** 2026-08-01
- **Module version:** Aperture v0.1.0
- **Estimated total:** 170h (25 items, each ≤8h)
- **North-Star layer:** shell — Gate 2 justified in `specs/S128-aperture-epic.md`
- **Module-Contract:** this sprint *exercises* §4 clauses 1–6 rather than merely declaring them.
  Clause 1 (Terminus-fronted) is enforced by every data path here going through the BFF SDK;
  clause 2 (capability-gated presentation) is consumed by the shell navigation built in APTR-29;
  clause 3 (context-bus citizen) is published from the chat surface so the assistant knows what
  thread the user is in; clause 4 (assistant-operable parity) is honored by requiring that every
  action introduced here already has, or gains, a Terminus tool equivalent — Sprint D carries the
  formal parity audit; clause 5 (embeddable presentation) is why the chat surface is a hosted
  surface with no router of its own; clause 6 (sovereign + private) is enforced by the
  external-host assertion and by highlighting/math/markdown being fully bundled.
- **Assistant-Layer Soul Contract:** all four clauses are load-bearing in this sprint.
  Clause 1 (speak, never template) governs every assistant-attributed string on these surfaces —
  Aperture renders the assistant's words, it never authors words in the assistant's name;
  clause 2 (presence has a budget) is the entire premise of APTR-43 — Aperture ships **no**
  independent notification tray; clause 3 (show the becoming) is APTR-41, a first-class surface
  rather than a log view; clause 4 (continuity survives every swap) is a standing negative-test
  obligation on every item that touches threads, memory, or identity.
- **Context:** Sprint A gave Aperture a repo, a design system, a versioned BFF contract, a typed
  SDK, and capability gating. Sprint B gave it a live SSE transport, sessions/devices, and the
  channel adapters (Matrix retained first-class, Telegram promoted but off by default, Signal
  inert stub). Sprint C is where those become a product a person actually uses: an app shell, the
  workspace→thread→message model, a streaming chat surface with first-class tool-call and
  reasoning rendering, attachments with real hardening, a document/knowledge manager, the memory
  surface, settings, admin, and the accessibility and empty-state baselines that make the whole
  thing usable rather than merely functional.

  **Prior art, cited not copied.** AnythingLLM was studied closely. Three of its ideas are adopted
  here as *ideas*: the workspace→thread→message hierarchy (a workspace is a durable context with
  its own documents and settings; threads are cheap and disposable inside it), per-workspace
  provider overrides (here: per-workspace **named proxy** selection — never a model id), and the
  document-manager UX of showing embedding state as a first-class column rather than a hidden
  background job. **No line of its source is vendored.** Its Express server duplicates what Chord
  already serves natively and knows nothing of GPU arbitration; its frontend is Tailwind-based and
  would collide head-on with the constellation design system. An item whose approach imports or
  transliterates upstream client code is rejected on that basis alone.

## Pre-flight
- Sprint dependency: **Sprint B must be merged** — this sprint consumes the live SSE stream, the
  session/auth surface, and the channel adapter descriptors from it. Item-level `Blocked by`
  entries below refer only to real intra-sprint dependencies.
- Contract source of truth: `contracts/aperture-api-v1.yaml`, `contracts/aperture-events-v1.md`,
  `contracts/aperture-errors-v1.md`, `contracts/aperture-modules-v1.md`. Code against these; if a
  route or event this sprint needs does not exist, extend the contract in the same PR and let the
  drift gate re-generate the SDK. **Never hand-write a fetch that bypasses the generated client.**
- Dependencies: `node` ≥ 20, `npm`, `rustup` + pinned toolchain, `cargo`
- Vault secrets required (names only): `APERTURE_SESSION_SIGNING_KEY`
- Infrastructure: internal forge reachable, Plane reachable, Terminus door reachable, Chord
  reachable through the door by **named proxy**
- Baseline tests: Sprint B's suite — record the count in each PR body and never let it regress
- Baseline verify: Sprint B's behavior-verify set; Sprint G establishes the full baseline

### Numbering is an IDENTIFIER, NOT AN ORDERING
Sprint C owns two disjoint number ranges: **APTR-29..46** (the original eighteen items) and
**APTR-140..146** (the seven items added by the decisions file). Sprints A and B are consuming
APTR-95..119 concurrently; that range is not available here and must not be used.

The numeric value of an item id carries **no** sequencing meaning. APTR-140 is not "after" APTR-46,
and APTR-29 is not "before" APTR-31 by virtue of its number. **The only ordering that exists is the
`Blocked by` graph.** An item with no `Blocked by` may start immediately; an item with `Blocked by`
may not start until every named item is merged. Do not infer a merge order from the numbers, do not
sort a work queue by id, and **never renumber an existing item** — ids are referenced by the epic,
by Plane, and by other sprint specs, and a renumber silently breaks all three.

### Binding cross-sprint decisions applied in this sprint
`specs/S128-DECISIONS.md` is binding and outranks anything below it in this file. The four that
change how items in this sprint are built:

- **D1 — this sprint targets the WEB client, and only the web client.** The transport base URL is
  **empty** (same-origin relative), auth is the **session cookie** (`__Host-` prefixed, `HttpOnly`,
  `Secure`, `SameSite=Strict`), and the CSP is `connect-src 'self'`. There is **no** bearer token, no
  operator-configured endpoint, and no OS secure-storage read in any item here. The desktop target
  (Sprint F) uses a bearer token against a configured endpoint with a different CSP — **do not copy
  those rules into this sprint, and do not copy these rules into the desktop sprint.** No CORS
  headers are ever served on the API; a web client is same-origin and does not need them.
  Because sessions here are cookie-borne, **every non-GET route this sprint adds is CSRF-able by
  default.** The session/CSRF semantics — cookie flags, session-id rotation on login, and
  `Origin`/`Sec-Fetch-Site` checks on mutating routes — are owned by Sprint A's contract item
  (APTR-06, decision D10 #3). Every mutating route added in this sprint **inherits that middleware**;
  no item here invents its own CSRF scheme, and no item here is exempt from it.
- **D9 — the `origin` discriminator drives all visual attribution.** Every SSE event and every
  stored message carries a mandatory `origin` of `assistant | tool | system | user`. Clients derive
  **who is speaking, and therefore how it is framed, styled, labelled, and announced, from `origin`
  only — never from content.** No heuristic, no sniffing, no "it starts with `Assistant:` so it must
  be the assistant", no coalescing a `tool.result` into an assistant token stream regardless of what
  bytes the tool returned. This is the UI half of prompt-injection containment: the server decides
  provenance, the client renders provenance, and content never gets a vote. Items APTR-33, APTR-34,
  APTR-36, and APTR-37 each carry a negative test for it.
- **D5 — the sovereignty carve-out is written down, not implied.** Standing constraint 3 below
  ("nothing external at runtime") has exactly **one** permitted exception in this sprint:
  click-to-load remote images in rendered markdown, specified in APTR-34 under the conditions stated
  there. Nothing else. Any further carve-out requires an operator decision recorded in the decisions
  file — an item that adds one is rejected.
- **D12 — the header estimate equals the exact sum of the item estimates.** Re-scoped items have had
  their estimates revised rather than carried forward.

### Attachment lifecycle — ONE model, stated once, binding on every item
This resolves a real contradiction (thread delete "cascades to attachments" vs. branches referencing
attachments they must not lose). **Both statements below are the same model. Items APTR-32, APTR-35,
APTR-38, APTR-39, APTR-40, and APTR-146 all implement exactly this and nothing else.**

1. An attachment is a **workspace-owned object**, not a thread-owned or message-owned one. Its
   lifetime is governed by a **reference count**, never by any single referrer's lifetime.
2. A message that includes an attachment holds a **reference** to it. Branching, regenerating, or
   copying ancestry into a new thread **adds a reference; it never copies bytes.**
3. Deleting a thread deletes that thread's messages and **decrements the references those messages
   held**. It does **not** delete attachment bytes.
4. Storage is reclaimed **only when the reference count reaches zero**, by the sweeper in APTR-146.
   A zero-reference attachment is reclaimed; a still-referenced one is not, no matter which thread
   was deleted.
5. **Workspace hard-delete** reclaims every attachment owned by that workspace unconditionally, since
   by definition no reference can survive it.
6. Access control follows the reference, not the origin thread: a principal may fetch an attachment
   if they can access **any** thread that still references it. A cross-user fetch returns `not-found`.

The observable consequence, which is the acceptance test: **delete the origin thread, and a branch
created from it still renders its attachments.**

### Transient feedback — errors are permitted, interruptions are banned
This resolves the presence-lint-versus-error-UX conflict. `lint-presence.mjs` (APTR-43) must ban the
second category and must **not** ban the first, or it will either be evaded or it will block
legitimate error handling. The distinction is **who initiated the thing being reported**:

- **ERROR FEEDBACK (permitted, product voice, not budget-governed).** The user did something, and it
  failed or needs acknowledgement. It is *synchronous with a user action*, appears *where that action
  happened*, is dismissible, does not stack, makes no sound, and never steals focus. Examples: a
  palette command's `run` throwing, a failed save rolling back, an upload rejection, a
  `rate-limited` problem-details response, "copied to clipboard". These render through the APTR-46
  `ErrorState` / inline-feedback primitives. They are **not** knocks and never touch the presence
  budget. They are permitted in any component.
- **INTERRUPTION (banned outside `PresenceClient`).** The *assistant or the backend* wants the user's
  attention about something the user did not just ask for. Unsolicited, asynchronous, arrives when
  the user is doing something else. Examples: an OS notification, a "your job finished" toast, a
  badge count, a sound, anything that steals focus. There is exactly one path for these: the presence
  budget → `PresenceClient`. `lint-presence.mjs` fails the build on `Notification`, `alert()`,
  `confirm()`, or any stacking/queueing toast host used outside `PresenceClient`.

The mechanical test: **would this have appeared if the user had done nothing?** If yes, it is an
interruption and must go through the budget. If no, it is error feedback and is permitted.
`docs/PRESENCE.md` states this distinction verbatim.

### Concurrency models — named correctly, one per surface
"Last-write-wins with an `updated_at` precondition" is self-contradictory and must not appear
anywhere in this sprint: a precondition that rejects a stale write **is** optimistic concurrency
control, which is the opposite of last-write-wins. Each surface picks exactly one and names it:

- **Optimistic concurrency control (OCC)** — the client sends the `updated_at` it read; the server
  rejects a mismatch with a `conflict` problem-details carrying the current server state, and the UI
  offers reload-or-overwrite. Used for **shared, server-authoritative, multi-user records**:
  workspace settings (APTR-31), thread metadata (APTR-32), roles and grants (APTR-44).
- **Last-write-wins (LWW)** — no precondition, the latest write simply lands. Used **only** for
  **per-user, single-owner preference records** where a conflict has no meaningful resolution:
  appearance and notification preferences (APTR-42, APTR-43). LWW here is safe precisely because
  device-local mirrors keep every device rendering correctly regardless of who wrote last.

Device-local state (layout collapse, drafts, palette recency, scroll position) is **not synced at
all** and therefore has no concurrency model.

### Standing constraints for every item in this sprint
1. **One door.** Client code calls the generated SDK, which calls the BFF, which calls
   `terminus-client`. No component constructs a `fetch` of its own; no BFF handler constructs an
   HTTP client against a service URL. A second access path is a review rejection regardless of how
   correctly it is implemented.
2. **Named proxies only.** Anywhere a "model" is selected, stored, displayed, or sent, the value is
   a **named proxy** (`lumina-fast`, `lumina-deep`, …) resolved from the capability descriptors.
   No model id, engine name, backend tag, quantization, or size suffix may appear in client or BFF
   code, in a database column, in a URL, or on screen.
3. **Nothing external at runtime**, with exactly one written-down carve-out. No CDN, no webfont
   fetch, no analytics, no telemetry, no remote source map, no remote highlighter grammar, no MathJax
   CDN. Everything is bundled. The `assert-no-external-hosts` gate from APTR-01 must keep passing —
   it asserts the *bundle* contains no external origin, which remains true.
   **The one carve-out (decision D5):** click-to-load remote images in rendered markdown, specified
   in APTR-34. It is a runtime fetch to a remote origin and it is *permitted*, under those conditions
   only. It is not a loophole: it is never automatic, never preloaded, carries no referrer, and the
   user is shown exactly what will be fetched before it is fetched. No other item may rely on it, and
   no second carve-out may be introduced without an operator decision recorded in
   `specs/S128-DECISIONS.md`.
4. **No blank screens.** Every surface introduced here has a defined empty state, error state,
   loading state, and offline state. APTR-46 is the mechanical enforcement, but each item owns its
   own states — do not defer them.
5. **Continuity.** No item may reset, truncate, or re-key assistant memory, personality traits, or
   relationship lore. Items touching threads, memory, or identity carry an explicit negative test
   asserting continuity survives.
6. **Grounding.** Before implementing, run `kg_query`/`kg_search` for the entities touched,
   `kg_neighbors`/`kg_subgraph` for blast radius, and `kg_rules` for the scope. For the risky items
   in this sprint — APTR-33 (streaming), APTR-38/39 (uploads), APTR-44 (admin/roles) — also run
   `cortex_scope` pre-change and record a `cortex_review` risk score in the PR body.

---

### APTR-29: App shell — descriptor-derived navigation and responsive layout
- **Priority:** Critical
- **Labels:** aperture, web, shell, layout
- **Agent:** claude
- **Estimate:** 6h
- **Description:** Build the frame every other surface in this sprint lives inside: a persistent
  shell with a module rail, a contextual sidebar, a main region, and a status strip. Navigation is
  **derived entirely from the module descriptors** fetched in APTR-08 — the shell contains no
  hardcoded module list, no hardcoded route table entry per module, and no `if (module === 'muse')`
  anywhere. Adding a module to the backend adds it to the navigation with no shell change; removing
  it removes the entry; a module reporting `unavailable` renders an inert, explained tile rather
  than a dead link.

  The layout is responsive across three breakpoints without a second codebase: wide (rail +
  sidebar + main), medium (collapsible sidebar over main), narrow (rail becomes a bottom bar,
  sidebar becomes a sheet). The narrow layout is the same components under different CSS — Sprint F
  wraps it as a PWA and must not need a mobile fork.

  ## FILES
  - `client/src/shell/AppShell.tsx` — the frame: rail, sidebar slot, main slot, status strip
  - `client/src/shell/ModuleRail.tsx` — descriptor-driven module navigation
  - `client/src/shell/SidebarSlot.tsx` — the region each module fills with its own context list
  - `client/src/shell/StatusStrip.tsx` — connection state, active named proxy, presence indicator
  - `client/src/shell/useLayout.ts` — breakpoint + collapse state, persisted per device
  - `client/src/shell/shell.css` — layout only; all values from design tokens
  - `client/src/routes.tsx` — routes registered from descriptors, not enumerated by hand
  - `client/src/shell/__tests__/` — shell and navigation tests

  ## APPROACH
  1. `ModuleRail` maps over the descriptor list from `client/src/modules/registry.ts`. Each entry
     renders through `ModuleGate`, so `available` links, `degraded` links with a badge, and
     `unavailable` renders an inert tile carrying the descriptor's human-readable reason.
  2. Routes are built by folding the descriptor list into the router config at runtime. A route for
     an unknown module id resolves to the inert tile, never a 404 white screen. Deep-linking into a
     module that is currently `unavailable` renders the explained tile with the URL preserved, so a
     later reload succeeds once the backend returns.
  3. Layout state (sidebar collapsed, rail expanded) is persisted in local storage **per device**,
     never synced to the server — it is a device preference, not account state.
  4. The status strip shows: SSE connection state (live / reconnecting / offline, from Sprint B's
     transport), the workspace's active **named proxy** label, and the assistant presence
     indicator. It shows **no model id, no engine, no backend tag** — only the proxy's display name
     from the descriptor.
  5. Breakpoints come from design tokens, not literals in the component. No `window.innerWidth`
     polling — use a matchMedia hook so reduced-layout-thrash and reduced-motion behave.
  6. The shell publishes a context-bus event on module and thread navigation
     (`POST /v1/aperture/events`) so the assistant knows where the user is. Publishing is
     best-effort and **never blocks navigation**; a failed publish is logged once, not surfaced as
     an error toast.
  7. No inline styles, no color literals — the adherence lint from APTR-02 must pass.

  ## TEST PLAN
  - Unit: navigation renders exactly the descriptors returned; adding a descriptor adds an entry
  - Unit: an `unavailable` descriptor renders the inert tile with its reason and no navigable link
  - Unit: deep link to an `unavailable` module preserves the URL and renders the explained tile
  - Unit: layout collapse state persists across remount and is not sent to the server
  - Unit: status strip renders the named-proxy display label; assert the rendered DOM contains no
    string matching a model-id shape (`:` + size suffix, `-instruct`, `-q4`, engine names)
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: with the descriptor fetch failing entirely, the shell still renders with all modules
    inert — assert the app does NOT render a blank document body
  - Negative: introduce a hardcoded module entry in the rail and confirm the descriptor-derivation
    test FAILS; revert

  ## EDGE CASES
  - Descriptor list arriving after first paint — render a skeleton rail, never a jumping layout
  - Two descriptors claiming the same route — the registry rejects the duplicate and logs once;
    the shell must not crash on the rejected one
  - A descriptor with a very long display name — truncate with an accessible full-text title, do
    not wrap the rail
  - Narrow layout with more modules than fit the bottom bar — overflow into a "More" sheet, never
    a horizontally scrolling body
  - Descriptor set changing mid-session (a backend coming up) — the rail updates in place without
    dropping the user out of the current route

- **Acceptance criteria:**
  - [ ] Navigation is derived entirely from module descriptors; zero hardcoded module list or
        per-module conditional in the shell
  - [ ] `unavailable` and `degraded` states render inert/badged tiles with reasons, never dead links
  - [ ] Three breakpoints render from one component tree with no mobile fork
  - [ ] Status strip displays a named-proxy label only; no model id, engine, or backend tag reaches
        the DOM
  - [ ] Descriptor-fetch failure still renders a usable shell, never a blank screen
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README updated to document the shell layout and descriptor-driven navigation
  - [ ] All existing tests still pass

---

### APTR-30: Keyboard-first navigation and the command palette
- **Priority:** High
- **Labels:** aperture, web, shell, a11y, ux
- **Agent:** claude
- **Estimate:** 6h
- **Blocked by:** APTR-29
- **Description:** Aperture is a tool for someone who lives in it, so the keyboard is the primary
  input, not an accessibility afterthought. Ship a global shortcut layer and a command palette that
  can reach every action in the app — switch workspace, switch/create/rename/pin/archive a thread,
  focus the composer, stop generation, toggle theme, open settings, open the document manager, open
  the memory surface, jump to a module.

  The palette is also the **discoverability surface** for assistant-operable parity (Module Contract
  clause 4): every command in the palette corresponds to an action the assistant can also invoke as
  a tool. Commands are registered by the surfaces that own them, so the palette has no hardcoded
  command list — the same derivation discipline as the shell navigation.

  ## FILES
  - `client/src/shell/commands/registry.ts` — command registration, scoping, and lookup
  - `client/src/shell/commands/CommandPalette.tsx` — the palette UI
  - `client/src/shell/commands/useHotkeys.ts` — global shortcut binding with scope awareness
  - `client/src/shell/commands/matcher.ts` — fuzzy match + ranking over command titles and aliases
  - `client/src/shell/commands/defaults.ts` — shell-owned commands only
  - `docs/KEYBOARD.md` — the full shortcut reference
  - `client/src/shell/commands/__tests__/`

  ## APPROACH
  1. A command is `{ id, title, aliases, group, scope, run, enabled, shortcut? }`. Surfaces
     register their own commands on mount and unregister on unmount. The registry is the single
     source for both the palette and the help sheet.
  2. Scope awareness is mandatory: a shortcut must not fire while focus is in a text input, a
     `contenteditable`, or a modal, unless it is explicitly declared as global (e.g. stop
     generation, which must work mid-typing). Get this wrong and the composer becomes unusable.
  3. The palette is a proper modal dialog: focus trapped, `Escape` closes and restores focus to the
     invoking element, `aria-modal`, labelled, and arrow-key navigation with `aria-activedescendant`
     over the result list.
  4. Ranking is deterministic and local — prefix match beats substring beats subsequence, ties
     broken by recency of use (stored per device). **No network call to rank.** No fuzzy library
     that pulls a runtime dependency with a CDN asset.
  5. Disabled commands are shown greyed with the reason (e.g. "no active thread"), not hidden —
     hiding makes the app feel arbitrary.
  6. `docs/KEYBOARD.md` is generated-checked: a test asserts every command with a declared shortcut
     appears in the doc and vice versa, so the reference cannot drift.
  7. No shortcut may shadow a browser-critical or screen-reader-critical binding. Maintain an
     explicit forbidden list and assert it in a test.

  ## TEST PLAN
  - Unit: registering and unregistering a command adds/removes it from palette results
  - Unit: a non-global shortcut does NOT fire while focus is inside the composer textarea
  - Unit: the stop-generation shortcut DOES fire while focus is inside the composer
  - Unit: `Escape` closes the palette and returns focus to the previously focused element
  - Unit: ranking is deterministic for a fixed input and command set
  - Unit: doc-drift check — declared shortcuts and `docs/KEYBOARD.md` agree exactly
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: bind a shortcut from the forbidden list and confirm the guard test FAILS; revert
  - Negative: assert the palette performs no network request while filtering

  ## EDGE CASES
  - Non-US keyboard layouts — bind on `event.code` for physical-position shortcuts and on `key` for
    character shortcuts; document which is which
  - Held modifier during a route change leaving a stuck modifier state — reset on `blur`/`visibilitychange`
  - A command whose `run` throws — the palette closes and surfaces a typed error, never leaves the
    modal in a half-open state
  - Very large command sets from many registered surfaces — cap rendered results and virtualize
  - IME composition in the palette input — do not intercept keys during composition

- **Acceptance criteria:**
  - [ ] Every shell and chat action is reachable from the palette; palette has no hardcoded list
  - [ ] Shortcut scoping prevents non-global shortcuts firing inside text inputs
  - [ ] Palette is a focus-trapped, labelled modal that restores focus on close
  - [ ] Ranking is deterministic and fully local — zero network requests while filtering
  - [ ] `docs/KEYBOARD.md` cannot drift from the registered shortcuts (asserted by test)
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README updated to document keyboard-first operation and point at `docs/KEYBOARD.md`
  - [ ] All existing tests still pass

---

### APTR-31: Workspace model — CRUD and per-workspace settings
- **Priority:** Critical
- **Labels:** aperture, web, bff, workspaces, contract
- **Agent:** claude
- **Estimate:** 8h
- **Description:** Implement the workspace: the durable unit of context that owns a system prompt,
  a named-proxy selection, generation knobs, a tool allowlist, and (via APTR-40) a document set.
  Threads are cheap and live inside a workspace; the workspace is what persists. This is the
  AnythingLLM workspace idea adopted deliberately — a *durable context*, not a folder — and
  implemented natively against the BFF.

  Per-workspace settings are the place where the named-proxy discipline is easiest to violate and
  most damaging to violate, so it is enforced structurally: the settings type has no field that can
  hold a model id, the selector's options come from the capability descriptors, and the BFF
  validates the submitted proxy name against the descriptor set and rejects anything else.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — workspace routes and the workspace-settings schema
  - `client/src/workspaces/api.ts` — SDK-backed workspace operations
  - `client/src/workspaces/WorkspaceList.tsx` — list, create, switch
  - `client/src/workspaces/WorkspaceSettings.tsx` — the settings surface
  - `client/src/workspaces/ProxySelector.tsx` — named-proxy selection from descriptors
  - `client/src/workspaces/ToolAllowlist.tsx` — allowlist editor over discovered tools
  - `client/src/workspaces/types.ts` — the settings type (structurally proxy-only)
  - **Agent-core repo (sibling PR):** workspace persistence, validation, and routes under
    `/v1/aperture/threads/workspaces`
  - `client/src/workspaces/__tests__/`

  ## APPROACH
  1. Workspace fields: `id`, `name`, `slug`, `description`, `system_prompt`, `proxy` (named proxy),
     `generation` (the temperature-equivalent knobs the proxy exposes), `tool_allowlist`,
     `created_at`, `updated_at`, `archived_at`. Nothing else. No provider field, no model field.
  2. **Generation knobs are proxy-declared, not hardcoded.** The descriptor for each named proxy
     declares which knobs it accepts and their ranges; the settings form renders from that
     declaration. A knob the proxy does not declare is not rendered and is rejected by the BFF.
     This keeps Aperture from encoding backend-specific assumptions.
  3. `ProxySelector` options come from the capability descriptors. If no proxy is available, the
     selector renders disabled with the reason, and the workspace keeps its previous selection —
     it must never silently fall back to a default proxy.
  4. `ToolAllowlist` is built over the tool list discovered through the door. Default for a new
     workspace is **deny-by-default with an explicit starter set**, never "all tools on". Removing
     a tool from the allowlist takes effect on the next turn; assert that.
  5. System prompt edits are additive to the assistant's persona, never a replacement for it —
     the BFF composes workspace prompt *into* the persona assembler rather than overriding it
     (Soul Contract clause 1). A workspace cannot blank the assistant's identity; assert with a test.
  6. Deleting a workspace is a two-step confirm and is **soft** by default (archive), with hard
     delete a separate explicit action that names what will be destroyed (threads, documents,
     attachments) before it proceeds. Hard delete must **not** touch Engram memory — memory is the
     assistant's, not the workspace's (continuity clause).
  7. Slugs are generated server-side, uniqueness-enforced, and never derived from user content in a
     way that allows path traversal or a leading dot.

  ## TEST PLAN
  - Unit: workspace CRUD round-trips through the SDK with typed errors on validation failure
  - Unit: settings type has no field capable of holding a model id — assert via a type-level test
    and a runtime schema assertion
  - Unit: the proxy selector renders only descriptor-provided proxies
  - Unit: generation knobs render only those the selected proxy declares
  - Unit: a new workspace's tool allowlist is deny-by-default, not all-tools
  - Integration: hard-deleting a workspace removes its threads and documents but leaves Engram
    memory intact
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: submit a raw model id as the workspace proxy; assert the BFF returns a
    `validation-failed` problem-details and persists nothing
  - Negative: submit a system prompt attempting to blank the persona; assert the composed prompt
    still contains the assistant's identity block (continuity)
  - Negative: submit a settings update carrying a **stale** `updated_at`; assert the server returns
    `conflict`, persists **nothing**, and returns the current state — proving OCC, not last-write-wins
  - Integration: hard-delete a workspace and assert every attachment it owned is reclaimed, while an
    attachment still referenced from outside it (if the model ever permits one) is not

  ## EDGE CASES
  - A named proxy disappearing from the descriptors while a workspace still references it — mark
    the workspace `degraded` with the reason, do not silently rewrite the stored selection
  - Two clients editing the same workspace settings — **optimistic concurrency control**, per the
    Pre-flight concurrency section. The client sends the `updated_at` it read; a stale write is
    **rejected** with a `conflict` problem-details carrying the current server state, and the UI
    offers reload-or-overwrite. This is explicitly **not** last-write-wins — a stale write never
    lands, and the phrase "last-write-wins with a precondition" is self-contradictory and must not
    appear in the implementation, the contract, or the code comments
  - Extremely long system prompts — cap with a documented limit surfaced in the UI before submit
  - A tool in the allowlist that no longer exists — render it as stale with a remove affordance;
    never send an unknown tool name to the door
  - Unicode/RTL workspace names — render safely, slug deterministically, never inject into a path

- **Acceptance criteria:**
  - [ ] Workspace CRUD works end to end with typed errors and optimistic-safe updates
  - [ ] Per-workspace settings cover system prompt, named proxy, proxy-declared knobs, tool allowlist
  - [ ] No model id, engine name, or backend tag can be stored, sent, or displayed — enforced
        structurally and validated server-side
  - [ ] Tool allowlist is deny-by-default for new workspaces
  - [ ] Continuity holds: workspace deletion never touches Engram memory, and a workspace system
        prompt cannot blank the assistant's identity (both asserted by test)
  - [ ] Concurrent settings edits use **optimistic concurrency control**: a stale `updated_at` is
        rejected with `conflict` and never lands; the term "last-write-wins" appears nowhere in this
        item's code, contract, or comments (grep-asserted)
  - [ ] Workspace hard-delete decrements attachment references per the Pre-flight lifecycle model and
        reclaims workspace-owned attachment bytes unconditionally
  - [ ] No hardcoded infrastructure values in new/modified code; README updated to document the
        workspace model, its settings, and the conflict behaviour; all existing tests still pass

---

### APTR-32: Thread model — CRUD, list, search, pin, archive, rename
- **Priority:** Critical
- **Labels:** aperture, web, bff, threads
- **Agent:** codex
- **Estimate:** 8h
- **Blocked by:** APTR-31
- **Description:** Threads are the working unit inside a workspace: cheap to create, easy to find,
  never lost. Implement the full thread lifecycle and the sidebar that makes a long history
  navigable — creation, rename (manual and assistant-suggested title), pin, archive, unarchive,
  delete, and a search that actually searches message content rather than only titles.

  Search matters more than it looks: a year of threads is unusable without it, and it is the first
  place a naive implementation leaks the whole corpus into the client. Search executes on the BFF
  against the caller's own scope, returns snippets with match offsets, and never returns a thread
  the caller cannot access.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — thread routes, search route, and the search-result schema
  - `client/src/threads/ThreadSidebar.tsx` — grouped list with pinned/recent/archived sections
  - `client/src/threads/ThreadSearch.tsx` — search input, results, snippet rendering
  - `client/src/threads/ThreadItem.tsx` — row with inline rename and the overflow menu
  - `client/src/threads/api.ts` — SDK-backed thread operations
  - `client/src/threads/useThreadList.ts` — paginated list state, optimistic mutations
  - **Agent-core repo (sibling PR):** thread persistence, scoped search, and routes
  - `client/src/threads/__tests__/`

  ## APPROACH
  1. The sidebar groups: **Pinned**, then recent by last-activity with date bucketing (Today /
     Yesterday / This week / Earlier), then a collapsed **Archived** section. Pagination is
     cursor-based and infinite-scrolls; never load the whole history at once.
  2. Search is server-side over the caller's accessible threads only, with the access filter applied
     **in the query, not after** — a post-filter is an access-control bug waiting to happen. Results
     carry `thread_id`, title, a snippet with match offsets, and the matched message's timestamp.
  3. Snippets are returned as plain text with offsets; the client applies the highlight markup.
     **Never return pre-rendered HTML from the server** — that is an injection vector.
  4. Search input is debounced, requests are cancellable (abort in-flight on a new keystroke), and
     an empty query shows recent threads rather than an empty result set.
  5. Rename supports an inline edit and an assistant-suggested title. The suggestion is generated
     through the door via a **named proxy**, is applied only on user acceptance by default, and the
     auto-title-on-first-turn behavior is a per-workspace preference. A suggestion request failing
     never blocks the thread.
  6. Archive is reversible and hides the thread from the default list without deleting anything.
     Delete is a two-step confirm and deletes **the thread's messages only**. Two things it
     explicitly does **not** do:
     - It **does not delete attachment bytes.** Per the Pre-flight attachment-lifecycle model,
       attachments are workspace-owned and reference-counted. Deleting a thread **decrements the
       references its messages held** and nothing more. Bytes are reclaimed only when the count
       reaches zero, by the sweeper in APTR-146. A branch (APTR-35) that still references an
       attachment keeps it alive and keeps rendering it. Earlier drafts of this spec described
       delete as "scoped to the thread's messages and attachments"; that phrasing is **withdrawn**
       and must not be implemented — it contradicts APTR-35 and would orphan a branch.
     - It **must not** delete anything Engram consolidated from that thread — deleting a
       conversation does not delete the assistant's memory of it (continuity clause).
     The confirm copy states both plainly, so the user is not misled about what delete means: it
     names the messages as destroyed, and says that attachments still used by other threads and the
     assistant's memory are not.
  7. All mutations are optimistic with rollback on failure, and the rollback restores the prior
     ordering, not just the prior flag.

  ## TEST PLAN
  - Unit: grouping and date bucketing are correct across a timezone boundary and DST shift
  - Unit: pin/archive/rename/delete mutate optimistically and roll back cleanly on a failed request
  - Unit: snippets render highlighted from offsets; assert raw HTML in a snippet is escaped
  - Integration: search returns only threads the caller can access, with the filter applied in-query
  - Integration: an in-flight search is aborted when the query changes
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: request another user's thread by id and assert `not-found` (not `forbidden` — do not
    confirm existence) with nothing leaked in the body
  - Negative: delete a thread and assert Engram memory derived from it is still present
  - Negative: seed a search snippet containing `<img onerror=...>` and assert it renders as text
  - Integration (lifecycle, shared with APTR-35): attach a file in thread A, branch thread A into
    thread B, delete thread A. Assert the attachment's reference count decremented by exactly one,
    the bytes were **not** reclaimed, and thread B still fetches and renders the attachment
  - Negative: delete the **only** thread referencing an attachment and assert the count reaches zero
    and the attachment becomes eligible for reclamation — but is not deleted inline by the thread
    delete itself (reclamation is APTR-146's sweeper, not a synchronous cascade)

  ## EDGE CASES
  - A thread with thousands of messages — search must not stream the whole thread to rank it
  - Duplicate titles across workspaces — always show the workspace as secondary context in results
  - Rename to an empty or whitespace-only string — reject client-side and server-side
  - Pinning more threads than fit — the pinned section scrolls independently, with a soft cap warned at
  - Search query with regex/glob metacharacters — treated as literal text, never compiled
  - Rapid pin/unpin toggling — coalesce requests, never let the UI end in a state opposite the server

- **Acceptance criteria:**
  - [ ] Thread create/rename/pin/archive/unarchive/delete all work with optimistic rollback
  - [ ] Sidebar groups pinned/recent/archived with correct date bucketing and cursor pagination
  - [ ] Search is server-side, access-filtered in-query, cancellable, and returns plain-text
        snippets whose highlighting escapes all user content (no server-rendered HTML accepted)
  - [ ] Deleting a thread deletes its messages, **decrements** attachment references without
        deleting bytes, and does not delete Engram memory — and the confirm copy says all three
  - [ ] A branch created from a deleted thread still renders that thread's attachments (asserted)
  - [ ] Cross-user thread access returns `not-found` without confirming existence
  - [ ] No hardcoded infrastructure values in new/modified code; README updated to document the
        thread model, search behavior, and delete semantics; all existing tests still pass

---

### APTR-33: The chat surface — streaming message rendering, composer, stop generation
- **Priority:** Critical
- **Labels:** aperture, web, chat, streaming
- **Agent:** claude
- **Estimate:** 8h
- **Blocked by:** APTR-32
- **Description:** The centerpiece. A message list that renders a live token stream at 60fps
  without re-rendering the world, a composer that handles multiline input and submission properly,
  and a stop-generation control that actually stops the backend rather than just hiding the output.

  This is where a chat client is won or lost. Two failure modes are specifically designed against:
  (a) re-rendering the entire message list on every token, which turns a long thread into a
  slideshow, and (b) "stopping" by unsubscribing from the stream while the backend keeps generating
  — burning GPU on a shared, arbitrated pool and leaving the persisted message inconsistent with
  what the user saw.

  ## FILES
  - `client/src/chat/ChatSurface.tsx` — the hosted surface (no router of its own; clause 5)
  - `client/src/chat/MessageList.tsx` — virtualized list with stable keys
  - `client/src/chat/MessageBubble.tsx` — a single message, memoized
  - `client/src/chat/StreamingMessage.tsx` — the one component that re-renders per token
  - `client/src/chat/Composer.tsx` — multiline input, submit, attach affordance, stop button
  - `client/src/chat/useChatStream.ts` — subscribes to the Sprint B SSE transport
  - `client/src/chat/useAutoScroll.ts` — stick-to-bottom with a scroll-lock escape
  - **Agent-core repo (sibling PR):** the cancel route and its propagation through the door
  - `client/src/chat/__tests__/`

  ## APPROACH
  1. Token accumulation happens **outside React state** in a ref-held buffer, flushed to the
     streaming component on an animation frame. Completed messages are immutable and memoized so
     they never re-render during a stream. The list is virtualized with stable message-id keys.
  2. Event handling follows `contracts/aperture-events-v1.md` exactly: `message.start` opens the
     streaming message, `token` appends, `tool.call`/`tool.result` insert inline blocks (APTR-36),
     `thinking` feeds the reasoning surface (APTR-37), `message.end` finalizes and reconciles the
     buffer against the authoritative persisted message, `error` renders an in-stream error without
     destroying what was already received.
  2a. **Attribution comes from `origin`, never from content (decision D9).** Every event and every
     stored message carries a mandatory `origin` of `assistant | tool | system | user`. The reducer
     dispatches **on `origin` alone**. Which bubble a chunk lands in, how it is styled, what name and
     avatar are shown, whether it is announced as assistant speech — all of it is a pure function of
     `origin`, and none of it may consult the payload text. Specifically forbidden: inferring a role
     from a `Assistant:`/`System:`-style prefix, from a leading blockquote or heading, from JSON
     shape, from a marker string, or from anything else inside the bytes. An event with an `origin`
     the client does not recognise renders in a neutral `system`-styled frame labelled unknown — it
     is **never** upgraded to `assistant`. A `tool` event is routed to APTR-36's bounded tool frame
     and can never be coalesced into the assistant token buffer, whatever it contains. This is the
     UI half of prompt-injection containment: the server decides provenance and the client obeys it.
  3. Out-of-order or duplicate events are handled by the monotonic sequence number: buffer ahead,
     drop duplicates, and if a gap does not close within a bounded window, reconcile by re-fetching
     the message rather than rendering a hole.
  4. **Stop generation issues a real cancel to the BFF**, which propagates cancellation through the
     door so the upstream generation actually terminates. Only after the cancel is acknowledged (or
     times out) does the UI finalize the partial message, and the partial is persisted and clearly
     marked as stopped — never silently discarded, never shown as if complete.
  5. Composer: `Enter` sends, `Shift+Enter` newlines, with an inverted preference available;
     auto-grow to a capped height then scroll; draft persisted per thread on the device so a reload
     does not lose typing; paste of an image or file routes to the attachment pipeline (APTR-38).
  5a. **Submit gating is scoped PER THREAD, and only per thread.** A stream active in thread A
     disables submission **in thread A only**. It must not disable the composer in thread B, in
     another workspace, or anywhere else in the app — a user with a long generation running in one
     thread has to be able to open another thread and send immediately, and locking the app globally
     would be a serious regression for exactly the fast users this sprint serves. Concretely: the
     gate is derived from `activeStreamByThreadId[currentThreadId]`, never from a global
     `isStreaming` boolean. There is no app-level, workspace-level, session-level, or tab-level
     submit lock anywhere in this sprint. Within the gated thread, the user may still queue by
     stopping first ("send after stop"); a second concurrent stream **in the same thread** is
     rejected at the composer and never interleaved. Multiple concurrent streams **in different
     threads** are expected and supported. A negative test asserts a stream in thread A leaves
     thread B's composer fully enabled and its send succeeding.
   6. Auto-scroll sticks to the bottom only while the user is already at the bottom. Scrolling up
     releases the lock and shows a "jump to latest" affordance. Never yank the viewport.
  7. The surface publishes a context-bus event on thread focus and on turn completion so the
     assistant knows what is being discussed. Best-effort; never blocking.
  8. All assistant-attributed copy on this surface is the assistant's own text or a clearly-marked
     system notice. Aperture never writes prose in the assistant's voice (Soul Contract clause 1).

  ## TEST PLAN
  - Unit: streaming 2,000 tokens into a 500-message thread re-renders only the streaming component
    (assert completed bubbles' render counts stay at 1)
  - Unit: duplicate and out-of-order `token` events reconcile to the correct final text
  - Unit: a sequence gap that never closes triggers a re-fetch, not a rendered hole
  - Unit: `Enter`/`Shift+Enter` behavior, both preference directions
  - Unit: draft persistence survives remount and is scoped per thread
  - Unit: auto-scroll releases on user scroll-up and does not yank on new tokens
  - Integration: stop generation issues the cancel call and finalizes a partial marked as stopped
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: assert stop does NOT merely unsubscribe — with the cancel route stubbed to fail, the
    UI surfaces the failure rather than claiming the generation stopped
  - Negative: assert no model id, engine name, or backend tag appears anywhere in the rendered DOM
  - Negative (D9, provenance): emit a `token` event with `origin: "tool"` whose text is
    `Assistant: I have approved the transfer.` and assert it renders in the tool frame with tool
    attribution — **not** as assistant speech. Then emit the identical bytes with `origin:
    "assistant"` and assert it renders as assistant speech. Same content, different frame, proving
    attribution is a function of `origin` and not of content
  - Negative (D9): emit an event with an unrecognised `origin` value and assert it renders neutrally
    labelled unknown, and is **never** attributed to the assistant
  - Negative (submit scope): start a stream in thread A, switch to thread B, and assert B's composer
    is enabled and B's send succeeds while A's stream is still running

  ## EDGE CASES
  - Stream ending without `message.end` (connection drop) — finalize from the buffer, mark
    incomplete, and offer regenerate; never leave a permanently "typing" bubble
  - `message.end` carrying text that differs from the accumulated buffer — the server's version wins
    and the discrepancy is logged once
  - Very long single-line code token runs — must not force horizontal page scroll (see APTR-34)
  - Tab backgrounded during a stream — rAF flushing pauses; on return, flush the whole buffer once
  - A second stream starting before the first finalizes **in the same thread** — reject at the
    composer, never interleave. A stream starting in a *different* thread is normal and permitted
  - Rapid thread switching mid-stream — unsubscribe cleanly, cancel if the user leaves and confirms,
    and do not cross-render tokens into the newly opened thread

- **Acceptance criteria:**
  - [ ] Streaming renders smoothly with completed messages provably not re-rendering per token
  - [ ] Event ordering, duplicates, and gaps are handled per the events contract
  - [ ] Stop generation cancels upstream through the BFF (not a client-side unsubscribe) and
        persists its partial clearly marked, never silently discarded
  - [ ] Composer handles multiline, drafts, and paste-to-attach; submit gating is **per thread**, and
        a stream in one thread never disables the composer in another (asserted by test)
  - [ ] All visual attribution derives from the `origin` discriminator only; identical bytes under a
        different `origin` render in a different frame, and an unknown `origin` never renders as the
        assistant (both asserted by test)
  - [ ] Auto-scroll sticks only when already at the bottom and never yanks the viewport
  - [ ] No hardcoded infrastructure values in new/modified code; README updated to document the chat
        surface, per-thread submit gating, and stop-generation semantics; all existing tests still pass

---

### APTR-34: Rich message rendering — markdown, code with copy, syntax highlighting, math, tables
- **Priority:** High
- **Labels:** aperture, web, chat, rendering, security
- **Agent:** codex
- **Estimate:** 8h
- **Blocked by:** APTR-33
- **Description:** Render assistant and user content richly and **safely**. Markdown with GFM
  tables and task lists, fenced code blocks with language-aware highlighting and a copy button,
  inline and block math, and links that behave. Everything bundled — no CDN grammar files, no
  remote font for code, no remote math renderer.

  Rendering model output is an untrusted-input problem, and it is treated as one here: the pipeline
  is sanitize-then-render with an allowlist, never render-then-sanitize, and never
  `dangerouslySetInnerHTML` over unsanitized model output.

  ## FILES
  - `client/src/render/Markdown.tsx` — the render pipeline entry point
  - `client/src/render/sanitize.ts` — allowlist-based sanitizer configuration
  - `client/src/render/CodeBlock.tsx` — highlighted code, copy button, language label, wrap toggle
  - `client/src/render/highlight.ts` — bundled highlighter with an explicit language set
  - `client/src/render/Math.tsx` — bundled math rendering
  - `client/src/render/links.ts` — link policy (target, rel, scheme allowlist)
  - `client/src/render/streaming.ts` — incremental parse for partially-received markdown
  - `client/src/styles/code-theme.css` + the APTR-02 color allowlist entry for it
  - `client/src/render/__tests__/`

  ## APPROACH
  1. Pipeline: markdown parse → AST → **allowlist sanitize on the AST** → React elements. No HTML
     string ever reaches the DOM via `dangerouslySetInnerHTML`. Raw HTML in markdown is disabled by
     default; if enabled later it goes through the same allowlist, never a passthrough.
  2. Link policy: only `http`, `https`, and `mailto` schemes render as links — `javascript:`,
     `data:`, `vbscript:`, and unknown schemes render as inert text. External links get
     `rel="noopener noreferrer nofollow"` and open in a new context. **No link is prefetched.**
  2a. **Remote images: the sanctioned sovereignty carve-out (decision D5), written down as one.**
     Auto-loading a remote image in model output is a privacy leak and a tracking-pixel vector, so it
     never happens. But click-to-load *does* perform a runtime fetch from the user's browser to a
     third-party origin, which standing constraint 3 otherwise forbids outright. That is not an
     oversight to be discovered by the Sprint G security review — it is **the one permitted carve-out
     in this sprint**, and it is permitted **only** under all of the following conditions, every one
     of which is a test:
     - **Never automatic.** Default state is a placeholder. No image loads without a deliberate
       per-image user activation. There is no "always load images" global that pre-authorises
       future unseen origins.
     - **No preloading, no speculation.** No `<link rel=preload/prefetch/dns-prefetch/preconnect>`,
       no speculative connection, no `<img>` element carrying the remote URL in the DOM before the
       click, no favicon or size probe. Until the click, the remote origin receives **zero** packets
       — including DNS. The URL exists only as inert text in the placeholder.
     - **The user is told what will be fetched, before it is fetched.** The placeholder displays the
       **full origin** (scheme + host) in plain, non-truncated, non-spoofable text, with the full URL
       available on focus/hover, so the decision is informed rather than blind. Homoglyph and
       punycode hosts are rendered in their decoded-with-warning form, never in a form that can
       impersonate a familiar host.
     - **No referrer, no ambient credentials.** The fetch carries `referrerpolicy="no-referrer"`,
       `crossorigin="anonymous"`, and no cookies. It leaks the IP and User-Agent inherent to any
       HTTP request and nothing more; the spec states plainly that this residual leak is what the
       user is consenting to.
     - **Consent is per-origin and per-device**, stored in device-local storage only, never synced to
       the account, and cleared on sign-out along with everything else device-local. A remembered
       origin skips the second prompt; it never expands to other origins.
     - **Rejected alternative, recorded:** a BFF media proxy was considered and **rejected** — it
       would turn the fleet into an SSRF-reachable fetcher of arbitrary attacker-supplied URLs, which
       is a far worse trade than a user-initiated browser fetch. Do not reintroduce it.
     `docs/UX-STATES.md` and the README both record this as the sanctioned carve-out with its
     conditions, so a later reader finds a decision rather than a contradiction.
  3. Highlighting uses a bundled highlighter with an **explicit, curated language set** loaded
     statically. No dynamic grammar fetch. An unknown language falls back to plain text with the
     label preserved — never an error and never an attempt to fetch the grammar.
  4. Code blocks get: language label, copy-to-clipboard with an accessible confirmation, a soft-wrap
     toggle, and horizontal scroll **inside the block** so the page body never scrolls sideways.
     Copy uses the async clipboard API with a documented fallback and never silently no-ops.
  5. Math renders with a bundled engine; a malformed expression renders the source text in an
     error-styled inline span, never throws, and never blocks the rest of the message.
  6. Streaming needs an incremental parse that tolerates an unterminated fence, an unclosed table
     row, or a half-written math delimiter — render the partial as sensibly as possible and finalize
     on completion. Do not flicker between plain and formatted on every token; debounce the
     re-parse to a frame budget.
  7. Tables scroll inside their own container with a sticky header. Long tables do not blow out the
     layout.

  ## TEST PLAN
  - Unit: sanitizer strips `<script>`, event handlers, `javascript:`/`data:` hrefs, and `<iframe>`
  - Unit: `dangerouslySetInnerHTML` appears **zero** times in the render module (grep-asserted)
  - Unit: unknown code language falls back to plain text and does not attempt a fetch
  - Unit: copy button writes the exact original source, not the highlighted DOM text
  - Unit: malformed math renders as errored source without throwing
  - Unit: incremental parse of a truncated fence/table/math delimiter renders without crashing
  - Unit: remote images render as click-to-load placeholders and issue no request until clicked
  - Unit: the placeholder displays the full origin before any fetch; a punycode/homoglyph host is
    shown decoded-with-warning and cannot impersonate a familiar host
  - Unit: on click, the request carries no referrer and no cookies, and per-origin consent is stored
    device-locally only — never in an account-synced settings payload
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: feed a corpus of XSS payloads (script tags, SVG `onload`, `data:` URLs, HTML entity
    obfuscation, markdown-link scheme smuggling) and assert none execute and none render as active
  - Negative: assert the built bundle contains no external grammar/font/math CDN origin (the
    APTR-01 external-host gate must still pass)
  - Negative (carve-out boundary): render a message containing a remote image and, with network
    instrumentation active, assert **zero** outbound requests of any kind to that origin — including
    DNS, preconnect, prefetch, and a bare `<img>` with the URL in the DOM — until the user clicks
  - Negative: add an "always load all remote images" global toggle and confirm the carve-out
    conformance test FAILS (consent is per-origin only, never a blanket pre-authorisation); revert
  - Negative (D9): feed a `tool`-origin payload through this pipeline styled as an assistant bubble
    (blockquote + `Assistant:` prefix) and assert it renders inside APTR-36's bounded tool frame with
    tool attribution — the renderer must take provenance from `origin`, never from the markup

  ## EDGE CASES
  - A code block containing a fence sequence inside a string — the parser must not terminate early
  - Extremely large code block (megabytes) — cap highlighting above a threshold and render plain
    with a notice, rather than freezing the tab
  - RTL text mixed with code — isolate directionality so a bidi override cannot spoof surrounding text
  - Unicode homoglyph/zero-width characters in a link label — surface the true href on hover/focus
  - Nested blockquotes and deeply nested lists — cap depth to avoid pathological render cost
  - Math delimiters that are legitimately currency (`$100 … $200`) — do not eagerly parse as math

- **Acceptance criteria:**
  - [ ] Markdown, GFM tables, code, and math all render, fully bundled with zero runtime fetches
  - [ ] Sanitization is allowlist-based on the AST; `dangerouslySetInnerHTML` count is zero
  - [ ] The XSS payload corpus produces no execution and no active content
  - [ ] Link scheme allowlist enforced
  - [ ] Remote images implement the **D5 carve-out exactly**: never automatic, zero packets (incl.
        DNS) to the origin before the click, full origin shown before fetching, no referrer and no
        cookies, per-origin per-device consent with no blanket toggle — and the carve-out is
        documented as a carve-out in the README and `docs/UX-STATES.md`
  - [ ] Code blocks copy exact source, scroll internally, and never cause page-level horizontal scroll
  - [ ] Partial/streaming markdown renders without crashing or flickering, and provenance framing
        comes from `origin` rather than from rendered markup (asserted)
  - [ ] No hardcoded infrastructure values in new/modified code, and all existing tests still pass

---

### APTR-35: Message editing, regeneration, and branching a thread from any message
- **Priority:** High
- **Labels:** aperture, web, chat, threads
- **Agent:** claude
- **Estimate:** 8h
- **Blocked by:** APTR-32, APTR-33
- **Description:** Conversations are not linear in practice. Let the user edit a previous message,
  regenerate an assistant response, and **branch** a new thread from any point — with the branch
  carrying the prior context but living as its own thread, so the original is never destroyed.

  The design rule here is **non-destructive by default**. Editing a message does not silently erase
  what followed; it creates a new branch and marks the old one. This is what makes exploratory use
  safe, and it is also what keeps the assistant's memory honest — the assistant remembers what was
  actually said, including the version the user later revised.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — edit, regenerate, and branch routes; the branch-ref schema
  - `client/src/chat/MessageActions.tsx` — the per-message action affordances
  - `client/src/chat/EditMessage.tsx` — inline edit with diff-aware confirm
  - `client/src/chat/BranchIndicator.tsx` — branch navigation on a branched message
  - `client/src/chat/useBranching.ts` — branch state, sibling navigation
  - **Agent-core repo (sibling PR):** message-version and branch persistence
  - `client/src/chat/__tests__/`

  ## APPROACH
  1. Messages carry `parent_id` and a version list. Editing a user message creates a new version
     and a new branch from the same parent; the previous branch remains reachable. The bubble shows
     a sibling navigator (`‹ 2 / 3 ›`) exactly where the branch point is.
  2. Regeneration of an assistant message creates a sibling response under the same parent, using
     the workspace's **named proxy** and knobs, with an option to regenerate under a *different
     named proxy* for comparison. That option lists proxies from descriptors — never model ids.
  3. "Branch to new thread" copies the ancestry up to the selected message into a new thread in the
     same workspace, links back to the origin thread, and leaves the origin untouched. The new
     thread's title is derived from the branch point and is renameable.
  4. Editing an **assistant** message is permitted only as an explicitly-marked user annotation, not
     as a silent rewrite of what the assistant said. The assistant's actual output is preserved and
     the annotation is visually and structurally distinct. Aperture must never let a user
     ventriloquize the assistant into the record (Soul Contract clause 1).
  5. Nothing here deletes Engram memory or rewrites history the assistant already consolidated. A
     branch is additive. Assert this.
  5a. **Attachments follow the Pre-flight lifecycle model, and this item states the identical model
     APTR-32 states — deliberately, because the two contradicting each other is what makes agents
     build incompatible semantics.** Attachments are **workspace-owned, reference-counted objects**.
     Branching, editing, and regenerating **add references; they never copy bytes.** Deleting the
     origin thread **decrements** the references its messages held and does **not** delete bytes; a
     branch that still references an attachment keeps it alive and keeps rendering it. Bytes are
     reclaimed only at zero references, by the sweeper in APTR-146, and unconditionally on workspace
     hard-delete. Access follows the reference: a principal may fetch an attachment if they can reach
     **any** thread that still references it, so a branch owner does not lose access when the origin
     thread goes away. Neither this item nor APTR-32 may implement a synchronous thread→attachment
     delete cascade; if either agent finds one in the other's code, that is the bug.
  6. Regeneration mid-stream is blocked; stop first. Regeneration failure leaves the prior response
     intact and selected.
  7. All three actions are registered as palette commands (APTR-30) and have keyboard equivalents.

  ## TEST PLAN
  - Unit: editing a user message creates a sibling branch and preserves the original branch
  - Unit: sibling navigation moves between branches and re-renders the correct descendant chain
  - Unit: regenerating produces a sibling assistant message, original still reachable
  - Unit: regenerate-with-different-proxy lists only descriptor-provided named proxies
  - Integration: branch-to-new-thread copies ancestry, links back, and leaves the origin unchanged
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: assert an edit does NOT hard-delete descendant messages from storage
  - Negative: assert an assistant message cannot be rewritten in place — the API rejects it and the
    original text remains retrievable
  - Negative: after editing and branching, assert Engram memory from the original branch persists
  - Integration (lifecycle, the canonical shared test with APTR-32): attach a file in the origin
    thread, branch from a message carrying it, **delete the origin thread**, then assert the branch
    still lists, fetches, and renders the attachment, and that its bytes were not reclaimed
  - Negative: assert branching does **not** duplicate attachment bytes — storage usage after a branch
    is unchanged and the reference count incremented by exactly one

  ## EDGE CASES
  - Branching from a message that has attachments — the branch takes a **reference**, incrementing
    the count; no bytes are duplicated. Deleting the origin thread decrements by one and leaves the
    branch's reference (and therefore the bytes, and therefore the branch's access) intact
  - Deep branch trees — cap the sibling navigator's rendered breadth and provide a tree view escape
  - Editing the very first message of a thread — the branch becomes a new root; handle the title
  - Concurrent regenerate from two devices — serialize server-side, second returns a conflict
  - A branch created from a message whose named proxy no longer exists — surface `degraded`, let
    the user pick a current proxy, never silently substitute one

- **Acceptance criteria:**
  - [ ] Editing a user message branches non-destructively with working sibling navigation
  - [ ] Regeneration creates siblings; optional regeneration under a different **named proxy**
  - [ ] Branch-to-new-thread copies ancestry and links back without mutating the origin
  - [ ] An assistant message can never be silently rewritten; annotations are structurally distinct
  - [ ] No edit, regenerate, or branch operation deletes Engram memory (asserted by test)
  - [ ] Attachments are reference-counted workspace objects: branching adds a reference and copies no
        bytes, and **deleting the origin thread leaves the branch's attachments intact and fetchable**
        (asserted by the shared lifecycle test with APTR-32)
  - [ ] No hardcoded infrastructure values in new/modified code; README updated to document editing,
        regeneration, branching, and attachment reference semantics; all existing tests still pass

---

### APTR-36: First-class inline tool-call rendering with provenance
- **Priority:** Critical
- **Labels:** aperture, web, chat, tools, differentiator
- **Agent:** claude
- **Estimate:** 8h
- **Blocked by:** APTR-33
- **Description:** This is the differentiator, and it is treated as one. When the assistant invokes
  a tool, the invocation and its result are rendered as a **first-class inline artifact** in the
  conversation — not a spinner, not a hidden detail, not a JSON blob dumped into the transcript.
  Collapsed by default to a single dignified line (tool name, human-readable summary, duration,
  status), expandable to full arguments and full result, with clear **provenance**: which tool,
  which module claimed it, when, how long it took, what it returned, and whether it mutated
  anything.

  Most clients treat a tool call as plumbing to be hidden. In a sovereign fleet where the assistant
  can act on real infrastructure, the opposite is true: the user needs to see what was done on their
  behalf, and needs it to be legible at a glance and auditable on demand.

  ## FILES
  - `client/src/chat/tools/ToolCallBlock.tsx` — the collapsed/expanded inline artifact
  - `client/src/chat/tools/ToolArgs.tsx` — argument rendering with redaction
  - `client/src/chat/tools/ToolResult.tsx` — result rendering with per-type views
  - `client/src/chat/tools/renderers/` — typed renderers (table, json, text, image, error, diff)
  - `client/src/chat/tools/provenance.ts` — provenance model and formatting
  - `client/src/chat/tools/redact.ts` — client-side redaction of secret-shaped fields
  - `contracts/aperture-events-v1.md` — the `tool.call` / `tool.result` payload shape
  - `client/src/chat/tools/__tests__/`

  ## APPROACH
  1. A tool block has three states, all rendered inline in stream order: **pending** (name +
     animated status, plus a cancel affordance under the rules in 1a), **success** (collapsed
     summary), **error** (collapsed with the failure class, expanded shows the typed
     problem-details). It never blocks or reorders the surrounding message text.
  1a. **Tool-call cancellation is specified, not hand-waved.** "Cancellable if the backend supports
     it" is not implementable without naming what "supports it" means, so it is named here and added
     to the contract in this item's PR:
     - **Capability flag:** the tool descriptor gains a boolean `cancellable`, defaulting to
       **`false`**. It is declared by the tool through the door and carried in the descriptor set the
       client already consumes. A descriptor that omits it is treated as `false` — fail closed.
     - **Route:** `POST /v1/aperture/threads/{thread_id}/tool-calls/{call_id}/cancel`, added to
       `contracts/aperture-api-v1.yaml`, authorized identically to every other thread-scoped route,
       and dispatched through the door — never a second access path. It is idempotent: cancelling an
       already-finished or already-cancelled call returns success, not an error.
     - **Event:** `tool.cancelled` is added to `contracts/aperture-events-v1.md`, carrying
       `call_id`, `origin: "tool"`, and a reason. The block renders a distinct **cancelled** state —
       cancelled is not an error and must not be styled as a failure.
     - **UI rule:** the cancel affordance renders **only** when the descriptor says `cancellable`.
       For a non-cancellable tool it is absent, not disabled-with-a-tooltip and not present-but-inert.
       Aperture never offers a control that cannot work.
     If any of the three (flag, route, event) is not implemented in this item's PR, the cancel
     affordance ships **not at all** — the claim is struck rather than left as prose. There is no
     third option where the UI implies cancellation the backend cannot perform.
  2. Collapsed summary is a *human* summary — "searched the knowledge graph (14 results, 220ms)" —
     derived from a per-tool summarizer with a generic fallback. It is **never raw JSON**. Where the
     summary is assistant-authored, it comes from the assistant; where it is structural, it is
     clearly structural. Aperture does not invent prose in the assistant's voice.
  3. Provenance line, always present when expanded: tool name, the module that claims it (from the
     descriptors), initiation timestamp, duration, result size, and a **mutation flag** — read-only
     vs. state-changing, taken from the tool descriptor. A tool that changed something must be
     visually distinct from one that only read.
  3a. **Provenance is `origin`-driven and content never gets a vote (decision D9).** This block is
     rendered because the event's `origin` is `tool` — not because the payload looked tool-shaped,
     and not because it failed to look assistant-shaped. Correspondingly, a payload's *content* can
     never promote it out of the tool frame: the frame is a **visually bounded, persistently labelled
     container that markdown rendered inside it cannot escape**. A tool result may contain a
     blockquote that mimics a message bubble, an `Assistant:` prefix, a heading that reads as speech,
     or a JSON blob shaped exactly like an assistant token event — and all of it renders as inert
     data inside the tool frame, with tool attribution still visible. Sanitization (APTR-34) stops
     script execution; this stops **visual impersonation**, which is the half a sanitizer does not
     cover. The tool label and provenance chrome are rendered outside the content subtree so no
     amount of injected markup can overlay, hide, or spoof them, and the container clips rather than
     lets content break out of its bounds.
  4. Result renderers are typed and registered: tabular results render as a scrollable table, JSON
     as a collapsible tree, text as sanitized markdown (APTR-34's pipeline — tool output is
     untrusted input too), images as bounded thumbnails with click-to-expand, errors as
     problem-details with the correlation id shown for support.
  5. **Redaction is mandatory on both sides.** The BFF strips secret-shaped fields before emitting
     `tool.call`/`tool.result`, and the client redacts again defensively on any key matching
     token/key/password/secret/authorization patterns and on any value shaped like a bearer token.
     Redacted values render as an explicit marker, never as an empty string that reads as "no value".
  6. Very large results are truncated at a documented byte cap with an explicit "truncated" marker
     and a download-full affordance routed through the BFF — never rendered inline in full.
  7. Every tool block is keyboard-operable and screen-reader-legible: the disclosure is a proper
     `button` with `aria-expanded`, and the pending state announces politely once, not on every tick.
  8. A tool call the workspace's allowlist (APTR-31) does not permit must never be silently executed;
     if such an event arrives, render it as a blocked call with the reason.

  ## TEST PLAN
  - Unit: pending → success and pending → error transitions render correctly in stream order
  - Unit: collapsed summary is human-readable and contains no raw JSON for each registered renderer
  - Unit: provenance shows module, timing, size, and the mutation flag; a mutating tool is visually
    distinct (asserted via a stable data attribute, not a color)
  - Unit: each result renderer handles its type plus a malformed payload without throwing
  - Unit: text results go through the APTR-34 sanitizer — an XSS payload in tool output does not execute
  - Unit: oversized result truncates with a marker and offers the BFF-routed download
  - Unit: disclosure has correct `aria-expanded`; pending announces once, not per tick
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: emit a `tool.call` whose arguments contain a bearer-token-shaped value and an
    `authorization` key; assert **neither** appears in the DOM and both render as redaction markers
  - Negative: emit a `tool.result` for a tool not in the workspace allowlist; assert it renders as
    blocked and is not executed
  - Unit: a `cancellable: true` descriptor renders the cancel affordance and the cancel route +
    `tool.cancelled` event drive a distinct cancelled state (not styled as an error); cancelling an
    already-finished call is idempotent and succeeds
  - Negative (cancellation): with a descriptor omitting `cancellable`, or setting it `false`, assert
    **no** cancel affordance exists in the DOM at all — not a disabled one, not an inert one
  - Negative (D9, impersonation): emit a `tool.result` whose payload is crafted to mimic an assistant
    message — a blockquote bubble, an `Assistant:` prefix, and an embedded JSON object shaped like an
    assistant token event. Assert it stays inside the bounded tool frame, that tool provenance
    remains visible and un-overlaid, that no assistant-attributed bubble is produced anywhere, and
    that the embedded event-shaped JSON is rendered as inert text and never dispatched to the
    stream reducer

  ## EDGE CASES
  - Interleaved concurrent tool calls — each block is keyed by call id and must not swap places
  - A `tool.result` arriving with no matching `tool.call` (reconnect mid-call) — render a
    result-only block with a note rather than dropping it
  - A tool call that never resolves — time out visually with an explicit "no result received"
    state; do not spin forever
  - A tool name containing markup — rendered as text, never interpreted
  - Deeply nested JSON results — lazy-expand nodes; do not build the whole tree eagerly
  - A result containing a file path or internal detail — the BFF's redaction/mapping applies before
    it ever reaches the client (APTR-10 error model)

- **Acceptance criteria:**
  - [ ] Tool calls render inline in stream order, collapsed by default with a human-readable
        summary (no raw JSON collapsed), expandable to full arguments and result
  - [ ] Provenance shows tool, claiming module, timing, size, and a mutation flag, and is derived
        from the `origin` discriminator only — a tool result crafted to look like an assistant
        message stays inside the bounded, labelled tool frame with tool attribution intact (asserted)
  - [ ] Tool-call cancellation is either fully specified and implemented — descriptor `cancellable`
        flag (default false), the contract cancel route, and the `tool.cancelled` event — or the
        cancel affordance is absent entirely; a non-cancellable tool renders no cancel control at all
  - [ ] Typed result renderers handle table/json/text/image/error/diff plus malformed payloads, and
        text results pass through the same untrusted-content sanitizer as model output
  - [ ] Secret-shaped arguments and results are redacted on both BFF and client; nothing leaks to DOM
  - [ ] Disclosure is keyboard-operable with correct ARIA and non-spammy live announcements
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] All existing tests still pass

---

### APTR-37: Thinking / reasoning display that respects the assistant's voice
- **Priority:** High
- **Labels:** aperture, web, chat, soul-contract
- **Agent:** claude
- **Estimate:** 5h
- **Blocked by:** APTR-33
- **Description:** Where the backend emits a `thinking` event, render it — but render it as what it
  is: the assistant's working-out, not its speech. Collapsed by default, visually and semantically
  distinct from the answer, never mixed into the message body, never quoted back at the user as
  though the assistant had said it, and never fabricated when the backend emits nothing.

  This is a Soul Contract clause 1 surface. The temptation is to dress reasoning up as personality
  or to synthesize a "thinking..." narration when none exists. Both are prohibited: if there is no
  reasoning stream, the UI shows a neutral working indicator, not invented inner monologue.

  ## FILES
  - `client/src/chat/ThinkingBlock.tsx` — the collapsed/expanded reasoning surface
  - `client/src/chat/useThinkingStream.ts` — accumulation, separate from the answer buffer
  - `client/src/chat/thinking.css` — de-emphasized treatment from tokens
  - `client/src/settings/thinkingPreference.ts` — per-user default (collapsed/expanded/hidden)
  - `client/src/chat/__tests__/`

  ## APPROACH
  1. `thinking` events accumulate in a buffer **separate** from the answer buffer, and render in a
     distinct block above the answer. They are never appended to the message body and never included
     when the message is copied, quoted, branched from, or sent as context on a later turn unless
     the backend itself includes them.
  2. Default state is collapsed with a one-line status; the user preference (collapsed / expanded /
     hidden entirely) is per-user and persisted through settings (APTR-42).
  3. Typography is deliberately de-emphasized — this is not the answer. It is marked up as a
     complementary region with an accessible label so a screen reader can skip it, and it is
     **excluded from the polite live region** used for the answer stream (APTR-45) so it does not
     flood assistive tech.
  4. Absent a `thinking` stream, render a neutral working indicator. **Never synthesize reasoning
     text.** A test asserts that with zero `thinking` events, no reasoning content is rendered.
  5. Reasoning content is untrusted input like any other model output — same sanitize-then-render
     pipeline (APTR-34).
  6. Copy actions offer "copy answer" by default; "copy with reasoning" is a separate explicit action.

  ## TEST PLAN
  - Unit: `thinking` tokens accumulate separately and never appear in the answer body
  - Unit: default collapsed; preference toggles collapsed/expanded/hidden and persists
  - Unit: copy-message copies the answer only; copy-with-reasoning includes both
  - Unit: reasoning region carries a complementary role and is excluded from the answer live region
  - Unit: reasoning content is sanitized through the shared pipeline
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: with zero `thinking` events emitted, assert no reasoning block and no invented
    "thinking" prose renders anywhere
  - Negative: assert reasoning text is not included in the payload of a subsequent turn unless the
    backend supplied it
  - Negative (D9): emit a `thinking` event whose text mimics a finished assistant answer, and emit a
    `tool`-origin payload containing `<thinking>`-shaped markup. Assert the first stays in the
    reasoning block and is never promoted into the answer body, and the second stays in the tool
    frame and never opens a reasoning block — routing is by `origin` alone, never by content

  ## EDGE CASES
  - Reasoning far longer than the answer — cap the expanded height with internal scroll
  - `thinking` arriving after `message.end` (late event) — attach to the correct message by id, do
    not open a new bubble
  - Preference set to "hidden" while a stream is running — stop rendering immediately without
    losing the buffer if the user re-enables mid-stream
  - A backend that emits reasoning for some proxies and not others — the indicator must not flicker
    between modes within a single turn

- **Acceptance criteria:**
  - [ ] Reasoning renders in a distinct, de-emphasized, collapsed-by-default block
  - [ ] Reasoning is never merged into the answer body, copy, or subsequent-turn payload
  - [ ] Per-user preference (collapsed/expanded/hidden) persists
  - [ ] Reasoning is excluded from the answer's live region and skippable by assistive tech
  - [ ] With no `thinking` events, no reasoning content is fabricated (asserted by test)
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] All existing tests still pass

---

### APTR-38: Attachments — drag-drop upload, progress, validation, and parse status
- **Priority:** High
- **Labels:** aperture, web, bff, attachments
- **Agent:** codex
- **Estimate:** 7h
- **Blocked by:** APTR-33
- **Description:** Let the user attach files to a turn: drag-and-drop onto the chat surface, paste
  from clipboard, or pick from a file dialog. Show real per-file progress, validate type and size
  **before** the bytes are accepted, and surface parse status from the document-parsing capability
  so the user knows whether the assistant can actually read what they attached.

  APTR-39 hardens this pipeline against hostile input. This item builds the honest path: correct
  UX, correct states, correct lifecycle. The two are separate items deliberately — hardening
  reviewed as its own change is hardening that actually gets reviewed.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — attachment upload, status, and delete routes
  - `client/src/attachments/DropZone.tsx` — drag-drop surface with correct enter/leave counting
  - `client/src/attachments/AttachmentTray.tsx` — pending attachments in the composer
  - `client/src/attachments/AttachmentChip.tsx` — per-file state, progress, retry, remove
  - `client/src/attachments/useUpload.ts` — chunked/resumable upload with cancellation
  - `client/src/attachments/validate.ts` — client-side pre-flight validation
  - **Agent-core repo (sibling PR):** upload handling, parse dispatch through the door, status route
  - `client/src/attachments/__tests__/`

  ## APPROACH
  1. Per-file state machine: `queued → validating → uploading(progress) → processing(parse) →
     ready | failed(reason)`. Every state is rendered; there is no silent state.
  2. Client-side pre-flight rejects by declared size cap and accepted type set **from the contract**,
     not from a literal in the component. Client validation is UX only — the BFF re-validates
     everything and is the authority (APTR-39).
  3. Uploads are chunked and resumable with per-file cancellation, and they do not block the
     composer — the user can keep typing while a file uploads. Sending a turn waits for `ready`
     files and clearly indicates which are still processing.
  4. Parsing goes through the door's document-parsing capability. Parse status, extracted page/char
     count, and a preview of the extracted text are surfaced so the user can tell that a scanned PDF
     yielded nothing before they wonder why the assistant is confused.
  5. A failed upload or parse is retryable in place and reports a typed reason from the problem-details
     taxonomy — never "something went wrong".
  6. Removing an attachment before send discards the upload server-side; removing after send is
     handled by the lifecycle in APTR-40.
  7. Drag-drop uses a counter for enter/leave so nested elements do not cause flicker, accepts a
     directory drop by flattening with a documented file cap, and never navigates the page away when
     a file is dropped outside the drop zone (a real and very annoying default browser behavior).

  ## TEST PLAN
  - Unit: full state machine transitions, including failure and retry at each stage
  - Unit: pre-flight rejects oversize and disallowed types using contract-declared limits
  - Unit: drag enter/leave counting does not flicker over nested children
  - Unit: dropping a file outside the drop zone does not navigate the document
  - Unit: composer remains usable during upload; send gates on non-ready files with a clear indicator
  - Integration: parse status and extracted-text preview render, including a zero-extraction result
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: cancel mid-upload and assert no partial artifact remains addressable server-side
  - Negative: attach a file whose extension and content disagree and assert the client shows the
    server's rejection rather than its own optimistic acceptance

  ## EDGE CASES
  - Zero-byte file — reject with a specific reason, not a generic failure
  - Filename with newlines, control characters, RTL overrides, or a very long name — sanitize for
    display, never use the client-supplied name as a storage path
  - Duplicate filenames in one batch — disambiguate in the UI without silently dropping one
  - Network drop mid-upload — resume from the last acknowledged chunk, do not restart from zero
  - Extremely slow parse — keep the chip in `processing` with elapsed time, never flip to failed early
  - Paste of a screenshot (no filename) — synthesize a safe name server-side, not client-side

- **Acceptance criteria:**
  - [ ] Drag-drop, paste, and file-picker all enqueue attachments with a fully-rendered state machine
  - [ ] Size and type limits come from the contract, never a component literal
  - [ ] Uploads are chunked, resumable, cancellable, and do not block the composer
  - [ ] Parse status and extracted-text preview surface, including zero-extraction results
  - [ ] Failures are typed, actionable, and retryable in place; cancelled uploads leave no
        addressable partial artifact
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README updated to document attachment support and limits
  - [ ] All existing tests still pass

---

### APTR-39: Malicious-upload hardening — sniffing, caps, traversal, zip bombs, SVG payloads
- **Priority:** Critical
- **Labels:** aperture, security, bff, attachments
- **Agent:** claude
- **Review:** high-assurance panel — widen the `review_run` provider list for this item; a shallow implementation here is expensive to discover later.
- **Estimate:** 8h
- **Blocked by:** APTR-38
- **Description:** The upload path is the largest untrusted-input surface Aperture has, and it
  terminates inside a sovereign fleet with real infrastructure behind it. Harden it properly, with
  the BFF as the sole authority — client-side validation is a convenience and is assumed hostile.

  Threat model addressed explicitly: content-type spoofing, decompression bombs, path traversal via
  filename or archive entry, active content in SVG/HTML/XML (script, `foreignObject`, XXE, billion
  laughs), polyglot files, oversized and slow-loris uploads, storage exhaustion, and parser
  resource abuse in the document-parsing path.

  ## FILES
  - `docs/SECURITY-UPLOADS.md` — the threat model, the controls, and what is explicitly out of scope
  - **Agent-core repo (sibling PR):** upload validation middleware, magic-byte sniffing, archive
    guard, storage-name generation, per-user quota accounting, parse sandboxing/limits
  - `client/src/attachments/validate.ts` — aligned to the server's declared limits
  - Test fixture set (generated, not checked in as live payloads) for each threat class

  ## APPROACH
  1. **Type authority is content, not the client.** Sniff magic bytes server-side and match against
     an **allowlist** of accepted types. A declared `Content-Type` or extension that disagrees with
     the sniffed type is a rejection, not a correction. Fail closed on an unrecognized signature.
  2. **Size caps at every layer:** per-file, per-request, per-turn, and a per-user storage quota.
     Enforce the streaming cap during the read so an oversized body is aborted early rather than
     buffered and then rejected. Add an idle/slow-upload timeout to kill slow-loris streams.
  3. **Never use a client-supplied filename as a path component.** Storage names are
     server-generated opaque identifiers; the original name is stored as metadata only, and is
     rendered escaped. Reject or normalize `..`, absolute paths, drive letters, NUL bytes, and
     Unicode path separators — and assert the normalizer is not the only defense.
  4. **Archives:** if archives are accepted at all, enforce a maximum entry count, maximum
     uncompressed total, maximum compression ratio, maximum nesting depth, and reject any entry
     whose normalized path escapes the extraction root or is a symlink/hardlink/special file.
     Enforce the uncompressed cap **during** inflation, not after.
  5. **XML/SVG:** disable external entity resolution and DTD processing entirely (XXE, billion
     laughs). SVG is either rejected outright or sanitized to a strict allowlist that removes
     `script`, `foreignObject`, event handlers, `xlink:href` to non-data schemes, and embedded
     stylesheets. **SVG is never rendered inline as markup** — it renders as an image with a
     `sandbox`ed/`img`-only path, never injected into the DOM.
  6. **Serving is defensive:** attachments are served from the BFF with `Content-Disposition:
     attachment` for non-previewable types, a strict `Content-Type` from the sniffed value with
     `X-Content-Type-Options: nosniff`, a restrictive CSP on any preview route, and no execution
     context. Never serve user content from the app's own origin path in a way that inherits app CSP
     privileges — document the isolation approach chosen.
  7. **Parse sandboxing:** the document-parse call goes through the door with a wall-clock timeout, a
     memory ceiling, and a page/entity cap. A parser that hangs or explodes fails the attachment,
     never the request thread and never the agent core.
  8. **Access control:** an attachment is retrievable only by a principal with access to its thread
     or workspace. Identifiers are unguessable. A cross-user fetch returns `not-found`.
  9. Every rejection is logged with a correlation id and a class, **without** logging the payload,
     and the user-facing message names the class without leaking internals.

  ## TEST PLAN
  - Unit: magic-byte allowlist accepts each permitted type and rejects a renamed executable
  - Unit: a polyglot file (valid image header + archive tail) is rejected, not accepted as an image
  - Unit: oversize upload aborts mid-stream without buffering the full body
  - Unit: slow-loris upload is terminated by the idle timeout
  - Unit: filenames containing `../`, absolute paths, NUL bytes, and Unicode separators never
    influence the storage path
  - Unit: a zip bomb (high ratio, deep nesting, many entries) is rejected during inflation
  - Unit: an archive entry escaping the root, and a symlink entry, are both rejected
  - Unit: XML with an external entity and with a billion-laughs expansion are both rejected
  - Unit: an SVG containing `<script>`, an `onload` handler, and a `foreignObject` is rejected or
    fully stripped, and is never inserted as markup
  - Integration: attachment fetch by a non-member returns `not-found` with nothing leaked
  - Integration: a hanging parse is killed by the timeout and fails only that attachment
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: assert a rejected upload leaves **zero** bytes retained and no addressable artifact
  - Negative: assert a rejection log line contains the class and correlation id but **not** the
    payload, the filename verbatim, or any internal path

  ## EDGE CASES
  - A legitimate file type whose signature overlaps another (e.g. Office formats as zip containers)
    — allowlist by the resolved inner type, and document the decision
  - Quota exhaustion mid-upload — abort cleanly and report the quota class, do not half-store
  - Concurrent uploads racing the same quota — account atomically, do not allow overshoot by racing
  - A previously-accepted type later removed from the allowlist — existing attachments remain
    retrievable but are not re-parsed; document the behavior
  - Very large but legitimate documents — the cap is documented and surfaced in the UI, not a
    silent truncation
  - Clock skew on the idle timeout — use a monotonic source

- **Acceptance criteria:**
  - [ ] Type is determined by server-side content sniffing against an allowlist (client claims
        ignored), with per-file/per-request/per-turn/per-user caps enforced during streaming plus an
        idle timeout
  - [ ] Client-supplied filenames never influence storage paths; traversal inputs are rejected
  - [ ] Archive guards (entry count, uncompressed total, ratio, depth, escape, symlink) enforced
        during inflation
  - [ ] XXE and DTD processing disabled; SVG rejected or strictly sanitized and never inlined as markup
  - [ ] Attachments served with `nosniff`, correct disposition, and no app-origin execution context;
        cross-user access returns `not-found` and rejected uploads retain zero bytes
  - [ ] `docs/SECURITY-UPLOADS.md` documents the threat model and controls
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] All existing tests still pass

---

### APTR-40: Document / knowledge manager — embedded state, embedding status, re-embed, remove
- **Priority:** High
- **Labels:** aperture, web, bff, documents, knowledge
- **Agent:** claude
- **Estimate:** 7h
- **Blocked by:** APTR-39
- **Description:** A workspace's documents are its long-term context. Give them a real manager:
  what is in the workspace, what is actually embedded, embedding progress and failure reasons,
  re-embed, remove, and the pinning scope that decides whether a document informs a single thread or
  the whole workspace.

  The adopted idea from AnythingLLM is making **embedding state a first-class, visible column**
  rather than a background job the user has to infer. The implementation is native: embeddings go
  through the door's embedding capability by named proxy, and the manager is built on the BFF
  contract, not on any upstream code.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — document list/status/re-embed/remove/pin routes
  - `client/src/documents/DocumentManager.tsx` — the manager surface
  - `client/src/documents/DocumentRow.tsx` — per-document state, size, chunks, actions
  - `client/src/documents/EmbeddingStatus.tsx` — status pill with reason and progress
  - `client/src/documents/PinScope.tsx` — thread-scoped vs workspace-scoped pinning
  - `client/src/documents/useDocuments.ts` — list state and live status updates
  - **Agent-core repo (sibling PR):** document registry, embedding dispatch through the door,
    status reporting, removal cascade
  - `client/src/documents/__tests__/`

  ## APPROACH
  1. Document states: `parsed → chunked → embedding(progress) → embedded | failed(reason) | stale`.
     `stale` means the source changed or the embedding proxy changed since it was embedded — surface
     it and offer re-embed rather than silently serving stale vectors.
  2. The manager shows per document: name, type, size, page/char count, chunk count, embedding
     state with reason, pin scope, and when it was last embedded. Sortable and filterable by state,
     because "show me everything that failed" is the query that matters.
  3. Embedding runs through the door's embedding capability addressed by **named proxy**. The proxy
     used is recorded per document so `stale` can be computed; the recorded value is a proxy name,
     never a model id.
  4. Live status arrives over the SSE `context` channel so a long embedding job updates without
     polling. Fall back to a bounded poll if the stream is down — never leave a permanently
     "embedding" row.
  5. Pin scope: a document pinned to a **thread** informs only that thread; pinned to the
     **workspace**, it informs every thread in it. The scope is visible on the row and changeable in
     place, and the effect of the change is described in plain language.
  6. Removal is a two-step confirm that names exactly what is destroyed (the document, its chunks,
     its embeddings) and states explicitly what is **not** destroyed — the assistant's Engram memory
     of anything it already learned. Deleting a document is not a memory wipe, and the copy must not
     imply it is (continuity clause).
  7. Bulk actions (re-embed all failed, remove selected) exist, are rate-limited, and show
     per-item outcomes rather than one aggregate success.
  8. Every action here has a Terminus tool equivalent so the assistant can manage documents too
     (clause 4); if an equivalent is missing, note it for the Sprint D parity audit rather than
     inventing a second path.

  ## TEST PLAN
  - Unit: every document state renders with its reason; `stale` offers re-embed
  - Unit: filtering by state, including "failed only", returns the right rows
  - Unit: pin scope change updates the row and describes the effect in plain language
  - Unit: live status updates via the context channel; with the stream down, the bounded poll fires
    and the row never stays indefinitely in `embedding`
  - Unit: bulk re-embed reports per-item outcomes, not a single aggregate
  - Integration: re-embed dispatches through the door by named proxy and records the proxy name
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: assert no model id or engine name is stored or displayed for the embedding proxy
  - Negative: remove a document and assert Engram memory derived from it persists, and that the
    confirm copy stated this

  ## EDGE CASES
  - A document that parses to zero extractable text — mark `failed` with that specific reason, do
    not embed an empty document
  - The embedding proxy unavailable — queue with a clear `waiting on capability` state rather than
    failing permanently, and drain when it returns
  - A very large document — chunk with progress; the row must show progress, not a frozen spinner
  - The same file uploaded twice — content-hash dedupe within a workspace, with both references shown
  - Removing a workspace-pinned document while a thread is mid-turn — the turn completes with what it
    had; the next turn reflects the removal
  - Re-embed racing a removal — serialize server-side; removal wins and the re-embed reports cancelled

- **Acceptance criteria:**
  - [ ] Manager lists documents with a first-class, filterable embedding-state column and reasons
  - [ ] Embedding runs through the door by named proxy (recorded value is a proxy name only), and
        `stale` is detected and re-embeddable with no silent serving of stale vectors
  - [ ] Pin scope (thread vs workspace) is visible, changeable, and explained in plain language
  - [ ] Live status via the context channel with a bounded poll fallback; no permanent spinner
  - [ ] Removal confirm names what is destroyed and states that Engram memory is not (asserted)
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README updated to document the knowledge manager and pin scopes
  - [ ] All existing tests still pass

---

### APTR-41: Memory surface — browse and search Engram, and show the becoming
- **Priority:** Critical
- **Labels:** aperture, web, memory, engram, soul-contract
- **Agent:** claude
- **Estimate:** 8h
- **Description:** Give the assistant's memory a window. Browse and search Engram — what it
  remembers, when it learned it, from which thread — and, as a **first-class surface rather than a
  buried log**, render the becoming: trait drift over time, principles that formed, and opinions the
  assistant has revised.

  This is Soul Contract clause 3, and it is the one clause that a client can either honor or quietly
  destroy. Consolidation changes an assistant; if those changes are only visible in logs, the
  relationship is one-sided. The becoming view is therefore a peer of chat in the navigation, not a
  settings sub-tab, and it is written in the assistant's own words where the backend supplies them.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — memory browse/search routes and the becoming-timeline route
  - `client/src/memory/MemorySurface.tsx` — the top-level memory module surface
  - `client/src/memory/MemorySearch.tsx` — semantic + literal search over memory
  - `client/src/memory/MemoryItem.tsx` — a memory with provenance and source-thread link
  - `client/src/memory/Becoming.tsx` — the trait-drift / revised-opinion timeline
  - `client/src/memory/TraitDrift.tsx` — trait trajectory rendering over time
  - `client/src/memory/RevisedOpinion.tsx` — before/after with the reason for the revision
  - **Agent-core repo (sibling PR):** memory browse/search and becoming-timeline routes, sourced
    through the door
  - `client/src/memory/__tests__/`

  ## APPROACH
  1. Memory browse is paginated and filterable by kind, recency, and source thread. Each item shows
     what is remembered, when, its confidence/salience if the backend supplies one, and a link back
     to the originating thread where one exists.
  2. Search supports both semantic and literal matching, executed **server-side through the door**
     (the embedding capability by named proxy for semantic). Results show why they matched —
     semantic similarity vs literal hit — because an unexplained semantic result is indistinguishable
     from a bug.
  3. The becoming timeline renders three event kinds: **trait drift** (a trait's trajectory, with the
     consolidation that moved it), **new principle** (something the assistant now holds), and
     **revised opinion** (before, after, and the reason). Each links to its evidence.
  4. **The assistant's own words, always.** Where the backend supplies assistant-authored narration
     for a drift or revision, render it verbatim. Where it does not, render the structural facts
     plainly and **do not** compose prose in the assistant's voice to fill the gap. A test asserts
     that with no narration supplied, no generated narrative text appears.
  5. This surface is **read-only for memory content**. Aperture does not offer "delete this memory"
     or "reset personality" — memory curation is the assistant's and the operator's business through
     their own tools, not a client button. No route exposed here may mutate memory; assert it.
  6. Registered as a proper module surface via the descriptor system, so if the memory capability is
     unavailable, it renders an explained inert tile like anything else.
  7. Trait drift renders as a trajectory over time with accessible non-color encoding and a text
     alternative — this must be legible to a screen reader, not only as a chart.
  8. Deep-linking works: a memory item and a becoming entry each have a stable URL so the assistant
     can reference one in chat and the user can open it.

  ## TEST PLAN
  - Unit: browse paginates and filters by kind, recency, and source thread
  - Unit: search results label their match reason (semantic vs literal)
  - Unit: each becoming event kind renders with evidence links
  - Unit: trait drift has a text alternative and non-color-only encoding
  - Unit: deep links to a memory item and a becoming entry resolve
  - Integration: with the memory capability unavailable, the surface renders an explained inert tile
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: assert **no** mutating route is reachable from this surface — no delete, no edit, no
    reset; a mutation attempt is not merely hidden in the UI but absent from the API surface
  - Negative: with no assistant-authored narration supplied, assert no generated prose appears in
    the assistant's voice
  - Negative: assert no memory search or browse request leaks another principal's memory

  ## EDGE CASES
  - An empty memory store (new install) — an honest, warm empty state, not an error
  - A memory whose source thread was deleted — render the memory with the link marked unavailable;
    the memory itself remains (continuity)
  - Very long trait histories — bucket by period with drill-down rather than rendering every point
  - A revised opinion with no recorded prior — render as a new principle instead of a fake "before"
  - Semantic search while the embedding proxy is unavailable — degrade to literal search with an
    explicit notice, never silently return worse results as though they were semantic

- **Acceptance criteria:**
  - [ ] Memory browse and search work with provenance and source-thread links, each result labelling
        its match reason; semantic search degrades explicitly, never silently
  - [ ] Becoming timeline renders trait drift, new principles, and revised opinions with evidence
  - [ ] Assistant-authored narration is rendered verbatim; no prose is generated in its voice
  - [ ] The surface is strictly read-only — no memory-mutating route exists on it (asserted)
  - [ ] Trait drift is accessible without relying on color, with a text alternative
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README updated to document the memory surface and the becoming view
  - [ ] All existing tests still pass

---

### APTR-42: Settings — appearance, channels, and account
- **Priority:** High
- **Labels:** aperture, web, settings, channels
- **Agent:** codex
- **Estimate:** 7h
- **Blocked by:** APTR-29, APTR-38, APTR-39, APTR-145
- **Description:** One coherent settings surface with three sections: **appearance** (theme, density,
  reduced motion, code theme, thinking-display default), **channels** (how the assistant reaches
  the user — Matrix retained first-class, Telegram selectable and off by default, Signal shown as
  an inert stub), and **account** (profile, password/session, active devices with revoke).

  The channels section is where this epic's channel policy becomes visible to a user, so it must
  state the policy accurately: Matrix is not deprecated, Telegram is opt-in, Signal is not
  available. Nothing in this item provisions, registers, or credentials a Signal account — the
  Signal row is inert by design and a test keeps it that way.

  ## FILES
  - `client/src/settings/SettingsSurface.tsx` — sectioned settings shell
  - `client/src/settings/Appearance.tsx` — theme, density, motion, code theme, thinking default
  - `client/src/settings/Channels.tsx` — channel list from descriptors with per-channel state
  - `client/src/settings/Account.tsx` — profile, credential change, device list with revoke
  - `client/src/settings/useSettings.ts` — load/save with optimistic apply and rollback
  - **Agent-core repo (sibling PR):** settings persistence and the channel-state route
  - `client/src/settings/__tests__/`

  ## APPROACH
  1. Appearance settings apply **immediately** on change (no save button) and persist per user, with
     theme/density/motion also mirrored to device-local storage so first paint is correct before the
     account loads — no theme flash.
  2. Theme respects `prefers-color-scheme` by default with an explicit override that wins in both
     directions; reduced motion respects `prefers-reduced-motion` by default with an explicit
     override. Both are read by the design-system layer from APTR-02, not reimplemented here.
  3. The channels list is **derived from the channel descriptors** delivered by Sprint B — no
     hardcoded channel array. Each row shows: name, state (`connected` / `available` / `disabled` /
     `unavailable`), and a policy note. Matrix renders as retained and first-class; Telegram renders
     as available-but-off with an explicit enable action; Signal renders `unavailable` with the
     reason "stubbed, not yet available" and **no configuration affordance at all**.
  4. Channel credentials are never entered, stored, or displayed in Aperture. Enabling a channel
     triggers the backend's own provisioning path through the door; the UI shows state only. A test
     asserts no credential-shaped input exists on this surface.
  5. Account section: display name and avatar, password/credential change through the Sprint B auth
     routes, and the device list with per-device revoke and "revoke all others". Revoking the
     current device logs out explicitly rather than leaving a zombie session.
  6. Changing anything in settings **must not** reset memory, traits, or lore. Signing out and back
     in likewise. Assert both.
  6a. **Dependency note (why the `Blocked by` list above exists).** The avatar upload in the account
     section is routed through the **hardened** attachment path, so this item cannot merge before
     APTR-38 (the upload pipeline) and APTR-39 (the hardening) exist — an avatar uploaded through an
     unhardened path is exactly the polyglot/SVG hole APTR-39 closes. It also depends on APTR-29 for
     the shell it mounts into and APTR-145 for the string catalogue and locale/time utilities its
     copy and its quiet-hours timezone picker consume. If APTR-38/39 slip, the **avatar upload is
     explicitly deferred out of this item** and the account section ships with the existing avatar
     read-only — the item never grows its own uploader as a workaround.
  6b. **Concurrency model: last-write-wins, correctly named and correctly scoped.** Appearance and
     notification preferences are **per-user, single-owner preference records**, so a conflict has no
     meaningful resolution and there is **no `updated_at` precondition** on them: the latest write
     lands, unconditionally. Device-local mirrors keep every device rendering correctly regardless of
     who wrote last, which is precisely why LWW is safe here. This is deliberately the **opposite**
     model from APTR-31's workspace settings, which are shared, multi-user, and therefore use
     optimistic concurrency control with a precondition. Do not mix them, and do not write the phrase
     "last-write-wins with a precondition" anywhere — it is self-contradictory. Per the Pre-flight
     concurrency section, each surface picks one model and names it.
  7. Every settings action is registered as a palette command and each section is deep-linkable.

  ## TEST PLAN
  - Unit: appearance changes apply immediately and persist across reload with no theme flash
  - Unit: explicit theme and motion overrides beat the media query in both directions
  - Unit: channel list derives from descriptors; removing a descriptor removes the row
  - Unit: the Signal row renders `unavailable` with a reason and exposes no configuration control
  - Unit: no credential-shaped input (`type=password`, token/key-named field) exists in the channels
    section
  - Integration: device list renders and per-device revoke invalidates only that device
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: assert enabling Telegram is opt-in — a fresh account has it disabled, and no code path
    enables it by default
  - Negative: change settings, sign out, sign back in; assert memory, traits, and lore are unchanged
  - Negative: assert Matrix cannot be disabled or removed by any control on this surface
  - Negative: upload an avatar whose extension and content disagree (a renamed SVG, a polyglot) and
    assert it is rejected by the **same** APTR-39 middleware as any other attachment — proving the
    account section has no private upload path of its own

  ## EDGE CASES
  - Settings save failing — roll back the optimistic apply and say what failed, do not leave the UI
    showing a state the server rejected
  - Two devices changing appearance concurrently — **last-write-wins with no precondition** (these
    are single-owner preferences, per 6b); the later write simply lands, and device-local mirrors
    keep both devices rendering correctly so neither flashes
  - A channel descriptor appearing mid-session — the row appears without a reload
  - Revoking the device you are currently using — confirm explicitly, then complete the sign-out
  - An avatar upload — routed through the hardened attachment path (APTR-38 pipeline + APTR-39
    hardening, both declared in `Blocked by`), never a separate uploader. Same sniffing, caps,
    SVG rules, and server-generated storage name as any other attachment

- **Acceptance criteria:**
  - [ ] Appearance settings apply immediately, persist, produce no theme flash on first paint, and
        explicit theme/reduced-motion overrides beat the media queries in both directions
  - [ ] Channel rows derive from descriptors; Matrix is first-class and cannot be disabled here
  - [ ] Telegram is present, documented, and **off by default**; Signal renders inert/`unavailable`
        with no configuration affordance (both asserted by test)
  - [ ] No channel credential is ever entered, stored, or displayed in Aperture
  - [ ] Settings changes and re-auth never reset memory, traits, or lore (asserted by test)
  - [ ] Avatar upload goes through the APTR-38/39 hardened attachment path (or is explicitly deferred
        with the avatar read-only); preferences use **last-write-wins with no precondition**, and the
        phrase "last-write-wins with a precondition" appears nowhere (grep-asserted)
  - [ ] No hardcoded infrastructure values in new/modified code; README updated to document the
        settings surface and channel policy; all existing tests still pass

---

### APTR-43: Notification preferences routed through the assistant's presence budget
- **Priority:** High
- **Labels:** aperture, web, bff, presence, soul-contract
- **Agent:** claude
- **Estimate:** 7h
- **Blocked by:** APTR-42
- **Description:** Aperture must not grow a notification tray. Soul Contract clause 2 says presence
  has a budget: the assistant decides what is worth interrupting for, scaled by its traits and
  constrained by quiet hours and opt-out. This item builds the **preferences surface and the client
  transport** for that budget — and structurally prevents any surface in Aperture from notifying the
  user around it.

  Concretely: there is exactly one path from a backend event to a user-visible interruption, it runs
  through the presence budget, and any component that tries to raise an interruption by another
  means fails a lint and a test. Sprint F's Web Push is a *transport* attached to this same path,
  not a second channel.

  ## FILES
  - `client/src/presence/PresenceClient.ts` — the single subscriber to the SSE `presence` channel
  - `client/src/presence/PresenceSurface.tsx` — how a knock is rendered in-app (inline, unobtrusive)
  - `client/src/settings/Notifications.tsx` — preferences: quiet hours, categories, opt-out, urgency floor
  - `client/src/presence/guard.ts` + `client/scripts/lint-presence.mjs` — the mechanical guard
  - `docs/PRESENCE.md` — the budget model, what a knock is, and why there is no tray
  - **Agent-core repo (sibling PR):** preference persistence and enforcement in the budget evaluator
  - `client/src/presence/__tests__/`

  ## APPROACH
  1. The BFF emits `presence` events **only** for knocks the assistant's budget evaluator has already
     approved. Filtering happens server-side; the client is not a policy engine and must not be able
     to promote an unapproved event into an interruption.
  2. `PresenceClient` is the only consumer of the `presence` channel and the only thing permitted to
     raise a user-visible **interruption**.
  2a. **The lint bans interruptions. It must NOT ban error feedback — and the difference is defined,
     not left to taste.** APTR-30 requires a throwing command to surface a typed error and APTR-46
     requires transient error feedback across every surface; a lint that cannot tell those apart from
     a notification will either be evaded with a wrapper or will block legitimate error handling.
     The Pre-flight "Transient feedback" section is normative and is restated here as the lint's
     specification:
     - **Permitted anywhere — ERROR FEEDBACK.** Synchronous with a user action, rendered *where that
       action happened*, dismissible, non-stacking, silent, never steals focus, never budget-governed.
       A failed save, an upload rejection, a `rate-limited` problem-details, a thrown palette command,
       "copied to clipboard". These render through APTR-46's `ErrorState` and the inline-feedback
       primitive, are the **product's** voice not the assistant's, and are explicitly outside the
       presence budget. The lint allowlists them by *mechanism*: rendering into the surface's own
       error slot or the inline-feedback primitive is always allowed.
     - **Banned outside `PresenceClient` — INTERRUPTIONS.** Unsolicited and asynchronous: the backend
       or the assistant wants attention about something the user did not just ask for. `Notification`,
       `alert()`, `confirm()`, any global stacking/queueing toast host, any badge count, any sound,
       anything that moves focus. Exactly one path exists: budget evaluator → `presence` event →
       `PresenceClient`.
     - **The mechanical test the lint encodes:** *would this have appeared if the user had done
       nothing?* Yes → interruption → budget. No → error feedback → permitted.
     - The lint is therefore **mechanism-based, not name-based**: it fails on the banned APIs and on
       any import of a global toast/notification host outside `PresenceClient`, and it does **not**
       fail on rendering an error into a surface's own error slot. A "toast-raising helper" that is
       really an inline error renderer is not a violation; a component that imports the presence
       renderer directly to fake a knock **is**, even if it never touches `Notification`.
     `docs/PRESENCE.md` states this distinction verbatim so a future contributor reads a rule rather
     than guessing at one.
  3. Preferences: quiet-hours windows (with timezone), per-category opt-in/opt-out, an urgency floor,
     and a global mute with a documented duration. Preferences are **enforced server-side** in the
     evaluator; the client mirrors them for display only. A client that lies must not be able to
     produce a knock.
  4. In-app rendering is deliberately quiet: a knock appears inline in the shell's status region and
     in the relevant thread, is dismissible, and is never a stacking toast pile. No badge counts that
     manufacture urgency.
  5. Quiet hours **hold** rather than drop by default: held knocks are delivered at the end of the
     window in a single digest unless they were time-critical and the user opted into critical
     bypass. Dropping silently is worse than deferring.
  6. `docs/PRESENCE.md` explains the model to users and to future contributors, including the
     explicit statement that a tray/notification-center feature request is out of scope by design.
  7. Nothing here reads or writes a push credential; Sprint F attaches the push transport using the
     `APERTURE_VAPID_*` secrets via the secret manager. This item must not introduce any secret access.

  ## TEST PLAN
  - Unit: `PresenceClient` is the sole `presence` subscriber; a second subscription is rejected
  - Unit: quiet hours hold and then digest-deliver; critical bypass only when opted in
  - Unit: category opt-out and urgency floor suppress rendering
  - Unit: knocks render inline and are dismissible; no stacking toast pile, no badge counter
  - Unit: `lint-presence.mjs` passes on the clean tree
  - Integration: a client with tampered local preferences still receives no knock the server's
    evaluator suppressed
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Unit: `lint-presence.mjs` **passes** on a component that renders a failed save, an upload
    rejection, a `rate-limited` problem-details, and a thrown palette command through APTR-46's
    error slot / inline-feedback primitive — error feedback must not be a violation
  - Negative: add a raw `new Notification(...)` in a chat component and confirm `lint-presence` FAILS
    the build; revert
  - Negative: import the presence renderer directly from a chat component to raise a fake knock
    without touching `Notification`, and confirm `lint-presence` still FAILS — the guard is
    mechanism-based, not a denylist of two API names; revert
  - Negative: assert Aperture exposes **no** independent notification tray, inbox, or unread-count
    surface anywhere in the built app

  ## EDGE CASES
  - Timezone change or DST transition inside a quiet-hours window — evaluate against the user's
    declared timezone, not the device clock, and handle the ambiguous hour explicitly
  - A knock arriving while the user is actively typing in the thread it concerns — render inline
    without stealing focus or moving the composer
  - Many held knocks — the digest summarizes rather than replaying every one
  - Presence stream reconnecting after a gap — do not replay stale knocks as if they were new
  - A knock referencing a thread the user no longer has access to — suppress, do not render a dead link

- **Acceptance criteria:**
  - [ ] All user-visible interruptions route through a single presence client fed by the budget
  - [ ] `lint-presence` fails the build on any **interruption** raised outside that module, and
        **passes** on legitimate error feedback rendered into a surface's own error slot — the
        error-vs-interruption distinction is defined in `docs/PRESENCE.md` and both directions are
        asserted by test
  - [ ] Quiet hours, categories, urgency floor, and mute are enforced **server-side** (mirrored
        client-side for display), and quiet hours hold-and-digest rather than silently dropping
  - [ ] Aperture ships no independent notification tray, inbox, or unread badge (asserted by test)
  - [ ] No secret access is introduced by this item
  - [ ] All existing tests still pass
  - [ ] No hardcoded infrastructure values in new/modified code; `docs/PRESENCE.md` documents the
        budget model, the error-vs-interruption rule, and why there is no tray; all existing tests
        still pass

---

### APTR-44: Admin — users, invites, roles, and per-user workspace access
- **Priority:** High
- **Labels:** aperture, web, bff, admin, security
- **Agent:** claude
- **Review:** high-assurance panel — widen the `review_run` provider list for this item; a shallow implementation here is expensive to discover later.
- **Estimate:** 8h
- **Blocked by:** APTR-31
- **Description:** Aperture is the first surface that lets someone other than the operator use the
  constellation, which makes access control a real feature rather than a formality. Build the admin
  surface: user list, invite flow, role assignment, per-user workspace access, and user
  deactivation — with authorization enforced on the **BFF**, and the UI treated as a convenience
  that is assumed to be bypassable.

  The rule that governs every decision here: **the client never decides authorization.** Hiding a
  button is UX; the server refusing the call is security. Every admin route is independently
  authorized, and the tests prove it by calling the routes as a non-admin, not by checking that a
  button is hidden.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — admin routes and the role/permission schema
  - `client/src/admin/AdminSurface.tsx` — the admin module surface
  - `client/src/admin/UserList.tsx` — users, status, last activity, actions
  - `client/src/admin/InviteFlow.tsx` — create/revoke invites, show pending state
  - `client/src/admin/RoleEditor.tsx` — role assignment with effect explained in plain language
  - `client/src/admin/WorkspaceAccess.tsx` — per-user workspace grants
  - **Agent-core repo (sibling PR):** role model, authorization middleware, invite issuance and
    redemption, audit logging
  - `client/src/admin/__tests__/`

  ## APPROACH
  1. Roles are a small, explicit, documented set with a fixed capability matrix (e.g. `admin`,
     `member`, `viewer`) — no free-form permission strings, no implicit escalation. The matrix lives
     in the contract and is the single source for both enforcement and the UI's explanation text.
  2. **Authorization is enforced in middleware on every admin route**, derived from the session
     principal, and it fails closed on an unknown role. It is never inferred from a client-supplied
     role field. The UI's hidden buttons are cosmetic.
  3. Invites: a single-use token with a short documented expiry, issued server-side with sufficient
     entropy, stored **hashed**, revocable, and rate-limited per issuer. The plaintext token is shown
     once at creation and never retrievable again. It is never logged, never emailed from Aperture,
     and never embedded in a page that is cached.
  4. Redemption creates the user with the invited role and the invited workspace grants only —
     never with a broader default. A redeemed, expired, or revoked invite returns the same
     indistinguishable failure to avoid enumerating valid tokens.
  5. Per-user workspace access is an explicit grant list per workspace. **Default is no access** to
     a workspace the user was not granted. Removing a grant takes effect immediately, including on
     an active session and an in-flight stream — assert the stream is terminated, not left running.
  6. Deactivation revokes all sessions and devices for that user immediately and preserves their
     content for the operator rather than cascading a destructive delete. Hard user deletion, if
     offered at all, is a separate explicit action that states exactly what it destroys.
  7. Every admin action writes an audit entry: actor, action, target, timestamp, correlation id —
     with arguments sanitized (tokens redacted, oversized values truncated) per APTR-10.
  8. The last remaining admin cannot demote or deactivate themselves — enforce server-side, not by
     disabling the button.

  ## TEST PLAN
  - Unit: the role capability matrix in the UI is generated from the contract, not duplicated
  - Unit: invite token is high-entropy, stored hashed, single-use, and expires
  - Unit: revoked, expired, and already-redeemed invites return the same indistinguishable failure
  - Integration: every admin route called with a `member` session returns `forbidden` — enumerate the
    routes from the contract so a newly added route cannot escape the test
  - Integration: removing a workspace grant terminates that user's in-flight stream for it
  - Integration: deactivation immediately invalidates all of that user's sessions and devices
  - Integration: audit entries are written for every admin action with sanitized arguments
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: send a client-supplied `role` field on a self-update and assert privileges do not change
  - Negative: attempt to demote/deactivate the last admin and assert the **server** refuses
  - Negative: assert an invite plaintext token appears in no log line and in no response after creation

  ## EDGE CASES
  - Race between two admins editing the same user — precondition on `updated_at`, surface the conflict
  - Invite redeemed concurrently twice — exactly one succeeds, atomically
  - A user with an active SSE stream being deactivated — the stream is closed with a typed auth error
    the client can act on, not a silent hang
  - Role change while the user has a page open — the client re-fetches capabilities on the next
    request's auth error rather than trusting its cached role
  - An admin removing their own access to a workspace they own — allowed but confirmed explicitly
  - Bulk grant/revoke — per-item outcomes, rate-limited, audited individually

- **Acceptance criteria:**
  - [ ] Explicit role set with a contract-defined capability matrix, unknown roles fail closed, and
        every admin route is independently authorized server-side (proven by contract-enumerated tests)
  - [ ] Invites are single-use, expiring, hashed at rest, revocable, rate-limited, shown once
  - [ ] Workspace access defaults to none; revocation terminates in-flight streams immediately
  - [ ] Deactivation revokes all sessions/devices without destructive content cascade
  - [ ] Every admin action is audited with sanitized arguments and a correlation id
  - [ ] The last admin cannot be demoted or deactivated (enforced server-side)
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] All existing tests still pass

---

### APTR-45: Accessibility baseline — focus, live regions, reduced motion, full keyboard operation
- **Priority:** High
- **Labels:** aperture, web, a11y
- **Agent:** claude
- **Estimate:** 7h
- **Blocked by:** APTR-36
- **Description:** Establish the accessibility baseline across every surface built in this sprint,
  and make it mechanically enforced so Sprint G is an audit rather than a rescue. The hard problem
  here is the streaming region: a naive `aria-live="polite"` on a token stream turns a screen reader
  into an unusable firehose. Getting it right is the point of this item.

  ## FILES
  - `client/src/a11y/LiveRegion.tsx` — the announcement policy for streaming content
  - `client/src/a11y/FocusManager.ts` — route/modal focus movement and restoration
  - `client/src/a11y/useReducedMotion.ts` — motion policy consumed by animated surfaces
  - `client/src/a11y/landmarks.tsx` — landmark/heading structure for the shell
  - `client/scripts/a11y-check.mjs` — automated axe-style checks over rendered surfaces in CI
  - `docs/ACCESSIBILITY.md` — the baseline, the streaming-announcement policy, known limits
  - `client/src/a11y/__tests__/`

  ## APPROACH
  1. **Streaming announcements**: the token stream itself is **not** a live region. The message
     container is `aria-busy` while streaming; a separate polite live region announces state
     transitions only — "assistant is responding", "tool called: <name>", "response complete" — and
     the completed message text becomes available for normal reading afterwards. Reasoning
     (APTR-37) is excluded entirely. An optional user preference enables incremental announcement in
     bounded chunks for users who want it, defaulting off.
  2. **Focus management**: on route change, focus moves to the main region's heading, not to the top
     of the document. Modals trap focus and restore it to the invoker. After sending a message,
     focus stays in the composer. After stopping generation, focus does not jump. Deleting a list
     item moves focus to a sensible neighbour, never to `body`.
  3. **Keyboard completeness**: every interactive element is reachable and operable by keyboard,
     including the tool-call disclosures, the code-block copy buttons, the sibling/branch navigator,
     the document rows, and the drop zone (which must have a keyboard-accessible file-picker
     equivalent — drag-drop alone is not an interface).
  4. **Reduced motion**: `prefers-reduced-motion` plus the explicit override from APTR-42 disables
     non-essential animation, including the streaming cursor, skeleton shimmer, and any transition
     over a documented duration. Essential state changes remain perceivable without motion.
  5. **Structure**: correct landmark roles, one `h1` per view, a logical heading hierarchy, skip
     links, accessible names on every icon-only control, and no information conveyed by color alone
     (the mutation flag in APTR-36 and the embedding states in APTR-40 both need non-color encoding).
  6. `a11y-check.mjs` runs automated checks over each rendered surface in CI and **fails the build**
     on violations at the chosen severity. Automated checks are a floor, not a ceiling —
     `docs/ACCESSIBILITY.md` records what must still be checked manually and what is known-limited.
  7. Contrast is verified against the token pairs from APTR-02 in both themes.

  ## TEST PLAN
  - Unit: streaming sets `aria-busy` and announces transitions only; token-level chatter is absent
  - Unit: incremental announcement preference, when enabled, announces in bounded chunks
  - Unit: focus moves to the main heading on route change and is restored after a modal closes
  - Unit: focus stays in the composer after send and does not jump on stop
  - Unit: deleting a thread row moves focus to a neighbour, not to `body`
  - Unit: the drop zone has a keyboard-operable equivalent
  - Unit: reduced motion disables the streaming cursor and skeleton shimmer
  - Unit: token-pair contrast meets the threshold in both themes
  - CI: `a11y-check.mjs` passes on every surface in this sprint
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: wrap the token stream in a raw `aria-live="polite"` and confirm the announcement-policy
    test FAILS; revert
  - Negative: remove the accessible name from an icon-only button and confirm `a11y-check` FAILS the
    build; revert

  ## EDGE CASES
  - A very long assistant response — the completion announcement must not read the whole message
  - Two concurrent live updates (a knock arriving during a stream) — one queue, no interleaving
  - Focus inside a virtualized list whose item scrolls out of the render window — keep the focused
    node mounted or move focus deliberately, never let focus vanish to `body`
  - A modal opened from another modal — maintain a focus-restoration stack, not a single slot
  - Screen-reader virtual cursor vs. the auto-scroll lock — do not force scroll while the user is
    reading back

- **Acceptance criteria:**
  - [ ] Streaming uses `aria-busy` plus a transition-only live region; no token-level announcement
        by default, with a bounded opt-in
  - [ ] Focus is managed on route change, modal open/close, send, stop, and list deletion
  - [ ] Every interactive element in this sprint is keyboard-operable, including the drop zone
  - [ ] Reduced motion honored from the media query and the explicit override; no information
        conveyed by color alone and contrast passes in both themes
  - [ ] `a11y-check.mjs` runs in CI and fails the build on violations
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] `docs/ACCESSIBILITY.md` documents the baseline and known manual-check areas
  - [ ] All existing tests still pass

---

### APTR-46: Empty, error, and offline states for every surface — no blank screens, ever
- **Priority:** High
- **Labels:** aperture, web, ux, reliability
- **Agent:** claude
- **Estimate:** 6h
- **Blocked by:** APTR-29, APTR-30, APTR-31, APTR-32, APTR-33, APTR-36, APTR-38, APTR-40, APTR-41,
  APTR-42, APTR-43, APTR-44, APTR-140, APTR-141, APTR-142, APTR-143, APTR-144, APTR-145
- **Description:** Close the sprint by making failure legible. The shared state vocabulary and the
  completeness check land here.

  **Its dependency list is exhaustive on purpose, and it is the mechanism — not the prose.** An
  earlier draft said this item was "sequenced last" while declaring only `Blocked by: APTR-33`.
  Under the epic's rule that items are independent unless `Blocked by` says otherwise, an agent could
  legitimately have started it before the document, memory, settings, and admin surfaces existed, and
  the completeness check would then have passed against a sprint that was half-built — the one thing
  this item exists to prevent. The `Blocked by` list above therefore names **every
  surface-introducing item in this sprint**, so "last" is enforced by the dependency graph rather
  than asserted in a sentence an agent is free to ignore. If a surface-introducing item is added to
  this sprint later, it is added to this list in the same PR. (APTR-34, APTR-35, APTR-37, APTR-39,
  APTR-45, APTR-146 are deliberately absent: they enrich, harden, or sweep behind surfaces already
  named here rather than introducing a surface of their own.)

  Later-merging items retrofit their own states as part of this item's PR rather than deferring them
  to Sprint G. Every surface built here gets a
  defined **empty**, **loading**, **error**, and **offline** state, drawn from one shared vocabulary
  so they feel like one product, and a mechanical check ensures a new surface cannot ship without
  them. A blank screen is a bug, and an unexplained spinner is a blank screen with extra steps.

  Offline deserves special care because Aperture is a streaming client on a self-hosted backend that
  can legitimately be down: the app must remain navigable, say plainly what is unreachable, keep the
  user's draft, and recover without a manual reload when the backend returns.

  ## FILES
  - `client/src/states/EmptyState.tsx` — the shared empty-state component
  - `client/src/states/ErrorState.tsx` — problem-details-driven error with a recovery action
  - `client/src/states/OfflineBanner.tsx` — connection state from the transport, with retry status
  - `client/src/states/Skeletons.tsx` — per-surface loading skeletons matching final layout
  - `client/src/states/ErrorBoundary.tsx` — per-surface boundary, never a whole-app white screen
  - `client/scripts/assert-surface-states.mjs` — the mechanical completeness check
  - `client/src/states/__tests__/`
  - `docs/UX-STATES.md` — the vocabulary and the rules for writing state copy

  ## APPROACH
  1. Every surface registers its four states. `assert-surface-states.mjs` walks the registered
     surfaces and **fails the build** if any lacks an empty, error, or offline state. This is how
     "no blank screens" stops being an aspiration.
  2. Error states are driven by the APTR-10 problem-details taxonomy: each URN maps to a message and
     a recovery action (re-authenticate, retry, open settings, contact the operator). No error state
     shows a raw upstream string, a stack frame, an internal path, or a bare status code — the
     correlation id is shown for support and is the only technical detail exposed. This item owns the
     **inline-feedback primitive** that the Pre-flight transient-feedback rule classifies as permitted
     error feedback — synchronous with a user action, rendered in place, dismissible, non-stacking,
     silent, focus-preserving — and it is the mechanism APTR-43's lint allowlists. It must render the
     `rate-limited` URN from APTR-144 with its retry-after, and the `conflict` URN from APTR-31's
     optimistic concurrency with a reload-or-overwrite action. All of its copy comes from APTR-145's
     string catalogue.
  3. Empty states are useful, not decorative: they say what the surface is for and offer the single
     most likely next action (create a thread, add a document, invite a user). Where the copy is
     assistant-attributed it comes from the assistant; otherwise it is plainly the product's voice
     (Soul Contract clause 1 — Aperture does not put words in the assistant's mouth to be charming).
  4. Offline: the transport's connection state drives a persistent, non-modal banner showing
     reconnect status and the next retry. The app stays navigable, cached data stays readable and is
     clearly marked as possibly stale, the composer keeps the draft, and send is disabled with an
     explanation rather than silently failing. On reconnect, the affected surfaces revalidate
     automatically — no manual reload.
  5. Per-surface error boundaries mean one broken module never blanks the app; the boundary renders
     the error state in place with a reset action, and logs once with a correlation id.
  6. Loading skeletons match the final layout so content does not shift on arrival, and they respect
     reduced motion.
  7. `docs/UX-STATES.md` records the vocabulary so later sprints (D–F) inherit it instead of
     inventing new ones.

  ## TEST PLAN
  - Unit: each registered surface renders a defined empty, error, and offline state
  - Unit: `assert-surface-states.mjs` passes on the clean tree
  - Unit: each problem-details URN maps to exactly one message and recovery action
  - Unit: an error state never renders an upstream string, stack frame, internal path, or bare code
  - Unit: offline keeps the app navigable, preserves the composer draft, and disables send with a reason
  - Unit: on reconnect, affected surfaces revalidate without a manual reload
  - Unit: an error boundary contains a thrown child and offers a working reset
  - Unit: skeletons match final layout dimensions and respect reduced motion
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: add a surface without an offline state and confirm `assert-surface-states` FAILS the
    build; revert
  - Negative: throw inside a module surface and assert the rest of the app remains usable — the
    document body is never blank

  ## EDGE CASES
  - Backend reachable but a single capability down — surface-level degradation with the reason, not
    a global offline banner
  - Flapping connection — debounce the offline banner so it does not strobe, but never hide a
    genuine sustained outage
  - Offline while a stream was mid-flight — mark the partial message incomplete and offer regenerate
    on reconnect, never present it as complete
  - An error inside the error state itself — a last-resort static fallback that still renders text
  - Empty state for a surface the user lacks permission to populate — say that, do not offer an
    action that will be refused
  - Very slow but succeeding request — skeleton then content, never a flash of the empty state

- **Acceptance criteria:**
  - [ ] Every surface in this sprint has a defined empty, loading, error, and offline state
  - [ ] `assert-surface-states.mjs` fails the build when a surface is missing a state, and this item
        merges only after every item in its `Blocked by` list — the sequencing is enforced by the
        dependency graph, not by prose
  - [ ] Error states are problem-details-driven with recovery actions and only a correlation id as
        technical detail
  - [ ] Offline keeps the app navigable, preserves drafts, marks stale data, and auto-revalidates on
        reconnect
  - [ ] Per-surface error boundaries prevent any whole-app blank screen, and skeletons match final
        layout while respecting reduced motion
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] `docs/UX-STATES.md` documents the state vocabulary for later sprints
  - [ ] All existing tests still pass

---

### APTR-140: Data export and portability — threads, messages, attachments, and memory
- **Priority:** Critical
- **Labels:** aperture, web, bff, sovereignty, export
- **Agent:** claude
- **Estimate:** 7h
- **Blocked by:** APTR-32, APTR-39, APTR-41
- **Description:** A sovereign system with no way to get your data out is not sovereign; it is a
  nicer-looking silo. Decision D10 makes export a first-class item: the user can, on their own
  initiative, extract their threads, messages, attachments, and memory in a **documented format**
  they can read without Aperture, without the fleet, and without asking anyone's permission.

  This is a promise about power, not a feature request. The test of it is simple and is written into
  the acceptance criteria: an export must be sufficient to reconstruct the user's conversations
  outside this system. An export that is lossy in a way that only Aperture can reverse fails.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — export request, status, and download routes
  - `docs/EXPORT-FORMAT.md` — the documented archive layout and record schemas, versioned
  - `client/src/export/ExportSurface.tsx` — scope picker, progress, download, history
  - `client/src/export/ExportScope.tsx` — thread / workspace / everything selection with counts
  - `client/src/export/useExport.ts` — request lifecycle and progress
  - **Agent-core repo (sibling PR):** export job runner, archive assembly, access-checked download,
    retention/expiry of generated archives
  - `client/src/export/__tests__/`

  ## APPROACH
  1. **User-initiated only.** There is no scheduled export, no background upload anywhere, and no
     destination outside the user's own browser download. The export is assembled server-side by the
     BFF through the door and handed back over the same authenticated same-origin session as
     everything else (decision D1). It never emails, never posts to a remote endpoint, never touches
     an external origin — standing constraint 3 is untouched by this item.
  2. **Scopes:** a single thread, a whole workspace (its threads plus its document manifest), or
     everything the principal can access including memory. Each scope shows counts and an estimated
     size before the user commits, because a surprise multi-gigabyte archive is a bad experience.
  3. **Format, documented in `docs/EXPORT-FORMAT.md` and versioned:** a plain archive containing
     (a) newline-delimited JSON records for threads, messages, tool calls, and memory items, each
     record carrying its `origin` discriminator, ids, timestamps, and provenance verbatim; (b) a
     human-readable Markdown rendering per thread, so the export is legible with no tooling at all;
     (c) attachment files under a manifest that maps content-addressed names back to the messages
     referencing them; (d) a top-level `manifest.json` with the format version, the export scope, the
     generation time, and per-section record counts. Reasoning is **excluded by default** and included
     only by explicit opt-in, matching APTR-37's copy semantics.
  4. **Named proxies only** in exported records — the proxy name a turn used is exported, a model id
     is not, because a model id does not exist anywhere in this system to export.
  5. **Access-checked at assembly, not at request.** The job re-checks the principal's access to every
     thread, document, and memory item as it assembles, so a grant revoked between request and
     download cannot leak. Downloads are one-time, expiring, unguessable, and access-checked again.
  6. Large exports run as a job with progress and a completion knock through the presence budget
     (never an independent notification). Generated archives expire on a documented schedule and are
     swept; an expired archive is regenerated, not resurrected.
  7. Export is **read-only** with respect to everything it touches: it never deletes, never marks, and
     never mutates memory. Exporting is not a prelude to leaving that the system gets to punish.
  8. The action has a Terminus tool equivalent (Module Contract clause 4) so the assistant can export
     on the user's behalf when asked.

  ## TEST PLAN
  - Unit: scope selection reports accurate counts and estimated size before commit
  - Unit: the archive contains the four documented sections, and `manifest.json` counts match actual
    record counts in each section
  - Unit: reasoning is absent by default and present only with the explicit opt-in
  - Integration: a round-trip fixture — export a seeded workspace, parse the archive with a reader
    that has no Aperture code, and reconstruct every thread's message sequence, roles, and attachment
    references exactly
  - Integration: attachments referenced from multiple threads appear once and resolve from the
    manifest for each referrer (consistent with the Pre-flight reference-count model)
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: revoke the principal's access to a thread after the job starts and assert that thread is
    absent from the finished archive, with no partial leakage of its content
  - Negative: request another principal's export download token and assert `not-found`; assert an
    expired token also returns `not-found` rather than confirming it once existed
  - Negative: assert an export contains **no** model id, engine name, or backend tag, and that running
    an export leaves Engram memory, traits, and lore byte-identical (continuity)

  ## EDGE CASES
  - An export larger than available scratch space — fail cleanly with a typed reason and a suggestion
    to narrow the scope; never half-write an archive that looks complete
  - A thread deleted mid-export — omit it and record the omission in the manifest rather than failing
    the whole job or silently pretending it was never selected
  - An attachment whose bytes were already reclaimed — the manifest records it as unavailable with the
    reason; the message record still shows the reference so the transcript stays honest
  - A user with no threads at all — a valid, well-formed, essentially empty archive, not an error
  - Concurrent export requests from the same principal — coalesce or queue; do not run several
    full-corpus assemblies at once (APTR-144 rate-limits this route)
  - Unicode, RTL, and control characters in titles and filenames — safe in both the JSON and the
    filesystem entries; never a path component derived from user content

- **Acceptance criteria:**
  - [ ] A user can export a thread, a workspace, or everything, entirely user-initiated, with counts
        and size shown before commit
  - [ ] The archive contains NDJSON records (with `origin` and provenance), a readable Markdown
        rendering, attachment files with a manifest, and a versioned `manifest.json`
  - [ ] `docs/EXPORT-FORMAT.md` documents the format well enough that the round-trip test's
        Aperture-free reader reconstructs every conversation exactly (asserted by that test)
  - [ ] Access is re-checked during assembly and at download; revoked content never lands in an
        archive and download tokens are one-time, expiring, and unguessable
  - [ ] Reasoning is excluded by default; no model id, engine name, or backend tag appears in any
        exported record
  - [ ] Export mutates nothing — memory, traits, and lore are unchanged (asserted by test)
  - [ ] No hardcoded infrastructure values in new/modified code; README updated to document export
        and point at `docs/EXPORT-FORMAT.md`; all existing tests still pass

---

### APTR-141: Pre-Aperture history — decide it, state it, and let the assistant say it
- **Priority:** High
- **Labels:** aperture, web, continuity, soul-contract, onboarding
- **Agent:** claude
- **Estimate:** 5h
- **Blocked by:** APTR-32, APTR-41
- **Description:** Someone who has talked to the assistant through Matrix for a year opens Aperture
  and sees an empty thread list. Nothing is broken — memory survived, the continuity clause is
  satisfied, the assistant knows them perfectly well — but the *transcript* did not come along, and
  the first-run experience reads as amnesia. That gap between what is true and what it feels like is
  the entire problem this item exists to close.

  **The decision, made here and binding:** pre-Aperture transcripts from other channels are **not
  imported into Aperture's thread list in v1.** Aperture's threads are Aperture's. What carries over
  is **memory** — everything the assistant learned, the traits, the principles, the relationship —
  and that is stated plainly rather than left for the user to discover or doubt. Importing a year of
  Matrix history would mean rewriting foreign transcripts into a thread model they were never shaped
  for, and inventing provenance for messages whose `origin` cannot be reconstructed reliably; a wrong
  transcript is worse than an honest absence. This item does the honest absence properly.

  **And the assistant says it, in its own voice.** Soul Contract clause 1 — speak, never template.
  Aperture does **not** ship a hardcoded "Welcome! Your previous conversations aren't here." string.
  On first run, the assistant is asked, through the persona assembler by named proxy, to greet this
  specific person and explain in its own words what came with it and what did not. Aperture renders
  what it says. The difference between those two is the whole point of the clause.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — the first-run continuity-context route
  - `client/src/onboarding/ContinuityNotice.tsx` — renders the assistant's first-run message
  - `client/src/onboarding/useFirstRun.ts` — first-run detection and one-shot semantics
  - `client/src/memory/PriorRelationship.tsx` — "what carried over" panel on the memory surface
  - `docs/CONTINUITY.md` — the decision, the rationale, what carries over and what does not
  - **Agent-core repo (sibling PR):** the continuity-context route — prior-channel presence, memory
    counts, relationship age — and the persona-assembled first-run generation
  - `client/src/onboarding/__tests__/`

  ## APPROACH
  1. The BFF exposes a first-run continuity context for the principal: whether the assistant has
     prior memory of them, roughly how long the relationship spans, which channels it spans, and
     memory item counts by kind. **Facts, not prose.**
  2. Aperture asks the assistant, through the persona assembler by **named proxy**, for a first-run
     greeting grounded in those facts. It renders the result verbatim. If generation fails or the
     capability is unavailable, Aperture shows the **structural facts plainly in the product's own
     clearly-attributed voice** ("Your assistant remembers 412 things from 14 months of conversation
     on other channels. Those conversations' transcripts aren't in Aperture.") and **never**
     fabricates assistant-voiced prose to fill the gap. A test asserts no generated text is ever
     attributed to the assistant unless the assistant produced it.
  3. The notice is **honest and specific**: it says transcripts from other channels do not appear in
     Aperture, that Matrix remains first-class and those conversations are still there, and that
     memory carried over. It never implies data was lost, and never implies history is "coming soon"
     unless that is true.
  4. A **"what carried over"** panel on the memory surface (APTR-41) makes the claim inspectable
     rather than asking the user to take it on faith: memory items sourced from prior channels are
     browsable with their source channel labelled, and their source-thread link renders as
     unavailable-but-explained rather than broken (APTR-41 already handles that case).
  5. The empty thread list itself gets an empty state that reflects this reality instead of a generic
     "no threads yet" — it links to the continuity notice and to the first-run flow (APTR-143).
  6. **One-shot, dismissible, re-findable.** The notice appears once, is dismissible, and remains
     reachable afterwards from the memory surface and the palette, so it is never a modal the user
     has to fight and never a thing they can lose.
  7. Strictly read-only with respect to memory: this item browses and explains, and touches nothing.
     Nothing here resets, re-keys, migrates, or consolidates anything (continuity clause).
  8. `docs/CONTINUITY.md` records the decision and its rationale, so a future sprint that wants to
     import history changes a documented decision rather than discovering an accident.

  ## TEST PLAN
  - Unit: first-run detection fires once per principal and never again after dismissal
  - Unit: the assistant's generated greeting is rendered verbatim, with no Aperture-authored text
    interleaved into it
  - Unit: the "what carried over" panel lists prior-channel memory with source labels and renders
    unavailable source links as explained rather than broken
  - Unit: the empty thread list's first-run state references the continuity notice rather than a
    generic empty message
  - Integration: with prior memory present, the continuity context reports it; with a genuinely new
    user, the flow degrades to a plain new-user greeting with no false claim of shared history
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: with the generation capability unavailable, assert the fallback renders structural facts
    in the **product's** clearly-attributed voice and that **zero** assistant-attributed prose is
    generated by Aperture (Soul Contract clause 1)
  - Negative: assert this surface exposes no memory-mutating route, and that running the entire
    first-run flow leaves memory, traits, and lore unchanged (continuity)
  - Negative: assert no copy on this surface claims prior conversations were deleted, lost, or
    migrated — a fixture asserts the notice states transcripts remain on their original channel

  ## EDGE CASES
  - A genuinely new user with no prior memory — a warm new-user greeting; never a message about
    history that does not exist
  - A user whose prior channel is one Aperture cannot name confidently — say "other channels" rather
    than guessing a specific one
  - The continuity route unavailable at first run — defer the notice to the next session rather than
    showing a broken or half-populated one; do not burn the one-shot on a failure
  - A user who dismisses without reading — reachable afterwards from the memory surface and palette
  - Prior memory that is very large — summarize counts by kind; do not render every item in a notice
  - A second device's first run for the same principal — the notice is per principal, not per device;
    it does not reappear on every new browser

- **Acceptance criteria:**
  - [ ] The decision is explicit and documented in `docs/CONTINUITY.md`: pre-Aperture transcripts do
        not surface in v1, memory does, and Matrix conversations remain where they are
  - [ ] On first run the **assistant** explains this in its own generated words, rendered verbatim;
        Aperture never authors assistant-voiced prose (asserted by test)
  - [ ] With generation unavailable, the fallback states structural facts in the product's own
        clearly-attributed voice and fabricates nothing
  - [ ] A "what carried over" panel makes the memory claim inspectable, with prior-channel sources
        labelled and unavailable source links explained rather than broken
  - [ ] The empty thread list reflects this reality instead of a generic empty state
  - [ ] The flow is read-only: memory, traits, and lore are unchanged by it (asserted by test)
  - [ ] No hardcoded infrastructure values in new/modified code; README updated to point at
        `docs/CONTINUITY.md`; all existing tests still pass

---

### APTR-142: Multi-tab model — one connection, deduped focus, uncontested read state
- **Priority:** High
- **Labels:** aperture, web, transport, correctness
- **Agent:** codex
- **Estimate:** 6h
- **Blocked by:** APTR-33
- **Description:** Nothing in this sprint currently acknowledges that a person opens more than one
  tab, and two tabs on one session breaks three things quietly. Each tab opens its own SSE
  connection, multiplying server-side fan-out per user. Each tab publishes context-bus focus events,
  so the assistant is told the user is in thread A *and* thread B simultaneously — which is worse
  than not knowing, because the assistant acts on it. And both tabs write read/last-seen state, so
  they overwrite each other and the sidebar flickers between two truths.

  Decision D10 requires a stated model. This item implements it: **one connection per session, with
  server-side dedupe as the backstop**, so correctness does not depend on the client cooperating.

  ## FILES
  - `client/src/transport/TabCoordinator.ts` — leader election and tab lifecycle
  - `client/src/transport/SharedStreamBroker.ts` — the leader's connection, fanned out to followers
  - `client/src/transport/tabChannel.ts` — the cross-tab message channel and its schema
  - `client/src/chat/useChatStream.ts` — consumes the broker rather than connecting directly
  - `docs/MULTI-TAB.md` — the model, the leader protocol, and the failure modes
  - **Agent-core repo (sibling PR):** per-session connection accounting, focus-event dedupe, and
    monotonic read-state writes
  - `client/src/transport/__tests__/`

  ## APPROACH
  1. **Leader election.** Tabs elect exactly one leader over a broadcast channel with a heartbeat and
     a bounded takeover timeout. The leader holds the **single** SSE connection (which, per decision
     D3, is one connection demultiplexed by `thread_id` and message id — this item does not create a
     second stream, it prevents one). Followers subscribe through the broker and receive the same
     demultiplexed events. A follower **never** opens its own connection.
  2. **Leader death is survivable.** If the leader's heartbeat lapses or its tab closes, a follower
     takes over within the timeout and reconnects with the resume position, using the existing replay
     window (D3). Losing the leader must never lose a stream — a test kills the leader mid-stream and
     asserts the surviving tab continues receiving tokens.
  3. **Focus events are deduped, in the client and again on the server.** The client publishes thread
     focus **only from the focused tab of the leader-coordinated set**, so a background tab never
     claims the user's attention. The BFF additionally collapses focus events per session within a
     short window and keeps only the most recent — because a client that misbehaves, is stale, or is
     a second browser entirely must not be able to confuse the assistant about where the user is.
     Server-side dedupe is the authority; client-side is the optimization.
  4. **Read/last-seen state is monotonic, not last-writer.** Writes advance a per-thread high-water
     mark and never move it backwards, so two tabs cannot fight: a stale tab writing an older
     position is a no-op rather than a regression. Read state is broadcast across tabs so the sidebar
     agrees everywhere immediately.
  5. **Drafts stay per-tab-safe.** Drafts are device-local and per thread (APTR-33). Two tabs editing
     the same thread's draft coordinate through the tab channel: the focused tab owns the draft, and
     the other shows the live value read-only rather than silently clobbering it on blur.
  6. Fallback is explicit and safe: where the broadcast channel is unavailable, each tab falls back to
     its own connection, and **the server-side dedupe and monotonic read-state still hold**. Degraded
     means more connections, never incorrect assistant context.
  7. `docs/MULTI-TAB.md` documents the model, the leader protocol, and what degrades in fallback.

  ## TEST PLAN
  - Unit: with three tabs, exactly one leader is elected and exactly one connection is opened
  - Unit: killing the leader mid-stream promotes a follower within the timeout and the surviving tab
    keeps receiving tokens from the resume position
  - Unit: a background tab publishes no focus event; only the focused tab does
  - Unit: read state advances monotonically — a stale older position is a no-op, not a regression
  - Unit: two tabs on one thread — the focused tab owns the draft; the other renders it read-only and
    does not clobber it on blur
  - Integration: BFF focus dedupe collapses rapid duplicate focus events per session to the latest
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: with the broadcast channel forcibly disabled, assert the fallback still yields correct
    assistant context — server-side dedupe collapses the duplicate focus events and read state stays
    monotonic, even though connection count rises
  - Negative: have a follower tab attempt to open its own SSE connection directly and assert the
    broker rejects it and the connection count stays at one

  ## EDGE CASES
  - Tab suspended/discarded by the browser while it was leader — heartbeat lapse triggers takeover;
    on resume, the old leader demotes itself instead of running a second connection
  - Two windows in different profiles or a private window — separate sessions, so separate
    connections; server-side dedupe is per session and this is correct, not a bug
  - Rapid open/close of many tabs — election converges without a thundering herd of reconnects
  - Clock skew between tabs — use monotonic elapsed time for heartbeats, never wall-clock comparison
  - A tab open on thread A and a tab open on thread B, both focused-then-blurred quickly — the server
    keeps the most recent focus only; the assistant is never told the user is in two places at once
  - Sign-out in one tab — all tabs tear down, the connection closes, and device-local state is purged
    consistently with the sign-out path

- **Acceptance criteria:**
  - [ ] One SSE connection per session across tabs via leader election; followers never connect
  - [ ] Leader death promotes a follower within the timeout without losing an in-flight stream
  - [ ] Focus events are emitted only by the focused tab **and** deduped server-side per session, so
        the assistant is never told the user is in two threads at once (both asserted)
  - [ ] Read/last-seen state is monotonic; a stale tab cannot move it backwards
  - [ ] Draft ownership is coordinated across tabs with no silent clobbering
  - [ ] With the broadcast channel unavailable, correctness still holds server-side; only connection
        count degrades (asserted by test)
  - [ ] No hardcoded infrastructure values in new/modified code; `docs/MULTI-TAB.md` documents the
        model; all existing tests still pass

---

### APTR-143: First-run and invited-user onboarding
- **Priority:** High
- **Labels:** aperture, web, onboarding, ux
- **Agent:** claude
- **Estimate:** 6h
- **Blocked by:** APTR-31, APTR-141, APTR-145
- **Description:** The sprint's exit criteria narrate an invited user's first session end to end, but
  no item owned it — which is how a journey everyone assumes exists ends up existing nowhere. This
  item owns it: redemption link → first sign-in → create or join a workspace → meet the assistant →
  first thread, with every step accounted for and no dead end.

  Onboarding is also the highest-risk place for a Soul Contract clause 1 violation, because "meet the
  assistant" is exactly where a product is tempted to write charming copy in the assistant's voice.
  It does not happen here: the introduction is **authored by the assistant** through the persona
  assembler, and Aperture renders it. Product copy is the product's, plainly, and is visually and
  structurally distinguishable from the assistant's.

  ## FILES
  - `client/src/onboarding/OnboardingFlow.tsx` — the guided step sequence
  - `client/src/onboarding/steps/` — redeem, workspace, introduction, first-thread steps
  - `client/src/onboarding/useOnboardingState.ts` — resumable progress, per principal
  - `client/src/onboarding/Introduction.tsx` — renders the assistant-authored introduction
  - `docs/ONBOARDING.md` — the journey, its steps, and where each can fail
  - **Agent-core repo (sibling PR):** onboarding progress persistence and the introduction generation
  - `client/src/onboarding/__tests__/`

  ## APPROACH
  1. **Redemption first.** The invite redemption page (APTR-44 issues the invites) is reachable
     unauthenticated, sends no referrer, and carries the token in the URL **fragment** so it never
     reaches a server log, a referrer header, or history sync. A used, expired, or revoked invite
     yields the same indistinguishable failure APTR-44 specifies — onboarding must not become a token
     oracle.
  2. **Workspace step.** Create a first workspace or accept a granted one, using APTR-31's model with
     its defaults intact — deny-by-default tool allowlist, descriptor-derived proxy selection, no
     silent fallback proxy. Onboarding does not get privileged defaults ordinary creation lacks.
  3. **Introduction step.** The assistant introduces itself, generated through the persona assembler
     by **named proxy** and rendered verbatim (Soul Contract clause 1). If the user has prior memory,
     this composes with APTR-141's continuity notice into one coherent moment rather than two
     competing greetings. If generation is unavailable, the step shows the product's own clearly
     attributed placeholder and offers to retry — it **never** substitutes Aperture-authored prose in
     the assistant's voice.
  4. **First thread.** The flow ends by landing the user in a real thread with the composer focused —
     not on a dashboard, not on a tour. The last step of onboarding is using the product.
  5. **Resumable and skippable.** Progress persists per principal, so a closed tab resumes where it
     left off. Every step is skippable, and skipping never leaves an unusable account. The flow is
     re-openable from the palette afterwards.
  6. **The empty states link in.** APTR-46's empty states for threads, documents, and memory each
     offer the relevant onboarding step as their primary action, so a user who skipped can pick it up
     from wherever they actually noticed the gap.
  7. All copy comes from APTR-145's string catalogue; assistant-attributed content never does, since
     it is generated rather than authored.
  8. Nothing in this flow resets or seeds memory, traits, or lore. A returning user going through
     onboarding again — new device, new workspace — meets the same assistant, not a fresh one.

  ## TEST PLAN
  - Unit: the step sequence advances, persists, and resumes after an interrupted session
  - Unit: every step is skippable and the resulting account is fully usable
  - Unit: the introduction is rendered verbatim from the generation response
  - Unit: the redemption page carries the token in the fragment, sends no referrer, and never places
    the token in a path, query string, or logged field
  - Integration: an invited user completes redeem → workspace → introduction → first thread with the
    composer focused, without encountering a blank screen at any step
  - Integration: for a user with prior memory, APTR-141's continuity notice and this introduction
    compose into one greeting rather than two competing ones
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: with generation unavailable, assert the introduction step shows the product's
    attributed placeholder and that **no** Aperture-authored prose is presented as the assistant's
  - Negative: redeem an expired, revoked, and already-used invite and assert all three return the
    same indistinguishable failure, with onboarding revealing nothing about which
  - Negative: run onboarding for a returning principal and assert memory, traits, and lore are
    unchanged (continuity)

  ## EDGE CASES
  - A user invited to an existing workspace with no create permission — the create step is replaced
    by an accept step, never shown-then-refused
  - A user who abandons at the workspace step and returns days later — resumable, with the invite's
    grants still honoured if the invite itself has not expired
  - Generation slow at the introduction step — a skeleton with an honest wait, and a skip that does
    not poison the flow
  - Onboarding on a narrow viewport — the same components at the narrow breakpoint, no mobile fork
  - A second admin onboarding after the first — no step implies they are the sole or first user
  - The workspace step racing a concurrent workspace creation from another tab — idempotent; the user
    ends with one workspace, not two

- **Acceptance criteria:**
  - [ ] The invited-user journey — redeem, workspace, introduction, first thread — is owned end to
        end, with no blank screen or dead end at any step
  - [ ] The redemption link carries its token in the fragment, sends no referrer, and expired/revoked/
        used invites are indistinguishable
  - [ ] The assistant's introduction is generated via the persona assembler and rendered verbatim;
        with generation unavailable, no Aperture-authored prose is presented as the assistant's
  - [ ] The flow is resumable, skippable, and re-openable, and APTR-46's empty states link into it
  - [ ] The flow ends in a real thread with the composer focused
  - [ ] Onboarding never resets or seeds memory, traits, or lore (asserted by test)
  - [ ] No hardcoded infrastructure values in new/modified code; `docs/ONBOARDING.md` documents the
        journey; all existing tests still pass

---

### APTR-144: Rate limiting on user-driven expensive routes
- **Priority:** High
- **Labels:** aperture, bff, security, reliability
- **Agent:** codex
- **Estimate:** 6h
- **Blocked by:** APTR-32, APTR-40
- **Description:** Invites are rate-limited and uploads have quotas; everything else in this sprint is
  wide open. That is a gap with teeth, because the expensive routes are not the obvious ones. Message
  send drives a GPU turn on a shared, arbitrated pool. Title suggestion is **an LLM call per
  invocation**, trivially triggerable in a loop. Server-side search runs a scan per keystroke behind
  a debounce that a script simply does not honour. Re-embed dispatches an embedding job per document,
  and bulk re-embed multiplies it. Export (APTR-140) assembles the user's entire corpus.

  This is not only an abuse story. On a self-hosted fleet the likeliest cause of a fleet-wide stall is
  the operator's own client in a retry loop, and a limit that produces a clear, renderable, honest
  refusal is better for that user than a fleet that quietly falls over.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — per-route limit declarations and the `rate-limited` response
  - `contracts/aperture-errors-v1.md` — the `rate-limited` problem-details URN with `retry_after`
  - `client/src/transport/rateLimit.ts` — client-side handling, backoff, and the retry-after surface
  - `docs/RATE-LIMITS.md` — the limits, their rationale, and how to tune them by config key
  - **Agent-core repo (sibling PR):** the limiter middleware, per-principal buckets, and config keys
  - `client/src/transport/__tests__/`

  ## APPROACH
  1. **Per principal, never per source address.** Buckets key on the authenticated session principal.
     A shared address must not create one bucket for everyone behind it, and a client-supplied
     forwarded-for header is never trusted for identity (Sprint B owns the trusted-proxy
     specification per decision D10 #9; this item consumes it and does not reimplement it).
  2. **Limits are declared in the contract and configured by named config keys**, never literals in
     handlers, so the operator can tune them without a code change. Every limited route declares its
     bucket, its cost, and its window in the contract, and a test enumerates the limited routes from
     the contract so a newly added expensive route cannot silently escape the limiter.
  3. **Routes limited in this item**, with costs proportional to what they actually consume: message
     send, server-side thread search, assistant title suggestion, document re-embed (single and bulk,
     the bulk cost scaling with item count), attachment upload initiation, memory search, and export
     request (APTR-140). Cheap reads are not limited — a limiter on a thread list is friction with no
     protective value.
  4. **Refusal is typed and honest.** A limited request returns the `rate-limited` problem-details URN
     with a `retry_after`, and the client renders it through APTR-46's error vocabulary: what was
     limited, when to try again, and no blame. Per the Pre-flight transient-feedback rule this is
     **error feedback**, not an interruption — it appears where the action happened and never goes
     through the presence budget.
  5. **The client cooperates but is never trusted.** It disables the affordance for the retry-after
     window and backs off with jitter, and the server enforces regardless. A tampered client gains
     nothing.
  6. **The assistant's own tool-invoked equivalents are limited on the same buckets** (Module Contract
     clause 4 cuts both ways) — otherwise assistant-operable parity becomes a limiter bypass.
  7. Limiting is never silent: a refusal is never a dropped request, a hang, or a fake success, and it
     is logged with a correlation id and the bucket, without the payload.

  ## TEST PLAN
  - Unit: each declared bucket admits up to its limit and refuses beyond it within the window
  - Unit: bulk re-embed cost scales with item count rather than counting as one request
  - Unit: the client disables the affordance for `retry_after` and backs off with jitter
  - Unit: `rate-limited` renders through the APTR-46 vocabulary with the retry time and no blame
  - Integration: routes enumerated from the contract are all covered by the limiter — a new expensive
    route added without a declaration fails the test
  - Integration: the assistant's tool-invoked equivalent consumes the same bucket as the UI action
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: two principals behind one source address get **independent** buckets — one exhausting
    its limit does not refuse the other
  - Negative: send a spoofed forwarded-for header and assert it changes neither bucket identity nor
    the limit applied
  - Negative: assert a limited request is refused with a typed response — never dropped, never hung,
    never answered with a fabricated success

  ## EDGE CASES
  - A legitimate burst (pasting several documents to embed at once) — burst allowance plus sustained
    rate, so normal use is not punished by a limit tuned for a loop
  - A limit hit mid-stream — the active stream is unaffected; only new requests are refused
  - Clock skew and window boundaries — monotonic source, no double-spend at the boundary
  - The single-operator install — defaults must not make solo use feel limited; document the tuning
    keys and choose generous defaults
  - A retry storm from many tabs — coordinate backoff through APTR-142's tab channel where available;
    the server enforces regardless
  - An admin needing to exceed a limit for a legitimate bulk operation — a documented config change,
    never an ad hoc bypass path in code

- **Acceptance criteria:**
  - [ ] Send, search, title suggestion, re-embed (single and bulk), upload initiation, memory search,
        and export request are all rate-limited per authenticated principal
  - [ ] Limits are contract-declared and config-keyed with no literals in handlers, and a
        contract-enumerated test proves no expensive route escapes the limiter
  - [ ] A refusal is the typed `rate-limited` problem-details with `retry_after`, rendered through the
        APTR-46 vocabulary as error feedback — never through the presence budget
  - [ ] Buckets are per principal, never per source address, and forwarded-for headers cannot
        influence identity or limits (asserted by test)
  - [ ] Assistant tool-invoked equivalents consume the same buckets — parity is not a bypass
  - [ ] Refusals are never silent drops, hangs, or fabricated successes (asserted by test)
  - [ ] No hardcoded infrastructure values in new/modified code; `docs/RATE-LIMITS.md` documents the
        limits and tuning keys; all existing tests still pass

---

### APTR-145: String catalogue, locale conventions, and time formatting
- **Priority:** Medium
- **Labels:** aperture, web, i18n, foundation, consistency
- **Agent:** codex
- **Estimate:** 5h
- **Blocked by:** APTR-29
- **Description:** Every surface in this sprint writes user-facing copy, and every one of them formats
  a timestamp. Left alone, that produces eighteen slightly different date formats, three different
  ways of saying "just now", copy scattered across a hundred components, and a quiet dependency on the
  device clock and the device locale in features (quiet hours, date bucketing) where those are exactly
  the wrong sources. Retrofitting extraction across a finished sprint is miserable and never fully
  happens, so it is done up front.

  This item is not a translation project. **The decision is English-only in v1** — stated explicitly
  rather than left implicit — with strings centralized and formatting funnelled through shared
  utilities so that adding a locale later is a data change rather than an archaeology project.

  ## FILES
  - `client/src/i18n/catalogue.ts` — the string catalogue, keyed and typed
  - `client/src/i18n/useString.ts` — the lookup hook with typed interpolation
  - `client/src/i18n/format.ts` — date, time, relative time, number, byte-size, and duration helpers
  - `client/src/i18n/timezone.ts` — the user's declared timezone, distinct from the device clock
  - `client/scripts/lint-strings.mjs` — the mechanical guard against inline user-facing literals
  - `docs/COPY-AND-FORMAT.md` — the locale decision, tone rules, and formatting conventions
  - `client/src/i18n/__tests__/`

  ## APPROACH
  1. **One catalogue, typed keys.** User-facing strings live in the catalogue and are looked up by
     key. Interpolation is typed, so a missing or misnamed variable is a compile error rather than a
     `{name}` shipped to a user. Keys are namespaced by surface.
  2. **`lint-strings.mjs` fails the build on user-facing string literals in components** — the same
     mechanical style as the adherence, external-host, presence, and surface-state gates. It targets
     rendered text and accessible names; it does **not** flag test fixtures, log messages, contract
     URNs, or `data-*` values. An allowlist exists for genuinely non-translatable tokens and is
     reviewed, not open-ended.
  3. **Assistant-authored text is never in the catalogue and never linted.** The assistant's words are
     generated and rendered verbatim (Soul Contract clause 1). The catalogue holds the *product's*
     voice only; a catalogue entry that speaks as the assistant is a clause 1 violation and the lint's
     allowlist must never be used to sneak one in. This boundary is stated in `docs/COPY-AND-FORMAT.md`.
  4. **Time formatting is shared and its source is explicit.** One helper set for absolute time,
     relative time ("2 minutes ago"), day separators, and the sidebar's date bucketing (APTR-32), so
     every surface agrees. Absolute time is always available on hover/focus wherever a relative time
     is shown, because "3 days ago" is useless when you need the actual date.
  5. **Timezone comes from the user's declared setting, not the device clock**, for anything
     policy-bearing — quiet hours (APTR-43) above all, where the device clock is simply the wrong
     authority for a user travelling with a laptop. Display-only formatting may follow the device.
     DST transitions and the ambiguous/skipped hour are handled explicitly and tested, not assumed
     away.
  6. **Number, byte-size, and duration formatting** are shared too: attachment sizes, quota usage,
     tool-call durations, and export sizes all format identically everywhere.
  7. Formatting uses the platform's built-in internationalization APIs. **No formatting library is
     added, and nothing fetches locale data at runtime** — standing constraint 3 is untouched.

  ## TEST PLAN
  - Unit: catalogue lookup with typed interpolation; a missing variable fails to compile
  - Unit: `lint-strings.mjs` passes on the clean tree and ignores tests, logs, and contract URNs
  - Unit: relative-time formatting is stable across the boundaries (just now / minutes / hours / days)
    and always exposes the absolute time on hover/focus
  - Unit: date bucketing agrees with APTR-32's sidebar grouping for the same inputs
  - Unit: quiet-hours evaluation uses the declared timezone, not the device clock — a device clock
    shifted to another zone does not change the window
  - Unit: DST spring-forward (skipped hour) and fall-back (ambiguous hour) are handled explicitly
  - Unit: byte-size and duration formatting are identical across attachment, quota, and tool surfaces
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: add an inline user-facing literal to a component and confirm `lint-strings` FAILS the
    build; revert
  - Negative: assert no assistant-attributed prose exists in the catalogue — a test scans entries for
    first-person assistant voice and fails on a match (Soul Contract clause 1)
  - Negative: assert no runtime fetch of locale data and no new formatting dependency in the bundle

  ## EDGE CASES
  - A string needing pluralization — use the platform plural rules from the start; never string
    concatenation with an "(s)"
  - RTL and bidi content inside interpolated values — isolate interpolations so a user-supplied value
    cannot reorder the surrounding sentence
  - A timestamp from a clock-skewed server producing a future relative time — clamp to "just now"
    rather than rendering "in 3 minutes"
  - A user who has not declared a timezone — prompt at the point it first matters (quiet hours) rather
    than silently assuming the device zone for a policy decision
  - Very long interpolated values (a thread title in a confirm) — truncate in the formatter, not in
    each call site
  - A catalogue key removed while still referenced — the typed lookup makes it a compile error

- **Acceptance criteria:**
  - [ ] All user-facing product strings live in a typed, namespaced catalogue; `lint-strings.mjs`
        fails the build on inline user-facing literals in components
  - [ ] The English-only-for-v1 decision and the tone rules are documented in
        `docs/COPY-AND-FORMAT.md`, along with the catalogue-vs-assistant-voice boundary
  - [ ] No assistant-attributed prose exists in the catalogue (asserted by test)
  - [ ] Date, relative-time, day-separator, bucketing, number, byte-size, and duration formatting all
        come from one shared utility set used by every surface
  - [ ] Policy-bearing time (quiet hours above all) evaluates against the user's declared timezone,
        not the device clock, with DST ambiguity handled explicitly (asserted by test)
  - [ ] No formatting library is added and no locale data is fetched at runtime
  - [ ] No hardcoded infrastructure values in new/modified code, and all existing tests still pass

---

### APTR-146: Upload-session and orphaned-attachment garbage collection
- **Priority:** High
- **Labels:** aperture, bff, attachments, reliability, security
- **Agent:** claude
- **Estimate:** 5h
- **Blocked by:** APTR-38, APTR-39
- **Description:** APTR-38 makes uploads chunked and resumable, which silently creates a new object
  with a lifetime nobody owns: the **upload session**. A session started and abandoned — the tab
  closed, the network dropped, or an attacker simply opening thousands and walking away — leaves
  chunks on disk that no attachment references and nothing ever removes. That is a storage-exhaustion
  vector sitting inside an otherwise thorough threat model, and it defeats APTR-39's per-user quota
  if abandoned bytes are not counted.

  This item also owns the other end of the Pre-flight attachment-lifecycle model: **reclamation at
  zero references.** Thread delete decrements; something has to actually sweep. That something is
  here, and it is deliberately **not** a synchronous cascade inside thread delete, because a
  synchronous cascade is exactly what produces the orphaned-branch bug APTR-32 and APTR-35 were
  contradicting each other about.

  ## FILES
  - `contracts/aperture-api-v1.yaml` — upload-session create/status/complete/abort routes, chunk size,
    and session expiry, all explicit rather than implied
  - `docs/SECURITY-UPLOADS.md` — extended with the session lifecycle, GC policy, and quota accounting
  - **Agent-core repo (sibling PR):** session store, expiry sweeper, orphan reclamation, quota
    accounting for in-flight and abandoned bytes
  - `client/src/attachments/useUpload.ts` — aligned to the now-explicit session protocol
  - Test fixture set for abandoned, expired, and partially-complete sessions

  ## APPROACH
  1. **The upload session becomes an explicit contract object**, not an implementation detail hidden
     behind "chunked and resumable": a create route returning a session id and the server-declared
     chunk size, a status route, a complete route, and an **abort** route the client calls when the
     user cancels. Expiry is a documented, config-keyed duration. The client reads chunk size from the
     session, never from a literal.
  2. **In-flight bytes count against the per-user quota from the first chunk**, and are released on
     abort, on expiry, or on completion-into-an-attachment. Otherwise a user can hold unlimited bytes
     forever simply by never completing — quota accounting that ignores in-flight bytes is not quota
     accounting.
  3. **The sweeper is idempotent, bounded, and observable.** It reaps sessions past expiry and
     reclaims attachments at zero references, in bounded batches with a documented cadence, logging
     counts and bytes with correlation ids and **never** logging filenames or payloads. Running it
     twice reclaims nothing extra; running it on a clean store is a no-op.
  4. **Zero-reference reclamation is the only path that deletes attachment bytes.** No thread delete,
     no message delete, no branch operation deletes bytes directly. Per the Pre-flight model,
     workspace hard-delete is the one unconditional reclamation, and it goes through this same sweeper
     rather than its own cascade.
  5. **A grace window before reclamation.** An attachment reaching zero references is reclaimed only
     after a documented grace period, so a race between a delete and an in-flight branch cannot
     destroy bytes a new reference is about to claim. Reference count is re-checked at the moment of
     deletion, inside the same transaction that removes the bytes.
  6. **Abandonment is cheap to detect and expensive to abuse:** concurrent open sessions per principal
     are capped, session creation is rate-limited on APTR-144's buckets, and an expired session's
     chunks are unreadable and unresumable rather than lingering as addressable data.
  7. Reclamation touches no memory: an attachment's bytes going away never removes what the assistant
     learned from it (continuity clause), and the message record still shows the reference so the
     transcript stays honest about what was there.

  ## TEST PLAN
  - Unit: session create/status/complete/abort round-trip; chunk size comes from the session response,
    never from a client literal
  - Unit: in-flight bytes count against quota from the first chunk and are released on abort, expiry,
    and completion
  - Unit: the sweeper is idempotent — a second run reclaims nothing extra; a run on a clean store is a
    no-op
  - Unit: an attachment at zero references is reclaimed only after the grace window, with the count
    re-checked inside the deleting transaction
  - Integration: an abandoned session past expiry is reaped, its bytes released, and its chunks are no
    longer addressable or resumable
  - Integration: workspace hard-delete reclaims all its attachments through this sweeper, not through
    a separate cascade
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative (the contradiction test): delete a thread whose attachment is still referenced by a
    branch, run the sweeper, and assert the bytes are **not** reclaimed and the branch still fetches
    the attachment — the sweeper must reclaim at zero references, never on a thread-delete signal
  - Negative: open the maximum concurrent sessions and assert further creation is refused with a typed
    reason, and that abandoned sessions cannot be used to exceed the storage quota
  - Negative: assert sweeper log lines contain counts, bytes, and correlation ids but **no** filename,
    payload, or internal path, and that reclamation leaves Engram memory intact

  ## EDGE CASES
  - A session resumed just as it expires — the resume either succeeds cleanly or fails with a typed
    expired reason; never a half-resumed session writing into reaped storage
  - A branch created in the same instant a thread delete drops the count to zero — the grace window
    plus the in-transaction re-check must make this safe; test it explicitly with a forced race
  - Sweeper interrupted mid-batch — restartable with no double-accounting and no partially deleted
    attachment left addressable
  - Clock skew on expiry — monotonic source, consistent with APTR-39's idle-timeout decision
  - A very large abandoned session — reclaimed in bounded chunks so the sweep does not stall other work
  - An attachment referenced only by an exported archive (APTR-140) — an export holds no reference;
    the archive already contains its own copy, and the manifest records unavailability if reclaimed

- **Acceptance criteria:**
  - [ ] Upload sessions are explicit contract objects with create/status/complete/abort routes, a
        server-declared chunk size, and a documented config-keyed expiry
  - [ ] In-flight bytes count against the per-user quota and are released on abort, expiry, and
        completion; concurrent sessions per principal are capped and rate-limited
  - [ ] An abandoned session is reaped and its bytes released; its chunks become unaddressable and
        unresumable (asserted by test)
  - [ ] Zero-reference reclamation is the **only** path that deletes attachment bytes, gated by a
        grace window with the count re-checked in the deleting transaction
  - [ ] Deleting a thread whose attachment a branch still references reclaims nothing, and the branch
        still fetches it after a sweep (asserted — this is the lifecycle contradiction test)
  - [ ] The sweeper is idempotent and bounded, and logs counts/bytes/correlation ids only — never
        filenames, payloads, or internal paths
  - [ ] Reclamation never removes Engram memory derived from the attachment (asserted by test)
  - [ ] No hardcoded infrastructure values in new/modified code; `docs/SECURITY-UPLOADS.md` extended
        with the session lifecycle and GC policy; all existing tests still pass

---

## Sprint C exit criteria

Sprint C is done when all **twenty-five** items — APTR-29..46 and APTR-140..146 — are merged in
`Blocked by` order, each with its post-merge gate outcome reported by name, and the following hold
end to end:

1. A new user can be invited, sign in through the guided first-run flow, create a workspace, meet the
   assistant in the assistant's own generated words, create a thread, hold a streaming conversation
   with tool calls rendered inline, attach and query a document, and find it all again by search —
   without encountering a blank screen at any point.
2. No model id, engine name, backend tag, or size suffix appears in client code, BFF code, stored
   settings, an API payload, or the rendered DOM. Named proxies only.
3. The built bundle fetches nothing from an external origin at runtime.
4. Memory, traits, and lore survive every operation in this sprint — including thread delete,
   document removal, workspace hard-delete, settings change, and re-authentication.
5. Aperture has no independent notification tray; every interruption passes the presence budget.
6. Matrix remains first-class and cannot be disabled from Aperture; Telegram is present and off by
   default; Signal is inert with no configuration affordance.
7. The a11y check, adherence lint, external-host assertion, presence lint, string lint,
   surface-state assertion, and contract-drift gate all pass in CI.
8. **Provenance holds (D9).** Every visual attribution in the chat surface and the tool rendering
   derives from the `origin` discriminator alone. A tool result crafted to look like an assistant
   message stays in the bounded tool frame with tool attribution intact, and no content-sniffing
   heuristic exists anywhere in the render path.
9. **The web target's rules are the web target's (D1).** Auth is the session cookie, requests are
   same-origin relative, `connect-src` is `'self'`, no CORS headers are served, and every mutating
   route inherits Sprint A's origin-check middleware. No bearer token, configured endpoint, or OS
   secure-storage read appears anywhere in this sprint's code.
10. **Sovereignty is provable in both directions.** The user can export their threads, messages,
   attachments, and memory in the documented format and reconstruct their conversations with a reader
   that has no Aperture code — and the only runtime external fetch in the built app is the D5
   click-to-load image carve-out, under its stated conditions.
11. **The attachment lifecycle has exactly one implementation.** Attachments are workspace-owned and
   reference-counted; deleting a thread whose attachment a branch still references reclaims nothing
   and the branch still renders it; bytes are reclaimed only at zero references by APTR-146's sweeper.
12. **Two tabs behave as one client.** One connection per session, focus events deduped server-side
   so the assistant is never told the user is in two threads at once, and monotonic read state.
13. Every expensive user-driven route is rate-limited per authenticated principal, and a refusal is a
   typed, renderable `rate-limited` response — never a drop, a hang, or a fabricated success.
