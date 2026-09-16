import { describe, it, expect } from 'vitest';
import { agentMemoryOwnerId, isAgentMemoryEnabled } from './agentMemory.js';

describe('isAgentMemoryEnabled (frontend)', () => {
  it('defaults to active when metadata or flag is absent', () => {
    expect(isAgentMemoryEnabled(undefined)).toBe(true);
    expect(isAgentMemoryEnabled(null)).toBe(true);
    expect(isAgentMemoryEnabled({})).toBe(true);
  });

  it('is active when explicitly enabled', () => {
    expect(isAgentMemoryEnabled({ long_term_memory_enabled: true })).toBe(true);
  });

  it('is inactive only when explicitly deactivated (=== false)', () => {
    expect(isAgentMemoryEnabled({ long_term_memory_enabled: false })).toBe(false);
  });

  it('drives the agents-page memory filter predicate', () => {
    const agents = [
      { id: 'a', metadata: {} }, // active by default
      { id: 'b', metadata: { long_term_memory_enabled: true } }, // active
      { id: 'c', metadata: { long_term_memory_enabled: false } }, // deactivated
      { id: 'd' }, // no metadata → active
    ];
    const filterBy = (memoryFilter) =>
      agents
        .filter((a) => isAgentMemoryEnabled(a.metadata) === (memoryFilter === 'On'))
        .map((a) => a.id);

    expect(filterBy('On')).toEqual(['a', 'b', 'd']);
    expect(filterBy('Off')).toEqual(['c']);
  });
});

describe('agentMemoryOwnerId (frontend)', () => {
  it('uses the persisted row ID for colliding custom metadata IDs', () => {
    expect(
      agentMemoryOwnerId({ _supabase_id: 'row-a', agent_id: 'collision', id: 'local-a' })
    ).toBe('row-a');
    expect(
      agentMemoryOwnerId({ _supabase_id: 'row-b', agent_id: 'collision', id: 'local-b' })
    ).toBe('row-b');
  });

  it('preserves predefined catalogue IDs', () => {
    expect(agentMemoryOwnerId({ _supabase_id: 'row-new', agent_id: 'predefined:researcher' })).toBe(
      'predefined:researcher'
    );
  });
});
