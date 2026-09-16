import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useAuth as useClerkAuth,
  useClerk,
  useUser as useClerkUser,
} from '@clerk/react';
import {
  AUTH_PIN_STORAGE_KEY,
  DOCUMENTATION_PIN_STORAGE_KEY,
  PERMISSIONS_PIN_STORAGE_KEY,
} from '../config/pinAccess';
import { resetActiveBusinessModules } from '../hooks/useActiveBusinessModules';
import { resetHiddenPagesSync } from '../hooks/useHiddenPages';
import { resetSimpleModeSync } from '../hooks/useSimpleMode';
import { resetGoalSetup } from '../hooks/useGoalSetup';
import { clearOpenGoalId } from '../hooks/useOpenGoal';
import { clearReportClientData } from '../services/reportService';
import { createWorkflowV2Client } from '../workflow-v2/api';

/**
 * Drop per-user client state that would otherwise survive a sign-out or an
 * in-place account switch (these hooks keep module-level singletons, so without
 * this the next user inherits the previous one's nav and modules until reload).
 *
 * This is the only global choke point: the login pages call some of these
 * already, but they cannot catch session expiry, a tab crash, or an OAuth
 * redirect. Must not fire on a same-uid token refresh — that happens hourly.
 */
function resetPerUserClientState() {
  resetActiveBusinessModules();
  resetHiddenPagesSync();
  resetSimpleModeSync();
  resetGoalSetup();
  clearOpenGoalId();
  clearReportClientData();
}

const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}

// Kept outside the provider so React Strict Mode remounts do not look like an
// account switch. `undefined` means Clerk has not resolved for the first time.
let lastResolvedClerkUserId;

function mapClerkUser(clerkUser) {
  if (!clerkUser) return null;

  const email =
    clerkUser.primaryEmailAddress?.emailAddress ||
    clerkUser.emailAddresses?.[0]?.emailAddress ||
    null;
  const displayName =
    clerkUser.fullName ||
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') ||
    email?.split('@')[0] ||
    'User';
  const metadata = {
    ...(clerkUser.publicMetadata || {}),
    ...(clerkUser.unsafeMetadata || {}),
    display_name: displayName,
    full_name: displayName,
    avatar_url: clerkUser.imageUrl || null,
  };

  // `uid`, `displayName`, and `photoURL` preserve the legacy context contract.
  // `id` and `user_metadata` cover callers that previously consumed a raw
  // Supabase user. Both IDs now contain the canonical Clerk user ID.
  return {
    id: clerkUser.id,
    uid: clerkUser.id,
    email,
    displayName,
    fullName: displayName,
    firstName: clerkUser.firstName || null,
    lastName: clerkUser.lastName || null,
    name: displayName,
    photoURL: clerkUser.imageUrl || null,
    imageUrl: clerkUser.imageUrl || null,
    user_metadata: metadata,
    publicMetadata: clerkUser.publicMetadata || {},
    unsafeMetadata: clerkUser.unsafeMetadata || {},
    clerkUser,
  };
}

export function AuthProvider({ children }) {
  const {
    isLoaded: isAuthLoaded,
    isSignedIn,
    getToken,
    signOut: clerkSignOut,
  } = useClerkAuth();
  const { isLoaded: isUserLoaded, user: clerkUser } = useClerkUser();
  const { openSignIn, openSignUp } = useClerk();
  const [workspaceSession, setWorkspaceSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState(null);
  const sessionRequestVersion = useRef(0);

  const loading = !isAuthLoaded || !isUserLoaded;
  const user = useMemo(() => {
    if (loading) return undefined;
    if (!isSignedIn) return null;
    return mapClerkUser(clerkUser);
  }, [clerkUser, isSignedIn, loading]);

  const refreshSession = useCallback(async () => {
    const expectedUserId = user?.uid;
    if (loading || isSignedIn !== true || !expectedUserId) {
      sessionRequestVersion.current += 1;
      setWorkspaceSession(null);
      setSessionLoading(false);
      setSessionError(null);
      return null;
    }

    const requestVersion = ++sessionRequestVersion.current;
    setWorkspaceSession(null);
    setSessionLoading(true);
    setSessionError(null);

    try {
      const response = await createWorkflowV2Client(getToken).session();
      const receivedSession = response?.session;
      if (
        receivedSession?.userId !== expectedUserId ||
        receivedSession?.tenantBound !== true
      ) {
        const error = new Error('workspace session did not match the signed-in user');
        error.code = 'INVALID_SESSION';
        throw error;
      }
      if (requestVersion !== sessionRequestVersion.current) return null;

      // Keep the browser contract deliberately smaller than the server payload:
      // no tenant UUID, Clerk organization, token claims, or profile data.
      const nextSession = { userId: expectedUserId, tenantBound: true };
      setWorkspaceSession(nextSession);
      setSessionLoading(false);
      return nextSession;
    } catch (error) {
      if (requestVersion !== sessionRequestVersion.current) return null;
      setWorkspaceSession(null);
      setSessionLoading(false);
      setSessionError(error);
      return null;
    }
  }, [getToken, isSignedIn, loading, user?.uid]);

  useEffect(() => {
    if (loading || isSignedIn !== true || !user?.uid) {
      sessionRequestVersion.current += 1;
      setWorkspaceSession(null);
      setSessionLoading(false);
      setSessionError(null);
      return undefined;
    }

    void refreshSession();
    return () => {
      sessionRequestVersion.current += 1;
    };
  }, [isSignedIn, loading, refreshSession, user?.uid]);

  useEffect(() => {
    if (loading) return;

    const incomingUserId = user?.uid || null;
    const identityChanged =
      lastResolvedClerkUserId !== undefined && lastResolvedClerkUserId !== incomingUserId;

    lastResolvedClerkUserId = incomingUserId;
    if (identityChanged) resetPerUserClientState();
  }, [loading, user?.uid]);

  // Compatibility methods for legacy consumers. Credential entry belongs to
  // Clerk's hosted components; passwords are deliberately not handled here.
  const login = useCallback(
    async (email) => {
      openSignIn({
        initialValues: email ? { emailAddress: String(email).trim() } : undefined,
        fallbackRedirectUrl: '/home',
      });
      return null;
    },
    [openSignIn]
  );

  const register = useCallback(
    async (email, _password, displayName) => {
      const nameParts = String(displayName || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      openSignUp({
        initialValues: {
          ...(email ? { emailAddress: String(email).trim() } : {}),
          ...(nameParts[0] ? { firstName: nameParts[0] } : {}),
          ...(nameParts.length > 1 ? { lastName: nameParts.slice(1).join(' ') } : {}),
        },
        fallbackRedirectUrl: '/home',
      });
      return null;
    },
    [openSignUp]
  );

  const loginWithGoogle = useCallback(async () => {
    openSignIn({ fallbackRedirectUrl: '/home' });
    return null;
  }, [openSignIn]);

  const logout = useCallback(async () => {
    try {
      await clerkSignOut({ redirectUrl: '/login' });
    } finally {
      try {
        window.sessionStorage.removeItem(AUTH_PIN_STORAGE_KEY);
        window.sessionStorage.removeItem(PERMISSIONS_PIN_STORAGE_KEY);
        window.sessionStorage.removeItem(DOCUMENTATION_PIN_STORAGE_KEY);
      } catch {
        // Storage can be unavailable in privacy-restricted browsers.
      }
      resetPerUserClientState();
    }
  }, [clerkSignOut]);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      loginWithGoogle,
      logout,
      getToken,
      workspaceSession,
      tenantBound: workspaceSession?.tenantBound === true,
      sessionLoading,
      sessionError,
      refreshSession,
      isAuthenticated: !loading && isSignedIn === true,
    }),
    [
      getToken,
      isSignedIn,
      loading,
      login,
      loginWithGoogle,
      logout,
      refreshSession,
      register,
      sessionError,
      sessionLoading,
      user,
      workspaceSession,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
