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
import { PersonaRelationshipNetwork } from './PersonaRelationshipNetwork';
import { PersonaConflictConsensusView } from './PersonaConflictConsensusView';
import { SimplePersonaList } from './SimplePersonaList';
import MultiStakeholderPersonasView from '../analysis/MultiStakeholderPersonasView';
import StakeholderNetworkVisualization from '../analysis/StakeholderNetworkVisualization';
import ConsensusConflictVisualization from '../analysis/ConsensusConflictVisualization';
import StakeholderIntelligenceView from '../analysis/StakeholderIntelligenceView';

interface PersonasTabContentProps {
  personas: Persona[];
  stakeholderIntelligence?: StakeholderIntelligence;
  isMultiStakeholder: boolean;
  resultId?: number; // For simplified persona API calls
}

export function PersonasTabContent({
  personas,
  stakeholderIntelligence,
  isMultiStakeholder,
  resultId
}: PersonasTabContentProps) {
  // Check if personas have stakeholder intelligence features
  const hasStakeholderFeatures = personas?.some(persona => persona.stakeholder_intelligence);

  // Single interview - use simplified personas view if resultId available, otherwise enhanced view
  if (!isMultiStakeholder) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Personas</h2>
          <div className="flex items-center space-x-2">
            <Badge variant="outline">
              {personas?.length || 0} {personas?.length === 1 ? 'Persona' : 'Personas'}
            </Badge>
            {hasStakeholderFeatures && (
              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                Enhanced
              </Badge>
            )}
            {resultId && (
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                Design Thinking
              </Badge>
            )}
          </div>
        </div>
        {resultId ? (
          <SimplePersonaList resultId={resultId} />
        ) : (
          <PersonaList personas={personas} />
        )}
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
        <TabsList className={`grid w-full mb-6 ${hasStakeholderFeatures ? 'grid-cols-5' : 'grid-cols-4'}`}>
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
          {hasStakeholderFeatures && (
            <TabsTrigger value="conflicts" className="flex items-center">
              <BarChart3 className="h-4 w-4 mr-2" />
              Conflicts
            </TabsTrigger>
          )}
          <TabsTrigger value="intelligence" className="flex items-center">
            <Eye className="h-4 w-4 mr-2" />
            Intelligence
          </TabsTrigger>
        </TabsList>

        {/* Personas Sub-tab - Default view */}
        <TabsContent value="personas" className="space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-700">Enhanced Personas</h3>
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="text-xs">
                <BarChart3 className="h-3 w-3 mr-1" />
                Enhanced with business context
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
            <h3 className="text-lg font-semibold text-gray-700">Persona Relationships</h3>
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

        {/* Enhanced Conflicts Sub-tab - Persona-based conflict analysis */}
        {hasStakeholderFeatures && (
          <TabsContent value="conflicts" className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-700">Persona Conflicts & Consensus</h3>
              <Badge variant="outline" className="text-xs">
                Enhanced persona analysis
              </Badge>
            </div>
            <PersonaConflictConsensusView personas={personas} />
          </TabsContent>
        )}

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
