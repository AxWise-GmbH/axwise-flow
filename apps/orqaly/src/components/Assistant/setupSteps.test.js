import { describe, it, expect } from 'vitest';
import { ASSISTANT_SETUP_STEPS } from './setupSteps';

// The drawer and wizard tests both vi.mock this module with their own fixtures,
// so nothing else guards the real array. Order is product-visible (it is the
// Simple mode Home menu, top to bottom) and `keys` must lead as the activation
// gate, so both are asserted here.
describe('ASSISTANT_SETUP_STEPS', () => {
  it('keeps the persisted step ids in the Home menu order', () => {
    expect(ASSISTANT_SETUP_STEPS.map((s) => s.key)).toEqual([
      'keys',
      'data',
      'brief',
      'insights',
      'channel',
      'voice',
    ]);
  });

  it('renders the Core-first labels the Home menu shows', () => {
    expect(ASSISTANT_SETUP_STEPS.map((s) => s.short)).toEqual([
      'Core',
      'Data',
      'Brief',
      'Insights',
      'Channel',
      'Voice',
    ]);
  });

  it('gates activation on `keys` alone, and keeps it first', () => {
    const required = ASSISTANT_SETUP_STEPS.filter((s) => s.required);
    expect(required.map((s) => s.key)).toEqual(['keys']);
    expect(ASSISTANT_SETUP_STEPS[0].key).toBe('keys');
  });

  it('no longer calls the Core step "brain" in user-facing copy', () => {
    for (const step of ASSISTANT_SETUP_STEPS) {
      expect(step.short).not.toMatch(/brain/i);
      expect(step.label).not.toMatch(/brain/i);
      expect(step.desc).not.toMatch(/brain/i);
    }
  });

  it('gives every step the fields the drawer and wizard render', () => {
    for (const step of ASSISTANT_SETUP_STEPS) {
      expect(step.key).toBeTruthy();
      expect(step.label).toBeTruthy();
      expect(step.short).toBeTruthy();
      expect(step.desc).toBeTruthy();
      expect(step.icon).toBeTruthy();
      expect(step.Card).toBeTruthy();
    }
  });
});
