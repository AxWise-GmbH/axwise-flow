import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const mcpBinary = process.env.AXWISE_MCP_BINARY || '/Users/admin/.local/bin/axwise-mcp';

class McpClient {
  constructor(binaryPath) {
    this.child = spawn(binaryPath, [], {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: {
        ...process.env,
        AXWISE_GEMINI_MODEL: process.env.AXWISE_GEMINI_MODEL || 'gemini-3.8-flash',
      },
    });

    this.pending = new Map();
    this.rl = createInterface({ input: this.child.stdout });
    this.rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
          else resolve(msg.result);
        }
      } catch (err) {
        console.error('Failed to parse line:', line, err);
      }
    });

    this.child.on('error', (err) => {
      for (const { reject } of this.pending.values()) {
        reject(err);
      }
      this.pending.clear();
    });
  }

  async call(toolName, argumentsObj) {
    const id = `req-${toolName}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: argumentsObj,
      },
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout waiting for response to ${toolName}`));
      }, 120_000);

      this.pending.set(id, {
        resolve: (res) => {
          clearTimeout(timer);
          resolve(res);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.child.stdin.write(JSON.stringify(payload) + '\n');
    });
  }

  async listTools() {
    const id = 'req-list-tools';
    const payload = {
      jsonrpc: '2.0',
      id,
      method: 'tools/list',
    };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(JSON.stringify(payload) + '\n');
    });
  }

  close() {
    this.child.kill('SIGTERM');
  }
}

test('Automated end-to-end execution across all 8 AxWise tools', async (t) => {
  const client = new McpClient(mcpBinary);

  t.after(() => {
    client.close();
  });

  const toolsList = await client.listTools();
  assert.ok(Array.isArray(toolsList.tools));
  assert.equal(toolsList.tools.length, 8, 'Expected all 8 tools in tools/list');

  const testCases = [
    {
      tool: 'create_prd',
      args: { brief: 'Ultra-low latency thread-safe ring buffer in Rust' },
      validate: (result) => {
        assert.ok(result.structuredContent.artifact.title || result.structuredContent.artifact.sections);
      },
    },
    {
      tool: 'prepare_discovery',
      args: { brief: 'Local SQLite caching proxy layer in Rust' },
      validate: (result) => {
        assert.ok(result.structuredContent.artifact.decision || result.structuredContent.artifact.scope);
      },
    },
    {
      tool: 'simulate_interviews',
      args: {
        scenario: 'Assessing high-concurrency memory allocators in Rust',
        seed: 42,
        stakeholders: [
          {
            id: 'perf_eng',
            label: 'Performance Engineer',
            description: 'Focuses on microsecond GC and memory fragmentation',
            questions: ['What causes tail latency spikes in your current allocator?'],
          },
        ],
      },
      validate: (result) => {
        assert.ok(result.structuredContent.artifact);
      },
    },
    {
      tool: 'analyze_interviews',
      args: {
        decisionQuestion: 'Should we replace jemalloc with a custom arena allocator?',
        transcripts: [
          {
            id: 'tx-1',
            title: 'Infrastructure Architect Interview',
            origin: 'supplied_transcript',
            turns: [
              {
                role: 'participant',
                speaker: 'Elena',
                text: 'Jemalloc is solid but under huge socket buffer loads we see memory fragmentation exceeding 40%.',
              },
            ],
          },
        ],
      },
      validate: (result) => {
        assert.ok(result.structuredContent.artifact);
      },
    },
    {
      tool: 'research_market',
      args: {
        brief: 'Ecosystem analysis of embedded zero-copy databases in Rust',
        questions: ['What are the trade-offs between Sled, Redb, and Fjall?'],
      },
      validate: (result) => {
        assert.ok(result.structuredContent.artifact);
      },
    },
    {
      tool: 'generate_personas',
      args: {
        brief: 'Continuous profiling and tracing tool for distributed Rust microservices',
        stakeholders: [
          {
            id: 'sre',
            label: 'Site Reliability Engineer',
            description: 'Monitors production eBPF traces and p99.9 latency SLA violations',
          },
        ],
      },
      validate: (result) => {
        assert.ok(result.structuredContent.artifact);
      },
    },
    {
      tool: 'chat_with_persona',
      args: {
        personaId: 'sre',
        message: 'How much CPU overhead can you tolerate for continuous eBPF CPU profiling?',
      },
      validate: (result) => {
        assert.ok(result.structuredContent.artifact);
      },
    },
    {
      tool: 'create_delivery_brief',
      args: {
        brief: 'Handoff specifications for Rust ring-buffer implementation',
        requirement_ids: ['FR-001', 'FR-002'],
      },
      validate: (result) => {
        assert.ok(result.structuredContent.artifact);
      },
    },
  ];

  for (const { tool, args, validate } of testCases) {
    await t.test(`E2E live test for tool: ${tool}`, async () => {
      console.log(`\n⏳ Running live tool test: ${tool}...`);
      const t0 = performance.now();
      const result = await client.call(tool, args);
      const elapsed = Math.round(performance.now() - t0);

      assert.ok(result, 'Expected result object');
      assert.ok(Array.isArray(result.content), 'Expected content array');
      assert.ok(result.content[0]?.text?.length > 50, 'Expected substantive text content');

      const sc = result.structuredContent;
      assert.ok(sc, 'Expected structuredContent');
      assert.equal(sc.tool, tool, `Expected structuredContent.tool == ${tool}`);
      assert.equal(sc.status, 'completed', 'Expected status == completed');
      assert.ok(sc.sha256, 'Expected sha256 hash');
      assert.ok(sc.artifactPath, 'Expected artifactPath');
      assert.ok(sc.markdownPath, 'Expected markdownPath');

      assert.ok(existsSync(sc.artifactPath), `Expected JSON file on disk: ${sc.artifactPath}`);
      assert.ok(existsSync(sc.markdownPath), `Expected MD file on disk: ${sc.markdownPath}`);

      const jsonBytes = readFileSync(sc.artifactPath, 'utf8');
      assert.ok(jsonBytes.length > 50, 'JSON file on disk should not be empty');

      validate(result);
      console.log(`✅ Tool ${tool} passed in ${elapsed}ms (SHA: ${sc.sha256.slice(0, 12)}...)`);
    });
  }
});
