/**
 * Type definitions for the Customer Research Chat Interface
 * Extracted from ChatInterface.tsx for better modularity
 */

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  metadata?: {
    questionCategory?: 'discovery' | 'validation' | 'follow_up';
    researchStage?: 'initial' | 'validation' | 'analysis';
    type?: 'regular' | 'component';
    thinking_steps?: ThinkingStep[];
    isLive?: boolean;
    request_id?: string;
    comprehensiveQuestions?: ComprehensiveQuestions;
    businessContext?: string;
    stakeholders?: StakeholderData;
    questions?: any;
    [key: string]: any;
  };
}

export interface ChatInterfaceProps {
  onComplete?: (questions: any) => void;
  onBack?: () => void;
  loadSessionId?: string;
}

export interface ThinkingStep {
  step: string;
  status: 'in_progress' | 'completed' | 'failed';
  details: string;
  duration_ms: number;
  timestamp: number;
}

export interface ComprehensiveQuestions {
  primaryStakeholders: StakeholderQuestions[];
  secondaryStakeholders: StakeholderQuestions[];
  timeEstimate: {
    totalQuestions: number;
    estimatedMinutes: string;
    breakdown: {
      baseTime?: number;
      withBuffer?: number;
      perQuestion: number;
      primary?: number;
      secondary?: number;
    };
  };
}

export interface StakeholderQuestions {
  name: string;
  description: string;
  questions: {
    problemDiscovery: string[];
    solutionValidation: string[];
    followUp: string[];
  };
}

export interface StakeholderData {
  primary: string[] | StakeholderInfo[];
  secondary: string[] | StakeholderInfo[];
  industry?: string;
  reasoning?: string;
}

export interface StakeholderInfo {
  name: string;
  description: string;
  type?: 'primary' | 'secondary';
  priority?: number;
}

export interface FormattedStakeholder {
  name: string;
  type: 'primary' | 'secondary';
  description: string;
  priority: number;
  questions?: {
    discovery: string[];
    validation: string[];
    followUp: string[];
  };
}

export interface GeneratedQuestions {
  problemDiscovery: string[];
  solutionValidation: string[];
  followUp: string[];
}

export interface ChatState {
  messages: Message[];
  input: string;
  isLoading: boolean;
  conversationStarted: boolean;
  currentSuggestions: string[];
  sessionId: string | null;
  showStakeholderAlert: boolean;
  showMultiStakeholderPlan: boolean;
  showClearConfirm: boolean;
  localQuestions: any;
}

export interface ChatActions {
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setConversationStarted: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentSuggestions: React.Dispatch<React.SetStateAction<string[]>>;
  setSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setShowStakeholderAlert: React.Dispatch<React.SetStateAction<boolean>>;
  setShowMultiStakeholderPlan: React.Dispatch<React.SetStateAction<boolean>>;
  setShowClearConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  setLocalQuestions: React.Dispatch<React.SetStateAction<any>>;
}

export interface ScrollOptions {
  behavior?: 'smooth' | 'auto';
  block?: 'start' | 'center' | 'end' | 'nearest';
}

export interface PollingConfig {
  interval: number;
  maxRetries?: number;
  timeout?: number;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export interface ApiResponse {
  content: string;
  questions?: any;
  metadata?: {
    questionCategory?: string;
    researchStage?: string;
    suggestions?: string[];
    contextual_suggestions?: string[];
    extracted_context?: any;
    request_id?: string;
    thinking_steps?: ThinkingStep[];
    [key: string]: any;
  };
  thinking_process?: ThinkingStep[];
  session_id?: string;
  request_id?: string;
}
