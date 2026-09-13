/**
 * The marker has to mean something.
 *
 * Five tone icons across forty event types made the left edge of the thread a
 * column of identical ticks. These cases exist so that stays fixed: every event
 * the server can write has a shape chosen for it, and the shapes stay distinct
 * enough to tell a plan from a team from a bill.
 */
import { describe, it, expect } from 'vitest';
import {
  THREAD_BLOCKED_GLYPH,
  THREAD_EVENT_GLYPH,
  THREAD_GLYPH,
  threadGlyphSpins,
  threadBlockedGlyph,
  threadEventGlyph,
  threadToneGlyph,
} from './threadIcons';
import { RUN_EVENT_COPY } from './goalRunTranscript';

describe('thread glyphs', () => {
  // A new event type added to the copy map without a glyph would silently fall
  // back to a generic tick, which is the state this replaced.
  it('gives every event the thread can show a shape of its own', () => {
    const unmapped = Object.keys(RUN_EVENT_COPY).filter((type) => !THREAD_EVENT_GLYPH[type]);
    expect(unmapped).toEqual([]);
  });

  it('names only shapes that exist', () => {
    const names = [...Object.values(THREAD_EVENT_GLYPH), ...Object.values(THREAD_BLOCKED_GLYPH)];
    names.forEach((name) => expect(THREAD_GLYPH[name]).toBeTruthy());
  });

  // The point of the change: what happened is legible from the marker.
  it('keeps different kinds of event visibly different', () => {
    const shapes = [
      threadEventGlyph('plan_created'),
      threadEventGlyph('team_approved'),
      threadEventGlyph('budget_warning'),
      threadEventGlyph('consilium_reviewed'),
      threadEventGlyph('awaiting_approval'),
      threadEventGlyph('tools_provisioned'),
    ];
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  // Same meaning, same shape - a dozen recurring marks are learnable, thirty
  // eight unique pictograms are not.
  it('reuses one shape for one meaning', () => {
    expect(threadEventGlyph('team_approved')).toBe(threadEventGlyph('team_coverage_incomplete'));
    expect(threadEventGlyph('budget_warning')).toBe(threadEventGlyph('budget_exhausted'));
    expect(threadEventGlyph('awaiting_approval')).toBe(
      threadEventGlyph('awaiting_context_approval')
    );
  });

  it('still draws something for an event type the server adds tomorrow', () => {
    expect(threadEventGlyph('some_future_event', 'error')).toBe(THREAD_GLYPH.failed);
    expect(threadEventGlyph('some_future_event', 'warn')).toBe(THREAD_GLYPH.warn);
    expect(threadEventGlyph('some_future_event', 'info')).toBe(THREAD_GLYPH.info);
  });

  it('has a shape for each way a run can stop and wait', () => {
    ['needs_human', 'failed', 'awaiting_tools', 'paused'].forEach((status) =>
      expect(threadBlockedGlyph(status)).toBeTruthy()
    );
    expect(threadBlockedGlyph('needs_human')).toBe(THREAD_GLYPH.waiting);
    expect(threadBlockedGlyph('paused')).toBe(THREAD_GLYPH.paused);
  });

  it('falls back to the tone when there is no event behind the message', () => {
    expect(threadToneGlyph('ok')).toBe(THREAD_GLYPH.done);
    expect(threadToneGlyph('accent')).toBe(THREAD_GLYPH.work);
    expect(threadToneGlyph('nonsense')).toBe(THREAD_GLYPH.info);
  });
});

/**
 * Rotation only reads as "turning" on a shape with no upright. A spinning
 * document reads as a rendering fault, so the set is deliberately tiny.
 */
describe('which shapes may turn', () => {
  it('turns the round ones', () => {
    expect(threadGlyphSpins(THREAD_GLYPH.running)).toBe(true);
    expect(threadGlyphSpins(THREAD_GLYPH.again)).toBe(true);
    expect(threadGlyphSpins(THREAD_GLYPH.stale)).toBe(true);
  });

  it('leaves everything with an upright to breathe instead', () => {
    for (const key of ['brief', 'plan', 'team', 'waiting', 'money', 'work', 'tools']) {
      expect(threadGlyphSpins(THREAD_GLYPH[key])).toBe(false);
    }
  });

  it('does not turn a shape it has never seen', () => {
    expect(threadGlyphSpins(undefined)).toBe(false);
  });
});
