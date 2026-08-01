// Token-layer tests.
//
// Scope: this is NOT the automated contrast gate — APTR-107 owns that, as a general sweep of
// every rendered pair plus motion. What is here is the fixed list of pairs the primitives layer
// and the token layer's own guidance actually tell people to use, checked with real WCAG maths
// on real parsed values, including alpha compositing for the tinted badge surfaces.

import { describe, expect, it } from 'vitest';

import {
  BLOCK_SELECTORS,
  contrastRatio,
  declarations,
  over,
  parseColor,
  readStylesheet,
  gradientStops,
  readTokenBlocks,
  resolveToken,
  styleRules,
} from './token-layer.mjs';

const css = readStylesheet('constellation.css');
const primitivesCss = readStylesheet('primitives.css');
const blocks = readTokenBlocks(css);

/** How a browser resolves a token in each theme, in cascade-priority order. */
const darkChain = [blocks.darkOverride.tokens, blocks.darkBase.tokens];
const lightChain = [blocks.lightOverride.tokens, blocks.lightMedia.tokens, blocks.darkBase.tokens];

const color = (token, chain) => parseColor(resolveToken(token, chain));

describe('theme structure', () => {
  it('defines the same semantic tokens in both themes', () => {
    expect(Object.keys(blocks.lightOverride.tokens).sort())
      .toEqual(Object.keys(blocks.darkOverride.tokens).sort());
  });

  it('keeps the two light blocks identical — the duplication cannot drift', () => {
    // The light mapping is written twice because a media query and a plain selector cannot
    // share a rule in plain CSS, and this project has no preprocessor. This assertion is what
    // stands in for the one it does not have.
    expect(blocks.lightMedia.tokens).toEqual(blocks.lightOverride.tokens);
  });

  it('orders the explicit overrides AFTER the media query', () => {
    // Both `:root[data-theme=…]` blocks also out-specify the `:root` base, so this is belt and
    // braces — but source order is the part a reordering refactor would break silently.
    expect(blocks.lightOverride.index).toBeGreaterThan(blocks.lightMedia.index);
    expect(blocks.darkOverride.index).toBeGreaterThan(blocks.lightMedia.index);
  });

  it('scopes the media query so an explicit dark choice beats a light OS preference', () => {
    expect(BLOCK_SELECTORS.lightMedia).toContain(":not([data-theme='dark'])");
    expect(css).toMatch(/@media \(prefers-color-scheme: light\)/);
  });

  it('declares reduced-motion and forced-colors behaviour', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/@media \(forced-colors: active\)/);
  });

  it('never uses forced-color-adjust: none, in either stylesheet', () => {
    // The adherence lint enforces this across the whole tree; asserting it here too means the
    // token layer's own promise still holds if the lint were ever misconfigured. Checked
    // against parsed DECLARATIONS, not the file text: both files discuss the property in prose.
    for (const [name, sheet] of [['constellation.css', css], ['primitives.css', primitivesCss]]) {
      const offending = declarations(sheet, name)
        .filter((d) => d.prop === 'forced-color-adjust' && d.value === 'none');
      expect(offending, name).toEqual([]);
    }
  });

  it('defines every token the primitives layer references, in BOTH themes', () => {
    const referenced = new Set();
    for (const match of primitivesCss.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) referenced.add(match[1]);
    expect(referenced.size).toBeGreaterThan(20);
    for (const token of referenced) {
      expect(() => resolveToken(token, darkChain), `dark: ${token}`).not.toThrow();
      expect(() => resolveToken(token, lightChain), `light: ${token}`).not.toThrow();
    }
  });

  it('keeps the violet ramp and the flux hues shared, not forked per theme', () => {
    // The light theme is a re-MAPPING, not a parallel palette. If a ramp constant were ever
    // redefined inside a theme block, the two would drift into different products.
    for (const block of [blocks.lightOverride, blocks.lightMedia, blocks.darkOverride]) {
      const ramp = Object.keys(block.tokens).filter((t) => /^--(violet|flux|ink|space|paper)-/.test(t));
      expect(ramp, `${block.selector} redefines a ramp constant`).toEqual([]);
    }
  });
});

/* ── Contrast ────────────────────────────────────────────────────────────────────────────────
 *
 * THE SURFACE SET IS DERIVED, NOT ENUMERATED.
 *
 * An earlier revision listed four surface tokens and composited every tinted component onto
 * `--bg-panel`. That measured the favourable case: badges are unrestricted and are explicitly
 * rendered inside `.card`, whose fill is a GRADIENT, so the surface actually behind a badge
 * ranges down to the gradient's darker endpoint — where a light success badge measured 3.89:1
 * and passed the suite anyway. The value was wrong because the method was wrong.
 *
 * So the surfaces come from the token layer itself: every semantic surface token, plus every
 * stop of every gradient token, with translucent stops composited onto each opaque surface.
 * A new surface token or a new gradient endpoint enters the suite by existing, which is the
 * property that matters — a suite that has to be extended by hand will drift the moment
 * someone adds a surface.
 */

/** Semantic surfaces a component may be painted on. */
const SURFACE_TOKENS = [
  '--bg-page', '--bg-panel', '--bg-elevated', '--bg-hover',
  '--surface-card', '--surface-chip', '--surface-inset',
];

/** Gradient fills that are painted BEHIND components — both endpoints are real surfaces. */
const SURFACE_GRADIENTS = ['--grad-card', '--grad-space'];

function surfacesFor(chain) {
  const surfaces = new Map();
  for (const token of SURFACE_TOKENS) surfaces.set(token, parseColor(resolveToken(token, chain)));

  for (const token of SURFACE_GRADIENTS) {
    const stops = gradientStops(resolveToken(token, chain), chain);
    stops.forEach((stop, index) => {
      const colour = parseColor(stop);
      if (colour.a >= 1) {
        surfaces.set(`${token}[${index}]`, colour);
        return;
      }
      // A translucent stop shows whatever is beneath it, so it is a surface PER underlying
      // surface rather than one colour.
      for (const base of SURFACE_TOKENS) {
        surfaces.set(`${token}[${index}] over ${base}`, over(colour, parseColor(resolveToken(base, chain))));
      }
    });
  }
  return surfaces;
}

const CHAINS = { dark: darkChain, light: lightChain };

/**
 * Text tokens that carry MEANING. `--text-faint` and `--text-disabled` are excluded by RULE,
 * not by convenience: faint is de-emphasised metadata beside an already-labelled value and
 * never the sole carrier of a meaning, and a disabled control is exempt from WCAG 1.4.3. Both
 * say so where they are declared. Any USE of them outside that scope is a bug in the use — the
 * placeholder that used to take `--text-faint` was fixed rather than excused.
 */
const TEXT_TOKENS = ['--text-heading', '--text-body', '--text-muted', '--text-accent'];

/** Foreground/tint pairs, taken from where primitives.css actually applies them. */
const TINTED_PAIRS = [
  ['--on-success', '--tint-success', 'badge-success'],
  ['--on-warning', '--tint-warning', 'badge-warning'],
  ['--on-error', '--tint-error', 'badge-error and .btn-danger'],
  ['--on-info', '--tint-info', 'badge-info'],
  ['--on-accent-tint', '--tint-accent', 'badge-accent'],
  ['--text-muted', '--tint-neutral', 'badge-neutral'],
];

describe.each(Object.entries(CHAINS))('%s theme contrast', (_theme, chain) => {
  const surfaces = surfacesFor(chain);
  const colour = (token) => parseColor(resolveToken(token, chain));

  it('derives more surfaces than the semantic tokens alone — gradients included', () => {
    // Guards the METHOD. If gradient derivation broke, every assertion below would silently
    // narrow to the favourable set again and keep passing.
    expect(surfaces.size).toBeGreaterThan(SURFACE_TOKENS.length);
  });

  it.each(TEXT_TOKENS)('%s clears 4.5:1 on every surface', (token) => {
    for (const [name, surface] of surfaces) {
      expect(contrastRatio(colour(token), surface), `${token} on ${name}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(TINTED_PAIRS)('%s over %s clears 4.5:1 on every surface (%s)', (fg, tint, _where) => {
    // The tint is TRANSLUCENT, so the ratio has to be measured against the composite with
    // whatever is actually behind the component — every surface, not a chosen one.
    for (const [name, surface] of surfaces) {
      const background = over(colour(tint), surface);
      expect(contrastRatio(colour(fg), background), `${fg} over ${tint} on ${name}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('white-on-accent clears 4.5:1 at every stop of the primary button gradient', () => {
    const onAccent = colour('--text-on-accent');
    expect(contrastRatio(onAccent, colour('--accent'))).toBeGreaterThanOrEqual(4.5);

    const stops = gradientStops(resolveToken('--grad-accent', chain), chain);
    expect(stops.length).toBeGreaterThan(1);
    for (const stop of stops) {
      const parsed = parseColor(stop);
      if (parsed.a >= 1) {
        expect(contrastRatio(onAccent, parsed), `on-accent over ${stop}`).toBeGreaterThanOrEqual(4.5);
        continue;
      }
      // The dark gradient's far stop is translucent — the card shows through it.
      for (const [name, surface] of surfaces) {
        expect(contrastRatio(onAccent, over(parsed, surface)), `on-accent over ${stop} on ${name}`)
          .toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('input text and placeholder clear 4.5:1 on the input surface', () => {
    for (const token of ['--text-heading', '--text-muted']) {
      expect(contrastRatio(colour(token), colour('--surface-inset')), `${token} on --surface-inset`)
        .toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('the primitives layer does not use an excluded text token as live text', () => {
  it('never applies --text-faint or --text-disabled outside their documented scope', () => {
    // The placeholder defect: an exclusion documented for de-emphasised metadata was being
    // applied to live interface text in an active field. A contrast suite cannot catch that on
    // its own, because the token is excluded FROM the suite — so the use is checked instead.
    const offending = [];
    for (const rule of styleRules(primitivesCss, 'primitives.css')) {
      const usesExcluded = rule.declarations.some(
        (decl) => decl.prop === 'color' && /^var\(--text-(faint|disabled)\)$/.test(decl.value),
      );
      if (!usesExcluded) continue;
      // The only sanctioned use: a genuinely disabled control, which WCAG 1.4.3 exempts.
      if (/:disabled|\[aria-disabled/.test(rule.selector)) continue;
      offending.push(rule.selector.trim());
    }
    expect(offending).toEqual([]);
  });
});

describe('focus is always visible, including under forced colours', () => {
  const FORCED = '@media (forced-colors: active)';
  const rules = styleRules(primitivesCss, 'primitives.css');

  it('restores an outline for every selector that removes one on :focus-visible', () => {
    // The defect: `.input:focus-visible { outline: none }` out-specifies the token layer's
    // global `:focus-visible` ring, and the forced-colours block strips every box-shadow — so
    // the glow that REPLACED the outline vanished too, leaving a focused field indistinguishable
    // from a resting one. Checked structurally so the next component to use an inset focus
    // treatment cannot reintroduce it.
    const removesOutline = rules
      .filter((r) => !r.atRules.includes(FORCED))
      .filter((r) => r.selector.includes(':focus-visible'))
      .filter((r) => r.declarations.some((d) => d.prop === 'outline' && d.value === 'none'))
      .map((r) => r.selector.trim());

    const restoresOutline = new Set(
      rules
        .filter((r) => r.atRules.includes(FORCED))
        .filter((r) => r.declarations.some((d) => d.prop === 'outline' && d.value !== 'none'))
        .map((r) => r.selector.trim()),
    );

    for (const selector of removesOutline) {
      expect(restoresOutline, `${selector} removes its outline but never restores one`).toContain(selector);
    }
  });

  it('never strips a focus indicator without providing another', () => {
    // The global ring exists at all.
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:/);
  });
});

describe('the contrast maths itself', () => {
  // A contrast helper that is wrong in the permissive direction would make every assertion
  // above meaningless, so it is checked against values that are not in dispute.
  it('reports 21:1 for black on white', () => {
    expect(contrastRatio(parseColor('#000000'), parseColor('#ffffff'))).toBeCloseTo(21, 2);
  });

  it('reports 1:1 for a colour against itself', () => {
    expect(contrastRatio(parseColor('#7c3aed'), parseColor('#7c3aed'))).toBeCloseTo(1, 6);
  });

  it('composites a half-transparent white over black to mid grey', () => {
    const result = over({ r: 255, g: 255, b: 255, a: 0.5 }, { r: 0, g: 0, b: 0, a: 1 });
    expect(result).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 });
  });

  it('expands three-digit hex', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  it('refuses a value it cannot parse rather than guessing', () => {
    expect(() => parseColor('rebeccapurple')).toThrow(/unparseable/);
  });
});
