'use client';

import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import UploadTab from './UploadTab';
import VisualizationTabs from '@/components/visualization/VisualizationTabs';
import DashboardHistoryTab from './DashboardHistoryTab';
import DocumentationTab from './DocumentationTab';
import { DashboardData } from '@/types/api';

interface DashboardTabsProps {
  dashboardData: DashboardData | null;
}

/**
 * Main navigation tabs for the dashboard
 * Handles tab switching and URL state synchronization
 */
const DashboardTabs = ({ dashboardData }: DashboardTabsProps): JSX.Element => { // Add return type
  // State for active tab will be moved to a Zustand store in future improvement
  const [activeTab, setActiveTab] = useState<'upload' | 'visualize' | 'history' | 'documentation'>('upload');

  // Load initial state from URL
  useEffect(() => {
    // Only run on the client side
    if (typeof window !== 'undefined') {
      // Check for URL parameters
      const searchParams = new URLSearchParams(window.location.search);
      const tabParam = searchParams.get('tab');

      if (tabParam) {
        // Set the active tab based on URL parameter
        if (tabParam === 'history' || tabParam === 'documentation' || tabParam === 'visualize' || tabParam === 'upload') {
          setActiveTab(tabParam as 'upload' | 'visualize' | 'history' | 'documentation');
        }
      }
    }
  }, []);

  // Update URL when tabs change
  useEffect(() => {
    let isMounted = true;

    const updateTimer = setTimeout(() => {
      if (isMounted && typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        const currentTab = url.searchParams.get('tab');

        // Only update if needed
        if (currentTab !== activeTab) {
          url.searchParams.set('tab', activeTab);
          window.history.replaceState({}, '', url);
        }
      }
    }, 50);

    return () => {
      isMounted = false;
      clearTimeout(updateTimer);
    };
  }, [activeTab]);

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'upload' | 'visualize' | 'history' | 'documentation')} className="w-full"> {/* Use specific type */}
      <TabsList className="grid grid-cols-4 mb-8">
        <TabsTrigger value="upload">Upload</TabsTrigger>
        <TabsTrigger value="visualize">Visualize</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
        <TabsTrigger value="documentation">Documentation</TabsTrigger>
      </TabsList>

      <TabsContent value="upload">
        <UploadTab />
      </TabsContent>

      <TabsContent value="visualize">
        {dashboardData?.analysisId ? (
          <VisualizationTabs analysisId={dashboardData.analysisId} />
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No analysis selected. Please upload a file or select an analysis from history.
          </div>
        )}
      </TabsContent>

      <TabsContent value="history">
        <DashboardHistoryTab />
      </TabsContent>

      <TabsContent value="documentation">
        <DocumentationTab />
      </TabsContent>
    </Tabs>
  );
};

export default DashboardTabs;
