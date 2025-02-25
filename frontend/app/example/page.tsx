'use client';

import React, { useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import { UploadResponse, AnalysisResponse, DetailedAnalysisResult } from '@/types/api';
import { ThemeChart, PatternList, SentimentGraph } from '@/components/visualization';

/**
 * Example page demonstrating backend integration
 * This page shows how to upload data, trigger analysis, and display results
 */
export default function ExamplePage() {
  // State for tracking the upload and analysis process
  const [file, setFile] = useState<File | null>(null);
  const [uploadResponse, setUploadResponse] = useState<UploadResponse | null>(null);
  const [analysisResponse, setAnalysisResponse] = useState<AnalysisResponse | null>(null);
  const [results, setResults] = useState<DetailedAnalysisResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [useMockData, setUseMockData] = useState<boolean>(false);
  const [authToken, setAuthToken] = useState<string>('testuser123');
  const [activeTab, setActiveTab] = useState<'themes' | 'patterns' | 'sentiment'>('themes');

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  // Handle file upload
  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file to upload');
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
      
      // Clear previous analysis data
      setAnalysisResponse(null);
      setResults(null);
    } catch (err) {
      setError(`Upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle analysis
  const handleAnalyze = async () => {
    if (!uploadResponse) {
      setError('Please upload a file first');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Set auth token
      apiClient.setAuthToken(authToken);
      
      // Trigger analysis
      const response = await apiClient.analyzeData(uploadResponse.data_id, 'openai', !useMockData);
      setAnalysisResponse(response);
      
      // Clear previous results
      setResults(null);
    } catch (err) {
      setError(`Analysis failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle fetching results
  const handleGetResults = async () => {
    if (!analysisResponse) {
      setError('Please analyze the data first');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Set auth token
      apiClient.setAuthToken(authToken);
      
      // Fetch results
      const resultData = await apiClient.getAnalysisById(String(analysisResponse.result_id), !useMockData);
      setResults(resultData);
    } catch (err) {
      setError(`Failed to fetch results: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  // Toggle between mock and real data
  const toggleMockData = () => {
    // Update the local state
    setUseMockData(!useMockData);
    // Reset state
    setFile(null);
    setUploadResponse(null);
    setAnalysisResponse(null);
    setResults(null);
    setError(null);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Backend Integration Example</h1>
        <p className="text-muted-foreground mt-2">
          This page demonstrates how to use the API client to upload data, trigger analysis, and display results.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8">
        {/* Configuration Section */}
        <section className="bg-card p-6 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Configuration</h2>
          
          <div className="flex items-center space-x-4">
            <button
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md"
              onClick={toggleMockData}
            >
              Toggle Mock Data
            </button>
            <div className="text-sm">
              Status: Using {useMockData ? 'mock' : 'real'} data
            </div>
            
            <div className="ml-8">
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
          </div>
        </section>

        {/* Upload Section */}
        <section className="bg-card p-6 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Step 1: Upload Data</h2>
          
          <div className="space-y-4">
            <div className="flex items-center space-x-4">
              <input
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="border border-border rounded-md p-2"
              />
              <button
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md disabled:opacity-50"
                onClick={handleUpload}
                disabled={!file || loading || file.type !== 'application/json'}
              >
                Upload
              </button>
            </div>
            
            {uploadResponse && (
              <div className="p-4 bg-green-100 dark:bg-green-800/30 rounded-md">
                <h3 className="font-medium">Upload Successful</h3>
                <p className="text-sm mt-1">Data ID: {uploadResponse.data_id}</p>
                <p className="text-sm">{uploadResponse.message}</p>
              </div>
            )}
          </div>
        </section>

        {/* Analysis Section */}
        <section className="bg-card p-6 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Step 2: Trigger Analysis</h2>
          
          <div className="space-y-4">
            <button
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md disabled:opacity-50"
              onClick={handleAnalyze}
              disabled={!uploadResponse || loading}
            >
              Analyze Data
            </button>
            
            {analysisResponse && (
              <div className="p-4 bg-green-100 dark:bg-green-800/30 rounded-md">
                <h3 className="font-medium">Analysis Started</h3>
                <p className="text-sm mt-1">Result ID: {analysisResponse.result_id}</p>
                <p className="text-sm">{analysisResponse.message}</p>
              </div>
            )}
          </div>
        </section>

        {/* Results Section */}
        <section className="bg-card p-6 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Step 3: View Results</h2>
          
          <div className="space-y-4">
            <button
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md disabled:opacity-50"
              onClick={handleGetResults}
              disabled={!analysisResponse || loading}
            >
              Get Results
            </button>
            
            {loading && (
              <div className="p-4 bg-muted/30 rounded-md">
                <p>Loading...</p>
              </div>
            )}
            
            {error && (
              <div className="p-4 bg-red-100 dark:bg-red-800/30 rounded-md">
                <h3 className="font-medium text-red-800 dark:text-red-300">Error</h3>
                <p className="text-sm mt-1">{error}</p>
              </div>
            )}
            
            {results && (
              <div className="mt-4">
                <div className="border-b border-border mb-4">
                  <nav className="flex space-x-8">
                    <button
                      className={`py-4 px-1 border-b-2 font-medium text-sm ${
                        activeTab === 'themes'
                          ? 'border-primary text-primary'
                          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                      }`}
                      onClick={() => setActiveTab('themes')}
                    >
                      Themes
                    </button>
                    <button
                      className={`py-4 px-1 border-b-2 font-medium text-sm ${
                        activeTab === 'patterns'
                          ? 'border-primary text-primary'
                          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                      }`}
                      onClick={() => setActiveTab('patterns')}
                    >
                      Patterns
                    </button>
                    <button
                      className={`py-4 px-1 border-b-2 font-medium text-sm ${
                        activeTab === 'sentiment'
                          ? 'border-primary text-primary'
                          : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                      }`}
                      onClick={() => setActiveTab('sentiment')}
                    >
                      Sentiment
                    </button>
                  </nav>
                </div>
                
                <div className="py-4">
                  {activeTab === 'themes' && <ThemeChart data={results.themes} />}
                  {activeTab === 'patterns' && <PatternList data={results.patterns} />}
                  {activeTab === 'sentiment' && (
                    <SentimentGraph 
                      data={results.sentimentOverview} 
                      detailedData={results.sentiment}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      <footer className="mt-12 text-center text-sm text-muted-foreground">
        <p>
          This example demonstrates how to use the API client to interact with the backend.
          You can toggle between mock and real data to test the frontend without a running backend.
        </p>
      </footer>
    </div>
  );
}