import { describe, it, expect } from 'vitest';
import { agentMemoryOwnerId, isAgentMemoryEnabled } from './agent-memory.js';

describe('isAgentMemoryEnabled', () => {
  it('defaults to active when the flag is unset (undefined metadata)', () => {
    expect(isAgentMemoryEnabled(undefined)).toBe(true);
    expect(isAgentMemoryEnabled(null)).toBe(true);
  });

  it('defaults to active when metadata exists but has no flag', () => {
    expect(isAgentMemoryEnabled({})).toBe(true);
    expect(isAgentMemoryEnabled({ friendly_name: 'Bogdan' })).toBe(true);
  });

  it('is active when explicitly enabled', () => {
    expect(isAgentMemoryEnabled({ long_term_memory_enabled: true })).toBe(true);
  });

  it('is inactive only when explicitly deactivated (=== false)', () => {
    expect(isAgentMemoryEnabled({ long_term_memory_enabled: false })).toBe(false);
  });

  it('treats non-false falsy-ish values as active (only strict false deactivates)', () => {
    // Guards against accidental deactivation from null/0/'' in the flag slot.
    expect(isAgentMemoryEnabled({ long_term_memory_enabled: null })).toBe(true);
    expect(isAgentMemoryEnabled({ long_term_memory_enabled: 0 })).toBe(true);
  });
});

describe('agentMemoryOwnerId', () => {
  it('isolates custom agents by immutable row UUID even when metadata IDs collide', () => {
    expect(agentMemoryOwnerId({ id: 'row-a', metadata: { agent_id: 'collision' } })).toBe('row-a');
    expect(agentMemoryOwnerId({ id: 'row-b', metadata: { agent_id: 'collision' } })).toBe('row-b');
  });

  it('preserves stable predefined catalogue identities across reseeding', () => {
    expect(
      agentMemoryOwnerId({ id: 'new-row', metadata: { agent_id: 'predefined:researcher' } })
    ).toBe('predefined:researcher');
  });
});
