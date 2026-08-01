// APTR-07 — the SDK's typed error surface.
//
// Every failure the transport can produce is one of the classes below. Callers switch on the
// class (or on `problem.type`), never on a message string.
//
// The contract's rule is that EVERY error response is RFC-9457 problem details with a stable
// `urn:aperture:error:<class>` type. This module trusts that rule for well-formed responses
// and refuses to fake it for malformed ones: a response that is not conforming problem details
// becomes `ApertureMalformedResponseError`, NOT a synthesized `Problem`. Minting a contract URN
// for a body that never carried one would put a fabricated error identity in front of a caller
// switching on error identity.

import type { components } from './generated/schema.ts';

/** RFC-9457 problem details, exactly as the contract declares them. The object is closed. */
export type Problem = components['schemas']['Problem'];

/** The error URNs the contract enumerates. Unknown URNs are still valid — see below. */
export const ERROR_URN = {
  validationFailed: 'urn:aperture:error:validation-failed',
  authRequired: 'urn:aperture:error:auth-required',
  authExpired: 'urn:aperture:error:auth-expired',
  forbidden: 'urn:aperture:error:forbidden',
  notFound: 'urn:aperture:error:not-found',
  conflict: 'urn:aperture:error:conflict',
  preconditionFailed: 'urn:aperture:error:precondition-failed',
  payloadTooLarge: 'urn:aperture:error:payload-too-large',
  rateLimited: 'urn:aperture:error:rate-limited',
  capabilityUnavailable: 'urn:aperture:error:capability-unavailable',
  upstreamTimeout: 'urn:aperture:error:upstream-timeout',
  upstreamError: 'urn:aperture:error:upstream-error',
  contractVersionUnsupported: 'urn:aperture:error:contract-version-unsupported',
  internal: 'urn:aperture:error:internal',
} as const;

/**
 * The shape a `Problem.type` must have. Enforced by the contract schema; re-checked here
 * because a client that switches on `type` must not switch on an arbitrary URI that some
 * implementation minted at the point of failure.
 *
 * A URN matching this pattern but absent from {@link ERROR_URN} is accepted and passed through:
 * the versioning policy adds new URNs additively on `/v1`, so rejecting an unrecognized-but-
 * well-formed URN would break a conforming client against a newer server.
 */
export const ERROR_URN_PATTERN = /^urn:aperture:error:[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** Where in the request lifecycle a failure occurred. */
export type FailurePhase = 'request' | 'response' | 'stream';

/** The base class of every error this SDK throws. */
export class ApertureError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/**
 * The transport was constructed with a configuration the contract forbids — most importantly
 * cookie auth together with a non-empty base URL. Thrown at CONSTRUCTION, not at request time,
 * so the mistake surfaces where it was made.
 */
export class ApertureConfigError extends ApertureError {}

/** The request never produced a response: DNS, connection, TLS, or an aborted body read. */
export class ApertureNetworkError extends ApertureError {
  readonly phase: FailurePhase;

  constructor(message: string, phase: FailurePhase, options?: { cause?: unknown }) {
    super(message, options);
    this.phase = phase;
  }
}

/** The caller's `AbortSignal` fired. Distinct from a network failure: nothing went wrong. */
export class ApertureAbortError extends ApertureError {}

/** An error response carrying well-formed RFC-9457 problem details. */
export class ApertureProblemError extends ApertureError {
  readonly problem: Problem;
  readonly status: number;
  /** The number of attempts made, including the one that produced this response. */
  readonly attempts: number;

  constructor(problem: Problem, attempts: number) {
    super(`${problem.type} (${problem.status}): ${problem.title}`);
    this.problem = problem;
    this.status = problem.status;
    this.attempts = attempts;
  }

  /** The stable error URN. Callers switch on this. */
  get type(): string {
    return this.problem.type;
  }
}

/**
 * An authentication failure the UI must act on rather than retry — including a 401 observed
 * when opening or reopening the event stream.
 *
 * `authRequired` means re-authenticate; `authExpired` means the session existed and a refresh
 * is the right move. The contract keeps them distinct precisely so a client need not guess.
 */
export class ApertureAuthError extends ApertureProblemError {
  /** `true` for `auth-expired` (refresh), `false` for `auth-required` (re-authenticate). */
  readonly expired: boolean;

  constructor(problem: Problem, attempts: number) {
    super(problem, attempts);
    this.expired = problem.type === ERROR_URN.authExpired;
  }
}

/**
 * The server returned an error status but not conforming problem details — wrong media type,
 * unparseable body, or a `type` that is not a valid Aperture error URN.
 *
 * No `Problem` is synthesized. `status` and `contentType` are carried because they are the
 * only two facts that are safely knowable; the body is NOT retained, because an off-contract
 * error body is exactly where an upstream message or an infrastructure identifier would be.
 */
export class ApertureMalformedResponseError extends ApertureError {
  readonly status: number;
  readonly contentType: string | null;
  readonly attempts: number;
  /** Why the body failed to qualify as problem details. Describes the shape, not the content. */
  readonly reason: 'media-type' | 'unparseable' | 'schema';

  constructor(
    status: number,
    contentType: string | null,
    reason: 'media-type' | 'unparseable' | 'schema',
    attempts: number,
  ) {
    super(
      `HTTP ${status} was not conforming problem details (${reason}). `
      + 'Every Aperture error response is application/problem+json with a '
      + 'urn:aperture:error: type; this one was not, so no Problem is reported.',
    );
    this.status = status;
    this.contentType = contentType;
    this.reason = reason;
    this.attempts = attempts;
  }
}

/**
 * The bearer token getter returned no token, so no request was sent.
 *
 * This is a client-side auth failure, not a server one: there is no `Problem`, because there
 * was no response. It is reported separately rather than as a config error because the UI's
 * correct reaction is the same as for a 401 — get the user authenticated — and
 * {@link isAuthFailure} therefore includes it.
 */
export class ApertureTokenUnavailableError extends ApertureError {
  constructor() {
    super(
      'The bearer token getter returned no token, so no request was made. The desktop target '
      + 'reads its token from OS secure storage; an empty result means the session must be '
      + 're-established.',
    );
  }
}

/** A 2xx response whose body could not be parsed as the JSON the contract declares. */
export class ApertureDecodeError extends ApertureError {
  readonly status: number;

  constructor(status: number, options?: { cause?: unknown }) {
    super(`HTTP ${status} body could not be decoded as JSON.`, options);
    this.status = status;
  }
}

/**
 * `true` when the failure means "the session is not usable" — either a well-formed auth URN, or
 * a bare 401 whose body was off-contract.
 *
 * Stated precisely because the two cases differ in what is knowable: for an
 * {@link ApertureAuthError} the SDK knows whether to refresh or re-authenticate; for a
 * malformed 401 it knows only that the session failed.
 */
export function isAuthFailure(error: unknown): boolean {
  if (error instanceof ApertureAuthError) return true;
  if (error instanceof ApertureTokenUnavailableError) return true;
  if (error instanceof ApertureMalformedResponseError) return error.status === 401;
  return false;
}

/**
 * Validate a decoded body as problem details.
 *
 * Unknown members are IGNORED rather than rejected: the contract closes the object server-side,
 * and the client half of the versioning bargain is to ignore unknown response fields. Ignoring
 * them here means a future additive member cannot break an older client.
 *
 * @returns the `Problem` on success, or `null` if the body does not qualify.
 */
export function parseProblem(body: unknown): Problem | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const candidate = body as Record<string, unknown>;

  const type = candidate['type'];
  const title = candidate['title'];
  const status = candidate['status'];

  if (typeof type !== 'string' || !ERROR_URN_PATTERN.test(type)) return null;
  if (typeof title !== 'string') return null;
  if (typeof status !== 'number' || !Number.isInteger(status) || status < 100 || status > 599) {
    return null;
  }

  return candidate as unknown as Problem;
}

/** Build the right error class for a well-formed problem. */
export function problemToError(problem: Problem, attempts: number): ApertureProblemError {
  if (problem.type === ERROR_URN.authRequired || problem.type === ERROR_URN.authExpired) {
    return new ApertureAuthError(problem, attempts);
  }
  return new ApertureProblemError(problem, attempts);
}
