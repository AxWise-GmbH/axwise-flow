/**
 * Tests for SmartRequestDialog — Simple/Professional tabbed request creation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import SmartRequestDialog, { requestModeChoices } from './SmartRequestDialog';
import { RunningGoalProvider } from '../../context/RunningGoalContext';
import TopBarGoalActions from '../Layout/TopBarGoalActions';
import { INTRO_TEXT } from './NewGoal/newGoalTranscript';
import { getGoalSetup, resetGoalSetup, setGoalSetupTarget } from '../../hooks/useGoalSetup';
import {
  advancedResearchRequiresGrounding,
  isCommercialResearchRequest,
  resolveAdvancedResearchMode,
} from './researchPolicy';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockStartListening = vi.fn();
const mockStopListening = vi.fn();

vi.mock('../../hooks/useVoiceControl', () => ({
  useVoiceControl: vi.fn(() => ({
    state: 'idle',
    transcript: '',
    error: null,
    isSupported: true,
    startListening: mockStartListening,
    stopListening: mockStopListening,
    clearTranscript: vi.fn(),
    pauseListening: vi.fn(),
    resumeListening: vi.fn(),
    clearError: vi.fn(),
    setState: vi.fn(),
  })),
}));

vi.mock('../../services/agentJobService', () => ({
  enqueueAndWait: vi.fn(),
}));

vi.mock('../../hooks/useSimpleMode', () => ({
  useSimpleMode: vi.fn(() => ({
    simpleMode: false,
    setSimpleMode: vi.fn(),
    toggleSimpleMode: vi.fn(),
  })),
}));

vi.mock('../../services/goalService', () => ({
  createGoal: vi.fn((data) => Promise.resolve({ id: 'mock-goal-id', ...data })),
  createGoalSourceRequestId: vi.fn(() => 'mock-source-request-id'),
  createSmartRequestDraft: vi.fn((data) =>
    Promise.resolve({ id: 'mock-goal-id', status: 'draft', ...data })
  ),
  acceptGoalCustomerScope: vi.fn(() => Promise.resolve({ status: 'researching_customer' })),
  reviseGoalCustomerScope: vi.fn(() => Promise.resolve({ status: 'analyzing' })),
  preparePhysicalEvidenceProfile: vi.fn(),
  startGoal: vi.fn((id, attachments) =>
    Promise.resolve({ id, status: 'feasibility', data: { attachments } })
  ),
  listGoals: vi.fn(() => Promise.resolve([])),
  getGoal: vi.fn(),
  // Pulled in transitively by the goal dashboard's approval gates.
  getGoalResearchBundle: vi.fn(() => Promise.resolve(null)),
  approveGoalContext: vi.fn(),
  reviseGoalContext: vi.fn(),
  requestGoalContextEvidence: vi.fn(),
  approveGoal: vi.fn(),
  requestGoalChanges: vi.fn(),
  // Pulled in by useGoalActions, which the shell's Actions button owns now.
  cancelGoal: vi.fn(),
  pauseGoal: vi.fn(),
  resumeGoal: vi.fn(),
  toggleAutopilot: vi.fn(),
  toggleLoop: vi.fn(),
}));

vi.mock('../../services/organizationService', () => ({
  listOrganizations: vi.fn(),
  createGoalOrganization: vi.fn(),
}));

vi.mock('../../services/goalUnitService', () => ({
  implementExisting: vi.fn(),
  listUnits: vi.fn(() => Promise.resolve([])),
}));

const realtimeState = {
  goal: null,
  logs: [],
  messages: [],
  tasks: [],
  documents: [],
  loading: false,
  isConnected: false,
};
vi.mock('../../hooks/useGoalRealtime', () => ({
  default: vi.fn(() => ({ ...realtimeState, refresh: vi.fn() })),
}));

vi.mock('../../services/goalLeadChatService', () => ({
  sendLeadMessage: vi.fn(() => Promise.resolve({ reply: 'On it.', actions: [] })),
}));

import { useVoiceControl } from '../../hooks/useVoiceControl';
import { enqueueAndWait } from '../../services/agentJobService';
import {
  createGoal as createCompareGoal,
  createGoalSourceRequestId,
  createSmartRequestDraft as createGoal,
  acceptGoalCustomerScope,
  approveGoalContext,
  getGoal,
  preparePhysicalEvidenceProfile,
  reviseGoalContext,
  reviseGoalCustomerScope,
  startGoal,
} from '../../services/goalService';
import {
  createGoalOrganization as createOrganization,
  listOrganizations,
} from '../../services/organizationService';
import { implementExisting } from '../../services/goalUnitService';
import { sendLeadMessage } from '../../services/goalLeadChatService';

// ── Helpers ──────────────────────────────────────────────────────────────────

const theme = createTheme();

function renderDialog(props = {}) {
  const defaultProps = { open: true, onClose: vi.fn(), onSubmit: vi.fn() };
  return render(
    <MemoryRouter>
      <ThemeProvider theme={theme}>
        <SmartRequestDialog {...defaultProps} {...props} />
      </ThemeProvider>
    </MemoryRouter>
  );
}

// Organization loading is not the subject of most component cases. Resolve
// synchronously inside React Testing Library's render act() boundary so those
// tests do not emit unrelated asynchronous state-update warnings.
function immediateResult(value) {
  const chain = {
    then(onFulfilled) {
      onFulfilled(value);
      return chain;
    },
    catch() {
      return chain;
    },
    finally(onFinally) {
      onFinally();
      return chain;
    },
  };
  return chain;
}

function makeMockAiResponse(overrides = {}) {
  return {
    status: 'done',
    result: {
      content: JSON.stringify({
        title: 'Sales Dashboard',
        category: 'development',
        priority: 'high',
        requirements: 'Charts and filters',
        summary: 'A dashboard.',
        suggestedAgents: [{ name: 'Agent Alpha', role: 'Data processing' }],
        ...overrides,
      }),
    },
  };
}

function makeMockSimpleAiResponse(overrides = {}) {
  return {
    status: 'done',
    result: {
      content: JSON.stringify({
        title: 'Sales Dashboard',
        category: 'development',
        priority: 'high',
        requirements: 'Charts and filters',
        summary: 'A dashboard.',
        suggestedAgents: [{ name: 'Agent Alpha', role: 'Data processing' }],
        extracted: {
          goal: 'Build a dashboard',
          challenges: '',
          timeline: 'This week',
          preferences: '',
        },
        suggestions: ['Add more detail about data sources', 'Specify chart types needed'],
        ...overrides,
      }),
    },
  };
}

const PHYSICAL_PROFILE_HASH = 'a'.repeat(64);
const PHYSICAL_MARKET_HASH = 'b'.repeat(64);

function makePreparedPhysicalEvidenceProfile(overrides = {}) {
  const profile = {
    version: 'business_evidence_profile_v1',
    intent: 'commercial_market_launch',
    economic_model: 'physical_product',
    market_scope_hash: PHYSICAL_MARKET_HASH,
    fact_requirements: [
      {
        kind: 'physical_product_offer',
        minimum_verified: 2,
        applicability: 'required',
      },
    ],
    calculation_requirements: [
      {
        kind: 'physical_offer_price_difference',
        minimum_verified: 1,
        applicability: 'required',
      },
    ],
    required_role_slots: [
      'customer_market',
      'pricing_finance',
      'legal_compliance',
      'sales_distribution',
      'risk_operations',
    ],
  };
  return {
    research_intent: 'commercial_market_launch',
    business_evidence_profile: profile,
    business_evidence_profile_hash: PHYSICAL_PROFILE_HASH,
    market_scope_hash: PHYSICAL_MARKET_HASH,
    requested_execution_roles: [
      'Marketing ICP Specialist',
      'Finance Pricing Specialist',
      'GDPR Legal Compliance Specialist',
      'Business Development Sales Specialist',
      'Commercial Risk Analyst',
    ],
    binding: {
      org_id: 'org-default',
      research_mode: 'grounded_deep',
      market_scope_hash: PHYSICAL_MARKET_HASH,
    },
    ...overrides,
  };
}

/** Switch to Professional tab */
/**
 * The mode switch is a bottom-left menu button now, matching the Actions
 * control on the goal dialog, rather than a tab strip at the top.
 */
function switchToProfessional() {
  fireEvent.click(screen.getByRole('button', { name: /Simple/i }));
  fireEvent.click(screen.getByRole('menuitem', { name: /Professional/i }));
}

function fillResearchLocation(value = 'Bremen, Germany') {
  fireEvent.change(screen.getByLabelText(/Research market or location/i), {
    target: { value },
  });
}

/** Fill goal and click "Find My Solution" in Professional tab, advance timers, wait for AI done. */
async function goToStep2Done(goalText = 'Build a sales reporting tool', intake = {}) {
  switchToProfessional();
  fireEvent.change(screen.getByPlaceholderText(/Build a customer dashboard/), {
    target: { value: goalText },
  });
  if (intake.challenges) {
    fireEvent.change(screen.getByPlaceholderText(/Current process is manual/), {
      target: { value: intake.challenges },
    });
  }
  if (intake.timeline) {
    fireEvent.change(screen.getByPlaceholderText(/Within 1 week/), {
      target: { value: intake.timeline },
    });
  }
  if (intake.details) {
    fireEvent.change(screen.getByPlaceholderText(/Must integrate with Slack/), {
      target: { value: intake.details },
    });
  }

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  });

  await act(async () => {
    await Promise.resolve();
  });

  await act(async () => {
    vi.advanceTimersByTime(15000);
  });

  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * Fill the Simple request and press Start.
 *
 * Simple has no review screen: Start analyses and submits in one action, so
 * this lands on the live run monitor with the goal already created.
 */
/**
 * Open one of the Manual setup blocks.
 *
 * They stay compact rows until asked for: three expanded at once put a
 * Knowledge Base picker, a tool chooser and a workspace selector on screen
 * together and pushed the conversation off the top of the thread.
 */
function openBlock(testId) {
  fireEvent.click(within(screen.getByTestId(testId)).getByRole('button', { expanded: false }));
}

// Found by a stable id rather than its label: the label is the composer's
// current role and changes as the goal moves from described to sent to running.
function simpleComposer() {
  return screen.getByTestId('goal-composer-input');
}

// The thread as the app actually mounts it: inside the shell that owns the
// fixed top bar, so the published goal has somewhere to land.
function renderWithShell(props = {}) {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={theme}>
        <RunningGoalProvider>
          <TopBarGoalActions />
          <SmartRequestDialog
            variant="inline"
            open
            onClose={vi.fn()}
            onSubmit={vi.fn()}
            {...props}
          />
        </RunningGoalProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

async function goToSimpleResult(goalText = 'Build a data pipeline') {
  fireEvent.change(simpleComposer(), { target: { value: goalText } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await Promise.resolve();
  });
  await flushSimpleHandoff();
}

// Simple mode no longer waits for a preliminary LLM job or its progress
// timers. Give React a commit boundary for the auto-submit effect, then flush
// the draft-create and start-goal promise chain without advancing the 60s
// safety timeout (or unrelated UI timers).
async function flushSimpleHandoff() {
  for (let turn = 0; turn < 8; turn += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  // A few in-flight-state cases deliberately leave draft creation pending.
  // clearAllMocks resets call history, not implementations, so restore the
  // normal service contract before every case instead of leaking that pending
  // promise into all later Simple and Professional tests.
  createCompareGoal.mockImplementation((data) => Promise.resolve({ id: 'mock-goal-id', ...data }));
  createGoal.mockImplementation((data) =>
    Promise.resolve({ id: 'mock-goal-id', status: 'draft', ...data })
  );
  startGoal.mockImplementation((id, attachments) =>
    Promise.resolve({ id, status: 'feasibility', data: { attachments } })
  );
  // The goal setup store outlives a render, so a destination picked by one test
  // would otherwise decide where the next test's goal runs.
  resetGoalSetup();
  useVoiceControl.mockReturnValue({
    state: 'idle',
    transcript: '',
    error: null,
    isSupported: true,
    startListening: mockStartListening,
    stopListening: mockStopListening,
    clearTranscript: vi.fn(),
    pauseListening: vi.fn(),
    resumeListening: vi.fn(),
    clearError: vi.fn(),
    setState: vi.fn(),
  });
  listOrganizations.mockReturnValue(
    immediateResult([
      {
        id: 'org-default',
        name: 'Primary Workspace',
        is_active: true,
        created_at: '2025-01-01T00:00:00.000Z',
      },
    ])
  );
  createOrganization.mockResolvedValue({
    organization: {
      id: 'org-created',
      name: 'Created Business',
      is_active: true,
    },
    agent_count: 6,
  });
  implementExisting.mockResolvedValue({
    org: { id: 'org-created', name: 'Created Business' },
    unit: { id: 'unit-created', name: 'Created Business — Main' },
  });
  preparePhysicalEvidenceProfile.mockResolvedValue(makePreparedPhysicalEvidenceProfile());
  getGoal.mockImplementation(async () =>
    structuredClone(
      realtimeState.goal || {
        id: 'mock-goal-id',
        status: 'active',
        data: {},
      }
    )
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SmartRequestDialog', () => {
  // ── Tab switching ─────────────────────────────────────────
  describe('Tab switching', () => {
    it('defaults to Simple tab', () => {
      renderDialog();
      expect(screen.getByText('Describe')).toBeDefined();
    });

    it('offers both modes from the footer menu, not a tab strip', () => {
      renderDialog();
      // The switch moved to a bottom-left menu button to match the Actions
      // control on the goal dialog.
      fireEvent.click(screen.getByRole('button', { name: /Simple/i }));
      expect(screen.getByRole('menuitem', { name: /Simple/i })).toBeDefined();
      expect(screen.getByRole('menuitem', { name: /Professional/i })).toBeDefined();
      expect(screen.queryByRole('tab')).toBeNull();
    });

    it('removes the pre-AxWise Professional wizard from production choices', () => {
      expect(requestModeChoices(false).map((choice) => choice.id)).toEqual(['simple']);
      expect(requestModeChoices(true).map((choice) => choice.id)).toEqual([
        'simple',
        'professional',
      ]);
    });

    it('switches to Professional tab and shows stepper', () => {
      renderDialog();
      switchToProfessional();
      expect(screen.getByText('Brief')).toBeDefined();
      expect(screen.getByText('Progress')).toBeDefined();
    });

    it('does not show stepper on Simple tab', () => {
      renderDialog();
      expect(screen.queryByText('Tell About You')).toBeNull();
    });

    it('does not render when open is false', () => {
      renderDialog({ open: false });
      expect(screen.queryByText('Describe')).toBeNull();
    });
  });

  // ── Simple tab ────────────────────────────────────────────
  describe('Simple tab', () => {
    it('opens as a thread with one composer, not a stacked form', () => {
      renderDialog();
      expect(screen.getByText(/Tell me what you want to achieve/)).toBeInTheDocument();
      expect(simpleComposer()).toBeInTheDocument();
    });

    // Simple sends from the composer; a footer Start would be two controls
    // for one action. Professional keeps its Start, which is covered below.
    it('has no second Start control beside the composer', () => {
      renderDialog();
      expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    });

    it('cannot send an empty request, and says why', () => {
      renderDialog();
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
      expect(screen.getByText(/Tell us what you want to achieve/)).toBeInTheDocument();
    });

    it('can send once the request is long enough to act on', () => {
      renderDialog();
      fireEvent.change(simpleComposer(), { target: { value: 'Build a dashboard for sales' } });
      expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled();
    });

    it('sends on Enter without reaching for a button', async () => {
      renderDialog();
      const requestText = 'Build a dashboard for sales';
      fireEvent.change(simpleComposer(), { target: { value: requestText } });
      await act(async () => {
        fireEvent.keyDown(simpleComposer(), { key: 'Enter' });
        await Promise.resolve();
      });
      await flushSimpleHandoff();

      expect(enqueueAndWait).not.toHaveBeenCalled();
      expect(createGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          title: requestText,
          parsed_requirements: requestText,
          parsed_category: null,
          parsed_priority: 'medium',
        })
      );
    });

    it('spends no model call before handing the exact request to AxWise', async () => {
      renderDialog();
      const requestText = 'Create a marketing report';
      fireEvent.change(simpleComposer(), { target: { value: requestText } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      });
      await flushSimpleHandoff();

      expect(enqueueAndWait).not.toHaveBeenCalled();
      const request = createGoal.mock.calls[0][0];
      expect(request).toEqual(
        expect.objectContaining({
          title: requestText,
          parsed_requirements: requestText,
        })
      );
      expect(request).not.toHaveProperty('provider');
      expect(request).not.toHaveProperty('model');
    });

    it('sends a detailed request straight to AxWise without a preliminary LLM interpretation', async () => {
      const detailedRequest = [
        'Create exactly one decision-ready Markdown plan for an Estonia retail pilot.',
        'Use independent pet shops in Tallinn and Tartu for 90 days.',
        'The shop buyer is the primary customer and cat owners are secondary users.',
        'Exclude outreach, purchasing, shipment execution, supermarkets, and ecommerce.',
      ].join(' ');
      renderDialog();

      await goToSimpleResult(detailedRequest);

      expect(detailedRequest.length).toBeGreaterThan(240);
      expect(enqueueAndWait).not.toHaveBeenCalled();
      expect(createGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          parsed_category: null,
          parsed_requirements: detailedRequest,
          complexity: 'complex',
        })
      );
      expect(createGoal.mock.calls[0][0].description.startsWith(detailedRequest)).toBe(true);
      expect(createGoal.mock.calls[0][0].description).not.toContain('Tool Usage:');
      expect(createGoal.mock.calls[0][0].description).not.toContain('Expected Results:');
    });

    it('never renders legacy prefill suggestion chips', async () => {
      enqueueAndWait.mockResolvedValue(
        makeMockSimpleAiResponse({ suggestions: ['Which brand?', 'What launch volume?'] })
      );
      renderDialog();

      await goToSimpleResult('Draft a short Estonia launch note');

      expect(screen.queryByText('Which brand?')).not.toBeInTheDocument();
      expect(screen.queryByText('What launch volume?')).not.toBeInTheDocument();
      expect(enqueueAndWait).not.toHaveBeenCalled();
      expect(createGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          parsed_requirements: 'Draft a short Estonia launch note',
        })
      );
    });

    it('keeps short prefill output out of the canonical AxWise inputs', async () => {
      enqueueAndWait.mockResolvedValue(
        makeMockSimpleAiResponse({
          title: 'Build an ecommerce platform',
          category: 'development',
          priority: 'urgent',
          requirements: 'Invented software requirements',
          expectedResults: 'Build a web shop',
          budget_suggestion: 100,
        })
      );
      renderDialog();

      await goToSimpleResult('Plan cat-food distribution in Estonia');

      expect(createGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Plan cat-food distribution in Estonia',
          budget_usd: 5,
          parsed_category: null,
          parsed_priority: 'medium',
          parsed_requirements: 'Plan cat-food distribution in Estonia',
        })
      );
      expect(createGoal.mock.calls[0][0].description).not.toContain('Expected Results:');
    });

    // Regression: the hero on the dashboard passes initialPrompt, which triggers
    // the auto-analyze effect rather than the Start control. That path used to
    // call handleSimpleAnalyze directly without arming autoSubmitRef, so the
    // request was analysed, the wizard advanced to the monitor, and no goal was
    // ever created — leaving the user on a screen whose only button was Close.
    // One surface: the run reports into the thread the goal was written in,
    // rather than swapping the screen for a monitor.
    it('keeps the thread and continues in it once the goal is created', async () => {
      enqueueAndWait.mockResolvedValue(makeMockSimpleAiResponse());
      renderDialog();
      await goToSimpleResult('Build a sales dashboard for weekly reporting');

      expect(createGoal).toHaveBeenCalled();
      expect(screen.getByText('Started')).toBeInTheDocument();
      // What the user wrote has not been thrown away.
      expect(screen.getAllByText(/Build a sales dashboard/).length).toBeGreaterThan(0);
    });

    // The strip above the composer restated, in two shorter sentences, whatever
    // the newest stage message in the thread had just said - in the one place
    // the eye lands before typing.
    it('does not repeat the run status over the composer', async () => {
      enqueueAndWait.mockResolvedValue(makeMockSimpleAiResponse());
      renderDialog();
      await goToSimpleResult('Build a sales dashboard for weekly reporting');

      expect(screen.queryByText('Working on it')).toBeNull();
      expect(screen.queryByText('Your team is producing the deliverables.')).toBeNull();
      // The thread itself still reports, and the composer is still there.
      expect(screen.getByText('Started')).toBeInTheDocument();
      expect(screen.getByTestId('goal-composer-input')).toBeInTheDocument();
    });

    it('offers the full goal view without a way back to editing', async () => {
      enqueueAndWait.mockResolvedValue(makeMockSimpleAiResponse());
      renderDialog();
      await goToSimpleResult('Build a sales dashboard for weekly reporting');

      expect(screen.getByRole('button', { name: 'Full detail' })).toBeInTheDocument();
      // The goal is already running, so Start Over would be a lie.
      expect(screen.queryByText('Start Over')).toBeNull();
    });

    // Both run views ship so they can be compared on real goals. The four
    // labels used to be printed as inert text under aria-hidden; picking
    // Dashboard is what finally makes them controls.
    it('switches the running goal between the thread and the dashboard', async () => {
      enqueueAndWait.mockResolvedValue(makeMockSimpleAiResponse());
      renderDialog();
      await goToSimpleResult('Build a sales dashboard for weekly reporting');

      // Thread is the default: no tabs, and the conversation is still there.
      expect(screen.queryByRole('tab')).toBeNull();
      expect(screen.getByText('Started')).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
      });

      expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
        'Pipeline',
        'Work Log',
        'Report',
        'Result',
      ]);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Thread' }));
      });
      expect(screen.queryByRole('tab')).toBeNull();
    });

    it('offers no run view switch before the request is sent', () => {
      renderDialog();
      expect(screen.queryByRole('button', { name: 'Dashboard' })).toBeNull();
    });

    // Analysis is most of the time this screen is on. Gating the switch on a
    // created goal row meant it was unreachable for that whole stretch.
    // A box still holding the sentence you just sent reads as if nothing
    // happened, and inviting a second send of the same text.
    it('empties the composer on send while the thread keeps the message', async () => {
      createGoal.mockReturnValue(new Promise(() => {}));
      renderDialog();
      const requestText = 'Build a sales dashboard';
      fireEvent.change(simpleComposer(), { target: { value: requestText } });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        await Promise.resolve();
      });
      await flushSimpleHandoff();

      expect(simpleComposer()).toHaveValue('');
      // The sentence is now the request bubble, not composer state.
      expect(screen.getAllByText(requestText).length).toBeGreaterThan(0);
      expect(enqueueAndWait).not.toHaveBeenCalled();
      expect(createGoal).toHaveBeenCalledWith(
        expect.objectContaining({ parsed_requirements: requestText })
      );
    });

    // There is no preliminary brief/model phase anymore. The same send hands
    // the raw request to AxWise and turns the composer into lead chat once the
    // goal has started.
    it('hands the request directly to AxWise and opens lead chat', async () => {
      renderDialog();
      const requestText = 'Build a sales dashboard';
      await goToSimpleResult(requestText);

      expect(enqueueAndWait).not.toHaveBeenCalled();
      expect(createGoal).toHaveBeenCalledWith(
        expect.objectContaining({ parsed_requirements: requestText })
      );
      expect(screen.queryByText('Describing your goal')).toBeNull();
      expect(screen.queryByText(/Sent - preparing your brief/)).toBeNull();
      expect(
        screen.getByRole('textbox', { name: /messages go to your team lead/i })
      ).toBeInTheDocument();
    });

    // Once the goal is running the same box talks to its team lead. Sending
    // must not start a second goal, and the exchange stays in the thread.
    it('sends to the team lead once the goal is running, and empties the box', async () => {
      enqueueAndWait.mockResolvedValue(makeMockSimpleAiResponse());
      sendLeadMessage.mockResolvedValue({
        reply: 'Research is underway. Two sources so far.',
        actions: [
          { type: 'pause_goal', label: 'Pause the goal', summary: 'Stops work', params: {} },
        ],
      });
      renderDialog();
      await goToSimpleResult('Build a sales dashboard for weekly reporting');
      expect(createGoal).toHaveBeenCalledTimes(1);

      // Named, not labelled: nothing is drawn above the box once the goal is
      // running - the thread already says where the run is.
      expect(screen.queryByText(/messages go to your team lead/)).toBeNull();
      expect(
        screen.getByRole('textbox', { name: /messages go to your team lead/i })
      ).toBeInTheDocument();
      fireEvent.change(simpleComposer(), { target: { value: 'How is it going?' } });
      await act(async () => {
        fireEvent.keyDown(simpleComposer(), { key: 'Enter' });
        await Promise.resolve();
      });

      expect(sendLeadMessage).toHaveBeenCalledWith(
        expect.objectContaining({ goalId: 'mock-goal-id', message: 'How is it going?' })
      );
      // The same endpoint GoalLeadChatDialog uses, not a second goal.
      expect(createGoal).toHaveBeenCalledTimes(1);
      expect(simpleComposer()).toHaveValue('');
      expect(screen.getByText('How is it going?')).toBeInTheDocument();

      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByText('Research is underway. Two sources so far.')).toBeInTheDocument();
      // A proposed action arrives as something to confirm, not as prose.
      expect(screen.getByText('Pause the goal')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    });

    it('carries the earlier turns to the team lead as history', async () => {
      enqueueAndWait.mockResolvedValue(makeMockSimpleAiResponse());
      sendLeadMessage.mockResolvedValue({ reply: 'First answer.', actions: [] });
      renderDialog();
      await goToSimpleResult('Build a sales dashboard for weekly reporting');

      fireEvent.change(simpleComposer(), { target: { value: 'First question' } });
      await act(async () => {
        fireEvent.keyDown(simpleComposer(), { key: 'Enter' });
        await Promise.resolve();
        await Promise.resolve();
      });
      fireEvent.change(simpleComposer(), { target: { value: 'Second question' } });
      await act(async () => {
        fireEvent.keyDown(simpleComposer(), { key: 'Enter' });
        await Promise.resolve();
      });

      expect(sendLeadMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          message: 'Second question',
          history: [
            { sender: 'user', text: 'First question' },
            { sender: 'lead', text: 'First answer.' },
          ],
        })
      );
    });

    it('keeps the thread usable when the team lead cannot answer', async () => {
      enqueueAndWait.mockResolvedValue(makeMockSimpleAiResponse());
      sendLeadMessage.mockRejectedValue(new Error('HTTP 503'));
      renderDialog();
      await goToSimpleResult('Build a sales dashboard for weekly reporting');

      fireEvent.change(simpleComposer(), { target: { value: 'Status?' } });
      await act(async () => {
        fireEvent.keyDown(simpleComposer(), { key: 'Enter' });
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByText(/could not answer just now/)).toBeInTheDocument();
      // The box is back for another try.
      fireEvent.change(simpleComposer(), { target: { value: 'Again?' } });
      expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled();
    });

    // The switch used to sit above the composer, crowding the box the user is
    // typing into. It belongs with the run it switches.
    it('keeps the run view switch hidden while the draft handoff is pending', async () => {
      createGoal.mockReturnValue(new Promise(() => {}));
      renderDialog();
      fireEvent.change(simpleComposer(), { target: { value: 'Build a sales dashboard' } });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        await Promise.resolve();
      });
      await flushSimpleHandoff();

      expect(enqueueAndWait).not.toHaveBeenCalled();
      expect(createGoal).toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Dashboard' })).not.toBeInTheDocument();
    });

    it('offers the run view switch on the run header once the goal is running', async () => {
      enqueueAndWait.mockResolvedValue(makeMockSimpleAiResponse());
      renderDialog();
      await goToSimpleResult('Build a sales dashboard for weekly reporting');

      expect(screen.getByRole('button', { name: 'Dashboard' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Thread' })).toBeInTheDocument();
    });

    // Starting a goal here used to leave no way to govern it: pause, budget
    // and cancel lived only on the goal dialog.
    // The Actions menu used to sit in the thread's own header, which scrolls
    // with the conversation - so on a run longer than a screen the only control
    // that can pause or cancel the goal scrolled out of reach. It is in the
    // fixed top bar now, and the thread publishes the goal to it.
    it('hands the running goal to the shell, whose Actions menu is fixed', async () => {
      enqueueAndWait.mockResolvedValue(makeMockSimpleAiResponse());
      renderWithShell();
      await goToSimpleResult('Build a sales dashboard for weekly reporting');

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Actions/i }));
      });
      expect(screen.getByRole('menuitem', { name: /Cancel Goal/i })).toBeInTheDocument();
    });

    it("keeps the thread's own header free of a second Actions button", async () => {
      enqueueAndWait.mockResolvedValue(makeMockSimpleAiResponse());
      renderDialog();
      await goToSimpleResult('Build a sales dashboard for weekly reporting');
      // No shell in this render, so nothing offers Actions at all.
      expect(screen.queryByRole('button', { name: /Actions/i })).toBeNull();
    });

    it('offers no run controls before there is a run', () => {
      renderWithShell();
      expect(screen.queryByRole('button', { name: /Actions/i })).toBeNull();
    });

    it('creates a goal when the request arrives as a hero prompt', async () => {
      enqueueAndWait.mockResolvedValue(makeMockSimpleAiResponse());
      renderDialog({ initialPrompt: 'Design a sunglasses landing page' });

      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(15000);
        await Promise.resolve();
      });
      await act(async () => {
        await Promise.resolve();
        vi.advanceTimersByTime(200);
        await Promise.resolve();
      });

      expect(createGoal).toHaveBeenCalled();
      expect(createGoal.mock.calls[0][0]).toEqual(expect.objectContaining({ mode: 'simple' }));
    });

    it('handles AI errors gracefully', async () => {
      enqueueAndWait.mockRejectedValue(new Error('Network fail'));
      renderDialog();
      fireEvent.change(simpleComposer(), {
        target: { value: 'Build a sales dashboard for reporting' },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      });

      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(15000);
      });
      await act(async () => {
        await Promise.resolve();
      });

      // Post-fix: dialog shows softened "Review and submit" header and
      // pre-fills the form from the user's typed input instead of an alarming
      // "Manual Setup Required" headline with empty fields.
      // Flush the auto-submit that follows the fallback.
      await act(async () => {
        await Promise.resolve();
        vi.advanceTimersByTime(200);
        await Promise.resolve();
      });

      // An analyzer outage no longer blocks the user: the lossless fallback
      // builds a title from the typed text and the goal is still created,
      // rather than stranding them on a manual-entry screen.
      expect(createGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Build a sales dashboard'),
        })
      );
      // The create itself then fails in this test (the mock resolves nothing),
      // so the user is returned to Step 1 with their text intact and a visible
      // reason, rather than being left on a dead progress screen.
      // The user is not stranded: a usable Step 1 is on screen, not a dead
      // progress spinner.
      expect(simpleComposer()).toBeInTheDocument();
    });

    it('calls onSubmit with structured data on submit', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      enqueueAndWait.mockResolvedValue(
        makeMockSimpleAiResponse({
          title: 'My Request',
          category: 'data',
          priority: 'high',
          requirements: 'Detailed reqs',
        })
      );
      renderDialog({ onSubmit });
      fireEvent.change(simpleComposer(), { target: { value: 'Build a data pipeline' } });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
      });
      await act(async () => {
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(15000);
      });
      await act(async () => {
        await Promise.resolve();
      });

      expect(createGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Build a data pipeline',
          description: expect.stringContaining('Build a data pipeline'),
          parsed_category: null,
          parsed_priority: 'medium',
          parsed_requirements: 'Build a data pipeline',
          mode: 'simple',
          po_depth: 'quick',
          tool_mode: 'with_tools',
          research_mode: 'auto',
          research_fail_closed: true,
          // Execution approval is off by default; native AxWise scope
          // confirmation remains mandatory on the server.
          hitl_mode: 'unattended',
          setup_mode: 'auto',
          org_id: 'org-default',
          executor_type: 'organization',
        })
      );
      expect(createGoal.mock.calls[0][0]).not.toHaveProperty('compare_models');
      expect(createGoal.mock.calls[0][0]).not.toHaveProperty('business_evidence_profile');
      expect(createGoal.mock.calls[0][0]).not.toHaveProperty('business_evidence_profile_hash');
      expect(preparePhysicalEvidenceProfile).not.toHaveBeenCalled();

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'goal',
          goal: expect.objectContaining({
            title: 'Build a data pipeline',
            parsed_category: null,
            parsed_priority: 'medium',
            parsed_requirements: 'Build a data pipeline',
          }),
        })
      );
    });

    it('reuses one source request id when a partial compare fan-out is retried', async () => {
      vi.stubEnv('VITE_API_URL', 'http://localhost:3001');
      enqueueAndWait.mockResolvedValue(makeMockSimpleAiResponse());
      createGoalSourceRequestId.mockReturnValueOnce('compare-source-request-1');
      const partialFanOutError = Object.assign(
        new Error('Reconciliation is required; do not create replacement work.'),
        {
          status: 503,
          data: {
            goal_id: 'goal-opus-durable',
            job_id: 'job-opus-durable',
            reconciliation_state: 'terminalized-safe:parked',
            retry_safe: false,
          },
        }
      );
      createCompareGoal.mockRejectedValueOnce(partialFanOutError).mockResolvedValueOnce({
        goals: [
          { id: 'goal-opus-durable', title: 'Compare goal — (Opus Sub)' },
          { id: 'goal-gemini-durable', title: 'Compare goal — (Gemini)' },
        ],
      });
      renderDialog();

      switchToProfessional();
      const compareSwitch = screen.getByRole('switch', { name: 'Compare models' });
      expect(compareSwitch).toBeEnabled();
      fireEvent.click(compareSwitch);
      fireEvent.click(screen.getByRole('button', { name: /Professional/i }));
      fireEvent.click(screen.getByRole('menuitem', { name: /Simple/i }));

      const requestText = 'Compare a durable sales dashboard across two models';
      await goToSimpleResult(requestText);
      expect(createCompareGoal).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/Reconciliation is required/)).toBeInTheDocument();

      await goToSimpleResult(requestText);

      expect(createCompareGoal).toHaveBeenCalledTimes(2);
      const [firstPayload, retryPayload] = createCompareGoal.mock.calls.map(([payload]) => payload);
      expect(firstPayload.source_request_id).toBe('compare-source-request-1');
      expect(retryPayload.source_request_id).toBe(firstPayload.source_request_id);
      expect(retryPayload.compare_models).toEqual(firstPayload.compare_models);
      expect(retryPayload.compare_models).toHaveLength(2);
      expect(createGoalSourceRequestId).toHaveBeenCalledTimes(1);
      expect(createGoal).not.toHaveBeenCalled();
    });

    // The setup drawer is the only way a Simple goal can be aimed at anything
    // narrower than the whole workspace, so what it records has to survive the
    // analyze-then-create round trip.
    it('creates the goal on the team picked in the setup drawer', async () => {
      enqueueAndWait.mockResolvedValue(makeMockSimpleAiResponse());
      renderDialog();
      act(() => setGoalSetupTarget({ type: 'team', id: 'team-ops', label: 'Team: Ops' }));
      await goToSimpleResult('Ship the weekly report');

      expect(createGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          org_id: 'org-default',
          executor_type: 'team',
          executor_id: 'team-ops',
          concilium_id: null,
        })
      );
      expect(getGoalSetup().target).toBeNull();
    });

    it('routes a board pick through concilium_id', async () => {
      enqueueAndWait.mockResolvedValue(makeMockSimpleAiResponse());
      renderDialog();
      act(() => setGoalSetupTarget({ type: 'consilium', id: 'board-1', label: 'Board A' }));
      await goToSimpleResult('Ship the weekly report');

      expect(createGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          executor_type: 'consilium',
          concilium_id: 'board-1',
          executor_id: null,
        })
      );
    });

    // The run controls belong to a run. Before the send there is nothing to
    // stop, and two dead buttons on an empty composer say otherwise.
    it('shows no run controls until the request is sent', () => {
      renderDialog();
      expect(screen.queryByRole('button', { name: 'Stop the goal' })).toBeNull();
    });

    it('puts the run control on the composer once the request is sent', async () => {
      enqueueAndWait.mockResolvedValue(makeMockSimpleAiResponse());
      renderDialog();
      await goToSimpleResult('Build a data pipeline');

      const stop = screen.getByRole('button', { name: 'Stop the goal' });
      expect(stop).toBeInTheDocument();
      // The goal is only a draft at this point; the server would reject a pause,
      // so the button is present but not live.
      expect(stop).toBeDisabled();
    });

    it('opens the setup drawer from the composer', async () => {
      renderDialog();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Goal setup' }));
      });
      expect(screen.getByText('Goal setup')).toBeInTheDocument();
      expect(screen.getByText('Organization')).toBeInTheDocument();
      expect(screen.getByText('AxWise')).toBeInTheDocument();
    });

    it('enables tools by default without injecting a binding prompt', async () => {
      enqueueAndWait.mockResolvedValue(makeMockSimpleAiResponse());
      renderDialog();
      await goToSimpleResult('Draft an EU consulting business plan');

      expect(createGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          tool_mode: 'with_tools',
          research_mode: 'auto',
          research_fail_closed: true,
        })
      );
      expect(createGoal.mock.calls[0][0].description).not.toContain('Tool Usage:');
    });

    it('binds no-tools only when the user explicitly selects None', async () => {
      enqueueAndWait.mockResolvedValue(makeMockSimpleAiResponse());
      renderDialog();
      // Tools live in Step 1 now, behind the Manual setup switch.
      fireEvent.click(
        screen.getByLabelText('Choose the setup yourself instead of letting us pick')
      );
      openBlock('tools-block');
      fireEvent.click(screen.getByRole('radio', { name: 'None' }));

      await goToSimpleResult('Draft an EU consulting business plan');
      expect(createGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          tool_mode: 'no_tools',
          description: expect.stringContaining('DO NOT use any external tools'),
        })
      );
    });

    it('shows the actionable BYOK failure instead of a generic analyzer timeout', async () => {
      enqueueAndWait.mockResolvedValue({
        status: 'failed',
        error: 'BYOK_REQUIRED: this user has no LLM API key configured.',
      });
      renderDialog();

      await goToSimpleResult('Draft an EU consulting business plan');

      // The exact wording is asserted directly in newGoalPrompts.test.js.
      // Here the contract is only that a missing key never surfaces as a
      // generic timeout, which would send the user looking in the wrong place.
      expect(document.body.textContent).not.toMatch(/Job timed out waiting for result/i);
    });

    it('blocks standalone goal creation when no workspace exists', async () => {
      listOrganizations.mockReturnValueOnce(immediateResult([]));
      enqueueAndWait.mockResolvedValue(makeMockSimpleAiResponse());
      renderDialog();

      // Destination is part of Step 1 now, so a missing workspace stops the
      // user before analysis rather than at the final submit.
      fireEvent.change(simpleComposer(), { target: { value: 'Build a data pipeline' } });

      expect(screen.getByText(/No active workspace is available/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
      expect(createGoal).not.toHaveBeenCalled();
    });

    it('uses the selected existing organization before goal creation', async () => {
      listOrganizations.mockReturnValueOnce(
        immediateResult([
          {
            id: 'org-first',
            name: 'First Workspace',
            is_active: true,
            created_at: '2025-01-01T00:00:00.000Z',
          },
          {
            id: 'org-second',
            name: 'Second Workspace',
            is_active: true,
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ])
      );
      enqueueAndWait.mockResolvedValue(makeMockSimpleAiResponse());
      renderDialog();
      // Destination sits behind the Manual setup switch when a workspace exists.
      fireEvent.click(
        screen.getByLabelText('Choose the setup yourself instead of letting us pick')
      );
      openBlock('destination-block');
      fireEvent.click(screen.getByRole('radio', { name: 'Existing' }));
      fireEvent.mouseDown(screen.getByLabelText('Organization'));
      fireEvent.click(screen.getByRole('option', { name: 'Second Workspace' }));

      await goToSimpleResult();

      expect(createGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          org_id: 'org-second',
          executor_type: 'organization',
        })
      );
    });

    it('creates a new workspace before the goal and links its unit afterwards', async () => {
      listOrganizations.mockReturnValueOnce(immediateResult([]));
      createOrganization.mockResolvedValueOnce({
        organization: {
          id: 'org-pet-food',
          name: 'Pet Food Shop',
          is_active: true,
        },
        agent_count: 6,
        catalogue_strategy: 'all_active_owned',
      });
      enqueueAndWait.mockResolvedValue(makeMockSimpleAiResponse());
      renderDialog();

      // Destination now lives in Step 1, so the workspace is chosen before
      // analysis rather than on the review screen.
      fireEvent.click(screen.getByRole('radio', { name: 'New' }));
      fireEvent.change(screen.getByLabelText(/Business name/), {
        target: { value: 'Pet Food Shop' },
      });
      fireEvent.change(screen.getByLabelText('Industry'), {
        target: { value: 'E-commerce' },
      });

      await goToSimpleResult('Improve returns for an online pet food shop');

      expect(createOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Pet Food Shop',
          industry: 'E-commerce',
        })
      );
      expect(createOrganization.mock.invocationCallOrder[0]).toBeLessThan(
        createGoal.mock.invocationCallOrder[0]
      );
      expect(createGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          org_id: 'org-pet-food',
          executor_type: 'organization',
        })
      );
      expect(createGoal.mock.invocationCallOrder[0]).toBeLessThan(
        startGoal.mock.invocationCallOrder[0]
      );
      expect(implementExisting).toHaveBeenCalledWith('mock-goal-id', {
        orgId: 'org-pet-food',
        unitName: 'Pet Food Shop — Main',
      });
    });

    it('calls onClose when Cancel is clicked', () => {
      const onClose = vi.fn();
      renderDialog({ onClose });
      fireEvent.click(screen.getByText('Cancel'));
      expect(onClose).toHaveBeenCalled();
    });
  });

  // ── Professional tab (existing wizard) ────────────────────
  describe('Professional tab: Step 1', () => {
    it('renders step 1 with intake form', () => {
      renderDialog();
      switchToProfessional();
      expect(screen.getByText('1 · Brief')).toBeDefined();
    });

    it('shows all intake questions', () => {
      renderDialog();
      switchToProfessional();
      // MUI renders each label twice (label element plus the outline legend),
      // so query by control rather than by text.
      expect(screen.getByLabelText(/What is your main goal/)).toBeDefined();
      expect(screen.getByLabelText(/What challenges are you facing/)).toBeDefined();
      expect(screen.getByLabelText(/Expected timeline/)).toBeDefined();
      expect(screen.getByLabelText(/specific requirements/i)).toBeDefined();
    });

    it('disables Start when goal is empty', () => {
      renderDialog();
      switchToProfessional();
      const btn = screen.getByRole('button', { name: 'Start' });
      expect(btn.closest('button').disabled).toBe(true);
    });

    it('enables "Find My Solution" when goal has text', () => {
      renderDialog();
      switchToProfessional();
      fireEvent.change(screen.getByPlaceholderText(/Build a customer dashboard/), {
        target: { value: 'Build a sales reporting tool' },
      });
      const btn = screen.getByRole('button', { name: 'Start' });
      expect(btn.closest('button').disabled).toBe(false);
    });
  });

  describe('Professional tab: Step 2', () => {
    it('calls enqueueAndWait with the goal text and server-selected model', async () => {
      enqueueAndWait.mockReturnValue(new Promise(() => {}));
      renderDialog();
      switchToProfessional();
      fireEvent.change(screen.getByPlaceholderText(/Build a customer dashboard/), {
        target: { value: 'Automate invoicing' },
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      });

      const request = enqueueAndWait.mock.calls[0][0];
      expect(request).toEqual(
        expect.objectContaining({
          type: 'run-llm',
          prompt: expect.stringContaining('Automate invoicing'),
        })
      );
      expect(request).not.toHaveProperty('provider');
      expect(request).not.toHaveProperty('model');
    });

    it('shows solution card when AI returns', async () => {
      enqueueAndWait.mockResolvedValue(makeMockAiResponse());
      renderDialog();
      await goToStep2Done();

      expect(screen.getByText('Request ready to create')).toBeDefined();
      expect(screen.getByText('Sales Dashboard')).toBeDefined();
    });

    it('lets the server default select the model for refinement', async () => {
      enqueueAndWait.mockResolvedValue(makeMockAiResponse());
      renderDialog();
      await goToStep2Done();

      enqueueAndWait.mockClear();
      const refinement = screen.getByPlaceholderText(/Want to adjust anything/);
      fireEvent.change(refinement, { target: { value: 'Focus on retention risk first' } });

      await act(async () => {
        fireEvent.keyDown(refinement, { key: 'Enter', code: 'Enter' });
        await Promise.resolve();
      });

      const request = enqueueAndWait.mock.calls[0][0];
      expect(request).toEqual(
        expect.objectContaining({
          type: 'run-llm',
          prompt: expect.stringContaining('Focus on retention risk first'),
        })
      );
      expect(request).not.toHaveProperty('provider');
      expect(request).not.toHaveProperty('model');
    });

    it('shows suggested agents', async () => {
      enqueueAndWait.mockResolvedValue(
        makeMockAiResponse({
          suggestedAgents: [
            { name: 'Analytics Agent', role: 'Data processing' },
            { name: 'Design Agent', role: 'UI creation' },
          ],
        })
      );
      renderDialog();
      await goToStep2Done();

      expect(screen.getByText('Analytics Agent')).toBeDefined();
      expect(screen.getByText('Design Agent')).toBeDefined();
    });

    it('handles AI errors gracefully', async () => {
      enqueueAndWait.mockRejectedValue(new Error('Network fail'));
      renderDialog();
      await goToStep2Done();

      // Post-fix: dialog shows softened "Review and submit" header and
      // pre-fills the form from the user's typed input instead of an alarming
      // "Manual Setup Required" headline with empty fields.
      expect(screen.getByText('Review and submit')).toBeDefined();
    });

    it('preserves intake and offers retry or manual recovery after a timeout', async () => {
      enqueueAndWait.mockResolvedValueOnce({
        status: 'timeout',
        error: 'Job timed out waiting for result',
      });
      renderDialog();
      await goToStep2Done('Launch a Bremen commercial consulting offer');

      expect(screen.getByText('Retry analysis')).toBeDefined();
      expect(screen.getByText('Continue manually')).toBeDefined();
      expect(screen.getByText(/Nothing was lost/i)).toBeDefined();

      enqueueAndWait.mockResolvedValueOnce(makeMockAiResponse({ title: 'Bremen GTM Plan' }));
      await act(async () => {
        fireEvent.click(screen.getByText('Retry analysis'));
        await Promise.resolve();
      });

      expect(enqueueAndWait).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Bremen GTM Plan')).toBeDefined();
    });

    it('preserves every intake answer in the manual form when analysis times out', async () => {
      enqueueAndWait.mockResolvedValueOnce({
        status: 'timeout',
        error: 'Job timed out waiting for result',
      });
      renderDialog();
      await goToStep2Done('Launch a Bremen commercial consulting offer', {
        challenges: 'The offer and target segment are not yet validated.',
        timeline: 'Launch within four weeks.',
        details: 'Use German copy, fixed EUR pricing, and GDPR-safe outreach.',
      });

      await act(async () => {
        fireEvent.click(screen.getByText('Continue manually'));
      });

      expect(screen.getByText('Review & Submit')).toBeDefined();
      expect(screen.getByLabelText(/^Title$/i).value).toBe(
        'Launch a Bremen commercial consulting offer'
      );
      expect(screen.getByLabelText(/Requirements & Deliverables/i).value).toBe(
        [
          'Goal:\nLaunch a Bremen commercial consulting offer',
          'Challenges:\nThe offer and target segment are not yet validated.',
          'Timeline:\nLaunch within four weeks.',
          'Requirements and preferences:\nUse German copy, fixed EUR pricing, and GDPR-safe outreach.',
        ].join('\n\n')
      );
      expect(screen.getByLabelText(/Expected Results/i).value).toBe(
        'Launch a Bremen commercial consulting offer'
      );
    });

    it('does not reuse a previous analysis when a new intake times out', async () => {
      enqueueAndWait
        .mockResolvedValueOnce(
          makeMockAiResponse({
            title: 'Stale First Analysis',
            requirements: 'Requirements from the previous request.',
            complexity: 'complex',
            budget_suggestion: 99,
          })
        )
        .mockResolvedValueOnce({
          status: 'timeout',
          error: 'Job timed out waiting for result',
        });
      renderDialog();
      await goToStep2Done('Build the previous request');

      await act(async () => {
        fireEvent.click(screen.getByText('Start Over'));
      });
      fireEvent.change(screen.getByPlaceholderText(/Build a customer dashboard/), {
        target: { value: 'Launch the new Bremen offer' },
      });
      fireEvent.change(screen.getByPlaceholderText(/Must integrate with Slack/), {
        target: { value: 'Return a fixed-price German proposal.' },
      });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Start' }));
        await Promise.resolve();
      });
      await act(async () => {
        vi.advanceTimersByTime(15000);
      });
      await act(async () => {
        fireEvent.click(screen.getByText('Continue manually'));
      });

      expect(screen.getByLabelText(/^Title$/i).value).toBe('Launch the new Bremen offer');
      expect(screen.getByLabelText(/Requirements & Deliverables/i).value).toContain(
        'Return a fixed-price German proposal.'
      );
      expect(screen.getByLabelText(/Requirements & Deliverables/i).value).not.toContain(
        'Requirements from the previous request.'
      );
      expect(screen.getByLabelText(/Expected Results/i).value).toBe('Launch the new Bremen offer');
    });

    it('has "Start Over" button to go back to step 1', async () => {
      enqueueAndWait.mockResolvedValue(makeMockAiResponse());
      renderDialog();
      await goToStep2Done();

      expect(screen.getByText('Start Over')).toBeDefined();
      await act(async () => {
        fireEvent.click(screen.getByText('Start Over'));
      });
      expect(screen.getByText('1 · Brief')).toBeDefined();
    });
  });

  describe('Professional tab: Step 3', () => {
    it('shows editable fields in review step', async () => {
      enqueueAndWait.mockResolvedValue(makeMockAiResponse({ title: 'My Job Title' }));
      renderDialog();
      await goToStep2Done();

      await act(async () => {
        fireEvent.click(screen.getByText('Customize...'));
      });

      expect(screen.getByText('Review & Submit')).toBeDefined();
      expect(screen.getByDisplayValue('My Job Title')).toBeDefined();
      expect(screen.getByDisplayValue('Charts and filters')).toBeDefined();
    });

    it('allows editing the title field', async () => {
      enqueueAndWait.mockResolvedValue(makeMockAiResponse());
      renderDialog();
      await goToStep2Done();

      await act(async () => {
        fireEvent.click(screen.getByText('Customize...'));
      });

      fireEvent.change(screen.getByDisplayValue('Sales Dashboard'), {
        target: { value: 'Updated Title' },
      });
      expect(screen.getByDisplayValue('Updated Title')).toBeDefined();
    });

    it('calls onSubmit with structured data on final submit', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      enqueueAndWait.mockResolvedValue(
        makeMockAiResponse({
          title: 'Final Job',
          category: 'data',
          priority: 'urgent',
          requirements: 'Specific reqs',
        })
      );
      renderDialog({ onSubmit });
      await goToStep2Done('Data pipeline automation');

      await act(async () => {
        fireEvent.click(screen.getByText('Customize...'));
      });

      fillResearchLocation('Bremen, Germany');

      // Professional keeps its review screen, so the submit is still explicit.
      await act(async () => {
        fireEvent.click(screen.getByText('Create Goal'));
        await Promise.resolve();
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
        await Promise.resolve();
      });

      expect(createGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Final Job',
          description: expect.stringContaining('Data pipeline automation'),
          parsed_category: 'data',
          parsed_priority: 'urgent',
          parsed_requirements: 'Specific reqs',
          mode: 'advanced',
          po_depth: 'standard',
          tool_mode: 'with_tools',
          hitl_mode: 'unattended',
          setup_mode: 'auto',
          research_mode: 'auto',
          research_location: 'Bremen, Germany',
          research_market_scope: expect.objectContaining({
            schema_version: 'market_scope_v2',
            resolved_scope: expect.objectContaining({
              countries: [expect.objectContaining({ country_code: 'DE', localities: ['Bremen'] })],
            }),
          }),
          grounding_required: true,
          research_fail_closed: true,
          org_id: 'org-default',
          executor_type: 'organization',
        })
      );

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'goal',
          goal: expect.objectContaining({
            title: 'Final Job',
            parsed_category: 'data',
            parsed_priority: 'urgent',
            parsed_requirements: 'Specific reqs',
          }),
        })
      );
    });

    it('resolves multi-market unions and blocks ambiguous aliases until selected', async () => {
      enqueueAndWait.mockResolvedValue(
        makeMockAiResponse({ title: 'Regional cat food launch', category: 'marketing' })
      );
      renderDialog();
      await goToStep2Done('Compare a cat food launch across Southeast Asian markets');
      await act(async () => fireEvent.click(screen.getByText('Customize...')));

      fillResearchLocation('SEA');
      expect(screen.getByText(/has multiple definitions/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Southeast Asia' })).toBeInTheDocument();
      expect(screen.getByText('Create Goal').closest('button')).toBeDisabled();

      fireEvent.click(screen.getByRole('button', { name: 'Southeast Asia' }));
      expect(screen.getByText('Singapore')).toBeInTheDocument();
      expect(screen.getByText('Vietnam')).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByText('Create Goal'));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(createGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          research_location: 'Southeast Asia',
          research_market_scope: expect.objectContaining({
            resolved_scope: expect.objectContaining({
              countries: expect.arrayContaining([
                expect.objectContaining({ country_code: 'SG' }),
                expect.objectContaining({ country_code: 'VN' }),
              ]),
            }),
          }),
        })
      );
    });

    it('requires confirmation for a proposed regional membership snapshot', async () => {
      enqueueAndWait.mockResolvedValue(
        makeMockAiResponse({ title: 'Balkan regional launch', category: 'marketing' })
      );
      renderDialog();
      await goToStep2Done('Plan a market launch across the Balkans');
      await act(async () => fireEvent.click(screen.getByText('Customize...')));

      fillResearchLocation('Balkans');
      expect(screen.getByText(/proposed, versioned country definition/i)).toBeInTheDocument();
      expect(screen.getByText('Create Goal').closest('button')).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Confirm these countries' }));
      expect(screen.getByText('Create Goal').closest('button')).toBeEnabled();
    });

    it('persists Advanced evidence before starting and exposing the goal', async () => {
      const onSubmit = vi.fn();
      enqueueAndWait.mockResolvedValue(
        makeMockAiResponse({
          title: 'Improve Pet Food Subscription Retention',
          category: 'operations',
        })
      );
      renderDialog({
        onSubmit,
        initialFiles: [
          {
            id: 'goalref-prior-retention',
            name: 'Prior retention research',
            type: 'goal-reference',
            ext: 'ref',
            size: 0,
            goalId: 'prior-goal-1',
            goalTitle: 'Pet food churn interviews',
            content: 'Customers cite unclear allergen labels and unpredictable delivery windows.',
          },
        ],
      });
      await goToStep2Done('Reduce subscription churn for an online animal food shop');

      await act(async () => {
        fireEvent.click(screen.getByText('Customize...'));
      });
      fillResearchLocation('Germany');
      await act(async () => {
        fireEvent.click(screen.getByText('Create Goal'));
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(createGoal).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'advanced', po_depth: 'standard', org_id: 'org-default' })
      );
      expect(startGoal).toHaveBeenCalledWith(
        'mock-goal-id',
        [
          expect.objectContaining({
            id: 'goalref-prior-retention',
            type: 'goal-reference',
            goalId: 'prior-goal-1',
          }),
        ],
        // Knowledge Base picks travel as ids alongside the attachments; none
        // were selected here.
        []
      );
      expect(createGoal.mock.invocationCallOrder[0]).toBeLessThan(
        startGoal.mock.invocationCallOrder[0]
      );
      expect(startGoal.mock.invocationCallOrder[0]).toBeLessThan(
        onSubmit.mock.invocationCallOrder[0]
      );
    });

    it('defaults an Advanced commercial request to fail-closed grounded deep research', async () => {
      enqueueAndWait.mockResolvedValue(
        makeMockAiResponse({
          title: 'Bremen SMB Commercial Launch',
          category: 'marketing',
          requirements: 'Define ICPs, pricing, outreach, and a conversion funnel.',
        })
      );
      renderDialog();
      await goToStep2Done('Launch a fixed-price commercial offer in Bremen');

      await act(async () => {
        fireEvent.click(screen.getByText('Customize...'));
      });
      expect(screen.getByRole('button', { name: 'Grounded deep' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      fillResearchLocation('Bremen, Germany');

      await act(async () => {
        fireEvent.click(screen.getByText('Create Goal'));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(createGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          research_mode: 'grounded_deep',
          research_location: 'Bremen, Germany',
          grounding_required: true,
          research_fail_closed: true,
          research_intent: 'commercial_market_launch',
          requested_execution_roles: [
            'Marketing ICP Specialist',
            'Finance Pricing Specialist',
            'GDPR Legal Compliance Specialist',
            'Business Development Sales Specialist',
            'Commercial Risk Analyst',
          ],
        })
      );
      expect(createGoal.mock.calls.at(-1)[0]).not.toHaveProperty('business_evidence_profile');
      expect(createGoal.mock.calls.at(-1)[0]).not.toHaveProperty('business_evidence_profile_hash');
      expect(preparePhysicalEvidenceProfile).not.toHaveBeenCalled();
    });

    it('opts into the exact server-prepared physical profile and shows every bound hash', async () => {
      enqueueAndWait.mockResolvedValue(
        makeMockAiResponse({
          title: 'Estonia Cat Food Sales Launch',
          category: 'marketing',
          requirements: 'Compare current offers and produce a launch plan.',
        })
      );
      renderDialog();
      await goToStep2Done('Launch cat food sales in Estonia');
      await act(async () => fireEvent.click(screen.getByText('Customize...')));
      fillResearchLocation('Estonia');

      const evidenceSwitch = screen.getByRole('switch', {
        name: /Require verified physical-offer evidence/i,
      });
      expect(evidenceSwitch).not.toBeChecked();
      await act(async () => {
        fireEvent.click(evidenceSwitch);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(preparePhysicalEvidenceProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'advanced',
          org_id: 'org-default',
          research_mode: 'grounded_deep',
          research_location: 'Estonia',
          grounding_required: true,
          research_fail_closed: true,
          research_market_scope: expect.objectContaining({ schema_version: 'market_scope_v2' }),
        })
      );
      expect(evidenceSwitch).toBeChecked();
      expect(screen.getByText('Intent: commercial_market_launch')).toBeInTheDocument();
      expect(screen.getByText('Model: physical_product')).toBeInTheDocument();
      expect(screen.getByText('2 verified offers')).toBeInTheDocument();
      expect(screen.getByText('1 price difference')).toBeInTheDocument();
      expect(screen.getByText('Required role slots (5)')).toBeInTheDocument();
      const preparedProfile = makePreparedPhysicalEvidenceProfile();
      for (const [
        index,
        slot,
      ] of preparedProfile.business_evidence_profile.required_role_slots.entries()) {
        expect(
          screen.getByText(`${slot}: ${preparedProfile.requested_execution_roles[index]}`)
        ).toBeInTheDocument();
      }
      expect(screen.getByText((text) => text.includes(PHYSICAL_PROFILE_HASH))).toBeInTheDocument();
      expect(screen.getByText((text) => text.includes(PHYSICAL_MARKET_HASH))).toBeInTheDocument();
      expect(screen.getByText('Create Goal').closest('button')).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: /Confirm this evidence profile/i }));
      expect(screen.getByText(/Profile confirmed for this organization/i)).toBeInTheDocument();
      expect(screen.getByText('Create Goal').closest('button')).toBeEnabled();

      await act(async () => {
        fireEvent.click(screen.getByText('Create Goal'));
        await Promise.resolve();
        await Promise.resolve();
      });

      const payload = createGoal.mock.calls.at(-1)[0];
      const prepared = makePreparedPhysicalEvidenceProfile();
      expect(payload).toMatchObject({
        mode: 'advanced',
        research_intent: prepared.research_intent,
        requested_execution_roles: prepared.requested_execution_roles,
        business_evidence_profile: prepared.business_evidence_profile,
        business_evidence_profile_hash: PHYSICAL_PROFILE_HASH,
      });
    });

    it('invalidates confirmation when the bound market changes and blocks creation', async () => {
      enqueueAndWait.mockResolvedValue(
        makeMockAiResponse({ title: 'Estonia retail launch', category: 'marketing' })
      );
      renderDialog();
      await goToStep2Done('Launch a physical retail product in Estonia');
      await act(async () => fireEvent.click(screen.getByText('Customize...')));
      fillResearchLocation('Estonia');
      await act(async () => {
        fireEvent.click(
          screen.getByRole('switch', { name: /Require verified physical-offer evidence/i })
        );
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText((text) => text.includes(PHYSICAL_PROFILE_HASH))).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Confirm this evidence profile/i }));
      expect(screen.getByText('Create Goal').closest('button')).toBeEnabled();

      fillResearchLocation('Germany');
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.queryByText((text) => text.includes(PHYSICAL_PROFILE_HASH))).toBeNull();
      expect(
        screen.getByText(/organization, research mode, or market changed/i)
      ).toBeInTheDocument();
      expect(screen.getByText('Create Goal').closest('button')).toBeDisabled();
      fireEvent.click(screen.getByText('Create Goal'));
      expect(createGoal).not.toHaveBeenCalled();
    });

    it('does not create after preparation fails until the user turns the opt-in off', async () => {
      preparePhysicalEvidenceProfile.mockRejectedValueOnce(new Error('admission cohort is closed'));
      enqueueAndWait.mockResolvedValue(
        makeMockAiResponse({ title: 'Estonia retail launch', category: 'marketing' })
      );
      renderDialog();
      await goToStep2Done('Launch a physical retail product in Estonia');
      await act(async () => fireEvent.click(screen.getByText('Customize...')));
      fillResearchLocation('Estonia');

      await act(async () => {
        fireEvent.click(
          screen.getByRole('switch', { name: /Require verified physical-offer evidence/i })
        );
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByText(/admission cohort is closed/i)).toBeInTheDocument();
      expect(screen.getByText('Create Goal').closest('button')).toBeDisabled();
      fireEvent.click(screen.getByText('Create Goal'));
      expect(createGoal).not.toHaveBeenCalled();
    });

    it('allows explicit Instant synthetic research without a market location', async () => {
      enqueueAndWait.mockResolvedValue(
        makeMockAiResponse({ title: 'Commercial hypothesis draft', category: 'marketing' })
      );
      renderDialog();
      await goToStep2Done('Draft a commercial customer hypothesis');

      await act(async () => {
        fireEvent.click(screen.getByText('Customize...'));
      });
      fireEvent.click(screen.getByRole('button', { name: 'Instant' }));

      expect(screen.queryByLabelText(/Research market or location/i)).not.toBeInTheDocument();
      expect(screen.getByText('Synthetic only')).toBeInTheDocument();
      await act(async () => {
        fireEvent.click(screen.getByText('Create Goal'));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(createGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          research_mode: 'instant',
          grounding_required: false,
          research_fail_closed: true,
        })
      );
      expect(createGoal.mock.calls.at(-1)[0]).not.toHaveProperty('research_location');
    });

    it('has a Back button to return to step 2', async () => {
      enqueueAndWait.mockResolvedValue(makeMockAiResponse());
      renderDialog();
      await goToStep2Done();

      await act(async () => {
        fireEvent.click(screen.getByText('Customize...'));
      });

      expect(screen.getByText('Back')).toBeDefined();
      await act(async () => {
        fireEvent.click(screen.getByText('Back'));
      });
      expect(screen.getByText('Request ready to create')).toBeDefined();
    });
  });

  describe('Dialog lifecycle', () => {
    it('closes when X button is clicked', () => {
      const onClose = vi.fn();
      renderDialog({ onClose });
      const closeButtons = screen.getAllByRole('button');
      const xBtn = closeButtons.find((b) => b.querySelector('[data-testid="CloseIcon"]'));
      if (xBtn) fireEvent.click(xBtn);
      expect(onClose).toHaveBeenCalled();
    });

    it('resets goal policy choices before the next request', () => {
      renderDialog();
      const setupSwitch = screen.getByLabelText(
        'Choose the setup yourself instead of letting us pick'
      );
      const executionApproval = screen.getByLabelText('Pause for my approval before execution');

      fireEvent.click(setupSwitch);
      openBlock('tools-block');
      fireEvent.click(screen.getByRole('radio', { name: 'None' }));
      fireEvent.click(executionApproval);
      expect(setupSwitch).toBeChecked();
      expect(executionApproval).toBeChecked();

      fireEvent.click(screen.getByRole('button', { name: 'Close' }));

      expect(setupSwitch).not.toBeChecked();
      expect(executionApproval).not.toBeChecked();
      expect(screen.getByTestId('tools-block')).toHaveAttribute('aria-disabled', 'true');
      expect(
        within(screen.getByTestId('tools-block')).getByText('All library')
      ).toBeInTheDocument();
    });
  });
});

describe('Advanced research policy', () => {
  it('recognizes commercial scope and preserves an explicit mode override', () => {
    expect(isCommercialResearchRequest({ category: 'marketing' })).toBe(true);
    expect(isCommercialResearchRequest({ title: 'Bremen go-to-market plan' })).toBe(true);
    expect(resolveAdvancedResearchMode({ title: 'Bremen pricing research' })).toBe('grounded_deep');
    expect(
      resolveAdvancedResearchMode({ title: 'Bremen pricing research' }, 'grounded_fast', true)
    ).toBe('grounded_fast');
    expect(resolveAdvancedResearchMode({ title: 'Refactor a parser' })).toBe('auto');
    expect(advancedResearchRequiresGrounding('instant')).toBe(false);
    expect(advancedResearchRequiresGrounding('auto')).toBe(true);
  });
});

// ── Reopening an existing goal ───────────────────────────────────────────────
// The History list hands the surface a goalId instead of a prompt. The thread
// then has to show that goal's run rather than a creation form, and the box has
// to talk to its team lead rather than start a second goal.
describe('SmartRequestDialog - resuming a goal', () => {
  const pastGoal = {
    id: 'goal-past',
    title: 'Weekly sales dashboard',
    status: 'completed',
    plan: { phases: [{ name: 'Direction' }] },
    data: {},
  };

  function resumeWith({ messages = [], logs = [], goal = pastGoal, ...props } = {}) {
    Object.assign(realtimeState, { goal, logs, messages, tasks: [] });
    return renderDialog({ goalId: 'goal-past', ...props });
  }

  // A goal that actually produced something, which is what every goal in
  // History is. The bare `pastGoal` above deliberately has none of this.
  const finishedGoal = {
    ...pastGoal,
    data: {
      completed_at: '2026-01-01T16:54:00Z',
      deliverables: [
        {
          id: 'd1',
          title: 'Weekly sales dashboard spec',
          categoryLabel: 'Strategy',
          agent_name: 'Data Analyst',
          output: '# Spec\n\nOne.',
        },
      ],
      project_overview: {
        one_liner: 'A dashboard your sales lead can read on a Monday.',
        summary: 'Four sentences about what shipped and why it is ready to use.',
        team_lead_note: 'Team shipped it clean. Watch the refresh cadence.',
      },
    },
  };

  beforeEach(() => {
    Object.assign(realtimeState, {
      goal: null,
      logs: [],
      messages: [],
      tasks: [],
      documents: [],
    });
  });

  afterEach(() => {
    Object.assign(realtimeState, { goal: null, logs: [], messages: [], tasks: [] });
  });

  // The reported bug: pick any goal out of History and the thread replayed the
  // run, then stopped. No summary, no files, no sign-off - the work was on the
  // goal row the whole time and nothing on this surface ever read it.
  it('ends a reopened goal on what it produced', async () => {
    resumeWith({ goal: finishedGoal });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('Your result')).toBeInTheDocument();
    expect(screen.getByText(/dashboard your sales lead can read/)).toBeInTheDocument();
    expect(screen.getByText('Weekly sales dashboard spec')).toBeInTheDocument();
    expect(screen.getByText('Team lead note - Rex')).toBeInTheDocument();
  });

  // Opening the details used to unmount the thread underneath it, so closing
  // the popup dropped the user back on an empty screen with their conversation
  // gone. The host owns a popup; it does not need this one to leave.
  it('opens the details without closing the conversation behind them', async () => {
    const onOpenGoal = vi.fn();
    const onClose = vi.fn();
    resumeWith({ goal: finishedGoal, onOpenGoal, onClose });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'View more details' }));
    });
    expect(onOpenGoal).toHaveBeenCalledWith('goal-past');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('never creates a second goal', async () => {
    resumeWith();
    await act(async () => {
      await Promise.resolve();
    });
    expect(createGoal).not.toHaveBeenCalled();
    expect(enqueueAndWait).not.toHaveBeenCalled();
  });

  // Positive control for the case below: without goalId the intro really is
  // on screen, so its absence when resuming means something.
  it('opens a new request with the intro card', () => {
    renderDialog();
    expect(screen.getByText(INTRO_TEXT)).toBeInTheDocument();
  });

  it('draws the run instead of the creation form', async () => {
    resumeWith({
      logs: [
        {
          id: 'l1',
          event_type: 'plan_created',
          details: { phases: 1 },
          created_at: '2026-01-01T12:00:00Z',
        },
      ],
    });
    await act(async () => {
      await Promise.resolve();
    });
    // The intro card that opens a brand-new request is gone, and the goal's own
    // history stands in its place.
    expect(screen.queryByText(INTRO_TEXT)).toBeNull();
    expect(screen.getByText(/plan/i)).toBeInTheDocument();
  });

  it('points the composer at the team lead, not at Start', async () => {
    resumeWith();
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.change(simpleComposer(), { target: { value: 'what came of this?' } });
    await act(async () => {
      fireEvent.keyDown(simpleComposer(), { key: 'Enter' });
      await Promise.resolve();
    });
    expect(sendLeadMessage).toHaveBeenCalledWith(
      expect.objectContaining({ goalId: 'goal-past', message: 'what came of this?' })
    );
    expect(createGoal).not.toHaveBeenCalled();
  });

  it('accepts plain chat proceed at the AxWise scope gate without another questionnaire', async () => {
    const scopeGoal = {
      ...pastGoal,
      status: 'awaiting_po_input',
      data: {
        axwise_customer_intelligence: {
          status: 'human_clarification',
          decision_id: 'decision-scope',
          clarification_scope: {
            scope_hash: 'a'.repeat(64),
            business_idea: 'build the weekly dashboard',
            target_customer: 'Sales leaders',
            problem: 'slow reporting',
            desired_outcome: 'a Monday-ready view',
            constraints: [],
            evidence: [],
          },
        },
      },
    };
    resumeWith({ goal: scopeGoal });
    await act(async () => {
      await Promise.resolve();
    });

    const composer = screen.getByRole('textbox', { name: /Scope ready - proceed or edit/i });
    fireEvent.change(composer, { target: { value: 'Proceed with our assumptions' } });
    await act(async () => {
      fireEvent.keyDown(composer, { key: 'Enter' });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(acceptGoalCustomerScope).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'goal-past',
        decision_id: 'decision-scope',
        scope_hash: 'a'.repeat(64),
      })
    );
    expect(sendLeadMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Proceed with our assumptions' })
    );
    expect(screen.getByText(/Confirmed the latest proposed scope/)).toBeInTheDocument();
  });

  it('rebuilds a hash-bound preliminary scope for a correction, including directive questions', async () => {
    const scopeGoal = {
      ...pastGoal,
      status: 'awaiting_po_input',
      data: {
        axwise_customer_intelligence: {
          status: 'human_clarification',
          decision_id: 'decision-scope',
          clarification_scope: {
            scope_hash: 'a'.repeat(64),
            business_idea: 'build the weekly dashboard',
            target_customer: 'Sales leaders',
            problem: 'slow reporting',
            desired_outcome: 'a Monday-ready view',
          },
        },
      },
    };
    resumeWith({ goal: scopeGoal });
    await act(async () => Promise.resolve());

    const composer = screen.getByRole('textbox', { name: /Scope ready - proceed or edit/i });
    fireEvent.change(composer, {
      target: { value: 'Can you change this to a retail campaign instead?' },
    });
    await act(async () => {
      fireEvent.keyDown(composer, { key: 'Enter' });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(reviseGoalCustomerScope).toHaveBeenCalledWith({
      id: 'goal-past',
      decision_id: 'decision-scope',
      scope_hash: 'a'.repeat(64),
      generation: null,
      job_id: null,
      revision_token: null,
      feedback: 'Can you change this to a retail campaign instead?',
    });
    expect(acceptGoalCustomerScope).not.toHaveBeenCalled();
    expect(sendLeadMessage).not.toHaveBeenCalled();
    expect(screen.getByText(/rebuilding the proposed scope/i)).toBeInTheDocument();
  });

  it('uses native context approval for exact proceed and never lead chat', async () => {
    const scopeGoal = {
      ...pastGoal,
      status: 'awaiting_context_approval',
      data: {
        scope_admission: { state_key: 'axwise_customer_intelligence' },
        goal_approvals: { context: { snapshot_hash: 'e'.repeat(64) } },
        axwise_customer_intelligence: {
          generation: 5,
          updated_at: '2026-08-24T08:00:00.000Z',
          scope_packet: {
            version: 'axwise_scope_packet_v1',
            scope_hash: 'b'.repeat(64),
          },
        },
      },
    };
    resumeWith({ goal: scopeGoal });
    await act(async () => Promise.resolve());

    const composer = screen.getByRole('textbox', { name: /Waiting on you/i });
    fireEvent.change(composer, { target: { value: 'Proceed' } });
    await act(async () => {
      fireEvent.keyDown(composer, { key: 'Enter' });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(approveGoalContext).toHaveBeenCalledWith('goal-past', {
      version: 'orqaly_native_scope_action_binding_v1',
      scope_hash: 'b'.repeat(64),
      generation: '5',
      scope_updated_at: '2026-08-24T08:00:00.000Z',
      context_snapshot_hash: 'e'.repeat(64),
      org_id: null,
      user_id: null,
      research_contract_hash: null,
      research_execution_inputs_hash: null,
    });
    expect(reviseGoalContext).not.toHaveBeenCalled();
    expect(sendLeadMessage).not.toHaveBeenCalled();
  });

  it('keeps a native scope question in team-lead chat instead of revising it', async () => {
    const scopeGoal = {
      ...pastGoal,
      status: 'awaiting_context_approval',
      data: {
        scope_admission: { state_key: 'axwise_customer_intelligence' },
        goal_approvals: { context: { snapshot_hash: 'f'.repeat(64) } },
        axwise_customer_intelligence: {
          generation: 6,
          updated_at: '2026-08-24T08:01:00.000Z',
          scope_packet: {
            version: 'axwise_scope_packet_v1',
            scope_hash: 'b'.repeat(64),
          },
        },
      },
    };
    resumeWith({ goal: scopeGoal });
    await act(async () => Promise.resolve());

    const composer = screen.getByRole('textbox', { name: /Waiting on you/i });
    fireEvent.change(composer, { target: { value: 'Why is Estonia in this scope?' } });
    await act(async () => {
      fireEvent.keyDown(composer, { key: 'Enter' });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sendLeadMessage).toHaveBeenCalledWith(
      expect.objectContaining({ goalId: 'goal-past', message: 'Why is Estonia in this scope?' })
    );
    expect(reviseGoalContext).not.toHaveBeenCalled();
    expect(approveGoalContext).not.toHaveBeenCalled();
  });

  it('uses the authoritative fetch when realtime still shows the prior running state', async () => {
    const staleRealtimeGoal = {
      ...pastGoal,
      status: 'active',
      data: {},
    };
    const currentGoal = {
      ...pastGoal,
      status: 'awaiting_context_approval',
      data: {
        scope_admission: { state_key: 'axwise_customer_intelligence' },
        goal_approvals: { context: { snapshot_hash: 'f'.repeat(64) } },
        axwise_customer_intelligence: {
          generation: 6,
          updated_at: '2026-08-24T08:01:00.000Z',
          scope_packet: {
            version: 'axwise_scope_packet_v1',
            scope_hash: 'c'.repeat(64),
          },
        },
      },
    };
    resumeWith({ goal: staleRealtimeGoal });
    getGoal.mockResolvedValueOnce(currentGoal);
    await act(async () => Promise.resolve());

    const composer = screen.getByRole('textbox', { name: /Running - messages/i });
    fireEvent.change(composer, { target: { value: 'Change this to an Estonia retail launch.' } });
    await act(async () => {
      fireEvent.keyDown(composer, { key: 'Enter' });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(reviseGoalContext).toHaveBeenCalledWith(
      'goal-past',
      'Change this to an Estonia retail launch.',
      {
        version: 'orqaly_native_scope_action_binding_v1',
        scope_hash: 'c'.repeat(64),
        generation: '6',
        scope_updated_at: '2026-08-24T08:01:00.000Z',
        context_snapshot_hash: 'f'.repeat(64),
        org_id: null,
        user_id: null,
        research_contract_hash: null,
        research_execution_inputs_hash: null,
      }
    );
    expect(sendLeadMessage).not.toHaveBeenCalled();
  });

  it('rotates an in-flight AxWise generation for a correction', async () => {
    const rebuildingGoal = {
      ...pastGoal,
      status: 'researching_customer',
      data: {
        scope_admission: { state_key: 'axwise_customer_intelligence' },
        scope_revision: {
          version: 'orqaly_scope_revision_v1',
          status: 'pending_rebuild',
          revision_token: 'revision-1',
          source_decision_id: 'decision-old',
          source_scope_hash: 'd'.repeat(64),
        },
        axwise_customer_intelligence: {
          status: 'running',
          decision_id: 'decision-running',
          generation: 3,
          job_id: 'provider-job-3',
        },
      },
    };
    resumeWith({ goal: rebuildingGoal });
    await act(async () => Promise.resolve());

    const composer = screen.getByRole('textbox', { name: /Running - messages/i });
    fireEvent.change(composer, { target: { value: 'Use independent pet shops instead.' } });
    await act(async () => {
      fireEvent.keyDown(composer, { key: 'Enter' });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(reviseGoalCustomerScope).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'goal-past',
        decision_id: 'decision-running',
        scope_hash: 'd'.repeat(64),
        generation: 3,
        job_id: 'provider-job-3',
        revision_token: 'revision-1',
        feedback: 'Use independent pet shops instead.',
      })
    );
    expect(sendLeadMessage).not.toHaveBeenCalled();
  });

  it('does not approve or chat while the corrected scope is still being built', async () => {
    const rebuildingGoal = {
      ...pastGoal,
      status: 'analyzing',
      data: {
        scope_admission: { state_key: 'axwise_customer_intelligence' },
        scope_revision: {
          version: 'orqaly_scope_revision_v1',
          status: 'pending_rebuild',
          revision_token: 'revision-1',
        },
        axwise_customer_intelligence: { status: 'revision_requested' },
      },
    };
    resumeWith({ goal: rebuildingGoal });
    await act(async () => Promise.resolve());

    const composer = screen.getByRole('textbox', { name: /Running - messages/i });
    fireEvent.change(composer, { target: { value: 'Proceed' } });
    await act(async () => {
      fireEvent.keyDown(composer, { key: 'Enter' });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/scope is still being prepared/i)).toBeInTheDocument();
    expect(approveGoalContext).not.toHaveBeenCalled();
    expect(acceptGoalCustomerScope).not.toHaveBeenCalled();
    expect(sendLeadMessage).not.toHaveBeenCalled();
  });

  it('replays the conversation the goal already had with its lead', async () => {
    resumeWith({
      messages: [
        {
          id: 'm2',
          channel: 'agent-lead',
          sender_name: 'Team lead',
          message: 'It shipped on Tuesday.',
          metadata: { role: 'lead', actions: [] },
          created_at: '2026-01-01T12:01:00Z',
        },
        {
          id: 'm1',
          channel: 'agent-lead',
          sender_name: 'You',
          message: 'did this ever ship?',
          metadata: { role: 'user' },
          created_at: '2026-01-01T12:00:00Z',
        },
      ],
    });
    await act(async () => {
      await Promise.resolve();
    });
    // Seeded oldest-first regardless of the order the rows arrived in.
    expect(screen.getByText('did this ever ship?')).toBeInTheDocument();
    expect(screen.getByText('It shipped on Tuesday.')).toBeInTheDocument();
  });

  it('brings back the action chips a past reply proposed', async () => {
    resumeWith({
      messages: [
        {
          id: 'm1',
          channel: 'agent-lead',
          sender_name: 'Team lead',
          message: 'I can run it again.',
          metadata: {
            role: 'lead',
            actions: [
              { type: 'pause_goal', label: 'Pause the goal', summary: 'Stops work', params: {} },
            ],
          },
          created_at: '2026-01-01T12:00:00Z',
        },
      ],
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('Pause the goal')).toBeInTheDocument();
  });

  it('says a past exchange once, not twice', async () => {
    resumeWith({
      messages: [
        {
          id: 'm1',
          channel: 'agent-lead',
          sender_name: 'You',
          message: 'did this ever ship?',
          metadata: { role: 'user' },
          created_at: '2026-01-01T12:00:00Z',
        },
      ],
    });
    await act(async () => {
      await Promise.resolve();
    });
    // Rendered by the chat half of the thread; the run transcript skips the
    // lead channel so the same line cannot appear under the run as well.
    expect(screen.getAllByText('did this ever ship?')).toHaveLength(1);
  });

  it('leaves the team room in the run transcript', async () => {
    resumeWith({
      messages: [
        {
          id: 'm1',
          channel: 'team-room',
          sender_name: 'Iris Vance',
          message: 'Starting on direction.',
          created_at: '2026-01-01T12:00:00Z',
        },
      ],
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText('Starting on direction.')).toBeInTheDocument();
  });
});
