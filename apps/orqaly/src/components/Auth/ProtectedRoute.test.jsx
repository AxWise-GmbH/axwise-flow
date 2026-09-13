import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ProtectedRoute from './ProtectedRoute';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false, loading: false }),
}));

vi.mock('../Common/Logo', () => ({ default: () => null }));

function LoginProbe() {
  const location = useLocation();
  return <div data-testid="return-to">{location.state?.from || 'missing'}</div>;
}

describe('ProtectedRoute', () => {
  it('preserves the requested path, query and hash for Clerk login', () => {
    render(
      <MemoryRouter initialEntries={['/assistant?section=goals#approval']}>
        <Routes>
          <Route
            path="/assistant"
            element={
              <ProtectedRoute>
                <div>Protected</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginProbe />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByTestId('return-to')).toHaveTextContent('/assistant?section=goals#approval');
  });
});
