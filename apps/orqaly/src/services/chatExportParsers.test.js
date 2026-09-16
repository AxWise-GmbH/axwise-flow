import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { parseExportFile } from './chatExportParsers';

/** Minimal File-like shim over a string/blob for the parser (uses .name/.text/arraybuffer). */
function jsonFile(name, obj) {
  return new File([JSON.stringify(obj)], name, { type: 'application/json' });
}

describe('chatExportParsers', () => {
  it('parses a ChatGPT conversations.json (walks mapping, orders by time)', async () => {
    const data = [
      {
        title: 'Trip plan',
        conversation_id: 'c-1',
        mapping: {
          n1: { message: { author: { role: 'user' }, create_time: 1, content: { parts: ['hi'] } } },
          n2: { message: { author: { role: 'assistant' }, create_time: 2, content: { parts: ['hello'] } } },
          n0: { message: { author: { role: 'system' }, create_time: 0, content: { parts: [''] } } },
        },
      },
    ];
    const res = await parseExportFile(jsonFile('conversations.json', data));
    expect(res.provider).toBe('chatgpt');
    expect(res.conversations).toHaveLength(1);
    expect(res.conversations[0]).toMatchObject({ id: 'c-1', title: 'Trip plan' });
    expect(res.conversations[0].messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
  });

  it('parses a Claude export (sender human→user)', async () => {
    const data = [
      {
        uuid: 'u-1',
        name: 'Ideas',
        chat_messages: [
          { sender: 'human', text: 'question' },
          { sender: 'assistant', text: 'answer' },
        ],
      },
    ];
    const res = await parseExportFile(jsonFile('claude.json', data));
    expect(res.provider).toBe('claude');
    expect(res.conversations[0].messages).toEqual([
      { role: 'user', content: 'question' },
      { role: 'assistant', content: 'answer' },
    ]);
  });

  it('keeps the chosen provider label for generic normalized JSON', async () => {
    const data = [{ id: 'x1', title: 'Chat', messages: [{ role: 'user', content: 'yo' }] }];
    const res = await parseExportFile(jsonFile('perplexity.json', data), 'perplexity');
    expect(res.provider).toBe('perplexity');
    expect(res.conversations[0].messages).toEqual([{ role: 'user', content: 'yo' }]);
  });

  it('warns when the file provider differs from the picked tile', async () => {
    const data = [{ uuid: 'u1', name: 'x', chat_messages: [{ sender: 'human', text: 'hi' }] }];
    const res = await parseExportFile(jsonFile('export.json', data), 'chatgpt');
    expect(res.provider).toBe('claude');
    expect(res.warnings.join(' ')).toMatch(/claude/i);
  });

  it('extracts conversations.json from a .zip (ChatGPT export bundle)', async () => {
    const zip = new JSZip();
    zip.file(
      'conversations.json',
      JSON.stringify([
        {
          title: 'Z',
          conversation_id: 'z1',
          mapping: { a: { message: { author: { role: 'user' }, create_time: 1, content: { parts: ['zipped'] } } } },
        },
      ])
    );
    const blob = await zip.generateAsync({ type: 'blob' });
    const file = new File([blob], 'chatgpt-export.zip', { type: 'application/zip' });
    const res = await parseExportFile(file);
    expect(res.provider).toBe('chatgpt');
    expect(res.conversations[0].messages[0]).toEqual({ role: 'user', content: 'zipped' });
  });

  it('wraps a plain-text transcript as one generic conversation', async () => {
    const file = new File(['just some notes'], 'notes.txt', { type: 'text/plain' });
    const res = await parseExportFile(file, 'generic');
    expect(res.provider).toBe('generic');
    expect(res.conversations[0].messages).toEqual([{ role: 'user', content: 'just some notes' }]);
  });
});
