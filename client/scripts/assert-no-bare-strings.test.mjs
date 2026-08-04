// Tests for the no-bare-strings gate.
//
// Three halves, and the last two matter as much as the first:
//
//   1. POSITIVE — every rule fires on the violation it claims to catch, and a clean tree passes.
//      A gate you have never seen fail is unverified.
//   2. FAIL-CLOSED — every "this is an error, not a skip" claim in the script's header is
//      exercised. A guard nobody has watched fail is a guard that only claims to exist.
//   3. NON-GOALS — each documented limitation is PINNED by a test asserting it is currently NOT
//      detected, with a message saying what to do if it goes red. A limitation nobody can see is
//      a lie by omission; a limitation with a test is a decision.
//
// Plus a fourth set that runs against the REAL client tree, because the properties that matter
// most — that the walk covers the tree, and that nothing falls between "scanned" and "excluded" —
// are properties of the actual source, not of a fixture.
//
// Fixtures are real trees on disk: the gate's job includes walking a tree, reading a catalogue
// from it, and refusing an unknown extension, none of which a string-in/findings-out helper
// would exercise.

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runBareStringGate, readCatalogueKeys, compilerCapabilityErrors } from './assert-no-bare-strings.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = resolve(SCRIPT_DIR, '..');

let root;

const CATALOGUE = `export const STRINGS = {
  'app.name': 'Aperture',
  'state.busy': 'Working…',
} as const;
`;

/** The minimum a fixture tree needs: a catalogue the gate can read. */
function fixture(files, { catalogue = CATALOGUE } = {}) {
  mkdirSync(join(root, 'src', 'strings'), { recursive: true });
  if (catalogue !== null) writeFileSync(join(root, 'src', 'strings', 'catalogue.ts'), catalogue);
  for (const [relPath, content] of Object.entries(files)) {
    const absolute = join(root, relPath);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
  }
}

const gate = () => runBareStringGate({ root });
const rules = (result) => result.findings.map((f) => f.rule).sort();

/**
 * Assert a run is CLEAN — no findings AND no errors.
 *
 * Checking `findings` alone would let a broken fixture pass: a file that fails to parse produces
 * an error and zero findings, so `findings === []` would read as "the gate correctly permits
 * this" when the truth is "the gate never looked".
 */
function expectClean(result) {
  expect(result.errors).toEqual([]);
  expect(result.findings).toEqual([]);
}

/**
 * Assert a RECORDED non-detection: the scan ran, and found nothing.
 *
 * The errors assertion is the load-bearing half — a recording that checks only `findings` cannot
 * tell SILENCE from FAILURE, and would record "not detected" when the truth is "did not run".
 */
function expectRecordedNotDetected(result, message) {
  expect(result.errors, `${message} (the scan ERRORED — broken fixture, not a behaviour change)`).toEqual([]);
  expect(result.findings, `${message}\nIf this is now DETECTED: widen the claim in the script's NON-GOALS and delete this test.`)
    .toEqual([]);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aperture-bare-strings-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/* ── The clean case ──────────────────────────────────────────────────────────────────────── */

describe('a clean tree', () => {
  it('passes', () => {
    fixture({
      'src/App.tsx': `import { t } from './strings';
export function App(): JSX.Element {
  return <main className="app" aria-live="polite">{t('app.name')}</main>;
}
`,
    });
    expectClean(gate());
  });

  it('reports the file it scanned, so a green run is not a silent one', () => {
    fixture({ 'src/App.tsx': 'export const x = 1;\n' });
    expect(gate().scanned).toContain('src/App.tsx');
  });
});

/* ── POSITIVE: every rule fires ──────────────────────────────────────────────────────────── */

describe('bare-jsx-text', () => {
  it('fires on literal text between tags', () => {
    fixture({ 'src/App.tsx': 'export const a = <h1>Aperture</h1>;\n' });
    expect(rules(gate())).toEqual(['bare-jsx-text']);
  });

  it('reports the offending text, not just the rule name', () => {
    // Asserting a rule id alone would pass over a message printing `undefined`.
    fixture({ 'src/App.tsx': 'export const a = <h1>Sign in again</h1>;\n' });
    expect(gate().findings[0].detail).toContain('Sign in again');
  });

  it('does NOT fire on the whitespace that JSX indentation is made of', () => {
    fixture({
      'src/App.tsx': `import { t } from './strings';
export const a = (
  <div className="x">
    <span className="y">{t('app.name')}</span>
  </div>
);
`,
    });
    expectClean(gate());
  });
});

describe('bare-jsx-expression', () => {
  it('fires on a string literal rendered as a child', () => {
    fixture({ 'src/App.tsx': "export const a = <p>{'Cancel'}</p>;\n" });
    expect(rules(gate())).toEqual(['bare-jsx-expression']);
  });

  it('fires on a template literal rendered as a child — the concatenated-markup case', () => {
    fixture({ 'src/App.tsx': 'export const a = (n: string) => <p>{`Hello ${n}`}</p>;\n' });
    expect(gate().findings[0].detail).toContain('format()');
  });

  it('fires on a static string behind a value-preserving wrapper', () => {
    // `as`, `!` and parentheses do not change the value, and a gate that treated them as
    // different would be telling people the rule is about syntax when it is about the value.
    fixture({ 'src/App.tsx': "export const a = <p>{('Cancel' as string)}</p>;\n" });
    expect(rules(gate())).toEqual(['bare-jsx-expression']);
  });

  it('does NOT fire on a whitespace-only expression', () => {
    fixture({ 'src/App.tsx': "export const a = <p>{' '}</p>;\n" });
    expectClean(gate());
  });
});

describe('bare-attribute-string', () => {
  it.each([
    ['title', '<img title="A photograph" />'],
    ['alt', '<img alt="A photograph" />'],
    ['placeholder', '<input placeholder="Search threads" />'],
    ['aria-label', '<button aria-label="Close the dialog" />'],
    ['aria-roledescription', '<div aria-roledescription="carousel slide" />'],
    ['a component prop', '<EmptyState description="No threads yet" />'],
  ])('fires on %s', (_name, jsx) => {
    fixture({ 'src/App.tsx': `export const a = ${jsx};\n` });
    expect(rules(gate())).toEqual(['bare-attribute-string']);
  });

  it('fires on a static string behind a wrapper, exactly as in a child position', () => {
    fixture({ 'src/App.tsx': "export const a = <img alt={'A photograph' as string} />;\n" });
    expect(rules(gate())).toEqual(['bare-attribute-string']);
  });

  it('does NOT fire on the technical attributes the registry names', () => {
    fixture({
      'src/App.tsx': `export const a = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" focusable="false" role="img">
    <path d="M16 3 L23 16 Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);
export const b = <div className="x" id="y" data-state="open" aria-live="polite" aria-hidden="true" />;
export const c = <button type="button" onClick={() => {}} tabIndex={0} />;
`,
    });
    expectClean(gate());
  });

  it('does NOT fire on an expression it cannot resolve — that is a non-goal, not a pass', () => {
    fixture({ 'src/App.tsx': 'export const a = (x: string) => <img alt={x} />;\n' });
    expectRecordedNotDetected(gate(), 'a runtime value in an attribute is not analysed');
  });

  /* ── The enumeration regressions. Each of these was, or would have been, a hole. ────────── */

  it('fires on a prop that merely STARTS with "on" — a bare prefix would have admitted it', () => {
    // An earlier revision allowed any `on*` name as an event handler. `onboardingTitle` is a
    // perfectly ordinary prop name, and it would have walked straight through: a hole opened by
    // the shorthand for closing one. Handlers are matched by React's `on[A-Z]` convention now.
    fixture({ 'src/App.tsx': 'export const a = <Onboarding onboardingTitle="Welcome to Aperture" />;\n' });
    expect(rules(gate())).toEqual(['bare-attribute-string']);
  });

  it('fires on a bare `data-` with no name after the dash', () => {
    fixture({ 'src/App.tsx': 'export const a = <div data-="Not a data attribute" />;\n' });
    expect(rules(gate())).toEqual(['bare-attribute-string']);
  });

  it('fires on a name that merely CONTAINS a registered one', () => {
    // Substring matching would let `subtitle` inherit `title`'s treatment — except `title` is not
    // permitted either, so the case that matters is a registered name: `classNameLabel`.
    fixture({ 'src/App.tsx': 'export const a = <div classNameLabel="Recent threads" />;\n' });
    expect(rules(gate())).toEqual(['bare-attribute-string']);
  });
});

describe('bare-css-content', () => {
  it('fires on text put on screen from a stylesheet', () => {
    fixture({ 'src/styles/x.css': '.empty::after { content: "Nothing here yet"; }\n' });
    expect(rules(gate())).toEqual(['bare-css-content']);
  });

  it('does NOT fire on a decorative empty string, a glyph escape, or attr()', () => {
    fixture({
      'src/styles/x.css': `.a::before { content: ""; }
.b::before { content: "\\2014"; }
.c::before { content: attr(data-label); }
.d { justify-content: center; }
`,
    });
    expectClean(gate());
  });
});

describe('the catalogue-key rules', () => {
  it('fires on a key the catalogue does not contain', () => {
    fixture({ 'src/App.tsx': "import { t } from './strings';\nexport const a = t('nope.not.here');\n" });
    expect(rules(gate())).toEqual(['unknown-catalogue-key']);
    expect(gate().findings[0].detail).toContain('nope.not.here');
  });

  it('fires on a key assembled at the call site', () => {
    fixture({
      'src/App.tsx': "import { t } from './strings';\nexport const a = (k: string) => t(`error.${k}` as never);\n",
    });
    expect(rules(gate())).toEqual(['assembled-catalogue-key']);
  });

  it('fires on a key built by concatenation', () => {
    fixture({
      'src/App.tsx': "import { t } from './strings';\nexport const a = (k: string) => t(('error.' + k) as never);\n",
    });
    expect(rules(gate())).toEqual(['assembled-catalogue-key']);
  });

  it('follows an import alias, so a renamed lookup is still checked', () => {
    fixture({ 'src/App.tsx': "import { t as tr } from './strings';\nexport const a = tr('nope');\n" });
    expect(rules(gate())).toEqual(['unknown-catalogue-key']);
  });

  it('does NOT check a `t` that came from somewhere else — positive identification only', () => {
    // A one-letter name is not evidence. Checking every `t(…)` would produce false accusations
    // in any file that happened to use the name for something else.
    fixture({ 'src/App.tsx': "const t = (s: string) => s;\nexport const a = t('anything at all');\n" });
    expectClean(gate());
  });

  it('permits a key passed as a variable — the compiler owns that, and it owns it better', () => {
    // `t()` accepts only `PlainKey`, so an undeclared key does not compile. Flagging the
    // indirection would ban the STRONGER pattern: a typed table whose completeness tsc checks.
    fixture({
      'src/App.tsx': `import { t } from './strings';
const table = { a: 'app.name' } as const;
export const a = t(table.a);
`,
    });
    expectClean(gate());
  });
});

describe('test-file-imported', () => {
  it('fires when application code imports a test module', () => {
    // This is what makes the test-file exclusion safe rather than merely convenient.
    fixture({
      'src/App.tsx': "import { helper } from './helpers.test';\nexport const a = helper;\n",
      'src/helpers.test.ts': 'export const helper = 1;\n',
    });
    expect(rules(gate())).toEqual(['test-file-imported']);
  });

  it('fires on a re-export of a test module too', () => {
    fixture({
      'src/App.tsx': "export { helper } from './helpers.test';\n",
      'src/helpers.test.ts': 'export const helper = 1;\n',
    });
    expect(rules(gate())).toEqual(['test-file-imported']);
  });

  it('does not fire between test files, which may import each other freely', () => {
    fixture({
      'src/a.test.ts': "import './b.test';\n",
      'src/b.test.ts': 'export const b = 1;\n',
      'src/App.tsx': 'export const a = 1;\n',
    });
    expectClean(gate());
  });

  it('excludes test files from the JSX rules, and SAYS SO in the result', () => {
    fixture({
      'src/App.tsx': 'export const a = 1;\n',
      'src/App.test.tsx': 'export const a = <h1>A fixture heading</h1>;\n',
    });
    const result = gate();
    expect(result.findings).toEqual([]);
    expect(result.excluded.map((entry) => entry.file)).toEqual(['src/App.test.tsx']);
    expect(result.excluded[0].reason).toMatch(/test module/);
  });
});


describe('ui-string-cast', () => {
  it('fires on a cast that forges the brand', () => {
    fixture({ 'src/App.tsx': "import type { UiString } from './strings';\nexport const a = 'Cancel' as UiString;\n" });
    expect(rules(gate())).toEqual(['ui-string-cast']);
  });

  it('fires on the `as unknown as` spelling, which is how a nominal brand is actually forged', () => {
    // The outer assertion is the one that names the brand, so laundering through `unknown` does
    // not get past this — that spelling is precisely what made the old "cannot be produced
    // outside this module" claim false.
    fixture({ 'src/App.tsx': "import type { UiString } from './strings';\nexport const a = (x: number) => x as unknown as UiString;\n" });
    expect(rules(gate())).toEqual(['ui-string-cast']);
  });

  it('permits the module that DECLARES the brand to mint one', () => {
    // Something has to. The exemption is one code-owned path, not a pattern.
    fixture({ 'src/strings/index.ts': "import type { UiString } from './catalogue';\nexport const a = 'x' as UiString;\n" });
    expectClean(gate());
  });

  it('does NOT fire on a cast to some other type', () => {
    fixture({ 'src/App.tsx': 'export const a = (x: unknown) => x as string;\n' });
    expectClean(gate());
  });

  it('does not detect a brand laundered through `any` — a recorded non-goal', () => {
    // A value the checker has already widened names nothing for a lexical scan to match. This is
    // why the README says the brand is not unforgeable rather than implying that it is.
    fixture({
      'src/App.tsx': "import type { UiString } from './strings';\nconst loose: any = 'Cancel';\nexport const a: UiString = loose;\n",
    });
    expectRecordedNotDetected(gate(), 'a brand laundered through `any` is not detected');
  });
});

describe('the listed UiString escape', () => {
  it('records every fromUserContent call site rather than failing on it', () => {
    fixture({
      'src/App.tsx': `import { fromUserContent } from './strings';
export const a = (title: string) => fromUserContent(title);
export const b = (name: string) => fromUserContent(name);
`,
    });
    const result = gate();
    expect(result.findings).toEqual([]);
    expect(result.escapes).toHaveLength(2);
    expect(result.escapes[0].file).toBe('src/App.tsx');
    expect(result.escapes[0].fn).toBe('fromUserContent');
  });

  it('records nothing when the escape is not used', () => {
    fixture({ 'src/App.tsx': 'export const a = 1;\n' });
    expect(gate().escapes).toEqual([]);
  });

  it('does NOT record a fromUserContent that came from somewhere else', () => {
    // Same positive identification as the lookups: a name is not evidence.
    fixture({ 'src/App.tsx': "const fromUserContent = (s: string) => s;\nexport const a = fromUserContent('x');\n" });
    expect(gate().escapes).toEqual([]);
  });
});

describe('the three-way partition', () => {
  it('puts an unparseable file in `errored`, and NOT in `scanned`', () => {
    // The defect this replaced: a file that failed to parse was pushed to `scanned` and also
    // described by an error, so "scanned" meant two different things and a coverage-only check
    // was satisfied by a file nothing had read.
    fixture({ 'src/Broken.tsx': 'export const a = <h1>unclosed;\n', 'src/App.tsx': 'export const a = 1;\n' });
    const result = gate();
    expect(result.scanned).not.toContain('src/Broken.tsx');
    expect(result.errored.map((entry) => entry.file)).toContain('src/Broken.tsx');
    expect(result.scanned).toContain('src/App.tsx');
  });

  it('puts an unregistered extension in `errored` with its reason', () => {
    fixture({ 'src/App.tsx': 'export const a = 1;\n', 'src/notes.md': 'x\n' });
    const errored = gate().errored.find((entry) => entry.file === 'src/notes.md');
    expect(errored?.reason).toMatch(/no parser is registered/);
  });

  it('covers every walked file across the three sets, with none in two', () => {
    fixture({
      'src/App.tsx': 'export const a = 1;\n',
      'src/App.test.tsx': 'export const a = <h1>Fixture text</h1>;\n',
      'src/Broken.tsx': 'export const a = <h1>unclosed;\n',
      'src/notes.md': 'x\n',
      'src/styles/a.css': '.a { color: red; }\n',
    });
    const result = gate();
    const all = [...result.scanned, ...result.excluded.map((e) => e.file), ...result.errored.map((e) => e.file)];
    expect([...all].sort()).toEqual([...result.walked].sort());
    expect(new Set(all).size, 'a file recorded in two outcome sets').toBe(all.length);
  });
});


describe('binding resolution, not name matching', () => {
  it('checks a key reached through a NAMESPACE import', () => {
    // `import * as strings` binds one name carrying every export. An earlier revision handled
    // named imports only, so this form walked past the key check entirely while the header
    // claimed identification by imported binding.
    fixture({
      'src/App.tsx': "import * as strings from './strings';\nexport const a = strings.t('nope.not.here');\n",
    });
    expect(rules(gate())).toEqual(['unknown-catalogue-key']);
  });

  it('flags an assembled key reached through a namespace import', () => {
    fixture({
      'src/App.tsx': "import * as strings from './strings';\nexport const a = (k: string) => strings.t(`e.${k}` as never);\n",
    });
    expect(rules(gate())).toEqual(['assembled-catalogue-key']);
  });

  it('LISTS an escape reached through a namespace import', () => {
    fixture({
      'src/App.tsx': "import * as strings from './strings';\nexport const a = (s: string) => strings.fromUserContent(s);\n",
    });
    const result = gate();
    expect(result.findings).toEqual([]);
    expect(result.escapes).toHaveLength(1);
    expect(result.escapes[0].fn).toBe('fromUserContent');
  });

  it('follows a RENAMED namespace binding, because it tracks the binding and not the spelling', () => {
    fixture({
      'src/App.tsx': "import * as whatever from './strings';\nexport const a = whatever.t('nope');\n",
    });
    expect(rules(gate())).toEqual(['unknown-catalogue-key']);
  });

  it('does NOT treat a namespace member of some other module as a lookup', () => {
    fixture({ 'src/App.tsx': "import * as other from './other';\nexport const a = other.t('anything at all');\n" });
    expectClean(gate());
  });

  it('REFUSES a file where a tracked binding is shadowed, rather than reporting against the wrong one', () => {
    // A wrong finding costs more than a missing one. Without a Program there is no symbol to
    // resolve, so the undecidable case is refused instead of guessed at.
    fixture({
      'src/App.tsx': "import { t } from './strings';\nfunction f() { const t = (s: string) => s; return t('local'); }\nexport const a = f();\n",
    });
    expect(gate().errors.join('\n')).toMatch(/imported from the catalogue AND declared locally/);
  });

  it('errors on a default import of the catalogue, which binds nothing it can follow', () => {
    fixture({ 'src/App.tsx': "import strings from './strings';\nexport const a = strings;\n" });
    expect(gate().errors.join('\n')).toMatch(/default-imports the catalogue/);
  });

  it('errors on an import-equals form of the catalogue', () => {
    fixture({ 'src/App.tsx': "import strings = require('./strings');\nexport const a = strings;\n" });
    expect(gate().errors.join('\n')).toMatch(/cannot resolve to a binding/);
  });
});

describe('the handler exemption is narrowed to native elements', () => {
  it('fires on a string-valued onX prop of a COMPONENT', () => {
    // The regex escape itself, which the `onboardingTitle` test never covered: `onTitle` MATCHES
    // /^on[A-Z]/, so the pattern exempted it. React rejects a string handler on a native element
    // — but a component may legally declare `onTitle: string` and render it.
    fixture({ 'src/App.tsx': 'export const a = <Notice onTitle="Welcome to Aperture" />;\n' });
    expect(rules(gate())).toEqual(['bare-attribute-string']);
  });

  it('does NOT fire on the same prop name on a NATIVE element, where the typings reject a string', () => {
    fixture({ 'src/App.tsx': 'export const a = <div onTitle="Welcome" />;\n' });
    expectRecordedNotDetected(gate(), 'a native element cannot receive a string handler; the typings hold that');
  });

  it('does not fire on an ordinary component handler, which is not a static string anyway', () => {
    fixture({ 'src/App.tsx': 'export const a = <Notice onDismiss={() => {}} onClick={() => {}} />;\n' });
    expectClean(gate());
  });

  it('treats a dotted tag as a component', () => {
    fixture({ 'src/App.tsx': 'export const a = <Menu.Item onLabel="Recent threads" />;\n' });
    expect(rules(gate())).toEqual(['bare-attribute-string']);
  });

  it('still exempts the explicit registry on a component', () => {
    // Narrowing the PREFIX must not narrow the named registry — a component's `className` is as
    // machine-facing as a div's.
    fixture({ 'src/App.tsx': 'export const a = <Card className="thread" role="listitem" variant="primary" />;\n' });
    expectClean(gate());
  });

  it('does not detect a data-* prop rendered as text by a component — a recorded non-goal', () => {
    // The asymmetry is deliberate and reasoned in the script: `data-*`'s justification is a DOM
    // convention rather than React's typings, and narrowing it would fail every
    // `<Foo data-testid="…" />` while pushing an open-ended set of names into the registry.
    fixture({ 'src/App.tsx': 'export const a = <Notice data-label="Nothing here yet" />;\n' });
    expectRecordedNotDetected(gate(), 'a data-* prop on a component is not analysed');
  });
});

/* ── FAIL-CLOSED ─────────────────────────────────────────────────────────────────────────── */

describe('it fails closed', () => {
  it('on a TypeScript file that does not parse', () => {
    fixture({ 'src/App.tsx': 'export const a = <h1>unclosed;\n' });
    const result = gate();
    expect(result.errors.join('\n')).toMatch(/does not parse as TypeScript/);
  });

  it('on a stylesheet that does not parse', () => {
    fixture({ 'src/styles/x.css': '.a { color: red;\n' });
    expect(gate().errors.join('\n')).toMatch(/does not parse as CSS/);
  });

  it('on a file whose extension has no registered parser', () => {
    fixture({ 'src/App.tsx': 'export const a = 1;\n', 'src/notes.md': 'Not scanned.\n' });
    expect(gate().errors.join('\n')).toMatch(/no parser is registered/);
  });

  it('on a missing scan target', () => {
    // No `src` at all.
    mkdirSync(join(root, 'elsewhere'), { recursive: true });
    const result = gate();
    expect(result.errors.join('\n')).toMatch(/could not be walked/);
  });

  it('on a missing catalogue', () => {
    fixture({ 'src/App.tsx': 'export const a = 1;\n' }, { catalogue: null });
    expect(gate().errors.join('\n')).toMatch(/cannot be read/);
  });

  it('on a catalogue whose table is not an object literal', () => {
    fixture({ 'src/App.tsx': 'export const a = 1;\n' }, { catalogue: 'export const STRINGS = buildIt();\n' });
    expect(gate().errors.join('\n')).toMatch(/no object literal/);
  });

  it('on a catalogue containing a key it cannot resolve statically', () => {
    fixture(
      { 'src/App.tsx': 'export const a = 1;\n' },
      { catalogue: "const k = 'x';\nexport const STRINGS = { [k]: 'v' } as const;\n" },
    );
    expect(gate().errors.join('\n')).toMatch(/computed/);
  });

  it('on a catalogue containing a spread it cannot resolve', () => {
    fixture(
      { 'src/App.tsx': 'export const a = 1;\n' },
      { catalogue: "const more = {};\nexport const STRINGS = { ...more, 'app.name': 'Aperture' } as const;\n" },
    );
    expect(gate().errors.join('\n')).toMatch(/not a plain property assignment/);
  });

  it('on an empty catalogue', () => {
    fixture({ 'src/App.tsx': 'export const a = 1;\n' }, { catalogue: 'export const STRINGS = {} as const;\n' });
    expect(gate().errors.join('\n')).toMatch(/empty/);
  });

  it('WITHHOLDS the key check when the catalogue is untrustworthy, rather than accusing every key', () => {
    // A false "unknown key" would send someone hunting a bug that is in this script.
    fixture({ 'src/App.tsx': "import { t } from './strings';\nexport const a = t('app.name');\n" }, { catalogue: null });
    const result = gate();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(rules(result)).not.toContain('unknown-catalogue-key');
  });

  it('on a scan that matched nothing at all', () => {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'placeholder'), '');
    rmSync(join(root, 'src', 'placeholder'));
    const result = gate();
    expect(result.errors.join('\n')).toMatch(/no files were scanned|cannot be read/);
  });

  it('when the compiler capability the scanner depends on is missing', () => {
    // Cannot be tested by deleting the export — TypeScript's exports are non-configurable — so
    // the check takes the namespace as a parameter and a stub stands in for a future version.
    expect(compilerCapabilityErrors({ version: '9.9.9' })).toHaveLength(1);
    expect(compilerCapabilityErrors({ version: '9.9.9' })[0]).toMatch(/skipOuterExpressions/);
  });

  it('and the capability check passes on the real compiler', () => {
    expect(compilerCapabilityErrors()).toEqual([]);
  });
});

/* ── NON-GOALS, pinned ───────────────────────────────────────────────────────────────────── */

describe('the documented non-goals', () => {
  it('does not follow a string through a variable', () => {
    fixture({
      'src/App.tsx': "const label = 'Cancel';\nexport const a = <p>{label}</p>;\n",
    });
    expectRecordedNotDetected(gate(), 'text routed through a variable is not detected');
  });

  it('does not treat a string constant in a .ts file as user-facing', () => {
    fixture({ 'src/constants.ts': "export const MESSAGE = 'Something went wrong';\n" });
    expectRecordedNotDetected(gate(), 'a .ts string constant is not assumed to be user-facing');
  });

  it('does not scan index.html', () => {
    fixture({ 'src/App.tsx': 'export const a = 1;\n' });
    writeFileSync(join(root, 'index.html'), '<!doctype html><title>Aperture</title>');
    const result = gate();
    expect(result.scanned, 'index.html is out of scope; if it is now scanned, update the NON-GOALS')
      .not.toContain('index.html');
  });

  it('permits a registered attribute on an element where it means something else', () => {
    // Answering this properly needs element-aware resolution, which is out of scope for a source
    // scan. `d` on a div is not a path, but it is also not text.
    fixture({ 'src/App.tsx': 'export const a = <div d="M0 0" />;\n' });
    expectRecordedNotDetected(gate(), 'the registry is name-based, not element-aware');
  });

  it('does not read a content value assembled from a custom property', () => {
    fixture({ 'src/styles/x.css': '.a::after { content: var(--label); }\n' });
    expectRecordedNotDetected(gate(), 'a content value built at runtime is not read as text');
  });
});

/* ── readCatalogueKeys, directly ─────────────────────────────────────────────────────────── */

describe('readCatalogueKeys', () => {
  it('reads the keys out of the catalogue source', () => {
    fixture({ 'src/App.tsx': 'export const a = 1;\n' });
    const { keys, errors } = readCatalogueKeys(root);
    expect(errors).toEqual([]);
    expect([...keys].sort()).toEqual(['app.name', 'state.busy']);
  });

  it('reads the REAL catalogue, and finds a key the source actually declares', () => {
    // Derived, not restated: this asserts the extractor works against the file it will run
    // against in the build, rather than against a fixture shaped to suit it.
    const { keys, errors } = readCatalogueKeys(CLIENT_DIR);
    expect(errors).toEqual([]);
    expect(keys.size).toBeGreaterThan(20);
    expect(keys.has('app.name')).toBe(true);
  });
});

/* ── THE REAL TREE ───────────────────────────────────────────────────────────────────────── */

describe('against the real client tree', () => {
  const result = runBareStringGate({ root: CLIENT_DIR });

  it('is green', () => {
    expect(result.errors).toEqual([]);
    expect(result.findings).toEqual([]);
  });

  it('scanned every non-test TypeScript and CSS file under src, by an INDEPENDENT walk', () => {
    // The gate's own `scanned` list proves only what the gate believes. This walks the tree
    // separately and asserts set equality — a count floor would prove the walk found SOMETHING,
    // which says nothing about the partial failure that actually happens.
    const walk = (absolute, out) => {
      for (const name of readdirSync(absolute).sort()) {
        const child = join(absolute, name);
        if (statSync(child).isDirectory()) walk(child, out);
        else out.push(relative(CLIENT_DIR, child).split(sep).join('/'));
      }
      return out;
    };
    const all = walk(join(CLIENT_DIR, 'src'), []);
    const expected = all.filter((file) => /\.(tsx?|css)$/.test(file) && !/\.test\.tsx?$/.test(file));

    expect(expected.length).toBeGreaterThan(0);
    expect([...result.scanned].sort()).toEqual(expected.sort());
  });

  it('accounts for every walked file in exactly one of the three outcome sets', () => {
    const all = [
      ...result.scanned,
      ...result.excluded.map((entry) => entry.file),
      ...result.errored.map((entry) => entry.file),
    ];
    // COVERAGE: nothing walked is unaccounted for.
    expect([...all].sort()).toEqual([...result.walked].sort());
    // DISJOINTNESS: nothing is accounted for twice. Asserted separately because a set-equality
    // check alone is satisfied by a duplicate, which is exactly the shape of the defect this
    // replaced.
    expect(new Set(all).size).toBe(all.length);
  });

  it('has nothing unanalysable in it, and lists its UiString escapes', () => {
    expect(result.errored).toEqual([]);
    // Zero today. The assertion is that the list EXISTS and is derived — a bypass that appeared
    // later would show up here rather than in nobody's field of view.
    expect(Array.isArray(result.escapes)).toBe(true);
  });

  it('excluded exactly the test files, and nothing else', () => {
    expect(result.excluded.every((entry) => /\.test\.tsx?$/.test(entry.file))).toBe(true);
    expect(result.excluded.length).toBeGreaterThan(0);
  });
});
