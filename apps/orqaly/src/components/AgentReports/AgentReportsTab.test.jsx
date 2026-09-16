import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import AgentReportsTab from './AgentReportsTab';

const agentReport = {
  id: 'rep-1',
  title: 'Agent Report: QA Tester — Casino Landing',
  content: '**Cost:** $0.0000',
  created_at: '2026-05-21T12:00:00Z',
  metadata: {
    goal_id: 'goal-1',
    agent_id: 'agent-1',
    agent_name: 'QA Tester',
    tasks: 1,
    completed: 1,
    cost: 0,
  },
};

function chain(result) {
  const api = {
    select: () => api,
    order: () => api,
    eq: () => api,
    limit: () => Promise.resolve(result),
  };
  return api;
}

vi.mock('../../lib/supabase', () => ({
  hasSupabase: () => true,
  supabase: {
    from: (table) => {
      if (table === 'knowledge_documents') {
        return chain({ data: [agentReport], error: null });
      }
      return chain({ data: [], error: null });
    },
  },
}));

vi.mock('../../services/teamTaskBackend', () => ({
  loadTeamTasks: vi
    .fn()
    .mockResolvedValue([
      { agent_id: 'agent-1', goal_id: 'goal-1', llmTotalTokens: 800, llmCost: 0.002 },
    ]),
}));

vi.mock('../Common/Pagination', () => ({
  default: () => null,
}));

vi.mock('../../hooks/usePagination', () => ({
  default: (rows) => ({
    page: 0,
    rowsPerPage: 25,
    setPage: vi.fn(),
    setRowsPerPage: vi.fn(),
    loadAll: vi.fn(),
    collapseAll: vi.fn(),
    allMode: false,
    rowsPerPageOptions: [25],
    totalCount: rows?.length ?? 0,
  }),
}));

const theme = createTheme();

describe('AgentReportsTab agent reports header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows token line alongside cost in report card header', async () => {
    render(
      <ThemeProvider theme={theme}>
        <AgentReportsTab />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('QA Tester')).toBeInTheDocument();
    });

    expect(screen.getByText('800 tokens')).toBeInTheDocument();
    expect(screen.getByText('$0.0020')).toBeInTheDocument();
  });
});
