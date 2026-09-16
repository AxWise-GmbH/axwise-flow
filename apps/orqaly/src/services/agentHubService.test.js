import { beforeEach, describe, expect, it } from 'vitest';
import {
  addAgent,
  applyBlueprintLlm,
  getAgents,
  repairAgentProviderFields,
  supabaseToLocal,
  updateAgent,
} from './agentHubService.js';

beforeEach(() => window.localStorage.clear());

// The blueprint is the source of truth for an agent's LLM. applyBlueprintLlm
// projects the blueprint's provider/model onto the agent, overriding the
// stale `agents.metadata` copy that the cards render.
describe('applyBlueprintLlm', () => {
  const blueprintMap = {
    'bp-1': { provider: 'gemini', model: 'gemini-3.5-flash' },
    'bp-2': { provider: 'anthropic', model: 'claude-opus-5' },
  };

  it('overrides stale metadata provider/model from the blueprint', () => {
    const agents = [{ id: 'a1', blueprint_id: 'bp-1', provider: 'glm', model: 'glm-5.1' }];
    const [out] = applyBlueprintLlm(agents, blueprintMap);
    expect(out.provider).toBe('gemini');
    expect(out.model).toBe('gemini-3.5-flash');
  });

  it('leaves agents whose blueprint is not in the map unchanged', () => {
    const agents = [{ id: 'a2', blueprint_id: 'bp-missing', provider: 'glm', model: 'glm-5.1' }];
    const [out] = applyBlueprintLlm(agents, blueprintMap);
    expect(out.provider).toBe('glm');
    expect(out.model).toBe('glm-5.1');
  });

  it('leaves agents with no blueprint_id unchanged', () => {
    const agents = [{ id: 'a3', provider: 'groq', model: 'llama-3.3-70b-versatile' }];
    const [out] = applyBlueprintLlm(agents, blueprintMap);
    expect(out.provider).toBe('groq');
    expect(out.model).toBe('llama-3.3-70b-versatile');
  });

  it('completes an incomplete blueprint pair without mixing in stale agent metadata', () => {
    const agents = [{ id: 'a4', blueprint_id: 'bp-3', provider: 'glm', model: 'glm-4' }];
    const [out] = applyBlueprintLlm(agents, { 'bp-3': { provider: 'openai', model: '' } });
    expect(out.provider).toBe('openai');
    expect(out.model).toBe('gpt-4o-mini');
  });

  it('infers the provider from a model-only blueprint', () => {
    const agents = [{ id: 'a6', blueprint_id: 'bp-4', provider: 'glm', model: 'glm-4' }];
    const [out] = applyBlueprintLlm(agents, { 'bp-4': { model: 'claude-haiku-4-5' } });
    expect(out).toMatchObject({ provider: 'anthropic', model: 'claude-haiku-4-5' });
  });

  it('is a no-op when the blueprint map is missing', () => {
    const agents = [{ id: 'a5', blueprint_id: 'bp-1', provider: 'glm', model: 'glm-5.1' }];
    expect(applyBlueprintLlm(agents, null)).toBe(agents);
  });
});

describe('repairAgentProviderFields', () => {
  it('repairs an incomplete legacy provider/model pair atomically', () => {
    window.localStorage.setItem(
      'orch_agent_hub_agents_v1',
      JSON.stringify([{ id: 'legacy', provider: 'glm', connection_type: 'glm' }])
    );

    repairAgentProviderFields();

    expect(getAgents()[0]).toMatchObject({
      provider: 'glm',
      model: 'glm-5.1',
      connection_type: 'glm',
    });
  });

  it('preserves a complete explicit provider/model pair', () => {
    window.localStorage.setItem(
      'orch_agent_hub_agents_v1',
      JSON.stringify([
        {
          id: 'explicit',
          provider: 'anthropic',
          model: 'claude-sonnet-5',
          connection_type: 'anthropic',
        },
      ])
    );

    repairAgentProviderFields();

    expect(getAgents()[0]).toMatchObject({
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      connection_type: 'anthropic',
    });
  });

  it('preserves a non-LLM connection type on a complete explicit pair', () => {
    window.localStorage.setItem(
      'orch_agent_hub_agents_v1',
      JSON.stringify([
        {
          id: 'api-agent',
          provider: 'openai',
          model: 'gpt-4.1-mini',
          connection_type: 'api',
        },
      ])
    );

    repairAgentProviderFields();

    expect(getAgents()[0]).toMatchObject({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      connection_type: 'api',
    });
  });
});

describe('Supabase agent upgrade mapping', () => {
  it('preserves a legacy custom agent_id while exposing the immutable row ID separately', () => {
    const upgraded = supabaseToLocal({
      id: 'row-custom-1',
      name: 'Researcher',
      status: 'active',
      metadata: {
        local_id: 'local-custom-1',
        agent_id: 'legacy-custom-agent-id',
      },
    });

    expect(upgraded).toMatchObject({
      id: 'local-custom-1',
      agent_id: 'legacy-custom-agent-id',
      _supabase_id: 'row-custom-1',
    });
  });
});

describe('addAgent', () => {
  it('uses the atomic platform pair when no complete LLM choice is supplied', () => {
    const agent = addAgent({ role: 'API operator', connection_type: 'api' });

    expect(agent).toMatchObject({
      connection_type: 'api',
      provider: 'gemini',
      model: 'gemini-3.8-flash',
    });
  });

  it('preserves a complete explicit provider/model choice', () => {
    const agent = addAgent({
      role: 'Custom editor',
      connection_type: 'anthropic',
      provider: 'anthropic',
      model: 'claude-sonnet-5',
    });

    expect(agent).toMatchObject({
      connection_type: 'anthropic',
      provider: 'anthropic',
      model: 'claude-sonnet-5',
    });
  });

  it('completes a provider-only choice without mixing in the platform model', () => {
    const agent = addAgent({ role: 'OpenAI operator', provider: 'openai' });
    expect(agent).toMatchObject({ provider: 'openai', model: 'gpt-4o-mini' });
  });

  it('honours a legacy LLM connection type as a provider-only choice', () => {
    const agent = addAgent({ role: 'GLM operator', connection_type: 'glm' });
    expect(agent).toMatchObject({
      connection_type: 'glm',
      provider: 'glm',
      model: 'glm-5.1',
    });
  });

  it('infers the provider for a model-only choice', () => {
    const agent = addAgent({ role: 'Reasoner', model: 'deepseek-reasoner' });
    expect(agent).toMatchObject({ provider: 'deepseek', model: 'deepseek-reasoner' });
  });
});

describe('updateAgent', () => {
  it('changes a provider and its default model atomically', () => {
    const agent = addAgent({ role: 'Editor', provider: 'glm', model: 'glm-5.1' });
    const updated = updateAgent(agent.id, { provider: 'openai' });
    expect(updated).toMatchObject({ provider: 'openai', model: 'gpt-4o-mini' });
  });

  it('infers a provider when only a model is updated', () => {
    const agent = addAgent({ role: 'Editor', provider: 'glm', model: 'glm-5.1' });
    const updated = updateAgent(agent.id, { model: 'claude-haiku-4-5' });
    expect(updated).toMatchObject({ provider: 'anthropic', model: 'claude-haiku-4-5' });
  });
});
