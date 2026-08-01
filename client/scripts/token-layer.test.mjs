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
  excludedTokenUses,
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

const EXCLUDED_TEXT_TOKENS = ['--text-faint', '--text-disabled'];

describe('the primitives layer does not use an excluded text token as live text', () => {
  it.each(Object.entries(CHAINS))('resolves ALIASES too — %s', (_theme, chain) => {
    // The placeholder defect: an exclusion documented for de-emphasised metadata was applied to
    // live interface text. A contrast suite cannot catch that, because the token is excluded
    // FROM the suite — so the USE is checked instead.
    //
    // Aliases are resolved rather than matched by spelling. A guard that only recognised a
    // direct `var(--text-faint)` would pass `color: var(--placeholder-ink)` where that token is
    // itself `var(--text-faint)` — reopening exactly the blind spot it exists to cover.
    expect(excludedTokenUses(primitivesCss, chain, EXCLUDED_TEXT_TOKENS, { from: 'primitives.css' }))
      .toEqual([]);
  });

  it('catches an excluded token reached through an intermediate alias', () => {
    // Proves the guard has teeth, against a stylesheet built to defeat the naive version.
    const blocks = [{ '--placeholder-ink': 'var(--text-faint)', '--text-faint': '#6b7280' }];
    const sneaky = '.input::placeholder { color: var(--placeholder-ink); }';
    const found = excludedTokenUses(sneaky, blocks, EXCLUDED_TEXT_TOKENS);
    expect(found).toHaveLength(1);
    expect(found[0].token).toBe('--text-faint');
    expect(found[0].via).toEqual(['--placeholder-ink', '--text-faint']);
  });

  it('still permits an excluded token on a genuinely disabled control', () => {
    const blocks = [{ '--text-disabled': '#4b5563' }];
    expect(excludedTokenUses('.btn:disabled { color: var(--text-disabled); }', blocks, EXCLUDED_TEXT_TOKENS))
      .toEqual([]);
  });
});

/**
 * THE DOCUMENTED MINIMUM, AND WHERE IT OCCURS.
 *
 * The previous cycle reported "worst case 4.96:1". That figure was the LIGHT theme's minimum,
 * quoted as if it were the global one — the dark theme's 4.834:1 was lower and was simply not
 * looked at. The suite was complete; the summary of it was not. A figure nobody can reproduce
 * from the method is the same defect as a count that disagrees with its table, so the figure is
 * now COMPUTED from the same cross-product the assertions use and checked against the
 * documented constant. Change the palette and this fails until the number is updated.
 */
const DOCUMENTED_MINIMUM = { ratio: 4.834, theme: 'dark', fg: '--on-error', tint: '--tint-error', surface: '--surface-chip' };

describe('the documented contrast minimum', () => {
  function globalMinimum() {
    let worst = { ratio: Infinity };
    for (const [theme, chain] of Object.entries(CHAINS)) {
      const surfaces = surfacesFor(chain);
      const colour = (token) => parseColor(resolveToken(token, chain));
      for (const token of TEXT_TOKENS) {
        for (const [name, surface] of surfaces) {
          const ratio = contrastRatio(colour(token), surface);
          if (ratio < worst.ratio) worst = { ratio, theme, fg: token, tint: null, surface: name };
        }
      }
      for (const [fg, tint] of TINTED_PAIRS) {
        for (const [name, surface] of surfaces) {
          const ratio = contrastRatio(colour(fg), over(colour(tint), surface));
          if (ratio < worst.ratio) worst = { ratio, theme, fg, tint, surface: name };
        }
      }
    }
    return worst;
  }

  it('is reproducible from the method, and occurs where the documentation says', () => {
    const worst = globalMinimum();
    expect(worst.theme).toBe(DOCUMENTED_MINIMUM.theme);
    expect(worst.fg).toBe(DOCUMENTED_MINIMUM.fg);
    expect(worst.tint).toBe(DOCUMENTED_MINIMUM.tint);
    expect(worst.surface).toBe(DOCUMENTED_MINIMUM.surface);
    expect(worst.ratio).toBeCloseTo(DOCUMENTED_MINIMUM.ratio, 2);
  });

  it('pins the exact worst pair by name: dark --on-error over --tint-error on --surface-chip', () => {
    // Named explicitly because it is the pair a reviewer computed independently and used to
    // question whether the derivation was complete. It is in the suite, it is the true minimum,
    // and it clears 4.5:1.
    const chain = CHAINS.dark;
    const chip = parseColor(resolveToken('--surface-chip', chain));
    const background = over(parseColor(resolveToken('--tint-error', chain)), chip);
    const ratio = contrastRatio(parseColor(resolveToken('--on-error', chain)), background);

    expect(resolveToken('--surface-chip', chain)).toBe('#26262f');
    expect(background.r).toBeCloseTo(66.84, 1);
    expect(background.g).toBeCloseTo(41.5, 1);
    expect(background.b).toBeCloseTo(53.58, 1);
    expect(ratio).toBeCloseTo(4.834, 2);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
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
