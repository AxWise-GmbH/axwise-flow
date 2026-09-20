#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { evaluateLintWithJev } from '../packages/omp-mcp-server/src/jev-lint-models.mjs';

export function resolveApiKey() {
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY;
  try {
    const envFile = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    const match = envFile.match(/^TYPESAFE_API_KEY=(.*)$/m);
    if (match) return match[1].trim();
  } catch {}
  return null;
}

export const API_KEY = resolveApiKey();

export function runPreCommitCheck() {
  let stagedFiles;
  try {
    stagedFiles = execFileSync('git', ['diff', '--cached', '--name-only'], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    process.exit(0);
  }

  if (!stagedFiles.length) {
    process.exit(0);
  }

  const codeFiles = stagedFiles.filter((f) =>
    /\.(?:js|jsx|ts|tsx|mjs|cjs|py)$/.test(f)
  );

  if (!codeFiles.length) {
    process.exit(0);
  }

  let diff;
  try {
    diff = execFileSync('git', ['diff', '--cached', '--', ...codeFiles], {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
    });
  } catch (error) {
    console.warn('TypeSafe Jev pre-commit: could not extract staged diff:', error.message);
    process.exit(0);
  }

  if (!diff.trim()) {
    process.exit(0);
  }

  console.log(`🔍 TypeSafe Jev Pre-Commit Hook: evaluating ${codeFiles.length} staged file(s)...`);

  evaluateLintWithJev({
    codeSnippet: diff,
    rulesetKey: 'ALL',
    apiKey: API_KEY,
  })
    .then((verdict) => {
      if (!verdict.evaluated) {
        console.log(`ℹ️  TypeSafe Jev skipped (${verdict.reason || 'unconfigured'}).`);
        process.exit(0);
      }

      const errors = (verdict.violations || []).filter((v) => v.severity === 'error');
      const warnings = (verdict.violations || []).filter((v) => v.severity === 'warning');

      if (errors.length > 0) {
        console.error(`\n❌ TypeSafe Jev Pre-Commit Gate REJECTED the commit (${verdict.latencyMs}ms):`);
        for (const err of errors) {
          console.error(`   • [ERROR] ${err.rule} (confidence: ${(err.confidence * 100).toFixed(1)}%)`);
        }
        for (const warn of warnings) {
          console.warn(`   • [WARN]  ${warn.rule} (confidence: ${(warn.confidence * 100).toFixed(1)}%)`);
        }
        console.error('\nPlease resolve the errors above before committing.\n');
        process.exit(1);
      }

      if (warnings.length > 0) {
        console.log(`⚠️  TypeSafe Jev: passed with ${warnings.length} warning(s) (${verdict.latencyMs}ms)`);
        for (const warn of warnings) {
          console.log(`   • [WARN] ${warn.rule} (confidence: ${(warn.confidence * 100).toFixed(1)}%)`);
        }
      } else {
        console.log(`✅ TypeSafe Jev: 100% clean check (${verdict.latencyMs}ms, model: ${verdict.model})`);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.warn('TypeSafe Jev check deferred on network error:', err.message);
      process.exit(0);
    });
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  runPreCommitCheck();
}
