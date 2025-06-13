/**
 * Utility functions for the Customer Research Chat Interface
 * Extracted from ChatInterface.tsx for better modularity
 */

import { Message, StakeholderData, FormattedStakeholder, GeneratedQuestions } from './types';

/**
 * Scroll to bottom of chat with smooth animation
 */
export const scrollToBottom = () => {
  // Scroll to bottom but leave some padding to keep input visible
  setTimeout(() => {
    const scrollContainer = document.querySelector('[data-radix-scroll-area-viewport]');
    if (scrollContainer) {
      const { scrollHeight, clientHeight } = scrollContainer;
      // Scroll to bottom minus 80px padding to keep input field visible
      const targetScrollTop = scrollHeight - clientHeight + 80;
      scrollContainer.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth'
      });
    } else {
      // Fallback to messagesEndRef if scroll container not found
      const messagesEndRef = document.querySelector('[data-messages-end]');
      messagesEndRef?.scrollIntoView({
        behavior: 'smooth',
        block: 'end'
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
 * Simplified stakeholder detection - primarily rely on LLM backend analysis
 * This is now a fallback function - the primary stakeholder detection happens in the backend via LLM
 */
export const detectMultipleStakeholders = (context: any, conversationMessages?: Message[]) => {
  const businessIdea = context.businessIdea?.toLowerCase() || '';
  const targetCustomer = context.targetCustomer?.toLowerCase() || '';
  const problem = context.problem?.toLowerCase() || '';

  // Simple fallback detection for when LLM analysis is not available
  if (businessIdea.includes('ux') || businessIdea.includes('research') || businessIdea.includes('design')) {
    return {
      detected: true,
      stakeholders: {
        primary: ['UX Researchers', 'Product Managers'],
        secondary: ['Research Operations', 'Design Teams'],
        industry: 'ux_research',
        reasoning: 'Fallback detection based on UX/research keywords'
      }
    };
  }

  if (businessIdea.includes('healthcare') || businessIdea.includes('medical') || businessIdea.includes('patient')) {
    return {
      detected: true,
      stakeholders: {
        primary: ['Healthcare Providers', 'Patients'],
        secondary: ['Hospital Administrators', 'Insurance Companies'],
        industry: 'healthcare',
        reasoning: 'Fallback detection based on healthcare keywords'
      }
    };
  }

  // Default fallback
  return {
    detected: true,
    stakeholders: {
      primary: ['Decision Makers', 'End Users'],
      secondary: ['IT Teams', 'Support Staff'],
      industry: 'general',
      reasoning: 'Generic fallback stakeholders'
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

  // Try to extract suggestions from the API response metadata
  if (data.metadata?.suggestions && Array.isArray(data.metadata.suggestions)) {
    suggestions = data.metadata.suggestions;
  } else if (data.metadata && 'contextual_suggestions' in data.metadata && Array.isArray((data.metadata as any).contextual_suggestions)) {
    suggestions = (data.metadata as any).contextual_suggestions;
  }

  // If no suggestions from API, generate contextual fallback suggestions
  // Note: Generate suggestions even when questions are present, unless it's the final question set
  if (suggestions.length === 0 && !hasCompleteQuestions) {
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
        'Can you be more specific?',
        'What industry is this for?',
        'Who are your target customers?'
      ];
    }
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
 * Convert comprehensive questions to simple format for backward compatibility
 */
export const convertToSimpleQuestions = (comprehensiveQuestions: any): GeneratedQuestions => {
  const allQuestions: GeneratedQuestions = {
    problemDiscovery: [],
    solutionValidation: [],
    followUp: []
  };

  // Combine all stakeholder questions for backward compatibility
  [...(comprehensiveQuestions.primaryStakeholders || []), ...(comprehensiveQuestions.secondaryStakeholders || [])].forEach((stakeholder: any) => {
    if (stakeholder.questions) {
      allQuestions.problemDiscovery.push(...(stakeholder.questions.problemDiscovery || []));
      allQuestions.solutionValidation.push(...(stakeholder.questions.solutionValidation || []));
      allQuestions.followUp.push(...(stakeholder.questions.followUp || []));
    }
  });

  return allQuestions;
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
 * Create user message
 */
export const createUserMessage = (content: string): Message => ({
  id: Date.now().toString(),
  content,
  role: 'user',
  timestamp: new Date(),
});

/**
 * Create assistant message
 */
export const createAssistantMessage = (content: string, metadata?: any): Message => ({
  id: (Date.now() + 2).toString(),
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
    metadataSuggestions: data.metadata?.suggestions,
    contextualSuggestions: (data.metadata as any)?.contextual_suggestions,
    businessContext: data.metadata?.extracted_context?.business_idea || context.businessIdea,
    customerContext: data.metadata?.extracted_context?.target_customer || context.targetCustomer,
    apiSuggestions: (data as any).suggestions,
    fullMetadata: data.metadata
  });
};

/**
 * Generate stakeholder-specific research questions with industry-specific templates
 */
export const generateStakeholderQuestions = (stakeholders: any[], businessContext: string, industry: string) => {
  // Industry-specific question templates
  const getIndustrySpecificQuestions = (stakeholderName: string, businessContext: string, industry: string) => {
    const lowerStakeholder = stakeholderName.toLowerCase();
    const lowerBusiness = businessContext.toLowerCase();
    const lowerIndustry = industry.toLowerCase();

    // Detect business type for more specific questions
    const isB2B = lowerBusiness.includes('manufacturer') || lowerBusiness.includes('enterprise') || lowerBusiness.includes('business') || lowerBusiness.includes('company');
    const isB2C = lowerBusiness.includes('consumer') || lowerBusiness.includes('customer') || lowerBusiness.includes('user') || lowerBusiness.includes('individual');
    const isTech = lowerBusiness.includes('software') || lowerBusiness.includes('app') || lowerBusiness.includes('platform') || lowerBusiness.includes('digital') || lowerBusiness.includes('api');
    const isHealthcare = lowerBusiness.includes('medical') || lowerBusiness.includes('health') || lowerBusiness.includes('patient') || lowerBusiness.includes('clinical');
    const isManufacturing = lowerBusiness.includes('manufacturing') || lowerBusiness.includes('production') || lowerBusiness.includes('factory') || lowerBusiness.includes('material');
    const isFintech = lowerBusiness.includes('financial') || lowerBusiness.includes('payment') || lowerBusiness.includes('banking') || lowerBusiness.includes('fintech');
    const isEcommerce = lowerBusiness.includes('ecommerce') || lowerBusiness.includes('marketplace') || lowerBusiness.includes('retail') || lowerBusiness.includes('shopping');
    const isEducation = lowerBusiness.includes('education') || lowerBusiness.includes('learning') || lowerBusiness.includes('training') || lowerBusiness.includes('course');

    let discoveryQuestions = [];
    let validationQuestions = [];
    let followUpQuestions = [];

    if (isHealthcare) {
      discoveryQuestions = [
        `How do ${lowerStakeholder} currently manage ${lowerBusiness} in their daily practice?`,
        `What regulatory or compliance challenges do ${lowerStakeholder} face with current solutions?`,
        `How do ${lowerStakeholder} ensure patient safety and data privacy in their current workflow?`,
        `What are the most time-consuming aspects of ${lowerStakeholder}'s current process?`,
        `How do ${lowerStakeholder} stay updated with medical standards and best practices?`
      ];
      validationQuestions = [
        `Would a solution that improves patient outcomes be valuable to ${lowerStakeholder}?`,
        `How important is regulatory compliance (FDA, HIPAA) in ${lowerStakeholder}'s decision-making?`,
        `What evidence would ${lowerStakeholder} need to see before adopting a new medical solution?`,
        `How do ${lowerStakeholder} typically evaluate the clinical effectiveness of new tools?`,
        `What concerns would ${lowerStakeholder} have about patient data security?`
      ];
    } else if (isTech) {
      discoveryQuestions = [
        `How do ${lowerStakeholder} currently integrate ${lowerBusiness} into their existing tech stack?`,
        `What are the biggest technical challenges ${lowerStakeholder} face with current solutions?`,
        `How do ${lowerStakeholder} handle scalability and performance requirements?`,
        `What development or implementation resources do ${lowerStakeholder} typically allocate?`,
        `How do ${lowerStakeholder} evaluate technical documentation and developer experience?`
      ];
      validationQuestions = [
        `Would a solution that reduces development time be valuable to ${lowerStakeholder}?`,
        `How important are API reliability and uptime to ${lowerStakeholder}?`,
        `What technical specifications would ${lowerStakeholder} need before implementation?`,
        `How do ${lowerStakeholder} typically test and validate new technical solutions?`,
        `What concerns would ${lowerStakeholder} have about system integration and security?`
      ];
    } else {
      // Generic business questions as fallback
      discoveryQuestions = [
        `How do ${lowerStakeholder} currently handle challenges related to ${lowerBusiness}?`,
        `What are the biggest pain points ${lowerStakeholder} face in their current workflow?`,
        `How much time do ${lowerStakeholder} typically spend on tasks related to this area?`,
        `What happens when current processes don't work as expected for ${lowerStakeholder}?`,
        `How do ${lowerStakeholder} currently make decisions in this space?`
      ];
      validationQuestions = [
        `Would a solution addressing these challenges be valuable to ${lowerStakeholder}?`,
        `What features would be most important to ${lowerStakeholder} in an ideal solution?`,
        `How would ${lowerStakeholder} evaluate the success of a new solution?`,
        `What concerns would ${lowerStakeholder} have about adopting a new approach?`,
        `How do ${lowerStakeholder} typically assess new solutions or vendors?`
      ];
    }

    // Common follow-up questions that work across industries
    followUpQuestions = [
      `Who else would ${lowerStakeholder} involve in the decision-making process?`,
      `What budget considerations would ${lowerStakeholder} have for this type of solution?`,
      `How would ${lowerStakeholder} measure ROI or success metrics?`,
      `What timeline would ${lowerStakeholder} expect for implementation and results?`,
      `What ongoing support or training would ${lowerStakeholder} need?`
    ];

    return {
      discovery: discoveryQuestions,
      validation: validationQuestions,
      followUp: followUpQuestions
    };
  };

  const generateQuestionsForStakeholder = (stakeholderName: string, description: string, type: 'primary' | 'secondary') => {
    const industryQuestions = getIndustrySpecificQuestions(stakeholderName, businessContext, industry);

    return {
      name: stakeholderName,
      description: description || `Key stakeholder in ${businessContext}`,
      type,
      questions: industryQuestions
    };
  };

  return stakeholders.map(stakeholder => {
    const name = getStakeholderName(stakeholder);
    const description = getStakeholderDescription(stakeholder);
    const type = stakeholder.type || 'primary';
    return generateQuestionsForStakeholder(name, description, type);
  });
};
