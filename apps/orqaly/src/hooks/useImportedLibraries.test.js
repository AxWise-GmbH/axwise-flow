/**
 * Tests for useImportedLibraries - agent import merge behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockListImportedLibraries = vi.fn();
const mockImportLibrary = vi.fn();
const mockRemoveImportedLibrary = vi.fn();

vi.mock('../services/importedLibrariesService', () => ({
  listImportedLibraries: (...args) => mockListImportedLibraries(...args),
  importLibrary: (...args) => mockImportLibrary(...args),
  removeImportedLibrary: (...args) => mockRemoveImportedLibrary(...args),
}));

vi.mock('../services/toolService', () => ({
  createTool: vi.fn(),
  getAllTools: vi.fn(async () => []),
}));

vi.mock('../services/agentSkillsService', () => ({
  createSkill: vi.fn(),
  listSkills: vi.fn(async () => []),
}));

const useImportedLibraries = (await import('./useImportedLibraries.js')).default;

beforeEach(() => {
  mockListImportedLibraries.mockClear();
  mockImportLibrary.mockClear();
  mockRemoveImportedLibrary.mockClear();
  mockListImportedLibraries.mockResolvedValue([]);
  mockImportLibrary.mockResolvedValue({});
  mockRemoveImportedLibrary.mockResolvedValue(true);
});

describe('useImportedLibraries - agents category', () => {
  it('calls importLibrary with correct payload when importing agents', async () => {
    const { result } = renderHook(() => useImportedLibraries('agents'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.importItems(
        {
          id: 'github:o/r',
          name: 'o/r',
          url: 'https://github.com/o/r',
          custom: false,
        },
        [
          {
            _id: 'a1',
            role: 'Triage',
            system_prompt: 'You are a triage agent that routes requests efficiently.',
          },
        ]
      );
    });

    expect(mockImportLibrary).toHaveBeenCalledWith({
      category: 'agents',
      sourceId: 'github:o/r',
      name: 'o/r',
      description: null,
      author: null,
      url: 'https://github.com/o/r',
      custom: false,
      items: [
        {
          _id: 'a1',
          role: 'Triage',
          system_prompt: 'You are a triage agent that routes requests efficiently.',
        },
      ],
    });
  });

  it('merges new items with existing items for the same source', async () => {
    mockListImportedLibraries.mockResolvedValue([
      {
        id: 'lib-1',
        sourceId: 'github:o/r',
        name: 'o/r',
        items: [
          { _id: 'a1', role: 'Triage', system_prompt: 'Triage agent.' },
        ],
      },
    ]);

    const { result } = renderHook(() => useImportedLibraries('agents'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.importItems(
        {
          id: 'github:o/r',
          name: 'o/r',
          url: 'https://github.com/o/r',
          custom: false,
        },
        [
          { _id: 'a2', role: 'Reviewer', system_prompt: 'You review outputs.' },
        ]
      );
    });

    expect(mockImportLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ _id: 'a1' }),
          expect.objectContaining({ _id: 'a2' }),
        ]),
      })
    );

    expect(mockImportLibrary.mock.calls[0][0].items).toHaveLength(2);
  });

  it('does not duplicate items with the same _id', async () => {
    mockListImportedLibraries.mockResolvedValue([
      {
        id: 'lib-1',
        sourceId: 'github:o/r',
        name: 'o/r',
        items: [
          { _id: 'a1', role: 'Triage', system_prompt: 'Triage agent.' },
        ],
      },
    ]);

    const { result } = renderHook(() => useImportedLibraries('agents'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.importItems(
        {
          id: 'github:o/r',
          name: 'o/r',
          url: 'https://github.com/o/r',
          custom: false,
        },
        [
          { _id: 'a1', role: 'Triage Updated', system_prompt: 'Updated triage agent.' },
        ]
      );
    });

    expect(mockImportLibrary.mock.calls[0][0].items).toHaveLength(1);
    expect(mockImportLibrary.mock.calls[0][0].items[0].role).toBe('Triage');
  });

  it('does not call materialize for agents category (no createTool/createSkill)', async () => {
    const toolService = await import('../services/toolService');
    const skillService = await import('../services/agentSkillsService');

    const { result } = renderHook(() => useImportedLibraries('agents'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.importItems(
        {
          id: 'github:o/r',
          name: 'o/r',
          url: 'https://github.com/o/r',
          custom: false,
        },
        [
          { _id: 'a1', role: 'Triage', system_prompt: 'Triage agent.' },
        ]
      );
    });

    expect(toolService.createTool).not.toHaveBeenCalled();
    expect(skillService.createSkill).not.toHaveBeenCalled();
  });

  it('returns empty items when no libraries imported', async () => {
    mockListImportedLibraries.mockResolvedValue([]);

    const { result } = renderHook(() => useImportedLibraries('agents'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.importedItems).toEqual([]);
    expect(result.current.importedSources).toEqual([]);
  });

  it('handles empty items array gracefully', async () => {
    const { result } = renderHook(() => useImportedLibraries('agents'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.importItems(
        {
          id: 'github:o/r',
          name: 'o/r',
          url: 'https://github.com/o/r',
          custom: false,
        },
        []
      );
    });

    expect(mockImportLibrary).not.toHaveBeenCalled();
  });
});
