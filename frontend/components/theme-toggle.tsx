import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/providers/theme-provider';
import { Button } from '@/components/ui/button';

/**
 * ThemeToggle component provides a button to switch between light and dark themes
 */
export function ThemeToggle(): JSX.Element {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label="Toggle theme"
      data-testid="theme-toggle"
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

export default ThemeToggle;