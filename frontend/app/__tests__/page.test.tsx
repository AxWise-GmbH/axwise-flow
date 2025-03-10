import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomePage from '../page';

// Mock the components used in HomePage
vi.mock('@/components/layout/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/FileUpload', () => ({
  FileUpload: () => <div data-testid="file-upload">File Upload Component</div>,
}));

// Mock Next.js redirect and useRouter
vi.mock('next/navigation', () => {
  return {
    redirect: vi.fn(),
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      refresh: vi.fn()
    }),
    useSearchParams: () => new URLSearchParams()
  };
});

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('smoke test - renders without crashing', () => {
    render(<HomePage />);
    // The test is considered passing if the render doesn't throw
  });
});