'use client';

import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Eye,
  Network,
  Activity,
  BarChart3
} from 'lucide-react';
import type {
  StakeholderIntelligence,
  DetailedAnalysisResult
} from '@/types/api';
import StakeholderIntelligenceView from '../analysis/StakeholderIntelligenceView';
import StakeholderNetworkVisualization from '../analysis/StakeholderNetworkVisualization';
import ConsensusConflictVisualization from '../analysis/ConsensusConflictVisualization';
import MultiStakeholderPersonasView from '../analysis/MultiStakeholderPersonasView';

interface StakeholderDynamicsDisplayProps {
  stakeholderIntelligence: StakeholderIntelligence;
  analysisData: DetailedAnalysisResult;
}

export function StakeholderDynamicsDisplay({
  stakeholderIntelligence,
  analysisData
}: StakeholderDynamicsDisplayProps) {
  return (
    <div className="space-y-6">
      {/* Enhanced Multi-Stakeholder Analysis */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">
            <Eye className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="network">
            <Network className="h-4 w-4 mr-2" />
            Network
          </TabsTrigger>
          <TabsTrigger value="consensus">
            <Activity className="h-4 w-4 mr-2" />
            Consensus/Conflict
          </TabsTrigger>
          <TabsTrigger value="personas">
            <BarChart3 className="h-4 w-4 mr-2" />
            Enhanced Personas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <StakeholderIntelligenceView stakeholderIntelligence={stakeholderIntelligence} />
        </TabsContent>

        <TabsContent value="network" className="space-y-6">
          <StakeholderNetworkVisualization stakeholderIntelligence={stakeholderIntelligence} />
        </TabsContent>

        <TabsContent value="consensus" className="space-y-6">
          <ConsensusConflictVisualization stakeholderIntelligence={stakeholderIntelligence} />
        </TabsContent>

        <TabsContent value="personas" className="space-y-6">
          <MultiStakeholderPersonasView
            personas={analysisData.personas || []}
            stakeholderIntelligence={stakeholderIntelligence}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
