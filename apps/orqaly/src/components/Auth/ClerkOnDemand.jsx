import { useEffect, useState } from 'react';
import { ClerkProvider } from '@clerk/react';
import { needsClerk } from './needsClerk';

/**
 * The landing, the product pages and the Legal Center never need sign-in. Clerk's script sets
 * cookies and browser storage the moment it loads, so on those pages it does not load at all:
 * a first visit stores nothing and needs no cookie banner (the Cookies & Storage page says so).
 * Clerk starts once the visitor reaches any other page (sign-in, sign-up, the app) and then
 * stays, so signing in and moving around the app work as before.
 *
 * `router` is the app's data router: its subscribers hear a navigation in the same tick as the
 * router itself, so the new page is first drawn already inside ClerkProvider.
 */
export default function ClerkOnDemand({ router, clerkProps, children }) {
  const [on, setOn] = useState(() => needsClerk(router.state.location.pathname));

  useEffect(() => {
    if (on) return undefined;
    return router.subscribe((state) => {
      if (needsClerk(state.location.pathname)) setOn(true);
    });
  }, [on, router]);

  return on ? <ClerkProvider {...clerkProps}>{children}</ClerkProvider> : children;
}
