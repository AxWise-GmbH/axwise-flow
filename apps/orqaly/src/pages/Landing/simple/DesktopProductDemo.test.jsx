import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import DesktopProductDemo from './DesktopProductDemo';

const LOCAL = {
  id: 'local',
  request: 'Build a webhook receiver. Check retries and duplicate events.',
  reply: 'The receiver and its local checks are ready to review.',
  activity: 'Checking the implementation',
  files: ['Implementation notes.md', 'webhook-handler.js', 'Check results'],
  artifactTitle: 'A useful handoff',
  artifactLines: ['Receiver and retry handling', 'Duplicate-event protection', 'Local checks'],
  footer: 'Files and tool actions stay under your control.',
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockMedia({ mobile = false, reducedMotion = false } = {}) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({
      matches: query.includes('max-width')
        ? mobile
        : query.includes('prefers-reduced-motion') && reducedMotion,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }))
  );
}

describe('DesktopProductDemo', () => {
  it('shows the populated desktop layout, local skill and artifact controls without screenshots', () => {
    const { container } = render(<DesktopProductDemo example={LOCAL} />);
    expect(screen.getByLabelText('Desktop navigation preview')).toHaveTextContent(
      'Session History'
    );
    expect(screen.getByLabelText('Example workspace documents and results')).toHaveTextContent(
      'Skills loaded'
    );
    expect(screen.getByText('webhook-development')).toBeInTheDocument();
    expect(screen.getByText(LOCAL.request)).toBeInTheDocument();
    expect(screen.getByText(LOCAL.reply)).toBeInTheDocument();
    expect(screen.getAllByText(/Interactive product demo/)).toHaveLength(1);
    expect(
      within(screen.getByLabelText('Desktop navigation preview')).getByText('Built on Goose')
    ).toBeInTheDocument();
    expect(container.querySelector('img, iframe, video, canvas')).toBeNull();
    expect(container.querySelector('.opd-cursor')).toBeNull();
    expect(container.querySelector('.opd-nav button')).toBeNull();
  });

  it('opens each actual example file and returns to the artifact list', () => {
    render(<DesktopProductDemo example={LOCAL} />);
    LOCAL.files.forEach((filename, index) => {
      fireEvent.click(screen.getByRole('button', { name: `Open ${filename}` }));
      const artifact = screen.getByRole('article', { name: filename });
      expect(artifact).toBeInTheDocument();
      if (index === 1) expect(artifact).toHaveTextContent('async function receiveEvent');
      if (index === 2) expect(artifact).toHaveTextContent('ignores duplicate deliveries');
      fireEvent.click(screen.getByRole('button', { name: 'Back to workspace' }));
    });
    expect(screen.getByRole('button', { name: 'Open webhook-handler.js' })).toBeInTheDocument();
  });

  it('closes and reopens workspace without losing the selected document', () => {
    render(<DesktopProductDemo example={LOCAL} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open Implementation notes.md' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close workspace' }));
    expect(
      screen.queryByLabelText('Example workspace documents and results')
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open workspace' }));
    expect(screen.getByRole('article', { name: 'Implementation notes.md' })).toBeInTheDocument();
  });

  it('never auto-plays and completes one explicitly started walkthrough', () => {
    vi.useFakeTimers();
    const interval = vi.spyOn(window, 'setInterval');
    const clear = vi.spyOn(window, 'clearInterval');
    const { container } = render(<DesktopProductDemo example={LOCAL} />);
    act(() => vi.advanceTimersByTime(120_000));
    expect(container.querySelector('.opd')).toHaveAttribute('data-playback', 'idle');
    fireEvent.click(screen.getByRole('button', { name: 'Play walkthrough' }));
    expect(screen.getByText('What would you like to work on?')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(6500));
    expect(screen.getByRole('button', { name: 'Replay walkthrough' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Implementation notes.md' })).toBeInTheDocument();
    expect(container.querySelector('.opd-cursor')).toBeNull();
    expect(interval).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith(interval.mock.results[0].value);
  });

  it('pauses, resumes, and cleans up walkthrough timers when a different case is shown', () => {
    vi.useFakeTimers();
    const interval = vi.spyOn(window, 'setInterval');
    const clear = vi.spyOn(window, 'clearInterval');
    const { container, rerender } = render(<DesktopProductDemo key="local" example={LOCAL} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play walkthrough' }));
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.click(screen.getByRole('button', { name: 'Pause walkthrough' }));
    const typed = screen.getByLabelText('Example message composer').textContent;
    act(() => vi.advanceTimersByTime(8000));
    expect(screen.getByLabelText('Example message composer').textContent).toBe(typed);
    expect(clear).toHaveBeenCalledWith(interval.mock.results[0].value);
    fireEvent.click(screen.getByRole('button', { name: 'Resume walkthrough' }));
    act(() => vi.advanceTimersByTime(1000));
    expect(container.querySelector('.opd')).toHaveAttribute('data-playback', 'playing');
    rerender(<DesktopProductDemo key="chat" example={{ ...LOCAL, id: 'chat' }} />);
    expect(interval).toHaveBeenCalledTimes(2);
    expect(clear).toHaveBeenCalledWith(interval.mock.results[1].value);
    expect(container.querySelector('.opd')).toHaveAttribute('data-playback', 'idle');
  });

  it('shows the final artifact immediately with reduced motion, without a cursor or timers', () => {
    mockMedia({ reducedMotion: true });
    vi.useFakeTimers();
    const interval = vi.spyOn(window, 'setInterval');
    const { container } = render(<DesktopProductDemo example={LOCAL} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play walkthrough' }));
    expect(screen.getByRole('article', { name: 'Implementation notes.md' })).toBeInTheDocument();
    expect(container.querySelector('.opd-cursor')).toBeNull();
    expect(interval).not.toHaveBeenCalled();
  });

  it('starts with readable chat on mobile and opens workspace on request', () => {
    mockMedia({ mobile: true });
    render(<DesktopProductDemo example={LOCAL} />);
    expect(screen.getByText(LOCAL.request)).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Example workspace documents and results')
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open workspace' }));
    expect(screen.getByLabelText('Example workspace documents and results')).toBeInTheDocument();
  });

  it('renders a workflow graph and coherent stock records in their distinct artifacts', () => {
    const { rerender } = render(
      <DesktopProductDemo
        key="n8n"
        example={{
          ...LOCAL,
          id: 'n8n',
          files: ['Order workflow.json', 'Change summary.md', 'Connection notes'],
        }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open Order workflow.json' }));
    expect(screen.getByLabelText('Order workflow draft')).toHaveTextContent('Look up stock');
    expect(screen.getByLabelText('Order workflow draft')).toHaveTextContent('Team review');
    rerender(
      <DesktopProductDemo
        key="operations"
        example={{
          ...LOCAL,
          id: 'operations',
          files: ['Operations brief.md', 'Example orders.csv', 'Example inventory.csv'],
        }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open Operations brief.md' }));
    expect(screen.getByText('10 on hand − 8 allocated = 2 available.')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Orders for item A' });
    expect(within(table).getByText('Review 2-unit shortfall')).toBeInTheDocument();
  });
});
