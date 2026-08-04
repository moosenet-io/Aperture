// APTR-11 — tests for the configuration-documentation gate.
//
// Two halves, and the second is the one that matters:
//
//   1. The gate passes over the REAL files in this repository. That is the regression test.
//   2. The gate FAILS over each mutation it exists to catch, one at a time, over fixtures.
//      A gate nobody has watched fail is unverified — and the mutations here are the ones
//      that would otherwise ship: a key in one artifact and not another, a default that
//      drifted by one digit, a description reworded in the document only, a secret offered as
//      an assignable slot, a value left in `.env.example`, and a key moved to a table the
//      parser was never told about.
//
// The fixtures are derived from the real files where possible rather than written out, so a
// fixture cannot quietly stop resembling what it stands in for.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  assertTotal,
  checkConfigDocs,
  compare,
  DOC_PATH,
  ENV_EXAMPLE_PATH,
  MANIFEST_PATH,
  parseDoc,
  parseEnvExample,
  parseManifest,
} from './assert-config-documented.mjs';

const REPO_ROOT = path.dirname(path.dirname(DOC_PATH));

const MANIFEST_SOURCE = readFileSync(MANIFEST_PATH, 'utf8');
const DOC_SOURCE = readFileSync(DOC_PATH, 'utf8');
const ENV_SOURCE = readFileSync(ENV_EXAMPLE_PATH, 'utf8');

/** Run the comparison over three sources, exactly as the CLI does. */
function check({ manifest = MANIFEST_SOURCE, doc = DOC_SOURCE, env = ENV_SOURCE } = {}) {
  const parsedManifest = parseManifest(manifest);
  const parsedDoc = parseDoc(doc);
  const parsedEnv = parseEnvExample(env);
  return [
    ...parsedManifest.problems,
    ...parsedDoc.problems,
    ...parsedEnv.problems,
    ...compare({ manifest: parsedManifest, doc: parsedDoc, envExample: parsedEnv }),
  ];
}

describe('the real configuration surface', () => {
  it('is described identically by the manifest, the documentation and .env.example', async () => {
    const { problems, counts } = await checkConfigDocs();
    expect(problems).toEqual([]);
    expect(counts.manifest).toBe(counts.doc);
    expect(counts.manifest).toBe(counts.env);
  });

  it('is not empty, so the equality above is over a real key set', () => {
    // Three empty sets are equal. Without this, deleting every key from all three files
    // would leave the gate green — the shape of a check that proves nothing.
    const { keys } = parseManifest(MANIFEST_SOURCE);
    expect(keys.size).toBeGreaterThan(10);
    expect([...keys.values()].filter((k) => k.kind === 'secret').length).toBeGreaterThan(0);
    expect([...keys.values()].filter((k) => k.kind === 'behavioural').length).toBeGreaterThan(0);
  });

  it('gives no secret a default, a type, or an example in the manifest', () => {
    const parsed = JSON.parse(MANIFEST_SOURCE);
    const secrets = parsed.keys.filter((k) => k.kind === 'secret');
    expect(secrets.length).toBeGreaterThan(0);
    for (const secret of secrets) {
      expect(Object.keys(secret).sort()).toEqual(['kind', 'name', 'purpose']);
    }
  });

  it('offers no secret as an assignable slot in .env.example', () => {
    const { keys } = parseEnvExample(ENV_SOURCE);
    const manifest = parseManifest(MANIFEST_SOURCE);
    for (const [name, entry] of manifest.keys) {
      if (entry.kind !== 'secret') continue;
      expect(keys.get(name), `${name} must be a comment, never an assignment`).toBe('secret');
      expect(ENV_SOURCE).not.toMatch(new RegExp(`^${name}=`, 'm'));
    }
  });

  it('carries a warning banner in .env.example saying values never belong there', () => {
    expect(ENV_SOURCE).toMatch(/NAMES ONLY/);
    expect(ENV_SOURCE).toMatch(/NEVER CARRY ONE|NEVER VALUES/);
  });
});

describe('the gate fails on', () => {
  it('a key the manifest has and the documentation does not', () => {
    const doc = DOC_SOURCE.split('\n')
      .filter((line) => !line.startsWith('| `APERTURE_STREAM_MAX_CONCURRENT`'))
      .join('\n');
    expect(check({ doc })).toContain(
      'manifest vs documentation: APERTURE_STREAM_MAX_CONCURRENT is in the first and not the second',
    );
  });

  it('a key the documentation has and the manifest does not', () => {
    const manifest = JSON.parse(MANIFEST_SOURCE);
    manifest.keys = manifest.keys.filter((k) => k.name !== 'APERTURE_CONTEXT_ENABLED');
    expect(check({ manifest: JSON.stringify(manifest) })).toContain(
      'manifest vs documentation: APERTURE_CONTEXT_ENABLED is in the second and not the first',
    );
  });

  it('a key missing from .env.example alone', () => {
    const env = ENV_SOURCE.split('\n')
      .filter((line) => line !== 'APERTURE_UPLOAD_MAX_BYTES=')
      .join('\n');
    expect(check({ env })).toContain(
      'manifest vs .env.example: APERTURE_UPLOAD_MAX_BYTES is in the first and not the second',
    );
  });

  it('a default that drifted from the manifest by a single digit', () => {
    const doc = DOC_SOURCE.replace(
      '| `APERTURE_SESSION_TTL_SECS` | Session lifetime before refresh, in seconds | `3600` |',
      '| `APERTURE_SESSION_TTL_SECS` | Session lifetime before refresh, in seconds | `3601` |',
    );
    expect(doc).not.toBe(DOC_SOURCE);
    expect(check({ doc })).toContain(
      'APERTURE_SESSION_TTL_SECS: the documented default `3601` differs from the manifest\'s `3600`',
    );
  });

  it('a purpose reworded in the document only', () => {
    const doc = DOC_SOURCE.replace(
      'Concurrent streams per user',
      'Concurrent streams per account',
    );
    expect(doc).not.toBe(DOC_SOURCE);
    const problems = check({ doc });
    expect(problems.join('\n')).toContain('APERTURE_STREAM_MAX_CONCURRENT: the documented purpose');
  });

  it('a secret documented among the behavioural keys', () => {
    const doc = DOC_SOURCE.replace(
      '| `APERTURE_CONTEXT_ENABLED` | Master switch for the context bus | `true` |',
      '| `APERTURE_CONTEXT_ENABLED` | Master switch for the context bus | `true` |\n'
        + '| `APERTURE_SESSION_SIGNING_KEY` | Signs and verifies session tokens | `none` |',
    );
    const problems = check({ doc }).join('\n');
    expect(problems).toContain('APERTURE_SESSION_SIGNING_KEY is documented twice');
  });

  it('a value left in .env.example', () => {
    const env = ENV_SOURCE.replace('APERTURE_ENABLED=', 'APERTURE_ENABLED=true');
    const problems = check({ env }).join('\n');
    expect(problems).toContain('APERTURE_ENABLED is assigned a value');
  });

  it('a value assigned to a name nothing documents', () => {
    // The shape check is over every assignment, not only the ones the gate expects, so a
    // credential smuggled in under an unfamiliar name still fails.
    const env = `${ENV_SOURCE}\nAPERTURE_UNDOCUMENTED_TOKEN=hunter2\n`;
    const problems = check({ env }).join('\n');
    expect(problems).toContain('APERTURE_UNDOCUMENTED_TOKEN is assigned a value');
  });

  it('a secret turned into an empty assignable slot in .env.example', () => {
    const env = ENV_SOURCE.replace(
      '#   APERTURE_VAPID_PRIVATE_KEY',
      'APERTURE_VAPID_PRIVATE_KEY=',
    );
    const problems = check({ env }).join('\n');
    expect(problems).toContain(
      'APERTURE_VAPID_PRIVATE_KEY is a secret but .env.example offers it as an assignable slot',
    );
  });

  it('a key documented in a table outside the normative sections', () => {
    // The unanticipated case FAILS. A denylist of places a key must not be would always lag
    // the place somebody actually put it.
    const doc = `${DOC_SOURCE}\n## Extra notes\n\n| Name | Purpose | Default |\n|---|---|---|\n`
      + '| `APERTURE_ENABLED` | Master switch for the BFF | `false` |\n';
    const problems = check({ doc }).join('\n');
    expect(problems).toContain('is documented under "Extra notes"');
  });

  it('a default cell that is not a single backticked value', () => {
    const doc = DOC_SOURCE.replace(
      '| `APERTURE_STREAM_HEARTBEAT_SECS` | Stream keepalive interval, in seconds | `15` |',
      '| `APERTURE_STREAM_HEARTBEAT_SECS` | Stream keepalive interval, in seconds | about `15` |',
    );
    expect(doc).not.toBe(DOC_SOURCE);
    const problems = check({ doc }).join('\n');
    expect(problems).toContain("default cell is `about `15``");
  });

  it('a manifest that is empty, rather than passing on three empty sets', () => {
    const problems = check({ manifest: '{"revision":"1.0","keys":[]}' }).join('\n');
    expect(problems).toContain('the key manifest names no keys at all');
  });

  it('a manifest that is not valid JSON', () => {
    const problems = check({ manifest: '{' }).join('\n');
    expect(problems).toContain('the key manifest is not valid JSON');
  });

  it('a duplicate listing within one artifact', () => {
    const env = `${ENV_SOURCE}\nAPERTURE_ENABLED=\n`;
    expect(check({ env }).join('\n')).toContain('APERTURE_ENABLED is listed twice');
  });
});

// Every mutation above changes CONTENT the parsers already recognise, so all of them together
// still inherit whatever the parsers cannot see. These mutate SHAPE instead — the boundary of
// what each parser accepts — because a parser that silently skips an unrecognised line turns
// the equality check into "the artifacts agree about the subset I happened to read", which is
// a green gate over an invisible gap rather than a check.
describe('the gate rejects a shape it cannot read, rather than skipping it', () => {
  describe('in .env.example', () => {
    // Each of these puts a real value in the file in a form the old column-zero reader did not
    // recognise. Every one of them used to leave the gate green with an empty-looking inventory.
    const smuggled = {
      'an export-prefixed assignment': 'export APERTURE_SESSION_SIGNING_KEY=hunter2',
      'an indented assignment': '  APERTURE_ENABLED=true',
      'a tab-indented assignment': '\tAPERTURE_ENABLED=true',
      'whitespace before the equals': 'APERTURE_ENABLED = true',
      'whitespace after the equals': 'APERTURE_ENABLED= true',
      'a trailing space after an empty assignment': 'APERTURE_ENABLED= ',
      'an assignment hidden in a comment': '# APERTURE_SESSION_SIGNING_KEY=hunter2',
      'an assignment in an indented comment': '#   APERTURE_VAPID_PRIVATE_KEY=hunter2',
      'a lowercase assignment': 'aperture_enabled=true',
      'a line that is neither blank, comment, nor assignment': 'APERTURE_ENABLED',
    };

    for (const [what, line] of Object.entries(smuggled)) {
      it(what, () => {
        const problems = check({ env: `${ENV_SOURCE}\n${line}\n` });
        expect(problems.length, `\`${line}\` was accepted`).toBeGreaterThan(0);
        // The message must name the offending line, or a reader cannot find it.
        expect(problems.join('\n')).toContain(line.trim());
      });
    }

    it('accepts the three forms that ARE approved, so the rejection is not blanket', () => {
      // A gate that refused everything would pass every test above while being useless. These
      // pin the negatives: the real file's own shapes must still parse cleanly.
      const problems = check({ env: '# a comment\n\nAPERTURE_ENABLED=\n#   APERTURE_VAPID_PUBLIC_KEY\n' });
      for (const problem of problems) {
        expect(problem).not.toMatch(/unrecognised line|contains an assignment/);
      }
    });
  });

  describe('in docs/CONFIGURATION.md', () => {
    const row = '| `APERTURE_ENABLED` | Master switch for the BFF | `false` |';

    it('an HTML table', () => {
      const doc = DOC_SOURCE.replace(
        row,
        `${row}\n<table><tr><td>APERTURE_ENABLED</td><td>anything at all</td></tr></table>`,
      );
      expect(check({ doc }).join('\n')).toContain('an HTML table element appears');
    });

    it('a blockquoted table', () => {
      const doc = DOC_SOURCE.replace(row, `${row}\n> | \`APERTURE_ENABLED\` | something else | \`true\` |`);
      expect(check({ doc }).join('\n')).toContain('a table inside a blockquote');
    });

    it('a table row without a leading pipe', () => {
      const doc = DOC_SOURCE.replace(row, `${row}\n\`APERTURE_ENABLED\` | something else | \`true\` |`);
      expect(check({ doc }).join('\n')).toContain('does not begin with `|`');
    });

    it('a row with an empty purpose cell', () => {
      const doc = DOC_SOURCE.replace(row, '| `APERTURE_ENABLED` |  | `false` |');
      expect(check({ doc }).join('\n')).toContain("purpose cell is empty");
    });

    it('a row with an empty default cell', () => {
      const doc = DOC_SOURCE.replace(row, '| `APERTURE_ENABLED` | Master switch for the BFF | `` |');
      expect(check({ doc }).join('\n')).toContain('not a single non-empty backticked value');
    });

    it('does not flag ordinary prose that mentions a key', () => {
      // The negative. `APERTURE_SECRET_CACHE_TTL_SECS` is named in a paragraph in the real
      // document; a rule that caught prose would make the gate unusable.
      expect(DOC_SOURCE).toMatch(/bounded by\n`APERTURE_SECRET_CACHE_TTL_SECS`|`APERTURE_SECRET_CACHE_TTL_SECS`/);
      expect(check()).toEqual([]);
    });
  });

  describe('in the key manifest', () => {
    /** The real manifest with one entry altered by `mutate`. */
    function withEntry(name, mutate) {
      const parsed = JSON.parse(MANIFEST_SOURCE);
      parsed.keys = parsed.keys.map((k) => (k.name === name ? mutate({ ...k }) : k));
      return JSON.stringify(parsed);
    }

    it('a behavioural entry missing its purpose', () => {
      const manifest = withEntry('APERTURE_ENABLED', (k) => { delete k.purpose; return k; });
      expect(check({ manifest }).join('\n')).toContain('APERTURE_ENABLED is missing purpose');
    });

    it('a behavioural entry missing its default', () => {
      const manifest = withEntry('APERTURE_ENABLED', (k) => { delete k.default; return k; });
      expect(check({ manifest }).join('\n')).toContain('APERTURE_ENABLED is missing default');
    });

    it('a behavioural entry missing its type', () => {
      const manifest = withEntry('APERTURE_ENABLED', (k) => { delete k.type; return k; });
      expect(check({ manifest }).join('\n')).toContain('APERTURE_ENABLED is missing type');
    });

    it('a behavioural entry with a blank purpose', () => {
      const manifest = withEntry('APERTURE_ENABLED', (k) => ({ ...k, purpose: '   ' }));
      expect(check({ manifest }).join('\n')).toContain('`purpose` must be a non-empty string');
    });

    it('a secret entry that grows a default', () => {
      const manifest = withEntry('APERTURE_SESSION_SIGNING_KEY', (k) => ({ ...k, default: 'dev-key' }));
      expect(check({ manifest }).join('\n')).toContain(
        'APERTURE_SESSION_SIGNING_KEY carries default, which a secret entry may not have',
      );
    });

    it('an entry carrying a member nobody recognises', () => {
      const manifest = withEntry('APERTURE_ENABLED', (k) => ({ ...k, example: 'true' }));
      expect(check({ manifest }).join('\n')).toContain('carries example');
    });

    it('an entry with a kind that is neither', () => {
      const manifest = withEntry('APERTURE_ENABLED', (k) => ({ ...k, kind: 'internal' }));
      expect(check({ manifest }).join('\n')).toContain('has kind "internal"');
    });

    it('an entry with a type outside the declared set', () => {
      const manifest = withEntry('APERTURE_ENABLED', (k) => ({ ...k, type: 'boolean' }));
      expect(check({ manifest }).join('\n')).toContain('has type "boolean"');
    });
  });
});

// The rejection rules were themselves denylists: each fired on a narrow pattern, so a shape
// matching neither the approved form nor the rejection pattern slipped through. These cover the
// shapes that used to fall between the two, and the assertion that removes the gap in general.
describe('classification is total, so no shape falls between approved and refused', () => {
  describe('a comment carrying a value is refused whatever its left-hand side looks like', () => {
    const smuggled = {
      'a hyphenated left side': '# foo-bar=example',
      'a hyphenated key-like left side': '# APERTURE-SETTING=example',
      'a dotted left side': '# aperture.setting=example',
      'a spaced left side': '# the key = example',
      'a bracketed left side': '# [default]=example',
      'a value inside backticks': '# `APERTURE_SETTING=example`',
      'no left side at all': '# =example',
    };
    for (const [what, line] of Object.entries(smuggled)) {
      it(what, () => {
        const problems = check({ env: `${ENV_SOURCE}\n${line}\n` });
        expect(problems.length, `\`${line}\` was accepted`).toBeGreaterThan(0);
        expect(problems.join('\n')).toContain(line.trim());
      });
    }

    it('but the bare `=` span documenting the character is still allowed', () => {
      // The negative. The real file explains "do not add an `=` after any of these"; a rule
      // that refused every `=` in a comment would make the file unable to describe its own
      // rule, and the fix for that would be to weaken the rule.
      expect(ENV_SOURCE).toContain('`=`');
      expect(check()).toEqual([]);
    });
  });

  describe('in the document, table shape decides — not whether a key is present', () => {
    it('refuses a pipe-less table row that carries no backticked key', () => {
      // The old rule only refused a pipe-less line if it contained a backticked APERTURE
      // name, which is not the stated rule and let exactly this through.
      const doc = `${DOC_SOURCE}\nAPERTURE_ENABLED | altered purpose | altered default |\n`;
      const problems = check({ doc }).join('\n');
      expect(problems).toContain('does not begin with `|`');
      expect(problems).toContain('APERTURE_ENABLED | altered purpose | altered default |');
    });

    it('refuses a pipe-less table row with no key-like text at all', () => {
      const doc = `${DOC_SOURCE}\nsomething | else | entirely |\n`;
      expect(check({ doc }).join('\n')).toContain('something | else | entirely |');
    });

    it('refuses a key row with an extra column', () => {
      const doc = DOC_SOURCE.replace(
        '| `APERTURE_ENABLED` | Master switch for the BFF | `false` |',
        '| `APERTURE_ENABLED` | Master switch for the BFF | `false` | and another |',
      );
      expect(doc).not.toBe(DOC_SOURCE);
      expect(check({ doc }).join('\n')).toContain("row has 4 columns, not 3");
    });

    it('refuses a key row with a missing column', () => {
      const doc = DOC_SOURCE.replace(
        '| `APERTURE_ENABLED` | Master switch for the BFF | `false` |',
        '| `APERTURE_ENABLED` | Master switch for the BFF |',
      );
      expect(doc).not.toBe(DOC_SOURCE);
      expect(check({ doc }).join('\n')).toContain("row has 2 columns, not 3");
    });

    it('refuses a key named anywhere but the first cell', () => {
      const doc = DOC_SOURCE.replace(
        '| `APERTURE_ENABLED` | Master switch for the BFF | `false` |',
        '| `APERTURE_ENABLED` | Master switch for the BFF | `false` |\n'
          + '| see also | `APERTURE_ALLOW_SIGNUP` | `true` |',
      );
      expect(check({ doc }).join('\n')).toContain('appears in column 2 of a table row');
    });

    it('does not flag the document\'s own non-key tables', () => {
      // The negative: separators, headers, and the deployment-tier table are all table rows
      // that define no key, and must stay approved.
      expect(DOC_SOURCE).toMatch(/\| Self-hosted \/ homelab \|/);
      expect(check()).toEqual([]);
    });
  });

  describe('the manifest is total at the object level too', () => {
    it('refuses an unrecognised top-level member', () => {
      const parsed = JSON.parse(MANIFEST_SOURCE);
      parsed.keys2 = [{ name: 'APERTURE_HIDDEN', kind: 'behavioural' }];
      expect(check({ manifest: JSON.stringify(parsed) }).join('\n')).toContain(
        'unrecognised top-level member(s): keys2',
      );
    });

    it('refuses a missing top-level member', () => {
      const parsed = JSON.parse(MANIFEST_SOURCE);
      delete parsed.note;
      expect(check({ manifest: JSON.stringify(parsed) }).join('\n')).toContain(
        'missing top-level member(s): note',
      );
    });
  });

  describe('a manifest whose shape the parser cannot index is refused, not crashed on', () => {
    // Valid JSON is not the right shape. Two of these used to throw a TypeError from
    // `Object.keys(null)` and the rest were diagnosed misleadingly — an array root reported
    // "missing top-level members" rather than "this is an array". The build failed either
    // way, so none was an escape; but a stack trace is not a diagnosis, and every input is
    // supposed to land in a bucket WITH A REASON.
    const malformed = {
      'a null root': ['null', 'the manifest root is null, not an object'],
      'an array root': ['[]', 'the manifest root is an array, not an object'],
      'a string root': ['"just a string"', 'the manifest root is a string, not an object'],
      'a number root': ['5', 'the manifest root is a number, not an object'],
      'a boolean root': ['true', 'the manifest root is a boolean, not an object'],
      'a null entry': [
        '{"revision":"1.0","note":"n","keys":[null]}',
        'entry 1 of `keys` is null, not an object',
      ],
      'a string entry': [
        '{"revision":"1.0","note":"n","keys":["APERTURE_ENABLED"]}',
        'entry 1 of `keys` is a string, not an object',
      ],
      'an array entry': [
        '{"revision":"1.0","note":"n","keys":[[]]}',
        'entry 1 of `keys` is an array, not an object',
      ],
      'a null keys member': [
        '{"revision":"1.0","note":"n","keys":null}',
        'the manifest\'s `keys` is null, not an array',
      ],
    };

    for (const [what, [manifest, expected]] of Object.entries(malformed)) {
      it(`refuses ${what} by name`, () => {
        expect(() => parseManifest(manifest), `${what} threw instead of refusing`).not.toThrow();
        expect(check({ manifest }).join('\n')).toContain(expected);
      });
    }

    it('reports the offending entry position, so a long manifest is searchable', () => {
      const parsed = JSON.parse(MANIFEST_SOURCE);
      parsed.keys.splice(3, 0, null);
      expect(check({ manifest: JSON.stringify(parsed) }).join('\n')).toContain(
        'entry 4 of `keys` is null',
      );
    });

    it('still accepts the real manifest, so the shape check is not blanket', () => {
      expect(parseManifest(MANIFEST_SOURCE).problems).toEqual([]);
    });
  });

  describe('the totality assertion itself', () => {
    it('accounts for every line it considers, in both real artifacts', () => {
      const env = parseEnvExample(ENV_SOURCE);
      const doc = parseDoc(DOC_SOURCE);
      for (const [label, { accounting }] of [['.env.example', env], ['doc', doc]]) {
        const { considered, parsed, refused } = accounting;
        expect(considered.size, `${label}: nothing was considered`).toBeGreaterThan(0);
        expect(refused.size, `${label}: a clean artifact refused something`).toBe(0);
        expect([...considered].sort(), `${label}: considered != parsed + refused`)
          .toEqual([...new Set([...parsed, ...refused])].sort());
      }
    });

    it('considers every non-blank line of .env.example, not only the ones it recognises', () => {
      const nonBlank = ENV_SOURCE.split('\n')
        .map((line, index) => (line.trim() === '' ? null : index + 1))
        .filter((line) => line !== null);
      const { accounting } = parseEnvExample(ENV_SOURCE);
      expect([...accounting.considered].sort((a, b) => a - b)).toEqual(nonBlank);
    });

    it('fails when a line is considered but neither parsed nor refused', () => {
      // The assertion is the thing that removes the third outcome, so it is tested directly:
      // a hand-built accounting with an unclassified line must produce a problem naming it.
      const problems = assertTotal('probe', {
        considered: new Set([1, 2, 3]),
        parsed: new Set([1]),
        refused: new Set([2]),
      });
      expect(problems.join('\n')).toContain('line 3 was considered but neither parsed nor refused');
    });

    it('fails when a line is both parsed and refused', () => {
      const problems = assertTotal('probe', {
        considered: new Set([1]),
        parsed: new Set([1]),
        refused: new Set([1]),
      });
      expect(problems.join('\n')).toContain('both parsed and refused');
    });

    it('passes on a complete accounting, so it is not simply always red', () => {
      expect(
        assertTotal('probe', {
          considered: new Set([1, 2]),
          parsed: new Set([1]),
          refused: new Set([2]),
        }),
      ).toEqual([]);
    });
  });
});

describe('the ignore rule', () => {
  // The gate only ever opens the ROOT .env.example. If a nested copy were committable it could
  // carry real values that nothing here reads — so the allowance and the gate must name the
  // same single file, and that is a property of git's own matching, not of this script.
  const run = (args) => {
    try {
      execFileSync('git', args, { cwd: REPO_ROOT, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  };

  it('leaves the root .env.example committable', () => {
    expect(run(['check-ignore', '-q', '.env.example'])).toBe(false);
  });

  it('ignores a nested .env.example at any depth, so no unread copy can be committed', () => {
    expect(run(['check-ignore', '-q', 'client/.env.example'])).toBe(true);
    expect(run(['check-ignore', '-q', 'client/scripts/deep/.env.example'])).toBe(true);
    expect(run(['check-ignore', '-q', 'docs/.env.example'])).toBe(true);
  });

  it('ignores a real .env and any suffixed sibling of the example', () => {
    expect(run(['check-ignore', '-q', '.env'])).toBe(true);
    expect(run(['check-ignore', '-q', '.env.local'])).toBe(true);
    expect(run(['check-ignore', '-q', '.env.example.local'])).toBe(true);
  });
});

describe('the difference report', () => {
  it('names a key, never a stringified object', () => {
    // A garbled finding sends a reader hunting for a value that is in no file, and costs
    // trust in the whole gate. This pins the message shape rather than only its presence.
    const manifest = JSON.parse(MANIFEST_SOURCE);
    manifest.keys = manifest.keys.filter((k) => k.name !== 'APERTURE_ENABLED');
    const problems = check({ manifest: JSON.stringify(manifest) });
    expect(problems.join('\n')).not.toContain('[object Object]');
    for (const problem of problems) {
      expect(problem).not.toMatch(/APERTURE_[A-Z_]+,/);
    }
  });
});
