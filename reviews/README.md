# S128 Aperture — Fable spec review, consolidated findings

Reviewer: `claude-fable-5` via the sanctioned review door, one pass per sprint spec, run at the
capstone effort tier. Verdicts were `REQUEST_CHANGES` on every sprint reviewed — expected and
correct for a first-pass spec review whose stated primary deliverable was enhancements, not
approval.

**Volume:** ~164 discrete enhancements across the reviewed sprints, ~50 of them P1, plus 40
defects and a large "missing entirely" list. The per-sprint files in this directory are the
verbatim reviews. This file is the consolidation an executing agent should read first.

---

## The seven findings that change the build

These are cross-cutting or blocking. Everything else is an improvement; these are corrections.

### 1. The desktop origin problem — invalidates a Sprint A acceptance criterion (P1, blocking)

Found independently in three separate reviews (A, E, G), which is why it leads.

Sprint A mandates "never construct an absolute URL; every request is same-origin relative."
Sprint E ships a Tauri desktop app whose origin is `tauri://localhost` — so a same-origin
relative path **does not resolve to the fleet at all**. Compounding it, Sprint G's threat model
mandates `connect-src 'self'` and `SameSite=Strict` cookies. Those four requirements cannot
simultaneously hold.

As written, Sprint E must violate a Sprint A acceptance criterion or cannot reach the backend.

**Resolution to fold in:** the contract must define an injectable base-URL transport —
same-origin by default for web, operator-configured endpoint for desktop stored in OS secure
storage — and specify that cross-origin desktop auth is **bearer, not cookie**, with the CSP
and cookie rules stated per-target rather than globally. This must land in the v1 contract
(APTR-06/07) because it is precisely the churn contract-first exists to prevent.

### 2. Media playback is still infeasible, for a second reason (P1, blocking)

I had already corrected the byte-range assumption (the door carries a JSON body and cannot pass
an HTTP `Range` header; the media module serves no bytes at all). Fable found the layer beneath
it: **Media Source Extensions will not accept non-fragmented MP4 or MKV.** Feeding a media
element from raw file chunks does not work for the common container formats in a real library.
Playback needs remuxing or transcoding, which is not in any item's estimate or file list.

This is the sprint's biggest feasibility hole and it is now two deep. Playback should be
re-scoped honestly — either a remux/transcode path with a real estimate, or an explicitly
deferred capability — rather than discovered mid-build.

### 3. The external-host assertion fails every clean build (P1, defect)

`assert-no-external-hosts.mjs` greps the built bundle for `http(s)://` origins. Bundled inline
SVG carries `xmlns="http://www.w3.org/2000/svg"`, and dependency licence banners routinely
contain URLs. So the positive path is broken while the negative test appears to pass —
the worst shape of bug.

Independently confirmed: the same false positive occurred while verifying this repo's own brand
SVGs, which required excluding the XML namespace URI. Needs a documented namespace allowlist and
comment-stripped scanning.

### 4. Logout and revocation never purge offline data (P1, privacy)

Nothing in the mobile offline items clears cached threads, the outbox, or drafts when a session
ends or a device is revoked. Revoking a device would leave its conversation content readable on
that device. For a project whose entire premise is sovereignty, this is the most serious
omission found.

### 5. The served-bundle assertion can be defeated by the service worker (P1)

Sprint G's deploy assertion exists to prevent the "every dashboard green, users see nothing"
failure. Fable points out the PWA service worker cache can reproduce exactly that failure with
every check in the item passing — users keep getting the cached shell regardless of what the
server now serves. The assertion needs to cover the client cache path, not just the origin.

### 6. Secret caching could be satisfied by writing plaintext to disk (P1, security)

APTR-11 says "fall back to cached vault values, never hard-fail" but specifies no cache
location, protection, or staleness bound. A literal-minded implementation satisfying the
acceptance criteria could write plaintext secrets to disk. Must specify: memory-only or
encrypted-at-rest, zeroize-on-drop, a TTL, and the cold-cache behaviour (capability
`unavailable`, never a default key).

### 7. Several "enforcement" mechanisms cannot enforce what they claim (P1)

A recurring pattern worth naming as a class, because it produces specs that look rigorous and
verify nothing:
- A Node lint asserting a property of Rust call sites (it cannot see them) — must be a Rust
  architectural test.
- "Assert the effective CSP at startup" — a platform webview's effective CSP is not generally
  introspectable; this silently degrades to asserting the config file, a weaker guarantee.
- "Assert this function has exactly one caller" as a unit test — that is static analysis, or
  better, module-private visibility so the compiler enforces it.
- A static sweep for UI actions that is not implementable as described.
- "Force garbage collection" in a stock browser — needs an instrumented run.
- A retroactive negative test that the doc engine never fired per-merge — untestable without an
  audit trail no item creates.

---

## Structural issues worth fixing before ingest

- **Sprint F's stated total (~69h) does not match its item sum (76h).** Agents budget against
  that line. Sprint D's header was similarly wrong and was already corrected to 92h.
- **`chat.thread` / `chat.selection` have no declared publisher.** The spec-from-chat item
  consumes them; the work to publish them from the chat surfaces is assigned to no item and
  would be discovered late.
- **Cross-repo items can merge green proving nothing.** Where an item's acceptance criteria all
  live in the sibling repo, the Aperture-side PR's gate proves none of them. Each such item must
  state which repo's gate proves which criterion.
- **A required CI job running desktop journeys against the packaged artifact** implies signing
  credentials on the CI runner. Needs an unsigned-but-identically-packaged CI variant, with
  signing verified in the release path instead.
- **Forward dependency A→B unmarked:** module descriptor revalidation "on the SSE context
  channel" depends on Sprint B, but A blocks B. Needs a polling fallback in A.

## The strongest additive suggestions

Not corrections — things that would make Aperture better, ranked by leverage:

1. **A foundation-level command registry + `Cmd/Ctrl-K` palette**, so every later sprint
   registers into one surface instead of retrofitting. Highest-leverage delight feature, and it
   only works if it is architectural from the start.
2. **An `origin` discriminator on every SSE event and message** (`assistant | tool | system |
   user`), with clients required to derive visual attribution from it, never from content. This
   is the contract-level backbone of "a tool result must never impersonate the assistant."
3. **Idempotency keys on message send** — a network blip during retry double-sends.
4. **Contract version header + defined client behaviour on skew** — a cached PWA bundle will
   outlive BFF deploys.
5. **A bounded SSE replay window with an explicit `resync` event** when the client's position
   has aged out. Resume is currently a confident sentence over a hard problem.
6. **Attachment serving isolation** — `Content-Disposition: attachment`, sandboxed CSP, MIME
   allowlist, SVG/HTML never inline. Kills stored XSS before the UI sprint exists.
7. **Runtime CSP and security headers** — the bundle grep is static and trivially bypassed by
   string concatenation; the runtime header is the real enforcement of the no-egress clause.
8. **Skeleton/empty/spinner primitives and a message catalog** in the design-system item — every
   later sprint needs both on day one, and retrofitting i18n across seven sprints is a rewrite.
9. **A private-CA / certificate-pinning path** — the single most common real-world first-run
   failure for a self-hosted audience.
10. **Linux desktop** — the archetypal user of a self-hosted Rust fleet runs Linux. If it is
    deliberately out of scope, the spec should say so rather than be silent.

## Status

These findings are recorded, not yet folded into the specs. Folding them in is the next action
before Plane ingest, so the ingested items carry the corrections rather than the originals.

Sprints B and C failed their first review pass with `unavailable: daemon unreachable` — an
infrastructure artifact from running seven reviewers concurrently, **not** a verdict. Per the
gate rules an unavailable provider is not a pass; both are being re-run serially.
