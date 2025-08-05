/**
 * Results display component for completed simulations.
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Users,
  MessageSquare,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Download,
  BarChart3,
  Eye,
  CheckCircle2
} from 'lucide-react';

import { SimulationResponse, SimulatedInterview, AIPersona } from '@/lib/api/simulation';

interface SimulationResultsProps {
  simulationResponse: SimulationResponse;
  onAnalyzeResults: () => void;
  onViewDetails: () => void;
  onExportData?: () => void;
  onClose?: () => void;
}

export function SimulationResults({
  simulationResponse,
  onAnalyzeResults,
  onViewDetails,
  onExportData,
  onClose
}: SimulationResultsProps) {
  const [activeTab, setActiveTab] = useState('overview');

  const { personas, interviews, simulation_insights, metadata } = simulationResponse;

  // Download functions
  const downloadInterviewsAsText = () => {
    if (!interviews || interviews.length === 0) {
      alert('No interviews available to download');
      return;
    }

    const content = interviews.map((interview, index) => {
      const persona = personas?.find(p => p.id === interview.persona_id);

      return `INTERVIEW ${index + 1}
================

Persona: ${persona?.name || 'Unknown'}
Stakeholder Type: ${interview.stakeholder_type}

RESPONSES:
----------

${interview.responses.map((response, i) => `Q${i + 1}: ${response.question}

A${i + 1}: ${response.response}
`).join('\n---\n')}

================
`;
    }).join('\n\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulation_interviews_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadPersonasAsText = () => {
    if (!personas || personas.length === 0) {
      alert('No personas available to download');
      return;
    }

    const content = personas.map((persona, index) => `PERSONA ${index + 1}
=============

Name: ${persona.name}
Stakeholder Type: ${persona.stakeholder_type}
Background: ${persona.background}

=============
`).join('\n\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulation_personas_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAllAsJSON = () => {
    const data = {
      simulation_id: simulationResponse.simulation_id,
      metadata: simulationResponse.metadata,
      personas: simulationResponse.personas,
      interviews: simulationResponse.interviews,
      insights: simulationResponse.simulation_insights,
      exported_at: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulation_complete_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Debug logging
  console.log('SimulationResults received:', simulationResponse);
  console.log('Personas count:', personas?.length || 0);
  console.log('Interviews count:', interviews?.length || 0);

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment.toLowerCase()) {
      case 'positive':
        return 'bg-green-100 text-green-800';
      case 'negative':
        return 'bg-red-100 text-red-800';
      case 'mixed':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Simulation Complete
          </DialogTitle>
          <DialogDescription>
            Your AI interview simulation has been completed successfully.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="personas">Personas</TabsTrigger>
            <TabsTrigger value="interviews">Interviews</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[60vh] mt-4">
            <TabsContent value="overview" className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{personas?.length || 0}</div>
                      <div className="text-sm text-muted-foreground">AI Personas</div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{interviews?.length || 0}</div>
                      <div className="text-sm text-muted-foreground">Interviews</div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        {interviews?.reduce((sum, interview) => sum + interview.responses.length, 0) || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Responses</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Overall Sentiment */}
              {simulation_insights && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Overall Sentiment</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Badge className={getSentimentColor(simulation_insights.overall_sentiment)}>
                        {simulation_insights.overall_sentiment}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        Based on {interviews?.length || 0} simulated interviews
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Key Themes */}
              {simulation_insights?.key_themes && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Key Themes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {simulation_insights.key_themes.slice(0, 8).map((theme, index) => (
                        <Badge key={index} variant="secondary">
                          {theme}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Quick Actions */}
              <div className="grid grid-cols-3 gap-3">
                <Button onClick={onAnalyzeResults} className="w-full">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Analyze
                </Button>
                <Button onClick={onViewDetails} variant="outline" className="w-full">
                  <Eye className="h-4 w-4 mr-2" />
                  View
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full">
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={downloadInterviewsAsText}>
                      Download Interviews (TXT)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={downloadPersonasAsText}>
                      Download Personas (TXT)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={downloadAllAsJSON}>
                      Download All Data (JSON)
                    </DropdownMenuItem>
                    {onExportData && (
                      <DropdownMenuItem onClick={onExportData}>
                        Export to Analysis
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </TabsContent>

            <TabsContent value="personas" className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Generated Personas</h3>
                <Button onClick={downloadPersonasAsText} variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
              {personas?.map((persona, index) => (
                <Card key={persona.id}>
                  <CardHeader>
                    <CardTitle className="text-lg">{persona.name}</CardTitle>
                    <CardDescription>
                      Age {persona.age} • {persona.stakeholder_type}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <h4 className="font-medium text-sm mb-1">Background</h4>
                      <p className="text-sm text-muted-foreground">{persona.background}</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm mb-1">Motivations</h4>
                      <div className="flex flex-wrap gap-1">
                        {persona.motivations.map((motivation, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {motivation}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium text-sm mb-1">Pain Points</h4>
                      <div className="flex flex-wrap gap-1">
                        {persona.pain_points.map((pain, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            {pain}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="interviews" className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Simulated Interviews</h3>
                <Button onClick={downloadInterviewsAsText} variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
              {interviews?.map((interview, index) => (
                <Card key={interview.persona_id}>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center justify-between">
                      <span>Interview {index + 1}</span>
                      <div className="flex items-center gap-2">
                        <Badge className={getSentimentColor(interview.overall_sentiment)}>
                          {interview.overall_sentiment}
                        </Badge>
                        <Badge variant="outline">
                          {formatDuration(interview.interview_duration_minutes)}
                        </Badge>
                      </div>
                    </CardTitle>
                    <CardDescription>
                      {interview.stakeholder_type} • {interview.responses.length} responses
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div>
                        <h4 className="font-medium text-sm mb-1">Key Themes</h4>
                        <div className="flex flex-wrap gap-1">
                          {interview.key_themes.map((theme, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {theme}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h4 className="font-medium text-sm mb-1">Sample Response</h4>
                        <p className="text-sm text-muted-foreground">
                          "{interview.responses[0]?.response.substring(0, 150)}..."
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="insights" className="space-y-4">
              {simulation_insights ? (
                <>
                  {/* Recommendations */}
                  {simulation_insights.recommendations && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Lightbulb className="h-5 w-5" />
                          Recommendations
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                          {simulation_insights.recommendations.map((rec, index) => (
                            <li key={index} className="text-sm flex items-start gap-2">
                              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}

                  {/* Opportunities */}
                  {simulation_insights.opportunities && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <TrendingUp className="h-5 w-5 text-green-600" />
                          Opportunities
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                          {simulation_insights.opportunities.map((opp, index) => (
                            <li key={index} className="text-sm flex items-start gap-2">
                              <div className="w-1.5 h-1.5 bg-green-600 rounded-full mt-2 flex-shrink-0"></div>
                              {opp}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}

                  {/* Risks */}
                  {simulation_insights.potential_risks && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-yellow-600" />
                          Potential Risks
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2">
                          {simulation_insights.potential_risks.map((risk, index) => (
                            <li key={index} className="text-sm flex items-start gap-2">
                              <div className="w-1.5 h-1.5 bg-yellow-600 rounded-full mt-2 flex-shrink-0"></div>
                              {risk}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  )}
                </>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center text-muted-foreground">
                      No insights available for this simulation.
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
