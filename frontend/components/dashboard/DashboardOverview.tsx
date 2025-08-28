'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, MessageSquare, Users, FlaskConical, TrendingUp, Calendar, ArrowRight } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/providers/toast-provider';
import VisualizationTabsRefactored from '@/components/visualization/VisualizationTabs';
import { apiClient } from '@/lib/apiClient';

interface DashboardStats {
  researchChats: {
    total: number;
    withQuestionnaires: number;
    recentActivity: string;
  };
  simulations: {
    total: number;
    totalInterviews: number;
    recentActivity: string;
  };
  analyses: {
    total: number;
    totalFiles: number;
    recentActivity: string;
  };
}

// Separate component for visualization mode
function VisualizationMode({ analysisId, visualizationTab }: { analysisId: string; visualizationTab: string }) {
  const { showToast } = useToast();
  const [analysisData, setAnalysisData] = useState<any | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState<boolean>(true);

  // Fetch analysis data when component mounts
  useEffect(() => {
    const fetchAnalysisData = async () => {
      try {
        setLoadingAnalysis(true);
        console.log('VisualizationMode: Fetching analysis data for ID:', analysisId);
        const data = await apiClient.getAnalysisById(analysisId);
        console.log('VisualizationMode: Fetched analysis data:', data);
        setAnalysisData(data);
      } catch (error) {
        console.error('VisualizationMode: Error fetching analysis data:', error);
        showToast('Failed to load analysis data', { variant: 'error' });
      } finally {
        setLoadingAnalysis(false);
      }
    };

    fetchAnalysisData();
  }, [analysisId, showToast]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Visualize Results</h1>
        <p className="text-muted-foreground">
          Explore themes, patterns, personas, and insights from your analysis
        </p>
      </div>

      {/* Visualization Tabs */}
      <div className="mt-8">
        {loadingAnalysis ? (
          <div className="flex justify-center items-center py-12">
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading analysis data...</p>
            </div>
          </div>
        ) : (
          <VisualizationTabsRefactored
            analysisId={analysisId}
            analysisData={analysisData}
            initialTab={visualizationTab}
          />
        )}
      </div>
    </div>
  );
}

export default function DashboardOverview() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Check if we should show visualization tabs (only when explicitly requested)
  const visualizationTab = searchParams.get('visualizationTab');
  const analysisId = searchParams.get('analysisId');
  const shouldShowVisualization = visualizationTab && analysisId && ['themes', 'patterns', 'personas', 'insights', 'priority', 'prd', 'stakeholder-dynamics'].includes(visualizationTab);

  // Debug logging
  console.log('DashboardOverview: URL params debug:', {
    visualizationTab,
    analysisId,
    shouldShowVisualization,
    searchParamsString: searchParams.toString(),
    url: typeof window !== 'undefined' ? window.location.href : 'server-side'
  });

  // If we're in visualization mode, handle that separately without loading dashboard stats
  if (shouldShowVisualization) {
    return <VisualizationMode analysisId={analysisId} visualizationTab={visualizationTab} />;
  }

  // Fetch dashboard statistics only when not in visualization mode
  const fetchDashboardStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch all data in parallel
      const [chatsResponse, simulationsResponse, analysesResponse] = await Promise.allSettled([
        fetch('/api/research/sessions'),
        fetch('/api/research/simulation-bridge/completed'),
        fetch('/api/history')
      ]);

      let researchChats = { total: 0, withQuestionnaires: 0, recentActivity: 'No activity' };
      let simulations = { total: 0, totalInterviews: 0, recentActivity: 'No activity' };
      let analyses = { total: 0, totalFiles: 0, recentActivity: 'No activity' };

      // Process research chats
      if (chatsResponse.status === 'fulfilled' && chatsResponse.value.ok) {
        const chatsData = await chatsResponse.value.json();
        const chats = Array.isArray(chatsData) ? chatsData : [];
        researchChats = {
          total: chats.length,
          withQuestionnaires: chats.filter((chat: any) => chat.has_questionnaire).length,
          recentActivity: chats.length > 0
            ? new Date(chats[0].created_at).toLocaleDateString('en-GB')
            : 'No activity'
        };
      }

      // Process simulations
      if (simulationsResponse.status === 'fulfilled' && simulationsResponse.value.ok) {
        const simulationsData = await simulationsResponse.value.json();
        const sims = Object.values(simulationsData.simulations || {});
        const totalInterviews = sims.reduce((sum: number, sim: any) => sum + (sim.total_interviews || 0), 0);
        simulations = {
          total: sims.length,
          totalInterviews,
          recentActivity: sims.length > 0
            ? new Date((sims[0] as any).created_at || new Date()).toLocaleDateString()
            : 'No activity'
        };
      }

      // Process analyses
      if (analysesResponse.status === 'fulfilled' && analysesResponse.value.ok) {
        const analysesData = await analysesResponse.value.json();
        const analysisResults = Array.isArray(analysesData) ? analysesData : [];
        analyses = {
          total: analysisResults.length,
          totalFiles: analysisResults.length, // Each analysis is one file
          recentActivity: analysisResults.length > 0
            ? new Date(analysisResults[0].createdAt).toLocaleDateString()
            : 'No activity'
        };
      }

      setStats({ researchChats, simulations, analyses });

    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
      setError(err instanceof Error ? err : new Error('Failed to load dashboard'));
      showToast('Failed to load dashboard statistics', { variant: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    // Only fetch dashboard stats if not in visualization mode
    if (!shouldShowVisualization) {
      fetchDashboardStats();
    }
  }, [fetchDashboardStats, shouldShowVisualization]);

  // Loading state for dashboard stats
  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !stats) {
    return (
      <Card className="w-full">
        <CardContent className="flex justify-center items-center py-12">
          <div className="text-center">
            <p className="text-muted-foreground">Failed to load dashboard statistics</p>
            <Button onClick={fetchDashboardStats} className="mt-4">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard Overview</h1>
        <p className="text-muted-foreground">
          Track your research progress across chats, simulations, and analyses
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-3">
            {/* Research Chats Card */}
            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push('/unified-dashboard/research-chat')}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Research Chats</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.researchChats.total}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.researchChats.withQuestionnaires} with questionnaires
                </p>
                <div className="flex items-center pt-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3 mr-1" />
                  Last: {stats.researchChats.recentActivity}
                </div>
              </CardContent>
            </Card>

            {/* Simulations Card */}
            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push('/unified-dashboard/simulation-history')}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Simulations</CardTitle>
                <FlaskConical className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.simulations.total}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.simulations.totalInterviews} total interviews
                </p>
                <div className="flex items-center pt-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3 mr-1" />
                  Last: {stats.simulations.recentActivity}
                </div>
              </CardContent>
            </Card>

            {/* Analyses Card */}
            <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push('/unified-dashboard/analysis-history')}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">File Analyses</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.analyses.total}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.analyses.totalFiles} files processed
                </p>
                <div className="flex items-center pt-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3 mr-1" />
                  Last: {stats.analyses.recentActivity}
                </div>
              </CardContent>
            </Card>
      </div>

      {/* Quick Actions - Full width section */}
      <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Quick Actions
              </CardTitle>
              <CardDescription>
                Start new research activities or continue existing work
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Research Chat */}
                <div className="space-y-3">
                  <Button
                    variant="outline"
                    className="w-full justify-start h-auto p-4"
                    onClick={() => router.push('/customer-research')}
                  >
                    <div className="text-left flex-1">
                      <div className="font-medium">💬 Start Research Chat</div>
                      <div className="text-xs text-muted-foreground">Generate questionnaires</div>
                    </div>
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                  <div className="text-xs text-muted-foreground pl-4 border-l-2 border-muted">
                    Without clear questions, you get vague feedback that doesn't validate or invalidate your hypotheses. Identify problem and generate your tailored questionnaire now!
                  </div>
                </div>

                {/* Simulation */}
                <div className="space-y-3">
                  <Button
                    variant="outline"
                    className="w-full justify-start h-auto p-4"
                    onClick={() => router.push('/unified-dashboard/research')}
                  >
                    <div className="text-left flex-1">
                      <div className="font-medium">🎭 Run Simulation</div>
                      <div className="text-xs text-muted-foreground">AI persona interviews</div>
                    </div>
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                  <div className="text-xs text-muted-foreground pl-4 border-l-2 border-muted">
                    You won't need to coordinate schedules, provide incentives, and manage multiple stakeholder groups. Get your questionnaire answered now!
                  </div>
                </div>

                {/* Upload Files */}
                <div className="space-y-3">
                  <Button
                    variant="outline"
                    className="w-full justify-start h-auto p-4"
                    onClick={() => router.push('/unified-dashboard/upload')}
                  >
                    <div className="text-left flex-1">
                      <div className="font-medium">📤 Upload Files</div>
                      <div className="text-xs text-muted-foreground">Analyze interview data</div>
                    </div>
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                  <div className="text-xs text-muted-foreground pl-4 border-l-2 border-muted">
                    AI analysis removes human bias to uncover breakthrough opportunities hiding in existing user feedback, and does it 100x faster.
                  </div>
                </div>

                {/* View Results */}
                <div className="space-y-3">
                  <Button
                    variant="outline"
                    className="w-full justify-start h-auto p-4"
                    onClick={() => router.push('/unified-dashboard/analysis-history')}
                  >
                    <div className="text-left flex-1">
                      <div className="font-medium">📈 View Results</div>
                      <div className="text-xs text-muted-foreground">Explore insights</div>
                    </div>
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                  <div className="text-xs text-muted-foreground pl-4 border-l-2 border-muted">
                    Visualization transforms research into organizational alignment and coordinated product strategy.
                  </div>
                </div>
              </div>
        </CardContent>
      </Card>
    </div>
  );
}
