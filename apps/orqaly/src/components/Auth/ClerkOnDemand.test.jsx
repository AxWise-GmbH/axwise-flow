import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { transferableAbortController } from 'node:util';
import { act, cleanup, render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import ClerkOnDemand from './ClerkOnDemand';
import { needsClerk } from './needsClerk';

// Stand-in provider: it only marks where Clerk would be running.
vi.mock('@clerk/react', () => ({
  ClerkProvider: ({ children, publishableKey }) => (
    <div data-testid="clerk" data-key={publishableKey}>
      {children}
    </div>
  ),
}));

// React Router's data router builds a real Node Request; its signal must come from the same
// realm as that Request (the same fix as AssistantWorkflowNavigationGuard.test.jsx).
function stubNodeAbortController() {
  vi.stubGlobal(
    'AbortController',
    class {
      constructor() {
        return transferableAbortController();
      }
    }
  );
}

beforeEach(stubNodeAbortController);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(path) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <p>Landing</p> },
      { path: '/instant/*', element: <p>Instant page</p> },
      { path: '/login', element: <p>Sign in</p> },
      { path: '/home', element: <p>App</p> },
    ],
    { initialEntries: [path] }
  );
  render(
    <ClerkOnDemand router={router} clerkProps={{ publishableKey: 'pk_test' }}>
      <RouterProvider router={router} />
    </ClerkOnDemand>
  );
  return router;
}

describe('needsClerk', () => {
  it.each([
    '/',
    '/classic',
    '/standart',
    '/instant',
    '/instant/features',
    '/instant/legal/eu/privacy',
    '/privacy',
    '/terms',
    '/cookies',
  ])('keeps sign-in off %s', (path) => {
    expect(needsClerk(path)).toBe(false);
  });

  it.each(['/login', '/signup', '/home', '/assistant', '/settings', '/instantly', '/pricing'])(
    'starts sign-in on %s',
    (path) => {
      expect(needsClerk(path)).toBe(true);
    }
  );
});

describe('ClerkOnDemand', () => {
  it('loads no Clerk on the landing and legal pages', () => {
    const router = renderAt('/');
    expect(screen.getByText('Landing')).toBeInTheDocument();
    expect(screen.queryByTestId('clerk')).toBeNull();
    act(() => {
      router.navigate('/instant/legal');
    });
    expect(screen.getByText('Instant page')).toBeInTheDocument();
    expect(screen.queryByTestId('clerk')).toBeNull();
  });

  it('starts Clerk the moment a page needs it, and keeps it', async () => {
    const router = renderAt('/');
    await act(async () => {
      await router.navigate('/login');
    });
    expect(screen.getByTestId('clerk')).toContainElement(screen.getByText('Sign in'));
    await act(async () => {
      await router.navigate('/');
    });
    expect(screen.getByTestId('clerk')).toContainElement(screen.getByText('Landing'));
  });

  it('starts Clerk at once when the first page needs it', () => {
    renderAt('/home');
    expect(screen.getByTestId('clerk')).toHaveAttribute('data-key', 'pk_test');
    expect(screen.getByTestId('clerk')).toContainElement(screen.getByText('App'));
  });
});
