'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Tooltip } from 'react-tooltip';
import { 
  TooltipTrigger, 
  TooltipContent, 
  TooltipProvider 
} from '@/components/ui/tooltip';

// Define types for Persona data structure
type PersonaTrait = {
  value: string | string[] | number | boolean | null;
  confidence: number;
  evidence: string[];
};

export type Persona = {
  name: string;
  description: string;
  role_context: PersonaTrait;
  key_responsibilities: PersonaTrait;
  tools_used: PersonaTrait;
  collaboration_style: PersonaTrait;
  analysis_approach: PersonaTrait;
  pain_points: PersonaTrait;
  patterns: string[];
  confidence: number;
  evidence: string[];
  metadata?: {
    sample_size?: number;
    timestamp?: string;
    validation_metrics?: {
      pattern_confidence?: number;
      evidence_count?: number;
      attribute_coverage?: Record<string, number>;
    };
  };
};

type PersonaListProps = {
  personas: Persona[];
  className?: string;
};

export function PersonaList({ personas, className }: PersonaListProps) {
  // Use the personas prop directly without fallbacks
  const [activePersonaIndex, setActivePersonaIndex] = useState(0);
  const [expandedTraits, setExpandedTraits] = useState<Record<string, boolean>>({});
  
  // Select the first persona if the list changes
  useEffect(() => {
    if (personas && personas.length > 0) {
      setActivePersonaIndex(0);
    }
  }, [personas]);
  
  // Ensure we have valid personas data
  if (!personas || personas.length === 0) {
    return (
      <div className="w-full p-6 text-center">
        <p className="text-muted-foreground">No personas found in the analysis.</p>
      </div>
    );
  }
  
  // Active persona is the one at the selected index
  const activePersona = personas[activePersonaIndex];
  
  const toggleEvidence = (trait: string) => {
    setExpandedTraits(prev => ({
      ...prev,
      [trait]: !prev[trait]
    }));
  };
  
  // Get initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  // Get color based on confidence
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100';
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100';
    return 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100';
  };

  const getConfidenceTooltip = (confidence: number) => {
    if (confidence >= 0.9) return 'High confidence: Based on direct statements from the interview';
    if (confidence >= 0.7) return 'Good confidence: Based on strong evidence across multiple mentions';
    if (confidence >= 0.5) return 'Moderate confidence: Based on contextual clues';
    return 'Limited confidence: Based on inferences with minimal evidence';
  };

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <CardTitle>User Personas</CardTitle>
        <CardDescription>
          Identified user personas based on the interview analysis
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="personas" className="w-full">
          <TabsList className="grid grid-cols-2 mb-6 w-full">
            <TabsTrigger value="personas">Persona Cards</TabsTrigger>
            <TabsTrigger value="comparison">Comparison</TabsTrigger>
          </TabsList>
          
          <TabsContent value="personas" className="space-y-6">
            {/* Persona tabs navigation */}
            <div className="flex flex-nowrap overflow-x-auto pb-2 mb-4 gap-2">
              {personas.map((persona, index) => (
                <div 
                  key={`persona-tab-${index}`}
                  onClick={() => setActivePersonaIndex(index)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer whitespace-nowrap",
                    activePersonaIndex === index 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted hover:bg-secondary"
                  )}
                >
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">
                      {getInitials(persona.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span>{persona.name}</span>
                </div>
              ))}
            </div>
            
            {/* Active persona details */}
            {activePersona && (
              <div className="md:col-span-3">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold">{activePersona.name}</h2>
                    <p className="text-muted-foreground">{activePersona.description}</p>
                  </div>
                  <Badge className={getConfidenceColor(activePersona.confidence)}>
                    {Math.round(activePersona.confidence * 100)}% Confidence
                    <Tooltip>{getConfidenceTooltip(activePersona.confidence)}</Tooltip>
                  </Badge>
                </div>
                
                <Tabs defaultValue="overview">
                  <TabsList className="mb-4">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="evidence">Evidence</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="overview" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Confidence Guide Panel */}
                      <Card className="col-span-1 md:col-span-2 bg-blue-50 dark:bg-blue-900/20">
                        <CardHeader className="p-4">
                          <CardTitle className="text-base">Confidence Score Guide</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          <div className="text-sm">
                            <p className="mb-2">Our confidence scores reflect the strength of evidence:</p>
                            <ul className="space-y-1 list-disc list-inside">
                              <li><strong>90-100%:</strong> Direct statements from interview</li>
                              <li><strong>70-80%:</strong> Strong evidence across multiple mentions</li>
                              <li><strong>50-60%:</strong> Contextual clues and moderate evidence</li>
                              <li><strong>&lt;50%:</strong> Limited evidence based on inferences</li>
                            </ul>
                          </div>
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardHeader>
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-base">Role Context</CardTitle>
                            <Badge variant="outline" className={getConfidenceColor(activePersona.role_context.confidence)} id="role-context-badge">
                              {Math.round(activePersona.role_context.confidence * 100)}%
                              <Tooltip anchorId="role-context-badge" place="top">
                                {getConfidenceTooltip(activePersona.role_context.confidence)}
                              </Tooltip>
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p>{activePersona.role_context.value}</p>
                          
                          {activePersona.role_context.evidence.length > 0 && (
                            <div className="mt-2">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium">Evidence:</h4>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => toggleEvidence('role_context')}
                                  className="h-6 text-xs"
                                >
                                  {expandedTraits['role_context'] ? 'Hide evidence' : 'Show evidence'}
                                </Button>
                              </div>
                              
                              {expandedTraits['role_context'] && (
                                <ul className="list-disc pl-5 mt-1 text-sm text-muted-foreground">
                                  {activePersona.role_context.evidence.map((item, i) => (
                                    <li key={i}>{item}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardHeader>
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-base">Key Responsibilities</CardTitle>
                            <Badge variant="outline" className={getConfidenceColor(activePersona.key_responsibilities.confidence)} id="key-responsibilities-badge">
                              {Math.round(activePersona.key_responsibilities.confidence * 100)}%
                              <Tooltip anchorId="key-responsibilities-badge" place="top">
                                {getConfidenceTooltip(activePersona.key_responsibilities.confidence)}
                              </Tooltip>
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <ul className="list-disc pl-5">
                            {typeof activePersona.key_responsibilities.value === 'string' 
                              ? activePersona.key_responsibilities.value.split('. ').filter(item => item.trim().length > 0).map((item: string, i: number) => (
                              <li key={i}>{item.trim()}</li>
                                ))
                              : (Array.isArray(activePersona.key_responsibilities.value) 
                                  ? (activePersona.key_responsibilities.value as string[]).map((item: string, i: number) => (
                                      <li key={i}>{item}</li>
                                    ))
                                  : <li>{String(activePersona.key_responsibilities.value ?? '')}</li>
                                )
                            }
                          </ul>
                          
                          {activePersona.key_responsibilities.evidence.length > 0 && (
                            <div className="mt-2">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium">Evidence:</h4>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => toggleEvidence('key_responsibilities')}
                                  className="h-6 text-xs"
                                >
                                  {expandedTraits['key_responsibilities'] ? 'Hide evidence' : 'Show evidence'}
                                </Button>
                              </div>
                              
                              {expandedTraits['key_responsibilities'] && (
                                <ul className="list-disc pl-5 mt-1 text-sm text-muted-foreground">
                                  {activePersona.key_responsibilities.evidence.map((item, i) => (
                                    <li key={i}>{item}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardHeader>
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-base">Tools Used</CardTitle>
                            <Badge variant="outline" className={getConfidenceColor(activePersona.tools_used.confidence)} id="tools-used-badge">
                              {Math.round(activePersona.tools_used.confidence * 100)}%
                              <Tooltip anchorId="tools-used-badge" place="top">
                                {getConfidenceTooltip(activePersona.tools_used.confidence)}
                              </Tooltip>
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <ul className="list-disc pl-5">
                            {typeof activePersona.tools_used.value === 'string' 
                              ? activePersona.tools_used.value.split('. ').filter(item => item.trim().length > 0).map((item: string, i: number) => (
                              <li key={i}>{item.trim()}</li>
                                ))
                              : (Array.isArray(activePersona.tools_used.value) 
                                  ? (activePersona.tools_used.value as string[]).map((item: string, i: number) => (
                                      <li key={i}>{item}</li>
                                    ))
                                  : <li>{String(activePersona.tools_used.value ?? '')}</li>
                                )
                            }
                          </ul>
                          
                          {activePersona.tools_used.evidence.length > 0 && (
                            <div className="mt-2">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium">Evidence:</h4>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => toggleEvidence('tools_used')}
                                  className="h-6 text-xs"
                                >
                                  {expandedTraits['tools_used'] ? 'Hide evidence' : 'Show evidence'}
                                </Button>
                              </div>
                              
                              {expandedTraits['tools_used'] && (
                                <ul className="list-disc pl-5 mt-1 text-sm text-muted-foreground">
                                  {activePersona.tools_used.evidence.map((item, i) => (
                                    <li key={i}>{item}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardHeader>
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-base">Pain Points</CardTitle>
                            <Badge variant="outline" className={getConfidenceColor(activePersona.pain_points.confidence)} id="pain-points-badge">
                              {Math.round(activePersona.pain_points.confidence * 100)}%
                              <Tooltip anchorId="pain-points-badge" place="top">
                                {getConfidenceTooltip(activePersona.pain_points.confidence)}
                              </Tooltip>
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <ul className="list-disc pl-5">
                            {typeof activePersona.pain_points.value === 'string' 
                              ? activePersona.pain_points.value.split('. ').filter(item => item.trim().length > 0).map((item: string, i: number) => (
                              <li key={i}>{item.trim()}</li>
                                ))
                              : (Array.isArray(activePersona.pain_points.value) 
                                  ? (activePersona.pain_points.value as string[]).map((item: string, i: number) => (
                                      <li key={i}>{item}</li>
                                    ))
                                  : <li>{String(activePersona.pain_points.value ?? '')}</li>
                                )
                            }
                          </ul>
                          
                          {activePersona.pain_points.evidence.length > 0 && (
                            <div className="mt-2">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium">Evidence:</h4>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => toggleEvidence('pain_points')}
                                  className="h-6 text-xs"
                                >
                                  {expandedTraits['pain_points'] ? 'Hide evidence' : 'Show evidence'}
                                </Button>
                              </div>
                              
                              {expandedTraits['pain_points'] && (
                                <ul className="list-disc pl-5 mt-1 text-sm text-muted-foreground">
                                  {activePersona.pain_points.evidence.map((item, i) => (
                                    <li key={i}>{item}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardHeader>
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-base">Collaboration Style</CardTitle>
                            <Badge variant="outline" className={getConfidenceColor(activePersona.collaboration_style.confidence)} id="collaboration-style-badge">
                              {Math.round(activePersona.collaboration_style.confidence * 100)}%
                              <Tooltip anchorId="collaboration-style-badge" place="top">
                                {getConfidenceTooltip(activePersona.collaboration_style.confidence)}
                              </Tooltip>
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <ul className="list-disc pl-5">
                            {typeof activePersona.collaboration_style.value === 'string' 
                              ? activePersona.collaboration_style.value.split('. ').filter(item => item.trim().length > 0).map((item: string, i: number) => (
                              <li key={i}>{item.trim()}</li>
                                ))
                              : (Array.isArray(activePersona.collaboration_style.value) 
                                  ? (activePersona.collaboration_style.value as string[]).map((item: string, i: number) => (
                                      <li key={i}>{item}</li>
                                    ))
                                  : <li>{String(activePersona.collaboration_style.value ?? '')}</li>
                                )
                            }
                          </ul>
                          
                          {activePersona.collaboration_style.evidence.length > 0 && (
                            <div className="mt-2">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium">Evidence:</h4>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => toggleEvidence('collaboration_style')}
                                  className="h-6 text-xs"
                                >
                                  {expandedTraits['collaboration_style'] ? 'Hide evidence' : 'Show evidence'}
                                </Button>
                              </div>
                              
                              {expandedTraits['collaboration_style'] && (
                                <ul className="list-disc pl-5 mt-1 text-sm text-muted-foreground">
                                  {activePersona.collaboration_style.evidence.map((item, i) => (
                                    <li key={i}>{item}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                      
                      <Card>
                        <CardHeader>
                          <div className="flex justify-between items-center">
                            <CardTitle className="text-base">Analysis Approach</CardTitle>
                            <Badge variant="outline" className={getConfidenceColor(activePersona.analysis_approach.confidence)} id="analysis-approach-badge">
                              {Math.round(activePersona.analysis_approach.confidence * 100)}%
                              <Tooltip anchorId="analysis-approach-badge" place="top">
                                {getConfidenceTooltip(activePersona.analysis_approach.confidence)}
                              </Tooltip>
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <ul className="list-disc pl-5">
                            {typeof activePersona.analysis_approach.value === 'string' 
                              ? activePersona.analysis_approach.value.split('. ').filter(item => item.trim().length > 0).map((item: string, i: number) => (
                              <li key={i}>{item.trim()}</li>
                                ))
                              : (Array.isArray(activePersona.analysis_approach.value) 
                                  ? (activePersona.analysis_approach.value as string[]).map((item: string, i: number) => (
                                      <li key={i}>{item}</li>
                                    ))
                                  : <li>{String(activePersona.analysis_approach.value ?? '')}</li>
                                )
                            }
                          </ul>
                          
                          {activePersona.analysis_approach.evidence.length > 0 && (
                            <div className="mt-2">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-medium">Evidence:</h4>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => toggleEvidence('analysis_approach')}
                                  className="h-6 text-xs"
                                >
                                  {expandedTraits['analysis_approach'] ? 'Hide evidence' : 'Show evidence'}
                                </Button>
                              </div>
                              
                              {expandedTraits['analysis_approach'] && (
                                <ul className="list-disc pl-5 mt-1 text-sm text-muted-foreground">
                                  {activePersona.analysis_approach.evidence.map((item, i) => (
                                    <li key={i}>{item}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-medium mb-2">Common Patterns</h3>
                      {activePersona.patterns && activePersona.patterns.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {activePersona.patterns.map((pattern, index) => (
                            <Badge key={index} variant="outline">{pattern}</Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No common patterns identified for this persona.</p>
                      )}
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="evidence">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-medium mb-2">Supporting Evidence</h3>
                        <ul className="list-disc pl-5 space-y-2">
                          {activePersona.evidence.map((item, index) => (
                            <li key={index}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      
                      {activePersona.metadata && (
                        <div>
                          <h3 className="text-sm font-medium mb-2">Metadata</h3>
                          <div className="bg-muted p-3 rounded text-sm">
                            <p>Sample Size: {activePersona.metadata.sample_size || 'N/A'}</p>
                            {activePersona.metadata.timestamp && (
                              <p>Generated: {new Date(activePersona.metadata.timestamp).toLocaleString()}</p>
                            )}
                            {activePersona.metadata.validation_metrics && (
                              <>
                                <p>Pattern Confidence: {Math.round((activePersona.metadata.validation_metrics.pattern_confidence || 0) * 100)}%</p>
                                <p>Evidence Count: {activePersona.metadata.validation_metrics.evidence_count || 0}</p>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="comparison">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Attribute</th>
                    {personas.map((persona, index) => (
                      <th key={index} className="text-left p-2">{persona.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium">Role Context</td>
                    {personas.map((persona, index) => (
                      <td key={index} className="p-2">{persona.role_context.value}</td>
                    ))}
                  </tr>
                  <tr className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium">Key Responsibilities</td>
                    {personas.map((persona, index) => (
                      <td key={index} className="p-2">
                        {typeof persona.key_responsibilities.value === 'string' 
                          ? persona.key_responsibilities.value 
                          : Array.isArray(persona.key_responsibilities.value)
                            ? persona.key_responsibilities.value.join(', ')
                            : String(persona.key_responsibilities.value ?? '')
                        }
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium">Tools Used</td>
                    {personas.map((persona, index) => (
                      <td key={index} className="p-2">
                        {typeof persona.tools_used.value === 'string' 
                          ? persona.tools_used.value 
                          : Array.isArray(persona.tools_used.value)
                            ? persona.tools_used.value.join(', ')
                            : String(persona.tools_used.value ?? '')
                        }
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium">Pain Points</td>
                    {personas.map((persona, index) => (
                      <td key={index} className="p-2">
                        {typeof persona.pain_points.value === 'string' 
                          ? persona.pain_points.value 
                          : Array.isArray(persona.pain_points.value)
                            ? persona.pain_points.value.join(', ')
                            : String(persona.pain_points.value)
                        }
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium">Collaboration Style</td>
                    {personas.map((persona, index) => (
                      <td key={index} className="p-2">
                        {typeof persona.collaboration_style.value === 'string' 
                          ? persona.collaboration_style.value 
                          : Array.isArray(persona.collaboration_style.value)
                            ? persona.collaboration_style.value.join(', ')
                            : String(persona.collaboration_style.value ?? '')
                        }
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b hover:bg-muted/50">
                    <td className="p-2 font-medium">Analysis Approach</td>
                    {personas.map((persona, index) => (
                      <td key={index} className="p-2">
                        {typeof persona.analysis_approach.value === 'string' 
                          ? persona.analysis_approach.value 
                          : Array.isArray(persona.analysis_approach.value)
                            ? persona.analysis_approach.value.join(', ')
                            : String(persona.analysis_approach.value ?? '')
                        }
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default PersonaList; 