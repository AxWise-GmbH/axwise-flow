import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '../theme-provider';
import { useTheme } from 'next-themes';

// Mock next-themes
jest.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: jest.fn(() => ({
    theme: 'light',
    setTheme: jest.fn(),
  })),
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

    expect(screen.getByTestId('current-theme')).toHaveTextContent('light');
  });

  it('allows theme changes', async () => {
    const mockSetTheme = jest.fn();
    (useTheme as jest.Mock).mockImplementation(() => ({
      theme: 'light',
      setTheme: mockSetTheme,
    }));

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const button = screen.getByRole('button');
    await act(async () => {
      await userEvent.click(button);
    });

    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('uses default theme from props', () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <TestComponent />
      </ThemeProvider>
    );

    expect(useTheme).toHaveBeenCalled();
  });
});