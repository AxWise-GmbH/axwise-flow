import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import HomeHero from './HomeHero.jsx';

const clerkState = vi.hoisted(() => ({
  current: { isLoaded: true, user: { firstName: 'Mara' } },
}));

vi.mock('@clerk/react', () => ({
  useUser: () => clerkState.current,
}));

vi.mock('../../components/Common/LineOrb.jsx', () => ({
  default: ({ title }) => <div role="img" aria-label={title} />,
}));

function DraftReceiver() {
  const location = useLocation();
  return (
    <div>
      <span>{location.pathname}</span>
      <span data-testid="route-search">{location.search}</span>
      <pre data-testid="route-state">{JSON.stringify(location.state)}</pre>
    </div>
  );
}

function renderHero() {
  return render(
    <MemoryRouter initialEntries={['/home']}>
      <Routes>
        <Route path="/home" element={<HomeHero />} />
        <Route path="/assistant" element={<DraftReceiver />} />
        <Route path="/goals" element={<DraftReceiver />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-01T15:00:00'));
  clerkState.current = { isLoaded: true, user: { firstName: 'Mara' } };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GCP Home hero', () => {
  it('renders the time-aware Clerk greeting and launch captions', () => {
    clerkState.current = {
      isLoaded: true,
      user: { firstName: 'Mr.V' },
    };
    renderHero();

    expect(screen.getByText('Good afternoon, Mr. V')).toBeInTheDocument();
    expect(screen.getByText('Ask, refine, and keep the conversation going.')).toBeInTheDocument();
    expect(
      screen.getByText('Delegate complex work to an Agent when you need it.')
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Orqaly assistant' })).toBeInTheDocument();
  });

  it('uses one accessible selector for Auto, Assistant, Research, and Agent', () => {
    renderHero();

    const auto = screen.getByRole('radio', { name: 'Auto' });
    const assistant = screen.getByRole('radio', { name: 'Assistant' });
    const research = screen.getByRole('radio', { name: 'Research' });
    const agent = screen.getByRole('radio', { name: 'Agent' });
    const modeSelector = screen.getByRole('radiogroup', { name: 'Conversation mode' });
    expect(modeSelector).toBeInTheDocument();
    expect(modeSelector).toHaveAccessibleDescription(
      'Auto: Orqaly chooses Assistant, Research, or Agent from your message.'
    );
    expect(auto).toHaveAttribute('aria-checked', 'true');
    expect(auto).toHaveAttribute('tabindex', '0');
    expect(assistant).toHaveAttribute('tabindex', '-1');
    expect(research).toHaveAttribute('tabindex', '-1');
    expect(agent).toHaveAttribute('tabindex', '-1');

    fireEvent.click(agent);
    expect(agent).toHaveAttribute('aria-checked', 'true');
    expect(auto).toHaveAttribute('aria-checked', 'false');
    expect(modeSelector).toHaveAccessibleDescription(
      'Agent: Delegate tracked work to a scoped Agent with progress and approvals.'
    );

    fireEvent.keyDown(agent, { key: 'ArrowLeft' });
    expect(research).toHaveAttribute('aria-checked', 'true');
    expect(research).toHaveFocus();
    expect(modeSelector).toHaveAccessibleDescription(
      'Research: Run grounded research and return sources.'
    );
    fireEvent.keyDown(research, { key: 'Home' });
    expect(auto).toHaveAttribute('aria-checked', 'true');
    expect(auto).toHaveFocus();
  });

  it('uses the shared placeholder for Auto and each explicit mode', () => {
    renderHero();

    const input = screen.getByRole('textbox', { name: 'Message Orqaly' });
    expect(input).toHaveAttribute('placeholder', 'Ask Orqaly anything…');

    fireEvent.click(screen.getByRole('radio', { name: 'Assistant' }));
    expect(input).toHaveAttribute('placeholder', 'Ask a question or continue the conversation…');

    fireEvent.click(screen.getByRole('radio', { name: 'Research' }));
    expect(input).toHaveAttribute('placeholder', 'Describe what Orqaly should research…');

    fireEvent.click(screen.getByRole('radio', { name: 'Agent' }));
    expect(input).toHaveAttribute('placeholder', 'Describe the task your Agent should own…');
  });

  it('keeps unavailable composer tools honest and disabled', () => {
    renderHero();

    expect(screen.getByRole('button', { name: 'Attach files' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Goal setup unavailable' })).toBeDisabled();
    expect(
      screen.getByText('Coming soon: file attachments and advanced Goal setup.')
    ).toBeVisible();
  });

  it('keeps Send disabled for blank text and enables it for a request', () => {
    renderHero();

    const input = screen.getByRole('textbox', { name: 'Message Orqaly' });
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();

    fireEvent.change(input, { target: { value: '  ' } });
    expect(send).toBeDisabled();

    fireEvent.change(input, { target: { value: 'Prepare a launch plan' } });
    expect(send).toBeEnabled();
  });

  it('bounds the private handoff to the destination draft limit', () => {
    renderHero();

    const input = screen.getByRole('textbox', { name: 'Message Orqaly' });
    expect(input).toHaveAttribute('maxlength', '24000');

    fireEvent.change(input, { target: { value: 'x'.repeat(24_001) } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('hands the default Auto draft off in router state without putting it in the URL', () => {
    renderHero();

    fireEvent.change(screen.getByRole('textbox', { name: 'Message Orqaly' }), {
      target: { value: '  Prepare a launch plan  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(screen.getByText('/assistant')).toBeInTheDocument();
    expect(screen.getByTestId('route-search')).toHaveTextContent('');
    expect(JSON.parse(screen.getByTestId('route-state').textContent)).toEqual({
      gcpDraft: {
        mode: 'auto',
        text: 'Prepare a launch plan',
        nonce: expect.any(String),
      },
    });
  });

  it('routes Agent work to the Assistant lifetime setup without choosing for the user', () => {
    renderHero();

    fireEvent.click(screen.getByRole('radio', { name: 'Agent' }));
    expect(
      screen.getByText(
        'Next, choose whether this Agent exists only for the task or is retained after it.'
      )
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Message Orqaly' }), {
      target: { value: 'Run a durable launch plan' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to Agent setup' }));

    expect(screen.getByText('/assistant')).toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId('route-state').textContent)).toMatchObject({
      gcpDraft: {
        mode: 'goal',
        text: 'Run a durable launch plan',
      },
    });
    expect(JSON.parse(screen.getByTestId('route-state').textContent).gcpDraft).not.toHaveProperty(
      'agentLifetime'
    );
  });

  it('hands Research off as typed route state without changing the request', () => {
    renderHero();

    fireEvent.click(screen.getByRole('radio', { name: 'Research' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Message Orqaly' }), {
      target: { value: 'Compare the current EU AI Act guidance' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(JSON.parse(screen.getByTestId('route-state').textContent)).toMatchObject({
      gcpDraft: {
        mode: 'research',
        text: 'Compare the current EU AI Act guidance',
      },
    });
  });

  it('submits with Enter, while Shift+Enter stays in the composer', () => {
    renderHero();

    const input = screen.getByRole('textbox', { name: 'Message Orqaly' });
    fireEvent.change(input, { target: { value: 'First line' } });

    expect(fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })).toBe(true);
    expect(screen.getByRole('textbox', { name: 'Message Orqaly' })).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'First line\nSecond line' } });
    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(false);
    expect(screen.getByText('/assistant')).toBeInTheDocument();
    expect(JSON.parse(screen.getByTestId('route-state').textContent)).toMatchObject({
      gcpDraft: {
        mode: 'auto',
        text: 'First line\nSecond line',
      },
    });
  });
});
