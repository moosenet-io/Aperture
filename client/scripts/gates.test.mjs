// APTR-07 — PROOF THAT THE GATES FAIL.
//
// A gate you have never seen fail is unverified. Two gates in this repo passed every build
// while asserting less than they claimed (APTR-01's egress lint was bypassable four ways;
// APTR-03's CODEOWNERS requested review from nobody). So both of this item's gates are proven
// RED here, on every test run, not just once by hand:
//
//   * the contract-drift gate goes red when the contract is edited without regeneration, and
//     green again when it is reverted;
//   * the SDK static gate goes red on an absolute URL literal, on a compiled-in default
//     endpoint, and on a request constructed outside the transport.
//
// Both tests mutate a tracked file and restore it in a `finally`. The drift test writes to
// `contracts/aperture-api-v1.yaml`; if this process is killed between the write and the
// restore, `git checkout -- contracts/aperture-api-v1.yaml` puts it back. That risk is
// accepted deliberately: proving the gate fails against the REAL contract is worth more than
// proving it fails against a fixture it would never see in CI.

import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_ROOT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(CLIENT_ROOT, '..');
const CONTRACT = path.join(REPO_ROOT, 'contracts', 'aperture-api-v1.yaml');
const PROBE_DIR = path.join(CLIENT_ROOT, 'src', 'api', '__gate_probe__');

/** Run a gate script and capture its exit code and output instead of throwing. */
async function runScript(script) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [path.join(HERE, script)], {
      cwd: CLIENT_ROOT,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return {
      code: error.code ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
    };
  }
}

describe('the contract-drift gate', () => {
  it('is green on the tree as committed', async () => {
    const result = await runScript('assert-api-current.mjs');
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toContain('OK');
  });

  it('goes RED when the contract is edited without regenerating, and green again on revert', async () => {
    const original = await readFile(CONTRACT, 'utf8');
    let red;
    try {
      // A prose-only edit: it changes no generated TYPE at all. This is the case a types-only
      // drift check would miss, and the reason the generated files embed the source digest.
      await writeFile(CONTRACT, `${original}\n# drift probe — removed by the test that wrote it\n`, 'utf8');
      red = await runScript('assert-api-current.mjs');
    } finally {
      await writeFile(CONTRACT, original, 'utf8');
    }

    expect(red.code).toBe(1);
    expect(red.stderr).toContain('CONTRACT DRIFT');
    expect(red.stderr).toContain('gen:api');

    const green = await runScript('assert-api-current.mjs');
    expect(green.code, green.stderr).toBe(0);
  }, 60_000);

  it('goes RED when a generated file is hand-edited', async () => {
    const target = path.join(CLIENT_ROOT, 'src', 'api', 'generated', 'operations.ts');
    const original = await readFile(target, 'utf8');
    let red;
    try {
      await writeFile(target, `${original}\nexport const HAND_EDIT = true;\n`, 'utf8');
      red = await runScript('assert-api-current.mjs');
    } finally {
      await writeFile(target, original, 'utf8');
    }
    expect(red.code).toBe(1);
    expect(red.stderr).toContain('operations.ts');
  }, 60_000);
});

describe('the SDK static gate', () => {
  it('is green on the tree as committed', async () => {
    const result = await runScript('assert-sdk-clean.mjs');
    expect(result.code, result.stderr).toBe(0);
  });

  it('goes RED on an absolute URL literal, a default endpoint, and a stray request site', async () => {
    let red;
    try {
      await mkdir(PROBE_DIR, { recursive: true });
      await writeFile(
        path.join(PROBE_DIR, 'probe.ts'),
        [
          '// Written by scripts/gates.test.mjs and deleted by it. Never committed.',
          'export const endpoint = "https:" + "//aperture.example.test/v1";',
          'export function make(options: { baseUrl?: string }) {',
          '  const baseUrl = options.baseUrl ?? "https://fallback.example.test";',
          '  return baseUrl;',
          '}',
          'export async function stray() {',
          '  return fetch("/v1/aperture/health");',
          '}',
          '',
        ].join('\n'),
        'utf8',
      );
      red = await runScript('assert-sdk-clean.mjs');
    } finally {
      await rm(PROBE_DIR, { recursive: true, force: true });
    }

    expect(red.code).toBe(1);
    expect(red.stderr).toContain('absolute-url');
    expect(red.stderr).toContain('default-endpoint');
    expect(red.stderr).toContain('request-site');

    const green = await runScript('assert-sdk-clean.mjs');
    expect(green.code, green.stderr).toBe(0);
  }, 60_000);

  // The call-shaped check that shipped first missed every one of these, which is why the rule
  // is now a REFERENCE rule. Each is a request constructed outside the transport, statically
  // visible in source the gate reads.
  // Each case asserts the DETAIL the gate prints, not merely that it printed the rule id: a
  // test that checks only the id would still pass if the message it reports were nonsense.
  const EVASIONS = {
    alias: {
      body: 'const request = fetch;\nexport const go = () => request("/v1/aperture/health");',
      detail: 'may be named only in src/api/transport.ts',
    },
    'bracket access': {
      body: 'export const go = () => globalThis["fetch"]("/v1/aperture/health");',
      detail: 'by bracket access',
    },
    'computed access': {
      body: 'const k = ["fe", "tch"].join("");\nexport const go = () => (globalThis as never)[k];',
      detail: 'index a global by a literal name or not at all',
    },
    'a local alias of a global, bracket access': {
      body: 'const g = globalThis;\nexport const go = () => (g as never)["fetch"];',
      detail: 'by bracket access',
    },
    'a local alias of a global, computed access': {
      // The bypass both reviewers found: no forbidden name appears anywhere in this source.
      body: 'const g = globalThis;\nconst key = ["fe", "tch"].join("");\nexport const go = (g as never)[key];',
      detail: 'index a global by a literal name or not at all',
    },
    'an alias of window rather than globalThis': {
      body: 'const w = window;\nconst key = "x";\nexport const go = (w as never)[key];',
      detail: 'index a global by a literal name or not at all',
    },
    'property read': {
      body: 'export const impl = globalThis.fetch;',
      detail: 'may be named only in src/api/transport.ts',
    },
    'passed as a value': {
      body: 'export const wrap = (f: unknown) => f;\nexport const go = wrap(fetch);',
      detail: 'an alias constructs a request just as directly as a call does',
    },
    'event source': {
      body: 'export const go = () => new EventSource("/v1/aperture/stream");',
      detail: '`EventSource` is referenced here',
    },
  };

  for (const [label, { body, detail }] of Object.entries(EVASIONS)) {
    it(`goes RED on a request constructed by ${label}`, async () => {
      let red;
      try {
        await mkdir(PROBE_DIR, { recursive: true });
        await writeFile(path.join(PROBE_DIR, 'probe.ts'), `${body}\n`, 'utf8');
        red = await runScript('assert-sdk-clean.mjs');
      } finally {
        await rm(PROBE_DIR, { recursive: true, force: true });
      }
      expect(red.code, red.stdout).toBe(1);
      expect(red.stderr).toContain('request-site');
      expect(red.stderr).toContain(detail);
    }, 60_000);
  }

  // ── RECORDED LIMITATION ────────────────────────────────────────────────────────────────────
  //
  // This test asserts that the gate does NOT catch something. It exists so the boundary of the
  // claim is pinned by an executable test rather than by a comment, the way APTR-01's egress
  // lint records its undecodable-escape cases. It is NOT an aspiration: if a future revision
  // starts catching this, this test goes red, and the right response is to delete the test and
  // widen the claim in the same change — deliberately, not by accident.
  //
  // The alias check is one level, one file, initializer only. Reaching a global through an
  // arbitrary expression defeats it, and closing that would mean a dataflow analyser inside a
  // build lint. The enforcing control for deliberate obfuscation is the runtime CSP.
  it('does NOT detect a global reached through arbitrary indirection — recorded limitation', async () => {
    let result;
    try {
      await mkdir(PROBE_DIR, { recursive: true });
      await writeFile(
        path.join(PROBE_DIR, 'probe.ts'),
        [
          'const hold = { ref: globalThis };',
          'const viaCall = () => globalThis;',
          'const key = ["fe", "tch"].join("");',
          '// Both of these construct a request. Neither is reported, and that is documented.',
          'export const a = (hold.ref as never)[key];',
          'export const b = (viaCall() as never)[key];',
          '',
        ].join('\n'),
        'utf8',
      );
      result = await runScript('assert-sdk-clean.mjs');
    } finally {
      await rm(PROBE_DIR, { recursive: true, force: true });
    }
    expect(
      result.code,
      'The gate now catches indirection it is documented not to catch. That is an improvement, '
      + 'not a failure — widen the claim in assert-sdk-clean.mjs and delete this test.',
    ).toBe(0);
  }, 60_000);

  it('does not flag a property KEY that merely shares the name', async () => {
    // `{ fetch: impl }` and `readonly fetch?: FetchLike` are declarations, not references —
    // and the transport's own injection point is exactly that shape, so a rule that flagged
    // them would be unusable.
    let result;
    try {
      await mkdir(PROBE_DIR, { recursive: true });
      await writeFile(
        path.join(PROBE_DIR, 'probe.ts'),
        [
          'interface Options { readonly fetch?: (u: string) => Promise<unknown>; }',
          'export const make = (impl: (u: string) => Promise<unknown>): Options =>',
          '  ({ fetch: impl });',
          '',
        ].join('\n'),
        'utf8',
      );
      result = await runScript('assert-sdk-clean.mjs');
    } finally {
      await rm(PROBE_DIR, { recursive: true, force: true });
    }
    expect(result.code, result.stderr).toBe(0);
  }, 60_000);

  it('goes RED on a model-id-shaped literal and on a literal bound to a credential name', async () => {
    let red;
    try {
      await mkdir(PROBE_DIR, { recursive: true });
      await writeFile(
        path.join(PROBE_DIR, 'probe.ts'),
        [
          'export const route = "qwen3-coder:30b";',
          'export const token = "<REDACTED-SECRET>";',
          '',
        ].join('\n'),
        'utf8',
      );
      red = await runScript('assert-sdk-clean.mjs');
    } finally {
      await rm(PROBE_DIR, { recursive: true, force: true });
    }
    expect(red.code).toBe(1);
    expect(red.stderr).toContain('model-name');
    expect(red.stderr).toContain('secret-literal');
  }, 60_000);
});
