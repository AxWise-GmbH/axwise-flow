import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  auth: {
    isLoaded: true,
    isSignedIn: false,
    getToken: vi.fn(),
    signOut: vi.fn(async () => {}),
  },
  clerkUser: {
    isLoaded: true,
    user: null,
  },
  openSignIn: vi.fn(),
  openSignUp: vi.fn(),
  resetModules: vi.fn(),
  resetHidden: vi.fn(),
  resetSimple: vi.fn(),
  resetGoal: vi.fn(),
  clearGoal: vi.fn(),
  clearReports: vi.fn(),
  workspaceSession: vi.fn(),
  createWorkflowClient: vi.fn(),
}));

h.createWorkflowClient.mockImplementation(() => ({ session: h.workspaceSession }));

vi.mock('@clerk/react', () => ({
  useAuth: () => h.auth,
  useUser: () => h.clerkUser,
  useClerk: () => ({ openSignIn: h.openSignIn, openSignUp: h.openSignUp }),
}));
vi.mock('../hooks/useActiveBusinessModules', () => ({
  resetActiveBusinessModules: h.resetModules,
}));
vi.mock('../hooks/useHiddenPages', () => ({ resetHiddenPagesSync: h.resetHidden }));
vi.mock('../hooks/useSimpleMode', () => ({ resetSimpleModeSync: h.resetSimple }));
vi.mock('../hooks/useGoalSetup', () => ({ resetGoalSetup: h.resetGoal }));
vi.mock('../hooks/useOpenGoal', () => ({ clearOpenGoalId: h.clearGoal }));
vi.mock('../services/reportService', () => ({ clearReportClientData: h.clearReports }));
vi.mock('../workflow-v2/api', () => ({ createWorkflowV2Client: h.createWorkflowClient }));

function clerkUser(id, email, name = 'Test User') {
  return {
    id,
    fullName: name,
    firstName: name.split(' ')[0],
    lastName: name.split(' ').slice(1).join(' '),
    imageUrl: `https://images.example/${id}.png`,
    primaryEmailAddress: { emailAddress: email },
    emailAddresses: [{ emailAddress: email }],
    publicMetadata: { plan: 'pro' },
    unsafeMetadata: {},
  };
}

async function mountProvider() {
  vi.resetModules();
  const authModule = await import('./AuthContext.jsx');
  let current;

  function CaptureAuth() {
    current = authModule.useAuth();
    return null;
  }

  const tree = () => (
    <authModule.AuthProvider>
      <CaptureAuth />
    </authModule.AuthProvider>
  );
  let view;
  await act(async () => {
    view = render(tree());
  });

  return {
    get value() {
      return current;
    },
    rerender() {
      view.rerender(tree());
    },
  };
}

function setSignedIn(user) {
  h.auth.isLoaded = true;
  h.auth.isSignedIn = true;
  h.clerkUser.isLoaded = true;
  h.clerkUser.user = user;
}

function setSignedOut() {
  h.auth.isLoaded = true;
  h.auth.isSignedIn = false;
  h.clerkUser.isLoaded = true;
  h.clerkUser.user = null;
}

beforeEach(() => {
  setSignedOut();
  vi.clearAllMocks();
  h.workspaceSession.mockReset();
  h.workspaceSession.mockImplementation(() => new Promise(() => {}));
  window.sessionStorage.clear();
});

describe('Clerk-backed AuthContext', () => {
  it('does not bootstrap a workspace session before Clerk resolves signed-in', async () => {
    h.auth.isLoaded = false;
    h.auth.isSignedIn = undefined;
    h.clerkUser.isLoaded = false;
    const provider = await mountProvider();

    expect(h.createWorkflowClient).not.toHaveBeenCalled();
    expect(provider.value.workspaceSession).toBeNull();
    expect(provider.value.tenantBound).toBe(false);
    expect(provider.value.sessionLoading).toBe(false);
  });

  it('bootstraps and exposes only the personal workspace session after Clerk sign-in', async () => {
    setSignedIn(clerkUser('user_123', 'person@example.com'));
    h.workspaceSession.mockResolvedValue({
      session: {
        userId: 'user_123',
        tenantBound: true,
        tenantId: 'must-not-enter-context',
        organizationId: 'org_mustnotpropagate',
      },
    });

    const provider = await mountProvider();

    await waitFor(() => expect(provider.value.sessionLoading).toBe(false));
    expect(h.createWorkflowClient).toHaveBeenCalledWith(h.auth.getToken);
    expect(h.workspaceSession).toHaveBeenCalledOnce();
    expect(provider.value.workspaceSession).toEqual({
      userId: 'user_123',
      tenantBound: true,
    });
    expect(provider.value.tenantBound).toBe(true);
    expect(provider.value.sessionError).toBeNull();
  });

  it('keeps Clerk authentication intact when workspace bootstrap fails', async () => {
    setSignedIn(clerkUser('user_unbound', 'person@example.com'));
    const error = Object.assign(new Error('identity has no tenant'), {
      status: 403,
      code: 'TENANT_NOT_BOUND',
    });
    h.workspaceSession.mockRejectedValue(error);

    const provider = await mountProvider();

    await waitFor(() => expect(provider.value.sessionError).toBe(error));
    expect(provider.value.loading).toBe(false);
    expect(provider.value.isAuthenticated).toBe(true);
    expect(provider.value.user.uid).toBe('user_unbound');
    expect(provider.value.workspaceSession).toBeNull();
    expect(provider.value.tenantBound).toBe(false);

    h.workspaceSession.mockResolvedValueOnce({
      session: { userId: 'user_unbound', tenantBound: true },
    });
    await act(async () => {
      await provider.value.refreshSession();
    });
    expect(provider.value.workspaceSession).toEqual({
      userId: 'user_unbound',
      tenantBound: true,
    });
    expect(provider.value.sessionError).toBeNull();
  });

  it('ignores a stale workspace response after a Clerk account switch', async () => {
    let resolveFirstSession;
    h.workspaceSession
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstSession = resolve;
          })
      )
      .mockResolvedValueOnce({ session: { userId: 'user_b', tenantBound: true } });
    setSignedIn(clerkUser('user_a', 'a@example.com'));
    const provider = await mountProvider();

    await act(async () => {
      setSignedIn(clerkUser('user_b', 'b@example.com'));
      provider.rerender();
    });
    await waitFor(() => expect(provider.value.workspaceSession?.userId).toBe('user_b'));

    await act(async () => {
      resolveFirstSession({ session: { userId: 'user_a', tenantBound: true } });
    });

    expect(provider.value.workspaceSession).toEqual({ userId: 'user_b', tenantBound: true });
    expect(provider.value.sessionError).toBeNull();
  });

  it('maps the Clerk user into the legacy user shape', async () => {
    setSignedIn(clerkUser('user_123', 'person@example.com', 'Person Example'));
    const provider = await mountProvider();

    expect(provider.value.loading).toBe(false);
    expect(provider.value.isAuthenticated).toBe(true);
    expect(provider.value.user).toMatchObject({
      id: 'user_123',
      uid: 'user_123',
      email: 'person@example.com',
      displayName: 'Person Example',
      photoURL: 'https://images.example/user_123.png',
      user_metadata: {
        display_name: 'Person Example',
        plan: 'pro',
      },
    });
    expect(provider.value.getToken).toBe(h.auth.getToken);
  });

  it('does not clear per-user state on the first Clerk resolution or a same-user refresh', async () => {
    setSignedIn(clerkUser('user_a', 'a@example.com'));
    const provider = await mountProvider();

    await act(async () => {
      h.clerkUser.user = clerkUser('user_a', 'a@example.com', 'Updated Name');
      provider.rerender();
    });

    expect(h.resetModules).not.toHaveBeenCalled();
  });

  it('clears every per-user cache when Clerk switches accounts', async () => {
    setSignedIn(clerkUser('user_a', 'a@example.com'));
    const provider = await mountProvider();

    await act(async () => {
      setSignedIn(clerkUser('user_b', 'b@example.com'));
      provider.rerender();
    });

    expect(h.resetModules).toHaveBeenCalledTimes(1);
    expect(h.resetHidden).toHaveBeenCalledTimes(1);
    expect(h.resetSimple).toHaveBeenCalledTimes(1);
    expect(h.resetGoal).toHaveBeenCalledTimes(1);
    expect(h.clearGoal).toHaveBeenCalledTimes(1);
    expect(h.clearReports).toHaveBeenCalledTimes(1);
  });

  it('clears per-user state on Clerk sign-out', async () => {
    setSignedIn(clerkUser('user_a', 'a@example.com'));
    h.workspaceSession.mockResolvedValue({
      session: { userId: 'user_a', tenantBound: true },
    });
    const provider = await mountProvider();

    expect(provider.value.tenantBound).toBe(true);

    await act(async () => {
      setSignedOut();
      provider.rerender();
    });

    expect(h.resetModules).toHaveBeenCalledTimes(1);
    expect(provider.value.user).toBeNull();
    expect(provider.value.isAuthenticated).toBe(false);
    expect(provider.value.workspaceSession).toBeNull();
    expect(provider.value.tenantBound).toBe(false);
    expect(provider.value.sessionLoading).toBe(false);
    expect(provider.value.sessionError).toBeNull();
  });

  it('delegates legacy login and registration entry points to Clerk', async () => {
    const provider = await mountProvider();

    await act(async () => {
      await provider.value.login(' person@example.com ', 'ignored');
      await provider.value.register('new@example.com', 'ignored', 'New Person');
      await provider.value.loginWithGoogle();
    });

    expect(h.openSignIn).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        initialValues: { emailAddress: 'person@example.com' },
        fallbackRedirectUrl: '/home',
      })
    );
    expect(h.openSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        initialValues: {
          emailAddress: 'new@example.com',
          firstName: 'New',
          lastName: 'Person',
        },
      })
    );
    expect(h.openSignIn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ fallbackRedirectUrl: '/home' })
    );
  });

  it('signs out with Clerk and removes obsolete PIN state', async () => {
    const provider = await mountProvider();
    window.sessionStorage.setItem('orch_pin_access_granted', '1');
    window.sessionStorage.setItem('orch_permissions_pin_granted', '1');
    window.sessionStorage.setItem('orch_documentation_pin_granted', '1');

    await act(async () => {
      await provider.value.logout();
    });

    expect(h.auth.signOut).toHaveBeenCalledWith({ redirectUrl: '/login' });
    expect(window.sessionStorage.getItem('orch_pin_access_granted')).toBeNull();
    expect(window.sessionStorage.getItem('orch_permissions_pin_granted')).toBeNull();
    expect(window.sessionStorage.getItem('orch_documentation_pin_granted')).toBeNull();
  });
});
