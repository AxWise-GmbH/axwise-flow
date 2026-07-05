'use client';

import React, { useEffect, useCallback, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Loader2, ChevronDown, ArrowUpDown, ChevronRight } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { DetailedAnalysisResult } from '@/types/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/providers/toast-provider';
import { apiClient } from '@/lib/apiClient';

/**
 * HistoryPanel Component
 * Displays a list of past analyses and allows selecting one for visualization
 */
export default function HistoryPanel(): JSX.Element {
  const router = useRouter();
  const { showToast } = useToast();

  // Local state for unified history
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'analyses' | 'simulations' | 'chats'>('all');

  // Force component to render on client side
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);
  const [filters, setFilters] = useState({
    sortBy: 'createdAt' as 'createdAt' | 'fileName',
    sortDirection: 'desc' as 'asc' | 'desc',
    status: 'all' as 'all' | 'completed' | 'pending' | 'failed'
  });

  // Memoize the filter change callbacks to prevent re-renders
  const toggleSortDirection = useCallback(() => {
    setFilters(prev => ({
      ...prev,
      sortDirection: prev.sortDirection === 'asc' ? 'desc' : 'asc'
    }));
  }, []);

  const changeSortBy = useCallback((field: 'createdAt' | 'fileName') => {
    setFilters(prev => ({
      ...prev,
      sortBy: field
    }));
  }, []);

  const changeStatusFilter = useCallback((status: 'all' | 'completed' | 'pending' | 'failed') => {
    setFilters(prev => ({
      ...prev,
      status
    }));
  }, []);

  // Fetch history function - use server-side proxy to avoid CORS
  const fetchHistory = useCallback(async () => {
    console.log('HistoryPanel: fetchHistory called with filters:', filters);
    setIsLoading(true);
    setError(null);

    try {
      console.log('HistoryPanel: Fetching history with filters:', filters);

      // Fetch simulation data instead of old analysis data
      const url = '/api/research/simulation-bridge/completed';
      console.log('HistoryPanel: Making API call to:', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        console.log('HistoryPanel: API call successful, received simulation data:', data);

        // Convert simulation data to history format
        const simulationHistory = Object.values(data.simulations || {}).map((sim: any) => ({
          id: sim.simulation_id,
          fileName: `Simulation ${sim.simulation_id.slice(0, 8)}`,
          createdAt: sim.created_at || new Date().toISOString(),
          status: sim.success ? 'completed' : 'failed',
          fileSize: undefined,
          llmProvider: 'Gemini 2.5 Flash',
          type: 'simulation',
          totalPersonas: sim.total_personas,
          totalInterviews: sim.total_interviews
        }));

        console.log('HistoryPanel: Converted to history format:', simulationHistory.length, 'simulations');
        setHistory(simulationHistory);
      } else if (response.status === 401) {
        // Handle authentication errors gracefully
        console.log('HistoryPanel: Authentication required');
        setError(new Error('Please sign in to view your analysis history'));
        setHistory([]); // Clear any existing data
      } else {
        const errorText = await response.text();
        console.error(`HistoryPanel: API call failed: ${response.status} ${response.statusText}`, errorText);
        setError(new Error(`API Error: ${response.status} ${errorText}`));
      }
    } catch (err) {
      console.error('Error fetching analysis history:', err);
      setError(err instanceof Error ? err : new Error('Failed to load history'));
      showToast('Failed to load analysis history', { variant: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [filters, showToast]);

  // Memoize the handleSelectAnalysis function
  const handleSelectAnalysis = useCallback((analysis: DetailedAnalysisResult) => {
    // Navigate to visualization tab with the analysis ID
    const analyzeUrl = `/unified-dashboard?analysisId=${analysis.id}&visualizationTab=themes&timestamp=${Date.now()}`;

    // Use Next.js router for navigation
    router.push(analyzeUrl);
  }, [router]);

  // Fetch history when filters change and component is mounted
  useEffect(() => {
    if (isMounted) {
      fetchHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted, filters]); // Re-fetch when filters change, not when fetchHistory changes

  // Format file size for display - memoize as it's a pure function
  const formatFileSize = useMemo(() => (bytes: number | undefined): string => { // Add return type
    if (!bytes) return 'Unknown';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(2)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
  }, []);

  // Get status badge with valid variants - Simplified to return JSX directly
  const getStatusBadge = useCallback((status: string): JSX.Element => { // Add return type
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
  }, []); // Removed useMemo, simplified return

  // Handle download for simulations
  const handleDownload = async (simulationId: string) => {
    try {
      const response = await fetch(`/api/research/simulation-bridge/completed/${simulationId}`);

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      const result = await response.json();

      // Generate clean interview TXT content
      const content = result.interviews.map((interview: any, index: number) => {
        const persona = result.personas?.find((p: any) => p.id === interview.persona_id);

        return `INTERVIEW ${index + 1}
================

Persona: ${persona?.name || 'Unknown'}
Stakeholder Type: ${interview.stakeholder_type}

RESPONSES:
----------

${interview.responses.map((response: any, i: number) => `Q${i + 1}: ${response.question}

A${i + 1}: ${response.response}
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
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  // Don't render anything until mounted (prevents hydration issues)
  if (!isMounted) {
    return (
      <Card className="w-full">
        <CardContent className="flex justify-center items-center py-12">
          <div className="flex flex-col items-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Initializing...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Loading state
  if (isLoading && history.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="flex justify-center items-center py-12">
          <div className="flex flex-col items-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading simulation history...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error && history.length === 0) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error Loading History</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Activity History</CardTitle>
        <CardDescription>
          Comprehensive view of all your research activities: simulations, file analyses, and chat sessions
        </CardDescription>
      </CardHeader>

      <CardContent>
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            <Input
              placeholder="Search analyses..."
              className="w-full"
              // Implement search functionality if needed
            />
          </div>

          <div className="flex gap-2">
            <Select
              value={filters.status}
              // Use specific type for value in onValueChange
              onValueChange={(value: string) => changeStatusFilter(value as 'all' | 'completed' | 'pending' | 'failed')}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="ml-auto">
                  Sort By <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => changeSortBy('createdAt')}>
                  Date {filters.sortBy === 'createdAt' && '✓'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => changeSortBy('fileName')}>
                  File Name {filters.sortBy === 'fileName' && '✓'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={toggleSortDirection}>
                  {filters.sortDirection === 'desc' ? 'Newest First ✓' : 'Oldest First ✓'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Analysis Table */}
        {history.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">
                    <div className="flex items-center space-x-1">
                      <span>File Name</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-1 h-8 w-8 p-0"
                        onClick={() => {
                          changeSortBy('fileName');
                          if (filters.sortBy === 'fileName') {
                            toggleSortDirection();
                          }
                        }}
                      >
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center space-x-1">
                      <span>Date</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-1 h-8 w-8 p-0"
                        onClick={() => {
                          changeSortBy('createdAt');
                          if (filters.sortBy === 'createdAt') {
                            toggleSortDirection();
                          }
                        }}
                      >
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Status</TableHead>
                  <TableHead className="hidden md:table-cell">Personas</TableHead>
                  <TableHead className="hidden md:table-cell">Interviews</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((analysis) => (
                  <TableRow key={analysis.id}>
                    <TableCell className="font-medium">
                      {analysis.fileName.length > 20
                        ? `${analysis.fileName.substring(0, 20)}...`
                        : analysis.fileName}
                    </TableCell>
                    <TableCell>
                      {new Date(analysis.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {getStatusBadge(analysis.status)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {(analysis as any).totalPersonas || 0}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {(analysis as any).totalInterviews || 0}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(analysis.id)}
                        disabled={analysis.status !== 'completed'}
                      >
                        Download Interviews
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 border rounded-md">
            <p className="text-muted-foreground">No simulations found.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Upload a questionnaire file to run a simulation and get started.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
