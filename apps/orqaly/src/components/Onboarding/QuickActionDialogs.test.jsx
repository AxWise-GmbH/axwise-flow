import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';

// Mock the heavy real dialogs to lightweight markers (avoids supabase/setup chains).
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});
vi.mock('../Assistant/AssistantSetupChatDialog', () => ({
  default: ({ open }) => (open ? <div data-testid="d-assistant" /> : null),
}));
vi.mock('../Organizations/CreateOrgDialog', () => ({
  default: ({ open }) => (open ? <div data-testid="d-org" /> : null),
}));
vi.mock('../Setup/SetupWizardDialog', () => ({
  default: ({ open }) => (open ? <div data-testid="d-keys" /> : null),
}));
vi.mock('./HireUsDialog', () => ({
  default: ({ open }) => (open ? <div data-testid="d-hire" /> : null),
}));

import QuickActionDialogs from './QuickActionDialogs';

function fire(action) {
  act(() => {
    window.dispatchEvent(new CustomEvent('orch-quick-action', { detail: { action } }));
  });
}

describe('QuickActionDialogs', () => {
  it('opens the matching dialog for each quick-action event', () => {
    render(<QuickActionDialogs />);
    expect(screen.queryByTestId('d-assistant')).not.toBeInTheDocument();

    fire('assistant');
    expect(screen.getByTestId('d-assistant')).toBeInTheDocument();

    fire('org');
    expect(screen.getByTestId('d-org')).toBeInTheDocument();

    fire('keys');
    expect(screen.getByTestId('d-keys')).toBeInTheDocument();

    fire('hire');
    expect(screen.getByTestId('d-hire')).toBeInTheDocument();
  });

  it('ignores unknown actions', () => {
    render(<QuickActionDialogs />);
    fire('nope');
    expect(screen.queryByTestId('d-assistant')).not.toBeInTheDocument();
    expect(screen.queryByTestId('d-org')).not.toBeInTheDocument();
  });
});
