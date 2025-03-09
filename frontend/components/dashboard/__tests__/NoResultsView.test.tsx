'use client';

import { render, screen, fireEvent } from '@testing-library/react';
import { NoResultsView } from '../NoResultsView';
import { useRouter } from 'next/navigation';
import { vi } from 'vitest';

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn()
}));

describe('NoResultsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({
      push: vi.fn()
    });
  });

  it('renders the no results message', () => {
    render(<NoResultsView />);
    
    // Check that the component renders the expected message
    expect(screen.getByText(/no analysis results/i)).toBeInTheDocument();
    expect(screen.getByText(/you haven't analyzed any interview data yet/i)).toBeInTheDocument();
  });
  
  it('renders the FileQuestion icon', () => {
    render(<NoResultsView />);
    
    // Check that the component renders an icon (FileQuestion from Lucide)
    const icon = screen.getByText('', { selector: '.lucide-filequestion' });
    expect(icon).toBeInTheDocument();
  });

  it('navigates to upload tab when button is clicked', () => {
    const pushMock = vi.fn();
    (useRouter as any).mockReturnValue({
      push: pushMock
    });

    render(<NoResultsView />);
    
    // Click the Go to Upload button
    fireEvent.click(screen.getByRole('button', { name: /go to upload/i }));
    
    // Check that the router was called to navigate to upload tab
    expect(pushMock).toHaveBeenCalledWith('/unified-dashboard?tab=upload');
  });
});
