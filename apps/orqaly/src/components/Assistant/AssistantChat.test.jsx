import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } },
}));
vi.mock('../../services/copilotChatApiService', () => ({
  copilotChat: vi.fn(),
  resolveCopilotAction: vi.fn(),
}));
vi.mock('../../services/assistantIngestService', () => ({ bulkUploadFiles: vi.fn() }));
vi.mock('../../services/assistantHistoryService', () => ({
  logAssistantMessages: vi.fn().mockResolvedValue({ inserted: 2 }),
}));

import { copilotChat, resolveCopilotAction } from '../../services/copilotChatApiService';
import { logAssistantMessages } from '../../services/assistantHistoryService';
import AssistantChat, { ThinkingIndicator, seedMessages, createdEntity } from './AssistantChat.jsx';
import { THREAD_MEASURE_PX, HERO_COMPOSER_MAX_WIDTH } from '../../theme/measures';

describe('AssistantChat', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the empty-state greeting and suggestions', () => {
    render(<AssistantChat greetingName="mister" />);
    expect(screen.getByText('Hello mister')).toBeTruthy();
    expect(screen.getByText('How can I help you today?')).toBeTruthy();
  });

  it('sends a message and renders the copilot reply', async () => {
    copilotChat.mockResolvedValue({ message: 'All good here', blocks: [], proposedActions: [] });
    render(<AssistantChat />);
    const input = screen.getByPlaceholderText('Ask anything…');
    fireEvent.change(input, { target: { value: 'how are things' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('how are things')).toBeTruthy(); // user bubble
    await waitFor(() => expect(screen.getByText('All good here')).toBeTruthy()); // assistant reply
    expect(copilotChat).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'how are things', token: 'tok' })
    );
  });

  it('passes provider/model/orgId through to the copilot', async () => {
    copilotChat.mockResolvedValue({ message: 'ok', blocks: [], proposedActions: [] });
    render(<AssistantChat provider="anthropic" model="claude-sonnet-5" orgId="org-1" />);
    const input = screen.getByPlaceholderText('Ask anything…');
    fireEvent.change(input, { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(copilotChat).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'anthropic', model: 'claude-sonnet-5', orgId: 'org-1' })
      )
    );
  });

  it('sends a stable conversationId so the backend can scope past-chat search', async () => {
    copilotChat.mockResolvedValue({ message: 'ok', blocks: [], proposedActions: [] });
    render(<AssistantChat />);
    fireEvent.change(screen.getByPlaceholderText('Ask anything…'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(copilotChat).toHaveBeenCalled());
    const payload = copilotChat.mock.calls[0][0];
    expect(typeof payload.conversationId).toBe('string');
    expect(payload.conversationId.length).toBeGreaterThan(0);
  });

  it('persists the exchange to the shared assistant history', async () => {
    copilotChat.mockResolvedValue({ message: 'saved reply', blocks: [], proposedActions: [] });
    render(<AssistantChat />);
    fireEvent.change(screen.getByPlaceholderText('Ask anything…'), { target: { value: 'log me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(logAssistantMessages).toHaveBeenCalled());
    const [convId, msgs, mode] = logAssistantMessages.mock.calls[0];
    expect(typeof convId).toBe('string');
    expect(convId.length).toBeGreaterThan(0);
    expect(msgs).toEqual([
      { role: 'user', content: 'log me' },
      { role: 'assistant', content: 'saved reply' },
    ]);
    expect(mode).toBe('assistant');
  });

  it('renders an inputTopSlot (e.g. category pills) above the input', () => {
    render(<AssistantChat inputTopSlot={<span data-testid="pills">pills</span>} />);
    expect(screen.getByTestId('pills')).toBeTruthy();
    // Input and send still present alongside the top slot.
    expect(screen.getByPlaceholderText('Ask anything…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
  });

  it('marks its composer so shell focus handling ignores unrelated fields', () => {
    render(<AssistantChat />);
    expect(
      screen.getByPlaceholderText('Ask anything…').closest('[data-composer-text-entry]')
    ).not.toBeNull();
  });

  it('never renders leaked protocol JSON — shows a friendly fallback instead', async () => {
    copilotChat.mockResolvedValue({
      message:
        '{ "action": "answer", "message": "You have 0 agents.", "proposedActions": [ { "tool": "agent.create" } ] }',
      blocks: [],
      proposedActions: [],
    });
    render(<AssistantChat />);
    fireEvent.change(screen.getByPlaceholderText('Ask anything…'), {
      target: { value: 'how many agents' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(screen.getByText(/couldn't format that answer/i)).toBeTruthy());
    expect(screen.queryByText(/proposedActions/)).toBeNull();
    expect(screen.queryByText(/"action"/)).toBeNull();
  });

  it('shows an error bubble when the copilot call fails', async () => {
    copilotChat.mockRejectedValue(new Error('boom'));
    render(<AssistantChat />);
    fireEvent.change(screen.getByPlaceholderText('Ask anything…'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByText(/Error: boom/)).toBeTruthy());
  });

  it('renders the User templates toggle only when onToggleTemplates is provided, reflecting state', () => {
    const { rerender } = render(<AssistantChat />);
    expect(screen.queryByText(/^Templates/)).toBeNull(); // hidden without the handler

    const onToggleTemplates = vi.fn();
    rerender(<AssistantChat useTemplates={false} onToggleTemplates={onToggleTemplates} />);
    expect(screen.getByText('Templates Off')).toBeTruthy();

    rerender(<AssistantChat useTemplates onToggleTemplates={onToggleTemplates} />);
    expect(screen.getByText('Templates On')).toBeTruthy();
  });

  it('toggles the User templates flag on click (Off -> On)', () => {
    const onToggleTemplates = vi.fn();
    render(<AssistantChat useTemplates={false} onToggleTemplates={onToggleTemplates} />);
    fireEvent.click(screen.getByText('Templates Off'));
    expect(onToggleTemplates).toHaveBeenCalledWith(true);
  });

  it('shows the branded thinking indicator while a reply is pending', async () => {
    copilotChat.mockReturnValue(new Promise(() => {})); // never resolves -> stays loading
    render(<AssistantChat />);
    fireEvent.change(screen.getByPlaceholderText('Ask anything…'), { target: { value: 'wait' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const status = await screen.findByRole('status');
    expect(status.getAttribute('aria-label')).toBe('Assistant is thinking');
  });
});

describe('ThinkingIndicator', () => {
  it('renders an accessible status with a label and three wave dots', () => {
    render(<ThinkingIndicator />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-label')).toBe('Assistant is thinking');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(screen.getByText('Thinking')).toBeTruthy();
    const dotGroup = status.querySelector('[aria-hidden]');
    expect(dotGroup).toBeTruthy();
    expect(dotGroup.querySelectorAll('span').length).toBe(3);
  });
});

describe('seedMessages', () => {
  // Rows carry `content`, chat messages carry `text`, and the history sent to
  // the model is built from `text`. Miss the rename and the thread looks whole
  // but reads as empty to the model.
  it('renames content to text', () => {
    expect(seedMessages([{ id: 'r1', role: 'user', content: 'hello', created_at: 't0' }])).toEqual([
      { id: 'seed-r1', role: 'user', text: 'hello', time: 't0' },
    ]);
  });

  it('drops rows that are not a user or assistant turn', () => {
    const out = seedMessages([
      { id: 'r1', role: 'user', content: 'a' },
      { id: 'r2', role: 'system', content: 'b' },
      null,
    ]);
    expect(out.map((m) => m.role)).toEqual(['user']);
  });

  it('returns an empty list for anything that is not an array', () => {
    expect(seedMessages(null)).toEqual([]);
    expect(seedMessages(undefined)).toEqual([]);
  });

  it('prefixes ids so a seeded row cannot collide with a live one', () => {
    expect(seedMessages([{ id: '1', role: 'user', content: 'a' }])[0].id).toBe('seed-1');
  });
});

describe('AssistantChat - resuming a past conversation', () => {
  beforeEach(() => vi.clearAllMocks());

  const past = [
    { id: 'r1', role: 'user', content: 'what did we decide', created_at: '2026-06-01T10:00:00Z' },
    {
      id: 'r2',
      role: 'assistant',
      content: 'we picked the second option',
      created_at: '2026-06-01T10:00:05Z',
    },
  ];

  it('renders the stored conversation instead of the empty greeting', () => {
    render(<AssistantChat greetingName="mister" conversationId="conv-1" initialMessages={past} />);
    expect(screen.getByText('what did we decide')).toBeTruthy();
    expect(screen.getByText('we picked the second option')).toBeTruthy();
    expect(screen.queryByText('Hello mister')).toBeNull();
  });

  it('gives each stored message a copy button and a full stamp', () => {
    render(<AssistantChat conversationId="conv-1" initialMessages={past} />);
    expect(screen.getAllByLabelText('Copy message')).toHaveLength(2);
    expect(screen.getAllByTestId('message-stamp')).toHaveLength(2);
  });

  it('continues the same conversation rather than opening a new one', async () => {
    copilotChat.mockResolvedValue({ message: 'ok', blocks: [], proposedActions: [] });
    render(<AssistantChat conversationId="conv-1" initialMessages={past} />);
    fireEvent.change(screen.getByPlaceholderText('Ask anything…'), {
      target: { value: 'and then?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(copilotChat).toHaveBeenCalled());
    expect(copilotChat.mock.calls[0][0].conversationId).toBe('conv-1');
    await waitFor(() =>
      expect(logAssistantMessages).toHaveBeenCalledWith('conv-1', expect.anything(), 'assistant')
    );
  });

  it('carries the earlier turns to the model as history', async () => {
    copilotChat.mockResolvedValue({ message: 'ok', blocks: [], proposedActions: [] });
    render(<AssistantChat conversationId="conv-1" initialMessages={past} />);
    fireEvent.change(screen.getByPlaceholderText('Ask anything…'), {
      target: { value: 'and then?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(copilotChat).toHaveBeenCalled());
    expect(copilotChat.mock.calls[0][0].history).toEqual([
      { role: 'user', content: 'what did we decide' },
      { role: 'assistant', content: 'we picked the second option' },
    ]);
  });

  it('still mints an id when opened fresh', async () => {
    copilotChat.mockResolvedValue({ message: 'ok', blocks: [], proposedActions: [] });
    render(<AssistantChat />);
    fireEvent.change(screen.getByPlaceholderText('Ask anything…'), { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(copilotChat).toHaveBeenCalled());
    expect(copilotChat.mock.calls[0][0].conversationId).toBeTruthy();
  });
  // Picking Assistant used to grow the input block while picking Goal left it
  // alone: the composer took the hero's width (480 on the landing, 1180 once a
  // conversation opened) instead of setting its own. It follows the Goal side
  // stage for stage now.
  describe('composer measure', () => {
    const measure = () => screen.getByTestId('assistant-composer-measure');

    it('uses the small landing box before there is a conversation', () => {
      render(<AssistantChat />);
      expect(measure().getAttribute('data-measure')).toBe(String(HERO_COMPOSER_MAX_WIDTH));
    });

    it('opens to the reading column once the conversation has turns', () => {
      render(<AssistantChat conversationId="conv-1" initialMessages={past} />);
      expect(measure().getAttribute('data-measure')).toBe(String(THREAD_MEASURE_PX));
    });

    it('never takes the full hero width', () => {
      expect(HERO_COMPOSER_MAX_WIDTH).toBe(480);
      expect(THREAD_MEASURE_PX).toBe(760);
    });

    it('keeps the same measures in the compact variant', () => {
      render(<AssistantChat variant="compact" />);
      expect(measure().getAttribute('data-measure')).toBe(String(HERO_COMPOSER_MAX_WIDTH));
    });
  });

  // The Goal tab renders orb -> greeting -> composer in one 70vh column and
  // this tab has to match it exactly, or switching tabs moves every element on
  // the screen. Lock the order and the slots.
  describe('empty-state stack', () => {
    it('stacks orb, greeting and composer in that order', () => {
      render(
        <AssistantChat
          emptyOrb={<div data-testid="orb" />}
          emptyTitle={<div data-testid="greeting" />}
        />
      );
      const orb = screen.getByTestId('orb');
      const greeting = screen.getByTestId('greeting');
      const composer = screen.getByTestId('assistant-composer-measure');

      // Node.DOCUMENT_POSITION_FOLLOWING === 4
      expect(orb.compareDocumentPosition(greeting) & 4).toBeTruthy();
      expect(greeting.compareDocumentPosition(composer) & 4).toBeTruthy();
    });

    it('gives the composer the same action row the Goal composer has', () => {
      render(<AssistantChat />);
      const actions = screen.getByTestId('assistant-composer-actions');
      expect(actions.contains(screen.getByRole('button', { name: 'Send' }))).toBe(true);
    });
  });

  // The hero cannot see the message list, so it used to size itself off the
  // activation flag and treated an empty assistant as a live conversation -
  // wide surface, 70vh, orb pushed up. Switching tabs moved the whole page.
  describe('reporting whether there is a conversation', () => {
    it('reports empty on mount so the host lays out as a landing', () => {
      const onHasChatChange = vi.fn();
      render(<AssistantChat onHasChatChange={onHasChatChange} />);
      expect(onHasChatChange).toHaveBeenCalledWith(false);
    });

    it('reports a conversation when it is seeded from history', () => {
      const onHasChatChange = vi.fn();
      render(
        <AssistantChat
          conversationId="conv-1"
          initialMessages={past}
          onHasChatChange={onHasChatChange}
        />
      );
      expect(onHasChatChange).toHaveBeenLastCalledWith(true);
    });

    it('flips to a conversation once the first message is sent', async () => {
      copilotChat.mockResolvedValue({ message: 'ok', blocks: [], proposedActions: [] });
      const onHasChatChange = vi.fn();
      render(<AssistantChat onHasChatChange={onHasChatChange} />);
      expect(onHasChatChange).toHaveBeenLastCalledWith(false);

      fireEvent.change(screen.getByPlaceholderText('Ask anything…'), { target: { value: 'hi' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(onHasChatChange).toHaveBeenLastCalledWith(true));
    });
  });
});

/**
 * Where a reopened conversation opens.
 *
 * jsdom has no layout, so scrollTop and scrollHeight are inert. Both are given
 * real behaviour here - otherwise every assertion below reads 0 and passes
 * whatever the component does.
 */
describe('AssistantChat - where a reopened conversation opens', () => {
  const past = [
    { id: 'r1', role: 'user', content: 'what did we decide', created_at: '2026-06-01T10:00:00Z' },
    {
      id: 'r2',
      role: 'assistant',
      content: 'the second option',
      created_at: '2026-06-01T10:00:05Z',
    },
  ];
  const stream = () => screen.getByTestId('assistant-stream');
  const proto = HTMLElement.prototype;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(proto, 'scrollHeight', { configurable: true, get: () => 1200 });
    Object.defineProperty(proto, 'scrollTop', {
      configurable: true,
      get() {
        return this.__top ?? 0;
      },
      set(v) {
        this.__top = v;
      },
    });
  });

  afterEach(() => {
    for (const key of ['scrollHeight', 'scrollTop']) delete proto[key];
  });

  // Clicking a row in History opened the chat at the last thing said, past
  // everything the user clicked the row to read.
  it('opens at the first message, not the last one said', () => {
    render(<AssistantChat conversationId="conv-1" initialMessages={past} />);
    expect(screen.getByText('what did we decide')).toBeTruthy();
    expect(stream().scrollTop).toBe(0);
  });

  it('still follows a live chat that started empty', async () => {
    copilotChat.mockResolvedValue({ message: 'All good', blocks: [], proposedActions: [] });
    render(<AssistantChat />);
    fireEvent.change(screen.getByPlaceholderText('Ask anything…'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByText('All good')).toBeTruthy());
    expect(stream().scrollTop).toBe(1200);
  });

  // Reading is over the moment they type: the reply has to be visible.
  it('follows again as soon as the user says something', async () => {
    copilotChat.mockResolvedValue({ message: 'and then this', blocks: [], proposedActions: [] });
    render(<AssistantChat conversationId="conv-1" initialMessages={past} />);
    expect(stream().scrollTop).toBe(0);

    fireEvent.change(screen.getByPlaceholderText('Ask anything…'), {
      target: { value: 'and then?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.getByText('and then this')).toBeTruthy());
    expect(stream().scrollTop).toBe(1200);
  });
});

describe('AssistantChat action approval', () => {
  beforeEach(() => vi.clearAllMocks());

  const proposal = {
    pendingCallId: 'p1',
    tool: 'goal.create',
    riskLevel: 'medium',
    summary: 'Create a new project goal in Orqaly',
    args: { title: 'New goal', budget_usd: 10, complexity: 'simple' },
    draftFields: ['title', 'budget_usd', 'complexity'],
  };

  async function approve(onOpenEntity) {
    copilotChat.mockResolvedValue({
      message: 'What is the project name?',
      blocks: [],
      proposedActions: [proposal],
    });
    render(<AssistantChat onOpenEntity={onOpenEntity} />);
    fireEvent.change(screen.getByPlaceholderText('Ask anything…'), {
      target: { value: 'lets build a project' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const confirm = await screen.findByRole('button', { name: 'Create Goal' });
    fireEvent.click(confirm);
  }

  it('opens the goal as soon as the user agrees to create it', async () => {
    const onOpenEntity = vi.fn();
    resolveCopilotAction.mockResolvedValue({
      status: 'approved',
      result: { created: { id: 'goal-9', title: 'New goal' } },
      blocks: [{ id: 'b1', type: 'goal', entityId: 'goal-9', compact: { title: 'New goal' } }],
    });
    await approve(onOpenEntity);

    await waitFor(() =>
      expect(onOpenEntity).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'goal', entityId: 'goal-9', source: 'created' })
      )
    );
    expect(screen.getByText(/Done: Create a new project goal/)).toBeTruthy();
  });

  it('opens nothing when the action could not be resolved', async () => {
    const onOpenEntity = vi.fn();
    resolveCopilotAction.mockResolvedValue({ status: 'error', error: 'boom' });
    await approve(onOpenEntity);

    await waitFor(() => expect(screen.getByText('boom')).toBeTruthy());
    expect(onOpenEntity).not.toHaveBeenCalled();
  });

  it('shows the draft values on the confirmation card before the user agrees', async () => {
    copilotChat.mockResolvedValue({
      message: 'What is the project name?',
      blocks: [],
      proposedActions: [proposal],
    });
    render(<AssistantChat />);
    fireEvent.change(screen.getByPlaceholderText('Ask anything…'), {
      target: { value: 'lets build a project' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('New goal')).toBeTruthy();
    expect(screen.getByText('$10')).toBeTruthy();
  });
});

// The Goal tab hides the assistant surface rather than unmounting it, because
// the conversation lives in here and nowhere else. These pin both halves of that
// reasoning: hiding is safe, unmounting is not.
describe('AssistantChat across a tab switch', () => {
  async function sendOne(rerenderWith) {
    copilotChat.mockResolvedValue({ message: 'still here', blocks: [], proposedActions: [] });
    const view = rerenderWith(false);
    fireEvent.change(screen.getByPlaceholderText('Ask anything…'), {
      target: { value: 'remember this' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('still here');
    return view;
  }

  it('keeps the conversation when its wrapper is only hidden', async () => {
    const Wrapper = ({ hidden }) => (
      <div style={{ display: hidden ? 'none' : 'contents' }}>
        <AssistantChat />
      </div>
    );
    const { rerender } = await sendOne((hidden) => render(<Wrapper hidden={hidden} />));

    rerender(<Wrapper hidden />);
    rerender(<Wrapper hidden={false} />);

    expect(screen.getByText('remember this')).toBeInTheDocument();
    expect(screen.getByText('still here')).toBeInTheDocument();
  });

  it('loses it when the surface is unmounted instead', async () => {
    const Wrapper = ({ hidden }) => (hidden ? <div /> : <AssistantChat />);
    const { rerender } = await sendOne((hidden) => render(<Wrapper hidden={hidden} />));

    rerender(<Wrapper hidden />);
    rerender(<Wrapper hidden={false} />);

    expect(screen.queryByText('remember this')).toBeNull();
    expect(screen.queryByText('still here')).toBeNull();
  });
});

describe('createdEntity', () => {
  it('prefers the created id from the tool result', () => {
    expect(
      createdEntity('goal.create', { result: { created: { id: 'g1' } }, blocks: [] })
    ).toMatchObject({ type: 'goal', entityId: 'g1' });
  });

  it('falls back to the block the resolver attached', () => {
    expect(
      createdEntity('goal.create', { blocks: [{ type: 'goal', entityId: 'g2' }] })
    ).toMatchObject({ type: 'goal', entityId: 'g2' });
  });

  it('ignores actions that did not create anything', () => {
    expect(createdEntity('goal.pause', { result: { created: { id: 'g1' } } })).toBeNull();
    expect(createdEntity('goal.create', { result: {}, blocks: [] })).toBeNull();
  });
});
