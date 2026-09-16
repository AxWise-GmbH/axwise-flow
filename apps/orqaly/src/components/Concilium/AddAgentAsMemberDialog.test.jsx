import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddAgentAsMemberDialog, { agentToMember } from './AddAgentAsMemberDialog';

const getAgents = vi.fn();
const syncAgentsFromSupabase = vi.fn(async () => {});
vi.mock('../../services/agentHubService', () => ({
  getAgents: () => getAgents(),
  syncAgentsFromSupabase: () => syncAgentsFromSupabase(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  getAgents.mockReturnValue([]);
});

describe('agentToMember', () => {
  it('maps an agent to a concilium_members shape with the picked role', () => {
    const m = agentToMember(
      {
        name: 'Morgan',
        role: 'Financial Analyst',
        system_prompt: 'You are Morgan.',
        capabilities: ['finance', 'modeling'],
        provider: 'glm',
        model: 'glm-5.1',
      },
      'specialist'
    );
    expect(m).toMatchObject({
      name: 'Morgan',
      role: 'specialist', // the chosen board role, not the agent's job title
      provider: 'glm',
      model: 'glm-5.1',
      resume: 'You are Morgan.',
      skills: ['finance', 'modeling'],
    });
  });

  it('falls back atomically when the agent provider is not a valid member provider', () => {
    const m = agentToMember({ role: 'X', provider: 'ollama', system_prompt: 's' }, 'evaluator');
    expect(m).toMatchObject({ provider: 'gemini', model: 'gemini-3.8-flash' });
  });

  it('derives a compatible model when the agent only carries a provider', () => {
    const m = agentToMember({ role: 'X', provider: 'glm' }, 'evaluator');
    expect(m).toMatchObject({ provider: 'glm', model: 'glm-5.1' });
  });

  it('supports a legacy LLM connection type when no provider field exists', () => {
    const m = agentToMember({ role: 'X', connection_type: 'openai' }, 'evaluator');
    expect(m).toMatchObject({ provider: 'openai', model: 'gpt-4o-mini' });
  });

  it('infers the provider when the agent only carries a model', () => {
    const m = agentToMember({ role: 'X', model: 'deepseek-reasoner' }, 'evaluator');
    expect(m).toMatchObject({ provider: 'deepseek', model: 'deepseek-reasoner' });
  });

  it('uses the role as name when there is no friendly name, and caps skills at 50', () => {
    const caps = Array.from({ length: 60 }, (_, i) => `skill-${i}`);
    const m = agentToMember({ role: 'Solo', capabilities: caps }, 'observer');
    expect(m.name).toBe('Solo');
    expect(m.skills).toHaveLength(50);
  });
});

describe('AddAgentAsMemberDialog', () => {
  it('adds the selected agent as a member with the default board role', async () => {
    getAgents.mockReturnValue([
      {
        agent_id: 'a1',
        name: 'AI Engineer',
        role: 'Backend Dev',
        system_prompt: 'sp',
        capabilities: [],
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        availability_status: 'available',
      },
    ]);
    const onAdd = vi.fn(async () => {});
    const onClose = vi.fn();
    render(<AddAgentAsMemberDialog open onClose={onClose} onAdd={onAdd} existingNames={[]} />);

    fireEvent.click(await screen.findByText('AI Engineer'));
    fireEvent.click(screen.getByRole('button', { name: /Add \(1\)/ }));

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(onAdd.mock.calls[0][0]).toMatchObject({
      name: 'AI Engineer',
      role: 'evaluator',
      provider: 'groq',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('excludes agents that are already members (by name)', async () => {
    getAgents.mockReturnValue([
      {
        agent_id: 'a1',
        name: 'AI Engineer',
        role: 'AI Engineer',
        availability_status: 'available',
      },
    ]);
    render(
      <AddAgentAsMemberDialog
        open
        onClose={() => {}}
        onAdd={vi.fn()}
        existingNames={['AI Engineer']}
      />
    );
    expect(await screen.findByText(/No eligible agents/i)).toBeInTheDocument();
  });
});
