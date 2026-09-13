import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';

const mocks = vi.hoisted(() => ({
  fetchArenaDepartments: vi.fn(async () => ({
    configured: [{ department: 'developing', enabled: true }],
  })),
  fetchArenaStack: vi.fn(async () => ({ rows: [], composioConfigured: true })),
  saveArenaStack: vi.fn(async () => ({ rows: [] })),
}));
vi.mock('../../../../services/arenaService', () => mocks);

import StackQuizCard from './StackQuizCard';

const theme = createTheme();

function setup(props = {}) {
  const onComplete = vi.fn(async () => {});
  render(
    <ThemeProvider theme={theme}>
      <StackQuizCard onComplete={onComplete} embedded {...props} />
    </ThemeProvider>
  );
  return { onComplete };
}

beforeEach(() => vi.clearAllMocks());

describe('StackQuizCard', () => {
  it('asks only about the departments the company enabled', async () => {
    setup();
    expect(await screen.findByText('Where does your code live?')).toBeInTheDocument();
    // accountants-only question hidden when only developing is enabled
    expect(screen.queryByText('What handles the money?')).not.toBeInTheDocument();
  });

  it('builds the stack payload from the ticked chips', async () => {
    const { onComplete } = setup();
    await screen.findByText('Where does your code live?');
    fireEvent.click(screen.getByText('Jira'));
    fireEvent.click(screen.getByRole('button', { name: /Save 1 tool/ }));
    await waitFor(() => expect(mocks.saveArenaStack).toHaveBeenCalled());
    expect(mocks.saveArenaStack.mock.calls[0][0]).toEqual([
      { key: 'mcp-jira', label: 'Jira', source: 'catalog', department: 'developing' },
    ]);
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });

  it('keeps a "something else" answer as a custom tool for the brief step', async () => {
    setup();
    const q = await screen.findByText('Where does your team track its work?');
    expect(q).toBeInTheDocument();
    const field = screen.getByLabelText('Where does your team track its work? - something else');
    fireEvent.change(field, { target: { value: 'Monday.com' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(screen.getByText('Monday.com')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Save 1 tool/ }));
    await waitFor(() => expect(mocks.saveArenaStack).toHaveBeenCalled());
    expect(mocks.saveArenaStack.mock.calls[0][0][0]).toMatchObject({
      key: 'custom:monday-com',
      source: 'custom',
    });
  });

  it('will not save an empty stack', async () => {
    setup();
    await screen.findByText('Where does your code live?');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
