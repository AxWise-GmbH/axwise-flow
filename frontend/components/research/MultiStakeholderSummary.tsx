'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Users,
  Building2,
  Car,
  Truck,
  ChevronRight,
  Clock,
  Target,
  CheckCircle,
  AlertCircle,
  Download
} from 'lucide-react';

interface Stakeholder {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  priority: 'primary' | 'secondary';
  sampleSize: string;
  keyFocus: string[];
  timeframe: string;
}

interface MultiStakeholderSummaryProps {
  stakeholders: Stakeholder[];
  onExportPlan?: () => void;
  onStartResearch?: (stakeholderId: string) => void;
}

export function MultiStakeholderSummary({
  stakeholders,
  onExportPlan,
  onStartResearch
}: MultiStakeholderSummaryProps) {
  const [selectedPhase, setSelectedPhase] = useState('overview');

  const defaultStakeholders: Stakeholder[] = [
    {
      id: 'primary_stakeholders',
      name: 'Primary Stakeholders',
      icon: <Building2 className="h-5 w-5" />,
      description: 'Decision makers and key users',
      priority: 'primary',
      sampleSize: '5-7 interviews',
      keyFocus: ['Integration needs', 'Workflow efficiency', 'ROI expectations'],
      timeframe: 'Week 1-2'
    },
    {
      id: 'car_owners',
      name: 'Car Owners',
      icon: <Car className="h-5 w-5" />,
      description: 'Individual customers receiving repair services',
      priority: 'secondary',
      sampleSize: '5-6 interviews',
      keyFocus: ['User experience', 'Trust factors', 'Decision process'],
      timeframe: 'Week 3'
    },
    {
      id: 'fleet_managers',
      name: 'Fleet Managers',
      icon: <Truck className="h-5 w-5" />,
      description: 'Corporate fleet maintenance coordinators',
      priority: 'secondary',
      sampleSize: '3-4 interviews',
      keyFocus: ['Process standardization', 'Cost control', 'Approval workflows'],
      timeframe: 'Week 3'
    }
  ];

  const activeStakeholders = stakeholders.length > 0 ? stakeholders : defaultStakeholders;
  const primaryStakeholders = activeStakeholders.filter(s => s.priority === 'primary');
  const secondaryStakeholders = activeStakeholders.filter(s => s.priority === 'secondary');

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-600" />
            <CardTitle className="text-xl">Multi-Stakeholder Research Plan</CardTitle>
          </div>
          <CardDescription>
            Your business involves multiple user groups. Here's a strategic approach to research each effectively.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Quick Overview */}
      <Tabs value={selectedPhase} onValueChange={setSelectedPhase}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="phases">Research Phases</TabsTrigger>
          <TabsTrigger value="questions">Question Sets</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Stakeholder Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeStakeholders.map((stakeholder) => (
              <Card key={stakeholder.id} className={`relative ${
                stakeholder.priority === 'primary' ? 'border-green-200 bg-green-50' : 'border-gray-200'
              }`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {stakeholder.icon}
                      <CardTitle className="text-lg">{stakeholder.name}</CardTitle>
                    </div>
                    <Badge variant={stakeholder.priority === 'primary' ? 'default' : 'secondary'}>
                      {stakeholder.priority}
                    </Badge>
                  </div>
                  <CardDescription>{stakeholder.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Target className="h-4 w-4 text-blue-600" />
                    <span className="font-medium">{stakeholder.sampleSize}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-purple-600" />
                    <span>{stakeholder.timeframe}</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-600">Key Focus Areas:</p>
                    <div className="flex flex-wrap gap-1">
                      {stakeholder.keyFocus.map((focus, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {focus}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {onStartResearch && (
                    <Button
                      size="sm"
                      className="w-full mt-3"
                      onClick={() => onStartResearch(stakeholder.id)}
                    >
                      Start Research
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Research Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-blue-600">{activeStakeholders.length}</div>
                  <div className="text-sm text-gray-600">Stakeholder Groups</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {activeStakeholders.reduce((sum, s) => sum + parseInt(s.sampleSize.split('-')[1] || s.sampleSize.split(' ')[0]), 0)}
                  </div>
                  <div className="text-sm text-gray-600">Total Interviews</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-600">3-4</div>
                  <div className="text-sm text-gray-600">Weeks Duration</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-orange-600">
                    {primaryStakeholders.length}
                  </div>
                  <div className="text-sm text-gray-600">Primary Groups</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="phases" className="space-y-4">
          {/* Phase 1: Primary Stakeholders */}
          <Card className="border-green-200">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <CardTitle className="text-lg">Phase 1: Primary Stakeholders (Week 1-2)</CardTitle>
              </div>
              <CardDescription>
                Start with decision makers and paying customers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {primaryStakeholders.map((stakeholder) => (
                <div key={stakeholder.id} className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                  {stakeholder.icon}
                  <div className="flex-1">
                    <div className="font-medium">{stakeholder.name}</div>
                    <div className="text-sm text-gray-600">{stakeholder.sampleSize}</div>
                  </div>
                  <Badge variant="outline">{stakeholder.timeframe}</Badge>
                </div>
              ))}
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <div className="font-medium text-blue-800 mb-2">Why Start Here:</div>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• They're your paying customers and decision makers</li>
                  <li>• Technical requirements and constraints come from them</li>
                  <li>• Their insights shape the solution architecture</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Phase 2: Secondary Stakeholders */}
          <Card className="border-blue-200">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-lg">Phase 2: End Users (Week 3)</CardTitle>
              </div>
              <CardDescription>
                Validate assumptions with actual users
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {secondaryStakeholders.map((stakeholder) => (
                <div key={stakeholder.id} className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                  {stakeholder.icon}
                  <div className="flex-1">
                    <div className="font-medium">{stakeholder.name}</div>
                    <div className="text-sm text-gray-600">{stakeholder.sampleSize}</div>
                  </div>
                  <Badge variant="outline">{stakeholder.timeframe}</Badge>
                </div>
              ))}
              <div className="mt-4 p-3 bg-orange-50 rounded-lg">
                <div className="font-medium text-orange-800 mb-2">Why Second:</div>
                <ul className="text-sm text-orange-700 space-y-1">
                  <li>• Validate that primary stakeholder assumptions align with user needs</li>
                  <li>• Understand actual user decision-making process</li>
                  <li>• Identify potential adoption barriers</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Phase 3: Synthesis */}
          <Card className="border-purple-200">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-purple-600" />
                <CardTitle className="text-lg">Phase 3: Synthesis & Validation (Week 4)</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <div className="font-medium mb-2">Key Activities:</div>
                  <ul className="text-sm space-y-1">
                    <li>• Cross-reference findings between groups</li>
                    <li>• Identify alignment and conflicts</li>
                    <li>• Refine feature requirements</li>
                    <li>• Create stakeholder-specific value props</li>
                  </ul>
                </div>
                <div>
                  <div className="font-medium mb-2">Expected Outcomes:</div>
                  <ul className="text-sm space-y-1">
                    <li>• Clear feature prioritization</li>
                    <li>• Technical requirements validated</li>
                    <li>• User experience requirements defined</li>
                    <li>• Implementation roadmap</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="questions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Stakeholder-Specific Question Sets</CardTitle>
              <CardDescription>
                Tailored questions for each stakeholder group to maximize insights
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">
                  Detailed question sets will be generated based on your specific stakeholder groups
                </p>
                <Button variant="outline">
                  Generate Question Sets
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Action Buttons */}
      <div className="flex gap-3">
        {onExportPlan && (
          <Button variant="outline" onClick={onExportPlan}>
            <Download className="h-4 w-4 mr-2" />
            Export Research Plan
          </Button>
        )}
        <Button className="flex-1">
          Start Phase 1 Research
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
