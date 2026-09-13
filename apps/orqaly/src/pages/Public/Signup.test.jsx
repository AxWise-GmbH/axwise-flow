import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Signup from './Signup';

const h = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: false },
  signUpProps: null,
}));

vi.mock('@clerk/react', () => ({
  useAuth: () => h.auth,
  SignUp: (props) => {
    h.signUpProps = props;
    return <div data-testid="clerk-sign-up">Clerk sign up</div>;
  },
}));

vi.mock('../../components/Public/PublicShell', () => ({
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock('./_shared', () => ({ PageHero: () => <div>Hero</div> }));

function renderSignup(entry) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="/assistant" element={<div>Assistant route</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  h.auth = { isLoaded: true, isSignedIn: false };
  h.signUpProps = null;
});

describe('Clerk signup surface', () => {
  it('preserves the requested deep link through sign-up and back to sign-in', () => {
    renderSignup('/signup?returnTo=%2Fassistant%3Fsection%3Dgoals');

    expect(h.signUpProps).toMatchObject({
      fallbackRedirectUrl: '/assistant?section=goals',
      signInUrl: '/login?returnTo=%2Fassistant%3Fsection%3Dgoals',
    });
  });

  it('redirects an existing session to the preserved deep link', () => {
    h.auth = { isLoaded: true, isSignedIn: true };
    renderSignup('/signup?returnTo=%2Fassistant%3Fsection%3Dgoals');

    expect(screen.getByText('Assistant route')).toBeInTheDocument();
  });
});
