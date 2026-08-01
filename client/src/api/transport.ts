// APTR-07 — the Aperture transport. THE ONLY FILE IN THIS CLIENT THAT CONSTRUCTS A REQUEST.
//
// ── WHY THIS FILE EXISTS AT ALL (decision D1) ───────────────────────────────────────────────
//
// Sprint A originally required "never construct an absolute URL; every request is same-origin
// relative". That is right for a browser and impossible for the desktop shell, whose webview
// origin is a custom scheme that does not resolve to the backend. Three reviews found the same
// contradiction. The criterion is amended to **no hardcoded absolute URL and no compiled-in
// default endpoint**, and the transport becomes injectable:
//
//   Web / mobile PWA   baseUrl: ''  (same-origin relative)   auth: cookie   never a bearer
//   Desktop            baseUrl: operator-configured endpoint auth: bearer   never a cookie
//
// `baseUrl` is a REQUIRED constructor argument with no default. There is no module-level
// singleton, no fallback endpoint, and no endpoint literal anywhere in this file or in any
// other file under `src/api/` — `scripts/assert-sdk-clean.mjs` parses them and proves it.
//
// ── CORS ────────────────────────────────────────────────────────────────────────────────────
//
// Nothing here assumes CORS, requests it, or degrades without it. No CORS headers are served on
// `/v1/aperture/*`, ever. The web target is same-origin, so there is nothing for CORS to
// permit; the desktop target reaches the API as a NATIVE HTTP client (its `fetch` implementation
// is injected through `options.fetch`), which is not subject to the same-origin policy and is
// not asking a browser for permission. `mode` is deliberately never set on a request: setting
// `mode: 'cors'` would encode an expectation the contract refuses to meet.
//
// ── COOKIES AND BEARERS DO NOT MIX ──────────────────────────────────────────────────────────
//
// Cookie mode sends `credentials: 'same-origin'` and attaches no `Authorization` header. Bearer
// mode sends `credentials: 'omit'` and attaches `Authorization: Bearer …`, so a bearer request
// can never also carry a cookie. Cookie auth with a non-empty base URL throws at construction:
// a cross-origin cookie cannot be `SameSite=Strict`, and the flags are never loosened to make
// one work.

import {
  ApertureAbortError,
  ApertureConfigError,
  ApertureDecodeError,
  ApertureMalformedResponseError,
  ApertureNetworkError,
  ApertureTokenUnavailableError,
  parseProblem,
  problemToError,
} from './errors.ts';
import {
  API_PATH_PREFIX,
  CONTRACT_VERSION,
  CONTRACT_VERSION_HEADER,
  CONTRACT_VERSION_MAJOR,
  CONTRACT_VERSION_MINOR,
} from './generated/meta.ts';
import type { HttpMethod } from './generated/operations.ts';

/** The subset of the `fetch` signature this transport uses. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * Per-target authentication.
 *
 * `cookie` is the web and mobile-PWA mode: the `__Host-` prefixed, `HttpOnly`, `Secure`,
 * `SameSite=Strict` session cookie, which client JavaScript cannot read by design. `bearer` is
 * the desktop mode: the token lives in OS secure storage and is supplied by `getToken`, which
 * is called on every attempt so a token refreshed between retries is picked up.
 */
export type ApertureAuth =
  | { readonly mode: 'cookie' }
  | { readonly mode: 'bearer'; readonly getToken: () => string | null | Promise<string | null> };

/** Retry bounds. Every field has a default; every default is capped. */
export interface RetryPolicy {
  /** Total attempts including the first. `1` disables retrying. */
  readonly maxAttempts: number;
  /** The exponential base delay, in milliseconds. */
  readonly baseDelayMs: number;
  /**
   * The ceiling on any single wait, in milliseconds. Also the ceiling on an honoured
   * `Retry-After`: a longer one means the transport gives up rather than waiting a shorter
   * interval than the server asked for.
   */
  readonly maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 8_000,
};

/**
 * How the server's contract version relates to the one this SDK was generated against.
 * Classification follows `contracts/README.md`, "Version skew".
 */
export type ContractSkew =
  | 'match'
  | 'server-newer-minor'
  | 'server-older-minor'
  | 'incompatible'
  | 'absent';

export interface TransportOptions {
  /**
   * REQUIRED, with no default and no fallback.
   *
   * The empty string selects same-origin relative addressing (web, mobile PWA). A non-empty
   * value must be an absolute `http`/`https` origin, optionally with a path prefix; it is
   * normalized once at construction — trailing slashes are stripped — and used verbatim
   * thereafter. A query string, a fragment, or embedded credentials are rejected.
   */
  readonly baseUrl: string;
  readonly auth: ApertureAuth;
  /**
   * The request implementation. Defaults to the ambient `fetch`. The desktop target injects
   * its native HTTP client here, which is why nothing in this file assumes a browser.
   */
  readonly fetch?: FetchLike;
  readonly retry?: Partial<RetryPolicy>;
  /** Injected for deterministic tests. Defaults to `Math.random`. */
  readonly random?: () => number;
  /** Injected for deterministic tests. Defaults to an abortable `setTimeout`. */
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /**
   * Called at most ONCE per transport instance, with the first non-`match` skew observed.
   * A client that constructs one transport per session therefore gets the "once per session"
   * behaviour the contract asks for; a client that constructs several gets one notification
   * each, and owns the deduplication.
   */
  readonly onContractSkew?: (skew: ContractSkew, serverVersion: string | null) => void;
}

export interface RequestOptions {
  readonly method: HttpMethod;
  /**
   * The operation path, relative and `/`-rooted, with its template placeholders already
   * substituted — e.g. `/threads/01J.../messages`. It never carries an origin.
   */
  readonly path: string;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>> | undefined;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>> | undefined;
  /**
   * The `Idempotency-Key` for a route that requires one. Generate it per LOGICAL operation, not
   * per attempt: a user-initiated resend is a new logical operation and takes a new key.
   */
  readonly idempotencyKey?: string | undefined;
  readonly ifMatch?: string | undefined;
  readonly signal?: AbortSignal | undefined;
  /**
   * Override the retry decision for this request.
   *
   * The idempotent-verbs restriction governs the transport's AUTOMATIC decision — what it does
   * when the caller says nothing. Setting this `true` is an explicit per-request opt-in that
   * OVERRIDES that restriction, including on `POST` and `PATCH`: the caller is asserting that
   * the route's `Idempotency-Key` dedupe makes a replay safe. The transport cannot verify that
   * assertion and does not make it on the caller's behalf. Setting it `false` disables retrying
   * for a verb that would otherwise be retried.
   *
   * The status policy is NOT overridable: only the statuses named in the two retryable sets are
   * ever retried, whatever this is set to.
   */
  readonly retry?: boolean | undefined;
  /** Expected response media type. Defaults to `application/json`. */
  readonly accept?: string | undefined;
  /**
   * How to deliver a SUCCESS body.
   *
   * `'json'` (the default) decodes it. `'raw'` returns the `Response` untouched, with its body
   * unread, which is what a route serving bytes rather than JSON needs — attachment content is
   * the one such route in v1. Error responses are normalized identically either way: a failure
   * is always problem details, including on a route whose success body is binary.
   */
  readonly responseBody?: 'json' | 'raw' | undefined;
}

export interface ApertureResponse<T> {
  readonly data: T;
  readonly status: number;
  readonly headers: Headers;
  /** The `ETag`, when the route returns one. Supply it back as `ifMatch` on the next mutation. */
  readonly etag: string | null;
  readonly contractSkew: ContractSkew;
  /** Attempts made, including the successful one. */
  readonly attempts: number;
}

export interface StreamResponse {
  readonly body: ReadableStream<Uint8Array> | null;
  readonly status: number;
  readonly headers: Headers;
  readonly contractSkew: ContractSkew;
}

export interface Transport {
  /** The normalized base URL. `''` for the web and mobile-PWA targets. */
  readonly baseUrl: string;
  readonly authMode: 'cookie' | 'bearer';
  request<T>(options: RequestOptions): Promise<ApertureResponse<T>>;
  /**
   * Open the SSE stream. See the note on {@link createTransport} about what a 401 can and
   * cannot be detected here.
   */
  openStream(options?: {
    readonly lastEventId?: string | undefined;
    readonly query?: Readonly<Record<string, string | number | boolean | undefined>> | undefined;
    readonly signal?: AbortSignal | undefined;
  }): Promise<StreamResponse>;
}

/**
 * Methods the transport retries AUTOMATICALLY — that is, when the caller expresses no
 * preference through `RequestOptions.retry`.
 *
 * POST and PATCH are absent and are never retried automatically, even when carrying an
 * `Idempotency-Key`. The key makes a replay safe SERVER-side, but the transport cannot know
 * that the route it is calling implements the dedupe store, and a replayed create against a
 * route that does not is a duplicate message.
 *
 * An explicit `retry: true` overrides this set, deliberately and per request — see the field's
 * documentation. So "idempotent verbs only" describes the DEFAULT, not an invariant the caller
 * cannot lift, and it is stated that way everywhere rather than as an absolute.
 */
const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE', 'TRACE']);

/**
 * Statuses retried on the transport's own initiative, with a jittered backoff it chooses.
 *
 * 500 (`internal`) is deliberately absent: it signals a fault the same request will hit again,
 * and retrying it is how a struggling backend gets a retry storm on top of its outage.
 */
const RETRYABLE_WITH_OWN_BACKOFF: ReadonlySet<number> = new Set([408, 502, 504]);

/**
 * Statuses retried ONLY when the server supplies a usable `Retry-After`.
 *
 * 429 and 503 are the server saying "not now" — and, when it wants to be retried, saying when.
 * A server that declines to name an interval has not asked to be retried at a time of the
 * client's choosing, and guessing a backoff on its behalf is how a struggling backend acquires
 * a thundering herd. So without a usable `Retry-After` these are NOT retried; the caller gets
 * the typed `rate-limited` / `capability-unavailable` error and decides.
 *
 * This is the whole policy, not a narrowing of a broader one stated elsewhere: the two sets
 * above are the complete list of statuses this transport will ever retry.
 */
const RETRYABLE_WITH_SERVER_INTERVAL: ReadonlySet<number> = new Set([429, 503]);

const PROBLEM_MEDIA_TYPE = 'application/problem+json';

function mediaTypeOf(header: string | null): string | null {
  if (header === null) return null;
  const semicolon = header.indexOf(';');
  return (semicolon === -1 ? header : header.slice(0, semicolon)).trim().toLowerCase();
}

/**
 * Normalize a base URL exactly once, at construction.
 *
 * Documented behaviour for the edge the item calls out — "a caller passing a base URL with a
 * path suffix or trailing slash":
 *   - `''`                        → `''`            (web / PWA, same-origin relative)
 *   - `https://example/`          → `https://example`
 *   - `https://example/aperture/` → `https://example/aperture`  (path suffix preserved)
 * A query string, a fragment, embedded credentials, a non-http(s) scheme, or a value that
 * already ends in the API path prefix are all rejected — the last because the prefix is added
 * per request and a caller who included it would silently double it.
 */
export function normalizeBaseUrl(raw: string): string {
  if (typeof raw !== 'string') {
    throw new ApertureConfigError('baseUrl must be a string. It is required and has no default.');
  }
  const trimmed = raw.trim();
  if (trimmed === '') return '';

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (cause) {
    throw new ApertureConfigError(
      'baseUrl must be either the empty string (same-origin relative) or an absolute URL. '
      + 'A relative non-empty value is rejected rather than guessed at.',
      { cause },
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ApertureConfigError('baseUrl must use the http or https scheme.');
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new ApertureConfigError(
      'baseUrl must not embed credentials. The bearer token is supplied by the auth getter and '
      + 'lives in OS secure storage, never in a URL.',
    );
  }
  if (parsed.search !== '' || parsed.hash !== '') {
    throw new ApertureConfigError('baseUrl must not carry a query string or a fragment.');
  }

  let normalized = `${parsed.origin}${parsed.pathname}`;
  while (normalized.endsWith('/')) normalized = normalized.slice(0, -1);

  if (normalized.endsWith(API_PATH_PREFIX)) {
    throw new ApertureConfigError(
      `baseUrl must not already end with ${API_PATH_PREFIX}: the transport adds that prefix to `
      + 'every request, so including it here would double it.',
    );
  }
  return normalized;
}

/** Classify the server's contract version against the one this SDK was generated against. */
export function classifyContractSkew(headerValue: string | null): ContractSkew {
  if (headerValue === null) return 'absent';
  const match = /^([0-9]+)\.([0-9]+)$/.exec(headerValue.trim());
  // "Fail closed to incompatible. Never parse-guess." — contracts/README.md.
  if (match === null) return 'incompatible';
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major !== CONTRACT_VERSION_MAJOR) return 'incompatible';
  if (minor === CONTRACT_VERSION_MINOR) return 'match';
  return minor > CONTRACT_VERSION_MINOR ? 'server-newer-minor' : 'server-older-minor';
}

/**
 * Parse `Retry-After`.
 *
 * Only the integer-seconds form is accepted, which is the only form the contract declares.
 * An HTTP-date or any other shape returns `null`, and a `null` here means DO NOT RETRY —
 * failing closed rather than inventing an interval, because the contract says a client honours
 * `Retry-After` and does not substitute its own shorter one.
 */
export function parseRetryAfterSeconds(headerValue: string | null): number | null {
  if (headerValue === null) return null;
  const trimmed = headerValue.trim();
  if (!/^[0-9]+$/.test(trimmed)) return null;
  const seconds = Number(trimmed);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new ApertureAbortError('The request was aborted while waiting to retry.'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new ApertureAbortError('The request was aborted while waiting to retry.'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function buildQuery(
  query: Readonly<Record<string, string | number | boolean | undefined>> | undefined,
): string {
  if (query === undefined) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    params.append(key, String(value));
  }
  const serialized = params.toString();
  return serialized === '' ? '' : `?${serialized}`;
}

function isAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted === true) return true;
  if (error instanceof ApertureAbortError) return true;
  return typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError';
}

/**
 * Construct a transport.
 *
 * @throws ApertureConfigError if `auth.mode` is `cookie` and `baseUrl` is non-empty — a
 *   cross-origin cookie cannot be `SameSite=Strict` and the flags are never loosened; or if
 *   `auth.mode` is `bearer` and `baseUrl` is empty, because an empty base URL IS the web target
 *   and the web target never uses a bearer token.
 *
 * **What `openStream` can and cannot tell you about a 401.** A 401 delivered as the stream's
 * HTTP response — at connect, and on every reconnect a client makes after a drop — is
 * normalized here to `ApertureAuthError` like any other response. Once the response is 200 and
 * the body is streaming, HTTP status can no longer change, so an authorization failure raised
 * mid-turn can only arrive as an SSE event inside the body. **This SDK does not parse SSE
 * frames** (the frame parser is Sprint B's, and there is exactly one of them), so it cannot
 * detect that case and does not claim to. It surfaces the body unparsed for the stream client
 * to read.
 */
export function createTransport(options: TransportOptions): Transport {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const auth = options.auth;

  if (auth === undefined || auth === null || (auth.mode !== 'cookie' && auth.mode !== 'bearer')) {
    throw new ApertureConfigError("auth must be { mode: 'cookie' } or { mode: 'bearer', getToken }.");
  }
  if (auth.mode === 'cookie' && baseUrl !== '') {
    throw new ApertureConfigError(
      'Cookie auth requires an empty baseUrl. The session cookie is `__Host-` prefixed, '
      + '`Secure`, `SameSite=Strict` and same-origin only; a cross-origin cookie cannot be '
      + '`SameSite=Strict`, and the flags are never loosened to make one work. A target with a '
      + 'configured endpoint uses a bearer token instead.',
    );
  }
  if (auth.mode === 'bearer' && baseUrl === '') {
    throw new ApertureConfigError(
      'Bearer auth requires a non-empty baseUrl. An empty baseUrl is the web/PWA target, which '
      + 'authenticates with the session cookie and never with a bearer token.',
    );
  }
  if (auth.mode === 'bearer' && typeof auth.getToken !== 'function') {
    throw new ApertureConfigError('Bearer auth requires a getToken function.');
  }

  const doFetch: FetchLike = options.fetch
    ?? ((input, init) => globalThis.fetch(input, init));
  const retryPolicy: RetryPolicy = { ...DEFAULT_RETRY_POLICY, ...options.retry };
  if (retryPolicy.maxAttempts < 1) {
    throw new ApertureConfigError('retry.maxAttempts must be at least 1.');
  }
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? defaultSleep;

  let skewReported = false;
  function noteSkew(headers: Headers): ContractSkew {
    const raw = headers.get(CONTRACT_VERSION_HEADER);
    const skew = classifyContractSkew(raw);
    if (skew !== 'match' && !skewReported) {
      skewReported = true;
      options.onContractSkew?.(skew, raw);
    }
    return skew;
  }

  async function authHeaders(): Promise<Record<string, string>> {
    if (auth.mode === 'cookie') return {};
    const token = await auth.getToken();
    if (typeof token !== 'string' || token === '') throw new ApertureTokenUnavailableError();
    return { Authorization: `Bearer ${token}` };
  }

  /** Full jitter over an exponential base, capped. */
  function backoffMs(attempt: number): number {
    const exponential = Math.min(retryPolicy.maxDelayMs, retryPolicy.baseDelayMs * 2 ** (attempt - 1));
    return Math.floor(random() * exponential);
  }

  function urlFor(path: string, query: RequestOptions['query']): string {
    if (!path.startsWith('/')) {
      throw new ApertureConfigError(
        `Operation path must be relative and "/"-rooted; received ${JSON.stringify(path)}.`,
      );
    }
    return `${baseUrl}${API_PATH_PREFIX}${path}${buildQuery(query)}`;
  }

  async function send(url: string, init: RequestInit, signal: AbortSignal | undefined): Promise<Response> {
    try {
      return await doFetch(url, init);
    } catch (cause) {
      if (isAbort(cause, signal)) throw new ApertureAbortError('The request was aborted.', { cause });
      throw new ApertureNetworkError('The request did not reach the server.', 'request', { cause });
    }
  }

  async function toError(response: Response, attempts: number): Promise<Error> {
    const contentType = response.headers.get('Content-Type');
    if (mediaTypeOf(contentType) !== PROBLEM_MEDIA_TYPE) {
      return new ApertureMalformedResponseError(response.status, contentType, 'media-type', attempts);
    }
    let decoded: unknown;
    try {
      decoded = await response.json();
    } catch {
      return new ApertureMalformedResponseError(response.status, contentType, 'unparseable', attempts);
    }
    const problem = parseProblem(decoded);
    if (problem === null) {
      return new ApertureMalformedResponseError(response.status, contentType, 'schema', attempts);
    }
    return problemToError(problem, attempts);
  }

  async function request<T>(requestOptions: RequestOptions): Promise<ApertureResponse<T>> {
    const {
      method, path, query, body, headers, idempotencyKey, ifMatch, signal, accept,
    } = requestOptions;

    const url = urlFor(path, query);
    const mayRetry = requestOptions.retry ?? IDEMPOTENT_METHODS.has(method);
    const maxAttempts = mayRetry ? retryPolicy.maxAttempts : 1;

    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    for (;;) {
      attempt += 1;

      const requestHeaders: Record<string, string> = {
        Accept: accept ?? 'application/json',
        ...(await authHeaders()),
        ...headers,
      };
      if (idempotencyKey !== undefined) requestHeaders['Idempotency-Key'] = idempotencyKey;
      if (ifMatch !== undefined) requestHeaders['If-Match'] = ifMatch;

      const init: RequestInit = {
        method,
        headers: requestHeaders,
        // Cookies travel only in cookie mode; a bearer request never also carries one.
        credentials: auth.mode === 'cookie' ? 'same-origin' : 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      };
      if (signal !== undefined) init.signal = signal;
      if (body !== undefined) {
        requestHeaders['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }

      let response: Response;
      try {
        response = await send(url, init, signal);
      } catch (error) {
        if (error instanceof ApertureNetworkError && attempt < maxAttempts) {
          await sleep(backoffMs(attempt), signal);
          continue;
        }
        throw error;
      }

      const contractSkew = noteSkew(response.headers);

      if (response.status >= 200 && response.status < 300) {
        if (requestOptions.responseBody === 'raw') {
          return {
            data: response as unknown as T,
            status: response.status,
            headers: response.headers,
            etag: response.headers.get('ETag'),
            contractSkew,
            attempts: attempt,
          };
        }
        let data: unknown = undefined;
        if (response.status !== 204) {
          const text = await response.text();
          if (text !== '') {
            try {
              data = JSON.parse(text);
            } catch (cause) {
              throw new ApertureDecodeError(response.status, { cause });
            }
          }
        }
        return {
          data: data as T,
          status: response.status,
          headers: response.headers,
          etag: response.headers.get('ETag'),
          contractSkew,
          attempts: attempt,
        };
      }

      if (attempt < maxAttempts) {
        const retryAfter = parseRetryAfterSeconds(response.headers.get('Retry-After'));

        if (retryAfter !== null && RETRYABLE_WITH_SERVER_INTERVAL.has(response.status)) {
          const waitMs = retryAfter * 1_000;
          // Never wait less than the server asked. If it asked for longer than the cap, give up
          // and let the caller decide, rather than retrying early.
          if (waitMs <= retryPolicy.maxDelayMs) {
            await sleep(waitMs, signal);
            continue;
          }
        } else if (RETRYABLE_WITH_OWN_BACKOFF.has(response.status)) {
          // A usable Retry-After is honoured here too when the server sends one; otherwise the
          // transport chooses a jittered backoff, which for these statuses it is entitled to do.
          const waitMs = retryAfter === null ? backoffMs(attempt) : retryAfter * 1_000;
          if (waitMs <= retryPolicy.maxDelayMs) {
            await sleep(waitMs, signal);
            continue;
          }
        }
      }

      throw await toError(response, attempt);
    }
  }

  async function openStream(streamOptions: {
    readonly lastEventId?: string | undefined;
    readonly query?: Readonly<Record<string, string | number | boolean | undefined>> | undefined;
    readonly signal?: AbortSignal | undefined;
  } = {}): Promise<StreamResponse> {
    const url = urlFor('/stream', streamOptions.query);
    const requestHeaders: Record<string, string> = {
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
      ...(await authHeaders()),
    };
    if (streamOptions.lastEventId !== undefined) {
      requestHeaders['Last-Event-ID'] = streamOptions.lastEventId;
    }

    const init: RequestInit = {
      method: 'GET',
      headers: requestHeaders,
      credentials: auth.mode === 'cookie' ? 'same-origin' : 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    };
    if (streamOptions.signal !== undefined) init.signal = streamOptions.signal;

    // Deliberately one attempt: reconnection carries stream state (`Last-Event-ID`, the replay
    // window, the resync rule) that belongs to the stream client, not to a blind transport retry.
    const response = await send(url, init, streamOptions.signal);
    const contractSkew = noteSkew(response.headers);

    if (response.status < 200 || response.status >= 300) throw await toError(response, 1);

    return {
      body: response.body,
      status: response.status,
      headers: response.headers,
      contractSkew,
    };
  }

  return { baseUrl, authMode: auth.mode, request, openStream };
}

export { API_PATH_PREFIX, CONTRACT_VERSION };
