'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

/**
 * Application header component containing navigation and theme controls
 */
export function Header(): JSX.Element {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header className="border-b">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        {/* Logo/Branding */}
        <div className="flex items-center">
          <h1 className="text-xl font-semibold">
            Interview Analysis
          </h1>
        </div>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center space-x-6">
          <a href="/" className="text-foreground/80 hover:text-foreground">
            Dashboard
          </a>
          <a href="/analysis" className="text-foreground/80 hover:text-foreground">
            Analysis
          </a>
        </nav>

        {/* Theme Toggle */}
        <button
          className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 w-10"
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          <Sun className="h-5 w-5 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
        </button>
      </div>
    </header>
  );
}

export default Header;