'use client';

import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Network,
  Activity,
  Eye,
  BarChart3
} from 'lucide-react';
import type {
  Persona,
  StakeholderIntelligence
} from '@/types/api';
import { PersonaList } from './PersonaList';
import MultiStakeholderPersonasView from '../analysis/MultiStakeholderPersonasView';
import StakeholderNetworkVisualization from '../analysis/StakeholderNetworkVisualization';
import ConsensusConflictVisualization from '../analysis/ConsensusConflictVisualization';
import StakeholderIntelligenceView from '../analysis/StakeholderIntelligenceView';

interface PersonasTabContentProps {
  personas: Persona[];
  stakeholderIntelligence?: StakeholderIntelligence;
  isMultiStakeholder: boolean;
}

export function PersonasTabContent({
  personas,
  stakeholderIntelligence,
  isMultiStakeholder
}: PersonasTabContentProps) {
  // Single interview - use standard personas view
  if (!isMultiStakeholder) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Personas</h2>
          <Badge variant="outline">
            {personas?.length || 0} {personas?.length === 1 ? 'Persona' : 'Personas'}
          </Badge>
        </div>
        <PersonaList personas={personas} />
      </div>
    );
  }

  // Multi-stakeholder interview - use embedded enhanced view
  const stakeholderCount = stakeholderIntelligence?.detected_stakeholders?.length || 0;

  return (
    <div className="space-y-6">
      {/* Header with stakeholder count */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <h2 className="text-2xl font-bold">Multi-Stakeholder Personas</h2>
          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
            <Users className="h-3 w-3 mr-1" />
            {stakeholderCount} Stakeholders
          </Badge>
        </div>
        <Badge variant="outline" className="text-green-700 bg-green-50">
          Enhanced Analysis
        </Badge>
      </div>

      {/* Embedded sub-tabs for multi-stakeholder content */}
      <Tabs defaultValue="personas" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="personas" className="flex items-center">
            <Users className="h-4 w-4 mr-2" />
            Personas
          </TabsTrigger>
          <TabsTrigger value="network" className="flex items-center">
            <Network className="h-4 w-4 mr-2" />
            Network
          </TabsTrigger>
          <TabsTrigger value="consensus" className="flex items-center">
            <Activity className="h-4 w-4 mr-2" />
            Consensus
          </TabsTrigger>
          <TabsTrigger value="intelligence" className="flex items-center">
            <Eye className="h-4 w-4 mr-2" />
            Intelligence
          </TabsTrigger>
        </TabsList>

        {/* Personas Sub-tab - Default view */}
        <TabsContent value="personas" className="space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-700">Stakeholder Personas</h3>
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="text-xs">
                <BarChart3 className="h-3 w-3 mr-1" />
                Enhanced with stakeholder context
              </Badge>
            </div>
          </div>
          <MultiStakeholderPersonasView
            personas={personas}
            stakeholderIntelligence={stakeholderIntelligence}
          />
        </TabsContent>

        {/* Network Sub-tab - Interactive stakeholder relationships */}
        <TabsContent value="network" className="space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-700">Stakeholder Network</h3>
            <Badge variant="outline" className="text-xs">
              Interactive visualization
            </Badge>
          </div>
          <StakeholderNetworkVisualization
            stakeholderIntelligence={stakeholderIntelligence}
            personas={personas}
          />
        </TabsContent>

        {/* Consensus Sub-tab - Agreement/conflict analysis */}
        <TabsContent value="consensus" className="space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-700">Consensus & Conflicts</h3>
            <Badge variant="outline" className="text-xs">
              Agreement analysis
            </Badge>
          </div>
          <ConsensusConflictVisualization
            stakeholderIntelligence={stakeholderIntelligence}
          />
        </TabsContent>

        {/* Intelligence Sub-tab - Comprehensive stakeholder intelligence */}
        <TabsContent value="intelligence" className="space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-700">Stakeholder Intelligence</h3>
            <Badge variant="outline" className="text-xs">
              Comprehensive analysis
            </Badge>
          </div>
          <StakeholderIntelligenceView
            stakeholderIntelligence={stakeholderIntelligence}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default PersonasTabContent;
