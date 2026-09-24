import { StrictMode } from 'react';
import { transferableAbortController } from 'node:util';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GcpApp from './GcpApp';
import { gcpRouter, retiredAppPaths } from './account-routes';

const clerk = vi.hoisted(() => ({ auth: {}, signOut: vi.fn(), openUserProfile: vi.fn() }));
vi.mock('@clerk/react', async () => {
  const { createContext, useContext } = await import('react');
  const Context = createContext(null);
  function useTestAuth() {
    if (!useContext(Context)) throw new Error('Clerk route rendered outside its provider');
    return clerk.auth;
  }
  function Form({ kind, fallbackRedirectUrl, signInUrl, signUpUrl }) {
    useTestAuth();
    return <div data-testid={kind} data-return-to={fallbackRedirectUrl} data-other-entry={signInUrl || signUpUrl}>{kind}</div>;
  }
  return {
    ClerkProvider: ({ children }) => <Context.Provider value={{}}><div data-testid="clerk-provider">{children}</div></Context.Provider>,
    useAuth: useTestAuth,
    useUser: () => ({ ...useTestAuth(), user: { primaryEmailAddress: { emailAddress: 'owner@example.com' } } }),
    useClerk: () => { useTestAuth(); return { signOut: clerk.signOut, openUserProfile: clerk.openUserProfile }; },
    SignIn: (props) => <Form kind="sign-in" {...props} />,
    SignUp: (props) => <Form kind="sign-up" {...props} />,
  };
});
vi.mock('./pages/Landing/LandingPageInstant.jsx', () => ({ default: () => <h1>Public landing</h1> }));
vi.mock('./pages/Landing/LandingPageSimple.jsx', () => ({ default: () => <h1>Classic landing</h1> }));
vi.mock('./pages/Landing/instant/pages/products/InstantProductPage.jsx', () => ({ default: () => <h1>Public product</h1> }));

beforeEach(() => {
  clerk.auth = { isLoaded: true, isSignedIn: true, userId: 'user-one' };
  vi.stubGlobal('AbortController', class { constructor() { return transferableAbortController(); } });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
afterAll(() => { gcpRouter.dispose(); });

async function renderAt(path) {
  await gcpRouter.navigate(path);
  render(<StrictMode><GcpApp clerkProps={{ publishableKey: 'pk_live_fixture' }} /></StrictMode>);
}

describe('account-only production router', () => {
  it('keeps the landing public and mounts Clerk before account hooks during StrictMode navigation', async () => {
    await renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Public landing' })).toBeInTheDocument();
    expect(screen.queryByTestId('clerk-provider')).not.toBeInTheDocument();
    await act(async () => { await gcpRouter.navigate('/account'); });
    const account = await screen.findByRole('heading', { name: 'Your Orqanix account' });
    expect(screen.getByTestId('clerk-provider')).toContainElement(account);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('mounts Clerk before login hooks when entering from a public page', async () => {
    clerk.auth.isSignedIn = false;
    await renderAt('/');
    await screen.findByRole('heading', { name: 'Public landing' });
    await act(async () => { await gcpRouter.navigate('/login'); });
    expect(screen.getByTestId('clerk-provider')).toContainElement(screen.getByTestId('sign-in'));
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['/privacy', '/terms', '/cookies'])('keeps the published legal placeholder public: %s', async (path) => {
    await renderAt(path);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByTestId('clerk-provider')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the product route public', async () => {
    await renderAt('/instant/products/axwise');
    expect(await screen.findByRole('heading', { name: 'Public product' })).toBeInTheDocument();
    expect(screen.queryByTestId('clerk-provider')).not.toBeInTheDocument();
  });

  it('waits for authentication before showing account content', async () => {
    clerk.auth = { isLoaded: false, isSignedIn: undefined };
    await renderAt('/account');
    expect(screen.getByLabelText('Loading authentication')).toBeInTheDocument();
    expect(screen.queryByText('owner@example.com')).not.toBeInTheDocument();
  });

  it('sends a signed-out visitor to login with the complete account return path', async () => {
    clerk.auth.isSignedIn = false;
    await renderAt('/account?source=desktop#profile');
    expect(await screen.findByTestId('sign-in')).toHaveAttribute('data-return-to', '/account?source=desktop#profile');
    expect(gcpRouter.state.location.pathname).toBe('/login');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['/login', '/signup'])('returns a signed-in visitor from %s to the account page', async (path) => {
    await renderAt(path);
    expect(await screen.findByRole('heading', { name: 'Your Orqanix account' })).toBeInTheDocument();
    expect(gcpRouter.state.location.pathname).toBe('/account');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['/sign-in', '/login', 'sign-in'],
    ['/sign-up', '/signup', 'sign-up'],
  ])('preserves auth alias return query and hash: %s', async (alias, target, form) => {
    clerk.auth.isSignedIn = false;
    await renderAt(`${alias}?returnTo=%2Faccount%3Fsource%3Ddesktop#verification`);
    expect(await screen.findByTestId(form)).toHaveAttribute('data-return-to', '/account?source=desktop');
    expect(gcpRouter.state.location.pathname).toBe(target);
    expect(gcpRouter.state.location.hash).toBe('#verification');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(retiredAppPaths)('redirects retired workspace path %s without loading its API', async (path) => {
    await renderAt(path.replace('/*', '/example'));
    expect(await screen.findByRole('heading', { name: 'Your Orqanix account' })).toBeInTheDocument();
    expect(gcpRouter.state.location.pathname).toBe('/account');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not expose the unpublished legal center', async () => {
    await renderAt('/instant/legal/eu/privacy');
    expect(screen.getByRole('heading', { name: 'This page is not available.' })).toBeInTheDocument();
    expect(screen.queryByTestId('clerk-provider')).not.toBeInTheDocument();
  });
});
