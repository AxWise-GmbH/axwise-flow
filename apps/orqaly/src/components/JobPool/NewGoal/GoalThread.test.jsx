import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import GoalThread from './GoalThread';

vi.mock('./blocks/KbPicker', () => ({
  default: () => <div data-testid="kb-picker" />,
}));

const theme = createTheme();

function makeForm(overrides = {}) {
  return {
    setupManual: false,
    onSetupManualChange: vi.fn(),
    humanApprove: false,
    onHumanApproveChange: vi.fn(),
    attachments: [],
    onUpload: vi.fn(),
    onRemoveAttachment: vi.fn(),
    uploadingFile: false,
    onLoadPastGoals: vi.fn(),
    kbSelectedIds: [],
    onToggleKbDocument: vi.fn(),
    remainingSlots: 20,
    pastGoalPicker: null,
    toolMode: 'no_tools',
    onToolModeChange: vi.fn(),
    groundedResearchConflict: false,
    goalDest: 'standalone',
    onGoalDestChange: vi.fn(),
    destOrgName: '',
    onDestOrgNameChange: vi.fn(),
    destIndustry: '',
    onDestIndustryChange: vi.fn(),
    organizations: [{ id: 'o1', name: 'Primary', is_active: true }],
    organizationsLoading: false,
    organizationLoadError: '',
    selectedOrgId: 'o1',
    onSelectedOrgIdChange: vi.fn(),
    ...overrides,
  };
}

function setup({ form = {}, state = {}, run = null, ...props } = {}) {
  const f = makeForm(form);
  const utils = render(
    <ThemeProvider theme={theme}>
      <GoalThread form={f} transcriptState={state} run={run} {...props} />
    </ThemeProvider>
  );
  return { form: f, ...utils };
}

describe('GoalThread', () => {
  it('opens with the greeting', () => {
    setup();
    expect(screen.getByText(/Tell me what you want to achieve/)).toBeInTheDocument();
  });

  it('shows what the user typed as their own message', () => {
    setup({ state: { simpleInput: 'Design a landing page' } });
    expect(screen.getByText('Design a landing page')).toBeInTheDocument();
  });

  // The point of the redesign: the switches stay live inside the thread.
  it('drives the real Setup switch from inside the thread', () => {
    const { form } = setup();
    fireEvent.click(screen.getByRole('switch', { name: /Choose the setup yourself/i }));
    expect(form.onSetupManualChange).toHaveBeenCalledWith(true);
  });

  it('drives the real approval checkpoint switch from inside the thread', () => {
    const { form } = setup();
    fireEvent.click(screen.getByRole('switch', { name: /Pause for my approval/i }));
    expect(form.onHumanApproveChange).toHaveBeenCalledWith(true);
  });

  // The goal's setup is the thing being configured; it stays visible. Auto
  // locks the three and shows what it chose, Manual hands them over.
  it('shows the blocks locked while Setup is Auto', () => {
    setup({ form: { setupManual: false } });
    expect(screen.getByTestId('materials-block')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('tools-block')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('destination-block')).toHaveAttribute('aria-disabled', 'true');
  });

  it('unlocks the blocks on Manual', () => {
    setup({ form: { setupManual: true }, state: { setupManual: true } });
    expect(screen.getByTestId('materials-block')).not.toHaveAttribute('aria-disabled');
    expect(screen.getByTestId('tools-block')).not.toHaveAttribute('aria-disabled');
    expect(screen.getByTestId('destination-block')).not.toHaveAttribute('aria-disabled');
  });

  // Auto cannot pick a workspace that does not exist, so the blocks open
  // anyway and must be usable rather than locked.
  it('unlocks the blocks when no workspace could be loaded, even in Auto', () => {
    setup({
      form: { setupManual: false, organizationLoadError: 'No workspace' },
      state: { setupManual: false, organizationLoadError: 'No workspace' },
    });
    expect(screen.getByTestId('destination-block')).toBeInTheDocument();
  });

  it('announces analysis politely while it runs', () => {
    setup({ state: { simplePhase: 'processing' } });
    expect(screen.getByRole('status', { name: 'Analysing your request' })).toBeInTheDocument();
  });

  it('renders the brief the analysis produced', () => {
    setup({
      state: {
        structuredResult: { title: 'Sunglasses page', category: 'design', priority: 'high' },
        complexity: 'simple',
        budgetUsd: 6,
        expectedResults: 'A responsive page',
      },
    });
    expect(screen.getByText('Brief ready')).toBeInTheDocument();
    expect(screen.getByText('Sunglasses page')).toBeInTheDocument();
    expect(screen.getByText('$6.00')).toBeInTheDocument();
    expect(screen.getByText(/A responsive page/)).toBeInTheDocument();
  });

  it('ignores legacy prefill suggestions so AxWise remains the only scope questionnaire', () => {
    const onUseSuggestion = vi.fn();
    setup({
      state: { structuredResult: { title: 'T' }, suggestions: ['Which brand?'] },
      onUseSuggestion,
    });
    expect(screen.queryByText('Which brand?')).not.toBeInTheDocument();
    expect(onUseSuggestion).not.toHaveBeenCalled();
  });

  it('surfaces an analysis failure without hiding the thread', () => {
    setup({ state: { simpleInput: 'x', aiError: 'AI unavailable' } });
    expect(screen.getByText('AI unavailable')).toBeInTheDocument();
    expect(screen.getByText('x')).toBeInTheDocument();
  });

  it('confirms the launch once the goal exists', () => {
    setup({ state: { createdGoal: { id: 'g1', title: 'Sunglasses page' } } });
    expect(screen.getByText('Started')).toBeInTheDocument();
    expect(screen.getByText('Sunglasses page')).toBeInTheDocument();
  });

  it('renders the footer the host pins below the thread', () => {
    setup({ footer: <div data-testid="composer" /> });
    expect(screen.getByTestId('composer')).toBeInTheDocument();
  });

  // Named for what it guards, and now actually guarding it: the conversation
  // scrolls under the composer rather than past it. A thread that grows the
  // page instead of scrolling inside takes the composer below the fold with it.
  it('keeps the thread scrollable so a long run cannot push the composer away', () => {
    setup({ fill: true, footer: <div data-testid="composer" /> });
    const scroller = screen.getByTestId('goal-thread');
    expect(scroller).toBeInTheDocument();
    // The composer sits outside the scrolling region, as its sibling.
    expect(scroller).not.toContainElement(screen.getByTestId('composer'));
    expect(screen.getByTestId('goal-thread-footer')).toContainElement(
      screen.getByTestId('composer')
    );
  });

  // A form is a column, a running goal is a screen. The composer is the one
  // thing that stays a column either way.
  describe('the reading measure', () => {
    it('keeps the conversation and the composer on one column before the send', () => {
      setup({ state: { simpleInput: 'Design a landing page' }, footer: <div>composer</div> });
      expect(screen.getByTestId('goal-thread')).toHaveAttribute('data-measure', '760');
      expect(screen.getByTestId('goal-thread-footer')).toHaveAttribute('data-measure', '760');
    });

    it('opens the conversation to the full surface once the request is sent', () => {
      setup({
        state: { submittedText: 'Design a landing page' },
        wide: true,
        footer: <div>composer</div>,
      });
      expect(screen.getByTestId('goal-thread')).toHaveAttribute('data-measure', '1180');
    });

    it('never widens the composer with it', () => {
      setup({
        state: { submittedText: 'Design a landing page' },
        wide: true,
        footer: <div>composer</div>,
      });
      // A box you type one sentence into is a reading measure whatever the
      // screen behind it does.
      expect(screen.getByTestId('goal-thread-footer')).toHaveAttribute('data-measure', '760');
    });
  });

  describe('talking to the team lead', () => {
    const goal = { id: 'g1', status: 'active' };

    it('shows each turn in the thread, mine on one side and the lead on the other', () => {
      setup({
        state: { createdGoal: goal },
        run: { goal, logs: [] },
        chat: [
          { id: 'c1', sender: 'user', text: 'How is it going?' },
          { id: 'c2', sender: 'lead', text: 'Two of five tasks are done.' },
        ],
      });
      expect(screen.getByText('How is it going?')).toBeInTheDocument();
      expect(screen.getByText('Two of five tasks are done.')).toBeInTheDocument();
      expect(screen.getByText('Team lead')).toBeInTheDocument();
    });

    it('shows the lead replying while the answer is on its way', () => {
      setup({ state: { createdGoal: goal }, run: { goal, logs: [] }, chat: [], chatBusy: true });
      expect(screen.getByRole('status', { name: 'Team lead is replying' })).toBeInTheDocument();
    });

    // Both sides of the conversation, not just the lead's.
    it('gives each turn a copy button and the second it was said', () => {
      const at = new Date(2026, 7, 23, 9, 4, 7).getTime();
      setup({
        state: { createdGoal: goal },
        run: { goal, logs: [] },
        chat: [
          { id: 'c1', sender: 'user', text: 'How is it going?', at },
          { id: 'c2', sender: 'lead', text: 'Two of five tasks are done.', at },
        ],
      });
      expect(screen.getAllByLabelText('Copy message')).toHaveLength(2);
      expect(screen.getAllByText('09:04:07')).toHaveLength(2);
      expect(screen.getAllByText('23.08.2026')).toHaveLength(2);
    });

    // A bubble with nothing said in it must not sprout an empty meta line.
    it('leaves the replying indicator without a stamp', () => {
      setup({ state: { createdGoal: goal }, run: { goal, logs: [] }, chat: [], chatBusy: true });
      expect(screen.queryByLabelText('Copy message')).toBeNull();
      expect(screen.queryByTestId('message-stamp')).toBeNull();
    });

    it('offers a proposed action behind a Confirm, not as prose', () => {
      setup({
        state: { createdGoal: goal },
        run: { goal, logs: [] },
        chat: [
          {
            id: 'c2',
            sender: 'lead',
            text: 'I can pause it.',
            actions: [
              { type: 'pause_goal', label: 'Pause the goal', summary: 'Stops work', params: {} },
            ],
          },
        ],
      });
      expect(screen.getByText('Pause the goal')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    });

    it('reads an action outcome as a stage line, with its tone', () => {
      setup({
        state: { createdGoal: goal },
        run: { goal, logs: [] },
        chat: [
          { id: 's1', sender: 'system', text: '✓ Pause the goal' },
          { id: 's2', sender: 'system', text: '⚠ Resume failed: nope' },
        ],
      });
      expect(screen.getByText('Pause the goal')).toBeInTheDocument();
      expect(screen.getByText('Resume failed: nope')).toBeInTheDocument();
    });
  });

  describe('once the goal is running', () => {
    const at = (t) => `2026-01-01T12:0${t}:00Z`;

    it('keeps step 1 on screen and continues below it', () => {
      setup({
        state: { simpleInput: 'Design a landing page', createdGoal: { id: 'g1', title: 'LP' } },
        run: {
          logs: [{ id: 'l1', event_type: 'feasibility_done', details: {}, created_at: at(1) }],
        },
      });
      // What the user wrote is still there.
      expect(screen.getByText('Design a landing page')).toBeInTheDocument();
      // And the run reports underneath it. The newest stage is the one still
      // happening, so it reads present-tense.
      expect(screen.getByText('Checking it is doable')).toBeInTheDocument();
    });

    it('shows a phase with its work nested under it', () => {
      setup({
        state: {},
        run: {
          logs: [
            {
              id: 'l1',
              event_type: 'phase_started',
              details: { phaseIndex: 0, phaseName: 'Direction' },
              created_at: at(1),
            },
          ],
          tasks: [
            {
              id: 't1',
              title: 'Pick a palette',
              status: 'done',
              sequence_order: 1,
              data: { phase_index: 0 },
            },
          ],
          goal: { plan: { phases: [{}, {}] } },
        },
      });
      expect(screen.getByText('Direction')).toBeInTheDocument();
      expect(screen.getByText('Phase 1 of 2 · 1 of 1 done')).toBeInTheDocument();
      expect(screen.getByText('Pick a palette')).toBeInTheDocument();
    });

    it('renders what the team lead said as a message, not a log line', () => {
      setup({
        state: {},
        run: {
          messages: [
            {
              id: 'm1',
              sender_name: 'Iris Vance',
              message: 'Starting on direction.',
              channel: 'team-room',
              created_at: at(1),
            },
          ],
        },
      });
      expect(screen.getByText('Starting on direction.')).toBeInTheDocument();
      expect(screen.getByText(/Iris Vance/)).toBeInTheDocument();
    });

    it('offers a published deployment as a link out', () => {
      setup({
        state: {},
        run: {
          logs: [
            {
              id: 'l1',
              event_type: 'deployment_published',
              details: { url: 'https://sunglasses.test' },
              created_at: at(1),
            },
          ],
        },
      });
      expect(screen.getByRole('link', { name: /sunglasses.test/ })).toHaveAttribute(
        'href',
        'https://sunglasses.test'
      );
    });

    it('shows nothing extra before the run has started', () => {
      setup({ state: { simpleInput: 'x' } });
      expect(screen.queryByText('Looks doable')).toBeNull();
    });
  });

  describe('waiting for the brief', () => {
    it('says what it is doing while analysis runs', () => {
      setup({ state: { simplePhase: 'processing' } });
      expect(screen.getByRole('status', { name: 'Analysing your request' })).toBeInTheDocument();
      expect(screen.getByText('Reading your request')).toBeInTheDocument();
    });

    // Silence is the failure mode: a slow model and a dead worker look
    // identical without a clock.
    it('shows elapsed time once the wait stops being instant', () => {
      setup({ state: { simplePhase: 'processing', analyzingSince: Date.now() - 6000 } });
      expect(screen.getByText(/^\d+s$/)).toBeInTheDocument();
    });

    it('hides the clock for a wait too short to worry about', () => {
      setup({ state: { simplePhase: 'processing', analyzingSince: Date.now() } });
      expect(screen.queryByText(/^\d+s$/)).toBeNull();
    });

    it('changes what it says once the wait gets long', () => {
      setup({ state: { simplePhase: 'processing', analyzingSince: Date.now() - 20000 } });
      expect(screen.getByText('Still working on your brief')).toBeInTheDocument();
    });

    // A long wait must be a choice, not a trap.
    it('offers a way out after a long wait', () => {
      const onSkipAnalysis = vi.fn();
      setup({
        state: { simplePhase: 'processing', analyzingSince: Date.now() - 20000 },
        onSkipAnalysis,
      });
      fireEvent.click(screen.getByRole('button', { name: 'Start without it' }));
      expect(onSkipAnalysis).toHaveBeenCalled();
    });

    it('does not offer the way out before the wait is long', () => {
      setup({
        state: { simplePhase: 'processing', analyzingSince: Date.now() - 3000 },
        onSkipAnalysis: vi.fn(),
      });
      expect(screen.queryByRole('button', { name: 'Start without it' })).toBeNull();
    });
  });

  describe('reading position and layout', () => {
    // The hero enters with initialPrompt already set, so the transcript is
    // several messages deep before first paint. Scrolling then jumped past the
    // intro, the request and the Setup card.
    it('does not scroll itself on first paint', () => {
      setup({ state: { simpleInput: 'Design a landing page' }, fill: true });
      expect(screen.getByTestId('goal-thread').scrollTop).toBe(0);
    });

    // Nothing sits between the last message and the box you type into.
    it('puts the composer directly under the conversation', () => {
      setup({
        state: { submittedText: 'Design a landing page', createdGoal: { id: 'g1' } },
        run: { goal: { id: 'g1', status: 'active' }, logs: [] },
        footer: <div data-testid="composer" />,
      });
      const foot = screen.getByTestId('goal-thread-footer');
      expect(foot).toContainElement(screen.getByTestId('composer'));
      // The old status strip lived in this footer, above the composer.
      expect(foot.textContent).toBe('');
      expect(screen.queryByText('Working on it')).toBeNull();
    });

    it('renders the run header inside the column, not floating over it', () => {
      setup({ header: <div data-testid="run-header" /> });
      const thread = screen.getByTestId('goal-thread');
      expect(thread).toContainElement(screen.getByTestId('run-header'));
    });

    // The switch rides the pinned composer, not the thread: a long run would
    // otherwise scroll the control for changing views out of reach.
    it('leaves the view switch to the composer', () => {
      setup({ footer: <div data-testid="composer" /> });
      expect(screen.queryByRole('button', { name: 'Dashboard' })).toBeNull();
      expect(screen.getByTestId('composer')).toBeInTheDocument();
    });

    it('keeps the setup on one card with its three blocks', () => {
      setup({ form: { setupManual: true }, state: { setupManual: true } });
      expect(screen.getByTestId('materials-block')).toBeInTheDocument();
      expect(screen.getByTestId('tools-block')).toBeInTheDocument();
      expect(screen.getByTestId('destination-block')).toBeInTheDocument();
      expect(
        screen.getByRole('switch', { name: /Choose the setup yourself/i })
      ).toBeInTheDocument();
    });
  });

  describe('a stage in flight', () => {
    const at = (t) => `2026-01-01T12:0${t}:00Z`;
    const runWith = (logs, goal) => ({ logs, goal });

    // The pipeline only writes a log row once a stage has finished, so without
    // a present-tense form the run reads as a static list that grows.
    it('reads the newest stage present-tense while the goal is running', () => {
      setup({
        state: {},
        run: runWith([{ id: 'l1', event_type: 'plan_created', details: {}, created_at: at(1) }], {
          status: 'planning',
        }),
      });
      expect(screen.getByText('Building the plan')).toBeInTheDocument();
      expect(screen.queryByText('Plan ready')).toBeNull();
    });

    it('resolves it in place once a later stage arrives', () => {
      setup({
        state: {},
        run: runWith(
          [
            { id: 'l1', event_type: 'plan_created', details: {}, created_at: at(1) },
            { id: 'l2', event_type: 'team_approved', details: {}, created_at: at(2) },
          ],
          { status: 'forming_team' }
        ),
      });
      // The earlier stage has demonstrably finished, because a later one exists.
      expect(screen.getByText('Plan ready')).toBeInTheDocument();
      // And the newest is now the one in flight.
      expect(screen.getByText('Picking the team')).toBeInTheDocument();
    });

    it('leaves nothing in flight once the goal has stopped', () => {
      setup({
        state: {},
        run: runWith([{ id: 'l1', event_type: 'plan_created', details: {}, created_at: at(1) }], {
          status: 'completed',
        }),
      });
      expect(screen.getByText('Plan ready')).toBeInTheDocument();
      expect(screen.queryByText('Building the plan')).toBeNull();
    });

    it('never shows a gate or a failure as in flight', () => {
      setup({
        state: {},
        run: runWith(
          [{ id: 'l1', event_type: 'awaiting_approval', details: {}, created_at: at(1) }],
          { status: 'awaiting_approval' }
        ),
      });
      expect(screen.getByText('Waiting on you')).toBeInTheDocument();
    });
  });
});

/**
 * A goal picked back up from History used to replay the run and stop dead. The
 * thread now closes on what came out, with the files openable from inside the
 * conversation rather than only from a popup it had no button for.
 */
describe('GoalThread - a finished run', () => {
  const finished = {
    goal: {
      id: 'g-done',
      status: 'completed',
      data: {
        completed_at: '2026-01-01T16:54:00Z',
        deliverables: [
          {
            id: 'd1',
            title: 'Zero-Capital Failure Mode Analysis',
            categoryLabel: 'Strategy',
            agent_name: 'Risk Assessment Strategist',
            output: '# Risks\n\nNine mitigations.',
          },
        ],
        project_overview: {
          one_liner: 'A zero-capital plan you can start on Monday.',
          summary: 'Four sentences about what shipped and why it is ready.',
          team_lead_note: 'Team shipped all three phases.',
        },
      },
    },
    logs: [
      {
        id: 'l1',
        event_type: 'goal_completed',
        details: { totalCost: 0.08 },
        created_at: '2026-01-01T16:54:00Z',
      },
    ],
    messages: [],
    tasks: [],
  };

  it('ends on what was produced, not on what it cost', () => {
    setup({ state: { resumed: true }, run: finished });
    expect(screen.getByText('Your result')).toBeInTheDocument();
    expect(screen.getByText(/zero-capital plan you can start on Monday/)).toBeInTheDocument();
    expect(screen.getByText('Zero-Capital Failure Mode Analysis')).toBeInTheDocument();
    expect(screen.getByText('Team lead note - Rex')).toBeInTheDocument();
  });

  it('hands the goal id to whatever opens the full detail view', () => {
    const onOpenReport = vi.fn();
    setup({ state: { resumed: true }, run: finished, onOpenReport });
    fireEvent.click(screen.getByRole('button', { name: 'View more details' }));
    expect(onOpenReport).toHaveBeenCalledWith('g-done');
  });

  // The viewer is absolutely positioned against the thread, so this only
  // passes if the provider is mounted inside a positioned ancestor.
  it('reads a deliverable inside the conversation it was produced in', () => {
    setup({ state: { resumed: true }, run: finished, fill: true });
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(
      screen.getByRole('dialog', { name: /Viewing Zero-Capital Failure Mode Analysis/ })
    ).toBeInTheDocument();
  });

  // The viewer covers its positioned ancestor, and where the host scrolls the
  // thread is as tall as its content - so the panel's own close button would
  // land far above the viewport. That surface keeps Download and Open instead.
  it('offers no in-place reading where the thread has no bounded box to fill', () => {
    setup({ state: { resumed: true }, run: finished, fill: false });
    expect(screen.getByText('Your result')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View' })).not.toBeInTheDocument();
  });

  it('says nothing about results while the run is still going', () => {
    setup({
      state: { resumed: true },
      run: { ...finished, goal: { ...finished.goal, status: 'active' } },
    });
    expect(screen.queryByText('Your result')).not.toBeInTheDocument();
  });
});

/**
 * Where a conversation opens.
 *
 * jsdom has no layout, so scrollTop and scrollHeight are inert. Both are given
 * real behaviour here - otherwise every assertion below reads 0 and passes
 * whatever the component does.
 */
function withScrollGeometry(scrollHeight = 1200) {
  const proto = HTMLElement.prototype;
  Object.defineProperty(proto, 'scrollHeight', { configurable: true, get: () => scrollHeight });
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => 400 });
  Object.defineProperty(proto, 'scrollTop', {
    configurable: true,
    get() {
      return this.__top ?? 0;
    },
    set(v) {
      this.__top = v;
    },
  });
  return () => {
    for (const key of ['scrollHeight', 'clientHeight', 'scrollTop']) delete proto[key];
  };
}

describe('GoalThread - where a reopened conversation opens', () => {
  const goal = { id: 'g-past', status: 'completed', data: {}, plan: { phases: [] } };
  const logs = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: `l${i}`,
      event_type: 'phase_evaluated',
      details: { phaseIndex: i, quality_score: 90 },
      created_at: `2026-01-01T12:${String(i).padStart(2, '0')}:00Z`,
    }));

  const view = (props) => (
    <ThemeProvider theme={theme}>
      <GoalThread form={makeForm()} transcriptState={{ resumed: true }} fill {...props} />
    </ThemeProvider>
  );
  const stream = () => screen.getByTestId('goal-thread');

  let restore;
  beforeEach(() => {
    restore = withScrollGeometry();
  });
  afterEach(() => restore());

  // The run you are watching happen: new lines should pull the view down.
  it('follows the newest line of a run being watched', () => {
    const running = { ...goal, status: 'active' };
    const { rerender } = render(
      view({ run: { goal: running, logs: [], messages: [], tasks: [] } })
    );
    rerender(view({ run: { goal: running, logs: logs(6), messages: [], tasks: [] } }));
    expect(stream().scrollTop).toBe(1200);
  });

  // The run you came back to read. The log loads a beat after the surface
  // mounts, so the follow effect used to fire on that first batch and drop the
  // user at the last line of a finished run - past everything they clicked in
  // to see.
  it('opens a reopened run at its first message, not its last', () => {
    const { rerender } = render(
      view({ openAtTop: true, run: { goal, logs: [], messages: [], tasks: [] } })
    );
    rerender(view({ openAtTop: true, run: { goal, logs: logs(6), messages: [], tasks: [] } }));
    expect(stream().scrollTop).toBe(0);
  });

  // Reopening a second row has to reposition, because the host swaps this
  // component's props rather than remounting it.
  it('repositions when a different conversation is opened from History', () => {
    const other = { ...goal, id: 'g-other' };
    const { rerender } = render(
      view({ openAtTop: true, run: { goal, logs: logs(6), messages: [], tasks: [] } })
    );
    stream().scrollTop = 900;
    rerender(
      view({ openAtTop: true, run: { goal: other, logs: logs(6), messages: [], tasks: [] } })
    );
    expect(stream().scrollTop).toBe(0);
  });

  // Once the user has scrolled down to the live end themselves, a resumed goal
  // that is still running should carry on following.
  it('follows again once the user scrolls to the live end', () => {
    const running = { ...goal, status: 'active' };
    const { rerender } = render(
      view({ openAtTop: true, run: { goal: running, logs: logs(6), messages: [], tasks: [] } })
    );
    const el = stream();
    el.scrollTop = 800; // 1200 - 800 - 400 = 0, inside the pinned slack
    fireEvent.scroll(el);
    rerender(
      view({ openAtTop: true, run: { goal: running, logs: logs(8), messages: [], tasks: [] } })
    );
    expect(el.scrollTop).toBe(1200);
  });
});
