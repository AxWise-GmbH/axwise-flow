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
      active: pathname?.includes('/upload') || (pathname === '/unified-dashboard' && !!currentTab && !!searchParams.get('analysisId')),
      subItems: [
        {
          href: '/unified-dashboard/analysis-history',
          label: 'Visualize Results',
          active: pathname === '/unified-dashboard' && !!currentTab && !!searchParams.get('analysisId')
        }
      ]
    },
    {
      href: '/unified-dashboard/analysis-history',
      label: 'Analyse Interview History',
      icon: Users,
      active: pathname?.includes('/analysis-history') || false
    },
    {
      href: '/unified-dashboard/history',
      label: 'Activity History',
      icon: Clock,
      active: pathname?.includes('/history') || false
    },
    {
      href: '/unified-dashboard/documentation',
      label: 'Documentation',
      icon: BookOpen,
      active: pathname?.includes('/documentation') || false
    }
  ];

  return (
    <div className="flex h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      {/* Left Sidebar - Glassmorphism Style */}
      <div className="w-72 flex flex-col border-r border-border/40 bg-background/60 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 sticky top-0 h-screen z-40">
        <div className="p-6 border-b border-border/40">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors">
              <BarChart3 className="h-5 w-5" />
            </div>
            <span className="font-bold text-lg tracking-tight">AxWise Flow</span>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-3 mt-2">
            Platform
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            // Separate items based on loose grouping logic if needed, 
            // but for now we render them in order.
            // We can add logic to add headers if we want to split "Platform" vs "History" etc.

            return (
              <div key={item.href} className="group">
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                    item.active
                      ? "bg-primary/10 text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className={cn("h-4 w-4 transition-colors", item.active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                  {item.label}
                  {item.active && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  )}
                </Link>

                {/* Sub-items with improved animation/indentation */}
                {item.subItems && (item.active || item.subItems.some(sub => sub.active)) && (
                  <div className="ml-9 mt-1 space-y-0.5 border-l border-border/40 pl-2">
                    {item.subItems.map((subItem) => (
                      <Link
                        key={subItem.href}
                        href={subItem.href}
                        className={cn(
                          "block px-3 py-1.5 rounded-md text-xs transition-colors",
                          subItem.active
                            ? "text-primary font-medium bg-primary/5"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
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

        {/* Sidebar Footer / User Profile snippet could go here */}
        <div className="p-4 border-t border-border/40 bg-muted/10">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-gray-100 to-gray-300 dark:from-gray-800 dark:to-gray-900 border border-border/50" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">User Account</p>
              <p className="text-xs text-muted-foreground truncate">Pro Plan</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Improved container */}
      <div className="flex-1 flex flex-col overflow-hidden bg-muted/10">
        <main className={cn(
          "flex-1 relative",
          pathname?.includes('/research-chat') ? "flex flex-col overflow-hidden p-0" : "overflow-auto p-8 lg:p-10"
        )}>
          {/* Subtle background decoration */}
          <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-background to-transparent pointer-events-none -z-10" />

          <div className={cn(
            "animate-in fade-in slide-in-from-bottom-2 duration-500",
            pathname?.includes('/research-chat')
              ? "flex-1 h-full w-full"
              : "max-w-7xl mx-auto space-y-8"
          )}>
            {children}
          </div>
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
