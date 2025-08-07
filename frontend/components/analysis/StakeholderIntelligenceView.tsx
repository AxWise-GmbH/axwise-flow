import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, TrendingUp, AlertTriangle, Network, Eye, ChevronDown, ChevronRight } from 'lucide-react';

interface DetectedStakeholder {
  stakeholder_id: string;
  stakeholder_type: string;
  confidence_score: number;
  demographic_profile?: Record<string, any>;
  individual_insights?: Record<string, any>;
  influence_metrics?: Record<string, any>;
}

interface ConsensusArea {
  topic: string;
  agreement_level: number;
  stakeholder_positions: Record<string, string>;
}

interface ConflictArea {
  topic: string;
  disagreement_level: number;
  stakeholder_positions: Record<string, string>;
}

interface InfluenceRelationship {
  influencer: string;
  influenced: string;
  strength: number;
  relationship_type: string;
}

interface CrossStakeholderPatterns {
  consensus_areas?: ConsensusArea[];
  conflict_areas?: ConflictArea[];
  influence_relationships?: InfluenceRelationship[];
  implementation_recommendations?: string[];
}

interface MultiStakeholderSummary {
  total_stakeholders: number;
  primary_stakeholder_types: string[];
  key_insights: string[];
  recommendation_priority: string[];
}

interface StakeholderIntelligence {
  detected_stakeholders: DetectedStakeholder[];
  cross_stakeholder_patterns?: CrossStakeholderPatterns;
  multi_stakeholder_summary?: MultiStakeholderSummary;
  processing_metadata?: Record<string, any>;
}

interface StakeholderIntelligenceViewProps {
  stakeholderIntelligence: StakeholderIntelligence;
}

const StakeholderIntelligenceView: React.FC<StakeholderIntelligenceViewProps> = ({
  stakeholderIntelligence
}) => {
  const [expandedStakeholder, setExpandedStakeholder] = useState<string | null>(null);

  // Early return with error boundary if stakeholderIntelligence is null/undefined
  if (!stakeholderIntelligence) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-gray-500">
            <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No stakeholder intelligence data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Ensure detected_stakeholders is always an array
  const stakeholders = stakeholderIntelligence.detected_stakeholders || [];

  const getStakeholderTypeColor = (type: string) => {
    const colors = {
      'decision_maker': 'bg-red-100 text-red-800',
      'primary_customer': 'bg-blue-100 text-blue-800',
      'secondary_customer': 'bg-green-100 text-green-800',
      'internal_stakeholder': 'bg-purple-100 text-purple-800',
      'external_partner': 'bg-orange-100 text-orange-800',
      'technical_lead': 'bg-indigo-100 text-indigo-800',
      'end_user': 'bg-teal-100 text-teal-800'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const renderStakeholderCard = (stakeholder: DetectedStakeholder) => {
    const isExpanded = expandedStakeholder === stakeholder.stakeholder_id;

    return (
      <Card key={stakeholder.stakeholder_id} className="mb-4">
        <CardHeader
          className="cursor-pointer"
          onClick={() => setExpandedStakeholder(isExpanded ? null : stakeholder.stakeholder_id)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <CardTitle className="text-lg">{stakeholder.stakeholder_id}</CardTitle>
              <Badge className={getStakeholderTypeColor(stakeholder.stakeholder_type)}>
                {stakeholder.stakeholder_type.replace('_', ' ')}
              </Badge>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`text-sm font-medium ${getConfidenceColor(stakeholder.confidence_score)}`}>
                {Math.round(stakeholder.confidence_score * 100)}% confidence
              </span>
            </div>
          </div>
        </CardHeader>

        {isExpanded && (
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stakeholder.demographic_profile && Object.keys(stakeholder.demographic_profile).length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Demographics</h4>
                  <div className="space-y-1">
                    {Object.entries(stakeholder.demographic_profile).map(([key, value]) => (
                      <div key={key} className="text-sm">
                        <span className="font-medium">{key}:</span> {String(value)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {stakeholder.individual_insights && Object.keys(stakeholder.individual_insights).length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Individual Insights</h4>
                  <div className="space-y-1">
                    {Object.entries(stakeholder.individual_insights).map(([key, value]) => (
                      <div key={key} className="text-sm">
                        <span className="font-medium">{key}:</span> {String(value)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    );
  };

  const renderConsensusAreas = () => {
    if (!stakeholderIntelligence.cross_stakeholder_patterns?.consensus_areas) return null;

    return (
      <div className="space-y-4">
        {stakeholderIntelligence.cross_stakeholder_patterns.consensus_areas.map((area, index) => (
          <Card key={index}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-lg">{area.topic}</h4>
                <div className="flex items-center space-x-2">
                  <TrendingUp className="h-4 w-4 text-green-600" />
                  <span className="text-green-600 font-medium">
                    {Math.round(area.agreement_level * 100)}% agreement
                  </span>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-2">Participating Stakeholders:</p>
                <div className="space-y-2">
                  {/* Handle both old schema (stakeholder_positions) and new schema (participating_stakeholders) */}
                  {area.stakeholder_positions ? (
                    // Legacy schema support
                    Object.entries(area.stakeholder_positions).map(([stakeholder, position], idx) => (
                      <div key={idx} className="bg-gray-50 p-3 rounded-md">
                        <div className="font-medium text-sm text-gray-700 mb-1">
                          {stakeholder.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </div>
                        <div className="text-sm text-gray-600">{position}</div>
                      </div>
                    ))
                  ) : (
                    // New schema: participating_stakeholders + shared_insights
                    <>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {area.participating_stakeholders?.map((stakeholder, idx) => (
                          <span key={idx} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                            {stakeholder.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </span>
                        ))}
                      </div>
                      {area.shared_insights && area.shared_insights.length > 0 && (
                        <div className="bg-gray-50 p-3 rounded-md">
                          <div className="font-medium text-sm text-gray-700 mb-2">Shared Insights:</div>
                          <ul className="text-sm text-gray-600 space-y-1">
                            {area.shared_insights.map((insight, idx) => (
                              <li key={idx} className="flex items-start">
                                <span className="text-green-600 mr-2">•</span>
                                {insight}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {area.business_impact && (
                        <div className="bg-green-50 p-3 rounded-md mt-2">
                          <div className="font-medium text-sm text-green-700 mb-1">Business Impact:</div>
                          <div className="text-sm text-green-600">{area.business_impact}</div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderConflictZones = () => {
    if (!stakeholderIntelligence.cross_stakeholder_patterns?.conflict_areas) return null;

    return (
      <div className="space-y-4">
        {stakeholderIntelligence.cross_stakeholder_patterns.conflict_areas.map((conflict, index) => (
          <Card key={index}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-lg">{conflict.topic}</h4>
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="text-red-600 font-medium">
                    {Math.round(conflict.disagreement_level * 100)}% disagreement
                  </span>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-600 mb-2">Stakeholder Positions:</p>
                <div className="space-y-2">
                  {conflict.stakeholder_positions && Object.entries(conflict.stakeholder_positions).map(([stakeholder, position], idx) => (
                    <div key={idx} className="bg-red-50 p-3 rounded-md border-l-4 border-red-200">
                      <div className="font-medium text-sm text-red-700 mb-1">
                        {stakeholder.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </div>
                      <div className="text-sm text-red-600">{position}</div>
                    </div>
                  ))}
                  {!conflict.stakeholder_positions && (
                    <div className="bg-red-50 p-3 rounded-md border-l-4 border-red-200">
                      <div className="text-sm text-red-600">Conflict details not available</div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderInfluenceNetworks = () => {
    if (!stakeholderIntelligence.cross_stakeholder_patterns?.influence_relationships) return null;

    return (
      <div className="space-y-4">
        {stakeholderIntelligence.cross_stakeholder_patterns.influence_relationships.map((relationship, index) => (
          <Card key={index}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-lg">Influence Relationship</h4>
                <div className="flex items-center space-x-2">
                  <Network className="h-4 w-4 text-blue-600" />
                  <span className="text-blue-600 font-medium">
                    {Math.round(relationship.strength * 100)}% strength
                  </span>
                </div>
              </div>

              <div className="mb-3">
                <p className="text-sm text-gray-600 mb-2">Relationship Type:</p>
                <Badge variant="outline">{relationship.relationship_type.replace(/_/g, ' ')}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Influencer:</p>
                  <Badge variant="secondary">
                    {relationship.influencer.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Influenced:</p>
                  <Badge variant="outline">
                    {relationship.influenced.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Implementation Recommendations */}
        {stakeholderIntelligence.cross_stakeholder_patterns?.implementation_recommendations && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Implementation Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {stakeholderIntelligence.cross_stakeholder_patterns.implementation_recommendations.map((rec, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span className="text-sm">{rec}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>Multi-Stakeholder Analysis</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {stakeholders.length}
              </div>
              <div className="text-sm text-gray-600">Detected Stakeholders</div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {stakeholderIntelligence.cross_stakeholder_patterns?.consensus_areas?.length || 0}
              </div>
              <div className="text-sm text-gray-600">Consensus Areas</div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {stakeholderIntelligence.cross_stakeholder_patterns?.conflict_zones?.length || 0}
              </div>
              <div className="text-sm text-gray-600">Conflict Zones</div>
            </div>
          </div>

          {stakeholderIntelligence.multi_stakeholder_summary && (
            <div className="mt-4 pt-4 border-t">
              <h4 className="font-semibold mb-2">Key Insights</h4>
              <ul className="list-disc list-inside space-y-1">
                {stakeholderIntelligence.multi_stakeholder_summary.key_insights.map((insight, idx) => (
                  <li key={idx} className="text-sm">{insight}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detailed Analysis Tabs */}
      <Tabs defaultValue="stakeholders" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="stakeholders">Stakeholders</TabsTrigger>
          <TabsTrigger value="consensus">Consensus</TabsTrigger>
          <TabsTrigger value="conflicts">Conflicts</TabsTrigger>
          <TabsTrigger value="influence">Influence</TabsTrigger>
        </TabsList>

        <TabsContent value="stakeholders" className="space-y-4">
          <div className="space-y-4">
            {stakeholders.length > 0 ? (
              stakeholders.map(renderStakeholderCard)
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center text-gray-500">
                    <Users className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>No stakeholders detected in the analysis</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="consensus" className="space-y-4">
          {renderConsensusAreas()}
        </TabsContent>

        <TabsContent value="conflicts" className="space-y-4">
          {renderConflictZones()}
        </TabsContent>

        <TabsContent value="influence" className="space-y-4">
          {renderInfluenceNetworks()}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default StakeholderIntelligenceView;
