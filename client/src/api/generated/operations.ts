// GENERATED FILE — DO NOT EDIT.
//
// Source:    contracts/aperture-api-v1.yaml
// Digest:    sha256:bea4be20c3e4fb5c20a81fcdb941d7c3c5fc085cd4e6c843bc847ee3d5e7f8bd
// Generator: openapi-typescript@7.13.0
// Regenerate with: npm --prefix client run gen:api
//
// `npm --prefix client run assert-api-current` regenerates into memory and compares. A
// mismatch fails the build: contract drift is a build failure, not a runtime surprise.

/** An HTTP method as it appears in the contract. */
export type HttpMethod =
  | "GET"
  | "PUT"
  | "POST"
  | "DELETE"
  | "OPTIONS"
  | "HEAD"
  | "PATCH"
  | "TRACE";

/** One operation's wire coordinates. `path` is relative and `/`-rooted, never absolute. */
export interface OperationDescriptor {
  readonly method: HttpMethod;
  /**
   * The contract path template, e.g. `/threads/{threadId}`. It carries no origin: the base
   * URL is injected into the transport at construction and prefixed at request time.
   */
  readonly path: string;
}

/**
 * Every operation in the contract, keyed by `operationId`.
 *
 * The transport reads an operation's method from here rather than from a hand-written list, so
 * a contract change that turns a GET into a POST changes the transport's retry decision in the
 * same regeneration — it cannot be forgotten.
 */
export const OPERATIONS = {
  "adminListAuditEvents": { method: "GET", path: "/admin/audit" },
  "adminListUsers": { method: "GET", path: "/admin/users" },
  "createAttachment": { method: "POST", path: "/attachments" },
  "createMessage": { method: "POST", path: "/threads/{threadId}/messages" },
  "createThread": { method: "POST", path: "/threads" },
  "deleteAttachment": { method: "DELETE", path: "/attachments/{attachmentId}" },
  "deleteThread": { method: "DELETE", path: "/threads/{threadId}" },
  "getAttachment": { method: "GET", path: "/attachments/{attachmentId}" },
  "getAttachmentContent": { method: "GET", path: "/attachments/{attachmentId}/content" },
  "getHealth": { method: "GET", path: "/health" },
  "getModule": { method: "GET", path: "/modules/{moduleId}" },
  "getReady": { method: "GET", path: "/ready" },
  "getSession": { method: "GET", path: "/auth/session" },
  "getSettings": { method: "GET", path: "/settings" },
  "getThread": { method: "GET", path: "/threads/{threadId}" },
  "getTurn": { method: "GET", path: "/threads/{threadId}/turns/{turnId}" },
  "getVersion": { method: "GET", path: "/version" },
  "listDevices": { method: "GET", path: "/auth/devices" },
  "listMessages": { method: "GET", path: "/threads/{threadId}/messages" },
  "listModules": { method: "GET", path: "/modules" },
  "listThreads": { method: "GET", path: "/threads" },
  "listWorkspaces": { method: "GET", path: "/workspaces" },
  "login": { method: "POST", path: "/auth/login" },
  "logout": { method: "POST", path: "/auth/logout" },
  "openStream": { method: "GET", path: "/stream" },
  "publishContextEvent": { method: "POST", path: "/events" },
  "refreshSession": { method: "POST", path: "/auth/refresh" },
  "replaceSettings": { method: "PUT", path: "/settings" },
  "revokeDevice": { method: "DELETE", path: "/auth/devices/{deviceId}" },
  "stopTurn": { method: "POST", path: "/threads/{threadId}/turns/{turnId}/stop" },
  "updateThread": { method: "PATCH", path: "/threads/{threadId}" },
} as const satisfies Record<string, OperationDescriptor>;

/** The `operationId` of every operation in the contract. */
export type OperationId = keyof typeof OPERATIONS;
