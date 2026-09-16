import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

const importLibrary = vi.fn();
const importItems = vi.fn();
const removeLibrary = vi.fn();
const addCustomLibrary = vi.fn();
const fetchGithubAgents = vi.fn();
const materializeImportedAgents = vi.fn();
let importedSources = [];
let importedItems = [];

vi.mock('../../hooks/useImportedLibraries', () => ({
  default: () => ({
    importedSources,
    importedItems,
    importLibrary,
    importItems,
    removeLibrary,
    addCustomLibrary,
  }),
}));

vi.mock('../../services/githubAgentsService', () => ({
  fetchGithubAgents: (...args) => fetchGithubAgents(...args),
}));

vi.mock('../../services/agentImportMaterializer', () => ({
  materializeImportedAgents: (...args) => materializeImportedAgents(...args),
}));

const ImportLibraryDialog = (await import('./ImportLibraryDialog')).default;
const { ImportFromButton, resolveImportedAgentLlm } = await import('./ImportLibraryDialog');

beforeEach(() => {
  vi.clearAllMocks();
  importedSources = [];
  importedItems = [];
  importLibrary.mockResolvedValue(undefined);
  importItems.mockResolvedValue(undefined);
  removeLibrary.mockResolvedValue(undefined);
  addCustomLibrary.mockResolvedValue({ ok: true });
  materializeImportedAgents.mockResolvedValue({ createdCount: 1 });
  fetchGithubAgents.mockResolvedValue({
    repo: {
      owner: 'msitarzewski',
      repo: 'agency-agents',
      fullName: 'msitarzewski/agency-agents',
      url: 'https://github.com/msitarzewski/agency-agents',
    },
    items: [
      {
        _id: 'engineering-eng-ai-md',
        name: 'AI Engineer',
        role: 'AI Engineer',
        description: 'Builds ML',
        category: 'Engineering',
        connection_type: 'groq',
        model: 'llama-3.3-70b-versatile',
        cost_per_task: 0,
        tools: [],
        system_prompt: 'You are an AI Engineer. Do great ML work.',
        _source: 'github',
      },
    ],
    total: 1,
    offset: 0,
    limit: 30,
    hasMore: false,
    rejected: 0,
    truncated: false,
    warnings: [],
  });
});

describe('resolveImportedAgentLlm', () => {
  it('derives a compatible default for a provider-only import', () => {
    expect(resolveImportedAgentLlm([{ connection_type: 'glm' }])).toEqual({
      provider: 'glm',
      model: 'glm-5.1',
    });
  });

  it('infers the provider for a model-only import', () => {
    expect(resolveImportedAgentLlm([{ model: 'gpt-4o' }])).toEqual({
      provider: 'openai',
      model: 'gpt-4o',
    });
  });

  it('does not treat a transport connection type as an LLM provider', () => {
    expect(resolveImportedAgentLlm([{ connection_type: 'api' }])).toEqual({
      provider: 'gemini',
      model: 'gemini-3.8-flash',
    });
  });

  it('lets a recognized model identify the provider ahead of legacy connection metadata', () => {
    expect(resolveImportedAgentLlm([{ connection_type: 'glm', model: 'gpt-4o' }])).toEqual({
      provider: 'openai',
      model: 'gpt-4o',
    });
  });
});

describe('ImportLibraryDialog', () => {
  it('renders curated libraries for the category on the Browse tab by default', () => {
    render(<ImportLibraryDialog open category="agents" onClose={() => {}} />);
    expect(screen.getByRole('tab', { name: 'Browse', selected: true })).toBeInTheDocument();
    expect(screen.getByText('OpenAI Agents SDK Examples')).toBeInTheDocument();
    expect(screen.getByText('Anthropic Cookbook Agents')).toBeInTheDocument();
  });

  it('imports a whole library on Import all click', async () => {
    const onImported = vi.fn();
    render(
      <ImportLibraryDialog open category="agents" onClose={() => {}} onImported={onImported} />
    );
    const importButtons = screen.getAllByRole('button', { name: 'Import all' });
    fireEvent.click(importButtons[0]);
    await waitFor(() => expect(importLibrary).toHaveBeenCalled());
    expect(onImported).toHaveBeenCalled();
  });

  it('shows the imported count and a Remove button when a library is imported', () => {
    importedSources = [
      {
        id: 'row1',
        sourceId: 'openai-agents-sdk',
        name: 'OpenAI Agents SDK Examples',
        itemCount: 3,
      },
    ];
    render(<ImportLibraryDialog open category="agents" onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.getByText(/of 3 imported/i)).toBeInTheDocument();
  });

  it('searches individual items across libraries and imports the selected ones', async () => {
    render(<ImportLibraryDialog open category="agents" onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: 'Guardrail' } });
    // matching item surfaces as a selectable row
    const checkbox = await screen.findByLabelText('Select Guardrail Agent');
    fireEvent.click(checkbox);
    const importSelected = screen.getByRole('button', { name: /Import selected \(1\)/ });
    fireEvent.click(importSelected);
    await waitFor(() => expect(importItems).toHaveBeenCalled());
    const [lib, items] = importItems.mock.calls[0];
    expect(lib.id).toBe('openai-agents-sdk');
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe('Guardrail Agent');
  });

  it('toggles selection by clicking anywhere on the item row', async () => {
    render(<ImportLibraryDialog open category="agents" onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: 'Guardrail' } });
    // Click the item name (row), not the checkbox itself.
    fireEvent.click(await screen.findByText('Guardrail Agent'));
    expect(screen.getByLabelText('Select Guardrail Agent')).toBeChecked();
    expect(screen.getByRole('button', { name: /Import selected \(1\)/ })).toBeInTheDocument();
  });

  it('finds items by their library name (broadened search)', () => {
    render(<ImportLibraryDialog open category="agents" onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: 'Anthropic' } });
    // "Anthropic Cookbook Agents" library -> its items surface even though the
    // item names do not contain "Anthropic".
    expect(screen.getByLabelText('Select Orchestrator Agent')).toBeInTheDocument();
  });

  it('shows a no-match message when the search finds nothing', () => {
    render(<ImportLibraryDialog open category="agents" onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Search items'), {
      target: { value: 'zzz-nothing-here' },
    });
    expect(screen.getByText(/No items match/i)).toBeInTheDocument();
  });

  it('marks already-imported items and excludes them from selection', () => {
    importedItems = [
      { _sourceId: 'openai-agents-sdk', _id: 'oai-guardrail', name: 'Guardrail Agent' },
    ];
    render(<ImportLibraryDialog open category="agents" onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: 'Guardrail' } });
    const checkbox = screen.getByLabelText('Select Guardrail Agent');
    expect(checkbox).toBeDisabled();
    expect(checkbox).toBeChecked();
  });

  it('does not lose a manually-opened card when the search that opened it is cleared', async () => {
    render(<ImportLibraryDialog open category="agents" onClose={() => {}} />);
    // Open a card manually while there is no search filtering it.
    fireEvent.click(screen.getByText('OpenAI Agents SDK Examples'));
    expect(await screen.findByLabelText('Select Guardrail Agent')).toBeInTheDocument();
    // Typing and clearing an unrelated search must not silently collapse it.
    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: 'Anthropic' } });
    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: '' } });
    expect(screen.getByLabelText('Select Guardrail Agent')).toBeInTheDocument();
  });

  it('register button is disabled until a name is entered', async () => {
    render(<ImportLibraryDialog open category="agents" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Custom' }));
    const register = await screen.findByRole('button', { name: 'Register' });
    expect(register).toBeDisabled();
  });

  it('registers a custom library', async () => {
    render(<ImportLibraryDialog open category="agents" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Custom' }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'My Lib' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    await waitFor(() => expect(addCustomLibrary).toHaveBeenCalled());
  });

  it('shows the form error when registration fails', async () => {
    addCustomLibrary.mockResolvedValue({ ok: false, error: 'Bad JSON' });
    render(<ImportLibraryDialog open category="agents" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Custom' }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'My Lib' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));
    await waitFor(() => expect(screen.getByText('Bad JSON')).toBeInTheDocument());
  });

  it('opens the how-to popover from the header icon', () => {
    render(<ImportLibraryDialog open category="agents" onClose={() => {}} />);
    expect(screen.queryByText(/in this tab tagged/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'How to import' }));
    expect(screen.getByText(/in this tab tagged/i)).toBeInTheDocument();
  });

  it('discovers and imports agents from a GitHub repo', async () => {
    render(<ImportLibraryDialog open category="agents" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'GitHub' }));
    fireEvent.change(screen.getByLabelText('GitHub repository URL'), {
      target: { value: 'https://github.com/msitarzewski/agency-agents' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Fetch agents/i }));
    await waitFor(() => expect(fetchGithubAgents).toHaveBeenCalled());
    // The discovered agent renders as a selectable row.
    fireEvent.click(await screen.findByLabelText('Select AI Engineer'));
    // Exactly one "Import selected" action exists anywhere in the dialog now
    // (the footer) - no more duplicate button to work around.
    expect(screen.getAllByRole('button', { name: /Import selected \(1\)/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Import selected \(1\)/ }));
    await waitFor(() => expect(importItems).toHaveBeenCalled());
    const [lib, items] = importItems.mock.calls[0];
    expect(lib.id).toBe('github:msitarzewski/agency-agents');
    expect(items[0].name).toBe('AI Engineer');
  });

  it('auto-activates GitHub-imported agents into Agent Hub on import', async () => {
    render(<ImportLibraryDialog open category="agents" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'GitHub' }));
    fireEvent.change(screen.getByLabelText('GitHub repository URL'), {
      target: { value: 'https://github.com/msitarzewski/agency-agents' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Fetch agents/i }));
    fireEvent.click(await screen.findByLabelText('Select AI Engineer'));
    fireEvent.click(screen.getByRole('button', { name: /Import selected \(1\)/ }));

    await waitFor(() => expect(materializeImportedAgents).toHaveBeenCalled());
    const [items] = materializeImportedAgents.mock.calls[0];
    expect(items[0].name).toBe('AI Engineer');
    expect(items[0]._sourceName).toBe('msitarzewski/agency-agents'); // provenance carried
  });

  it('shows a warning when the GitHub repo has no agents', async () => {
    fetchGithubAgents.mockResolvedValue({
      repo: { owner: 'o', repo: 'r', fullName: 'o/r', url: 'https://github.com/o/r' },
      items: [],
      total: 0,
      offset: 0,
      limit: 30,
      hasMore: false,
      rejected: 0,
      truncated: false,
      warnings: ['No agents found.'],
    });
    render(<ImportLibraryDialog open category="agents" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'GitHub' }));
    fireEvent.change(screen.getByLabelText('GitHub repository URL'), {
      target: { value: 'https://github.com/o/r' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Fetch agents/i }));
    await waitFor(() => expect(screen.getByText('No agents found.')).toBeInTheDocument());
  });

  const threeAgentRepo = {
    repo: { owner: 'o', repo: 'r', fullName: 'o/r', url: 'https://github.com/o/r' },
    items: [
      {
        _id: 'a',
        name: 'AI Engineer',
        role: 'AI Engineer',
        description: 'ML',
        category: 'Engineering',
        _source: 'github',
        system_prompt: 'x',
      },
      {
        _id: 'b',
        name: 'Financial Analyst',
        role: 'Financial Analyst',
        description: 'Finance',
        category: 'Finance',
        _source: 'github',
        system_prompt: 'y',
      },
      {
        _id: 'c',
        name: 'Roblox Designer',
        role: 'Roblox Designer',
        description: 'Games',
        category: 'Game Development',
        _source: 'github',
        system_prompt: 'z',
      },
    ],
    total: 3,
    offset: 0,
    limit: 100,
    hasMore: false,
    rejected: 0,
    truncated: false,
    warnings: [],
  };

  it('filters fetched GitHub agents client-side with no extra server calls', async () => {
    fetchGithubAgents.mockResolvedValue(threeAgentRepo);
    render(<ImportLibraryDialog open category="agents" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'GitHub' }));
    fireEvent.change(screen.getByLabelText('GitHub repository URL'), {
      target: { value: 'https://github.com/o/r' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Fetch agents/i }));
    await screen.findByLabelText('Select Roblox Designer');
    const callsAfterFetch = fetchGithubAgents.mock.calls.length;

    fireEvent.change(screen.getByLabelText('Search fetched agents'), {
      target: { value: 'roblox' },
    });

    // Only the matching row remains, and the server was NOT called again.
    expect(screen.getByLabelText('Select Roblox Designer')).toBeInTheDocument();
    expect(screen.queryByLabelText('Select AI Engineer')).not.toBeInTheDocument();
    expect(fetchGithubAgents.mock.calls.length).toBe(callsAfterFetch);
  });

  it('clearing the GitHub search restores the full list (client-side)', async () => {
    fetchGithubAgents.mockResolvedValue(threeAgentRepo);
    render(<ImportLibraryDialog open category="agents" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'GitHub' }));
    fireEvent.change(screen.getByLabelText('GitHub repository URL'), {
      target: { value: 'https://github.com/o/r' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Fetch agents/i }));
    await screen.findByLabelText('Select AI Engineer');

    fireEvent.change(screen.getByLabelText('Search fetched agents'), {
      target: { value: 'roblox' },
    });
    expect(screen.queryByLabelText('Select AI Engineer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Clear search'));
    expect(screen.getByLabelText('Select AI Engineer')).toBeInTheDocument();
  });

  it('auto-loads every page of a multi-page repo so the full list is searchable', async () => {
    fetchGithubAgents
      .mockResolvedValueOnce({
        repo: { owner: 'o', repo: 'r', fullName: 'o/r', url: 'https://github.com/o/r' },
        items: [
          {
            _id: 'a',
            name: 'Agent A',
            role: 'Agent A',
            description: '',
            category: 'X',
            _source: 'github',
            system_prompt: 'x',
          },
        ],
        total: 2,
        offset: 0,
        limit: 1,
        hasMore: true,
        rejected: 0,
        truncated: false,
        warnings: [],
      })
      .mockResolvedValueOnce({
        repo: { owner: 'o', repo: 'r', fullName: 'o/r', url: 'https://github.com/o/r' },
        items: [
          {
            _id: 'b',
            name: 'Agent B',
            role: 'Agent B',
            description: '',
            category: 'X',
            _source: 'github',
            system_prompt: 'y',
          },
        ],
        total: 2,
        offset: 1,
        limit: 1,
        hasMore: false,
        rejected: 0,
        truncated: false,
        warnings: [],
      });
    render(<ImportLibraryDialog open category="agents" onClose={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: 'GitHub' }));
    fireEvent.change(screen.getByLabelText('GitHub repository URL'), {
      target: { value: 'https://github.com/o/r' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Fetch agents/i }));

    // Both pages' agents end up rendered after the background load completes.
    expect(await screen.findByLabelText('Select Agent A')).toBeInTheDocument();
    expect(await screen.findByLabelText('Select Agent B')).toBeInTheDocument();
    expect(fetchGithubAgents).toHaveBeenCalledTimes(2);
  });

  it('combines Browse and GitHub selections into a single footer action', async () => {
    render(<ImportLibraryDialog open category="agents" onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: 'Guardrail' } });
    fireEvent.click(await screen.findByLabelText('Select Guardrail Agent'));
    expect(screen.getByRole('button', { name: /Import selected \(1\)/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'GitHub' }));
    fireEvent.change(screen.getByLabelText('GitHub repository URL'), {
      target: { value: 'https://github.com/msitarzewski/agency-agents' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Fetch agents/i }));
    fireEvent.click(await screen.findByLabelText('Select AI Engineer'));

    // One button, reflecting both tabs' picks combined - not two buttons.
    expect(screen.getAllByRole('button', { name: /Import selected \(2\)/ })).toHaveLength(1);
  });

  it('refetching GitHub clears only GitHub-sourced selections, not Browse picks', async () => {
    render(<ImportLibraryDialog open category="agents" onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Search items'), { target: { value: 'Guardrail' } });
    fireEvent.click(await screen.findByLabelText('Select Guardrail Agent'));

    fireEvent.click(screen.getByRole('tab', { name: 'GitHub' }));
    fireEvent.change(screen.getByLabelText('GitHub repository URL'), {
      target: { value: 'https://github.com/msitarzewski/agency-agents' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Fetch agents/i }));
    await waitFor(() => expect(fetchGithubAgents).toHaveBeenCalled());

    expect(screen.getByRole('button', { name: /Import selected \(1\)/ })).toBeInTheDocument();
  });

  it('does not show the GitHub tab for non-agent categories', () => {
    render(<ImportLibraryDialog open category="tools" onClose={() => {}} />);
    expect(screen.queryByRole('tab', { name: 'GitHub' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Browse' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Custom' })).toBeInTheDocument();
  });
});

describe('ImportFromButton', () => {
  it('opens the dialog on click', () => {
    render(<ImportFromButton category="agents" />);
    expect(screen.queryByText('Import libraries')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(screen.getByText('Import libraries')).toBeInTheDocument();
  });
});
