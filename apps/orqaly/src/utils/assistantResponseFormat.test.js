import { describe, it, expect } from 'vitest';
import {
  classifyAssistantOutput,
  isLeakedProtocolJson,
  safeAssistantReply,
  PROTOCOL_FALLBACK_MESSAGE,
} from './assistantResponseFormat';

describe('assistantResponseFormat', () => {
  it('classifies fenced code blocks', () => {
    const out = classifyAssistantOutput('```js\nconst a = 1;\n```');
    expect(out.type).toBe('code');
    expect(out.language).toBe('js');
  });

  it('classifies raw JSON as structured output', () => {
    const out = classifyAssistantOutput('{"ok":true,"count":2}');
    expect(out.type).toBe('json');
    expect(out.value).toMatch(/"count": 2/);
  });

  it('classifies markdown table text', () => {
    const out = classifyAssistantOutput('| Name | Value |\n|---|---|\n| A | 1 |');
    expect(out.type).toBe('table');
  });

  it('falls back to plain text', () => {
    const out = classifyAssistantOutput('hello world');
    expect(out.type).toBe('text');
  });
});

describe('isLeakedProtocolJson / safeAssistantReply', () => {
  const answerBlob =
    '{ "action": "answer", "message": "You have 0 agents.", "proposedActions": [ { "tool": "agent.create" } ] }';
  const readBlob =
    '{ "action": "read", "calls": [ { "tool": "goal.list", "args": {} } ], "thought": "find the last failure" }';

  it('flags leaked answer/read protocol objects', () => {
    expect(isLeakedProtocolJson(answerBlob)).toBe(true);
    expect(isLeakedProtocolJson(readBlob)).toBe(true);
  });

  it('flags a malformed protocol blob with a raw newline (JSON.parse would reject)', () => {
    const malformed = '{\n  "action": "answer",\n  "message": "line1\nline2",\n  "proposedActions": []\n}';
    expect(isLeakedProtocolJson(malformed)).toBe(true);
  });

  it('flags a protocol object wrapped in a code fence', () => {
    expect(isLeakedProtocolJson('```json\n' + answerBlob + '\n```')).toBe(true);
  });

  it('does NOT flag normal prose or JSON the user actually asked for', () => {
    expect(isLeakedProtocolJson('You currently have 3 agents.')).toBe(false);
    expect(isLeakedProtocolJson('{"name":"New Agent","role":"General"}')).toBe(false);
    expect(isLeakedProtocolJson('')).toBe(false);
  });

  it('safeAssistantReply swaps a leak for the fallback but passes prose through', () => {
    expect(safeAssistantReply(answerBlob)).toBe(PROTOCOL_FALLBACK_MESSAGE);
    expect(safeAssistantReply('All good here')).toBe('All good here');
  });
});
