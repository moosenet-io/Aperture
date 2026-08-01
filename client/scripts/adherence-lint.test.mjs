// Tests for the design-system adherence lint.
//
// Two halves, and the second matters as much as the first:
//
//   1. POSITIVE — each rule fires on the violation it claims to catch, and the clean tree
//      passes. A lint that cannot go red is not a gate.
//   2. NON-GOALS — each documented limitation is PINNED by a test asserting it is currently
//      NOT detected. That is deliberate. It stops the header comment drifting into a claim the
//      code does not support, and if someone later closes a gap the test goes red and forces
//      the documentation to be updated with it. A limitation nobody can see is a lie by
//      omission; a limitation with a test is a decision.
//
// Fixtures are real trees on disk, because the lint's job includes walking a tree, refusing an
// unknown extension, and failing on a missing target — none of which a string-in/findings-out
// helper would exercise.

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runAdherenceLint, findColorLiterals } from './adherence-lint.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = resolve(SCRIPT_DIR, '..');

let root;

/** The minimum a fixture tree needs to be scannable at all: both scan targets must exist. */
function fixture(files) {
  writeFileSync(join(root, 'index.html'), '<!doctype html>\n<html lang="en"><body></body></html>\n');
  mkdirSync(join(root, 'src', 'styles'), { recursive: true });
  writeFileSync(join(root, 'src', 'styles', 'constellation.css'), ':root { --accent: #7c3aed; }\n');
  for (const [relPath, content] of Object.entries(files)) {
    const absolute = join(root, relPath);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
}

function lint(allowlist = '{ "entries": [] }') {
  const allowlistPath = join(root, 'allowlist.json');
  writeFileSync(allowlistPath, allowlist);
  return runAdherenceLint({ root, allowlistPath });
}

const rules = (result) => result.findings.map((f) => f.rule).sort();

/**
 * Assert a run is CLEAN — no findings AND no errors.
 *
 * Checking only `findings` would let a broken fixture pass: a file that fails to parse
 * produces an error and zero findings, so `findings === []` alone would read as "the lint
 * correctly permits this" when the truth is "the lint never looked". Every no-violation
 * assertion in this file goes through here, and the non-goal tests especially.
 */
function expectClean(result) {
  expect(result.errors).toEqual([]);
  expect(result.findings).toEqual([]);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aperture-adherence-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/* ── The real tree ───────────────────────────────────────────────────────────────────────── */

describe('the client tree itself', () => {
  it('passes, with the default allowlist and the real scan targets', () => {
    const result = runAdherenceLint({ root: CLIENT_DIR });
    expect(result.errors).toEqual([]);
    expect(result.findings).toEqual([]);
  });

  it('actually reaches the files it claims to — the token layer and the primitives included', () => {
    // A green run over an empty scan is the failure mode this guards. Naming the files means a
    // future refactor that moves them out of the scan cannot pass unnoticed.
    const { scanned } = runAdherenceLint({ root: CLIENT_DIR });
    expect(scanned).toContain('src/styles/constellation.css');
    expect(scanned).toContain('src/styles/primitives.css');
    expect(scanned).toContain('src/components/primitives/index.tsx');
    expect(scanned).toContain('index.html');
  });
});

/* ── Positive: each rule fires ───────────────────────────────────────────────────────────── */

describe('inline styles', () => {
  it('rejects style={{…}} in TSX', () => {
    fixture({ 'src/Bad.tsx': 'export const Bad = () => <div style={{ padding: 4 }} />;\n' });
    expect(rules(lint())).toContain('inline-style');
  });

  it('rejects style="…" in TSX', () => {
    fixture({ 'src/Bad.tsx': 'export const Bad = () => <div style="padding:4px" />;\n' });
    expect(rules(lint())).toContain('inline-style');
  });

  it('rejects a style prop passed through a variable — the value is irrelevant', () => {
    fixture({ 'src/Bad.tsx': 'export const Bad = ({ s }: { s: object }) => <div style={s} />;\n' });
    expect(rules(lint())).toContain('inline-style');
  });

  it('rejects a style attribute in markup', () => {
    fixture({});
    writeFileSync(join(root, 'index.html'), '<html><body><div style="color:#fff"></div></body></html>');
    expect(rules(lint())).toContain('inline-style');
  });
});

describe('colour literals', () => {
  it('rejects a hex literal in a TSX string', () => {
    fixture({ 'src/Bad.tsx': "export const brand = '#1a1a1a';\n" });
    expect(rules(lint())).toContain('color-literal');
  });

  it('rejects a hex literal in a JSX attribute — a literal SVG fill', () => {
    fixture({ 'src/Bad.tsx': 'export const Bad = () => <svg><circle fill="#7C3AED" /></svg>;\n' });
    expect(rules(lint())).toContain('color-literal');
  });

  it('permits fill="currentColor" — the design system owns the colour', () => {
    fixture({ 'src/Ok.tsx': 'export const Ok = () => <svg><circle fill="currentColor" /></svg>;\n' });
    expectClean(lint());
  });

  it.each(['rgb(1,2,3)', 'rgba(1,2,3,.5)', 'hsl(1 2% 3%)', 'hwb(1 2% 3%)', 'oklch(.7 .1 200)', 'lab(1 2 3)', 'color(srgb 1 0 0)'])(
    'rejects %s in CSS',
    (value) => {
      fixture({ 'src/styles/x.css': `.x { color: ${value}; }\n` });
      expect(rules(lint())).toContain('color-literal');
    },
  );

  it('rejects a CSS named colour', () => {
    fixture({ 'src/styles/x.css': '.x { color: rebeccapurple; }\n' });
    expect(rules(lint())).toContain('color-literal');
  });

  it('does not mistake a token reference for a named colour', () => {
    // `var(--violet-500)` contains "violet"; `--flux-green-deep` contains "green". Neither is
    // a literal, and a lint that cried wolf on the token layer's own vocabulary would be
    // turned off within a week.
    fixture({ 'src/styles/x.css': '.x { color: var(--violet-500); border-color: var(--flux-green-deep); }\n' });
    expectClean(lint());
  });

  it('does not flag CSS keywords that are not hues', () => {
    fixture({ 'src/styles/x.css': '.x { border: var(--border-width) solid transparent; background: none; overflow: hidden; }\n' });
    expectClean(lint());
  });

  it('permits colour literals in the token layer, and only there', () => {
    fixture({ 'src/styles/x.css': '.x { color: var(--accent); }\n' });
    expectClean(lint());
    // The fixture's constellation.css declares `--accent: #7c3aed` and does not fire.
    expect(lint().scanned).toContain('src/styles/constellation.css');
  });

  it('rejects a hex literal in a JSON file under src', () => {
    fixture({ 'src/data.json': '{ "brand": "#ff0000" }\n' });
    expect(rules(lint())).toContain('color-literal');
  });
});

describe('style blocks', () => {
  it('rejects a <style> element in TSX', () => {
    fixture({ 'src/Bad.tsx': 'export const Bad = () => <style>{".x{}"}</style>;\n' });
    expect(rules(lint())).toContain('style-block');
  });

  it('rejects a <style> element in markup', () => {
    fixture({});
    writeFileSync(join(root, 'index.html'), '<html><head><style>body{}</style></head></html>');
    expect(rules(lint())).toContain('style-block');
  });

  it('reports a <style> element inside an HTML comment — it errs toward the alarm', () => {
    fixture({});
    writeFileSync(join(root, 'index.html'), '<html><!-- <style>body{}</style> --></html>');
    expect(rules(lint())).toContain('style-block');
  });
});

describe('font literals', () => {
  it('rejects a font-family declaration outside the token layer', () => {
    fixture({ 'src/styles/x.css': ".x { font-family: 'Comic Sans', sans-serif; }\n" });
    expect(rules(lint())).toContain('font-literal');
  });

  it('rejects a font stack smuggled into a custom property', () => {
    // The interesting case: the property name is not `font-family`, so a rule keyed on the
    // property name alone would miss it entirely.
    fixture({ 'src/styles/x.css': ".x { --sneaky: 'Comic Sans', sans-serif; }\n" });
    expect(rules(lint())).toContain('font-literal');
  });

  it('permits a font-family that references a token', () => {
    fixture({ 'src/styles/x.css': '.x { font-family: var(--font-mono); }\n' });
    expectClean(lint());
  });

  it('rejects a fontFamily property in TypeScript', () => {
    fixture({ 'src/bad.ts': 'export const s = { fontFamily: "Inter" };\n' });
    expect(rules(lint())).toContain('font-literal');
  });
});

describe('programmatic styling', () => {
  it.each([
    ['assignment', 'document.body.style.color = c;'],
    ['setProperty', 'document.body.style.setProperty("--x", c);'],
    ['cssText', 'document.body.style.cssText = c;'],
    ['setAttribute', 'document.body.setAttribute("style", c);'],
  ])('rejects %s', (_name, statement) => {
    fixture({ 'src/bad.ts': `export function apply(c: string) { ${statement} }\n` });
    expect(rules(lint())).toContain('programmatic-style');
  });

  it('rejects dangerouslySetInnerHTML', () => {
    fixture({ 'src/Bad.tsx': 'export const Bad = () => <div dangerouslySetInnerHTML={{ __html: "x" }} />;\n' });
    expect(rules(lint())).toContain('programmatic-style');
  });
});

describe('forced colours', () => {
  it('rejects forced-color-adjust: none in CSS', () => {
    fixture({ 'src/styles/x.css': '.x { forced-color-adjust: none; }\n' });
    expect(rules(lint())).toContain('forced-color-none');
  });

  it('rejects it in the token layer too — no file may defeat a user\'s own palette', () => {
    fixture({ 'src/styles/constellation.css': ':root { --a: #fff; }\n.x { forced-color-adjust: none; }\n' });
    expect(rules(lint())).toContain('forced-color-none');
  });

  it('permits forced-color-adjust: auto', () => {
    fixture({ 'src/styles/x.css': '.x { forced-color-adjust: auto; }\n' });
    expectClean(lint());
  });
});

describe('malformed CSS — the leniency of postcss is not a clean bill of health', () => {
  it('rejects the exact garbage that shipped on this branch and passed a green build', () => {
    // `.x { @@@ display: flex; … }`. postcss read `@@` as an AT-RULE NAME with `display: flex`
    // as its params: no parse error, and the swallowed declaration was never walked. The
    // fail-closed-on-unparseable claim was never engaged, because the file did parse.
    fixture({ 'src/styles/x.css': '.app { @@@ \n  display: flex;\n  color: #ff0000;\n}\n' });
    expect(rules(lint())).toContain('malformed-css');
  });

  it('proves the hiding half: a swallowed declaration escapes the CONTENT rules', () => {
    // Precisely what is lost, re-measured after at-rule params gained a px scan — not carried
    // forward from the previous revision. At-rule params are now scanned for colours AND
    // dimensions, so those two rules survive a swallow; the font and forced-colours rules walk
    // declarations only, and still go blind. `malformed-css` is what makes a swallow visible
    // at all, whatever it happens to be carrying.
    for (const swallowed of ["font-family: 'Comic Sans', sans-serif", 'forced-color-adjust: none']) {
      rmSync(root, { recursive: true, force: true });
      root = mkdtempSync(join(tmpdir(), 'aperture-adherence-'));
      fixture({ 'src/styles/x.css': `.app { @@@ ${swallowed};\n}\n` });
      const found = [...new Set(lint().findings.map((f) => f.rule))];
      expect(found, swallowed).toEqual(['malformed-css']);
    }
  });

  it('a swallowed dimension IS caught, now that at-rule params are scanned for px', () => {
    fixture({ 'src/styles/x.css': '.app { @@@ padding: 7px;\n}\n' });
    expect(rules(lint())).toContain('dimension-literal');
  });

  it('the colour rule alone survives a swallow, because at-rule params are scanned too', () => {
    fixture({ 'src/styles/x.css': '.app { @@@ color: #ff0000;\n}\n' });
    expect(rules(lint())).toContain('color-literal');
  });

  it('rejects an at-rule name that is merely a typo', () => {
    fixture({ 'src/styles/x.css': '@medai (min-width: 40em) { .x { display: none; } }\n' });
    expect(rules(lint())).toContain('malformed-css');
  });

  it('rejects a known at-rule that has no block', () => {
    fixture({ 'src/styles/x.css': '@media (min-width: 40em);\n' });
    expect(rules(lint())).toContain('malformed-css');
  });

  it.each([
    ['@property', '.x { @property --foo: padding: 7px; }'],
    ['@viewport', '.x { @viewport padding: 7px; }'],
    ['@page', '.x { @page margin: 7px; }'],
  ])('rejects %s nested where a declaration belongs — the door around the old registry', (_n, css) => {
    // These are REAL at-rules with real names, so a name check passes them, and an earlier
    // revision listed the at-rules that require a block and simply did not include them. Both
    // swallow the declaration that follows exactly as `@@@` did.
    fixture({ 'src/styles/x.css': css });
    expect(rules(lint())).toContain('malformed-css');
  });

  it('rejects an at-rule that does not exist yet — the check fails CLOSED on the unanticipated', () => {
    // This is the property the inversion buys, and the reason the registry is an allowlist.
    // A denylist of block-requiring at-rules would pass this silently forever.
    fixture({ 'src/styles/x.css': '.x { @some-future-at-rule padding: 7px; }\n' });
    expect(rules(lint())).toContain('malformed-css');
  });

  it('rejects even a real nesting construct that is not on the small allowlist', () => {
    // `@starting-style` is legitimate CSS and legitimately nestable. It is still rejected,
    // because the allowlist names what this design system uses, not everything that exists.
    // Adding it is a reviewed source change — a false positive a human resolves, which is the
    // correct trade for never passing an unknown one.
    fixture({ 'src/styles/x.css': '.x { @starting-style { opacity: 0; } }\n' });
    expect(rules(lint())).toContain('malformed-css');
  });

  it.each([
    ['@media', '.x { @media (min-width: 40em) { color: var(--a); } }'],
    ['@supports', '.x { @supports (display: grid) { display: grid; } }'],
    ['@container', '.x { @container (min-width: 20em) { display: grid; } }'],
  ])('permits %s nested inside a style rule', (_n, css) => {
    fixture({ 'src/styles/x.css': css });
    expectClean(lint());
  });

  it('permits the at-rules the design system actually uses', () => {
    fixture({
      'src/styles/x.css':
        '@media (prefers-reduced-motion: reduce) { .x { animation-duration: 1ms; } }\n'
        + '@media (forced-colors: active) { .x { box-shadow: none; } }\n'
        + '@supports (display: grid) { .x { display: grid; } }\n'
        + '@keyframes spin { to { opacity: 1; } }\n'
        + '@-webkit-keyframes spin { to { opacity: 1; } }\n'
        + '@layer base;\n'
        + '@font-face { font-weight: 400; }\n',
    });
    expectClean(lint());
  });

  it('rejects a property name that is not a valid ident', () => {
    fixture({ 'src/styles/x.css': '.x { 9colour: inherit; }\n' });
    expect(rules(lint())).toContain('malformed-css');
  });

  it('permits custom properties and vendor prefixes', () => {
    fixture({ 'src/styles/x.css': '.x { --my-token: 1; -webkit-font-smoothing: antialiased; }\n' });
    expectClean(lint());
  });
});

describe('dimension literals', () => {
  it('rejects a raw px value outside the token layer', () => {
    fixture({ 'src/styles/x.css': '.x { padding: 7px 10px; }\n' });
    expect(rules(lint())).toContain('dimension-literal');
  });

  it('permits a px value in the token layer, where the scale is defined', () => {
    fixture({ 'src/styles/constellation.css': ':root { --space-3: 12px; --accent: #7c3aed; }\n' });
    expectClean(lint());
  });

  it('permits a tokenised dimension', () => {
    fixture({ 'src/styles/x.css': '.x { padding: var(--cell-pad-y) var(--cell-pad-x); }\n' });
    expectClean(lint());
  });

  it('permits a literal carrying an inline reason ABOVE the declaration', () => {
    fixture({
      'src/styles/x.css':
        '.x {\n  /* dimension-literal: a 2px lift is the smallest movement that reads as a lift */\n'
        + '  transform: translateY(-2px);\n}\n',
    });
    expectClean(lint());
  });

  it('permits a literal carrying an inline reason on the SAME line', () => {
    fixture({
      'src/styles/x.css':
        '.x { transform: translateY(-2px); /* dimension-literal: motion amplitude, not spacing */ }\n',
    });
    expectClean(lint());
  });

  it('does NOT accept a reason on a different line after the declaration', () => {
    // One reason must not silently cover a value it was never written about.
    fixture({
      'src/styles/x.css':
        '.x {\n  transform: translateY(-2px);\n'
        + '  /* dimension-literal: this reason is attached to nothing in particular */\n}\n',
    });
    expect(rules(lint())).toContain('dimension-literal');
  });

  it('rejects a token-shaped excuse that is not a real reason', () => {
    fixture({ 'src/styles/x.css': '.x { /* dimension-literal: ok */\n  padding: 3px; }\n' });
    expect(rules(lint())).toContain('dimension-literal');
  });

  it.each(['7PX', '7Px', '7pX'])('matches %s — CSS units are case-insensitive', (value) => {
    fixture({ 'src/styles/x.css': `.x { padding: ${value}; }\n` });
    expect(rules(lint())).toContain('dimension-literal');
  });

  it.each(['1e3px', '1E3px', '1e+3px', '1e-3px', '1.5e3px', '.5e-3px', '+1e3px', '-1e3px'])(
    'matches %s — CSS numbers take an exponent, and the matcher follows the grammar',
    (value) => {
      // Written against the CSS Syntax L3 <number-token> production rather than the examples
      // to hand. `1e+3px` is the one worth naming: the previous matcher did not miss it
      // cleanly, it matched the tail as `3px` and reported a garbled literal.
      fixture({ 'src/styles/x.css': `.x { width: ${value}; }\n` });
      expect(rules(lint()), value).toContain('dimension-literal');
    },
  );

  it('matches an exponent px in an at-rule parameter too', () => {
    fixture({ 'src/styles/x.css': '@media (min-width: 1e3px) { .x { display: none; } }\n' });
    expect(rules(lint())).toContain('dimension-literal');
  });

  it('reports the WHOLE literal, not a fragment of it', () => {
    // A garbled finding is worse than none: it sends a reader looking for a value that is not
    // in the file. This pins the exact text reported.
    fixture({ 'src/styles/x.css': '.x { width: 1e+3px; }\n' });
    const found = lint().findings.filter((f) => f.rule === 'dimension-literal');
    expect(found).toHaveLength(1);
    expect(found[0].detail).toContain('1e+3px');
  });

  it.each(['0.5rem', '100%', '1fr', 'var(--pad-2px)', '12', 'calc(var(--a) * 2)'])(
    'still ignores %s — the wider match must not have cost precision',
    (value) => {
      fixture({ 'src/styles/x.css': `.x { width: ${value}; }\n` });
      expectClean(lint());
    },
  );

  it('scans at-rule PARAMS, not only declarations', () => {
    // A breakpoint is a px literal like any other, and it lived outside the rule's reach until
    // a reviewer pointed at it.
    fixture({ 'src/styles/x.css': '@media (min-width: 777px) { .x { display: none; } }\n' });
    expect(rules(lint())).toContain('dimension-literal');
  });

  it('permits a breakpoint that carries a reason — it genuinely cannot be a token', () => {
    // `var()` does not resolve inside a media condition, so this literal is unavoidable. The
    // escape is the same one every optical value uses: say why, next to the value.
    fixture({
      'src/styles/x.css':
        '/* dimension-literal: the width below which the rail becomes a drawer */\n'
        + '@media (min-width: 777px) { .x { display: none; } }\n',
    });
    expectClean(lint());
  });

  it('checks px only — rem, %, and unitless values are a documented non-goal', () => {
    fixture({ 'src/styles/x.css': '.x { padding: 0.5rem; width: 50%; line-height: 1.3; flex: 1fr; }\n' });
    expectClean(lint());
  });
});

/* ── Fail-closed ─────────────────────────────────────────────────────────────────────────── */

describe('failing closed', () => {
  it('errors on a TypeScript file that does not parse', () => {
    fixture({ 'src/Bad.tsx': 'export const Bad = () => <div /;\n' });
    const result = lint();
    expect(result.errors.join('\n')).toMatch(/does not parse as TypeScript/);
  });

  it('errors on a CSS file that does not parse', () => {
    fixture({ 'src/styles/x.css': '.x { color: var(--a)\n' });
    expect(lint().errors.join('\n')).toMatch(/does not parse as CSS/);
  });

  it('errors on a JSON file that does not parse', () => {
    fixture({ 'src/data.json': '{ nope\n' });
    expect(lint().errors.join('\n')).toMatch(/does not parse as JSON/);
  });

  it('errors on a file whose extension has no parser rather than skipping it', () => {
    fixture({ 'src/notes.txt': 'color: #ff0000\n' });
    expect(lint().errors.join('\n')).toMatch(/no parser is registered/);
  });

  it('skips a known binary asset without erroring', () => {
    fixture({ 'src/logo.woff2': 'wOF2binary' });
    const result = lint();
    expect(result.errors).toEqual([]);
    expect(result.scanned).not.toContain('src/logo.woff2');
  });

  it('errors when a scan target is missing', () => {
    // No fixture() call: neither `src` nor `index.html` exists.
    expect(lint().errors.join('\n')).toMatch(/could not be walked/);
  });

  it('errors when nothing at all was scanned', () => {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'index.html'), '<html></html>');
    rmSync(join(root, 'index.html'));
    const result = lint();
    expect(result.errors.join('\n')).toMatch(/could not be walked|no files were scanned/);
  });
});

/* ── The allowlist ───────────────────────────────────────────────────────────────────────── */

describe('the allowlist', () => {
  const entry = (over = {}) => JSON.stringify({
    entries: [{
      file: 'src/styles/syntax/theme.css',
      value: '#ff0000',
      rule: 'color-literal',
      reason: 'A syntax-highlighting theme is a list of colours by definition.',
      ...over,
    }],
  });

  it('suppresses exactly the entry it names', () => {
    fixture({ 'src/styles/syntax/theme.css': '.tok-keyword { color: #ff0000; }\n' });
    expectClean(lint(entry()));
  });

  it('does not suppress a different literal in the same file', () => {
    fixture({ 'src/styles/syntax/theme.css': '.a { color: #ff0000; }\n.b { color: #00ff00; }\n' });
    const result = lint(entry());
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].literal).toBe('#00ff00');
  });

  it('does not suppress the same literal in a different file', () => {
    fixture({
      'src/styles/syntax/theme.css': '.a { color: #ff0000; }\n',
      'src/styles/other.css': '.b { color: #ff0000; }\n',
    });
    const result = lint(entry());
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].file).toBe('src/styles/other.css');
  });

  it('never suppresses by substring — "#ff0000" does not cover "#ff00001"-style neighbours', () => {
    fixture({ 'src/styles/syntax/theme.css': '.a { color: #ff0000; }\n.b { color: #ff0000aa; }\n' });
    const result = lint(entry());
    expect(result.findings.map((f) => f.literal)).toEqual(['#ff0000aa']);
  });

  it('rejects a file outside the code-owned path registry', () => {
    fixture({ 'src/components/Bad.tsx': "export const c = '#ff0000';\n" });
    expect(lint(entry({ file: 'src/components/Bad.tsx' })).errors.join('\n'))
      .toMatch(/outside the code-owned allowlistable path registry/);
  });

  it('rejects a rule other than color-literal — inline styles are never allowlistable', () => {
    fixture({ 'src/styles/syntax/theme.css': '.a { color: #ff0000; }\n' });
    expect(lint(entry({ rule: 'inline-style' })).errors.join('\n')).toMatch(/only those are allowlistable/);
  });

  it('rejects an entry with no reason', () => {
    fixture({ 'src/styles/syntax/theme.css': '.a { color: #ff0000; }\n' });
    expect(lint(entry({ reason: 'why' })).errors.join('\n')).toMatch(/reason/);
  });

  it('rejects a duplicate entry', () => {
    fixture({ 'src/styles/syntax/theme.css': '.a { color: #ff0000; }\n' });
    const dup = JSON.parse(entry());
    dup.entries.push({ ...dup.entries[0] });
    expect(lint(JSON.stringify(dup)).errors.join('\n')).toMatch(/duplicate/);
  });

  it('rejects an unknown top-level key', () => {
    fixture({});
    expect(lint('{ "entries": [], "disable": true }').errors.join('\n')).toMatch(/unknown top-level key/);
  });

  it('rejects an unknown entry key', () => {
    fixture({ 'src/styles/syntax/theme.css': '.a { color: #ff0000; }\n' });
    expect(lint(entry({ everywhere: true })).errors.join('\n')).toMatch(/unknown key/);
  });

  it('errors on a STALE entry that matched nothing', () => {
    fixture({});
    expect(lint(entry()).errors.join('\n')).toMatch(/matched nothing in this run/);
  });

  it('errors when the allowlist file is missing entirely', () => {
    fixture({});
    const result = runAdherenceLint({ root, allowlistPath: join(root, 'nope.json') });
    expect(result.errors.join('\n')).toMatch(/cannot read/);
  });

  it('errors when the allowlist is not valid JSON', () => {
    fixture({});
    expect(lint('{ nope').errors.join('\n')).toMatch(/not valid JSON/);
  });

  it('accepts an empty allowlist — which is what the repository ships', () => {
    fixture({});
    expect(lint('{ "entries": [] }').errors).toEqual([]);
  });
});

/* ── NON-GOALS: pinned, so the documentation cannot drift ────────────────────────────────── */

describe('documented non-goals — each is NOT detected, on purpose and on record', () => {
  it('does not detect a colour assembled by string concatenation', () => {
    fixture({ 'src/bad.ts': "export const c = '#' + 'ff0000';\n" });
    expectClean(lint());
  });

  it('does not detect a colour built from a template substitution', () => {
    fixture({ 'src/bad.ts': 'export const c = (h: string) => `rgb$\{h}(1,2,3)`;\n' });
    expectClean(lint());
  });

  it('DOES detect a colour in the static text of a template literal', () => {
    // The other half of the same claim: the parts we CAN see, we do see.
    fixture({ 'src/bad.ts': 'export const c = (h: string) => `#ff0000$\{h}`;\n' });
    expect(rules(lint())).toContain('color-literal');
  });

  it('does not detect a CSS named colour in a TypeScript string', () => {
    fixture({ 'src/bad.ts': "export const c = 'salmon';\n" });
    expectClean(lint());
  });

  it('does not detect a colour handed to a third-party component prop', () => {
    // There is no rule that could: the value is a variable and the prop belongs to a package
    // this lint does not scan. Recorded so nobody reads the `programmatic-style` rule as a
    // general guarantee about custom properties.
    fixture({
      'src/bad.tsx': 'declare const Chart: (p: { colour: string }) => JSX.Element;\n'
        + 'export const B = ({ c }: { c: string }) => <Chart colour={c} />;\n',
    });
    expectClean(lint());
  });

  it('does not scan text between markup tags', () => {
    fixture({});
    writeFileSync(join(root, 'index.html'), '<html><body>#ff0000</body></html>');
    expectClean(lint());
  });

  it('does not scan dependency stylesheets — node_modules is never walked', () => {
    fixture({ 'src/node_modules/dep/x.css': '.d { color: #ff0000; }\n' });
    const result = lint();
    expectClean(result);
    expect(result.scanned.some((f) => f.includes('node_modules'))).toBe(false);
  });
});

/* ── The literal extractor, directly ─────────────────────────────────────────────────────── */

describe('findColorLiterals', () => {
  it('does not truncate a long hex into a short one', () => {
    // `#deadbeefcafe` is not a colour; reading the first 8 characters as one would be a
    // false positive that teaches people to distrust the lint.
    expect(findColorLiterals('#deadbeefcafe', { named: true })).toEqual([]);
  });

  it('reads an 8-digit hex', () => {
    expect(findColorLiterals('#ff0000aa', { named: false })).toEqual(['#ff0000aa']);
  });

  it('ignores color-mix over tokens, which contains no literal', () => {
    expect(findColorLiterals('color-mix(in srgb, var(--a), var(--b))', { named: true })).toEqual([]);
  });
});
