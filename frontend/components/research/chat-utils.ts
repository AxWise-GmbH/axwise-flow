/**
 * Utility functions for the Customer Research Chat Interface
 * Extracted from ChatInterface.tsx for better modularity
 */

import { Message, StakeholderData, FormattedStakeholder, GeneratedQuestions } from './types';

/**
 * Scroll to bottom of chat with smooth animation - Mobile optimized
 */
export const scrollToBottom = () => {
  // Scroll to bottom with mobile viewport considerations
  setTimeout(() => {
    const scrollContainer = document.querySelector('[data-radix-scroll-area-viewport]');
    if (scrollContainer) {
      const { scrollHeight, clientHeight } = scrollContainer;

      // Calculate padding based on device type
      const isMobile = window.innerWidth < 768;
      const inputHeight = isMobile ? 80 : 100; // Account for mobile keyboard
      const safeAreaPadding = isMobile ? 20 : 10; // Extra padding for mobile

      // Scroll to bottom with appropriate padding to keep input visible
      const targetScrollTop = scrollHeight - clientHeight + inputHeight + safeAreaPadding;

      scrollContainer.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth'
      });
    } else {
      // Fallback to messagesEndRef if scroll container not found
      const messagesEndRef = document.querySelector('[data-messages-end]');
      messagesEndRef?.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
        inline: 'nearest'
      });
    }
  }, 10);
};

/**
 * Scroll to bottom if needed with delay
 */
export const scrollToBottomIfNeeded = () => {
  setTimeout(() => scrollToBottom(), 50);
};

/**
 * Copy text to clipboard with fallback for older browsers
 */
export const copyToClipboard = async (content: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(content);
    console.log('Message copied to clipboard');
  } catch (err) {
    console.error('Failed to copy message:', err);
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = content;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  }
};

/**
 * 🚨 DEPRECATED: Stakeholder detection - backend LLM handles this now
 * This is a fallback function that should rarely be used
 * The primary stakeholder detection happens in the backend via LLM
 */
export const detectMultipleStakeholders = (context: any, conversationMessages?: Message[]) => {
  console.warn('🚨 DEPRECATED: detectMultipleStakeholders called - backend LLM should handle stakeholder detection');

  // Return generic fallback - backend LLM should handle all stakeholder detection
  return {
    detected: true,
    stakeholders: {
      primary: ['Primary Stakeholders'],
      secondary: ['Secondary Stakeholders'],
      industry: 'general',
      reasoning: 'Frontend fallback - backend LLM should handle stakeholder detection'
    }
  };
};

/**
 * Get stakeholder name from stakeholder object or string
 */
export const getStakeholderName = (stakeholder: any): string => {
  return typeof stakeholder === 'string' ? stakeholder : stakeholder.name;
};

/**
 * Get stakeholder description from stakeholder object
 */
export const getStakeholderDescription = (stakeholder: any): string => {
  return typeof stakeholder === 'string' ? '' : stakeholder.description;
};

/**
 * Format stakeholders data to proper format with LLM-generated descriptions
 */
export const formatStakeholders = (stakeholders: any[], type: 'primary' | 'secondary'): FormattedStakeholder[] => {
  console.log('Formatting stakeholders:', stakeholders, 'Type:', type);
  return stakeholders.map((stakeholder, index) => {
    // Handle both old format (string) and new format (object with name/description)
    if (typeof stakeholder === 'string') {
      console.log('Converting old format stakeholder:', stakeholder);
      return {
        name: stakeholder,
        type,
        description: `Stakeholder involved in ${stakeholder.toLowerCase()} activities`,
        priority: type === 'primary' ? index + 1 : index + 4
      };
    } else if (stakeholder && typeof stakeholder === 'object' && stakeholder.name && stakeholder.description) {
      console.log('Using new format stakeholder:', stakeholder);
      return {
        name: stakeholder.name,
        type,
        description: stakeholder.description,
        priority: type === 'primary' ? index + 1 : index + 4
      };
    } else {
      console.error('Invalid stakeholder format:', stakeholder);
      return {
        name: 'Unknown Stakeholder',
        type,
        description: 'Invalid stakeholder data',
        priority: type === 'primary' ? index + 1 : index + 4
      };
    }
  });
};

/**
 * Extract suggestions from API response with fallbacks
 */
export const extractSuggestions = (
  data: any,
  context: any,
  hasCompleteQuestions: boolean = false
): string[] => {
  let suggestions: string[] = [];

  // Debug logging to see what we're receiving
  console.log('🔧 API Response data structure:', {
    suggestions: data.suggestions,
    metadata: data.metadata,
    hasDirectSuggestions: data.suggestions && Array.isArray(data.suggestions),
    suggestionsLength: data.suggestions?.length || 0
  });

  // V3 Rebuilt: Try to extract suggestions from the direct suggestions field first
  if (data.suggestions && Array.isArray(data.suggestions)) {
    suggestions = data.suggestions;
    console.log('🔧 Found V3 Rebuilt suggestions:', suggestions);
  }
  // V3 Simple: Try to extract suggestions from the API response metadata (legacy)
  else if (data.metadata?.suggestions && Array.isArray(data.metadata.suggestions)) {
    suggestions = data.metadata.suggestions;
    console.log('🔧 Found V3 Simple metadata suggestions:', suggestions);
  } else if (data.metadata && 'contextual_suggestions' in data.metadata && Array.isArray((data.metadata as any).contextual_suggestions)) {
    suggestions = (data.metadata as any).contextual_suggestions;
    console.log('🔧 Found V3 Simple contextual suggestions:', suggestions);
  }

  // If no suggestions from API, generate contextual fallback suggestions
  // Note: Generate suggestions even when questions are present, unless it's the final question set
  if (suggestions.length === 0 && !hasCompleteQuestions) {
    console.log('🔧 No API suggestions found, generating fallback suggestions');
    const businessContext = data.metadata?.extracted_context?.business_idea || context.businessIdea || '';
    const customerContext = data.metadata?.extracted_context?.target_customer || context.targetCustomer || '';

    if (businessContext && customerContext) {
      suggestions = [
        `Tell me more about ${customerContext}`,
        `What challenges do ${customerContext} face?`,
        `How would ${businessContext} help them?`
      ];
    } else if (businessContext) {
      suggestions = [
        'Who would use this?',
        'What problem does this solve?',
        'Tell me more about the market'
      ];
    } else {
      suggestions = [
        "Mobile app",
        "Service business",
        "Physical product"
      ];
    }
    console.log('🔧 Generated fallback suggestions:', suggestions);
  }

  return suggestions;
};

/**
 * Check if questions are complete (all three categories present)
 */
export const hasCompleteQuestions = (questions: any): boolean => {
  return questions &&
    questions.problemDiscovery && questions.problemDiscovery.length > 0 &&
    questions.solutionValidation && questions.solutionValidation.length > 0 &&
    questions.followUp && questions.followUp.length > 0;
};



/**
 * Create initial chat message
 */
export const createInitialMessage = (): Message => ({
  id: '1',
  content: "Hi! I'm your customer research assistant. I'll help you create targeted research questions for your business idea. Let's start - what's your business idea?",
  role: 'assistant',
  timestamp: new Date(),
});

/**
 * Generate unique message ID
 */
let messageIdCounter = 0;
const generateUniqueMessageId = (): string => {
  messageIdCounter += 1;
  return `${Date.now()}_${messageIdCounter}_${Math.random().toString(36).substring(2, 11)}`;
};

/**
 * Create user message
 */
export const createUserMessage = (content: string): Message => ({
  id: generateUniqueMessageId(),
  content,
  role: 'user',
  timestamp: new Date(),
});

/**
 * Create assistant message
 */
export const createAssistantMessage = (content: string, metadata?: any): Message => ({
  id: generateUniqueMessageId(),
  content,
  role: 'assistant',
  timestamp: new Date(),
  metadata
});



/**
 * Debug logging for suggestions
 */
export const logSuggestionsDebug = (suggestions: string[], data: any, context: any) => {
  console.log('🔧 SUGGESTIONS DEBUG:', {
    finalSuggestions: suggestions,
    suggestionsLength: suggestions.length,
    hasQuestions: !!data.questions,
    hasCompleteQuestions: hasCompleteQuestions(data.questions),
    // V3 Rebuilt format
    directSuggestions: data.suggestions,
    // V3 Simple format (legacy)
    metadataSuggestions: data.metadata?.suggestions,
    contextualSuggestions: (data.metadata as any)?.contextual_suggestions,
    businessContext: data.metadata?.extracted_context?.business_idea || context.businessIdea,
    customerContext: data.metadata?.extracted_context?.target_customer || context.targetCustomer,
    // V3 Rebuilt enhancements
    v3Enhancements: data.v3_enhancements,
    industryAnalysis: data.metadata?.industry_analysis,
    serviceVersion: data.api_version,
    fullMetadata: data.metadata
  });
};

/**
 * 🚨 DEPRECATED: Generate stakeholder-specific research questions using LLM
 * This function is deprecated - all question generation now happens in the backend via LLM
 * Kept only for backward compatibility
 */
export const generateStakeholderQuestions = (stakeholders: any[], businessContext: string, industry: string) => {
  console.warn('🚨 DEPRECATED: generateStakeholderQuestions called - all question generation should be done by backend LLM');

  // Return minimal fallback to prevent errors - this should not be used in production
  return stakeholders.map(stakeholder => {
    const name = getStakeholderName(stakeholder);
    const description = getStakeholderDescription(stakeholder);
    const type = stakeholder.type || 'primary';

    return {
      name,
      description: description || `Key stakeholder in ${businessContext}`,
      type,
      questions: {
        discovery: [`Questions for ${name} will be generated by backend LLM`],
        validation: [`Backend LLM handles all question generation`],
        followUp: [`This frontend function is deprecated`]
      }
    };
  });
};
