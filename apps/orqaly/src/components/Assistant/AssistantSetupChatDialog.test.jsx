import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Control setup state + capture saves.
const hookMocks = vi.hoisted(() => ({
  save: vi.fn(async () => ({ steps: { keys: true } })),
  switchAssistant: vi.fn(async () => {}),
  config: {},
  assistants: [],
  currentId: null,
}));
vi.mock('../../hooks/useAssistantSetup', () => ({
  useAssistantSetup: () => ({
    config: hookMocks.config,
    steps: {},
    save: hookMocks.save,
    loading: false,
    assistants: hookMocks.assistants,
    currentId: hookMocks.currentId,
    switchAssistant: hookMocks.switchAssistant,
  }),
}));
vi.mock('../../services/assistantChatApiService', () => ({
  assistantChatApi: vi.fn(async () => ({ message: 'Sure - here to help.' })),
}));
vi.mock('../../lib/supabase', () => ({
  hasSupabase: () => false,
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));
vi.mock('../../services/organizationService', () => ({
  listOrganizations: vi.fn(async () => []),
}));

// Mock the voice façade so the dialog's wiring (mic button, transcript -> send,
// speak-on-reply, mute) is what's under test, not the real voice services.
const voiceMock = vi.hoisted(() => ({
  startMic: vi.fn(),
  stopMic: vi.fn(),
  speakReply: vi.fn(),
  stopSpeaking: vi.fn(),
  micState: 'idle',
  isSpeaking: false,
  voiceError: null,
  isSupported: true,
  opts: null,
}));
vi.mock('../../hooks/useVoiceChat', () => ({
  useVoiceChat: (opts) => {
    voiceMock.opts = opts;
    return voiceMock;
  },
}));

// Stub the cards so the dialog's orchestration is what's under test.
vi.mock('./cards/ChannelConnectCard', () => ({
  default: ({ onComplete }) => (
    <button data-testid="card-channel" onClick={() => onComplete({ config: {} })}>
      channel
    </button>
  ),
}));
vi.mock('./cards/DataCard', () => ({
  default: ({ onComplete }) => (
    <button data-testid="card-data" onClick={() => onComplete({ config: {} })}>
      data
    </button>
  ),
}));
vi.mock('./cards/ByokByosCard', () => ({
  default: ({ onComplete }) => (
    <button data-testid="card-keys" onClick={() => onComplete({ config: {} })}>
      keys
    </button>
  ),
}));

import AssistantSetupChatDialog from './AssistantSetupChatDialog';

const theme = createTheme();
function Wrap({ children }) {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

const ASSISTANTS = [
  { id: 'a1', name: 'My Assistant', activated: true },
  { id: 'a2', name: 'Sales Bot', activated: false },
];

beforeEach(() => {
  hookMocks.save.mockClear();
  hookMocks.save.mockResolvedValue({ steps: { keys: true } });
  hookMocks.switchAssistant.mockClear();
  hookMocks.config = {};
  hookMocks.assistants = ASSISTANTS;
  hookMocks.currentId = 'a1';
  voiceMock.startMic.mockClear();
  voiceMock.speakReply.mockClear();
  voiceMock.micState = 'idle';
  voiceMock.isSpeaking = false;
});

describe('AssistantSetupChatDialog', () => {
  it('defaults to the step wizard and shows the first step', () => {
    render(
      <Wrap>
        <AssistantSetupChatDialog open onClose={() => {}} />
      </Wrap>
    );
    expect(screen.getByText(/step 1 of 6/i)).toBeTruthy();
    expect(screen.getByTestId('card-keys')).toBeTruthy(); // Core leads: the activation gate
    expect(screen.queryByText(/let's get me set up/i)).toBeNull();
  });

  it('persists a completed step and advances to the next step', async () => {
    render(
      <Wrap>
        <AssistantSetupChatDialog open onClose={() => {}} />
      </Wrap>
    );
    fireEvent.click(screen.getByTestId('card-keys'));
    await waitFor(() => {
      expect(hookMocks.save).toHaveBeenCalledWith(
        expect.objectContaining({
          steps: expect.objectContaining({ keys: true }),
          activated: true, // completing Core is the activation gate
        })
      );
    });
    expect(await screen.findByTestId('card-data')).toBeTruthy();
  });

  it('keeps a Chat support view that greets and offers the first card', async () => {
    render(
      <Wrap>
        <AssistantSetupChatDialog open onClose={() => {}} />
      </Wrap>
    );
    fireEvent.click(screen.getByRole('button', { name: /^chat$/i }));
    expect(await screen.findByText(/let's get me set up/i)).toBeTruthy();
    expect(await screen.findByTestId('card-keys')).toBeTruthy(); // first incomplete step
    expect(screen.getByPlaceholderText(/ask me anything/i)).toBeTruthy();
  });

  it('shows a mic in chat that starts voice capture', async () => {
    render(
      <Wrap>
        <AssistantSetupChatDialog open onClose={() => {}} />
      </Wrap>
    );
    fireEvent.click(screen.getByRole('button', { name: /^chat$/i }));
    const mic = await screen.findByRole('button', { name: /start voice input/i });
    fireEvent.click(mic);
    expect(voiceMock.startMic).toHaveBeenCalled();
  });

  it('sends a spoken transcript and speaks the reply', async () => {
    render(
      <Wrap>
        <AssistantSetupChatDialog open onClose={() => {}} />
      </Wrap>
    );
    await act(async () => {
      voiceMock.opts.onTranscript('hello there');
    });
    await waitFor(() => expect(voiceMock.speakReply).toHaveBeenCalledWith('Sure - here to help.'));
  });

  it('does not speak the reply when muted', async () => {
    hookMocks.config = { voice: { provider: 'builtin' } };
    render(
      <Wrap>
        <AssistantSetupChatDialog open onClose={() => {}} />
      </Wrap>
    );
    fireEvent.click(screen.getByRole('button', { name: /^chat$/i }));
    // Mute, then send a typed message.
    fireEvent.click(await screen.findByRole('button', { name: /mute voice/i }));
    const input = screen.getByPlaceholderText(/ask me anything/i);
    fireEvent.change(input, { target: { value: 'typed question' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(screen.getByText('typed question')).toBeInTheDocument());
    expect(voiceMock.speakReply).not.toHaveBeenCalled();
  });

  describe('My Assistants picker', () => {
    const openPicker = () => {
      fireEvent.click(screen.getByRole('button', { name: /my assistants/i }));
      return screen.findByRole('menu', { name: /my assistants/i });
    };

    it('lists every assistant and marks the current one', async () => {
      render(
        <Wrap>
          <AssistantSetupChatDialog open onClose={() => {}} />
        </Wrap>
      );
      await openPicker();
      const items = screen.getAllByRole('menuitem');
      expect(items.map((i) => i.textContent)).toEqual([
        'My AssistantReady',
        'Sales BotSet Core to finish',
      ]);
      expect(items[0].className).toMatch(/Mui-selected/);
      expect(items[1].className).not.toMatch(/Mui-selected/);
      // The check marks the current one for anyone not reading the class.
      expect(items[0].querySelector('svg')).toBeTruthy();
      expect(items[1].querySelector('svg')).toBeNull();
    });

    it('switches to the picked assistant and closes the menu', async () => {
      render(
        <Wrap>
          <AssistantSetupChatDialog open onClose={() => {}} />
        </Wrap>
      );
      await openPicker();
      fireEvent.click(screen.getByRole('menuitem', { name: /sales bot/i }));
      await waitFor(() => expect(hookMocks.switchAssistant).toHaveBeenCalledWith('a2'));
      await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());
    });

    it('does not switch when the current assistant is picked again', async () => {
      render(
        <Wrap>
          <AssistantSetupChatDialog open onClose={() => {}} />
        </Wrap>
      );
      await openPicker();
      fireEvent.click(screen.getByRole('menuitem', { name: /my assistant/i }));
      await waitFor(() => expect(screen.queryByRole('menuitem')).toBeNull());
      expect(hookMocks.switchAssistant).not.toHaveBeenCalled();
      // Nothing to be introduced to: no welcome for the assistant already loaded.
      expect(screen.queryByText("Hi, I'm My Assistant.")).toBeNull();
    });

    it('closes the setup popup and lets the new assistant introduce itself', async () => {
      const onClose = vi.fn();
      render(
        <Wrap>
          <AssistantSetupChatDialog open onClose={onClose} />
        </Wrap>
      );
      await openPicker();
      fireEvent.click(screen.getByRole('menuitem', { name: /sales bot/i }));
      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(await screen.findByText("Hi, I'm Sales Bot.")).toBeTruthy();
      expect(screen.getByRole('button', { name: /let's go/i })).toBeTruthy();
    });

    it('dismisses the introduction on its one button', async () => {
      render(
        <Wrap>
          <AssistantSetupChatDialog open onClose={() => {}} />
        </Wrap>
      );
      await openPicker();
      fireEvent.click(screen.getByRole('menuitem', { name: /sales bot/i }));
      fireEvent.click(await screen.findByRole('button', { name: /let's go/i }));
      await waitFor(() => expect(screen.queryByText("Hi, I'm Sales Bot.")).toBeNull());
    });

    it('says nothing when the switch failed', async () => {
      hookMocks.switchAssistant.mockRejectedValueOnce(new Error('offline'));
      const onClose = vi.fn();
      render(
        <Wrap>
          <AssistantSetupChatDialog open onClose={onClose} />
        </Wrap>
      );
      await openPicker();
      fireEvent.click(screen.getByRole('menuitem', { name: /sales bot/i }));
      await waitFor(() => expect(hookMocks.switchAssistant).toHaveBeenCalled());
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.queryByText("Hi, I'm Sales Bot.")).toBeNull();
    });

    it('names the assistant being edited when there is more than one', () => {
      render(
        <Wrap>
          <AssistantSetupChatDialog open onClose={() => {}} />
        </Wrap>
      );
      expect(screen.getByText(/^My Assistant - follow the steps/)).toBeTruthy();
    });

    it('disables the picker for a brand-new user with no assistant yet', () => {
      hookMocks.assistants = [];
      hookMocks.currentId = null;
      render(
        <Wrap>
          <AssistantSetupChatDialog open onClose={() => {}} />
        </Wrap>
      );
      expect(screen.getByRole('button', { name: /my assistants/i })).toBeDisabled();
    });
  });

  it('renders nothing-blocking when closed', () => {
    render(
      <Wrap>
        <AssistantSetupChatDialog open={false} onClose={() => {}} />
      </Wrap>
    );
    expect(screen.queryByTestId('card-channel')).toBeNull();
  });
});
