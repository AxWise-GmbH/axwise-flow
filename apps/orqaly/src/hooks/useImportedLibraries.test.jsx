import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const listImportedLibraries = vi.fn();
const apiImportLibrary = vi.fn();
const apiRemoveImportedLibrary = vi.fn();
const createTool = vi.fn();
const getAllTools = vi.fn();
const createSkill = vi.fn();
const listSkills = vi.fn();

vi.mock('../services/importedLibrariesService', () => ({
  listImportedLibraries: (...a) => listImportedLibraries(...a),
  importLibrary: (...a) => apiImportLibrary(...a),
  removeImportedLibrary: (...a) => apiRemoveImportedLibrary(...a),
}));
vi.mock('../services/toolService', () => ({
  createTool: (...a) => createTool(...a),
  getAllTools: (...a) => getAllTools(...a),
}));
vi.mock('../services/agentSkillsService', () => ({
  createSkill: (...a) => createSkill(...a),
  listSkills: (...a) => listSkills(...a),
}));

const useImportedLibraries = (await import('./useImportedLibraries')).default;

beforeEach(() => {
  vi.clearAllMocks();
  listImportedLibraries.mockResolvedValue([]);
  apiImportLibrary.mockResolvedValue({ id: 'row' });
  apiRemoveImportedLibrary.mockResolvedValue(true);
  getAllTools.mockResolvedValue([]);
  listSkills.mockResolvedValue([]);
  createTool.mockResolvedValue({});
  createSkill.mockResolvedValue({ id: 'sk' });
});

describe('useImportedLibraries', () => {
  it('loads libraries and flattens tagged importedItems', async () => {
    listImportedLibraries.mockResolvedValue([
      { id: 'r1', sourceId: 'lib-a', name: 'Lib A', items: [{ id: 'i1', name: 'One' }] },
    ]);
    const { result } = renderHook(() => useImportedLibraries('agents'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.importedItems).toHaveLength(1);
    expect(result.current.importedItems[0]).toMatchObject({
      _imported: true,
      _sourceId: 'lib-a',
      _sourceName: 'Lib A',
      name: 'One',
    });
    expect(result.current.importedSources[0]).toMatchObject({ sourceId: 'lib-a', itemCount: 1 });
    expect(result.current.isImported('lib-a')).toBe(true);
  });

  it('importLibrary POSTs the mapped payload for a catalog category', async () => {
    const { result } = renderHook(() => useImportedLibraries('agents'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.importLibrary({ id: 'lib-x', name: 'X', items: [{ _id: 'a' }] });
    });
    expect(apiImportLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'agents', sourceId: 'lib-x', name: 'X' })
    );
    expect(createTool).not.toHaveBeenCalled();
    expect(createSkill).not.toHaveBeenCalled();
  });

  it('materializes tools via createTool (skipping ids that already exist)', async () => {
    getAllTools.mockResolvedValue([{ id: 'existing' }]);
    const { result } = renderHook(() => useImportedLibraries('tools'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.importLibrary({
        id: 'lib-t',
        name: 'T',
        items: [
          { id: 'existing', name: 'Dup' },
          { id: 'fresh', name: 'Fresh' },
        ],
      });
    });
    expect(createTool).toHaveBeenCalledTimes(1);
    expect(createTool).toHaveBeenCalledWith(expect.objectContaining({ id: 'fresh' }));
  });

  it('materializes skills via createSkill (skipping slugs that already exist)', async () => {
    listSkills.mockResolvedValue([{ slug: 'dup' }]);
    const { result } = renderHook(() => useImportedLibraries('skills'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.importLibrary({
        id: 'lib-s',
        name: 'S',
        items: [
          { slug: 'dup', name: 'Dup', content: '# x' },
          { slug: 'new', name: 'New', content: '# y' },
        ],
      });
    });
    expect(createSkill).toHaveBeenCalledTimes(1);
    expect(createSkill).toHaveBeenCalledWith(expect.objectContaining({ name: 'New' }));
  });

  it('importItems POSTs only the passed subset when nothing is imported yet', async () => {
    const { result } = renderHook(() => useImportedLibraries('agents'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.importItems(
        { id: 'lib-x', name: 'X' },
        [{ _id: 'a', name: 'A' }]
      );
    });
    expect(apiImportLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'agents',
        sourceId: 'lib-x',
        items: [{ _id: 'a', name: 'A' }],
      })
    );
  });

  it('importItems unions with the already-imported items for that source', async () => {
    listImportedLibraries.mockResolvedValue([
      { id: 'row', sourceId: 'lib-x', name: 'X', items: [{ _id: 'a', name: 'A' }] },
    ]);
    const { result } = renderHook(() => useImportedLibraries('agents'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      // re-select 'a' (already imported) plus a new 'b'
      await result.current.importItems({ id: 'lib-x', name: 'X' }, [
        { _id: 'a', name: 'A' },
        { _id: 'b', name: 'B' },
      ]);
    });
    const payload = apiImportLibrary.mock.calls[0][0];
    expect(payload.items.map((i) => i._id)).toEqual(['a', 'b']);
  });

  it('importItems materializes only the selected tools', async () => {
    const { result } = renderHook(() => useImportedLibraries('tools'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.importItems({ id: 'lib-t', name: 'T' }, [
        { id: 'fresh', name: 'Fresh' },
      ]);
    });
    expect(createTool).toHaveBeenCalledTimes(1);
    expect(createTool).toHaveBeenCalledWith(expect.objectContaining({ id: 'fresh' }));
  });

  it('importItems does nothing when given an empty selection', async () => {
    const { result } = renderHook(() => useImportedLibraries('agents'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.importItems({ id: 'lib-x', name: 'X' }, []);
    });
    expect(apiImportLibrary).not.toHaveBeenCalled();
  });

  it('removeLibrary calls the service', async () => {
    const { result } = renderHook(() => useImportedLibraries('agents'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.removeLibrary('row-1');
    });
    expect(apiRemoveImportedLibrary).toHaveBeenCalledWith('row-1');
  });

  it('addCustomLibrary rejects invalid JSON', async () => {
    const { result } = renderHook(() => useImportedLibraries('agents'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let res;
    await act(async () => {
      res = await result.current.addCustomLibrary({ name: 'Mine', json: '{not json' });
    });
    expect(res.ok).toBe(false);
    expect(apiImportLibrary).not.toHaveBeenCalled();
  });

  it('addCustomLibrary rejects items missing required fields', async () => {
    const { result } = renderHook(() => useImportedLibraries('agents'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let res;
    await act(async () => {
      // agents require role + system_prompt
      res = await result.current.addCustomLibrary({ name: 'Mine', json: '[{"name":"x"}]' });
    });
    expect(res.ok).toBe(false);
    expect(apiImportLibrary).not.toHaveBeenCalled();
  });

  it('addCustomLibrary accepts a valid custom library', async () => {
    const { result } = renderHook(() => useImportedLibraries('agents'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let res;
    await act(async () => {
      res = await result.current.addCustomLibrary({
        name: 'Mine',
        json: '[{"role":"R","system_prompt":"do x"}]',
      });
    });
    expect(res.ok).toBe(true);
    expect(apiImportLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ custom: true, category: 'agents' })
    );
  });

  it('requires a name for a custom library', async () => {
    const { result } = renderHook(() => useImportedLibraries('agents'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let res;
    await act(async () => {
      res = await result.current.addCustomLibrary({ name: '  ' });
    });
    expect(res.ok).toBe(false);
  });
});
