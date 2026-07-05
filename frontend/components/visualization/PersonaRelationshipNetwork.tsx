'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Network,
  Users,
  ArrowRight,
  Zap,
  AlertTriangle,
  Crown,
  User,
  DollarSign
} from 'lucide-react';
import type { Persona, PersonaRelationship } from '@/types/api';

interface PersonaRelationshipNetworkProps {
  personas: Persona[];
  className?: string;
}

interface NetworkNode {
  id: string;
  name: string;
  stakeholder_type: string;
  influence_score: number;
  relationships: PersonaRelationship[];
  conflicts: number;
  x: number;
  y: number;
}

interface NetworkEdge {
  source: string;
  target: string;
  relationship_type: string;
  strength: number;
  description: string;
}

export function PersonaRelationshipNetwork({ personas, className }: PersonaRelationshipNetworkProps) {
  
  // Process personas into network data
  const networkData = useMemo(() => {
    const nodes: NetworkNode[] = [];
    const edges: NetworkEdge[] = [];
    
    // Create nodes from personas
    personas.forEach((persona, index) => {
      if (persona.stakeholder_intelligence) {
        const influence_score = (
          persona.stakeholder_intelligence.influence_metrics.decision_power +
          persona.stakeholder_intelligence.influence_metrics.technical_influence +
          persona.stakeholder_intelligence.influence_metrics.budget_influence
        ) / 3;
        
        // Simple circular layout
        const angle = (index / personas.length) * 2 * Math.PI;
        const radius = 120;
        
        nodes.push({
          id: persona.name,
          name: persona.name,
          stakeholder_type: persona.stakeholder_intelligence.stakeholder_type,
          influence_score,
          relationships: persona.stakeholder_intelligence.relationships,
          conflicts: persona.stakeholder_intelligence.conflict_indicators.length,
          x: Math.cos(angle) * radius + 150,
          y: Math.sin(angle) * radius + 150
        });
        
        // Create edges from relationships
        persona.stakeholder_intelligence.relationships.forEach(relationship => {
          edges.push({
            source: persona.name,
            target: relationship.target_persona_id,
            relationship_type: relationship.relationship_type,
            strength: relationship.strength,
            description: relationship.description
          });
        });
      }
    });
    
    return { nodes, edges };
  }, [personas]);

  // Get stakeholder type info
  const getStakeholderTypeInfo = (type: string) => {
    switch (type) {
      case 'decision_maker':
        return { color: '#8B5CF6', icon: Crown, label: 'Decision Maker' };
      case 'primary_customer':
        return { color: '#3B82F6', icon: User, label: 'Primary Customer' };
      case 'secondary_user':
        return { color: '#10B981', icon: Users, label: 'Secondary User' };
      case 'influencer':
        return { color: '#F59E0B', icon: Zap, label: 'Influencer' };
      default:
        return { color: '#6B7280', icon: User, label: 'Stakeholder' };
    }
  };

  // Get relationship type info
  const getRelationshipTypeInfo = (type: string) => {
    switch (type) {
      case 'collaborates_with':
        return { color: '#3B82F6', strokeDasharray: '0', label: 'Collaborates' };
      case 'reports_to':
        return { color: '#8B5CF6', strokeDasharray: '0', label: 'Reports To' };
      case 'influences':
        return { color: '#F59E0B', strokeDasharray: '5,5', label: 'Influences' };
      case 'conflicts_with':
        return { color: '#EF4444', strokeDasharray: '10,5', label: 'Conflicts' };
      default:
        return { color: '#6B7280', strokeDasharray: '0', label: 'Related' };
    }
  };

  if (networkData.nodes.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="pt-6">
          <div className="text-center text-gray-500">
            <Network className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No persona relationships to visualize</p>
            <p className="text-sm">Enhanced personas with stakeholder intelligence will show relationship networks</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Network className="h-5 w-5 mr-2" />
          Persona Relationship Network
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Network Visualization */}
          <div className="relative bg-gray-50 rounded-lg p-4" style={{ height: '300px' }}>
            <svg width="100%" height="100%" viewBox="0 0 300 300">
              {/* Render edges first (so they appear behind nodes) */}
              {networkData.edges.map((edge, index) => {
                const sourceNode = networkData.nodes.find(n => n.id === edge.source);
                const targetNode = networkData.nodes.find(n => n.id === edge.target);
                
                if (!sourceNode || !targetNode) return null;
                
                const relationshipInfo = getRelationshipTypeInfo(edge.relationship_type);
                
                return (
                  <g key={`edge-${index}`}>
                    <line
                      x1={sourceNode.x}
                      y1={sourceNode.y}
                      x2={targetNode.x}
                      y2={targetNode.y}
                      stroke={relationshipInfo.color}
                      strokeWidth={Math.max(1, edge.strength * 3)}
                      strokeDasharray={relationshipInfo.strokeDasharray}
                      opacity={0.7}
                    />
                    {/* Arrow marker for directed relationships */}
                    {(edge.relationship_type === 'reports_to' || edge.relationship_type === 'influences') && (
                      <polygon
                        points={`${targetNode.x - 5},${targetNode.y - 3} ${targetNode.x - 5},${targetNode.y + 3} ${targetNode.x},${targetNode.y}`}
                        fill={relationshipInfo.color}
                        opacity={0.7}
                      />
                    )}
                  </g>
                );
              })}
              
              {/* Render nodes */}
              {networkData.nodes.map((node, index) => {
                const typeInfo = getStakeholderTypeInfo(node.stakeholder_type);
                const nodeSize = 8 + (node.influence_score * 12); // Size based on influence
                
                return (
                  <TooltipProvider key={`node-${index}`}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <g>
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r={nodeSize}
                            fill={typeInfo.color}
                            stroke="#fff"
                            strokeWidth="2"
                            className="cursor-pointer hover:opacity-80"
                          />
                          {/* Conflict indicator */}
                          {node.conflicts > 0 && (
                            <circle
                              cx={node.x + nodeSize - 3}
                              cy={node.y - nodeSize + 3}
                              r="4"
                              fill="#EF4444"
                              stroke="#fff"
                              strokeWidth="1"
                            />
                          )}
                          <text
                            x={node.x}
                            y={node.y + nodeSize + 12}
                            textAnchor="middle"
                            className="text-xs font-medium fill-gray-700"
                          >
                            {node.name.split(' ')[0]}
                          </text>
                        </g>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="space-y-1">
                          <p className="font-medium">{node.name}</p>
                          <p className="text-xs">{typeInfo.label}</p>
                          <p className="text-xs">Influence: {Math.round(node.influence_score * 100)}%</p>
                          <p className="text-xs">Relationships: {node.relationships.length}</p>
                          {node.conflicts > 0 && (
                            <p className="text-xs text-red-600">Conflicts: {node.conflicts}</p>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </svg>
          </div>

          {/* Legend */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Legend</h4>
            
            {/* Stakeholder Types */}
            <div>
              <h5 className="text-xs font-medium text-gray-600 mb-2">Stakeholder Types</h5>
              <div className="flex flex-wrap gap-2">
                {['decision_maker', 'primary_customer', 'secondary_user', 'influencer'].map(type => {
                  const typeInfo = getStakeholderTypeInfo(type);
                  return (
                    <div key={type} className="flex items-center space-x-1">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: typeInfo.color }}
                      />
                      <span className="text-xs">{typeInfo.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Relationship Types */}
            <div>
              <h5 className="text-xs font-medium text-gray-600 mb-2">Relationship Types</h5>
              <div className="grid grid-cols-2 gap-2">
                {['collaborates_with', 'reports_to', 'influences', 'conflicts_with'].map(type => {
                  const relationshipInfo = getRelationshipTypeInfo(type);
                  return (
                    <div key={type} className="flex items-center space-x-2">
                      <svg width="20" height="2">
                        <line
                          x1="0"
                          y1="1"
                          x2="20"
                          y2="1"
                          stroke={relationshipInfo.color}
                          strokeWidth="2"
                          strokeDasharray={relationshipInfo.strokeDasharray}
                        />
                      </svg>
                      <span className="text-xs">{relationshipInfo.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Network Statistics */}
          <div className="grid grid-cols-3 gap-4 pt-3 border-t">
            <div className="text-center">
              <div className="text-lg font-semibold text-blue-600">{networkData.nodes.length}</div>
              <div className="text-xs text-gray-600">Personas</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-green-600">{networkData.edges.length}</div>
              <div className="text-xs text-gray-600">Relationships</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-red-600">
                {networkData.nodes.reduce((sum, node) => sum + node.conflicts, 0)}
              </div>
              <div className="text-xs text-gray-600">Conflicts</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
