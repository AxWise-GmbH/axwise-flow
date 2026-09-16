import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const maybeSingleMock = vi.fn();
const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock('../../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: () => ({ from: fromMock }),
}));

import {
  presetToProvider,
  resolveUserLlmPreset,
  _clearLlmPresetCache,
} from './resolve-user-llm-preset.js';

describe('resolve-user-llm-preset', () => {
  beforeEach(() => {
    delete process.env.LLM_DEFAULT_PROVIDER;
    delete process.env.LLM_DEFAULT_MODEL;
    _clearLlmPresetCache();
    maybeSingleMock.mockReset();
    eqMock.mockClear();
    selectMock.mockClear();
    fromMock.mockClear();
  });

  afterEach(() => {
    delete process.env.LLM_DEFAULT_PROVIDER;
    delete process.env.LLM_DEFAULT_MODEL;
  });

  it('routes known presets through the runtime default provider+model', () => {
    expect(presetToProvider('cheapest')).toEqual({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
    });
    expect(presetToProvider('smartest')).toEqual({ provider: 'gemini', model: 'gemini-3.8-flash' });
    expect(presetToProvider('fastest')).toEqual({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
    });
  });

  it('returns null for unknown or empty presets', () => {
    expect(presetToProvider(null)).toBeNull();
    expect(presetToProvider(undefined)).toBeNull();
    expect(presetToProvider('bogus')).toBeNull();
  });

  it('routes every preset through an operator-configured Gemini pair', () => {
    process.env.LLM_DEFAULT_PROVIDER = 'gemini';
    process.env.LLM_DEFAULT_MODEL = 'gemini-3.8-flash';

    expect(presetToProvider('cheapest')).toEqual({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
    });
    expect(presetToProvider('smartest')).toEqual({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
    });
    expect(presetToProvider('fastest')).toEqual({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
    });
  });

  it('returns null when userId is empty without hitting DB', async () => {
    const result = await resolveUserLlmPreset(null);
    expect(result).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('looks up preset for a user and caches the result', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { default_llm_preset: 'smartest' } });

    const first = await resolveUserLlmPreset('user-1');
    expect(first).toEqual({ provider: 'gemini', model: 'gemini-3.8-flash' });
    expect(fromMock).toHaveBeenCalledTimes(1);

    // Second call uses the cache - DB is NOT hit again.
    const second = await resolveUserLlmPreset('user-1');
    expect(second).toEqual({ provider: 'gemini', model: 'gemini-3.8-flash' });
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it('returns null and caches the negative when user has no preset', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { default_llm_preset: null } });
    const result = await resolveUserLlmPreset('user-empty');
    expect(result).toBeNull();
  });

  it('fails open when the DB throws', async () => {
    maybeSingleMock.mockRejectedValueOnce(new Error('connection refused'));
    const result = await resolveUserLlmPreset('user-down');
    expect(result).toBeNull();
  });
});
