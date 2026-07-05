'use client';

import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BookOpen,
  MessageSquareMore,
  Search,
  Sparkles,
  Target,
  Network,
  Users,
  Cpu,
} from 'lucide-react';
import type { CallIntelligence, LocalIntelligence } from '@/lib/precall/types';
import { PrepTab } from './PrepTab';
import { OpenTab } from './OpenTab';
import { DiscoverTab } from './DiscoverTab';
import { ValueTab } from './ValueTab';
import { CloseTab } from './CloseTab';
import { MindMapTab } from './MindMapTab';
import { OrgChartTab } from './OrgChartTab';
import { TechStackTab } from './TechStackTab';

interface SalesWorkflowViewProps {
  intelligence: CallIntelligence;
  localIntelligence?: LocalIntelligence | null;
  activeStep?: string;
  onStepChange?: (step: string) => void;
  companyContext?: string;
  /** Time period for historical context (e.g., '1943-1945') */
  timePeriod?: string;
  /** Additional historical context (e.g., 'World War II Military Intelligence') */
  historicalContext?: string;
}

/**
 * 5-Step Sales Workflow View
 *
 * Organizes call intelligence by sales workflow phases:
 * 1. PREP - Pre-call preparation
 * 2. OPEN - Opening & rapport building
 * 3. DISCOVER - Discovery & exploration
 * 4. VALUE - Value presentation
 * 5. CLOSE - Objection handling & closing
 */
export function SalesWorkflowView({
  intelligence,
  localIntelligence,
  activeStep = 'prep',
  onStepChange,
  companyContext,
  timePeriod,
  historicalContext,
}: SalesWorkflowViewProps) {
  const workflowTabs = [
    {
      id: 'prep',
      label: 'Prep',
      icon: BookOpen,
      color: 'text-blue-600',
      bgColor: 'data-[state=active]:bg-blue-50',
    },
    {
      id: 'open',
      label: 'Open',
      icon: MessageSquareMore,
      color: 'text-green-600',
      bgColor: 'data-[state=active]:bg-green-50',
    },
    {
      id: 'discover',
      label: 'Discover',
      icon: Search,
      color: 'text-purple-600',
      bgColor: 'data-[state=active]:bg-purple-50',
    },
    {
      id: 'value',
      label: 'Value',
      icon: Sparkles,
      color: 'text-amber-600',
      bgColor: 'data-[state=active]:bg-amber-50',
    },
    {
      id: 'close',
      label: 'Close',
      icon: Target,
      color: 'text-red-600',
      bgColor: 'data-[state=active]:bg-red-50',
    },
  ];

  const insightTabs = [
    {
      id: 'mindmap',
      label: 'Mind Map',
      icon: Network,
      color: 'text-cyan-600',
      bgColor: 'data-[state=active]:bg-cyan-50',
    },
    {
      id: 'orgchart',
      label: 'Org Chart',
      icon: Users,
      color: 'text-indigo-600',
      bgColor: 'data-[state=active]:bg-indigo-50',
    },
    {
      id: 'techstack',
      label: 'Tech Stack',
      icon: Cpu,
      color: 'text-pink-600',
      bgColor: 'data-[state=active]:bg-pink-50',
    },
  ];

  return (
    <Tabs
      value={activeStep}
      onValueChange={onStepChange}
      className="h-full flex flex-col"
    >
      {/* Horizontal Tab Navigation */}
      <div className="border-b border-border/50 bg-white/30 dark:bg-slate-950/30 backdrop-blur-md px-4 sticker top-0 z-40">
        <TabsList className="h-16 w-full justify-between bg-transparent p-0">
          {/* Sales Workflow Tabs */}
          <div className="flex gap-2 items-end h-full">
            {workflowTabs.map((tab, index) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={`
                  gap-2 px-5 py-3 rounded-t-xl border-b-2 border-transparent transition-all duration-300
                  data-[state=active]:bg-white/60 dark:data-[state=active]:bg-slate-800/60 
                  data-[state=active]:backdrop-blur-sm data-[state=active]:border-b-current 
                  data-[state=active]:shadow-sm data-[state=active]:translate-y-[1px]
                  hover:bg-white/40 dark:hover:bg-slate-800/40
                  ${tab.bgColor}
                `}
              >
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/50 dark:bg-slate-900/50 text-[10px] font-bold shadow-sm">
                  {index + 1}
                </span>
                <tab.icon className={`h-4 w-4 ${tab.color}`} />
                <span className="font-semibold tracking-tight">{tab.label}</span>
              </TabsTrigger>
            ))}
          </div>

          {/* Divider */}
          <div className="h-8 w-px bg-border/50 mx-4 self-center" />

          {/* Insight Tabs */}
          <div className="flex gap-1 items-center">
            {insightTabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={`
                  gap-2 px-3 py-2 rounded-md transition-all duration-300
                  data-[state=active]:bg-white/80 dark:data-[state=active]:bg-slate-800/80 
                  data-[state=active]:shadow-sm data-[state=active]:text-foreground
                  hover:bg-white/40 dark:hover:bg-slate-800/40 text-muted-foreground
                  ${tab.bgColor}
                `}
              >
                <tab.icon className={`h-4 w-4 ${tab.color}`} />
                <span className="font-medium text-sm">{tab.label}</span>
              </TabsTrigger>
            ))}
          </div>
        </TabsList>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        <TabsContent value="prep" className="h-full m-0">
          <PrepTab
            intelligence={intelligence}
            companyContext={companyContext}
            timePeriod={timePeriod}
            historicalContext={historicalContext}
          />
        </TabsContent>
        <TabsContent value="open" className="h-full m-0">
          <OpenTab
            intelligence={intelligence}
            localIntelligence={localIntelligence || intelligence.localIntelligence}
          />
        </TabsContent>
        <TabsContent value="discover" className="h-full m-0">
          <DiscoverTab
            intelligence={intelligence}
            companyContext={companyContext}
            timePeriod={timePeriod}
            historicalContext={historicalContext}
          />
        </TabsContent>
        <TabsContent value="value" className="h-full m-0">
          <ValueTab intelligence={intelligence} />
        </TabsContent>
        <TabsContent value="close" className="h-full m-0">
          <CloseTab
            intelligence={intelligence}
            companyContext={companyContext}
            timePeriod={timePeriod}
            historicalContext={historicalContext}
          />
        </TabsContent>
        <TabsContent value="mindmap" className="h-full m-0">
          <MindMapTab intelligence={intelligence} />
        </TabsContent>
        <TabsContent value="orgchart" className="h-full m-0">
          <OrgChartTab intelligence={intelligence} />
        </TabsContent>
        <TabsContent value="techstack" className="h-full m-0">
          <TechStackTab />
        </TabsContent>
      </div>
    </Tabs>
  );
}

export default SalesWorkflowView;

