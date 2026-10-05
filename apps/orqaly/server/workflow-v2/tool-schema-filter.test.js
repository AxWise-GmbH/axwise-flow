import { describe, expect, it } from 'vitest';
import {
  filterDynamicToolSchemas,
  filterToolsByJevLane,
  extractTriageLane,
  hasToolOrExecutionError,
  GOOSE_LANES,
} from './tool-schema-filter.js';

describe('tool-schema-filter', () => {
  const allTools = [
    { type: 'function', function: { name: 'shell' } },
    { type: 'function', function: { name: 'write' } },
    { type: 'function', function: { name: 'ast_search' } },
    { type: 'function', function: { name: 'lsp_query' } },
    { type: 'function', function: { name: 'desktop-utilities__get_weather' } },
    { type: 'function', function: { name: 'desktop-utilities__search_web' } },
    { type: 'function', function: { name: 'axwise-local__prepare_discovery' } },
    { type: 'function', function: { name: 'axwise-local__create_prd' } },
    { type: 'function', function: { name: 'memory__remember_memory' } },
  ];

  it('extracts triage lane from headers or embedded prompt resources', () => {
    expect(extractTriageLane({}, { 'x-jev-lane': 'quick_info' })).toBe('quick_info');
    expect(extractTriageLane({ lane: 'research' })).toBe('research');

    const embeddedBody = {
      messages: [
        {
          role: 'system',
          content: JSON.stringify({
            kind: 'orqaly.jev-triage.v1',
            lane: 'local_engineering',
          }),
        },
      ],
    };
    expect(extractTriageLane(embeddedBody)).toBe('local_engineering');
  });

  it('prunes research and native tools on quick_info lane', () => {
    const body = { lane: 'quick_info', messages: [{ role: 'user', content: 'What is the weather?' }] };
    const filtered = filterDynamicToolSchemas(allTools, body);
    const names = filtered.map((t) => t.function.name);

    expect(names).toContain('desktop-utilities__get_weather');
    expect(names).toContain('desktop-utilities__search_web');
    expect(names).toContain('shell'); // Core preserved
    expect(names).not.toContain('ast_search');
    expect(names).not.toContain('axwise-local__create_prd');
  });

  it('prunes weather and axwise on local_engineering lane while preserving native tools if needed', () => {
    const body = {
      lane: 'local_engineering',
      messages: [{ role: 'user', content: 'Refactor UserService across consumers' }],
    };
    const filtered = filterDynamicToolSchemas(allTools, body);
    const names = filtered.map((t) => t.function.name);

    expect(names).toContain('shell');
    expect(names).toContain('ast_search');
    expect(names).not.toContain('desktop-utilities__get_weather');
    expect(names).not.toContain('axwise-local__prepare_discovery');
  });

  it('preserves web search and un-gates native tools when recovering from a tool execution error (Gap 1)', () => {
    const failedTurnBody = {
      lane: 'local_engineering',
      messages: [
        { role: 'user', content: 'Install and configure grpc' },
        { role: 'assistant', content: 'Running npm install...' },
        {
          role: 'tool',
          tool_call_id: 'c1',
          content: 'Error: Cannot find module @grpc/grpc-js (compilation error)',
        },
      ],
    };

    expect(hasToolOrExecutionError(failedTurnBody)).toBe(true);

    const filtered = filterDynamicToolSchemas(allTools, failedTurnBody);
    const names = filtered.map((t) => t.function.name);

    // Search is un-pruned so the agent can look up error resolutions
    expect(names).toContain('desktop-utilities__search_web');
    // Diagnostic native engineering tools are un-gated
    expect(names).toContain('ast_search');
    expect(names).toContain('lsp_query');
    expect(names).toContain('shell');
    // Still excludes unrelated PRD creation
    expect(names).not.toContain('axwise-local__create_prd');
  });

  it('preserves full toolset when lane is mixed', () => {
    const body = {
      lane: 'mixed',
      messages: [{ role: 'user', content: 'Refactor code and look up weather' }],
    };
    const filtered = filterDynamicToolSchemas(allTools, body);
    expect(filtered.length).toBe(allTools.length);
  });
});
