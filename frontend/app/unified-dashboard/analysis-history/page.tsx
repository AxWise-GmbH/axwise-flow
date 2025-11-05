'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Users, ChevronRight, FileText } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/providers/toast-provider';
import { DetailedAnalysisResult } from '@/types/api';

export default function AnalysisHistoryPage(): JSX.Element {
  const router = useRouter();
  const { showToast } = useToast();
  const hasFetchedRef = useRef(false);
  const renderCountRef = useRef(0);

  const [analysisHistory, setAnalysisHistory] = useState<DetailedAnalysisResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Track renders
  renderCountRef.current += 1;
  console.log(`🔄 [RENDER #${renderCountRef.current}] AnalysisHistoryPage rendered`);

  // Fetch analysis history - use ref to prevent multiple fetches
  useEffect(() => {
    // Prevent multiple fetches (even in Strict Mode)
    if (hasFetchedRef.current) {
      return;
    }
    hasFetchedRef.current = true;

    const fetchAnalysisHistory = async () => {
      console.log('📊 Fetching analysis history...');
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/history');

        if (response.ok) {
          const data = await response.json();
          console.log('✅ Analysis history loaded:', data.length, 'items');
          setAnalysisHistory(Array.isArray(data) ? data : []);
        } else if (response.status === 401) {
          setError(new Error('Please sign in to view your analysis history'));
        } else {
          const errorText = await response.text();
          setError(new Error(`Failed to load analysis history: ${errorText}`));
        }
      } catch (err) {
        console.error('❌ Error fetching analysis history:', err);
        setError(err instanceof Error ? err : new Error('Failed to load analysis history'));
        showToast('Failed to load analysis history', { variant: 'error' });
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalysisHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only fetch once on mount

  // Handle viewing an analysis
  const handleViewAnalysis = useCallback((analysis: DetailedAnalysisResult) => {
    const analyzeUrl = `/unified-dashboard?analysisId=${analysis.id}&visualizationTab=themes&timestamp=${Date.now()}`;
    router.push(analyzeUrl);
  }, [router]);

  // Format file size
  const formatFileSize = (bytes: number | undefined): string => {
    if (!bytes) return 'Unknown';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(2)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
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

  // Loading state
  if (isLoading) {
    return (
      <Card className="w-full">
        <CardContent className="flex justify-center items-center py-12">
          <div className="flex flex-col items-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading analysis history...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error Loading Analysis History</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Analyse Interview History
        </CardTitle>
        <CardDescription>
          View and manage your file-based interview analysis results
        </CardDescription>
      </CardHeader>

      <CardContent>
        {analysisHistory.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File Name</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="hidden md:table-cell">Status</TableHead>
                  <TableHead className="hidden md:table-cell">Size</TableHead>
                  <TableHead className="hidden md:table-cell">Provider</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analysisHistory.map((analysis) => (
                  <TableRow key={analysis.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {analysis.fileName.length > 20
                          ? `${analysis.fileName.substring(0, 20)}...`
                          : analysis.fileName}
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(analysis.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {getStatusBadge(analysis.status)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatFileSize(analysis.fileSize)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {analysis.llmProvider || 'Unknown'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewAnalysis(analysis)}
                        disabled={analysis.status !== 'completed'}
                      >
                        <span className="sr-only md:not-sr-only md:inline-block mr-2">
                          View Results
                        </span>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 border rounded-md">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No analysis results found.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Upload interview files (TXT, CSV, JSON) to analyze customer feedback and generate insights.
            </p>
            <Button
              className="mt-4"
              onClick={() => router.push('/unified-dashboard?tab=upload')}
            >
              Upload Files for Analysis
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
