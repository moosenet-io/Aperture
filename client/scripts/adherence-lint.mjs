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
// ── WHAT IS PARSED, AND WHAT IS MERELY MATCHED ──────────────────────────────────────────────
//
// The strength of each claim differs by language, and the differences are the point:
//
//   TypeScript  — the TypeScript compiler's own AST. Comments do not exist in it, string and
//                 template boundaries are the parser's problem, and regex literals are typed
//                 nodes. Comment/string correctness here IS by construction.
//   CSS         — structure from postcss, VALUES from postcss-value-parser. Both are real
//                 lexers, so a `string` node is data and a dimension is read by the CSS number
//                 grammar. An earlier revision parsed only the structure and ran regexes over
//                 the values while claiming the same property for both; it did not hold, and
//                 `content: "1e+3px"` reported a dimension that was a string.
//   free text   — a TypeScript string literal, a JSON string. These are NOT CSS values, so
//                 there is nothing to lex them with and colour detection there is honest
//                 PATTERN MATCHING, labelled as such at `findColorLiteralsInText`.
//   HTML/SVG    — a partial hand-written scanner, described under NON-GOALS. Presentation
//                 attribute VALUES are CSS values by specification, so those are lexed.
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
//   * FONT detection is keyed on the property. `font-family` and a custom property are handled;
//     the `font` SHORTHAND is partial — only a quoted family or a generic family keyword is
//     treated as a signal, because "any non-var token" would fire on the size, weight and
//     line-height the shorthand legitimately carries. `font: 600 15px/1.6 Inter` is therefore
//     not detected. This design system does not use the shorthand.
//   * A CUSTOM PROPERTY holding an unquoted family with no generic keyword and no "font" in its
//     name — `--x: Inter` — is not detected. It is not decidable from the value: `Inter` is a
//     bare word like any other. `--body-font: Inter` IS caught, by the name.
//   * CSS ESCAPES IN THE UNIT are not decoded. `7p\78` is a valid px dimension to a browser and
//     is not matched here. Decoding CSS escapes is a lexer's job, and postcss hands us the raw
//     value; this is the same frontier the colour rules stop at, and it is deliberate
//     obfuscation rather than the accidental drift this lint exists to catch.
//   * A px value PRODUCED by `calc()` from non-px operands — `calc(var(--x) * 2)` — is not a
//     literal and is not detected. A literal INSIDE a calc() is (`calc(100% - 7px)` is caught),
//     which is the case that actually occurs.
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
//   * CSS NAMED colours are checked in CSS, in markup presentation attributes, and in JSX
//     presentation attributes — NOT in ordinary TypeScript strings. `'salmon'` in a TS string is
//     far more likely to be prose than a colour, and the false-positive tax would be paid on
//     every string in the app.
//     An earlier revision claimed a named colour in TS had "no route to the DOM that another
//     rule does not already close". THAT WAS FALSE: a JSX presentation attribute
//     (`<circle fill="red" />`) was exactly such a route, and a reviewer found it. It is now
//     covered. The NEXT revision covered only the bare-string spelling and claimed the
//     remainder was "any non-static value" — ALSO FALSE, because `fill={'red'}` is entirely
//     static and was uncovered. Both corrections were written from the fix just made rather
//     than from what the code then did; this is the third time this one sentence has been
//     wrong, so it is now stated from the unwrapper's actual cases.
//     STATICALLY KNOWN values are covered in every spelling: bare string, expression container,
//     no-substitution template, parenthesised, and `as`/`satisfies`/angle-bracket assertion.
//     What remains is what a source lint genuinely cannot resolve: a value computed at runtime
//     (`fill={colour}`, a template WITH substitutions, a value from props or state) and a colour
//     handed to a third-party component's own prop.
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
import valueParser from 'postcss-value-parser';

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
 * A hex colour, anchored to a COMPLETE lexed word. Anchoring is what stops `#deadbeefcafe`
 * being read as an 8-digit hex plus trailing text — the word is either a hex colour or it is
 * not, and there is no partial answer.
 */
const HEX_WORD = /^#[0-9a-fA-F]{3,8}$/;

/**
 * Colour FUNCTIONS, by lexed function name. `color-mix()` and `light-dark()` are deliberately
 * absent: both take other colours as arguments, so a legitimate `color-mix(in srgb, var(--a),
 * var(--b))` contains no literal, and any literal inside one is found by descending into it.
 */
const COLOR_FUNCTIONS = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color']);

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

/**
 * ── A BOUNDED REGISTRY OF CSS-VALUED ATTRIBUTES ────────────────────────────────────────────
 *
 * Attributes whose value IS a CSS value, and may therefore be lexed as one. Applied identically
 * by the markup scanner and the TSX scanner, so the two agree about what a colour is.
 *
 * It exists because the alternative was lexing EVERY attribute, which reported `class="red"`,
 * `title="rgb(1,2,3)"` and `data-state="green"` as colour literals. But a registry is an
 * enumeration, and an enumeration has been the defect in this lint more times than any other
 * single cause — so this one is deliberately BOUNDED AND DECLARED rather than grown toward
 * completeness. What it is, exactly:
 *
 *   * It covers the COMMON CSS-valued attributes listed below. It is not, and does not claim to
 *     be, the full SVG 2 presentation-attribute set.
 *   * SVG ANIMATION attributes are NOT handled. In `<animate attributeName="fill" from="red"/>`
 *     the colour lives in `from`/`to`/`values`/`by`, and whether those are colours at all
 *     depends on `attributeName` — which needs target-aware resolution across elements. That is
 *     out of scope for a source lint.
 *   * It is name-based, not ELEMENT-aware. An attribute from this list on an element where it
 *     is not a presentation attribute (`<div fill="red">`) is reported anyway. Answering that
 *     properly is the same target-aware problem.
 *   * A legacy presentational attribute whose value is not a CSS value can therefore produce a
 *     FALSE POSITIVE. `background` — the legacy HTML body/table image URL — was in this list and
 *     has been removed for exactly that reason.
 *
 *     THE ALLOWLIST IS NOT A REMEDY FOR THESE, and an earlier revision of this comment said it
 *     was. `color-allowlist.json` admits only syntax-theme CSS paths, so a markup or TSX finding
 *     cannot be allowlisted at all — a pointer to a door that does not exist, which is worse
 *     than saying there is none. Remediation is a SOURCE change (write the value so it is not a
 *     bare colour) or a reviewed change to this code-owned registry. The allowlist staying
 *     narrow is deliberate: widening it to markup would reopen the configuration-widening hole
 *     that complete functional-colour capture was introduced to close.
 *
 * The enforcing control for everything this misses is the runtime CSP (APTR-99), as it is for
 * every other frontier in this file. Growing this list toward SVG 2 completeness inside a build
 * lint is unbounded work at a layer that is not the security boundary.
 *
 * Each uncovered case above is pinned by a test that RECORDS current behaviour. If one starts
 * being detected, that test fails and says so — widen the claim here and delete the recording.
 */
const CSS_VALUED_ATTRIBUTES = new Set([
  'style', // a declaration list — also an inline-style violation in its own right
  // SVG/CSS presentation attributes that take, or can carry, a <color>
  'color', 'fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'solid-color',
  'background-color', 'border-color', 'outline-color', 'caret-color',
  'text-decoration', 'text-decoration-color', 'text-emphasis-color', 'column-rule-color',
  'bgcolor', // legacy HTML presentation attribute whose value IS a colour
]);

/**
 * Normalise an attribute name for registry lookup.
 *
 * JSX spells several of these in camelCase (`stopColor`, `textDecoration`) while markup uses
 * the hyphenated CSS name. Both must reach the same registry entry, or the two scanners would
 * disagree about the same attribute depending only on which file it appeared in.
 */
function normalizeAttributeName(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function isCssValuedAttribute(name) {
  return CSS_VALUED_ATTRIBUTES.has(normalizeAttributeName(name));
}

/** A valid CSS property name: a custom property, or an ident with an optional vendor prefix. */
const VALID_PROPERTY_NAME = /^(--[A-Za-z0-9_-]+|-{0,2}[A-Za-z_][A-Za-z0-9_-]*)$/;

/**
 * CSS-wide keywords. A value made only of these and `var()` references declares no literal.
 */
const CSS_WIDE_KEYWORDS = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);

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

/* ── VALUES ARE LEXED, NOT PATTERN-MATCHED ────────────────────────────────────────────────
 *
 * postcss parses a stylesheet into rules and declarations. It does NOT tokenize a declaration's
 * VALUE — `decl.value` is a raw string. An earlier revision ran regexes over that string and
 * claimed the same "correct by construction" property the TypeScript scanning genuinely has.
 * It did not hold, and a reviewer produced the consequences: `content: "1e+3px"` reported a
 * dimension that is a STRING, and any quoted text shaped like a colour or a font was misread.
 *
 * Values now go through `postcss-value-parser` — the conventional value lexer, MIT, zero
 * dependencies, and a devDependency only, so it never reaches the shipped bundle. With a real
 * token stream:
 *   * a `string` node is DATA and is skipped, so `content: "…"` and quoted URLs are inert;
 *   * a colour function is captured COMPLETE (`rgb(1, 2, 3)`), not normalised to `rgb()`;
 *   * a dimension is read by `valueParser.unit()`, which implements the CSS number grammar —
 *     so the exponent and case handling is the lexer's problem, not a regex's;
 *   * `var(--violet-500)` yields the word `--violet-500`, which is not a named colour, so the
 *     token layer's own vocabulary no longer needs stripping to avoid a false positive.
 */

/**
 * Lex a CSS value and return the complete literals in it.
 *
 * @param {string} value a CSS declaration value or at-rule params
 * @param {{ named: boolean }} options `named` enables the CSS-named-colour check
 * @returns {{ colors: string[], dimensions: string[], failed: boolean }} `colors` entries are
 *   COMPLETE literals — `rgb(1, 2, 3)`, not `rgb()` — because the allowlist matches on them by
 *   strict equality, and a normalised literal would let one entry suppress every other value of
 *   the same function in that file. `failed` is true if the value could not be lexed at all,
 *   which the caller must treat as an error rather than a clean result.
 */
export function findValueLiterals(value, { named }) {
  const colors = [];
  const dimensions = [];

  let parsed;
  try {
    parsed = valueParser(value);
  } catch {
    return { colors, dimensions, failed: true };
  }

  const visit = (nodes) => {
    for (const node of nodes) {
      // A string is DATA. `content: "#ff0000"` declares no colour, and treating it as one is
      // the false positive that gets a rule switched off.
      if (node.type === 'string' || node.type === 'comment') continue;

      if (node.type === 'function') {
        const name = node.value.toLowerCase();
        if (COLOR_FUNCTIONS.has(name)) {
          colors.push(valueParser.stringify(node));
          continue; // the arguments ARE the literal; do not also report them separately
        }
        if (name === 'url') continue; // a URL is an address, not a style value
        visit(node.nodes);
        continue;
      }

      if (node.type !== 'word') continue;
      const word = node.value;

      if (HEX_WORD.test(word)) { colors.push(word); continue; }
      if (named && NAMED_COLORS.has(word.toLowerCase())) { colors.push(word); continue; }

      const unit = valueParser.unit(word);
      if (unit && unit.unit.toLowerCase() === 'px') dimensions.push(word);
    }
  };

  visit(parsed.nodes);
  return { colors, dimensions, failed: false };
}

/**
 * Colour literals in FREE TEXT — a TypeScript string, a JSON string, a markup attribute.
 *
 * These are NOT CSS values, so a CSS value lexer is the wrong tool and this is honest pattern
 * matching, stated as such. Functional colours are captured with a balanced-paren scan so the
 * reported literal is complete rather than truncated at the first `)`.
 *
 * The allowlist cannot interact with anything found here: its path registry admits only CSS
 * files, so a text-mode finding can never be suppressed by configuration.
 */
export function findColorLiteralsInText(text) {
  const found = [];
  for (const match of text.matchAll(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z])/g)) found.push(match[0]);

  for (const match of text.matchAll(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/gi)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    let depth = 0;
    for (let i = open; i < text.length; i += 1) {
      if (text[i] === '(') depth += 1;
      else if (text[i] === ')') {
        depth -= 1;
        if (depth === 0) { found.push(text.slice(match.index, i + 1)); break; }
      }
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

/* ── FONT DETECTION ───────────────────────────────────────────────────────────────────────
 *
 * The previous implementation was wrong in BOTH directions, which is the worst combination: it
 * required a quote or a generic keyword, so `font-family: Inter` and `--body-font: Inter` were
 * missed; and it treated ANY quoted value as a font stack, so `content: "hello"` and quoted
 * URLs were reported. False positives are what get a rule switched off, so they cost more than
 * the misses did.
 *
 * The rule is now keyed on the PROPERTY, and the value is lexed:
 *   * `font-family` — a literal unless the value is made only of `var()` and CSS-wide keywords.
 *     That catches an unquoted family, which is the case that was being missed.
 *   * a CUSTOM PROPERTY — a literal if it names a generic family (`sans-serif`, `monospace`, …),
 *     which is decidable from the value; or if its NAME says font and its value is not pure
 *     indirection, which is how `--body-font: Inter` is caught.
 *   * anything else — not a font declaration, so not this rule's business. `content`,
 *     `background`, `grid-template-areas` and every other string-valued property are silent.
 */

/**
 * The FALLBACK nodes of a `var()`, i.e. everything after the first comma.
 *
 * `var(--font, sans-serif)` declares a font stack: if the custom property is not set, the
 * fallback is what renders. Treating any `var()` as pure indirection without looking inside it
 * meant a fallback could carry a literal past a fail-closed rule.
 */
function varFallback(node) {
  const comma = node.nodes.findIndex((n) => n.type === 'div' && n.value === ',');
  return comma === -1 ? [] : node.nodes.slice(comma + 1);
}

/** Is every meaningful token a `var()` or a CSS-wide keyword — i.e. does it declare nothing? */
function isPureIndirection(nodes) {
  const meaningful = nodes.filter((n) => n.type !== 'space' && n.type !== 'div' && n.type !== 'comment');
  if (meaningful.length === 0) return true;
  return meaningful.every((n) => {
    if (n.type === 'word') return CSS_WIDE_KEYWORDS.has(n.value.toLowerCase());
    if (n.type === 'function' && n.value.toLowerCase() === 'var') {
      const fallback = varFallback(n);
      // No fallback declares nothing. A fallback is a real value and is judged as one,
      // recursively, so `var(--a, var(--b, Inter))` is not pure indirection either.
      return fallback.length === 0 || isPureIndirection(fallback);
    }
    return false;
  });
}

function namesAGenericFamily(parsed) {
  let found = false;
  parsed.walk((node) => {
    if (node.type === 'word' && GENERIC_FONT_FAMILIES.has(node.value.toLowerCase())) found = true;
    return true;
  });
  return found;
}

/**
 * @returns {string | null} a detail string when the declaration carries a font literal.
 */
function fontLiteralDetail(decl) {
  const prop = decl.prop;
  const lower = prop.toLowerCase();
  if (lower !== 'font-family' && lower !== 'font' && !prop.startsWith('--')) return null;

  let parsed;
  try {
    parsed = valueParser(decl.value);
  } catch {
    return null; // the caller reports an unlexable value in its own right
  }

  if (lower === 'font-family') {
    return isPureIndirection(parsed.nodes) ? null : `${prop}: ${decl.value}`;
  }

  if (lower === 'font') {
    // PARTIAL, and recorded as a non-goal: the shorthand also carries size, weight and
    // line-height, so "any non-var token" would fire on every legitimate use. Only a quoted
    // family or a generic family is treated as a signal here.
    const hasQuotedFamily = parsed.nodes.some((n) => n.type === 'string');
    return hasQuotedFamily || namesAGenericFamily(parsed) ? `${prop}: ${decl.value}` : null;
  }

  // A custom property.
  if (namesAGenericFamily(parsed)) return `${prop}: ${decl.value}`;
  if (/font/i.test(prop) && !isPureIndirection(parsed.nodes)) return `${prop}: ${decl.value}`;
  return null;
}


/* ── TypeScript ──────────────────────────────────────────────────────────────────────────── */

/**
 * The literal node behind a JSX attribute value, if the value is STATICALLY KNOWN.
 *
 * `fill="red"`, `fill={'red'}`, a no-substitution template, `fill={('red')}` and
 * `fill={'red' as string}` are the same value written five ways, and a lint that treats them
 * differently is telling people the rule is about syntax when it is about the value. Returns
 * the underlying literal (which carries `.text`), or undefined when the value is dynamic.
 *
 * A template WITH substitutions is not static and is deliberately not unwrapped.
 */
function staticStringNode(node) {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node;
  if (ts.isJsxExpression(node)) return staticStringNode(node.expression);
  if (ts.isParenthesizedExpression(node)) return staticStringNode(node.expression);
  if (ts.isAsExpression(node)) return staticStringNode(node.expression);
  if (ts.isSatisfiesExpression && ts.isSatisfiesExpression(node)) return staticStringNode(node.expression);
  if (ts.isTypeAssertionExpression && ts.isTypeAssertionExpression(node)) return staticStringNode(node.expression);
  return undefined;
}

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

  /** Literal nodes already reported as a presentation attribute's CSS value. */
  const claimedByPresentationAttribute = new Set();

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

    /* A JSX PRESENTATION ATTRIBUTE is a CSS value, exactly as it is in markup. Routed through
       the same lexer so the two scanners agree — `<circle fill="red" />` in a .tsx file and the
       same element in an .svg file must reach the same verdict.

       This handles the EXPRESSION forms too. An earlier revision unwrapped only a direct
       `StringLiteral`, so `fill={'red'}`, a no-substitution template, `fill={('red')}` and
       `fill={'red' as string}` all bypassed the lexer and fell through to the free-text
       scanner, which skips named colours — while the identical SVG markup was rejected. Every
       one of those is entirely STATIC; "static" is the property that matters here, not
       "spelled without braces". */
    if (ts.isJsxAttribute(node) && isCssValuedAttribute(identifierName(node.name) ?? '')) {
      const valueNode = staticStringNode(node.initializer);
      if (valueNode) {
        const attribute = identifierName(node.name) ?? '';
        // Claim the node so the free-text scanner below does not report the same value again.
        // Recorded by NODE rather than by parent shape, so any wrapper depth is covered.
        claimedByPresentationAttribute.add(valueNode);
        for (const literal of findValueLiterals(valueNode.text, { named: true }).colors) {
          findings.push(finding('color-literal', relPath, lineOf(node), `${attribute}="${literal}"`, literal));
        }
      }
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

    /* style-block — `createElement('style')` called as a BARE IDENTIFIER, which the
       property-access branch below cannot see. `import { createElement } from 'react'` and
       `const { createElement } = document` both produce this shape. */
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const callee = node.expression.text;
      if (callee === 'createElement' || callee === 'createElementNS') {
        const tagArg = node.arguments[callee === 'createElementNS' ? 1 : 0];
        if (tagArg && ts.isStringLiteral(tagArg) && tagArg.text.toLowerCase() === 'style') {
          findings.push(finding('style-block', relPath, lineOf(node), `\`${callee}('style')\``));
        }
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

    // A presentation attribute's value was already lexed above as the CSS value it is; running
    // the free-text scanner over it as well would report the same value twice.
    if (literalText !== undefined && !claimedByPresentationAttribute.has(node)) {
      // Free text, not a CSS value — pattern matching, and the header says so. Named colours
      // are deliberately not checked here; see NON-GOALS.
      for (const literal of findColorLiteralsInText(literalText)) {
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

  /**
   * Is this node inside a style rule, however many at-rules sit between?
   *
   * The ANCESTOR chain, not the immediate parent. Checking only the parent let a disallowed
   * at-rule hide one level down — `.x { @media (…) { @starting-style { … } } }` — and a
   * blockless `@layer` in that position swallowed a declaration with no finding at all. An
   * allowed conditional does not stop being inside a style rule just by being allowed.
   */
  const insideStyleRule = (node) => {
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (parent.type === 'rule') return true;
    }
    return false;
  };

  /** Lex a value, reporting a failure as an ERROR rather than as a clean result. */
  const literalsIn = (value, node, what) => {
    const result = findValueLiterals(value, { named: true });
    if (result.failed) {
      errors.push(`${relPath}:${lineOf(node)}: ${what} could not be lexed as a CSS value.`);
    }
    return result;
  };

  // ── Well-formedness. postcss ACCEPTS a great deal that is not CSS, and an accepted-but-wrong
  // at-rule can swallow the declarations that follow it, so they are never walked below.
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

    if (insideStyleRule(atRule) && !AT_RULES_ALLOWED_INSIDE_A_STYLE_RULE.has(name)) {
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

    if (!VALID_PROPERTY_NAME.test(decl.prop)) {
      findings.push(finding('malformed-css', relPath, lineOf(decl), `\`${decl.prop}\` is not a valid property name`));
    }

    if (prop === 'forced-color-adjust' && decl.value.trim().toLowerCase() === 'none') {
      findings.push(finding(
        'forced-color-none', relPath, lineOf(decl), "forced-color-adjust: none defeats the user's own palette",
      ));
    }

    if (isTokenLayer) return;

    const { colors, dimensions } = literalsIn(decl.value, decl, `\`${decl.prop}\``);

    for (const literal of colors) {
      findings.push(finding('color-literal', relPath, lineOf(decl), `${decl.prop}: ${literal}`, literal));
    }

    const font = fontLiteralDetail(decl);
    if (font) findings.push(finding('font-literal', relPath, lineOf(decl), font));

    if (dimensions.length > 0 && !hasDimensionReason(decl)) {
      findings.push(finding(
        'dimension-literal', relPath, lineOf(decl),
        `${decl.prop}: ${dimensions.join(', ')} — take it from the token layer, or record why it `
        + 'is optical with a `/* dimension-literal: … */` comment on the declaration',
      ));
    }
  });

  if (!isTokenLayer) {
    root.walkAtRules((atRule) => {
      const params = atRule.params ?? '';
      const { colors, dimensions } = literalsIn(params, atRule, `@${atRule.name} params`);

      for (const literal of colors) {
        findings.push(finding('color-literal', relPath, lineOf(atRule), `@${atRule.name} ${literal}`, literal));
      }

      // At-rule params are scanned for dimensions as well as colours. A breakpoint is the
      // common case, and it legitimately CANNOT be a token: `var()` does not resolve inside a
      // media condition. So a breakpoint takes the same inline reason as any other optical
      // literal, which at least puts the number and its justification in the same place.
      if (dimensions.length > 0 && !hasDimensionReason(atRule)) {
        findings.push(finding(
          'dimension-literal', relPath, lineOf(atRule),
          `@${atRule.name} ${dimensions.join(', ')} — a media condition cannot read a custom property, `
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
      for (const literal of findColorLiteralsInText(value)) {
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
      // ONLY a presentation attribute is a CSS value, so only one is lexed as such. A named
      // colour is in scope here exactly as it is in a stylesheet — but `class="red"` is a class
      // name, not a hue.
      if (isCssValuedAttribute(name)) {
        for (const literal of findValueLiterals(value, { named: true }).colors) {
          findings.push(finding('color-literal', relPath, line, `${name}="${literal}"`, literal));
        }
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
