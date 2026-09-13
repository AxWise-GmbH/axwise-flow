import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ModeRouteGuard from './ModeRouteGuard';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../../hooks/useSimpleMode', () => ({
  useSimpleMode: vi.fn(() => ({ simpleMode: true })),
}));

import { useSimpleMode } from '../../hooks/useSimpleMode';

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <ModeRouteGuard>
              <div data-testid="child">content</div>
            </ModeRouteGuard>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('ModeRouteGuard', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    useSimpleMode.mockReturnValue({ simpleMode: true });
  });

  it('allows simple users on /dashboard', async () => {
    renderAt('/dashboard');
    await waitFor(() => {
      expect(navigateMock).not.toHaveBeenCalled();
    });
  });

  it('redirects simple users from /partners to /dashboard', async () => {
    renderAt('/partners');
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/dashboard', { replace: true });
    });
  });

  it.each([
    '/job-pool',
    '/job-pool?tab=goals',
    '/my-agents',
    '/knowledge-base',
    '/workflow',
    '/task-manager',
    '/projects',
    '/dashboards',
    '/reports',
    '/communicator',
  ])('allows simple users on supported route %s', async (path) => {
    renderAt(path);
    await waitFor(() => {
      expect(navigateMock).not.toHaveBeenCalled();
    });
  });

  it.each(['/consilium', '/investments', '/tools', '/agent-hub'])(
    'allows simple users on Organizations action-tile route %s',
    async (path) => {
      renderAt(path);
      await waitFor(() => {
        expect(navigateMock).not.toHaveBeenCalled();
      });
    }
  );

  it('does not redirect advanced users on /dashboard', async () => {
    useSimpleMode.mockReturnValue({ simpleMode: false });
    renderAt('/dashboard');
    await waitFor(() => {
      expect(navigateMock).not.toHaveBeenCalled();
    });
  });
});
