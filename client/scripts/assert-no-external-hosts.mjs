#!/usr/bin/env node
// APTR-01 — egress gate.
//
// Aperture ships no runtime external fetch: no CDN, no remote font, no analytics, no
// phone-home. This script runs as the last step of `npm run build`, over the BUILT output,
// and fails the build if any absolute http(s) URL survives in an emitted asset.
//
// Two things make a naive grep here a gate that is red on a correct build — both are the
// review defect this script exists to fix, and both are handled explicitly:
//
//   1. Dependency LICENCE BANNERS carry upstream project URLs. They are comments: inert text,
//      never fetched. So the scan strips comments FIRST. Stripping is for scanning only — the
//      emitted bundle on disk is never rewritten. Comment bytes are replaced with spaces so
//      byte offsets, and therefore reported line numbers, stay exact.
//
//   2. Bundled inline SVG legitimately carries xmlns="http://www.w3.org/2000/svg". An XML
//      namespace URI is an IDENTIFIER, not an address — nothing is ever fetched from it. So a
//      small, reason-annotated allowlist of XML/HTML namespace URIs is permitted, matched by
//      EXACT STRING. A lookalike that merely shares a prefix with an allowlisted namespace
//      (…/2000/svgx, …/2000/svg.evil.example/) is NOT allowed and still fails.
//
// The comment stripper is deliberately string-aware. The dangerous failure mode is the
// opposite of a false positive: treating the "//" inside "https://evil.example" as the start
// of a line comment would DELETE the very violation the gate exists to catch. The state
// machine below tracks string and template literals, and refuses to open a line comment when
// the "//" is immediately preceded by ":" (i.e. it is a URL scheme separator, not a comment).
//
// This static gate is necessary, not sufficient: a URL can be assembled at runtime from
// fragments. The runtime CSP (APTR-99) is the enforcing control; this is the cheap, early one.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = resolve(SCRIPT_DIR, '..');
const DEFAULT_DIST = join(CLIENT_DIR, 'dist');
const DEFAULT_ALLOWLIST = join(SCRIPT_DIR, 'external-host-allowlist.json');

/** Extensions worth scanning. Binary assets (fonts, images, media) are skipped. */
const SCANNED = new Map([
  ['.js', 'js'],
  ['.mjs', 'js'],
  ['.cjs', 'js'],
  ['.jsx', 'js'],
  ['.ts', 'js'],
  ['.tsx', 'js'],
  ['.css', 'css'],
  ['.html', 'markup'],
  ['.htm', 'markup'],
  ['.svg', 'markup'],
  ['.xml', 'markup'],
  ['.webmanifest', 'data'],
  ['.json', 'data'],
  ['.txt', 'data'],
]);

/** Absolute http(s) URL. Stops at whitespace, quotes, and markup/code delimiters. */
const URL_RE = /https?:\/\/[^\s"'`<>(){}[\],;\\]*/gi;

/** Punctuation that is sentence/markup noise when it trails a URL, never part of it. */
const TRAILING_NOISE = /[.,:;!?]+$/;

// ── comment stripping ───────────────────────────────────────────────────────────────────────

const SPACE = ' ';

/** Blank out [start,end) but keep newlines, so offsets and line numbers are preserved. */
function blank(chars, start, end) {
  for (let i = start; i < end && i < chars.length; i++) {
    if (chars[i] !== '\n') chars[i] = SPACE;
  }
}

/**
 * Strip comments from JS/TS source: `//` to end of line, and `/* … *\/` blocks.
 * String, template, and regex literals are respected, so a URL inside a string is NEVER
 * mistaken for a comment. Idempotent, and tolerant of input with zero comments (a minifier
 * that already stripped them).
 */
function stripJsComments(text) {
  const chars = [...text];
  const n = chars.length;
  // Template-literal nesting: each `${` inside a template pushes back into code state.
  const templateStack = [];
  let i = 0;

  const prevNonSpace = (from) => {
    for (let k = from; k >= 0; k--) {
      const c = chars[k];
      if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') return c;
    }
    return '';
  };

  while (i < n) {
    const c = chars[i];
    const next = chars[i + 1];

    // ── comments ──
    if (c === '/' && next === '/') {
      // A "//" immediately after ":" is a URL scheme separator, not a comment. Never strip it.
      if (chars[i - 1] === ':') {
        i += 2;
        continue;
      }
      let j = i;
      while (j < n && chars[j] !== '\n') j++;
      blank(chars, i, j);
      i = j;
      continue;
    }
    if (c === '/' && next === '*') {
      let j = i + 2;
      while (j < n && !(chars[j] === '*' && chars[j + 1] === '/')) j++;
      const end = Math.min(j + 2, n);
      blank(chars, i, end);
      i = end;
      continue;
    }

    // ── string literals ──
    if (c === '"' || c === "'") {
      i++;
      while (i < n && chars[i] !== c) {
        if (chars[i] === '\\') i++;
        else if (chars[i] === '\n') break; // unterminated; resync rather than swallow the file
        i++;
      }
      i++;
      continue;
    }

    // ── template literals ──
    if (c === '`') {
      i++;
      while (i < n) {
        if (chars[i] === '\\') { i += 2; continue; }
        if (chars[i] === '`') { i++; break; }
        if (chars[i] === '$' && chars[i + 1] === '{') {
          templateStack.push('template');
          i += 2;
          break; // back to code state; the matching `}` pops
        }
        i++;
      }
      continue;
    }
    if (c === '}' && templateStack.length > 0) {
      templateStack.pop();
      i++;
      // resume the enclosing template literal
      while (i < n) {
        if (chars[i] === '\\') { i += 2; continue; }
        if (chars[i] === '`') { i++; break; }
        if (chars[i] === '$' && chars[i + 1] === '{') {
          templateStack.push('template');
          i += 2;
          break;
        }
        i++;
      }
      continue;
    }

    // ── regex literals ──
    // Only where a regex can legally start; otherwise "/" is division. Getting this wrong is
    // harmless for URLs (a regex cannot contain an unescaped "/") but keeps quote characters
    // inside a regex from unbalancing string tracking, e.g. /"/g.
    if (c === '/') {
      const p = prevNonSpace(i - 1);
      if (p === '' || '(,=:[!&|?{};+-*%^~<>'.includes(p)) {
        let j = i + 1;
        let inClass = false;
        while (j < n) {
          const d = chars[j];
          if (d === '\\') { j += 2; continue; }
          if (d === '\n') break; // not a regex after all
          if (d === '[') inClass = true;
          else if (d === ']') inClass = false;
          else if (d === '/' && !inClass) { j++; break; }
          j++;
        }
        i = j;
        continue;
      }
    }

    i++;
  }

  return chars.join('');
}

/** Strip `/* … *\/` from CSS, respecting string literals. */
function stripCssComments(text) {
  const chars = [...text];
  const n = chars.length;
  let i = 0;
  while (i < n) {
    const c = chars[i];
    if (c === '/' && chars[i + 1] === '*') {
      let j = i + 2;
      while (j < n && !(chars[j] === '*' && chars[j + 1] === '/')) j++;
      const end = Math.min(j + 2, n);
      blank(chars, i, end);
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < n && chars[i] !== c) {
        if (chars[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    i++;
  }
  return chars.join('');
}

/** Strip `<!-- … -->` from HTML/SVG/XML. Embedded <script>/<style> bodies are then swept
 *  with the JS/CSS strippers so a licence banner inside an inline script is handled too. */
function stripMarkupComments(text) {
  const chars = [...text];
  const n = chars.length;
  let i = 0;
  while (i < n) {
    if (chars[i] === '<' && chars[i + 1] === '!' && chars[i + 2] === '-' && chars[i + 3] === '-') {
      let j = i + 4;
      while (j < n && !(chars[j] === '-' && chars[j + 1] === '-' && chars[j + 2] === '>')) j++;
      const end = Math.min(j + 3, n);
      blank(chars, i, end);
      i = end;
      continue;
    }
    i++;
  }
  let out = chars.join('');
  out = out.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (_m, open, body, close) =>
    open + stripJsComments(body) + close);
  out = out.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, open, body, close) =>
    open + stripCssComments(body) + close);
  return out;
}

/**
 * Remove comments from `text` for scanning purposes.
 * @param {string} text
 * @param {'js'|'css'|'markup'|'data'} kind
 * @returns {string} same length in lines; comment bytes replaced with spaces
 */
export function stripComments(text, kind) {
  switch (kind) {
    case 'js': return stripJsComments(text);
    case 'css': return stripCssComments(text);
    case 'markup': return stripMarkupComments(text);
    case 'data': return text; // JSON and friends have no comment syntax
    default: throw new Error(`stripComments: unknown kind '${kind}'`);
  }
}

// ── allowlist ───────────────────────────────────────────────────────────────────────────────

/**
 * Load and validate the XML-namespace allowlist. Throws on any malformed entry — a broken
 * allowlist fails the gate, it never degrades into "allow everything".
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
    // MANDATORY reason — an entry without one fails the script.
    if (typeof entry.reason !== 'string' || entry.reason.trim() === '') {
      throw new Error(`${where} ("${entry.uri}") is missing a non-empty "reason"; every allowlist entry must justify itself`);
    }
    if (allowed.has(entry.uri)) {
      throw new Error(`${where} duplicates "${entry.uri}"`);
    }
    // Mechanical guard on the policy "namespace URIs only": W3C-defined namespaces, bare path,
    // no query and no fragment. Anything else is a review decision, not a config change.
    let parsed;
    try {
      parsed = new URL(entry.uri);
    } catch {
      throw new Error(`${where} ("${entry.uri}") is not a valid absolute URI`);
    }
    if (parsed.host !== 'www.w3.org' || parsed.search !== '' || parsed.hash !== '') {
      throw new Error(`${where} ("${entry.uri}") is not a W3C XML/HTML namespace URI; only namespace URIs may be allowlisted`);
    }
    allowed.add(entry.uri);
    reasons.set(entry.uri, entry.reason);
  }
  return { allowed, reasons };
}

// ── scanning ────────────────────────────────────────────────────────────────────────────────

/**
 * Scan one asset's text for non-allowlisted absolute URLs.
 * @param {string} text raw asset text
 * @param {'js'|'css'|'markup'|'data'} kind
 * @param {Set<string>} allowed exact-match allowlist
 * @returns {{ line: number, url: string }[]}
 */
export function scanText(text, kind, allowed) {
  const stripped = stripComments(text, kind);
  const findings = [];
  URL_RE.lastIndex = 0;
  let m;
  while ((m = URL_RE.exec(stripped)) !== null) {
    const url = m[0].replace(TRAILING_NOISE, '');
    if (url === '' ) continue;
    // EXACT match only. A prefix or substring relationship is not a match.
    if (allowed.has(url)) continue;
    const line = stripped.slice(0, m.index).split('\n').length;
    findings.push({ line, url });
  }
  return findings;
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
 * @returns {{ scanned: number, findings: {file:string,line:number,url:string}[] }}
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
      findings.push({ file: relative(distDir, file), line: f.line, url: f.url });
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
      console.error(`  ${f.file}:${f.line}  ${f.url}`);
    }
    console.error(`${tag} Aperture fetches nothing at runtime. Bundle the asset, or remove the reference.`);
    console.error(`${tag} The allowlist takes XML/HTML namespace URIs only — never a CDN, font, or API host.`);
    return 1;
  }

  console.log(`${tag} OK: ${result.scanned} asset(s) scanned in ${distDir}, no external origins.`);
  console.log(`${tag} allowlisted namespace URIs (exact match): ${[...reasons.keys()].join(', ')}`);
  return 0;
}

const invokedDirectly = process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  process.exit(main(process.argv.slice(2)));
}
