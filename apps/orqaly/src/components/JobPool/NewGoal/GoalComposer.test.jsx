import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import GoalComposer from './GoalComposer';

const theme = createTheme();

function setup(props = {}) {
  const onSubmit = vi.fn();
  const onChange = vi.fn();
  const utils = render(
    <ThemeProvider theme={theme}>
      <GoalComposer value="" onChange={onChange} onSubmit={onSubmit} canSubmit {...props} />
    </ThemeProvider>
  );
  return { onSubmit, onChange, ...utils };
}

const box = () => screen.getByRole('textbox');

describe('GoalComposer', () => {
  // GlassIcon resolves to the Liquid Glass set in simple mode, so this row came
  // out frosted while the Assistant composer one pill away stayed flat. Plain
  // MUI glyphs everywhere; each one carries its own data-testid.
  describe('the control row is one icon style', () => {
    // Tooltip mirrors the button's label onto its wrapper, so the name matches
    // twice; the button is the one carrying the glyph.
    const glyph = (label) =>
      screen
        .getAllByLabelText(label)
        .find((el) => el.tagName === 'BUTTON')
        .querySelector('svg');

    it('draws plain MUI glyphs, not glass ones', () => {
      setup({
        onAttach: vi.fn(),
        onOpenSetup: vi.fn(),
        voice: { isSupported: true, startListening: vi.fn(), stopListening: vi.fn() },
      });
      const expected = [
        ['Dictate', 'MicNoneOutlinedIcon'],
        ['Attach a file', 'AttachFileOutlinedIcon'],
        ['Goal setup', 'TuneOutlinedIcon'],
        ['Send', 'ArrowForwardOutlinedIcon'],
      ];
      expected.forEach(([label, testId]) => {
        const icon = glyph(label);
        expect(icon).toBeTruthy();
        expect(icon.getAttribute('data-testid')).toBe(testId);
        expect(icon.classList.contains('MuiSvgIcon-root')).toBe(true);
      });
    });

    it('draws them all at the same size the Assistant composer uses', () => {
      setup({ onAttach: vi.fn(), onOpenSetup: vi.fn() });
      ['Attach a file', 'Goal setup', 'Send'].forEach((label) => {
        expect(getComputedStyle(glyph(label)).fontSize).toBe('20px');
      });
    });
  });

  it('is controlled by its value prop', () => {
    setup({ value: 'Design a landing page' });
    expect(box().value).toBe('Design a landing page');
  });

  it('marks its composer so shell focus handling ignores unrelated fields', () => {
    setup();
    expect(box().closest('[data-composer-text-entry]')).not.toBeNull();
  });

  it('reports every keystroke rather than holding its own state', () => {
    const { onChange } = setup();
    fireEvent.change(box(), { target: { value: 'abc' } });
    expect(onChange).toHaveBeenCalledWith('abc');
  });

  it('sends on Enter', () => {
    const { onSubmit } = setup({ value: 'go' });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('breaks a line on Shift+Enter instead of sending', () => {
    const { onSubmit } = setup({ value: 'go' });
    fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // Accepting an IME candidate with Enter must not fire the goal.
  it('does not send while an input method is composing', () => {
    const { onSubmit } = setup({ value: 'go' });
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    Object.defineProperty(event, 'isComposing', { value: true });
    box().dispatchEvent(event);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses to send when the caller says it cannot', () => {
    const { onSubmit } = setup({ canSubmit: false });
    fireEvent.keyDown(box(), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses to send while busy, so one action cannot create two goals', () => {
    const { onSubmit } = setup({ busy: true });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // Enter that silently does nothing is the failure this replaces.
  it('explains why it cannot send instead of swallowing the keystroke', () => {
    setup({ canSubmit: false, blockedReason: 'Loading your workspaces…' });
    expect(screen.getByText('Loading your workspaces…')).toBeInTheDocument();
  });

  it('falls back to the newline hint when nothing is blocking', () => {
    setup();
    expect(screen.getByText(/Shift \+ Enter/)).toBeInTheDocument();
  });

  it('changes what it says it does with the role', () => {
    const { unmount } = setup({ role: 'describe' });
    // Before the send the label is the only thing saying what the box is for.
    expect(screen.getByText('Describing your goal')).toBeInTheDocument();
    expect(box().placeholder).toMatch(/Describe what you want/);
    unmount();

    // After it, the thread says where the run is, so nothing is drawn above the
    // box - the role shows in the placeholder and in the accessible name.
    setup({ role: 'lead' });
    expect(screen.queryByText(/team lead/)).toBeNull();
    expect(box().placeholder).toMatch(/Ask your team lead/);
    expect(box()).toHaveAccessibleName(/messages go to your team lead/i);
  });

  // A second useVoiceControl would mean two mics and an InvalidStateError.
  it('drives the injected voice instance rather than creating one', () => {
    const startListening = vi.fn();
    setup({ voice: { isSupported: true, state: 'idle', startListening } });
    fireEvent.click(screen.getByRole('button', { name: 'Dictate' }));
    expect(startListening).toHaveBeenCalled();
  });

  it('stops dictation when already listening', () => {
    const stopListening = vi.fn();
    setup({ voice: { isSupported: true, state: 'listening', stopListening } });
    fireEvent.click(screen.getByRole('button', { name: 'Stop dictating' }));
    expect(stopListening).toHaveBeenCalled();
  });

  it('hides the mic where speech is unsupported', () => {
    setup({ voice: { isSupported: false, state: 'idle' } });
    expect(screen.queryByRole('button', { name: 'Dictate' })).toBeNull();
  });

  it('offers no paperclip when the host cannot take files', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Attach a file' })).toBeNull();
  });

  // The 20-item evidence cap is shared with Materials and the KB picks, and
  // the server enforces it. Stop the user here rather than failing the submit.
  it('blocks attaching once the shared evidence budget is spent', () => {
    setup({ onAttach: vi.fn(), remainingSlots: 0 });
    expect(screen.getByRole('button', { name: 'Attach a file' })).toBeDisabled();
  });

  it('allows attaching while slots remain', () => {
    setup({ onAttach: vi.fn(), remainingSlots: 4 });
    expect(screen.getByRole('button', { name: 'Attach a file' })).not.toBeDisabled();
  });

  it('renders a top slot for the host to hang controls on', () => {
    setup({ topSlot: <button type="button">Goal</button> });
    expect(screen.getByRole('button', { name: 'Goal' })).toBeInTheDocument();
  });

  // The dialog variant passes no pills, so gating the row on topSlot alone
  // would drop the run controls entirely on that surface.
  it('renders the top row for a right slot even with no left slot', () => {
    setup({ topRight: <button type="button">Stop</button> });
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  it('puts both top slots on the same row, left and right', () => {
    setup({
      topSlot: <button type="button">Goal</button>,
      topRight: <button type="button">Stop</button>,
    });
    const left = screen.getByRole('button', { name: 'Goal' });
    const right = screen.getByRole('button', { name: 'Stop' });
    // Same row: the right slot's wrapper is a sibling of the left slot.
    expect(left.parentElement).toBe(right.parentElement.parentElement);
  });

  // Same rule as the paperclip: no button where the host has no drawer to open.
  it('offers no setup icon when the host mounts no setup drawer', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Goal setup' })).toBeNull();
  });

  it('opens the setup drawer from the icon beside the paperclip', () => {
    const onOpenSetup = vi.fn();
    setup({ onAttach: vi.fn(), onOpenSetup });
    fireEvent.click(screen.getByRole('button', { name: 'Goal setup' }));
    expect(onOpenSetup).toHaveBeenCalledTimes(1);
  });

  // Where the goal is going has to be visible from the composer, or the only
  // way to check is to reopen the drawer.
  it('tints the setup icon once the goal is aimed somewhere specific', () => {
    const theme = createTheme();
    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <GoalComposer value="" onChange={vi.fn()} onSubmit={vi.fn()} onOpenSetup={vi.fn()} />
      </ThemeProvider>
    );
    const plain = screen.getByRole('button', { name: 'Goal setup' });
    const plainColor = window.getComputedStyle(plain).color;
    rerender(
      <ThemeProvider theme={theme}>
        <GoalComposer
          value=""
          onChange={vi.fn()}
          onSubmit={vi.fn()}
          onOpenSetup={vi.fn()}
          setupScoped
        />
      </ThemeProvider>
    );
    const scoped = screen.getByRole('button', { name: 'Goal setup' });
    expect(window.getComputedStyle(scoped).color).not.toBe(plainColor);
  });
});
