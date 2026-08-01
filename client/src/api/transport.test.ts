// APTR-07 — transport unit tests.
//
// Every test injects `fetch`, so nothing here touches a network. The base URLs used by the
// desktop-target cases are under the RFC 6761 `.invalid` TLD, which is guaranteed never to
// resolve; the SDK static gate permits that TLD in a test file and nothing else.

import { describe, expect, it, vi } from 'vitest';

import {
  ApertureAbortError,
  ApertureAuthError,
  ApertureConfigError,
  ApertureDecodeError,
  ApertureMalformedResponseError,
  ApertureNetworkError,
  ApertureProblemError,
  ApertureTokenUnavailableError,
  isAuthFailure,
} from './errors.ts';
import {
  classifyContractSkew,
  createTransport,
  normalizeBaseUrl,
  parseRetryAfterSeconds,
  type FetchLike,
} from './transport.ts';
import { CONTRACT_VERSION } from './generated/meta.ts';

const CONFIGURED_ENDPOINT = 'https://aperture-endpoint.invalid';

interface Recorded {
  url: string;
  init: RequestInit;
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (!headers.has('X-Aperture-Contract-Version')) {
    headers.set('X-Aperture-Contract-Version', CONTRACT_VERSION);
  }
  return new Response(JSON.stringify(body), { ...init, headers });
}

function problemResponse(
  type: string,
  status: number,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify({ type, title: 'A failure', status, ...extra }),
    {
      status,
      headers: {
        'Content-Type': 'application/problem+json',
        'X-Aperture-Contract-Version': CONTRACT_VERSION,
        ...headers,
      },
    },
  );
}

/** A fetch that returns each queued response in turn and records what it was asked for. */
function scriptedFetch(responses: Array<Response | Error>) {
  const calls: Recorded[] = [];
  const queue = [...responses];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (next === undefined) throw new Error('scriptedFetch: no response queued');
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetchImpl, calls };
}

/** A web/PWA transport: empty base URL, cookie auth. */
function webTransport(
  responses: Array<Response | Error>,
  overrides: Partial<Parameters<typeof createTransport>[0]> = {},
) {
  const { fetchImpl, calls } = scriptedFetch(responses);
  const transport = createTransport({
    baseUrl: '',
    auth: { mode: 'cookie' },
    fetch: fetchImpl,
    sleep: async () => {},
    random: () => 0.5,
    ...overrides,
  });
  return { transport, calls };
}

describe('base URL normalization', () => {
  it('accepts the empty string as the web/PWA same-origin-relative case', () => {
    expect(normalizeBaseUrl('')).toBe('');
    expect(normalizeBaseUrl('   ')).toBe('');
  });

  it('strips a trailing slash and preserves a path suffix', () => {
    expect(normalizeBaseUrl(`${CONFIGURED_ENDPOINT}/`)).toBe(CONFIGURED_ENDPOINT);
    expect(normalizeBaseUrl(`${CONFIGURED_ENDPOINT}/aperture/`)).toBe(`${CONFIGURED_ENDPOINT}/aperture`);
  });

  it('rejects a relative non-empty value rather than guessing at it', () => {
    expect(() => normalizeBaseUrl('/api')).toThrow(ApertureConfigError);
  });

  it('rejects a query string, a fragment, credentials, and a non-http scheme', () => {
    expect(() => normalizeBaseUrl(`${CONFIGURED_ENDPOINT}?x=1`)).toThrow(ApertureConfigError);
    expect(() => normalizeBaseUrl(`${CONFIGURED_ENDPOINT}#f`)).toThrow(ApertureConfigError);
    expect(() => normalizeBaseUrl('https://user:<email>')).toThrow(ApertureConfigError);
    expect(() => normalizeBaseUrl('ftp://aperture-endpoint.invalid')).toThrow(ApertureConfigError);
  });

  it('rejects a base URL that already carries the API path prefix', () => {
    expect(() => normalizeBaseUrl(`${CONFIGURED_ENDPOINT}/v1/aperture`)).toThrow(ApertureConfigError);
  });
});

describe('construction — per-target auth rules (D1)', () => {
  it('rejects cookie auth with a non-empty base URL', () => {
    expect(() => createTransport({ baseUrl: CONFIGURED_ENDPOINT, auth: { mode: 'cookie' } }))
      .toThrow(ApertureConfigError);
    expect(() => createTransport({ baseUrl: CONFIGURED_ENDPOINT, auth: { mode: 'cookie' } }))
      .toThrow(/SameSite=Strict/);
  });

  it('rejects bearer auth with an empty base URL — that is the web target', () => {
    expect(() => createTransport({ baseUrl: '', auth: { mode: 'bearer', getToken: () => 't' } }))
      .toThrow(ApertureConfigError);
  });

  it('accepts the two legitimate targets', () => {
    expect(createTransport({ baseUrl: '', auth: { mode: 'cookie' } }).authMode).toBe('cookie');
    expect(
      createTransport({
        baseUrl: CONFIGURED_ENDPOINT,
        auth: { mode: 'bearer', getToken: () => 't' },
      }).baseUrl,
    ).toBe(CONFIGURED_ENDPOINT);
  });

  it('rejects an auth mode it does not know', () => {
    expect(() => createTransport({
      baseUrl: '',
      auth: { mode: 'basic' } as unknown as { mode: 'cookie' },
    })).toThrow(ApertureConfigError);
  });
});

describe('request addressing', () => {
  it('issues same-origin relative requests when the base URL is empty', async () => {
    const { transport, calls } = webTransport([jsonResponse({ contract_version: CONTRACT_VERSION })]);
    await transport.request({ method: 'GET', path: '/version' });
    expect(calls[0]?.url).toBe('/v1/aperture/version');
  });

  it('issues absolute requests to exactly the configured origin, and nowhere else', async () => {
    const { fetchImpl, calls } = scriptedFetch([jsonResponse({ ok: true })]);
    // Held in a variable rather than written inline: the SDK static gate forbids a non-empty
    // literal reaching a `baseUrl` property, and a test is not exempt from that rule.
    const endpointWithTrailingSlash = `${CONFIGURED_ENDPOINT}/`;
    const transport = createTransport({
      baseUrl: endpointWithTrailingSlash,
      auth: { mode: 'bearer', getToken: () => 'token-value' },
      fetch: fetchImpl,
    });
    await transport.request({ method: 'GET', path: '/threads', query: { limit: 20 } });
    expect(calls[0]?.url).toBe(`${CONFIGURED_ENDPOINT}/v1/aperture/threads?limit=20`);
    expect(new URL(calls[0]!.url).origin).toBe(CONFIGURED_ENDPOINT);
  });

  it('rejects an operation path that is not relative and "/"-rooted', async () => {
    const { transport } = webTransport([]);
    await expect(transport.request({ method: 'GET', path: 'version' }))
      .rejects.toBeInstanceOf(ApertureConfigError);
  });

  it('omits undefined query values rather than serializing them', async () => {
    const { transport, calls } = webTransport([jsonResponse({})]);
    await transport.request({
      method: 'GET',
      path: '/threads',
      query: { limit: 10, cursor: undefined },
    });
    expect(calls[0]?.url).toBe('/v1/aperture/threads?limit=10');
  });
});

describe('auth attachment — the mechanisms never mix', () => {
  it('cookie mode sends same-origin credentials and no Authorization header', async () => {
    const { transport, calls } = webTransport([jsonResponse({})]);
    await transport.request({ method: 'GET', path: '/auth/session' });
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(calls[0]?.init.credentials).toBe('same-origin');
    expect(headers['Authorization']).toBeUndefined();
  });

  it('bearer mode omits credentials and attaches the token', async () => {
    const { fetchImpl, calls } = scriptedFetch([jsonResponse({})]);
    const transport = createTransport({
      baseUrl: CONFIGURED_ENDPOINT,
      auth: { mode: 'bearer', getToken: async () => 'token-value' },
      fetch: fetchImpl,
    });
    await transport.request({ method: 'GET', path: '/auth/session' });
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(calls[0]?.init.credentials).toBe('omit');
    expect(headers['Authorization']).toBe('Bearer token-value');
  });

  it('surfaces an unavailable bearer token as a typed auth failure, with no request made', async () => {
    const { fetchImpl, calls } = scriptedFetch([jsonResponse({})]);
    const transport = createTransport({
      baseUrl: CONFIGURED_ENDPOINT,
      auth: { mode: 'bearer', getToken: () => null },
      fetch: fetchImpl,
    });
    await expect(transport.request({ method: 'GET', path: '/threads' }))
      .rejects.toBeInstanceOf(ApertureTokenUnavailableError);
    expect(calls).toHaveLength(0);
    await expect(transport.request({ method: 'GET', path: '/threads' })
      .catch((error: unknown) => isAuthFailure(error))).resolves.toBe(true);
  });

  it('re-reads the token on every attempt so a refresh between retries is picked up', async () => {
    const tokens = ['stale', 'fresh'];
    const { fetchImpl, calls } = scriptedFetch([
      problemResponse('urn:aperture:error:upstream-error', 502),
      jsonResponse({}),
    ]);
    const transport = createTransport({
      baseUrl: CONFIGURED_ENDPOINT,
      auth: { mode: 'bearer', getToken: () => tokens.shift() ?? null },
      fetch: fetchImpl,
      sleep: async () => {},
      random: () => 0,
    });
    await transport.request({ method: 'GET', path: '/threads' });
    expect((calls[0]?.init.headers as Record<string, string>)['Authorization']).toBe('Bearer stale');
    expect((calls[1]?.init.headers as Record<string, string>)['Authorization']).toBe('Bearer fresh');
  });
});

describe('problem-details normalization', () => {
  it('normalizes a problem response to a typed error carrying the closed Problem object', async () => {
    const { transport } = webTransport([
      problemResponse('urn:aperture:error:validation-failed', 400, {
        detail: 'The sort field is not sortable on this route.',
        errors: [{ pointer: '/sort', message: 'unknown field' }],
        correlation_id: '01J0000000000000000000000A',
      }),
    ]);
    const error = await transport.request({ method: 'GET', path: '/threads' })
      .then(() => null, (caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApertureProblemError);
    const problem = (error as ApertureProblemError).problem;
    expect(problem.type).toBe('urn:aperture:error:validation-failed');
    expect(problem.status).toBe(400);
    expect(problem.errors?.[0]?.pointer).toBe('/sort');
    expect((error as ApertureProblemError).attempts).toBe(1);
  });

  it('classifies auth-required and auth-expired as auth errors, and distinguishes them', async () => {
    const required = await webTransport([problemResponse('urn:aperture:error:auth-required', 401)])
      .transport.request({ method: 'GET', path: '/threads' })
      .then(() => null, (caught: unknown) => caught);
    const expired = await webTransport([problemResponse('urn:aperture:error:auth-expired', 401)])
      .transport.request({ method: 'GET', path: '/threads' })
      .then(() => null, (caught: unknown) => caught);

    expect(required).toBeInstanceOf(ApertureAuthError);
    expect((required as ApertureAuthError).expired).toBe(false);
    expect(expired).toBeInstanceOf(ApertureAuthError);
    expect((expired as ApertureAuthError).expired).toBe(true);
    expect(isAuthFailure(required)).toBe(true);
  });

  it('refuses to synthesize a Problem for an off-contract error body', async () => {
    const cases: Array<[Response, 'media-type' | 'unparseable' | 'schema']> = [
      [new Response('gateway error', { status: 502, headers: { 'Content-Type': 'text/html' } }), 'media-type'],
      [new Response('{', { status: 500, headers: { 'Content-Type': 'application/problem+json' } }), 'unparseable'],
      [
        new Response(JSON.stringify({ type: 'https://example.invalid/err', title: 'x', status: 500 }), {
          status: 500,
          headers: { 'Content-Type': 'application/problem+json' },
        }),
        'schema',
      ],
    ];
    for (const [response, reason] of cases) {
      const { transport } = webTransport([response], { retry: { maxAttempts: 1 } });
      const error = await transport.request({ method: 'GET', path: '/threads' })
        .then(() => null, (caught: unknown) => caught);
      expect(error).toBeInstanceOf(ApertureMalformedResponseError);
      expect((error as ApertureMalformedResponseError).reason).toBe(reason);
    }
  });

  it('treats a malformed 401 as an auth failure even without a Problem', async () => {
    const { transport } = webTransport([
      new Response('nope', { status: 401, headers: { 'Content-Type': 'text/plain' } }),
    ]);
    const error = await transport.request({ method: 'GET', path: '/threads' })
      .then(() => null, (caught: unknown) => caught);
    expect(isAuthFailure(error)).toBe(true);
  });

  it('reports an undecodable 2xx body as a decode error, not as a problem', async () => {
    const { transport } = webTransport([
      new Response('{oops', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ]);
    await expect(transport.request({ method: 'GET', path: '/threads' }))
      .rejects.toBeInstanceOf(ApertureDecodeError);
  });

  it('returns the untouched Response for a raw-body route, and still normalizes its errors', async () => {
    const { transport } = webTransport([
      new Response('not json at all', {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      }),
    ]);
    const result = await transport.request<Response>({
      method: 'GET',
      path: '/attachments/a1/content',
      responseBody: 'raw',
      accept: 'application/octet-stream',
    });
    expect(result.data).toBeInstanceOf(Response);
    expect(result.data.bodyUsed).toBe(false);
    await expect(result.data.text()).resolves.toBe('not json at all');

    const { transport: failing } = webTransport([
      problemResponse('urn:aperture:error:not-found', 404),
    ]);
    await expect(failing.request({
      method: 'GET',
      path: '/attachments/a1/content',
      responseBody: 'raw',
    })).rejects.toBeInstanceOf(ApertureProblemError);
  });

  it('returns undefined data for a 204 without attempting to decode', async () => {
    const { transport } = webTransport([new Response(null, { status: 204 })]);
    const result = await transport.request({ method: 'DELETE', path: '/threads/t1' });
    expect(result.status).toBe(204);
    expect(result.data).toBeUndefined();
  });
});

describe('retries — idempotent verbs only, capped, jittered', () => {
  it('retries an idempotent GET on a retryable status', async () => {
    const { transport, calls } = webTransport([
      problemResponse('urn:aperture:error:upstream-error', 502),
      jsonResponse({ ok: true }),
    ]);
    const result = await transport.request({ method: 'GET', path: '/threads' });
    expect(calls).toHaveLength(2);
    expect(result.attempts).toBe(2);
  });

  it('does NOT retry a non-idempotent POST', async () => {
    const { transport, calls } = webTransport([
      problemResponse('urn:aperture:error:upstream-error', 502),
      jsonResponse({ ok: true }),
    ]);
    await expect(transport.request({ method: 'POST', path: '/threads', body: {} }))
      .rejects.toBeInstanceOf(ApertureProblemError);
    expect(calls).toHaveLength(1);
  });

  it('does NOT retry a POST merely because it carries an idempotency key', async () => {
    const { transport, calls } = webTransport([
      problemResponse('urn:aperture:error:upstream-error', 502),
      jsonResponse({ ok: true }),
    ]);
    await expect(transport.request({
      method: 'POST',
      path: '/threads/t1/messages',
      body: {},
      idempotencyKey: 'key-1',
    })).rejects.toBeInstanceOf(ApertureProblemError);
    expect(calls).toHaveLength(1);
  });

  it('retries a POST when the caller explicitly opts in, replaying the same key', async () => {
    const { transport, calls } = webTransport([
      problemResponse('urn:aperture:error:upstream-error', 502),
      jsonResponse({ ok: true }),
    ]);
    await transport.request({
      method: 'POST',
      path: '/threads/t1/messages',
      body: {},
      idempotencyKey: 'key-1',
      retry: true,
    });
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect((call.init.headers as Record<string, string>)['Idempotency-Key']).toBe('key-1');
    }
  });

  it('does not retry a 500 — the same request would hit the same fault', async () => {
    const { transport, calls } = webTransport([
      problemResponse('urn:aperture:error:internal', 500),
      jsonResponse({ ok: true }),
    ]);
    await expect(transport.request({ method: 'GET', path: '/threads' })).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it('caps the attempt count', async () => {
    const { transport, calls } = webTransport(
      Array.from({ length: 5 }, () => problemResponse('urn:aperture:error:upstream-error', 502)),
      { retry: { maxAttempts: 3 } },
    );
    const error = await transport.request({ method: 'GET', path: '/threads' })
      .then(() => null, (caught: unknown) => caught);
    expect(calls).toHaveLength(3);
    expect((error as ApertureProblemError).attempts).toBe(3);
  });

  it('jitters the backoff over an exponential base, capped', async () => {
    const waits: number[] = [];
    const { transport } = webTransport(
      [
        problemResponse('urn:aperture:error:upstream-error', 502),
        problemResponse('urn:aperture:error:upstream-error', 502),
        jsonResponse({}),
      ],
      {
        retry: { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 },
        random: () => 1,
        sleep: async (ms: number) => { waits.push(ms); },
      },
    );
    await transport.request({ method: 'GET', path: '/threads' });
    // full jitter with random() === 1 gives the exponential ceiling: 100, then 200.
    expect(waits).toEqual([100, 200]);
  });

  it('honours Retry-After and never substitutes a shorter interval', async () => {
    const waits: number[] = [];
    const { transport } = webTransport(
      [
        problemResponse('urn:aperture:error:rate-limited', 429, {}, { 'Retry-After': '2' }),
        jsonResponse({}),
      ],
      { sleep: async (ms: number) => { waits.push(ms); } },
    );
    await transport.request({ method: 'GET', path: '/threads' });
    expect(waits).toEqual([2000]);
  });

  it('gives up rather than retrying early when Retry-After exceeds the cap', async () => {
    const { transport, calls } = webTransport(
      [
        problemResponse('urn:aperture:error:rate-limited', 429, {}, { 'Retry-After': '600' }),
        jsonResponse({}),
      ],
      { retry: { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 8000 } },
    );
    await expect(transport.request({ method: 'GET', path: '/threads' })).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it('does not retry a 429 or 503 that carries no usable Retry-After', async () => {
    for (const status of [429, 503]) {
      const { transport, calls } = webTransport([
        problemResponse('urn:aperture:error:rate-limited', status),
        jsonResponse({}),
      ]);
      await expect(transport.request({ method: 'GET', path: '/threads' })).rejects.toThrow();
      expect(calls).toHaveLength(1);
    }
  });

  it('retries a network failure on an idempotent verb and reports it typed when it persists', async () => {
    const { transport, calls } = webTransport([
      new TypeError('connection refused'),
      new TypeError('connection refused'),
      new TypeError('connection refused'),
    ]);
    await expect(transport.request({ method: 'GET', path: '/threads' }))
      .rejects.toBeInstanceOf(ApertureNetworkError);
    expect(calls).toHaveLength(3);
  });

  it('does not retry an abort, and reports it distinctly from a network failure', async () => {
    const controller = new AbortController();
    controller.abort();
    const { fetchImpl, calls } = scriptedFetch([new TypeError('aborted')]);
    const transport = createTransport({
      baseUrl: '',
      auth: { mode: 'cookie' },
      fetch: fetchImpl,
      sleep: async () => {},
    });
    await expect(transport.request({ method: 'GET', path: '/threads', signal: controller.signal }))
      .rejects.toBeInstanceOf(ApertureAbortError);
    expect(calls).toHaveLength(1);
  });
});

describe('Retry-After parsing', () => {
  it('accepts integer seconds and rejects every other shape', () => {
    expect(parseRetryAfterSeconds('30')).toBe(30);
    expect(parseRetryAfterSeconds(' 0 ')).toBe(0);
    expect(parseRetryAfterSeconds('Wed, 21 Oct 2026 07:28:00 GMT')).toBeNull();
    expect(parseRetryAfterSeconds('1.5')).toBeNull();
    expect(parseRetryAfterSeconds(null)).toBeNull();
  });
});

describe('contract version skew', () => {
  it('classifies per contracts/README.md, failing closed on a malformed header', () => {
    expect(classifyContractSkew(CONTRACT_VERSION)).toBe('match');
    expect(classifyContractSkew('1.9')).toBe('server-newer-minor');
    expect(classifyContractSkew('1.0')).toBe(CONTRACT_VERSION === '1.0' ? 'match' : 'server-older-minor');
    expect(classifyContractSkew('2.0')).toBe('incompatible');
    expect(classifyContractSkew('0.9')).toBe('incompatible');
    expect(classifyContractSkew('nonsense')).toBe('incompatible');
    expect(classifyContractSkew(null)).toBe('absent');
  });

  it('reports the first non-match skew once per transport instance', async () => {
    const onContractSkew = vi.fn();
    const { transport } = webTransport(
      [
        jsonResponse({}, { headers: { 'X-Aperture-Contract-Version': '2.0' } }),
        jsonResponse({}, { headers: { 'X-Aperture-Contract-Version': '2.0' } }),
      ],
      { onContractSkew },
    );
    const first = await transport.request({ method: 'GET', path: '/threads' });
    await transport.request({ method: 'GET', path: '/threads' });
    expect(first.contractSkew).toBe('incompatible');
    expect(onContractSkew).toHaveBeenCalledTimes(1);
    expect(onContractSkew).toHaveBeenCalledWith('incompatible', '2.0');
  });
});

describe('stream', () => {
  it('sends the stream headers, Last-Event-ID, and the target auth', async () => {
    const { transport, calls } = webTransport([
      new Response('event: ping\ndata: {}\n\n', {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'X-Aperture-Contract-Version': CONTRACT_VERSION },
      }),
    ]);
    const stream = await transport.openStream({ lastEventId: '42' });
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(calls[0]?.url).toBe('/v1/aperture/stream');
    expect(headers['Accept']).toBe('text/event-stream');
    expect(headers['Last-Event-ID']).toBe('42');
    expect(calls[0]?.init.credentials).toBe('same-origin');
    expect(stream.status).toBe(200);
    expect(stream.body).not.toBeNull();
  });

  it('surfaces a 401 on connect or reconnect as a typed auth error', async () => {
    const { transport } = webTransport([problemResponse('urn:aperture:error:auth-expired', 401)]);
    const error = await transport.openStream().then(() => null, (caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApertureAuthError);
    expect((error as ApertureAuthError).expired).toBe(true);
  });

  it('makes exactly one attempt — reconnection is the stream client\'s decision', async () => {
    const { transport, calls } = webTransport([new TypeError('connection reset')]);
    await expect(transport.openStream()).rejects.toBeInstanceOf(ApertureNetworkError);
    expect(calls).toHaveLength(1);
  });
});
