# Aperture — brand

Aperture is the rich client for the Lumina Constellation: web, desktop, and installable
mobile PWA. It is a thin luminous client over a fat sovereign backend — the lens through
which a person sees the whole system.

Aperture does not have its own colour system. It uses the shared constellation design
tokens. This document covers only what is specific to Aperture: the mark, how it is
built, and how it may and may not be used.

## The mark

The Aperture mark is an **iris** — a six-blade camera diaphragm closed onto a hexagonal
opening, with light coming through the centre.

It was chosen because it is literal without being illustrative. A diaphragm is the part
of an optical instrument that decides how much of the world reaches the sensor, which is
exactly what the client does: it is the controlled opening onto a system it does not
itself contain. It is geometric rather than friendly-soft, it is ownable (no other module
in the constellation uses radial blade geometry), and its silhouette — a bright ring with
a dark polygonal void — survives down to 16px where a more literal lens or camera would
turn to mush.

### Construction

The mark is generated, not drawn by hand, so it stays consistent across sizes:

| Parameter | Value | Note |
|---|---|---|
| Blades | 6 | Hexagonal opening |
| Housing radius `R` | — | The outer circle; blades are clipped to it |
| Opening radius `r` | `0.55 R` | Circumradius of the hexagonal opening |
| Blade skew | 22° | Rotation of the outer edge relative to the inner edge; gives the pinwheel |
| Blade gap | 4° (marks) / 6° (favicon) | Angular separation between adjacent blades |

Blades alternate between two gradients (`-a` luminous, `-b` deep). Both gradients use
`gradientUnits="userSpaceOnUse"` spanning the whole housing, so the light direction is
consistent across the mark — upper-left highlight falling to lower-right shadow. **Do not
change these to `objectBoundingBox`**; each blade then gets its own gradient and the mark
loses its machined coherence and looks like a randomly coloured pinwheel.

The opening is dark. A radial `throat` gradient sits *behind* the blades and must not
extend far past the opening radius, or the blades wash out and the mark reads as a solid
disc rather than an aperture. The blades themselves are drawn at full opacity — depth
comes from the gradients, never from alpha.

## Palette

Aperture uses the shared constellation tokens. Referenced here, not redefined:

- **Surfaces** — `--space-900` `#0D0B1A` (page base), `--space-800` `#110E22` (mark tile),
  `--space-700` `#161130` (panel), `--space-600` `#1A1333`, `--space-500` `#221A40`,
  `--space-400` `#2C2350`.
- **Core** — `--violet-700` `#5B21B6`, `--violet-600` `#6D28D9`, `--violet-500` `#7C3AED`
  (primary accent), `--violet-400` `#A855F7` (luminous), `--violet-300` `#C4A5FB`,
  `--violet-200` `#DDC9FD`. The mark is built entirely from these.
- **Directional accents** — semantic only, never decorative: `--flux-blue` `#3B82F6`
  inbound/source, `--flux-green` `#10B981` outbound/endpoint/free, `--flux-amber`
  `#F59E0B` cloud/gated/cost, `--flux-rose` `#F43F5E` alerts/hot.
- **Text** — `--text-100` `#F4F2FB`, `--text-200` `#C7C3D6`, `--text-300` `#9CA3AF`,
  `--text-500` `#4B5563`.
- **Lines** — hairline violet at low alpha: `rgba(168,85,247,0.14)` soft,
  `0.22` default, `0.40` strong. Never a pure grey border.
- **Radii** — 4 / 6 / 10 / 14 / 20. Pill shapes only for badges and status.

In Aperture's own diagrams the accent colours carry a fixed meaning: the three client
surfaces are **blue** (they are where a request originates), the BFF and the kernel are
**violet** (cores), the four backend capabilities are **green** (endpoints), and anything
that leaves the house — cloud inference, gated or metered providers — is **amber**. A
colour used for anything else is a bug in the diagram, not a style choice.

## Type

- **Inter** (600) for display and UI. The wordmark is Inter 600 with roughly `0.04em`
  tracking.
- **JetBrains Mono** for crate names, telemetry, and small tracked UPPERCASE eyebrow
  labels (roughly `0.18em`).
- Always ship a fallback stack; never `@import` a webfont into an asset.

Prose is sentence case. Tracked uppercase is reserved for short mono eyebrow labels.
The voice is precise, technical, quietly confident — no exclamation, no emoji anywhere.

## Assets

| File | Size | Use |
|---|---|---|
| `assets/aperture-icon-32.svg` | 32×32 | App icon, tab strips, repo avatars, anywhere the mark appears alone |
| `assets/aperture-favicon.svg` | 64×64 | Browser tab only — simplified, wider blade gaps, higher contrast |
| `assets/aperture-wordmark.svg` | 220×44 | Mark plus "Aperture" and the "constellation client" subtitle |
| `assets/banner.svg` | 1280×640 | Repo hero / README header |
| `assets/architecture.svg` | 1280×720 | System diagram |
| `assets/badges.svg` | 800×40 | Status strip |

Every asset is self-contained: no external references, no embedded raster payloads, no
remote fonts. They can be committed, mirrored, and served from anywhere without a
dependency following them.

## Light and dark

The icon, favicon, and wordmark all sit on their own deep-space tile, so the mark itself
reads on any page background — light forge themes included. The wordmark's *text* is the
only theme-dependent part: it carries an inline `prefers-color-scheme` rule that swaps
`--text-100` for a deep violet ink in light mode.

That rule follows the **viewer's system preference**, not the page's background, because
an SVG rendered through `<img>` cannot see the page. In the rare combination of a
light-mode OS reading a dark-themed page, the wordmark text will be dark on dark. If you
need a guaranteed result in a fixed-theme context, place the mark and set the label in the
host page's own type rather than using the wordmark asset.

The banner and the architecture diagram paint their own dark canvas and are deliberately
dark-only pieces.

## Minimum sizes

| Asset | Minimum | Notes |
|---|---|---|
| Icon | 16px | At 16px the mark resolves to a violet ring with a dark centre and a light core; the individual blades merge. This is expected and still identifiable. Below 16px, use a plain violet dot instead. |
| Favicon | 16px | Built for exactly this — wider gaps and stronger contrast than the icon. |
| Wordmark | 132px wide | Below this the 9px subtitle stops resolving; drop the wordmark and use the icon alone. |
| Banner | 640px wide | Below this the 18px subtitle and the eyebrow crowd. |
| Architecture | 900px wide | Below this the 9.5px mono captions stop resolving; link to the full-size asset instead. |

Always leave clear space around the mark of at least one quarter of its tile width.

## Correct usage

- Use the supplied SVGs as-is, scaled proportionally.
- Pair the mark with "Aperture" set in Inter 600 when the name is not otherwise obvious.
- Place the mark on `--space-900`, `--space-800`, or any light neutral. Its own tile
  provides the contrast.
- Keep the semantic accent meanings when extending any diagram.
- When adding a new diagram, reuse the panel recipe: dark vertical gradient fill,
  hairline violet border, 10–14px radius, glow rather than drop shadow for elevation.

## Incorrect usage

- **Do not** recolour the mark. It is violet. There is no green, amber, or monochrome
  variant; the accent colours are semantic and using one for the mark makes a false claim.
- **Do not** rotate, mirror, skew, or stretch it. The blade skew is the mark's handedness;
  mirroring it produces a different, wrong logo.
- **Do not** fill the opening. The dark hexagonal void is the mark. A filled centre reads
  as a wheel or a flower, not an aperture.
- **Do not** change the blade count. Six blades, hexagonal opening.
- **Do not** add drop shadows, outer strokes, or bevels. Glow is the elevation system.
- **Do not** place the mark on a busy photograph or a mid-violet field where the tile
  edge disappears.
- **Do not** set the wordmark in a different typeface, condense it, or re-track it.
- **Do not** use grey hairlines or grey borders anywhere in Aperture's surfaces; lines are
  violet at low alpha.
- **Do not** add emoji to any Aperture surface, asset, or label.
