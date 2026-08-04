#!/usr/bin/env node
// assert-svg-safe — the SVG sanitization gate for Aperture's checked-in vector assets.
//
// WHY THIS IS A SECURITY GATE AND NOT A STYLE CHECK
// -------------------------------------------------
// Everything under the scanned directories is rendered on the PUBLIC MIRROR and served to
// browsers. A README renders `assets/banner.svg` through an <img>, which is inert — but the
// same file is one click away from being opened directly, where it is a full document with
// script execution, external subresource loading, and same-origin access to whatever served
// it. `client/public/favicon.svg` is copied verbatim into the build output and served by the
// app. So an asset that can carry a <script>, an event handler, or an external reference is an
// XSS and an egress vector, not a lint finding.
//
// HOW IT DIFFERS FROM THE OTHER SCANNERS IN THIS DIRECTORY, AND WHY IT CAN CLAIM MORE
// -----------------------------------------------------------------------------------
// `assert-no-external-hosts.mjs` and `adherence-lint.mjs` both document a PARTIAL hand-written
// HTML/SVG scanner: an attribute value containing `>` desynchronizes them, and behaviour after
// that point is unmodelled. That limitation is inherent to HTML, where attribute values may be
// unquoted and error recovery is part of the language.
//
// SVG is XML, and XML is not permissive. Attribute values are ALWAYS quoted, tags always
// balance, and there is no error recovery. This scanner therefore parses the grammar strictly
// and TREATS ANY DEVIATION AS A FAILURE rather than recovering from it. The `>`-in-an-attribute
// case that desynchronizes the other two is handled correctly here, because the tokenizer is in
// a quoted-value state and a `>` there is just a character. That is why this file can state a
// stronger guarantee than its neighbours — but only over input it fully parsed, which is why an
// unparseable asset is a FAILURE and never a skip.
//
// It also decodes XML character references (`&#x3c;`, `&#60;`, and the five predefined
// entities) BEFORE inspecting a value, so a scheme or a reference written in escaped form is
// caught. That closes, for this scanner only, the character-reference gap the egress lint
// documents as a non-goal.
//
// THE REGISTRIES ARE ALLOWLISTS, ON PURPOSE
// -----------------------------------------
// The item this implements asked for `<script>`, `<foreignObject>`, `on*` handlers, external
// `href`/`xlink:href`, and embedded rasters to be REJECTED. Implemented as a denylist, that
// check would pass forever on the next dangerous construct SVG gains — and SVG has a long
// history of gaining them (`<use>` resolving an external document, `<animate>` retargeting an
// attribute, `<set attributeName="href">`). Enumeration is the failure mode.
//
// So the check is inverted. An element or an attribute is permitted only if it appears in a
// code-owned registry below. `<script>` and `<foreignObject>` fail because they are not in the
// element registry; `onload` fails because it is not in the attribute registry. Both also have
// an explicit named rule, purely so the ERROR MESSAGE names the actual hazard instead of saying
// "unknown attribute" — the diagnosis is a denylist, the ENFORCEMENT is not. A test proves the
// allowlist alone is sufficient by rejecting a construct that has no named rule at all.
//
// Widening a registry is a source change a reviewer approves. There is no configuration file,
// no allowlist JSON, no pragma, and no environment variable that turns a rule off.
//
// SCOPE — what this does NOT do
// -----------------------------
//   * It does not render. It cannot tell you an asset is visually correct, legible at its
//     minimum size, or readable on a light page. `docs/BRAND.md` states those rules and a human
//     checks them.
//   * It does not validate SVG semantics. A `d` attribute containing nonsense path data is
//     well-formed XML with an allowlisted attribute, and passes.
//   * It is not the runtime egress control. This gate stops a hazard from being COMMITTED; the
//     CSP the backend serves is what stops one from ACTING.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

/**
 * Directories scanned, repo-relative. Both ship: `assets/` renders on the forge and the public
 * mirror, `client/public/` is copied verbatim into the build output and served by the app.
 */
const SCAN_DIRS = ['assets', 'client/public'];

/**
 * Elements permitted in a checked-in Aperture asset.
 *
 * Derived from what the current asset set actually uses, plus a small margin of statically
 * inert drawing and gradient elements. Deliberately absent, and absent by DESIGN rather than by
 * oversight: `script`, `foreignObject`, `image`, `animate`/`animateTransform`/`animateMotion`/
 * `set` (they can retarget an attribute at runtime, defeating a static check on that
 * attribute), `a`, `iframe`, `audio`, `video`, `handler`, and every filter primitive
 * (`filter`/`fe*` — `feImage` resolves an external document, and no current asset needs one:
 * BRAND.md's elevation system is gradients and glow, not filters).
 */
const ALLOWED_ELEMENTS = new Set([
  'svg', 'g', 'defs', 'title', 'desc', 'style',
  'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path',
  'text', 'tspan',
  'clipPath', 'mask', 'marker', 'symbol', 'pattern', 'use',
  'linearGradient', 'radialGradient', 'stop',
]);

/**
 * Attributes permitted on any element.
 *
 * Name-based, not element-aware: `cx` on a `<rect>` is permitted here and simply ignored by a
 * renderer. Element-aware validation would be a schema validator, which is a different tool,
 * and the security property this gate asserts does not depend on it.
 *
 * THIS IS THE ONLY ANSWER TO "IS THIS ATTRIBUTE PERMITTED". An earlier revision resolved
 * reference-bearing attributes through a second registry that ran FIRST, so `src`, `data`,
 * `action` and `formaction` were admitted by the reference path without ever being checked
 * against this set — two registries that disagreed, with the looser one winning. Reference
 * attributes are now listed here like everything else, and the fragment check on their VALUE is
 * applied AFTER admission rather than instead of it.
 *
 * `style` is deliberately ABSENT. It is the one attribute whose value is a CSS grammar, and
 * checking a CSS grammar correctly means tokenizing escapes (`u\72l(…)`) and comments
 * (`u/**\/rl(…)`) forever. Every current asset expresses its paint through presentation
 * attributes, so the attribute is simply not permitted and the whole class of evasion goes with
 * it. The `<style>` ELEMENT is still permitted — the wordmark's `prefers-color-scheme` rule
 * needs it — but its body is validated against a deliberately tiny grammar (`validateStylesheet`).
 */
const ALLOWED_ATTRIBUTES = new Set([
  // structure / identity
  'id', 'class', 'xmlns', 'xmlns:xlink', 'version', 'viewBox', 'preserveAspectRatio',
  'width', 'height', 'x', 'y', 'transform',
  // references — admitted here, then value-checked as a same-document fragment below
  'href', 'xlink:href',
  // geometry
  'cx', 'cy', 'r', 'rx', 'ry', 'd', 'x1', 'y1', 'x2', 'y2', 'points', 'pathLength',
  // paint
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-opacity', 'stroke-width',
  'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset',
  'stroke-miterlimit', 'opacity', 'color', 'paint-order', 'shape-rendering',
  'vector-effect', 'clip-path', 'clip-rule', 'mask', 'marker-start', 'marker-mid', 'marker-end',
  // gradients / patterns / markers
  'gradientUnits', 'gradientTransform', 'spreadMethod', 'offset', 'stop-color', 'stop-opacity',
  'fx', 'fy', 'fr', 'clipPathUnits', 'maskUnits', 'maskContentUnits',
  'patternUnits', 'patternContentUnits', 'patternTransform',
  'markerWidth', 'markerHeight', 'markerUnits', 'refX', 'refY', 'orient',
  // type
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'font-stretch',
  'letter-spacing', 'word-spacing', 'text-anchor', 'dominant-baseline', 'alignment-baseline',
  'text-decoration', 'text-rendering', 'dx', 'dy', 'writing-mode', 'white-space',
  // accessibility
  'role', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-hidden',
  'xml:lang', 'xml:space', 'lang',
  // <style type="text/css" media="...">
  'type', 'media',
]);

/**
 * Attributes whose value is a reference (an IRI). A value here must be a same-document
 * fragment. `<use xlink:href="#glyph">` is legitimate and permitted; anything resolving off the
 * document is not.
 */
const IRI_ATTRIBUTES = new Set(['href', 'xlink:href']);

/**
 * Named hazards among attributes. Like the element map, these produce a better MESSAGE — they
 * do not admit or reject anything. Every name here is absent from ALLOWED_ATTRIBUTES, which is
 * what actually rejects it, and a test asserts that invariant so the two cannot drift.
 */
const NAMED_HAZARD_ATTRIBUTES = new Map([
  ['style', 'its value is a CSS grammar, which cannot be checked without tokenizing escapes and comments correctly forever; use presentation attributes'],
  ['src', 'it resolves a subresource'],
  ['data', 'it resolves an object subresource'],
  ['action', 'it is a form submission target'],
  ['formaction', 'it is a form submission target'],
  ['xlink:base', 'it rewrites how every other reference in the document resolves'],
  ['xlink:actuate', 'it controls when a reference is fetched'],
]);

/**
 * Functions permitted inside an attribute value. Anything else that looks like `name(` fails.
 *
 * This is a positive grammar, and it replaces a substring test for the literal text `url(`.
 * That test was defeated by any equivalent CSS spelling — `u\72l(…)` via an escape, or
 * `u/**\/rl(…)` via a comment — which meant a value could carry an external reference while the
 * gate reported nothing. Backslashes and comments are now rejected outright in an attribute
 * value, and every `(` must be preceded by a name from this set.
 */
const ALLOWED_VALUE_FUNCTIONS = new Set([
  'url',
  'translate', 'translatex', 'translatey', 'rotate', 'scale', 'scalex', 'scaley',
  'matrix', 'skewx', 'skewy',
]);

/** Named hazards. These exist for the MESSAGE only — enforcement is the allowlists above. */
const NAMED_HAZARD_ELEMENTS = new Map([
  ['script', 'executes JavaScript when the asset is opened directly'],
  ['foreignobject', 'embeds arbitrary HTML, including <script> and <iframe>'],
  ['iframe', 'embeds an external document'],
  ['image', 'loads an external or embedded raster subresource'],
  ['feimage', 'resolves an external document as a filter input'],
  ['a', 'makes the asset navigable, including to an external scheme'],
  ['animate', 'can retarget an attribute at runtime, defeating a static check on it'],
  ['animatetransform', 'can retarget an attribute at runtime'],
  ['animatemotion', 'can retarget an attribute at runtime'],
  ['set', 'can assign an attribute at runtime, including href'],
  ['handler', 'binds an event handler'],
]);

/**
 * URI schemes that are never acceptable in an asset, checked after character-reference decoding
 * and after whitespace/control-character stripping.
 *
 * `data:` covers the item's "embedded raster" requirement and generalizes past it — a
 * `data:image/png` payload and a `data:text/html` payload are the same construct, and only one
 * of them is a raster. Checking the SCHEME rather than the media type is why the wider case is
 * covered by the narrower requirement.
 */
const FORBIDDEN_SCHEMES = ['javascript:', 'data:', 'vbscript:', 'file:', 'blob:'];

// ---------------------------------------------------------------------------------------
// XML character references
// ---------------------------------------------------------------------------------------

const PREDEFINED_ENTITIES = new Map([
  ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"],
]);

/**
 * Decode XML character references in an attribute value.
 *
 * Returns `{ value }` or `{ error }`. An UNKNOWN entity is an error, not a pass-through: an
 * undeclared entity is not well-formed XML, and silently leaving `&evil;` in place would let a
 * document with a custom entity declaration (which the DOCTYPE rule already rejects) smuggle a
 * value past inspection. Fail closed.
 */
function decodeCharacterReferences(raw) {
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const amp = raw.indexOf('&', i);
    if (amp === -1) { out += raw.slice(i); break; }
    out += raw.slice(i, amp);
    const semi = raw.indexOf(';', amp);
    if (semi === -1) {
      return { error: `unterminated entity reference starting at "${raw.slice(amp, amp + 12)}"` };
    }
    const body = raw.slice(amp + 1, semi);
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const digits = body.slice(2);
      if (!/^[0-9a-fA-F]+$/.test(digits)) {
        return { error: `malformed hexadecimal character reference "&${body};"` };
      }
      const decoded = fromXmlCodePoint(Number.parseInt(digits, 16), body);
      if (decoded.error) return decoded;
      out += decoded.value;
    } else if (body.startsWith('#')) {
      const digits = body.slice(1);
      if (!/^[0-9]+$/.test(digits)) {
        return { error: `malformed decimal character reference "&${body};"` };
      }
      const decoded = fromXmlCodePoint(Number.parseInt(digits, 10), body);
      if (decoded.error) return decoded;
      out += decoded.value;
    } else if (PREDEFINED_ENTITIES.has(body)) {
      out += PREDEFINED_ENTITIES.get(body);
    } else {
      return {
        error: `unknown entity reference "&${body};" — only the five predefined XML entities `
          + 'and numeric character references are permitted',
      };
    }
    i = semi + 1;
  }
  return { value: out };
}

/**
 * Decode one numeric character reference, or REJECT it.
 *
 * An earlier revision substituted U+FFFD for anything it could not decode. That is a lossy
 * repair standing in for a rejection: `&#0;`, `&#x1;`, a lone surrogate, `&#xFFFE;` and
 * anything above `0x10FFFF` are all ill-formed XML, and quietly turning them into a valid
 * replacement character produced a well-formed thing that was NOT what the file contained —
 * while a gate whose contract is "an unparseable asset fails" reported nothing.
 *
 * SUBSTITUTION IS NOT VALIDATION. When the input is malformed, fail on it.
 *
 * The permitted set is the XML 1.0 `Char` production, exactly:
 *   #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
 * Note that U+FFFD itself is a legitimate character and still decodes — it is only
 * SYNTHESIZING one that is forbidden.
 */
function isXmlChar(code) {
  return code === 0x9 || code === 0xa || code === 0xd
    || (code >= 0x20 && code <= 0xd7ff)
    || (code >= 0xe000 && code <= 0xfffd)
    || (code >= 0x10000 && code <= 0x10ffff);
}

/**
 * Find the first character not permitted by the XML `Char` production, or `null`.
 *
 * Iterates by CODE POINT, so an astral character is one unit and a LONE surrogate — which is
 * not a code point at all — is reported rather than silently paired.
 */
function findInvalidChar(text) {
  for (let i = 0; i < text.length;) {
    const code = text.codePointAt(i);
    if (!isXmlChar(code)) return { code, index: i };
    i += code > 0xffff ? 2 : 1;
  }
  return null;
}

function fromXmlCodePoint(code, body) {
  const reject = (why) => ({
    error: `character reference "&${body};" is ${why}, which is not permitted by the XML `
      + 'Char production. It is rejected rather than replaced: substituting U+FFFD would '
      + 'produce a well-formed document that is not the one on disk.',
  });

  if (!Number.isFinite(code)) return reject('not a number');
  if (code > 0x10ffff) return reject('above the maximum Unicode code point');
  if (code >= 0xd800 && code <= 0xdfff) return reject('a surrogate code point');
  // The SAME predicate that validates literal characters. An earlier revision checked the
  // encoded spelling here and never checked the literal one, so `&#1;` was rejected while a raw
  // 0x01 byte in the same position was accepted — one forbidden character, two spellings, one
  // checked. The property is about the CHARACTER, not about how it was written.
  if (!isXmlChar(code)) return reject(`the code point U+${code.toString(16).toUpperCase().padStart(4, '0')}`);

  return { value: String.fromCodePoint(code) };
}

// ---------------------------------------------------------------------------------------
// Strict XML tokenizer
// ---------------------------------------------------------------------------------------

const NAME_START = /[A-Za-z_:]/;
const NAME_CHAR = /[-A-Za-z0-9_:.]/;
/**
 * XML's `S` production — the ONLY four characters that are whitespace in markup:
 *
 *   S ::= (#x20 | #x9 | #xD | #xA)+
 *
 * An earlier revision used JavaScript's `/\s/` and `String.prototype.trim()`. Those accept
 * U+00A0, U+2028, U+2029, U+FEFF and more, so `<svg\u00A0width="1">` and a document with a
 * U+FEFF before its root element both parsed as well-formed when they are not.
 *
 * This is the third finding in a row with the same shape, and the generalisation is worth
 * stating where the next person will read it: WHEN A SPECIFICATION DEFINES A CHARACTER CLASS,
 * DEFINE IT — do not reach for the host language's approximation. `String.fromCodePoint`
 * substituting U+FFFD, `readFileSync(…, 'utf8')` repairing malformed bytes, and `\s` meaning
 * Unicode whitespace are all the same bug: the surrounding code was strict, the borrowed
 * primitive was lenient, and the leniency arrived pre-installed and invisible.
 */
const XML_S = /[\u0020\u0009\u000A\u000D]/;

/** Trim using XML's `S`, not JavaScript's notion of whitespace. */
function xmlTrim(text) {
  let start = 0;
  let end = text.length;
  while (start < end && XML_S.test(text[start])) start += 1;
  while (end > start && XML_S.test(text[end - 1])) end -= 1;
  return text.slice(start, end);
}

/**
 * CSS's white space (CSS Syntax Level 3) — space, tab, line feed, form feed, carriage return.
 * Deliberately spelled out for the same reason as `XML_S`: it is a DIFFERENT set from XML's
 * (it includes U+000C) and a different set again from JavaScript's, and borrowing either
 * neighbour's definition would be the same mistake in a new place.
 */
const CSS_WS = /[\u0020\u0009\u000A\u000C\u000D]/;

function cssTrim(text) {
  let start = 0;
  let end = text.length;
  while (start < end && CSS_WS.test(text[start])) start += 1;
  while (end > start && CSS_WS.test(text[end - 1])) end -= 1;
  return text.slice(start, end);
}

/**
 * Parse an XML document into a flat event list, strictly.
 *
 * Throws on ANY construct it does not fully model, including every one that would make a
 * permissive HTML parser recover: an unquoted attribute value, a mismatched end tag, an
 * unterminated tag/comment/CDATA, a duplicate attribute, a bare attribute, a stray `<` in an
 * attribute value, character data outside the root, and markup after the root closes. Recovery
 * is what makes a scanner partial; refusing to recover is what lets this one claim completeness
 * over what it accepted.
 *
 * A DOCTYPE is rejected outright rather than parsed. It is the entry point for entity expansion
 * and external entity resolution (XXE), no legitimate asset here needs one, and "parse it
 * correctly" is a much larger job than "refuse it".
 */
function parseXml(text) {
  // Done ONCE over the whole document rather than per construct. Checking text, then CDATA,
  // then attribute values separately is how a spelling gets missed — a comment or a tag name
  // would still have been unchecked. One scan over every character has no such edge.
  const invalid = findInvalidChar(text);
  if (invalid) {
    const hex = `U+${invalid.code.toString(16).toUpperCase().padStart(4, '0')}`;
    throw new Error(
      `the literal character ${hex} at offset ${invalid.index} is not permitted by the XML Char `
      + 'production. It is rejected wherever it appears — in text, CDATA, an attribute value, a '
      + 'comment or a name — and rejected identically whether written literally or as a '
      + 'character reference.',
    );
  }

  const events = [];
  const stack = [];
  let i = 0;
  let rootClosed = false;

  const fail = (msg) => { throw new Error(`${msg} (at offset ${i})`); };

  while (i < text.length) {
    if (text[i] !== '<') {
      const next = text.indexOf('<', i);
      const end = next === -1 ? text.length : next;
      const chunk = text.slice(i, end);
      if (stack.length === 0) {
        if (xmlTrim(chunk) !== '') fail('character data outside the root element');
      } else {
        // Character data is held to the same standard as an attribute value. An earlier
        // revision never validated it, so `<title>&undeclared;</title>` and a bare `&` — both
        // ill-formed XML — passed a gate whose stated contract is that an unparseable asset
        // FAILS. Well-formedness is not a property of attributes only.
        const decodedText = decodeCharacterReferences(chunk);
        if (decodedText.error) fail(`in character data: ${decodedText.error}`);
        if (chunk.includes(']]>')) fail('"]]>" in character data is not well-formed XML');
        events.push({ kind: 'text', value: decodedText.value, parent: stack[stack.length - 1] });
      }
      i = end;
      continue;
    }

    if (stack.length === 0 && rootClosed) fail('markup after the root element closed');

    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end === -1) fail('unterminated comment');
      // `--` inside a comment is not well-formed XML. It is also the classic way to make one
      // parser see a comment where another sees markup.
      if (text.slice(i + 4, end).includes('--')) fail('"--" inside a comment is not well-formed XML');
      i = end + 3;
      continue;
    }

    if (text.startsWith('<![CDATA[', i)) {
      if (stack.length === 0) fail('CDATA section outside the root element');
      const end = text.indexOf(']]>', i + 9);
      if (end === -1) fail('unterminated CDATA section');
      // CDATA content is inspected exactly like text, but NOT entity-decoded: by definition it
      // is literal. It is still scanned, because a <style> body inside CDATA is still CSS.
      events.push({ kind: 'text', value: text.slice(i + 9, end), parent: stack[stack.length - 1] });
      i = end + 3;
      continue;
    }

    if (text.startsWith('<?', i)) {
      const end = text.indexOf('?>', i + 2);
      if (end === -1) fail('unterminated processing instruction');
      const target = xmlTrim(text.slice(i + 2, end)).split(XML_S)[0];
      // The XML declaration is the only processing instruction permitted. Any other PI is a
      // renderer-specific instruction this gate does not model, so it fails closed.
      if (target !== 'xml') fail(`processing instruction "<?${target}" is not permitted; only the XML declaration is`);
      if (i !== 0) fail('the XML declaration must be the first thing in the document');
      i = end + 2;
      continue;
    }

    if (text.startsWith('<!', i)) {
      const label = text.slice(i, i + 12).split(/[\u0020\u0009\u000A\u000D>]/)[0];
      fail(
        `"${label}" declaration is not permitted — a DOCTYPE or entity declaration is the entry `
        + 'point for entity expansion and external entity resolution',
      );
    }

    if (text.startsWith('</', i)) {
      let j = i + 2;
      if (!NAME_START.test(text[j] ?? '')) fail('malformed end tag');
      while (j < text.length && NAME_CHAR.test(text[j])) j += 1;
      const name = text.slice(i + 2, j);
      while (j < text.length && XML_S.test(text[j])) j += 1;
      if (text[j] !== '>') fail(`malformed end tag </${name}`);
      const open = stack.pop();
      if (open === undefined) fail(`end tag </${name}> with no open element`);
      if (open !== name) fail(`end tag </${name}> does not match open element <${open}>`);
      if (stack.length === 0) rootClosed = true;
      i = j + 1;
      continue;
    }

    // Start tag.
    let j = i + 1;
    if (!NAME_START.test(text[j] ?? '')) fail('malformed start tag');
    while (j < text.length && NAME_CHAR.test(text[j])) j += 1;
    const name = text.slice(i + 1, j);
    const attributes = [];
    const seen = new Set();

    for (;;) {
      const beforeWs = j;
      while (j < text.length && XML_S.test(text[j])) j += 1;
      if (j >= text.length) fail(`unterminated start tag <${name}`);
      if (text[j] === '>' || text.startsWith('/>', j)) break;
      // XML requires whitespace between attributes. Without this, `a="1"b="2"` would parse.
      if (j === beforeWs) fail(`missing whitespace before an attribute in <${name}>`);
      const nameStart = j;
      if (!NAME_START.test(text[j])) fail(`malformed attribute name in <${name}>`);
      while (j < text.length && NAME_CHAR.test(text[j])) j += 1;
      const attrName = text.slice(nameStart, j);
      while (j < text.length && XML_S.test(text[j])) j += 1;
      if (text[j] !== '=') fail(`attribute "${attrName}" in <${name}> has no value; XML has no bare attributes`);
      j += 1;
      while (j < text.length && XML_S.test(text[j])) j += 1;
      const quote = text[j];
      if (quote !== '"' && quote !== "'") {
        fail(`attribute "${attrName}" in <${name}> has an unquoted value; XML requires quoting`);
      }
      // THIS is the state that makes a `>` inside a value harmless. The tokenizer is looking for
      // the closing quote, not for `>`, so the desynchronization the HTML scanners in this
      // directory document as unmodelled cannot occur here.
      const valueStart = j + 1;
      const valueEnd = text.indexOf(quote, valueStart);
      if (valueEnd === -1) fail(`unterminated value for attribute "${attrName}" in <${name}>`);
      const rawValue = text.slice(valueStart, valueEnd);
      if (rawValue.includes('<')) fail(`"<" in the value of attribute "${attrName}" in <${name}> is not well-formed XML`);
      if (seen.has(attrName)) fail(`duplicate attribute "${attrName}" in <${name}>`);
      seen.add(attrName);
      attributes.push({ name: attrName, rawValue });
      j = valueEnd + 1;
    }

    events.push({ kind: 'element', name, attributes });
    if (text.startsWith('/>', j)) {
      j += 2;
      if (stack.length === 0) rootClosed = true;
    } else {
      stack.push(name);
      j += 1;
    }
    i = j;
  }

  if (stack.length > 0) {
    fail(`unclosed element${stack.length === 1 ? '' : 's'}: ${stack.map((n) => `<${n}>`).join(', ')}`);
  }
  if (!events.some((e) => e.kind === 'element')) {
    throw new Error('no elements — an empty or non-XML file');
  }
  return events;
}

// ---------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------

/**
 * Strip whitespace and control characters before comparing a scheme.
 *
 * A browser strips ASCII whitespace and control characters while parsing a URL, so it honours
 * `java\nscript:` and `data\t:`. Comparing raw text would miss exactly the spellings someone
 * reaches for to evade a check.
 */
function normalizeUri(value) {
  // DELIBERATELY BROADER than XML's S, and this is the one place where broad is correct. The
  // question here is not "what does XML call whitespace" but "what might a consumer IGNORE
  // while parsing a URL". Stripping MORE can only make a forbidden scheme easier to recognise,
  // never harder, so the leniency runs in the safe direction, and a false positive costs a
  // reviewed source change rather than a missed hazard. Do not "fix" this to XML_S for
  // consistency: that would narrow a detection rule to match a well-formedness rule it has
  // nothing to do with.
  //
  // The stripped set, stated exactly, because an earlier revision's comment claimed a class
  // the code did not implement — it said C0 AND C1 while stripping only C0, and C1 was the
  // half that mattered. C0 controls cannot reach here anyway (they are not valid XML `Char`s,
  // so the parser rejects the file first), whereas every C1 control IS a valid `Char`, so
  // `<rect fill="&#x85;javascript:…">` was well-formed, passed the value grammar, and shipped
  // with its scheme unseen. A comment that overstates the mechanism is worse than no comment:
  // it is written precisely to stop the next reader from checking.
  //
  //   U+0000–U+0020  C0 controls and space
  //   U+007F–U+009F  DEL and the C1 controls
  //   \s             JavaScript's Unicode whitespace (U+00A0, U+2028, U+2029, U+FEFF, …)
  return value.replace(/[\s\u0000-\u0020\u007f-\u009f]/g, '').toLowerCase();
}

function checkForbiddenScheme(value, where, findings) {
  const flat = normalizeUri(value);
  for (const scheme of FORBIDDEN_SCHEMES) {
    if (flat.startsWith(scheme) || flat.includes(`,${scheme}`) || flat.includes(`(${scheme}`)) {
      findings.push(`${where}: forbidden "${scheme}" URI. ${
        scheme === 'data:'
          ? 'An embedded payload — raster or otherwise — makes the asset non-auditable, and is how a raster or an HTML document hides inside a vector file.'
          : 'This scheme executes, or resolves outside the document.'
      }`);
      return;
    }
  }
}

/**
 * A reference must be a same-document fragment: `#name`, and nothing else. Not a relative path,
 * not a protocol-relative `//host`, not an absolute URL, not a bare `#`.
 */
function checkFragmentReference(value, where, findings) {
  const trimmed = xmlTrim(value);
  checkForbiddenScheme(trimmed, where, findings);
  if (trimmed.startsWith('#') && trimmed.length > 1) {
    if (!/^#[A-Za-z_][-A-Za-z0-9_.:]*$/.test(trimmed)) {
      findings.push(`${where}: reference "${trimmed}" is not a plain same-document fragment identifier.`);
    }
    return;
  }
  findings.push(
    `${where}: reference "${trimmed}" is not a same-document fragment. `
    + 'Only "#id" is permitted — an external reference makes the asset fetch something when it '
    + 'is opened, which is exactly what a self-contained asset must not do.',
  );
}

/** Is this a fragment identifier, and nothing else? */
function isFragment(value) {
  return /^#[A-Za-z_][-A-Za-z0-9_.:]*$/.test(xmlTrim(value));
}

/**
 * Validate an ATTRIBUTE value against a positive grammar.
 *
 * A backslash or a comment in an attribute value has no legitimate use in these assets and is
 * the entire evasion surface for a substring matcher, so both are rejected outright. After
 * that, every `(` must be introduced by a name in ALLOWED_VALUE_FUNCTIONS, and a `url(` must
 * resolve to a same-document fragment.
 */
function checkAttributeValue(value, where, findings) {
  if (value.includes('\\')) {
    findings.push(
      `${where}: a backslash is not permitted in an attribute value. It is a CSS escape `
      + '(`u\\72l(...)` spells `url(`), and permitting it would mean tokenizing CSS escapes '
      + 'correctly forever in order to keep any other rule honest.',
    );
    return;
  }
  if (value.includes('/*') || value.includes('*/')) {
    findings.push(
      `${where}: a comment is not permitted in an attribute value. It can split a function `
      + 'name (`u/**/rl(...)`) past a matcher that reads the name as literal text.',
    );
    return;
  }

  checkForbiddenScheme(value, where, findings);

  if (/@import/i.test(value)) {
    findings.push(`${where}: "@import" loads an external stylesheet.`);
  }

  for (let k = 0; k < value.length; k += 1) {
    if (value[k] !== '(') continue;
    const nameMatch = /([A-Za-z][A-Za-z0-9-]*)$/.exec(value.slice(0, k));
    const fn = nameMatch ? nameMatch[1].toLowerCase() : '';
    if (!ALLOWED_VALUE_FUNCTIONS.has(fn)) {
      findings.push(
        `${where}: "${fn || '<anonymous>'}(" is not an allowlisted function. Only `
        + `${[...ALLOWED_VALUE_FUNCTIONS].join(', ')} may appear in an attribute value, so a `
        + 'function nobody anticipated fails by default.',
      );
      continue;
    }
    if (fn !== 'url') continue;
    const end = value.indexOf(')', k);
    if (end === -1) {
      findings.push(`${where}: unterminated "url(".`);
      continue;
    }
    const target = cssTrim(value.slice(k + 1, end)).replace(/^['"]|['"]$/g, '');
    checkForbiddenScheme(target, `${where}: url()`, findings);
    if (!isFragment(target)) {
      findings.push(
        `${where}: url("${target}") is not a same-document fragment. A functional IRI in an `
        + 'asset may only reference a gradient, clip path, mask or marker defined in the same file.',
      );
    }
  }
}

/** Find the `}` matching the `{` at `openIdx`. Sound because strings cannot occur here. */
function matchingBrace(css, openIdx) {
  let depth = 0;
  for (let k = openIdx; k < css.length; k += 1) {
    if (css[k] === '{') depth += 1;
    else if (css[k] === '}') {
      depth -= 1;
      if (depth === 0) return k;
    }
  }
  return -1;
}

/**
 * Validate the declarations inside one style rule.
 *
 * A value may contain only the characters a colour, keyword, number or length needs. No
 * parenthesis, quote, backslash, `@` or `&` can appear, so there is no function token, no
 * string token, no escape and no entity reference to check for in the first place.
 */
function validateDeclarations(block, where, findings) {
  if (block.includes('{')) {
    findings.push(`${where}: a nested rule inside a declaration block is not permitted.`);
    return;
  }
  for (const raw of block.split(';')) {
    const decl = cssTrim(raw);
    if (decl === '') continue;
    const match = /^([-A-Za-z][-A-Za-z0-9]*)\s*:\s*([^:;]*)$/.exec(decl);
    if (!match) {
      findings.push(`${where}: "${decl}" is not a "property: value" declaration.`);
      return;
    }
    const value = cssTrim(match[2]);
    if (value === '' || !/^[#A-Za-z0-9%., \t-]+$/.test(value)) {
      findings.push(
        `${where}: the value "${value}" of "${match[1]}" uses a character outside the permitted `
        + 'set. A declaration value may contain only colours, keywords, numbers and lengths — no '
        + 'function, string, escape or entity reference.',
      );
      return;
    }
  }
}

/**
 * Validate a `<style>` body against a deliberately tiny grammar.
 *
 * This is an allowlist of SHAPE, not a denylist of hazards. Rather than hunting for `url(`,
 * `@import` and `expression(` — each of which has equivalent spellings a substring matcher
 * misses — the body must BE a sequence of plain style rules, optionally wrapped in the one
 * at-rule the brand actually uses. Anything else fails, including CSS that is perfectly valid.
 * That is the right trade for a body that only ever needs to set a few fills.
 */
function validateStylesheet(css, where, findings, allowAtRules = true) {
  let i = 0;
  // The documented grammar is "at most ONE optional @media wrapper". An earlier revision
  // permitted any number of siblings, so the implementation and the prose disagreed — the
  // exact drift this epic keeps finding, here between a grammar and its own description. When
  // two things that must agree disagree, tighten to the stricter one rather than pick.
  let mediaWrappers = 0;
  for (;;) {
    while (i < css.length && CSS_WS.test(css[i])) i += 1;
    if (i >= css.length) return;

    if (css[i] === '@') {
      if (!allowAtRules) {
        findings.push(`${where}: an at-rule may not be nested inside another at-rule.`);
        return;
      }
      mediaWrappers += 1;
      if (mediaWrappers > 1) {
        findings.push(
          `${where}: at most ONE "@media (prefers-color-scheme: ...)" wrapper is permitted, and `
          + 'this is wrapper number ' + mediaWrappers + '. The brand uses a single light-mode '
          + 'override; needing more is a signal to reconsider the asset, not to widen the grammar.',
        );
        return;
      }
      const prelude = /^@media\s*\(\s*prefers-color-scheme\s*:\s*(?:light|dark)\s*\)\s*(?=\{)/
        .exec(css.slice(i));
      if (!prelude) {
        findings.push(
          `${where}: the only at-rule permitted is `
          + '"@media (prefers-color-scheme: light|dark)". Anything else — including @import, and '
          + 'including valid CSS — fails.',
        );
        return;
      }
      i += prelude[0].length;
      const close = matchingBrace(css, i);
      if (close === -1) {
        findings.push(`${where}: unbalanced "{" in an @media block.`);
        return;
      }
      validateStylesheet(css.slice(i + 1, close), `${where} @media`, findings, false);
      i = close + 1;
      continue;
    }

    const open = css.indexOf('{', i);
    if (open === -1) {
      findings.push(`${where}: trailing text "${cssTrim(css.slice(i, i + 40))}" is not a rule.`);
      return;
    }
    const selector = css.slice(i, open);
    if (cssTrim(selector) === '' || !/^[.#A-Za-z0-9_\u0020\u0009\u000A\u000C\u000D,>+~:*-]+$/.test(selector)) {
      findings.push(
        `${where}: the selector "${cssTrim(selector)}" uses a character outside the permitted `
        + 'selector set.',
      );
      return;
    }
    const close = matchingBrace(css, open);
    if (close === -1) {
      findings.push(`${where}: unbalanced "{".`);
      return;
    }
    validateDeclarations(css.slice(open + 1, close), where, findings);
    i = close + 1;
  }
}

/** Scan a `<style>` element body. */
function checkStyleBody(css, where, findings) {
  const banned = [
    ['\\', 'a backslash (CSS escape)'],
    ['"', 'a string token'],
    ["'", 'a string token'],
    ['&', 'an entity reference'],
    ['/*', 'a comment'],
  ];
  let clean = true;
  for (const [needle, label] of banned) {
    if (css.includes(needle)) {
      findings.push(
        `${where}: ${label} is not permitted in a <style> body. Each one exists only to spell `
        + 'something as something else, which is what defeats a matcher that reads literal text.',
      );
      clean = false;
    }
  }
  if (!clean) return;
  checkForbiddenScheme(css, where, findings);
  validateStylesheet(css, where, findings);
}

/**
 * Decode a file's bytes as STRICT UTF-8.
 *
 * `readFileSync(file, 'utf8')` silently replaces an invalid byte sequence with U+FFFD. Because
 * U+FFFD is itself a legal XML character, a file containing malformed UTF-8 decoded into a
 * perfectly well-formed document and passed — the same lossy-repair-instead-of-rejection shape
 * as the character-reference bug, one layer further out, with the platform's decoder doing the
 * repairing instead of this script. `fatal: true` makes the decoder throw instead.
 */
const STRICT_UTF8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function checkAsset(relPath, bytes) {
  const findings = [];

  let text;
  try {
    text = STRICT_UTF8.decode(bytes);
    // `ignoreBOM: true` is deliberate. By DEFAULT TextDecoder silently removes a leading
    // U+FEFF, which is one more platform default quietly editing the input — the same shape as
    // the three findings this gate has already had. The stripping happens to be correct (in a
    // UTF-8 XML document a leading BOM is an encoding signature, not character data), but
    // "happens to be correct because of a library default" is not the same as "authored". So
    // the decoder is told to leave it alone and exactly ONE leading BOM is removed here, on
    // purpose, where it can be read and tested. A U+FEFF anywhere else is not a signature: it
    // is a zero-width no-break space, it is not XML `S`, and it is rejected like any other
    // stray character.
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  } catch (err) {
    return [
      `${relPath}: not valid UTF-8 — ${err.message}. The file is UNCHECKED. It is rejected `
      + 'rather than decoded leniently: replacing a bad byte with U+FFFD would produce a '
      + 'well-formed document that is not the one on disk.',
    ];
  }

  if (xmlTrim(text) === '') {
    return [`${relPath}: file is empty. An empty asset is not a safe asset, it is a missing one.`];
  }

  let events;
  try {
    events = parseXml(text);
  } catch (err) {
    // Fail closed. An asset that did not parse has NOT been checked, and an unchecked asset is
    // not evidence of safety.
    return [
      `${relPath}: not well-formed XML — ${err.message}. The file is therefore UNCHECKED, `
      + 'which is a failure, not a skip.',
    ];
  }

  for (const event of events) {
    if (event.kind === 'text') {
      // Only a <style> body is interpreted as code. Other text is rendered as glyphs.
      if (event.parent === 'style') checkStyleBody(event.value, `${relPath}: <style> body`, findings);
      continue;
    }

    const { name, attributes } = event;
    const lower = name.toLowerCase();

    if (!ALLOWED_ELEMENTS.has(name)) {
      const hazard = NAMED_HAZARD_ELEMENTS.get(lower);
      findings.push(
        hazard
          ? `${relPath}: <${name}> is forbidden — it ${hazard}.`
          : `${relPath}: <${name}> is not in the reviewed element registry. Elements are `
            + 'allowlisted, so anything unanticipated fails by default. If this element is '
            + 'genuinely safe and needed, add it to ALLOWED_ELEMENTS in this script — a change '
            + 'a reviewer sees.',
      );
    }

    for (const { name: attrName, rawValue } of attributes) {
      const decoded = decodeCharacterReferences(rawValue);
      if (decoded.error) {
        findings.push(`${relPath}: <${name} ${attrName}> — ${decoded.error}`);
        continue;
      }
      const value = decoded.value;
      const where = `${relPath}: <${name} ${attrName}>`;
      const attrLower = attrName.toLowerCase();

      // ADMISSION FIRST, always, through the single attribute registry. An `on*` handler and a
      // named hazard get a specific message, but nothing is ADMITTED by any path other than
      // ALLOWED_ATTRIBUTES — that is what stops a second registry from quietly overriding it.
      if (!ALLOWED_ATTRIBUTES.has(attrName)) {
        const hazard = NAMED_HAZARD_ATTRIBUTES.get(attrLower);
        if (attrLower.startsWith('on')) {
          findings.push(
            `${where}: an "on*" event-handler attribute executes JavaScript when the asset is `
            + 'opened directly in a browser.',
          );
        } else if (hazard) {
          findings.push(`${where}: attribute is forbidden — ${hazard}.`);
        } else {
          findings.push(
            `${where}: attribute is not in the reviewed attribute registry. Attributes are `
            + 'allowlisted, so an unanticipated one fails by default. Add it to '
            + 'ALLOWED_ATTRIBUTES in this script if it is safe and needed.',
          );
        }
        continue;
      }

      // Admitted. Now check the VALUE — a reference attribute must be a same-document fragment,
      // and every value goes through the positive-grammar check regardless of which attribute
      // carries it, because `fill`, `clip-path`, `mask` and `marker-*` all take a functional IRI.
      if (IRI_ATTRIBUTES.has(attrLower)) {
        checkFragmentReference(value, where, findings);
      }
      checkAttributeValue(value, where, findings);
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------------------
// Walk
// ---------------------------------------------------------------------------------------

function collectSvgFiles(absDir) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      const abs = path.join(dir, entry);
      if (statSync(abs).isDirectory()) walk(abs);
      else if (entry.toLowerCase().endsWith('.svg')) out.push(abs);
    }
  };
  walk(absDir);
  return out;
}

/**
 * @param {{ root?: string, dirs?: string[] }} [options]
 * @returns {{ ok: boolean, findings: string[], scanned: string[] }}
 */
export function assertSvgSafe(options = {}) {
  const root = options.root ?? REPO_ROOT;
  const dirs = options.dirs ?? SCAN_DIRS;
  const findings = [];
  const scanned = [];

  for (const rel of dirs) {
    const abs = path.join(root, rel);
    let files;
    try {
      files = collectSvgFiles(abs);
    } catch (err) {
      // A missing scan target is a failure, not an empty pass. A gate that silently scans
      // nothing is green forever.
      findings.push(
        `${rel}: scan target could not be read — ${err.message}. A gate that scans nothing is not a gate.`,
      );
      continue;
    }
    if (files.length === 0) {
      findings.push(
        `${rel}: contains no .svg files. Either the directory moved or the scan is `
        + 'misconfigured; either way this run proved nothing.',
      );
      continue;
    }
    for (const file of files) {
      const relPath = path.relative(root, file);
      scanned.push(relPath);
      findings.push(...checkAsset(relPath, readFileSync(file)));
    }
  }

  return { ok: findings.length === 0, findings, scanned };
}

export const registries = {
  ALLOWED_ELEMENTS,
  ALLOWED_ATTRIBUTES,
  IRI_ATTRIBUTES,
  NAMED_HAZARD_ELEMENTS,
  NAMED_HAZARD_ATTRIBUTES,
  ALLOWED_VALUE_FUNCTIONS,
  XML_S,
  CSS_WS,
  FORBIDDEN_SCHEMES,
  SCAN_DIRS,
};

const INVOKED_DIRECTLY = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (INVOKED_DIRECTLY) {
  const { ok, findings, scanned } = assertSvgSafe();
  if (!ok) {
    console.error(`[assert-svg-safe] FAILED — ${findings.length} finding(s):`);
    for (const finding of findings) console.error(`  • ${finding}`);
    console.error('[assert-svg-safe] These assets render on the public mirror and are served to');
    console.error('[assert-svg-safe] browsers. Fix the asset; there is no allowlist file to add it to.');
    process.exit(1);
  }
  console.log(`[assert-svg-safe] OK: ${scanned.length} asset(s) parsed as strict XML in ${SCAN_DIRS.join(', ')}, no findings.`);
  console.log('[assert-svg-safe] Elements and attributes are ALLOWLISTED, so an unanticipated construct fails by default.');
  console.log('[assert-svg-safe] Checked: element registry, attribute registry, on* handlers, non-fragment references,');
  console.log('[assert-svg-safe] javascript:/data:/vbscript:/file:/blob: schemes, url() functional IRIs, <style> bodies,');
  console.log('[assert-svg-safe] DOCTYPE/entity declarations, and strict XML well-formedness (an unparseable asset FAILS).');
  console.log('[assert-svg-safe] NOT checked: visual correctness, legibility at minimum size, or light-page contrast —');
  console.log('[assert-svg-safe] those are docs/BRAND.md rules a human verifies. Runtime egress control is the CSP.');
}
