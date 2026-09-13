import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ThreadMessage, { ThreadBubble, ThreadFacts } from './ThreadMessage';
import {
  THREAD_BUBBLE_RADIUS_PX,
  THREAD_BUBBLE_TAIL_PX,
  THREAD_RADIUS,
  THREAD_TYPE,
  threadToneColor,
  threadClock,
} from './threadTokens';
import GoalRunMessage from './GoalRunMessages';
import { THREAD_GLYPH } from './threadIcons';

const AT = new Date('2026-01-01T12:34:00Z').getTime();

describe('ThreadMessage', () => {
  it('fills the slots it is given and omits the ones it is not', () => {
    render(
      <ThreadMessage
        tone="warn"
        title="Needs you"
        badge="Attempt 2"
        at={AT}
        detail="No agent could write it."
      />
    );
    expect(screen.getByText('Needs you')).toBeInTheDocument();
    expect(screen.getByText('Attempt 2')).toBeInTheDocument();
    expect(screen.getByText('No agent could write it.')).toBeInTheDocument();
    expect(screen.getByText(threadClock(AT))).toBeInTheDocument();
  });

  it('renders nested content and actions in their own slots', () => {
    render(
      <ThreadMessage
        card
        tone="ok"
        title="Brief ready"
        meta={<ThreadFacts facts={[{ label: 'Budget', value: '$5.00' }]} />}
        actions={<button type="button">Approve</button>}
      >
        <span>expected results</span>
      </ThreadMessage>
    );
    expect(screen.getByText('Budget')).toBeInTheDocument();
    expect(screen.getByText('$5.00')).toBeInTheDocument();
    expect(screen.getByText('expected results')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  it('keeps one scale, so no renderer can quietly define its own', () => {
    // Drift across seven renderers is what made the thread feel unfinished.
    expect(Object.keys(THREAD_RADIUS)).toEqual(['card', 'inner', 'pill']);
    // A bubble is sized by its own text, so its corner must stay under half the
    // height of a single line plus padding - otherwise a two-word message
    // rounds into a dome. This is the guard on that, in theme units of 10px.
    // A bubble is sized by its own text, so its corner must stay under half the
    // height of a single line plus its padding - otherwise a two-word message
    // rounds into a dome.
    expect(THREAD_BUBBLE_RADIUS_PX).toBeLessThan(23);
    expect(THREAD_BUBBLE_TAIL_PX).toBeLessThan(THREAD_BUBBLE_RADIUS_PX);
    expect(Object.keys(THREAD_TYPE)).toEqual(['title', 'body', 'detail', 'label']);
  });

  it('maps every tone onto a palette colour rather than a literal', () => {
    const theme = {
      palette: {
        warning: { main: '#w' },
        error: { main: '#e' },
        primary: { main: '#p' },
        text: { disabled: '#d' },
      },
    };
    expect(threadToneColor(theme, 'warn')).toBe('#w');
    expect(threadToneColor(theme, 'error')).toBe('#e');
    expect(threadToneColor(theme, 'ok')).toBe('#p');
    expect(threadToneColor(theme, 'accent')).toBe('#p');
    expect(threadToneColor(theme, 'info')).toBe('#d');
  });
});

describe('the marker', () => {
  // It used to be a 22px tinted disc with a 13px glyph inside it: the circle
  // was the loudest thing on the line and the mark inside it the quietest, so
  // every stage looked the same and none of them looked like anything.
  it('is the glyph itself, drawn thin', () => {
    const { container } = render(
      <ThreadMessage tone="ok" title="Plan ready" glyph={THREAD_GLYPH.plan} />
    );
    // MUI names its own svg, so the assertion is on which shape rendered.
    expect(screen.getByTestId('AccountTreeOutlinedIcon')).toBeInTheDocument();
    // One mark, not a mark inside a badge.
    expect(container.querySelectorAll('svg')).toHaveLength(1);
  });

  it('falls back to the tone when the message has no shape of its own', () => {
    render(<ThreadMessage tone="warn" title="Needs you" />);
    expect(screen.getByTestId('WarningAmberOutlinedIcon')).toBeInTheDocument();
  });

  // The row you are watching is the one row that must not stop saying what it
  // is. It used to swap its glyph for a generic spinner and lose that.
  it('keeps its own shape while it works', () => {
    render(<ThreadMessage tone="ok" title="Building the plan" live glyph={THREAD_GLYPH.plan} />);
    expect(screen.getByTestId('AccountTreeOutlinedIcon')).toBeInTheDocument();
    expect(screen.queryByTestId('AutorenewOutlinedIcon')).toBeNull();
  });

  it('moves while it is live and holds still once it is not', () => {
    const { rerender } = render(
      <ThreadMessage tone="ok" title="Building the plan" live glyph={THREAD_GLYPH.plan} />
    );
    const marker = () => screen.getByTestId('AccountTreeOutlinedIcon');
    // jsdom does not expand the shorthand into longhands, so the shorthand is
    // what there is to read - the same limitation the bubble cases work round.
    expect(getComputedStyle(marker()).animation).toMatch(/^threadWork /);

    rerender(<ThreadMessage tone="ok" title="Plan ready" glyph={THREAD_GLYPH.plan} />);
    expect(getComputedStyle(marker()).animation).toBe('');
  });

  // A round shape turns; anything with an upright breathes instead, because a
  // rotating document reads as a rendering fault rather than as work.
  it('turns the shapes that can turn and breathes the ones that cannot', () => {
    const { rerender } = render(
      <ThreadMessage tone="ok" title="Trying again" live glyph={THREAD_GLYPH.again} />
    );
    expect(getComputedStyle(screen.getByTestId('ReplayOutlinedIcon')).animation).toMatch(
      /^threadSpin /
    );

    rerender(<ThreadMessage tone="ok" title="Picking the team" live glyph={THREAD_GLYPH.team} />);
    expect(getComputedStyle(screen.getByTestId('GroupsOutlinedIcon')).animation).toMatch(
      /^threadWork /
    );
  });

  // The row that needs a person has to be findable on a screen they stopped
  // watching, so it pulses wider and slower than work in progress does.
  it('pulses harder for the row that is waiting on a person', () => {
    render(<ThreadMessage tone="warn" title="Waiting on you" live glyph={THREAD_GLYPH.waiting} />);
    expect(getComputedStyle(screen.getByTestId('PanToolOutlinedIcon')).animation).toMatch(
      /^threadAttention /
    );
  });
});

describe('ThreadBubble', () => {
  it('labels a quoted turn with who said it', () => {
    render(<ThreadBubble who="Team Lead · 12:34">Drafting now.</ThreadBubble>);
    expect(screen.getByText('Team Lead · 12:34')).toBeInTheDocument();
    expect(screen.getByText('Drafting now.')).toBeInTheDocument();
  });
});

describe('the bubble shape', () => {
  // Which corner is squared is what points a bubble at whoever said it. Getting
  // it backwards makes the user's own message look like it came from the lead.
  const bubble = () => screen.getByTestId('thread-bubble');

  it('points the user own message at the user', () => {
    render(<ThreadBubble mine>i approve</ThreadBubble>);
    const style = getComputedStyle(bubble());
    expect(style.borderBottomRightRadius).toBe(`${THREAD_BUBBLE_TAIL_PX}px`);
    expect(style.borderBottomLeftRadius).toBe(`${THREAD_BUBBLE_RADIUS_PX}px`);
  });

  // The bug this replaced: the shorthand was theme-scaled to 35px and the
  // per-corner override was not, so it came out 1px - two fully rounded top
  // corners over a flat bottom edge, and every short message read as a dome.
  it('writes every corner in the same unit', () => {
    render(<ThreadBubble mine>i approve</ThreadBubble>);
    const style = getComputedStyle(bubble());
    // jsdom does not expand the shorthand into longhands, so the shorthand is
    // what there is to read - and it is the half of the pair that used to be
    // theme-scaled while the overrides below it were not.
    expect(style.borderRadius).toBe(`${THREAD_BUBBLE_RADIUS_PX}px`);
    // Both halves in px, so the corners cannot silently disagree again.
    expect(style.borderBottomRightRadius).toBe(`${THREAD_BUBBLE_TAIL_PX}px`);
  });

  it('points a reply the other way', () => {
    render(<ThreadBubble>Working on it.</ThreadBubble>);
    const style = getComputedStyle(bubble());
    expect(style.borderBottomLeftRadius).toBe(`${THREAD_BUBBLE_TAIL_PX}px`);
    expect(style.borderBottomRightRadius).toBe(`${THREAD_BUBBLE_RADIUS_PX}px`);
  });
});

describe('run messages wear the template', () => {
  // What happened, from the shape alone: a bill is not a plan is not a board.
  it('carries the event own glyph through to the line', () => {
    render(
      <GoalRunMessage
        message={{
          kind: 'event',
          tone: 'warn',
          title: 'Costing more than expected',
          glyph: THREAD_GLYPH.money,
          at: AT,
        }}
      />
    );
    expect(screen.getByTestId('PaymentsOutlinedIcon')).toBeInTheDocument();
  });

  it('renders a stage line as marker, title and detail', () => {
    render(
      <GoalRunMessage
        message={{ kind: 'event', tone: 'ok', title: 'Plan ready', detail: '2 phases', at: AT }}
      />
    );
    expect(screen.getByText('Plan ready')).toBeInTheDocument();
    expect(screen.getByText('2 phases')).toBeInTheDocument();
  });

  it('renders a blocked state as the same object with buttons attached', () => {
    render(
      <GoalRunMessage
        goal={{ id: 'g1', status: 'failed' }}
        message={{
          kind: 'event',
          tone: 'error',
          blocked: true,
          title: 'Did not finish',
          detail: 'No agent could write it.',
          at: AT,
          actions: [{ type: 'retry_goal', label: 'Try again' }],
        }}
      />
    );
    expect(screen.getByText('Did not finish')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows a phase with its task count in the same header', () => {
    render(
      <GoalRunMessage
        message={{
          kind: 'phase',
          label: 'Drafting',
          phaseIndex: 0,
          total: 2,
          at: AT,
          tasks: [{ id: 't1', title: 'Write the poem', status: 'done' }],
        }}
      />
    );
    expect(screen.getByText('Drafting')).toBeInTheDocument();
    expect(screen.getByText('Phase 1 of 2 · 1 of 1 done')).toBeInTheDocument();
    expect(screen.getByText('Write the poem')).toBeInTheDocument();
  });
});
