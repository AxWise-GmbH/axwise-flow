import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';

const h = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: false },
  signInProps: null,
}));

vi.mock('@clerk/react', () => ({
  useAuth: () => h.auth,
  SignIn: (props) => {
    h.signInProps = props;
    return <div data-testid="clerk-sign-in">Clerk sign in</div>;
  },
}));
vi.mock('../../components/Common/Logo', () => ({
  default: () => <span data-testid="logo">Orqaly</span>,
}));

function renderLogin(initialEntry = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<div>Home route</div>} />
        <Route path="/assistant" element={<div>Assistant route</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  h.auth = { isLoaded: true, isSignedIn: false };
  h.signInProps = null;
});

describe('Clerk login surface', () => {
  it('renders Clerk SignIn with hash routing and full-app redirects', () => {
    renderLogin();

    expect(screen.getByRole('heading', { name: 'Welcome to Orqaly' })).toBeInTheDocument();
    expect(screen.getByTestId('clerk-sign-in')).toBeInTheDocument();
    expect(h.signInProps).toMatchObject({
      routing: 'hash',
      signUpUrl: '/signup?returnTo=%2Fhome',
      fallbackRedirectUrl: '/home',
    });
  });

  it('waits for Clerk before rendering authentication state', () => {
    h.auth = { isLoaded: false, isSignedIn: undefined };
    renderLogin();

    expect(screen.getByLabelText('Loading authentication')).toBeInTheDocument();
    expect(screen.queryByTestId('clerk-sign-in')).not.toBeInTheDocument();
  });

  it('redirects an existing Clerk session to the app', () => {
    h.auth = { isLoaded: true, isSignedIn: true };
    renderLogin();

    expect(screen.getByText('Home route')).toBeInTheDocument();
    expect(screen.queryByTestId('clerk-sign-in')).not.toBeInTheDocument();
  });

  it('preserves an authenticated deep link through Clerk sign-in', () => {
    renderLogin({
      pathname: '/login',
      state: { from: '/assistant?section=goals' },
    });

    expect(h.signInProps.fallbackRedirectUrl).toBe('/assistant?section=goals');
    expect(h.signInProps.signUpUrl).toBe('/signup?returnTo=%2Fassistant%3Fsection%3Dgoals');

    h.auth = { isLoaded: true, isSignedIn: true };
    renderLogin({
      pathname: '/login',
      state: { from: '/assistant?section=goals' },
    });
    expect(screen.getByText('Assistant route')).toBeInTheDocument();
  });

  it('rejects an external return target', () => {
    renderLogin({ pathname: '/login', state: { from: '//example.invalid' } });
    expect(h.signInProps.fallbackRedirectUrl).toBe('/home');
  });

  it.each(['/\\example.invalid', '/login/', '/LOGIN'])(
    'rejects unsafe return target %s',
    (from) => {
      renderLogin({ pathname: '/login', state: { from } });
      expect(h.signInProps.fallbackRedirectUrl).toBe('/home');
    }
  );
});
