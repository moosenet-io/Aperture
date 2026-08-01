#!/usr/bin/env node
// APTR-07 — the contract-drift gate.
//
//   npm --prefix client run assert-api-current
//
// Regenerates the SDK from `contracts/aperture-api-v1.yaml` into MEMORY and compares it, byte
// for byte, against the output checked in under `client/src/api/generated/`. A mismatch fails
// with a unified diff and a non-zero exit, so contract drift is a build failure rather than a
// runtime surprise.
//
// ── WHAT THIS GATE DETECTS ──────────────────────────────────────────────────────────────────
//
//   * a contract change that alters the generated types, without regeneration
//   * a contract change that alters ONLY prose — a description, a summary, an example — which
//     produces byte-identical types. That case is caught because the generated files embed
//     `sha256(contracts/aperture-api-v1.yaml)`, which changes with any edit to the file at all,
//     including whitespace.
//   * a hand edit to a generated file
//   * a stale generated file for a route the contract no longer has
//   * a generator version that no longer matches the pin (reported as a version mismatch, NOT
//     as drift, so nobody goes hunting for a contract change that did not happen)
//
// ── WHAT IT DOES NOT DETECT, STATED PLAINLY ─────────────────────────────────────────────────
//
//   * whether the SERVER implements the contract. This compares generated code against the
//     contract document; conformance of a running BFF is a different gate, owned by the BFF.
//   * whether hand-written code under `src/api/` is CORRECT with respect to the contract. It
//     will fail to compile if it uses a type that changed shape, which is the compiler's job,
//     not this script's — and a contract change the hand-written code simply ignores compiles
//     fine and passes here.
//   * a change to any OTHER contract document. `aperture-events-v1.md` and
//     `aperture-transport-v1.md` are prose contracts with no generated artifact; this gate is
//     silent about them.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { GENERATED_DIR, GENERATED_FILES, generateAll } from './api-codegen.mjs';

/** A small unified-diff renderer — enough to point at the first divergence, not a diff library. */
function firstDifference(expected, actual) {
  const a = expected.split('\n');
  const b = actual.split('\n');
  const limit = Math.max(a.length, b.length);
  for (let i = 0; i < limit; i += 1) {
    if (a[i] !== b[i]) {
      const from = Math.max(0, i - 3);
      const context = [];
      for (let j = from; j < i; j += 1) context.push(`   ${a[j]}`);
      context.push(`  -${a[i] ?? '<end of file>'}`);
      context.push(`  +${b[i] ?? '<end of file>'}`);
      return { line: i + 1, context: context.join('\n') };
    }
  }
  return null;
}

export async function checkDrift() {
  const { files } = await generateAll();
  const problems = [];

  for (const name of GENERATED_FILES) {
    const target = path.join(GENERATED_DIR, name);
    const expected = files[name];
    let actual;
    try {
      actual = await readFile(target, 'utf8');
    } catch {
      problems.push({ name, kind: 'missing' });
      continue;
    }
    if (actual !== expected) {
      // `expected` is what the contract produces; `actual` is what is checked in.
      problems.push({ name, kind: 'differs', diff: firstDifference(expected, actual) });
    }
  }

  return problems;
}

async function main() {
  const problems = await checkDrift();

  if (problems.length === 0) {
    process.stdout.write(
      `contract drift gate: OK — ${GENERATED_FILES.length} generated files match `
      + 'contracts/aperture-api-v1.yaml.\n',
    );
    return;
  }

  process.stderr.write('\nCONTRACT DRIFT — the checked-in SDK does not match the contract.\n\n');
  for (const problem of problems) {
    if (problem.kind === 'missing') {
      process.stderr.write(`  ${problem.name}: MISSING from src/api/generated/\n`);
      continue;
    }
    process.stderr.write(`  ${problem.name}: differs at line ${problem.diff?.line ?? '?'}\n`);
    if (problem.diff) {
      process.stderr.write(`${problem.diff.context}\n`);
      process.stderr.write('    (- what the contract produces, + what is checked in)\n');
    }
  }
  process.stderr.write(
    '\nThe contract changes first, and the SDK is regenerated in the SAME change set:\n'
    + '  npm --prefix client run gen:api\n'
    + 'then review and commit the regenerated files with the contract change.\n\n',
  );
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => {
    process.stderr.write(`\nassert-api-current failed to run: ${error?.message ?? String(error)}\n`);
    process.exitCode = 1;
  });
}
