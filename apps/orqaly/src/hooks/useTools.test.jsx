import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAllTools: vi.fn(),
  deleteTool: vi.fn(),
}));

vi.mock('../services/toolService', () => ({
  getAllTools: mocks.getAllTools,
  createTool: vi.fn(),
  updateTool: vi.fn(),
  deleteTool: mocks.deleteTool,
  blockTool: vi.fn(),
}));

import { useTools } from './useTools';

const ownedTool = { id: 'tool-owned', name: 'Owned tool', status: 'active' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAllTools.mockResolvedValue([ownedTool]);
  mocks.deleteTool.mockResolvedValue(true);
});

describe('useTools removeTool', () => {
  it('retains the tool and exposes the actionable credential guard rejection', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const guarded = Object.assign(
      new Error("Delete this tool's saved credential first, then retry deleting the tool."),
      { code: 'TOOL_CREDENTIAL_DELETE_REQUIRED' }
    );
    mocks.deleteTool.mockRejectedValueOnce(guarded);
    const { result } = renderHook(() => useTools());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let rejection;
    await act(async () => {
      rejection = await result.current.removeTool(ownedTool.id).catch((error) => error);
    });

    expect(rejection).toBe(guarded);
    expect(result.current.tools).toEqual([ownedTool]);
    expect(result.current.error).toMatch(/delete.*credential first/i);
    expect(warning).toHaveBeenCalledWith('[useTools] removeTool failed:', guarded);
    warning.mockRestore();
  });

  it('removes the tool from local state only after authoritative deletion succeeds', async () => {
    const { result } = renderHook(() => useTools());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.removeTool(ownedTool.id);
    });

    expect(mocks.deleteTool).toHaveBeenCalledWith(ownedTool.id);
    expect(result.current.tools).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
