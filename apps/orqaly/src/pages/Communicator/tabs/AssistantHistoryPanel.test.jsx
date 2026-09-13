import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

vi.mock('../../../services/assistantHistoryService', () => ({
  getAssistantHistory: vi.fn(),
}));

import { getAssistantHistory } from '../../../services/assistantHistoryService';
import AssistantHistoryPanel from './AssistantHistoryPanel';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const theme = createTheme();
const Wrap = ({ children }) => <ThemeProvider theme={theme}>{children}</ThemeProvider>;

beforeEach(() => vi.clearAllMocks());

describe('AssistantHistoryPanel', () => {
  it('groups messages by conversation and renders them', async () => {
    getAssistantHistory.mockResolvedValue([
      {
        id: 'm2',
        conversation_id: 'c1',
        role: 'assistant',
        content: 'Hello there',
        mode: 'assistant',
        created_at: '2026-06-01T10:01:00Z',
      },
      {
        id: 'm1',
        conversation_id: 'c1',
        role: 'user',
        content: 'Hi assistant',
        mode: 'assistant',
        created_at: '2026-06-01T10:00:00Z',
      },
    ]);
    render(
      <Wrap>
        <AssistantHistoryPanel />
      </Wrap>
    );
    await waitFor(() => expect(screen.getByText('Hi assistant')).toBeInTheDocument());
    expect(screen.getByText('Hello there')).toBeInTheDocument();
    expect(screen.getByText('Personal Assistant')).toBeInTheDocument();
  });

  it('shows an empty state when there is no history', async () => {
    getAssistantHistory.mockResolvedValue([]);
    render(
      <Wrap>
        <AssistantHistoryPanel />
      </Wrap>
    );
    await waitFor(() => expect(screen.getByText('No conversations yet')).toBeInTheDocument());
  });
});
