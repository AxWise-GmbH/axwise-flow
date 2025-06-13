/**
 * Customer Research Configuration
 * Centralized configuration for frontend research feature to eliminate hardcoded values.
 */

export interface ResearchConfig {
  // API Configuration
  requestTimeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;

  // Session Configuration
  maxSessionsToShow: number;
  sessionTimeoutMinutes: number;

  // Message Configuration
  maxMessageLength: number;
  minMessageLength: number;
  maxMessagesPerSession: number;

  // UI Configuration
  suggestionHideDelayMs: number;
  maxSuggestionsToShow: number;
  autoSaveDelayMs: number;

  // Storage Configuration
  storageKeys: {
    sessions: string;
    currentSession: string;
    userId: string;
  };

  // Error Configuration
  errorMessages: {
    networkError: string;
    validationError: string;
    sessionExpired: string;
    serviceUnavailable: string;
    rateLimited: string;
  };

  // Fallback responses
  fallbackResponses: {
    general: string;
    businessIdea: string;
    targetCustomer: string;
    problem: string;
  };
}

export interface AutoSuggestionConfig {
  // Suggestion categories
  businessTypes: string[];
  industries: string[];
  customerTypes: string[];
  problems: string[];

  // Stage-specific suggestions
  stageTemplates: {
    initial: Array<{
      id: string;
      text: string;
      category: 'business_type' | 'target_customer' | 'problem' | 'solution' | 'stage';
    }>;
    business_idea: Array<{
      id: string;
      text: string;
      category: 'business_type' | 'target_customer' | 'problem' | 'solution' | 'stage';
    }>;
    target_customer: Array<{
      id: string;
      text: string;
      category: 'business_type' | 'target_customer' | 'problem' | 'solution' | 'stage';
    }>;
    problem_validation: Array<{
      id: string;
      text: string;
      category: 'business_type' | 'target_customer' | 'problem' | 'solution' | 'stage';
    }>;
    solution_validation: Array<{
      id: string;
      text: string;
      category: 'business_type' | 'target_customer' | 'problem' | 'solution' | 'stage';
    }>;
  };

  // Multi-stakeholder templates for different business types
  multiStakeholderTemplates: {
    [key: string]: {
      primary: string;
      secondary: string;
      examples: string[];
      guidance: string;
    };
  };
}

// Environment-based configuration
const isProduction = process.env.NODE_ENV === 'production';

export const RESEARCH_CONFIG: ResearchConfig = {
  // API Configuration
  requestTimeoutMs: parseInt(process.env.NEXT_PUBLIC_RESEARCH_TIMEOUT_MS || (isProduction ? '60000' : '120000')),
  maxRetries: parseInt(process.env.NEXT_PUBLIC_RESEARCH_MAX_RETRIES || '3'),
  retryDelayMs: parseInt(process.env.NEXT_PUBLIC_RESEARCH_RETRY_DELAY_MS || '1000'),

  // Session Configuration
  maxSessionsToShow: parseInt(process.env.NEXT_PUBLIC_RESEARCH_MAX_SESSIONS || '10'),
  sessionTimeoutMinutes: parseInt(process.env.NEXT_PUBLIC_RESEARCH_SESSION_TIMEOUT || '60'),

  // Message Configuration
  maxMessageLength: parseInt(process.env.NEXT_PUBLIC_RESEARCH_MAX_MESSAGE_LENGTH || '2000'),
  minMessageLength: parseInt(process.env.NEXT_PUBLIC_RESEARCH_MIN_MESSAGE_LENGTH || '1'),
  maxMessagesPerSession: parseInt(process.env.NEXT_PUBLIC_RESEARCH_MAX_MESSAGES_PER_SESSION || '200'),

  // UI Configuration
  suggestionHideDelayMs: parseInt(process.env.NEXT_PUBLIC_RESEARCH_SUGGESTION_HIDE_DELAY || '1000'),
  maxSuggestionsToShow: parseInt(process.env.NEXT_PUBLIC_RESEARCH_MAX_SUGGESTIONS || '6'),
  autoSaveDelayMs: parseInt(process.env.NEXT_PUBLIC_RESEARCH_AUTOSAVE_DELAY || '2000'),

  // Storage Configuration
  storageKeys: {
    sessions: process.env.NEXT_PUBLIC_RESEARCH_SESSIONS_KEY || 'axwise_research_sessions',
    currentSession: process.env.NEXT_PUBLIC_RESEARCH_CURRENT_SESSION_KEY || 'axwise_current_session',
    userId: process.env.NEXT_PUBLIC_RESEARCH_USER_ID_KEY || 'axwise_anonymous_user_id',
  },

  // Error Configuration
  errorMessages: {
    networkError: 'Unable to connect to the research assistant. Please check your internet connection and try again.',
    validationError: 'Please check your input and try again.',
    sessionExpired: 'Your session has expired. Please start a new conversation.',
    serviceUnavailable: 'The research assistant is temporarily unavailable. Please try again later.',
    rateLimited: 'You\'re sending messages too quickly. Please wait a moment before trying again.',
  },

  // Fallback responses
  fallbackResponses: {
    general: 'I\'m having trouble understanding. Could you tell me more about your business idea?',
    businessIdea: 'Let\'s start with the basics - what\'s your business idea?',
    targetCustomer: 'Who do you think would be most interested in your solution?',
    problem: 'What problem are you trying to solve for your customers?',
  },
};

export const AUTO_SUGGESTION_CONFIG: AutoSuggestionConfig = {
  // Dynamic suggestion pools
  businessTypes: [
    'mobile app', 'web application', 'SaaS platform', 'e-commerce store',
    'consulting service', 'online course', 'subscription service', 'marketplace'
  ],
  industries: [
    'healthcare', 'education', 'finance', 'retail', 'manufacturing',
    'real estate', 'food & beverage', 'fitness', 'travel', 'entertainment'
  ],
  customerTypes: [
    'small business owners', 'enterprise companies', 'freelancers', 'students',
    'parents', 'seniors', 'professionals', 'entrepreneurs', 'developers'
  ],
  problems: [
    'save time', 'reduce costs', 'improve communication', 'increase productivity',
    'better organization', 'automate processes', 'improve customer service'
  ],

  // Stage-specific suggestion templates
  stageTemplates: {
    initial: [
      { id: '1', text: 'I have a business idea', category: 'business_type' },
      { id: '2', text: 'I want to decide about one feature', category: 'business_type' },
      { id: '3', text: 'I have a mobile app idea', category: 'business_type' },
      { id: '4', text: 'I have a SaaS product idea', category: 'business_type' },
      { id: '5', text: 'I want to start a service business', category: 'business_type' },
      { id: '6', text: 'I have a physical product idea', category: 'business_type' },
      { id: '7', text: 'I need help with customer research', category: 'business_type' },
      { id: '8', text: 'I want to validate my idea', category: 'business_type' },
    ],
    business_idea: [
      { id: '5', text: 'Small business owners', category: 'target_customer' },
      { id: '6', text: 'Busy professionals', category: 'target_customer' },
      { id: '7', text: 'Students and educators', category: 'target_customer' },
      { id: '8', text: 'Parents with young children', category: 'target_customer' },
      { id: '9', text: 'Healthcare professionals', category: 'target_customer' },
    ],
    target_customer: [
      { id: '10', text: 'They waste too much time on manual tasks', category: 'problem' },
      { id: '11', text: 'Current solutions are too expensive', category: 'problem' },
      { id: '12', text: 'They struggle with organization', category: 'problem' },
      { id: '13', text: 'Communication between teams is difficult', category: 'problem' },
    ],
    problem_validation: [
      { id: '14', text: 'Yes, I\'ve talked to a few people', category: 'stage' },
      { id: '15', text: 'No, I haven\'t done any research yet', category: 'stage' },
      { id: '16', text: 'I\'ve done some online research', category: 'stage' },
    ],
    solution_validation: [
      { id: '17', text: 'I have a working prototype', category: 'stage' },
      { id: '18', text: 'I have detailed mockups', category: 'stage' },
      { id: '19', text: 'It\'s still just an idea', category: 'stage' },
    ],
  },

  // Multi-stakeholder templates for different business types
  multiStakeholderTemplates: {
    b2b2c: {
      primary: 'business partners',
      secondary: 'end users',
      examples: ['platform providers', 'marketplace vendors', 'service providers'],
      guidance: 'Start with business partners to validate core assumptions, then expand to end users'
    },
    platform: {
      primary: 'platform users',
      secondary: 'content creators',
      examples: ['marketplace buyers', 'marketplace sellers', 'platform administrators'],
      guidance: 'Focus on primary user workflows first, then validate creator/seller needs'
    },
    enterprise: {
      primary: 'decision makers',
      secondary: 'end users',
      examples: ['managers', 'administrators', 'individual contributors'],
      guidance: 'Validate with decision makers first, then confirm with actual users'
    },
    service: {
      primary: 'service providers',
      secondary: 'service recipients',
      examples: ['professionals', 'consultants', 'clients'],
      guidance: 'Understand provider workflows first, then validate client experience'
    },
    general: {
      primary: 'primary stakeholders',
      secondary: 'secondary stakeholders',
      examples: ['key users', 'decision makers', 'influencers'],
      guidance: 'Start with primary stakeholders to validate core assumptions'
    }
  },
};

// Validation functions
export function validateMessage(message: string): { isValid: boolean; error?: string } {
  if (!message || message.trim().length < RESEARCH_CONFIG.minMessageLength) {
    return { isValid: false, error: `Message must be at least ${RESEARCH_CONFIG.minMessageLength} character(s)` };
  }

  if (message.length > RESEARCH_CONFIG.maxMessageLength) {
    return { isValid: false, error: `Message must be less than ${RESEARCH_CONFIG.maxMessageLength} characters` };
  }

  return { isValid: true };
}

export function sanitizeInput(input: string): string {
  if (!input) return '';

  // Remove HTML tags and normalize whitespace
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Helper functions
export function getErrorMessage(errorType: keyof typeof RESEARCH_CONFIG.errorMessages): string {
  return RESEARCH_CONFIG.errorMessages[errorType];
}

export function getFallbackResponse(stage: keyof typeof RESEARCH_CONFIG.fallbackResponses): string {
  return RESEARCH_CONFIG.fallbackResponses[stage];
}
