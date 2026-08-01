#!/usr/bin/env node
// APTR-01 — egress lint over the built client bundle.
//
// ── WHAT THIS IS, AND WHAT IT IS NOT ────────────────────────────────────────────────────────
//
// This is a DEFENCE-IN-DEPTH LINT. It is NOT a security boundary, and nothing here should be
// described as "the mechanical enforcement of the no-external-fetch rule". A static scanner
// over emitted JavaScript cannot establish that guarantee: a URL can be assembled at runtime
// from fragments, from character codes, from a decoded payload, or from data the app already
// holds. No amount of parsing changes that.
//
// The enforcing control is the RUNTIME CSP served by the BFF (APTR-99). That is what actually
// stops egress, because the browser applies it at request time to a URL nobody had to guess.
//
// What this lint DOES catch, reliably, and why it is still worth running on every build:
//   * an accidental `fetch()` / `<script src>` / `@font-face src` pointing at a CDN or an API
//   * a dependency that grows a phone-home, an analytics beacon, or a remote font between
//     upgrades — dependency drift, which is the common real-world regression
//   * a font or asset host sneaking back in after being removed
//   * a statically-concatenated origin ("https:" + "//host") — folded, then caught
//
// What it CANNOT catch, stated plainly so nobody mistakes a green run for a proof:
//   * deliberate obfuscation of any kind
//   * a URL constructed at runtime from values not present in the bundle
//   * anything reached through an API whose arguments the scanner cannot see
// An overclaimed control is worse than a modest one, because people stop looking past it.
//
// ── HOW IT WORKS ────────────────────────────────────────────────────────────────────────────
//
// Earlier revisions regex-scanned comment-stripped text. Three reviewers independently found
// that approach unsound, and they were right: a hand-rolled stripper that runs BEFORE lexing
// can blank a real URL (the "//" inside "prefix // https://evil.invalid" reads as a line
// comment), a regex literal containing "//" can blank the rest of a file, and an HTML comment
// marker inside a <script> raw-text body hides code that genuinely executes. Every one of
// those failures makes the lint quietly blind, which is worse than noisily wrong.
//
// So the text is no longer stripped or pattern-matched. It is PARSED, and only real string
// data is examined:
//
//   JavaScript  — parsed with `rollup/parseAst` (Rollup's own parser; Rollup is a direct
//                 dependency of Vite, so this adds nothing to the dependency tree). Comments
//                 do not exist in an AST, regex literals are `Literal` nodes carrying a
//                 `regex` field, and string/template boundaries are the parser's problem, not
//                 ours. Comment, regex and string correctness is BY CONSTRUCTION.
//   CSS         — parsed with `postcss` (again already Vite's own dependency). Comments are
//                 `Comment` nodes and are never walked; declaration values and at-rule params
//                 are read as data.
//   HTML/SVG    — tokenized left to right, so raw-text elements and comments resolve in the
//                 same order the HTML tokenizer resolves them: a `<script>` body is extracted
//                 as raw text and PARSED AS JAVASCRIPT, never comment-stripped.
//   JSON        — parsed; every string key and value is examined.
//
// A file that cannot be parsed FAILS. An unparseable asset is not evidence of safety.
//
// ── EXACTNESS ───────────────────────────────────────────────────────────────────────────────
//
// Candidate values are never truncated at a delimiter. The COMPLETE string literal, attribute
// value, CSS value, or JSON string is compared against the allowlist by exact equality (after
// trimming surrounding whitespace, which is not part of a URI). That is what stops
// "http://www.w3.org/2000/svg;payload" and "…/2000/svg?exfil=1" reducing to an allowlisted
// URI — a delimiter-terminated extractor accepted both.
//
// The set of allowlistable URIs is a CODE-OWNED registry (below): XML/HTML namespace URIs and
// nothing else. The JSON file supplies only which of them are in use, and the mandatory reason
// for each. Widening it to a non-namespace host therefore requires a source change a reviewer
// must see — it cannot be done as a configuration edit.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseAst } from 'rollup/parseAst';
import postcss from 'postcss';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = resolve(SCRIPT_DIR, '..');
const DEFAULT_DIST = join(CLIENT_DIR, 'dist');
const DEFAULT_ALLOWLIST = join(SCRIPT_DIR, 'external-host-allowlist.json');

/**
 * The ONLY URIs that may ever appear in the allowlist file. Code-owned on purpose: the JSON
 * file cannot introduce a new one, so the allowlist can never be widened to a CDN, a font
 * host, or an API endpoint by editing configuration. Each is an XML/HTML namespace — an
 * identifier passed to createElementNS/setAttributeNS, never dereferenced by anything.
 */
export const RECOGNISED_NAMESPACE_URIS = Object.freeze([
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xlink',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/1998/Math/MathML',
  'http://www.w3.org/XML/1998/namespace',
]);

/** Extensions worth scanning. Binary assets (fonts, images, media) are skipped. */
const SCANNED = new Map([
  ['.js', 'js'],
  ['.mjs', 'js'],
  ['.cjs', 'js'],
  ['.css', 'css'],
  ['.html', 'markup'],
  ['.htm', 'markup'],
  ['.svg', 'markup'],
  ['.xml', 'markup'],
  ['.webmanifest', 'data'],
  ['.json', 'data'],
]);

/** Marks a value the scanner could not resolve statically — a runtime hole. */
const DYNAMIC = '\u0000';

/**
 * An absolute origin: a scheme, "//", and at least one real host character. A scheme followed
 * immediately by a runtime hole (`https://${host}`) deliberately does NOT match — that URL is
 * constructed at runtime and is out of a static scanner's reach by definition. It is exactly
 * the case the runtime CSP exists to cover; pretending otherwise would be the overclaim this
 * file's header warns about.
 */
const ABSOLUTE_ORIGIN_RE = /https?:\/\/[^\u0000\s/?#]/i;

/** A protocol-relative origin at the head of a value: `//host.tld/…` — a real egress shape. */
const PROTOCOL_RELATIVE_RE = /^\/\/[a-z0-9-]+(\.[a-z0-9-]+)+(?![a-z0-9-])/i;

// ── allowlist ───────────────────────────────────────────────────────────────────────────────

/**
 * Load and validate the namespace allowlist. Every failure mode throws — a broken allowlist
 * fails the lint and never degrades into "allow everything".
 * @returns {{ allowed: Set<string>, reasons: Map<string,string> }}
 */
export function loadAllowlist(file = DEFAULT_ALLOWLIST) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`allowlist ${file} is not readable JSON: ${err.message}`);
  }
  if (!doc || !Array.isArray(doc.entries)) {
    throw new Error(`allowlist ${file} must have an "entries" array`);
  }
  // Fail closed: zero entries means the file was emptied or mis-shaped, not that the build
  // legitimately needs no namespaces. Without this, an emptied allowlist would surface later
  // as a confusing failure on inline SVG instead of saying what is actually wrong.
  if (doc.entries.length === 0) {
    throw new Error(`allowlist ${file} has zero entries; expected at least one namespace URI`);
  }

  const recognised = new Set(RECOGNISED_NAMESPACE_URIS);
  const allowed = new Set();
  const reasons = new Map();

  for (const [idx, entry] of doc.entries.entries()) {
    const where = `allowlist entry #${idx}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`${where} must be an object`);
    }
    const extra = Object.keys(entry).filter((k) => k !== 'uri' && k !== 'reason');
    if (extra.length > 0) {
      throw new Error(`${where} has unexpected field(s): ${extra.join(', ')}`);
    }
    if (typeof entry.uri !== 'string' || entry.uri.trim() === '') {
      throw new Error(`${where} is missing a non-empty "uri"`);
    }
    // MANDATORY reason — an entry without one fails the lint.
    if (typeof entry.reason !== 'string' || entry.reason.trim() === '') {
      throw new Error(`${where} ("${entry.uri}") is missing a non-empty "reason"; every allowlist entry must justify itself`);
    }
    if (allowed.has(entry.uri)) {
      throw new Error(`${where} duplicates "${entry.uri}"`);
    }
    // Membership of a code-owned registry, not a shape heuristic. A URI that merely lives on
    // the same host as a namespace (…/not-a-namespace.js), or wears a userinfo disguise
    // (http://user:<email>/2000/svg), is not in the registry and is rejected here.
    if (!recognised.has(entry.uri)) {
      throw new Error(
        `${where} ("${entry.uri}") is not a recognised XML/HTML namespace URI. `
        + 'The recognised set is code-owned in assert-no-external-hosts.mjs; widening it is a '
        + 'source change a reviewer must approve, not a configuration edit.',
      );
    }
    allowed.add(entry.uri);
    reasons.set(entry.uri, entry.reason);
  }
  return { allowed, reasons };
}

// ── candidate evaluation ────────────────────────────────────────────────────────────────────

/**
 * Decide whether one COMPLETE value is a finding.
 * The value is never truncated: comparison is exact equality against the allowlist, so a
 * suffix, query, fragment, or path extension can never reduce a value to an allowlisted URI.
 */
function isViolation(rawValue, allowed) {
  const value = rawValue.trim(); // surrounding whitespace is not part of a URI
  if (value === '') return false;
  if (allowed.has(value)) return false; // exact match, whole value, nothing else
  return ABSOLUTE_ORIGIN_RE.test(value) || PROTOCOL_RELATIVE_RE.test(value);
}

function lineOf(text, offset) {
  if (!Number.isInteger(offset) || offset < 0) return 0;
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

function displayValue(value) {
  const shown = value.replace(/\u0000/g, '${…}');
  return shown.length > 180 ? `${shown.slice(0, 180)}…` : shown;
}

// ── JavaScript ──────────────────────────────────────────────────────────────────────────────

const AST_SKIP_KEYS = new Set(['type', 'start', 'end', 'loc', 'range', 'parent']);

/**
 * Statically fold a node to a string where possible. An unresolvable sub-expression becomes a
 * DYNAMIC hole rather than being dropped, so `"https://" + host` cannot masquerade as a
 * complete literal URL, and `"https:" + "//evil.invalid"` folds into one that is caught.
 */
function foldStatic(node) {
  if (!node || typeof node !== 'object') return DYNAMIC;
  switch (node.type) {
    case 'Literal':
      if (node.regex) return DYNAMIC;
      if (node.value === null) return 'null';
      if (typeof node.value === 'string') return node.value;
      if (typeof node.value === 'number' || typeof node.value === 'boolean') return String(node.value);
      return DYNAMIC;
    case 'TemplateLiteral': {
      let out = '';
      node.quasis.forEach((quasi, i) => {
        out += quasi.value.cooked ?? quasi.value.raw ?? '';
        if (i < node.expressions.length) out += foldStatic(node.expressions[i]);
      });
      return out;
    }
    case 'BinaryExpression':
      if (node.operator === '+') return foldStatic(node.left) + foldStatic(node.right);
      return DYNAMIC;
    default:
      return DYNAMIC;
  }
}

/**
 * Collect every string value reachable in the JavaScript AST: string literals, template
 * literals, and statically-foldable `+` concatenations. Children are walked as well as folded,
 * so nothing nested inside a concatenation can be missed.
 * @returns {{ value: string, start: number }[]}
 */
export function collectJsValues(code) {
  const ast = parseAst(code);
  const values = [];

  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (typeof node.type === 'string') {
      if (node.type === 'Literal' && typeof node.value === 'string' && !node.regex) {
        values.push({ value: node.value, start: node.start });
      } else if (node.type === 'TemplateLiteral'
        || (node.type === 'BinaryExpression' && node.operator === '+')) {
        values.push({ value: foldStatic(node), start: node.start });
      }
    }
    for (const key of Object.keys(node)) {
      if (AST_SKIP_KEYS.has(key)) continue;
      visit(node[key]);
    }
  };

  visit(ast);
  return values;
}

function scanJs(code, allowed) {
  let values;
  try {
    values = collectJsValues(code);
  } catch (err) {
    // Fail closed: an asset we cannot parse is not an asset we have checked.
    return [{ line: 0, value: `<unparseable JavaScript: ${err.message}>` }];
  }
  const findings = [];
  const seen = new Set();
  for (const { value, start } of values) {
    if (!isViolation(value, allowed)) continue;
    const key = `${start}:${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({ line: lineOf(code, start), value });
  }
  return findings;
}

// ── CSS ─────────────────────────────────────────────────────────────────────────────────────

/** Pull the complete argument of every `url(…)`, quotes removed, plus whatever is left over. */
function cssCandidates(value) {
  const candidates = [];
  const lower = value.toLowerCase();
  let residual = '';
  let i = 0;
  while (i < value.length) {
    const idx = lower.indexOf('url(', i);
    if (idx === -1) {
      residual += value.slice(i);
      break;
    }
    residual += value.slice(i, idx);
    let j = idx + 4;
    let arg = '';
    let depth = 1;
    while (j < value.length) {
      const c = value[j];
      if (c === '"' || c === "'") {
        const quote = c;
        j++;
        while (j < value.length && value[j] !== quote) {
          arg += value[j];
          j++;
        }
        j++;
        continue;
      }
      if (c === '(') depth++;
      else if (c === ')') {
        depth--;
        if (depth === 0) break;
      }
      arg += c;
      j++;
    }
    candidates.push(arg);
    i = j + 1;
  }
  if (residual !== '') candidates.push(residual);
  return candidates;
}

function scanCss(code, allowed) {
  let root;
  try {
    root = postcss.parse(code);
  } catch (err) {
    return [{ line: 0, value: `<unparseable CSS: ${err.message}>` }];
  }
  const findings = [];
  // Comments are `Comment` nodes and are never visited by these walkers: a licence banner
  // carrying an upstream URL is inert BY CONSTRUCTION, not because of a stripping pass.
  const consider = (raw, node) => {
    for (const candidate of cssCandidates(raw)) {
      if (isViolation(candidate, allowed)) {
        findings.push({ line: node.source?.start?.line ?? 0, value: candidate.trim() });
      }
    }
  };
  root.walkDecls((decl) => consider(decl.value, decl));
  root.walkAtRules((rule) => consider(rule.params, rule));
  return findings;
}

// ── HTML / SVG / XML ────────────────────────────────────────────────────────────────────────

const RAW_TEXT_ELEMENTS = new Set(['script', 'style']);

/**
 * Tokenize markup left to right. Order matters and mirrors the HTML tokenizer: whichever of a
 * comment or a raw-text element starts FIRST wins. That is what makes
 * `<script><!--\nfetch(…)\n--></script>` scan as executable JavaScript (which it is) rather
 * than as a comment (which it is not) — one of the review defects this rewrite fixes.
 */
function scanMarkup(code, allowed) {
  const findings = [];
  let i = 0;

  const considerText = (text, offset) => {
    if (isViolation(text, allowed)) {
      findings.push({ line: lineOf(code, offset), value: text.trim() });
    }
  };

  while (i < code.length) {
    const lt = code.indexOf('<', i);
    if (lt === -1) {
      considerText(code.slice(i), i);
      break;
    }
    considerText(code.slice(i, lt), i);

    if (code.startsWith('<!--', lt)) {
      const end = code.indexOf('-->', lt + 4);
      i = end === -1 ? code.length : end + 3;
      continue;
    }
    if (code.startsWith('<!', lt) || code.startsWith('<?', lt)) {
      const end = code.indexOf('>', lt);
      i = end === -1 ? code.length : end + 1;
      continue;
    }

    const tagMatch = /^<\/?([a-z][a-z0-9:-]*)/i.exec(code.slice(lt));
    if (!tagMatch) {
      i = lt + 1;
      continue;
    }
    const tagName = tagMatch[1].toLowerCase();
    const tagEnd = code.indexOf('>', lt);
    if (tagEnd === -1) break;
    const tagText = code.slice(lt, tagEnd + 1);

    // Attribute values are complete values, compared whole.
    for (const attr of tagText.matchAll(/[a-z_:][-a-z0-9_:.]*\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/gi)) {
      const value = attr[2] ?? attr[3] ?? attr[4] ?? '';
      if (isViolation(value, allowed)) {
        findings.push({ line: lineOf(code, lt + (attr.index ?? 0)), value: value.trim() });
      }
    }

    i = tagEnd + 1;

    const isClosingTag = code.startsWith('</', lt);
    if (!isClosingTag && RAW_TEXT_ELEMENTS.has(tagName) && !tagText.endsWith('/>')) {
      const closeMatch = new RegExp(`</${tagName}\\s*>`, 'i').exec(code.slice(i));
      const bodyEnd = closeMatch ? i + closeMatch.index : code.length;
      const body = code.slice(i, bodyEnd);
      const bodyLineOffset = lineOf(code, i) - 1;
      const rebase = (f) => ({ line: f.line > 0 ? bodyLineOffset + f.line : 0, value: f.value });

      if (tagName === 'style') {
        findings.push(...scanCss(body, allowed).map(rebase));
      } else {
        const typeAttr = /type\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/i.exec(tagText);
        const type = (typeAttr?.[2] ?? typeAttr?.[3] ?? typeAttr?.[4] ?? '').toLowerCase();
        if (type.includes('json')) {
          findings.push(...scanJson(body, allowed).map(rebase));
        } else {
          // Annex-B script comment markers are line comments to a classic script parser but
          // not to an ESTree parser. Blank the MARKERS ONLY — never the code they wrap — so
          // the body parses and anything hidden behind them is exposed rather than swallowed.
          const source = body.replace(/<!--/g, '    ').replace(/-->/g, '   ');
          findings.push(...scanJs(source, allowed).map(rebase));
        }
      }
      i = closeMatch ? bodyEnd + closeMatch[0].length : code.length;
    }
  }

  return findings;
}

// ── JSON ────────────────────────────────────────────────────────────────────────────────────

function scanJson(code, allowed) {
  let doc;
  try {
    doc = JSON.parse(code);
  } catch (err) {
    return [{ line: 0, value: `<unparseable JSON: ${err.message}>` }];
  }
  const findings = [];
  const visit = (node) => {
    if (typeof node === 'string') {
      if (isViolation(node, allowed)) {
        const at = code.indexOf(node);
        findings.push({ line: at === -1 ? 0 : lineOf(code, at), value: node });
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node && typeof node === 'object') {
      for (const [key, item] of Object.entries(node)) {
        visit(key);
        visit(item);
      }
    }
  };
  visit(doc);
  return findings;
}

// ── entry points ────────────────────────────────────────────────────────────────────────────

/**
 * Scan one asset's text.
 * @param {string} text
 * @param {'js'|'css'|'markup'|'data'} kind
 * @param {Set<string>} allowed exact-match namespace allowlist
 * @returns {{ line: number, value: string }[]}
 */
export function scanText(text, kind, allowed) {
  switch (kind) {
    case 'js': return scanJs(text, allowed);
    case 'css': return scanCss(text, allowed);
    case 'markup': return scanMarkup(text, allowed);
    case 'data': return scanJson(text, allowed);
    default: throw new Error(`scanText: unknown kind '${kind}'`);
  }
}

function kindFor(file) {
  return SCANNED.get(extname(file).toLowerCase());
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (st.isFile()) yield full;
  }
}

/**
 * Scan a built output directory.
 * @returns {{ scanned: number, findings: {file:string,line:number,value:string}[] }}
 */
export function scanDist(distDir, allowed) {
  const findings = [];
  let scanned = 0;
  for (const file of walk(distDir)) {
    const kind = kindFor(file);
    if (!kind) continue;
    scanned++;
    const text = readFileSync(file, 'utf8');
    for (const f of scanText(text, kind, allowed)) {
      findings.push({ file: relative(distDir, file), line: f.line, value: f.value });
    }
  }
  return { scanned, findings };
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────

function main(argv) {
  const distDir = argv[0] ? resolve(process.cwd(), argv[0]) : DEFAULT_DIST;
  const tag = '[assert-no-external-hosts]';

  let allowed;
  let reasons;
  try {
    ({ allowed, reasons } = loadAllowlist());
  } catch (err) {
    console.error(`${tag} FAIL: ${err.message}`);
    return 1;
  }

  try {
    statSync(distDir);
  } catch {
    console.error(`${tag} FAIL: build output not found at ${distDir} — run the build first`);
    return 1;
  }

  let result;
  try {
    result = scanDist(distDir, allowed);
  } catch (err) {
    console.error(`${tag} FAIL: ${err.message}`);
    return 1;
  }

  if (result.findings.length > 0) {
    console.error(`${tag} FAIL: ${result.findings.length} external origin(s) in the built output:`);
    for (const f of result.findings) {
      console.error(`  ${f.file}:${f.line}  ${displayValue(f.value)}`);
    }
    console.error(`${tag} Aperture fetches nothing at runtime. Bundle the asset, or remove the reference.`);
    console.error(`${tag} The allowlist takes XML/HTML namespace URIs only — never a CDN, font, or API host.`);
    return 1;
  }

  console.log(`${tag} OK: ${result.scanned} asset(s) parsed in ${distDir}, no static external origins.`);
  console.log(`${tag} lint only — not a security boundary. Runtime egress is enforced by the CSP (APTR-99).`);
  console.log(`${tag} allowlisted namespace URIs (exact match): ${[...reasons.keys()].join(', ')}`);
  return 0;
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  process.exit(main(process.argv.slice(2)));
}
