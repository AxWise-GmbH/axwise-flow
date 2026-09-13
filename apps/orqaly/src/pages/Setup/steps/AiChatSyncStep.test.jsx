import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const svc = vi.hoisted(() => ({
  getAssistantHistory: vi.fn(),
  syncAssistantChat: vi.fn(),
  importChatExportBatched: vi.fn(),
  listConnections: vi.fn(),
  parseExportFile: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock('../../../services/assistantHistoryService', () => ({
  getAssistantHistory: svc.getAssistantHistory,
}));
vi.mock('../../../services/assistantIngestService', () => ({
  syncAssistantChat: svc.syncAssistantChat,
  importChatExportBatched: svc.importChatExportBatched,
}));
vi.mock('../../../services/kbConnectionsService', () => ({
  listConnections: svc.listConnections,
}));
vi.mock('../../../services/chatExportParsers', () => ({
  parseExportFile: svc.parseExportFile,
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => svc.navigate }));

import AiChatSyncStep from './AiChatSyncStep';

const theme = createTheme();
const markDone = vi.fn();
const progress = { aiChatSync: { done: false, markDone, refresh: vi.fn() } };
const wrap = () =>
  render(
    <ThemeProvider theme={theme}>
      <AiChatSyncStep progress={progress} />
    </ThemeProvider>
  );

beforeEach(() => {
  svc.getAssistantHistory.mockReset();
  svc.syncAssistantChat.mockReset();
  svc.importChatExportBatched.mockReset();
  svc.listConnections.mockReset();
  svc.parseExportFile.mockReset();
  svc.navigate.mockClear();
  markDone.mockClear();
  svc.listConnections.mockResolvedValue({ connections: [] });
});

describe('AiChatSyncStep', () => {
  it('always shows destination options + connect, even with no history', async () => {
    svc.getAssistantHistory.mockResolvedValue([]);
    wrap();
    await waitFor(() => expect(screen.getByText('Knowledge Base')).toBeTruthy());
    expect(screen.getByText('Connect a space')).toBeTruthy();
    expect(screen.getByText(/No AI chat history yet/i)).toBeTruthy();
    // Sync disabled with no history.
    expect(screen.getByRole('button', { name: /sync now/i })).toBeDisabled();
  });

  it('routes to the Knowledge Base to connect a space', async () => {
    svc.getAssistantHistory.mockResolvedValue([]);
    wrap();
    await waitFor(() => expect(screen.getByText('Connect a space')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));
    expect(svc.navigate).toHaveBeenCalledWith('/knowledge-base');
  });

  it('syncs into the platform KB space by default', async () => {
    svc.getAssistantHistory.mockResolvedValue([
      { conversation_id: 'c1', role: 'user', content: 'a' },
      { conversation_id: 'c2', role: 'user', content: 'c' },
    ]);
    svc.syncAssistantChat.mockResolvedValue({ synced: 2, conversations: 2, truncated: false });
    wrap();

    await waitFor(() => expect(screen.getByText(/2 conversations ready/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /sync now/i }));

    await waitFor(() => {
      expect(svc.syncAssistantChat).toHaveBeenCalledWith({
        space: 'Assistant Chats',
        connectionId: undefined,
      });
      expect(markDone).toHaveBeenCalled();
      expect(screen.getByText(/Synced 2 of 2/i)).toBeTruthy();
    });
  });

  it('syncs into a connected space when selected', async () => {
    svc.getAssistantHistory.mockResolvedValue([{ conversation_id: 'c1', role: 'user', content: 'a' }]);
    svc.listConnections.mockResolvedValue({
      connections: [{ id: 'conn-1', source_type: 'notion', label: 'My Notion', enabled: true }],
    });
    svc.syncAssistantChat.mockResolvedValue({ synced: 1, conversations: 1, truncated: false });
    wrap();

    await waitFor(() => expect(screen.getByText('My Notion')).toBeTruthy());
    // Platform tile is selected by default (shows a chip), so the only "Use this"
    // button is the connection tile.
    fireEvent.click(screen.getByRole('button', { name: /use this/i }));
    fireEvent.click(screen.getByRole('button', { name: /sync now/i }));

    await waitFor(() => {
      expect(svc.syncAssistantChat).toHaveBeenCalledWith({ space: 'My Notion', connectionId: 'conn-1' });
    });
  });

  it('surfaces an error when the sync fails', async () => {
    svc.getAssistantHistory.mockResolvedValue([{ conversation_id: 'c1', role: 'user', content: 'a' }]);
    svc.syncAssistantChat.mockRejectedValue(new Error('boom'));
    wrap();

    await waitFor(() => expect(screen.getByText(/1 conversation ready/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /sync now/i }));

    await waitFor(() => {
      expect(screen.getByText('boom')).toBeTruthy();
      expect(markDone).not.toHaveBeenCalled();
    });
  });

  it('imports an external AI-app export into the destination space', async () => {
    svc.getAssistantHistory.mockResolvedValue([]);
    svc.parseExportFile.mockResolvedValue({
      provider: 'chatgpt',
      conversations: [{ id: 'c1', title: 'A', messages: [{ role: 'user', content: 'hi' }] }],
      warnings: [],
    });
    svc.importChatExportBatched.mockResolvedValue({ synced: 1, conversations: 1 });
    const { container } = wrap();

    await waitFor(() => expect(screen.getByText('Import from another AI app')).toBeTruthy());

    // Pick a file on the hidden input (the ChatGPT tile triggers this input).
    const input = container.querySelector('input[type="file"]');
    const file = new File([JSON.stringify([])], 'conversations.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText(/Found/i)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /import into/i }));

    await waitFor(() => {
      expect(svc.importChatExportBatched).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'chatgpt', space: 'Assistant Chats' })
      );
      expect(markDone).toHaveBeenCalled();
      expect(screen.getByText(/Imported 1 of 1/i)).toBeTruthy();
    });
  });
});
