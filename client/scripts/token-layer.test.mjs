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
  readTokenBlocks,
  resolveToken,
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

/* ── Contrast ────────────────────────────────────────────────────────────────────────────── */

const SURFACES = ['--bg-page', '--bg-panel', '--bg-elevated', '--surface-chip'];

/**
 * The tokens that carry TEXT. `--text-faint` and `--text-disabled` are deliberately absent:
 * faint is de-emphasised metadata that always sits beside a labelled value, and a disabled
 * control is exempt from WCAG 1.4.3 by definition. Neither may ever be the only carrier of a
 * meaning, and the token layer says so where they are declared.
 */
const TEXT_TOKENS = ['--text-heading', '--text-body', '--text-muted', '--text-accent'];

describe.each([
  ['dark', darkChain],
  ['light', lightChain],
])('%s theme contrast', (_theme, chain) => {
  it.each(TEXT_TOKENS.flatMap((text) => SURFACES.map((surface) => [text, surface])))(
    '%s on %s clears 4.5:1',
    (text, surface) => {
      expect(contrastRatio(color(text, chain), color(surface, chain))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('white-on-accent clears 4.5:1 for the primary button', () => {
    expect(contrastRatio(color('--text-on-accent', chain), color('--accent', chain)))
      .toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['--on-success', '--tint-success'],
    ['--on-warning', '--tint-warning'],
    ['--on-error', '--tint-error'],
    ['--on-info', '--tint-info'],
    ['--on-accent-tint', '--tint-accent'],
    ['--text-muted', '--tint-neutral'],
  ])('badge foreground %s clears 4.5:1 over %s composited on the panel', (fg, tint) => {
    // A badge's background is a TRANSLUCENT tint over the panel, so the ratio has to be
    // measured against the composited result, not against the tint's nominal colour.
    const background = over(color(tint, chain), color('--bg-panel', chain));
    expect(contrastRatio(color(fg, chain), background)).toBeGreaterThanOrEqual(4.5);
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
