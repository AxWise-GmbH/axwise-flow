/**
 * PRECALL React Query Hooks
 * 
 * Custom hooks for intelligence generation and coaching chat.
 * Follows the same patterns as axpersona/hooks.ts
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';

import {
  ProspectData,
  CallIntelligence,
  ChatMessage,
  GenerateIntelligenceResponse,
  CoachingResponse,
} from './types';
import { generateIntelligence, validateProspectData } from './intelligenceService';
import { sendCoachingMessage } from './coachService';

// Query keys for cache management
export const PRECALL_QUERY_KEYS = {
  intelligence: ['precall', 'intelligence'] as const,
  coaching: ['precall', 'coaching'] as const,
};

/**
 * Hook for generating call intelligence from prospect data
 * 
 * @returns Mutation object with generate function and loading state
 */
export function useGenerateIntelligence() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (prospectData: ProspectData): Promise<GenerateIntelligenceResponse> => {
      // Validate before sending
      const errors = validateProspectData(prospectData);
      if (errors.length > 0) {
        return {
          success: false,
          intelligence: null,
          error: errors.join('. '),
          processing_time_ms: null,
        };
      }

      return generateIntelligence(prospectData);
    },
    onSuccess: (data) => {
      if (data.success && data.intelligence) {
        toast({
          title: 'Intelligence Generated',
          description: `Generated ${data.intelligence.keyInsights.length} insights in ${data.processing_time_ms}ms`,
        });
        // Invalidate any cached intelligence queries
        queryClient.invalidateQueries({ queryKey: PRECALL_QUERY_KEYS.intelligence });
      } else if (data.error) {
        toast({
          title: 'Generation Failed',
          description: data.error,
          variant: 'destructive',
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate intelligence',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook for sending coaching messages
 *
 * @returns Mutation object with sendMessage function and loading state
 */
export function useCoachingChat() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      question,
      prospectData,
      intelligence,
      chatHistory,
      viewContext,
    }: {
      question: string;
      prospectData: ProspectData;
      intelligence: CallIntelligence | null;
      chatHistory: ChatMessage[];
      viewContext?: string;
    }): Promise<CoachingResponse> => {
      if (!question.trim()) {
        return {
          success: false,
          response: '',
          suggestions: [],
          error: 'Please enter a question',
        };
      }

      return sendCoachingMessage(question, prospectData, intelligence, chatHistory, viewContext);
    },
    onError: (error: Error) => {
      toast({
        title: 'Coaching Error',
        description: error.message || 'Failed to get coaching response',
        variant: 'destructive',
      });
    },
  });
}

/**
 * Helper hook to manage chat history state
 * This can be used with useState or integrated into a larger state management solution
 */
export function createChatHistoryHelpers(
  chatHistory: ChatMessage[],
  setChatHistory: (messages: ChatMessage[]) => void
) {
  return {
    addUserMessage: (content: string) => {
      setChatHistory([...chatHistory, { role: 'user', content }]);
    },
    addAssistantMessage: (content: string) => {
      setChatHistory([...chatHistory, { role: 'assistant', content }]);
    },
    clearHistory: () => {
      setChatHistory([]);
    },
  };
}

