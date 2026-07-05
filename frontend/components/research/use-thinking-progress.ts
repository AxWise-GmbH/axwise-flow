/**
 * Hook for managing thinking progress state and polling
 */

import { useState, useCallback, useRef, useEffect } from 'react';
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
  const [persistentSteps, setPersistentSteps] = useState<ThinkingStep[]>([]);

  const pollingRef = useRef<{ stopPolling: () => void } | null>(null);

  // Keep thinking steps persistent for a short time to prevent flickering
  useEffect(() => {
    if (thinkingSteps.length > 0) {
      setPersistentSteps(thinkingSteps);
      console.log('🧠 Updated persistent steps:', thinkingSteps.length);
    }
  }, [thinkingSteps]);

  const startThinking = useCallback((requestId: string) => {
    console.log('🧠 Starting thinking progress for request:', requestId);

    // Clear any previous state
    setThinkingError(null);
    setIsThinking(true);

    // Start with empty steps - only show real ones
    setThinkingSteps([]);
    setPersistentSteps([]);

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
        console.log('🧠 Thinking steps received:', progress.thinking_process);
        console.log('🧠 Alternative thinking steps:', progress.thinking_steps);

        // Use thinking_process first, fallback to thinking_steps
        const steps = progress.thinking_process || progress.thinking_steps || [];
        console.log('🧠 Setting thinking steps:', steps);
        setThinkingSteps(steps);

        // Clear any previous errors
        if (thinkingError) {
          setThinkingError(null);
        }
      },
      // On completion
      (finalProgress: ThinkingProgressResponse) => {
        console.log('🧠 Thinking complete:', finalProgress);
        console.log('🧠 Final thinking steps received:', finalProgress.thinking_process);
        console.log('🧠 Alternative final thinking steps:', finalProgress.thinking_steps);

        // Use thinking_process first, fallback to thinking_steps
        const steps = finalProgress.thinking_process || finalProgress.thinking_steps || [];
        console.log('🧠 Setting final thinking steps:', steps);
        setThinkingSteps(steps);
        // Keep isThinking true so the display persists until manually cleared
        // setIsThinking(false);
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
    setPersistentSteps([]);
    setIsThinking(false);
    setThinkingError(null);
  }, []);

  return {
    thinkingSteps: persistentSteps.length > 0 ? persistentSteps : thinkingSteps,
    isThinking,
    thinkingError,
    startThinking,
    stopThinking,
    updateThinkingSteps,
    clearThinking
  };
}
