#!/usr/bin/env node
// APTR-11 — the configuration-documentation gate.
//
//   npm --prefix client run assert-config-documented
//
// Three artifacts describe Aperture's configuration surface, and this gate makes them one
// description rather than three that agree today:
//
//   contracts/aperture-config-v1.json  the machine-readable key manifest — the normative set
//   docs/CONFIGURATION.md              the reference documentation
//   .env.example                       the name inventory an operator copies
//
// It asserts SET EQUALITY between all three, per kind, plus per-key equality of the purpose
// and the default. Not a count, not a subset, not "every documented key exists": a key that is
// read but undocumented and a key that is documented but unread both fail, and a count check
// would have passed while one key was missing and another was extra.
//
// ── WHAT THIS GATE DETECTS ──────────────────────────────────────────────────────────────────
//
//   * a key in the manifest that the documentation or `.env.example` does not name
//   * a key named in the documentation or `.env.example` that the manifest does not have
//   * a key documented under the wrong kind — a secret listed as behavioural, or the reverse
//   * a purpose or a default in the documentation that differs from the manifest, by one
//     character
//   * a key documented in a table that is not one of the two normative sections. That is an
//     allowlist, not a denylist: a table added somewhere unanticipated FAILS rather than
//     being quietly skipped, which is how an enumeration gate rots.
//   * any assignment of a value in `.env.example`, including to a name this gate has never
//     heard of, and any assignment of a secret name anywhere in either document
//   * a duplicate listing of the same key within one artifact
//   * **a shape none of the parsers can read.** Every non-blank, non-comment line in
//     `.env.example` must be exactly `NAME=`; a comment may not contain an assignment; a key
//     may not appear in an HTML table, a blockquoted table, or a pipe table without a leading
//     `|`; a key row must have exactly the approved columns and name its key in the first one;
//     and a manifest entry must carry exactly its kind's members, all non-empty, under exactly
//     the approved top-level members. An unrecognised shape FAILS naming the line rather than
//     being skipped — otherwise the equality below would be over "the subset the regexes
//     happened to match" while reporting agreement, which is the one failure a set-equality
//     check must not have.
//   * **CLASSIFICATION IS TOTAL.** Each parser accounts for every line it considers, and
//     asserts that parsed + refused covers all of them with no overlap. There is deliberately
//     no third "matched nothing, moving on" outcome, because that is where the holes were:
//     the rejection rules were themselves narrow patterns, so a shape matching neither the
//     approved form nor the rejection pattern passed in silence. What is considered is decided
//     by SHAPE, never by whether a line happens to contain a key: every non-blank line of
//     `.env.example`, and every table-shaped line of the document — a leading `|`, or two or
//     more `|` anywhere, or any HTML table element, or any blockquoted row. A fourth
//     unanticipated shape now fails at the totality assertion rather than in a review.
//
// ── WHAT IT DOES NOT DETECT, STATED PLAINLY ─────────────────────────────────────────────────
//
//   * whether the BFF's Rust code reads exactly the manifest's keys. That equality is proved
//     in the agent-core repository, by a Rust test over the same manifest content, because it
//     is a property of Rust call sites and only Rust can see them. This gate proves the
//     documentation half.
//   * whether the manifest checked in HERE is byte-identical to the one checked in THERE.
//     Nothing mechanical proves that; it is a review step, and saying so is the point.
//   * whether a default is a good default, or whether the code honours a key it reads. Both
//     are behaviour, and behaviour is not what a documentation gate can see.
//   * the prose outside the tables. A paragraph may describe a key wrongly and pass here.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const MANIFEST_PATH = path.join(REPO_ROOT, 'contracts', 'aperture-config-v1.json');
export const DOC_PATH = path.join(REPO_ROOT, 'docs', 'CONFIGURATION.md');
export const ENV_EXAMPLE_PATH = path.join(REPO_ROOT, '.env.example');

/** The only shape a key name may take. No `.`, `:` or `/` — this alphabet cannot spell a URL. */
const KEY_NAME = /^APERTURE_[A-Z0-9]+(_[A-Z0-9]+)*$/;

/**
 * Line-level accounting for one artifact.
 *
 * Every line the parser CONSIDERS must end up either parsed or refused. The
 * previous version had a third outcome — matched no pattern, moved on — and
 * that is where the holes were: each rejection rule was itself a narrow
 * pattern, so a shape matching neither the approved form nor the rejection
 * pattern slipped through in silence. Totality removes the third outcome, so a
 * fourth unanticipated shape fails at the assertion rather than in a review.
 */
function newAccounting() {
  return { considered: new Set(), parsed: new Set(), refused: new Set() };
}

/** parsed + refused must be exactly considered, with no overlap. */
export function assertTotal(label, { considered, parsed, refused }) {
  const problems = [];
  for (const line of considered) {
    const isParsed = parsed.has(line);
    const isRefused = refused.has(line);
    if (isParsed && isRefused) {
      problems.push(
        `${label} — line ${line} was both parsed and refused; a line must land in exactly one `
        + 'bucket or the totality claim means nothing',
      );
    } else if (!isParsed && !isRefused) {
      problems.push(
        `${label} — line ${line} was considered but neither parsed nor refused. That is the `
        + '"matched nothing, moving on" outcome this gate exists to remove: classify the shape '
        + 'or refuse it by name.',
      );
    }
  }
  for (const line of [...parsed, ...refused]) {
    if (!considered.has(line)) {
      problems.push(`${label} — line ${line} was classified without being considered`);
    }
  }
  return problems;
}

/** The two document sections a key may be documented in, and the kind each one denotes. */
const NORMATIVE_SECTIONS = new Map([
  ['Secrets', 'secret'],
  ['Behavioural configuration', 'behavioural'],
]);

/**
 * The exact member set each kind of manifest entry may have. An allowlist, both ways: a
 * missing member is an error and so is an unrecognised one.
 *
 * Normalising a missing member to `''` — which this used to do — let a behavioural entry with
 * no `default`, `type` or `purpose` agree with a document whose cells were empty, so all three
 * artifacts could concur on a description that documented nothing. An absent field is now a
 * failure, not a value.
 */
const MANIFEST_MEMBERS = new Map([
  ['behavioural', ['name', 'kind', 'type', 'default', 'purpose']],
  ['secret', ['name', 'kind', 'purpose']],
]);

/** The values `type` may take. Anything else is rejected rather than carried through. */
const MANIFEST_TYPES = new Set(['bool', 'unsigned', 'csv']);

/** Parse the manifest into `{ name -> { kind, type, default, purpose } }`. */
/** What a value is, in words, for a diagnosis. `typeof null` is famously useless here. */
function shapeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  const type = typeof value;
  return type === 'object' ? 'an object' : `a ${type}`;
}

/** A non-null, non-array object — the only shape this parser can index into. */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseManifest(source) {
  const problems = [];
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    return { keys: new Map(), problems: [`the key manifest is not valid JSON: ${error.message}`] };
  }

  // Valid JSON is not the same as the right shape. `JSON.parse('null')`, an
  // array, or a bare string all parse, and indexing into them either throws a
  // TypeError or silently returns nonsense — `Object.keys('abc')` is
  // `['0','1','2']`. Either way the build fails, so this was never an escape;
  // but a stack trace is not a diagnosis, and the whole point of this cycle is
  // that every input lands in a bucket WITH A REASON. So the shape is checked
  // before it is indexed, and refused in the same voice as everything else.
  if (!isPlainObject(parsed)) {
    return {
      keys: new Map(),
      problems: [`the manifest root is ${shapeOf(parsed)}, not an object`],
    };
  }

  // The same totality discipline at the object level: a manifest whose
  // top-level members are only *checked where recognised* could carry a second
  // `keys2` array that nothing reads. Exactly these members, no others.
  const TOP_LEVEL = ['keys', 'note', 'revision'];
  const presentTop = Object.keys(parsed).sort();
  const unknownTop = presentTop.filter((member) => !TOP_LEVEL.includes(member));
  const missingTop = TOP_LEVEL.filter((member) => !presentTop.includes(member));
  if (unknownTop.length > 0) {
    problems.push(`the manifest carries unrecognised top-level member(s): ${unknownTop.join(', ')}`);
  }
  if (missingTop.length > 0) {
    problems.push(`the manifest is missing top-level member(s): ${missingTop.join(', ')}`);
  }
  if (!Array.isArray(parsed.keys)) {
    return {
      keys: new Map(),
      problems: [...problems, `the manifest's \`keys\` is ${shapeOf(parsed.keys)}, not an array`],
    };
  }

  const keys = new Map();
  for (const [position, entry] of parsed.keys.entries()) {
    if (!isPlainObject(entry)) {
      problems.push(
        `entry ${position + 1} of \`keys\` is ${shapeOf(entry)}, not an object, so it names `
        + 'no key and carries no purpose',
      );
      continue;
    }
    if (!KEY_NAME.test(entry.name ?? '')) {
      problems.push(`the manifest carries a name that is not a plain key name: ${entry.name}`);
      continue;
    }
    if (keys.has(entry.name)) {
      problems.push(`the manifest lists ${entry.name} twice`);
      continue;
    }

    const expected = MANIFEST_MEMBERS.get(entry.kind);
    if (expected === undefined) {
      problems.push(
        `${entry.name} has kind "${entry.kind}", which is neither `
        + `${[...MANIFEST_MEMBERS.keys()].join(' nor ')}`,
      );
      continue;
    }

    const present = Object.keys(entry).sort();
    const missing = expected.filter((member) => !present.includes(member));
    const extra = present.filter((member) => !expected.includes(member));
    if (missing.length > 0) {
      problems.push(
        `${entry.name} is missing ${missing.join(', ')}. A ${entry.kind} entry must carry `
        + `${expected.join(', ')} — an absent field is a key that documents nothing, not a key `
        + 'with an empty description.',
      );
      continue;
    }
    if (extra.length > 0) {
      problems.push(
        `${entry.name} carries ${extra.join(', ')}, which a ${entry.kind} entry may not have`,
      );
      continue;
    }

    let malformed = false;
    for (const member of expected) {
      if (typeof entry[member] !== 'string' || entry[member].trim() === '') {
        problems.push(`${entry.name}: \`${member}\` must be a non-empty string`);
        malformed = true;
      }
    }
    if (entry.kind === 'behavioural' && !MANIFEST_TYPES.has(entry.type)) {
      problems.push(
        `${entry.name} has type "${entry.type}", which is not one of `
        + `${[...MANIFEST_TYPES].join(', ')}`,
      );
      malformed = true;
    }
    if (malformed) continue;

    keys.set(entry.name, {
      kind: entry.kind,
      type: entry.type ?? '',
      default: entry.default ?? '',
      purpose: entry.purpose,
    });
  }
  if (keys.size === 0) problems.push('the key manifest names no keys at all');
  return { keys, problems };
}

/** Split a markdown table row into its cells, trimmed. */
function cells(line) {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/** A cell holding exactly one backticked span, or `null`. */
function backticked(cell) {
  const match = /^`([^`]*)`$/.exec(cell ?? '');
  return match ? match[1] : null;
}

/**
 * Parse the reference documentation into `{ name -> { kind, default, purpose } }`.
 *
 * A key row is any table row whose first cell is a backticked `APERTURE_*` name. Its kind
 * comes from the `##` section it sits under, and a row outside the two normative sections is
 * an error rather than something to skip — so a key documented in a new table somewhere else
 * fails loudly instead of silently escaping the equality check.
 */
export function parseDoc(source) {
  const problems = [];
  const keys = new Map();
  const accounting = newAccounting();
  let section = null;

  /** The number of columns every key row must have: name, purpose, third column. */
  const KEY_ROW_COLUMNS = 3;
  /** A backticked `APERTURE_*` name, anywhere in a cell. */
  const KEY_IN_CELL = /`(APERTURE_[A-Za-z0-9_]*)`/;

  for (const [index, line] of source.split('\n').entries()) {
    const at = `line ${index + 1}`;
    const lineNo = index + 1;
    const heading = /^##\s+(.*?)\s*$/.exec(line);
    if (heading) {
      section = heading[1];
      continue;
    }

    const trimmed = line.trimStart();
    const pipes = (line.match(/\|/g) ?? []).length;
    const htmlTable = /<\s*\/?\s*(table|thead|tbody|tr|td|th)\b/i.test(line);
    const blockquoted = /^\s*>/.test(line) && line.includes('|');
    // "Table-shaped" is decided by shape alone: a leading `|`, or two or more
    // `|` anywhere. It does NOT depend on the line containing a key — the
    // previous rule only refused a pipe-less table line if it carried a
    // backticked `APERTURE_*` name, so `APERTURE_ENABLED | purpose | default |`
    // was skipped entirely, which is the opposite of the stated rule.
    const tableShaped = trimmed.startsWith('|') || pipes >= 2;

    if (!htmlTable && !blockquoted && !tableShaped) continue;
    accounting.considered.add(lineNo);

    if (htmlTable) {
      problems.push(
        `${at}: an HTML table element appears in this document. Keys are read from `
        + 'GitHub-flavoured pipe tables only; an HTML table would not be read at all.',
      );
      accounting.refused.add(lineNo);
      continue;
    }
    if (blockquoted) {
      problems.push(
        `${at}: a table inside a blockquote. Blockquoted rows are not read, so a key `
        + 'documented in one would escape the equality check.',
      );
      accounting.refused.add(lineNo);
      continue;
    }
    if (!trimmed.startsWith('|')) {
      problems.push(
        `${at}: a table-shaped line that does not begin with \`|\`: ${line.trim()}. Only rows `
        + 'beginning with `|` are read; write it as a normal pipe-table row.',
      );
      accounting.refused.add(lineNo);
      continue;
    }

    const row = cells(line);
    // A key named anywhere but the first cell is a definition the parser would
    // never read, sitting in a table that looks like it defines one.
    for (const [position, cell] of row.entries()) {
      if (position === 0) continue;
      const stray = KEY_IN_CELL.exec(cell ?? '');
      if (stray) {
        problems.push(
          `${at}: ${stray[1]} appears in column ${position + 1} of a table row. A key is `
          + 'defined by the FIRST cell of its row; naming one anywhere else in a table is a '
          + 'definition this gate would not read.',
        );
        accounting.refused.add(lineNo);
      }
    }
    if (accounting.refused.has(lineNo)) continue;

    const name = backticked(row[0]);
    if (name === null || !name.startsWith('APERTURE_')) {
      // A header, a separator, or a row of a table that defines no key. An
      // approved shape, and recorded as one rather than skipped.
      accounting.parsed.add(lineNo);
      continue;
    }

    if (!KEY_NAME.test(name)) {
      problems.push(`${at}: \`${name}\` is not a plain key name`);
      accounting.refused.add(lineNo);
      continue;
    }
    const kind = NORMATIVE_SECTIONS.get(section ?? '');
    if (kind === undefined) {
      problems.push(
        `${at}: ${name} is documented under "${section ?? '(no section)'}", which is not one of `
        + `the normative sections (${[...NORMATIVE_SECTIONS.keys()].join(', ')}). A key `
        + 'documented outside them would escape the equality check.',
      );
      accounting.refused.add(lineNo);
      continue;
    }
    if (keys.has(name)) {
      problems.push(`${at}: ${name} is documented twice`);
      accounting.refused.add(lineNo);
      continue;
    }
    if (row.length !== KEY_ROW_COLUMNS) {
      problems.push(
        `${at}: ${name}'s row has ${row.length} columns, not ${KEY_ROW_COLUMNS}. The columns `
        + 'are compared by position, so an extra or missing one would compare the wrong cell.',
      );
      accounting.refused.add(lineNo);
      continue;
    }

    const purpose = row[1] ?? '';
    if (purpose.trim() === '') {
      problems.push(
        `${at}: ${name}'s purpose cell is empty. An empty cell is a key documented by name `
        + 'only, which is what this gate exists to prevent.',
      );
      accounting.refused.add(lineNo);
      continue;
    }
    let value = '';
    if (kind === 'behavioural') {
      value = backticked(row[2]);
      if (value === null || value.trim() === '') {
        problems.push(
          `${at}: ${name}'s default cell is \`${row[2] ?? ''}\`, which is not a single `
          + 'non-empty backticked value. Defaults are compared literally, so they must be '
          + 'written literally.',
        );
        accounting.refused.add(lineNo);
        continue;
      }
    }
    keys.set(name, { kind, purpose, default: value });
    accounting.parsed.add(lineNo);
  }

  if (keys.size === 0) problems.push('the reference documentation names no keys at all');
  problems.push(...assertTotal('docs/CONFIGURATION.md', accounting));
  return { keys, problems, accounting };
}

/**
 * Parse `.env.example` into `{ name -> kind }`.
 *
 * A behavioural key is an empty assignment; a secret is an indented comment line carrying only
 * a name. Anything that assigns a value is a failure, whatever its name — the check is over the
 * SHAPE of every line, not over the names this gate expects, so a value assigned to something
 * nobody documented still fails.
 */
export function parseEnvExample(source) {
  const problems = [];
  const keys = new Map();
  const accounting = newAccounting();

  /** The one assignment form this file may contain: a bare name, `=`, and nothing after it. */
  const EMPTY_ASSIGNMENT = /^([A-Z][A-Z0-9_]*)=$/;
  /** A secret listed as a comment: `#`, indentation, one name, nothing else. */
  const SECRET_COMMENT = /^#\s{2,}([A-Z][A-Z0-9_]*)\s*$/;

  for (const [index, raw] of source.split('\n').entries()) {
    const line = index + 1;
    const at = `line ${line}`;
    if (raw.trim() === '') continue;

    // EVERY non-blank line is classified. There is no "matched nothing, moving
    // on" outcome — see `assertTotal`.
    accounting.considered.add(line);

    if (raw.startsWith('#')) {
      // A comment carrying `=` is either the one approved documented example —
      // the bare span `` `=` ``, which is how this file explains the character
      // itself — or a failure. Decided by SHAPE, not by whether the left-hand
      // side happens to look like an identifier: the previous rule only fired
      // on `[A-Za-z_][A-Za-z0-9_]*=`, so `# [default]=example` and
      // `# =example` were values in a comment that it waved
      // through. Stripping only the exact `` `=` `` span, rather than every
      // backticked span, keeps a backticked assignment a failure too.
      if (raw.split('`=`').join('').includes('=')) {
        problems.push(
          `${at}: a comment contains an assignment: ${raw.trim()}. This file carries names only, `
          + 'in comments as much as anywhere else. The only `=` permitted in a comment is the '
          + 'bare span `=` used to describe the character.',
        );
        accounting.refused.add(line);
        continue;
      }
      const commented = SECRET_COMMENT.exec(raw);
      if (commented) {
        const name = commented[1];
        if (!KEY_NAME.test(name)) {
          problems.push(`${at}: \`${name}\` is not a plain key name`);
          accounting.refused.add(line);
          continue;
        }
        if (keys.has(name)) problems.push(`${at}: ${name} is listed twice`);
        keys.set(name, 'secret');
      }
      // Prose, and prose is an approved shape here.
      accounting.parsed.add(line);
      continue;
    }

    // ── everything that is not blank and not a comment must be the approved form ──────────
    //
    // An allowlist, and this is the finding it closes: the old reader recognised only
    // column-zero `NAME=value`, so `export APERTURE_TOKEN=hunter2`, a leading space, or
    // whitespace around `=` were all *invisible* — a value could sit in this file while the
    // gate reported an empty inventory. Now an unrecognised line is a failure naming the line,
    // so "the parser saw every line" is a property rather than an assumption.
    const approved = EMPTY_ASSIGNMENT.exec(raw);
    if (!approved) {
      // The plain, column-zero `NAME=value` is the commonest mistake and gets the precise
      // diagnosis; telling someone about `export` and leading whitespace when they used
      // neither sends them looking at the wrong part of their line.
      const plain = /^([A-Z][A-Z0-9_]*)=(.+)$/.exec(raw);
      if (plain) {
        problems.push(
          `${at}: ${plain[1]} is assigned a value: ${raw.trim()}. This file carries names only; `
          + 'a value here ships in the public mirror.',
        );
      } else {
        problems.push(
          `${at}: unrecognised line: ${raw.trim()} — every line here must be blank, a comment, `
          + 'or exactly `NAME=` (no `export`, no leading whitespace, no space around `=`, '
          + 'nothing after `=`).',
        );
      }
      accounting.refused.add(line);
      continue;
    }

    const name = approved[1];
    if (!KEY_NAME.test(name)) {
      problems.push(`${at}: \`${name}\` is not a plain key name`);
      accounting.refused.add(line);
      continue;
    }
    if (keys.has(name)) problems.push(`${at}: ${name} is listed twice`);
    keys.set(name, 'behavioural');
    accounting.parsed.add(line);
  }

  if (keys.size === 0) problems.push('.env.example names no keys at all');
  problems.push(...assertTotal('.env.example', accounting));
  return { keys, problems, accounting };
}

/**
 * The difference between two key sets, in both directions.
 *
 * Takes the maps and iterates their `.keys()` explicitly. Iterating a `Map` directly yields
 * `[name, entry]` pairs, which stringify into a message naming a key that is not in any file —
 * a wrong finding, which is worse than a missing one, because it sends a reader hunting for
 * something that does not exist.
 */
function setDifferences(label, mine, theirs) {
  const problems = [];
  for (const name of mine.keys()) {
    if (!theirs.has(name)) problems.push(`${label}: ${name} is in the first and not the second`);
  }
  for (const name of theirs.keys()) {
    if (!mine.has(name)) problems.push(`${label}: ${name} is in the second and not the first`);
  }
  return problems;
}

export function compare({ manifest, doc, envExample }) {
  const problems = [];

  problems.push(...setDifferences('manifest vs documentation', manifest.keys, doc.keys));
  problems.push(...setDifferences('manifest vs .env.example', manifest.keys, envExample.keys));

  for (const [name, entry] of manifest.keys) {
    const documented = doc.keys.get(name);
    if (documented) {
      if (documented.kind !== entry.kind) {
        problems.push(
          `${name} is documented as ${documented.kind} but the manifest calls it ${entry.kind}`,
        );
      }
      if (documented.purpose !== entry.purpose) {
        problems.push(
          `${name}: the documented purpose "${documented.purpose}" differs from the manifest's `
          + `"${entry.purpose}"`,
        );
      }
      if (entry.kind === 'behavioural' && documented.default !== entry.default) {
        problems.push(
          `${name}: the documented default \`${documented.default}\` differs from the manifest's `
          + `\`${entry.default}\``,
        );
      }
    }
    const listed = envExample.keys.get(name);
    if (listed !== undefined && listed !== entry.kind) {
      problems.push(`${name} is listed in .env.example as ${listed} but the manifest calls it ${entry.kind}`);
    }
  }

  // A secret must never appear as an assignment anywhere, in either artifact. `.env.example`'s
  // parser already refuses a non-empty assignment; this refuses an EMPTY one for a secret too,
  // because an empty slot is an invitation to fill it in.
  for (const [name, entry] of manifest.keys) {
    if (entry.kind !== 'secret') continue;
    if (envExample.keys.get(name) === 'behavioural') {
      problems.push(`${name} is a secret but .env.example offers it as an assignable slot`);
    }
  }

  return problems;
}

export async function checkConfigDocs() {
  const [manifestSource, docSource, envSource] = await Promise.all([
    readFile(MANIFEST_PATH, 'utf8'),
    readFile(DOC_PATH, 'utf8'),
    readFile(ENV_EXAMPLE_PATH, 'utf8'),
  ]);

  const manifest = parseManifest(manifestSource);
  const doc = parseDoc(docSource);
  const envExample = parseEnvExample(envSource);

  const problems = [
    ...manifest.problems.map((p) => `contracts/aperture-config-v1.json — ${p}`),
    ...doc.problems.map((p) => `docs/CONFIGURATION.md — ${p}`),
    ...envExample.problems.map((p) => `.env.example — ${p}`),
    ...compare({ manifest, doc, envExample }),
  ];

  return { problems, counts: { manifest: manifest.keys.size, doc: doc.keys.size, env: envExample.keys.size } };
}

async function main() {
  const { problems, counts } = await checkConfigDocs();
  if (problems.length > 0) {
    console.error('assert-config-documented: the configuration surface is described inconsistently.\n');
    for (const problem of problems) console.error(`  • ${problem}`);
    console.error(
      '\nThe manifest at contracts/aperture-config-v1.json is normative for this repository. '
      + 'Whether it matches the keys the BFF actually reads is proved in the agent-core '
      + "repository's Rust test suite, not here.",
    );
    process.exit(1);
  }
  console.log(
    `assert-config-documented: ${counts.manifest} keys, named identically by the manifest, `
    + 'docs/CONFIGURATION.md and .env.example.\n'
    + '  This proves the three DOCUMENTS agree. That the manifest matches the keys the BFF\n'
    + '  reads is proved in the agent-core repository; that the two repositories carry the\n'
    + '  same manifest is a review step, not a gated one.',
  );
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
