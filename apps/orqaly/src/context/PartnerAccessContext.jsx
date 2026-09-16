import { createContext, useContext, useMemo } from 'react';
import { useAuth } from './AuthContext';

const PartnerAccessContext = createContext(null);

export function usePartnerAccess() {
  const ctx = useContext(PartnerAccessContext);
  if (!ctx) throw new Error('usePartnerAccess must be used within PartnerAccessProvider');
  return ctx;
}

/** Optional hook that returns null if used outside provider (e.g. before mount). Use when Partner access is optional. */
export function usePartnerAccessOptional() {
  return useContext(PartnerAccessContext);
}

export function PartnerAccessProvider({ children }) {
  const { user, loading } = useAuth();

  // Clerk authenticates a personal user only. Until app-owned workspace roles
  // are served by the GCP API, preserve the owner UI experience without
  // loading the retired Supabase/local user directory. This value gates UI
  // presentation only; backend authorization must use the verified Clerk ID.
  const roleId = !loading && user?.uid ? 'role-super-admin' : null;
  const linkedPartnerId = null;
  const loaded = !loading;

  const value = useMemo(
    () => ({
      roleId,
      linkedPartnerId,
      isPartnerRole: roleId === 'role-partner',
      loaded,
    }),
    [roleId, linkedPartnerId, loaded]
  );

  return <PartnerAccessContext.Provider value={value}>{children}</PartnerAccessContext.Provider>;
}
