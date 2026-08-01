// APTR-07 — operation-wrapper tests. The transport is a stub: these assert what the wrapper
// resolves an operationId to, not what the network does.

import { describe, expect, it } from 'vitest';

import { call, createApiClient, interpolatePath } from './client.ts';
import { ApertureConfigError } from './errors.ts';
import { OPERATIONS } from './generated/operations.ts';
import type { ApertureResponse, RequestOptions, Transport } from './transport.ts';

function stubTransport() {
  const seen: RequestOptions[] = [];
  const transport: Transport = {
    baseUrl: '',
    authMode: 'cookie',
    async request<T>(options: RequestOptions): Promise<ApertureResponse<T>> {
      seen.push(options);
      return {
        data: undefined as T,
        status: 200,
        headers: new Headers(),
        etag: null,
        contractSkew: 'match',
        attempts: 1,
      };
    },
    async openStream() {
      return { body: null, status: 200, headers: new Headers(), contractSkew: 'match' };
    },
  };
  return { transport, seen };
}

describe('path interpolation', () => {
  it('substitutes and percent-encodes every placeholder', () => {
    expect(interpolatePath('/threads/{threadId}/turns/{turnId}', { threadId: 'a b', turnId: 'x/y' }))
      .toBe('/threads/a%20b/turns/x%2Fy');
  });

  it('throws rather than emitting a literal placeholder for a missing value', () => {
    expect(() => interpolatePath('/threads/{threadId}', {})).toThrow(ApertureConfigError);
    expect(() => interpolatePath('/threads/{threadId}', { threadId: '' })).toThrow(ApertureConfigError);
  });
});

describe('call', () => {
  it('takes the method and path from the generated operation table', async () => {
    const { transport, seen } = stubTransport();
    await call(transport, 'listThreads', { query: { limit: 5 } });
    expect(seen[0]?.method).toBe(OPERATIONS.listThreads.method);
    expect(seen[0]?.path).toBe(OPERATIONS.listThreads.path);
    expect(seen[0]?.query).toEqual({ limit: 5 });
  });

  it('interpolates path parameters declared by the contract', async () => {
    const { transport, seen } = stubTransport();
    await call(transport, 'getThread', { path: { threadId: '01J000' } });
    expect(seen[0]?.path).toBe('/threads/01J000');
  });

  it('forwards the idempotency key and If-Match untouched', async () => {
    const { transport, seen } = stubTransport();
    await call(transport, 'createMessage', {
      path: { threadId: 't1' },
      body: { content: 'hello' },
      idempotencyKey: 'op-1',
    });
    await call(transport, 'replaceSettings', {
      body: { theme: 'system' },
      ifMatch: 'W/"abc"',
    });
    expect(seen[0]?.idempotencyKey).toBe('op-1');
    expect(seen[0]?.method).toBe('POST');
    expect(seen[1]?.ifMatch).toBe('W/"abc"');
  });

  it('binds a transport once through createApiClient', async () => {
    const { transport, seen } = stubTransport();
    const client = createApiClient(transport);
    await client.call('getVersion');
    expect(seen[0]?.path).toBe('/version');
    expect(client.transport).toBe(transport);
  });
});

describe('the generated operation table', () => {
  it('covers every operation with a relative, "/"-rooted path and no origin', () => {
    const entries = Object.entries(OPERATIONS);
    expect(entries.length).toBeGreaterThan(0);
    for (const [operationId, descriptor] of entries) {
      expect(descriptor.path.startsWith('/'), operationId).toBe(true);
      expect(descriptor.path.includes('://'), operationId).toBe(false);
    }
  });
});
