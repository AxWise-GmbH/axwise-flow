import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();
const dismissMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('./OnboardingProvider', () => ({
  useOnboarding: vi.fn(() => ({ active: true, dismiss: dismissMock })),
}));

vi.mock('../../hooks/useSimpleMode', () => ({
  useSimpleMode: vi.fn(() => ({ simpleMode: true })),
}));

vi.mock('./WelcomeGuideV2', () => ({
  default: ({ open }) => (open ? <div data-testid="welcome-guide">guide</div> : null),
}));

import { useOnboarding } from './OnboardingProvider';
import { useSimpleMode } from '../../hooks/useSimpleMode';
import SetupOnboardingGate from './SetupOnboardingGate';

function renderGate(path = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SetupOnboardingGate />
    </MemoryRouter>
  );
}

describe('SetupOnboardingGate', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    dismissMock.mockClear();
    useOnboarding.mockReturnValue({ active: true, dismiss: dismissMock });
    useSimpleMode.mockReturnValue({ simpleMode: true });
  });

  it('shows intro for simple users on /dashboard', () => {
    renderGate('/dashboard');
    expect(screen.getByTestId('welcome-guide')).toBeInTheDocument();
  });

  it('does not show intro for advanced users', () => {
    useSimpleMode.mockReturnValue({ simpleMode: false });
    renderGate('/dashboard');
    expect(screen.queryByTestId('welcome-guide')).not.toBeInTheDocument();
  });

  it('redirects simple users to /dashboard when onboarding on /agent-hub', async () => {
    renderGate('/agent-hub');
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });
});
