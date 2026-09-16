import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

// useAssistantSetup is mocked so the test controls the "real" assistant identity
// (name + config) without touching the assistants service.
const setupMock = vi.hoisted(() => ({ value: null }));
vi.mock('./useAssistantSetup', () => ({
  useAssistantSetup: () => setupMock.value,
}));

// All data services the hook fans out to - default to empty so we exercise the
// real (demo OFF) path with no live data and assert nothing falls back to MOCK.
const svc = vi.hoisted(() => ({
  getChannels: vi.fn(),
  getLogs: vi.fn(),
  getRecentAgentMessages: vi.fn(),
  listContacts: vi.fn(),
  listOrganizations: vi.fn(),
  getCompanyBrief: vi.fn(),
  fetchUsage: vi.fn(),
  listDocuments: vi.fn(),
  listTags: vi.fn(),
  voiceboxAvailable: vi.fn(),
  voiceboxProfiles: vi.fn(),
}));
vi.mock('../services/communicatorService', () => ({
  getChannels: svc.getChannels,
  getLogs: svc.getLogs,
  getRecentAgentMessages: svc.getRecentAgentMessages,
}));
vi.mock('../services/contactsService', () => ({ listContacts: svc.listContacts }));
vi.mock('../services/organizationService', () => ({ listOrganizations: svc.listOrganizations }));
vi.mock('../services/companyBriefService', () => ({ getCompanyBrief: svc.getCompanyBrief }));
vi.mock('../services/usageService', () => ({ fetchUsage: svc.fetchUsage }));
vi.mock('../services/knowledgeBaseService', () => ({
  listDocuments: svc.listDocuments,
  listTags: svc.listTags,
}));
vi.mock('../services/voiceboxService', () => ({
  isAvailable: svc.voiceboxAvailable,
  listProfiles: svc.voiceboxProfiles,
  DEFAULT_BASE_URL: 'http://localhost:8080',
}));

import { useAssistantConsole } from './useAssistantConsole';
import MOCK from '../pages/Assistant/mockAssistantConsole';

const realSetup = {
  setup: { config: {}, steps: {}, activated: false, updatedAt: null },
  config: {},
  steps: {},
  activated: false,
  loading: false,
  error: null,
  refresh: vi.fn(),
  save: vi.fn(),
  markStep: vi.fn(),
  setActivated: vi.fn(),
  assistants: [],
  currentId: 'a1',
  current: null,
  name: 'My Assistant',
  organizationId: null,
  createAssistant: vi.fn(),
  switchAssistant: vi.fn(),
  renameAssistant: vi.fn(),
  removeAssistant: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  setupMock.value = realSetup;
  svc.getChannels.mockResolvedValue([]);
  svc.getLogs.mockResolvedValue([]);
  svc.getRecentAgentMessages.mockResolvedValue([]);
  svc.listContacts.mockResolvedValue([]);
  svc.listOrganizations.mockResolvedValue([]);
  svc.getCompanyBrief.mockResolvedValue(null);
  svc.fetchUsage.mockResolvedValue(null);
  svc.listDocuments.mockResolvedValue([]);
  svc.listTags.mockResolvedValue([]);
  svc.voiceboxAvailable.mockResolvedValue(null);
  svc.voiceboxProfiles.mockResolvedValue([]);
});

describe('useAssistantConsole - real mode (demo OFF) shows no demo fixture data', () => {
  it('uses the real assistant name, never the demo "Aurum"', async () => {
    const { result } = renderHook(() => useAssistantConsole({ demo: false }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data.assistant.name).toBe('My Assistant');
  });

  it('falls back to a neutral name (not "Aurum") when no assistant is named', async () => {
    setupMock.value = { ...realSetup, name: null };
    const { result } = renderHook(() => useAssistantConsole({ demo: false }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data.assistant.name).toBe('Assistant');
  });

  it('leaves the voice preview text empty (no mock sample sentence)', async () => {
    const { result } = renderHook(() => useAssistantConsole({ demo: false }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data.voice.sampleText).toBe('');
  });

  it('renders empty sources instead of fixture rows', async () => {
    const { result } = renderHook(() => useAssistantConsole({ demo: false }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const d = result.current.data;
    expect(d.channels).toEqual([]);
    expect(d.conversations).toEqual([]);
    expect(d.contacts.list).toEqual([]);
    expect(d.contacts.total).toBe(0);
    expect(d.organizations).toEqual([]);
  });

  it('never leaks any demo fixture strings into the real data', async () => {
    const { result } = renderHook(() => useAssistantConsole({ demo: false }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const blob = JSON.stringify(result.current.data);
    expect(blob).not.toContain('Aurum');
    expect(blob).not.toContain('How can I help you today');
  });
});

describe('useAssistantConsole - refetch never re-blanks the page', () => {
  it('reports loading only on the first load, not on later refetches', async () => {
    // Hold the SECOND getChannels (the refetch) open so loadExtra is in flight
    // while we assert loading. The first load resolves normally.
    let releaseRefetch;
    svc.getChannels.mockResolvedValueOnce([]).mockImplementationOnce(
      () =>
        new Promise((res) => {
          releaseRefetch = () => res([]);
        })
    );

    const { result } = renderHook(() => useAssistantConsole({ demo: false }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Kick off a refetch - it should stay non-blanking even while the network
    // fan-out is pending (the grid must not unmount to a spinner).
    act(() => {
      result.current.refetch();
    });
    expect(result.current.loading).toBe(false);

    await act(async () => {
      releaseRefetch();
    });
    expect(result.current.loading).toBe(false);
  });
});

describe('useAssistantConsole - demo mode (demo ON) returns the fixture', () => {
  it('returns the MOCK fixture verbatim and never hits the services', async () => {
    const { result } = renderHook(() => useAssistantConsole({ demo: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBe(MOCK);
    expect(svc.getChannels).not.toHaveBeenCalled();
    expect(svc.listContacts).not.toHaveBeenCalled();
  });
});
