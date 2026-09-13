import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { HistoryAssistantList } from './Dashboard';
import { getAssistantHistory } from '../../services/assistantHistoryService';

vi.mock('../../services/assistantHistoryService', () => ({
  getAssistantHistory: vi.fn(),
  logAssistantMessages: vi.fn(),
}));

const theme = createTheme();

function renderList(props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <HistoryAssistantList
        theme={theme}
        historyKind="assistant"
        onHistoryKindChange={() => {}}
        {...props}
      />
    </ThemeProvider>
  );
}

// N conversations, two messages each. `groupConversations` sorts newest-last-message
// first, so ascending timestamps here mean "Chat 1" lands at the top of the list.
function manyMessages(n) {
  const rows = [];
  for (let i = 1; i <= n; i += 1) {
    const minute = String(n - i).padStart(2, '0');
    rows.push({
      id: `u${i}`,
      conversation_id: `c${i}`,
      role: 'user',
      content: `Chat ${i}`,
      mode: 'assistant',
      created_at: `2026-06-01T10:${minute}:00Z`,
    });
    rows.push({
      id: `a${i}`,
      conversation_id: `c${i}`,
      role: 'assistant',
      content: `Reply ${i}`,
      mode: 'assistant',
      created_at: `2026-06-01T10:${minute}:30Z`,
    });
  }
  return rows;
}

describe('HistoryAssistantList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders conversation rows with title and message-count caption', async () => {
    getAssistantHistory.mockResolvedValue([
      {
        id: 'm1',
        conversation_id: 'c1',
        role: 'user',
        content: 'Plan a launch',
        mode: 'assistant',
        created_at: '2026-06-01T10:00:00Z',
      },
      {
        id: 'm2',
        conversation_id: 'c1',
        role: 'assistant',
        content: 'Sure, here is a plan',
        mode: 'assistant',
        created_at: '2026-06-01T10:00:05Z',
      },
      {
        id: 'm3',
        conversation_id: 'c2',
        role: 'user',
        content: 'Review report',
        mode: 'consilium',
        created_at: '2026-06-02T10:00:00Z',
      },
    ]);

    renderList();

    await waitFor(() => expect(screen.getByText('Plan a launch')).toBeInTheDocument());
    expect(screen.getByText('Review report')).toBeInTheDocument();
    expect(screen.getByText('2 chats')).toBeInTheDocument();
    // Caption with message count for the first conversation.
    expect(screen.getByText(/2 msg ·/)).toBeInTheDocument();
  });

  it('expands a row inline into chat bubbles on click', async () => {
    getAssistantHistory.mockResolvedValue([
      {
        id: 'm1',
        conversation_id: 'c1',
        role: 'user',
        content: 'Hello there',
        mode: 'assistant',
        created_at: '2026-06-01T10:00:00Z',
      },
      {
        id: 'm2',
        conversation_id: 'c1',
        role: 'assistant',
        content: 'Hi, how can I help',
        mode: 'assistant',
        created_at: '2026-06-01T10:00:05Z',
      },
    ]);

    renderList();

    const row = await screen.findByText('Hello there');
    // Assistant reply not visible until expanded.
    expect(screen.queryByText('Hi, how can I help')).not.toBeInTheDocument();
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByText('Hi, how can I help')).toBeInTheDocument());
  });

  it('shows an empty state when there are no conversations', async () => {
    getAssistantHistory.mockResolvedValue([]);
    renderList();
    await waitFor(() => expect(screen.getByText('No conversations yet')).toBeInTheDocument());
    expect(screen.getByText('0 chats')).toBeInTheDocument();
  });

  it('paginates at 10 conversations per page and keeps the full total in the header', async () => {
    getAssistantHistory.mockResolvedValue(manyMessages(24));

    renderList();

    await waitFor(() => expect(screen.getByText('Chat 1')).toBeInTheDocument());
    // Header counts every conversation, not just the visible page.
    expect(screen.getByText('24 chats')).toBeInTheDocument();
    // Only the first page is rendered.
    expect(screen.getByText('Chat 10')).toBeInTheDocument();
    expect(screen.queryByText('Chat 11')).not.toBeInTheDocument();
  });

  it('shows the next slice when a page number is clicked', async () => {
    getAssistantHistory.mockResolvedValue(manyMessages(24));

    renderList();

    await waitFor(() => expect(screen.getByText('Chat 1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));

    await waitFor(() => expect(screen.getByText('Chat 11')).toBeInTheDocument());
    expect(screen.getByText('Chat 20')).toBeInTheDocument();
    expect(screen.queryByText('Chat 1')).not.toBeInTheDocument();
  });

  it('switches the page size to 25', async () => {
    getAssistantHistory.mockResolvedValue(manyMessages(24));

    renderList();

    await waitFor(() => expect(screen.getByText('Chat 1')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '10 / page' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '25 / page' }));

    // All 24 fit on one page now, so the pager collapses.
    await waitFor(() => expect(screen.getByText('Chat 24')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Go to page 2' })).not.toBeInTheDocument();
  });

  it('collapses an expanded row when the page changes', async () => {
    getAssistantHistory.mockResolvedValue(manyMessages(24));

    renderList();

    const row = await screen.findByText('Chat 1');
    fireEvent.click(row);
    await waitFor(() => expect(screen.getByText('Reply 1')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));
    await waitFor(() => expect(screen.getByText('Chat 11')).toBeInTheDocument());

    // Back on page 1 the row is collapsed again rather than silently reopening.
    fireEvent.click(screen.getByRole('button', { name: 'Go to page 1' }));
    await waitFor(() => expect(screen.getByText('Chat 1')).toBeInTheDocument());
    expect(screen.queryByText('Reply 1')).not.toBeInTheDocument();
  });
});

// A past chat is something to carry on, not only to read back. When the host
// can reopen one, the row hands it over instead of expanding in place.
describe('HistoryAssistantList - reopening a conversation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  const twoChats = [
    {
      id: 'm1',
      conversation_id: 'c1',
      role: 'user',
      content: 'Plan a launch',
      mode: 'assistant',
      created_at: '2026-06-01T10:00:00Z',
    },
    {
      id: 'm2',
      conversation_id: 'c1',
      role: 'assistant',
      content: 'Here is a plan',
      mode: 'assistant',
      created_at: '2026-06-01T10:00:05Z',
    },
  ];

  it('hands the whole conversation over, messages included', async () => {
    getAssistantHistory.mockResolvedValue(twoChats);
    const onOpenConversation = vi.fn();
    renderList({ onOpenConversation });

    fireEvent.click(await screen.findByText('Plan a launch'));

    expect(onOpenConversation).toHaveBeenCalledTimes(1);
    const handed = onOpenConversation.mock.calls[0][0];
    expect(handed.id).toBe('c1');
    // The seed the surface paints with before the server answers.
    expect(handed.messages.map((m) => m.content)).toEqual(['Plan a launch', 'Here is a plan']);
  });

  it('does not also expand the row it handed over', async () => {
    getAssistantHistory.mockResolvedValue(twoChats);
    renderList({ onOpenConversation: vi.fn() });

    fireEvent.click(await screen.findByText('Plan a launch'));
    // The inline bubble would be a second copy of a chat already reopening.
    expect(screen.queryByText('Here is a plan')).toBeNull();
  });

  it('keeps expanding in place when the host cannot reopen', async () => {
    getAssistantHistory.mockResolvedValue(twoChats);
    renderList();

    fireEvent.click(await screen.findByText('Plan a launch'));
    await waitFor(() => expect(screen.getByText('Here is a plan')).toBeInTheDocument());
  });
});
