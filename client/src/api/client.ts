// APTR-07 — typed operation wrappers over the generated types.
//
// One generic entry point, `call`, keyed by the contract's `operationId`. Given the id, the
// compiler already knows the method, the path template, the path and query parameters, the
// request body, and the success body — all of them from `generated/`, none of them written by
// hand here. That is the point: a hand-maintained wrapper per operation is a second copy of the
// contract that drifts silently, and there is no gate that could catch it.
//
// This file constructs no request. It resolves an operation to a method and a path and hands
// both to the transport, which is the only place a request is made.

import type { operations } from './generated/schema.ts';
import { OPERATIONS, type OperationId } from './generated/operations.ts';
import { ApertureConfigError } from './errors.ts';
import type { ApertureResponse, Transport } from './transport.ts';

type Op = OperationId & keyof operations;

type ParametersOf<K extends Op> = operations[K] extends { parameters: infer P } ? P : never;

/** The path parameters the contract declares for this operation, if any. */
export type PathParamsOf<K extends Op> =
  ParametersOf<K> extends { path?: infer P } ? (P extends undefined ? never : P) : never;

/** The query parameters the contract declares for this operation, if any. */
export type QueryParamsOf<K extends Op> =
  ParametersOf<K> extends { query?: infer Q } ? (Q extends undefined ? never : Q) : never;

/** The JSON request body the contract declares for this operation, if any. */
export type RequestBodyOf<K extends Op> =
  operations[K] extends { requestBody?: { content: { 'application/json': infer B } } } ? B : never;

type SuccessStatus = 200 | 201 | 202 | 204;
type ResponsesOf<K extends Op> = operations[K] extends { responses: infer R } ? R : never;
type SuccessResponseOf<K extends Op> =
  ResponsesOf<K>[Extract<keyof ResponsesOf<K>, SuccessStatus>];

/**
 * The success body for this operation. `void` where the success response carries no JSON —
 * a 204, or a non-JSON media type such as an attachment's bytes.
 */
export type ResultOf<K extends Op> =
  SuccessResponseOf<K> extends { content: { 'application/json': infer B } } ? B : void;

export interface CallOptions<K extends Op> {
  /** Path template values. Every `{placeholder}` in the operation's path must be supplied. */
  readonly path?: PathParamsOf<K> | undefined;
  readonly query?: QueryParamsOf<K> | undefined;
  readonly body?: RequestBodyOf<K> | undefined;
  /** Required by the contract on message create and attachment create. */
  readonly idempotencyKey?: string | undefined;
  /** Required by the contract on `PATCH /threads/{threadId}` and `PUT /settings`. */
  readonly ifMatch?: string | undefined;
  readonly signal?: AbortSignal | undefined;
  /** Override the transport's default retry decision for this call. */
  readonly retry?: boolean | undefined;
  /** Expected response media type, for the routes that do not return JSON. */
  readonly accept?: string | undefined;
  /**
   * `'raw'` returns the untouched `Response` as `data`, for a route whose success body is bytes
   * rather than JSON — attachment content is the only one in v1. Its generated result type is
   * `void`, because the contract declares a binary body, so the caller reads the `Response`.
   */
  readonly responseBody?: 'json' | 'raw' | undefined;
}

const PLACEHOLDER = /\{([^{}]+)\}/g;

/**
 * Substitute path template placeholders.
 *
 * Every value is `encodeURIComponent`-escaped, so an identifier containing `/`, `?`, `#`, or a
 * percent sign cannot alter which route is addressed. A missing placeholder value throws rather
 * than producing a URL containing a literal `{threadId}` and a puzzling 404.
 */
export function interpolatePath(template: string, params: Readonly<Record<string, unknown>>): string {
  return template.replace(PLACEHOLDER, (_match, name: string) => {
    const value = params[name];
    if (value === undefined || value === null || value === '') {
      throw new ApertureConfigError(
        `Path parameter "${name}" is required by ${template} but was not supplied.`,
      );
    }
    return encodeURIComponent(String(value));
  });
}

/**
 * Invoke a contract operation through a transport.
 *
 * @example
 *   const { data } = await call(transport, 'getVersion');
 *   const threads = await call(transport, 'listThreads', { query: { limit: 20 } });
 */
export async function call<K extends Op>(
  transport: Transport,
  operationId: K,
  options: CallOptions<K> = {},
): Promise<ApertureResponse<ResultOf<K>>> {
  const descriptor = OPERATIONS[operationId];
  const path = interpolatePath(
    descriptor.path,
    (options.path ?? {}) as Readonly<Record<string, unknown>>,
  );

  return transport.request<ResultOf<K>>({
    method: descriptor.method,
    path,
    query: options.query as Readonly<Record<string, string | number | boolean | undefined>> | undefined,
    body: options.body,
    idempotencyKey: options.idempotencyKey,
    ifMatch: options.ifMatch,
    signal: options.signal,
    retry: options.retry,
    accept: options.accept,
    responseBody: options.responseBody,
  });
}

/**
 * Bind a transport once and call operations against it.
 *
 * Purely a convenience over {@link call} — it holds no state and constructs no request.
 */
export function createApiClient(transport: Transport) {
  return {
    transport,
    call: <K extends Op>(operationId: K, options: CallOptions<K> = {}) =>
      call(transport, operationId, options),
    openStream: transport.openStream.bind(transport),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
