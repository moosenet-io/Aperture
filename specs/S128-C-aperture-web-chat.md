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
- **Estimated total:** ~104h
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

### Standing constraints for every item in this sprint
1. **One door.** Client code calls the generated SDK, which calls the BFF, which calls
   `terminus-client`. No component constructs a `fetch` of its own; no BFF handler constructs an
   HTTP client against a service URL. A second access path is a review rejection regardless of how
   correctly it is implemented.
2. **Named proxies only.** Anywhere a "model" is selected, stored, displayed, or sent, the value is
   a **named proxy** (`lumina-fast`, `lumina-deep`, …) resolved from the capability descriptors.
   No model id, engine name, backend tag, quantization, or size suffix may appear in client or BFF
   code, in a database column, in a URL, or on screen.
3. **Nothing external at runtime.** No CDN, no webfont fetch, no analytics, no telemetry, no
   remote source map, no remote highlighter grammar, no MathJax CDN. Everything is bundled. The
   `assert-no-external-hosts` gate from APTR-01 must keep passing.
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

  ## EDGE CASES
  - A named proxy disappearing from the descriptors while a workspace still references it — mark
    the workspace `degraded` with the reason, do not silently rewrite the stored selection
  - Two clients editing the same workspace settings — last-write-wins with an `updated_at`
    precondition; a stale write returns a conflict the UI can surface, not a silent overwrite
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
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README updated to document the workspace model and its settings
  - [ ] All existing tests still pass

---

### APTR-32: Thread model — CRUD, list, search, pin, archive, rename
- **Priority:** Critical
- **Labels:** aperture, web, bff, threads
- **Agent:** codex
- **Estimate:** 7h
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
     Delete is a two-step confirm, is scoped to the thread's messages and attachments, and **must
     not** delete anything Engram consolidated from that thread — deleting a conversation does not
     delete the assistant's memory of it (continuity clause). Say this plainly in the confirm copy
     so the user is not misled about what delete means.
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
  - [ ] Deleting a thread does not delete Engram memory, and the confirm copy says so
  - [ ] Cross-user thread access returns `not-found` without confirming existence
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README updated to document the thread model and search behavior
  - [ ] All existing tests still pass

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
     Submission is disabled while a stream is active except via an explicit "send after stop".
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

  ## EDGE CASES
  - Stream ending without `message.end` (connection drop) — finalize from the buffer, mark
    incomplete, and offer regenerate; never leave a permanently "typing" bubble
  - `message.end` carrying text that differs from the accumulated buffer — the server's version wins
    and the discrepancy is logged once
  - Very long single-line code token runs — must not force horizontal page scroll (see APTR-34)
  - Tab backgrounded during a stream — rAF flushing pauses; on return, flush the whole buffer once
  - A second stream starting before the first finalizes — reject at the composer, never interleave
  - Rapid thread switching mid-stream — unsubscribe cleanly, cancel if the user leaves and confirms,
    and do not cross-render tokens into the newly opened thread

- **Acceptance criteria:**
  - [ ] Streaming renders smoothly with completed messages provably not re-rendering per token
  - [ ] Event ordering, duplicates, and gaps are handled per the events contract
  - [ ] Stop generation cancels upstream through the BFF (not a client-side unsubscribe) and
        persists its partial clearly marked, never silently discarded
  - [ ] Composer handles multiline, drafts, paste-to-attach, and submit gating correctly
  - [ ] Auto-scroll sticks only when already at the bottom and never yanks the viewport
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README updated to document the chat surface and stop-generation semantics
  - [ ] All existing tests still pass

---

### APTR-34: Rich message rendering — markdown, code with copy, syntax highlighting, math, tables
- **Priority:** High
- **Labels:** aperture, web, chat, rendering, security
- **Agent:** codex
- **Estimate:** 7h
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
     `rel="noopener noreferrer nofollow"` and open in a new context. **No link is prefetched**, and
     no image in model output is auto-loaded from a remote origin (that is both a privacy leak and
     a tracking-pixel vector) — remote images render as a click-to-load placeholder showing the
     origin.
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
  - Verify no hardcoded IPs, hostnames, org names, or absolute paths in new/modified files
  - Negative: feed a corpus of XSS payloads (script tags, SVG `onload`, `data:` URLs, HTML entity
    obfuscation, markdown-link scheme smuggling) and assert none execute and none render as active
  - Negative: assert the built bundle contains no external grammar/font/math CDN origin (the
    APTR-01 external-host gate must still pass)

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
  - [ ] Link scheme allowlist enforced; remote images are click-to-load, never auto-fetched
  - [ ] Code blocks copy exact source, scroll internally, and never cause page-level horizontal scroll
  - [ ] Partial/streaming markdown renders without crashing or flickering
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] All existing tests still pass

---

### APTR-35: Message editing, regeneration, and branching a thread from any message
- **Priority:** High
- **Labels:** aperture, web, chat, threads
- **Agent:** claude
- **Estimate:** 7h
- **Blocked by:** APTR-33
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

  ## EDGE CASES
  - Branching from a message that has attachments — attachments are referenced, not duplicated, and
    deleting the origin thread must not orphan the branch's view of them
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
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README updated to document editing, regeneration, and branching semantics
  - [ ] All existing tests still pass

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
     animated status, cancellable if the backend supports it), **success** (collapsed summary),
     **error** (collapsed with the failure class, expanded shows the typed problem-details). It
     never blocks or reorders the surrounding message text.
  2. Collapsed summary is a *human* summary — "searched the knowledge graph (14 results, 220ms)" —
     derived from a per-tool summarizer with a generic fallback. It is **never raw JSON**. Where the
     summary is assistant-authored, it comes from the assistant; where it is structural, it is
     clearly structural. Aperture does not invent prose in the assistant's voice.
  3. Provenance line, always present when expanded: tool name, the module that claims it (from the
     descriptors), initiation timestamp, duration, result size, and a **mutation flag** — read-only
     vs. state-changing, taken from the tool descriptor. A tool that changed something must be
     visually distinct from one that only read.
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
  - [ ] Provenance shows tool, claiming module, timing, size, and a mutation flag
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
- **Agent:** opus
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
- **Estimate:** 6h
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

  ## EDGE CASES
  - Settings save failing — roll back the optimistic apply and say what failed, do not leave the UI
    showing a state the server rejected
  - Two devices changing appearance concurrently — last write wins, but device-local mirrors stay
    correct so neither device flashes
  - A channel descriptor appearing mid-session — the row appears without a reload
  - Revoking the device you are currently using — confirm explicitly, then complete the sign-out
  - An avatar upload — routed through the hardened attachment path (APTR-39), not a separate uploader

- **Acceptance criteria:**
  - [ ] Appearance settings apply immediately, persist, produce no theme flash on first paint, and
        explicit theme/reduced-motion overrides beat the media queries in both directions
  - [ ] Channel rows derive from descriptors; Matrix is first-class and cannot be disabled here
  - [ ] Telegram is present, documented, and **off by default**; Signal renders inert/`unavailable`
        with no configuration affordance (both asserted by test)
  - [ ] No channel credential is ever entered, stored, or displayed in Aperture
  - [ ] Settings changes and re-auth never reset memory, traits, or lore (asserted by test)
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] README updated to document the settings surface and channel policy
  - [ ] All existing tests still pass

---

### APTR-43: Notification preferences routed through the assistant's presence budget
- **Priority:** High
- **Labels:** aperture, web, bff, presence, soul-contract
- **Agent:** claude
- **Estimate:** 6h
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
     raise a user-visible interruption. `lint-presence.mjs` fails the build on any use of
     `Notification`, `alert()`, or a toast-raising helper outside that module — the same mechanical
     enforcement style as the adherence and external-host gates.
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
  - Negative: add a raw `new Notification(...)` in a chat component and confirm `lint-presence` FAILS
    the build; revert
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
  - [ ] `lint-presence` fails the build on any interruption raised outside that module
  - [ ] Quiet hours, categories, urgency floor, and mute are enforced **server-side** (mirrored
        client-side for display), and quiet hours hold-and-digest rather than silently dropping
  - [ ] Aperture ships no independent notification tray, inbox, or unread badge (asserted by test)
  - [ ] No secret access is introduced by this item
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] `docs/PRESENCE.md` documents the budget model and why there is no tray
  - [ ] All existing tests still pass

---

### APTR-44: Admin — users, invites, roles, and per-user workspace access
- **Priority:** High
- **Labels:** aperture, web, bff, admin, security
- **Agent:** opus
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
  - [ ] Explicit role set with a contract-defined capability matrix; unknown roles fail closed
  - [ ] Every admin route is independently authorized server-side, proven by contract-enumerated tests
  - [ ] Invites are single-use, expiring, hashed at rest, revocable, rate-limited, shown once
  - [ ] Workspace access defaults to none; revocation terminates in-flight streams immediately
  - [ ] Deactivation revokes all sessions/devices without destructive content cascade
  - [ ] Every admin action is audited with sanitized arguments and a correlation id
  - [ ] The last admin cannot be demoted or deactivated (enforced server-side)
  - [ ] No hardcoded infrastructure values in new/modified code

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
  - [ ] Reduced motion honored from the media query and the explicit override
  - [ ] No information conveyed by color alone; contrast passes in both themes
  - [ ] `a11y-check.mjs` runs in CI and fails the build on violations
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] `docs/ACCESSIBILITY.md` documents the baseline and known manual-check areas

---

### APTR-46: Empty, error, and offline states for every surface — no blank screens, ever
- **Priority:** High
- **Labels:** aperture, web, ux, reliability
- **Agent:** claude
- **Estimate:** 6h
- **Blocked by:** APTR-44
- **Description:** Close the sprint by making failure legible. Every surface built here gets a
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
     correlation id is shown for support and is the only technical detail exposed.
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
  - [ ] `assert-surface-states.mjs` fails the build when a surface is missing a state
  - [ ] Error states are problem-details-driven with recovery actions and only a correlation id as
        technical detail
  - [ ] Offline keeps the app navigable, preserves drafts, marks stale data, and auto-revalidates on
        reconnect
  - [ ] Per-surface error boundaries prevent any whole-app blank screen
  - [ ] Skeletons match final layout and respect reduced motion
  - [ ] No hardcoded infrastructure values in new/modified code
  - [ ] `docs/UX-STATES.md` documents the state vocabulary for later sprints

---

## Sprint C exit criteria

Sprint C is done when all eighteen items are merged, each with its post-merge gate outcome
reported by name, and the following hold end to end:

1. A new user can be invited, sign in, create a workspace, create a thread, hold a streaming
   conversation with tool calls rendered inline, attach and query a document, and find it all again
   by search — without encountering a blank screen at any point.
2. No model id, engine name, backend tag, or size suffix appears in client code, BFF code, stored
   settings, an API payload, or the rendered DOM. Named proxies only.
3. The built bundle fetches nothing from an external origin at runtime.
4. Memory, traits, and lore survive every operation in this sprint — including thread delete,
   document removal, workspace hard-delete, settings change, and re-authentication.
5. Aperture has no independent notification tray; every interruption passes the presence budget.
6. Matrix remains first-class and cannot be disabled from Aperture; Telegram is present and off by
   default; Signal is inert with no configuration affordance.
7. The a11y check, adherence lint, external-host assertion, presence lint, surface-state assertion,
   and contract-drift gate all pass in CI.
