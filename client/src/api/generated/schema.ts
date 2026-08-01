// GENERATED FILE — DO NOT EDIT.
//
// Source:    contracts/aperture-api-v1.yaml
// Digest:    sha256:bea4be20c3e4fb5c20a81fcdb941d7c3c5fc085cd4e6c843bc847ee3d5e7f8bd
// Generator: openapi-typescript@7.13.0
// Regenerate with: npm --prefix client run gen:api
//
// `npm --prefix client run assert-api-current` regenerates into memory and compares. A
// mismatch fails the build: contract drift is a build failure, not a runtime surprise.

export interface paths {
    "/admin/audit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read the audit log.
         * @description Cursor-paginated audit records. Arguments recorded in an audit entry are sanitized before
         *     storage: keys and tokens are redacted and oversized values are truncated with an explicit
         *     marker. An audit record never contains an infrastructure identifier.
         */
        get: operations["adminListAuditEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List users.
         * @description Administrative. Authorization-gated and audited. A non-administrator receives `not-found`, never `forbidden`, so the route's existence is not an oracle.
         */
        get: operations["adminListUsers"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/attachments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Upload an attachment.
         * @description Uploads an attachment into the workspace. Attachments are **workspace-owned** objects
         *     whose lifetime is governed by a reference count, never by any single referring message or
         *     thread.
         *
         *     The client-supplied `Content-Type` and filename are recorded as **untrusted metadata**.
         *     The stored content type is determined by server-side byte sniffing on ingest and is the
         *     only thing that ever selects a response type on the serve route.
         *
         *     Size and count limits are declared here, not discovered at runtime: a request exceeding
         *     them is rejected with `payload-too-large` before the body is consumed.
         */
        post: operations["createAttachment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/attachments/{attachmentId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description An unguessable identifier. Possession of an id is not a capability; every access is separately authorized. */
                attachmentId: components["parameters"]["AttachmentId"];
            };
            cookie?: never;
        };
        /** Fetch attachment metadata and processing status. */
        get: operations["getAttachment"];
        put?: never;
        post?: never;
        /**
         * Drop this principal's reference to an attachment.
         * @description Decrements the reference count. Bytes are reclaimed only when the count reaches zero.
         */
        delete: operations["deleteAttachment"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/attachments/{attachmentId}/content": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description An unguessable identifier. Possession of an id is not a capability; every access is separately authorized. */
                attachmentId: components["parameters"]["AttachmentId"];
            };
            cookie?: never;
        };
        /**
         * Serve attachment bytes under isolation.
         * @description Serves the stored bytes. This is where stored cross-site scripting lives, so the rules
         *     are fail-closed and stated in the contract rather than left to an implementation:
         *
         *     - The response type is chosen from the **sniffed** content type only. The client-declared
         *       `Content-Type` and the filename extension never influence it.
         *     - Only allowlisted types are ever served with their real type. Anything unrecognized is
         *       served as a generic binary download. Denylists are forbidden.
         *     - **SVG and HTML are never served inline, under any condition.** There is no trusted
         *       uploader exception and no query parameter that re-enables inline rendering.
         *     - Every response carries `Content-Disposition: attachment` (except allowlisted
         *       inline-safe raster types), `Content-Security-Policy: sandbox; default-src 'none'`,
         *       `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and
         *       `Cache-Control: private, no-store`.
         *     - Filenames in `Content-Disposition` are sanitized and encoded: no CRLF, no directory
         *       separators, no unencoded non-ASCII.
         *     - An attachment id is not a capability. Ids are unguessable, access is authorized per
         *       attachment, and a cross-principal fetch returns `not-found`, never `forbidden`.
         *
         *     The full serving model is specified in `contracts/aperture-attachments-v1.md`.
         */
        get: operations["getAttachmentContent"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/devices": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List the principal's devices.
         * @description Cursor-paginated. A device record names a label, a platform family, and first/last seen timestamps — never an address, and never a network identifier.
         */
        get: operations["listDevices"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/devices/{deviceId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                deviceId: components["parameters"]["DeviceId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Revoke a device.
         * @description Invalidates every session bound to the device **immediately and server-side**. Revocation
         *     is the hook a client's offline purge fires on: a revoked device must clear its cached
         *     threads, outbox, drafts, and cached attachment content.
         *
         *     Revoking a device that does not exist, or that belongs to another principal, returns
         *     `not-found` — never `forbidden`. An error code must not become an existence oracle.
         */
        delete: operations["revokeDevice"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Establish a session.
         * @description Establishes a session for the calling target.
         *
         *     **Web and mobile PWA:** the response sets the session cookie — `__Host-` prefixed,
         *     `HttpOnly`, `Secure`, `SameSite=Strict`, path `/`, no `Domain` attribute. The session id
         *     is **rotated** on every successful login and on any privilege change; the previous id is
         *     invalidated server-side, not merely unset on the client.
         *
         *     **Desktop:** the response returns a bearer token in the body and sets **no cookie**. A
         *     cross-origin cookie cannot be `SameSite=Strict` and the flags are never loosened to make
         *     one work.
         *
         *     The target is declared by the client and is not negotiable per request: a bearer session
         *     is never accepted from a browser-origin request that also carries cookies.
         */
        post: operations["login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * End the current session.
         * @description Invalidates the current session **server-side**, not merely on the client, and clears the
         *     session cookie where one exists.
         *
         *     Ending a session obliges the client to purge every local copy of the user's data for that
         *     session: cached threads, the outbox, drafts, and any cached attachment content. A logged
         *     out or revoked device must not remain a readable copy of the user's conversations.
         */
        post: operations["logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Refresh the current session.
         * @description Extends the current session. On the web target this rotates the cookie; on the desktop
         *     target it mints a replacement bearer token and invalidates the previous one. A refresh
         *     never widens privilege and never converts a bearer session into a cookie session or the
         *     reverse.
         */
        post: operations["refreshSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Introspect the current session.
         * @description Describes the current session to its own holder: the principal, the device record it is
         *     bound to, and its expiry. It returns no token material, no signing key, and no
         *     infrastructure identifier.
         */
        get: operations["getSession"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Publish a context-bus event.
         * @description Publishes a client-observed context event — a selection, a focus change, a playback
         *     position — onto the shared context bus. Subscribers observe it as a `context` event on
         *     the stream, in the same per-connection sequence space as every other event type. There is
         *     no second stream and no second sequence counter.
         *
         *     A client-published event is always recorded with `origin: user` or `origin: system`
         *     according to what produced it. A client may never publish an event claiming
         *     `origin: assistant` or `origin: tool`; the server rejects such a request with
         *     `validation-failed`. Provenance is a server-side determination.
         *
         *     The topic taxonomy and payload schemas are specified in
         *     `contracts/aperture-context-bus-v1.md`.
         */
        post: operations["publishContextEvent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Liveness probe.
         * @description Reports only whether this process is alive. It deliberately reveals nothing else: no
         *     host, no build identifier, no upstream component version, no dependency status. The
         *     infrastructure-leak rule applies to health endpoints exactly as it applies everywhere else.
         */
        get: operations["getHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/modules": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List module capability descriptors.
         * @description Returns one descriptor per module. The shell's navigation derives entirely from these
         *     descriptors — no module is hardcoded into the client — and a module renders only when its
         *     capability is actually `available`. An unknown capability state fails **closed** to
         *     `unavailable`.
         *
         *     Capability is probed through the sanctioned backend door, never by the client and never
         *     by pinging a service address. A descriptor names capabilities and reasons; it never names
         *     a host, an address, or an upstream component version.
         */
        get: operations["listModules"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/modules/{moduleId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                moduleId: components["parameters"]["ModuleId"];
            };
            cookie?: never;
        };
        /** Fetch one module descriptor. */
        get: operations["getModule"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Readiness probe.
         * @description Reports whether this process is ready to serve requests. Where a dependency is not ready
         *     the response names the **capability** by its stable identifier and a human-readable
         *     reason. It never names a host, an address, or an upstream product version.
         */
        get: operations["getReady"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Fetch the principal's settings. */
        get: operations["getSettings"];
        /**
         * Replace settings under optimistic concurrency.
         * @description `If-Match` is required; see `PATCH /threads/{threadId}` for the same rule.
         */
        put: operations["replaceSettings"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stream": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Open the Server-Sent Events connection.
         * @description Opens **the** stream. A stream is **one connection** — not one thread and not one turn.
         *     `thread_id` and the message id demultiplex many threads and many turns inside a single
         *     connection, and `seq` is a single monotonic sequence per connection covering **all**
         *     event types.
         *
         *     Server-Sent Events are not naturally expressible in OpenAPI: only the media type and the
         *     parameters can be described here. The **normative** event taxonomy, ordering guarantees,
         *     provenance rules, replay bounds, and resume semantics live in
         *     `contracts/aperture-events-v1.md`, and the two documents are the same contract read from
         *     two directions. `#/components/schemas/StreamEvent` is the machine-readable form of that
         *     taxonomy and is what a conformance test validates event frames against.
         *
         *     **Resume.** A client reconnects with `Last-Event-ID` set to the composite
         *     `"{stream_id}:{seq}"` of the last event it fully processed. Within the bounded replay
         *     window the server replays **strictly after** that position — the acknowledged event is
         *     not re-sent. Beyond it — and equally for an unknown
         *     `stream_id` or a malformed value — the server issues a fresh `stream_id` and emits a
         *     `resync` naming the reason, and the client refetches over REST. Resume is never
         *     unbounded, and the only case that starts at live with no `resync` is a genuine first
         *     connection with no `Last-Event-ID` at all. The single normative statement of this
         *     behaviour is `contracts/aperture-events-v1.md` §5; this paragraph summarizes it and never
         *     extends it.
         *
         *     **Anti-buffering headers are mandatory on this route**, because a buffering reverse proxy
         *     turns a token stream into a wall of text delivered at the end:
         *     `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-store,
         *     no-transform`, `Connection: keep-alive`, and `X-Accel-Buffering: no`. A deployment that
         *     cannot honour `no-transform` end-to-end is misconfigured, and that is an operator
         *     problem, not a reason to relax the contract. The server additionally emits a `heartbeat`
         *     event on an interval named by `APERTURE_STREAM_HEARTBEAT_SECONDS` so that an idle
         *     connection is distinguishable from a dead one.
         */
        get: operations["openStream"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/threads": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List threads. */
        get: operations["listThreads"];
        put?: never;
        /** Create a thread. */
        post: operations["createThread"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/threads/{threadId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                threadId: components["parameters"]["ThreadId"];
            };
            cookie?: never;
        };
        /** Fetch a thread. */
        get: operations["getThread"];
        put?: never;
        post?: never;
        /**
         * Delete a thread.
         * @description Deletes the thread and its messages. Attachments are workspace-owned and reference
         *     counted: deleting a thread decrements the references its messages held and never deletes
         *     attachment bytes directly.
         */
        delete: operations["deleteThread"];
        options?: never;
        head?: never;
        /**
         * Update a thread under optimistic concurrency.
         * @description `If-Match` is **required**. A request without it is rejected with `validation-failed`; a
         *     request whose `If-Match` does not match the current representation is rejected with
         *     `precondition-failed`. Last-write-wins is not available on this route.
         */
        patch: operations["updateThread"];
        trace?: never;
    };
    "/threads/{threadId}/messages": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                threadId: components["parameters"]["ThreadId"];
            };
            cookie?: never;
        };
        /**
         * List messages in a thread.
         * @description Cursor-paginated. Every message object carries the mandatory `origin` discriminator. A
         *     client renders attribution from `origin` alone; it never infers a speaker from the
         *     content of a message.
         */
        get: operations["listMessages"];
        put?: never;
        /**
         * Send a message, starting a turn.
         * @description Creates a user message and starts a turn. The generated output arrives on the stream
         *     (see `aperture-events-v1.md`), not in this response body: this route returns the created
         *     message and the ids the client uses to demultiplex the turn's events.
         *
         *     `Idempotency-Key` is **required**. The client generates one opaque, high-entropy key per
         *     **logical** send — not per HTTP attempt — and replays the same key on transport retry. A
         *     repeat within the retention window replays the original recorded response; a repeat with
         *     the same key and a different body is a `conflict`, never a second message. Detailed
         *     dedupe semantics are specified in `contracts/aperture-idempotency-v1.md`.
         */
        post: operations["createMessage"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/threads/{threadId}/turns/{turnId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                threadId: components["parameters"]["ThreadId"];
                turnId: components["parameters"]["TurnId"];
            };
            cookie?: never;
        };
        /**
         * Fetch one turn's authoritative state.
         * @description The REST refetch a client performs after a `resync` event. It returns the turn's current
         *     state and its messages in their authoritative form, so a client whose replay position
         *     aged out can reconcile without reloading the whole thread.
         */
        get: operations["getTurn"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/threads/{threadId}/turns/{turnId}/stop": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                threadId: components["parameters"]["ThreadId"];
                turnId: components["parameters"]["TurnId"];
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Explicit user stop — cancel a turn immediately and unconditionally.
         * @description An explicit user "stop generation". It cancels the turn **immediately and
         *     unconditionally, regardless of subscriber refcount**.
         *
         *     This is a different action from a transport drop, and the two must never be conflated. A
         *     client disconnecting does **not** cancel a turn: turns are refcounted by their
         *     subscribers and are cancelled only when the refcount reaches zero and a grace window
         *     elapses, so a second device watching the same turn keeps it alive. Only this route
         *     cancels on the user's behalf.
         *
         *     The resulting stream event is a `message.end` whose terminal reason distinguishes an
         *     explicit user stop from every other ending. See `aperture-events-v1.md`.
         */
        post: operations["stopTurn"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/version": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The contract version, and nothing else.
         * @description Returns the version of **this contract** that the server implements, in `major.minor`
         *     form. It MUST NOT return a build hash, a commit id, a host name, a container identifier,
         *     an operating-system string, or the version of any upstream component. Those are
         *     infrastructure leaks, and a conformance test asserts their absence.
         *
         *     Clients compare this value — and the `X-Aperture-Contract-Version` header, which carries
         *     the same value on every response — against the contract version they were generated
         *     against. Skew classification and client behaviour are specified in `contracts/README.md`.
         */
        get: operations["getVersion"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/workspaces": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List the principal's workspaces. */
        get: operations["listWorkspaces"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Attachment: {
            byte_size: number;
            created_at: components["schemas"]["Timestamp"];
            /** @description What the client claimed. Recorded as untrusted metadata and never acted on. */
            declared_content_type?: string;
            /** @description Sanitized. Never used to select a response type. */
            filename?: string;
            id: components["schemas"]["Id"];
            /**
             * @description How this attachment will be served. `attachment` for everything except allowlisted inline-safe raster types. Always `attachment` for SVG and HTML.
             * @enum {string}
             */
            serve_disposition?: "attachment" | "inline";
            /** @description The server-determined content type. The **only** thing that selects a response type on the serve route. */
            sniffed_content_type?: string;
            /** @enum {string} */
            status: "pending" | "ready" | "failed";
            workspace_id: components["schemas"]["Id"];
        };
        AuditRecord: {
            action: string;
            actor_id?: components["schemas"]["Id"];
            actor_origin: components["schemas"]["Origin"];
            /** @description Sanitized argument summary — keys and tokens redacted, oversized values truncated with an explicit marker. Never the raw arguments. */
            arguments_digest?: string;
            at: components["schemas"]["Timestamp"];
            correlation_id?: components["schemas"]["Id"];
            id: components["schemas"]["Id"];
            subject_id?: components["schemas"]["Id"];
        };
        /**
         * @description A capability's state. An unrecognized value from a newer server is treated as
         *     `unavailable` — capability parsing fails **closed**, never open.
         * @enum {string}
         */
        CapabilityState: "available" | "degraded" | "unavailable";
        CapabilityStatus: {
            /** @description The capability's stable identifier. Never a host, an address, or an upstream product name. */
            id: string;
            /** @description Human-readable and free of infrastructure identifiers. */
            reason?: string;
            state: components["schemas"]["CapabilityState"];
        };
        ContextEvent: components["schemas"]["EventEnvelope"] & {
            /** @enum {string} */
            origin?: "user" | "system";
            payload?: {
                [key: string]: unknown;
            };
            topic: string;
            /** @constant */
            type: "context";
        } & {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "context";
        };
        ContextPublish: {
            /** @description Topic-specific. Bounded by `APERTURE_CONTEXT_MAX_PAYLOAD_BYTES` and `APERTURE_MAX_JSON_DEPTH`. */
            payload: {
                [key: string]: unknown;
            };
            thread_id?: components["schemas"]["Id"];
            /** @description A context-bus topic from the taxonomy in `contracts/aperture-context-bus-v1.md`. An unknown topic is `validation-failed`. */
            topic: string;
        };
        Device: {
            created_at: components["schemas"]["Timestamp"];
            /** @description True for the device making the request. */
            current?: boolean;
            id: components["schemas"]["Id"];
            label: string;
            last_seen_at?: components["schemas"]["Timestamp"];
            /** @description A coarse platform family for display only. Never a device fingerprint and never a network identifier. */
            platform_family?: string;
            /** @enum {string} */
            target: "web" | "pwa" | "desktop";
        };
        ErrorEvent: components["schemas"]["EventEnvelope"] & {
            error: components["schemas"]["Problem"];
            /** @constant */
            origin?: "system";
            /** @constant */
            type: "error";
        } & {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "error";
        };
        /**
         * @description Fields common to **every** stream event, without exception. There is no exempt event
         *     type: `heartbeat` carries an `origin` exactly as `token` does, because an exemption is how
         *     a mandatory invariant erodes.
         */
        EventEnvelope: {
            message_id?: components["schemas"]["Id"];
            origin: components["schemas"]["Origin"];
            /**
             * @description The monotonic sequence number. **One sequence per connection, covering all event
             *     types** — not one per thread, not one per turn, not one per type. It is strictly
             *     increasing with no gaps within a connection, and it is the only thing used to decide
             *     ordering, replay position, and eviction — timestamps are never used for that.
             *
             *     `seq` is the **numeric half** of the SSE `id:` field, which carries the composite
             *     `"{stream_id}:{seq}"`. It is not the whole `id:` on its own.
             */
            seq: number;
            /**
             * @description The identifier of **this connection** — because a stream is one connection, this is
             *     the connection id and nothing else. It is not a thread id, not a turn id, and not a
             *     message id. It scopes the `seq` domain and the replay buffer, and it is what lets the
             *     server recognize a resume request for a connection it no longer has buffered.
             *
             *     Values are unguessable random ids, never sequential.
             */
            stream_id: components["schemas"]["Id"];
            thread_id?: components["schemas"]["Id"];
            ts: components["schemas"]["Timestamp"];
            turn_id?: components["schemas"]["Id"];
            type: components["schemas"]["EventType"];
        };
        /**
         * @description The complete v1 stream event taxonomy. This enum and the taxonomy table in
         *     `contracts/aperture-events-v1.md` are the same list, and a conformance test asserts they
         *     match exactly — an addition on either side without the other fails the build.
         * @enum {string}
         */
        EventType: "token" | "message.start" | "message.end" | "tool.call" | "tool.result" | "thinking" | "error" | "context" | "presence" | "resync" | "heartbeat";
        HeartbeatEvent: components["schemas"]["EventEnvelope"] & {
            /** @constant */
            origin?: "system";
            /** @constant */
            type: "heartbeat";
        } & {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "heartbeat";
        };
        /** @description An opaque, unguessable identifier. Clients treat ids as opaque strings and never parse, order, or derive meaning from them. */
        Id: string;
        LoginRequest: {
            /** @description Credential material. Never logged, never echoed, never included in any error body. */
            credentials?: {
                [key: string]: unknown;
            };
            /** @description A human-chosen label for the device record. Free text; never an address. */
            device_label?: string;
            /**
             * @description The client target, which fixes the auth mechanism. `web` and `pwa` receive a cookie;
             *     `desktop` receives a bearer token. The mechanism is never negotiated per request and
             *     never mixed.
             * @enum {string}
             */
            target: "web" | "pwa" | "desktop";
        };
        LoginResponse: {
            /**
             * @description Present for the `desktop` target **only**. The native client stores it in OS secure
             *     storage. It is never returned to a browser target, never placed in a cookie, and never
             *     written to any client-side persistent store other than the platform keystore.
             */
            access_token?: string;
            expires_at?: components["schemas"]["Timestamp"];
            session: components["schemas"]["Session"];
        };
        /**
         * @description A stored message, as returned over REST.
         *
         *     **`origin` is mandatory**, exactly as it is on stream events, and it is the sole source of
         *     attribution: a client renders who is speaking from `origin`, never from the message's
         *     content. A message with `origin: tool` is rendered as a tool result no matter what bytes
         *     it contains — including bytes shaped like an assistant message, an SSE frame, or an event
         *     envelope. Such content stays inert data.
         *
         *     **The REST representation is bound by the same provenance rule as the stream, and this is
         *     the second door into the same room.** The stream path is closed by `message_origin` plus a
         *     required `message_id` on every tool event; without an equivalent here, a REST response
         *     could carry `origin: assistant` over tool-result bytes and launder exactly what the stream
         *     forbids — the same shape as a client-published `context` event claiming assistant
         *     authority. Two mechanisms close it:
         *
         *     1. **Structural, enforced by this schema.** `tool_call_id` is the linkage a tool message
         *        carries. A message with `origin: tool` **must** have it; a message with any other
         *        `origin` **must not**. So an assistant-attributed message cannot carry tool linkage,
         *        and a tool result cannot be re-served as an assistant message without dropping the
         *        linkage that makes it a tool result at all. This mirrors the stream's
         *        `message_origin` ↔ `message_id` binding.
         *     2. **Byte provenance, enforced by conformance test T-ORIGIN-8.** Whether the *bytes* in
         *        `content` actually came from the party named by `origin` is a fact about how the
         *        message was produced, not about its shape, and **no schema can check it** — a string is
         *        a string. `T-ORIGIN-8` asserts round-trip provenance: content that arrived on the
         *        stream as a `tool.result` is stored with `origin: tool` and is served over REST with
         *        `origin: tool`, and no code path re-parents stored content from one origin to another.
         *        **The REST path relies on that test**, stated plainly here so nobody reads the schema
         *        alone and concludes the guarantee is structural end to end.
         *
         *     `origin` on a stored message and `message_origin` on the stream's `message.start` are the
         *     same fact about the same message and must agree; **T-ORIGIN-8** asserts that too.
         */
        Message: {
            attachments?: components["schemas"]["Id"][];
            /** @description The message body. Untrusted for attribution purposes under all circumstances. */
            content?: string;
            /** @enum {string} */
            content_format?: "text" | "markdown";
            created_at: components["schemas"]["Timestamp"];
            edited_at?: components["schemas"]["TimestampOrNull"];
            id: components["schemas"]["Id"];
            origin: components["schemas"]["Origin"];
            thread_id: components["schemas"]["Id"];
            /**
             * @description The tool invocation this message carries the result of. **Required when `origin` is
             *     `tool`, forbidden otherwise** — see the conditional below. It is the REST analogue of
             *     the stream's required `message_id` on `tool.result`.
             */
            tool_call_id?: components["schemas"]["Id"];
            turn_id?: components["schemas"]["Id"];
        };
        MessageCreate: {
            attachments?: components["schemas"]["Id"][];
            /** @description The user's text. The server records it with `origin: user`; the client cannot assert an origin. */
            content: string;
            /** @enum {string} */
            content_format?: "text" | "markdown";
        };
        /** @description The created user message plus the ids needed to demultiplex the turn's events on the single stream connection. */
        MessageCreated: {
            assistant_message_id?: components["schemas"]["Id"];
            message: components["schemas"]["Message"];
            turn_id: components["schemas"]["Id"];
        };
        MessageEndEvent: components["schemas"]["EventEnvelope"] & {
            /** @description Must equal the `message_origin` declared at `message.start`. Never a re-attribution. */
            message_origin: components["schemas"]["Origin"];
            /** @constant */
            origin?: "system";
            /**
             * @description `stopped_by_user` is an explicit user stop. `abandoned` is a refcount-zero expiry
             *     after the grace window. A transport drop alone is never a reason, because a drop
             *     does not cancel a turn.
             * @enum {string}
             */
            reason: "completed" | "stopped_by_user" | "abandoned" | "upstream_error" | "upstream_timeout";
            /** @constant */
            type: "message.end";
        } & {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "message.end";
        };
        MessageStartEvent: components["schemas"]["EventEnvelope"] & {
            /**
             * @description The provenance of the message being opened. Immutable for the life of the
             *     message. A message opened `assistant` can never later carry tool content, and a
             *     message opened `tool` can never later carry assistant tokens — see
             *     **T-ORIGIN-5**.
             */
            message_origin: components["schemas"]["Origin"];
            /** @constant */
            origin?: "system";
            /**
             * @description A display hint only. It never overrides `message_origin`. Where the two disagree,
             *     `message_origin` wins and the hint is ignored — it is a nicety, not an authority.
             */
            role_hint?: string;
            /** @constant */
            type: "message.start";
        } & {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "message.start";
        };
        /**
         * @description One module's capability descriptor. The shell's navigation derives from these and nothing
         *     else. `state: available` renders the module; `degraded` renders it with a banner;
         *     `unavailable` renders an inert tile carrying `reason` — never a broken screen and never a
         *     blank route.
         */
        ModuleDescriptor: {
            consumes_topics?: string[];
            display_name: string;
            /** @description A design-system token name, never an asset URL. */
            icon_token?: string;
            id: string;
            publishes_topics?: string[];
            /** @description Required in practice whenever `state` is not `available`. Human-readable and free of infrastructure identifiers. */
            reason?: string;
            routes?: string[];
            state: components["schemas"]["CapabilityState"];
        };
        /**
         * @description **The provenance discriminator. Mandatory on every stream event and every stored
         *     message.**
         *
         *     - `assistant` — produced by the assistant's own generation.
         *     - `tool` — produced by a tool invocation, including everything a tool returned.
         *     - `system` — produced by the platform: lifecycle, presence, errors, resync.
         *     - `user` — produced by a human principal.
         *
         *     **Clients derive visual voice, framing, labelling, styling, and screen-reader
         *     announcement from this field and the event variant ONLY — never from content.** No
         *     sniffing, no heuristics, no "the text begins with a name so it must be the speaker".
         *
         *     It describes *who produced this object*, not what the object talks about: a system event
         *     reporting a tool failure is `origin: system`, not `origin: tool`.
         *
         *     There is no default, no fallback, and no `other` escape hatch. An object whose `origin` is
         *     absent or outside this set is **rejected at deserialization, never coerced** — a defaulted
         *     `origin` would silently launder a tool payload into assistant attribution, which is
         *     exactly the prompt-injection path this field exists to close. A fifth value requires a
         *     contract amendment and an operator decision.
         * @enum {string}
         */
        Origin: "assistant" | "tool" | "system" | "user";
        /** @description Cursor pagination envelope. Total counts are deliberately not returned: they cost a second query and go stale immediately. */
        PageInfo: {
            has_more: boolean;
            /** @description Opaque. Pass back as `cursor`. `null` when there is no next page. */
            next_cursor?: string | null;
        };
        PresenceEvent: components["schemas"]["EventEnvelope"] & {
            detail?: string;
            /** @constant */
            origin?: "system";
            state: string;
            /** @constant */
            type: "presence";
        } & {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "presence";
        };
        /**
         * @description RFC-9457 problem details. **Every** error response in this API uses this schema and is
         *     served as `application/problem+json`. There is no route that reports a failure in any
         *     other shape.
         *
         *     **Redaction is mandatory.** A problem-details body must never contain an internal host,
         *     address, port, file path, token, stack frame, or verbatim upstream error string. The
         *     server maps the failure to a stable class and a safe message; the detail goes to the
         *     server log keyed by `correlation_id`, which the response echoes so an operator can join
         *     the two.
         *
         *     **This object is closed.** RFC-9457 permits arbitrary extension members; this contract
         *     does not. `additionalProperties: false` is deliberate and is part of the redaction
         *     guarantee: an open problem object is exactly how an upstream error string, a stack frame,
         *     or a host name reaches a client body, one well-intentioned `"debug"` key at a time. A new
         *     member is an additive contract change, reviewed like any other — not something an
         *     implementation adds at the point of failure. Enforced by conformance test **T-PROBLEM-1**.
         */
        Problem: {
            /**
             * @description Present where more than one capability is implicated — notably the `503` from
             *     `GET /ready`, which reports every unready capability. It exists as a member of this
             *     closed object precisely so that readiness can fail in problem-details form like
             *     everything else, rather than inventing a second error shape.
             */
            capabilities?: components["schemas"]["CapabilityStatus"][];
            /** @description Present on `capability-unavailable` — the capability's stable identifier, never a host or an address. */
            capability?: string;
            correlation_id?: components["schemas"]["Id"];
            /** @description A safe, class-level explanation. Never a raw upstream message. */
            detail?: string;
            /** @description Present on `validation-failed`. Field paths are escaped, never echoed raw. */
            errors?: {
                message: string;
                pointer: string;
            }[];
            /**
             * Format: uri-reference
             * @description A relative reference to the failing operation. Never an absolute URL.
             */
            instance?: string;
            /** @description Present on `rate-limited` and on retryable upstream classes. */
            retry_after_seconds?: number;
            status: number;
            /** @description A short, stable, human-readable summary of the error class. Safe to log. */
            title: string;
            /**
             * Format: uri
             * @description A stable URN of the form `urn:aperture:error:<class>`, where `<class>` is
             *     lower-kebab-case. The pattern is enforced by the schema, not merely described: an
             *     arbitrary URI here would let an implementation mint an ad-hoc error identity that no
             *     client switches on, which is how a stable taxonomy quietly stops being stable.
             *
             *     It is part of the contract: clients switch on it, so it is never reworded, re-cased,
             *     or repurposed. Full taxonomy in `contracts/aperture-errors-v1.md`.
             * @example urn:aperture:error:validation-failed
             * @example urn:aperture:error:auth-required
             * @example urn:aperture:error:auth-expired
             * @example urn:aperture:error:forbidden
             * @example urn:aperture:error:not-found
             * @example urn:aperture:error:conflict
             * @example urn:aperture:error:precondition-failed
             * @example urn:aperture:error:payload-too-large
             * @example urn:aperture:error:rate-limited
             * @example urn:aperture:error:capability-unavailable
             * @example urn:aperture:error:upstream-timeout
             * @example urn:aperture:error:upstream-error
             * @example urn:aperture:error:contract-version-unsupported
             * @example urn:aperture:error:internal
             */
            type: string;
        };
        /** @description The **success** shape for `GET /ready`. The not-ready case is an error and is reported as problem details like every other error in this API. */
        Readiness: {
            capabilities: components["schemas"]["CapabilityStatus"][];
            ready: boolean;
        };
        ResyncEvent: components["schemas"]["EventEnvelope"] & {
            affected_message_ids?: components["schemas"]["Id"][];
            affected_thread_ids?: components["schemas"]["Id"][];
            /**
             * @description The undelivered range, in the sequence domain of `stream_id`. Present only when a
             *     trustworthy prior position exists — that is, for `window_aged_out` and
             *     `gap_detected`. Absent for `unknown_stream`, `unparseable_position`, and
             *     `position_never_issued` — in each of those the server has no trustworthy prior
             *     position to subtract from.
             */
            lost_range?: {
                /** @description First undelivered `seq`. **Inclusive.** */
                from_seq: number;
                /** @description The connection whose sequence domain `from_seq` and `to_seq` are expressed in. Often the **previous** connection, not the current one. */
                stream_id: components["schemas"]["Id"];
                /** @description Last undelivered `seq`. **Inclusive.** */
                to_seq: number;
            };
            /** @constant */
            origin?: "system";
            /**
             * @description Why the resync was issued.
             *
             *     - `window_aged_out` — the position was valid but has fallen out of the bounded
             *       replay buffer.
             *     - `unknown_stream` — the `stream_id` is not one the server has (restart, or the
             *       connection was reaped).
             *     - `unparseable_position` — the `Last-Event-ID` did not parse and was not guessed
             *       at.
             *     - `position_never_issued` — the `stream_id` is known, but the `seq` is **beyond
             *       that stream's high-water mark**: the client is acknowledging an event the server
             *       never emitted. There is no honest way to resume from a position that never
             *       existed, so this **fails closed** — a fresh `stream_id` and a wholesale refetch.
             *       Treating it as live would accept a client's claim to have seen output that was
             *       never produced; replaying from the nearest real position would silently
             *       substitute a different position for the requested one. **A position the server
             *       never issued is not evidence of continuity.**
             *     - `gap_detected` — the server detected a gap in its own emission.
             * @enum {string}
             */
            reason: "window_aged_out" | "unknown_stream" | "unparseable_position" | "position_never_issued" | "gap_detected";
            /** @constant */
            type: "resync";
        } & unknown & {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "resync";
        };
        Session: {
            created_at?: components["schemas"]["Timestamp"];
            device_id?: components["schemas"]["Id"];
            expires_at: components["schemas"]["Timestamp"];
            id: components["schemas"]["Id"];
            principal_id: components["schemas"]["Id"];
            roles?: string[];
            /** @enum {string} */
            target: "web" | "pwa" | "desktop";
        };
        /**
         * @description The principal's settings. Mutated under `If-Match`. No settings key may hold an endpoint,
         *     an address, or a credential: the desktop endpoint lives in OS secure storage and never
         *     transits this API, and credentials live in the secret manager.
         */
        Settings: {
            [key: string]: unknown;
        };
        /**
         * @description One event frame. `type` is the discriminator, and every variant inherits the mandatory
         *     envelope — including `origin`.
         */
        StreamEvent: components["schemas"]["TokenEvent"] | components["schemas"]["MessageStartEvent"] | components["schemas"]["MessageEndEvent"] | components["schemas"]["ToolCallEvent"] | components["schemas"]["ToolResultEvent"] | components["schemas"]["ThinkingEvent"] | components["schemas"]["ErrorEvent"] | components["schemas"]["ContextEvent"] | components["schemas"]["PresenceEvent"] | components["schemas"]["ResyncEvent"] | components["schemas"]["HeartbeatEvent"];
        ThinkingEvent: components["schemas"]["EventEnvelope"] & {
            /** @constant */
            origin?: "assistant";
            text?: string;
            /** @constant */
            type: "thinking";
        } & {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "thinking";
        };
        Thread: {
            created_at: components["schemas"]["Timestamp"];
            id: components["schemas"]["Id"];
            message_count?: number;
            /** @description Set when this thread was branched from another. A branch adds references to the ancestor's attachments; it never copies bytes. */
            parent_thread_id?: string | null;
            title?: string | null;
            updated_at?: components["schemas"]["Timestamp"];
            workspace_id: components["schemas"]["Id"];
        };
        ThreadCreate: {
            parent_thread_id?: components["schemas"]["Id"];
            title?: string;
            workspace_id: components["schemas"]["Id"];
        };
        ThreadUpdate: {
            title?: string | null;
        };
        /**
         * Format: date-time
         * @description **UTC** ISO-8601 with an explicit zero offset — `2026-08-01T09:41:00Z` or
         *     `2026-08-01T09:41:00+00:00`. Optional fractional seconds are permitted.
         *
         *     The **pattern is the constraint**, not the description. Bare `format: date-time` accepts
         *     any offset — `2026-08-01T09:41:00+02:00` validates against it — so a contract that says
         *     "UTC" and checks only `date-time` lets several sprints emit several different wire forms
         *     while all validating, and the mismatch surfaces as an off-by-hours bug in a client that
         *     renders a "local" time twice. Non-UTC offsets are rejected here instead.
         *
         *     A local-time string never appears on the wire. Rendering into the viewer's local zone is a
         *     **client** concern and happens at the render boundary.
         *
         *     Timestamps are for **display and audit only** — they are never used to decide ordering,
         *     replay position, or eviction. That is what `seq` is for.
         *
         *     **This schema is the single definition.** Every timestamp field in this contract
         *     `$ref`s it or `TimestampOrNull`; no field re-declares `format: date-time` inline.
         *     Enforced by conformance test **T-CLOCK-2**.
         */
        Timestamp: string;
        /** @description A `Timestamp`, or `null` where the contract documents the value as legitimately absent. Same UTC constraint when present — nullability is not an escape from it. */
        TimestampOrNull: components["schemas"]["Timestamp"] | null;
        TokenEvent: components["schemas"]["EventEnvelope"] & {
            /** @constant */
            origin?: "assistant";
            text: string;
            /** @constant */
            type: "token";
        } & {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "token";
        };
        ToolCallEvent: components["schemas"]["EventEnvelope"] & {
            /** @description A sanitized summary of the arguments — keys and tokens redacted, oversized values truncated with an explicit marker. Never the raw arguments. */
            arguments_digest?: string;
            /** @constant */
            origin?: "tool";
            tool_call_id: components["schemas"]["Id"];
            tool_name: string;
            /** @constant */
            type: "tool.call";
        } & {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "tool.call";
        };
        ToolResultEvent: components["schemas"]["EventEnvelope"] & {
            /** @constant */
            origin?: "tool";
            /** @description Inert data. Never re-emitted as assistant text, never merged into a token stream, never parsed as an event. */
            result?: string;
            /** @enum {string} */
            status: "ok" | "error";
            tool_call_id: components["schemas"]["Id"];
            /** @constant */
            type: "tool.result";
        } & {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "tool.result";
        };
        Turn: {
            ended_at?: components["schemas"]["TimestampOrNull"];
            id: components["schemas"]["Id"];
            messages?: components["schemas"]["Message"][];
            started_at?: components["schemas"]["Timestamp"];
            /** @enum {string} */
            state: "running" | "completed" | "cancelled" | "failed";
            /**
             * @description Why the turn ended. `stopped_by_user` is an explicit user stop; `abandoned` is a
             *     refcount-zero expiry after the grace window. The two are deliberately distinct — a
             *     transport drop is not a user decision.
             * @enum {string|null}
             */
            terminal_reason?: "completed" | "stopped_by_user" | "abandoned" | "upstream_error" | "upstream_timeout" | null;
            thread_id: components["schemas"]["Id"];
        };
        User: {
            created_at?: components["schemas"]["Timestamp"];
            display_name: string;
            id: components["schemas"]["Id"];
            roles?: string[];
        };
        Workspace: {
            created_at: components["schemas"]["Timestamp"];
            id: components["schemas"]["Id"];
            name: string;
            updated_at?: components["schemas"]["Timestamp"];
        };
    };
    responses: {
        /** @description `urn:aperture:error:auth-expired` — the session existed and has expired. Distinct from `auth-required` so the client can refresh rather than prompt. */
        AuthExpired: {
            headers: {
                "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description `urn:aperture:error:auth-required` — no valid session. The client re-authenticates; it does not retry blindly. */
        AuthRequired: {
            headers: {
                "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description `urn:aperture:error:capability-unavailable` — a backend capability is not currently
         *     reachable. The BFF degrades rather than crashing, and the client renders an explained
         *     inert state rather than a broken screen. The response names the capability and a reason,
         *     never a host or an address.
         */
        CapabilityUnavailable: {
            headers: {
                "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description `urn:aperture:error:conflict` — an idempotency-key reuse with a different body, a duplicate still in flight, or a state conflict. */
        Conflict: {
            headers: {
                "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description `urn:aperture:error:forbidden` — authenticated but not permitted. Used only where the
         *     resource's existence is already known to the caller. Where it is not, the API returns
         *     `not-found` instead, so that an error code never becomes an existence oracle.
         */
        Forbidden: {
            headers: {
                "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description `urn:aperture:error:internal` — an unexpected server-side failure. The body carries the
         *     stable class, a safe message, and a `correlation_id`. It never carries a stack frame, an
         *     upstream error string, a file path, or any infrastructure identifier.
         */
        InternalError: {
            headers: {
                "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description `urn:aperture:error:not-found` — no such resource, or none this principal may see. Deliberately indistinguishable. */
        NotFound: {
            headers: {
                "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description `urn:aperture:error:payload-too-large` — the request exceeded a limit declared in this contract. */
        PayloadTooLarge: {
            headers: {
                "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description `urn:aperture:error:precondition-failed` — the supplied `If-Match` does not match. The client refetches and reapplies; it never retries blind. */
        PreconditionFailed: {
            headers: {
                "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /**
         * @description An RFC-9457 problem-details response. Every error in this API uses this shape and carries
         *     a stable `type` URN. The full taxonomy and each URN's user-facing meaning and recovery
         *     action are specified in `contracts/aperture-errors-v1.md`.
         */
        Problem: {
            headers: {
                "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description `urn:aperture:error:rate-limited` — too many requests. `Retry-After` is authoritative. */
        RateLimited: {
            headers: {
                "Retry-After": components["headers"]["RetryAfter"];
                "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description `urn:aperture:error:capability-unavailable` — the process is not able to serve. */
        ServiceUnavailable: {
            headers: {
                "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
        /** @description `urn:aperture:error:validation-failed` — the request was malformed or violated a documented constraint. */
        ValidationFailed: {
            headers: {
                "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                [name: string]: unknown;
            };
            content: {
                "application/problem+json": components["schemas"]["Problem"];
            };
        };
    };
    parameters: {
        /** @description An unguessable identifier. Possession of an id is not a capability; every access is separately authorized. */
        AttachmentId: components["schemas"]["Id"];
        /**
         * @description An opaque cursor from a previous page's `page.next_cursor`. Cursors are opaque: a client
         *     never constructs, parses, decodes, or arithmetically manipulates one. Offset pagination
         *     is not offered on any route.
         */
        Cursor: string;
        DeviceId: components["schemas"]["Id"];
        /**
         * @description A comma-separated list of `field:value` predicates, ANDed. Only fields documented as
         *     filterable for the route are accepted; an unknown field or operator is
         *     `validation-failed`, never silently ignored. Filtering is fail-closed, never best-effort.
         */
        Filter: string;
        /**
         * @description An opaque, high-entropy, client-generated key identifying one **logical** operation. It
         *     is replayed unchanged across transport retries of that operation and regenerated for a
         *     user-initiated resend, which is a new logical operation.
         */
        IdempotencyKey: string;
        /**
         * @description **Required on this route.** A request without it is rejected with `validation-failed` and
         *     is never silently accepted. Same key plus same body within the retention window replays
         *     the recorded response; same key plus a different body is `conflict`; a duplicate arriving
         *     while the first is still in flight is `conflict`, never a second upstream turn.
         */
        IdempotencyKeyRequired: string;
        /** @description Optional here. When supplied it is enforced exactly as on the required routes. */
        IfMatchOptional: string;
        /**
         * @description The `ETag` of the representation the client believes it is modifying. **Required.** A
         *     missing header is `validation-failed`; a stale one is `precondition-failed`. `If-Match: *`
         *     is **not** accepted as a concurrency bypass on any route.
         */
        IfMatchRequired: string;
        /** @description Page size. The server clamps to the maximum named by `APERTURE_MAX_PAGE_ITEMS` and reports the applied value implicitly through the returned page. */
        Limit: number;
        ModuleId: string;
        /**
         * @description Checked on every mutating route as CSRF defence, together with `Sec-Fetch-Site`. The check
         *     is a fail-closed **allowlist**: an absent, unrecognized, or unparseable value is rejected.
         *     A denylist is never used. See `contracts/aperture-auth-v1.md`.
         */
        OriginHeader: string;
        /**
         * @description The second half of the fail-closed CSRF check. A browser sending neither this nor `Origin`
         *     is rejected; that is deliberate and costs a legacy-browser class Aperture does not support.
         */
        SecFetchSiteHeader: string;
        /**
         * @description A comma-separated list of fields, each optionally prefixed with `-` for descending —
         *     for example `-updated_at,name`. Only fields documented as sortable for the route are
         *     accepted; an unknown field is `validation-failed`, never silently ignored.
         */
        Sort: string;
        ThreadId: components["schemas"]["Id"];
        TurnId: components["schemas"]["Id"];
        WorkspaceIdQuery: components["schemas"]["Id"];
    };
    requestBodies: never;
    headers: {
        /**
         * @description The `major.minor` version of the API contract this server implements. It carries the
         *     contract version and **nothing else** — never a build hash, commit id, host name, or
         *     upstream component version. Present on every response, including error responses. Client
         *     skew classification is specified in `contracts/README.md`.
         */
        ContractVersion: string;
        /** @description The opaque entity tag for optimistic concurrency. Supply it back in `If-Match` on the next mutation of this resource. */
        ETag: string;
        /** @description Seconds to wait before retrying. Clients honour it; they do not invent their own shorter interval. */
        RetryAfter: number;
    };
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    adminListAuditEvents: {
        parameters: {
            query?: {
                /**
                 * @description An opaque cursor from a previous page's `page.next_cursor`. Cursors are opaque: a client
                 *     never constructs, parses, decodes, or arithmetically manipulates one. Offset pagination
                 *     is not offered on any route.
                 */
                cursor?: components["parameters"]["Cursor"];
                /**
                 * @description A comma-separated list of `field:value` predicates, ANDed. Only fields documented as
                 *     filterable for the route are accepted; an unknown field or operator is
                 *     `validation-failed`, never silently ignored. Filtering is fail-closed, never best-effort.
                 */
                filter?: components["parameters"]["Filter"];
                /** @description Page size. The server clamps to the maximum named by `APERTURE_MAX_PAGE_ITEMS` and reports the applied value implicitly through the returned page. */
                limit?: components["parameters"]["Limit"];
                /**
                 * @description A comma-separated list of fields, each optionally prefixed with `-` for descending —
                 *     for example `-updated_at,name`. Only fields documented as sortable for the route are
                 *     accepted; an unknown field is `validation-failed`, never silently ignored.
                 */
                sort?: components["parameters"]["Sort"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description A page of audit records. */
            200: {
                headers: {
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: components["schemas"]["AuditRecord"][];
                        page: components["schemas"]["PageInfo"];
                    };
                };
            };
            401: components["responses"]["AuthRequired"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Problem"];
        };
    };
    adminListUsers: {
        parameters: {
            query?: {
                /**
                 * @description An opaque cursor from a previous page's `page.next_cursor`. Cursors are opaque: a client
                 *     never constructs, parses, decodes, or arithmetically manipulates one. Offset pagination
                 *     is not offered on any route.
                 */
                cursor?: components["parameters"]["Cursor"];
                /** @description Page size. The server clamps to the maximum named by `APERTURE_MAX_PAGE_ITEMS` and reports the applied value implicitly through the returned page. */
                limit?: components["parameters"]["Limit"];
                /**
                 * @description A comma-separated list of fields, each optionally prefixed with `-` for descending —
                 *     for example `-updated_at,name`. Only fields documented as sortable for the route are
                 *     accepted; an unknown field is `validation-failed`, never silently ignored.
                 */
                sort?: components["parameters"]["Sort"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description A page of users. */
            200: {
                headers: {
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: components["schemas"]["User"][];
                        page: components["schemas"]["PageInfo"];
                    };
                };
            };
            401: components["responses"]["AuthRequired"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Problem"];
        };
    };
    createAttachment: {
        parameters: {
            query?: never;
            header: {
                /**
                 * @description **Required on this route.** A request without it is rejected with `validation-failed` and
                 *     is never silently accepted. Same key plus same body within the retention window replays
                 *     the recorded response; same key plus a different body is `conflict`; a duplicate arriving
                 *     while the first is still in flight is `conflict`, never a second upstream turn.
                 */
                "Idempotency-Key": components["parameters"]["IdempotencyKeyRequired"];
                /**
                 * @description Checked on every mutating route as CSRF defence, together with `Sec-Fetch-Site`. The check
                 *     is a fail-closed **allowlist**: an absent, unrecognized, or unparseable value is rejected.
                 *     A denylist is never used. See `contracts/aperture-auth-v1.md`.
                 */
                Origin?: components["parameters"]["OriginHeader"];
                /**
                 * @description The second half of the fail-closed CSRF check. A browser sending neither this nor `Origin`
                 *     is rejected; that is deliberate and costs a legacy-browser class Aperture does not support.
                 */
                "Sec-Fetch-Site"?: components["parameters"]["SecFetchSiteHeader"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "multipart/form-data": {
                    /** Format: binary */
                    file: string;
                    /** @description Untrusted client metadata. Recorded, sanitized, never trusted to select a response type. */
                    filename?: string;
                    workspace_id?: components["schemas"]["Id"];
                };
            };
        };
        responses: {
            /** @description Attachment stored. */
            201: {
                headers: {
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Attachment"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["AuthRequired"];
            409: components["responses"]["Conflict"];
            413: components["responses"]["PayloadTooLarge"];
            429: components["responses"]["RateLimited"];
            default: components["responses"]["Problem"];
        };
    };
    getAttachment: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description An unguessable identifier. Possession of an id is not a capability; every access is separately authorized. */
                attachmentId: components["parameters"]["AttachmentId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Attachment metadata. */
            200: {
                headers: {
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Attachment"];
                };
            };
            401: components["responses"]["AuthRequired"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Problem"];
        };
    };
    deleteAttachment: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Checked on every mutating route as CSRF defence, together with `Sec-Fetch-Site`. The check
                 *     is a fail-closed **allowlist**: an absent, unrecognized, or unparseable value is rejected.
                 *     A denylist is never used. See `contracts/aperture-auth-v1.md`.
                 */
                Origin?: components["parameters"]["OriginHeader"];
                /**
                 * @description The second half of the fail-closed CSRF check. A browser sending neither this nor `Origin`
                 *     is rejected; that is deliberate and costs a legacy-browser class Aperture does not support.
                 */
                "Sec-Fetch-Site"?: components["parameters"]["SecFetchSiteHeader"];
            };
            path: {
                /** @description An unguessable identifier. Possession of an id is not a capability; every access is separately authorized. */
                attachmentId: components["parameters"]["AttachmentId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Reference dropped. */
            204: {
                headers: {
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["AuthRequired"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Problem"];
        };
    };
    getAttachmentContent: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description An unguessable identifier. Possession of an id is not a capability; every access is separately authorized. */
                attachmentId: components["parameters"]["AttachmentId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The attachment bytes, served under the isolation header set. */
            200: {
                headers: {
                    /** @description MUST be `private, no-store` for authenticated content. */
                    "Cache-Control"?: string;
                    /**
                     * @description `attachment; filename*=UTF-8''<sanitized>` for everything except allowlisted
                     *     inline-safe raster image types. Always `attachment` for SVG and HTML.
                     */
                    "Content-Disposition"?: string;
                    /** @description MUST be `sandbox; default-src 'none'`. */
                    "Content-Security-Policy"?: string;
                    /** @description MUST be `no-referrer`. */
                    "Referrer-Policy"?: string;
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    /** @description MUST be `nosniff`. */
                    "X-Content-Type-Options"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/octet-stream": string;
                };
            };
            401: components["responses"]["AuthRequired"];
            404: components["responses"]["NotFound"];
            /** @description The requested range is not satisfiable. The isolation header set is unchanged on this response. */
            416: {
                headers: {
                    /** @description MUST be `sandbox; default-src 'none'`, exactly as on the success response. An error path is not an isolation exemption. */
                    "Content-Security-Policy"?: string;
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    /** @description MUST be `nosniff`. */
                    "X-Content-Type-Options"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            default: components["responses"]["Problem"];
        };
    };
    listDevices: {
        parameters: {
            query?: {
                /**
                 * @description An opaque cursor from a previous page's `page.next_cursor`. Cursors are opaque: a client
                 *     never constructs, parses, decodes, or arithmetically manipulates one. Offset pagination
                 *     is not offered on any route.
                 */
                cursor?: components["parameters"]["Cursor"];
                /** @description Page size. The server clamps to the maximum named by `APERTURE_MAX_PAGE_ITEMS` and reports the applied value implicitly through the returned page. */
                limit?: components["parameters"]["Limit"];
                /**
                 * @description A comma-separated list of fields, each optionally prefixed with `-` for descending —
                 *     for example `-updated_at,name`. Only fields documented as sortable for the route are
                 *     accepted; an unknown field is `validation-failed`, never silently ignored.
                 */
                sort?: components["parameters"]["Sort"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description A page of devices. */
            200: {
                headers: {
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: components["schemas"]["Device"][];
                        page: components["schemas"]["PageInfo"];
                    };
                };
            };
            401: components["responses"]["AuthRequired"];
            default: components["responses"]["Problem"];
        };
    };
    revokeDevice: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Checked on every mutating route as CSRF defence, together with `Sec-Fetch-Site`. The check
                 *     is a fail-closed **allowlist**: an absent, unrecognized, or unparseable value is rejected.
                 *     A denylist is never used. See `contracts/aperture-auth-v1.md`.
                 */
                Origin?: components["parameters"]["OriginHeader"];
                /**
                 * @description The second half of the fail-closed CSRF check. A browser sending neither this nor `Origin`
                 *     is rejected; that is deliberate and costs a legacy-browser class Aperture does not support.
                 */
                "Sec-Fetch-Site"?: components["parameters"]["SecFetchSiteHeader"];
            };
            path: {
                deviceId: components["parameters"]["DeviceId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Device revoked. */
            204: {
                headers: {
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["AuthRequired"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Problem"];
        };
    };
    login: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Checked on every mutating route as CSRF defence, together with `Sec-Fetch-Site`. The check
                 *     is a fail-closed **allowlist**: an absent, unrecognized, or unparseable value is rejected.
                 *     A denylist is never used. See `contracts/aperture-auth-v1.md`.
                 */
                Origin?: components["parameters"]["OriginHeader"];
                /**
                 * @description The second half of the fail-closed CSRF check. A browser sending neither this nor `Origin`
                 *     is rejected; that is deliberate and costs a legacy-browser class Aperture does not support.
                 */
                "Sec-Fetch-Site"?: components["parameters"]["SecFetchSiteHeader"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginRequest"];
            };
        };
        responses: {
            /** @description Session established. */
            200: {
                headers: {
                    /**
                     * @description Present for the web and PWA targets only. `__Host-` prefixed, `HttpOnly`,
                     *     `Secure`, `SameSite=Strict`, `Path=/`, and no `Domain` attribute. Absent for the
                     *     desktop target, which receives a bearer token in the body instead.
                     */
                    "Set-Cookie"?: string;
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LoginResponse"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["AuthRequired"];
            403: components["responses"]["Forbidden"];
            429: components["responses"]["RateLimited"];
            default: components["responses"]["Problem"];
        };
    };
    logout: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Checked on every mutating route as CSRF defence, together with `Sec-Fetch-Site`. The check
                 *     is a fail-closed **allowlist**: an absent, unrecognized, or unparseable value is rejected.
                 *     A denylist is never used. See `contracts/aperture-auth-v1.md`.
                 */
                Origin?: components["parameters"]["OriginHeader"];
                /**
                 * @description The second half of the fail-closed CSRF check. A browser sending neither this nor `Origin`
                 *     is rejected; that is deliberate and costs a legacy-browser class Aperture does not support.
                 */
                "Sec-Fetch-Site"?: components["parameters"]["SecFetchSiteHeader"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Session ended. Idempotent — ending an already-ended session also returns 204. */
            204: {
                headers: {
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["AuthRequired"];
            default: components["responses"]["Problem"];
        };
    };
    refreshSession: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Checked on every mutating route as CSRF defence, together with `Sec-Fetch-Site`. The check
                 *     is a fail-closed **allowlist**: an absent, unrecognized, or unparseable value is rejected.
                 *     A denylist is never used. See `contracts/aperture-auth-v1.md`.
                 */
                Origin?: components["parameters"]["OriginHeader"];
                /**
                 * @description The second half of the fail-closed CSRF check. A browser sending neither this nor `Origin`
                 *     is rejected; that is deliberate and costs a legacy-browser class Aperture does not support.
                 */
                "Sec-Fetch-Site"?: components["parameters"]["SecFetchSiteHeader"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Session refreshed. */
            200: {
                headers: {
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LoginResponse"];
                };
            };
            401: components["responses"]["AuthExpired"];
            403: components["responses"]["Forbidden"];
            429: components["responses"]["RateLimited"];
            default: components["responses"]["Problem"];
        };
    };
    getSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The current session. */
            200: {
                headers: {
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Session"];
                };
            };
            401: components["responses"]["AuthRequired"];
            default: components["responses"]["Problem"];
        };
    };
    publishContextEvent: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description An opaque, high-entropy, client-generated key identifying one **logical** operation. It
                 *     is replayed unchanged across transport retries of that operation and regenerated for a
                 *     user-initiated resend, which is a new logical operation.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
                /**
                 * @description Checked on every mutating route as CSRF defence, together with `Sec-Fetch-Site`. The check
                 *     is a fail-closed **allowlist**: an absent, unrecognized, or unparseable value is rejected.
                 *     A denylist is never used. See `contracts/aperture-auth-v1.md`.
                 */
                Origin?: components["parameters"]["OriginHeader"];
                /**
                 * @description The second half of the fail-closed CSRF check. A browser sending neither this nor `Origin`
                 *     is rejected; that is deliberate and costs a legacy-browser class Aperture does not support.
                 */
                "Sec-Fetch-Site"?: components["parameters"]["SecFetchSiteHeader"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ContextPublish"];
            };
        };
        responses: {
            /** @description Accepted for publication. */
            202: {
                headers: {
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["AuthRequired"];
            413: components["responses"]["PayloadTooLarge"];
            429: components["responses"]["RateLimited"];
            default: components["responses"]["Problem"];
        };
    };
    getHealth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The process is alive. */
            200: {
                headers: {
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @constant */
                        status: "ok";
                    };
                };
            };
            429: components["responses"]["RateLimited"];
            503: components["responses"]["ServiceUnavailable"];
            default: components["responses"]["Problem"];
        };
    };
    listModules: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The module descriptors. */
            200: {
                headers: {
                    ETag: components["headers"]["ETag"];
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: components["schemas"]["ModuleDescriptor"][];
                    };
                };
            };
            401: components["responses"]["AuthRequired"];
            default: components["responses"]["Problem"];
        };
    };
    getModule: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                moduleId: components["parameters"]["ModuleId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The descriptor. */
            200: {
                headers: {
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ModuleDescriptor"];
                };
            };
            401: components["responses"]["AuthRequired"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Problem"];
        };
    };
    getReady: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Ready to serve. */
            200: {
                headers: {
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Readiness"];
                };
            };
            429: components["responses"]["RateLimited"];
            /**
             * @description Not ready. **RFC-9457 problem details**, `urn:aperture:error:capability-unavailable`,
             *     with the unready capabilities in the `capabilities` member — never a bare `Readiness`
             *     body. "Every error is problem details" holds without exception, including here, and
             *     including on the unauthenticated probes.
             */
            503: {
                headers: {
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["Problem"];
                };
            };
            default: components["responses"]["Problem"];
        };
    };
    getSettings: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The settings, with an `ETag` for optimistic concurrency. */
            200: {
                headers: {
                    ETag: components["headers"]["ETag"];
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Settings"];
                };
            };
            401: components["responses"]["AuthRequired"];
            default: components["responses"]["Problem"];
        };
    };
    replaceSettings: {
        parameters: {
            query?: never;
            header: {
                /**
                 * @description The `ETag` of the representation the client believes it is modifying. **Required.** A
                 *     missing header is `validation-failed`; a stale one is `precondition-failed`. `If-Match: *`
                 *     is **not** accepted as a concurrency bypass on any route.
                 */
                "If-Match": components["parameters"]["IfMatchRequired"];
                /**
                 * @description Checked on every mutating route as CSRF defence, together with `Sec-Fetch-Site`. The check
                 *     is a fail-closed **allowlist**: an absent, unrecognized, or unparseable value is rejected.
                 *     A denylist is never used. See `contracts/aperture-auth-v1.md`.
                 */
                Origin?: components["parameters"]["OriginHeader"];
                /**
                 * @description The second half of the fail-closed CSRF check. A browser sending neither this nor `Origin`
                 *     is rejected; that is deliberate and costs a legacy-browser class Aperture does not support.
                 */
                "Sec-Fetch-Site"?: components["parameters"]["SecFetchSiteHeader"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["Settings"];
            };
        };
        responses: {
            /** @description Settings replaced. */
            200: {
                headers: {
                    ETag: components["headers"]["ETag"];
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Settings"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["AuthRequired"];
            412: components["responses"]["PreconditionFailed"];
            413: components["responses"]["PayloadTooLarge"];
            default: components["responses"]["Problem"];
        };
    };
    openStream: {
        parameters: {
            query?: {
                /**
                 * @description An optional server-side filter narrowing the connection to one thread. It is a
                 *     **filter, not a scope**: it does not make the stream per-thread, does not change the
                 *     sequence domain, and does not create a second connection model. Omitting it is the
                 *     normal case.
                 */
                thread_id?: components["schemas"]["Id"];
            };
            header?: {
                /**
                 * @description Standard SSE resume. The value is the composite `"{stream_id}:{seq}"` the server put
                 *     in the SSE `id:` field of the last event the client fully processed. It is composite
                 *     rather than a bare `seq` because `seq` is only meaningful within its connection: the
                 *     `stream_id` half is what lets the server tell "resume connection X from 412" from
                 *     "connection X is gone, so this position means nothing".
                 *
                 *     Absent on a first connection, which is the only case that legitimately starts at live
                 *     with no `resync`.
                 *
                 *     **A malformed value is never treated as absent.** It is never parse-guessed either.
                 *     The client asked to resume from *somewhere*, so silently starting it at live would
                 *     lose continuity without telling it — exactly the silent loss this contract forbids.
                 *     The server issues a fresh `stream_id` and immediately emits a `resync` with
                 *     `reason: unparseable_position` and no `lost_range`, and the client refetches. Enforced
                 *     by conformance test **T-RESYNC-2**.
                 *
                 *     ## The schema here is deliberately an OPAQUE BOUNDED STRING. Do not "tighten" it.
                 *
                 *     This header carries **no format constraint** — only a length cap — and that is a
                 *     correctness requirement, not an oversight. Someone will eventually notice that the
                 *     value has a known shape and add
                 *     `pattern: '^[A-Za-z0-9_-]+:[0-9]+$'`. **That change breaks the contract**, as follows:
                 *
                 *     a malformed `Last-Event-ID` would then fail *schema* validation at the edge, before
                 *     any handler runs. A generated server or a validating gateway would legitimately reject
                 *     the request with a problem response — so the `resync(reason: unparseable_position)`
                 *     this contract mandates for exactly that input **could never be emitted**, and the
                 *     client would be left with the silent continuity loss the rule exists to prevent. The
                 *     constraint intended to enforce the behaviour is what makes the behaviour unreachable.
                 *
                 *     **Parsing and rejection of this header are BEHAVIOURAL, specified in
                 *     `contracts/aperture-events-v1.md` §5, not structural.** The general rule, which
                 *     applies to any fail-closed handling of malformed input anywhere in this contract:
                 *     **when a contract specifies a behaviour for malformed input, the malformed input must
                 *     be able to reach the handler.** A schema that rejects it first replaces the specified
                 *     behaviour with a different one.
                 *
                 *     The length cap is retained because an unbounded header is a resource-exhaustion
                 *     surface; an over-long value is rejected as malformed, which is a behaviour this
                 *     contract already defines.
                 */
                "Last-Event-ID"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /**
             * @description The event stream. Each frame is one `StreamEvent` serialized as JSON in the SSE
             *     `data:` field, with the SSE `id:` field carrying the composite `"{stream_id}:{seq}"`
             *     and the SSE `event:` field
             *     carrying the event `type`.
             */
            200: {
                headers: {
                    /** @description MUST be `no-cache, no-store, no-transform`. */
                    "Cache-Control"?: string;
                    /** @description MUST be `keep-alive`. */
                    Connection?: string;
                    /** @description MUST be `no`, to defeat reverse-proxy response buffering. */
                    "X-Accel-Buffering"?: string;
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": components["schemas"]["StreamEvent"];
                };
            };
            401: components["responses"]["AuthRequired"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["CapabilityUnavailable"];
            default: components["responses"]["Problem"];
        };
    };
    listThreads: {
        parameters: {
            query?: {
                /**
                 * @description An opaque cursor from a previous page's `page.next_cursor`. Cursors are opaque: a client
                 *     never constructs, parses, decodes, or arithmetically manipulates one. Offset pagination
                 *     is not offered on any route.
                 */
                cursor?: components["parameters"]["Cursor"];
                /**
                 * @description A comma-separated list of `field:value` predicates, ANDed. Only fields documented as
                 *     filterable for the route are accepted; an unknown field or operator is
                 *     `validation-failed`, never silently ignored. Filtering is fail-closed, never best-effort.
                 */
                filter?: components["parameters"]["Filter"];
                /** @description Page size. The server clamps to the maximum named by `APERTURE_MAX_PAGE_ITEMS` and reports the applied value implicitly through the returned page. */
                limit?: components["parameters"]["Limit"];
                /**
                 * @description A comma-separated list of fields, each optionally prefixed with `-` for descending —
                 *     for example `-updated_at,name`. Only fields documented as sortable for the route are
                 *     accepted; an unknown field is `validation-failed`, never silently ignored.
                 */
                sort?: components["parameters"]["Sort"];
                workspace_id?: components["parameters"]["WorkspaceIdQuery"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description A page of threads. */
            200: {
                headers: {
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: components["schemas"]["Thread"][];
                        page: components["schemas"]["PageInfo"];
                    };
                };
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["AuthRequired"];
            default: components["responses"]["Problem"];
        };
    };
    createThread: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description An opaque, high-entropy, client-generated key identifying one **logical** operation. It
                 *     is replayed unchanged across transport retries of that operation and regenerated for a
                 *     user-initiated resend, which is a new logical operation.
                 */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKey"];
                /**
                 * @description Checked on every mutating route as CSRF defence, together with `Sec-Fetch-Site`. The check
                 *     is a fail-closed **allowlist**: an absent, unrecognized, or unparseable value is rejected.
                 *     A denylist is never used. See `contracts/aperture-auth-v1.md`.
                 */
                Origin?: components["parameters"]["OriginHeader"];
                /**
                 * @description The second half of the fail-closed CSRF check. A browser sending neither this nor `Origin`
                 *     is rejected; that is deliberate and costs a legacy-browser class Aperture does not support.
                 */
                "Sec-Fetch-Site"?: components["parameters"]["SecFetchSiteHeader"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ThreadCreate"];
            };
        };
        responses: {
            /** @description Thread created. */
            201: {
                headers: {
                    ETag: components["headers"]["ETag"];
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Thread"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["AuthRequired"];
            409: components["responses"]["Conflict"];
            413: components["responses"]["PayloadTooLarge"];
            429: components["responses"]["RateLimited"];
            default: components["responses"]["Problem"];
        };
    };
    getThread: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                threadId: components["parameters"]["ThreadId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The thread. */
            200: {
                headers: {
                    ETag: components["headers"]["ETag"];
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Thread"];
                };
            };
            401: components["responses"]["AuthRequired"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Problem"];
        };
    };
    deleteThread: {
        parameters: {
            query?: never;
            header?: {
                /** @description Optional here. When supplied it is enforced exactly as on the required routes. */
                "If-Match"?: components["parameters"]["IfMatchOptional"];
                /**
                 * @description Checked on every mutating route as CSRF defence, together with `Sec-Fetch-Site`. The check
                 *     is a fail-closed **allowlist**: an absent, unrecognized, or unparseable value is rejected.
                 *     A denylist is never used. See `contracts/aperture-auth-v1.md`.
                 */
                Origin?: components["parameters"]["OriginHeader"];
                /**
                 * @description The second half of the fail-closed CSRF check. A browser sending neither this nor `Origin`
                 *     is rejected; that is deliberate and costs a legacy-browser class Aperture does not support.
                 */
                "Sec-Fetch-Site"?: components["parameters"]["SecFetchSiteHeader"];
            };
            path: {
                threadId: components["parameters"]["ThreadId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Thread deleted. */
            204: {
                headers: {
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["AuthRequired"];
            404: components["responses"]["NotFound"];
            412: components["responses"]["PreconditionFailed"];
            default: components["responses"]["Problem"];
        };
    };
    updateThread: {
        parameters: {
            query?: never;
            header: {
                /**
                 * @description The `ETag` of the representation the client believes it is modifying. **Required.** A
                 *     missing header is `validation-failed`; a stale one is `precondition-failed`. `If-Match: *`
                 *     is **not** accepted as a concurrency bypass on any route.
                 */
                "If-Match": components["parameters"]["IfMatchRequired"];
                /**
                 * @description Checked on every mutating route as CSRF defence, together with `Sec-Fetch-Site`. The check
                 *     is a fail-closed **allowlist**: an absent, unrecognized, or unparseable value is rejected.
                 *     A denylist is never used. See `contracts/aperture-auth-v1.md`.
                 */
                Origin?: components["parameters"]["OriginHeader"];
                /**
                 * @description The second half of the fail-closed CSRF check. A browser sending neither this nor `Origin`
                 *     is rejected; that is deliberate and costs a legacy-browser class Aperture does not support.
                 */
                "Sec-Fetch-Site"?: components["parameters"]["SecFetchSiteHeader"];
            };
            path: {
                threadId: components["parameters"]["ThreadId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ThreadUpdate"];
            };
        };
        responses: {
            /** @description Thread updated. */
            200: {
                headers: {
                    ETag: components["headers"]["ETag"];
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Thread"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["AuthRequired"];
            404: components["responses"]["NotFound"];
            412: components["responses"]["PreconditionFailed"];
            413: components["responses"]["PayloadTooLarge"];
            default: components["responses"]["Problem"];
        };
    };
    listMessages: {
        parameters: {
            query?: {
                /**
                 * @description An opaque cursor from a previous page's `page.next_cursor`. Cursors are opaque: a client
                 *     never constructs, parses, decodes, or arithmetically manipulates one. Offset pagination
                 *     is not offered on any route.
                 */
                cursor?: components["parameters"]["Cursor"];
                /** @description Page size. The server clamps to the maximum named by `APERTURE_MAX_PAGE_ITEMS` and reports the applied value implicitly through the returned page. */
                limit?: components["parameters"]["Limit"];
                /**
                 * @description A comma-separated list of fields, each optionally prefixed with `-` for descending —
                 *     for example `-updated_at,name`. Only fields documented as sortable for the route are
                 *     accepted; an unknown field is `validation-failed`, never silently ignored.
                 */
                sort?: components["parameters"]["Sort"];
            };
            header?: never;
            path: {
                threadId: components["parameters"]["ThreadId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description A page of messages. */
            200: {
                headers: {
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: components["schemas"]["Message"][];
                        page: components["schemas"]["PageInfo"];
                    };
                };
            };
            401: components["responses"]["AuthRequired"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Problem"];
        };
    };
    createMessage: {
        parameters: {
            query?: never;
            header: {
                /**
                 * @description **Required on this route.** A request without it is rejected with `validation-failed` and
                 *     is never silently accepted. Same key plus same body within the retention window replays
                 *     the recorded response; same key plus a different body is `conflict`; a duplicate arriving
                 *     while the first is still in flight is `conflict`, never a second upstream turn.
                 */
                "Idempotency-Key": components["parameters"]["IdempotencyKeyRequired"];
                /**
                 * @description Checked on every mutating route as CSRF defence, together with `Sec-Fetch-Site`. The check
                 *     is a fail-closed **allowlist**: an absent, unrecognized, or unparseable value is rejected.
                 *     A denylist is never used. See `contracts/aperture-auth-v1.md`.
                 */
                Origin?: components["parameters"]["OriginHeader"];
                /**
                 * @description The second half of the fail-closed CSRF check. A browser sending neither this nor `Origin`
                 *     is rejected; that is deliberate and costs a legacy-browser class Aperture does not support.
                 */
                "Sec-Fetch-Site"?: components["parameters"]["SecFetchSiteHeader"];
            };
            path: {
                threadId: components["parameters"]["ThreadId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MessageCreate"];
            };
        };
        responses: {
            /** @description Message accepted and a turn started. */
            201: {
                headers: {
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageCreated"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["AuthRequired"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            413: components["responses"]["PayloadTooLarge"];
            429: components["responses"]["RateLimited"];
            503: components["responses"]["CapabilityUnavailable"];
            default: components["responses"]["Problem"];
        };
    };
    getTurn: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                threadId: components["parameters"]["ThreadId"];
                turnId: components["parameters"]["TurnId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The turn. */
            200: {
                headers: {
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Turn"];
                };
            };
            401: components["responses"]["AuthRequired"];
            404: components["responses"]["NotFound"];
            default: components["responses"]["Problem"];
        };
    };
    stopTurn: {
        parameters: {
            query?: never;
            header?: {
                /**
                 * @description Checked on every mutating route as CSRF defence, together with `Sec-Fetch-Site`. The check
                 *     is a fail-closed **allowlist**: an absent, unrecognized, or unparseable value is rejected.
                 *     A denylist is never used. See `contracts/aperture-auth-v1.md`.
                 */
                Origin?: components["parameters"]["OriginHeader"];
                /**
                 * @description The second half of the fail-closed CSRF check. A browser sending neither this nor `Origin`
                 *     is rejected; that is deliberate and costs a legacy-browser class Aperture does not support.
                 */
                "Sec-Fetch-Site"?: components["parameters"]["SecFetchSiteHeader"];
            };
            path: {
                threadId: components["parameters"]["ThreadId"];
                turnId: components["parameters"]["TurnId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Cancellation accepted. The terminal event arrives on the stream. */
            202: {
                headers: {
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["AuthRequired"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["Conflict"];
            default: components["responses"]["Problem"];
        };
    };
    getVersion: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The contract version. */
            200: {
                headers: {
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @description The `major.minor` version of the Aperture API contract. */
                        contract_version: string;
                    };
                };
            };
            429: components["responses"]["RateLimited"];
            500: components["responses"]["InternalError"];
            default: components["responses"]["Problem"];
        };
    };
    listWorkspaces: {
        parameters: {
            query?: {
                /**
                 * @description An opaque cursor from a previous page's `page.next_cursor`. Cursors are opaque: a client
                 *     never constructs, parses, decodes, or arithmetically manipulates one. Offset pagination
                 *     is not offered on any route.
                 */
                cursor?: components["parameters"]["Cursor"];
                /** @description Page size. The server clamps to the maximum named by `APERTURE_MAX_PAGE_ITEMS` and reports the applied value implicitly through the returned page. */
                limit?: components["parameters"]["Limit"];
                /**
                 * @description A comma-separated list of fields, each optionally prefixed with `-` for descending —
                 *     for example `-updated_at,name`. Only fields documented as sortable for the route are
                 *     accepted; an unknown field is `validation-failed`, never silently ignored.
                 */
                sort?: components["parameters"]["Sort"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description A page of workspaces. */
            200: {
                headers: {
                    "X-Aperture-Contract-Version": components["headers"]["ContractVersion"];
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        items: components["schemas"]["Workspace"][];
                        page: components["schemas"]["PageInfo"];
                    };
                };
            };
            401: components["responses"]["AuthRequired"];
            default: components["responses"]["Problem"];
        };
    };
}
