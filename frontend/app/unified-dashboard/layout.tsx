/**
 * UnifiedDashboard Layout Component
 * 
 * ARCHITECTURAL NOTE: This layout component removes Zustand dependencies by using
 * URL parameters for tab navigation instead of client-side state.
 */

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Link from 'next/link';

export default function UnifiedDashboardLayout({
  children,
  searchParams,
}: {
  children: React.ReactNode;
  searchParams?: { tab?: string; analysisId?: string };
}) {
  // Default to 'upload' if no tab is specified
  const activeTab = searchParams?.tab || 'upload';
  const analysisId = searchParams?.analysisId || '';
  
  return (
    <div className="w-full">
      <Tabs value={activeTab} className="w-full">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="upload" asChild>
            <Link href="/unified-dashboard/upload">Upload</Link>
          </TabsTrigger>
          
          <TabsTrigger value="visualize" asChild>
            <Link 
              href={`/unified-dashboard/visualize${analysisId ? `?analysisId=${analysisId}` : ''}`}
            >
              Visualize
            </Link>
          </TabsTrigger>
          
          <TabsTrigger value="history" asChild>
            <Link href="/unified-dashboard/history">History</Link>
          </TabsTrigger>
          
          <TabsTrigger value="documentation" asChild>
            <Link href="/unified-dashboard/documentation">Documentation</Link>
          </TabsTrigger>
        </TabsList>
        
        <div className="mt-6">
          {children}
        </div>
      </Tabs>
    </div>
  );
} 