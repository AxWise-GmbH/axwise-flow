'use client';

import { Moon, Sun, Menu, X, BookOpen, GitBranch } from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { useState, useEffect } from 'react';

/**
 * Clean application header component for AxWise
 */
export function Header(): JSX.Element {
  const { theme, setTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const toggleTheme = (): void => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const toggleMobileMenu = (): void => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = (): void => {
    setIsMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-4 lg:px-8 py-3.5 flex items-center justify-between">
        {/* Logo/Branding */}
        <div className="flex items-center">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <svg width="24" height="24" viewBox="0 0 24 24" style={{ verticalAlign: 'middle' }}>
              <rect width="24" height="24" rx="6" fill="#000" stroke="#333" strokeWidth="1"/>
              <path d="M12 5L18.062 8.5V15.5L12 19L5.938 15.5V8.5L12 5Z" stroke="#fff" strokeWidth="2" fill="none" strokeLinejoin="round"/>
              <circle cx="12" cy="12" r="1.5" fill="#fff"/>
            </svg>
            <span className="font-serif font-bold text-lg tracking-tight text-foreground">AxWise</span>
          </Link>
        </div>

        {/* Right side: Navigation & Theme toggle */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          <nav className="hidden sm:flex items-center space-x-4">
            <a
              href="https://github.com/AxWise-GmbH/axwise-flow"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-xs font-mono text-muted-foreground hover:text-foreground hover:border-foreground transition-all"
            >
              <GitBranch className="w-3.5 h-3.5" />
              Apache 2.0 OSS
            </a>
            <Link
              href="/docs"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-foreground text-background hover:bg-foreground/90 rounded-md text-xs font-medium tracking-tight transition-all"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Documentation
            </Link>
          </nav>

          {/* Theme Toggle */}
          <button
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:bg-accent hover:text-accent-foreground h-9 w-9"
            onClick={toggleTheme}
            suppressHydrationWarning
            aria-label={mounted ? `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode` : 'Toggle theme'}
            title={mounted ? `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode` : 'Toggle theme'}
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" data-testid="sun-icon" aria-hidden="true" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" data-testid="moon-icon" aria-hidden="true" />
          </button>

          {/* Mobile Menu Button */}
          <button
            className="sm:hidden inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring h-9 w-9"
            onClick={toggleMobileMenu}
            aria-label="Toggle mobile menu"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {isMobileMenuOpen && (
        <div className="sm:hidden border-t bg-background px-4 py-3 space-y-2">
          <Link
            href="/docs"
            className="flex items-center gap-2 py-2 text-sm font-medium text-foreground hover:text-primary"
            onClick={closeMobileMenu}
          >
            <BookOpen className="w-4 h-4" />
            Documentation
          </Link>
          <a
            href="https://github.com/AxWise-GmbH/axwise-flow"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={closeMobileMenu}
          >
            <GitBranch className="w-4 h-4" />
            GitHub Repository
          </a>
        </div>
      )}
    </header>
  );
}

export default Header;
