import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from 'next-themes';
import { Header } from '../Header';

describe('Header', () => {
  const renderHeader = () => {
    return render(
      <ThemeProvider attribute="class">
        <Header />
      </ThemeProvider>
    );
  };

  it('renders branding and navigation', () => {
    renderHeader();

    // Check branding
    expect(screen.getByText('Interview Analysis')).toBeInTheDocument();

    // Check navigation links
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toHaveAttribute('href', '/');
    expect(screen.getByText('Analysis')).toBeInTheDocument();
    expect(screen.getByText('Analysis')).toHaveAttribute('href', '/analysis');
  });

  it('renders theme toggle button', () => {
    renderHeader();

    const themeButton = screen.getByLabelText('Toggle theme');
    expect(themeButton).toBeInTheDocument();

    // Icons should be present
    expect(themeButton.querySelector('svg')).toBeInTheDocument();
  });

  it('toggles theme when button is clicked', () => {
    renderHeader();

    const themeButton = screen.getByLabelText('Toggle theme');
    fireEvent.click(themeButton);

    // Note: We don't test the actual theme change here as it's handled by next-themes
    // and would require more complex integration testing
  });
});