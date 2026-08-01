// APTR-07 — problem-details parsing.

import { describe, expect, it } from 'vitest';

import {
  ApertureAuthError,
  ApertureProblemError,
  ERROR_URN,
  ERROR_URN_PATTERN,
  isAuthFailure,
  parseProblem,
  problemToError,
} from './errors.ts';

const valid = { type: ERROR_URN.notFound, title: 'Not found', status: 404 };

describe('parseProblem', () => {
  it('accepts a well-formed problem', () => {
    expect(parseProblem(valid)?.type).toBe(ERROR_URN.notFound);
  });

  it('ignores unknown members rather than rejecting them', () => {
    // The object is closed SERVER-side; the client's half of the versioning bargain is to
    // ignore unknown response fields, so a future additive member cannot break an older client.
    const parsed = parseProblem({ ...valid, some_future_member: 'x' });
    expect(parsed).not.toBeNull();
    expect((parsed as unknown as Record<string, unknown>)['some_future_member']).toBe('x');
  });

  it('rejects a type that is not an Aperture error URN', () => {
    expect(parseProblem({ ...valid, type: 'about:blank' })).toBeNull();
    expect(parseProblem({ ...valid, type: 'urn:aperture:error:NotFound' })).toBeNull();
    expect(parseProblem({ ...valid, type: 'urn:aperture:error:' })).toBeNull();
    expect(parseProblem({ ...valid, type: 'urn:other:error:not-found' })).toBeNull();
  });

  it('accepts a well-formed URN it does not recognize — new URNs are additive on /v1', () => {
    expect(parseProblem({ ...valid, type: 'urn:aperture:error:some-new-class' })).not.toBeNull();
  });

  it('rejects a missing or malformed title or status', () => {
    expect(parseProblem({ type: valid.type, status: 404 })).toBeNull();
    expect(parseProblem({ ...valid, status: '404' })).toBeNull();
    expect(parseProblem({ ...valid, status: 42 })).toBeNull();
    expect(parseProblem({ ...valid, status: 404.5 })).toBeNull();
  });

  it('rejects a non-object body', () => {
    expect(parseProblem(null)).toBeNull();
    expect(parseProblem('problem')).toBeNull();
    expect(parseProblem([valid])).toBeNull();
  });
});

describe('the URN pattern', () => {
  it('matches every URN the contract enumerates', () => {
    for (const urn of Object.values(ERROR_URN)) expect(ERROR_URN_PATTERN.test(urn)).toBe(true);
  });
});

describe('problemToError', () => {
  it('maps the two auth URNs to ApertureAuthError and everything else to ApertureProblemError', () => {
    expect(problemToError({ ...valid, type: ERROR_URN.authRequired, status: 401 }, 1))
      .toBeInstanceOf(ApertureAuthError);
    expect(problemToError({ ...valid, type: ERROR_URN.authExpired, status: 401 }, 1))
      .toBeInstanceOf(ApertureAuthError);
    const forbidden = problemToError({ ...valid, type: ERROR_URN.forbidden, status: 403 }, 1);
    expect(forbidden).toBeInstanceOf(ApertureProblemError);
    expect(forbidden).not.toBeInstanceOf(ApertureAuthError);
    // 403 is an authorization outcome, not a session failure: re-authenticating will not help.
    expect(isAuthFailure(forbidden)).toBe(false);
  });

  it('carries the attempt count and a message naming the URN and status', () => {
    const error = problemToError(valid, 3);
    expect(error.attempts).toBe(3);
    expect(error.status).toBe(404);
    expect(error.message).toContain(ERROR_URN.notFound);
  });
});
