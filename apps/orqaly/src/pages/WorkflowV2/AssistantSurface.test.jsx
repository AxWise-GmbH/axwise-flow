import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantSurface } from './AssistantSurface.jsx';

const threadId = '10000000-0000-4000-8000-000000000001';
const secondThreadId = '10000000-0000-4000-8000-000000000002';
const turnId = '20000000-0000-4000-8000-000000000001';
const runId = '30000000-0000-4000-8000-000000000001';
const secondRunId = '30000000-0000-4000-8000-000000000002';
const agentId = '50000000-0000-4000-8000-000000000001';
const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const originalCreateObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia');

function settledGoalWorkflow(activeRunId = runId) {
  return {
    run: {
      id: activeRunId,
      status: 'completed',
      rowVersion: 4,
      evidenceReadiness: 'ready',
      finalArtifact: null,
    },
    stages: [],
    attempts: [],
    dependencies: [],
    approvals: [],
  };
}

function userMessage(message, id = turnId) {
  return {
    id,
    threadId,
    turnId: id,
    role: 'user',
    route: 'DIRECT_ANSWER',
    parts: [{ type: 'text', markdown: message }],
    axwiseOperationId: null,
    workflowRunId: null,
    retryOfTurnId: null,
    createdAt: '2026-08-31T18:00:00.000Z',
  };
}

function assistantMessage(parts, route = 'DIRECT_ANSWER', id = turnId) {
  return {
    id: `40000000-0000-4000-8000-${id.slice(-12)}`,
    threadId,
    turnId: id,
    role: 'assistant',
    route,
    parts,
    axwiseOperationId: null,
    workflowRunId: null,
    retryOfTurnId: null,
    createdAt: '2026-08-31T18:00:00.000Z',
  };
}

function researchEvidenceParts(url = 'https://example.com/research-source') {
  return [
    {
      type: 'fact',
      statement: 'The returned source supports this research result.',
      sourceUrls: [url],
    },
    {
      type: 'source',
      title: 'Research source',
      url,
      sourceTypes: ['primary'],
    },
  ];
}

function clientHarness(responseMessages) {
  let messages = responseMessages;
  return {
    setMessages(next) {
      messages = next;
    },
    client: {
      assistantThreads: vi.fn().mockResolvedValue({ threads: [] }),
      assistantSend: vi.fn().mockResolvedValue({
        route: 'DIRECT_ANSWER',
        persisted: true,
        idempotent: false,
        message: responseMessages.at(-1),
      }),
      assistantThread: vi.fn(async () => ({
        thread: { id: threadId, title: 'Assistant test' },
        messages,
      })),
      assistantResume: vi.fn(),
      assistantRetry: vi.fn(),
      assistantCancel: vi.fn(),
      read: vi.fn().mockResolvedValue({ workflow: settledGoalWorkflow() }),
      artifact: vi.fn(),
      approve: vi.fn(),
      reviseScope: vi.fn(),
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function chooseComposerMode(mode, currentMode = 'Auto') {
  fireEvent.click(screen.getByRole('button', { name: `Action for this message: ${currentMode}` }));
  fireEvent.click(await screen.findByRole('menuitemradio', { name: new RegExp(`^${mode}`) }));
}

describe('AssistantSurface', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/workflows-v2');
    let sequence = 0;
    vi.stubGlobal('crypto', {
      randomUUID: () =>
        sequence++ === 0
          ? threadId
          : `20000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    });
  });

  afterEach(() => {
    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
    } else {
      delete navigator.clipboard;
    }
    if (originalCreateObjectUrlDescriptor) {
      Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrlDescriptor);
    } else {
      delete URL.createObjectURL;
    }
    if (originalRevokeObjectUrlDescriptor) {
      Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrlDescriptor);
    } else {
      delete URL.revokeObjectURL;
    }
    if (originalMatchMediaDescriptor) {
      Object.defineProperty(window, 'matchMedia', originalMatchMediaDescriptor);
    } else {
      delete window.matchMedia;
    }
  });

  it('is empty-first and sends a conversational turn', async () => {
    const messages = [
      userMessage('What is the EU AI Act?', '20000000-0000-4000-8000-000000000002'),
      assistantMessage(
        [
          { type: 'text', markdown: 'It is an EU risk-based AI law.' },
          {
            type: 'source',
            title: 'European Commission',
            url: 'https://commission.europa.eu/',
            sourceTypes: ['government'],
          },
        ],
        'DIRECT_ANSWER',
        '20000000-0000-4000-8000-000000000002'
      ),
    ];
    const { client } = clientHarness(messages);
    render(<AssistantSurface client={client} onOpenGoal={vi.fn()} />);

    expect(await screen.findByText('What do you want to get done?')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Message Assistant'), {
      target: { value: 'What is the EU AI Act?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send with Auto routing' }));

    expect(await screen.findByText('It is an EU risk-based AI law.')).toBeTruthy();
    expect(screen.getByRole('article', { name: 'You message' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Assistant message' })).toHaveTextContent(
      'Assistant'
    );
    expect(screen.queryByText('Sent as Assistant')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Sources & evidence · 0 sources · 0 supported claims',
      })
    );
    expect(screen.getByRole('link', { name: 'European Commission' })).toHaveAttribute(
      'href',
      'https://commission.europa.eu/'
    );
    expect(client.assistantSend).toHaveBeenCalledWith(
      threadId,
      expect.objectContaining({ intent: 'auto', message: 'What is the EU AI Act?' })
    );
  });

  it('shows the server-selected route while keeping Auto selected for follow-ups', async () => {
    const pendingSend = deferred();
    const h = clientHarness([]);
    h.client.assistantSend.mockImplementation(async (_activeThreadId, command) => {
      await pendingSend.promise;
      const routedUser = {
        ...userMessage(command.message, command.turnId),
        requestedIntent: command.intent,
        resolvedRoute: 'AXWISE_ONE_SHOT',
        route: 'AXWISE_ONE_SHOT',
        routePolicyVersion: 'orqaly.assistant-route-policy.v1',
        routeReasonCode: 'bounded_research',
      };
      const answer = assistantMessage(
        [{ type: 'text', markdown: 'Grounded research result.' }],
        'AXWISE_ONE_SHOT',
        command.turnId
      );
      h.setMessages([routedUser, answer]);
      return {
        route: 'AXWISE_ONE_SHOT',
        persisted: true,
        idempotent: false,
        message: answer,
      };
    });
    render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Message Assistant'), {
      target: { value: 'Research the latest EU AI Act guidance.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send with Auto routing' }));

    expect(screen.getByText('Auto · routing')).toBeInTheDocument();
    await act(async () => {
      pendingSend.resolve();
      await pendingSend.promise;
    });
    expect(await screen.findByText('Grounded research result.')).toBeInTheDocument();
    expect(h.client.assistantSend).toHaveBeenCalledWith(
      threadId,
      expect.objectContaining({
        intent: 'auto',
        message: 'Research the latest EU AI Act guidance.',
      })
    );
    expect(screen.getByText('Auto → Research')).toBeInTheDocument();
    const provenance = screen.getByLabelText(
      'Routing: Auto → Research. Auto matched a bounded research task. Routing policy: orqaly.assistant-route-policy.v1.'
    );
    expect(provenance).toBeInTheDocument();
    fireEvent.mouseOver(provenance);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Auto matched a bounded research task. Routing policy: orqaly.assistant-route-policy.v1.'
    );
    expect(
      screen.getByRole('button', { name: 'Action for this message: Auto' })
    ).toBeInTheDocument();
  });

  it('offers compact Auto, Assistant, Research, and Agent choices', async () => {
    const { client } = clientHarness([]);
    render(<AssistantSurface client={client} onOpenGoal={vi.fn()} />);

    const trigger = screen.getByRole('button', {
      name: 'Action for this message: Auto',
    });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);

    const choices = await screen.findAllByRole('menuitemradio');
    expect(choices).toHaveLength(4);
    const menu = screen.getByRole('menu', { name: 'Choose action for this message' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('aria-controls', menu.id);
    expect(
      screen.getByText('Orqanix chooses Assistant, Research, or Agent from your message.')
    ).toBeVisible();
    expect(screen.getByRole('menuitemradio', { name: /^Auto/ })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('menuitemradio', { name: /^Assistant/ })).toHaveAttribute(
      'aria-checked',
      'false'
    );

    fireEvent.click(screen.getByRole('menuitemradio', { name: /^Research/ }));
    expect(
      screen.getByRole('button', { name: 'Action for this message: Research' })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Message Assistant'), {
      target: { value: 'Compare current EU AI Act guidance.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send as Research' }));

    await waitFor(() =>
      expect(client.assistantSend).toHaveBeenCalledWith(
        threadId,
        expect.objectContaining({
          intent: 'research',
          message: 'Compare current EU AI Act guidance.',
        })
      )
    );
  });

  it('supports keyboard access to the compact action menu', async () => {
    const { client } = clientHarness([]);
    render(<AssistantSurface client={client} onOpenGoal={vi.fn()} />);

    const trigger = screen.getByRole('button', { name: 'Action for this message: Auto' });
    fireEvent.focus(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    const auto = await screen.findByRole('menuitemradio', { name: /^Auto/ });
    const agent = screen.getByRole('menuitemradio', { name: /^Agent/ });
    expect(auto).toHaveFocus();
    expect(auto).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(auto, { key: 'End' });
    expect(agent).toHaveFocus();
    fireEvent.keyDown(agent, { key: 'Enter' });

    await waitFor(() => expect(screen.getByLabelText('Message Assistant')).toHaveFocus());
    const agentTrigger = screen.getByRole('button', { name: 'Action for this message: Agent' });
    expect(agentTrigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Send as Agent' })).toBeDisabled();

    fireEvent.focus(agentTrigger);
    fireEvent.keyDown(agentTrigger, { key: 'ArrowDown' });
    const selectedAgent = await screen.findByRole('menuitemradio', { name: /^Agent/ });
    expect(selectedAgent).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    await waitFor(() => expect(agentTrigger).toHaveFocus());
    expect(agentTrigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps Research selected for follow-ups until the user explicitly switches', async () => {
    const h = clientHarness([]);
    const persisted = [];
    h.client.assistantSend.mockImplementation(async (_activeThreadId, command) => {
      const route = command.intent === 'research' ? 'AXWISE_ONE_SHOT' : 'DIRECT_ANSWER';
      const user = {
        ...userMessage(command.message, command.turnId),
        requestedIntent: command.intent,
        resolvedRoute: route,
        route,
        routeReasonCode: 'requested_research',
      };
      const answer = assistantMessage(
        [{ type: 'text', markdown: `Answer: ${command.message}` }],
        route,
        command.turnId
      );
      persisted.push(user, answer);
      h.setMessages([...persisted]);
      return { route, persisted: true, idempotent: false, message: answer };
    });
    render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} />);

    await chooseComposerMode('Research');
    fireEvent.change(screen.getByLabelText('Message Assistant'), {
      target: { value: 'Compare current EU AI Act guidance.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send as Research' }));

    expect(await screen.findByText('Answer: Compare current EU AI Act guidance.')).toBeTruthy();
    expect(screen.getByText('Research selected')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Action for this message: Research' })
      ).toBeInTheDocument()
    );

    fireEvent.change(screen.getByLabelText('Message Assistant'), {
      target: { value: 'Tell me more about that answer.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send as Research' }));

    await waitFor(() => expect(h.client.assistantSend).toHaveBeenCalledTimes(2));
    expect(h.client.assistantSend.mock.calls[0][1]).toMatchObject({ intent: 'research' });
    expect(h.client.assistantSend.mock.calls[1][1]).toMatchObject({
      intent: 'research',
      message: 'Tell me more about that answer.',
    });

    await chooseComposerMode('Assistant', 'Research');
    expect(
      screen.getByRole('button', { name: 'Action for this message: Assistant' })
    ).toBeInTheDocument();
  });

  it('keeps the submitted intent stable when the next-turn mode changes in flight', async () => {
    const pendingSend = deferred();
    const h = clientHarness([]);
    h.client.assistantSend.mockReturnValue(pendingSend.promise);
    render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} />);

    await chooseComposerMode('Research');
    fireEvent.change(screen.getByLabelText('Message Assistant'), {
      target: { value: 'Research the current guidance.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send as Research' }));
    await waitFor(() => expect(h.client.assistantSend).toHaveBeenCalledOnce());

    await chooseComposerMode('Assistant', 'Research');
    expect(h.client.assistantSend.mock.calls[0][1]).toMatchObject({ intent: 'research' });
    expect(
      screen.getByRole('button', { name: 'Action for this message: Assistant' })
    ).toBeInTheDocument();

    const routedUser = {
      ...userMessage(
        'Research the current guidance.',
        h.client.assistantSend.mock.calls[0][1].turnId
      ),
      route: 'AXWISE_ONE_SHOT',
    };
    const answer = assistantMessage(
      [{ type: 'text', markdown: 'Research completed.' }],
      'AXWISE_ONE_SHOT',
      routedUser.turnId
    );
    h.setMessages([routedUser, answer]);
    await act(async () => {
      pendingSend.resolve({
        route: 'AXWISE_ONE_SHOT',
        persisted: true,
        idempotent: false,
        message: answer,
      });
      await pendingSend.promise;
    });

    expect(await screen.findByText('Research completed.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Action for this message: Assistant' })
    ).toBeInTheDocument();
  });

  it('preserves a next-turn mode selected while an Agent submission resolves', async () => {
    const pendingSend = deferred();
    const h = clientHarness([]);
    h.client.assistantSend.mockReturnValue(pendingSend.promise);
    render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} />);

    await chooseComposerMode('Agent');
    fireEvent.change(screen.getByLabelText('Message Assistant'), {
      target: { value: 'Prepare the launch plan.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send as Agent' }));
    await waitFor(() => expect(h.client.assistantSend).toHaveBeenCalledOnce());

    await chooseComposerMode('Research', 'Agent');
    const submittedTurnId = h.client.assistantSend.mock.calls[0][1].turnId;
    const routedUser = {
      ...userMessage('Prepare the launch plan.', submittedTurnId),
      route: 'START_GOAL',
    };
    const answer = assistantMessage(
      [{ type: 'text', markdown: 'The Goal is ready.' }],
      'START_GOAL',
      submittedTurnId
    );
    h.setMessages([routedUser, answer]);
    await act(async () => {
      pendingSend.resolve({
        route: 'START_GOAL',
        persisted: true,
        idempotent: false,
        message: answer,
      });
      await pendingSend.promise;
    });

    expect(await screen.findByText('The Goal is ready.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Action for this message: Research' })
    ).toBeInTheDocument();
  });

  it('keeps the transcript in its own scroll region with the composer pinned', async () => {
    const messages = [
      userMessage('A long conversational turn.'),
      assistantMessage([{ type: 'text', markdown: 'A long response.' }]),
    ];
    const { client } = clientHarness(messages);
    render(<AssistantSurface client={client} onOpenGoal={vi.fn()} showThreadRail={false} />);

    const scrollRegion = await screen.findByRole('region', {
      name: 'Assistant message history',
    });
    const viewportFrame = scrollRegion.parentElement;
    const conversationColumn = viewportFrame.parentElement;
    const surface = conversationColumn.parentElement;
    const composer = screen.getByLabelText('Message Assistant').closest('form');

    expect(surface).toHaveStyle({
      display: 'grid',
      gridTemplateRows: 'minmax(0, 1fr)',
      overflow: 'hidden',
    });
    expect(conversationColumn).toHaveStyle({
      height: '100%',
      minHeight: 0,
      overflow: 'hidden',
    });
    expect(viewportFrame).toHaveStyle({
      position: 'relative',
      flex: 1,
      minHeight: 0,
    });
    expect(scrollRegion).toHaveStyle({
      height: '100%',
      minHeight: 0,
      overflowY: 'auto',
    });
    expect(composer).toHaveStyle({ flexShrink: 0 });
  });

  it('offers Jump to latest only while the transcript is away from the bottom', async () => {
    const messages = [
      userMessage('A long conversational turn.'),
      assistantMessage([{ type: 'text', markdown: 'A long response.' }]),
    ];
    const { client } = clientHarness(messages);
    render(<AssistantSurface client={client} onOpenGoal={vi.fn()} showThreadRail={false} />);

    const viewport = await screen.findByRole('region', {
      name: 'Assistant message history',
    });
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1_200 },
      scrollTop: { configurable: true, value: 100, writable: true },
    });
    viewport.scrollTo = vi.fn();

    fireEvent.scroll(viewport);
    expect(screen.getByRole('button', { name: 'Jump to latest ↓' })).toBeInTheDocument();

    viewport.scrollTop = 700;
    fireEvent.scroll(viewport);
    expect(screen.queryByRole('button', { name: 'Jump to latest ↓' })).not.toBeInTheDocument();

    viewport.scrollTop = 100;
    fireEvent.scroll(viewport);
    fireEvent.click(screen.getByRole('button', { name: 'Jump to latest ↓' }));
    expect(viewport).toHaveFocus();
    expect(viewport.scrollTo).toHaveBeenCalledWith({ behavior: 'smooth', top: 1_200 });
    expect(screen.queryByRole('button', { name: 'Jump to latest ↓' })).not.toBeInTheDocument();

    viewport.scrollTop = 400;
    fireEvent.scroll(viewport);
    expect(screen.queryByRole('button', { name: 'Jump to latest ↓' })).not.toBeInTheDocument();

    viewport.scrollTop = 800;
    fireEvent.scroll(viewport);
    expect(screen.queryByRole('button', { name: 'Jump to latest ↓' })).not.toBeInTheDocument();

    viewport.scrollTop = 100;
    fireEvent.scroll(viewport);
    expect(screen.getByRole('button', { name: 'Jump to latest ↓' })).toBeInTheDocument();
  });

  it('jumps without animation when reduced motion is requested', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    const messages = [
      userMessage('A long conversational turn.'),
      assistantMessage([{ type: 'text', markdown: 'A long response.' }]),
    ];
    const { client } = clientHarness(messages);
    render(<AssistantSurface client={client} onOpenGoal={vi.fn()} showThreadRail={false} />);

    const viewport = await screen.findByRole('region', {
      name: 'Assistant message history',
    });
    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1_200 },
      scrollTop: { configurable: true, value: 100, writable: true },
    });
    viewport.scrollTo = vi.fn();

    fireEvent.scroll(viewport);
    fireEvent.click(screen.getByRole('button', { name: 'Jump to latest ↓' }));

    expect(viewport).toHaveFocus();
    expect(viewport.scrollTo).toHaveBeenCalledWith({ behavior: 'auto', top: 1_200 });
  });

  it('keeps consecutive turns in the same durable conversation', async () => {
    const h = clientHarness([]);
    const persisted = [];
    h.client.assistantSend.mockImplementation(async (_activeThreadId, command) => {
      const user = userMessage(command.message, command.turnId);
      const answer = assistantMessage(
        [{ type: 'text', markdown: `Answer: ${command.message}` }],
        'DIRECT_ANSWER',
        command.turnId
      );
      persisted.push(user, answer);
      h.setMessages([...persisted]);
      return { route: 'DIRECT_ANSWER', persisted: true, idempotent: false, message: answer };
    });
    render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} />);

    const composer = screen.getByLabelText('Message Assistant');
    fireEvent.change(composer, { target: { value: 'First turn.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send with Auto routing' }));
    expect(await screen.findByText('Answer: First turn.')).toBeTruthy();

    fireEvent.change(composer, { target: { value: 'Second turn.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send with Auto routing' }));
    expect(await screen.findByText('Answer: Second turn.')).toBeTruthy();
    expect(screen.getByText('Answer: First turn.')).toBeTruthy();

    expect(h.client.assistantSend).toHaveBeenCalledTimes(2);
    expect(h.client.assistantSend.mock.calls[0][0]).toBe(threadId);
    expect(h.client.assistantSend.mock.calls[1][0]).toBe(threadId);
    expect(h.client.assistantSend.mock.calls[0][1].turnId).not.toBe(
      h.client.assistantSend.mock.calls[1][1].turnId
    );
    expect(Date.parse(h.client.assistantSend.mock.calls[1][1].issuedAt)).toBeGreaterThan(
      Date.parse(h.client.assistantSend.mock.calls[0][1].issuedAt)
    );
  });

  it('delegates the original draft to a scoped Agent while keeping the Goal wire intent', async () => {
    const { client } = clientHarness([]);
    render(<AssistantSurface client={client} onOpenGoal={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Message Assistant'), {
      target: { value: 'Prepare the launch in three stages.' },
    });
    await chooseComposerMode('Agent');
    const temporary = screen.getByRole('button', {
      name: 'Temporary. Becomes unavailable within 90 days in Preview. Cleanup when the task ends is not connected yet.',
    });
    const persistent = screen.getByRole('button', {
      name: 'Keep as digital twin. Retain this Agent identity in your user scope after the task.',
    });
    expect(temporary).toHaveAttribute('aria-pressed', 'true');
    expect(persistent).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(persistent);
    fireEvent.click(screen.getByRole('button', { name: 'Send as Agent' }));

    await waitFor(() =>
      expect(client.assistantSend).toHaveBeenCalledWith(
        threadId,
        expect.objectContaining({
          intent: 'goal',
          agentLifetime: 'persistent',
          message: 'Prepare the launch in three stages.',
        })
      )
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Action for this message: Auto' })
      ).toBeInTheDocument()
    );
  });

  it('selects an existing Agent from a deep link and sends its stable identity and lifetime', async () => {
    const h = clientHarness([]);
    h.client.agents = vi.fn().mockResolvedValue({
      agents: [
        {
          id: agentId,
          agentKind: 'persistent',
          state: 'active',
          version: 3,
          currentProfile: {
            versionNumber: 2,
            contentHash: 'a'.repeat(64),
            profile: {
              version: 'orqaly_agent_profile_input_v1',
              displayName: 'Mara Ops',
              roleLabel: 'Operations lead',
              description: 'Owns operational work.',
              instructions: 'Stop before external effects.',
              avatar: { kind: 'icon', value: 'bolt', color: '#3559E0' },
            },
          },
        },
      ],
    });

    render(
      <AssistantSurface client={h.client} onOpenGoal={vi.fn()} routeSearch={`?agent=${agentId}`} />
    );

    const selector = await screen.findByRole('combobox', { name: 'Agent for this work' });
    await waitFor(() => expect(selector).toHaveTextContent('Mara Ops · Operations lead'));
    expect(
      screen.getByText(/Reuses Mara Ops's identity and versioned profile/u)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Temporary. Becomes unavailable within 90 days in Preview. Cleanup when the task ends is not connected yet.',
      })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Action for this message: Agent' })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Message Assistant'), {
      target: { value: 'Prepare this week’s customer onboarding operations.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send as Agent' }));

    await waitFor(() =>
      expect(h.client.assistantSend).toHaveBeenCalledWith(
        threadId,
        expect.objectContaining({
          intent: 'goal',
          agentId,
          agentLifetime: 'persistent',
          message: 'Prepare this week’s customer onboarding operations.',
        })
      )
    );
    expect(h.client.agents).toHaveBeenCalledWith({ limit: 100 });
  });

  it('resolves a deep-linked Agent by ID when it is outside the first list page', async () => {
    const h = clientHarness([]);
    h.client.agents = vi.fn().mockResolvedValue({ agents: [] });
    h.client.agent = vi.fn().mockResolvedValue({
      agent: {
        id: agentId,
        agent_kind: 'persistent',
        state: 'active',
        version: 4,
        profile: {
          version: 'orqaly_agent_profile_v1',
          id: '50000000-0000-4000-8000-000000000002',
          agentId,
          versionNumber: 3,
          contentHash: 'b'.repeat(64),
          profile: {
            version: 'orqaly_agent_profile_input_v1',
            displayName: 'Fallback Operator',
            roleLabel: 'Revenue operations lead',
            description: 'Handles scoped revenue operations.',
            instructions: 'Keep external effects behind approval.',
            avatar: { kind: 'icon', value: 'bolt', color: '#3559E0' },
          },
        },
      },
    });

    render(
      <AssistantSurface client={h.client} onOpenGoal={vi.fn()} routeSearch={`?agent=${agentId}`} />
    );

    const selector = await screen.findByRole('combobox', { name: 'Agent for this work' });
    await waitFor(() =>
      expect(selector).toHaveTextContent('Fallback Operator · Revenue operations lead')
    );
    expect(h.client.agent).toHaveBeenCalledWith(agentId);

    fireEvent.change(screen.getByLabelText('Message Assistant'), {
      target: { value: 'Prepare a reviewed renewal workflow.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send as Agent' }));
    await waitFor(() =>
      expect(h.client.assistantSend).toHaveBeenCalledWith(
        threadId,
        expect.objectContaining({
          agentId,
          agentLifetime: 'persistent',
          intent: 'goal',
        })
      )
    );
  });

  it('shows an actionable error and retries a failed deep-linked Agent lookup', async () => {
    const h = clientHarness([]);
    h.client.agents = vi.fn().mockRejectedValue(new Error('Agent directory unavailable'));
    h.client.agent = vi
      .fn()
      .mockRejectedValueOnce(new Error('Agent lookup unavailable'))
      .mockResolvedValueOnce({
        agent: {
          id: agentId,
          agentKind: 'temporary',
          state: 'active',
          version: 2,
          currentProfile: {
            versionNumber: 1,
            contentHash: 'c'.repeat(64),
            profile: {
              version: 'orqaly_agent_profile_input_v1',
              displayName: 'Retry Scout',
              roleLabel: 'Research operator',
              description: '',
              instructions: '',
              avatar: { kind: 'emoji', value: '🧭', color: '#365E8D' },
            },
          },
        },
      });

    render(
      <AssistantSurface client={h.client} onOpenGoal={vi.fn()} routeSearch={`?agent=${agentId}`} />
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load the selected Agent. Agent lookup unavailable'
    );
    expect(screen.getByRole('combobox', { name: 'Agent for this work' })).toHaveTextContent(
      'Selected Agent unavailable'
    );
    expect(screen.getByRole('button', { name: 'Send as Agent' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Agent' }));

    const selector = screen.getByRole('combobox', { name: 'Agent for this work' });
    await waitFor(() => expect(selector).toHaveTextContent('Retry Scout · Research operator'));
    expect(h.client.agent).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Retry Agent' })).not.toBeInTheDocument();
  });

  it('does not send while an input method composition is active', async () => {
    const { client } = clientHarness([]);
    render(<AssistantSurface client={client} onOpenGoal={vi.fn()} />);

    const input = await screen.findByLabelText('Message Assistant');
    fireEvent.change(input, { target: { value: '下書き' } });
    fireEvent.keyDown(input, {
      key: 'Enter',
      code: 'Enter',
      isComposing: true,
    });

    expect(client.assistantSend).not.toHaveBeenCalled();
    expect(input).toHaveValue('下書き');
  });

  it('sends a one-time Home handoff as the first conversational turn', async () => {
    const { client } = clientHarness([]);
    const onDraftConsumed = vi.fn();
    const initialDraft = {
      mode: 'assistant',
      nonce: 'draft-assistant-1',
      text: '  Help me prepare a launch brief.  ',
    };
    const view = render(
      <AssistantSurface
        client={client}
        onOpenGoal={vi.fn()}
        routeSearch=""
        initialDraft={initialDraft}
        onDraftConsumed={onDraftConsumed}
      />
    );

    await waitFor(() =>
      expect(client.assistantSend).toHaveBeenCalledWith(
        threadId,
        expect.objectContaining({
          intent: 'assistant',
          message: 'Help me prepare a launch brief.',
        })
      )
    );
    expect(onDraftConsumed).toHaveBeenCalledOnce();
    expect(onDraftConsumed).toHaveBeenCalledWith('draft-assistant-1');

    view.rerender(
      <AssistantSurface
        client={client}
        onOpenGoal={vi.fn()}
        routeSearch=""
        initialDraft={initialDraft}
        onDraftConsumed={onDraftConsumed}
      />
    );
    expect(onDraftConsumed).toHaveBeenCalledOnce();
    expect(client.assistantSend).toHaveBeenCalledOnce();
  });

  it('prefills a Home Agent handoff and waits for an explicit lifetime choice', async () => {
    const { client } = clientHarness([]);
    const onDraftConsumed = vi.fn();
    render(
      <AssistantSurface
        client={client}
        onOpenGoal={vi.fn()}
        routeSearch=""
        initialDraft={{
          mode: 'goal',
          nonce: 'draft-agent-1',
          text: '  Prepare a durable launch plan.  ',
        }}
        onDraftConsumed={onDraftConsumed}
      />
    );

    expect(await screen.findByLabelText('Message Assistant')).toHaveValue(
      'Prepare a durable launch plan.'
    );
    expect(
      screen.getByRole('button', { name: 'Action for this message: Agent' })
    ).toBeInTheDocument();
    expect(client.assistantSend).not.toHaveBeenCalled();
    expect(onDraftConsumed).toHaveBeenCalledWith('draft-agent-1');

    const temporary = screen.getByRole('button', {
      name: 'Temporary. Becomes unavailable within 90 days in Preview. Cleanup when the task ends is not connected yet.',
    });
    const persistent = screen.getByRole('button', {
      name: 'Keep as digital twin. Retain this Agent identity in your user scope after the task.',
    });
    expect(temporary).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(persistent);
    fireEvent.click(screen.getByRole('button', { name: 'Send as Agent' }));

    await waitFor(() =>
      expect(client.assistantSend).toHaveBeenCalledWith(
        threadId,
        expect.objectContaining({
          intent: 'goal',
          agentLifetime: 'persistent',
          message: 'Prepare a durable launch plan.',
        })
      )
    );
  });

  it('adopts a Home handoff exactly once under React Strict Mode', async () => {
    const handoffTurn = '20000000-0000-4000-8000-000000000002';
    const persisted = [
      userMessage('Prepare a launch brief.', handoffTurn),
      assistantMessage(
        [{ type: 'text', markdown: 'Let us shape the launch brief together.' }],
        'DIRECT_ANSWER',
        handoffTurn
      ),
    ];
    const { client } = clientHarness(persisted);
    const onDraftConsumed = vi.fn();

    render(
      <StrictMode>
        <AssistantSurface
          client={client}
          onOpenGoal={vi.fn()}
          routeSearch=""
          initialDraft={{
            mode: 'assistant',
            nonce: 'strict-home-handoff',
            text: 'Prepare a launch brief.',
          }}
          onDraftConsumed={onDraftConsumed}
        />
      </StrictMode>
    );

    expect(await screen.findByText('Let us shape the launch brief together.')).toBeTruthy();
    expect(client.assistantSend).toHaveBeenCalledOnce();
    expect(onDraftConsumed).toHaveBeenCalledOnce();
  });

  it('consumes but does not apply a handoff when a thread is explicitly selected', async () => {
    const loaded = [assistantMessage([{ type: 'text', markdown: 'Existing answer.' }])];
    const { client } = clientHarness(loaded);
    const onDraftConsumed = vi.fn();
    render(
      <AssistantSurface
        client={client}
        onOpenGoal={vi.fn()}
        routeSearch={`?thread=${threadId}`}
        initialDraft={{
          mode: 'assistant',
          nonce: 'draft-assistant-2',
          text: 'Do not overwrite this conversation.',
        }}
        onDraftConsumed={onDraftConsumed}
      />
    );

    expect(await screen.findByText('Existing answer.')).toBeTruthy();
    expect(screen.getByLabelText('Message Assistant')).toHaveValue('');
    expect(onDraftConsumed).toHaveBeenCalledWith('draft-assistant-2');
  });

  it('lets the global GCP navigation own chat history and reset the active conversation', async () => {
    const loaded = [
      userMessage('Continue the existing conversation.'),
      assistantMessage([{ type: 'text', markdown: 'Existing answer.' }]),
    ];
    const { client } = clientHarness(loaded);
    window.history.replaceState(null, '', `/assistant?thread=${threadId}`);
    render(<AssistantSurface client={client} onOpenGoal={vi.fn()} showThreadRail={false} />);

    expect(await screen.findByText('Existing answer.')).toBeTruthy();
    expect(screen.queryByLabelText('Assistant threads')).toBeNull();

    await act(async () => {
      window.dispatchEvent(new CustomEvent('orqaly:new-assistant-conversation'));
      await Promise.resolve();
    });

    expect(screen.getByText('What do you want to get done?')).toBeTruthy();
    expect(window.location.pathname).toBe('/assistant');
    expect(window.location.search).toBe('');
  });

  it('opens a newly selected sidebar thread when only the route query changes', async () => {
    const firstMessages = [assistantMessage([{ type: 'text', markdown: 'First conversation.' }])];
    const secondMessages = [assistantMessage([{ type: 'text', markdown: 'Second conversation.' }])];
    const { client } = clientHarness(firstMessages);
    client.assistantThread.mockImplementation(async (requestedThreadId) => ({
      thread: { id: requestedThreadId, title: 'Assistant test' },
      messages: requestedThreadId === threadId ? firstMessages : secondMessages,
    }));
    const view = render(
      <AssistantSurface
        client={client}
        onOpenGoal={vi.fn()}
        showThreadRail={false}
        routeSearch={`?thread=${threadId}`}
      />
    );

    expect(await screen.findByText('First conversation.')).toBeTruthy();
    view.rerender(
      <AssistantSurface
        client={client}
        onOpenGoal={vi.fn()}
        showThreadRail={false}
        routeSearch={`?thread=${secondThreadId}`}
      />
    );

    expect(await screen.findByText('Second conversation.')).toBeTruthy();
    expect(screen.queryByText('First conversation.')).toBeNull();
    expect(client.assistantThread).toHaveBeenNthCalledWith(1, threadId);
    expect(client.assistantThread).toHaveBeenNthCalledWith(2, secondThreadId);
  });

  it('removes Goal actions immediately while another conversation is loading', async () => {
    const oldMessages = [
      assistantMessage(
        [{ type: 'goal_link', runId, label: 'Old Goal', status: 'completed' }],
        'START_GOAL'
      ),
    ];
    const nextLoad = deferred();
    const { client } = clientHarness(oldMessages);
    client.assistantThread.mockImplementation((requestedThreadId) =>
      requestedThreadId === threadId
        ? Promise.resolve({
            thread: { id: threadId, title: 'Old conversation' },
            messages: oldMessages,
          })
        : nextLoad.promise
    );
    const view = render(
      <AssistantSurface
        client={client}
        onOpenGoal={vi.fn()}
        showThreadRail={false}
        routeSearch={`?thread=${threadId}`}
      />
    );
    expect(await screen.findByTestId('assistant-goal-card')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open advanced details' })).toBeTruthy();

    view.rerender(
      <AssistantSurface
        client={client}
        onOpenGoal={vi.fn()}
        showThreadRail={false}
        routeSearch={`?thread=${secondThreadId}`}
      />
    );

    await waitFor(() => expect(client.assistantThread).toHaveBeenCalledWith(secondThreadId));
    expect(screen.queryByTestId('assistant-goal-card')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open advanced details' })).toBeNull();
    expect(screen.getByText('Loading conversation…')).toBeTruthy();

    await act(async () => {
      nextLoad.resolve({
        thread: { id: secondThreadId, title: 'New conversation' },
        messages: [],
      });
      await nextLoad.promise;
    });
  });

  it('keeps a new chat empty when an older thread load resolves after reset', async () => {
    const oldLoad = deferred();
    const { client } = clientHarness([]);
    client.assistantThread.mockReturnValue(oldLoad.promise);
    const view = render(
      <AssistantSurface
        client={client}
        onOpenGoal={vi.fn()}
        showThreadRail={false}
        routeSearch={`?thread=${threadId}`}
      />
    );
    await waitFor(() => expect(client.assistantThread).toHaveBeenCalledWith(threadId));

    act(() => {
      window.dispatchEvent(new CustomEvent('orqaly:new-assistant-conversation'));
    });
    view.rerender(
      <AssistantSurface
        client={client}
        onOpenGoal={vi.fn()}
        showThreadRail={false}
        routeSearch="?new=fresh"
      />
    );
    await act(async () => {
      oldLoad.resolve({
        thread: { id: threadId, title: 'Old conversation' },
        messages: [assistantMessage([{ type: 'text', markdown: 'Stale loaded answer.' }])],
      });
      await oldLoad.promise;
    });

    expect(screen.getByText('What do you want to get done?')).toBeTruthy();
    expect(screen.queryByText('Stale loaded answer.')).toBeNull();
    fireEvent.change(screen.getByLabelText('Message Assistant'), {
      target: { value: 'Fresh request.' },
    });
    expect(screen.getByRole('button', { name: 'Send with Auto routing' })).not.toBeDisabled();
  });

  it('ignores a stale send completion after New chat resets the conversation', async () => {
    const pendingSend = deferred();
    const recovered = assistantMessage([{ type: 'text', markdown: 'Stale sent answer.' }]);
    const { client } = clientHarness([userMessage('Old request.'), recovered]);
    client.assistantSend.mockReturnValue(pendingSend.promise);
    const view = render(
      <AssistantSurface
        client={client}
        onOpenGoal={vi.fn()}
        showThreadRail={false}
        routeSearch="?new=first"
      />
    );
    fireEvent.change(screen.getByLabelText('Message Assistant'), {
      target: { value: 'Old request.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send with Auto routing' }));
    await waitFor(() => expect(client.assistantSend).toHaveBeenCalledOnce());

    act(() => {
      window.dispatchEvent(new CustomEvent('orqaly:new-assistant-conversation'));
    });
    view.rerender(
      <AssistantSurface
        client={client}
        onOpenGoal={vi.fn()}
        showThreadRail={false}
        routeSearch="?new=second"
      />
    );
    await act(async () => {
      pendingSend.resolve({
        route: 'DIRECT_ANSWER',
        persisted: true,
        idempotent: false,
        message: recovered,
      });
      await pendingSend.promise;
    });

    expect(screen.getByText('What do you want to get done?')).toBeTruthy();
    expect(screen.queryByText('Stale sent answer.')).toBeNull();
    expect(client.assistantThread).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Message Assistant'), {
      target: { value: 'Fresh request.' },
    });
    expect(screen.getByRole('button', { name: 'Send with Auto routing' })).not.toBeDisabled();
  });

  it('shows the user turn immediately and keeps the composer available for the next draft', async () => {
    const pendingSend = deferred();
    const response = [
      userMessage('First conversational turn.'),
      assistantMessage([{ type: 'text', markdown: 'First response.' }]),
    ];
    const h = clientHarness(response);
    h.client.assistantSend.mockReturnValue(pendingSend.promise);
    render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} showThreadRail={false} />);

    const composer = screen.getByLabelText('Message Assistant');
    fireEvent.change(composer, { target: { value: 'First conversational turn.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send with Auto routing' }));

    expect(screen.getByText('First conversational turn.')).toBeTruthy();
    expect(composer).not.toBeDisabled();
    fireEvent.change(composer, { target: { value: 'Draft the next turn.' } });
    expect(composer).toHaveValue('Draft the next turn.');
    expect(screen.getByText('Draft while this turn runs')).toBeTruthy();

    await act(async () => {
      pendingSend.resolve({
        route: 'DIRECT_ANSWER',
        persisted: true,
        idempotent: false,
        message: response.at(-1),
      });
      await pendingSend.promise;
    });
    expect(await screen.findByText('First response.')).toBeTruthy();
    expect(composer).toHaveValue('Draft the next turn.');
  });

  it('preserves the next draft when the in-flight turn fails', async () => {
    const pendingSend = deferred();
    const { client } = clientHarness([]);
    client.assistantSend.mockReturnValue(pendingSend.promise);
    render(<AssistantSurface client={client} onOpenGoal={vi.fn()} showThreadRail={false} />);

    const composer = screen.getByLabelText('Message Assistant');
    fireEvent.change(composer, { target: { value: 'Send this first.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send with Auto routing' }));
    fireEvent.change(composer, { target: { value: 'Keep this next draft.' } });

    await act(async () => {
      pendingSend.reject(new Error('Temporary send failure'));
      await pendingSend.promise.catch(() => {});
    });

    expect(await screen.findByText('Temporary send failure')).toBeTruthy();
    const actionError = screen.getByRole('alert');
    await waitFor(() => expect(actionError).toHaveFocus());
    expect(actionError.nextElementSibling).toBe(composer.closest('form'));
    expect(composer).toHaveValue('Keep this next draft.');
    expect(screen.queryByText('Send this first.')).toBeNull();
  });

  it('renders a restored transcript without waiting for lifecycle history', async () => {
    const historyRequest = deferred();
    const restored = [
      userMessage('Restore this conversation.'),
      assistantMessage([{ type: 'text', markdown: 'The saved answer is immediately readable.' }]),
    ];
    const h = clientHarness(restored);
    h.client.assistantEvents = vi.fn().mockReturnValue(historyRequest.promise);

    render(
      <AssistantSurface
        client={h.client}
        onOpenGoal={vi.fn()}
        showThreadRail={false}
        routeSearch={`?thread=${threadId}`}
      />
    );

    expect(await screen.findByText('The saved answer is immediately readable.')).toBeVisible();
    expect(h.client.assistantEvents).toHaveBeenCalledWith({ threadId, after: 0, limit: 100 });
  });

  it('renders an adopted send result without waiting for lifecycle history', async () => {
    const historyRequest = deferred();
    const response = [
      userMessage('Send while activity history is slow.'),
      assistantMessage([{ type: 'text', markdown: 'The adopted answer is immediately readable.' }]),
    ];
    const h = clientHarness(response);
    h.client.assistantEvents = vi.fn().mockReturnValue(historyRequest.promise);
    render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} showThreadRail={false} />);

    fireEvent.change(screen.getByLabelText('Message Assistant'), {
      target: { value: 'Send while activity history is slow.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send with Auto routing' }));

    expect(await screen.findByText('The adopted answer is immediately readable.')).toBeVisible();
    expect(h.client.assistantEvents).toHaveBeenCalledWith({ threadId, after: 0, limit: 100 });
  });

  it('announces successful response copying with visible live feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const h = clientHarness([
      assistantMessage([{ type: 'text', markdown: 'Copy this complete response.' }]),
    ]);
    render(
      <AssistantSurface
        client={h.client}
        onOpenGoal={vi.fn()}
        showThreadRail={false}
        routeSearch={`?thread=${threadId}`}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Copy response' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Copy this complete response.'));
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Copied');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toBeVisible();
  });

  it('announces clipboard failures with visible live feedback', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard permission denied'));
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const h = clientHarness([
      assistantMessage([{ type: 'text', markdown: 'Copy this complete response.' }]),
    ]);
    render(
      <AssistantSurface
        client={h.client}
        onOpenGoal={vi.fn()}
        showThreadRail={false}
        routeSearch={`?thread=${threadId}`}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Copy response' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Copy failed');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toBeVisible();
  });

  it('ignores a stale retry completion after New chat resets the conversation', async () => {
    const failedTurn = '20000000-0000-4000-8000-000000000002';
    const failed = [
      userMessage('Old failed request.', failedTurn),
      assistantMessage(
        [
          {
            type: 'operation_status',
            operationId: '50000000-0000-4000-8000-000000000001',
            status: 'failed',
            retryMode: 'new_attempt',
            errorClass: 'AXWISE_HTTP_500',
          },
        ],
        'DIRECT_ANSWER',
        failedTurn
      ),
    ];
    const pendingRetry = deferred();
    const recovered = assistantMessage(
      [{ type: 'text', markdown: 'Stale retry answer.' }],
      'DIRECT_ANSWER',
      '20000000-0000-4000-8000-000000000003'
    );
    const { client } = clientHarness(failed);
    client.assistantRetry.mockReturnValue(pendingRetry.promise);
    const view = render(
      <AssistantSurface
        client={client}
        onOpenGoal={vi.fn()}
        showThreadRail={false}
        routeSearch={`?thread=${threadId}`}
      />
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(client.assistantRetry).toHaveBeenCalledOnce());

    act(() => {
      window.dispatchEvent(new CustomEvent('orqaly:new-assistant-conversation'));
    });
    view.rerender(
      <AssistantSurface
        client={client}
        onOpenGoal={vi.fn()}
        showThreadRail={false}
        routeSearch="?new=after-retry"
      />
    );
    await act(async () => {
      pendingRetry.resolve({
        route: 'DIRECT_ANSWER',
        persisted: true,
        idempotent: false,
        message: recovered,
      });
      await pendingRetry.promise;
    });

    expect(screen.getByText('What do you want to get done?')).toBeTruthy();
    expect(screen.queryByText('Stale retry answer.')).toBeNull();
    fireEvent.change(screen.getByLabelText('Message Assistant'), {
      target: { value: 'Fresh request.' },
    });
    expect(screen.getByRole('button', { name: 'Send with Auto routing' })).not.toBeDisabled();
  });

  it('requires explicit approval before turning proposed work into a Goal', async () => {
    const proposalTurn = '20000000-0000-4000-8000-000000000002';
    const proposal = [
      userMessage('Monitor competitors weekly.', proposalTurn),
      assistantMessage(
        [
          { type: 'text', markdown: 'This is durable work.' },
          {
            type: 'approval',
            action: 'start_goal',
            prompt: 'Start this Goal?',
            request: 'Monitor competitors weekly.',
          },
        ],
        'PROPOSE_GOAL',
        proposalTurn
      ),
    ];
    const h = clientHarness(proposal);
    h.client.assistantSend.mockImplementation(async (_thread, command) => {
      if (command.intent === 'goal') {
        const started = [
          ...proposal,
          { ...userMessage(command.message, command.turnId), route: 'START_GOAL' },
          assistantMessage(
            [
              { type: 'text', markdown: 'Your Goal is ready.' },
              { type: 'goal_link', runId, label: 'Monitor competitors', status: 'requested' },
            ],
            'START_GOAL',
            command.turnId
          ),
        ];
        h.setMessages(started);
      }
      return { route: 'START_GOAL', persisted: true, idempotent: false };
    });
    h.setMessages(proposal);
    window.history.replaceState(null, '', `/workflows-v2?thread=${threadId}`);
    const onOpenGoal = vi.fn();
    render(<AssistantSurface client={h.client} onOpenGoal={onOpenGoal} />);

    expect(await screen.findByText('Start this Goal?')).toBeTruthy();
    expect(h.client.assistantSend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delegate to Agent' }));
    await waitFor(() =>
      expect(h.client.assistantSend).toHaveBeenCalledWith(
        threadId,
        expect.objectContaining({ intent: 'goal', message: 'Monitor competitors weekly.' })
      )
    );
    expect(await screen.findByTestId('assistant-goal-card')).toBeTruthy();
    expect(screen.getByLabelText('Message Assistant')).not.toBeDisabled();
    const completedApproval = screen.getByRole('button', { name: 'Agent delegated' });
    expect(completedApproval).toBeDisabled();
    fireEvent.click(completedApproval);
    expect(h.client.assistantSend).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Open advanced details' }));
    expect(onOpenGoal).toHaveBeenCalledWith(runId);
  });

  it('keeps the delegated Agent identity inline above its real Goal controls', async () => {
    const delegated = assistantMessage(
      [
        {
          type: 'delegated_agent',
          id: '50000000-0000-4000-8000-000000000001',
          runId,
          threadId,
          name: 'Launch planning Agent',
          task: 'Prepare the launch plan.',
          lifetime: 'temporary',
          status: 'running',
          executorPersona: {
            role: 'task_executor',
            version: 'axwise_executor_persona_v1',
            provider: 'axwise',
            status: 'contract_bound',
          },
          memoryScope: { kind: 'thread_and_goal', label: 'This chat and Goal only' },
          runtime: { provider: 'orqaly_workflow_v2', label: 'Orqaly GCP + AxWise' },
          capabilities: {
            research: true,
            planning: true,
            artifactProduction: true,
            approvalGates: true,
            externalActions: false,
          },
          toolExecution: { status: 'not_configured', provider: null },
        },
        { type: 'goal_link', runId, label: 'Prepare the launch plan', status: 'running' },
      ],
      'START_GOAL'
    );
    const h = clientHarness([delegated]);
    window.history.replaceState(null, '', `/workflows-v2?thread=${threadId}`);
    render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} />);

    const agentCard = await screen.findByTestId('assistant-delegated-agent-card');
    const goalCard = await screen.findByTestId('assistant-goal-card');
    expect(screen.getByText('Agent delegated')).toBeInTheDocument();
    expect(within(agentCard).queryByText('Completed')).toBeNull();
    expect(await within(goalCard).findByText('Result ready')).toBeInTheDocument();
    expect(screen.getByText('Recent task · Launch planning Agent')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Task controls' })).toBeInTheDocument();
    expect(within(agentCard).queryByText('Workflow running')).toBeNull();
    expect(agentCard.compareDocumentPosition(goalCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('renders only the latest link for one Goal as a live polling card', async () => {
    const firstTurn = '20000000-0000-4000-8000-000000000002';
    const secondTurn = '20000000-0000-4000-8000-000000000003';
    const linked = [
      assistantMessage(
        [{ type: 'goal_link', runId, label: 'Launch plan', status: 'requested' }],
        'START_GOAL',
        firstTurn
      ),
      assistantMessage(
        [{ type: 'goal_link', runId, label: 'Launch plan', status: 'running' }],
        'CONTINUE_GOAL',
        secondTurn
      ),
    ];
    const h = clientHarness(linked);
    window.history.replaceState(null, '', `/workflows-v2?thread=${threadId}`);
    render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} />);

    expect(await screen.findByTestId('assistant-goal-card')).toBeTruthy();
    expect(screen.getAllByTestId('assistant-goal-card')).toHaveLength(1);
    expect(
      screen.getByText('Earlier update for this Goal · open its live card below')
    ).toBeTruthy();
    expect(h.client.read).toHaveBeenCalledTimes(1);
  });

  it('keeps one independently live card for every distinct Goal run', async () => {
    const firstTurn = '20000000-0000-4000-8000-000000000002';
    const secondTurn = '20000000-0000-4000-8000-000000000003';
    const linked = [
      assistantMessage(
        [{ type: 'goal_link', runId, label: 'Earlier Goal', status: 'running' }],
        'START_GOAL',
        firstTurn
      ),
      assistantMessage(
        [{ type: 'goal_link', runId: secondRunId, label: 'Latest Goal', status: 'completed' }],
        'START_GOAL',
        secondTurn
      ),
    ];
    const h = clientHarness(linked);
    h.client.read.mockImplementation(async (requestedRunId) => ({
      workflow: settledGoalWorkflow(requestedRunId),
    }));
    window.history.replaceState(null, '', `/workflows-v2?thread=${threadId}`);
    render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} />);

    expect(await screen.findAllByTestId('assistant-goal-card')).toHaveLength(2);
    await waitFor(() => expect(h.client.read).toHaveBeenCalledTimes(2));
    expect(h.client.read).toHaveBeenCalledWith(runId);
    expect(h.client.read).toHaveBeenCalledWith(secondRunId);
    expect(
      screen.queryByText('Earlier update for this Goal · open its live card below')
    ).toBeNull();
  });

  it('shows Research as an inline downloadable artifact', async () => {
    const createObjectURL = vi.fn(() => 'blob:research-artifact');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const oneShot = [
      userMessage('Research the EU AI Act.'),
      assistantMessage(
        [
          {
            type: 'artifact',
            title: 'Research result',
            contentType: 'text/markdown',
            markdown: '# EU AI Act\n\nBounded findings.',
          },
          {
            type: 'fact',
            statement: '### Guidance\n\n**The guidance** supports the bounded findings.',
            sourceUrls: ['https://commission.europa.eu/guidance'],
          },
          {
            type: 'source',
            title: 'European Commission guidance',
            url: 'https://commission.europa.eu/guidance',
            sourceTypes: ['government', 'grounded_web'],
          },
        ],
        'AXWISE_ONE_SHOT'
      ),
    ];
    const { client } = clientHarness(oneShot);
    window.history.replaceState(null, '', `/workflows-v2?thread=${threadId}`);
    render(<AssistantSurface client={client} onOpenGoal={vi.fn()} />);
    expect(await screen.findByText('Bounded findings.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download .md' })).toBeTruthy();
    expect(screen.queryByText('Research result')).toBeNull();
    expect(screen.queryByText('Result artifact · the conversation stays open')).toBeNull();
    const evidenceToggle = screen.getByRole('button', {
      name: 'Sources & evidence · 1 source · 1 supported claim',
    });
    expect(evidenceToggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(evidenceToggle);
    const sources = screen.getByRole('region', {
      name: 'Sources & evidence · 1 source · 1 supported claim',
    });
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Sources & evidence · 1 source · 1 supported claim',
      })
    ).toBeInTheDocument();
    expect(within(sources).getByRole('heading', { level: 3, name: 'Cited sources' })).toBeTruthy();
    expect(
      within(sources).getByRole('link', { name: 'European Commission guidance' })
    ).toHaveAttribute('href', 'https://commission.europa.eu/guidance');
    expect(
      within(sources).getByText('commission.europa.eu · Government · Web source')
    ).toBeTruthy();
    expect(within(sources).queryByText('grounded_web')).toBeNull();
    expect(within(sources).queryByRole('heading', { name: 'Guidance' })).toBeNull();
    expect(within(sources).getByText('Guidance')).toBeTruthy();
    expect(within(sources).getByText('The guidance')).toBeTruthy();
    const citation = within(sources).getByRole('link', {
      name: 'Source 1: European Commission guidance',
    });
    expect(citation.parentElement).toHaveStyle({ position: 'relative', top: '-0.22em' });
    expect(within(sources).queryByText(/\*\*|###/u)).toBeNull();
    expect(screen.queryByRole('note', { name: 'Research evidence gap' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Download .md' }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    const downloaded = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolve(reader.result));
      reader.addEventListener('error', () => reject(reader.error));
      reader.readAsText(createObjectURL.mock.calls[0][0]);
    });
    expect(downloaded).toContain('## Sources');
    expect(downloaded).toContain('https://commission.europa.eu/guidance');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:research-artifact');
    click.mockRestore();
  });

  it('opens long parsed reports without slicing their Markdown source', async () => {
    const reportSections = Array.from(
      { length: 7 },
      (_, index) => `## Section ${index + 1}\n\nSection ${index + 1} content.`
    ).join('\n\n');
    const longReport = [
      userMessage('Write the report.'),
      assistantMessage(
        [
          {
            type: 'artifact',
            title: 'Research result',
            contentType: 'text/markdown',
            markdown: `# Full report\n\nSummary.\n\n${reportSections}`,
          },
        ],
        'AXWISE_ONE_SHOT'
      ),
    ];
    const h = clientHarness(longReport);
    window.history.replaceState(null, '', `/assistant?thread=${threadId}`);

    render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} showThreadRail={false} />);

    expect(await screen.findByTestId('assistant-artifact-preview')).toHaveTextContent('Summary.');
    expect(screen.queryByText('Section 7 content.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Read result' })).toBeNull();
    const open = screen.getByRole('button', { name: 'Open full report' });
    expect(open).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(open);

    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByText('Section 7 content.')).toBeInTheDocument();
  });

  it('keeps a legacy Research artifact visible while disclosing its evidence gap', async () => {
    const legacyResearch = [
      userMessage('Research the EU AI Act.'),
      assistantMessage(
        [
          {
            type: 'artifact',
            title: 'Legacy research result',
            contentType: 'text/markdown',
            markdown: '# Legacy result\n\nThis artifact remains available.',
          },
        ],
        'AXWISE_ONE_SHOT'
      ),
    ];
    const h = clientHarness(legacyResearch);
    h.client.assistantEvents = vi.fn().mockResolvedValue({
      cursor: 1,
      events: [
        {
          id: '50000000-0000-4000-8000-000000000099',
          threadId,
          turnId,
          sequence: 1,
          type: 'completed',
          route: 'AXWISE_ONE_SHOT',
          payload: {},
          occurredAt: '2026-09-02T10:00:00.000Z',
        },
      ],
    });
    window.history.replaceState(null, '', `/assistant?thread=${threadId}`);

    render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} showThreadRail={false} />);

    expect(await screen.findByText('This artifact remains available.')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Sources & evidence · 0 sources · 0 supported claims',
      })
    );
    expect(screen.getByRole('note', { name: 'Research evidence gap' })).toHaveTextContent(
      'No verifiable sources were returned'
    );
    expect(
      within(await screen.findByRole('region', { name: 'Research activity' })).getByRole('status')
    ).toHaveTextContent('Research completed without verifiable sources · 3 steps');
  });

  it('restores completed Research lifecycle activity from the thread event history', async () => {
    const operationId = '50000000-0000-4000-8000-000000000001';
    const researchTurn = {
      ...userMessage('Research current EU AI Act guidance.'),
      route: 'AXWISE_ONE_SHOT',
      axwiseOperationId: operationId,
    };
    const completedResearch = {
      ...assistantMessage(
        [{ type: 'text', markdown: 'The research result was saved.' }, ...researchEvidenceParts()],
        'AXWISE_ONE_SHOT'
      ),
      axwiseOperationId: operationId,
    };
    const h = clientHarness([researchTurn, completedResearch]);
    h.client.assistantEvents = vi.fn().mockResolvedValue({
      cursor: 4,
      events: [
        {
          id: '50000000-0000-4000-8000-000000000021',
          threadId,
          turnId,
          sequence: 1,
          type: 'routed',
          route: 'AXWISE_ONE_SHOT',
          operationId,
          retryOfTurnId: null,
          taskId: null,
          attemptId: null,
          payload: { privatePrompt: 'hidden lifecycle payload' },
          occurredAt: '2026-09-02T10:00:00.000Z',
        },
        {
          id: '50000000-0000-4000-8000-000000000022',
          threadId,
          turnId,
          sequence: 2,
          type: 'submitted',
          route: 'AXWISE_ONE_SHOT',
          operationId,
          retryOfTurnId: null,
          taskId: null,
          attemptId: null,
          payload: {},
          occurredAt: '2026-09-02T10:00:01.000Z',
        },
        {
          id: '50000000-0000-4000-8000-000000000023',
          threadId,
          turnId,
          sequence: 3,
          type: 'progress',
          route: 'AXWISE_ONE_SHOT',
          operationId,
          retryOfTurnId: null,
          taskId: null,
          attemptId: null,
          payload: {
            eventType: 'heartbeat',
            status: 'running',
            arbitraryPayloadField: 'private worker transcript',
          },
          occurredAt: '2026-09-02T10:00:02.000Z',
        },
        {
          id: '50000000-0000-4000-8000-000000000024',
          threadId,
          turnId,
          sequence: 4,
          type: 'completed',
          route: 'AXWISE_ONE_SHOT',
          operationId,
          retryOfTurnId: null,
          taskId: null,
          attemptId: null,
          payload: { arbitraryPayloadField: 'private completion metadata' },
          occurredAt: '2026-09-02T10:00:03.000Z',
        },
      ],
    });
    window.history.replaceState(null, '', `/assistant?thread=${threadId}`);

    render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} showThreadRail={false} />);

    const answer = await screen.findByText('The research result was saved.');
    expect(answer).toBeInTheDocument();
    expect(h.client.assistantEvents).toHaveBeenCalledWith({ threadId, after: 0, limit: 100 });

    const activity = screen.getByRole('region', { name: 'Research activity' });
    expect(
      answer.compareDocumentPosition(activity) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(within(activity).getByRole('status')).toHaveTextContent('Research completed · 4 steps');
    const expand = within(activity).getByRole('button', {
      name: 'View activity · 4 steps',
    });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(
      within(activity).queryByText('Verified execution activity—not private model reasoning.')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('hidden lifecycle payload')).not.toBeInTheDocument();
    expect(screen.queryByText('private worker transcript')).not.toBeInTheDocument();
    expect(screen.queryByText('private completion metadata')).not.toBeInTheDocument();

    fireEvent.click(expand);

    expect(await within(activity).findByText('The reasoning service is still working')).toBeInTheDocument();
    expect(within(activity).getByRole('button', { name: 'Hide activity' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(
      within(activity).getByText('Verified execution activity—not private model reasoning.')
    ).toBeInTheDocument();
    expect(screen.queryByText('hidden lifecycle payload')).not.toBeInTheDocument();
    expect(screen.queryByText('private worker transcript')).not.toBeInTheDocument();
    expect(screen.queryByText('private completion metadata')).not.toBeInTheDocument();
  });

  it('paginates restored activity past 100 events and exposes the recent terminal result', async () => {
    const operationId = '50000000-0000-4000-8000-000000000002';
    const researchTurn = {
      ...userMessage('Research a long-running topic.'),
      route: 'AXWISE_ONE_SHOT',
      axwiseOperationId: operationId,
    };
    const completedResearch = {
      ...assistantMessage(
        [
          { type: 'text', markdown: 'The long research result was saved.' },
          ...researchEvidenceParts(),
        ],
        'AXWISE_ONE_SHOT'
      ),
      axwiseOperationId: operationId,
    };
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `50000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
      threadId,
      turnId,
      sequence: index + 1,
      type: index === 0 ? 'routed' : 'progress',
      route: 'AXWISE_ONE_SHOT',
      operationId,
      retryOfTurnId: null,
      taskId: null,
      attemptId: null,
      payload: index === 0 ? {} : { eventType: 'heartbeat' },
      occurredAt: '2026-09-02T10:00:00.000Z',
    }));
    const terminalEvent = {
      id: '50000000-0000-4000-8000-000000000299',
      threadId,
      turnId,
      sequence: 101,
      type: 'completed',
      route: 'AXWISE_ONE_SHOT',
      operationId,
      retryOfTurnId: null,
      taskId: null,
      attemptId: null,
      payload: {},
      occurredAt: '2026-09-02T10:01:41.000Z',
    };
    const h = clientHarness([researchTurn, completedResearch]);
    h.client.assistantEvents = vi.fn(async ({ after }) =>
      after === 0 ? { cursor: 100, events: firstPage } : { cursor: 101, events: [terminalEvent] }
    );
    window.history.replaceState(null, '', `/assistant?thread=${threadId}`);

    render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} showThreadRail={false} />);

    expect(await screen.findByText('The long research result was saved.')).toBeInTheDocument();
    await waitFor(() => expect(h.client.assistantEvents).toHaveBeenCalledTimes(2));
    expect(h.client.assistantEvents).toHaveBeenNthCalledWith(1, {
      threadId,
      after: 0,
      limit: 100,
    });
    expect(h.client.assistantEvents).toHaveBeenNthCalledWith(2, {
      threadId,
      after: 100,
      limit: 100,
    });
    expect(
      within(screen.getByRole('region', { name: 'Research activity' })).getByText(
        'Research completed · 4 steps'
      )
    ).toBeInTheDocument();
  });

  it('stops polling a terminal failure and starts one explicit retry attempt', async () => {
    const failedTurn = '20000000-0000-4000-8000-000000000002';
    const operationId = '50000000-0000-4000-8000-000000000001';
    const failed = [
      userMessage('Explain photosynthesis.', failedTurn),
      {
        ...assistantMessage(
          [
            {
              type: 'operation_status',
              operationId,
              status: 'failed',
              retryMode: 'new_attempt',
              errorClass: 'AXWISE_HTTP_500',
            },
          ],
          'DIRECT_ANSWER',
          failedTurn
        ),
        axwiseOperationId: operationId,
      },
    ];
    const h = clientHarness(failed);
    h.client.assistantRetry.mockImplementation(async (_thread, _failedTurn, command) => {
      const retriedUser = {
        ...userMessage('Explain photosynthesis.', command.turnId),
        retryOfTurnId: failedTurn,
      };
      const succeeded = assistantMessage(
        [{ type: 'text', markdown: 'Plants convert light into chemical energy.' }],
        'DIRECT_ANSWER',
        command.turnId
      );
      h.setMessages([...failed, retriedUser, succeeded]);
      return { route: 'DIRECT_ANSWER', persisted: true, idempotent: false, message: succeeded };
    });
    h.setMessages(failed);
    window.history.replaceState(null, '', `/workflows-v2?thread=${threadId}`);
    render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} />);

    const composer = screen.getByLabelText('Message Assistant');
    expect(await screen.findByText('Orqanix could not complete this attempt.')).toBeTruthy();
    expect(h.client.assistantResume).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Plants convert light into chemical energy.')).toBeTruthy();
    expect(screen.getAllByText('Explain photosynthesis.')).toHaveLength(1);
    expect(screen.getByText('Assistant · Attempt 1')).toBeTruthy();
    expect(screen.getByText('Assistant · Attempt 2')).toBeTruthy();
    expect(h.client.assistantRetry).toHaveBeenCalledWith(
      threadId,
      failedTurn,
      expect.objectContaining({ turnId: expect.any(String), issuedAt: expect.any(String) })
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(h.client.assistantResume).not.toHaveBeenCalled();
    await waitFor(() => expect(composer).toHaveFocus());
  });

  it('reuses the exact send command after a transport failure', async () => {
    const messages = [
      userMessage('What is the EU AI Act?', '20000000-0000-4000-8000-000000000002'),
      assistantMessage(
        [{ type: 'text', markdown: 'It is an EU risk-based AI law.' }],
        'DIRECT_ANSWER',
        '20000000-0000-4000-8000-000000000002'
      ),
    ];
    const h = clientHarness(messages);
    h.client.assistantSend
      .mockRejectedValueOnce(new Error('network request failed'))
      .mockResolvedValueOnce({
        route: 'DIRECT_ANSWER',
        persisted: true,
        idempotent: true,
        message: messages.at(-1),
      });
    render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Message Assistant'), {
      target: { value: 'What is the EU AI Act?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send with Auto routing' }));
    expect(await screen.findByText('network request failed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send with Auto routing' }));
    expect(await screen.findByText('It is an EU risk-based AI law.')).toBeTruthy();
    expect(h.client.assistantSend).toHaveBeenCalledTimes(2);
    expect(h.client.assistantSend.mock.calls[1]).toEqual(h.client.assistantSend.mock.calls[0]);
  });

  it.each(['PROPOSE_GOAL', 'START_GOAL', 'CONTINUE_GOAL'])(
    'resumes an unmatched persisted %s turn after a reload',
    async (route) => {
      vi.useFakeTimers();
      try {
        const persistedUser = {
          ...userMessage('Recover this Goal turn.'),
          route,
          axwiseOperationId: null,
          workflowRunId: route === 'CONTINUE_GOAL' ? runId : null,
        };
        const h = clientHarness([persistedUser]);
        const completed = assistantMessage(
          [{ type: 'text', markdown: `Recovered ${route}.` }],
          route
        );
        h.client.assistantResume.mockImplementation(async () => {
          h.setMessages([persistedUser, completed]);
          return { route, persisted: true, idempotent: false, message: completed };
        });
        window.history.replaceState(null, '', `/workflows-v2?thread=${threadId}`);
        render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} />);
        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(screen.getByRole('button', { name: 'Send with Auto routing' })).toBeDisabled();
        await act(async () => {
          await vi.advanceTimersByTimeAsync(2_000);
        });

        expect(h.client.assistantResume).toHaveBeenCalledWith(threadId, turnId);
        expect(screen.getByText(`Recovered ${route}.`)).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Message Assistant'), {
          target: { value: 'Queue the next turn.' },
        });
        expect(screen.getByRole('button', { name: 'Send with Auto routing' })).not.toBeDisabled();
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it('resumes an unmatched persisted Research user turn after a reload', async () => {
    vi.useFakeTimers();
    try {
      const operationId = '50000000-0000-4000-8000-000000000001';
      const persistedUser = {
        ...userMessage('Explain photosynthesis.'),
        route: 'AXWISE_ONE_SHOT',
        axwiseOperationId: operationId,
      };
      const h = clientHarness([persistedUser]);
      const completed = assistantMessage(
        [{ type: 'text', markdown: 'Recovered after reload.' }],
        'AXWISE_ONE_SHOT'
      );
      h.client.assistantResume.mockImplementation(async () => {
        h.setMessages([persistedUser, completed]);
        return { route: 'AXWISE_ONE_SHOT', persisted: true, idempotent: false, message: completed };
      });
      window.history.replaceState(null, '', `/workflows-v2?thread=${threadId}`);
      render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      fireEvent.change(screen.getByLabelText('Message Assistant'), {
        target: { value: 'Queue this next turn.' },
      });
      expect(screen.getByRole('button', { name: 'Stop research' })).not.toBeDisabled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(h.client.assistantResume).toHaveBeenCalledWith(threadId, turnId);
      expect(screen.getByRole('button', { name: 'Send with Auto routing' })).not.toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps resume polling active when the lifecycle event stream is available', async () => {
    vi.useFakeTimers();
    try {
      const operationId = '50000000-0000-4000-8000-000000000001';
      const persistedUser = {
        ...userMessage('Explain photosynthesis.'),
        axwiseOperationId: operationId,
      };
      const h = clientHarness([persistedUser]);
      const completed = assistantMessage([{ type: 'text', markdown: 'Polling completed it.' }]);
      h.client.streamAssistantEvents = vi.fn().mockResolvedValue({ events: [], cursor: 0 });
      h.client.assistantResume.mockImplementation(async () => {
        h.setMessages([persistedUser, completed]);
        return { route: 'DIRECT_ANSWER', persisted: true, idempotent: false, message: completed };
      });
      window.history.replaceState(null, '', `/workflows-v2?thread=${threadId}`);
      render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });

      expect(h.client.streamAssistantEvents).toHaveBeenCalled();
      expect(h.client.assistantResume).toHaveBeenCalledWith(threadId, turnId);
      expect(screen.getByText('Polling completed it.')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rehydrates terminal Research activity when polling completes before the SSE terminal event', async () => {
    vi.useFakeTimers();
    try {
      const operationId = '50000000-0000-4000-8000-000000000004';
      const persistedUser = {
        ...userMessage('Research the latest agent harness patterns.'),
        route: 'AXWISE_ONE_SHOT',
        axwiseOperationId: operationId,
      };
      const running = {
        ...assistantMessage(
          [{ type: 'operation_status', operationId, status: 'running', retryAfterSeconds: 2 }],
          'AXWISE_ONE_SHOT'
        ),
        axwiseOperationId: operationId,
      };
      const completed = {
        ...assistantMessage(
          [
            { type: 'text', markdown: 'The persisted Research result is ready.' },
            {
              type: 'artifact',
              title: 'Harness research',
              contentType: 'text/markdown',
              markdown: '# Harness research\n\nPersisted before the SSE terminal event arrived.',
            },
            ...researchEvidenceParts(),
          ],
          'AXWISE_ONE_SHOT'
        ),
        axwiseOperationId: operationId,
      };
      const activeEvents = [
        {
          id: '50000000-0000-4000-8000-000000000041',
          threadId,
          turnId,
          sequence: 1,
          type: 'routed',
          route: 'AXWISE_ONE_SHOT',
          operationId,
          retryOfTurnId: null,
          taskId: null,
          attemptId: null,
          payload: {},
          occurredAt: '2026-09-02T10:00:00.000Z',
        },
        {
          id: '50000000-0000-4000-8000-000000000042',
          threadId,
          turnId,
          sequence: 2,
          type: 'submitted',
          route: 'AXWISE_ONE_SHOT',
          operationId,
          retryOfTurnId: null,
          taskId: null,
          attemptId: null,
          payload: {},
          occurredAt: '2026-09-02T10:00:01.000Z',
        },
        {
          id: '50000000-0000-4000-8000-000000000043',
          threadId,
          turnId,
          sequence: 3,
          type: 'progress',
          route: 'AXWISE_ONE_SHOT',
          operationId,
          retryOfTurnId: null,
          taskId: null,
          attemptId: null,
          payload: { eventType: 'heartbeat', status: 'running' },
          occurredAt: '2026-09-02T10:00:02.000Z',
        },
      ];
      const terminalEvent = {
        id: '50000000-0000-4000-8000-000000000044',
        threadId,
        turnId,
        sequence: 4,
        type: 'completed',
        route: 'AXWISE_ONE_SHOT',
        operationId,
        retryOfTurnId: null,
        taskId: null,
        attemptId: null,
        payload: {},
        occurredAt: '2026-09-02T10:00:03.000Z',
      };
      const h = clientHarness([persistedUser, running]);
      h.client.assistantEvents = vi
        .fn()
        .mockResolvedValueOnce({ cursor: 3, events: activeEvents })
        .mockResolvedValue({ cursor: 4, events: [terminalEvent] });
      h.client.streamAssistantEvents = vi.fn().mockReturnValue(new Promise(() => {}));
      h.client.assistantResume.mockImplementation(async () => {
        h.setMessages([persistedUser, completed]);
        return {
          route: 'AXWISE_ONE_SHOT',
          persisted: true,
          idempotent: false,
          message: completed,
        };
      });
      window.history.replaceState(null, '', `/assistant?thread=${threadId}`);

      render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} showThreadRail={false} />);

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      const activeActivity = screen.getByRole('region', { name: 'Research activity' });
      expect(within(activeActivity).getByRole('status')).toHaveTextContent('Researching your request');
      expect(within(activeActivity).getByRole('button', { name: 'Hide activity' })).toHaveAttribute(
        'aria-expanded',
        'true'
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });

      expect(h.client.assistantResume).toHaveBeenCalledWith(threadId, turnId);
      expect(screen.getByText('The persisted Research result is ready.')).toBeInTheDocument();
      expect(
        screen.getByText('Persisted before the SSE terminal event arrived.')
      ).toBeInTheDocument();
      expect(h.client.streamAssistantEvents).toHaveBeenCalledTimes(1);
      expect(h.client.assistantEvents.mock.calls.length).toBeGreaterThanOrEqual(2);

      const completedActivity = screen.getByRole('region', { name: 'Research activity' });
      expect(within(completedActivity).getByRole('status')).toHaveTextContent(
        'Research completed · 4 steps'
      );
      expect(
        within(completedActivity).getByRole('button', { name: 'View activity · 4 steps' })
      ).toHaveAttribute('aria-expanded', 'false');
    } finally {
      vi.useRealTimers();
    }
  });

  it('backs off empty lifecycle stream reconnects instead of creating a request loop', async () => {
    vi.useFakeTimers();
    try {
      const operationId = '50000000-0000-4000-8000-000000000001';
      const persistedUser = {
        ...userMessage('Explain photosynthesis.'),
        axwiseOperationId: operationId,
      };
      const h = clientHarness([persistedUser]);
      h.client.streamAssistantEvents = vi.fn().mockResolvedValue({ events: [], cursor: 0 });
      h.client.assistantResume.mockReturnValue(new Promise(() => {}));
      window.history.replaceState(null, '', `/workflows-v2?thread=${threadId}`);
      const view = render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(h.client.streamAssistantEvents).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_999);
      });
      expect(h.client.streamAssistantEvents).toHaveBeenCalledTimes(1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(h.client.streamAssistantEvents).toHaveBeenCalledTimes(2);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(9_999);
      });
      expect(h.client.streamAssistantEvents).toHaveBeenCalledTimes(2);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(h.client.streamAssistantEvents).toHaveBeenCalledTimes(3);
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('resets lifecycle reconnect backoff after receiving progress', async () => {
    vi.useFakeTimers();
    try {
      const operationId = '50000000-0000-4000-8000-000000000001';
      const persistedUser = {
        ...userMessage('Explain photosynthesis.'),
        axwiseOperationId: operationId,
      };
      const h = clientHarness([persistedUser]);
      h.client.streamAssistantEvents = vi
        .fn()
        .mockResolvedValueOnce({ events: [], cursor: 0 })
        .mockResolvedValueOnce({
          events: [{ turnId, type: 'progress' }],
          cursor: 1,
        })
        .mockResolvedValue({ events: [], cursor: 1 });
      h.client.assistantResume.mockReturnValue(new Promise(() => {}));
      window.history.replaceState(null, '', `/workflows-v2?thread=${threadId}`);
      const view = render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(h.client.streamAssistantEvents).toHaveBeenCalledTimes(2);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_999);
      });
      expect(h.client.streamAssistantEvents).toHaveBeenCalledTimes(2);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(h.client.streamAssistantEvents).toHaveBeenCalledTimes(3);
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders sanitized lifecycle activity received for the pending turn', async () => {
    const operationId = '50000000-0000-4000-8000-000000000001';
    const persistedUser = {
      ...userMessage('Research current EU AI Act guidance.'),
      route: 'AXWISE_ONE_SHOT',
      axwiseOperationId: operationId,
    };
    const running = {
      ...assistantMessage(
        [{ type: 'operation_status', operationId, status: 'running', retryAfterSeconds: 2 }],
        'AXWISE_ONE_SHOT'
      ),
      axwiseOperationId: operationId,
    };
    const h = clientHarness([persistedUser, running]);
    h.client.streamAssistantEvents = vi.fn().mockResolvedValue({
      cursor: 1,
      events: [
        {
          id: '50000000-0000-4000-8000-000000000021',
          threadId,
          turnId,
          sequence: 1,
          type: 'progress',
          route: 'AXWISE_ONE_SHOT',
          operationId,
          retryOfTurnId: null,
          taskId: null,
          attemptId: null,
          payload: {
            eventType: 'heartbeat',
            status: 'running',
            privatePrompt: 'must never be rendered',
          },
          occurredAt: '2026-09-02T10:00:00.000Z',
        },
      ],
    });
    h.client.assistantResume.mockReturnValue(new Promise(() => {}));
    window.history.replaceState(null, '', `/workflows-v2?thread=${threadId}`);
    render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} />);

    expect(await screen.findByRole('region', { name: 'Research activity' })).toBeInTheDocument();
    expect(await screen.findByText('The reasoning service is still working')).toBeInTheDocument();
    expect(
      screen.getByText('Verified execution activity—not private model reasoning.')
    ).toBeInTheDocument();
    expect(screen.queryByText('must never be rendered')).not.toBeInTheDocument();
  });

  it('lets terminal SSE activity override a stale active operation response', async () => {
    const operationId = '50000000-0000-4000-8000-000000000003';
    const persistedUser = {
      ...userMessage('Research the current guidance.'),
      route: 'AXWISE_ONE_SHOT',
      axwiseOperationId: operationId,
    };
    const staleRunning = {
      ...assistantMessage(
        [{ type: 'operation_status', operationId, status: 'running', retryAfterSeconds: 2 }],
        'AXWISE_ONE_SHOT'
      ),
      axwiseOperationId: operationId,
    };
    const h = clientHarness([persistedUser, staleRunning]);
    h.client.streamAssistantEvents = vi.fn().mockResolvedValue({
      cursor: 1,
      events: [
        {
          id: '50000000-0000-4000-8000-000000000031',
          threadId,
          turnId,
          sequence: 1,
          type: 'completed',
          route: 'AXWISE_ONE_SHOT',
          operationId,
          retryOfTurnId: null,
          taskId: null,
          attemptId: null,
          payload: {},
          occurredAt: '2026-09-02T10:00:00.000Z',
        },
      ],
    });
    h.client.assistantResume.mockReturnValue(new Promise(() => {}));
    window.history.replaceState(null, '', `/assistant?thread=${threadId}`);

    render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} showThreadRail={false} />);

    await screen.findByRole('region', { name: 'Research activity' });
    await waitFor(() =>
      expect(
        within(screen.getByRole('region', { name: 'Research activity' })).getByRole('status')
      ).toHaveTextContent('Research completed')
    );
    expect(
      within(screen.getByRole('region', { name: 'Research activity' })).queryByText(
        'Researching your request'
      )
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop research' })).not.toBeInTheDocument();
  });

  it('moves Stop into the composer and makes cancellation immediately idempotent', async () => {
    const operationId = '50000000-0000-4000-8000-000000000001';
    const user = { ...userMessage('Research the EU AI Act.'), axwiseOperationId: operationId };
    const running = {
      ...assistantMessage(
        [{ type: 'operation_status', operationId, status: 'running', retryAfterSeconds: 2 }],
        'AXWISE_ONE_SHOT'
      ),
      axwiseOperationId: operationId,
    };
    const cancelled = {
      ...assistantMessage(
        [{ type: 'operation_status', operationId, status: 'cancelled', retryMode: 'none' }],
        'AXWISE_ONE_SHOT'
      ),
      axwiseOperationId: operationId,
    };
    const h = clientHarness([user, running]);
    const cancelRequest = deferred();
    h.client.assistantCancel.mockImplementation(async () => {
      await cancelRequest.promise;
      h.setMessages([user, cancelled]);
      return { route: 'AXWISE_ONE_SHOT', persisted: true, idempotent: false, message: cancelled };
    });
    window.history.replaceState(null, '', `/workflows-v2?thread=${threadId}`);
    render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} />);

    const composer = screen.getByLabelText('Message Assistant');
    fireEvent.click(await screen.findByRole('button', { name: 'Stop research' }));

    const stopping = await screen.findByRole('button', { name: 'Stopping current turn' });
    expect(stopping).toBeDisabled();
    expect(stopping).toHaveAttribute('aria-label', 'Stopping current turn');
    fireEvent.click(stopping);
    expect(h.client.assistantCancel).toHaveBeenCalledTimes(1);

    await act(async () => {
      cancelRequest.resolve();
      await cancelRequest.promise;
    });

    expect(await screen.findByText('Research stopped. · 3 steps')).toBeTruthy();
    expect(h.client.assistantCancel).toHaveBeenCalledWith(threadId, turnId);
    await waitFor(() => expect(composer).toHaveFocus());
    fireEvent.change(composer, {
      target: { value: 'Start another question.' },
    });
    expect(screen.getByRole('button', { name: 'Send with Auto routing' })).not.toBeDisabled();
  });

  it('retries polling after a transient Assistant resume failure', async () => {
    vi.useFakeTimers();
    try {
      const operationId = '50000000-0000-4000-8000-000000000001';
      const persistedUser = {
        ...userMessage('Explain photosynthesis.'),
        axwiseOperationId: operationId,
      };
      const h = clientHarness([persistedUser]);
      const completed = assistantMessage([{ type: 'text', markdown: 'Recovered after retry.' }]);
      h.client.assistantResume
        .mockRejectedValueOnce(new Error('temporary Assistant poll failure'))
        .mockImplementationOnce(async () => {
          h.setMessages([persistedUser, completed]);
          return { route: 'DIRECT_ANSWER', persisted: true, idempotent: false, message: completed };
        });
      window.history.replaceState(null, '', `/workflows-v2?thread=${threadId}`);
      render(<AssistantSurface client={h.client} onOpenGoal={vi.fn()} />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(h.client.assistantResume).toHaveBeenCalledTimes(1);
      expect(screen.getByText('temporary Assistant poll failure')).toBeTruthy();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      expect(h.client.assistantResume).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Recovered after retry.')).toBeTruthy();
      expect(screen.queryByText('temporary Assistant poll failure')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
