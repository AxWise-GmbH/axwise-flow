import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckCircle,
  AlertTriangle,
  Users,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Target,
  Zap
} from 'lucide-react';

interface ConsensusArea {
  topic: string;
  agreement_level: number;
  participating_stakeholders: string[];
  shared_insights: string[];
  business_impact: string;
}

interface ConflictZone {
  topic: string;
  conflicting_stakeholders: string[];
  conflict_severity: "low" | "medium" | "high" | "critical";
  potential_resolutions: string[];
  business_risk: string;
}

interface ConsensusConflictVisualizationProps {
  stakeholderIntelligence: any;
}

const ConsensusConflictVisualization: React.FC<ConsensusConflictVisualizationProps> = ({
  stakeholderIntelligence
}) => {
  const [selectedConsensus, setSelectedConsensus] = useState<number | null>(null);
  const [selectedConflict, setSelectedConflict] = useState<number | null>(null);

  const consensusAreas = stakeholderIntelligence.cross_stakeholder_patterns?.consensus_areas || [];
  const conflictZones = stakeholderIntelligence.cross_stakeholder_patterns?.conflict_zones || [];
  const overallConsensus = stakeholderIntelligence.multi_stakeholder_summary?.consensus_score || 0;
  const overallConflict = stakeholderIntelligence.multi_stakeholder_summary?.conflict_score || 0;

  const getConsensusColor = (level: number) => {
    if (level >= 0.8) return 'text-green-600 bg-green-100';
    if (level >= 0.6) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getConflictColor = (intensity: number) => {
    if (intensity >= 0.7) return 'text-red-600 bg-red-100';
    if (intensity >= 0.4) return 'text-orange-600 bg-orange-100';
    return 'text-yellow-600 bg-yellow-100';
  };

  const getConflictSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-100';
      case 'high': return 'text-red-600 bg-red-100';
      case 'medium': return 'text-orange-600 bg-orange-100';
      case 'low': return 'text-yellow-600 bg-yellow-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getConflictSeverityValue = (severity: string) => {
    switch (severity) {
      case 'critical': return 100;
      case 'high': return 80;
      case 'medium': return 60;
      case 'low': return 30;
      default: return 0;
    }
  };

  const renderConsensusChart = () => {
    if (consensusAreas.length === 0) return null;

    return (
      <div className="space-y-4">
        {consensusAreas.map((area: ConsensusArea, index: number) => (
          <Card
            key={index}
            className={`cursor-pointer transition-all ${
              selectedConsensus === index ? 'ring-2 ring-green-500 shadow-lg' : 'hover:shadow-md'
            }`}
            onClick={() => setSelectedConsensus(selectedConsensus === index ? null : index)}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <h4 className="font-semibold text-lg">{area.topic}</h4>
                </div>
                <div className="flex items-center space-x-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span className={`px-2 py-1 rounded-full text-sm font-medium ${getConsensusColor(area.agreement_level)}`}>
                    {Math.round(area.agreement_level * 100)}% agreement
                  </span>
                </div>
              </div>

              <div className="mb-4">
                <Progress value={area.agreement_level * 100} className="h-3" />
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {area.participating_stakeholders && Array.isArray(area.participating_stakeholders) ?
                  area.participating_stakeholders.map((stakeholder, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      <Users className="h-3 w-3 mr-1" />
                      {stakeholder}
                    </Badge>
                  )) : (
                    <Badge variant="outline" className="text-xs text-gray-500">
                      No participating stakeholders available
                    </Badge>
                  )
                }
              </div>

              {selectedConsensus === index && (
                <div className="mt-4 pt-4 border-t">
                  <h5 className="font-semibold mb-2 text-sm">Shared Insights:</h5>
                  <ul className="space-y-2">
                    {area.shared_insights && Array.isArray(area.shared_insights) ?
                      area.shared_insights.map((insight: string, idx: number) => (
                        <li key={idx} className="flex items-start space-x-2">
                          <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <span className="text-sm">{insight}</span>
                        </li>
                      )) : (
                        <li className="text-sm text-gray-500">No shared insights available</li>
                      )
                    }
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderConflictChart = () => {
    if (conflictZones.length === 0) return null;

    return (
      <div className="space-y-4">
        {conflictZones.map((conflict: ConflictZone, index: number) => (
          <Card
            key={index}
            className={`cursor-pointer transition-all ${
              selectedConflict === index ? 'ring-2 ring-red-500 shadow-lg' : 'hover:shadow-md'
            }`}
            onClick={() => setSelectedConflict(selectedConflict === index ? null : index)}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                  <h4 className="font-semibold text-lg">{conflict.topic}</h4>
                </div>
                <div className="flex items-center space-x-2">
                  <TrendingDown className="h-4 w-4 text-red-600" />
                  <span className={`px-2 py-1 rounded-full text-sm font-medium ${getConflictSeverityColor(conflict.conflict_severity)}`}>
                    {conflict.conflict_severity} severity
                  </span>
                </div>
              </div>

              <div className="mb-4">
                <Progress value={getConflictSeverityValue(conflict.conflict_severity)} className="h-3" />
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {conflict.conflicting_stakeholders && Array.isArray(conflict.conflicting_stakeholders) ?
                  conflict.conflicting_stakeholders.map((stakeholder: string, idx: number) => (
                    <Badge key={idx} variant="destructive" className="text-xs">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {stakeholder}
                    </Badge>
                  )) : (
                    <Badge variant="outline" className="text-xs text-gray-500">
                      No conflicting stakeholders available
                    </Badge>
                  )
                }
              </div>

              {selectedConflict === index && (
                <div className="mt-4 pt-4 border-t">
                  <h5 className="font-semibold mb-2 text-sm">Business Risk:</h5>
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-700">{conflict.business_risk}</p>
                  </div>

                  {conflict.potential_resolutions && conflict.potential_resolutions.length > 0 && (
                    <div className="mt-4">
                      <h5 className="font-semibold mb-2 text-sm">Potential Resolutions:</h5>
                      <ul className="space-y-1">
                        {conflict.potential_resolutions.map((resolution: string, idx: number) => (
                          <li key={idx} className="flex items-start space-x-2">
                            <Target className="h-3 w-3 text-blue-600 mt-1 flex-shrink-0" />
                            <span className="text-sm">{resolution}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderOverviewMetrics = () => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Overall Consensus */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span>Overall Consensus</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-green-600">
                  {Math.round(overallConsensus * 100)}%
                </span>
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
              <Progress value={overallConsensus * 100} className="h-3" />
              <div className="text-sm text-gray-600">
                {consensusAreas.length} consensus area{consensusAreas.length !== 1 ? 's' : ''} identified
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Overall Conflict */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <span>Overall Conflict</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold text-red-600">
                  {Math.round(overallConflict * 100)}%
                </span>
                <TrendingDown className="h-6 w-6 text-red-600" />
              </div>
              <Progress value={overallConflict * 100} className="h-3" />
              <div className="text-sm text-gray-600">
                {conflictZones.length} conflict zone{conflictZones.length !== 1 ? 's' : ''} identified
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderHeatmap = () => {
    const allTopics = [
      ...consensusAreas.map((area: ConsensusArea) => ({ ...area, type: 'consensus' as const })),
      ...conflictZones.map((zone: ConflictZone) => ({ ...zone, type: 'conflict' as const }))
    ];

    if (allTopics.length === 0) return null;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>Topic Analysis Heatmap</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {allTopics.map((topic, index) => {
              const intensity = topic.type === 'consensus'
                ? (topic as any).agreement_level
                : getConflictSeverityValue((topic as any).conflict_severity) / 100;
              const isConsensus = topic.type === 'consensus';

              return (
                <div key={index} className="flex items-center space-x-4">
                  <div className="w-32 text-sm font-medium truncate" title={topic.topic}>
                    {topic.topic}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <div className="flex-1 h-6 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            isConsensus ? 'bg-green-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${intensity * 100}%` }}
                        />
                      </div>
                      <div className="w-12 text-sm text-right">
                        {Math.round(intensity * 100)}%
                      </div>
                      <div className="w-16">
                        {isConsensus ? (
                          <Badge variant="outline" className="text-xs text-green-600">
                            Consensus
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-red-600">
                            Conflict
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Overview Metrics */}
      {renderOverviewMetrics()}

      {/* Detailed Analysis */}
      <Tabs defaultValue="consensus" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="consensus">
            <CheckCircle className="h-4 w-4 mr-2" />
            Consensus Areas
          </TabsTrigger>
          <TabsTrigger value="conflicts">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Conflict Zones
          </TabsTrigger>
          <TabsTrigger value="heatmap">
            <BarChart3 className="h-4 w-4 mr-2" />
            Topic Heatmap
          </TabsTrigger>
        </TabsList>

        <TabsContent value="consensus" className="space-y-4">
          {consensusAreas.length > 0 ? (
            <>
              <div className="text-sm text-gray-600 mb-4">
                Click on consensus areas to view detailed agreement points
              </div>
              {renderConsensusChart()}
            </>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-gray-500">
                  <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No consensus areas identified in this analysis.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="conflicts" className="space-y-4">
          {conflictZones.length > 0 ? (
            <>
              <div className="text-sm text-gray-600 mb-4">
                Click on conflict zones to view detailed descriptions
              </div>
              {renderConflictChart()}
            </>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-gray-500">
                  <Zap className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No conflict zones identified in this analysis.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="heatmap" className="space-y-4">
          {renderHeatmap()}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ConsensusConflictVisualization;
