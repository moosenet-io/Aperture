#!/usr/bin/env node
// APTR-07 — regenerate the checked-in SDK types from the contract.
//
//   npm --prefix client run gen:api
//
// Output is CHECKED IN so the build never needs network access and never needs the generator
// to have run. `assert-api-current.mjs` proves the checked-in output still matches the
// contract; this script is what you run when it does not.
//
// Generation reads exactly one file — `contracts/aperture-api-v1.yaml` — and writes exactly
// three, into `client/src/api/generated/`. It contacts nothing.

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CONTRACT_PATH, GENERATED_DIR, GENERATED_FILES, generateAll } from './api-codegen.mjs';

const rel = (p) => path.relative(path.resolve(GENERATED_DIR, '..', '..', '..', '..'), p) || p;

async function main() {
  const { files, sourceSha256 } = await generateAll();

  await mkdir(GENERATED_DIR, { recursive: true });

  // Remove anything in the generated directory that this run does not produce. A stale file
  // left behind by a removed route would still typecheck and still be importable, which is
  // exactly how a client keeps calling an operation the contract no longer has.
  let existing = [];
  try {
    existing = await readdir(GENERATED_DIR);
  } catch {
    existing = [];
  }
  for (const name of existing) {
    if (!GENERATED_FILES.includes(name)) {
      await rm(path.join(GENERATED_DIR, name), { recursive: true, force: true });
      process.stdout.write(`  removed stale ${name}\n`);
    }
  }

  let changed = 0;
  for (const [name, contents] of Object.entries(files)) {
    const target = path.join(GENERATED_DIR, name);
    let before = null;
    try {
      before = await readFile(target, 'utf8');
    } catch {
      before = null;
    }
    if (before === contents) {
      process.stdout.write(`  unchanged  ${name}\n`);
      continue;
    }
    await writeFile(target, contents, 'utf8');
    changed += 1;
    process.stdout.write(`  ${before === null ? 'created   ' : 'updated   '} ${name}\n`);
  }

  process.stdout.write(
    `\nGenerated from ${rel(CONTRACT_PATH)} (sha256:${sourceSha256.slice(0, 16)}…), `
    + `${changed} file${changed === 1 ? '' : 's'} written.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`\ngen-api failed: ${error?.message ?? String(error)}\n`);
  process.exitCode = 1;
});
