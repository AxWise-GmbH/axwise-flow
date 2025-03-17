'use client';

import { render, screen } from '@testing-library/react';
import UnifiedDashboardContainer from '../UnifiedDashboardContainer';
import { vi } from 'vitest';

// Mock the container components
vi.mock('../containers/DashboardAuthProvider', () => ({
  DashboardAuthProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-provider">{children}</div>
  )
}));

vi.mock('../containers/DashboardDataProvider', () => ({
  DashboardDataProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="data-provider">{children}</div>
  )
}));

vi.mock('../containers/DashboardTabsContainer', () => ({
  DashboardTabsContainer: () => (
    <div data-testid="tabs-container">Tabs Container</div>
  )
}));

describe('UnifiedDashboardContainer', () => {
  it('renders the dashboard with all providers and containers', () => {
    render(<UnifiedDashboardContainer />);
    
    // Verify the auth provider is rendered
    expect(screen.getByTestId('auth-provider')).toBeInTheDocument();
    
    // Verify the data provider is rendered
    expect(screen.getByTestId('data-provider')).toBeInTheDocument();
    
    // Verify the tabs container is rendered
    expect(screen.getByTestId('tabs-container')).toBeInTheDocument();
    
    // Verify the dashboard title is rendered
    expect(screen.getByText('Interview Analysis Dashboard')).toBeInTheDocument();
  });
});
