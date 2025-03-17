'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from './theme-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  /**
   * Optional variant to specify different toggle styles
   */
  variant?: 'icon' | 'button';
  
  /**
   * Optional class name for custom styling
   */
  className?: string;
}

/**
 * ThemeToggle component provides a button to switch between light and dark themes
 * Enhanced with multiple variants and accessibility features
 */
export function ThemeToggle({
  variant = 'icon',
  className
}: ThemeToggleProps): JSX.Element {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleTheme();
    }
  };

  if (variant === 'button') {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={toggleTheme}
        onKeyDown={handleKeyDown}
        className={cn("transition-colors", className)}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        data-testid="theme-toggle-button"
      >
        {theme === 'dark' ? 'Light' : 'Dark'} Mode
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      onKeyDown={handleKeyDown}
      aria-label={`Toggle theme`}
      data-testid="theme-toggle"
      className={cn(className)}
    >
      <Sun
        className="h-5 w-5 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0"
        aria-hidden="true"
      />
      <Moon
        className="absolute h-5 w-5 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100"
        aria-hidden="true"
      />
      <span className="sr-only">
        Toggle {theme === 'dark' ? 'light' : 'dark'} mode
      </span>
    </Button>
  );
} 