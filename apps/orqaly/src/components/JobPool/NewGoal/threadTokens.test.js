/**
 * [module: frontend]
 * The thread's motion vocabulary.
 *
 * Three states and no more, because a thread where each renderer invents its
 * own tempo reads as several things loading rather than as one run
 * progressing. The case that matters most is the last one: anything finished
 * holds perfectly still, so motion on the screen always means motion in the
 * run.
 */
import { describe, it, expect } from 'vitest';
import { threadMarkerMotion, threadToneColor } from './threadTokens';

const nameOf = (sx) => String(sx.animation || '').split(' ')[0];

describe('threadMarkerMotion', () => {
  it('leaves finished work completely still', () => {
    expect(threadMarkerMotion({ live: false, tone: 'ok' })).toEqual({});
    expect(threadMarkerMotion()).toEqual({});
  });

  it('breathes for work in progress', () => {
    const sx = threadMarkerMotion({ live: true, tone: 'ok' });
    expect(nameOf(sx)).toBe('threadWork');
    expect(sx['@keyframes threadWork']).toBeTruthy();
  });

  it('turns instead, for a shape that can turn', () => {
    expect(nameOf(threadMarkerMotion({ live: true, tone: 'ok', spin: true }))).toBe('threadSpin');
  });

  // The row that needs a person has to carry across a screen they have stopped
  // watching, so it pulses wider and slower than work in progress does.
  it('pulses wider and slower for the row waiting on a person', () => {
    const attention = threadMarkerMotion({ live: true, tone: 'warn' });
    expect(nameOf(attention)).toBe('threadAttention');
    expect(attention['@keyframes threadAttention']['50%'].transform).toBe('scale(1.22)');
    expect(
      threadMarkerMotion({ live: true, tone: 'ok' })['@keyframes threadWork']['50%'].transform
    ).toBe('scale(1.12)');
  });

  it('stops moving entirely where motion is not wanted', () => {
    for (const opts of [{ tone: 'ok' }, { tone: 'warn' }, { tone: 'ok', spin: true }]) {
      const sx = threadMarkerMotion({ live: true, ...opts });
      expect(sx['@media (prefers-reduced-motion: reduce)']).toEqual({
        animation: 'none',
        opacity: 1,
      });
    }
  });
});

describe('threadToneColor', () => {
  const theme = {
    palette: {
      warning: { main: '#w' },
      error: { main: '#e' },
      primary: { main: '#p' },
      text: { disabled: '#d' },
    },
  };

  it('maps every tone onto the palette, never a literal', () => {
    expect(threadToneColor(theme, 'warn')).toBe('#w');
    expect(threadToneColor(theme, 'error')).toBe('#e');
    expect(threadToneColor(theme, 'ok')).toBe('#p');
    expect(threadToneColor(theme, 'accent')).toBe('#p');
    expect(threadToneColor(theme, 'info')).toBe('#d');
  });
});
