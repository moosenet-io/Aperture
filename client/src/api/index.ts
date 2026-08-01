// APTR-07 — the SDK's public surface.
//
// Consumers import from here. Nothing in this module holds a transport, a base URL, or a
// credential: the transport is constructed by the target shell, which is the only layer that
// knows whether it is a browser origin or a native client with a configured endpoint.

export {
  createTransport,
  normalizeBaseUrl,
  classifyContractSkew,
  parseRetryAfterSeconds,
  DEFAULT_RETRY_POLICY,
  API_PATH_PREFIX,
  CONTRACT_VERSION,
} from './transport.ts';
export type {
  ApertureAuth,
  ApertureResponse,
  ContractSkew,
  FetchLike,
  RequestOptions,
  RetryPolicy,
  StreamResponse,
  Transport,
  TransportOptions,
} from './transport.ts';

export { call, createApiClient, interpolatePath } from './client.ts';
export type {
  ApiClient,
  CallOptions,
  PathParamsOf,
  QueryParamsOf,
  RequestBodyOf,
  ResultOf,
} from './client.ts';

export {
  ApertureAbortError,
  ApertureAuthError,
  ApertureConfigError,
  ApertureDecodeError,
  ApertureError,
  ApertureMalformedResponseError,
  ApertureNetworkError,
  ApertureProblemError,
  ApertureTokenUnavailableError,
  ERROR_URN,
  ERROR_URN_PATTERN,
  isAuthFailure,
  parseProblem,
  problemToError,
} from './errors.ts';
export type { Problem } from './errors.ts';

export { OPERATIONS } from './generated/operations.ts';
export type { HttpMethod, OperationDescriptor, OperationId } from './generated/operations.ts';
export {
  CONTRACT_SOURCE_SHA256,
  CONTRACT_VERSION_HEADER,
  CONTRACT_VERSION_MAJOR,
  CONTRACT_VERSION_MINOR,
} from './generated/meta.ts';
export type { components, operations, paths } from './generated/schema.ts';
