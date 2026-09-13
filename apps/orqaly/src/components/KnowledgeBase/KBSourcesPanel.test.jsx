import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const svc = {
  listConnections: vi.fn(),
  saveConnection: vi.fn(),
  syncConnection: vi.fn(),
  deleteConnection: vi.fn(),
  authorizeOAuth: vi.fn(),
};
vi.mock('../../services/kbConnectionsService', () => ({
  listConnections: (...a) => svc.listConnections(...a),
  saveConnection: (...a) => svc.saveConnection(...a),
  syncConnection: (...a) => svc.syncConnection(...a),
  deleteConnection: (...a) => svc.deleteConnection(...a),
  authorizeOAuth: (...a) => svc.authorizeOAuth(...a),
}));
vi.mock('../../services/userKeysService', () => ({ saveUserKey: vi.fn(async () => ({})) }));
vi.mock('../../services/assistantIngestService', () => ({ syncObsidian: vi.fn() }));

import KBSourcesPanel from './KBSourcesPanel';

const theme = createTheme();
const renderPanel = () =>
  render(
    <ThemeProvider theme={theme}>
      <KBSourcesPanel />
    </ThemeProvider>
  );

function caps(overrides = {}) {
  const base = {
    notion: { methods: ['byok'], oauthConfigured: false, byokPresent: false },
    obsidian: { methods: ['import'], oauthConfigured: false, byokPresent: false },
    'google-drive': { methods: ['byok', 'import'], oauthConfigured: false, byokPresent: false },
    dropbox: { methods: ['oauth', 'byok', 'import'], oauthConfigured: false, byokPresent: false },
    onedrive: { methods: ['oauth', 'byok', 'import'], oauthConfigured: false, byokPresent: false },
    mega: { methods: ['byok', 'import'], oauthConfigured: false, byokPresent: false },
  };
  return { ...base, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  svc.listConnections.mockResolvedValue({ connections: [], capabilities: caps() });
  svc.saveConnection.mockResolvedValue({ id: 'c1' });
  svc.syncConnection.mockResolvedValue({ synced: 4 });
  svc.authorizeOAuth.mockResolvedValue('https://provider/consent');
});

describe('KBSourcesPanel', () => {
  it('lists all six sources, each with a Connect button', async () => {
    renderPanel();
    expect(await screen.findByText('Notion')).toBeTruthy();
    for (const label of ['Obsidian', 'Google Drive', 'Dropbox', 'OneDrive', 'Mega']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getAllByText('Connect')).toHaveLength(6);
  });

  it('connects Dropbox via OAuth when configured (no key saved)', async () => {
    svc.listConnections.mockResolvedValue({
      connections: [],
      capabilities: caps({ dropbox: { methods: ['oauth', 'byok', 'import'], oauthConfigured: true, byokPresent: false } }),
    });
    renderPanel();
    await screen.findByText('Dropbox');
    fireEvent.click(screen.getAllByText('Connect')[3]); // Notion, Obsidian, Drive, Dropbox...
    await waitFor(() => expect(svc.authorizeOAuth).toHaveBeenCalledWith('dropbox'));
  });

  it('connects Dropbox with a saved key (OAuth hidden -> saveConnection byok)', async () => {
    svc.listConnections.mockResolvedValue({
      connections: [],
      capabilities: caps({ dropbox: { methods: ['oauth', 'byok', 'import'], oauthConfigured: true, byokPresent: true } }),
    });
    renderPanel();
    await screen.findByText('Dropbox');
    fireEvent.click(screen.getAllByText('Connect')[3]);
    await waitFor(() =>
      expect(svc.saveConnection).toHaveBeenCalledWith(
        expect.objectContaining({ source_type: 'dropbox', credential_ref: { kind: 'byok', provider: 'data:dropbox' } })
      )
    );
    expect(svc.authorizeOAuth).not.toHaveBeenCalled();
  });

  it('Obsidian Connect creates an import (none) connection', async () => {
    renderPanel();
    await screen.findByText('Obsidian');
    fireEvent.click(screen.getAllByText('Connect')[1]);
    await waitFor(() =>
      expect(svc.saveConnection).toHaveBeenCalledWith(
        expect.objectContaining({ source_type: 'obsidian', credential_ref: { kind: 'none' } })
      )
    );
  });

  it('shows Sync now for a connected server-sync source', async () => {
    svc.listConnections.mockResolvedValue({
      connections: [{ id: 'c1', source_type: 'dropbox', slot: 'primary', mode: 'sync', credential_ref: { kind: 'byok' } }],
      capabilities: caps(),
    });
    renderPanel();
    fireEvent.click(await screen.findByText('Sync now'));
    await waitFor(() => expect(svc.syncConnection).toHaveBeenCalledWith('c1'));
  });

  it('shows Import for a connected import (none) connection', async () => {
    svc.listConnections.mockResolvedValue({
      connections: [{ id: 'c2', source_type: 'obsidian', slot: 'primary', mode: 'sync', credential_ref: { kind: 'none' } }],
      capabilities: caps(),
    });
    renderPanel();
    expect(await screen.findByText('Import .md')).toBeTruthy();
  });
});
