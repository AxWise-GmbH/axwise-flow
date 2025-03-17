'use client';

import { DashboardAuthProvider } from './containers/DashboardAuthProvider';
import { DashboardDataProvider } from './containers/DashboardDataProvider';
import { DashboardTabsContainer } from './containers/DashboardTabsContainer';

/**
 * Main container component for the unified dashboard
 * This component now follows Single Responsibility Principle and orchestrates:
 * - Authentication via DashboardAuthProvider
 * - Data management via DashboardDataProvider
 * - UI and tab management via DashboardTabsContainer
 */
const UnifiedDashboardContainer = () => {
  return (
    <DashboardAuthProvider>
      <DashboardDataProvider>
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold mb-6">Interview Analysis Dashboard</h1>
          <DashboardTabsContainer />
        </div>
      </DashboardDataProvider>
    </DashboardAuthProvider>
  );
};

export default UnifiedDashboardContainer;
