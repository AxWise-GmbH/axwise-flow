'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LoadingSpinner } from '@/components/loading-spinner';
import { useToast } from '@/components/providers/toast-provider';
import UnifiedVisualization from '@/components/visualization/UnifiedVisualization';
import { apiClient } from '@/lib/apiClient';
import { getMockAnalysisById } from '@/lib/mockData';
import { UploadResponse, AnalysisResponse, DetailedAnalysisResult } from '@/types/api';

export default function UnifiedDashboard() {
  const router = useRouter();
  const { showToast } = useToast();
  
  // State for active tab
  const [activeTab, setActiveTab] = useState<'upload' | 'visualize' | 'history' | 'documentation'>('upload');
  
  // State for visualization sub-tab
  const [visualizationTab, setVisualizationTab] = useState<'themes' | 'patterns' | 'sentiment'>('themes');
  
  // Upload and analysis state
  const [file, setFile] = useState<File | null>(null);
  const [uploadResponse, setUploadResponse] = useState<UploadResponse | null>(null);
  const [analysisResponse, setAnalysisResponse] = useState<AnalysisResponse | null>(null);
  const [results, setResults] = useState<DetailedAnalysisResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [useMockData, setUseMockData] = useState<boolean>(false);
  const [authToken, setAuthToken] = useState<string>('testuser123');
  const [llmProvider, setLlmProvider] = useState<'openai' | 'gemini'>('gemini');
  
  // History state
  const [analyses, setAnalyses] = useState<DetailedAnalysisResult[]>([]);
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<Error | null>(null);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
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
      
      // Upload the file
      const response = await apiClient.uploadData(file, !useMockData);
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

  // Handle analysis
  const handleAnalyze = async () => {
    if (!uploadResponse) {
      showToast('Please upload a file first', { variant: 'error' });
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Set auth token
      apiClient.setAuthToken(authToken);
      
      // Trigger analysis
      const response = await apiClient.analyzeData(uploadResponse.data_id, llmProvider, !useMockData);
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
      
      try {
        // Fetch results
        const resultData = await apiClient.getAnalysisById(String(analysisResponse.result_id), !useMockData);
        
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
          
          // Ensure patterns have category field
          if (resultData.patterns) {
            resultData.patterns = resultData.patterns.map((pattern: any) => {
              if (pattern.type && !pattern.category) {
                return { ...pattern, category: pattern.type };
              }
              return pattern;
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

  // Fetch analysis history
  useEffect(() => {
    async function fetchAnalyses() {
      try {
        setHistoryLoading(true);
        setHistoryError(null);
        
        // Set auth token
        apiClient.setAuthToken(authToken);
        
        // In development, we can use mock data for faster testing
        if (useMockData || process.env.NEXT_PUBLIC_...=***REMOVED*** 'true') {
          await new Promise(resolve => setTimeout(resolve, 500));
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
              sortBy: sortBy === 'date' ? 'createdAt' : 'fileName',
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
  }, [activeTab, showToast, sortBy, sortDirection, filterStatus, authToken, useMockData]);

  // Load an analysis from history
  const loadAnalysisFromHistory = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      
      // Set auth token
      apiClient.setAuthToken(authToken);
      
      // Fetch results
      const resultData = await apiClient.getAnalysisById(id, !useMockData);
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
          Analysis History
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
                <button
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
                  onClick={() => setUseMockData(!useMockData)}
                >
                  Toggle Mock Data
                </button>
                <div className="text-sm">
                  Status: Using {useMockData ? 'mock' : 'real'} data
                </div>
                
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
                        checked={llmProvider === 'openai'}
                        onChange={() => setLlmProvider('openai')}
                      />
                      <span>OpenAI</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        checked={llmProvider === 'gemini'}
                        onChange={() => setLlmProvider('gemini')}
                      />
                      <span>Google Gemini</span>
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
                <div className="flex items-center space-x-4">
                  <button
                    className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
                    onClick={handleAnalyze}
                    disabled={!uploadResponse || loading}
                  >
                    {loading ? <LoadingSpinner size="sm" /> : 'Analyze'}
                  </button>
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
                </div>

                {/* Visualization Content */}
                {visualizationTab === 'themes' && (
                  <UnifiedVisualization
                    type="themes"
                    themesData={results.themes}
                    className="mt-4"
                  />
                )}
                
                {visualizationTab === 'patterns' && (
                  <UnifiedVisualization
                    type="patterns"
                    patternsData={results.patterns}
                    className="mt-4"
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
                    className="mt-4"
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
    </div>
  );
} 