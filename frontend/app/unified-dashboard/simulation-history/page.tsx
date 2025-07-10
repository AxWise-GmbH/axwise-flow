'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, FlaskConical, Download, User, ChevronRight, MessageSquare, Calendar, Users, Briefcase, MapPin, GraduationCap, DollarSign, Building } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/providers/toast-provider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface SimulationResult {
  id: string;
  displayName: string;
  createdAt: string;
  status: string;
  totalPersonas: number;
  totalInterviews: number;
  businessContext?: string;
  stakeholders?: StakeholderGroup[];
}

interface StakeholderGroup {
  type: string;
  interviews: InterviewData[];
}

interface InterviewData {
  id: string;
  personaName: string;
  personaDetails: {
    name: string;
    background: string;
    role: string;
    experience: string;
    age?: number;
    demographic_details?: {
      age_range?: string;
      income_level?: string;
      education?: string;
      location?: string;
      industry_experience?: string;
      company_size?: string;
    };
  };
  responses: Array<{
    question: string;
    response: string;
  }>;
}

interface SelectedInterview {
  simulationId: string;
  stakeholderType: string;
  interview: InterviewData;
  businessContext?: string | {
    business_idea?: string;
    target_customer?: string;
    problem?: string;
    industry?: string;
  };
}

export default function SimulationHistoryPage(): JSX.Element {
  const router = useRouter();
  const { showToast } = useToast();

  const [simulationHistory, setSimulationHistory] = useState<SimulationResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [selectedInterview, setSelectedInterview] = useState<SelectedInterview | null>(null);
  const [expandedSimulations, setExpandedSimulations] = useState<Set<string>>(new Set());

  // Helper function to get brief demographic summary for sidebar
  const getDemographicSummary = (demographics: any, age?: number) => {
    if (!demographics && !age) return null;

    const items = [];
    if (age) items.push(`${age}y`);
    if (demographics?.age_range) items.push(demographics.age_range);
    if (demographics?.location) items.push(demographics.location);
    if (demographics?.education) items.push(demographics.education);

    return items.length > 0 ? items.slice(0, 2).join(' • ') : null;
  };

  // Helper function to render demographic information
  const renderDemographicInfo = (demographics: any) => {
    if (!demographics) return null;

    const demographicItems = [
      { key: 'age_range', label: 'Age Range', icon: User },
      { key: 'education', label: 'Education', icon: GraduationCap },
      { key: 'location', label: 'Location', icon: MapPin },
      { key: 'income_level', label: 'Income Level', icon: DollarSign },
      { key: 'industry_experience', label: 'Industry Experience', icon: Briefcase },
      { key: 'company_size', label: 'Company Size', icon: Building },
    ];

    const validItems = demographicItems.filter(item => demographics[item.key]);

    if (validItems.length === 0) return null;

    return (
      <div className="mb-4 p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
        <div className="flex items-center gap-2 mb-3">
          <User className="h-4 w-4 text-green-600 dark:text-green-400" />
          <span className="font-medium text-green-900 dark:text-green-100 text-sm">Demographics</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {validItems.map(({ key, label, icon: Icon }) => (
            <div key={key} className="flex items-center gap-2">
              <Icon className="h-3 w-3 text-green-600 dark:text-green-400 flex-shrink-0" />
              <span className="text-xs font-medium text-green-800 dark:text-green-200">{label}:</span>
              <span className="text-xs text-green-700 dark:text-green-300">{demographics[key]}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Fetch simulation history from both localStorage and backend API
  const fetchSimulationHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // First, get data from localStorage (immediate)
      const localStorageData = JSON.parse(localStorage.getItem('simulation_results') || '[]');
      console.log('📱 LocalStorage simulation data:', localStorageData);

      // Then try to get data from backend API (may be empty if backend restarted)
      let backendData: any = { simulations: {} };
      try {
        const response = await fetch('/api/research/simulation-bridge/completed');
        if (response.ok) {
          backendData = await response.json();
          console.log('🔗 Backend simulation data:', backendData);
        }
      } catch (backendError) {
        console.warn('Backend API unavailable, using localStorage only:', backendError);
      }

      // Combine data from both sources (localStorage takes priority for recent simulations)
      const allSimulations = new Map<string, any>();

      // Add backend simulations first
      Object.values(backendData.simulations || {}).forEach((sim: any) => {
        allSimulations.set(sim.simulation_id, {
          source: 'backend',
          data: sim
        });
      });

      // Add localStorage simulations (will override backend if same ID)
      localStorageData.forEach((localSim: any, index: number) => {
        console.log(`🔍 Processing localStorage item ${index}:`, localSim);
        const simId = localSim.simulation_id || localSim.results?.simulation_id;
        console.log(`🔍 Extracted simulation ID: ${simId}`);

        if (simId) {
          allSimulations.set(simId, {
            source: 'localStorage',
            data: localSim
          });
          console.log(`✅ Added simulation ${simId} from localStorage`);
        } else {
          console.warn(`⚠️ No simulation ID found in localStorage item ${index}:`, localSim);
        }
      });

      console.log('🔄 Combined simulations:', Array.from(allSimulations.keys()));

      // Convert combined data to enhanced history format
      const simulations = await Promise.all(
        Array.from(allSimulations.values()).map(async ({ source, data }) => {
          try {
            let simulationData: any;
            let simulationId: string;

            if (source === 'localStorage') {
              simulationData = data.results || data;
              simulationId = data.simulation_id || data.results?.simulation_id;
            } else {
              simulationData = data;
              simulationId = data.simulation_id;
            }

            // Try to get detailed data
            let stakeholders: StakeholderGroup[] = [];
            let businessContext = '';

            if (source === 'localStorage' && simulationData.interviews) {
              // Use localStorage data directly
              businessContext = simulationData.business_context || '';

              // Group interviews by stakeholder type
              const stakeholderMap = new Map<string, InterviewData[]>();

              simulationData.interviews?.forEach((interview: any) => {
                const stakeholderType = interview.stakeholder_type || 'Unknown';
                // Check both .people and .data.personas for persona data
                const persona = simulationData.people?.find((p: any) =>
                  p.id === interview.persona_id || p.id === interview.person_id
                ) || simulationData.data?.personas?.find((p: any) =>
                  p.id === interview.persona_id || p.id === interview.person_id
                );

                console.log(`🔍 Processing localStorage interview for ${stakeholderType}:`, {
                  interview_id: interview.id,
                  persona_id: interview.persona_id,
                  person_id: interview.person_id,
                  found_persona: !!persona,
                  persona_name: persona?.name,
                  persona_age: persona?.age,
                  persona_demographic_details: persona?.demographic_details,
                  persona_demographics: persona?.demographics,
                  persona_data: persona,
                  available_people: [
                    ...(simulationData.people?.map((p: any) => ({ id: p.id, name: p.name })) || []),
                    ...(simulationData.data?.personas?.map((p: any) => ({ id: p.id, name: p.name })) || [])
                  ]
                });

                const interviewData: InterviewData = {
                  id: interview.id || `${interview.persona_id || interview.person_id}_${Date.now()}`,
                  personaName: persona?.name || `${stakeholderType} Representative`,
                  personaDetails: {
                    name: persona?.name || `${stakeholderType} Representative`,
                    background: persona?.background || persona?.bio || '',
                    role: persona?.role || persona?.job_title || stakeholderType,
                    experience: persona?.experience || persona?.years_experience || '',
                    age: persona?.age,
                    demographic_details: persona?.demographic_details || persona?.demographics,
                  },
                  responses: interview.responses || [],
                };

                if (!stakeholderMap.has(stakeholderType)) {
                  stakeholderMap.set(stakeholderType, []);
                }
                stakeholderMap.get(stakeholderType)!.push(interviewData);
              });

              stakeholders = Array.from(stakeholderMap.entries()).map(([type, interviews]) => ({
                type,
                interviews,
              }));
            } else if (source === 'backend') {
              // Try to fetch detailed data from backend
              try {
                const detailResponse = await fetch(`/api/research/simulation-bridge/completed/${simulationId}`);
                if (detailResponse.ok) {
                  const detailData = await detailResponse.json();
                  businessContext = detailData.business_context || '';

                  // Group interviews by stakeholder type
                  const stakeholderMap = new Map<string, InterviewData[]>();

                  detailData.interviews?.forEach((interview: any) => {
                    const stakeholderType = interview.stakeholder_type || 'Unknown';
                    // Check both .people and .data.personas for persona data
                    const persona = detailData.people?.find((p: any) =>
                      p.id === interview.persona_id || p.id === interview.person_id
                    ) || detailData.data?.personas?.find((p: any) =>
                      p.id === interview.persona_id || p.id === interview.person_id
                    );

                    console.log(`🔍 Processing backend interview for ${stakeholderType}:`, {
                      interview_id: interview.id,
                      persona_id: interview.persona_id,
                      person_id: interview.person_id,
                      found_persona: !!persona,
                      persona_name: persona?.name,
                      persona_data: persona,
                      available_people: [
                        ...(detailData.people?.map((p: any) => ({ id: p.id, name: p.name })) || []),
                        ...(detailData.data?.personas?.map((p: any) => ({ id: p.id, name: p.name })) || [])
                      ]
                    });

                    const interviewData: InterviewData = {
                      id: interview.id || `${interview.persona_id || interview.person_id}_${Date.now()}`,
                      personaName: persona?.name || `${stakeholderType} Representative`,
                      personaDetails: {
                        name: persona?.name || `${stakeholderType} Representative`,
                        background: persona?.background || persona?.bio || '',
                        role: persona?.role || persona?.job_title || stakeholderType,
                        experience: persona?.experience || persona?.years_experience || '',
                        age: persona?.age,
                        demographic_details: persona?.demographic_details || persona?.demographics,
                      },
                      responses: interview.responses || [],
                    };

                    if (!stakeholderMap.has(stakeholderType)) {
                      stakeholderMap.set(stakeholderType, []);
                    }
                    stakeholderMap.get(stakeholderType)!.push(interviewData);
                  });

                  stakeholders = Array.from(stakeholderMap.entries()).map(([type, interviews]) => ({
                    type,
                    interviews,
                  }));
                }
              } catch (detailError) {
                console.warn(`Failed to fetch backend details for ${simulationId}:`, detailError);
              }
            }

            return {
              id: simulationId,
              displayName: businessContext
                ? `${businessContext.split(' ').slice(0, 4).join(' ')}...`
                : `Simulation ${simulationId.slice(0, 8)}`,
              createdAt: (source === 'localStorage' ? data.timestamp : data.created_at) || new Date().toISOString(),
              status: (source === 'localStorage' ? (simulationData.success ? 'completed' : 'failed') : (data.success ? 'completed' : 'failed')),
              totalPersonas: simulationData.metadata?.total_personas || data.total_personas || 0,
              totalInterviews: simulationData.metadata?.total_interviews || data.total_interviews || 0,
              businessContext,
              stakeholders,
            };
          } catch (error) {
            console.warn(`Failed to process simulation data:`, error);
            return null;
          }
        })
      );

      // Filter out null results and sort by creation date (newest first)
      const validSimulations = simulations.filter(sim => sim !== null);
      validSimulations.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      console.log('✅ Final processed simulations:', validSimulations.length);
      setSimulationHistory(validSimulations);

    } catch (err) {
      console.error('Error fetching simulation history:', err);
      setError(err instanceof Error ? err : new Error('Failed to load simulation history'));
      showToast('Failed to load simulation history', { variant: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchSimulationHistory();
  }, [fetchSimulationHistory]);

  // Toggle simulation expansion
  const toggleSimulationExpansion = (simulationId: string) => {
    const newExpanded = new Set(expandedSimulations);
    if (newExpanded.has(simulationId)) {
      newExpanded.delete(simulationId);
    } else {
      newExpanded.add(simulationId);
    }
    setExpandedSimulations(newExpanded);
  };

  // Select an interview for viewing
  const selectInterview = (simulationId: string, stakeholderType: string, interview: InterviewData) => {
    const simulation = simulationHistory.find(s => s.id === simulationId);
    setSelectedInterview({
      simulationId,
      stakeholderType,
      interview,
      businessContext: simulation?.businessContext,
    });
  };

  // Handle download for simulations (works with both localStorage and backend data)
  const handleDownload = async (simulationId: string) => {
    try {
      let result: any = null;

      // First try to get from localStorage
      const localStorageData = JSON.parse(localStorage.getItem('simulation_results') || '[]');
      const localSim = localStorageData.find((sim: any) =>
        (sim.simulation_id === simulationId) || (sim.results?.simulation_id === simulationId)
      );

      if (localSim) {
        result = localSim.results || localSim;
        console.log('📱 Using localStorage data for download');
      } else {
        // Fallback to backend API
        console.log('🔗 Fetching from backend API for download');
        const response = await fetch(`/api/research/simulation-bridge/completed/${simulationId}`);

        if (!response.ok) {
          throw new Error(`Download failed: ${response.statusText}`);
        }

        result = await response.json();
      }

      if (!result || !result.interviews) {
        throw new Error('No interview data found');
      }

      // Generate comprehensive interview TXT content with full context
      const content = result.interviews.map((interview: any, index: number) => {
        const persona = result.people?.find((p: any) => p.id === interview.persona_id) ||
                       result.personas?.find((p: any) => p.id === interview.persona_id);

        // Format demographic details
        const formatDemographics = (demographics: any) => {
          if (!demographics) return 'Not specified';
          const items = [];
          if (demographics.age_range) items.push(`Age: ${demographics.age_range}`);
          if (demographics.education) items.push(`Education: ${demographics.education}`);
          if (demographics.location) items.push(`Location: ${demographics.location}`);
          if (demographics.income_level) items.push(`Income: ${demographics.income_level}`);
          if (demographics.industry_experience) items.push(`Industry Experience: ${demographics.industry_experience}`);
          if (demographics.company_size) items.push(`Company Size: ${demographics.company_size}`);
          return items.length > 0 ? items.join(', ') : 'Not specified';
        };

        // Get business context from simulation
        const simulation = simulationHistory.find(s => s.id === selectedInterview?.simulationId);
        const businessContext = simulation?.businessContext || selectedInterview?.businessContext || 'Not available';

        return `INTERVIEW ${index + 1}
================

BUSINESS CONTEXT:
-----------------
${businessContext}

PERSONA INFORMATION:
-------------------
Name: ${persona?.name || 'Unknown'}
Stakeholder Category: ${interview.stakeholder_type}
Role/Position: ${persona?.role || 'Unknown'}
Age: ${persona?.age || 'Not specified'}
Background: ${persona?.background || 'Not specified'}

DEMOGRAPHIC DETAILS:
-------------------
${formatDemographics(persona?.demographic_details || persona?.demographics)}

INTERVIEW DIALOGUE:
------------------

${interview.responses.map((response: any) => `Researcher: ${response.question}

${persona?.name || 'Interviewee'}: ${response.response}
`).join('\n---\n')}

================
`;
      }).join('\n\n');

      // Download immediately
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `simulation_interviews_${simulationId.slice(0, 8)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('Interviews downloaded successfully', { variant: 'success' });
    } catch (error) {
      console.error('Download failed:', error);
      showToast('Failed to download interviews', { variant: 'error' });
    }
  };

  // Get status badge
  const getStatusBadge = (status: string): JSX.Element => {
    switch (status) {
      case 'completed':
        return <Badge variant="secondary">Completed</Badge>;
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  // Debug localStorage data
  const debugLocalStorage = () => {
    const localData = localStorage.getItem('simulation_results');
    console.log('🔍 Raw localStorage data:', localData);
    if (localData) {
      try {
        const parsed = JSON.parse(localData);
        console.log('🔍 Parsed localStorage data:', parsed);
        console.log('🔍 Number of items:', parsed.length);
        parsed.forEach((item: any, index: number) => {
          console.log(`🔍 Item ${index}:`, {
            simulation_id: item.simulation_id,
            results_simulation_id: item.results?.simulation_id,
            timestamp: item.timestamp,
            hasResults: !!item.results,
            hasInterviews: !!item.results?.interviews,
            interviewCount: item.results?.interviews?.length || 0,
            hasPeople: !!item.results?.people,
            peopleCount: item.results?.people?.length || 0,
            hasPersonas: !!item.results?.personas,
            personasCount: item.results?.personas?.length || 0,
            businessContext: item.results?.business_context
          });
        });
      } catch (e) {
        console.error('🔍 Failed to parse localStorage data:', e);
      }
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] w-full">
        <div className="w-80 border-r bg-muted/30">
          <div className="p-4 border-b">
            <div className="flex items-center gap-2 mb-2">
              <FlaskConical className="h-5 w-5" />
              <h2 className="font-semibold">Interview Simulations</h2>
            </div>
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading simulation history...</p>
            <Button
              variant="outline"
              size="sm"
              onClick={debugLocalStorage}
            >
              Debug localStorage
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error Loading Simulation History</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] w-full">
      {/* Left Sidebar - Simulation History */}
      <div className="w-80 border-r bg-muted/30">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-2">
            <FlaskConical className="h-5 w-5" />
            <h2 className="font-semibold">Interview Simulations</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            AI persona interview history
          </p>
        </div>

        <ScrollArea className="h-[calc(100%-5rem)]">
          <div className="p-2">
            {simulationHistory.length > 0 ? (
              simulationHistory.map((simulation) => (
                <div key={simulation.id} className="mb-2">
                  <div
                    className="flex items-center justify-between p-3 rounded-lg border bg-background hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => toggleSimulationExpansion(simulation.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <FlaskConical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium text-sm truncate">
                          {simulation.displayName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {new Date(simulation.createdAt).toLocaleDateString()}
                        <Users className="h-3 w-3 ml-2" />
                        {simulation.totalPersonas} personas
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(simulation.status)}
                      <ChevronRight
                        className={`h-4 w-4 transition-transform ${
                          expandedSimulations.has(simulation.id) ? 'rotate-90' : ''
                        }`}
                      />
                    </div>
                  </div>

                  {/* Expanded Stakeholder List */}
                  {expandedSimulations.has(simulation.id) && simulation.stakeholders && (
                    <div className="ml-4 mt-2 space-y-1">
                      {simulation.stakeholders.map((stakeholder, index) => (
                        <div key={stakeholder.type} className={`space-y-1 ${index > 0 ? 'mt-3' : ''}`}>
                          <div className="text-xs font-medium text-muted-foreground px-2 py-1 bg-muted/30 rounded">
                            {stakeholder.type} ({stakeholder.interviews.length})
                          </div>
                          {stakeholder.interviews.map((interview) => {
                            const demographicSummary = getDemographicSummary(
                              interview.personaDetails.demographic_details,
                              interview.personaDetails.age
                            );

                            return (
                              <div
                                key={interview.id}
                                className={`flex flex-col gap-1 p-2 rounded-md cursor-pointer transition-colors text-sm ${
                                  selectedInterview?.interview.id === interview.id
                                    ? 'bg-primary text-primary-foreground'
                                    : 'hover:bg-muted/50'
                                }`}
                                onClick={() => selectInterview(simulation.id, stakeholder.type, interview)}
                              >
                                <div className="flex items-center gap-2">
                                  <User className="h-3 w-3 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="truncate font-medium">
                                      {interview.personaName}
                                    </div>
                                    {interview.personaDetails.role && interview.personaDetails.role !== stakeholder.type && (
                                      <div className="text-xs text-muted-foreground truncate">
                                        {interview.personaDetails.role}
                                      </div>
                                    )}
                                  </div>
                                  <MessageSquare className="h-3 w-3 flex-shrink-0" />
                                </div>
                                {demographicSummary && (
                                  <div className="text-xs text-muted-foreground ml-5 truncate mt-1">
                                    {demographicSummary}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <FlaskConical className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground text-sm">No simulations found.</p>
                <div className="flex flex-col gap-2 mt-4">
                  <Button
                    size="sm"
                    onClick={() => router.push('/unified-dashboard/research')}
                  >
                    Start Simulation
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={debugLocalStorage}
                  >
                    Debug Data
                  </Button>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right Panel - Interview Details */}
      <div className="flex-1 flex flex-col">
        {selectedInterview ? (
          <>
            {/* Interview Header */}
            <div className="p-6 border-b bg-background">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{selectedInterview.interview.personaDetails.name}</h3>
                    <p className="text-sm text-muted-foreground">{selectedInterview.stakeholderType}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload(selectedInterview.simulationId)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </div>

              {/* Business Context */}
              {selectedInterview.businessContext && (
                <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 mb-3">
                    <Briefcase className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="font-medium text-blue-900 dark:text-blue-100 text-sm">Business Context</span>
                  </div>
                  <div className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
                    {/* Try to parse structured business context if it's JSON-like */}
                    {(() => {
                      try {
                        // Check if it's a structured object or just a string
                        if (typeof selectedInterview.businessContext === 'object') {
                          const context = selectedInterview.businessContext;
                          return (
                            <div className="space-y-2">
                              {context.business_idea && (
                                <div><span className="font-medium">Business Idea:</span> {context.business_idea}</div>
                              )}
                              {context.target_customer && (
                                <div><span className="font-medium">Target Customer:</span> {context.target_customer}</div>
                              )}
                              {context.problem && (
                                <div><span className="font-medium">Problem:</span> {context.problem}</div>
                              )}
                              {context.industry && (
                                <div><span className="font-medium">Industry:</span> {context.industry}</div>
                              )}
                            </div>
                          );
                        } else {
                          // Try to parse as JSON string
                          const parsed = JSON.parse(selectedInterview.businessContext);
                          return (
                            <div className="space-y-2">
                              {parsed.business_idea && (
                                <div><span className="font-medium">Business Idea:</span> {parsed.business_idea}</div>
                              )}
                              {parsed.target_customer && (
                                <div><span className="font-medium">Target Customer:</span> {parsed.target_customer}</div>
                              )}
                              {parsed.problem && (
                                <div><span className="font-medium">Problem:</span> {parsed.problem}</div>
                              )}
                              {parsed.industry && (
                                <div><span className="font-medium">Industry:</span> {parsed.industry}</div>
                              )}
                            </div>
                          );
                        }
                      } catch {
                        // Fallback to displaying as plain text
                        return <p>{String(selectedInterview.businessContext)}</p>;
                      }
                    })()}
                  </div>
                </div>
              )}

              {/* Debug Info - Remove this after testing */}
              <div className="mb-4 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                <details>
                  <summary className="cursor-pointer font-medium">Debug: Persona Data</summary>
                  <pre className="mt-2 overflow-auto">
                    {JSON.stringify({
                      age: selectedInterview.interview.personaDetails.age,
                      demographic_details: selectedInterview.interview.personaDetails.demographic_details
                    }, null, 2)}
                  </pre>
                </details>
              </div>

              {/* Demographics */}
              {renderDemographicInfo(selectedInterview.interview.personaDetails.demographic_details)}

              {/* Persona Details */}
              {selectedInterview.interview.personaDetails.background && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-muted-foreground">Role:</span>
                    <p>{selectedInterview.interview.personaDetails.role}</p>
                  </div>
                  {selectedInterview.interview.personaDetails.age && (
                    <div>
                      <span className="font-medium text-muted-foreground">Age:</span>
                      <p>{selectedInterview.interview.personaDetails.age}</p>
                    </div>
                  )}
                  {selectedInterview.interview.personaDetails.experience && (
                    <div>
                      <span className="font-medium text-muted-foreground">Experience:</span>
                      <p>{selectedInterview.interview.personaDetails.experience}</p>
                    </div>
                  )}
                  {selectedInterview.interview.personaDetails.background && (
                    <div className="md:col-span-2">
                      <span className="font-medium text-muted-foreground">Background:</span>
                      <p>{selectedInterview.interview.personaDetails.background}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Interview Chat */}
            <ScrollArea className="flex-1 p-6">
              <div className="space-y-6 max-w-4xl">
                {selectedInterview.interview.responses.map((response, index) => (
                  <div key={index} className="space-y-4">
                    {/* Question */}
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                        <MessageSquare className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-blue-900 dark:text-blue-100">Researcher</span>
                            <span className="text-xs text-blue-600 dark:text-blue-400">Q{index + 1}</span>
                          </div>
                          <p className="text-blue-800 dark:text-blue-200">{response.question}</p>
                        </div>
                      </div>
                    </div>

                    {/* Answer */}
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <User className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="bg-background border p-4 rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-primary">
                              {selectedInterview.interview.personaDetails.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {selectedInterview.stakeholderType}
                            </span>
                            <span className="text-xs text-muted-foreground">A{index + 1}</span>
                          </div>
                          <p>{response.response}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Select an Interview</h3>
              <p className="text-muted-foreground text-sm">
                Choose a simulation and persona from the left to view the interview details
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
