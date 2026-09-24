import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GcpAuthPage from './GcpAuthPage';

const clerk = vi.hoisted(() => ({ auth: {} }));
vi.mock('@clerk/react', () => ({
  useAuth: () => clerk.auth,
  SignIn: ({ fallbackRedirectUrl, signUpUrl, routing }) => <div data-testid="sign-in" data-return={fallbackRedirectUrl} data-switch={signUpUrl} data-routing={routing} />,
  SignUp: ({ fallbackRedirectUrl, signInUrl, routing }) => <div data-testid="sign-up" data-return={fallbackRedirectUrl} data-switch={signInUrl} data-routing={routing} />,
}));
beforeEach(() => { clerk.auth = { isLoaded: true, isSignedIn: false }; });
function show(path = '/login', mode = 'login') {
  render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/login" element={<GcpAuthPage mode={mode} />} />
    <Route path="/account" element={<h1>Account target</h1>} />
  </Routes></MemoryRouter>);
}

describe('account website authentication entry', () => {
  it('waits for Clerk without showing an incorrect sign-in state', () => {
    clerk.auth = { isLoaded: false, isSignedIn: undefined };
    show();
    expect(screen.getByLabelText('Loading authentication')).toBeInTheDocument();
    expect(screen.queryByTestId('sign-in')).not.toBeInTheDocument();
  });

  it.each([['login', 'sign-in', '/signup'], ['signup', 'sign-up', '/login']])
  ('defaults %s to the account page with local hash routing', (mode, testId, otherEntry) => {
    show('/login', mode);
    expect(screen.getByTestId(testId)).toHaveAttribute('data-return', '/account');
    expect(screen.getByTestId(testId)).toHaveAttribute('data-routing', 'hash');
    expect(screen.getByTestId(testId)).toHaveAttribute('data-switch', `${otherEntry}?returnTo=%2Faccount`);
    expect(screen.getByText(/Conversations, tools and results are in the Orqanix desktop app/)).toBeInTheDocument();
  });

  it.each(['https://evil.example/path', '//evil.example/path', '/login', '/signup', '/auth/callback'])
  ('rejects an external or recursive return target: %s', (returnTo) => {
    show(`/login?${new URLSearchParams({ returnTo })}`);
    expect(screen.getByTestId('sign-in')).toHaveAttribute('data-return', '/account');
  });

  it('preserves a same-origin return path including its query and fragment', () => {
    show(`/login?${new URLSearchParams({ returnTo: '/account?source=desktop#profile' })}`);
    expect(screen.getByTestId('sign-in')).toHaveAttribute('data-return', '/account?source=desktop#profile');
  });

  it('redirects an existing signed-in account without rendering another sign-in form', () => {
    clerk.auth.isSignedIn = true;
    show();
    expect(screen.getByRole('heading', { name: 'Account target' })).toBeInTheDocument();
    expect(screen.queryByTestId('sign-in')).not.toBeInTheDocument();
  });
});
