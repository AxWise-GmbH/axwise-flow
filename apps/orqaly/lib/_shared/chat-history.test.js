import { describe, it, expect } from 'vitest';
import { windowHistory, OMITTED_HISTORY_NOTE } from './chat-history.js';

describe('windowHistory', () => {
  it('returns empty turns for empty/invalid input', () => {
    expect(windowHistory([])).toEqual({ turns: [], omitted: false });
    expect(windowHistory(null)).toEqual({ turns: [], omitted: false });
    expect(windowHistory(undefined)).toEqual({ turns: [], omitted: false });
  });

  it('keeps a short conversation whole, in order, including the first message', () => {
    const history = [
      { role: 'user', content: 'hey' },
      { role: 'assistant', content: 'hi!' },
      { role: 'user', content: 'how many open goals?' },
    ];
    const { turns, omitted } = windowHistory(history);
    expect(omitted).toBe(false);
    expect(turns).toHaveLength(3);
    expect(turns[0]).toEqual({ role: 'user', content: 'hey' }); // the real first message survives
    expect(turns[2].content).toBe('how many open goals?');
  });

  it('normalizes {text} to {content} and drops non-user/assistant + empty entries', () => {
    const history = [
      { role: 'system', content: 'ignored' },
      { role: 'user', text: 'from-text-field' },
      { role: 'assistant', content: '' },
    ];
    const { turns } = windowHistory(history);
    expect(turns).toEqual([{ role: 'user', content: 'from-text-field' }]);
  });

  it('drops the oldest turns past maxTurns and flags omitted', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({ role: 'user', content: `m${i}` }));
    const { turns, omitted } = windowHistory(history, { maxTurns: 4 });
    expect(omitted).toBe(true);
    expect(turns).toHaveLength(4);
    expect(turns.map((t) => t.content)).toEqual(['m6', 'm7', 'm8', 'm9']); // newest kept, order preserved
  });

  it('respects the char budget but always keeps at least the newest turn', () => {
    const history = [
      { role: 'user', content: 'a'.repeat(100) },
      { role: 'assistant', content: 'b'.repeat(100) },
    ];
    const { turns, omitted } = windowHistory(history, { maxChars: 50 });
    expect(turns).toHaveLength(1);
    expect(turns[0].content).toBe('b'.repeat(100));
    expect(omitted).toBe(true);
  });

  it('truncates over-long single messages to perMessageChars', () => {
    const { turns } = windowHistory([{ role: 'user', content: 'x'.repeat(9000) }], { perMessageChars: 100 });
    expect(turns[0].content).toHaveLength(100);
  });

  it('exports a non-empty omitted-history note', () => {
    expect(typeof OMITTED_HISTORY_NOTE).toBe('string');
    expect(OMITTED_HISTORY_NOTE.length).toBeGreaterThan(0);
  });
});
