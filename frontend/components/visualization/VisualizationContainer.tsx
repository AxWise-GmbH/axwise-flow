/**
 * VisualizationContainer Component
 * 
 * This is a wrapper component that integrates the DashboardVisualizationContainer
 * with the refactored VisualizationTabs component.
 * 
 * It's designed as a drop-in replacement for the existing VisualizationTabs component
 * to facilitate gradual migration.
 */

'use client';

import React from 'react';
import DashboardVisualizationContainer from './DashboardVisualizationContainer';
import VisualizationTabsRefactored from './VisualizationTabs.refactored';

interface VisualizationContainerProps {
  analysisId?: string;
}

/**
 * VisualizationContainer Component
 * Drop-in replacement for the existing VisualizationTabs component
 */
export default function VisualizationContainer({ analysisId }: VisualizationContainerProps) {
  return (
    <DashboardVisualizationContainer analysisId={analysisId}>
      <VisualizationTabsRefactored analysisId={analysisId} />
    </DashboardVisualizationContainer>
  );
}
