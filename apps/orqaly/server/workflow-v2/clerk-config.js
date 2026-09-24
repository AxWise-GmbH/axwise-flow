// A service verifies one Clerk instance only. Deployment selection is explicit;
// neither the Host header nor an unverified token can select credentials.
export function validateClerkKeyEnvironment(environment = process.env) {
  const target = environment.ORQALY_ENVIRONMENT;
  // Existing local/test entrypoints without a declared deployment remain valid.
  if (!target || target === 'test' || target === 'local') return;
  if (!['preview', 'production'].includes(target)) {
    throw new Error('ORQALY_ENVIRONMENT must be preview or production for Clerk configuration');
  }
  const keyMode = target === 'production' ? 'live' : 'test';
  for (const [name, prefix] of [
    ['CLERK_PUBLISHABLE_KEY', `pk_${keyMode}_`],
    ['CLERK_SECRET_KEY', `sk_${keyMode}_`],
  ]) {
    if (!environment[name]?.startsWith(prefix)) {
      throw new Error(`${name} must use ${prefix} for ${target}`);
    }
  }
}
