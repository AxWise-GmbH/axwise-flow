/**
 * UnifiedDashboard Layout Component
 *
 * ARCHITECTURAL NOTE: This layout component removes Zustand dependencies by using
 * URL parameters for tab navigation instead of client-side state.
 *
 * Updated to make the main dashboard the visualization hub that shows the latest analysis.
 */

'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { FileText, BarChart3, MessageSquare, Users, FlaskConical, BookOpen, Upload, Clock, TrendingUp, History } from 'lucide-react';
import { cn } from '@/lib/utils';

import type { ReactNode } from 'react';

interface SubNavItem {
  href: string;
  label: string;
  active: boolean;
}

interface NavItem {
  href: string;
  label: string;
  icon: any;
  active: boolean;
  subItems?: SubNavItem[];
}

function NavigationContent({ children }: { children: ReactNode }): JSX.Element {
  // Get the current path to determine active nav item
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Get current visualization tab from URL params
  const currentTab = searchParams.get('visualizationTab');

  // Navigation items (following logical workflow order)
  const navItems: NavItem[] = [
    {
      href: '/unified-dashboard',
      label: 'Dashboard',
      icon: BarChart3,
      active: pathname === '/unified-dashboard'
    },
    {
      href: '/unified-dashboard/research-chat',
      label: 'Research Chat',
      icon: MessageSquare,
      active: pathname === '/unified-dashboard/research-chat'
    },
    {
      href: '/unified-dashboard/research-chat-history',
      label: 'Research History',
      icon: History,
      active: pathname === '/unified-dashboard/research-chat-history'
    },
    {
      href: '/unified-dashboard/research',
      label: 'Interview Simulation',
      icon: FlaskConical,
      active: pathname === '/unified-dashboard/research'
    },
    {
      href: '/unified-dashboard/simulation-history',
      label: 'Interview Simulation History',
      icon: FlaskConical,
      active: pathname?.includes('/simulation-history')
    },
    {
      href: '/unified-dashboard/upload',
      label: 'Analyse Interviews',
      icon: Upload,
      active: pathname?.includes('/upload') || (pathname === '/unified-dashboard' && currentTab && searchParams.get('analysisId')),
      subItems: [
        {
          href: '/unified-dashboard/analysis-history',
          label: 'Visualize Results',
          active: pathname === '/unified-dashboard' && currentTab && searchParams.get('analysisId')
        }
      ]
    },
    {
      href: '/unified-dashboard/analysis-history',
      label: 'Analyse Interview History',
      icon: Users,
      active: pathname?.includes('/analysis-history')
    },
    {
      href: '/unified-dashboard/history',
      label: 'Activity History',
      icon: Clock,
      active: pathname?.includes('/history')
    },
    {
      href: '/unified-dashboard/documentation',
      label: 'Documentation',
      icon: BookOpen,
      active: pathname?.includes('/documentation')
    }
  ];

  return (
    <div className="flex h-screen bg-background">
      {/* Left Sidebar */}
      <div className="w-64 bg-muted/30 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold">Dashboard</h2>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                    item.active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>

                {/* Sub-items */}
                {item.subItems && item.active && (
                  <div className="ml-6 mt-1 space-y-1">
                    {item.subItems.map((subItem) => (
                      <Link
                        key={subItem.href}
                        href={subItem.href}
                        className={cn(
                          "block px-3 py-1 rounded-md text-xs transition-colors",
                          subItem.active
                            ? "bg-primary/20 text-primary font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        )}
                      >
                        {subItem.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function UnifiedDashboardLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return (
    <Suspense fallback={
      <div className="flex h-screen bg-background">
        <div className="w-64 bg-muted/30 border-r border-border flex flex-col">
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-semibold">Dashboard</h2>
          </div>
          <div className="flex-1 p-4">
            <div className="text-muted-foreground">Loading navigation...</div>
          </div>
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    }>
      <NavigationContent>{children}</NavigationContent>
    </Suspense>
  );
}
