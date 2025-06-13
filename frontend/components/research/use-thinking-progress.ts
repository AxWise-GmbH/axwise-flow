/**
 * Hook for managing thinking progress state and polling
 */

import { useState, useCallback, useRef } from 'react';
import { 
  ThinkingStep, 
  ThinkingProgressResponse,
  startThinkingProgressPolling,
  createInitialThinkingSteps
} from '@/lib/api/thinking-progress';

interface UseThinkingProgressReturn {
  // State
  thinkingSteps: ThinkingStep[];
  isThinking: boolean;
  thinkingError: string | null;
  
  // Actions
  startThinking: (requestId: string) => void;
  stopThinking: () => void;
  updateThinkingSteps: (steps: ThinkingStep[]) => void;
  clearThinking: () => void;
}

export function useThinkingProgress(): UseThinkingProgressReturn {
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingError, setThinkingError] = useState<string | null>(null);
  
  const pollingRef = useRef<{ stopPolling: () => void } | null>(null);

  const startThinking = useCallback((requestId: string) => {
    console.log('🧠 Starting thinking progress for request:', requestId);
    
    // Clear any previous state
    setThinkingError(null);
    setIsThinking(true);
    
    // Set initial thinking steps for immediate feedback
    const initialSteps = createInitialThinkingSteps();
    setThinkingSteps(initialSteps);
    
    // Stop any existing polling
    if (pollingRef.current) {
      pollingRef.current.stopPolling();
    }
    
    // Start polling for progress
    pollingRef.current = startThinkingProgressPolling(
      requestId,
      // On progress update
      (progress: ThinkingProgressResponse) => {
        console.log('🧠 Thinking progress update:', progress);
        setThinkingSteps(progress.thinking_process || []);
        
        // Clear any previous errors
        if (thinkingError) {
          setThinkingError(null);
        }
      },
      // On completion
      (finalProgress: ThinkingProgressResponse) => {
        console.log('🧠 Thinking complete:', finalProgress);
        setThinkingSteps(finalProgress.thinking_process || []);
        setIsThinking(false);
      },
      // On error
      (error: Error) => {
        console.error('🧠 Thinking progress error:', error);
        setThinkingError(error.message);
        setIsThinking(false);
      }
    );
  }, [thinkingError]);

  const stopThinking = useCallback(() => {
    console.log('🧠 Stopping thinking progress');
    
    if (pollingRef.current) {
      pollingRef.current.stopPolling();
      pollingRef.current = null;
    }
    
    setIsThinking(false);
  }, []);

  const updateThinkingSteps = useCallback((steps: ThinkingStep[]) => {
    setThinkingSteps(steps);
  }, []);

  const clearThinking = useCallback(() => {
    console.log('🧠 Clearing thinking progress');
    
    // Stop polling
    if (pollingRef.current) {
      pollingRef.current.stopPolling();
      pollingRef.current = null;
    }
    
    // Clear state
    setThinkingSteps([]);
    setIsThinking(false);
    setThinkingError(null);
  }, []);

  return {
    thinkingSteps,
    isThinking,
    thinkingError,
    startThinking,
    stopThinking,
    updateThinkingSteps,
    clearThinking
  };
}
