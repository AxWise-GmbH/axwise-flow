/*
 * The landing, the product pages and the Legal Center never need sign-in, so Clerk (its
 * script, cookies and browser storage) does not start on them. See ClerkOnDemand.jsx.
 */
const WITHOUT_SIGN_IN =
  /^\/(?:$|classic\/?$|standart\/?$|instant(?:\/.*)?$|privacy\/?$|terms\/?$|cookies\/?$)/;

export function needsClerk(pathname) {
  return !WITHOUT_SIGN_IN.test(pathname);
}
