import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AccountPage from './AccountPage';
import { DESKTOP_RELEASE } from '../Landing/simple/desktop-release';

const clerk = vi.hoisted(() => ({
  user: {},
  signOut: vi.fn(),
  openUserProfile: vi.fn(),
  getToken: vi.fn(),
  token: null,
}));
vi.mock('@clerk/react', () => ({
  useUser: () => clerk.user,
  useClerk: () => ({ signOut: clerk.signOut, openUserProfile: clerk.openUserProfile }),
  useAuth: () => ({ getToken: clerk.getToken }),
}));

beforeEach(() => {
  clerk.user = { isLoaded: true, isSignedIn: true, user: { primaryEmailAddress: { emailAddress: 'owner@example.com' } } };
  clerk.signOut.mockReset().mockResolvedValue(undefined);
  clerk.openUserProfile.mockReset();
  clerk.getToken.mockReset().mockImplementation(() => Promise.resolve(clerk.token));
  clerk.token = null;
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const show = () => render(<MemoryRouter><AccountPage /></MemoryRouter>);

describe('desktop account page', () => {
  it('waits for Clerk before showing account details', () => {
    clerk.user = { isLoaded: false, isSignedIn: undefined };
    show();
    expect(screen.getByLabelText('Loading account')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not expose account controls or details when signed out', () => {
    clerk.user.isSignedIn = false;
    show();
    expect(screen.queryByText('owner@example.com')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it('shows the existing release and clearly separates browser and desktop sessions', () => {
    show();
    expect(screen.getByRole('heading', { name: 'Your Orqanix account' })).toBeInTheDocument();
    expect(screen.getByText('owner@example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Download Orqanix/ })).toHaveAttribute('href', DESKTOP_RELEASE.url);
    expect(screen.getByText(/Cloud conversation sync is not enabled/)).toBeInTheDocument();
    expect(screen.getByText(/not Apple-notarized/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('handles accounts without a primary email', () => {
    clerk.user.user = {};
    show();
    expect(screen.getByText('Signed in')).toBeInTheDocument();
  });

  it('opens Clerk profile management without calling a legacy API', async () => {
    show();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Account security and profile' })); });
    expect(clerk.openUserProfile).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('signs out via Clerk and returns to the public landing', async () => {
    show();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign out' })); });
    expect(clerk.signOut).toHaveBeenCalledWith({ redirectUrl: '/' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('disables account actions while sign-out is pending and permits retry after failure', async () => {
    let reject;
    clerk.signOut.mockImplementationOnce(() => new Promise((resolve, fail) => { reject = fail; }));
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Account security and profile' })).toBeDisabled();
    await act(async () => { reject(new Error('internal provider details')); });
    expect(screen.getByRole('alert')).toHaveTextContent('The account action could not complete. Please try again.');
    expect(screen.queryByText('internal provider details')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign out' })); });
    expect(clerk.signOut).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports profile-opening failures without leaking provider details', async () => {
    clerk.openUserProfile.mockImplementationOnce(() => { throw new Error('provider details'); });
    show();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Account security and profile' })); });
    expect(screen.getByRole('alert')).toHaveTextContent('The account action could not complete. Please try again.');
    expect(screen.getByRole('button', { name: 'Account security and profile' })).toBeEnabled();
  });

  it('renders Cloud Gateway vs Local MCP / BYOK quota breakdown when usage data is loaded', async () => {
    clerk.token = 'active-token';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        spendUsd: 1.25,
        limitUsd: 5.0,
        isUnlimited: false,
        tokens: { total: 45000, cached: 32000, cacheHitRate: 71 },
        savingsUsd: 1.80,
      }),
    }));
    await act(async () => { show(); });
    expect(screen.getByText(/Cloud Gateway LLM Credits/)).toBeInTheDocument();
    expect(screen.getByText(/Local MCP \/ BYOK/)).toBeInTheDocument();
    expect(screen.getByText(/45,000 cloud tokens/)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.00 of cloud quota/)).toBeInTheDocument();
  });
});
