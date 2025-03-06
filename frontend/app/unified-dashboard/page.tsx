'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/loading-spinner';
import { useToast } from '@/components/providers/toast-provider';
import UnifiedVisualization from '@/components/visualization/UnifiedVisualization';
import { apiClient } from '@/lib/apiClient';
import { UploadResponse, AnalysisResponse, DetailedAnalysisResult } from '@/types/api';
import { useAuth } from '@clerk/nextjs';
import { ThemeChart } from '@/components/visualization/ThemeChart';
import { PatternList } from '@/components/visualization/PatternList';
import { SentimentGraph } from '@/components/visualization/SentimentGraph';
import { PersonaList } from '@/components/visualization/PersonaList';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles } from 'lucide-react';

const HelpDropdown = ({ isOpen, toggle }: { isOpen: boolean; toggle: () => void }) => {
  return (
    <div className="relative inline-block">
      <button 
        onClick={toggle}
        className="text-blue-600 hover:text-blue-800 flex items-center text-sm"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        Help Guide
      </button>
      
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-900 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-10">
          <div className="p-4">
            <h3 className="font-medium text-lg mb-2">Getting Started Guide</h3>
            <ol className="space-y-3 list-decimal pl-5 text-sm">
              <li>
                <span className="font-medium">Get API Key</span>
                <p className="text-gray-600 dark:text-gray-300">Create a Google API key with Gemini access</p>
              </li>
              <li>
                <span className="font-medium">Enter API Key</span>
                <p className="text-gray-600 dark:text-gray-300">Paste your API key in the field above</p>
              </li>
              <li>
                <span className="font-medium">Upload Transcript</span>
                <p className="text-gray-600 dark:text-gray-300">Upload your interview transcript file (.txt, .docx)</p>
              </li>
              <li>
                <span className="font-medium">Select Analysis Type</span>
                <p className="text-gray-600 dark:text-gray-300">Choose the type of analysis to perform</p>
              </li>
              <li>
                <span className="font-medium">View Results</span>
                <p className="text-gray-600 dark:text-gray-300">See analysis in the Visualize tab</p>
              </li>
            </ol>
            <a 
              href="https://makersuite.google.com/app/REDACTED_API_KEY" 
              target="_blank" 
              rel="noopener noreferrer"
              className="mt-4 inline-block text-blue-600 hover:underline text-sm"
            >
              Get API key from Google AI Studio →
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

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
  
  // Help state
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const toggleHelp = () => setIsHelpOpen(!isHelpOpen);
  
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
  
  // Update URL when tabs change
  useEffect(() => {
    if (typeof window !== 'undefined') {
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
    if (results && visualizationTab === 'sentiment') {
      console.log('Results object for sentiment visualization:', results);
      console.log('SentimentStatements in results:', results.sentimentStatements);
      console.log('Sentiment overview:', results.sentimentOverview);
    }
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
    // Use provided upload response or the state value
    const uploadResponseToUse = uploadData || uploadResponse;
    // Use provided isText or the state value
    const isTextFileToUse = isText !== undefined ? isText : isTextFile;
    
    if (!uploadResponseToUse) {
      showToast('Please upload a file first', { variant: 'error' });
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Set auth token
      apiClient.setAuthToken(authToken);
      
      // Trigger analysis, passing the isTextFile flag
      const response = await apiClient.analyzeData(
        uploadResponseToUse.data_id, 
        llmProvider,
        undefined,  // Use default model
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
          console.log("Successfully read raw text from file, length:", fileContent.length);
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
              console.log("No valid LLM-generated sentiment statements found, requesting sentiment analysis from backend");
              
              try {
                // LLM-BASED APPROACH:
                // Ideally, we would send the file content to a dedicated backend endpoint
                // that would use the LLM to analyze sentiment and extract statements.
                // 
                // For example:
                // const llmSentimentResponse = await apiClient.analyzeSentiment(fileContent);
                // resultData.sentimentStatements = llmSentimentResponse.sentimentStatements;
                //
                // However, since we're already using the LLM for the main analysis,
                // we should be getting sentiment statements from there.
                // The code below falls back to client-side processing only when necessary.
                
                // If we still don't have valid sentiment statements, use local processing as last resort
                if (!hasValidSentimentStatements) {
                  console.log("Using local processing for sentiment statements as fallback");
                  resultData.sentimentStatements = processFreeTextToSentimentStatements(fileContent);
                  console.log("Generated sentiment statements from file content:", resultData.sentimentStatements);
                }
              } catch (error) {
                console.error("Error getting sentiment statements from backend:", error);
                // Fall back to local processing
                console.log("Falling back to local sentiment processing due to error");
                resultData.sentimentStatements = processFreeTextToSentimentStatements(fileContent);
              }
            } else {
              console.log("Using LLM-generated sentiment statements from analysis");
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
            console.log('Generating sentiment statements from sentiment data');
            
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
            
            console.log('Generated sentiment statements', {
              positive: positive.length,
              neutral: neutral.length,
              negative: negative.length
            });
          } else {
            // Keep existing sentiment statements unedited
            console.log('Using existing sentiment statements from API', {
              positive: resultData.sentimentStatements.positive.length,
              neutral: resultData.sentimentStatements.neutral.length,
              negative: resultData.sentimentStatements.negative.length
            });
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
          try {
            const fileContent = await file.text();
            console.log("Using file content for sentiment statements in history view");
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
          console.log('Generating sentiment statements from sentiment data');
          
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
          
          console.log('Generated sentiment statements', {
            positive: positive.length,
            neutral: neutral.length,
            negative: negative.length
          });
        } else {
          // Keep existing sentiment statements unedited
          console.log('Using existing sentiment statements from API', {
            positive: resultData.sentimentStatements.positive.length,
            neutral: resultData.sentimentStatements.neutral.length,
            negative: resultData.sentimentStatements.negative.length
          });
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
    console.log("Processing free text to extract sentiment statements, text length:", text.length);
    
    if (!text || text.length === 0) {
      console.log("Warning: Empty text provided for sentiment extraction");
      return {
        positive: ["No positive statements found in the text file."],
        neutral: ["No neutral statements found in the text file."],
        negative: ["No negative statements found in the text file."]
      };
    }
    
    // Check if the text is in teams chat format (with timestamps like [09:00 AM])
    const isTeamsFormat = text.match(/\[\d+:\d+ [AP]M\]/);
    console.log("Detected teams format:", isTeamsFormat ? "yes" : "no");
    
    // Extract plain text sentences from transcript
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    console.log(`Processing ${lines.length} lines of text from file`);
    
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
    
    console.log("Extracted sentiment statements:", {
      positive: positive.length,
      neutral: neutral.length,
      negative: negative.length
    });
    
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
      {/* Header with improved visual structure */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 pb-4 border-b">
        <div>
          <h1 className="text-3xl font-bold">Interview Insight Analyst</h1>
          <p className="text-muted-foreground mt-1">Analyze interview data and generate insights</p>
        </div>
        
        {/* User info and settings placeholder - can be expanded later */}
        <div className="mt-4 md:mt-0 flex items-center">
          <span className="text-sm text-muted-foreground mr-2">Logged in as:</span>
          <div className="bg-primary/10 text-primary font-medium rounded-md px-3 py-1 text-sm">
            {userId || 'Guest User'}
          </div>
        </div>
      </header>
      
      {/* Main content with sidebar navigation and content area */}
      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6">
        {/* Sidebar Navigation */}
        <nav className="hidden md:block space-y-1 sticky top-8 self-start">
          <div className="bg-card p-4 rounded-lg shadow-sm mb-4">
            <h3 className="font-medium mb-3 text-sm uppercase tracking-wider text-muted-foreground">Main Navigation</h3>
            <div className="space-y-1">
              <button
                onClick={() => setActiveTab('upload')}
                className={`w-full text-left px-3 py-2 rounded-md flex items-center ${
                  activeTab === 'upload'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                Upload & Analyze
              </button>
              
              <button
                onClick={() => setActiveTab('visualize')}
                disabled={!results}
                className={`w-full text-left px-3 py-2 rounded-md flex items-center ${
                  !results ? 'opacity-50 cursor-not-allowed text-muted-foreground' :
                  activeTab === 'visualize'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                </svg>
                Visualize Results
              </button>
              
              <button
                onClick={() => setActiveTab('history')}
                className={`w-full text-left px-3 py-2 rounded-md flex items-center ${
                  activeTab === 'history'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M5 4a1 1 0 00-2 0v7.268a2 2 0 000 3.464V16a1 1 0 102 0v-1.268a2 2 0 000-3.464V4zM11 4a1 1 0 10-2 0v1.268a2 2 0 000 3.464V16a1 1 0 102 0V8.732a2 2 0 000-3.464V4zM16 3a1 1 0 011 1v7.268a2 2 0 010 3.464V16a1 1 0 11-2 0v-1.268a2 2 0 010-3.464V4a1 1 0 011-1z" />
                </svg>
                History
              </button>
              
              <button
                onClick={() => setActiveTab('documentation')}
                className={`w-full text-left px-3 py-2 rounded-md flex items-center ${
                  activeTab === 'documentation'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                </svg>
                Documentation
              </button>
            </div>
          </div>
          
          {activeTab === 'visualize' && results && (
            <div className="bg-card p-4 rounded-lg shadow-sm">
              <h3 className="font-medium mb-3 text-sm uppercase tracking-wider text-muted-foreground">Visualization</h3>
              <div className="space-y-1">
                <button
                  onClick={() => setVisualizationTab('themes')}
                  className={`w-full text-left px-3 py-2 rounded-md ${
                    visualizationTab === 'themes'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent'
                  }`}
                >
                  Themes
                </button>
                <button
                  onClick={() => setVisualizationTab('patterns')}
                  className={`w-full text-left px-3 py-2 rounded-md ${
                    visualizationTab === 'patterns'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent'
                  }`}
                >
                  Patterns
                </button>
                <button
                  onClick={() => setVisualizationTab('sentiment')}
                  className={`w-full text-left px-3 py-2 rounded-md ${
                    visualizationTab === 'sentiment'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent'
                  }`}
                >
                  Sentiment
                </button>
                <button
                  onClick={() => setVisualizationTab('personas')}
                  className={`w-full text-left px-3 py-2 rounded-md ${
                    visualizationTab === 'personas'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent'
                  }`}
                >
                  Personas
                </button>
              </div>
            </div>
          )}
        </nav>
        
        {/* Mobile Navigation - shown only on small screens */}
        <div className="md:hidden flex overflow-x-auto pb-2 mb-4 space-x-2 scrollbar-hide">
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-4 py-2 whitespace-nowrap rounded-md flex-shrink-0 border ${
              activeTab === 'upload'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border'
            }`}
          >
            Upload & Analyze
          </button>
          <button
            onClick={() => setActiveTab('visualize')}
            disabled={!results}
            className={`px-4 py-2 whitespace-nowrap rounded-md flex-shrink-0 border ${
              !results ? 'opacity-50 cursor-not-allowed bg-card border-border' :
              activeTab === 'visualize'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border'
            }`}
          >
            Visualize
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 whitespace-nowrap rounded-md flex-shrink-0 border ${
              activeTab === 'history'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border'
            }`}
          >
            History
          </button>
          <button
            onClick={() => setActiveTab('documentation')}
            className={`px-4 py-2 whitespace-nowrap rounded-md flex-shrink-0 border ${
              activeTab === 'documentation'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border'
            }`}
          >
            Docs
          </button>
        </div>
        
        {/* Visualization Sub Tabs - Mobile - Shown only when visualize tab is active */}
        {activeTab === 'visualize' && results && (
          <div className="md:hidden flex overflow-x-auto mt-1 mb-4 space-x-2 pb-2 scrollbar-hide">
            <button
              onClick={() => setVisualizationTab('themes')}
              className={`px-3 py-1 text-sm rounded-md whitespace-nowrap flex-shrink-0 ${
                visualizationTab === 'themes'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-accent text-accent-foreground'
              }`}
            >
              Themes
            </button>
            <button
              onClick={() => setVisualizationTab('patterns')}
              className={`px-3 py-1 text-sm rounded-md whitespace-nowrap flex-shrink-0 ${
                visualizationTab === 'patterns'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-accent text-accent-foreground'
              }`}
            >
              Patterns
            </button>
            <button
              onClick={() => setVisualizationTab('sentiment')}
              className={`px-3 py-1 text-sm rounded-md whitespace-nowrap flex-shrink-0 ${
                visualizationTab === 'sentiment'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-accent text-accent-foreground'
              }`}
            >
              Sentiment
            </button>
            <button
              onClick={() => setVisualizationTab('personas')}
              className={`px-3 py-1 text-sm rounded-md whitespace-nowrap flex-shrink-0 ${
                visualizationTab === 'personas'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-accent text-accent-foreground'
              }`}
            >
              Personas
            </button>
          </div>
        )}
        
        {/* Main Content Area */}
        <main className="bg-card p-6 rounded-lg shadow-sm md:col-span-1">
          {/* Tab Content */}
          <div>
            {/* Upload & Analyze Tab */}
            {activeTab === 'upload' && (
              <div className="space-y-8">
                {/* Configuration Section */}
                <section className="bg-card p-6 rounded-lg shadow-sm">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">Analysis Configuration</h2>
                    <HelpDropdown isOpen={isHelpOpen} toggle={toggleHelp} />
                  </div>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Authentication Token
                          <span className="ml-1 text-xs text-blue-500">(Gemini API Key)</span>
                        </label>
                        <div className="flex">
                          <input
                            type="REDACTED_PASSWORD"
                            value={authToken}
                            onChange={(e) => setAuthToken(e.target.value)}
                            className="flex-grow rounded-md border border-input bg-background px-3 py-2 text-sm"
                            placeholder="Enter your Gemini API key"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium mb-1">Analysis Type</label>
                        <select
                          value={visualizationTab}
                          onChange={(e) => setVisualizationTab(e.target.value as any)}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="themes">Thematic Analysis</option>
                          <option value="sentiment">Sentiment Analysis</option>
                          <option value="personas">Persona Generation</option>
                          <option value="patterns">Pattern Analysis</option>
                        </select>
                      </div>
                    </div>
                    
                    <div>
                      {/* File uploaders */}
                      <label className="block text-sm font-medium mb-1">Interview Transcript</label>
                      <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center">
                        <input
                          type="file"
                          id="file-upload"
                          className="hidden"
                          onChange={handleFileChange}
                          accept=".txt,.docx,.pdf"
                        />
                        <label
                          htmlFor="file-upload"
                          className="cursor-pointer flex flex-col items-center justify-center"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <span className="text-sm font-medium">
                            {file ? file.name : "Drop files here or click to upload"}
                          </span>
                          <p className="text-xs text-gray-500 mt-1">
                            Supported formats: .txt, .docx, .pdf
                          </p>
                        </label>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Upload Section */}
                <section className="bg-card p-6 rounded-lg shadow-sm">
                  <h2 className="text-xl font-semibold mb-4">Step 1: Upload Data</h2>
                  
                  <div className="space-y-4">
                    <div className="mt-8 flex gap-4">
                      <Button
                        className="w-full"
                        onClick={handleUpload}
                        disabled={!file || loading}
                        type="button"
                      >
                        {loading ? <LoadingSpinner size="sm" /> : 'Upload'}
                      </Button>
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
              <div>
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
                    {/* Visualization Type Tabs */}
                    <div className="flex space-x-2 border-b mb-6">
                      <button
                        onClick={() => setVisualizationTab('themes')}
                        className={`px-4 py-2 font-medium ${
                          visualizationTab === 'themes'
                            ? 'text-blue-600 border-b-2 border-blue-600'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        Themes
                      </button>
                      <button
                        onClick={() => setVisualizationTab('patterns')}
                        className={`px-4 py-2 font-medium ${
                          visualizationTab === 'patterns'
                            ? 'text-blue-600 border-b-2 border-blue-600'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        Patterns
                      </button>
                      <button
                        onClick={() => setVisualizationTab('sentiment')}
                        className={`px-4 py-2 font-medium ${
                          visualizationTab === 'sentiment'
                            ? 'text-blue-600 border-b-2 border-blue-600'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        Sentiment
                      </button>
                      <button
                        onClick={() => setVisualizationTab('personas')}
                        className={`px-4 py-2 font-medium ${
                          visualizationTab === 'personas'
                            ? 'text-blue-600 border-b-2 border-blue-600'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        Personas
                      </button>
                    </div>

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
                        patternsData={results.patterns}
                      />
                    )}
                    
                    {visualizationTab === 'sentiment' && (
                      <UnifiedVisualization
                        type="sentiment"
                        sentimentData={{
                          overview: results.sentimentOverview,
                          details: results.sentiment,
                          statements: results.sentimentStatements || {
                            positive: results.sentiment.filter(s => s.score > 0.2).map(s => s.text).slice(0, 5),
                            neutral: results.sentiment.filter(s => s.score >= -0.2 && s.score <= 0.2).map(s => s.text).slice(0, 5),
                            negative: results.sentiment.filter(s => s.score < -0.2).map(s => s.text).slice(0, 5)
                          }
                        }}
                      />
                    )}

                    {visualizationTab === 'personas' && (
                      <UnifiedVisualization
                        type="personas"
                        personasData={results.personas || []}
                      />
                    )}
                  </div>
                )}
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
        </main>
      </div>
    </div>
  );
} 