import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import InstantExamples from './InstantExamples';
import { instantTheme } from './instantTheme';

const USE_CASES = [
  'Build locally',
  'n8n workflows',
  'Business operations',
  'Role-based copilot',
  'Connected chat',
];

const NEW_MENU = [
  'New Chat',
  'RECENT',
  'PINNED',
  'Intelligence',
  'Plugins',
  'Instruments',
  'History',
  'Settings',
];

const OLD_MENU = ['Recipes', 'Skills', 'Apps', 'Scheduler', 'Extensions', 'Session History'];

function renderExamples() {
  return render(
    <MemoryRouter initialEntries={['/instant']}>
      <ThemeProvider theme={instantTheme}>
        <InstantExamples />
      </ThemeProvider>
    </MemoryRouter>
  );
}

function sidebar() {
  return screen.getByLabelText('Desktop navigation preview');
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('InstantExamples', () => {
  it('keeps the heading and the five use cases of the examples block', () => {
    renderExamples();
    expect(
      screen.getByRole('heading', { level: 2, name: 'One chat. A connected workspace.' })
    ).toBeInTheDocument();
    const pills = within(screen.getByRole('group', { name: 'Choose a use case' })).getAllByRole(
      'button'
    );
    expect(pills.map((pill) => pill.textContent)).toEqual(USE_CASES);
    expect(screen.getByRole('button', { name: 'Business operations' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('draws the desktop window in the dark theme, inside the scope its styles hang on', () => {
    const { container } = renderExamples();
    const demo = container.querySelector('.opd');
    expect(demo).toHaveClass('opd-dark');
    expect(container.querySelectorAll('.opd')).toHaveLength(1);
    expect(demo.closest('.oix')).not.toBeNull();
    expect(container.querySelector('.oix #use-cases')).not.toBeNull();
    for (const label of USE_CASES) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(container.querySelector('.opd')).toHaveClass('opd-dark');
    }
  });

  it('shows the new left menu in order: New Chat, the chat lists, then the four sections', () => {
    renderExamples();
    const text = sidebar().textContent;
    const positions = NEW_MENU.map((label) => text.indexOf(label));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);

    const rows = [...sidebar().querySelectorAll('.opd-nav-item')].map((row) => row.textContent);
    expect(rows).toEqual(['New Chat', 'Intelligence', 'Plugins', 'Instruments', 'History']);
    const labels = [...sidebar().querySelectorAll('.opd-section-label')].map(
      (label) => label.textContent
    );
    expect(labels).toEqual(['RECENT', 'PINNED']);
    // Every row is a picture of the app: an icon plus a label, never a control.
    expect(sidebar().querySelectorAll('.opd-nav-item svg')).toHaveLength(5);
    expect(sidebar().querySelector('button, a')).toBeNull();
  });

  it('lists the current chat first under RECENT and the brand guide under PINNED', () => {
    renderExamples();
    const chats = () =>
      [...sidebar().querySelectorAll('.opd-chat-list > div')].map((row) => row.textContent);
    expect(chats()).toEqual(['Today’s operations brief', 'Getting started', 'Brand guide']);
    expect(sidebar().querySelector('.opd-chat-selected')).toHaveTextContent(
      'Today’s operations brief'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Connected chat' }));
    expect(chats()).toEqual(['Launch team brief', 'Getting started', 'Brand guide']);
  });

  it('drops every entry of the old menu', () => {
    renderExamples();
    for (const label of OLD_MENU) {
      expect(within(sidebar()).queryByText(label)).not.toBeInTheDocument();
    }
    expect(sidebar().textContent).not.toMatch(
      /Recipes|Skills|Apps|Scheduler|Extensions|Session History/
    );
    expect(within(sidebar()).queryByText('Chats')).not.toBeInTheDocument();
  });

  it("uses the app's composer line and keeps the documents one click away", () => {
    renderExamples();
    expect(screen.getByLabelText('Example message composer')).toHaveTextContent(
      "Ask whatever's on your mind."
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open Operations brief.md' }));
    expect(screen.getByRole('article', { name: 'Operations brief.md' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Orders for item A' })).toHaveTextContent(
      'Review 2-unit shortfall'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back to workspace' }));
    expect(screen.getByLabelText('Example workspace documents and results')).toHaveTextContent(
      'Skills loaded'
    );
  });

  it('never autoplays the walkthrough or rotates the use cases', () => {
    vi.useFakeTimers();
    const interval = vi.spyOn(window, 'setInterval');
    const { container } = renderExamples();
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(container.querySelector('.opd')).toHaveAttribute('data-playback', 'idle');
    expect(container.querySelector('.opd-cursor')).toBeNull();
    expect(interval).not.toHaveBeenCalled();
    expect(document.getElementById('use-case-panel')).toHaveAttribute('data-case-id', 'operations');
    expect(screen.getByRole('button', { name: 'Play walkthrough' })).toBeInTheDocument();
    interval.mockRestore();
  });

  it('plays only when asked, and stays dark while it does', () => {
    vi.useFakeTimers();
    const { container } = renderExamples();
    fireEvent.click(screen.getByRole('button', { name: 'Play walkthrough' }));
    expect(container.querySelector('.opd')).toHaveAttribute('data-playback', 'playing');
    act(() => {
      vi.advanceTimersByTime(6500);
    });
    expect(container.querySelector('.opd')).toHaveAttribute('data-playback', 'complete');
    expect(container.querySelector('.opd')).toHaveClass('opd-dark');
    expect(screen.getByRole('article', { name: 'Operations brief.md' })).toBeInTheDocument();
  });

  it('draws everything in markup: no image, frame, video or canvas in any use case', () => {
    const { container } = renderExamples();
    for (const label of USE_CASES) {
      fireEvent.click(screen.getByRole('button', { name: label }));
      expect(container.querySelector('img, iframe, video, canvas')).toBeNull();
    }
    fireEvent.click(screen.getByRole('button', { name: 'n8n workflows' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Order workflow.json' }));
    expect(screen.getByLabelText('Order workflow draft')).toHaveTextContent('Team review');
    expect(container.querySelector('img, iframe, video, canvas')).toBeNull();
  });
});
