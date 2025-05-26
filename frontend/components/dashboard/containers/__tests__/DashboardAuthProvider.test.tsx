'use client';

import React from 'react';
import { render, screen } from '@testing-library/react';
import { DashboardAuthProvider, DashboardAuthContext } from '../DashboardAuthProvider';
import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { vi } from 'vitest';

// Mock Clerk's useAuth hook
const mockUseAuth = vi.fn();
vi.mock('@clerk/nextjs', () => ({
  useAuth: mockUseAuth
}));

// Mock Next.js navigation
const mockPush = vi.fn();
const mockUseRouter = vi.fn(() => ({ push: mockPush }));
vi.mock('next/navigation', () => ({
  useRouter: mockUseRouter
}));

describe('DashboardAuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render a loading state when auth is not loaded', () => {
    // Mock auth loading state
    vi.mocked(mockUseAuth).mockReturnValue({
      isLoaded: false,
      userId: null
    });

    render(
      <DashboardAuthProvider>
        <div>Child Content</div>
      </DashboardAuthProvider>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should render children and provide auth context when authenticated', () => {
    // Mock authenticated state
    const mockUserId = 'user-123';
    vi.mocked(mockUseAuth).mockReturnValue({
      isLoaded: true,
      userId: mockUserId
    });

    // Create test component that consumes the auth context
    const TestComponent = (): JSX.Element => { // Add return type
      const { userId, isAuthenticated } = React.useContext(DashboardAuthContext);
      return (
        <div>
          <span data-testid="user-id">{userId}</span>
          <span data-testid="is-authenticated">{isAuthenticated.toString()}</span>
        </div>
      );
    };

    render(
      <DashboardAuthProvider>
        <TestComponent />
      </DashboardAuthProvider>
    );

    expect(screen.getByTestId('user-id')).toHaveTextContent(mockUserId);
    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('true');
  });

  it('should redirect to sign-in when not authenticated', () => {
    // Mock unauthenticated state
    vi.mocked(mockUseAuth).mockReturnValue({
      isLoaded: true,
      userId: null
    });

    render(
      <DashboardAuthProvider>
        <div>Protected Content</div>
      </DashboardAuthProvider>
    );

    // Should redirect to sign-in
    expect(mockPush).toHaveBeenCalledWith('/sign-in');
  });
});
