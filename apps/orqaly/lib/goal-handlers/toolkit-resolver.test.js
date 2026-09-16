import { describe, expect, it } from 'vitest';
import { resolveToolkit } from './toolkit-resolver.js';

describe('resolveToolkit', () => {
  const baseAgent = { id: 'a1', name: 'Frontend Developer', metadata: {} };

  it('returns no tools when the task has no explicit requirement', () => {
    const tools = resolveToolkit({
      agent: { ...baseAgent, metadata: { tools: ['tool-github'] } },
      job: {},
      userTools: ['tool-github'],
    });
    expect(tools).toEqual([]);
  });

  it('returns only task requirements granted to the agent and currently available', () => {
    const tools = resolveToolkit({
      agent: { ...baseAgent, metadata: { tools: ['tool-github', 'tool-web-search'] } },
      job: { tool_requirements: ['github', 'web-search', 'pexels'] },
      userTools: ['tool-github', 'tool-web-search', 'tool-pexels', 'tool-email'],
    });
    expect(tools).toEqual(['tool-github', 'tool-web-search']);
  });

  it('accepts installed skills and connected MCP libraries as agent grants', () => {
    const tools = resolveToolkit({
      agent: baseAgent,
      job: { tool_requirements: ['seo-analyzer', 'mcp-github', 'email'] },
      skillTools: ['tool-seo-analyzer', 'tool-keyword-planner'],
      connectedTools: ['mcp-github'],
      userTools: ['tool-seo-analyzer', 'mcp-github', 'tool-email'],
    });
    expect(tools).toEqual(['tool-seo-analyzer', 'mcp-github']);
  });

  it('never injects an unrelated configured user tool', () => {
    const tools = resolveToolkit({
      agent: { ...baseAgent, metadata: { tools: ['tool-github', 'tool-stripe'] } },
      job: { tool_requirements: ['github'] },
      userTools: ['tool-github', 'tool-stripe'],
    });
    expect(tools).toEqual(['tool-github']);
  });

  it('does not infer a role-based grant when Agent Hub has no explicit grant', () => {
    const tools = resolveToolkit({
      agent: baseAgent,
      job: { tool_requirements: ['github'] },
      userTools: ['tool-github'],
      fallback: () => ['tool-github'],
    });
    expect(tools).toEqual([]);
  });

  it('normalizes explicit unknown grants consistently', () => {
    const tools = resolveToolkit({
      agent: { ...baseAgent, metadata: { tools: ['not-a-tool'] } },
      job: { tool_requirements: ['not-a-tool'] },
      userTools: ['tool-not-a-tool'],
    });
    expect(tools).toEqual(['tool-not-a-tool']);
  });

  it('preserves explicit requirement order', () => {
    const tools = resolveToolkit({
      agent: { ...baseAgent, metadata: { tools: ['tool-a', 'tool-d'] } },
      job: { tool_requirements: ['d', 'b', 'a'] },
      skillTools: ['tool-b'],
      userTools: ['tool-a', 'tool-b', 'tool-c', 'tool-d'],
    });
    expect(tools).toEqual(['tool-d', 'tool-b', 'tool-a']);
  });
});
