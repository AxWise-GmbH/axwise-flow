'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { FileText, BarChart3, Clock, BookOpen, Shield, MessageSquare, Users, FlaskConical } from 'lucide-react';
import { useAdminAccess } from '@/hooks/use-admin-access';

/**
 * Client Component for Dashboard Navigation
 * Handles interactive elements and state changes using URL parameters
 */
export default function DashboardNav(): JSX.Element { // Add return type
  const router = useRouter();
  const pathname = usePathname();
  const [isHistory, setIsHistory] = useState(false);
  const { isAdmin, isLoading, user } = useAdminAccess();

  // Debug logging
  console.log('DashboardNav - Admin Access Debug:', {
    isAdmin,
    isLoading,
    userEmail: user?.primaryEmailAddress?.emailAddress,
    userRole: user?.publicMetadata?.role
  });

  // Keep track of current path for highlighting active tab
  useEffect(() => {
    setIsHistory(pathname?.includes('/history'));
  }, [pathname]);

  // Handle tab navigation with clean URL parameters
  const handleTabNavigation = (tab: string): void => { // Add return type
    // Add cache busting to ensure clean state
    const cacheBuster = Date.now();
    router.push(`/unified-dashboard?tab=${tab}&_=${cacheBuster}`);
  };

  return (
    <nav className="flex space-x-1 rounded-lg bg-muted p-1">
      {/* Upload Tab */}
      <button
        onClick={() => handleTabNavigation('upload')}
        className={`flex items-center px-3 py-2 text-sm rounded-md ${!isHistory && !pathname?.includes('visualize') && !pathname?.includes('documentation') && !pathname?.includes('research') ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
      >
        <FileText className="mr-2 h-4 w-4" />
        Upload
      </button>

      {/* Research Tab */}
      <Link
        href="/unified-dashboard/research"
        className={`flex items-center px-3 py-2 text-sm rounded-md ${pathname?.includes('research') ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
      >
        <MessageSquare className="mr-2 h-4 w-4" />
        Research
      </Link>

      {/* Visualize Tab */}
      <button
        onClick={() => handleTabNavigation('visualize')}
        className={`flex items-center px-3 py-2 text-sm rounded-md ${pathname?.includes('visualize') ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
      >
        <BarChart3 className="mr-2 h-4 w-4" />
        Visualize
      </button>

      {/* Research Helper Chat History Tab */}
      <Link
        href="/unified-dashboard/research-chat"
        className={`flex items-center px-3 py-2 text-sm rounded-md ${pathname?.includes('research-chat') ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
      >
        <MessageSquare className="mr-2 h-4 w-4" />
        Research Chat
      </Link>

      {/* Interview Analysis History Tab */}
      <Link
        href="/unified-dashboard/analysis-history"
        className={`flex items-center px-3 py-2 text-sm rounded-md ${pathname?.includes('analysis-history') ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
      >
        <Users className="mr-2 h-4 w-4" />
        Analysis
      </Link>

      {/* Simulated Interviews History Tab */}
      <Link
        href="/unified-dashboard/simulation-history"
        className={`flex items-center px-3 py-2 text-sm rounded-md ${pathname?.includes('simulation-history') ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
      >
        <FlaskConical className="mr-2 h-4 w-4" />
        Simulations
      </Link>

      {/* Documentation Tab */}
      <button
        onClick={() => handleTabNavigation('documentation')}
        className={`flex items-center px-3 py-2 text-sm rounded-md ${pathname?.includes('documentation') ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-background/50'}`}
      >
        <BookOpen className="mr-2 h-4 w-4" />
        Documentation
      </button>

      {/* Admin Tab - Only visible to admin users */}
      {!isLoading && isAdmin && (
        <Link
          href="/admin"
          className="flex items-center px-3 py-2 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-background/50 border-l border-border ml-2 pl-4"
        >
          <Shield className="mr-2 h-4 w-4" />
          Admin
        </Link>
      )}

      {/* Admin debug info */}
      {process.env.NODE_ENV === 'development' && user?.primaryEmailAddress?.emailAddress && (
        <div className="text-xs text-muted-foreground ml-4 p-2 bg-muted rounded">
          Admin Debug: isAdmin={isAdmin.toString()}, isLoading={isLoading.toString()}, email={user?.primaryEmailAddress?.emailAddress}
        </div>
      )}
    </nav>
  );
}
