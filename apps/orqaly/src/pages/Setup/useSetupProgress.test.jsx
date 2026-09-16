import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../services/organizationService', () => ({ listOrganizations: vi.fn() }));
vi.mock('../../services/storageConnectionsService', () => ({ listStorageConnections: vi.fn() }));
vi.mock('../../services/userPrefsService', () => ({ getUserPrefs: vi.fn() }));
vi.mock('../../hooks/useUserApiKeys', () => ({ useUserApiKeys: vi.fn() }));

import { listOrganizations } from '../../services/organizationService';
import { listStorageConnections } from '../../services/storageConnectionsService';
import { getUserPrefs } from '../../services/userPrefsService';
import { useUserApiKeys } from '../../hooks/useUserApiKeys';
import { useSetupProgress } from './useSetupProgress';

const prefs = { defaultLlmPreset: null, workspaceLogoUrl: null, setupCompletedAt: null };

describe('useSetupProgress (5-step wizard)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    getUserPrefs.mockResolvedValue(prefs);
  });

  it('reports every step incomplete on a fresh account', async () => {
    listOrganizations.mockResolvedValue([]);
    listStorageConnections.mockResolvedValue([]);
    useUserApiKeys.mockReturnValue({ keys: [], loading: false, refresh: vi.fn() });

    const { result } = renderHook(() => useSetupProgress());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.workspace.done).toBe(false);
    expect(result.current.database.done).toBe(false);
    expect(result.current.keys.done).toBe(false);
    expect(result.current.storage.done).toBe(false);
    expect(result.current.localLlm.done).toBe(false);
    expect(result.current.completedSteps).toBe(0);
    expect(result.current.totalSteps).toBe(5);
    expect(result.current.completedRequired).toBe(0);
    expect(result.current.totalRequired).toBe(2);
    expect(result.current.allRequiredDone).toBe(false);
  });

  it('marks all 5 steps done and required satisfied when fully populated', async () => {
    listOrganizations.mockResolvedValue([{ id: 'o1', name: 'Acme' }]);
    listStorageConnections.mockResolvedValue([{ id: 's1', kind: 'supabase' }]);
    useUserApiKeys.mockReturnValue({
      keys: [
        { id: 'k1', provider: 'llm:gemini' },
        { id: 'k2', provider: 'llm:ollama' },
        { id: 'k3', provider: 'database:supabase' },
      ],
      loading: false,
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useSetupProgress());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.workspace.done).toBe(true);
    expect(result.current.database.done).toBe(true);
    expect(result.current.keys.done).toBe(true);
    expect(result.current.storage.done).toBe(true);
    expect(result.current.localLlm.done).toBe(true);
    expect(result.current.completedSteps).toBe(5);
    expect(result.current.completedRequired).toBe(2);
    expect(result.current.allRequiredDone).toBe(true);
  });

  it('does not count database, local, tool, or other remote keys as a goal Core key', async () => {
    listOrganizations.mockResolvedValue([{ id: 'o1', name: 'Acme' }]);
    listStorageConnections.mockResolvedValue([]);
    useUserApiKeys.mockReturnValue({
      keys: [
        { id: 'k1', provider: 'database:supabase' },
        { id: 'k2', provider: 'llm:ollama' },
        { id: 'k3', provider: 'tool:unsplash' },
        { id: 'k4', provider: 'llm:openai' },
        { id: 'k5', provider: 'llm:openrouter' },
      ],
      loading: false,
      refresh: vi.fn(),
    });

    const { result } = renderHook(() => useSetupProgress());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.keys.done).toBe(false); // no user-scoped Gemini key
    expect(result.current.database.done).toBe(true);
    expect(result.current.localLlm.done).toBe(true);
    expect(result.current.completedRequired).toBe(1); // workspace only
    expect(result.current.allRequiredDone).toBe(false);
  });

  it('counts platform storage choice as storage-done', async () => {
    localStorage.setItem('orchestratori_setup_storage_choice', 'platform');
    listOrganizations.mockResolvedValue([]);
    listStorageConnections.mockResolvedValue([]);
    useUserApiKeys.mockReturnValue({ keys: [], loading: false, refresh: vi.fn() });

    const { result } = renderHook(() => useSetupProgress());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.storage.done).toBe(true);
    expect(result.current.storage.choice).toBe('platform');
  });

  it('ignores whitespace-only workspace names', async () => {
    listOrganizations.mockResolvedValue([{ id: 'o1', name: '   ' }]);
    listStorageConnections.mockResolvedValue([]);
    useUserApiKeys.mockReturnValue({ keys: [], loading: false, refresh: vi.fn() });

    const { result } = renderHook(() => useSetupProgress());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.workspace.done).toBe(false);
  });
});
