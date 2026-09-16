import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GcpClerkGate from './GcpClerkGate';

const clerk = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, userId: 'user-one' },
}));

vi.mock('@clerk/react', () => ({
  useAuth: () => clerk.auth,
}));

function LoginProbe() {
  const location = useLocation();
  return <div data-testid="login-return-to">{location.state?.from || 'missing'}</div>;
}

let mountedInstances = 0;
function ProtectedProbe() {
  const [instance] = useState(() => ++mountedInstances);
  return <div data-testid="protected-instance">{instance}</div>;
}

function GateHarness() {
  return (
    <MemoryRouter initialEntries={['/assistant?section=goals#approval']}>
      <Routes>
        <Route
          path="/assistant"
          element={
            <GcpClerkGate>
              <ProtectedProbe />
            </GcpClerkGate>
          }
        />
        <Route path="/login" element={<LoginProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  clerk.auth = { isLoaded: true, isSignedIn: true, userId: 'user-one' };
  mountedInstances = 0;
});

describe('GcpClerkGate', () => {
  it('waits for Clerk before exposing protected content', () => {
    clerk.auth = { isLoaded: false, isSignedIn: undefined, userId: null };
    render(<GateHarness />);

    expect(screen.getByLabelText('Loading authentication')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-instance')).not.toBeInTheDocument();
  });

  it('preserves the complete deep link for signed-out visitors', () => {
    clerk.auth = { isLoaded: true, isSignedIn: false, userId: null };
    render(<GateHarness />);

    expect(screen.getByTestId('login-return-to')).toHaveTextContent(
      '/assistant?section=goals#approval'
    );
    expect(screen.queryByTestId('protected-instance')).not.toBeInTheDocument();
  });

  it('renders signed-in content and remounts it when the Clerk account changes', () => {
    const view = render(<GateHarness />);
    expect(screen.getByTestId('protected-instance')).toHaveTextContent('1');

    clerk.auth = { isLoaded: true, isSignedIn: true, userId: 'user-two' };
    view.rerender(<GateHarness />);

    expect(screen.getByTestId('protected-instance')).toHaveTextContent('2');
  });
});
