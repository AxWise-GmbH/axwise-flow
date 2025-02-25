import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotFound from '../not-found';

// Mock next/link
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href} data-testid="mock-link">
      {children}
    </a>
  ),
}));

describe('NotFound Page', () => {
  beforeEach(() => {
    // Mock window.history.back
    window.history.back = jest.fn();
  });

  it('renders 404 status code and message', () => {
    render(<NotFound />);
    
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('Page Not Found')).toBeInTheDocument();
  });

  it('displays explanatory message', () => {
    render(<NotFound />);
    
    expect(
      screen.getByText("The page you are looking for doesn't exist or has been moved.")
    ).toBeInTheDocument();
  });

  it('shows error code footer', () => {
    render(<NotFound />);
    expect(screen.getByText('Error Code: 404 | Page Not Found')).toBeInTheDocument();
  });

  it('renders FileQuestion icon', () => {
    render(<NotFound />);
    const icon = document.querySelector('svg');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass('h-12', 'w-12');
  });

  it('provides home navigation link', () => {
    render(<NotFound />);
    
    const homeLink = screen.getByTestId('mock-link');
    expect(homeLink).toHaveAttribute('href', '/');
    expect(screen.getByText('Go Home')).toBeInTheDocument();
  });

  it('provides back button that triggers history.back', async () => {
    render(<NotFound />);
    
    const backButton = screen.getByText('Go Back');
    await userEvent.click(backButton);
    
    expect(window.history.back).toHaveBeenCalled();
  });

  it('applies responsive styles to button container', () => {
    render(<NotFound />);
    
    const buttonContainer = screen.getByText('Go Home').closest('div');
    expect(buttonContainer).toHaveClass('flex-col', 'sm:flex-row');
  });

  it('maintains consistent button styling', () => {
    render(<NotFound />);
    
    const homeButton = screen.getByText('Go Home').closest('a');
    const backButton = screen.getByText('Go Back');

    expect(homeButton).toHaveClass('flex-1', 'sm:flex-initial');
    expect(backButton).toHaveClass('flex-1', 'sm:flex-initial');
  });

  it('centers content vertically and horizontally', () => {
    const { container } = render(<NotFound />);
    
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass(
      'min-h-screen',
      'flex',
      'items-center',
      'justify-center'
    );
  });

  it('maintains proper spacing between elements', () => {
    render(<NotFound />);
    
    const contentContainer = screen.getByText('404').closest('div');
    expect(contentContainer?.parentElement).toHaveClass('space-y-6');
  });
});