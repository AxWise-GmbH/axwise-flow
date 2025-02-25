import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from '../theme-toggle';
import { useTheme } from '@/components/providers/theme-provider';

// Mock the theme provider hook
jest.mock('@/components/providers/theme-provider', () => ({
  useTheme: jest.fn(),
}));

describe('ThemeToggle', () => {
  const mockSetTheme = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with light theme', () => {
    (useTheme as jest.Mock).mockImplementation(() => ({
      theme: 'light',
      setTheme: mockSetTheme,
    }));

    render(<ThemeToggle />);
    
    expect(screen.getByLabelText('Toggle theme')).toBeInTheDocument();
    expect(screen.getByText('Toggle dark mode')).toBeInTheDocument();
  });

  it('renders with dark theme', () => {
    (useTheme as jest.Mock).mockImplementation(() => ({
      theme: 'dark',
      setTheme: mockSetTheme,
    }));

    render(<ThemeToggle />);
    
    expect(screen.getByLabelText('Toggle theme')).toBeInTheDocument();
    expect(screen.getByText('Toggle light mode')).toBeInTheDocument();
  });

  it('toggles theme when clicked', async () => {
    (useTheme as jest.Mock).mockImplementation(() => ({
      theme: 'light',
      setTheme: mockSetTheme,
    }));

    render(<ThemeToggle />);
    
    const button = screen.getByRole('button');
    await userEvent.click(button);
    
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('handles theme toggle from dark to light', async () => {
    (useTheme as jest.Mock).mockImplementation(() => ({
      theme: 'dark',
      setTheme: mockSetTheme,
    }));

    render(<ThemeToggle />);
    
    const button = screen.getByRole('button');
    await userEvent.click(button);
    
    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  it('includes appropriate ARIA labels', () => {
    (useTheme as jest.Mock).mockImplementation(() => ({
      theme: 'light',
      setTheme: mockSetTheme,
    }));

    render(<ThemeToggle />);
    
    expect(screen.getByLabelText('Toggle theme')).toBeInTheDocument();
    expect(screen.getByTestId('theme-toggle')).toHaveAttribute('aria-label', 'Toggle theme');
  });
});