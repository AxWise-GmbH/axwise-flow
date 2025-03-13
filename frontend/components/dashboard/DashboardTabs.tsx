'use client';

import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import UploadTab from './UploadTab';
import VisualizationTab from './VisualizationTab';
import HistoryTab from './HistoryTab';
import DocumentationTab from './DocumentationTab';
import { DetailedAnalysisResult } from '@/types/api';

interface DashboardTabsProps {
  currentAnalysis: DetailedAnalysisResult | null;
}

/**
 * Main navigation tabs for the dashboard
 * Handles tab switching and URL state synchronization
 */
const DashboardTabs = ({ currentAnalysis }: DashboardTabsProps) => {
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
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
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
        <VisualizationTab results={currentAnalysis} />
      </TabsContent>
      
      <TabsContent value="history">
        <HistoryTab />
      </TabsContent>
      
      <TabsContent value="documentation">
        <DocumentationTab />
      </TabsContent>
    </Tabs>
  );
};

export default DashboardTabs;
