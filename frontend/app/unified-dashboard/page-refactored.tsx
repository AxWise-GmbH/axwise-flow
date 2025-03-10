'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/loading-spinner';
import { useToast } from '@/components/providers/toast-provider';
import { useAuth } from '@clerk/nextjs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileText } from 'lucide-react';

// Import our refactored components
import UploadPanel from '@/components/upload/UploadPanel';
import VisualizationTabs from '@/components/visualization/VisualizationTabs';
import HistoryPanel from '@/components/history/HistoryPanel';

// Import stores
import { useAnalysisStore } from '@/store/useAnalysisStore';
import { useUploadStore } from '@/store/useUploadStore';

/**
 * Main dashboard component
 * Uses the new component structure and state management
 */
export default function UnifiedDashboard() {
  const router = useRouter();
  const { showToast } = useToast();
  const { userId, isLoaded } = useAuth();
  
  // State for active tab
  const [activeTab, setActiveTab] = useState<'upload' | 'visualize' | 'history' | 'documentation'>('upload');
  
  // Get analysis state
  const currentAnalysis = useAnalysisStore(state => state.currentAnalysis);
  const analysisHistory = useAnalysisStore(state => state.analysisHistory);
  
  // Get upload state
  const uploadResponse = useUploadStore(state => state.uploadResponse);
  const analysisResponse = useUploadStore(state => state.analysisResponse);
  
  // Handle authentication redirection
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
        if (tabParam === 'history' || tabParam === 'documentation' || 
            tabParam === 'visualize' || tabParam === 'upload') {
          setActiveTab(tabParam as 'upload' | 'visualize' | 'history' | 'documentation');
        }
      }
    }
  }, []);
  
  // Update URL when tabs change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', activeTab);
      window.history.pushState({}, '', url);
    }
  }, [activeTab]);
  
  // Handle tab change and automate some tab switching
  useEffect(() => {
    // Auto-switch to visualization tab when analysis is loaded
    if (currentAnalysis && activeTab !== 'visualize') {
      setActiveTab('visualize');
      showToast('Analysis loaded successfully', { variant: 'success' });
    }
    
    // Auto-switch to history tab when first accessing the app with history
    if (analysisHistory.length > 0 && !currentAnalysis && !uploadResponse && activeTab === 'upload') {
      setActiveTab('history');
    }
  }, [currentAnalysis, analysisHistory, uploadResponse, activeTab, showToast]);
  
  // If still loading auth state, show spinner
  if (!isLoaded) {
    return <LoadingSpinner />;
  }
  
  return (
    <div className="container mx-auto py-6 space-y-8">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="upload">
            <FileText className="mr-2 h-4 w-4" />
            Upload
          </TabsTrigger>
          <TabsTrigger 
            value="visualize" 
            disabled={!currentAnalysis && !analysisResponse}
          >
            Visualize
          </TabsTrigger>
          <TabsTrigger value="history">
            History
          </TabsTrigger>
          <TabsTrigger value="documentation">
            Documentation
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="upload" className="mt-6">
          <UploadPanel />
        </TabsContent>
        
        <TabsContent value="visualize" className="mt-6">
          {currentAnalysis ? (
            <VisualizationTabs />
          ) : analysisResponse ? (
            <VisualizationTabs analysisId={analysisResponse.result_id.toString()} />
          ) : (
            <Alert>
              <AlertTitle>No Analysis Selected</AlertTitle>
              <AlertDescription>
                Please upload a file and run an analysis, or select an analysis from your history.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>
        
        <TabsContent value="history" className="mt-6">
          <HistoryPanel />
        </TabsContent>
        
        <TabsContent value="documentation" className="mt-6">
          <DocumentationPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Simple documentation panel component
 * This could be extracted to its own file in the future
 */
function DocumentationPanel() {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">
      <h2>Interview Insight Analyst Documentation</h2>
      
      <h3>Getting Started</h3>
      <p>
        Upload an interview transcript to analyze themes, patterns, and sentiment.
        The system works best with conversation-style interviews, either in plain text
        format or in a structured JSON format.
      </p>
      
      <h3>File Formats</h3>
      <ul>
        <li>
          <strong>Plain Text (.txt)</strong> - Simple text file with the interview transcript.
          The system will attempt to identify speakers and segments automatically.
        </li>
        <li>
          <strong>JSON Format</strong> - Structured interview data with the following format:
          <pre>
            {`{
  "metadata": {
    "title": "Interview Title",
    "date": "2024-03-10",
    "participants": ["Interviewer", "Subject"]
  },
  "transcript": [
    {
      "speaker": "Interviewer",
      "text": "Tell me about your experience with...",
      "timestamp": "00:01:24"
    },
    {
      "speaker": "Subject",
      "text": "Well, I've been working with this technology for...",
      "timestamp": "00:01:32"
    }
  ]
}`}
          </pre>
        </li>
      </ul>
      
      <h3>Analysis Process</h3>
      <ol>
        <li>Upload your interview file using the Upload tab.</li>
        <li>Select your preferred LLM provider (OpenAI or Gemini).</li>
        <li>Click "Start Analysis" to begin processing.</li>
        <li>Once complete, view the results in the Visualization tab.</li>
      </ol>
      
      <h3>Understanding the Results</h3>
      <ul>
        <li>
          <strong>Themes</strong> - Key topics and concepts mentioned in the interview,
          with frequency and representative quotes.
        </li>
        <li>
          <strong>Patterns</strong> - Recurring behaviors, attitudes, or expressions
          identified in the interview.
        </li>
        <li>
          <strong>Sentiment</strong> - Emotional tone throughout the interview,
          shown as a timeline and with supporting statements.
        </li>
        <li>
          <strong>Personas</strong> - AI-generated profiles based on the interview content,
          identifying roles, responsibilities, and characteristics.
        </li>
      </ul>
    </div>
  );
} 