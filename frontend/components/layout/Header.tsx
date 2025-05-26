'use client';

import { Moon, Sun, Menu, X } from 'lucide-react';
import { useTheme } from 'next-themes';
import { UserProfile } from '../user-profile';
import Link from 'next/link';
import { LogoHorizontal, LogoDark } from '@/components/icons';
import { useState } from 'react';
import { trackNavigation, trackButtonClick, ButtonLocation } from '@/lib/analytics';
import { usePathname } from 'next/navigation';

/**
 * Application header component containing theme controls and user authentication
 * Navigation links have been temporarily removed as they were not working properly
 */
export function Header(): JSX.Element {
  const { theme, setTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

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
    <header className="border-b">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        {/* Logo/Branding */}
        <div className="flex items-center">
          <Link href="/" className="flex items-center">
            <LogoHorizontal
              width={225}
              height={60}
              className="dark:hidden"
            />
            <LogoDark
              width={225}
              height={60}
              className="hidden dark:block"
            />
          </Link>
        </div>

        {/* Right side: Navigation, User profile and theme toggle */}
        <div className="flex items-center space-x-4">
          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-6">
            <Link
              href="/unified-dashboard"
              className="text-sm font-medium text-foreground no-underline transition-all duration-300 ease-in-out hover:text-primary"
              onClick={() => {
                try {
                  trackNavigation('Dashboard', pathname, '/unified-dashboard', ButtonLocation.HEADER);
                } catch (error) {
                  console.warn('Analytics tracking failed:', error);
                }
              }}
            >
              Dashboard
            </Link>

            <Link
              href="/pricing"
              className="text-sm font-medium text-foreground no-underline transition-all duration-300 ease-in-out hover:text-primary"
              onClick={() => {
                try {
                  trackNavigation('Pricing', pathname, '/pricing', ButtonLocation.HEADER);
                } catch (error) {
                  console.warn('Analytics tracking failed:', error);
                }
              }}
            >
              Pricing
            </Link>
            <Link
              href="/contact"
              className="text-sm font-medium text-foreground no-underline transition-all duration-300 ease-in-out hover:text-primary"
              onClick={() => {
                try {
                  trackNavigation('Contact Us', pathname, '/contact', ButtonLocation.HEADER);
                } catch (error) {
                  console.warn('Analytics tracking failed:', error);
                }
              }}
            >
              Contact Us
            </Link>
          </nav>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 w-10"
            onClick={toggleMobileMenu}
            aria-label="Toggle mobile menu"
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>

          <UserProfile />

          {/* Theme Toggle */}
          <button
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 w-10"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            <Sun className="h-5 w-5 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" data-testid="sun-icon" aria-hidden="true" />
            <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" data-testid="moon-icon" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t bg-background">
          <nav className="container mx-auto px-4 py-4 flex flex-col space-y-4">
            <Link
              href="/unified-dashboard"
              className="text-sm font-medium text-foreground no-underline transition-all duration-300 ease-in-out hover:text-primary"
              onClick={() => {
                try {
                  trackNavigation('Dashboard', pathname, '/unified-dashboard', ButtonLocation.MOBILE_MENU);
                } catch (error) {
                  console.warn('Analytics tracking failed:', error);
                }
                closeMobileMenu();
              }}
            >
              Dashboard
            </Link>

            <Link
              href="/pricing"
              className="text-sm font-medium text-foreground no-underline transition-all duration-300 ease-in-out hover:text-primary"
              onClick={() => {
                try {
                  trackNavigation('Pricing', pathname, '/pricing', ButtonLocation.MOBILE_MENU);
                } catch (error) {
                  console.warn('Analytics tracking failed:', error);
                }
                closeMobileMenu();
              }}
            >
              Pricing
            </Link>
            <Link
              href="/contact"
              className="text-sm font-medium text-foreground no-underline transition-all duration-300 ease-in-out hover:text-primary"
              onClick={() => {
                try {
                  trackNavigation('Contact Us', pathname, '/contact', ButtonLocation.MOBILE_MENU);
                } catch (error) {
                  console.warn('Analytics tracking failed:', error);
                }
                closeMobileMenu();
              }}
            >
              Contact Us
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

export default Header;
