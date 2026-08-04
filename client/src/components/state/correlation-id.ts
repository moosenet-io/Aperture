/**
 * APTR-100 — a client-minted reference for a failure the server never saw.
 *
 * ── WHY IT IS PREFIXED ──────────────────────────────────────────────────────────────────────
 *
 * A render crash produces no request, so there is no server `correlation_id` to quote. The user
 * still needs something to say when they report it. But an identifier that LOOKS like a server
 * correlation id and is not one sends an operator searching a log that will never contain it —
 * a wrong finding, which costs more than a missing one. So every id minted here carries
 * {@link CLIENT_ID_PREFIX}, and its provenance is legible at a glance.
 *
 * ── THE FALLBACK CHAIN, AND WHAT EACH RUNG IS WORTH ─────────────────────────────────────────
 *
 *   1. `crypto.randomUUID()` — a UUIDv4. What every current browser and Node ≥ 19 provides.
 *   2. `crypto.getRandomValues()` — same entropy, assembled by hand. For a secure context that
 *      lacks `randomUUID`.
 *   3. A per-load counter. NOT UNIQUE ACROSS RELOADS and stated as such: two crashes in two
 *      sessions can both be `client-seq-1`. It exists so the boundary always has SOMETHING to
 *      show — a fallback screen without a reference is worse than one with a weak reference —
 *      and it is visibly a sequence number rather than an id, so nobody treats it as one.
 *
 * Nothing here is a security control. The id is an opaque label for a support conversation; it
 * authenticates nothing and is never sent anywhere. (Nowhere to send it: no telemetry, ever.)
 */

export const CLIENT_ID_PREFIX = 'client-';

/** The subset of `Crypto` used here, so a test can supply each rung of the chain. */
export interface RandomSource {
  randomUUID?: () => string;
  getRandomValues?: <T extends Uint8Array>(array: T) => T;
}

let sequence = 0;

/** Reset the per-load counter. Test-only; the counter is otherwise monotonic for the session. */
export function resetCorrelationSequence(): void {
  sequence = 0;
}

function hex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

/**
 * Mint a reference for a client-side failure.
 *
 * @param source injected so all three rungs are exercised by tests rather than assumed. Two of
 *   them are unreachable on the machine this was written on, which is precisely why they would
 *   otherwise be the untested ones.
 *
 *   `null` means "no source", and it is `null` rather than `undefined` for a reason a test found:
 *   a default parameter is applied to an explicitly-passed `undefined` too, so `undefined` could
 *   not express "there is no crypto here" — it silently reached for the real one, and the
 *   sequence-number rung would have been untestable and therefore untested.
 */
export function newCorrelationId(
  source: RandomSource | null = (globalThis as { crypto?: RandomSource }).crypto ?? null,
): string {
  if (source && typeof source.randomUUID === 'function') {
    try {
      return `${CLIENT_ID_PREFIX}${source.randomUUID()}`;
    } catch {
      // fall through — a throwing source is a broken source, not a reason to render no id
    }
  }

  if (source && typeof source.getRandomValues === 'function') {
    try {
      return `${CLIENT_ID_PREFIX}${hex(source.getRandomValues(new Uint8Array(16)))}`;
    } catch {
      // fall through
    }
  }

  sequence += 1;
  return `${CLIENT_ID_PREFIX}seq-${sequence}`;
}
