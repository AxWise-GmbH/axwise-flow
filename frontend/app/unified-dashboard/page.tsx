'use client';

/**
 * UnifiedDashboard Component (DEPRECATED)
 * 
 * DEPRECATION WARNING: This implementation is being replaced by page-refactored.tsx.
 * It uses the UnifiedVisualization component which is being phased out in favor of 
 * directly using specialized visualization components through VisualizationTabs.
 * 
 * Key issues with this implementation:
 * 1. Uses the deprecated UnifiedVisualization component which creates duplicate UI elements
 * 2. Implements custom tab navigation instead of using the standardized VisualizationTabs
 * 3. Directly renders ThemeChart, PatternList, etc. through UnifiedVisualization, creating 
 *    duplicate Key Insights sections and inconsistent UX
 * 
 * DO NOT use this implementation as a reference for new development.
 * Please refer to page-refactored.tsx instead, which follows the current architectural 
 * pattern of using VisualizationTabs directly with specialized visualization components.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/loading-spinner';
import { useToast } from '@/components/providers/toast-provider';
import UnifiedVisualization from '@/components/visualization/UnifiedVisualization';
import { apiClient } from '@/lib/apiClient';
import { UploadResponse, AnalysisResponse, DetailedAnalysisResult, SentimentData } from '@/types/api';
import { useAuth } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileText } from 'lucide-react';
import AnalysisProgress from '@/components/AnalysisProgress';

// Add this type declaration at the top of the file, after imports
declare global {
  interface Window {
    isUnmounting?: boolean;
    consolePatchApplied?: boolean;
    reactWarningsShown?: Set<string>;
    __inReactLifecycle?: boolean;
  }
}

// Add this debounce function after imports
function debounce<T extends (...args: any[]) => any>(fn: T, ms = 300) {
  let timeoutId: ReturnType<typeof setTimeout>;
  return function(this: any, ...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), ms);
  };
}

export default function UnifiedDashboard() {
  const router = useRouter();
  const { showToast } = useToast();
  const { userId, isLoaded } = useAuth();
  
  // State for active tab
  const [activeTab, setActiveTab] = useState<'upload' | 'visualize' | 'history' | 'documentation'>('upload');
  
  // State for visualization sub-tab
  const [visualizationTab, setVisualizationTab] = useState<'themes' | 'patterns' | 'sentiment' | 'personas'>('themes');
  
  // Upload and analysis state
  const [file, setFile] = useState<File | null>(null);
  const [isTextFile, setIsTextFile] = useState<boolean>(false);
  const [uploadResponse, setUploadResponse] = useState<UploadResponse | null>(null);
  const [analysisResponse, setAnalysisResponse] = useState<AnalysisResponse | null>(null);
  const [results, setResults] = useState<DetailedAnalysisResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string>('testuser123');
  const [llmProvider, setLlmProvider] = useState<'openai' | 'gemini'>('gemini');
  
  // History state
  const [analyses, setAnalyses] = useState<DetailedAnalysisResult[]>([]);
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<Error | null>(null);
  
  // Add a ref to track tab changes
  const previousTabRef = useRef<string>(visualizationTab);
  
  // Use a debounced version of setVisualizationTab
  const debouncedSetVisualizationTab = useCallback(
    debounce((newTab: 'themes' | 'patterns' | 'sentiment' | 'personas') => {
      setVisualizationTab(newTab);
    }, 100),
    []
  );
  
  // Handle authentication redirection within useEffect
  useEffect(() => {
    if (isLoaded && !userId) {
      router.push('/sign-in');
    }
  }, [isLoaded, userId, router]);
  
  // Get tab from URL query parameter
  useEffect(() => {
    // Only run on the client side
    if (typeof window !== 'undefined') {
      // Check for URL parameters
      const searchParams = new URLSearchParams(window.location.search);
      const tabParam = searchParams.get('tab');
      
      if (tabParam) {
        // Set the active tab based on URL parameter
        if (tabParam === 'history' || tabParam === 'documentation' || tabParam === 'visualize' || tabParam === 'upload') {
          setActiveTab(tabParam as 'upload' | 'visualize' | 'history' | 'documentation');
        }
        
        // Check for visualization tab parameter
        const visualizationTabParam = searchParams.get('visualizationTab');
        if (visualizationTabParam && (visualizationTabParam === 'themes' || visualizationTabParam === 'patterns' || 
            visualizationTabParam === 'sentiment' || visualizationTabParam === 'personas')) {
          setVisualizationTab(visualizationTabParam as 'themes' | 'patterns' | 'sentiment' | 'personas');
          // If we have a visualization tab, make sure we're on the visualize tab
          setActiveTab('visualize');
        }
      }
    }
  }, []);
  
  // Update URL when tabs change with debounce
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Store previous tab
      previousTabRef.current = visualizationTab;
      
      const url = new URL(window.location.href);
      url.searchParams.set('tab', activeTab);
      
      // Also update visualization tab in URL when on visualize tab
      if (activeTab === 'visualize') {
        url.searchParams.set('visualizationTab', visualizationTab);
      } else {
        url.searchParams.delete('visualizationTab');
      }
      
      window.history.pushState({}, '', url);
    }
  }, [activeTab, visualizationTab]);
  
  // Fetch analysis history
  useEffect(() => {
    async function fetchAnalyses() {
      try {
        setHistoryLoading(true);
        setHistoryError(null);
        
        // Set auth token
        apiClient.setAuthToken(authToken);
        
        // Use the API client to fetch real data
        try {
          const apiParams = {
            sortBy: sortBy === 'date' ? 'createdAt' : 'fileName',
            sortDirection: sortDirection,
            status: filterStatus === 'all' ? undefined : filterStatus,
          };
          
          const data = await apiClient.listAnalyses(apiParams);
          setAnalyses(data);
        } catch (apiError) {
          console.error('API error:', apiError);
          setHistoryError(apiError instanceof Error ? apiError : new Error('Failed to fetch analyses'));
          showToast('Failed to fetch analysis history', { variant: 'error' });
        }
        
        setHistoryLoading(false);
      } catch (err) {
        console.error('Error fetching analyses:', err);
        setHistoryError(err instanceof Error ? err : new Error('Failed to fetch analyses'));
        setHistoryLoading(false);
        showToast('Failed to load analyses', { variant: 'error' });
      }
    }

    if (activeTab === 'history') {
      fetchAnalyses();
    }
  }, [activeTab, showToast, sortBy, sortDirection, filterStatus, authToken]);
  
  // Debug logging for sentiment visualization
  useEffect(() => {
    // DISABLED: Heavy object logging causing browser message channel errors
    /* Original code was:
    if (results && visualizationTab === 'sentiment') {
      console.log('Results object for sentiment visualization:', results);
      console.log('SentimentStatements in results:', results.sentimentStatements);
      console.log('Sentiment overview:', results.sentimentOverview);
    }
    */
  }, [results, visualizationTab]);
  
  // If still loading auth state, show spinner
  if (!isLoaded) {
    return <LoadingSpinner />;
  }
  
  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      
      // Check if it's a text file by MIME type or extension
      const isText = selectedFile.type === 'text/plain' || 
                     selectedFile.name.endsWith('.txt') ||
                     selectedFile.name.endsWith('.text');
      setIsTextFile(isText);
      
      console.log(`Selected file: ${selectedFile.name}, isTextFile: ${isText}`);
    }
  };

  // Handle file upload
  const handleUpload = async () => {
    if (!file) {
      showToast('Please select a file to upload', { variant: 'error' });
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Set auth token
      apiClient.setAuthToken(authToken);
      
      // Upload the file, passing the isTextFile flag
      const response = await apiClient.uploadData(file, isTextFile);
      setUploadResponse(response);
      showToast('File uploaded successfully', { variant: 'success' });
      
      // Clear previous analysis data
      setAnalysisResponse(null);
      setResults(null);
    } catch (err) {
      setError(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
      showToast(`Upload failed: ${err instanceof Error ? err.message : String(err)}`, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Handle data analysis
  const handleAnalyze = async (uploadData?: UploadResponse, isText?: boolean) => {
    // Use uploaded data or existing upload response
    const dataToAnalyze = uploadData || uploadResponse;
    const isTextFileToUse = isText !== undefined ? isText : isTextFile;
    
    if (!dataToAnalyze) {
      setError('No data to analyze.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Set auth token
      apiClient.setAuthToken(authToken);
      
      // Trigger analysis, passing the isTextFile flag
      const response = await apiClient.analyzeData(
        dataToAnalyze.data_id,
        llmProvider,
        undefined,
        isTextFileToUse
      );
      setAnalysisResponse(response);
      showToast('Analysis initiated successfully', { variant: 'success' });
      
      // Clear previous results
      setResults(null);
    } catch (err) {
      setError(`Analysis failed: ${err instanceof Error ? err.message : String(err)}`);
      showToast(`Analysis failed: ${err instanceof Error ? err.message : String(err)}`, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Handle fetching results
  const handleGetResults = async () => {
    if (!analysisResponse) {
      showToast('Please analyze the data first', { variant: 'error' });
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Set auth token
      apiClient.setAuthToken(authToken);
      
      // For text files, read the raw text content first
      let fileContent = '';
      if (isTextFile && file) {
        try {
          fileContent = await file.text();
          console.log("Read text file content");
        } catch (error) {
          console.error("Error reading text file:", error);
        }
      }
      
      try {
        // Fetch results
        const resultData = await apiClient.getAnalysisById(String(analysisResponse.result_id));
        
        // Ensure the data has the expected structure
        if (resultData) {
          // Ensure sentimentOverview exists
          if (!resultData.sentimentOverview) {
            resultData.sentimentOverview = {
              positive: 0.33,
              neutral: 0.34,
              negative: 0.33
            };
          }
          
          // For text files, if we have the file content and need sentiment statements
          if (isTextFile && fileContent) {
            // First, check if we already have proper LLM-generated sentiment statements
            const hasValidSentimentStatements = resultData.sentimentStatements && 
              resultData.sentimentStatements.positive && 
              resultData.sentimentStatements.positive.length > 0 &&
              resultData.sentimentStatements.positive[0] !== "No positive statements were extracted from the interview data." &&
              resultData.sentimentStatements.positive[0] !== "No positive statements found in the provided text.";
            
            if (!hasValidSentimentStatements) {
              console.log("Processing sentiment statements");
              resultData.sentimentStatements = processFreeTextToSentimentStatements(fileContent);
            }
          }
          
          // Ensure patterns have category field and proper sentiment
          if (resultData.patterns) {
            resultData.patterns = resultData.patterns.map((pattern: any) => {
              // Use pattern.type as category if missing
              if (pattern.type && !pattern.category) {
                pattern.category = pattern.type;
              }
              
              // Ensure sentiment is normalized between -1 and 1
              if (typeof pattern.sentiment === 'number') {
                if (pattern.sentiment > 1) pattern.sentiment = 1;
                if (pattern.sentiment < -1) pattern.sentiment = -1;
              }
              
              return pattern;
            });
          }
          
          // Ensure sentiment is always an array
          if (!Array.isArray(resultData.sentiment)) {
            resultData.sentiment = [];
          }
          
          // Process sentiment data to ensure proper formatting for visualization
          let validSentimentItems = resultData.sentiment
            .filter((item: any) => item.answer && item.answer.trim() !== '')
            .map((item: any) => {
              return {
                ...item,
                score: typeof item.score === 'number' ? item.score : 0,
                answer: item.answer || '' // Only use answer field, no fallback to text
              };
            });
          
          // Use the filtered list for sentiment data
          resultData.sentiment = validSentimentItems;
          
          // Ensure sentimentStatements exist or create them from sentiment data
          if (!resultData.sentimentStatements || 
              !resultData.sentimentStatements.positive || 
              !resultData.sentimentStatements.neutral || 
              !resultData.sentimentStatements.negative ||
              (resultData.sentimentStatements.positive.length === 0 && 
               resultData.sentimentStatements.neutral.length === 0 && 
               resultData.sentimentStatements.negative.length === 0)) {
            console.log('Generating sentiment statements');
            
            // Group sentiment data by score into positive, neutral, and negative
            const positive: string[] = [];
            const neutral: string[] = [];
            const negative: string[] = [];
            
            validSentimentItems.forEach((item: any) => {
              // Use answer text as statement and ensure it's not empty
              const statement = item.answer?.trim() || '';
              if (!statement) return; // Skip empty statements
              
              const score = typeof item.score === 'number' ? item.score : 0;
              
              // Categorize based on score
              if (score >= 0.2) {
                positive.push(statement);
              } else if (score <= -0.2) {
                negative.push(statement);
              } else {
                neutral.push(statement);
              }
            });
            
            // Create new sentiment statements object
            resultData.sentimentStatements = {
              positive,
              neutral,
              negative
            };
            
            console.log(`Generated ${positive.length} positive, ${neutral.length} neutral, ${negative.length} negative statements`);
          } else {
            // Keep existing sentiment statements unedited
            console.log('Using existing sentiment statements from API');
          }
        }
        
        setResults(resultData);
        showToast('Results fetched successfully', { variant: 'success' });
        
        // Switch to visualization tab when results are ready
        setActiveTab('visualize');
      } catch (err) {
        setError(`Failed to fetch results: ${err instanceof Error ? err.message : String(err)}`);
        showToast(`Failed to fetch results: ${err instanceof Error ? err.message : String(err)}`, { variant: 'error' });
      } finally {
        setLoading(false);
      }
    } catch (err) {
      setError(`Failed to fetch results: ${err instanceof Error ? err.message : String(err)}`);
      showToast(`Failed to fetch results: ${err instanceof Error ? err.message : String(err)}`, { variant: 'error' });
      setLoading(false);
    }
  };

  // Load an analysis from history
  const loadAnalysisFromHistory = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      
      // Set auth token
      apiClient.setAuthToken(authToken);
      
      // Fetch results
      const resultData = await apiClient.getAnalysisById(id);
      
      // Ensure the data has the expected structure
      if (resultData) {
        // Ensure sentimentOverview exists
        if (!resultData.sentimentOverview) {
          resultData.sentimentOverview = {
            positive: 0.33,
            neutral: 0.34,
            negative: 0.33
          };
        }
        
        // For text files, process for sentiment statements if needed
        if (isTextFile && (!resultData.sentimentStatements || 
            (resultData.sentimentStatements.positive.length === 0 && 
             resultData.sentimentStatements.neutral.length === 0 && 
             resultData.sentimentStatements.negative.length === 0)) && file) {
          console.log("Processing historical analysis");
          try {
            const fileContent = await file.text();
            console.log("Processing file content for historical analysis");
            resultData.sentimentStatements = processFreeTextToSentimentStatements(fileContent);
          } catch (error) {
            console.error("Failed to read text from file in history view:", error);
          }
        }
        
        // Ensure patterns have category field and proper sentiment
        if (resultData.patterns) {
          resultData.patterns = resultData.patterns.map((pattern: any) => {
            // Use pattern.type as category if missing
            if (pattern.type && !pattern.category) {
              pattern.category = pattern.type;
            }
            
            // Ensure sentiment is normalized between -1 and 1
            if (typeof pattern.sentiment === 'number') {
              if (pattern.sentiment > 1) pattern.sentiment = 1;
              if (pattern.sentiment < -1) pattern.sentiment = -1;
            }
            
            return pattern;
          });
        }
        
        // Ensure sentiment is always an array
        if (!Array.isArray(resultData.sentiment)) {
          resultData.sentiment = [];
        }
        
        // Process sentiment data to ensure proper formatting for visualization
        let validSentimentItems = resultData.sentiment
          .filter((item: any) => item.answer && item.answer.trim() !== '')
          .map((item: any) => {
            return {
              ...item,
              score: typeof item.score === 'number' ? item.score : 0,
              answer: item.answer || '' // Only use answer field, no fallback to text
            };
          });
        
        // Use the filtered list for sentiment data
        resultData.sentiment = validSentimentItems;
        
        // Ensure sentimentStatements exist or create them from sentiment data
        if (!resultData.sentimentStatements || 
            !resultData.sentimentStatements.positive || 
            !resultData.sentimentStatements.neutral || 
            !resultData.sentimentStatements.negative ||
            (resultData.sentimentStatements.positive.length === 0 && 
             resultData.sentimentStatements.neutral.length === 0 && 
             resultData.sentimentStatements.negative.length === 0)) {
          console.log('Generating sentiment statements');
          
          // Group sentiment data by score into positive, neutral, and negative
          const positive: string[] = [];
          const neutral: string[] = [];
          const negative: string[] = [];
          
          validSentimentItems.forEach((item: any) => {
            // Use answer text as statement and ensure it's not empty
            const statement = item.answer?.trim() || '';
            if (!statement) return; // Skip empty statements
            
            const score = typeof item.score === 'number' ? item.score : 0;
            
            // Categorize based on score
            if (score >= 0.2) {
              positive.push(statement);
            } else if (score <= -0.2) {
              negative.push(statement);
            } else {
              neutral.push(statement);
            }
          });
          
          // Create new sentiment statements object
          resultData.sentimentStatements = {
            positive,
            neutral,
            negative
          };
          
          console.log(`Generated ${positive.length} positive, ${neutral.length} neutral, ${negative.length} negative statements`);
        } else {
          // Keep existing sentiment statements unedited
          console.log('Using existing sentiment statements from API');
        }
      }
      
      setResults(resultData);
      showToast('Analysis loaded successfully', { variant: 'success' });
      
      // Switch to visualization tab
      setActiveTab('visualize');
    } catch (err) {
      setError(`Failed to load analysis: ${err instanceof Error ? err.message : String(err)}`);
      showToast(`Failed to load analysis: ${err instanceof Error ? err.message : String(err)}`, { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Helper function for formatting file size
  const formatFileSize = (bytes: number | undefined) => {
    if (!bytes) return 'Unknown';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(2)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
  };

  // Helper function for formatting date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

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

  // After all the changes, update the processFreeTextToSentimentStatements function to better handle Team chat format:

  const processFreeTextToSentimentStatements = (text: string) => {
    // First determine if it's Teams format before using it in logging
    const isTeamsFormat = text.match(/\[\d+:\d+ [AP]M\]/);
    console.log(`Processing ${isTeamsFormat ? "Teams" : "standard"} format text`);

    if (!text || text.length === 0) {
      console.log("Warning: Empty text provided for sentiment extraction");
      return {
        positive: ["No positive statements found in the text file."],
        neutral: ["No neutral statements found in the text file."],
        negative: ["No negative statements found in the text file."]
      };
    }
    
    // Extract plain text sentences from transcript
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    console.log(`Processing text file with ${lines.length} lines`);
    
    // Store question-answer pairs when possible
    const conversationPairs: { question?: string; answer: string }[] = [];
    let lastQuestion = '';
    
    // First pass: extract question-answer pairs
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines
      if (!line) continue;
      
      // Check if this line looks like a question
      const isQuestion = line.endsWith('?') || 
                         (line.includes(':') && line.toLowerCase().includes('question')) ||
                         (i > 0 && lines[i-1].toLowerCase().includes('question'));
      
      if (isQuestion) {
        // Store as potential question
        lastQuestion = line;
      } else if (lastQuestion && i > 0) {
        // This might be an answer to the last question
        // Create a conversation pair
        conversationPairs.push({
          question: lastQuestion,
          answer: line
        });
        
        // Reset last question
        lastQuestion = '';
      } else {
        // Just an isolated statement
        conversationPairs.push({
          answer: line
        });
      }
    }
    
    // Extract just the text content without timestamps and speaker labels
    const textContent = lines.map(line => {
      if (isTeamsFormat) {
        // Match pattern like [09:00 AM] Interviewer: text
        const match = line.match(/\[\d+:\d+ [AP]M\] ([^:]+): (.*)/);
        if (match) {
          const speaker = match[1].trim();
          const content = match[2].trim();
          
          // Include both interviewer and interviewee content, but prioritize interviewee
          return content;
        }
        return line.trim(); // If it doesn't match the pattern, keep the whole line
      } else {
        // Try to remove speaker labels like "User:" or "Interviewer:" from non-Teams format
        const match = line.match(/^([^:]+):\s*(.*)/);
        if (match && match[2].trim().length > 0) {
          return match[2].trim();
        }
        return line.trim();
      }
    }).filter(text => text.length > 0);
    
    console.log(`Extracted ${textContent.length} content lines from text file`);
    
    // Enhanced sentiment keyword lists specifically for interview data
    const positiveKeywords = [
      'excited', 'love', 'great', 'awesome', 'enjoy', 'helpful', 'engaging', 'intuitive', 
      'seamless', 'boost', 'fun', 'easy', 'positive', 'exciting', 'efficient', 'improvement',
      'innovative', 'laughs', 'fantastic', 'definitely', 'cool', 'good', 'better', 'best',
      'happy', 'pleased', 'impressive', 'satisfied', 'clear', 'valuable', 'benefits',
      'appreciate', 'like', 'excellent', 'perfect', 'user-friendly', 'ideal', 'simple',
      'effective', 'convenient', 'comfortable', 'recommend', 'success', 'smooth'
    ];
    
    const negativeKeywords = [
      'bug', 'issue', 'problem', 'hiccup', 'challenge', 'lag', 'slow', 'nightmare', 
      'overwhelming', 'difficulty', 'frustrating', 'concern', 'confusing', 'hard',
      'complicated', 'annoying', 'struggled', 'disappointing', 'error', 'failure',
      'difficult', 'poor', 'bad', 'worst', 'trouble', 'unclear', 'hate', 'dislike',
      'inconvenient', 'lacking', 'broken', 'disappointed', 'cumbersome', 'tedious',
      'painfully', 'miss', 'missing', 'clunky', 'unhappy', 'nonsensical', 'never', 'none'
    ];
    
    // List of phrases that likely require context and should be filtered out when standalone
    const contextDependentPhrases = [
      "it's pretty intuitive", "pretty intuitive", "magic in code", "like magic", 
      "love that", "actually", "chuckles", "laughs", "exactly", "totally",
      "that's right", "completely", "absolutely", "basically", "literally",
      "in general", "well", "more or less", "kind of", "sort of", "definitely"
    ];
    
    const positive: string[] = [];
    const neutral: string[] = [];
    const negative: string[] = [];
    
    // Process conversation pairs for sentiment
    conversationPairs.forEach(pair => {
      const answer = pair.answer.trim();
      if (!answer || answer.length < 10) return; // Skip very short answers
      
      const lowerAnswer = answer.toLowerCase();
      
      // Check if this is a context-dependent statement without a question
      const isContextDependent = contextDependentPhrases.some(phrase => 
        lowerAnswer.includes(phrase) && answer.length < 60
      );
      
      if (isContextDependent && !pair.question) {
        // Skip context-dependent statements without questions
        return;
      }
      
      // Format the statement, including the question if it exists
      let statement = answer;
      if (pair.question) {
        statement = `Q: ${pair.question}\nA: ${answer}`;
      }
      
      // Determine sentiment
      const foundPositive = positiveKeywords.some(keyword => lowerAnswer.includes(keyword));
      const foundNegative = negativeKeywords.some(keyword => lowerAnswer.includes(keyword));
      
      if (foundPositive && !foundNegative) {
        positive.push(statement);
      } else if (foundNegative && !foundPositive) {
        negative.push(statement);
      } else if (foundPositive && foundNegative) {
        // If both positive and negative keywords are found, check which ones are more prominent
        const posCount = positiveKeywords.filter(kw => lowerAnswer.includes(kw)).length;
        const negCount = negativeKeywords.filter(kw => lowerAnswer.includes(kw)).length;
        
        if (posCount > negCount) {
          positive.push(statement);
        } else if (negCount > posCount) {
          negative.push(statement);
        } else {
          neutral.push(statement);
        }
      } else if (statement.length > 40) {
        // Longer statements without clear sentiment go to neutral
        neutral.push(statement);
      }
    });
    
    // If the conversation pair approach didn't yield enough results, fall back to sentence-based processing
    if (positive.length + negative.length + neutral.length < 5) {
      console.log("Not enough statements from conversation pairs, falling back to sentence analysis");
      
      // First split into sentences for more granular analysis
      const allText = textContent.join(' ');
      // Improved regex for more reliable sentence splitting - handles various punctuation
      const sentences = allText.match(/[^.!?]+[.!?]+/g) || textContent;
      console.log(`Split text into ${sentences.length} sentences for analysis`);
      
      // Process each sentence and categorize by sentiment
      sentences.forEach(sentence => {
        const trimmedSentence = sentence.trim();
        if (!trimmedSentence || trimmedSentence.length < 20) return; // Skip short sentences
        
        const lowerSentence = trimmedSentence.toLowerCase();
        
        // Skip context-dependent phrases that don't make sense alone
        if (contextDependentPhrases.some(phrase => lowerSentence.includes(phrase)) && 
            trimmedSentence.length < 60) {
          return;
        }
        
        // Check for positive keywords
        const foundPositive = positiveKeywords.some(keyword => lowerSentence.includes(keyword));
        
        // Check for negative keywords
        const foundNegative = negativeKeywords.some(keyword => lowerSentence.includes(keyword));
        
        // Determine sentiment based on keyword presence
        if (foundPositive && !foundNegative) {
          positive.push(trimmedSentence);
        } else if (foundNegative && !foundPositive) {
          negative.push(trimmedSentence);
        } else if (foundPositive && foundNegative) {
          // If both positive and negative keywords are found, check which ones are more prominent
          const posCount = positiveKeywords.filter(kw => lowerSentence.includes(kw)).length;
          const negCount = negativeKeywords.filter(kw => lowerSentence.includes(kw)).length;
          
          if (posCount > negCount) {
            positive.push(trimmedSentence);
          } else if (negCount > posCount) {
            negative.push(trimmedSentence);
          } else {
            neutral.push(trimmedSentence);
          }
        } else if (trimmedSentence.length > 40) {
          // Longer sentences without clear sentiment go to neutral
          neutral.push(trimmedSentence);
        }
      });
    }
    
    console.log(`Extracted ${positive.length + neutral.length + negative.length} sentiment statements`);
    
    // If we found no statements at all, create placeholder messages
    if (positive.length === 0 && neutral.length === 0 && negative.length === 0) {
      console.log("No sentiment statements found, creating fallback statements");
      
      // See if we can use the raw lines as a last resort
      if (lines.length > 0) {
        // For each line, check if it's long enough to be meaningful
        lines.forEach(line => {
          const trimmedLine = line.trim();
          if (trimmedLine.length > 40) {
            neutral.push(trimmedLine); // Default to neutral for raw text
          }
        });
      }
      
      // If we still have nothing, add fallback statements
      if (positive.length === 0 && neutral.length === 0 && negative.length === 0) {
        return {
          positive: ["No positive statements found in the provided text."],
          neutral: ["No neutral statements found in the provided text."],
          negative: ["No negative statements found in the provided text."]
        };
      }
    }
    
    // Return all statements limited to reasonable numbers
    return {
      positive: positive.length > 0 ? positive.slice(0, 10) : ["No positive statements found in the text."],
      neutral: neutral.length > 0 ? neutral.slice(0, 10) : ["No neutral statements found in the text."],
      negative: negative.length > 0 ? negative.slice(0, 10) : ["No negative statements found in the text."]
    };
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold mb-8">Interview Insight Analyst</h1>
      
      {/* Main Tabs */}
      <div className="flex flex-wrap space-x-2 border-b mb-8">
        <button
          onClick={() => setActiveTab('upload')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'upload'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Upload & Analyze
        </button>
        <button
          onClick={() => setActiveTab('visualize')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'visualize'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          disabled={!results}
        >
          Visualize Results
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'history'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          History
        </button>
        <button
          onClick={() => setActiveTab('documentation')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'documentation'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Documentation
        </button>
      </div>

      {/* Tab Content */}
      <div>
        {/* Upload & Analyze Tab */}
        {activeTab === 'upload' && (
          <div className="space-y-8">
            {/* Configuration Section */}
            <section className="bg-card p-6 rounded-lg shadow-sm">
              <h2 className="text-xl font-semibold mb-4">Configuration</h2>
              
              <div className="flex flex-wrap items-center gap-4">
                <div className="mt-2 sm:mt-0">
                  <label className="block text-sm font-medium mb-1">
                    Auth Token:
                  </label>
                  <input
                    type="text"
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                    className="border border-border rounded-md p-2 w-64"
                    placeholder="Enter auth token"
                  />
                </div>
                
                <div className="mt-2 sm:mt-0">
                  <label className="block text-sm font-medium mb-1">
                    LLM Provider:
                  </label>
                  <div className="flex space-x-4">
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        checked={llmProvider === 'gemini'}
                        onChange={() => setLlmProvider('gemini')}
                      />
                      <span>Google Gemini</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        checked={llmProvider === 'openai'}
                        onChange={() => setLlmProvider('openai')}
                      />
                      <span>OpenAI</span>
                    </label>
                  </div>
                </div>
              </div>
            </section>

            {/* Upload Section */}
            <section className="bg-card p-6 rounded-lg shadow-sm">
              <h2 className="text-xl font-semibold mb-4">Step 1: Upload Data</h2>
              
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileChange}
                    className="border border-border rounded-md p-2"
                  />
                  <button
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
                    onClick={handleUpload}
                    disabled={!file || loading}
                  >
                    {loading ? <LoadingSpinner size="sm" /> : 'Upload'}
                  </button>
                </div>
                
                {uploadResponse && (
                  <div className="mt-2 text-sm text-green-600">
                    Upload successful! Data ID: {uploadResponse.data_id}
                  </div>
                )}
              </div>
            </section>

            {/* Analyze Section */}
            <section className="bg-card p-6 rounded-lg shadow-sm">
              <h2 className="text-xl font-semibold mb-4">Step 2: Analyze Data</h2>
              
              <div className="space-y-4">
                <div className="mt-8 flex gap-4">
                  <Button
                    className="w-full"
                    onClick={() => handleAnalyze()}
                    disabled={!uploadResponse || loading || !llmProvider}
                    type="button"
                  >
                    {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    Analyze with {llmProvider === 'openai' ? 'OpenAI' : 'Google Gemini'}
                  </Button>
                </div>
                
                {analysisResponse && (
                  <div className="mt-2 text-sm text-green-600">
                    Analysis initiated! Result ID: {analysisResponse.result_id}
                  </div>
                )}
              </div>
            </section>

            {/* Get Results Section */}
            <section className="bg-card p-6 rounded-lg shadow-sm">
              <h2 className="text-xl font-semibold mb-4">Step 3: Get Results</h2>
              
              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <button
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
                    onClick={handleGetResults}
                    disabled={!analysisResponse || loading}
                  >
                    {loading ? <LoadingSpinner size="sm" /> : 'Get Results'}
                  </button>
                </div>
                
                {results && (
                  <div className="mt-2 text-sm text-green-600">
                    Results loaded successfully!
                  </div>
                )}
              </div>
            </section>

            {/* Error Display */}
            {error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-800">
                <h3 className="font-medium mb-1">Error</h3>
                <p>{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Visualization Tab */}
        {activeTab === 'visualize' && (
          <div className="flex flex-col h-full">
            <div className="mb-4">
              <Tabs 
                value={visualizationTab} 
                onValueChange={(value) => {
                  try {
                    // Use debounced version to prevent race conditions
                    debouncedSetVisualizationTab(value as 'themes' | 'patterns' | 'sentiment' | 'personas');
                    
                    // Set special flag to prevent logging during tab transitions
                    if (typeof window !== 'undefined') {
                      window.isUnmounting = true;
                      
                      // Clear any React warnings shown
                      if (window.reactWarningsShown) {
                        window.reactWarningsShown.clear();
                      }
                      
                      // Stop all console activity during tab switching
                      setTimeout(() => {
                        window.isUnmounting = false;
                      }, 300);
                    }
                  } catch (err) {
                    console.log('Error during tab change (safely handled):', 
                      err instanceof Error ? err.message : 'Unknown error');
                  }
                }}
                className="w-full"
              >
                <TabsList className="grid grid-cols-4 mb-4">
                  <TabsTrigger value="themes">Themes</TabsTrigger>
                  <TabsTrigger value="patterns">Patterns</TabsTrigger>
                  <TabsTrigger value="sentiment">Sentiment</TabsTrigger>
                  <TabsTrigger value="personas">Personas</TabsTrigger>
                </TabsList>

                {/* Content is rendered based on visualizationTab state */}
              </Tabs>
            </div>

            {/* Tab content is rendered here */}
            <div className="flex-1">
              {!results ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground mb-4">No results available</p>
                  <button
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
                    onClick={() => setActiveTab('upload')}
                  >
                    Upload & Analyze Data
                  </button>
                </div>
              ) : (
                <div>
                  {/* Visualization Content */}
                  {visualizationTab === 'themes' && (
                    <UnifiedVisualization
                      type="themes"
                      themesData={results.themes}
                    />
                  )}
                  
                  {visualizationTab === 'patterns' && (
                    <UnifiedVisualization
                      type="patterns"
                      patternsData={(results.patterns || [])
                        .slice(0, 25)  // Limit to first 25 patterns for performance
                        .map((pattern, index) => ({
                          // Parse string id to number or use a numeric fallback
                          id: typeof pattern.id === 'number' ? pattern.id : (parseInt(String(pattern.id)) || index + 1000),
                          name: pattern.name || `Unnamed Pattern ${index + 1}`,
                          description: pattern.description || '',
                          frequency: pattern.frequency || 0,
                          category: pattern.category || 'Uncategorized',
                          sentiment: typeof pattern.sentiment === 'number' ? pattern.sentiment : 0,
                          // Limit evidence items to 5 per pattern
                          evidence: Array.isArray(pattern.evidence) ? pattern.evidence.slice(0, 5) : []
                        }))
                      }
                    />
                  )}
                  
                  {visualizationTab === 'sentiment' && (
                    <UnifiedVisualization
                      type="sentiment"
                      sentimentData={{
                        overview: results.sentimentOverview,
                        // Limit the data and ensure we only use fields that exist in the SentimentData type
                        details: (results.sentiment || [])
                          .slice(0, 50)
                          .map((item: any) => {
                            // Create a properly typed SentimentData object
                            const sentimentItem: SentimentData = {
                              timestamp: item.timestamp || new Date().toISOString(),
                              text: typeof item.text === 'string' ? item.text : 
                                   typeof item.answer === 'string' ? item.answer : '',
                              score: typeof item.score === 'number' ? item.score : 0
                            };
                            return sentimentItem;
                          }),
                        statements: results.sentimentStatements 
                          ? {
                              positive: (results.sentimentStatements.positive || []).slice(0, 10),
                              neutral: (results.sentimentStatements.neutral || []).slice(0, 10),
                              negative: (results.sentimentStatements.negative || []).slice(0, 10),
                            } 
                          : {
                              positive: [],
                              neutral: [],
                              negative: []
                            }
                      }}
                    />
                  )}

                  {visualizationTab === 'personas' && (
                    <UnifiedVisualization
                      type="personas"
                      personasData={(results.personas || [])
                        .slice(0, 10)  // Limit to first 10 personas for performance
                        .map(persona => ({
                          name: persona.name || 'Unnamed Persona',
                          description: persona.description || '',
                          role_context: persona.role_context || { 
                            value: '', 
                            confidence: 0, 
                            evidence: [] 
                          },
                          key_responsibilities: persona.key_responsibilities || { 
                            value: '', 
                            confidence: 0, 
                            evidence: [] 
                          },
                          tools_used: persona.tools_used || { 
                            value: '', 
                            confidence: 0, 
                            evidence: [] 
                          },
                          collaboration_style: persona.collaboration_style || { 
                            value: '', 
                            confidence: 0, 
                            evidence: [] 
                          },
                          analysis_approach: persona.analysis_approach || { 
                            value: '', 
                            confidence: 0, 
                            evidence: [] 
                          },
                          pain_points: persona.pain_points || { 
                            value: '', 
                            confidence: 0, 
                            evidence: [] 
                          },
                          patterns: Array.isArray(persona.patterns) ? persona.patterns.slice(0, 5) : [],
                          confidence: typeof persona.confidence === 'number' ? persona.confidence : 0,
                          evidence: Array.isArray(persona.evidence) ? persona.evidence.slice(0, 5) : []
                        }))
                      }
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div>
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">Analysis History</h2>
              
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
            
            {historyLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner size="lg" label="Loading analysis history..." />
              </div>
            ) : historyError ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-800">
                <h3 className="font-medium mb-1">Error</h3>
                <p>{historyError.message}</p>
                <button 
                  className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md"
                  onClick={() => setActiveTab('history')}
                >
                  Try Again
                </button>
              </div>
            ) : filteredAndSortedAnalyses.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No analyses found</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {filteredAndSortedAnalyses.map((analysis) => (
                  <div 
                    key={analysis.id} 
                    className="bg-card p-4 rounded-lg shadow-sm border border-border"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{analysis.fileName}</h3>
                        <div className="text-sm text-muted-foreground mt-1">
                          <span>Created: {formatDate(analysis.createdAt)}</span>
                          <span className="mx-2">•</span>
                          <span>Size: {formatFileSize(analysis.fileSize)}</span>
                        </div>
                      </div>
                      
                      <div className="mt-3 md:mt-0 flex items-center space-x-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          analysis.status === 'completed' 
                            ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100'
                            : analysis.status === 'failed'
                            ? 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-100'
                        }`}>
                          {analysis.status}
                        </span>
                        
                        <button
                          className="px-3 py-1 bg-primary text-primary-foreground rounded-md text-sm"
                          onClick={() => loadAnalysisFromHistory(analysis.id)}
                          disabled={analysis.status !== 'completed'}
                        >
                          View
                        </button>
                      </div>
                    </div>
                    
                    {analysis.error && (
                      <div className="mt-2 text-sm text-red-600">
                        Error: {analysis.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Documentation Tab */}
        {activeTab === 'documentation' && (
          <div className="prose prose-blue max-w-none">
            <h2>Interview Insight Analyst Documentation</h2>
            
            <p>
              The Interview Insight Analyst helps you analyze interview data to extract insights, identify patterns,
              and understand sentiment. The application uses powerful language models to analyze text and visualize
              results in an easy-to-understand format.
            </p>
            
            <h3>Getting Started</h3>
            
            <ol>
              <li>
                <strong>Upload Data</strong>: Start by uploading your interview data in JSON format. The data should
                contain interview text and any relevant metadata.
              </li>
              <li>
                <strong>Analyze</strong>: Once your data is uploaded, click the Analyze button to start the analysis
                process. You can choose between OpenAI and Google Gemini as the LLM provider.
              </li>
              <li>
                <strong>View Results</strong>: After analysis is complete, click Get Results to view your analysis.
                The results will be displayed in the Visualize Results tab.
              </li>
            </ol>
            
            <h3>Visualization Types</h3>
            
            <ul>
              <li>
                <strong>Themes</strong>: Major themes identified in the interviews, including frequency and supporting
                statements. Themes are organized by sentiment (positive, neutral, negative).
              </li>
              <li>
                <strong>Patterns</strong>: Specific patterns found in responses, grouped by category and sentiment.
                Each pattern includes supporting evidence.
              </li>
              <li>
                <strong>Sentiment</strong>: Overall sentiment analysis with distribution of positive, neutral, and
                negative sentiments, along with supporting statements.
              </li>
            </ul>
            
            <h3>Feature Documentation</h3>
            
            <p>
              For more detailed documentation, please refer to the following resources:
            </p>
            
            <ul>
              <li><a href="/docs/index.md" target="_blank">Main Documentation</a></li>
              <li><a href="/docs/visualization_components.md" target="_blank">Visualization Components</a></li>
              <li><a href="/docs/backend_integration.md" target="_blank">Backend Integration</a></li>
              <li><a href="/docs/PRD.md" target="_blank">Product Requirements Document</a></li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
