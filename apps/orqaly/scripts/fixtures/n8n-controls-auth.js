export function useAuth() {
  return { userId: 'synthetic-owner', orgId: null, getToken: async () => 'synthetic-ui-only' };
}
