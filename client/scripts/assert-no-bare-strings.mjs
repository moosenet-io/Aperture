#!/usr/bin/env node
// APTR-100 — the no-bare-strings gate over the client SOURCE tree.
//
// ── WHAT THIS IS, AND WHAT IT IS NOT ────────────────────────────────────────────────────────
//
// The rule it serves: every piece of user-facing text in Aperture comes from
// `src/strings/catalogue.ts`. This script is the SECOND half of that rule's enforcement, and it
// is the weaker half. Say which is which, because an overclaimed control is worse than a modest
// one — people stop looking past it:
//
//   THE COMPILER holds the part it can. `t()` and `format()` return a branded `UiString`, every
//   text prop on the state primitives is typed as one, and the brand cannot be produced outside
//   `src/strings/index.ts`. So `<EmptyState title="No threads" …/>` is a TYPE ERROR, not a lint
//   finding. Catalogue completeness, key validity and placeholder completeness are likewise
//   type errors — see the catalogue's own header for the four properties `tsc` owns.
//
//   THIS SCRIPT covers what types cannot reach: an ARBITRARY DOM element. `<h1>Aperture</h1>`
//   type-checks perfectly, because `ReactNode` accepts any string, and no amount of branding on
//   our own components changes that. So the JSX itself is read.
//
// It is a LEXICAL TRIPWIRE over a real AST, not a proof. Its non-goals are listed below and each
// one is pinned by a test.
//
// ── WHAT IT CATCHES ─────────────────────────────────────────────────────────────────────────
//
//   bare-jsx-text            non-whitespace text between JSX tags — `<h1>Aperture</h1>`
//   bare-jsx-expression      a string or template in a JSX CHILD expression — `{'Cancel'}`,
//                            `` {`Hi ${name}`} `` — which is also the concatenated-markup case
//                            the catalogue forbids: interpolation is parameterized, in the
//                            catalogue, never assembled at a call site
//   bare-attribute-string    a statically-known string on an attribute that is NOT in the
//                            code-owned technical registry. THIS IS AN ALLOWLIST — see below.
//                            The `onX` handler exemption applies to NATIVE elements only, where
//                            React's typings reject a string; on a component it does not
//   bare-css-content         a non-empty `content:` string in a stylesheet. CSS can put text on
//                            screen, and a rule about user-facing text that only read TSX would
//                            have a hole shaped exactly like `content: "Loading…"`
//   assembled-catalogue-key  `t(`error.${kind}`)` or `t('error.' + kind)` — a key BUILT at the
//                            call site, which names a string no reader and no grep can resolve
//   unknown-catalogue-key    `t('nope')` — a key the catalogue does not contain
//   test-file-imported       a non-test module importing a test module (see the exclusion below)
//   ui-string-cast           a cast to `UiString` outside the module that owns the brand
//
// ── THE ATTRIBUTE REGISTRY IS AN ALLOWLIST, AND THAT IS THE WHOLE DESIGN ────────────────────
//
// The obvious implementation lists the user-facing attributes — `title`, `alt`, `placeholder`,
// `aria-label` — and checks those. That is a DENYLIST, and it lags by construction: the next
// user-facing attribute, and every prop of every component a later sprint writes, is invisible
// to it. This build has been bitten by an enumeration more than by any other single cause.
//
// So it is inverted. {@link TECHNICAL_ATTRIBUTES} names the attributes whose value is a
// MACHINE-FACING token — a class name, a route, an ARIA enumeration, an SVG path — and every
// other attribute carrying a static string is reported. The consequences are deliberate:
//
//   * `<EmptyState description="No threads" />` is caught with no registry entry for
//     `description`, because an unknown prop name FAILS. A denylist would have shrugged.
//   * A NEW technical prop fails the build until someone adds it here. That is a false positive
//     a reviewer sees and a source change resolves — the direction a gate should fail in.
//   * There is no configuration file. Widening the registry is a source change, in a reviewed
//     diff, with the reason next to the entry.
//
// ── FAIL-CLOSED BEHAVIOUR ───────────────────────────────────────────────────────────────────
//
// Every one of these is an ERROR, not a skip. A file this script does not understand is the
// likeliest place for a violation to hide:
//
//   * a file that cannot be read
//   * a TypeScript file whose parse produced diagnostics, or a TypeScript whose parse
//     diagnostics cannot be inspected at all
//   * a stylesheet postcss cannot parse
//   * a file in scope whose extension has no registered parser
//   * a scan that matched zero files
//   * a walked file that is not accounted for. EVERY walked file lands in exactly ONE of three
//     disjoint sets — `scanned` (a parser ran over it to completion), `excluded` (a test module,
//     with its reason recorded), or `errored` (it could not be analysed: no registered parser,
//     unreadable, or a parse failure). The three-way split is asserted for both COVERAGE and
//     DISJOINTNESS on every run. An earlier revision of this comment described a two-way
//     partition while the code had three, so a file that failed to parse was quietly in neither
//     of the two named sets — the fail-closed behaviour was right and the sentence was wrong.
//     Errors that are not about a walked file — a missing scan target, an unreadable catalogue,
//     a missing compiler capability — are not part of the partition, because they are not files
//   * the catalogue not being found, not parsing, or containing a computed or spread key this
//     script cannot resolve. Without a trustworthy key set the key rules would silently pass
//     everything, so it stops instead
//   * `ts.skipOuterExpressions` being unavailable, which would narrow static-value resolution
//     back to bare literals — silently
//
// ── THE ONE EXCLUSION, AND WHY IT IS NOT A HOLE ─────────────────────────────────────────────
//
// `*.test.ts` / `*.test.tsx` are excluded. A fixture's `<Card>Title</Card>` is not user-facing
// text, and requiring catalogue keys for fixture vocabulary would push test scaffolding into the
// product's own string table.
//
// An exclusion is only as safe as the reason for it, so the reason is CHECKED rather than
// asserted: `test-file-imported` reports any non-test module that imports a test module. A test
// file therefore cannot be reached from the application graph, which is what makes "it does not
// ship" true rather than merely likely. Excluded files are listed by the CLI on every run, so
// the exclusion is visible rather than implied.
//
// ── NON-GOALS: known, accepted, NOT silently missing ────────────────────────────────────────
//
// Each is pinned by a test in `assert-no-bare-strings.test.mjs` that RECORDS the current
// behaviour, so closing one turns that test red and forces this list to be updated with it.
//
//   * TEXT ROUTED THROUGH A VARIABLE is not detected. `const label = 'Cancel'` in a `.ts`, then
//     `<span>{label}</span>`, passes. Following that would need the type checker and a call
//     graph; the branded `UiString` is what closes it for OUR components, and for a raw DOM
//     element it is genuinely open. This is the biggest gap and it is the first one to read.
//   * A string reaching the DOM through a third-party component's own prop is not seen.
//   * `index.html` is not scanned. The document `<title>` is app-shell metadata rather than
//     component text; it is out of this gate's scope, not exempt from review.
//   * `.ts` files are scanned for CATALOGUE-KEY rules only. A string constant in a `.ts` file is
//     not assumed to be user-facing — most of them are not — and treating every one as a
//     violation would produce noise that gets a rule switched off.
//   * The technical registry is matched by EXACT JSX SPELLING (`strokeWidth`, `aria-live`), plus
//     a `data-` prefix. It is not attribute-name normalisation and not element-aware: a
//     registered name on an element where it means something else is still permitted.
//   * A `content:` value built from `attr()`, a counter, or a custom property is not read as
//     text; only a literal string is. And a string ASSEMBLED at runtime is invisible here for
//     the same reason it is invisible to the adherence lint.
//   * A key passed as a VARIABLE or a property access — `t(presentation.title)` — is permitted
//     and not analysed. This is deliberate, and it was a finding against an earlier revision of
//     this script: `t()` accepts only `PlainKey`, so the COMPILER already rejects any expression
//     that is not a declared key, including a concatenation. Flagging the indirection would have
//     banned the stronger pattern — a `Record<…, PlainKey>` table whose completeness `tsc`
//     checks — in favour of the weaker one, which is the opposite of what this build has learned.
//     `assembled-catalogue-key` therefore fires only on a key BUILT in the call, where the value
//     would have to be cast to type-check at all and no reader could resolve it.
//   * `ui-string-cast` matches an EXPLICIT cast that NAMES `UiString`. A value laundered
//     through `any` (`const s: UiString = whateverAny`) names nothing and is not detected; nor
//     is a brand reached through a type alias declared elsewhere. Making a string brand
//     genuinely unforgeable is not possible in TypeScript, so this rule is a tripwire over the
//     spelling people actually reach for, not a proof about the type.
//   * The rule does not run over test files, which are excluded from scanning entirely. A test
//     may cast freely; test code does not ship, and `test-file-imported` is what keeps that true.
//   * It says nothing about whether the catalogue string chosen is the RIGHT one.
//
// ── USAGE ───────────────────────────────────────────────────────────────────────────────────
//
//   node scripts/assert-no-bare-strings.mjs [--root <dir>]
//
// `--root` exists for this script's own test harness, which runs it over fixture trees. It
// changes WHAT is scanned, never WHETHER a rule applies.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import postcss from 'postcss';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = resolve(SCRIPT_DIR, '..');

/** What gets walked, relative to the root. Code-owned: a directory cannot be dropped by config. */
const SCAN_TARGETS = ['src'];

/** The catalogue, relative to the root. One file, named in code. */
const CATALOGUE_PATH = 'src/strings/catalogue.ts';

/** The identifier the catalogue table is declared under, inside {@link CATALOGUE_PATH}. */
const CATALOGUE_BINDING = 'STRINGS';

/**
 * Module specifiers that import the catalogue lookup. A call to `t(…)` is only checked when the
 * `t` in scope was imported from one of these — POSITIVE identification of the function, rather
 * than trusting a one-letter name that any file is free to use for something else.
 */
const STRINGS_MODULE = /(^|\/)strings(\/index)?(\.ts)?$/;

/** The lookup functions whose first argument is a catalogue key. */
const LOOKUP_FUNCTIONS = new Set(['t', 'format']);

/**
 * ── THE BRAND'S ESCAPE PATHS, NAMED AND LISTED ──────────────────────────────────────────────
 *
 * The `UiString` brand is not unforgeable — TypeScript cannot make one so. Rather than imply
 * otherwise, both escape paths are made visible:
 *
 *   1. A CAST. `x as UiString` is rejected by `ui-string-cast` everywhere except the module that
 *      owns the brand, which has to mint one somewhere. (`as unknown as UiString` is caught by
 *      the same rule: the OUTER assertion names the brand.)
 *   2. {@link ESCAPE_FUNCTIONS} — `fromUserContent()`, which mints a `UiString` from arbitrary
 *      text ON PURPOSE. It exists because not all text is UI text: a thread title, a message
 *      body and a filename belong to the user and must never be catalogued or translated. It is
 *      a listed exception rather than a hidden one, and every call site is printed on a green
 *      run, so "where does text bypass the catalogue" has an answer a reader can check.
 */
const UI_STRING_TYPE = 'UiString';

/** The only file that may cast to the brand: the one that declares it. Code-owned. */
const BRAND_MINTING_FILES = ['src/strings/index.ts'];

/** Functions that legitimately mint a `UiString` from text the catalogue does not own. */
const ESCAPE_FUNCTIONS = new Set(['fromUserContent']);

const PARSERS = { '.ts': 'typescript', '.tsx': 'typescript', '.css': 'css' };

/** Directories never walked. */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage']);

/** A test module. Excluded from the JSX rules; see the header. */
const TEST_FILE = /\.test\.tsx?$/;

/**
 * ── THE TECHNICAL-ATTRIBUTE REGISTRY ────────────────────────────────────────────────────────
 *
 * An attribute here may carry a static string because that string is a MACHINE-FACING token: a
 * class, an id, a route, an ARIA enumeration, an SVG geometry value, a design-system variant.
 * Every attribute NOT here is treated as potentially user-facing, and a static string on it
 * fails.
 *
 * Note what is deliberately ABSENT, because absence is what does the work: `title`, `alt`,
 * `placeholder`, `label`, `aria-label`, `aria-description`, `aria-roledescription`,
 * `aria-valuetext`, `aria-placeholder`, `aria-keyshortcuts`, `value`, `defaultValue`,
 * `downloadName`, and every prop any component ever grows. All of those are text a user reads or
 * hears, and all of them must come from the catalogue.
 */
const TECHNICAL_ATTRIBUTES = new Set([
  // ── React and DOM structure ──────────────────────────────────────────────────────────────
  'key', 'ref', 'className', 'id', 'htmlFor', 'name', 'type', 'role', 'scope', 'slot',
  'tabIndex', 'hidden', 'dir', 'lang', 'translate', 'draggable', 'contentEditable',
  'spellCheck', 'autoFocus', 'disabled', 'readOnly', 'required', 'checked', 'multiple',
  'colSpan', 'rowSpan', 'headers', 'span', 'start', 'reversed', 'open', 'loading', 'decoding',
  'referrerPolicy', 'crossOrigin', 'sandbox', 'allow', 'as', 'media', 'sizes', 'srcSet',
  // ── Forms: enumerations and machine formats, never prose ─────────────────────────────────
  'autoComplete', 'inputMode', 'enterKeyHint', 'form', 'method', 'action', 'encType', 'accept',
  'acceptCharset', 'pattern', 'min', 'max', 'step', 'maxLength', 'minLength', 'size', 'rows',
  'cols', 'wrap',
  // ── Links and routing. A path is an address, not a sentence. ─────────────────────────────
  'href', 'to', 'path', 'target', 'rel', 'ping', 'src', 'download', 'index', 'end', 'replace',
  // ── ARIA: the RELATIONAL and ENUMERATED attributes only. The ones that take prose are
  //    absent above, on purpose. ────────────────────────────────────────────────────────────
  'aria-hidden', 'aria-live', 'aria-atomic', 'aria-busy', 'aria-relevant', 'aria-invalid',
  'aria-current', 'aria-expanded', 'aria-controls', 'aria-describedby', 'aria-labelledby',
  'aria-details', 'aria-owns', 'aria-flowto', 'aria-haspopup', 'aria-modal', 'aria-pressed',
  'aria-checked', 'aria-selected', 'aria-disabled', 'aria-readonly', 'aria-required',
  'aria-orientation', 'aria-sort', 'aria-level', 'aria-setsize', 'aria-posinset',
  'aria-activedescendant', 'aria-colcount', 'aria-colindex', 'aria-colspan', 'aria-rowcount',
  'aria-rowindex', 'aria-rowspan', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow',
  'aria-multiline', 'aria-multiselectable', 'aria-autocomplete', 'aria-dropeffect',
  'aria-grabbed', 'aria-errormessage',
  // ── SVG geometry, presentation and namespaces ────────────────────────────────────────────
  'xmlns', 'xmlnsXlink', 'version', 'viewBox', 'preserveAspectRatio', 'focusable',
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'dx', 'dy',
  'width', 'height', 'points', 'transform', 'gradientTransform', 'gradientUnits',
  'patternUnits', 'patternContentUnits', 'maskUnits', 'clipPathUnits', 'spreadMethod',
  'fill', 'fillRule', 'fillOpacity', 'stroke', 'strokeWidth', 'strokeLinecap',
  'strokeLinejoin', 'strokeDasharray', 'strokeDashoffset', 'strokeOpacity', 'strokeMiterlimit',
  'opacity', 'clipPath', 'clipRule', 'mask', 'filter', 'offset', 'stopColor', 'stopOpacity',
  'vectorEffect', 'shapeRendering', 'textRendering', 'textAnchor', 'dominantBaseline',
  'markerStart', 'markerMid', 'markerEnd', 'pathLength', 'in', 'in2', 'result', 'stdDeviation',
  'floodColor', 'floodOpacity', 'lightingColor', 'primitiveUnits',
  // ── Design-system props. Variant vocabularies, not text. ─────────────────────────────────
  'variant', 'tone', 'shape', 'mono', 'numeric', 'interactive', 'invalid', 'headingLevel',
  'showValue', 'lines',
]);

/**
 * ── THE TWO PREFIX EXEMPTIONS, AND WHY ONLY ONE IS ELEMENT-AWARE ────────────────────────────
 *
 * `data-*` is machine state; `onX` is an event handler. Both are matched by GRAMMAR rather than
 * by a bare prefix — a bare `on` prefix admitted `onboardingTitle="Welcome"`, a hole opened by
 * the shorthand for closing one.
 *
 * But the grammar was still only a SHAPE, and a shape is a proxy for "this is machinery, not
 * prose". The justification for exempting `onX` was that React rejects a string handler — and
 * **that is only true of a NATIVE element.** A custom component may legally declare
 * `onTitle: string` and render it, so `<Notice onTitle="Welcome" />` passed a gate whose whole
 * design is that an unanticipated prop fails. The existing `onboardingTitle` test covered the
 * lowercase-after-`on` case and not the regex escape itself.
 *
 * So the handler exemption is now narrowed to where its justification actually holds: a native
 * element, identified by React's own rule that a lowercase tag name is an intrinsic element. On
 * a component, only the explicit {@link TECHNICAL_ATTRIBUTES} names apply, and a static string on
 * an `onX` prop is reported. The type system does the work there that the pattern was being
 * trusted for — which is the same move as preferring the `UiString` brand to a lexical scan.
 *
 * `data-*` is deliberately NOT narrowed the same way, and the asymmetry is a judgement rather
 * than an oversight. Its justification is a DOM convention — a data attribute is machine state
 * and the browser renders it as an attribute, not as text — which does not depend on React's
 * typings. Narrowing it would fail every `<Foo data-testid="…" />` in the fleet and push an
 * open-ended set of names into the registry one build break at a time. The residual case — a
 * component that renders a `data-` prop AS TEXT — is a recorded non-goal with a test pinning it.
 */
const DATA_ATTRIBUTE = /^data-[A-Za-z0-9]/;
const EVENT_HANDLER = /^on[A-Z]/;

/**
 * A NATIVE (intrinsic) element, by React's own rule: a lowercase-initial tag name is an
 * intrinsic element and an uppercase-initial one is a component reference. A dotted tag
 * (`<Foo.Bar />`) is always a component.
 */
function isNativeElement(tagName) {
  if (!tagName) return false;
  if (ts.isJsxNamespacedName?.(tagName)) return true; // `<svg:rect>` — intrinsic
  if (!ts.isIdentifier(tagName)) return false; // property access → a component
  const first = tagName.text.charAt(0);
  return first === first.toLowerCase() && first !== first.toUpperCase();
}

function isTechnicalAttribute(name, native) {
  if (TECHNICAL_ATTRIBUTES.has(name)) return true;
  if (DATA_ATTRIBUTE.test(name)) return true;
  return native && EVENT_HANDLER.test(name);
}

/* ── Findings ────────────────────────────────────────────────────────────────────────────── */

function finding(rule, file, line, detail) {
  return { rule, file, line, detail };
}

/** Text that carries no message. JSX indentation is text nodes, and none of it is a string. */
function isBlank(text) {
  return text.trim() === '';
}

/** A short, single-line rendering of a literal for a message. A garbled excerpt sends a reader
 *  hunting for something that is not in the file, so it is truncated visibly. */
function excerpt(text) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 60 ? `${flat.slice(0, 57)}…` : flat;
}

/* ── Fail-closed compiler capability ─────────────────────────────────────────────────────── */

/**
 * The TSX scanner resolves an attribute value through TypeScript's OWN definition of a
 * value-preserving wrapper, so `title={'x' as string}` and `title={('x')}` are the same value
 * they plainly are. `skipOuterExpressions` is exported at runtime but is not in the public
 * `.d.ts`, so its absence must be an error rather than a silent narrowing.
 *
 * @param {typeof ts} [compiler] parameterised so the failure path is genuinely testable —
 *   TypeScript's exports are non-configurable and cannot be deleted from the real module.
 */
export function compilerCapabilityErrors(compiler = ts) {
  const supported = typeof compiler?.skipOuterExpressions === 'function'
    && compiler.OuterExpressionKinds
    && typeof compiler.OuterExpressionKinds.All === 'number';
  if (supported) return [];
  return [
    `typescript ${compiler?.version ?? '(unknown)'} does not expose \`skipOuterExpressions\`/`
    + '`OuterExpressionKinds.All`. Without it a statically-known string behind `as`, `!` or '
    + 'parentheses would stop being detected — silently. This is not a check that may be skipped.',
  ];
}

/**
 * The literal node behind an expression, when the value is STATICALLY KNOWN.
 *
 * @returns {{ text: string, template: boolean } | undefined}
 */
function staticString(node) {
  if (!node) return undefined;
  const expression = ts.isJsxExpression(node) ? node.expression : node;
  if (!expression) return undefined;
  const inner = ts.skipOuterExpressions(expression, ts.OuterExpressionKinds.All);
  if (ts.isStringLiteral(inner)) return { text: inner.text, template: false };
  if (ts.isNoSubstitutionTemplateLiteral(inner)) return { text: inner.text, template: true };
  return undefined;
}

/* ── The catalogue's key set, read from its source ───────────────────────────────────────── */

/**
 * Extract the catalogue's keys by parsing the catalogue itself.
 *
 * DERIVED, not restated. A hand-written key list in this file would be a second catalogue that
 * drifts from the first, and the drift would show up as this gate accepting a key that no longer
 * exists — a wrong finding's mirror image, which is worse than no finding.
 *
 * Fails closed in every direction: file missing, unparseable, binding absent, initializer not an
 * object literal, or ANY property this script cannot resolve to a name (a computed key, a
 * spread). An unresolvable member means the key set is incomplete, and an incomplete key set
 * would turn `unknown-catalogue-key` into a source of false accusations.
 *
 * @returns {{ keys: Set<string>, errors: string[] }}
 */
export function readCatalogueKeys(root) {
  const absolute = join(root, CATALOGUE_PATH);
  let text;
  try {
    text = readFileSync(absolute, 'utf8');
  } catch (error) {
    return {
      keys: new Set(),
      errors: [
        `${CATALOGUE_PATH}: cannot be read (${error instanceof Error ? error.message : String(error)}). `
        + 'The catalogue is where every user-facing string lives; without it this gate cannot '
        + 'check a single key.',
      ],
    };
  }

  const source = ts.createSourceFile(CATALOGUE_PATH, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  const diagnostics = source.parseDiagnostics;
  if (!Array.isArray(diagnostics)) {
    return {
      keys: new Set(),
      errors: [`${CATALOGUE_PATH}: cannot inspect TypeScript parse diagnostics (typescript ${ts.version}).`],
    };
  }
  if (diagnostics.length > 0) {
    return { keys: new Set(), errors: [`${CATALOGUE_PATH}: does not parse as TypeScript.`] };
  }

  let table;
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== CATALOGUE_BINDING) continue;
      let initializer = declaration.initializer;
      if (initializer) initializer = ts.skipOuterExpressions(initializer, ts.OuterExpressionKinds.All);
      if (initializer && ts.isObjectLiteralExpression(initializer)) table = initializer;
    }
  }

  if (!table) {
    return {
      keys: new Set(),
      errors: [
        `${CATALOGUE_PATH}: no object literal is assigned to \`${CATALOGUE_BINDING}\`. This gate `
        + 'reads the catalogue rather than restating it, so it stops when it cannot find it.',
      ],
    };
  }

  const keys = new Set();
  const errors = [];
  for (const property of table.properties) {
    if (!ts.isPropertyAssignment(property)) {
      errors.push(
        `${CATALOGUE_PATH}: a catalogue member is not a plain property assignment `
        + `(${ts.SyntaxKind[property.kind]}). The key set would be incomplete, so the key rules `
        + 'are not run at all rather than run against a partial catalogue.',
      );
      continue;
    }
    const name = property.name;
    if (ts.isStringLiteral(name) || ts.isIdentifier(name) || ts.isNoSubstitutionTemplateLiteral(name)) {
      keys.add(name.text);
    } else {
      errors.push(`${CATALOGUE_PATH}: a catalogue key is computed and cannot be resolved statically.`);
    }
  }

  if (keys.size === 0 && errors.length === 0) {
    errors.push(`${CATALOGUE_PATH}: the catalogue is empty. An empty key set would accept nothing and prove nothing.`);
  }

  return { keys, errors };
}

/* ── TypeScript scanning ─────────────────────────────────────────────────────────────────── */

/**
 * Which local names in this file are the catalogue lookups.
 *
 * Read from the import declarations, so an alias (`import { t as tr }`) is followed and an
 * unrelated local `format` is not mistaken for one.
 */
function catalogueLookupNames(source, relPath, errors) {
  const lookups = new Map(); // localName → importedName
  const escapes = new Map();
  const namespaces = new Set(); // local name of `import * as ns from '<strings>'`

  for (const statement of source.statements) {
    /* A dynamic or import-equals form of the catalogue module. Neither yields a binding this
       scanner can follow, so it is an ERROR rather than a silent pass — the alternative is a
       file whose lookups are all invisible while the run reports green. */
    if (ts.isImportEqualsDeclaration(statement)
      && ts.isExternalModuleReference(statement.moduleReference)
      && ts.isStringLiteral(statement.moduleReference.expression)
      && STRINGS_MODULE.test(statement.moduleReference.expression.text)) {
      errors.push(
        `${relPath}: imports the catalogue with \`import … = require(…)\`, which this scanner `
        + 'cannot resolve to a binding. Use a named import so the lookups can be identified.',
      );
      continue;
    }

    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!STRINGS_MODULE.test(statement.moduleSpecifier.text)) continue;

    const clause = statement.importClause;
    if (!clause) continue; // a side-effect import binds nothing

    /* A DEFAULT import of the catalogue. The module has no default export, so this cannot be a
       real lookup — but it also cannot be analysed, and "cannot be analysed" is an error here. */
    if (clause.name) {
      errors.push(
        `${relPath}: default-imports the catalogue module, which exports no default. This `
        + 'scanner identifies lookups by their imported binding and cannot follow that form.',
      );
    }

    const bindings = clause.namedBindings;
    if (!bindings) continue;

    /* ── NAMESPACE IMPORTS ARE FOLLOWED, NOT IGNORED ──────────────────────────────────────
       `import * as strings from './strings'` binds ONE name that carries every export, so
       `strings.t('nope')` is a lookup and `strings.fromUserContent(x)` is an escape. An earlier
       revision handled named imports only, and this form walked straight past both the key check
       and the escape listing — while the header claimed identification by imported binding. The
       claim was right about the mechanism and wrong about its coverage. */
    if (ts.isNamespaceImport(bindings)) {
      namespaces.add(bindings.name.text);
      continue;
    }

    if (!ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text;
      if (LOOKUP_FUNCTIONS.has(imported)) lookups.set(element.name.text, imported);
      if (ESCAPE_FUNCTIONS.has(imported)) escapes.set(element.name.text, imported);
    }
  }

  /* ── A SHADOWED BINDING IS AN ERROR, NOT A GUESS ──────────────────────────────────────────
     Tracking a NAME is only a proxy for tracking a BINDING, and the two part company when a
     local declaration reuses the name: a local `const t` in a file that also imports `t` would
     have its calls checked as though they were catalogue lookups, producing a WRONG finding —
     which costs more than a missing one, because it sends a reader hunting for a key that was
     never meant to be one.

     Full scope resolution would need machinery this workspace does not have (no `eslint-scope`,
     and this is a parse-only scanner with no Program). So the undecidable case is REFUSED
     instead of guessed at: a collision between a tracked binding and any local declaration of
     the same name stops the run and says so. */
  const tracked = new Set([...lookups.keys(), ...escapes.keys(), ...namespaces]);
  if (tracked.size > 0) {
    const reportCollision = (name, node) => {
      errors.push(
        `${relPath}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: `
        + `\`${name}\` is imported from the catalogue AND declared locally. This scanner tracks a `
        + 'binding by its name and cannot tell the two apart, so it refuses to analyse the file '
        + 'rather than report against the wrong one. Rename the local declaration.',
      );
    };
    const findShadows = (node) => {
      if ((ts.isVariableDeclaration(node)
        || ts.isFunctionDeclaration(node)
        || ts.isClassDeclaration(node)
        || ts.isParameter(node)
        || ts.isBindingElement(node))
        && node.name && ts.isIdentifier(node.name) && tracked.has(node.name.text)) {
        reportCollision(node.name.text, node);
      }
      ts.forEachChild(node, findShadows);
    };
    ts.forEachChild(source, findShadows);
  }

  return { lookups, escapes, namespaces };
}

/**
 * Which catalogue function a call expression resolves to, or `undefined`.
 *
 * Two spellings reach the same BINDING and must reach the same answer:
 *   * `t('key')` — a named import, resolved through the local-name map;
 *   * `strings.t('key')` — a namespace import, resolved by checking the object against the
 *     namespace bindings and the member against the function set.
 *
 * Anything else — a call through a variable, a computed member, a re-exported alias — resolves to
 * `undefined` and is not checked. That is a recorded non-goal rather than an oversight: without a
 * Program there is no symbol to resolve, and guessing from a name is what produces wrong findings.
 *
 * @param {import('typescript').Expression} callee
 * @param {Map<string, string>} byName local name → imported name, for named imports
 * @param {Set<string>} namespaces local names bound by `import * as …`
 * @param {Set<string>} functions the imported names this lookup cares about
 * @returns {string | undefined} the IMPORTED name, never the local spelling
 */
function calledBinding(callee, byName, namespaces, functions) {
  if (ts.isIdentifier(callee)) return byName.get(callee.text);
  if (ts.isPropertyAccessExpression(callee)
    && ts.isIdentifier(callee.expression)
    && namespaces.has(callee.expression.text)
    && ts.isIdentifier(callee.name)
    && functions.has(callee.name.text)) {
    return callee.name.text;
  }
  return undefined;
}

/** Does this type node NAME the brand? Follows a qualified name to its rightmost identifier. */
function namesUiString(typeNode) {
  if (!typeNode || !ts.isTypeReferenceNode(typeNode)) return false;
  const name = typeNode.typeName;
  if (ts.isIdentifier(name)) return name.text === UI_STRING_TYPE;
  return ts.isQualifiedName(name) && name.right.text === UI_STRING_TYPE;
}

/**
 * @returns {boolean} `true` when a parser ran over the whole file. `false` means the file could
 *   not be analysed and belongs in `errored`, NOT in `scanned` — an unparseable file that
 *   counted as scanned is exactly how a three-way outcome got described as a two-way partition.
 */
function scanTypeScript(relPath, text, ext, catalogueKeys, findings, errors, escapes) {
  const source = ts.createSourceFile(
    relPath,
    text,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ true,
    ext === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  // FAIL CLOSED: `parseDiagnostics` is internal. If a TypeScript upgrade removes it this check
  // would become a no-op and every malformed file would read as clean.
  const diagnostics = source.parseDiagnostics;
  if (!Array.isArray(diagnostics)) {
    errors.push(
      `${relPath}: cannot inspect TypeScript parse diagnostics (typescript ${ts.version}). `
      + 'The syntax check cannot be verified, so this file is treated as unscannable.',
    );
    return false;
  }
  if (diagnostics.length > 0) {
    const message = typeof diagnostics[0]?.messageText === 'string' ? diagnostics[0].messageText : 'syntax error';
    errors.push(`${relPath}: does not parse as TypeScript (${message}). An unparseable file is not evidence of compliance.`);
    return false;
  }

  const lineOf = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const { lookups, escapes: escapeNames, namespaces } = catalogueLookupNames(source, relPath, errors);

  const attributeName = (node) => {
    if (ts.isIdentifier(node)) return node.text;
    if (ts.isJsxNamespacedName?.(node)) return `${node.namespace.text}:${node.name.text}`;
    return undefined;
  };

  const visit = (node) => {
    /* bare-jsx-text — the case no type system can reach. */
    if (ts.isJsxText(node) && !isBlank(node.text)) {
      findings.push(finding(
        'bare-jsx-text', relPath, lineOf(node),
        `literal text between tags: "${excerpt(node.text)}" — put it in the catalogue and render `
        + 't(key)',
      ));
    }

    /* bare-jsx-expression — `{'Cancel'}` and `` {`Hi ${name}`} `` as a CHILD. The template case
       is the concatenated-markup shape specifically: a sentence assembled at the call site
       cannot be reordered by a translator and is not reviewable as one string. */
    if (ts.isJsxExpression(node) && node.parent
      && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      const inner = node.expression
        ? ts.skipOuterExpressions(node.expression, ts.OuterExpressionKinds.All)
        : undefined;
      if (inner && ts.isTemplateExpression(inner)) {
        findings.push(finding(
          'bare-jsx-expression', relPath, lineOf(node),
          'a template literal is rendered as content. Interpolation belongs in the catalogue '
          + 'string as a {placeholder} and goes through format(), never assembled here',
        ));
      } else {
        const literal = staticString(node);
        if (literal && !isBlank(literal.text)) {
          findings.push(finding(
            'bare-jsx-expression', relPath, lineOf(node),
            `a literal string is rendered as content: "${excerpt(literal.text)}"`,
          ));
        }
      }
    }

    /* bare-attribute-string — the allowlist inversion. */
    if (ts.isJsxAttribute(node)) {
      const name = attributeName(node.name);
      // The owning element decides whether the handler exemption applies at all.
      const owner = node.parent?.parent;
      const native = owner !== undefined
        && (ts.isJsxOpeningElement(owner) || ts.isJsxSelfClosingElement(owner))
        && isNativeElement(owner.tagName);
      if (name !== undefined && !isTechnicalAttribute(name, native)) {
        const literal = staticString(node.initializer);
        if (literal && !isBlank(literal.text)) {
          findings.push(finding(
            'bare-attribute-string', relPath, lineOf(node),
            `\`${name}\` carries the literal "${excerpt(literal.text)}". If it is user-facing text `
            + 'it belongs in the catalogue; if it is a machine-facing token, add the attribute to '
            + 'TECHNICAL_ATTRIBUTES in this script with the reason',
          ));
        }
      }
    }

    /* The catalogue-key rules, on the lookups this file actually imported — by BINDING, whether
       that binding is a named import or a namespace member. */
    if (ts.isCallExpression(node) && calledBinding(node.expression, lookups, namespaces, LOOKUP_FUNCTIONS) !== undefined) {
      const [first] = node.arguments;
      const literal = first ? staticString(first) : undefined;
      const inner = first ? ts.skipOuterExpressions(first, ts.OuterExpressionKinds.All) : undefined;
      const assembled = inner !== undefined && (
        ts.isTemplateExpression(inner)
        || (ts.isBinaryExpression(inner) && inner.operatorToken.kind === ts.SyntaxKind.PlusToken)
      );
      if (assembled) {
        findings.push(finding(
          'assembled-catalogue-key', relPath, lineOf(node),
          `\`${calledBinding(node.expression, lookups, namespaces, LOOKUP_FUNCTIONS)}(…)\` is called with a key assembled at the call site. Such a key `
          + 'names a string that no reader and no grep can resolve, and it only type-checks '
          + 'through a cast. Pass a declared key, or a value from a table typed with one',
        ));
      } else if (literal && catalogueKeys !== null && !catalogueKeys.has(literal.text)) {
        findings.push(finding(
          'unknown-catalogue-key', relPath, lineOf(node),
          `"${literal.text}" is not a key in ${CATALOGUE_PATH}`,
        ));
      }
    }

    /* ui-string-cast — the brand's forgeable path, made visible.
       `as UiString` and the older `<UiString>x` form both mint one, and `as unknown as UiString`
       is caught here too because the OUTER assertion is the one that names the brand. The module
       that declares the brand is exempt: something has to mint the first one. */
    if ((ts.isAsExpression(node) || (ts.isTypeAssertionExpression?.(node) ?? false))
      && namesUiString(node.type)
      && !BRAND_MINTING_FILES.includes(relPath)) {
      findings.push(finding(
        'ui-string-cast', relPath, lineOf(node),
        `casts to \`${UI_STRING_TYPE}\`, which forges the brand that says this text came from the `
        + `catalogue. Use t()/format(), or fromUserContent() if the text belongs to the user. `
        + `Only ${BRAND_MINTING_FILES.join(', ')} may mint one`,
      ));
    }

    /* The listed escape. Not a violation — a call site recorded so the bypasses are countable. */
    const escapeFn = ts.isCallExpression(node)
      ? calledBinding(node.expression, escapeNames, namespaces, ESCAPE_FUNCTIONS)
      : undefined;
    if (escapeFn !== undefined) {
      escapes.push({ file: relPath, line: lineOf(node), fn: escapeFn });
    }

    /* test-file-imported — what makes the test-file exclusion safe rather than convenient. */
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (/\.test(\.tsx?)?$/.test(specifier)) {
        findings.push(finding(
          'test-file-imported', relPath, lineOf(node),
          `imports the test module "${specifier}". Test files are excluded from the bare-string `
          + 'rules because they do not ship; an import from application code makes that false',
        ));
      }
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(source, visit);
  return true;
}

/* ── CSS scanning ────────────────────────────────────────────────────────────────────────── */

/**
 * `content` is the one CSS property that puts TEXT on a screen. A gate over user-facing strings
 * that read only TSX would have a hole exactly the shape of `content: "Loading…"`, and the hole
 * would be invisible because the stylesheets ARE scanned by the adherence lint — for colours.
 */
/** @returns {boolean} `true` when the stylesheet was parsed and walked. See `scanTypeScript`. */
function scanCss(relPath, text, findings, errors) {
  let root;
  try {
    root = postcss.parse(text, { from: relPath });
  } catch (error) {
    errors.push(`${relPath}: does not parse as CSS (${error instanceof Error ? error.message : String(error)}).`);
    return false;
  }

  root.walkDecls((decl) => {
    if (decl.prop.toLowerCase() !== 'content') return;
    // Only a literal string is text. `attr()`, counters, `none`, `normal` and a custom property
    // are not, and a decorative `""` carries no message.
    for (const match of decl.value.matchAll(/"([^"]*)"|'([^']*)'/g)) {
      const literal = match[1] ?? match[2] ?? '';
      // A CSS escape (`\2014`) is a glyph, not a sentence. Whitespace carries no message either.
      if (isBlank(literal) || /^(\\[0-9a-fA-F\s]+)+$/.test(literal)) continue;
      findings.push(finding(
        'bare-css-content', relPath, decl.source?.start?.line ?? 0,
        `content: "${excerpt(literal)}" puts text on screen from a stylesheet, where neither the `
        + 'catalogue nor a translator can reach it',
      ));
    }
  });
  return true;
}

/* ── Walking ─────────────────────────────────────────────────────────────────────────────── */

function collectFiles(absPath, root, out) {
  const stats = statSync(absPath);
  if (stats.isDirectory()) {
    for (const name of readdirSync(absPath).sort()) {
      if (SKIP_DIRS.has(name)) continue;
      collectFiles(join(absPath, name), root, out);
    }
    return;
  }
  out.push(relative(root, absPath).split(sep).join('/'));
}

/* ── The gate ────────────────────────────────────────────────────────────────────────────── */

/**
 * @param {{ root?: string, compiler?: typeof ts }} [options]
 * @returns {{ findings: Array<object>, errors: string[], scanned: string[],
 *            excluded: Array<{ file: string, reason: string }>,
 *            errored: Array<{ file: string, reason: string }>,
 *            escapes: Array<{ file: string, line: number, fn: string }>, walked: string[] }}
 *
 * `scanned`, `excluded` and `errored` are the THREE disjoint outcomes a walked file can have,
 * and together they cover `walked` exactly. Both properties are asserted below rather than
 * documented — the previous revision documented a two-way partition over a three-way outcome.
 */
export function runBareStringGate(options = {}) {
  const root = resolve(options.root ?? CLIENT_DIR);

  const findings = [];
  const errors = [];
  const scanned = [];
  const excluded = [];
  const errored = [];
  const escapes = [];

  errors.push(...compilerCapabilityErrors(options.compiler));

  const walked = [];
  for (const target of SCAN_TARGETS) {
    try {
      collectFiles(join(root, target), root, walked);
    } catch (error) {
      errors.push(
        `scan target "${target}" could not be walked (${error instanceof Error ? error.message : String(error)}). `
        + 'A target that is missing or unreadable is an error: an unscanned tree is not a clean one.',
      );
    }
  }

  const { keys: catalogueKeys, errors: catalogueErrors } = readCatalogueKeys(root);
  errors.push(...catalogueErrors);
  const keysUsable = catalogueErrors.length === 0;

  for (const relPath of walked) {
    if (TEST_FILE.test(relPath)) {
      excluded.push({ file: relPath, reason: 'test module — excluded by scope; see test-file-imported' });
      continue;
    }

    const ext = extname(relPath).toLowerCase();
    const parser = PARSERS[ext];
    if (!parser) {
      const reason = `no parser is registered for "${ext || '(no extension)'}"`;
      errors.push(
        `${relPath}: ${reason}. Register one or narrow the scan target — a file in scope is `
        + 'never skipped silently.',
      );
      errored.push({ file: relPath, reason });
      continue;
    }

    let text;
    try {
      text = readFileSync(join(root, relPath), 'utf8');
    } catch (error) {
      const reason = `cannot be read (${error instanceof Error ? error.message : String(error)})`;
      errors.push(`${relPath}: ${reason}.`);
      errored.push({ file: relPath, reason });
      continue;
    }

    const analysed = parser === 'typescript'
      // `null` withholds the membership check: with an untrustworthy key set a false "unknown
      // key" would send someone hunting a bug that is in this script.
      ? scanTypeScript(relPath, text, ext, keysUsable ? catalogueKeys : null, findings, errors, escapes)
      : scanCss(relPath, text, findings, errors);

    // A file whose parser did NOT complete is `errored`, never `scanned`. Counting it as scanned
    // would have made the coverage assertion below pass over a file nothing ever read.
    if (analysed) scanned.push(relPath);
    else errored.push({ file: relPath, reason: 'the parser could not analyse it — see the error above' });
  }

  if (scanned.length === 0 && errors.length === 0) {
    errors.push('no files were scanned. A scan that matches nothing is a configuration error, not a pass.');
  }

  // ── THE PARTITION INVARIANT, asserted in BOTH directions ─────────────────────────────────
  //
  // COVERAGE: every walked file appears in one of the three outcome sets. A file in none of them
  // is a file nothing read, reported as nothing.
  //
  // DISJOINTNESS: no file appears in two. That is the half that would have caught the previous
  // defect — a file that failed to parse was pushed to `scanned` AND described by an error, so a
  // coverage-only check was satisfied while "scanned" meant two different things.
  //
  // A count floor would prove only that the walk found SOMETHING, which says nothing about the
  // partial failure that actually happens.
  const outcomes = new Map();
  const place = (file, set) => {
    const already = outcomes.get(file);
    if (already !== undefined && already !== set) {
      errors.push(
        `${file}: is recorded as both "${already}" and "${set}". The outcome sets must be `
        + 'disjoint; two answers for one file means neither can be trusted.',
      );
    }
    outcomes.set(file, set);
  };
  for (const file of scanned) place(file, 'scanned');
  for (const entry of excluded) place(entry.file, 'excluded');
  for (const entry of errored) place(entry.file, 'errored');

  if (scanned.length + excluded.length + errored.length !== outcomes.size) {
    errors.push(
      'a file was recorded in more than one outcome set. See the disjointness errors above.',
    );
  }
  for (const file of walked) {
    if (!outcomes.has(file)) {
      errors.push(
        `${file}: was walked but is in none of scanned/excluded/errored. A file cannot fall `
        + 'between the outcomes — that is a file nothing read, reported as nothing.',
      );
    }
  }

  return { findings, errors, scanned, excluded, errored, escapes, walked };
}

/* ── CLI ─────────────────────────────────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') { options.root = argv[i + 1]; i += 1; }
    else throw new Error(`unknown argument "${argv[i]}". Usage: assert-no-bare-strings.mjs [--root <dir>]`);
  }
  return options;
}

function main() {
  let result;
  try {
    result = runBareStringGate(parseArgs(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`no-bare-strings: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
    return;
  }

  const { findings, errors, scanned, excluded, errored, escapes } = result;

  for (const error of errors) process.stderr.write(`no-bare-strings ERROR  ${error}\n`);
  for (const f of findings) {
    process.stderr.write(`no-bare-strings  ${f.file}:${f.line}  [${f.rule}]  ${f.detail}\n`);
  }

  if (findings.length > 0 || errors.length > 0) {
    process.stderr.write(
      `\nno-bare-strings FAILED — ${findings.length} violation(s), ${errors.length} error(s) `
      + `across ${scanned.length} scanned file(s), ${errored.length} unanalysable.\n`
      + 'User-facing text lives in src/strings/catalogue.ts and is rendered through t() or '
      + 'format(). There is no pragma and no allowlist file; the technical-attribute registry '
      + 'lives in this script and widening it is a reviewed source change.\n',
    );
    process.exit(1);
  }

  // The excluded files are PRINTED, not merely counted: an exclusion nobody can see is the same
  // as a silent skip, and this is where a reader finds out what was not read.
  // The excluded files and the escape call sites are PRINTED, not merely counted. An exclusion
  // nobody can see is the same as a silent skip, and an escape hatch nobody can see is the same
  // as a false claim that there is none.
  process.stdout.write(
    `no-bare-strings OK — ${scanned.length} file(s) scanned, ${excluded.length} excluded, `
    + `${errored.length} unanalysable, no bare strings.\n`
    + `Excluded: ${excluded.map((entry) => entry.file).join(', ') || 'none'}\n`
    + `UiString escapes (fromUserContent — text the USER owns, never UI chrome): `
    + `${escapes.map((e) => `${e.file}:${e.line}`).join(', ') || 'none'}\n`
    + 'This gate is a lexical tripwire. For text reaching OUR components the enforcing control is '
    + 'the UiString brand: a bare literal cannot satisfy it by ordinary structural typing, which '
    + 'tsc checks. The brand is NOT unforgeable — a cast is rejected by ui-string-cast outside '
    + 'src/strings/index.ts, and fromUserContent is the one listed exception.\n',
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
