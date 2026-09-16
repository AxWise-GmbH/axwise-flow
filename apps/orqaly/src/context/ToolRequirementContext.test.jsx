import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before imports
vi.mock('../config/predefinedAgents', () => ({
  PREDEFINED_AGENTS: [
    { role: 'CTO', tools: ['tool-web-search', 'tool-github', 'mcp-github'] },
    { role: 'Designer', tools: ['tool-web-search'] },
    { role: 'CFO', tools: ['tool-web-search', 'tool-financial-data'], consiliumMode: 'manual' },
  ],
}));

vi.mock('../config/predefinedTools', () => ({
  getToolById: (id) => {
    const defs = {
      'tool-web-search': {
        id: 'tool-web-search',
        name: 'Web Search',
        connectionType: 'api',
        credentials: [{ key: 'TAVILY_API_KEY' }],
      },
      'tool-github': {
        id: 'tool-github',
        name: 'GitHub',
        connectionType: 'api',
        credentials: [{ key: 'GITHUB_TOKEN' }],
      },
      'mcp-github': {
        id: 'mcp-github',
        name: 'GitHub MCP',
        connectionType: 'composio',
        composioApp: 'github',
        credentials: [],
      },
      'tool-financial-data': {
        id: 'tool-financial-data',
        name: 'Financial Data',
        connectionType: 'api',
        credentials: [{ key: 'ALPHA_VANTAGE_KEY' }],
      },
    };
    return defs[id] || null;
  },
}));

vi.mock('../services/toolService', () => ({
  getAllTools: vi
    .fn()
    .mockResolvedValue([
      { id: 'tool-web-search', credentialConfigured: true },
      { id: 'tool-github' },
      { id: 'mcp-github' },
      { id: 'tool-financial-data' },
    ]),
  getToolWhitelist: vi.fn().mockResolvedValue([
    { tool_id: 'tool-github', risk_level: 'medium', requires_approval: false },
    { tool_id: 'mcp-github', risk_level: 'high', requires_approval: true },
  ]),
}));

vi.mock('../services/composioService', () => ({
  fetchComposioConnections: vi.fn().mockResolvedValue([]),
}));

const mockLogAction = vi.fn().mockResolvedValue(undefined);
vi.mock('../services/auditLogBackend', () => ({
  logAction: (...args) => mockLogAction(...args),
}));

import { renderHook, act } from '@testing-library/react';
import { ToolRequirementProvider, useToolRequirements } from './ToolRequirementContext';

function wrapper({ children }) {
  return <ToolRequirementProvider>{children}</ToolRequirementProvider>;
}

describe('ToolRequirementContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    try {
      localStorage.removeItem('orch_consilium_tool_mode');
    } catch {}
  });

  it('starts with popup closed', () => {
    const { result } = renderHook(() => useToolRequirements(), { wrapper });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.toolRequirements).toEqual([]);
    expect(result.current.approvalMode).toBe('auto');
    expect(result.current.rejectedTools).toEqual([]);
  });

  it('showToolRequirements populates tools and opens popup', async () => {
    const { result } = renderHook(() => useToolRequirements(), { wrapper });

    await act(async () => {
      await result.current.showToolRequirements({
        agent: { role: 'CTO' },
        teamName: 'Founder',
        jobId: 'job-1',
      });
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.agentRole).toBe('CTO');
    expect(result.current.teamName).toBe('Founder');
    expect(result.current.toolRequirements).toHaveLength(3);
    expect(result.current.toolRequirements.find((t) => t.id === 'tool-web-search').configured).toBe(
      true
    );
    expect(result.current.toolRequirements.find((t) => t.id === 'tool-github').configured).toBe(
      false
    );
  });

  it('dismissToolRequirements closes popup and clears state', async () => {
    const { result } = renderHook(() => useToolRequirements(), { wrapper });

    await act(async () => {
      await result.current.showToolRequirements({ agent: { role: 'CTO' }, teamName: 'Founder' });
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.dismissToolRequirements();
    });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.toolRequirements).toEqual([]);
  });

  it('markToolConfigured updates a single tool', async () => {
    const { result } = renderHook(() => useToolRequirements(), { wrapper });

    await act(async () => {
      await result.current.showToolRequirements({ agent: { role: 'CTO' }, teamName: 'Founder' });
    });

    act(() => {
      result.current.markToolConfigured('tool-github');
    });
    expect(result.current.toolRequirements.find((t) => t.id === 'tool-github').configured).toBe(
      true
    );
  });

  it('does not open popup when all tools are already configured', async () => {
    const { result } = renderHook(() => useToolRequirements(), { wrapper });

    await act(async () => {
      await result.current.showToolRequirements({
        agent: { role: 'Designer' },
        teamName: 'Development',
      });
    });

    expect(result.current.isOpen).toBe(false);
  });

  it('toggleMinimize toggles isMinimized', async () => {
    const { result } = renderHook(() => useToolRequirements(), { wrapper });

    await act(async () => {
      await result.current.showToolRequirements({ agent: { role: 'CTO' }, teamName: 'Founder' });
    });

    expect(result.current.isMinimized).toBe(false);
    act(() => {
      result.current.toggleMinimize();
    });
    expect(result.current.isMinimized).toBe(true);
    act(() => {
      result.current.toggleMinimize();
    });
    expect(result.current.isMinimized).toBe(false);
  });

  // ── Consilium governance tests ──────────────────────────────

  it('resolves approvalMode to auto by default', async () => {
    const { result } = renderHook(() => useToolRequirements(), { wrapper });

    await act(async () => {
      await result.current.showToolRequirements({ agent: { role: 'CTO' }, teamName: 'Founder' });
    });

    expect(result.current.approvalMode).toBe('auto');
  });

  it('resolves approvalMode to manual for agents with consiliumMode override', async () => {
    const { result } = renderHook(() => useToolRequirements(), { wrapper });

    await act(async () => {
      await result.current.showToolRequirements({ agent: { role: 'CFO' }, teamName: 'Founder' });
    });

    expect(result.current.approvalMode).toBe('manual');
  });

  it('respects global localStorage setting for approval mode', async () => {
    localStorage.setItem('orch_consilium_tool_mode', 'manual');
    const { result } = renderHook(() => useToolRequirements(), { wrapper });

    await act(async () => {
      await result.current.showToolRequirements({ agent: { role: 'CTO' }, teamName: 'Founder' });
    });

    expect(result.current.approvalMode).toBe('manual');
  });

  it('includes riskLevel from whitelist on tool requirements', async () => {
    const { result } = renderHook(() => useToolRequirements(), { wrapper });

    await act(async () => {
      await result.current.showToolRequirements({ agent: { role: 'CTO' }, teamName: 'Founder' });
    });

    expect(result.current.toolRequirements.find((t) => t.id === 'tool-github').riskLevel).toBe(
      'medium'
    );
    expect(result.current.toolRequirements.find((t) => t.id === 'mcp-github').riskLevel).toBe(
      'high'
    );
    expect(result.current.toolRequirements.find((t) => t.id === 'tool-web-search').riskLevel).toBe(
      'low'
    );
  });

  it('rejectToolConfiguration adds tool to rejectedTools', async () => {
    const { result } = renderHook(() => useToolRequirements(), { wrapper });

    await act(async () => {
      await result.current.showToolRequirements({ agent: { role: 'CTO' }, teamName: 'Founder' });
    });

    act(() => {
      result.current.rejectToolConfiguration('tool-github');
    });
    expect(result.current.rejectedTools).toContain('tool-github');
  });

  it('markToolConfigured calls logAction with audit data', async () => {
    const { result } = renderHook(() => useToolRequirements(), { wrapper });

    await act(async () => {
      await result.current.showToolRequirements({ agent: { role: 'CTO' }, teamName: 'Founder' });
    });

    mockLogAction.mockClear();
    act(() => {
      result.current.markToolConfigured('tool-github');
    });

    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.stringContaining('Tool credential'),
        entity: 'Tool',
        entityId: 'tool-github',
      })
    );
  });

  it('rejectToolConfiguration calls logAction with rejection data', async () => {
    const { result } = renderHook(() => useToolRequirements(), { wrapper });

    await act(async () => {
      await result.current.showToolRequirements({ agent: { role: 'CTO' }, teamName: 'Founder' });
    });

    mockLogAction.mockClear();
    act(() => {
      result.current.rejectToolConfiguration('tool-github');
    });

    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'Tool configuration rejected',
        entity: 'Tool',
        entityId: 'tool-github',
      })
    );
  });

  it('logs Tool requirements surfaced on popup open', async () => {
    mockLogAction.mockClear();
    const { result } = renderHook(() => useToolRequirements(), { wrapper });

    await act(async () => {
      await result.current.showToolRequirements({
        agent: { role: 'CTO' },
        teamName: 'Founder',
        jobId: 'job-1',
      });
    });

    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'Tool requirements surfaced',
        entity: 'Tool',
      })
    );
  });
});
