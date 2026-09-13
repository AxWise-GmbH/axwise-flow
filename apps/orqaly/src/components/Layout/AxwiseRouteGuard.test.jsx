/**
 * Tests for AxwiseRouteGuard - redirects AxWise-only routes when loaded &&
 * !isAxwiseEnabled; otherwise renders children. While loading, children render
 * (avoids spinner loops, pages degrade to empty).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const axwiseState = { loaded: false, isAxwiseEnabled: false };
vi.mock('../../hooks/useAxwise', () => ({
  useAxwise: () => axwiseState,
}));

import AxwiseRouteGuard from './AxwiseRouteGuard';

describe('AxwiseRouteGuard', () => {
  beforeEach(() => {
    axwiseState.loaded = false;
    axwiseState.isAxwiseEnabled = false;
  });

  function renderGuarded(initialPath = '/axwise-analytics') {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="/axwise-analytics"
            element={
              <AxwiseRouteGuard>
                <div data-testid="axwise-page">AxWise Analytics</div>
              </AxwiseRouteGuard>
            }
          />
          <Route path="/home" element={<div data-testid="home-page">Home</div>} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('renders children when isAxwiseEnabled=true (loaded)', () => {
    axwiseState.loaded = true;
    axwiseState.isAxwiseEnabled = true;
    renderGuarded();
    expect(screen.getByTestId('axwise-page')).toBeTruthy();
    expect(screen.queryByTestId('home-page')).toBeNull();
  });

  it('redirects to /home when loaded && !isAxwiseEnabled', () => {
    axwiseState.loaded = true;
    axwiseState.isAxwiseEnabled = false;
    renderGuarded();
    expect(screen.queryByTestId('axwise-page')).toBeNull();
    expect(screen.getByTestId('home-page')).toBeTruthy();
  });

  it('renders children when NOT loaded (loaded=false) even if isAxwiseEnabled=false', () => {
    axwiseState.loaded = false;
    axwiseState.isAxwiseEnabled = false;
    renderGuarded();
    // Still shows the page - we don't redirect until we know for sure.
    expect(screen.getByTestId('axwise-page')).toBeTruthy();
    expect(screen.queryByTestId('home-page')).toBeNull();
  });

  it('respects a custom redirectTo prop', () => {
    axwiseState.loaded = true;
    axwiseState.isAxwiseEnabled = false;
    render(
      <MemoryRouter initialEntries={['/axwise-analytics']}>
        <Routes>
          <Route
            path="/axwise-analytics"
            element={
              <AxwiseRouteGuard redirectTo="/data">
                <div data-testid="axwise-page">AxWise Analytics</div>
              </AxwiseRouteGuard>
            }
          />
          <Route path="/data" element={<div data-testid="data-page">Data</div>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.queryByTestId('axwise-page')).toBeNull();
    expect(screen.getByTestId('data-page')).toBeTruthy();
  });
});
