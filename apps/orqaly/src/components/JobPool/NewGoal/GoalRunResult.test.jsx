/**
 * [module: frontend]
 * The end of a finished thread.
 *
 * The failure this guards is the one that started the work: a completed goal
 * whose thread said "Done" and stopped, leaving the summary, the files and the
 * team lead's note reachable only from a popup the thread had no button for.
 * So: the card says what came out, the files are openable from inside the
 * conversation, and the way through to everything else is on it.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Box, ThemeProvider, createTheme } from '@mui/material';
import GoalRunResult from './GoalRunResult';
import { DeliverableViewerProvider } from '../../Goals/deliverables/DeliverableViewer';

const theme = createTheme();

const deliverable = (over = {}) => ({
  id: 'd1',
  title: 'Zero-Capital Failure Mode Analysis',
  categoryLabel: 'Strategy',
  agent_name: 'Risk Assessment Strategist',
  output: '# Risks\n\nOne.',
  ...over,
});

function makeMessage(over = {}) {
  return {
    id: 'result-g1',
    kind: 'result',
    at: Date.parse('2026-01-01T16:54:00Z'),
    goalId: 'g1',
    tone: 'ok',
    title: 'Your result',
    headline: 'A zero-capital plan you can start on Monday.',
    summary: 'Four sentences of stakeholder brief about what shipped.',
    leadNote: 'Team shipped all three phases. Watch the runway assumption.',
    deliverables: [deliverable()],
    liveUrl: null,
    tasks: [],
    ...over,
  };
}

function setup({ withViewer = false, ...props } = {}) {
  const card = <GoalRunResult message={makeMessage()} {...props} />;
  return render(
    <ThemeProvider theme={theme}>
      {withViewer ? (
        <Box sx={{ position: 'relative' }}>
          <DeliverableViewerProvider>{card}</DeliverableViewerProvider>
        </Box>
      ) : (
        card
      )}
    </ThemeProvider>
  );
}

function setupWith(message, props = {}) {
  return render(
    <ThemeProvider theme={theme}>
      <GoalRunResult message={message} {...props} />
    </ThemeProvider>
  );
}

describe('GoalRunResult', () => {
  it('leads with the pitch and the summary', () => {
    setup();
    expect(screen.getByText(/zero-capital plan you can start on Monday/)).toBeInTheDocument();
    expect(screen.getByText(/Four sentences of stakeholder brief/)).toBeInTheDocument();
  });

  it('gives the team lead the last word', () => {
    setup();
    expect(screen.getByText('Team lead note - Rex')).toBeInTheDocument();
    expect(screen.getByText(/Watch the runway assumption/)).toBeInTheDocument();
  });

  it('says nothing about the team lead when there is no note', () => {
    setupWith(makeMessage({ leadNote: null }));
    expect(screen.queryByText(/Team lead note/)).not.toBeInTheDocument();
  });

  it('renders the strict PRD attestation as one compact evidence line', () => {
    setupWith(
      makeMessage({
        title: 'Done - PRD: ScopeConfirm',
        headline: null,
        summary: null,
        leadNote: null,
        quality: {
          score: 96,
          sectionCount: 16,
          requirementCount: 43,
          linkedTestCount: 18,
          openDecisionCount: 3,
        },
      })
    );

    expect(screen.getByText('Done - PRD: ScopeConfirm')).toBeInTheDocument();
    expect(screen.getByLabelText('Quality attestation summary')).toHaveTextContent(
      '16 sections · 43 requirements · 18 linked tests · 3 open decisions · Quality 96/100'
    );
    expect(screen.queryByText(/Four sentences of stakeholder brief/)).not.toBeInTheDocument();
  });

  it('opens the details for this goal', () => {
    const onOpenDetails = vi.fn();
    setup({ onOpenDetails });
    fireEvent.click(screen.getByRole('button', { name: 'View more details' }));
    expect(onOpenDetails).toHaveBeenCalledWith('g1');
  });

  // A button that opens nothing is worse than no button: the card also renders
  // on surfaces that own no goal-detail state.
  it('offers no way through when the host cannot open one', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'View more details' })).not.toBeInTheDocument();
  });

  it('falls back to the goal own deliverable list when no files could be resolved', () => {
    setup();
    expect(screen.getByText('Files')).toBeInTheDocument();
    expect(screen.getByText('Zero-Capital Failure Mode Analysis')).toBeInTheDocument();
    expect(screen.getByText('Strategy · Risk Assessment Strategist')).toBeInTheDocument();
  });

  it('surfaces a published site that nothing else in this branch would show', () => {
    setupWith(makeMessage({ liveUrl: 'https://example.com' }));
    expect(screen.getByRole('link', { name: /Open the live site/ })).toHaveAttribute(
      'href',
      'https://example.com'
    );
  });

  it('reads a deliverable in place, rather than sending the user elsewhere', () => {
    setup({ withViewer: true });
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(
      screen.getByRole('dialog', { name: /Viewing Zero-Capital Failure Mode Analysis/ })
    ).toBeInTheDocument();
  });

  it('offers no View where no viewer is mounted to open into', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'View' })).not.toBeInTheDocument();
  });

  it('stops the list before it stops being a message', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      deliverable({ id: `d${i}`, title: `Document ${i}` })
    );
    setupWith(makeMessage({ deliverables: many }));
    expect(screen.getByText('Document 5')).toBeInTheDocument();
    expect(screen.queryByText('Document 6')).not.toBeInTheDocument();
    expect(screen.getByText('and 3 more, in the details.')).toBeInTheDocument();
  });

  it('writes hyphens, never dashes', () => {
    const { container } = setup({ onOpenDetails: vi.fn() });
    expect(container.textContent).not.toMatch(/[—–]/);
  });
});
