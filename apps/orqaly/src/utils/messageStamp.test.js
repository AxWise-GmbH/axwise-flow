import { describe, it, expect } from 'vitest';
import { messageStamp } from './messageStamp';

// Built from parts rather than a literal, so the expectation is the local clock
// the user reads and not the machine the suite happens to run on.
const at = new Date(2026, 7, 23, 9, 4, 7); // 23.08.2026, 09:04:07 local

describe('messageStamp', () => {
  it('reads a Date', () => {
    expect(messageStamp(at)).toEqual({ time: '09:04:07', date: '23.08.2026' });
  });

  // The assistant thread stores an ISO string, a goal stores epoch ms.
  it('reads either shape the two threads store', () => {
    expect(messageStamp(at.toISOString())).toEqual({ time: '09:04:07', date: '23.08.2026' });
    expect(messageStamp(at.getTime())).toEqual({ time: '09:04:07', date: '23.08.2026' });
  });

  // Date would read these digits as a year and hand back something plausible.
  it('reads epoch milliseconds that arrive as a string', () => {
    expect(messageStamp(String(at.getTime()))).toEqual({ time: '09:04:07', date: '23.08.2026' });
  });

  it('pads every field to two digits', () => {
    const early = new Date(2026, 0, 5, 1, 2, 3);
    expect(messageStamp(early)).toEqual({ time: '01:02:03', date: '05.01.2026' });
  });

  it('keeps seconds, which is the point of it', () => {
    expect(messageStamp(new Date(2026, 7, 23, 23, 59, 59)).time).toBe('23:59:59');
  });

  it('returns null for anything that is not a usable instant', () => {
    [null, undefined, '', 'not a date', new Date('nope')].forEach((v) =>
      expect(messageStamp(v)).toBeNull()
    );
  });
});
