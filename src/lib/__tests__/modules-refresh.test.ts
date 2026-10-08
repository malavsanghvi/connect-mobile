import { describe, expect, it, jest } from '@jest/globals';

import { loadModuleSettings, type ModuleSettings } from '../api/modules';
import { nextModuleSettings } from '../modules';

const mockRpc = jest.fn<(name: string, args: unknown) => Promise<{ data: unknown; error: unknown }>>();

jest.mock('../supabase', () => ({
  supabase: { rpc: (name: string, args: unknown) => mockRpc(name, args) },
}));

const good: ModuleSettings = { map: { store: false, bolis: false }, labels: {} };

describe('holding the modules after a refresh', () => {
  it('keeps the last good answer when a refresh fails, so a switched-off module stays off', () => {
    const held = nextModuleSettings<ModuleSettings>(null, 'c1', good);
    const after = nextModuleSettings(held, 'c1', { map: {}, labels: {}, failed: true });
    expect(after).toBe(held);
    expect(after.value.map).toEqual({ store: false, bolis: false });
  });

  it('lets the first read of a community fall back to the built-in answer when it fails', () => {
    expect(nextModuleSettings(null, 'c1', { map: {}, labels: {}, failed: true }).value.failed).toBe(true);
    // and a failed read of another community is not answered with the first one's modules
    const other = nextModuleSettings(nextModuleSettings(null, 'c1', good), 'c2', { map: {}, labels: {}, failed: true });
    expect(other.centerId).toBe('c2');
    expect(other.value.map).toEqual({});
  });

  it('takes a good answer over an older one, and keeps the object when nothing changed', () => {
    const held = nextModuleSettings(null, 'c1', good);
    expect(nextModuleSettings(held, 'c1', { map: { store: false, bolis: false }, labels: {} })).toBe(held);
    expect(nextModuleSettings(held, 'c1', { map: { store: true }, labels: {} }).value.map).toEqual({ store: true });
  });
});

describe('reading my_modules', () => {
  it('marks a failed read as failed (and a good one not)', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '57014', message: 'statement timeout' } });
    expect((await loadModuleSettings('c1')).failed).toBe(true);
    mockRpc.mockRejectedValueOnce(new TypeError('Network request failed'));
    expect((await loadModuleSettings('c1')).failed).toBe(true);
    mockRpc.mockResolvedValueOnce({ data: [{ key: 'store', label: 'Store', enabled: false, core: false }], error: null });
    const ok = await loadModuleSettings('c1');
    expect(ok.failed).toBeUndefined();
    expect(ok.map).toEqual({ store: false });
    log.mockRestore();
  });
});
