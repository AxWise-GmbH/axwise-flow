import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

// All data services the hook fans out to - default to empty so we exercise
// the empty-safe path with no live data.
const svc = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  listTags: vi.fn(),
  listContacts: vi.fn(),
  listOrganizations: vi.fn(),
  getLogs: vi.fn(),
}));
vi.mock('../services/knowledgeBaseService', () => ({
  listDocuments: svc.listDocuments,
  listTags: svc.listTags,
}));
vi.mock('../services/contactsService', () => ({ listContacts: svc.listContacts }));
vi.mock('../services/organizationService', () => ({ listOrganizations: svc.listOrganizations }));
vi.mock('../services/communicatorService', () => ({ getLogs: svc.getLogs }));

import { useSettingsDataOverview } from './useSettingsDataOverview';
import { buildKnowledgeData, groupThreads } from '../pages/Assistant/format';

beforeEach(() => {
  vi.clearAllMocks();
  svc.listDocuments.mockResolvedValue([]);
  svc.listTags.mockResolvedValue([]);
  svc.listContacts.mockResolvedValue([]);
  svc.listOrganizations.mockResolvedValue([]);
  svc.getLogs.mockResolvedValue([]);
});

describe('useSettingsDataOverview - fetches only what it needs', () => {
  it('calls each of the 5 services exactly once on mount, with the expected args', async () => {
    const { result } = renderHook(() => useSettingsDataOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(svc.listDocuments).toHaveBeenCalledTimes(1);
    expect(svc.listDocuments).toHaveBeenCalledWith({ limit: 200 });
    expect(svc.listTags).toHaveBeenCalledTimes(1);
    expect(svc.listContacts).toHaveBeenCalledTimes(1);
    expect(svc.listOrganizations).toHaveBeenCalledTimes(1);
    expect(svc.getLogs).toHaveBeenCalledTimes(1);
    expect(svc.getLogs).toHaveBeenCalledWith({ limit: 1000 });
  });
});

describe('useSettingsDataOverview - empty-safe defaults', () => {
  it('returns zeroed/empty shapes when every service resolves empty', async () => {
    const { result } = renderHook(() => useSettingsDataOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.knowledge).toEqual({
      counts: { notes: 0, files: 0, links: 0 },
      connectors: [],
      tags: [],
      tagsMore: 0,
    });
    expect(result.current.contacts).toEqual({ list: [], total: 0, mail: 0, phone: 0 });
    expect(result.current.organizations).toEqual([]);
    expect(result.current.conversations).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});

describe('useSettingsDataOverview - contacts aggregation', () => {
  it('splits total/mail/phone from a mixed contact_type list', async () => {
    svc.listContacts.mockResolvedValue([
      { id: '1', contact_type: 'mail' },
      { id: '2', contact_type: 'mail' },
      { id: '3', contact_type: 'phone' },
    ]);

    const { result } = renderHook(() => useSettingsDataOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.contacts.total).toBe(3);
    expect(result.current.contacts.mail).toBe(2);
    expect(result.current.contacts.phone).toBe(1);
    expect(result.current.contacts.list).toHaveLength(3);
  });
});

describe('useSettingsDataOverview - matches the shared pure helpers', () => {
  it('shapes knowledge via the real buildKnowledgeData(documents, tags)', async () => {
    const documents = [
      { content_type: 'note', source: 'manual' },
      { content_type: 'file', source: 'obsidian-vault' },
      { content_type: 'link', source: 'notion:abc' },
    ];
    const tags = ['product', 'pricing'];
    svc.listDocuments.mockResolvedValue(documents);
    svc.listTags.mockResolvedValue(tags);

    const { result } = renderHook(() => useSettingsDataOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.knowledge).toEqual(buildKnowledgeData(documents, tags));
  });

  it('shapes conversations via the real groupThreads(logs)', async () => {
    const logs = [
      { id: 'a', thread_id: 't1', platform: 'telegram', sender_name: 'P. Jackson', created_at: '2026-01-01T00:00:00Z', content: 'hi' },
      { id: 'b', thread_id: 't1', platform: 'telegram', sender_name: 'P. Jackson', created_at: '2026-01-02T00:00:00Z', content: 'bye' },
    ];
    svc.getLogs.mockResolvedValue(logs);

    const { result } = renderHook(() => useSettingsDataOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.conversations).toEqual(groupThreads(logs));
  });
});

describe('useSettingsDataOverview - Promise.allSettled resilience', () => {
  it('still populates the other fields when one service rejects', async () => {
    svc.listContacts.mockRejectedValueOnce(new Error('boom'));
    svc.listDocuments.mockResolvedValue([{ content_type: 'note', source: 'manual' }]);

    const { result } = renderHook(() => useSettingsDataOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.contacts).toEqual({ list: [], total: 0, mail: 0, phone: 0 });
    expect(result.current.knowledge.counts.notes).toBe(1);
    expect(result.current.error).toBeNull();
  });
});

describe('useSettingsDataOverview - refetch', () => {
  it('re-invokes all 5 service calls', async () => {
    const { result } = renderHook(() => useSettingsDataOverview());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.refetch();
    });

    expect(svc.listDocuments).toHaveBeenCalledTimes(2);
    expect(svc.listTags).toHaveBeenCalledTimes(2);
    expect(svc.listContacts).toHaveBeenCalledTimes(2);
    expect(svc.listOrganizations).toHaveBeenCalledTimes(2);
    expect(svc.getLogs).toHaveBeenCalledTimes(2);
  });
});
