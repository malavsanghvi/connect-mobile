import { afterEach, describe, expect, it, jest } from '@jest/globals';

import {
  auditReasonHeader,
  createTracingFetch,
  getClientContext,
  isRestRequest,
  newRequestId,
  screenHeaderValue,
  setClientApp,
  setClientScreen,
  traceHeaders,
  withAuditReason,
} from '../request-context';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BASE = 'https://abc.supabase.co';

afterEach(() => {
  setClientApp('member');
  setClientScreen('');
});

describe('newRequestId', () => {
  it('returns a v4 uuid', () => {
    expect(newRequestId()).toMatch(UUID);
    expect(newRequestId(() => new Uint8Array(16))).toBe('00000000-0000-4000-8000-000000000000');
    expect(newRequestId(() => new Uint8Array(16).fill(255))).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });
  it('is fresh every time', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newRequestId()));
    expect(ids.size).toBe(50);
  });
});

describe('header values', () => {
  it('encodes and caps the screen', () => {
    expect(screenHeaderValue('/event/123/tickets')).toBe('/event/123/tickets');
    expect(screenHeaderValue('/guide/સમય')).toBe('/guide/%E0%AA%B8%E0%AA%AE%E0%AA%AF');
    expect(screenHeaderValue(`/${'a'.repeat(300)}`)).toHaveLength(200);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(screenHeaderValue('/bad\ud800')).toBe('/bad');
    expect(spy).toHaveBeenCalledTimes(1); // the fallback is logged, never silent
    spy.mockRestore();
  });
  it('trims, caps at 500 characters and url-encodes the reason', () => {
    expect(auditReasonHeader('  ')).toBeNull();
    expect(auditReasonHeader(null)).toBeNull();
    expect(auditReasonHeader(" We can't   make it \n")).toBe(encodeURIComponent("We can't make it"));
    expect(decodeURIComponent(auditReasonHeader('x'.repeat(900)) ?? '')).toHaveLength(500);
    expect(decodeURIComponent(auditReasonHeader('જય જિનેન્દ્ર') ?? '')).toBe('જય જિનેન્દ્ર');
  });
});

describe('context', () => {
  it('tracks the screen and kiosk mode', () => {
    setClientScreen('/volunteer');
    setClientApp('kiosk');
    expect(getClientContext()).toEqual({ app: 'kiosk', screen: '/volunteer' });
    expect(traceHeaders(getClientContext(), 'id-1')).toEqual({ 'x-client-app': 'kiosk', 'x-request-id': 'id-1', 'x-client-screen': '/volunteer' });
    setClientApp('member');
    setClientScreen(null);
    expect(traceHeaders(getClientContext(), 'id-2')).toEqual({ 'x-client-app': 'member', 'x-request-id': 'id-2' });
  });
});

describe('createTracingFetch', () => {
  type Call = [RequestInfo | URL, RequestInit | undefined];
  const makeFetch = () => {
    const calls: Call[] = [];
    const fn = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([input, init]);
      return new Response('[]');
    });
    return { fn, calls };
  };

  it('recognises PostgREST urls only', () => {
    expect(isRestRequest(`${BASE}/rest/v1/events?select=*`, BASE)).toBe(true);
    expect(isRestRequest(`${BASE}/rest/v1/rpc/my_modules`, `${BASE}/`)).toBe(true);
    expect(isRestRequest(`${BASE}/auth/v1/token`, BASE)).toBe(false);
    expect(isRestRequest(`${BASE}/functions/v1/pay`, BASE)).toBe(false);
    expect(isRestRequest(`${BASE}/storage/v1/object/x`, BASE)).toBe(false);
  });

  it('adds the trace headers to PostgREST calls, a new request id each time', async () => {
    const { fn, calls } = makeFetch();
    const traced = createTracingFetch(BASE, () => fn);
    setClientScreen('/event/1/confirm');
    await traced(`${BASE}/rest/v1/rsvps?id=eq.1`, { method: 'PATCH', headers: { apikey: 'k', 'x-audit-reason': 'why' } });
    await traced(`${BASE}/rest/v1/rsvps?id=eq.1`, { method: 'PATCH' });
    const h1 = new Headers(calls[0][1]?.headers);
    const h2 = new Headers(calls[1][1]?.headers);
    expect(h1.get('apikey')).toBe('k');
    expect(h1.get('x-audit-reason')).toBe('why');
    expect(h1.get('x-client-app')).toBe('member');
    expect(h1.get('x-client-screen')).toBe('/event/1/confirm');
    expect(h1.get('x-request-id')).toMatch(UUID);
    expect(h2.get('x-request-id')).toMatch(UUID);
    expect(h2.get('x-request-id')).not.toBe(h1.get('x-request-id'));
    expect(h2.get('x-audit-reason')).toBeNull();
    expect(calls[0][1]?.method).toBe('PATCH');
  });

  it('passes auth, storage and function calls through untouched', async () => {
    const { fn, calls } = makeFetch();
    const traced = createTracingFetch(BASE, () => fn);
    const init = { method: 'POST', headers: { apikey: 'k' } };
    await traced(`${BASE}/functions/v1/pay`, init);
    expect(calls[0][1]).toBe(init);
  });

  it('sends kiosk while the volunteer board is in kiosk mode', async () => {
    const { fn, calls } = makeFetch();
    const traced = createTracingFetch(BASE, () => fn);
    setClientApp('kiosk');
    await traced(new URL(`${BASE}/rest/v1/rpc/check_in`), { method: 'POST' });
    expect(new Headers(calls[0][1]?.headers).get('x-client-app')).toBe('kiosk');
  });
});

describe('withAuditReason', () => {
  it('sets the header only when there is a reason', () => {
    const q = { headers: {} as Record<string, string>, setHeader(name: string, value: string) { this.headers[name] = value; return this; } };
    withAuditReason(q, '');
    expect(q.headers).toEqual({});
    expect(withAuditReason(q, "We can't make it")).toBe(q);
    expect(q.headers).toEqual({ 'x-audit-reason': encodeURIComponent("We can't make it") });
  });
});
