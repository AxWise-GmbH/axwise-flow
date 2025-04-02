'use client';

import React, { useState, useEffect } from 'react';
import { PrioritizedInsight, PriorityInsightsResponse } from '@/types/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiClient } from '@/lib/apiClient';
import { AlertCircle, AlertTriangle, CheckCircle, RefreshCw, WifiOff } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

// Simple skeleton component for loading state
const Skeleton = ({ className }: { className: string }) => (
  <div className={`animate-pulse bg-slate-200 rounded ${className}`}></div>
);

// Error types for more semantic error handling
type ErrorType = 'auth' | 'network' | 'server' | 'notFound' | 'parsing' | 'unknown';

// Enhanced type definitions for pattern and theme original data
interface PatternOriginal {
  name?: string;
  description?: string;
  sentiment?: number;
  frequency?: number;
  category?: string;
  evidence?: string[];
  [key: string]: any; // Allow for additional properties
}

interface ThemeOriginal {
  name?: string;
  definition?: string;
  sentiment?: number;
  frequency?: number;
  examples?: string[];
  [key: string]: any; // Allow for additional properties
}

// Enhanced types for PrioritizedInsight to include proper original data typing
type PrioritizedInsightWithOriginal = PrioritizedInsight & { original: ThemeOriginal | PatternOriginal };

interface ErrorState {
  message: string;
  type: ErrorType;
  retryable: boolean;
  statusCode?: number;
}

// Utility function to categorize errors
const categorizeError = (err: any): ErrorState => {
  if (err.response) {
    // HTTP error response from server
    const statusCode = err.response.status;
    if (statusCode === 401 || statusCode === 403) {
      return { message: 'Authentication error. Please ensure you are logged in.', type: 'auth', retryable: false, statusCode };
    } else if (statusCode === 404) {
      return { message: 'Analysis data not found or not completed yet.', type: 'notFound', retryable: true, statusCode };
    } else if (statusCode >= 500) {
      return { message: 'Server error occurred while calculating priorities.', type: 'server', retryable: true, statusCode };
    } else if (err.response.data?.detail) {
      return { message: err.response.data.detail, type: 'unknown', retryable: true, statusCode };
    }
  } else if (err.request) {
    // Request was made but no response received
    return { message: 'Network error. Please check your connection.', type: 'network', retryable: true };
  } else if (err.message && err.message.includes('JSON')) {
    // JSON parsing error
    return { message: 'Error parsing response data. Please try again.', type: 'parsing', retryable: true };
  }
  
  // Fallback for generic errors
  return { message: err.message || 'An unknown error occurred.', type: 'unknown', retryable: true };
};

export interface PriorityInsightsProps {
  analysisId: string;
}

export function PriorityInsights({ analysisId }: PriorityInsightsProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<ErrorState | null>(null);
  const [priorityData, setPriorityData] = useState<PriorityInsightsResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [retryCount, setRetryCount] = useState(0);
  const [autoRetryAttempts, setAutoRetryAttempts] = useState(0);
  const [autoRetrying, setAutoRetrying] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchPriorityData = async () => {
      try {
        setLoading(true);
        setError(null);
        setErrorDetails(null);
        setAutoRetrying(false);
        
        console.log(`[PriorityInsights] Fetching data for analysis ID: ${analysisId}, attempt ${retryCount + 1}, auto-retry: ${autoRetryAttempts}`);
        const data = await apiClient.getPriorityInsights(analysisId);
        
        console.log(`[PriorityInsights] Success: ${data.insights.length} insights found, high: ${data.metrics.high_urgency_count}, medium: ${data.metrics.medium_urgency_count}, low: ${data.metrics.low_urgency_count}`);
        setPriorityData(data);
        
        // If we successfully load data after errors, show a success toast
        if (retryCount > 0 || autoRetryAttempts > 0) {
          toast({
            title: "Priority Insights Loaded",
            description: `Successfully loaded ${data.insights.length} insights after retry.`,
            variant: "default",
          });
        }
      } catch (err: any) { // Use 'any' type to access error properties
        console.error('Error fetching priority data:', err);
        
        // Use the categorization utility function
        const errorInfo = categorizeError(err);
        setError(errorInfo.message);
        setErrorDetails(errorInfo);
        
        // Log with detailed error information
        console.error(`[PriorityInsights] Error type: ${errorInfo.type}, Status: ${errorInfo.statusCode || 'N/A'}, Message: ${errorInfo.message}`);
        
        // Show toast notification with appropriate variant
        const errorVariant: 'destructive' | 'default' = 
          (errorInfo.type === 'auth' || errorInfo.type === 'server') ? 'destructive' : 'default';
        
        // Custom title based on error type
        let toastTitle = "Error Loading Priority Insights";
        if (errorInfo.type === 'auth') toastTitle = "Authentication Error";
        else if (errorInfo.type === 'network') toastTitle = "Network Error";
        else if (errorInfo.type === 'notFound') toastTitle = "Data Not Found";
        
        toast({
          title: toastTitle,
          description: errorInfo.message,
          variant: errorVariant,
        });
        
        // Implement automatic retry for retryable errors (except auth errors)
        if (errorInfo.retryable && autoRetryAttempts < 2 && errorInfo.type !== 'auth') {
          console.log(`[PriorityInsights] Scheduling auto-retry #${autoRetryAttempts + 1} in 3 seconds...`);
          setAutoRetrying(true);
          setTimeout(() => setAutoRetryAttempts(prev => prev + 1), 3000);
        }
      } finally {
        setLoading(false);
      }
    };

    if (analysisId) {
      fetchPriorityData();
    }
  }, [analysisId, retryCount, autoRetryAttempts, toast]);

  // Reset state for manual retry
  const handleRetry = () => {
    setAutoRetryAttempts(0);
    setRetryCount(prev => prev + 1);
  };
  
  // Filter insights based on active tab
  const filteredInsights = priorityData?.insights.filter(insight => {
    if (activeTab === 'all') return true;
    return insight.urgency === activeTab;
  }) || [];

  // Get urgency icon based on level
  const getUrgencyIcon = (urgency: string) => {
    switch (urgency) {
      case 'high':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'medium':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'low':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      default:
        return null;
    }
  };

  // Get urgency color class
  const getUrgencyColorClass = (urgency: string) => {
    switch (urgency) {
      case 'high':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'medium':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'low':
        return 'bg-green-50 text-green-700 border-green-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  // Get type badge
  const getTypeBadge = (type: 'theme' | 'pattern') => {
    return (
      <Badge
        variant="outline"
        className={type === 'theme' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}
      >
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </Badge>
    );
  };

  // Get error icon based on error type
  const getErrorIcon = () => {
    if (!errorDetails) return <AlertCircle className="h-5 w-5" />;
    
    switch (errorDetails.type) {
      case 'auth':
        return <AlertCircle className="h-5 w-5" />;
      case 'network':
        return <WifiOff className="h-5 w-5" />;
      case 'server':
        return <AlertTriangle className="h-5 w-5" />;
      default:
        return <AlertTriangle className="h-5 w-5" />;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Priority Insights</CardTitle>
          <CardDescription>Unable to load insights</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 border border-red-200 rounded-md bg-red-50 text-red-700 mb-4">
            <div className="flex items-center gap-2 mb-3">
              {getErrorIcon()}
              <span className="font-semibold">
                {errorDetails?.type === 'auth' ? 'Authentication Error' :
                 errorDetails?.type === 'network' ? 'Network Error' :
                 errorDetails?.type === 'server' ? 'Server Error' :
                 errorDetails?.type === 'notFound' ? 'Not Found' : 'Error'}
              </span>
            </div>
            <p>{error}</p>
            {errorDetails?.statusCode && (
              <p className="mt-2 text-sm text-red-600">Status code: {errorDetails.statusCode}</p>
            )}
            {autoRetrying && (
              <p className="mt-2 text-sm flex items-center">
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Automatically retrying in a moment...
              </p>
            )}
          </div>
          {(!autoRetrying && errorDetails?.retryable) && (
            <div className="flex justify-end">
              <button 
                onClick={handleRetry}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
              >
                <RefreshCw className="h-4 w-4 mr-2 inline" />
                Retry Now
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Priority Insights</CardTitle>
        <CardDescription>
          Actionable insights prioritized by sentiment impact
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">
              All ({priorityData?.insights.length || 0})
            </TabsTrigger>
            <TabsTrigger value="high">
              High Priority ({priorityData?.metrics.high_urgency_count || 0})
            </TabsTrigger>
            <TabsTrigger value="medium">
              Medium ({priorityData?.metrics.medium_urgency_count || 0})
            </TabsTrigger>
            <TabsTrigger value="low">
              Low ({priorityData?.metrics.low_urgency_count || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            {filteredInsights.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No {activeTab !== 'all' ? activeTab + ' priority' : ''} insights found
              </div>
            ) : (
              <div className="space-y-4">
                {filteredInsights.map((insight: PrioritizedInsightWithOriginal, index) => (
                  <div
                    key={`${insight.type}-${insight.name}-${index}`}
                    className={`border rounded-lg p-4 ${getUrgencyColorClass(insight.urgency)}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getUrgencyIcon(insight.urgency)}
                        <span className="font-medium capitalize">{insight.urgency} Priority</span>
                        {getTypeBadge(insight.type)}
                        {insight.category && (
                          <Badge variant="outline" className="bg-white">
                            {insight.category}
                          </Badge>
                        )}
                      </div>
                      <Badge variant="outline" className="bg-white">
                        Score: {insight.priority_score}
                      </Badge>
                    </div>
                    
                    <h3 className="text-base font-semibold mb-1">
                      {/* Use description for pattern name if it starts with "Unnamed Pattern" */}
                      {insight.type === 'pattern' && insight.name.startsWith('Unnamed Pattern') 
                        ? insight.description 
                        : insight.name}
                    </h3>
                    
                    {/* Show description only if it's different from the displayed name */}
                    {!(insight.type === 'pattern' && insight.name.startsWith('Unnamed Pattern')) && (
                      <p className="text-sm text-muted-foreground mb-3">{insight.description}</p>
                    )}
                    
                    {/* Display supporting statements (evidence for patterns, examples for themes) */}
                    {insight.type === 'pattern' && (insight.original as PatternOriginal).evidence && (insight.original as PatternOriginal).evidence!.length > 0 && (
                      <div className="mt-2 mb-3 pl-3 border-l-2 border-gray-200">
                        {(insight.original as PatternOriginal).evidence!.map((evidence: string, i: number) => (
                          <p key={i} className="text-sm text-muted-foreground italic mb-2">{evidence}</p>
                        ))}
                      </div>
                    )}
                    {insight.type === 'theme' && (insight.original as ThemeOriginal).examples && (insight.original as ThemeOriginal).examples!.length > 0 && (
                      <div className="mt-2 mb-3 pl-3 border-l-2 border-gray-200">
                        {(insight.original as ThemeOriginal).examples!.map((example: string, i: number) => (
                          <p key={i} className="text-sm text-muted-foreground italic mb-2">{example}</p>
                        ))}
                      </div>
                    )}
                    
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1">
                        <span className="font-medium">Sentiment:</span>
                        <Badge variant="outline" className={insight.sentiment > 0 ? 'bg-green-50' : (insight.sentiment < 0 ? 'bg-red-50' : 'bg-blue-50')}>
                          {insight.sentiment > 0 ? 'Positive' : (insight.sentiment < 0 ? 'Negative' : 'Neutral')}
                        </Badge>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="font-medium">Frequency:</span>
                        <Badge variant="outline" className="bg-white">
                          {Math.round(insight.frequency * 100)}%
                        </Badge>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default PriorityInsights;