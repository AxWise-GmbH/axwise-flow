'use client';

import { Moon, Sun, LogOut } from 'lucide-react';
import { useTheme } from 'next-themes';
import { UserProfile } from '../user-profile';
import { useClerk, SignedIn } from '@clerk/nextjs';
import Link from 'next/link';
import { LogoHorizontal, LogoDark } from '@/components/icons';
import { Button } from '@/components/ui/button';

/**
 * Application header component containing theme controls and user authentication
 * Navigation links have been temporarily removed as they were not working properly
 */
export function Header(): JSX.Element {
  const { theme, setTheme } = useTheme();
  const { signOut } = useClerk();

  const toggleTheme = (): void => { // Add return type
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const handleSignOut = (): void => { // Add return type
    signOut(() => {
      window.location.href = '/sign-in';
    });
  };

  return (
    <header className="border-b">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        {/* Logo/Branding */}
        <div className="flex items-center">
          <Link href="/" className="flex items-center">
            <LogoHorizontal
              width={150}
              height={40}
              className="dark:hidden"
            />
            <LogoDark
              width={150}
              height={40}
              className="hidden dark:block"
            />
          </Link>
        </div>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center space-x-6">
          <Link
            href="/unified-dashboard"
            className="text-sm font-medium transition-colors hover:text-primary"
          >
            Dashboard
          </Link>
          <Link
            href="/pricing"
            className="text-sm font-medium transition-colors hover:text-primary"
          >
            Pricing
          </Link>
          <Link
            href="/contact.html"
            className="text-sm font-medium transition-colors hover:text-primary"
          >
            Contact Us
          </Link>
        </nav>

        {/* Right side: User profile and theme toggle */}
        <div className="flex items-center space-x-4">
          <UserProfile />

          <SignedIn>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="flex items-center gap-1"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden md:inline">Logout</span>
            </Button>
          </SignedIn>

          {/* Theme Toggle */}
          <button
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 w-10"
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" data-testid="sun-icon" /> {/* Add testid */}
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" data-testid="moon-icon" /> {/* Add testid */}
          </button>
        </div>
      </div>
    </header>
  );
}

export default Header;
