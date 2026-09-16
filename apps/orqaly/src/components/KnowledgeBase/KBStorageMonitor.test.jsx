import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const svc = { getMonitor: vi.fn(), getHistory: vi.fn(), recordSnapshot: vi.fn() };
vi.mock('../../services/storageMonitorService', () => ({
  getMonitor: (...a) => svc.getMonitor(...a),
  getHistory: (...a) => svc.getHistory(...a),
  recordSnapshot: (...a) => svc.recordSnapshot(...a),
}));
// Avoid pulling the full connections panel; only SOURCE_BY_TYPE is needed.
vi.mock('./KBSourcesPanel', () => ({
  default: () => null,
  SOURCE_BY_TYPE: { dropbox: { label: 'Dropbox', glyph: { path: 'M0 0h24v24H0z' }, glyphColor: '#000' } },
}));

import KBStorageMonitor from './KBStorageMonitor';

const theme = createTheme();
const renderMon = () =>
  render(
    <ThemeProvider theme={theme}>
      <KBStorageMonitor />
    </ThemeProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  svc.getMonitor.mockResolvedValue({
    overview: { connected: 1, online: 1, offline: 0, needsAttention: 0, totalBytesUsed: 100, totalBytesTotal: 1000, totalDocs: 5, activeSyncJobs: 1 },
    providers: [
      { id: 'c1', source_type: 'dropbox', label: 'Dropbox', status: 'online', bytesUsed: 100, bytesTotal: 1000, quotaPct: 10, docsCount: 5, latencyMs: 12, lastSyncedAt: '2026-07-01T00:00:00Z', lastSyncOk: true, lastError: null, authStatus: 'connected', mode: 'sync', syncIntervalSecs: 86400 },
    ],
    errors: [{ label: 'Dropbox', error: 'boom', at: null }],
    activity: [{ action: 'KB_SOURCE_CONNECTED', created_at: '2026-07-01T00:00:00Z' }],
  });
  svc.getHistory.mockResolvedValue({ series: [] });
  svc.recordSnapshot.mockResolvedValue({ snapped: 1 });
});

describe('KBStorageMonitor', () => {
  it('renders overview tiles and a provider card', async () => {
    renderMon();
    expect(await screen.findByText('Storage monitor')).toBeTruthy();
    expect(screen.getByText('Connected')).toBeTruthy();
    expect(screen.getByText('Dropbox')).toBeTruthy();
    expect(screen.getByText(/10%/)).toBeTruthy();
    expect(svc.recordSnapshot).toHaveBeenCalled();
  });

  it('Advanced toggle reveals the error log', async () => {
    renderMon();
    await screen.findByText('Storage monitor');
    fireEvent.click(screen.getByText('Advanced'));
    await waitFor(() => expect(screen.getByText('Error log')).toBeTruthy());
    expect(screen.getByText(/boom/)).toBeTruthy();
  });
});
