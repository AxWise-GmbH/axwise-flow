import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Network, Users, Zap, Target } from 'lucide-react';

interface NetworkNode {
  id: string;
  label: string;
  stakeholder_type: string;
  influence_score: number;
  x?: number;
  y?: number;
  radius?: number;
}

interface NetworkEdge {
  from: string;
  to: string;
  influence_type: string;
  strength: number;
}

interface StakeholderNetworkVisualizationProps {
  stakeholderIntelligence: any;
}

const StakeholderNetworkVisualization: React.FC<StakeholderNetworkVisualizationProps> = ({
  stakeholderIntelligence
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<NetworkNode | null>(null);

  // Prepare network data
  const prepareNetworkData = () => {
    const nodes: NetworkNode[] = stakeholderIntelligence.detected_stakeholders.map((stakeholder: any) => ({
      id: stakeholder.stakeholder_id,
      label: stakeholder.stakeholder_id,
      stakeholder_type: stakeholder.stakeholder_type,
      influence_score: stakeholder.influence_metrics?.decision_power || 0.5,
    }));

    const edges: NetworkEdge[] = [];
    if (stakeholderIntelligence.cross_stakeholder_patterns?.influence_networks) {
      stakeholderIntelligence.cross_stakeholder_patterns.influence_networks.forEach((network: any) => {
        network.connections.forEach((connection: string) => {
          edges.push({
            from: network.stakeholder_id,
            to: connection,
            influence_type: network.influence_type,
            strength: network.influence_score,
          });
        });
      });
    }

    return { nodes, edges };
  };

  const { nodes, edges } = prepareNetworkData();

  // Position nodes in a circle layout
  const positionNodes = (nodes: NetworkNode[], width: number, height: number) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.3;

    return nodes.map((node, index) => {
      const angle = (index / nodes.length) * 2 * Math.PI;
      return {
        ...node,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
        radius: 20 + node.influence_score * 30, // Size based on influence
      };
    });
  };

  const getStakeholderColor = (type: string) => {
    const colors = {
      'decision_maker': '#ef4444',
      'technical_lead': '#3b82f6',
      'primary_customer': '#10b981',
      'secondary_customer': '#f59e0b',
      'internal_stakeholder': '#8b5cf6',
      'external_partner': '#f97316',
      'end_user': '#06b6d4'
    };
    return colors[type as keyof typeof colors] || '#6b7280';
  };

  const drawNetwork = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    const positionedNodes = positionNodes(nodes, width, height);

    // Draw edges
    edges.forEach(edge => {
      const fromNode = positionedNodes.find(n => n.id === edge.from);
      const toNode = positionedNodes.find(n => n.id === edge.to);

      if (fromNode && toNode) {
        ctx.beginPath();
        ctx.moveTo(fromNode.x!, fromNode.y!);
        ctx.lineTo(toNode.x!, toNode.y!);
        ctx.strokeStyle = `rgba(99, 102, 241, ${edge.strength})`;
        ctx.lineWidth = 2 + edge.strength * 3;
        ctx.stroke();

        // Draw arrow
        const angle = Math.atan2(toNode.y! - fromNode.y!, toNode.x! - fromNode.x!);
        const arrowLength = 10;
        const arrowX = toNode.x! - (toNode.radius! + 5) * Math.cos(angle);
        const arrowY = toNode.y! - (toNode.radius! + 5) * Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(
          arrowX - arrowLength * Math.cos(angle - Math.PI / 6),
          arrowY - arrowLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(arrowX, arrowY);
        ctx.lineTo(
          arrowX - arrowLength * Math.cos(angle + Math.PI / 6),
          arrowY - arrowLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.strokeStyle = `rgba(99, 102, 241, ${edge.strength})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // Draw nodes
    positionedNodes.forEach(node => {
      const isSelected = selectedNode?.id === node.id;
      const isHovered = hoveredNode?.id === node.id;

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x!, node.y!, node.radius!, 0, 2 * Math.PI);
      ctx.fillStyle = getStakeholderColor(node.stakeholder_type);
      ctx.fill();

      // Node border
      if (isSelected || isHovered) {
        ctx.strokeStyle = isSelected ? '#1f2937' : '#6b7280';
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.stroke();
      }

      // Node label
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Wrap text if too long
      const maxWidth = node.radius! * 1.8;
      const words = node.label.split(' ');
      let line = '';
      let y = node.y!;
      
      if (words.length > 2) {
        // Multi-line text
        words.forEach((word, index) => {
          const testLine = line + word + ' ';
          const metrics = ctx.measureText(testLine);
          
          if (metrics.width > maxWidth && index > 0) {
            ctx.fillText(line.trim(), node.x!, y - 6);
            line = word + ' ';
            y += 12;
          } else {
            line = testLine;
          }
        });
        ctx.fillText(line.trim(), node.x!, y);
      } else {
        ctx.fillText(node.label, node.x!, node.y!);
      }

      // Influence score indicator
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText(
        `${Math.round(node.influence_score * 100)}%`,
        node.x!,
        node.y! + node.radius! + 15
      );
    });
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const positionedNodes = positionNodes(nodes, rect.width, rect.height);
    const clickedNode = positionedNodes.find(node => {
      const distance = Math.sqrt((x - node.x!) ** 2 + (y - node.y!) ** 2);
      return distance <= node.radius!;
    });

    setSelectedNode(clickedNode || null);
  };

  const handleCanvasMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const positionedNodes = positionNodes(nodes, rect.width, rect.height);
    const hoveredNode = positionedNodes.find(node => {
      const distance = Math.sqrt((x - node.x!) ** 2 + (y - node.y!) ** 2);
      return distance <= node.radius!;
    });

    setHoveredNode(hoveredNode || null);
    canvas.style.cursor = hoveredNode ? 'pointer' : 'default';
  };

  useEffect(() => {
    drawNetwork();
  }, [nodes, edges, selectedNode, hoveredNode]);

  const getSelectedStakeholderDetails = () => {
    if (!selectedNode) return null;
    
    return stakeholderIntelligence.detected_stakeholders.find(
      (s: any) => s.stakeholder_id === selectedNode.id
    );
  };

  const selectedDetails = getSelectedStakeholderDetails();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Network className="h-5 w-5" />
            <span>Stakeholder Influence Network</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Network Visualization */}
            <div className="lg:col-span-2">
              <div className="relative">
                <canvas
                  ref={canvasRef}
                  className="w-full h-96 border rounded-lg bg-gray-50"
                  onClick={handleCanvasClick}
                  onMouseMove={handleCanvasMouseMove}
                />
                <div className="absolute top-2 right-2 text-xs text-gray-500">
                  Click nodes to view details
                </div>
              </div>
            </div>

            {/* Node Details Panel */}
            <div className="space-y-4">
              {selectedDetails ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center space-x-2">
                      <Users className="h-4 w-4" />
                      <span>{selectedDetails.stakeholder_id}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Badge className={`${getStakeholderColor(selectedDetails.stakeholder_type)} text-white`}>
                        {selectedDetails.stakeholder_type.replace('_', ' ')}
                      </Badge>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold text-sm mb-2">Influence Metrics</h4>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs">Decision Power</span>
                          <div className="flex items-center space-x-2">
                            <div className="w-16 h-2 bg-gray-200 rounded">
                              <div 
                                className="h-2 bg-blue-500 rounded"
                                style={{ width: `${(selectedDetails.influence_metrics?.decision_power || 0) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs">{Math.round((selectedDetails.influence_metrics?.decision_power || 0) * 100)}%</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <span className="text-xs">Technical Influence</span>
                          <div className="flex items-center space-x-2">
                            <div className="w-16 h-2 bg-gray-200 rounded">
                              <div 
                                className="h-2 bg-green-500 rounded"
                                style={{ width: `${(selectedDetails.influence_metrics?.technical_influence || 0) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs">{Math.round((selectedDetails.influence_metrics?.technical_influence || 0) * 100)}%</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <span className="text-xs">Budget Influence</span>
                          <div className="flex items-center space-x-2">
                            <div className="w-16 h-2 bg-gray-200 rounded">
                              <div 
                                className="h-2 bg-orange-500 rounded"
                                style={{ width: `${(selectedDetails.influence_metrics?.budget_influence || 0) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs">{Math.round((selectedDetails.influence_metrics?.budget_influence || 0) * 100)}%</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {selectedDetails.demographic_profile && (
                      <div>
                        <h4 className="font-semibold text-sm mb-2">Profile</h4>
                        <div className="space-y-1">
                          <div className="text-xs"><span className="font-medium">Role:</span> {selectedDetails.demographic_profile.role}</div>
                          <div className="text-xs"><span className="font-medium">Department:</span> {selectedDetails.demographic_profile.department}</div>
                          <div className="text-xs"><span className="font-medium">Experience:</span> {selectedDetails.demographic_profile.experience}</div>
                        </div>
                      </div>
                    )}

                    {selectedDetails.individual_insights && (
                      <div>
                        <h4 className="font-semibold text-sm mb-2">Key Insights</h4>
                        <div className="space-y-1">
                          <div className="text-xs"><span className="font-medium">Primary Concern:</span> {selectedDetails.individual_insights.primary_concern}</div>
                          <div className="text-xs"><span className="font-medium">Key Motivation:</span> {selectedDetails.individual_insights.key_motivation}</div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center text-gray-500">
                      <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-sm">Click on a stakeholder node to view detailed information</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Legend */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Legend</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 rounded-full bg-red-500"></div>
                    <span className="text-xs">Decision Maker</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 rounded-full bg-blue-500"></div>
                    <span className="text-xs">Technical Lead</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 rounded-full bg-green-500"></div>
                    <span className="text-xs">Primary Customer</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Zap className="h-4 w-4 text-indigo-500" />
                    <span className="text-xs">Influence Connection</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-2">
                    Node size represents influence score
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StakeholderNetworkVisualization;
