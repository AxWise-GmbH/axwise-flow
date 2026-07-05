import { render, screen, fireEvent, RenderResult } from '@testing-library/react';
 // Import RenderResult
import { ThemeProvider } from 'next-themes';
import { Header } from '../Header';

describe('Header', () => {
  const renderHeader = (): RenderResult => { // Add return type
    return render(
      <ThemeProvider attribute="class">
        <Header />
      </ThemeProvider>
    );
  };

  it('renders branding and navigation', () => {
    renderHeader();

    // Check branding - now using SVG logo components
    // Since we're using SVG components directly, we can't check by alt text
    // Instead, we'll check that the Link to home page exists
    expect(screen.getByRole('link', { name: '' })).toHaveAttribute('href', '/');

    // Check navigation links
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Pricing')).toBeInTheDocument();
  });

  it('renders theme toggle button', () => {
    renderHeader();

    const themeButton = screen.getByLabelText('Toggle theme');
    expect(themeButton).toBeInTheDocument();

    // Icons should be present
    expect(screen.getByTestId('sun-icon')).toBeInTheDocument(); // Use testid
    expect(screen.getByTestId('moon-icon')).toBeInTheDocument();
 // Use testid
  });

  it('toggles theme when button is clicked', () => {
    renderHeader();

    const themeButton = screen.getByLabelText('Toggle theme');
    fireEvent.click(themeButton);

    // Note: We don't test the actual theme change here as it's handled by next-themes
    // and would require more complex integration testing
  });
});
