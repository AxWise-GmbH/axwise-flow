'use client';

import { useContext } from 'react';
import { useRouter } from 'next/navigation';
import DashboardTabs from '../DashboardTabs';
import { DashboardDataContext } from './DashboardDataProvider';

export const DashboardTabsContainer = () => {
  const { dashboardData, isLoading, error } = useContext(DashboardDataContext);
  const router = useRouter();
  
  // Show error state if we have an error
  if (error) {
    return (
      <div className="p-6 border border-red-200 bg-red-50 text-red-600 rounded-md">
        <h2 className="text-xl font-semibold mb-2">Error</h2>
        <p>{error}</p>
        <button 
          onClick={() => router.push('/unified-dashboard')}
          className="mt-4 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-md transition-colors"
        >
          Go Back
        </button>
      </div>
    );
  }
  
  return (
    <>
      <DashboardTabs dashboardData={dashboardData} />
      
      {isLoading && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-center">Loading analysis data...</p>
          </div>
        </div>
      )}
    </>
  );
}; 