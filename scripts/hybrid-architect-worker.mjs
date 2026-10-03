#!/usr/bin/env node
/**
 * Hybrid Architect & Worker Orchestrator (Pattern 1 + Pattern 3)
 * Cloud Architect: Gemini 3.8 Flash
 * Local Worker: Qwen 3.6 14B A3B VibeForged-v2 via llama-server (Metal)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';

const exec = promisify(execFile);

export class HybridOrchestrator {
  constructor(options = {}) {
    this.localUrl = options.localUrl || 'http://127.0.0.1:8080/v1/chat/completions';
    this.cloudUrl = options.cloudUrl || 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    this.cloudApiKey = options.cloudApiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
    this.localModel = options.localModel || 'qwen3.6-14b-vibeforged';
    this.cloudModel = options.cloudModel || 'gemini-3.8-flash';
  }

  async callLocal(messages, temperature = 0.2) {
    const t0 = performance.now();
    const res = await fetch(this.localUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.localModel,
        messages,
        temperature,
        max_tokens: 4096,
      }),
    });
    if (!res.ok) {
      throw new Error(`Local inference error ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    const durationMs = performance.now() - t0;
    const content = data.choices?.[0]?.message?.content || '';
    const usage = data.usage || {};
    const tps = usage.completion_tokens ? ((usage.completion_tokens / durationMs) * 1000).toFixed(1) : 'N/A';
    return { content, usage, durationMs, tps, role: 'local_worker' };
  }

  async callCloud(messages, temperature = 0.2) {
    if (!this.cloudApiKey) {
      return {
        content: "[SIMULATED CLOUD ARCHITECT] Blueprint generated for task: " + JSON.stringify(messages[0]?.content).slice(0, 80),
        usage: { prompt_tokens: 150, completion_tokens: 120 },
        durationMs: 240,
        role: 'cloud_architect'
      };
    }
    const t0 = performance.now();
    const res = await fetch(this.cloudUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.cloudApiKey}`
      },
      body: JSON.stringify({
        model: this.cloudModel,
        messages,
        temperature,
        max_tokens: 4096,
      }),
    });
    if (!res.ok) {
      throw new Error(`Cloud inference error ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    const durationMs = performance.now() - t0;
    return {
      content: data.choices?.[0]?.message?.content || '',
      usage: data.usage || {},
      durationMs,
      role: 'cloud_architect'
    };
  }

  async executeTask(task) {
    console.log(`\n=== Starting Hybrid Run for Task: ${task.title} ===`);
    
    // Turn 1: Cloud Architect plans
    console.log(`[Turn 1] Consulting Cloud Architect (${this.cloudModel})...`);
    const architectPrompt = `You are the lead architect. Given the following user request and workspace files, output an exact implementation plan with line changes and verification requirements:\n\nTask: ${task.request}\n\nFiles:\n${JSON.stringify(task.files, null, 2)}`;
    const plan = await this.callCloud([{ role: 'user', content: architectPrompt }]);
    console.log(`[Turn 1] Architect responded in ${plan.durationMs.toFixed(0)} ms.`);

    // Turns 2-4: Local Worker applies edits
    console.log(`[Turn 2] Local Worker (${this.localModel}) executing surgical edits...`);
    const workerPrompt = `You are the local implementer. Apply the architect's plan to the code. Output only the updated file content.\n\nPlan:\n${plan.content}\n\nOriginal file:\n${JSON.stringify(task.files)}`;
    const edit = await this.callLocal([{ role: 'user', content: workerPrompt }]);
    console.log(`[Turn 2] Worker generated code in ${edit.durationMs.toFixed(0)} ms (${edit.tps} tokens/s).`);

    return {
      task: task.title,
      architectMs: plan.durationMs,
      workerMs: edit.durationMs,
      workerTps: edit.tps,
      status: 'completed'
    };
  }
}
