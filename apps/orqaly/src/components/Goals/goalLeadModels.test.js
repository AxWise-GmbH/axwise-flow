/**
 * Tests for the team-lead chat model picker options (MODEL_OPTIONS).
 * The picker must list EVERY provider/model from the shared catalog as a flat
 * list, keep the cheap default first and Consilium last, and carry the
 * { mode, provider, model } shape the request payload builder reads.
 */
import { describe, it, expect } from 'vitest';
import { MODEL_OPTIONS } from './goalLeadModels';
import { MEMBER_PROVIDERS, PROVIDER_MODELS } from '../../services/conciliumMembersService';

describe('GoalLeadChatDialog MODEL_OPTIONS', () => {
  it('pins the cheap default first and Consilium last', () => {
    expect(MODEL_OPTIONS[0]).toMatchObject({
      id: 'cheap',
      mode: 'cheap',
      label: 'Cheap (default) - Gemini 3.8 Flash',
    });
    expect(MODEL_OPTIONS[MODEL_OPTIONS.length - 1]).toMatchObject({
      id: 'consilium',
      mode: 'consilium',
    });
  });

  it('lists every provider/model from the shared catalog as a flat list', () => {
    const expectedModelCount = MEMBER_PROVIDERS.reduce(
      (n, p) => n + (PROVIDER_MODELS[p.value] || []).length,
      0
    );
    const modelEntries = MODEL_OPTIONS.filter((o) => o.mode === 'model');
    expect(modelEntries).toHaveLength(expectedModelCount);

    // Every catalog entry is present with the right provider/model wiring.
    for (const p of MEMBER_PROVIDERS) {
      for (const m of PROVIDER_MODELS[p.value] || []) {
        const opt = MODEL_OPTIONS.find((o) => o.provider === p.value && o.model === m.value);
        expect(opt).toBeTruthy();
        expect(opt.mode).toBe('model');
        expect(opt.label).toBe(`${p.label} - ${m.label}`);
      }
    }
  });

  it('uses unique ids and no em dashes in labels', () => {
    const ids = MODEL_OPTIONS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const o of MODEL_OPTIONS) {
      expect(o.label).not.toMatch(/[—–]/);
    }
  });
});
