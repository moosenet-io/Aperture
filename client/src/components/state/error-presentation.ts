/**
 * APTR-100 — turning a typed SDK error into words and a way forward.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 * ── THIS FILE'S CLASSIFICATION PATH IS A TEMPORARY STAND-IN. DELETE IT WHEN APTR-10 LANDS. ────
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * APTR-10 owns Aperture's error model. Its `client/src/api/errors.ts` exports `describeError`,
 * `ERROR_PRESENTATION` and a set of `safe*` readers that have been through eight review rounds
 * of hardening against hostile values — own-property descriptor reads that never invoke a getter
 * and never walk a prototype chain, intrinsics captured at module load, a `Symbol.replace` hook
 * found behind a captured function, `Array.isArray` throwing on a revoked proxy, and a three-tier
 * totality boundary whose recovery path shares no code with the path that failed.
 *
 * **This file must not become a second answer to "how do we read a hostile problem safely."**
 * Two answers is worse than either, and the weaker one is the one the UI would call. It exists
 * only because APTR-10 is UNMERGED — `main` is at APTR-05 — so this branch cannot import it and
 * still build. That is the whole justification, and it expires the moment APTR-10 merges.
 *
 * `aptr10-handoff.test.ts` FAILS THE BUILD the moment `src/api/errors.ts` starts exporting
 * `describeError`, so this deletion cannot be forgotten. It is not a comment asking someone to
 * remember; it is a test that goes red on the merge that makes this file redundant.
 *
 * ── WHAT WAS DONE TO MAKE THE INTERIM SAFE ──────────────────────────────────────────────────
 *
 * A review found this module's earlier version reading `error.problem.type` and
 * `error.problem.correlation_id` directly, so a `problem` that was null, or a `type` backed by a
 * throwing getter, made `describeError` ITSELF throw — from the function whose entire job is to
 * make a failure renderable, so `ErrorState` escalated instead of rendering its safe generic
 * state. Every untrusted read now goes through {@link ownValue}, every `instanceof` through
 * `isA`, and the whole classification sits behind a totality boundary.
 *
 * ── WHAT WAS ALIGNED SO THE MERGE IS A DELETION, NOT A RE-DESIGN ────────────────────────────
 *
 * {@link RecoveryKind} is APTR-10's `RecoveryAction` union, member for member, and every per-URN
 * recovery choice below is the value APTR-10's `ERROR_PRESENTATION` already assigns. So when it
 * lands, its table's `recovery` values index straight into {@link RECOVERY_HINT} and
 * {@link RECOVERY_ACTION} with no mapping layer and no semantic reconciliation. Its own header
 * says its `message` strings are "the interim home of Aperture's error copy" and that the table
 * is shaped as one record per URN "so absorption is mechanical" — that handoff is the plan, and
 * this file is written to receive it.
 *
 * ── THE ONE SHAPE THAT DOES NOT LINE UP ─────────────────────────────────────────────────────
 *
 * APTR-10 carries ONE `message` per URN. The catalogue here carries a `title` AND a `detail` —
 * a heading and a sentence — because an error block that is only a sentence gives a screen
 * reader no heading to navigate to, and one that is only a heading cannot explain itself. Its
 * `message` corresponds to this file's `detail`. Flagged for arbitration rather than resolved
 * unilaterally: either the absorbed table holds two keys per URN, or `title` stays a component
 * concern and only `detail` comes from the table.
 *
 * ── THE SERVER'S PROSE IS NOT RENDERED, AND NEITHER IS ITS URN ──────────────────────────────
 *
 *   1. The catalogue rule is that all user-facing text is ours and typed. Text arriving over the
 *      wire is neither, and one exception would make the rule advisory.
 *   2. The URN is the STABLE identity; `title`/`detail` are prose that may be reworded server-side.
 *   3. Provenance (D9). A problem body is attacker-influenced exactly as a tool result is, and
 *      rendering it as the client's own voice is how injected text acquires the interface's
 *      authority.
 *
 * APTR-10 went one step further and found that the URN ITSELF is a text channel —
 * `urn:aperture:error:token-abcdef` surfaces `abcdef` to anyone who renders it. Nothing here
 * renders a URN: it is used as a Map key and discarded, an unrecognised one selects
 * {@link UNKNOWN_PRESENTATION}, and a test asserts that text embedded in a URN reaches no output.
 *
 * What IS taken from the response is the `correlation_id`, validated against the contract's `Id`
 * shape before it is shown — it is the one identifier a user is asked to read out to an operator,
 * and it is admitted by matching what is valid rather than by scrubbing what is not.
 */
import {
  ApertureAbortError,
  ApertureConfigError,
  ApertureDecodeError,
  ApertureMalformedResponseError,
  ApertureNetworkError,
  ApertureProblemError,
  ApertureTokenUnavailableError,
  ERROR_URN,
} from '../../api/errors';
import type { PlainKey } from '../../strings';

/* ── Untrusted reads ─────────────────────────────────────────────────────────────────────────
 *
 * INTERIM. Deleted with the rest of this file's classification path when APTR-10 lands; these
 * are the minimum needed to read two fields — a URN and a correlation id — off a value that may
 * be hostile, written to the same standard rather than to a lesser one.
 */

// Intrinsics captured at module load, so a later mutation of `Object` or `RegExp.prototype`
// cannot change what these do. The read surface here is two fields, so this is PARITY with
// APTR-10's discipline rather than a response to a hole measured here — said plainly, because
// claiming a threat that was not measured is its own kind of drift.
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const hasOwn = Object.hasOwn;
const uncurriedExec = Function.prototype.call.bind(RegExp.prototype.exec) as
  (pattern: RegExp, value: string) => RegExpExecArray | null;

/**
 * `pattern.test(value)` is avoided even on a module-local pattern: `RegExp.prototype.test`
 * performs RegExpExec, which READS `exec` off the regex object and calls it. Calling a captured
 * `exec` directly performs the built-in match with no property read at all.
 */
function matches(pattern: RegExp, value: string): boolean {
  return uncurriedExec(pattern, value) !== null;
}

/**
 * The contract's `Id` shape. Mirrors APTR-10's `ID_PATTERN` exactly, including the 128-character
 * bound: a correlation id is rendered to a user, so an unbounded string from a response would be
 * a text channel into the interface no different from rendering `detail`.
 */
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Read an OWN DATA property. Never invokes a getter, never walks the prototype chain.
 *
 * Three distinct hazards, all closed here:
 *   * an ACCESSOR — a `type` backed by a getter that throws, or that returns a different value on
 *     each call. Only `descriptor.value` is read, so a getter is never invoked at all;
 *   * an INHERITED property — `Object.create({ type: 'urn:…' })` would satisfy a plain read and
 *     claim a provenance it does not have. Own-property only;
 *   * a PROXY — `getOwnPropertyDescriptor` runs a trap that can throw, and a revoked proxy throws
 *     unconditionally. Hence the catch.
 */
function ownValue(target: unknown, key: string): unknown {
  if (target === null) return undefined;
  const kind = typeof target;
  if (kind !== 'object' && kind !== 'function') return undefined;
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = getOwnPropertyDescriptor(target as object, key);
  } catch {
    return undefined;
  }
  if (descriptor === undefined) return undefined;
  return hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}

/**
 * `instanceof`, total.
 *
 * `instanceof` walks the left operand's prototype chain, and a Proxy can throw from
 * `getPrototypeOf` — which would abort the dispatch before ANY branch was reached, including the
 * catch-all. A dispatch that can throw before reaching its own default is not a dispatch.
 *
 * Note what this does NOT establish, because APTR-10 makes the point and it applies here:
 * `instanceof` is a PROTOTYPE check, not a provenance check. `Object.create(X.prototype)` passes
 * it. That is exactly why every field read after a successful check still goes through
 * {@link ownValue} — a recognised class is not a verified origin.
 */
function isA<T>(value: unknown, ctor: { prototype: T }): value is T {
  try {
    return value instanceof (ctor as unknown as Function);
  } catch {
    return false;
  }
}

/* ── The presentation vocabulary ─────────────────────────────────────────────────────────── */

/**
 * What the user can DO about it.
 *
 * This is APTR-10's `RecoveryAction` union, member for member. Adopted verbatim rather than
 * mapped: a second vocabulary for one concept is the same defect as a second problem reader, one
 * layer up, and the merge would otherwise have to reconcile two closed sets that agree on meaning
 * and disagree on spelling.
 */
export type RecoveryKind =
  /** The request was malformed; the user edits and resubmits. */
  | 'fix-input'
  /** No usable session; the user authenticates again. */
  | 'reauthenticate'
  /** A session existed and can be refreshed without a full sign-in. */
  | 'refresh-session'
  /** Nothing will change the outcome. */
  | 'none'
  /** What was asked for is not there; the way out is backwards. */
  | 'go-back'
  /** Local state is stale; fetch the current state and try again. */
  | 'refetch'
  /** Too large to send; send less. */
  | 'reduce-payload'
  /** Retrying now fails the same way; a pause is the fastest route. */
  | 'wait-and-retry'
  /** A capability is not configured or not available; settings is where that is resolved. */
  | 'open-settings'
  /** Repeating the same request is likely to work. */
  | 'retry'
  /** The loaded client is the problem — reload to pick up the current one. */
  | 'reload-client'
  /** The evidence is server-side; the reference is what identifies it. */
  | 'contact-operator';

export interface ErrorPresentation {
  /** Catalogue key for the heading. Plain (parameterless) by type, so `t()` accepts it. */
  readonly title: PlainKey;
  /** Catalogue key for the explanation. Corresponds to APTR-10's single `message`. */
  readonly detail: PlainKey;
  readonly recovery: RecoveryKind;
}

/** A presentation plus whatever identifier the failure carried. */
export interface DescribedError extends ErrorPresentation {
  /** The server's correlation id, validated against the `Id` shape. Never invented here. */
  readonly correlationId?: string;
}

/**
 * One presentation per contract error URN.
 *
 * The key type is `keyof typeof ERROR_URN`: a URN added to the SDK with no entry here is a
 * compile error, and an entry here for a URN the SDK does not declare is a compile error too.
 * Every `recovery` value is the one APTR-10's `ERROR_PRESENTATION` already assigns to that URN.
 */
export const URN_PRESENTATION: Record<keyof typeof ERROR_URN, ErrorPresentation> = {
  validationFailed: {
    title: 'error.validationFailed.title', detail: 'error.validationFailed.detail', recovery: 'fix-input',
  },
  authRequired: {
    title: 'error.authRequired.title', detail: 'error.authRequired.detail', recovery: 'reauthenticate',
  },
  authExpired: {
    title: 'error.authExpired.title', detail: 'error.authExpired.detail', recovery: 'refresh-session',
  },
  forbidden: { title: 'error.forbidden.title', detail: 'error.forbidden.detail', recovery: 'none' },
  notFound: { title: 'error.notFound.title', detail: 'error.notFound.detail', recovery: 'go-back' },
  conflict: { title: 'error.conflict.title', detail: 'error.conflict.detail', recovery: 'refetch' },
  preconditionFailed: {
    title: 'error.preconditionFailed.title', detail: 'error.preconditionFailed.detail', recovery: 'refetch',
  },
  payloadTooLarge: {
    title: 'error.payloadTooLarge.title', detail: 'error.payloadTooLarge.detail', recovery: 'reduce-payload',
  },
  rateLimited: {
    title: 'error.rateLimited.title', detail: 'error.rateLimited.detail', recovery: 'wait-and-retry',
  },
  capabilityUnavailable: {
    title: 'error.capabilityUnavailable.title',
    detail: 'error.capabilityUnavailable.detail',
    recovery: 'open-settings',
  },
  upstreamTimeout: {
    title: 'error.upstreamTimeout.title', detail: 'error.upstreamTimeout.detail', recovery: 'retry',
  },
  upstreamError: {
    title: 'error.upstreamError.title', detail: 'error.upstreamError.detail', recovery: 'retry',
  },
  contractVersionUnsupported: {
    title: 'error.contractVersionUnsupported.title',
    detail: 'error.contractVersionUnsupported.detail',
    recovery: 'reload-client',
  },
  internal: {
    title: 'error.internal.title', detail: 'error.internal.detail', recovery: 'contact-operator',
  },
};

/**
 * URN string → presentation, DERIVED from the registry.
 *
 * Walking `ERROR_URN` is what keeps this honest: the URN strings appear exactly once in the
 * codebase (in the SDK), so this map cannot spell one differently from the contract.
 */
const BY_URN: ReadonlyMap<string, ErrorPresentation> = new Map(
  (Object.keys(URN_PRESENTATION) as (keyof typeof ERROR_URN)[])
    .map((name) => [ERROR_URN[name], URN_PRESENTATION[name]] as const),
);

/** The presentation for a failure this module cannot classify any further. */
export const UNKNOWN_PRESENTATION: ErrorPresentation = Object.freeze({
  title: 'error.unknown.title',
  detail: 'error.unknown.detail',
  recovery: 'retry',
});

/** The fallback an ErrorBoundary shows for a thrown render. */
export const RENDER_FAILURE_PRESENTATION: ErrorPresentation = Object.freeze({
  title: 'error.render.title',
  detail: 'error.render.detail',
  recovery: 'reload-client',
});

/* The SDK classes that never carry a problem body. Frozen constants, so the totality boundary
   and the rich path hand back values that cannot have been mutated by anything they touched. */
const ABORTED: ErrorPresentation = Object.freeze({
  title: 'error.aborted.title', detail: 'error.aborted.detail', recovery: 'none',
});
const NETWORK: ErrorPresentation = Object.freeze({
  title: 'error.network.title', detail: 'error.network.detail', recovery: 'retry',
});
const CONFIG: ErrorPresentation = Object.freeze({
  title: 'error.config.title', detail: 'error.config.detail', recovery: 'contact-operator',
});
const TOKEN_UNAVAILABLE: ErrorPresentation = Object.freeze({
  title: 'error.tokenUnavailable.title', detail: 'error.tokenUnavailable.detail', recovery: 'reauthenticate',
});
const DECODE: ErrorPresentation = Object.freeze({
  title: 'error.decode.title', detail: 'error.decode.detail', recovery: 'retry',
});
const MALFORMED_AUTH: ErrorPresentation = Object.freeze({
  title: 'error.malformed.title', detail: 'error.malformed.detail', recovery: 'reauthenticate',
});
const MALFORMED: ErrorPresentation = Object.freeze({
  title: 'error.malformed.title', detail: 'error.malformed.detail', recovery: 'retry',
});

/**
 * Classify a thrown value. **Total: it returns a presentation for every input, and throws for
 * none.** That is the contract `ErrorState` depends on — a classifier that can throw turns a
 * handled failure into an unhandled one at the exact moment the UI is trying to recover.
 *
 * Every branch is a POSITIVE identification against a class the SDK exports, and anything
 * unidentified lands on {@link UNKNOWN_PRESENTATION}. No branch infers a class from the shape of
 * a message string, because a message is prose and prose drifts.
 */
export function describeError(error: unknown): DescribedError {
  try {
    return classify(error);
  } catch {
    // THE TOTALITY BOUNDARY, and the enforcing control for the property above. Every guard in
    // `classify` is defence in depth over this one.
    //
    // It returns a frozen module CONSTANT and calls nothing. That is deliberate: APTR-10 needed a
    // third tier because its recovery path re-entered the reader that had just thrown, and a
    // boundary whose recovery runs the code that failed is not a boundary, it is a retry. The
    // cheapest possible recovery cannot have that defect. The cost is real and small, and stated
    // rather than hidden: a correlation id is NOT salvaged from a value that broke the
    // classifier, so a fallback reached this way shows no reference.
    return UNKNOWN_PRESENTATION;
  }
}

function classify(error: unknown): DescribedError {
  if (isA(error, ApertureProblemError)) {
    // The check proved a PROTOTYPE, not an origin, so the body is still read as untrusted.
    const problem = ownValue(error, 'problem');
    const urn = ownValue(problem, 'type');
    // The URN is a Map KEY and nothing else. It is never rendered, never interpolated, and never
    // reaches a catalogue lookup — an unrecognised one selects the unknown presentation, so a URN
    // carrying embedded text has no route to the screen.
    const presentation = typeof urn === 'string'
      ? BY_URN.get(urn) ?? UNKNOWN_PRESENTATION
      : UNKNOWN_PRESENTATION;
    const correlationId = safeCorrelationId(problem);
    return correlationId === null ? presentation : { ...presentation, correlationId };
  }

  if (isA(error, ApertureAbortError)) return ABORTED;
  if (isA(error, ApertureNetworkError)) return NETWORK;
  if (isA(error, ApertureTokenUnavailableError)) return TOKEN_UNAVAILABLE;
  if (isA(error, ApertureConfigError)) return CONFIG;

  if (isA(error, ApertureMalformedResponseError)) {
    // A malformed 401 still means the session failed — `isAuthFailure` says so in the SDK, and
    // telling the user to retry a request that cannot succeed until they sign in is worse than
    // useless. The status is read as untrusted DATA and compared, never coerced.
    return ownValue(error, 'status') === 401 ? MALFORMED_AUTH : MALFORMED;
  }

  if (isA(error, ApertureDecodeError)) return DECODE;

  return UNKNOWN_PRESENTATION;
}

/**
 * The `correlation_id`, or `null`.
 *
 * Surfaced only when it matches the contract's `Id` shape — admitted by matching what is valid,
 * not by scrubbing what is not. This is the one value from a response that this client renders,
 * so it is the one that has to be bounded.
 */
function safeCorrelationId(problem: unknown): string | null {
  const raw = ownValue(problem, 'correlation_id');
  return typeof raw === 'string' && matches(ID_PATTERN, raw) ? raw : null;
}

/** The catalogue key for a recovery's explanatory hint. Exhaustive by the union's own type. */
export const RECOVERY_HINT: Record<RecoveryKind, PlainKey> = {
  'fix-input': 'recovery.fixInput.hint',
  reauthenticate: 'recovery.reauthenticate.hint',
  'refresh-session': 'recovery.refreshSession.hint',
  none: 'recovery.none.hint',
  'go-back': 'recovery.goBack.hint',
  refetch: 'recovery.refetch.hint',
  'reduce-payload': 'recovery.reducePayload.hint',
  'wait-and-retry': 'recovery.waitAndRetry.hint',
  'open-settings': 'recovery.openSettings.hint',
  retry: 'recovery.retry.hint',
  'reload-client': 'recovery.reloadClient.hint',
  'contact-operator': 'recovery.contactOperator.hint',
};

/**
 * The catalogue key for a recovery's BUTTON, where the user pressing something is meaningful.
 *
 * `null` is a real answer, not a missing one. Offering "Try again" against a rate limit is an
 * invitation to make it worse; offering one against `forbidden`, or against a payload that is too
 * large, is a control that cannot work — a worse answer than an honest sentence.
 */
export const RECOVERY_ACTION: Record<RecoveryKind, PlainKey | null> = {
  'fix-input': null,
  reauthenticate: 'recovery.reauthenticate.action',
  'refresh-session': null,
  none: null,
  'go-back': 'recovery.goBack.action',
  refetch: 'recovery.refetch.action',
  'reduce-payload': null,
  'wait-and-retry': null,
  'open-settings': 'recovery.openSettings.action',
  retry: 'recovery.retry.action',
  'reload-client': 'recovery.reloadClient.action',
  'contact-operator': null,
};
