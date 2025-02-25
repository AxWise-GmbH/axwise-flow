import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'next-themes';
import { AppLayout } from '../AppLayout';

describe('AppLayout', () => {
  it('renders children and header', () => {
    render(
      <ThemeProvider attribute="class">
        <AppLayout>
          <div data-testid="test-content">Test Content</div>
        </AppLayout>
      </ThemeProvider>
    );

    // Check if header is rendered
    expect(screen.getByText('Interview Analysis')).toBeInTheDocument();
    
    // Check if navigation links are present
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Analysis')).toBeInTheDocument();
    
    // Check if theme toggle button is present
    expect(screen.getByLabelText('Toggle theme')).toBeInTheDocument();
    
    // Check if children are rendered
    expect(screen.getByTestId('test-content')).toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <ThemeProvider attribute="class">
        <AppLayout className="custom-class">
          <div>Content</div>
        </AppLayout>
      </ThemeProvider>
    );

    const main = screen.getByRole('main');
    expect(main).toHaveClass('custom-class');
  });
});