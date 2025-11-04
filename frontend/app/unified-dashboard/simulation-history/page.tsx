'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, FlaskConical, Download, User, ChevronRight, MessageSquare, Calendar, Users, Briefcase, MapPin, GraduationCap, DollarSign, Building, BarChart3 } from 'lucide-react';
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
    location?: string;
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
            let businessContext: any = '';

            if (source === 'localStorage' && simulationData.interviews) {
              // Use localStorage data directly
              businessContext = simulationData.business_context || simulationData.metadata?.business_context || '';

              // Group interviews by stakeholder type
              const stakeholderMap = new Map<string, InterviewData[]>();
              const allEntries: Array<{ interview: InterviewData; stakeholderType: string }> = [];

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
                allEntries.push({ interview: interviewData, stakeholderType });
              });

              // Disambiguate duplicate base names across clusters for display
              const baseNameCounts = new Map<string, number>();
              allEntries.forEach(({ interview }) => {
                const base = (interview.personaDetails.name || '').split(',')[0].trim();
                if (!base) return;
                baseNameCounts.set(base, (baseNameCounts.get(base) || 0) + 1);
              });
              const duplicates = Array.from(baseNameCounts.entries()).filter(([, c]) => c > 1).map(([n]) => n);
              if (duplicates.length > 0) {
                const dupInfo = duplicates.map((base) => {
                  const samples = allEntries
                    .filter(e => (e.interview.personaDetails.name || '').split(',')[0].trim() === base)
                    .map(e => ({ stakeholderType: e.stakeholderType, role: e.interview.personaDetails.role, age: e.interview.personaDetails.age }));
                  return { base, samples };
                });
                console.warn('🔁 Duplicate person base names across clusters (localStorage):', dupInfo);
              }
              allEntries.forEach(({ interview, stakeholderType }) => {
                const base = (interview.personaDetails.name || '').split(',')[0].trim();
                if (base && (baseNameCounts.get(base) || 0) > 1) {
                  interview.personaName = `${interview.personaDetails.name} • ${stakeholderType}`;
                }
              });

              stakeholders = Array.from(stakeholderMap.entries()).map(([type, interviews]) => ({
                type,
                interviews,
              }));
            } else if (source === 'backend') {
              // Try to fetch detailed data from backend
              try {
                const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                const devToken = process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'DEV_TOKEN_REDACTED';
                // Prefer direct backend endpoint to avoid Next.js route redirect quirk
                let detailResponse = await fetch(`${API_BASE_URL}/api/research/simulation-bridge/completed-item?simulation_id=${encodeURIComponent(simulationId)}` , {
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${devToken}`,
                  },
                });
                // Fallback to Next.js API route proxy if needed
                if (!detailResponse.ok) {
                  detailResponse = await fetch(`/api/research/simulation-bridge/completed/${simulationId}`);
                }
                if (detailResponse.ok) {
                  const detailData = await detailResponse.json();
                  businessContext = detailData.business_context || detailData.metadata?.business_context || '';

                  // Group interviews by stakeholder type
                  const stakeholderMap = new Map<string, InterviewData[]>();
                  const allEntries2: Array<{ interview: InterviewData; stakeholderType: string }> = [];

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
                    allEntries2.push({ interview: interviewData, stakeholderType });
                  });

                  // Disambiguate duplicate base names across clusters for display (backend)
                  const baseNameCounts2 = new Map<string, number>();
                  allEntries2.forEach(({ interview }) => {
                    const base = (interview.personaDetails.name || '').split(',')[0].trim();
                    if (!base) return;
                    baseNameCounts2.set(base, (baseNameCounts2.get(base) || 0) + 1);
                  });
                  const duplicates2 = Array.from(baseNameCounts2.entries()).filter(([, c]) => c > 1).map(([n]) => n);
                  if (duplicates2.length > 0) {
                    const dupInfo2 = duplicates2.map((base) => {
                      const samples = allEntries2
                        .filter(e => (e.interview.personaDetails.name || '').split(',')[0].trim() === base)
                        .map(e => ({ stakeholderType: e.stakeholderType, role: e.interview.personaDetails.role, age: e.interview.personaDetails.age }));
                      return { base, samples };
                    });
                    console.warn('🔁 Duplicate person base names across clusters (backend):', dupInfo2);
                  }
                  allEntries2.forEach(({ interview, stakeholderType }) => {
                    const base = (interview.personaDetails.name || '').split(',')[0].trim();
                    if (base && (baseNameCounts2.get(base) || 0) > 1) {
                      interview.personaName = `${interview.personaDetails.name} • ${stakeholderType}`;
                    }
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

            // Prefer authoritative creation timestamps from metadata when available
            const metaCreatedAt = simulationData?.metadata?.created_at || simulationData?.data?.metadata?.created_at;
            const createdAt = (metaCreatedAt || (source === 'localStorage' ? data.timestamp : data.created_at) || new Date().toISOString());

            // Prefer totals from detailed data (simulationData.metadata) when available; fallback to summary
            const totalPersonas = (simulationData?.metadata?.total_personas ?? data.total_personas ?? 0);
            const totalInterviews = (simulationData?.metadata?.total_interviews ?? data.total_interviews ?? 0);

            const businessContextStr = typeof businessContext === 'string' ? businessContext : JSON.stringify(businessContext);
            return {
              id: simulationId,
              displayName: businessContextStr
                ? `${businessContextStr.split(' ').slice(0, 4).join(' ')}...`
                : `Simulation ${simulationId.slice(0, 8)}`,
              createdAt,
              status: (source === 'localStorage' ? (simulationData.success ? 'completed' : 'failed') : (data.success ? 'completed' : 'failed')),
              totalPersonas,
              totalInterviews,
              businessContext: businessContextStr,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only fetch once on mount

  // Add localStorage monitoring for real-time updates
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'simulation_results') {
        console.log('🔄 localStorage simulation_results changed, refreshing...');
        fetchSimulationHistory();
      }
    };

    // Listen for storage events (from other tabs/windows)
    window.addEventListener('storage', handleStorageChange);

    // Also listen for custom events (from same tab)
    const handleCustomStorageChange = () => {
      console.log('🔄 Custom storage change event, refreshing...');
      fetchSimulationHistory();
    };

    window.addEventListener('localStorageUpdated', handleCustomStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('localStorageUpdated', handleCustomStorageChange);
    };
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

  // Handle analysis for simulations - direct bridge to analysis pipeline
  const handleAnalyze = async (simulationId: string) => {
    try {
      console.log('🔬 Starting analysis for simulation:', simulationId);

      // Call the analysis bridge endpoint
      const response = await fetch(`/api/research/simulation-bridge/analyze/${simulationId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          llm_provider: 'gemini',
          llm_model: 'gemini-2.0-flash-exp',
          analysis_type: 'comprehensive_simulation',
          include_stakeholder_breakdown: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('✅ Analysis bridge result:', result);

      if (result.success) {
        showToast(
          `Analysis started for ${result.preview.total_interviews} interviews across ${result.preview.stakeholder_types.length} stakeholder types`,
          { variant: 'success' }
        );

        // TODO: Navigate to analysis results when ready
        // For now, show success message with next steps
        console.log('📊 Analysis will be available at:', result.next_steps.analysis_url_pattern);
      } else {
        throw new Error(result.message || 'Analysis failed');
      }
    } catch (error) {
      console.error('Analysis failed:', error);
      showToast('Failed to start analysis', { variant: 'error' });
    }
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
        const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const devToken = process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'DEV_TOKEN_REDACTED';
        let response = await fetch(`${API_BASE_URL}/api/research/simulation-bridge/completed-item?simulation_id=${encodeURIComponent(simulationId)}` , {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${devToken}`,
          },
        });
        if (!response.ok) {
          response = await fetch(`/api/research/simulation-bridge/completed/${simulationId}`);
        }

        if (!response.ok) {
          throw new Error(`Download failed: ${response.statusText}`);
        }

        result = await response.json();
      }

      if (!result || !result.interviews) {
        throw new Error('No interview data found');
      }

      // Generate enhanced header
      let content = `SYNTHETIC INTERVIEW SIMULATION RESULTS\n`;
      content += `${'='.repeat(50)}\n\n`;

      // Simulation metadata
      content += `SIMULATION METADATA\n`;
      content += `${'-'.repeat(20)}\n`;
      content += `Simulation ID: ${simulationId}\n`;
      content += `Generated: ${new Date().toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Berlin'
      })}\n`;
      content += `Total Interviews: ${result.interviews.length}\n`;
      content += `Total Stakeholder Types: ${[...new Set(result.interviews.map((i: any) => i.stakeholder_type))].length}\n\n`;

      // Business context
      const businessContext = result.business_context || result.metadata?.business_context;
      if (businessContext) {
        content += `BUSINESS CONTEXT\n`;
        content += `${'-'.repeat(16)}\n`;
        content += `Business Idea: ${businessContext.business_idea || businessContext}\n`;
        if (businessContext.target_customer) {
          content += `Target Customer: ${businessContext.target_customer}\n`;
        }
        if (businessContext.problem) {
          content += `Problem Statement: ${businessContext.problem}\n`;
        }
        content += `\n`;
      }

      // Stakeholder summary
      const stakeholderGroups = result.interviews.reduce((acc: any, interview: any) => {
        const type = interview.stakeholder_type;
        if (!acc[type]) acc[type] = [];
        acc[type].push(interview);
        return acc;
      }, {});

      content += `STAKEHOLDER BREAKDOWN\n`;
      content += `${'-'.repeat(21)}\n`;
      Object.entries(stakeholderGroups).forEach(([type, interviewList]: [string, any]) => {
        content += `• ${type}: ${interviewList.length} interview${interviewList.length > 1 ? 's' : ''}\n`;
      });
      content += `\n${'='.repeat(50)}\n\n`;

      // Generate detailed interviews
      result.interviews.forEach((interview: any, index: number) => {
        const person = result.people?.find((p: any) => p.id === (interview.person_id || interview.persona_id)) ||
                      result.personas?.find((p: any) => p.id === (interview.person_id || interview.persona_id));
        const baseTimestamp = new Date();
        const interviewStartTime = new Date(baseTimestamp.getTime() + (index * 30 * 60 * 1000)); // 30 minutes between interviews

        content += `INTERVIEW ${index + 1} OF ${result.interviews.length}\n`;
        content += `${'='.repeat(30)}\n\n`;

        // Interview metadata
        content += `INTERVIEW METADATA\n`;
        content += `${'-'.repeat(18)}\n`;
        content += `Interview ID: ${interview.person_id || interview.persona_id || `INT-${index + 1}`}\n`;
        content += `Conducted: ${interviewStartTime.toLocaleString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Europe/Berlin'
        })}\n`;
        content += `Duration: ${interview.interview_duration_minutes || 'N/A'} minutes\n`;
        content += `Stakeholder Category: ${interview.stakeholder_type}\n`;
        if (interview.overall_sentiment) {
          content += `Overall Sentiment: ${interview.overall_sentiment}\n`;
        }
        content += `\n`;

        // Persona details
        if (person) {
          content += `INTERVIEWEE PROFILE\n`;
          content += `${'-'.repeat(19)}\n`;
          content += `Name: ${person.name}\n`;
          content += `Age: ${person.age || 'Not specified'}\n`;
          content += `Role/Position: ${person.name.split(',')[1]?.trim() || 'Not specified'}\n`;
          content += `Background: ${person.background || 'Not specified'}\n\n`;

          if (person.demographics) {
            content += `DEMOGRAPHIC DETAILS\n`;
            content += `${'-'.repeat(19)}\n`;
            Object.entries(person.demographics).forEach(([key, value]) => {
              const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
              content += `${formattedKey}: ${value}\n`;
            });
            content += `\n`;
          }

          if (person.profile?.motivations || person.profile?.pain_points) {
            content += `PROFILE INSIGHTS\n`;
            content += `${'-'.repeat(16)}\n`;
            if (person.profile.motivations) {
              content += `Key Motivations:\n`;
              person.profile.motivations.forEach((motivation: string, i: number) => {
                content += `  ${i + 1}. ${motivation}\n`;
              });
              content += `\n`;
            }
            if (person.profile.pain_points) {
              content += `Main Pain Points:\n`;
              person.profile.pain_points.forEach((pain: string, i: number) => {
                content += `  ${i + 1}. ${pain}\n`;
              });
              content += `\n`;
            }
          }
        }

        // Interview themes
        if (interview.key_themes && interview.key_themes.length > 0) {
          content += `KEY THEMES IDENTIFIED\n`;
          content += `${'-'.repeat(21)}\n`;
          interview.key_themes.forEach((theme: string, i: number) => {
            content += `• ${theme}\n`;
          });
          content += `\n`;
        }

        // Interview dialogue
        content += `INTERVIEW DIALOGUE\n`;
        content += `${'-'.repeat(18)}\n\n`;

        if (interview.responses && interview.responses.length > 0) {
          interview.responses.forEach((response: any, i: number) => {
            const questionTime = new Date(interviewStartTime.getTime() + (i * 3 * 60 * 1000)); // 3 minutes per Q&A
            const responseTime = new Date(questionTime.getTime() + (1 * 60 * 1000)); // 1 minute later

            content += `[${questionTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}] Researcher: ${response.question}\n\n`;
            content += `[${responseTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}] ${person?.name?.split(',')[0] || 'Interviewee'}: ${response.response}\n\n`;

            if (response.key_insights && response.key_insights.length > 0) {
              content += `    💡 Key Insights: ${response.key_insights.join(', ')}\n\n`;
            }

            if (i < interview.responses.length - 1) {
              content += `${'-'.repeat(40)}\n\n`;
            }
          });
        }

        content += `\n${'='.repeat(50)}\n\n`;
      });

      // Footer
      content += `SIMULATION SUMMARY\n`;
      content += `${'-'.repeat(18)}\n`;
      content += `Total Questions Asked: ${result.interviews.reduce((sum: number, interview: any) => sum + (interview.responses?.length || 0), 0)}\n`;
      content += `Average Interview Duration: ${Math.round(result.interviews.reduce((sum: number, interview: any) => sum + (interview.interview_duration_minutes || 0), 0) / result.interviews.length)} minutes\n`;
      content += `Generated by: AxWise AI Interview Simulation\n`;
      content += `Export Date: ${new Date().toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Berlin'
      })}\n`;

      // Download the enhanced file
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `enhanced_interviews_${simulationId.slice(0, 8)}_${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast('Enhanced interviews downloaded successfully', { variant: 'success' });
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
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5" />
              <h2 className="font-semibold">Interview Simulations</h2>
            </div>
            <Button
              onClick={() => {
                console.log('🔄 Manual refresh triggered');
                fetchSimulationHistory();
              }}
              variant="outline"
              size="sm"
            >
              Refresh
            </Button>
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
                      <div className="flex gap-1 ml-2">
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(simulation.id);
                          }}
                          variant="outline"
                          size="sm"
                          className="h-7 px-2"
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAnalyze(simulation.id);
                          }}
                          variant="default"
                          size="sm"
                          className="h-7 px-2"
                        >
                          <BarChart3 className="h-3 w-3" />
                        </Button>
                      </div>
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
            {/* Compact Interview Header */}
            <div className="p-4 border-b bg-background flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-base">{selectedInterview.interview.personaDetails.name}</h3>
                    <p className="text-xs text-muted-foreground">{selectedInterview.stakeholderType}</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(selectedInterview.simulationId)}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Export
                </Button>
              </div>

              {/* Collapsible Details Section */}
              <div className="space-y-2">
                {/* Business Context - Collapsible */}
                {selectedInterview.businessContext && (
                  <details className="group">
                    <summary className="cursor-pointer flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950/20 rounded border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-950/30">
                      <Briefcase className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                      <span className="font-medium text-blue-900 dark:text-blue-100 text-xs">Business Context</span>
                      <span className="ml-auto text-xs text-blue-600 dark:text-blue-400 group-open:rotate-90 transition-transform">▶</span>
                    </summary>
                    <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded border border-blue-200 dark:border-blue-800">
                      <div className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                        {(() => {
                          try {
                            if (typeof selectedInterview.businessContext === 'object') {
                              const context = selectedInterview.businessContext;
                              return (
                                <div className="space-y-1">
                                  {context.business_idea && (
                                    <div><span className="font-medium">Idea:</span> {context.business_idea}</div>
                                  )}
                                  {context.target_customer && (
                                    <div><span className="font-medium">Customer:</span> {context.target_customer}</div>
                                  )}
                                  {context.problem && (
                                    <div><span className="font-medium">Problem:</span> {context.problem}</div>
                                  )}
                                  {context.industry && (
                                    <div><span className="font-medium">Industry:</span> {context.industry}</div>
                                  )}
                                  {context.location && (
                                    <div><span className="font-medium">Location:</span> {context.location}</div>
                                  )}

                                </div>
                              );
                            } else {
                              const parsed = JSON.parse(selectedInterview.businessContext);
                              return (
                                <div className="space-y-1">
                                  {parsed.business_idea && (
                                    <div><span className="font-medium">Idea:</span> {parsed.business_idea}</div>
                                  )}
                                  {parsed.target_customer && (
                                    <div><span className="font-medium">Customer:</span> {parsed.target_customer}</div>
                                  )}
                                  {parsed.problem && (
                                    <div><span className="font-medium">Problem:</span> {parsed.problem}</div>
                                  )}
                                  {parsed.industry && (
                                    <div><span className="font-medium">Industry:</span> {parsed.industry}</div>
                                  )}
                                  {parsed.location && (
                                    <div><span className="font-medium">Location:</span> {parsed.location}</div>
                                  )}
                                </div>
                              );
                            }
                          } catch {
                            return <p>{String(selectedInterview.businessContext)}</p>;
                          }
                        })()}
                      </div>
                    </div>
                  </details>
                )}

                {/* Demographics - Collapsible */}
                <details className="group">
                  <summary className="cursor-pointer flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/20 rounded border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-950/30">
                    <User className="h-3 w-3 text-green-600 dark:text-green-400" />
                    <span className="font-medium text-green-900 dark:text-green-100 text-xs">Demographics & Details</span>
                    <span className="ml-auto text-xs text-green-600 dark:text-green-400 group-open:rotate-90 transition-transform">▶</span>
                  </summary>
                  <div className="mt-2 p-3 bg-green-50 dark:bg-green-950/20 rounded border border-green-200 dark:border-green-800">
                    <div className="space-y-2">
                      {/* Demographics */}
                      {renderDemographicInfo(selectedInterview.interview.personaDetails.demographic_details)}

                      {/* Persona Details */}
                      {selectedInterview.interview.personaDetails.background && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs mt-2">
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
                  </div>
                </details>
              </div>
            </div>

            {/* Interview Chat - Now gets much more space */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4 space-y-4 max-w-4xl">
                {selectedInterview.interview.responses.map((response, index) => (
                  <div key={index} className="space-y-3">
                    {/* Question */}
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
                        <MessageSquare className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 p-3 rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-blue-900 dark:text-blue-100">Researcher</span>
                            <span className="text-xs text-blue-600 dark:text-blue-400">Q{index + 1}</span>
                          </div>
                          <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">{response.question}</p>
                        </div>
                      </div>
                    </div>

                    {/* Answer */}
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <User className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="bg-background border p-3 rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-primary">
                              {selectedInterview.interview.personaDetails.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {selectedInterview.stakeholderType}
                            </span>
                            <span className="text-xs text-muted-foreground">A{index + 1}</span>
                          </div>
                          <p className="text-sm leading-relaxed">{response.response}</p>
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
