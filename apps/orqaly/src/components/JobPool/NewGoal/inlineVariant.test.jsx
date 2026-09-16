import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../hooks/useVoiceControl', () => ({
  useVoiceControl: () => ({
    state: 'idle',
    isSupported: false,
    startListening: vi.fn(),
    stopListening: vi.fn(),
  }),
}));
vi.mock('../../../services/organizationService', () => ({
  listOrganizations: vi.fn(async () => [{ id: 'o1', name: 'Primary', is_active: true }]),
  createGoalOrganization: vi.fn(),
}));
vi.mock('../../../services/workflowService', () => ({ getAllWorkflows: vi.fn(async () => []) }));
vi.mock('../../../services/knowledgeBaseService', () => ({ listDocuments: vi.fn(async () => []) }));
vi.mock('../../../services/agentJobService', () => ({
  enqueueAndWait: vi.fn(),
}));
vi.mock('../../../services/goalService', () => ({
  createGoal: vi.fn(async (d) => ({ id: 'g1', status: 'feasibility', ...d })),
  createSmartRequestDraft: vi.fn(async (d) => ({ id: 'g1', status: 'draft', ...d })),
  listGoals: vi.fn(async () => []),
  preparePhysicalEvidenceProfile: vi.fn(),
  startGoal: vi.fn(async (id) => ({ id, status: 'feasibility' })),
  getGoal: vi.fn(async (id) => ({ id, status: 'feasibility', logs: [], plan: {}, data: {} })),
  getGoalMessages: vi.fn(async () => []),
  getGoalResearchBundle: vi.fn(async () => null),
  approveGoalContext: vi.fn(),
  reviseGoalContext: vi.fn(),
  requestGoalContextEvidence: vi.fn(),
  approveGoal: vi.fn(),
  requestGoalChanges: vi.fn(),
}));

import { enqueueAndWait } from '../../../services/agentJobService';
import SmartRequestDialog from '../SmartRequestDialog';

const theme = createTheme();

function renderInline(props = {}) {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={theme}>
        <SmartRequestDialog open onClose={vi.fn()} onSubmit={vi.fn()} {...props} />
      </ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  enqueueAndWait.mockReturnValue(new Promise(() => {}));
});
afterEach(() => vi.useRealTimers());

describe('SmartRequestDialog inline variant', () => {
  // Dropping a modal over the hero the user is already looking at was the
  // jarring part. Inline contributes the thread to the host's surface instead.
  it('renders no dialog when embedded', async () => {
    renderInline({ variant: 'inline' });
    expect(await screen.findByText(/Tell me what you want to achieve/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('still renders as a dialog by default, for every existing caller', async () => {
    renderInline();
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('drops the wizard stepper when embedded, since the host frames it', async () => {
    renderInline({ variant: 'inline' });
    await screen.findByText(/Tell me what you want to achieve/);
    expect(screen.queryByText('Progress')).toBeNull();
  });

  it('keeps the composer, which is the whole point of embedding', async () => {
    renderInline({ variant: 'inline' });
    expect(
      await screen.findByRole('textbox', { name: /Describing your goal/i })
    ).toBeInTheDocument();
  });

  // The host owns the Assistant/Goal pills and hands them down, so switching
  // away from a goal in progress stays possible.
  it('hosts the slot the embedder passes into the composer', async () => {
    renderInline({
      variant: 'inline',
      composerTopSlot: <button type="button">Assistant</button>,
    });
    expect(await screen.findByRole('button', { name: 'Assistant' })).toBeInTheDocument();
  });

  it('starts on the prompt the host already collected', async () => {
    renderInline({ variant: 'inline', initialPrompt: 'Design a sunglasses landing page' });
    // Once as the user's message in the thread, once in the composer it was
    // seeded into, so the request is both said and still editable.
    const shown = await screen.findAllByText('Design a sunglasses landing page');
    expect(shown.length).toBeGreaterThan(0);
  });

  describe('surviving the goal it creates', () => {
    // The regression that made every other feature unreachable: a 1600ms timer
    // meant for the modal's success screen fired handleClose in the hero too,
    // where onClose tears the thread out of its host and handleClose resets
    // every piece of Simple state. The run vanished a second and a half after
    // it started, taking the stages, Actions and the view switch with it.
    it('does not close itself after creating the goal', async () => {
      vi.useFakeTimers();
      enqueueAndWait.mockResolvedValue({
        status: 'done',
        result: {
          content: JSON.stringify({
            title: 'Sunglasses page',
            category: 'design',
            priority: 'medium',
            requirements: 'A landing page',
            complexity: 'simple',
            budget_suggestion: 6,
          }),
        },
      });
      const onClose = vi.fn();
      render(
        <MemoryRouter>
          <ThemeProvider theme={theme}>
            <SmartRequestDialog
              open
              variant="inline"
              initialPrompt="Design a sunglasses landing page"
              onClose={onClose}
              onSubmit={vi.fn()}
            />
          </ThemeProvider>
        </MemoryRouter>
      );

      await act(async () => {
        await Promise.resolve();
        vi.advanceTimersByTime(20000);
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(5000);
        await Promise.resolve();
      });

      expect(onClose).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });
  // The hero hands the prompt in and the thread auto-starts it. main.jsx runs
  // under StrictMode, which mounts effects twice in dev: the effect that seeds
  // the box from the prompt used to run its second pass after auto-start had
  // emptied the box, so the sent sentence reappeared as if nothing happened.
  it('leaves the box empty after a hero prompt auto-starts, even under StrictMode', async () => {
    render(
      <StrictMode>
        <MemoryRouter>
          <ThemeProvider theme={theme}>
            <SmartRequestDialog
              variant="inline"
              open
              initialPrompt="analyse the solution"
              onClose={vi.fn()}
              onSubmit={vi.fn()}
            />
          </ThemeProvider>
        </MemoryRouter>
      </StrictMode>
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('goal-composer-input')).toHaveValue('');
    // The sentence lives in exactly one request bubble. The run bar also names
    // the goal, but the obsolete local "Brief ready" card and duplicate launch
    // detail must not repeat the request inside the conversation.
    const requestBubbles = screen
      .getAllByTestId('thread-bubble')
      .filter((bubble) => bubble.textContent === 'analyse the solution');
    expect(requestBubbles).toHaveLength(1);
    expect(screen.queryByText('Brief ready')).toBeNull();
    expect(
      screen.getByRole('textbox', { name: /Running - messages go to your team lead/i })
    ).toBeInTheDocument();
  });

  // The hero itself opens to 1180px the moment it holds a conversation. The
  // thread inside it used to stop at 760 regardless, so the run reported into a
  // ribbon down the middle of an already-wide surface.
  it('opens the thread to the full surface from the send onward', async () => {
    renderInline({ variant: 'inline' });
    const box = await screen.findByTestId('goal-composer-input');
    // Before the send it is still a form, so it stays a column.
    expect(screen.getByTestId('goal-thread')).toHaveAttribute('data-measure', '760');

    fireEvent.change(box, { target: { value: 'Design a wedding invitation' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      await Promise.resolve();
    });

    expect(screen.getByTestId('goal-thread')).toHaveAttribute('data-measure', '1180');
    // The composer is the one thing that does not follow.
    expect(screen.getByTestId('goal-thread-footer')).toHaveAttribute('data-measure', '760');
  });
});
