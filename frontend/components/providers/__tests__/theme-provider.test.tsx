import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, useTheme } from '../theme-provider';

// Create a mock for next-themes to avoid actual theme changes in test
jest.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe('ThemeProvider', () => {
  const TestComponent = () => {
    const { theme, setTheme } = useTheme();
    return (
      <div>
        <span data-testid="current-theme">{theme}</span>
        <button onClick={() => setTheme('dark')}>Toggle Theme</button>
      </div>
    );
  };

  it('provides theme context to children', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId('current-theme')).toHaveTextContent('system');
  });

  it('allows theme changes', async () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const button = screen.getByRole('button');
    await act(async () => {
      await userEvent.click(button);
    });

    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
  });

  it('uses default theme from props', () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
  });
  
  it('respects forcedTheme prop', () => {
    render(
      <ThemeProvider forcedTheme="dark">
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');

    // Try to change theme, but it should not change due to forcedTheme
    const button = screen.getByRole('button');
    act(() => {
      button.click();
    });

    // Should still show the forced theme
    expect(screen.getByTestId('current-theme')).toHaveTextContent('dark');
  });
});