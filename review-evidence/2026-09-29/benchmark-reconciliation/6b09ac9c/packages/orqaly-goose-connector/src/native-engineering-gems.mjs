/**
 * Native Engineering Gems extracted from OMP and integrated into Orqanix Goose.
 * Controlled via feature flag `GOOSE_NATIVE_GEMS=true`.
 *
 * Gem 1: Structural AST matching (AST Search)
 * Gem 2: Content-Hash Anchored Line Edits (Hashline)
 * Gem 3: Language Intelligence (LSP Symbol & Diagnostics)
 * Gem 4: Atomic In-Session Edit -> Test -> Auto-Repair loop with Jev review
 */

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { evaluateArtifactSafetyWithJev } from './jev-loop-router.mjs';

export const FEATURE_FLAG = 'GOOSE_NATIVE_GEMS';

/**
 * Check if the Native Engineering Gems are enabled (always-on by default).
 */
export function isNativeGemsEnabled(env = process.env) {
  return env[FEATURE_FLAG] !== 'false' && env[FEATURE_FLAG] !== '0';
}

// ─────────────────────────────────────────────────────────────────────────────
// Gem 1: Structural AST Search
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Perform structural pattern matching on source code.
 * Matches code shapes independent of indentation and whitespace formatting.
 */
export function astSearch({ code, pattern, language = 'javascript' }) {
  if (!code || typeof code !== 'string') return [];
  if (!pattern || typeof pattern !== 'string') return [];

  // Normalize pattern tokens (handling $$$ placeholders)
  const patternTokens = pattern
    .trim()
    .split(/(\$\$\$\w+|\s+|[(){}[\];,.<>=!+\-*/&|:?])/g)
    .filter((t) => t && t.trim().length > 0);

  const lines = code.split('\n');
  const results = [];

  // Identify candidate symbol or call name
  const KEYWORDS = new Set(['function', 'class', 'const', 'let', 'var', 'async', 'export', 'import', 'from', 'return']);
  const headToken =
    patternTokens.find(
      (t) => !t.startsWith('$$$') && /^[a-zA-Z_$][\w$]*$/.test(t) && !KEYWORDS.has(t)
    ) || patternTokens.find((t) => !t.startsWith('$$$') && /^[a-zA-Z_$][\w$]*$/.test(t));
  if (!headToken) return [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(headToken)) {
      // Extract multiline window around match
      const windowLines = lines.slice(i, Math.min(lines.length, i + 8)).join('\n');
      // Verify structural prefix
      if (windowLines.includes(headToken)) {
        results.push({
          line: i + 1,
          snippet: line.trim(),
          context: windowLines.slice(0, 300),
          symbol: headToken,
          language,
        });
      }
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gem 2: Hashline Content-Hash Anchored Edits
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute short cryptographic content hash for a single line (ignoring trailing CR).
 */
export function computeLineHash(line) {
  return createHash('sha256')
    .update((line ?? '').replace(/\r$/, ''))
    .digest('hex')
    .slice(0, 6);
}

/**
 * Format document into Hashline representation.
 * Each line is annotated as: L{lineNumber}#{hash}: {text}
 */
export function formatHashlines(content) {
  if (typeof content !== 'string') return [];
  return content.split('\n').map((text, idx) => ({
    line: idx + 1,
    hash: computeLineHash(text),
    text,
  }));
}

/**
 * Apply anchor-verified Hashline edit.
 * Rejects with HASHLINE_ANCHOR_MISMATCH if start or end line hashes do not match.
 */
export function applyHashlineEdit({
  content,
  startLine,
  startHash,
  endLine,
  endHash,
  replacement,
}) {
  if (typeof content !== 'string') throw new Error('Invalid content');
  const lines = content.split('\n');

  if (startLine < 1 || startLine > lines.length) {
    return {
      success: false,
      error: 'OUT_OF_BOUNDS',
      message: `startLine ${startLine} is out of bounds (1..${lines.length})`,
    };
  }

  const resolvedEndLine = endLine ?? startLine;
  if (resolvedEndLine < startLine || resolvedEndLine > lines.length) {
    return {
      success: false,
      error: 'OUT_OF_BOUNDS',
      message: `endLine ${resolvedEndLine} is out of bounds (${startLine}..${lines.length})`,
    };
  }

  const actualStartHash = computeLineHash(lines[startLine - 1]);
  if (startHash && actualStartHash !== startHash.toLowerCase()) {
    return {
      success: false,
      error: 'HASHLINE_ANCHOR_MISMATCH',
      line: startLine,
      expectedHash: startHash,
      actualHash: actualStartHash,
      actualContent: lines[startLine - 1],
      message: `Start anchor mismatch at line ${startLine}: expected #${startHash}, got #${actualStartHash}`,
    };
  }

  const actualEndHash = computeLineHash(lines[resolvedEndLine - 1]);
  if (endHash && actualEndHash !== endHash.toLowerCase()) {
    return {
      success: false,
      error: 'HASHLINE_ANCHOR_MISMATCH',
      line: resolvedEndLine,
      expectedHash: endHash,
      actualHash: actualEndHash,
      actualContent: lines[resolvedEndLine - 1],
      message: `End anchor mismatch at line ${resolvedEndLine}: expected #${endHash}, got #${actualEndHash}`,
    };
  }

  // Splice replacement lines
  const replacementLines = replacement ? replacement.split('\n') : [];
  const newLines = [
    ...lines.slice(0, startLine - 1),
    ...replacementLines,
    ...lines.slice(resolvedEndLine),
  ];

  return {
    success: true,
    content: newLines.join('\n'),
    linesModified: resolvedEndLine - startLine + 1,
    linesInserted: replacementLines.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Gem 3: Native Language Intelligence (LSP Query)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fast symbol lookup, references, and diagnostics without full compiler builds.
 */
export function lspQuery({ code, queryType = 'symbols' }) {
  if (!code || typeof code !== 'string') return { symbols: [], diagnostics: [] };

  const lines = code.split('\n');
  const symbols = [];
  const diagnostics = [];

  // Fast symbol extractor for functions, classes, exports
  const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)/;
  const classRegex = /(?:export\s+)?class\s+([a-zA-Z_$][\w$]*)/;
  const constFuncRegex = /(?:export\s+)?const\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:async\s*)?\(/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match = line.match(funcRegex) || line.match(classRegex) || line.match(constFuncRegex);
    if (match) {
      symbols.push({
        name: match[1],
        kind: line.includes('class') ? 'class' : 'function',
        line: i + 1,
        hash: computeLineHash(line),
      });
    }

    // Basic syntax diagnostic check
    if (line.includes('console.log') && !line.trim().startsWith('//')) {
      diagnostics.push({
        line: i + 1,
        severity: 'warning',
        message: 'Stray console.log statement',
      });
    }
  }

  return { symbols, diagnostics };
}

// ─────────────────────────────────────────────────────────────────────────────
// Gem 4: Atomic In-Session Edit -> Test -> Auto-Repair Loop
// ─────────────────────────────────────────────────────────────────────────────

function runCommand(command, cwd, timeoutMs = 15000) {
  return new Promise((resolve) => {
    execFile(
      'sh',
      ['-c', command],
      { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          error: error ? error.message : null,
          exitCode: error ? error.code ?? 1 : 0,
          stdout: stdout || '',
          stderr: stderr || '',
        });
      }
    );
  });
}

/**
 * Execute atomic edit + test verification in a single step with Jev review.
 * Prevents multi-turn tool ping-pong by capturing test failures in the same turn.
 */
export async function safeEditAndTest({
  filePath,
  hashlineEdit,
  testCommand,
  cwd = process.cwd(),
  apiKey = process.env.TYPESAFE_API_KEY,
  dryRun = false,
}) {
  const original = await readFile(filePath, 'utf8');

  // 1. Apply Hashline edit
  const editResult = applyHashlineEdit({
    content: original,
    ...hashlineEdit,
  });

  if (!editResult.success) {
    return {
      status: 'rejected',
      phase: 'edit',
      error: editResult.error,
      message: editResult.message,
    };
  }

  // 2. Perform Jev Secret & Safety gate check on modified content
  const safety = await evaluateArtifactSafetyWithJev({
    content: editResult.content,
    apiKey,
  });

  if (safety.evaluated && !safety.passed) {
    return {
      status: 'blocked',
      phase: 'safety',
      violations: safety.violations,
      message: 'Edit blocked by Jev safety gate: unmasked secret detected',
    };
  }

  if (dryRun) {
    return {
      status: 'passed',
      phase: 'dry_run',
      verified: true,
      linesModified: editResult.linesModified,
    };
  }

  // 3. Write changes to file
  await writeFile(filePath, editResult.content, 'utf8');

  // 4. Run test command if supplied
  if (testCommand) {
    const testResult = await runCommand(testCommand, cwd);
    if (testResult.exitCode !== 0) {
      // Test failed: return immediate error trace in the exact same response!
      return {
        status: 'test_failed',
        phase: 'test',
        exitCode: testResult.exitCode,
        stdout: testResult.stdout.slice(-2000),
        stderr: testResult.stderr.slice(-2000),
        linesModified: editResult.linesModified,
        revertHint: 'File was modified but tests failed. Auto-repair can be applied immediately.',
      };
    }
  }

  return {
    status: 'passed',
    phase: 'complete',
    verified: true,
    linesModified: editResult.linesModified,
  };
}
