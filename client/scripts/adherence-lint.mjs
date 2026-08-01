#!/usr/bin/env node
// APTR-02 — design-system adherence lint over the client SOURCE tree.
//
// ── WHAT THIS IS ────────────────────────────────────────────────────────────────────────────
//
// The constellation design system only works if every colour, every font and every piece of
// elevation comes from the token layer. One inline style is not a catastrophe; a hundred of
// them is a second, undocumented palette that nobody can retheme. This lint is what stops the
// first one, mechanically, on every build.
//
// It is a SOURCE lint, not a bundle lint, and that makes it categorically stronger than the
// egress lint next to it: the input is code we wrote, in languages we have real parsers for,
// so the interesting cases are decidable rather than delegated. Where something is NOT
// decidable it is written down under NON-GOALS below — never implied away.
//
// ── WHAT IT CATCHES ─────────────────────────────────────────────────────────────────────────
//
//   inline-style       a `style` attribute in TSX (`style={{…}}` and `style="…"` alike), and a
//                      `style=` attribute in HTML/SVG
//   style-block        a `<style>` element — as JSX, as markup, or as `createElement('style')`
//   color-literal      a hex, rgb()/rgba(), hsl()/hsla(), hwb(), lab()/lch(), oklab()/oklch()
//                      or color() literal — and, in CSS and markup, a CSS NAMED colour —
//                      anywhere except the token layer
//   font-literal       a font-family literal (a quoted family or a generic family keyword)
//                      outside the token layer, including one hidden in a custom property
//   programmatic-style `el.style.foo = …`, `el.style.setProperty(…)`, `style.cssText = …`,
//                      `setAttribute('style', …)`, and `dangerouslySetInnerHTML` — the routes
//                      by which JavaScript reaches the same holes the rules above close
//   dimension-literal  a raw `px` length outside the token layer. Control geometry belongs in
//                      the token layer with the rest of the design system's constants; where a
//                      value is genuinely optical and has no token, an inline reason comment
//                      records why, so a mixed layer cannot form silently.
//   malformed-css      an at-rule whose name is not a real at-rule, an at-rule that requires a
//                      block and has none, and a property name that is not a valid CSS ident.
//                      These exist because postcss is a LENIENT parser — see below.
//   forced-color-none  `forced-color-adjust: none`, the one property that can defeat a user's
//                      forced-colours mode. There is no legitimate use of it in this client.
//
// ── IT FAILS CLOSED ─────────────────────────────────────────────────────────────────────────
//
// Every one of these is an ERROR, not a skip. An unparseable file is not evidence of
// compliance; a file the lint does not understand is the most likely place for a violation to
// be hiding.
//
//   * a file that cannot be read
//   * a TypeScript file whose parse produced diagnostics — and a TypeScript version whose
//     parse diagnostics cannot be inspected at all, which would silently turn the check off
//   * a CSS file postcss cannot parse, or a JSON file JSON.parse cannot parse. READ THE CSS
//     CAVEAT UNDER NON-GOALS: "postcss parsed it" is a far weaker statement than "it is valid
//     CSS", and an earlier revision of this header implied otherwise.
//   * a file in scope whose extension has no registered parser AND is not in the code-owned
//     binary-asset list
//   * a scan that matched ZERO files — a mis-specified root must never report green
//   * an allowlist that is missing, malformed, has an unknown key, an entry outside the
//     code-owned path registry, a duplicate entry, an entry with no reason, or an entry that
//     matched nothing this run (a stale exception rots into a permanent hole)
//
// ── NON-GOALS: known, accepted, NOT silently missing ────────────────────────────────────────
//
// Each of these is recorded here AND pinned by a test in `adherence-lint.test.mjs`, so if one
// is ever closed the test goes red and this comment gets updated with it.
//
//   * A colour ASSEMBLED AT RUNTIME is not detected. `'#' + hex`, a template's `${}` parts,
//     `String.fromCharCode(…)`, a value read from a fetch — none of it is visible statically.
//     The static TEXT of a template literal IS scanned; its substitutions are not.
//   * POSTCSS IS A LENIENT PARSER, SO "PARSES" DOES NOT MEAN "VALID". This is not a theoretical
//     caveat: `.x { @@@ display: flex; ... }` shipped on this branch and passed a green build.
//     postcss accepted `@@` as an at-rule NAME with `display: flex` as its PARAMS — so the file
//     parsed, no error was raised, AND the swallowed declaration was never walked AS A
//     DECLARATION. What that costs, re-measured after at-rule params gained a px scan: the
//     colour and dimension rules survive a swallow, because at-rule PARAMS are scanned for
//     both; the font-literal and forced-color-none rules walk declarations only and still go
//     blind. A lenient parse does not merely tolerate garbage; it can HIDE what this lint
//     exists to read, which is why `malformed-css` reports the SHAPE regardless of what the
//     swallowed text happens to contain. That rule covers an unknown at-rule name, an at-rule
//     sitting where a declaration belongs, an at-rule with no block outside the small blockless
//     allowlist, and a non-ident property name. It does NOT make
//     this a CSS validator: a WELL-FORMED but wrong declaration — `color: notacolour`,
//     `padding: 3 4 5 6 7`, `@media (nonsense) {}` — still passes, and a well-formed at-rule
//     with garbage params could still swallow content. Use a browser or a real validator for
//     validity; this rule only closes the hiding hole.
//   * The `dimension-literal` rule covers `px` ONLY. `rem`, `em`, `%`, `ch`, `vh`, `fr` and
//     unitless numbers are not checked, because the design system's scale is expressed in px
//     and a rule over every unit would fire on `100%`, `1fr` and `line-height: 1.3` — noise
//     that would get the rule switched off. A dimension smuggled in as `0.5rem` is therefore
//     not detected.
//   * Other CSSOM routes to a stylesheet are NOT detected: `CSSStyleSheet.insertRule`,
//     `document.adoptedStyleSheets`, and a `<style>` element obtained by any means other than a
//     literal `createElement('style')` — an aliased tag name, for instance. `createElement` is
//     covered because it is the one people actually reach for; the rest is the same
//     deliberate-obfuscation frontier the other rules stop at.
//   * A colour reaching the DOM through a CSS CUSTOM PROPERTY set at runtime is not detected
//     as a colour. The routes by which this app's own code could set one are closed by the
//     `programmatic-style` rule, but a value handed to a third-party component's colour prop
//     — a charting library, say — is not seen. This client has no such dependency today; the
//     honest statement is that the rule is not a general guarantee about custom properties.
//   * CSS NAMED colours are checked in CSS and markup, NOT in TypeScript strings. `'salmon'`
//     in a TS string is far more likely to be prose than a colour, and the false-positive tax
//     would be paid on every string in the app. A named colour in TS has no route to the DOM
//     that another rule does not already close — except the third-party-prop case above.
//   * The markup scanner is PARTIAL. It is a hand-written scanner, not a spec-compliant HTML
//     tokenizer: it ends a tag at the next `>`, so an attribute value CONTAINING `>`
//     desynchronizes it and behaviour after that point is UNMODELLED — a violation there may
//     be missed, or reported at a nonsense position. Do not reason about that case. It does
//     NOT skip comments, deliberately: a `<style>` inside an HTML comment is still reported,
//     because a false alarm a human can dismiss is cheaper than a hole a human cannot see.
//   * The markup scanner reads TAG NAMES and ATTRIBUTE VALUES only. Text between tags is not
//     scanned — a colour written as page text is not a style. A `<style>` element's BODY is not
//     scanned either, which is moot: the element itself is already a violation.
//   * It scans SOURCE. A colour or font inside a DEPENDENCY's stylesheet is out of scope; so
//     is anything a bundler generates. The `@fontsource` packages legitimately declare font
//     families and are, correctly, never scanned.
//   * It checks that a raw VALUE is not used. It does not check that the token chosen was the
//     RIGHT one — contrast, motion and semantic-colour correctness are APTR-107's job.
//
// ── THE ALLOWLIST ───────────────────────────────────────────────────────────────────────────
//
// One exception is genuinely needed eventually: a syntax-highlighting theme is a list of
// colours by definition, and tokenising forty of them would produce a token layer nobody can
// read. So `color-allowlist.json` exists — but it is deliberately weak on purpose:
//
//   * only the `color-literal` rule is allowlistable at all (code-owned);
//   * only files matching the code-owned PATH REGISTRY below may appear in it, so a component
//     or a primitive can never be allowlisted by editing configuration;
//   * every entry names an exact file AND an exact value AND a reason;
//   * a stale entry fails the lint.
//
// Widening any of that is a source change a reviewer has to approve. There is no flag, no
// environment variable, and no comment pragma that turns a rule off.
//
// ── USAGE ───────────────────────────────────────────────────────────────────────────────────
//
//   node scripts/adherence-lint.mjs [--root <dir>] [--allowlist <file>]
//
// `--root` and `--allowlist` exist for the lint's own test harness, which runs it over fixture
// trees. They change WHAT is scanned, never WHETHER a rule applies.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import postcss from 'postcss';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = resolve(SCRIPT_DIR, '..');
const DEFAULT_ALLOWLIST = join(SCRIPT_DIR, 'color-allowlist.json');

/**
 * What gets scanned, relative to the root. Code-owned: a directory cannot be dropped from the
 * scan by configuration. A target that does not exist is an ERROR, not an empty scan.
 */
const SCAN_TARGETS = ['src', 'index.html'];

/**
 * THE TOKEN LAYER — the only place a colour literal or a font literal may appear. One file,
 * named in code, not a directory and not a pattern: "somewhere under styles/" would let a new
 * stylesheet declare a palette simply by being put in the right folder.
 */
const TOKEN_LAYER = 'src/styles/constellation.css';

/**
 * Where a `<style>` element is permitted at all. Empty: this client has no legitimate reason
 * to inject a stylesheet from a component, and the CSP the BFF serves (APTR-99) is expected to
 * forbid inline styles outright. Kept as a named constant so the intent is explicit rather
 * than implied by the absence of a check.
 */
const STYLE_BLOCK_ALLOWED_FILES = [];

/**
 * Files that may appear in the allowlist. Code-owned; the JSON cannot add to it. Anchored,
 * so `src/styles/syntax/…-and-also-src/components/Foo.tsx` cannot match.
 */
const ALLOWLISTABLE_PATH_PATTERNS = [
  /^src\/styles\/syntax\/[A-Za-z0-9._-]+\.css$/,
  /^src\/styles\/syntax-theme\.css$/,
];

/** The only rule an allowlist entry may suppress. */
const ALLOWLISTABLE_RULES = ['color-literal'];

/** Extensions with a real parser. Anything else in scope is an error unless it is a binary. */
const PARSERS = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.css': 'css',
  '.json': 'json',
  '.html': 'markup',
  '.htm': 'markup',
  '.svg': 'markup',
};

/**
 * Binary assets that carry no style semantics this lint can or should read. Code-owned and
 * exhaustive: an unrecognised extension is reported, never skipped. Unlike the egress lint,
 * this list is by EXTENSION and not by content signature — these files are ours, in our own
 * source tree, and a crafted extension is not the threat model of a design-system lint.
 */
const BINARY_ASSET_EXTENSIONS = new Set([
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico',
  '.mp3', '.mp4', '.webm', '.ogg', '.wav',
  '.wasm', '.pdf', '.zip',
]);

/** Directories never walked. */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage']);

/* ── Colour recognition ──────────────────────────────────────────────────────────────────── */

/**
 * A hex colour. The trailing boundary is `(?![0-9a-zA-Z])` rather than `\b` so `#deadbeefcafe`
 * is not read as an 8-digit hex plus trailing text.
 */
const HEX_COLOR = /#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z])/g;

/**
 * Colour FUNCTIONS. `color-mix()` and `light-dark()` are deliberately absent: both take other
 * colours as arguments, so a legitimate `color-mix(in srgb, var(--a), var(--b))` contains no
 * literal, and any literal inside one is caught by the other patterns anyway.
 */
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/g;

/** CSS named colours. `transparent` is deliberately excluded — it is a keyword, not a hue. */
const NAMED_COLORS = new Set(`aliceblue antiquewhite aqua aquamarine azure beige bisque black
blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral
cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen
darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon
darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink
deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro
ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory
khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen
lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen
magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream
mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen
seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan
teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`
  .split(/\s+/)
  .filter(Boolean));

/**
 * Generic font families. Their presence in a value means a font stack is being declared, which
 * is what makes this rule catch a stack hidden inside a custom property rather than only a
 * literal `font-family:` declaration.
 */
const GENERIC_FONT_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy',
  'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
  'math', 'emoji', 'fangsong',
]);

/**
 * Real at-rules. Code-owned: an at-rule outside this list is a typo or garbage, and postcss
 * will happily accept either. Vendor-prefixed keyframes are matched by pattern below.
 */
const KNOWN_AT_RULES = new Set([
  'charset', 'import', 'namespace', 'media', 'supports', 'document', 'page', 'font-face',
  'keyframes', 'viewport', 'counter-style', 'font-feature-values', 'font-palette-values',
  'swash', 'ornaments', 'annotation', 'stylistic', 'styleset', 'character-variant',
  'property', 'layer', 'container', 'scope', 'starting-style', 'position-try',
]);

/**
 * ── THE SWALLOW CHECKS ARE ALLOWLISTS, DELIBERATELY ────────────────────────────────────────
 *
 * An earlier revision listed the at-rules that REQUIRE a block, and a reviewer walked straight
 * through it with `@property` and `@viewport` — both absent from the list, both blockless, both
 * swallowing the declaration after them exactly as `@@@` did. Extending that list would have
 * fixed those two and left the next at-rule CSS gains to re-open the hole silently.
 *
 * So both checks are inverted. Each names the small set that is legitimate; everything else
 * fails. A future at-rule is then a false POSITIVE — a build failure a reviewer sees and a
 * source change resolves — rather than a silent bypass. For a rule whose entire purpose is
 * catching what nobody anticipated, that is the only defensible default.
 */

/**
 * At-rules that are legitimately BLOCKLESS statements. Anything else without a block has
 * swallowed whatever followed it into its params.
 */
const AT_RULES_VALID_WITHOUT_A_BLOCK = new Set([
  'charset', // `@charset "utf-8";` — a statement by definition
  'import', // `@import url(…);`
  'namespace', // `@namespace svg url(…);`
  'layer', // the list form, `@layer base, components;` — the block form has a block
]);

/**
 * At-rules that may legitimately appear INSIDE a style rule, where a declaration is otherwise
 * what belongs. Kept to the three conditional groups this design system actually uses; a
 * nesting construct that is genuinely needed later is a reviewed source change, not a config
 * edit. Everything else nested — `@property`, `@viewport`, a typo, an at-rule that does not yet
 * exist — is an anomaly where a declaration was expected, and is reported as one.
 */
const AT_RULES_ALLOWED_INSIDE_A_STYLE_RULE = new Set(['media', 'supports', 'container']);

const VENDOR_KEYFRAMES = /^-(webkit|moz|ms|o)-keyframes$/;

/** A valid CSS property name: a custom property, or an ident with an optional vendor prefix. */
const VALID_PROPERTY_NAME = /^(--[A-Za-z0-9_-]+|-{0,2}[A-Za-z_][A-Za-z0-9_-]*)$/;

/**
 * A px length. Negative and decimal values included; `0px` too — it should just be `0`. Matched
 * CASE-INSENSITIVELY: CSS units are case-insensitive, so `7PX` is a px literal, and a
 * case-sensitive pattern was a bypass a reviewer found rather than a limitation anyone chose.
 */
const PX_LENGTH = /(?<![\w.-])-?\d*\.?\d+px(?![\w-])/gi;

/**
 * The inline escape for a genuinely optical dimension. Two accepted forms, and only two, so a
 * reader always finds the reason next to the value:
 *
 *   \/* dimension-literal: a 2px lift is the smallest movement that reads as a lift *\/
 *   transform: translateY(-2px);
 *
 * ...or the same comment immediately AFTER the declaration on the same line. The reason must be
 * a real sentence, not the word "ok" — same bar as an allowlist entry.
 */
const DIMENSION_REASON = /dimension-literal:\s*(.{12,})/;

/* ── Findings ────────────────────────────────────────────────────────────────────────────── */

/**
 * @param {string} rule
 * @param {string} file
 * @param {number} line
 * @param {string} detail human-readable context
 * @param {string} [literal] the EXACT offending literal, when there is one. The allowlist
 *   matches on this by strict equality — never on `detail`, which is prose and would make a
 *   short allowlist value match by accident.
 */
function finding(rule, file, line, detail, literal) {
  return literal === undefined ? { rule, file, line, detail } : { rule, file, line, detail, literal };
}

/* ── Colour scanning of a plain value ────────────────────────────────────────────────────── */

/**
 * Extract colour literals from an arbitrary value string.
 *
 * @param {string} value
 * @param {{ named: boolean }} options `named` enables the CSS-named-colour check. It is on for
 *   CSS and markup and off for TypeScript strings — see NON-GOALS.
 * @returns {string[]} the exact literals found, verbatim, so the allowlist can match on them.
 */
export function findColorLiterals(value, { named }) {
  const found = [];
  for (const match of value.matchAll(HEX_COLOR)) found.push(match[0]);
  for (const match of value.matchAll(COLOR_FUNCTION)) found.push(match[0].replace(/\s*\($/, '()'));
  if (named) {
    // Strip custom-property references first: `var(--violet-500)` must not yield "violet",
    // and `--flux-green-deep` must not yield "green".
    const withoutCustomProps = value.replace(/--[A-Za-z0-9_-]+/g, ' ');
    // An identifier NOT adjacent to a hyphen. `sans-serif` yields nothing; `red` yields "red".
    for (const match of withoutCustomProps.matchAll(/(?<![\w-])[A-Za-z]+(?![\w-])/g)) {
      if (NAMED_COLORS.has(match[0].toLowerCase())) found.push(match[0]);
    }
  }
  return found;
}

/**
 * Does this node — a declaration or an at-rule — carry an inline reason for its raw dimension?
 *
 * Accepted: a Comment immediately BEFORE the declaration, or a Comment immediately after it on
 * the SAME source line. Anything looser — a comment anywhere in the rule, say — would let one
 * reason cover values it was never written about.
 */
function hasDimensionReason(node) {
  const previous = node.prev();
  if (previous?.type === 'comment' && DIMENSION_REASON.test(previous.text)) return true;

  const next = node.next();
  if (
    next?.type === 'comment'
    && DIMENSION_REASON.test(next.text)
    && next.source?.start?.line === node.source?.start?.line
  ) return true;

  // A comment between the value and the semicolon lands in the declaration's own raws.
  const raw = node.raws?.value?.raw;
  return typeof raw === 'string' && DIMENSION_REASON.test(raw);
}

function looksLikeFontStack(value) {
  if (/['"]/.test(value)) return true;
  const withoutCustomProps = value.replace(/--[A-Za-z0-9_-]+/g, ' ');
  for (const match of withoutCustomProps.matchAll(/(?<![\w])[A-Za-z][A-Za-z-]*(?![\w])/g)) {
    if (GENERIC_FONT_FAMILIES.has(match[0].toLowerCase())) return true;
  }
  return false;
}

/* ── TypeScript ──────────────────────────────────────────────────────────────────────────── */

function scriptKindFor(ext) {
  if (ext === '.tsx') return ts.ScriptKind.TSX;
  return ts.ScriptKind.TS;
}

function scanTypeScript(relPath, text, ext, findings, errors) {
  const source = ts.createSourceFile(
    relPath,
    text,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ true,
    scriptKindFor(ext),
  );

  // FAIL CLOSED. `parseDiagnostics` is an internal field; if a TypeScript upgrade ever removes
  // it, this check would silently become a no-op and every malformed file would read as clean.
  // So its ABSENCE is an error in its own right.
  const diagnostics = /** @type {{ parseDiagnostics?: readonly unknown[] }} */ (source).parseDiagnostics;
  if (!Array.isArray(diagnostics)) {
    errors.push(
      `${relPath}: cannot inspect TypeScript parse diagnostics (typescript ${ts.version}). `
      + 'The syntax check cannot be verified, so this file is treated as unscannable.',
    );
    return;
  }
  if (diagnostics.length > 0) {
    const first = /** @type {{ messageText?: unknown }} */ (diagnostics[0]);
    const message = typeof first?.messageText === 'string' ? first.messageText : 'syntax error';
    errors.push(`${relPath}: does not parse as TypeScript (${message}). An unparseable file is not evidence of compliance.`);
    return;
  }

  const lineOf = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  const identifierName = (node) => {
    if (!node) return undefined;
    if (ts.isIdentifier(node)) return node.text;
    if (ts.isJsxNamespacedName?.(node)) return `${node.namespace.text}:${node.name.text}`;
    return undefined;
  };

  const isStyleAccess = (node) =>
    ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name) && node.name.text === 'style';

  const visit = (node) => {
    /* inline-style — `style={{…}}`, `style="…"`, `style={x}`; all of them. */
    if (ts.isJsxAttribute(node) && identifierName(node.name) === 'style') {
      findings.push(finding('inline-style', relPath, lineOf(node), 'JSX `style` attribute'));
    }

    /* dangerouslySetInnerHTML — the markup back door for a style attribute or a <style> body. */
    if (ts.isJsxAttribute(node) && identifierName(node.name) === 'dangerouslySetInnerHTML') {
      findings.push(
        finding('programmatic-style', relPath, lineOf(node), '`dangerouslySetInnerHTML` injects unscannable markup'),
      );
    }

    /* style-block — <style> as a JSX element. */
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = identifierName(node.tagName);
      if (tag === 'style' && !STYLE_BLOCK_ALLOWED_FILES.includes(relPath)) {
        findings.push(finding('style-block', relPath, lineOf(node), '<style> element'));
      }
    }

    /* programmatic-style — el.style.x = …, el.style.setProperty(…), style.cssText = … */
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = node.left;
      if (ts.isPropertyAccessExpression(left)) {
        if (isStyleAccess(left.expression)) {
          findings.push(finding('programmatic-style', relPath, lineOf(node), `assignment to \`style.${left.name.getText(source)}\``));
        } else if (ts.isIdentifier(left.name) && left.name.text === 'cssText') {
          findings.push(finding('programmatic-style', relPath, lineOf(node), 'assignment to `cssText`'));
        } else if (isStyleAccess(left)) {
          findings.push(finding('programmatic-style', relPath, lineOf(node), 'assignment to `.style`'));
        }
      } else if (ts.isElementAccessExpression(left) && isStyleAccess(left.expression)) {
        findings.push(finding('programmatic-style', relPath, lineOf(node), 'computed assignment into `.style`'));
      }
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = ts.isIdentifier(node.expression.name) ? node.expression.name.text : '';
      if (method === 'setProperty' && isStyleAccess(node.expression.expression)) {
        findings.push(finding('programmatic-style', relPath, lineOf(node), '`style.setProperty(…)`'));
      }
      if (method === 'createElement' || method === 'createElementNS') {
        const tagArg = node.arguments[method === 'createElementNS' ? 1 : 0];
        if (tagArg && ts.isStringLiteral(tagArg) && tagArg.text.toLowerCase() === 'style') {
          findings.push(finding('style-block', relPath, lineOf(node), `\`${method}('style')\``));
        }
      }
      if (method === 'setAttribute') {
        const first = node.arguments[0];
        if (first && ts.isStringLiteral(first) && first.text.toLowerCase() === 'style') {
          findings.push(finding('programmatic-style', relPath, lineOf(node), "`setAttribute('style', …)`"));
        }
      }
    }

    /* Object property named `style` or `fontFamily` — a style object built to be spread. */
    if (
      (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node))
      && ts.isIdentifier(node.name)
      && node.name.text === 'fontFamily'
    ) {
      findings.push(finding('font-literal', relPath, lineOf(node), '`fontFamily` property'));
    }

    /* color-literal / font-literal in string data. Comments are not in the AST, so a colour in
       a comment is inert BY CONSTRUCTION — not because anything stripped it. */
    let literalText;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) literalText = node.text;
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) literalText = node.text;
    else if (ts.isJsxText(node)) literalText = node.text;

    if (literalText !== undefined) {
      // `named: false` — see NON-GOALS.
      for (const literal of findColorLiterals(literalText, { named: false })) {
        findings.push(finding('color-literal', relPath, lineOf(node), literal, literal));
      }
      if (/font-family/i.test(literalText)) {
        findings.push(finding('font-literal', relPath, lineOf(node), 'font-family in a string literal'));
      }
      if (/forced-color-adjust\s*:\s*none/i.test(literalText)) {
        findings.push(finding('forced-color-none', relPath, lineOf(node), 'forced-color-adjust: none'));
      }
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(source, visit);
}

/* ── CSS ─────────────────────────────────────────────────────────────────────────────────── */

function scanCss(relPath, text, findings, errors) {
  let root;
  try {
    root = postcss.parse(text, { from: relPath });
  } catch (error) {
    errors.push(`${relPath}: does not parse as CSS (${error instanceof Error ? error.message : String(error)}).`);
    return;
  }

  const isTokenLayer = relPath === TOKEN_LAYER;
  const lineOf = (node) => node.source?.start?.line ?? 0;

  // ── Well-formedness. postcss ACCEPTS a great deal that is not CSS, and an accepted-but-wrong
  // at-rule can swallow the declarations that follow it, so they are never walked below. These
  // checks close that hole; they do not make this a validator (see NON-GOALS).
  root.walkAtRules((atRule) => {
    const name = atRule.name.toLowerCase();

    if (!KNOWN_AT_RULES.has(name) && !VENDOR_KEYFRAMES.test(name)) {
      findings.push(finding(
        'malformed-css', relPath, lineOf(atRule),
        `\`@${atRule.name}\` is not a known at-rule. postcss accepts it, and anything after it on `
        + 'that line becomes its params rather than a declaration this lint can read.',
      ));
      return;
    }

    // An at-rule sitting where a DECLARATION belongs. This is the inverted check: inside a
    // style rule a declaration is expected and an at-rule is the anomaly, so the question is
    // not "does this at-rule need a block" but "is this one of the few that belong here".
    if (atRule.parent?.type === 'rule' && !AT_RULES_ALLOWED_INSIDE_A_STYLE_RULE.has(name)) {
      findings.push(finding(
        'malformed-css', relPath, lineOf(atRule),
        `\`@${atRule.name}\` appears inside a style rule, where a declaration belongs. If it is `
        + 'blockless it has swallowed what follows into its params, where no declaration-scoped '
        + `rule can see it. Nestable here: ${[...AT_RULES_ALLOWED_INSIDE_A_STYLE_RULE].map((n) => `@${n}`).join(', ')}.`,
      ));
      return;
    }

    if (!atRule.nodes && !AT_RULES_VALID_WITHOUT_A_BLOCK.has(name)) {
      findings.push(finding(
        'malformed-css', relPath, lineOf(atRule),
        `\`@${atRule.name}\` has no block. Only ${[...AT_RULES_VALID_WITHOUT_A_BLOCK].map((n) => `@${n}`).join(', ')} `
        + 'are legitimately blockless; anything else without one has swallowed what follows.',
      ));
    }
  });

  root.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();
    const value = decl.value;

    if (!VALID_PROPERTY_NAME.test(decl.prop)) {
      findings.push(finding('malformed-css', relPath, lineOf(decl), `\`${decl.prop}\` is not a valid property name`));
    }

    if (prop === 'forced-color-adjust' && value.trim().toLowerCase() === 'none') {
      findings.push(
        finding('forced-color-none', relPath, lineOf(decl), 'forced-color-adjust: none defeats the user\'s own palette'),
      );
    }

    if (!isTokenLayer) {
      for (const literal of findColorLiterals(value, { named: true })) {
        findings.push(finding('color-literal', relPath, lineOf(decl), `${decl.prop}: ${literal}`, literal));
      }
      // A font stack, whether declared as `font-family:` or smuggled into a custom property.
      if (looksLikeFontStack(value)) {
        findings.push(finding('font-literal', relPath, lineOf(decl), `${decl.prop}: ${value}`));
      }

      const lengths = [...value.matchAll(PX_LENGTH)].map((m) => m[0]);
      if (lengths.length > 0 && !hasDimensionReason(decl)) {
        findings.push(finding(
          'dimension-literal', relPath, lineOf(decl),
          `${decl.prop}: ${lengths.join(', ')} — take it from the token layer, or record why it `
          + 'is optical with a `/* dimension-literal: … */` comment on the declaration',
        ));
      }
    }
  });

  if (!isTokenLayer) {
    root.walkAtRules((atRule) => {
      const params = atRule.params ?? '';
      for (const literal of findColorLiterals(params, { named: true })) {
        findings.push(finding('color-literal', relPath, lineOf(atRule), `@${atRule.name} ${literal}`, literal));
      }

      // At-rule params are scanned for dimensions as well as colours. A breakpoint is the
      // common case, and it legitimately CANNOT be a token: `var()` does not resolve inside a
      // media condition. So a breakpoint takes the same inline reason as any other optical
      // literal, which at least puts the number and its justification in the same place.
      const lengths = [...params.matchAll(PX_LENGTH)].map((m) => m[0]);
      if (lengths.length > 0 && !hasDimensionReason(atRule)) {
        findings.push(finding(
          'dimension-literal', relPath, lineOf(atRule),
          `@${atRule.name} ${lengths.join(', ')} — a media condition cannot read a custom property, `
          + 'so record why this breakpoint is what it is with a `/* dimension-literal: … */` comment',
        ));
      }
    });
  }
}

/* ── JSON ────────────────────────────────────────────────────────────────────────────────── */

function scanJson(relPath, text, findings, errors) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    errors.push(`${relPath}: does not parse as JSON (${error instanceof Error ? error.message : String(error)}).`);
    return;
  }
  const walk = (value) => {
    if (typeof value === 'string') {
      for (const literal of findColorLiterals(value, { named: false })) {
        findings.push(finding('color-literal', relPath, 0, literal, literal));
      }
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        walk(key);
        walk(child);
      }
    }
  };
  walk(parsed);
}

/* ── Markup (HTML / SVG) — PARTIAL, see NON-GOALS ────────────────────────────────────────── */

function scanMarkup(relPath, text, findings) {
  const lineAt = (index) => text.slice(0, index).split('\n').length;

  // Tags. Comments are NOT skipped: a false alarm is cheaper than a blind spot.
  for (const match of text.matchAll(/<\s*([A-Za-z][A-Za-z0-9:-]*)((?:[^>])*)>/g)) {
    const tag = match[1].toLowerCase();
    const attrs = match[2] ?? '';
    const line = lineAt(match.index ?? 0);

    if (tag === 'style' && !STYLE_BLOCK_ALLOWED_FILES.includes(relPath)) {
      findings.push(finding('style-block', relPath, line, '<style> element'));
    }

    for (const attr of attrs.matchAll(/([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*("[^"]*"|'[^']*'|[^\s"'`=<>]+)/g)) {
      const name = attr[1].toLowerCase();
      const raw = attr[2] ?? '';
      const value = raw.replace(/^["']|["']$/g, '');

      if (name === 'style') {
        findings.push(finding('inline-style', relPath, line, `style attribute on <${tag}>`));
      }
      for (const literal of findColorLiterals(value, { named: true })) {
        findings.push(finding('color-literal', relPath, line, `${name}="${literal}"`, literal));
      }
      if (name === 'font-family') {
        findings.push(finding('font-literal', relPath, line, `${name}="${value}"`));
      }
    }
  }
}

/* ── Allowlist ───────────────────────────────────────────────────────────────────────────── */

const ALLOWLIST_KEYS = new Set(['note', 'entries']);
const ENTRY_KEYS = new Set(['file', 'value', 'rule', 'reason']);

function loadAllowlist(allowlistPath) {
  let raw;
  try {
    raw = readFileSync(allowlistPath, 'utf8');
  } catch (error) {
    throw new Error(
      `allowlist: cannot read ${allowlistPath} (${error instanceof Error ? error.message : String(error)}). `
      + 'A missing allowlist is an error, not an empty one: the lint must not run with its exception '
      + 'policy unknown.',
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`allowlist: ${allowlistPath} is not valid JSON (${error instanceof Error ? error.message : String(error)}).`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('allowlist: the top level must be an object with an `entries` array.');
  }
  for (const key of Object.keys(parsed)) {
    if (!ALLOWLIST_KEYS.has(key)) {
      throw new Error(`allowlist: unknown top-level key "${key}". Allowed: ${[...ALLOWLIST_KEYS].join(', ')}.`);
    }
  }
  if (!Array.isArray(parsed.entries)) {
    throw new Error('allowlist: `entries` must be an array (use [] when there is no exception).');
  }

  const seen = new Set();
  const entries = parsed.entries.map((entry, index) => {
    const at = `allowlist entry ${index}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${at}: must be an object.`);
    for (const key of Object.keys(entry)) {
      if (!ENTRY_KEYS.has(key)) throw new Error(`${at}: unknown key "${key}". Allowed: ${[...ENTRY_KEYS].join(', ')}.`);
    }
    const { file, value, rule, reason } = entry;
    if (typeof file !== 'string' || file === '') throw new Error(`${at}: \`file\` must be a non-empty string.`);
    if (typeof value !== 'string' || value === '') throw new Error(`${at}: \`value\` must be a non-empty string.`);
    if (typeof rule !== 'string' || !ALLOWLISTABLE_RULES.includes(rule)) {
      throw new Error(`${at}: \`rule\` must be one of ${ALLOWLISTABLE_RULES.join(', ')} — only those are allowlistable.`);
    }
    if (typeof reason !== 'string' || reason.trim().length < 12) {
      throw new Error(`${at}: \`reason\` must be a sentence explaining why the literal cannot be a token.`);
    }
    if (!ALLOWLISTABLE_PATH_PATTERNS.some((pattern) => pattern.test(file))) {
      throw new Error(
        `${at}: "${file}" is outside the code-owned allowlistable path registry. `
        + 'Only a syntax-highlighting theme may carry literals; widening this is a source change.',
      );
    }
    const key = `${rule} ${file} ${value}`;
    if (seen.has(key)) throw new Error(`${at}: duplicate of an earlier entry (${file} / ${value}).`);
    seen.add(key);
    return { file, value, rule, reason, used: false };
  });

  return entries;
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

/* ── The lint ────────────────────────────────────────────────────────────────────────────── */

/**
 * @param {{ root?: string, allowlistPath?: string }} [options]
 * @returns {{ findings: Array<object>, errors: string[], scanned: string[] }}
 */
export function runAdherenceLint(options = {}) {
  const root = resolve(options.root ?? CLIENT_DIR);
  const allowlistPath = resolve(options.allowlistPath ?? DEFAULT_ALLOWLIST);

  const findings = [];
  const errors = [];
  const scanned = [];

  let allowlist;
  try {
    allowlist = loadAllowlist(allowlistPath);
  } catch (error) {
    return { findings, errors: [error instanceof Error ? error.message : String(error)], scanned };
  }

  const files = [];
  for (const target of SCAN_TARGETS) {
    const absolute = join(root, target);
    try {
      collectFiles(absolute, root, files);
    } catch (error) {
      errors.push(
        `scan target "${target}" could not be walked (${error instanceof Error ? error.message : String(error)}). `
        + 'A target that is missing or unreadable is an error: an unscanned tree is not a clean one.',
      );
    }
  }

  for (const relPath of files) {
    const ext = extname(relPath).toLowerCase();
    if (BINARY_ASSET_EXTENSIONS.has(ext)) continue;

    const parser = PARSERS[ext];
    if (!parser) {
      errors.push(
        `${relPath}: no parser is registered for "${ext || '(no extension)'}" and it is not a known binary asset. `
        + 'Register a parser or add the extension to the binary list — it is not skipped silently.',
      );
      continue;
    }

    let text;
    try {
      text = readFileSync(join(root, relPath), 'utf8');
    } catch (error) {
      errors.push(`${relPath}: cannot be read (${error instanceof Error ? error.message : String(error)}).`);
      continue;
    }

    scanned.push(relPath);
    if (parser === 'typescript') scanTypeScript(relPath, text, ext, findings, errors);
    else if (parser === 'css') scanCss(relPath, text, findings, errors);
    else if (parser === 'json') scanJson(relPath, text, findings, errors);
    else if (parser === 'markup') scanMarkup(relPath, text, findings);
  }

  if (scanned.length === 0 && errors.length === 0) {
    errors.push('no files were scanned. A scan that matches nothing is a configuration error, not a pass.');
  }

  // Apply the allowlist. Exact rule + file + value, never a prefix and never a pattern.
  const surviving = findings.filter((f) => {
    // Exact equality on the extracted literal, not a substring of the message: a substring
    // match would let the entry "red" suppress "darkred" and every other finding containing it.
    const entry = allowlist.find((a) => a.rule === f.rule && a.file === f.file && a.value === f.literal);
    if (!entry) return true;
    entry.used = true;
    return false;
  });

  for (const entry of allowlist) {
    if (!entry.used) {
      errors.push(
        `allowlist: the entry for ${entry.file} / ${entry.value} matched nothing in this run. `
        + 'A stale exception rots into a permanent hole — remove it or correct it.',
      );
    }
  }

  return { findings: surviving, errors, scanned };
}

/* ── CLI ─────────────────────────────────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--root') { options.root = argv[i + 1]; i += 1; }
    else if (argv[i] === '--allowlist') { options.allowlistPath = argv[i + 1]; i += 1; }
    else throw new Error(`unknown argument "${argv[i]}". Usage: adherence-lint.mjs [--root <dir>] [--allowlist <file>]`);
  }
  return options;
}

function main() {
  let result;
  try {
    result = runAdherenceLint(parseArgs(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`adherence lint: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
    return;
  }

  const { findings, errors, scanned } = result;

  for (const error of errors) process.stderr.write(`adherence lint ERROR  ${error}\n`);
  for (const f of findings) {
    process.stderr.write(`adherence lint  ${f.file}:${f.line}  [${f.rule}]  ${f.detail}\n`);
  }

  if (findings.length > 0 || errors.length > 0) {
    process.stderr.write(
      `\nadherence lint FAILED — ${findings.length} violation(s), ${errors.length} error(s) `
      + `across ${scanned.length} scanned file(s).\n`
      + 'Colours, fonts and elevation come from src/styles/constellation.css. There is no pragma '
      + 'to disable a rule; the only exception path is scripts/color-allowlist.json, which accepts '
      + 'a syntax-highlighting theme and nothing else.\n',
    );
    process.exit(1);
  }

  process.stdout.write(`adherence lint OK — ${scanned.length} file(s) scanned, no violations.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
