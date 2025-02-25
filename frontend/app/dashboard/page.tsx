'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/loading-spinner';
import { useToast } from '@/components/providers/toast-provider';
import { ErrorBoundary } from '@/components/error-boundary';
import { apiClient } from '@/lib/apiClient';
import type { DetailedAnalysisResult } from '@/types/api';

/**
 * Dashboard Page
 * Displays a list of previous analyses
 */
export default function DashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [analyses, setAnalyses] = useState<DetailedAnalysisResult[]>([]);
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');

  useEffect(() => {
    async function fetchAnalyses() {
      try {
        setLoading(true);
        
        // In development, we can use mock data for faster testing
        if (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_...=***REMOVED*** 'true') {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const mockData: DetailedAnalysisResult[] = [
            {
              id: '1',
              status: 'completed',
              createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
              fileName: 'interview_data_1.json',
              fileSize: 1024 * 1024 * 2, // 2MB
              themes: [],
              patterns: [],
              sentimentOverview: {
                positive: 0.6,
                neutral: 0.3,
                negative: 0.1,
              },
              sentiment: [],
            },
            {
              id: '2',
              status: 'pending',
              createdAt: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
              fileName: 'interview_data_2.json',
              fileSize: 1024 * 1024 * 1.5, // 1.5MB
              themes: [],
              patterns: [],
              sentimentOverview: {
                positive: 0,
                neutral: 0,
                negative: 0,
              },
              sentiment: [],
            },
            {
              id: '3',
              status: 'failed',
              createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
              fileName: 'interview_data_3.json',
              fileSize: 1024 * 1024 * 3, // 3MB
              themes: [],
              patterns: [],
              sentimentOverview: {
                positive: 0,
                neutral: 0,
                negative: 0,
              },
              sentiment: [],
              error: 'File format not supported',
            },
          ];
          
          setAnalyses(mockData);
        } else {
          // Use the API client to fetch real data
          try {
            const apiParams = {
              sortBy: sortBy === 'date' ? 'createdAt' as const : 'fileName' as const,
              sortDirection: sortDirection,
              status: filterStatus === 'all' ? undefined : filterStatus,
            };
            
            const data = await apiClient.listAnalyses(apiParams);
            setAnalyses(data);
          } catch (apiError) {
            console.error('API error:', apiError);
            // Fallback to mock data if API fails
            const mockData: DetailedAnalysisResult[] = [
              {
                id: '1',
                status: 'completed',
                createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
                fileName: 'interview_data_1.json',
                fileSize: 1024 * 1024 * 2, // 2MB
                themes: [],
                patterns: [],
                sentimentOverview: {
                  positive: 0.6,
                  neutral: 0.3,
                  negative: 0.1,
                },
                sentiment: [],
              },
              {
                id: '2',
                status: 'pending',
                createdAt: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
                fileName: 'interview_data_2.json',
                fileSize: 1024 * 1024 * 1.5, // 1.5MB
                themes: [],
                patterns: [],
                sentimentOverview: {
                  positive: 0,
                  neutral: 0,
                  negative: 0,
                },
                sentiment: [],
              },
            ];
            
            setAnalyses(mockData);
            showToast('Using mock data - API connection failed', { variant: 'info' });
          }
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching analyses:', err);
        setError(err instanceof Error ? err : new Error('Failed to fetch analyses'));
        setLoading(false);
        showToast('Failed to load analyses', { variant: 'error' });
      }
    }

    fetchAnalyses();
  }, [showToast, sortBy, sortDirection, filterStatus]);

  // Filter and sort analyses
  const filteredAndSortedAnalyses = analyses
    .filter(analysis => {
      if (filterStatus === 'all') return true;
      return analysis.status === filterStatus;
    })
    .sort((a, b) => {
      if (sortBy === 'date') {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
      } else {
        // Sort by name
        return sortDirection === 'asc'
          ? a.fileName.localeCompare(b.fileName)
          : b.fileName.localeCompare(a.fileName);
      }
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner size="lg" label="Loading analyses..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-destructive/10 text-destructive p-4 rounded-md">
          <h2 className="text-lg font-semibold mb-2">Error Loading Analyses</h2>
          <p>{error.message}</p>
          <button 
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md"
            onClick={() => window.location.reload()}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              View and manage your interview analyses
            </p>
          </div>
          
          <div className="mt-4 md:mt-0">
            <button
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
              onClick={() => router.push('/')}
            >
              New Analysis
            </button>
          </div>
        </div>
        
        <div className="bg-card p-6 rounded-lg shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Recent Analyses</h2>
            
            <div className="mt-4 md:mt-0 flex flex-wrap items-center gap-4">
              <select
                className="px-2 py-1 border border-border rounded-md bg-background text-sm"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
              
              <select
                className="px-2 py-1 border border-border rounded-md bg-background text-sm"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
              >
                <option value="date">Sort by Date</option>
                <option value="name">Sort by Name</option>
              </select>
              
              <button
                className="p-1 border border-border rounded-md"
                onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
              >
                {sortDirection === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
          
          {filteredAndSortedAnalyses.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No analyses found</p>
              <button
                className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md"
                onClick={() => router.push('/')}
              >
                Create Your First Analysis
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAndSortedAnalyses.map((analysis) => (
                <AnalysisCard key={analysis.id} analysis={analysis} />
              ))}
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}

/**
 * Analysis Card Component
 * Displays a summary of an analysis
 */
function AnalysisCard({ analysis }: { analysis: DetailedAnalysisResult }) {
  // Format file size
  const formatFileSize = (bytes: number | undefined) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="border border-border rounded-lg p-4 hover:bg-muted/20 transition-colors">
      <div className="flex flex-col md:flex-row md:items-center justify-between">
        <div>
          <Link href={`/results/${analysis.id}`} className="text-lg font-medium hover:underline">
            {analysis.fileName}
          </Link>
          <div className="flex flex-wrap items-center gap-x-4 mt-1 text-sm text-muted-foreground">
            <span>Created: {formatDate(analysis.createdAt)}</span>
            {analysis.fileSize && <span>Size: {formatFileSize(analysis.fileSize)}</span>}
          </div>
        </div>
        
        <div className="mt-4 md:mt-0 flex items-center gap-4">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
            analysis.status === 'completed' 
              ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
              : analysis.status === 'failed'
              ? 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
              : 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100'
          }`}>
            {analysis.status}
          </span>
          
          <Link 
            href={`/results/${analysis.id}`}
            className="px-3 py-1 bg-primary/10 text-primary hover:bg-primary/20 rounded-md text-sm"
          >
            View
          </Link>
        </div>
      </div>
      
      {analysis.status === 'failed' && analysis.error && (
        <div className="mt-3 text-sm text-destructive">
          Error: {analysis.error}
        </div>
      )}
      
      {analysis.status === 'completed' && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded">
            <span className="text-xs text-muted-foreground">Positive</span>
            <p className="font-medium text-green-700 dark:text-green-300">
              {(analysis.sentimentOverview.positive * 100).toFixed(0)}%
            </p>
          </div>
          <div className="text-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
            <span className="text-xs text-muted-foreground">Neutral</span>
            <p className="font-medium text-blue-700 dark:text-blue-300">
              {(analysis.sentimentOverview.neutral * 100).toFixed(0)}%
            </p>
          </div>
          <div className="text-center p-2 bg-red-50 dark:bg-red-900/20 rounded">
            <span className="text-xs text-muted-foreground">Negative</span>
            <p className="font-medium text-red-700 dark:text-red-300">
              {(analysis.sentimentOverview.negative * 100).toFixed(0)}%
            </p>
          </div>
        </div>
      )}
    </div>
  );
}