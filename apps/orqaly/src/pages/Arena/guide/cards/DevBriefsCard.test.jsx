import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';

const mocks = vi.hoisted(() => ({
  fetchArenaStack: vi.fn(async () => ({ rows: [], composioConfigured: true })),
  linkArenaBriefGoal: vi.fn(async () => ({})),
  sendBriefToDeveloper: vi.fn(async () => ({ task_id: 't1' })),
  createGoal: vi.fn(async () => ({ goal: { id: 'goal-1' } })),
}));
vi.mock('../../../../services/arenaService', () => ({
  fetchArenaStack: mocks.fetchArenaStack,
  linkArenaBriefGoal: mocks.linkArenaBriefGoal,
  sendBriefToDeveloper: mocks.sendBriefToDeveloper,
}));
vi.mock('../../../../services/goalService', () => ({ createGoal: mocks.createGoal }));

import DevBriefsCard from './DevBriefsCard';

const theme = createTheme();
const gapRow = {
  id: 'row-1',
  key: 'custom:monday-com',
  label: 'Monday.com',
  source: 'custom',
  status: 'gap',
};

function setup() {
  const onComplete = vi.fn(async () => {});
  render(
    <ThemeProvider theme={theme}>
      <DevBriefsCard onComplete={onComplete} embedded />
    </ThemeProvider>
  );
  return { onComplete };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchArenaStack.mockResolvedValue({ rows: [gapRow], composioConfigured: true });
});

describe('DevBriefsCard', () => {
  it('says there is nothing to do when every tool connects by button', async () => {
    mocks.fetchArenaStack.mockResolvedValue({ rows: [], composioConfigured: true });
    setup();
    expect(await screen.findByText(/nothing for a developer to do/)).toBeInTheDocument();
  });

  it('pushes the brief goal with the exact no-tools, unattended shape', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: /Write the brief/ }));
    await waitFor(() => expect(mocks.createGoal).toHaveBeenCalled());
    const payload = mocks.createGoal.mock.calls[0][0];
    expect(payload).toMatchObject({
      tool_mode: 'no_tools',
      hitl_mode: 'unattended',
      execution_mode: 'auto',
      mode: 'simple',
      po_depth: 'quick',
      budget_usd: 5,
    });
    expect(payload.title).toContain('Monday.com');
    // and the goal is linked back onto the stack row
    await waitFor(() => expect(mocks.linkArenaBriefGoal).toHaveBeenCalledWith('row-1', 'goal-1'));
  });

  it('shows progress while the brief is being written', async () => {
    mocks.fetchArenaStack.mockResolvedValue({
      rows: [{ ...gapRow, status: 'brief_requested' }],
      composioConfigured: true,
    });
    setup();
    expect(await screen.findByText(/Being written/)).toBeInTheDocument();
  });

  it('hands a ready brief to the developer', async () => {
    mocks.fetchArenaStack.mockResolvedValue({
      rows: [{ ...gapRow, status: 'brief_ready' }],
      composioConfigured: true,
    });
    setup();
    fireEvent.click(await screen.findByRole('button', { name: /Save for my developer/ }));
    await waitFor(() => expect(mocks.sendBriefToDeveloper).toHaveBeenCalledWith('row-1'));
  });

  it('shows a handed-over brief as saved, not sent', async () => {
    mocks.fetchArenaStack.mockResolvedValue({
      rows: [{ ...gapRow, status: 'handed_over' }],
      composioConfigured: true,
    });
    setup();
    expect(await screen.findByText('Saved in Human tasks')).toBeInTheDocument();
  });
});

describe('DevBriefsCard when connections are switched off', () => {
  it('offers a brief for a covered tool that still cannot connect', async () => {
    // Step 3 promises this step handles them; without this the guide would go
    // all-green having wired nothing.
    mocks.fetchArenaStack.mockResolvedValue({
      rows: [{ id: 'r2', key: 'mcp-jira', label: 'Jira', source: 'catalog', status: 'selected' }],
      composioConfigured: false,
    });
    setup();
    expect(await screen.findByText('Jira')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Write the brief/ })).toBeInTheDocument();
  });

  it('leaves a connectable tool alone while connections are on', async () => {
    mocks.fetchArenaStack.mockResolvedValue({
      rows: [{ id: 'r2', key: 'mcp-jira', label: 'Jira', source: 'catalog', status: 'selected' }],
      composioConfigured: true,
    });
    setup();
    expect(await screen.findByText(/nothing for a developer to do/)).toBeInTheDocument();
  });
});
