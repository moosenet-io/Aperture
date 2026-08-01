// A reader for the token layer, used by `token-layer.test.mjs`.
//
// It lives in scripts/ rather than src/ on purpose: it reads files from disk, and giving the
// application's TypeScript project access to `node:fs` types so a test could do that would put
// a filesystem API within reach of code that ships to a browser. Build tooling belongs with
// the build tooling.
//
// It exists at all because the interesting properties of `constellation.css` are STRUCTURAL —
// is a token defined in every theme, have the two light blocks drifted apart, does a
// text/surface pair clear 4.5:1 — and none of those can be asserted by rendering. jsdom
// implements neither the cascade nor `var()` resolution, so a computed-style assertion there
// would be theatre.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import postcss from 'postcss';

const STYLES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'styles');

/** The four selectors that carry a semantic mapping. */
export const BLOCK_SELECTORS = {
  darkBase: ':root',
  lightMedia: ":root:not([data-theme='dark'])",
  lightOverride: ":root[data-theme='light']",
  darkOverride: ":root[data-theme='dark']",
};

export function readStylesheet(name) {
  return readFileSync(join(STYLES_DIR, name), 'utf8');
}

/**
 * Every rule whose selector is one of the four, with its custom properties and its position in
 * the file — so cascade ORDER can be asserted rather than assumed.
 */
export function readTokenBlocks(css) {
  const root = postcss.parse(css, { from: 'constellation.css' });
  const found = {};
  let index = 0;

  root.walkRules((rule) => {
    index += 1;
    const selector = rule.selector.trim();
    const name = Object.keys(BLOCK_SELECTORS).find((key) => BLOCK_SELECTORS[key] === selector);
    if (!name || found[name]) return;
    const tokens = {};
    rule.walkDecls((decl) => {
      if (decl.prop.startsWith('--')) tokens[decl.prop] = decl.value.trim();
    });
    found[name] = { selector, tokens, index };
  });

  for (const name of Object.keys(BLOCK_SELECTORS)) {
    if (!found[name]) throw new Error(`token layer: no rule found for ${BLOCK_SELECTORS[name]}`);
  }
  return found;
}

/**
 * Resolve a token to a concrete value, following `var()` chains through the given blocks in
 * cascade-priority order. THROWS rather than falling back: an unresolvable token inside a
 * contrast assertion must fail the test, not quietly evaluate as black and pass.
 */
export function resolveToken(token, blocks, depth = 0) {
  if (depth > 12) throw new Error(`token layer: \`${token}\` does not resolve (cycle?)`);
  let value;
  for (const block of blocks) {
    if (block[token] !== undefined) { value = block[token]; break; }
  }
  if (value === undefined) throw new Error(`token layer: \`${token}\` is not defined in any block`);

  const varMatch = /^var\(\s*(--[A-Za-z0-9_-]+)\s*\)$/.exec(value);
  return varMatch ? resolveToken(varMatch[1], blocks, depth + 1) : value;
}

/**
 * Every DECLARATION in a stylesheet, as `{ prop, value }`. Parsed rather than grepped, so a
 * property named in a COMMENT — this file's own prose about `forced-color-adjust`, for one —
 * is not mistaken for a declaration of it. Comments do not exist in the parsed tree.
 */
export function declarations(css, from = 'stylesheet.css') {
  const out = [];
  postcss.parse(css, { from }).walkDecls((decl) => {
    out.push({ prop: decl.prop.toLowerCase(), value: decl.value.trim().toLowerCase() });
  });
  return out;
}

/**
 * Every style rule with its declarations, PARSED.
 *
 * A regex over `selector { body }` cannot see nested rules and gets the destructuring of a
 * match array wrong at the first opportunity — which it did, silently, so the check that used
 * it passed against a file that violated it. postcss already knows what a rule is.
 */
export function styleRules(css, from = 'stylesheet.css') {
  const rules = [];
  postcss.parse(css, { from }).walkRules((rule) => {
    const atRules = [];
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (parent.type === 'atrule') atRules.unshift(`@${parent.name} ${parent.params}`.trim());
    }
    rules.push({
      atRules,
      selector: rule.selector,
      declarations: rule.nodes
        .filter((node) => node.type === 'decl')
        .map((decl) => ({ prop: decl.prop.toLowerCase(), value: decl.value.trim() })),
    });
  });
  return rules;
}

/**
 * The colour stops of a gradient token, resolved.
 *
 * A component does not sit on "the panel"; it sits on whatever is actually painted behind it,
 * and a gradient paints a RANGE. Measuring contrast against one nominal surface token is how a
 * badge inside a gradient card gets measured against the favourable end of it. Both endpoints
 * are surfaces, so both are returned.
 */
export function gradientStops(value, chain) {
  const stops = [];
  for (const match of value.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*\)|rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}/g)) {
    stops.push(match[1] ? resolveToken(match[1], chain) : match[0]);
  }
  return stops;
}

/* ── Colour maths ────────────────────────────────────────────────────────────────────────── */

export function parseColor(value) {
  const trimmed = value.trim();
  const hex = /^#([0-9a-fA-F]{3,8})$/.exec(trimmed);
  if (hex) {
    const digits = hex[1];
    const pair = (s) => parseInt(s.length === 1 ? s + s : s, 16);
    if (digits.length === 3 || digits.length === 4) {
      return {
        r: pair(digits[0]), g: pair(digits[1]), b: pair(digits[2]),
        a: digits.length === 4 ? pair(digits[3]) / 255 : 1,
      };
    }
    if (digits.length === 6 || digits.length === 8) {
      return {
        r: pair(digits.slice(0, 2)), g: pair(digits.slice(2, 4)), b: pair(digits.slice(4, 6)),
        a: digits.length === 8 ? pair(digits.slice(6, 8)) / 255 : 1,
      };
    }
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(trimmed);
  if (rgba) {
    const parts = rgba[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) throw new Error(`unparseable colour: ${value}`);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
  }
  throw new Error(`unparseable colour: ${value}`);
}

/** Composite a translucent colour over an opaque one — what a tinted badge actually looks like. */
export function over(top, bottom) {
  return {
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  };
}

function channel(value) {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance({ r, g, b }) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.x contrast ratio. Both inputs must already be opaque. */
export function contrastRatio(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
