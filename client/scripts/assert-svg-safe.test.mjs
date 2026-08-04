// Tests for the SVG sanitization gate.
//
// The point of this suite is NOT to agree with the gate. It is to prove the gate can go RED,
// once per rule, and to pin the two claims the gate makes that its neighbours in this directory
// explicitly do not: that a `>` inside an attribute value does not desynchronize it, and that a
// character-reference-escaped scheme is decoded before inspection.
//
// The "every real asset" cases are DERIVED by reading the scan directories, so a seventh asset
// added tomorrow is covered by construction rather than by somebody remembering to add a case.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertSvgSafe, registries } from './assert-svg-safe.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');

/** Run the gate over a single synthetic asset in an isolated temp root. */
function scanOne(svg, name = 'probe.svg') {
  const root = mkdtempSync(path.join(tmpdir(), 'aperture-svg-safe-'));
  try {
    mkdirSync(path.join(root, 'assets'), { recursive: true });
    writeFileSync(path.join(root, 'assets', name), svg, 'utf8');
    return assertSvgSafe({ root, dirs: ['assets'] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const WRAP = (inner, attrs = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"${attrs ? ' ' + attrs : ''}>${inner}</svg>`;

/** Every .svg the gate is configured to scan, discovered rather than listed. */
function realAssets() {
  const found = [];
  for (const dir of registries.SCAN_DIRS) {
    const abs = path.join(REPO_ROOT, dir);
    for (const entry of readdirSync(abs)) {
      if (entry.toLowerCase().endsWith('.svg')) found.push(path.join(abs, entry));
    }
  }
  return found;
}

// ---------------------------------------------------------------------------------------

describe('assert-svg-safe — the tree as committed', () => {
  it('is green over every scanned directory', () => {
    const result = assertSvgSafe();
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('actually scanned every .svg under the configured directories — not a subset', () => {
    const { scanned } = assertSvgSafe();
    const expected = realAssets().map((abs) => path.relative(REPO_ROOT, abs)).sort();
    // Set equality, not a count floor: a count proves the walk found something, never
    // everything, and a walk that silently skipped one file is the failure this guards.
    expect([...scanned].sort()).toEqual(expected);
    expect(expected.length).toBeGreaterThan(0);
  });
});

describe('brand asset wiring', () => {
  // The README states these two files are byte-identical. A served copy that silently drifts
  // from its `assets/` original is how a brand asset ends up updated in one place only — and
  // the README's claim would then be false with nothing to catch it.
  it('client/public/favicon.svg is byte-identical to assets/aperture-favicon.svg', () => {
    const source = readFileSync(path.join(REPO_ROOT, 'assets', 'aperture-favicon.svg'));
    const served = readFileSync(path.join(REPO_ROOT, 'client', 'public', 'favicon.svg'));
    expect(served.equals(source)).toBe(true);
  });

  // Derived from the README, not restated: every asset the README links must exist. A link to
  // a renamed or deleted asset renders as a broken image on the public mirror.
  it('every assets/ path the README references exists on disk', () => {
    const readme = readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8');
    const referenced = [...readme.matchAll(/assets\/[A-Za-z0-9._-]+\.svg/g)].map((m) => m[0]);
    expect(referenced.length).toBeGreaterThan(0);
    const onDisk = new Set(
      realAssets().map((abs) => path.relative(REPO_ROOT, abs).split(path.sep).join('/')),
    );
    for (const ref of new Set(referenced)) expect(onDisk.has(ref)).toBe(true);
  });
});

describe('assert-svg-safe — the required rejections', () => {
  // Each case is the gate's reason for existing. `expect(ok).toBe(false)` on its own would pass
  // if some UNRELATED rule fired, so every case also asserts the finding names the right thing.
  const cases = [
    ['<script>', WRAP('<script>alert(1)</script>'), /<script> is forbidden/],
    ['<foreignObject>', WRAP('<foreignObject><p>x</p></foreignObject>'), /<foreignObject> is forbidden/],
    ['<image> with a raster', WRAP('<image href="pixels.png"/>'), /<image> is forbidden/],
    ['<a> navigation', WRAP('<a href="#x"><rect/></a>'), /<a> is forbidden/],
    ['<animate> retargeting', WRAP('<rect><animate attributeName="fill" to="red"/></rect>'), /<animate> is forbidden/],
    ['an on* handler', WRAP('<rect onload="alert(1)" width="1" height="1"/>'), /event-handler attribute/],
    ['an on* handler in mixed case', WRAP('<rect oNLoAd="alert(1)" width="1" height="1"/>'), /event-handler attribute/],
    ['an absolute external href', WRAP('<use href="https://example.invalid/x.svg#g"/>'), /not a same-document fragment/],
    ['an absolute external xlink:href', WRAP('<use xlink:href="https://example.invalid/x.svg#g"/>'), /not a same-document fragment/],
    ['a protocol-relative href', WRAP('<use href="//example.invalid/x.svg#g"/>'), /not a same-document fragment/],
    ['a relative-path href', WRAP('<use href="sibling.svg#g"/>'), /not a same-document fragment/],
    ['a javascript: href', WRAP('<use href="javascript:alert(1)"/>'), /forbidden "javascript:" URI/],
    ['a data: raster href', WRAP('<use href="data:image/png;base64,iVBORw0KGgo="/>'), /forbidden "data:" URI/],
    ['a data: raster in a fill url()', WRAP('<rect fill="url(data:image/png;base64,iVBORw0KGgo=)" width="1" height="1"/>'), /forbidden "data:" URI/],
    // Still rejected, but now for a stronger reason: the style ATTRIBUTE is no longer admitted
    // at all, so its CSS grammar never has to be tokenized correctly.
    ['a data: payload in a style attribute', WRAP('<rect style="background:url(data:text/html,&lt;script&gt;)" width="1" height="1"/>'), /its value is a CSS grammar/],
    ['an external url() in a fill', WRAP('<rect fill="url(https://example.invalid/g.svg#g)" width="1" height="1"/>'), /not a same-document fragment/],
    ['@import in a <style> body', WRAP('<style>@import url(https://example.invalid/x.css);</style>'), /only at-rule permitted/],
    // Rejected by the declaration grammar: a value may not carry a function token, and this one
    // does not even parse as "property: value" because of the scheme's own colon. Either way the
    // external reference cannot reach the file.
    ['an external url() in a <style> body', WRAP('<style>.a{fill:url(https://example.invalid/g#g)}</style>'), /is not a "property: value" declaration/],
    ['a function token in a <style> declaration value', WRAP('<style>.a{fill:url(#g)}</style>'), /outside the permitted/],
    ['a DOCTYPE', '<!DOCTYPE svg SYSTEM "x.dtd">' + WRAP('<rect/>'), /declaration is not permitted/],
    ['an unknown attribute', WRAP('<rect definitelyNotReal="1" width="1" height="1"/>'), /not in the reviewed attribute registry/],
  ];

  for (const [label, svg, pattern] of cases) {
    it(`goes RED on ${label}`, () => {
      const { ok, findings } = scanOne(svg);
      expect(ok).toBe(false);
      expect(findings.join('\n')).toMatch(pattern);
    });
  }
});

describe('assert-svg-safe — one registry, no denylist inside it (review APTR-04-c1)', () => {
  // All three findings below were real and are reproduced here as regressions. Their shared
  // root: the outer structure was an allowlist, but a denylist and a second registry were
  // operating inside it. The same argument that governs the element registry applies one layer
  // in, which is where it was easier to miss.

  // FINDING 1 — the CSS check matched the literal text `url(`, so any equivalent CSS spelling
  // walked past it while the gate reported nothing.
  const spellings = [
    ['a CSS escape in a style attribute', '<rect style="background:u\\72l(https://evil.invalid/x)" width="1" height="1"/>'],
    ['a comment splitting the name in a style attribute', '<rect style="background:u/**/rl(https://evil.invalid/x)" width="1" height="1"/>'],
    ['a CSS escape in a presentation attribute', '<rect fill="u\\72l(https://evil.invalid/x)" width="1" height="1"/>'],
    ['a comment splitting the name in a presentation attribute', '<rect fill="u/**/rl(https://evil.invalid/x)" width="1" height="1"/>'],
    ['a CSS escape in a <style> body', '<style>.a{background:u\\72l(https://evil.invalid/x)}</style>'],
    ['an unanticipated function in an attribute value', '<rect fill="image-set(https://evil.invalid/x)" width="1" height="1"/>'],
    ['@import in a <style> body', '<style>@import url(https://evil.invalid/x.css);</style>'],
    ['a string token in a <style> body', '<style>.a{content:"x"}</style>'],
  ];
  for (const [label, inner] of spellings) {
    it(`goes RED on ${label}`, () => {
      expect(scanOne(WRAP(inner)).ok).toBe(false);
    });
  }

  // FINDING 2 — reference attributes resolved through IRI_ATTRIBUTES BEFORE the allowlist, so a
  // same-document value admitted an attribute that ALLOWED_ATTRIBUTES never contained.
  for (const attr of ['src', 'data', 'action', 'formaction', 'xlink:base', 'xlink:actuate']) {
    it(`goes RED on ${attr}="#x" even though the value is a valid fragment`, () => {
      const { ok, findings } = scanOne(WRAP(`<rect ${attr}="#x" width="1" height="1"/>`));
      expect(ok).toBe(false);
      expect(findings.join('\n')).toMatch(/attribute is forbidden/);
    });
  }

  it('goes RED on a style attribute, however innocent its value', () => {
    const { ok, findings } = scanOne(WRAP('<rect style="fill:#fff" width="1" height="1"/>'));
    expect(ok).toBe(false);
    expect(findings.join('\n')).toMatch(/its value is a CSS grammar/);
  });

  // The invariant that keeps the two attribute registries from disagreeing again. Derived from
  // the registries themselves, so a name added to either one is checked automatically.
  it('no named-hazard attribute is also admitted by the allowlist', () => {
    for (const name of registries.NAMED_HAZARD_ATTRIBUTES.keys()) {
      expect(registries.ALLOWED_ATTRIBUTES.has(name)).toBe(false);
    }
  });

  it('every reference attribute needing a value check is first admitted by the allowlist', () => {
    for (const name of registries.IRI_ATTRIBUTES) {
      expect(registries.ALLOWED_ATTRIBUTES.has(name)).toBe(true);
    }
  });

  it('no named-hazard element is also admitted by the allowlist', () => {
    for (const name of registries.NAMED_HAZARD_ELEMENTS.keys()) {
      expect([...registries.ALLOWED_ELEMENTS].map((e) => e.toLowerCase())).not.toContain(name);
    }
  });

  // FINDING 3 — character data was never validated, so ill-formed XML passed a gate whose
  // stated contract is that an unparseable asset fails.
  const illFormedText = [
    ['an undeclared entity in text', '<title>&undeclared;</title>'],
    ['an undeclared entity inside a <style> body', '<style>.x{fill:&undeclared;}</style>'],
    ['a bare ampersand in text', '<title>a & b</title>'],
    ['a "]]>" in character data', '<title>a ]]> b</title>'],
  ];
  for (const [label, inner] of illFormedText) {
    it(`treats ${label} as ill-formed XML`, () => {
      const { ok, findings } = scanOne(WRAP(inner));
      expect(ok).toBe(false);
      expect(findings.join('\n')).toMatch(/not well-formed XML/);
    });
  }

  it('still permits a valid character reference in text', () => {
    expect(scanOne(WRAP('<title>Aperture &#8212; the client &amp; its marks</title>')).findings).toEqual([]);
  });
});

describe('assert-svg-safe — grammar and prose must agree (review APTR-04-c2)', () => {
  // FINDING 1 — the implementation permitted any number of sibling @media wrappers while the
  // documentation said one. Tightened to match the prose, which is the cheaper direction here.
  it('permits exactly one @media wrapper — the wordmark case', () => {
    const svg = WRAP('<style>.a{fill:#fff}@media (prefers-color-scheme: light){.a{fill:#000}}</style>');
    expect(scanOne(svg).findings).toEqual([]);
  });

  for (const [label, count] of [['two', 2], ['three', 3]]) {
    it(`goes RED on ${label} sibling @media wrappers`, () => {
      const media = '@media (prefers-color-scheme: light){.a{fill:#000}}'.repeat(count);
      const { ok, findings } = scanOne(WRAP(`<style>${media}</style>`));
      expect(ok).toBe(false);
      expect(findings.join('\n')).toMatch(/at most ONE/);
    });
  }
});

describe('assert-svg-safe — substitution is not validation (review APTR-04-c2)', () => {
  // FINDING 2 — invalid numeric character references were decoded to U+FFFD rather than
  // rejected, so ill-formed XML passed a gate whose contract is that it fails. A lossy repair
  // standing in for a rejection produces a well-formed document that is not the one on disk.
  //
  // The cases are DERIVED from the XML 1.0 Char production rather than from the examples the
  // review named, so every boundary is pinned in both directions and a future widening of the
  // permitted set fails here first.
  //   Char ::= #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
  const codePoints = [
    [0x0, false], [0x8, false], [0x9, true], [0xa, true], [0xb, false], [0xc, false],
    [0xd, true], [0xe, false], [0x1f, false], [0x20, true],
    [0xd7ff, true], [0xd800, false], [0xdfff, false], [0xe000, true],
    [0xfffd, true], [0xfffe, false], [0xffff, false],
    [0x10000, true], [0x10ffff, true], [0x110000, false],
  ];

  for (const [code, valid] of codePoints) {
    const hex = `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
    it(`${hex} in character data is ${valid ? 'accepted' : 'REJECTED, not replaced'}`, () => {
      const { ok, findings } = scanOne(WRAP(`<title>a&#x${code.toString(16)};b</title>`));
      expect(ok).toBe(valid);
      if (!valid) expect(findings.join('\n')).toMatch(/not well-formed XML/);
    });

    it(`${hex} in an attribute value is ${valid ? 'accepted' : 'REJECTED, not replaced'}`, () => {
      const { ok } = scanOne(WRAP(`<rect id="a&#x${code.toString(16)};b" width="1" height="1"/>`));
      expect(ok).toBe(valid);
    });
  }

  it('rejects the decimal spelling of an invalid code point too', () => {
    const { ok, findings } = scanOne(WRAP('<title>a&#0;b</title>'));
    expect(ok).toBe(false);
    expect(findings.join('\n')).toMatch(/not well-formed XML/);
  });

  it('never emits U+FFFD as a repair — a decoded value is what the file actually contained', () => {
    // U+FFFD is itself a legal character, so it must still DECODE. What is forbidden is
    // synthesizing one in place of something invalid. If this ever fails, the substitution
    // behaviour has come back.
    expect(scanOne(WRAP('<title>a&#xFFFD;b</title>')).findings).toEqual([]);
    expect(scanOne(WRAP('<title>a&#xFFFE;b</title>')).ok).toBe(false);
  });
});

describe('assert-svg-safe — one character, one verdict, either spelling (review APTR-04-c3)', () => {
  // THE FINDING — the Char production was enforced on the ENCODED form only. `&#1;` was
  // rejected while a raw 0x01 byte in the same position was accepted: one forbidden character,
  // two spellings, one checked. Both paths now share `isXmlChar`, and this suite asserts the
  // property is about the CHARACTER rather than about how it was written.
  //
  // Surrogates are deliberately absent from the symmetry table below and covered at the UTF-8
  // layer instead: a lone surrogate cannot exist in a UTF-8 file at all, so there is no literal
  // spelling of one to compare against. Writing a JS string containing one encodes it as U+FFFD
  // before it ever reaches disk — a test asserting otherwise would be testing Node, not this gate.
  const codePoints = [
    [0x0, false], [0x8, false], [0x9, true], [0xa, true], [0xb, false], [0xc, false],
    [0xd, true], [0xe, false], [0x1f, false], [0x20, true],
    [0xd7ff, true], [0xe000, true],
    [0xfffd, true], [0xfffe, false], [0xffff, false],
    [0x10000, true], [0x10ffff, true],
  ];

  for (const [code, valid] of codePoints) {
    const hex = `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;

    it(`${hex} written LITERALLY in text is ${valid ? 'accepted' : 'REJECTED'}`, () => {
      const { ok, findings } = scanOne(WRAP(`<title>a${String.fromCodePoint(code)}b</title>`));
      expect(ok).toBe(valid);
      if (!valid) expect(findings.join('\n')).toMatch(/not well-formed XML/);
    });

    it(`${hex} written LITERALLY in an attribute value is ${valid ? 'accepted' : 'REJECTED'}`, () => {
      const svg = WRAP(`<rect id="a${String.fromCodePoint(code)}b" width="1" height="1"/>`);
      expect(scanOne(svg).ok).toBe(valid);
    });

    it(`${hex} written LITERALLY in a comment is ${valid ? 'accepted' : 'REJECTED'}`, () => {
      const svg = WRAP(`<!--a${String.fromCodePoint(code)}b--><title>x</title>`);
      expect(scanOne(svg).ok).toBe(valid);
    });

    it(`${hex} written LITERALLY in CDATA is ${valid ? 'accepted' : 'REJECTED'}`, () => {
      const svg = WRAP(`<title><![CDATA[a${String.fromCodePoint(code)}b]]></title>`);
      expect(scanOne(svg).ok).toBe(valid);
    });

    // The standing symmetry check. If either path is ever widened or narrowed alone, this fails
    // — which is the guard the original finding needed and did not have.
    it(`${hex} gets the SAME verdict literally and as a character reference`, () => {
      const literal = scanOne(WRAP(`<title>a${String.fromCodePoint(code)}b</title>`)).ok;
      const escaped = scanOne(WRAP(`<title>a&#x${code.toString(16)};b</title>`)).ok;
      expect(literal).toBe(escaped);
      expect(literal).toBe(valid);
    });
  }
});

describe('assert-svg-safe — strict UTF-8, no lenient repair (review APTR-04-c3)', () => {
  // Found while probing the finding above: `readFileSync(f, 'utf8')` replaces an invalid byte
  // sequence with U+FFFD, and U+FFFD is a legal XML character — so a file containing malformed
  // UTF-8 decoded into a well-formed document and passed. Same lossy-repair shape as the
  // character-reference bug, one layer out, with the platform's decoder doing the repairing.
  const doc = (mid) => Buffer.concat([
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>a', 'utf8'),
    mid,
    Buffer.from('b</title></svg>', 'utf8'),
  ]);

  const scanBytes = (buf) => {
    const root = mkdtempSync(path.join(tmpdir(), 'aperture-svg-safe-'));
    try {
      mkdirSync(path.join(root, 'assets'), { recursive: true });
      writeFileSync(path.join(root, 'assets', 'probe.svg'), buf);
      return assertSvgSafe({ root, dirs: ['assets'] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  };

  const malformed = [
    ['a WTF-8 lone surrogate (ED A0 80)', [0xed, 0xa0, 0x80]],
    ['an invalid sequence (C3 28)', [0xc3, 0x28]],
    ['an overlong NUL (C0 80)', [0xc0, 0x80]],
    ['a truncated sequence (E2 82)', [0xe2, 0x82]],
    ['a bare continuation byte (80)', [0x80]],
  ];

  for (const [label, bytes] of malformed) {
    it(`rejects ${label} rather than decoding it to U+FFFD`, () => {
      const { ok, findings } = scanBytes(doc(Buffer.from(bytes)));
      expect(ok).toBe(false);
      expect(findings.join('\n')).toMatch(/not valid UTF-8/);
    });
  }

  it('still accepts a valid astral character', () => {
    expect(scanBytes(doc(Buffer.from('\u{10348}', 'utf8'))).findings).toEqual([]);
  });

  it('still accepts a genuine U+FFFD that was actually in the file', () => {
    expect(scanBytes(doc(Buffer.from('�', 'utf8'))).findings).toEqual([]);
  });
});

describe('assert-svg-safe — XML S, not JavaScript whitespace (review APTR-04-c4)', () => {
  // THE FINDING — the tokenizer used `/\s/` and `String.prototype.trim()`, so JavaScript's
  // notion of whitespace stood in for XML's `S` production. `<svg width="1">` and a
  // document led by U+2028 both parsed as well-formed when they are not.
  //
  // This is the third finding running with the same shape: a host-language or platform default
  // standing in for the specification's own definition. The class is now spelled out, and the
  // property test below asserts it IS the production rather than trusting the regexp literal.

  const S_CHARS = [0x20, 0x09, 0x0a, 0x0d];
  const NS = 'xmlns="http://www.w3.org/2000/svg"';

  // Accepted by JavaScript's \s but NOT by XML's S. U+0085 is included even though it was
  // already rejected before this change — it was rejected incidentally, because JS's \s happens
  // not to contain it, not because anything modelled XML. It is now rejected BY RULE.
  const notXmlSpace = [
    ['U+00A0 no-break space', 0x00a0],
    ['U+0085 next line', 0x0085],
    ['U+2028 line separator', 0x2028],
    ['U+2029 paragraph separator', 0x2029],
    ['U+FEFF zero-width no-break space', 0xfeff],
    ['U+3000 ideographic space', 0x3000],
    ['U+200A hair space', 0x200a],
  ];

  const positions = {
    'between attributes': (w) => `<svg ${NS}${w}viewBox="0 0 10 10"><title>x</title></svg>`,
    'before the root element': (w) => `${w}<svg ${NS} viewBox="0 0 10 10"><title>x</title></svg>`,
    'inside an end tag': (w) => `<svg ${NS} viewBox="0 0 10 10"><title>x</title${w}></svg>`,
    'around an = sign': (w) => `<svg ${NS} viewBox${w}=${w}"0 0 10 10"><title>x</title></svg>`,
  };

  for (const [label, code] of notXmlSpace) {
    for (const [position, build] of Object.entries(positions)) {
      it(`rejects ${label} ${position}`, () => {
        // U+FEFF leading the document is the one legitimate exception — it is an encoding
        // signature there, not whitespace — and is covered by its own tests below.
        if (code === 0xfeff && position === 'before the root element') return;
        expect(scanOne(build(String.fromCodePoint(code))).ok).toBe(false);
      });
    }
  }

  for (const code of S_CHARS) {
    const hex = `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
    for (const [position, build] of Object.entries(positions)) {
      it(`still accepts ${hex} ${position}`, () => {
        expect(scanOne(build(String.fromCodePoint(code))).findings).toEqual([]);
      });
    }
  }

  // The class itself, as a property rather than a restatement. Swept rather than enumerated, so
  // widening the regexp by any character fails here — including one nobody thought to list.
  it('XML_S matches exactly the four characters of the S production and nothing else', () => {
    for (let code = 0; code <= 0x3001; code += 1) {
      expect(registries.XML_S.test(String.fromCodePoint(code))).toBe(S_CHARS.includes(code));
    }
  });

  it('CSS_WS is the CSS set — the same four plus the form feed, and nothing else', () => {
    const cssSet = [0x20, 0x09, 0x0a, 0x0c, 0x0d];
    for (let code = 0; code <= 0x3001; code += 1) {
      expect(registries.CSS_WS.test(String.fromCodePoint(code))).toBe(cssSet.includes(code));
    }
  });

  it('the two classes are deliberately different — CSS includes U+000C, XML does not', () => {
    expect(registries.CSS_WS.test('\f')).toBe(true);
    expect(registries.XML_S.test('\f')).toBe(false);
  });
});

describe('assert-svg-safe — the byte order mark is handled on purpose (review APTR-04-c4)', () => {
  // TextDecoder removes a leading U+FEFF by DEFAULT. That is one more platform default quietly
  // editing the input, so the decoder is constructed with `ignoreBOM: true` and exactly one
  // leading BOM is stripped explicitly, where it can be read and tested.
  const BOM = '﻿';
  const doc = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>x</title></svg>';

  it('accepts a single leading BOM — an encoding signature, not character data', () => {
    expect(scanOne(BOM + doc).findings).toEqual([]);
  });

  it('rejects a SECOND leading BOM — only one is a signature', () => {
    expect(scanOne(BOM + BOM + doc).ok).toBe(false);
  });

  it('accepts U+FEFF inside character data — there it is a legal XML Char', () => {
    expect(scanOne(doc.replace('<title>x', `<title>x${BOM}`)).findings).toEqual([]);
  });

  it('rejects U+FEFF in markup whitespace position — there it is not S', () => {
    expect(scanOne(doc.replace('<svg ', `<svg${BOM}`)).ok).toBe(false);
  });

  it('accepts a document with no BOM at all', () => {
    expect(scanOne(doc).findings).toEqual([]);
  });
});

describe('assert-svg-safe — scheme detection sees past ignorable characters (review APTR-04-c5)', () => {
  // THE FINDING — `normalizeUri`'s comment claimed it stripped C0 AND C1 controls while the
  // code stripped only C0. C1 was the half that mattered: every C1 control is a valid XML
  // `Char`, so `<rect fill="&#x85;javascript:…">` was well-formed, passed the value grammar,
  // and shipped with its scheme unseen. C0 controls never reach this code at all — they are
  // not valid `Char`s, so the parser rejects the file first.
  //
  // The defect was not the decision to keep a broad class here; that reasoning was right. It
  // was that the justification and the mechanism disagreed, in a comment written specifically
  // to stop a future reviewer from re-litigating it.
  const payload = 'javascript:x=1'; // no parentheses: isolates the scheme rule from the function allowlist
  const scan = (prefixCode) =>
    scanOne(WRAP(`<rect fill="&#x${prefixCode.toString(16)};${payload}" width="1" height="1"/>`));

  const detectsScheme = (result) =>
    result.findings.some((f) => /forbidden "javascript:" URI/.test(f));

  // Derived over the whole C1 range rather than the three values the review named, so a gap
  // anywhere in it fails rather than only at the sampled points.
  for (let code = 0x80; code <= 0x9f; code += 1) {
    const hex = `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
    it(`sees a scheme behind ${hex} (C1 control)`, () => {
      expect(detectsScheme(scan(code))).toBe(true);
    });
  }

  for (const [label, code] of [['U+0020 space', 0x20], ['U+0009 tab', 0x09], ['U+007F DEL', 0x7f]]) {
    it(`sees a scheme behind ${label}`, () => {
      expect(detectsScheme(scan(code))).toBe(true);
    });
  }

  for (const [label, code] of [
    ['U+00A0', 0x00a0], ['U+2028', 0x2028], ['U+2029', 0x2029], ['U+FEFF', 0xfeff],
  ]) {
    it(`sees a scheme behind ${label} (Unicode whitespace)`, () => {
      expect(detectsScheme(scan(code))).toBe(true);
    });
  }

  for (const [label, code] of [['U+0001', 0x01], ['U+001F', 0x1f]]) {
    // A C0 control never reaches scheme detection at all, in either spelling — which is why
    // stripping C0 here was dead code and C1 was the half that mattered. The two spellings are
    // rejected by different rules and so carry different messages: escaped, by the per-attribute
    // character-reference decoder; literal, by the whole-document parser scan. Both name the
    // Char production, and both refuse the file.
    it(`rejects ${label} (C0) as an escaped reference, before scheme detection`, () => {
      const result = scan(code);
      expect(result.ok).toBe(false);
      expect(result.findings.join('\n')).toMatch(/Char production/);
    });

    it(`rejects ${label} (C0) written literally, before scheme detection`, () => {
      const svg = WRAP(`<rect fill="${String.fromCodePoint(code)}${payload}" width="1" height="1"/>`);
      const result = scanOne(svg);
      expect(result.ok).toBe(false);
      expect(result.findings.join('\n')).toMatch(/Char production/);
    });
  }

  // THE NEGATIVE PIN. A wider match is only a fix if it costs no precision, so the widening is
  // validated in both directions: an ordinary character must NOT be stripped, or every value
  // containing the letters of a scheme anywhere would start reporting one.
  it('does NOT strip an ordinary character — "xjavascript:" is not a scheme', () => {
    const result = scanOne(WRAP(`<rect fill="x${payload}" width="1" height="1"/>`));
    expect(detectsScheme(result)).toBe(false);
    expect(result.ok).toBe(true);
  });

  it('does NOT report a scheme for a value that merely contains the word', () => {
    const result = scanOne(WRAP('<rect fill="not-a-javascript-colour" width="1" height="1"/>'));
    expect(detectsScheme(result)).toBe(false);
    expect(result.ok).toBe(true);
  });
});

describe('assert-svg-safe — the allowlist is what enforces, not the named hazards', () => {
  // The named-hazard map exists only to produce a good message. If it were doing the
  // enforcing, a dangerous element nobody listed would pass — which is the enumeration bug the
  // gate's header says it is inverting. These two elements are real SVG, genuinely capable of
  // resolving an external document, and deliberately absent from the named-hazard map.
  it('rejects <feImage>-style filter primitives that have no named rule', () => {
    const { ok, findings } = scanOne(WRAP('<filter id="f"><feGaussianBlur stdDeviation="2"/></filter>'));
    expect(ok).toBe(false);
    expect(findings.join('\n')).toMatch(/<filter> is not in the reviewed element registry/);
    expect(findings.join('\n')).toMatch(/<feGaussianBlur> is not in the reviewed element registry/);
  });

  it('rejects an element that does not exist yet', () => {
    const { ok, findings } = scanOne(WRAP('<somethingSvgGainsIn2030 x="1"/>'));
    expect(ok).toBe(false);
    expect(findings.join('\n')).toMatch(/<somethingSvgGainsIn2030> is not in the reviewed element registry/);
  });
});

describe('assert-svg-safe — the two claims its neighbours do not make', () => {
  // `assert-no-external-hosts.mjs` and `adherence-lint.mjs` both document that an attribute
  // value containing `>` desynchronizes their markup scanner and that detection after that
  // point is unmodelled. This gate claims the opposite, so the claim is pinned here. If this
  // test ever goes red, the header comment is wrong and must be narrowed to match.
  it('is NOT desynchronized by a ">" inside an attribute value', () => {
    const svg = WRAP('<rect aria-label="a &gt; b" width="1" height="1"/><script>alert(1)</script>');
    const { ok, findings } = scanOne(svg);
    expect(ok).toBe(false);
    expect(findings.join('\n')).toMatch(/<script> is forbidden/);
  });

  it('is NOT desynchronized by a literal ">" inside a single-quoted attribute value', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">'
      + "<rect aria-label='a > b' width='1' height='1'/><script>alert(1)</script></svg>";
    const { ok, findings } = scanOne(svg);
    expect(ok).toBe(false);
    expect(findings.join('\n')).toMatch(/<script> is forbidden/);
  });

  // The egress lint documents "HTML character references are not decoded" as a non-goal. This
  // gate decodes them, so the case that lint cannot see is caught here.
  it('decodes character references before inspecting a scheme', () => {
    const { ok, findings } = scanOne(WRAP('<use href="&#106;avascript&#58;alert(1)"/>'));
    expect(ok).toBe(false);
    expect(findings.join('\n')).toMatch(/forbidden "javascript:" URI/);
  });

  it('strips control characters before comparing a scheme', () => {
    const { ok, findings } = scanOne(WRAP('<use href="java&#10;script:alert(1)"/>'));
    expect(ok).toBe(false);
    expect(findings.join('\n')).toMatch(/forbidden "javascript:" URI/);
  });

  it('rejects an entity reference it cannot resolve rather than passing it through', () => {
    const { ok, findings } = scanOne(WRAP('<rect fill="&mystery;" width="1" height="1"/>'));
    expect(ok).toBe(false);
    expect(findings.join('\n')).toMatch(/unknown entity reference/);
  });
});

describe('assert-svg-safe — fails closed', () => {
  const malformed = [
    ['an unclosed element', '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1">'],
    ['a mismatched end tag', WRAP('<g><rect width="1" height="1"/></defs>')],
    ['an unquoted attribute value', '<svg xmlns="http://www.w3.org/2000/svg"><rect width=1 /></svg>'],
    ['a bare attribute', '<svg xmlns="http://www.w3.org/2000/svg"><rect hidden /></svg>'],
    ['a duplicate attribute', WRAP('<rect width="1" width="2"/>')],
    ['two attributes with no whitespace between them', '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1"height="2"/></svg>'],
    ['content after the root element', WRAP('<rect width="1" height="1"/>') + '<rect/>'],
    ['character data outside the root', 'stray' + WRAP('<rect width="1" height="1"/>')],
    ['an unterminated comment', '<svg xmlns="http://www.w3.org/2000/svg"><!-- oops </svg>'],
    ['a non-XML file', 'this is not markup at all'],
  ];

  for (const [label, svg] of malformed) {
    it(`treats ${label} as a FAILURE, never a skip`, () => {
      const { ok, findings } = scanOne(svg);
      expect(ok).toBe(false);
      expect(findings.join('\n')).toMatch(/UNCHECKED|not well-formed XML|no elements/);
    });
  }

  it('fails on an empty asset rather than reporting a clean scan', () => {
    const { ok, findings } = scanOne('   \n  ');
    expect(ok).toBe(false);
    expect(findings.join('\n')).toMatch(/file is empty/);
  });

  it('fails when a scan directory does not exist', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'aperture-svg-safe-'));
    try {
      const { ok, findings } = assertSvgSafe({ root, dirs: ['does-not-exist'] });
      expect(ok).toBe(false);
      expect(findings.join('\n')).toMatch(/scan target could not be read/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when a scan directory exists but holds no assets — an empty scan is not a pass', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'aperture-svg-safe-'));
    try {
      mkdirSync(path.join(root, 'assets'));
      const { ok, findings } = assertSvgSafe({ root, dirs: ['assets'] });
      expect(ok).toBe(false);
      expect(findings.join('\n')).toMatch(/contains no \.svg files/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('assert-svg-safe — what must keep passing', () => {
  // A gate that rejects legitimate input gets switched off. These pin the cases the item
  // explicitly requires to remain permitted.
  it('permits a same-document xlink:href fragment', () => {
    expect(scanOne(WRAP('<use xlink:href="#ap-housing"/>', 'xmlns:xlink="http://www.w3.org/1999/xlink"')).findings).toEqual([]);
  });

  it('permits a same-document href fragment', () => {
    expect(scanOne(WRAP('<use href="#ap-housing"/>')).findings).toEqual([]);
  });

  it('permits a functional IRI in fill, clip-path and marker-end', () => {
    const svg = WRAP('<rect fill="url(#g)" clip-path="url(#c)" marker-end="url(#m)" width="1" height="1"/>');
    expect(scanOne(svg).findings).toEqual([]);
  });

  it('permits a <style> body with a prefers-color-scheme rule — the wordmark case', () => {
    const svg = WRAP('<style>.n{fill:#F4F2FB}@media (prefers-color-scheme: light){.n{fill:#1A1333}}</style>');
    expect(scanOne(svg).findings).toEqual([]);
  });

  it('permits the XML declaration when it leads the document', () => {
    expect(scanOne('<?xml version="1.0" encoding="UTF-8"?>' + WRAP('<rect width="1" height="1"/>')).findings).toEqual([]);
  });
});

describe('assert-svg-safe — derived over the real asset set', () => {
  // Derived, not enumerated: every asset the gate scans gets these cases, so a new asset is
  // covered the moment it is committed rather than when somebody remembers to add a test.
  for (const abs of realAssets()) {
    const rel = path.relative(REPO_ROOT, abs);

    it(`${rel} — injecting a <script> makes the gate go RED`, () => {
      const original = readFileSync(abs, 'utf8');
      const tampered = original.replace('</svg>', '<script>alert(1)</script></svg>');
      expect(tampered).not.toBe(original); // the injection actually happened
      const { ok, findings } = scanOne(tampered);
      expect(ok).toBe(false);
      expect(findings.join('\n')).toMatch(/<script> is forbidden/);
    });

    it(`${rel} — injecting an onload handler makes the gate go RED`, () => {
      const original = readFileSync(abs, 'utf8');
      const tampered = original.replace('<svg ', '<svg onload="alert(1)" ');
      expect(tampered).not.toBe(original);
      const { ok, findings } = scanOne(tampered);
      expect(ok).toBe(false);
      expect(findings.join('\n')).toMatch(/event-handler attribute/);
    });

    it(`${rel} — is self-contained: no external reference of any kind`, () => {
      expect(scanOne(readFileSync(abs, 'utf8'), path.basename(abs)).findings).toEqual([]);
    });
  }
});
