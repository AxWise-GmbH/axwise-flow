import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';

const focusMock = vi.fn();
const shouldAutofocusMock = vi.fn(() => true);

vi.mock('../../utils/mobileTouchScroll', async () => {
  const actual = await vi.importActual('../../utils/mobileTouchScroll');
  return {
    ...actual,
    shouldAutofocusTextInput: () => shouldAutofocusMock(),
    getHeroInputFontSize: (isMobile) => (isMobile ? '16px' : '0.9375rem'),
  };
});

vi.mock('../../hooks/useVoiceControl', () => ({
  useVoiceControl: () => ({
    state: 'idle',
    transcript: '',
    isSupported: false,
    startListening: vi.fn(),
    stopListening: vi.fn(),
  }),
  getVoiceUnsupportedMessage: () => 'Voice not supported',
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

import { HeroPromptInput } from './Dashboard.jsx';

function renderHero(overrides = {}) {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={createTheme()}>
        <HeroPromptInput onSubmit={vi.fn()} {...overrides} />
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe('HeroPromptInput mobile zoom', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    focusMock.mockClear();
    shouldAutofocusMock.mockReturnValue(true);
    sessionStorage.clear();
    HTMLTextAreaElement.prototype.focus = focusMock;

    window.matchMedia = vi.fn((query) => ({
      matches: query === '(pointer: coarse)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('does not autofocus on coarse pointer (iOS Safari)', async () => {
    shouldAutofocusMock.mockReturnValue(false);
    renderHero();
    await waitFor(
      () => {
        expect(focusMock).not.toHaveBeenCalled();
      },
      { timeout: 900 }
    );
  });

  it('autofocuses once on desktop fine pointer', async () => {
    window.matchMedia = vi.fn(() => ({
      matches: false,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    shouldAutofocusMock.mockReturnValue(true);
    renderHero();
    await waitFor(
      () => {
        expect(focusMock).toHaveBeenCalled();
      },
      { timeout: 900 }
    );
  });

  it('renders attach and send in a dedicated action row (no mic)', () => {
    const { getByTestId } = renderHero();
    const root = getByTestId('hero-prompt-input');
    const actions = getByTestId('hero-prompt-actions');
    expect(root.contains(actions)).toBe(true);
    expect(actions.querySelector('[aria-label="Attach files"]')).toBeTruthy();
    expect(actions.querySelector('[aria-label="Submit"]')).toBeTruthy();
    // Mic/voice was removed so the Goal composer matches the Assistant design 1:1.
    expect(actions.querySelector('[aria-label="Start voice transcription"]')).toBeNull();
  });

  it('marks the landing composer for shell-level focus handling', () => {
    const { getByRole } = renderHero();
    expect(getByRole('textbox').closest('[data-composer-text-entry]')).not.toBeNull();
  });

  it('renders topSlot content inside the input card', () => {
    const { getByTestId, getByText } = renderHero({
      topSlot: <span data-testid="hero-topslot">Goal</span>,
    });
    const root = getByTestId('hero-prompt-input');
    expect(root.contains(getByTestId('hero-topslot'))).toBe(true);
    expect(getByText('Goal')).toBeTruthy();
  });

  // The Goal composer gets the Assistant's sliders icon, but only where a goal
  // setup drawer is actually mounted - the other categories create no goal.
  it('offers no setup icon unless the host mounts a setup drawer', () => {
    const { getByTestId } = renderHero();
    expect(
      getByTestId('hero-prompt-actions').querySelector('[aria-label="Goal setup"]')
    ).toBeNull();
  });

  it('puts the setup icon next to the paperclip and opens the drawer from it', () => {
    const onOpenSetup = vi.fn();
    const { getByTestId } = renderHero({ onOpenSetup });
    const actions = getByTestId('hero-prompt-actions');
    const setup = actions.querySelector('[aria-label="Goal setup"]');
    expect(setup).toBeTruthy();
    expect(
      actions.querySelector('[aria-label="Attach files"]').compareDocumentPosition(setup) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    setup.click();
    expect(onOpenSetup).toHaveBeenCalledTimes(1);
  });

  it('renders bodyOverride in place of the text input and actions', () => {
    const { getByTestId, queryByTestId, getByText } = renderHero({
      topSlot: <span data-testid="hero-topslot">Assistant</span>,
      bodyOverride: <div data-testid="assistant-surface">embedded surface</div>,
    });
    const root = getByTestId('hero-prompt-input');
    // Pills (topSlot) stay so the user can switch category...
    expect(root.contains(getByTestId('hero-topslot'))).toBe(true);
    // ...but the composer body is replaced by the override.
    expect(getByText('embedded surface')).toBeTruthy();
    expect(queryByTestId('hero-prompt-actions')).toBeNull();
  });
});
