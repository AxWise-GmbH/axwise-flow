/**
 * Server Utilities for Data Transformation
 * 
 * These utilities help optimize data transformation on the server
 * before sending to client components.
 */

import type { DetailedAnalysisResult } from '@/types/api';

/**
 * Pre-process themes data on the server
 * This offloads the transformation logic from the client
 */
export function preprocessThemeData(analysisData: DetailedAnalysisResult | null) {
  if (!analysisData || !analysisData.themes) {
    return [];
  }
  
  return analysisData.themes.map((theme: any) => ({
    id: theme.id?.toString() || '',
    name: theme.name || '',
    prevalence: theme.frequency || 0,
    frequency: theme.frequency || 0,
    sentiment: theme.sentiment,
    keywords: theme.keywords || [],
    statements: theme.statements || [],
    examples: theme.examples || [],
    definition: theme.definition || '',
    reliability: theme.reliability,
    process: theme.process,
    codes: theme.codes || []
  }));
}

/**
 * Prepare optimized visualization data package
 * Handles all transformations server-side to reduce client work
 */
export function prepareVisualizationData(analysisData: DetailedAnalysisResult | null) {
  if (!analysisData) {
    return {
      themes: [],
      patterns: [],
      sentiment: null,
      personas: [],
      metadata: {
        fileName: 'No data',
        createdAt: null,
        llmProvider: 'Unknown'
      }
    };
  }
  
  return {
    themes: preprocessThemeData(analysisData),
    patterns: analysisData.patterns || [],
    sentiment: analysisData.sentiment || null,
    sentimentOverview: analysisData.sentimentOverview || { positive: 0, neutral: 0, negative: 0 },
    sentimentStatements: analysisData.sentimentStatements || { positive: [], neutral: [], negative: [] },
    personas: analysisData.personas || [],
    metadata: {
      fileName: analysisData.fileName || 'Unnamed analysis',
      createdAt: analysisData.createdAt,
      llmProvider: analysisData.llmProvider || 'AI'
    }
  };
}

/**
 * Future Enhancement: Server-side data fetching with optimized response
 * This will be part of the Phase 2 implementation
 */
export async function fetchAnalysisWithOptimizedData(analysisId: string) {
  if (typeof window !== 'undefined') {
    throw new Error('This function should only be called on the server');
  }
  
  // In the future, this will directly access the API server-side
  // For now, we're using a placeholder to document the pattern
  const apiClient = await import('@/lib/apiClient').then(mod => mod.apiClient);
  const analysisData = await apiClient.getAnalysisById(analysisId);
  
  return prepareVisualizationData(analysisData);
} 