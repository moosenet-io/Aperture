/**
 * APTR-100 → APTR-10 handoff. **This file exists to go red on a merge.**
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────────────────────
 *
 * APTR-10 owns Aperture's error model and has hardened `client/src/api/errors.ts` over eight
 * review rounds against hostile values. `components/state/error-presentation.ts` contains a
 * SECOND, much younger path that reads a `Problem` — a URN and a correlation id — and it exists
 * for exactly one reason: APTR-10 is unmerged, so this branch cannot import it and still build.
 *
 * Two answers to "how do we read a hostile problem safely" is worse than either, because the
 * weaker one is the one the UI calls. The failure mode is not that someone decides wrongly; it
 * is that BOTH survive because neither review saw the other, and the duplicate quietly becomes
 * permanent.
 *
 * So the deletion is not a comment asking someone to remember. It is this test, which fails the
 * build the moment APTR-10's API appears in the tree. The red is the point: it arrives on the
 * merge that makes the duplicate redundant, names what to delete, and cannot be satisfied by
 * anything except doing it.
 *
 * ── WHAT TO DO WHEN IT GOES RED ─────────────────────────────────────────────────────────────
 *
 *   1. Delete the untrusted-read block and `describeError`/`classify`/`safeCorrelationId` from
 *      `components/state/error-presentation.ts`.
 *   2. Re-export APTR-10's `describeError` in their place, and have `ErrorState` consume its
 *      `ProblemPresentation`.
 *   3. Move the copy: APTR-10's `ERROR_PRESENTATION` says its `message` strings are the interim
 *      home of Aperture's error copy and that the table is shaped one-record-per-URN so the move
 *      is mechanical. The catalogue absorbs those values; that table then holds catalogue KEYS.
 *   4. Settle the one shape that does not line up — APTR-10 has ONE `message` per URN, this
 *      catalogue has `title` + `detail`. Its `message` corresponds to `detail`. Either the
 *      absorbed table carries two keys per URN, or `title` stays a component concern.
 *   5. `RecoveryKind` here is already APTR-10's `RecoveryAction` union member for member, and
 *      every per-URN recovery value already matches its table, so `RECOVERY_HINT` and
 *      `RECOVERY_ACTION` need no mapping layer.
 *   6. Delete this file.
 *
 * ── IT READS THE SOURCE, NOT THE MODULE ─────────────────────────────────────────────────────
 *
 * Deliberately textual. Importing `errors.ts` and inspecting its exports would answer the same
 * question for the module graph as it is TODAY, but the thing being detected is a file changing
 * underneath this one, and a source read says exactly that with no import cycle and nothing to
 * mock. It is a tripwire, and it is labelled one.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// It lives in `scripts/` rather than beside the module it guards for one concrete reason: the
// `src` TypeScript project has no Node types, so a source-reading test cannot compile there. The
// other source-reading gates in this repo are here for the same reason, and this is one.
const CLIENT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ERRORS_MODULE = join(CLIENT_DIR, 'src', 'api', 'errors.ts');
const PRESENTATION_MODULE = join(CLIENT_DIR, 'src', 'components', 'state', 'error-presentation.ts');

/**
 * The exports whose ARRIVAL means the duplicate must go. Each is a distinct piece of the handoff,
 * listed separately so the failure message names the one that landed rather than "something
 * changed".
 */
const APTR_10_EXPORTS = [
  { symbol: 'describeError', supersedes: 'describeError/classify in error-presentation.ts' },
  { symbol: 'ERROR_PRESENTATION', supersedes: 'URN_PRESENTATION in error-presentation.ts' },
  { symbol: 'safeCorrelationId', supersedes: 'safeCorrelationId in error-presentation.ts' },
  { symbol: 'ProblemPresentation', supersedes: "ErrorState's own DescribedError shape" },
];

function errorsSource() {
  return readFileSync(ERRORS_MODULE, 'utf8');
}

describe('the APTR-10 handoff', () => {
  it.each(APTR_10_EXPORTS)(
    'has not yet landed `$symbol` — when it does, delete $supersedes',
    ({ symbol, supersedes }) => {
      const source = errorsSource();
      const landed = new RegExp(`^export (?:async )?(?:function|const|class|interface|type) ${symbol}\\b`, 'm')
        .test(source);

      expect(
        landed,
        `\n\nAPTR-10 HAS LANDED: src/api/errors.ts now exports \`${symbol}\`.\n`
        + `This test is not broken — it is doing its job. ${supersedes} is now a SECOND, weaker\n`
        + 'answer to a question APTR-10 owns, and it must be deleted rather than maintained.\n'
        + 'The steps are in the header of scripts/aptr10-handoff.test.mjs.\n',
      ).toBe(false);
    },
  );

  it('still has a local classification path to delete — the tripwire is not watching a ghost', () => {
    // The other half. If `error-presentation.ts` lost its reader without APTR-10 landing, the
    // assertions above would pass forever over nothing, which is the inert-test shape: green
    // because there is nothing left to check, not because the property holds.
    const presentation = readFileSync(PRESENTATION_MODULE, 'utf8');
    expect(presentation).toContain('function classify(');
    expect(presentation).toContain('function ownValue(');
  });

  it('reads a source file that exists, so a rename cannot silence it', () => {
    // A tripwire that reads a moved file would throw rather than pass — but an empty read would
    // pass. Asserting the file has real content is what stops "no APTR-10 exports found" from
    // being satisfied by "no file found".
    expect(errorsSource().length).toBeGreaterThan(1000);
  });
});
