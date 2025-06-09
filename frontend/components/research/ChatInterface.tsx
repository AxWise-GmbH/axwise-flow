'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Bot, User, Download, Copy, ArrowLeft, RotateCcw } from 'lucide-react';
import { ContextPanel } from './ContextPanel';
import { StakeholderAlert } from './StakeholderAlert';
import { MultiStakeholderChatMessage } from './MultiStakeholderChatMessage';
import { NextStepsChatMessage } from './NextStepsChatMessage';

import { FormattedQuestionsComponent } from './FormattedQuestionsComponent';
import { EnhancedMultiStakeholderComponent } from './EnhancedMultiStakeholderComponent';
import { StakeholderQuestionsComponent } from './StakeholderQuestionsComponent';
import { ThinkingProcess } from './ThinkingProcess';
import { useResearch } from '@/hooks/use-research';
import { sendResearchChatMessage, getResearchSession, type Message as ApiMessage } from '@/lib/api/research';
import { validateMessage } from '@/lib/config/research-config';
import { formatErrorForUser, logError } from '@/lib/utils/research-error-handler';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  metadata?: {
    questionCategory?: 'discovery' | 'validation' | 'follow_up';
    researchStage?: 'initial' | 'validation' | 'analysis';
    type?: 'regular' | 'component';
    [key: string]: any;
  };
}

interface ChatInterfaceProps {
  onComplete?: (questions: any) => void;
  onBack?: () => void;
  loadSessionId?: string;
}

export function ChatInterface({ onComplete, onBack, loadSessionId }: ChatInterfaceProps) {
  const {
    context,
    questions,
    updateContext,
    updateQuestions,
    generateQuestions,
    exportQuestions,
    continueToAnalysis,
    getCurrentStage,
    isLoading: researchLoading,
  } = useResearch();

  // Local state for questions to handle API responses directly
  const [localQuestions, setLocalQuestions] = useState<any>(null);
  const currentQuestions = localQuestions || questions;

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: "Hi! I'm your customer research assistant. I'll help you create targeted research questions for your business idea. Let's start - what's your business idea?",
      role: 'assistant',
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationStarted, setConversationStarted] = useState(false);
  const [currentSuggestions, setCurrentSuggestions] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showStakeholderAlert, setShowStakeholderAlert] = useState(false);
  const [showMultiStakeholderPlan, setShowMultiStakeholderPlan] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [progressPollingInterval, setProgressPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [thinkingProcessVisible, setThinkingProcessVisible] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
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
        messagesEndRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'end'
        });
      }
    }, 10);
  };

  // Simplified stakeholder detection - primarily rely on LLM backend analysis
  const detectMultipleStakeholders = (context: any, conversationMessages?: Message[]) => {
    // This is now a fallback function - the primary stakeholder detection happens in the backend via LLM
    // We only use this when the backend LLM analysis is not available

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

  // Note: extractStakeholdersFromText function removed - now using LLM-based analysis from backend

  // Note: detectIndustryFromText and getIndustryStakeholders functions removed - now using LLM-based analysis from backend

  // Generate stakeholder-specific research questions with industry-specific templates
  const generateStakeholderQuestions = (stakeholders: any[], businessContext: string, industry: string) => {
    const getStakeholderName = (stakeholder: any) => {
      return typeof stakeholder === 'string' ? stakeholder : stakeholder.name;
    };

    const getStakeholderDescription = (stakeholder: any) => {
      return typeof stakeholder === 'string' ? '' : stakeholder.description;
    };

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
      } else if (isManufacturing) {
        discoveryQuestions = [
          `How do ${lowerStakeholder} currently manage ${lowerBusiness} in their production process?`,
          `What are the biggest operational inefficiencies ${lowerStakeholder} face?`,
          `How do ${lowerStakeholder} ensure quality control and regulatory compliance?`,
          `What are the cost implications of ${lowerStakeholder}'s current approach?`,
          `How do ${lowerStakeholder} handle supply chain and inventory management?`
        ];
        validationQuestions = [
          `Would a solution that reduces production costs be valuable to ${lowerStakeholder}?`,
          `How important is environmental sustainability to ${lowerStakeholder}'s operations?`,
          `What ROI metrics would ${lowerStakeholder} use to evaluate a new solution?`,
          `How do ${lowerStakeholder} typically assess operational risk and reliability?`,
          `What concerns would ${lowerStakeholder} have about production disruption during implementation?`
        ];
      } else if (isFintech) {
        discoveryQuestions = [
          `How do ${lowerStakeholder} currently handle ${lowerBusiness} and financial transactions?`,
          `What regulatory compliance requirements do ${lowerStakeholder} need to meet?`,
          `How do ${lowerStakeholder} manage financial risk and fraud prevention?`,
          `What are the biggest security concerns ${lowerStakeholder} face?`,
          `How do ${lowerStakeholder} ensure customer trust and transparency?`
        ];
        validationQuestions = [
          `Would a solution that improves financial security be valuable to ${lowerStakeholder}?`,
          `How important is regulatory compliance (PCI DSS, SOX) to ${lowerStakeholder}?`,
          `What financial metrics would ${lowerStakeholder} use to measure success?`,
          `How do ${lowerStakeholder} typically evaluate financial technology vendors?`,
          `What concerns would ${lowerStakeholder} have about customer data protection?`
        ];
      } else if (isEcommerce) {
        discoveryQuestions = [
          `How do ${lowerStakeholder} currently manage ${lowerBusiness} and customer experience?`,
          `What are the biggest challenges ${lowerStakeholder} face with customer acquisition and retention?`,
          `How do ${lowerStakeholder} handle inventory management and fulfillment?`,
          `What are ${lowerStakeholder}'s biggest pain points with current e-commerce platforms?`,
          `How do ${lowerStakeholder} measure and optimize conversion rates?`
        ];
        validationQuestions = [
          `Would a solution that increases sales conversion be valuable to ${lowerStakeholder}?`,
          `How important is customer experience and user interface to ${lowerStakeholder}?`,
          `What metrics would ${lowerStakeholder} use to measure e-commerce success?`,
          `How do ${lowerStakeholder} typically evaluate new marketing and sales tools?`,
          `What concerns would ${lowerStakeholder} have about customer data and privacy?`
        ];
      } else if (isEducation) {
        discoveryQuestions = [
          `How do ${lowerStakeholder} currently deliver ${lowerBusiness} and educational content?`,
          `What are the biggest challenges ${lowerStakeholder} face with student engagement?`,
          `How do ${lowerStakeholder} measure learning outcomes and effectiveness?`,
          `What technology constraints do ${lowerStakeholder} work within?`,
          `How do ${lowerStakeholder} handle different learning styles and accessibility needs?`
        ];
        validationQuestions = [
          `Would a solution that improves learning outcomes be valuable to ${lowerStakeholder}?`,
          `How important is accessibility and inclusivity to ${lowerStakeholder}?`,
          `What educational metrics would ${lowerStakeholder} use to measure success?`,
          `How do ${lowerStakeholder} typically evaluate new educational technology?`,
          `What concerns would ${lowerStakeholder} have about student data privacy?`
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

  // Always scroll to bottom when messages change
  const scrollToBottomIfNeeded = () => {
    setTimeout(() => scrollToBottom(), 50);
  };



  // Auto-scroll when messages change
  useEffect(() => {
    scrollToBottomIfNeeded();
  }, [messages]);

  // Progressive thinking process polling
  const startProgressPolling = (requestId: string, thinkingMessageId: string) => {
    // Clear any existing polling
    if (progressPollingInterval) {
      clearInterval(progressPollingInterval);
    }

    const pollProgress = async () => {
      try {
        const response = await fetch(`/api/research/v3-simple/thinking-progress/${requestId}`);
        if (response.ok) {
          const progressData = await response.json();

          // Update the thinking process message with current steps
          setMessages(prev => prev.map(msg => {
            if (msg.id === thinkingMessageId && msg.metadata?.isLive) {
              const currentSteps = progressData.thinking_steps || [];

              return {
                ...msg,
                metadata: {
                  ...msg.metadata,
                  thinking_steps: currentSteps,
                  isLive: progressData.is_active
                }
              };
            }
            return msg;
          }));

          // Stop polling if analysis is complete
          if (!progressData.is_active) {
            if (progressPollingInterval) {
              clearInterval(progressPollingInterval);
              setProgressPollingInterval(null);
            }
            setActiveRequestId(null);
          }
        }
      } catch (error) {
        console.error('Error polling thinking progress:', error);
      }
    };

    // Start polling every 500ms for smooth updates
    const interval = setInterval(pollProgress, 500);
    setProgressPollingInterval(interval);
    setActiveRequestId(requestId);

    // Initial poll
    pollProgress();
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (progressPollingInterval) {
        clearInterval(progressPollingInterval);
      }
    };
  }, [progressPollingInterval]);

  // Load session when loadSessionId changes
  useEffect(() => {
    if (loadSessionId) {
      loadSession(loadSessionId);
    }
  }, [loadSessionId]);

  const loadSession = async (sessionId: string) => {
    try {
      console.log('Loading session:', sessionId);
      const sessionData = await getResearchSession(sessionId);
      console.log('Session data loaded:', sessionData);

      // Update context from session
      updateContext({
        businessIdea: sessionData.business_idea,
        targetCustomer: sessionData.target_customer,
        problem: sessionData.problem,
        questionsGenerated: sessionData.questions_generated,
        multiStakeholderConsidered: sessionData.questions_generated // If questions exist, assume multi-stakeholder was considered
      });

      // Load messages into chat - Note: messages might not be available in the API response
      // For now, we'll start with a fresh conversation when loading a session
      setMessages([
        {
          id: '1',
          content: "Hi! I'm your customer research assistant. I can see you have a previous session. Let's continue from where you left off.",
          role: 'assistant',
          timestamp: new Date(),
        }
      ]);

      // Set session ID
      setSessionId(sessionId);

      console.log('Session loaded successfully');
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  };

  const handleSend = async (messageText?: string) => {
    const textToSend = messageText || input;
    if (!textToSend.trim() || isLoading) return;

    // Validate input
    const validation = validateMessage(textToSend);
    if (!validation.isValid) {
      const errorMessage: Message = {
        id: Date.now().toString(),
        content: validation.error || 'Please check your input and try again.',
        role: 'assistant',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      content: textToSend,
      role: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setConversationStarted(true);

    // Add empty thinking process component - backend will populate with real steps
    const thinkingMessageId = (Date.now() + 1).toString() + '_thinking';

    // Context updates now handled by backend LLM analysis

    try {
      // Convert messages to API format
      const apiMessages: ApiMessage[] = [...messages, userMessage].map(msg => ({
        id: msg.id,
        content: msg.content,
        role: msg.role,
        timestamp: msg.timestamp.toISOString(),
        metadata: msg.metadata
      }));

      // Call the research API using the new client with V3 Simple features enabled
      const data = await sendResearchChatMessage({
        messages: apiMessages,
        input: textToSend,
        context: context,
        session_id: sessionId || undefined,
        user_id: undefined, // Will be populated when auth is added
        // Enable V3 Simple features
        enable_enhanced_analysis: true,
        enable_thinking_process: true,
      });

      // Start progressive polling if we have a request ID
      const requestId = (data as any).metadata?.request_id || (data as any).request_id;

      // Create thinking process component with request ID
      const thinkingMessage: Message = {
        id: thinkingMessageId,
        content: 'THINKING_PROCESS_COMPONENT',
        role: 'assistant',
        timestamp: new Date(),
        metadata: {
          type: 'component',
          thinking_steps: [{
            step: 'Analysis Starting',
            status: 'in_progress' as 'in_progress' | 'completed' | 'failed',
            details: 'Initializing comprehensive analysis pipeline...',
            duration_ms: 0,
            timestamp: Date.now()
          }], // Start with minimal loading indicator
          isLive: true, // Flag to indicate this is a live thinking process
          request_id: requestId
        }
      };

      // Set thinking process as visible for this request
      if (requestId) {
        setThinkingProcessVisible(prev => ({
          ...prev,
          [requestId]: true
        }));
      }

      setMessages(prev => [...prev, thinkingMessage]);

      if (requestId) {
        startProgressPolling(requestId, thinkingMessageId);
      }

      // Debug: Log what the backend is returning
      console.log('Backend response:', {
        hasQuestions: !!data.questions,
        questionsData: data.questions,
        extractedContext: data.metadata?.extracted_context,
        messageCount: apiMessages.length,
        thinkingProcess: data.thinking_process
      });

      // Replace the loading step with real backend analysis steps only
      setMessages(prev => prev.map(msg => {
        if (msg.content === 'THINKING_PROCESS_COMPONENT' && msg.metadata?.isLive) {
          // Completely replace with real backend thinking process steps
          const realSteps = data.thinking_process || [];

          // If no real steps from backend, remove the thinking component entirely
          if (realSteps.length === 0) {
            return {
              ...msg,
              metadata: {
                ...msg.metadata,
                thinking_steps: [],
                isLive: false
              }
            };
          }

          return {
            ...msg,
            metadata: {
              ...msg.metadata,
              thinking_steps: realSteps, // Only real backend steps
              isLive: false // Mark as completed
            }
          };
        }
        return msg;
      }));

      const assistantMessage: Message = {
        id: (Date.now() + 2).toString(),
        content: data.content,
        role: 'assistant',
        timestamp: new Date(),
        metadata: {
          questionCategory: (data.metadata?.questionCategory === 'discovery' ||
                           data.metadata?.questionCategory === 'validation' ||
                           data.metadata?.questionCategory === 'follow_up')
                           ? data.metadata.questionCategory as 'discovery' | 'validation' | 'follow_up' : undefined,
          researchStage: (data.metadata?.researchStage === 'initial' ||
                         data.metadata?.researchStage === 'validation' ||
                         data.metadata?.researchStage === 'analysis')
                         ? data.metadata.researchStage as 'initial' | 'validation' | 'analysis' : undefined,
          // Include all other metadata from the API response
          ...data.metadata
        },
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Hide thinking process for the current request when final response arrives
      if (requestId) {
        setThinkingProcessVisible(prev => ({
          ...prev,
          [requestId]: false
        }));
      }

      // Update session ID from response
      if (data.session_id && !sessionId) {
        setSessionId(data.session_id);
      }

      // Update suggestions from API response with better extraction and fallbacks
      let suggestions: string[] = [];

      // Try to extract suggestions from the API response metadata
      if (data.metadata?.suggestions && Array.isArray(data.metadata.suggestions)) {
        suggestions = data.metadata.suggestions;
      } else if (data.metadata && 'contextual_suggestions' in data.metadata && Array.isArray((data.metadata as any).contextual_suggestions)) {
        suggestions = (data.metadata as any).contextual_suggestions;
      }

      // If no suggestions from API, generate contextual fallback suggestions
      // Note: Generate suggestions even when questions are present, unless it's the final question set
      if (suggestions.length === 0) {
        const businessContext = data.metadata?.extracted_context?.business_idea || context.businessIdea || '';
        const customerContext = data.metadata?.extracted_context?.target_customer || context.targetCustomer || '';

        // Only skip suggestions if we have a complete question set (all three categories)
        const hasCompleteQuestions = data.questions &&
          data.questions.problemDiscovery && data.questions.problemDiscovery.length > 0 &&
          data.questions.solutionValidation && data.questions.solutionValidation.length > 0 &&
          data.questions.followUp && data.questions.followUp.length > 0;

        if (!hasCompleteQuestions) {
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
      }

      setCurrentSuggestions(suggestions);
      console.log('🔧 SUGGESTIONS DEBUG:', {
        finalSuggestions: suggestions,
        suggestionsLength: suggestions.length,
        hasQuestions: !!data.questions,
        hasCompleteQuestions: data.questions &&
          data.questions.problemDiscovery && data.questions.problemDiscovery.length > 0 &&
          data.questions.solutionValidation && data.questions.solutionValidation.length > 0 &&
          data.questions.followUp && data.questions.followUp.length > 0,
        metadataSuggestions: data.metadata?.suggestions,
        contextualSuggestions: (data.metadata as any)?.contextual_suggestions,
        businessContext: data.metadata?.extracted_context?.business_idea || context.businessIdea,
        customerContext: data.metadata?.extracted_context?.target_customer || context.targetCustomer,
        apiSuggestions: (data as any).suggestions,
        fullMetadata: data.metadata
      });

      // Update context from LLM-extracted information in API response
      if (data.metadata?.extracted_context) {
        const extractedContext = data.metadata.extracted_context;

        const newContext = {
          businessIdea: extractedContext.business_idea || context.businessIdea,
          targetCustomer: extractedContext.target_customer || context.targetCustomer,
          problem: extractedContext.problem || context.problem,
          questionsGenerated: extractedContext.questions_generated || context.questionsGenerated
        };
        updateContext(newContext);

        // Context tracking now handled by backend LLM analysis

        // Multi-stakeholder detection will happen at the end when questions are generated
      }

      // If questions were generated, use the API response directly and display rich components
      if (data.questions) {
        // Set questions from API response directly (don't call generateQuestions again)
        const apiQuestions = {
          problemDiscovery: data.questions.problemDiscovery || [],
          solutionValidation: data.questions.solutionValidation || [],
          followUp: data.questions.followUp || []
        };

        // Update the questions state directly
        setLocalQuestions(apiQuestions);
        updateQuestions(apiQuestions); // Also update the useResearch hook
        updateContext({ questionsGenerated: true });

        // Use LLM-detected stakeholders from API response if available, otherwise fallback to local detection
        let stakeholderData = null;
        if (data.metadata?.extracted_context?.detected_stakeholders) {
          stakeholderData = data.metadata.extracted_context.detected_stakeholders;
          console.log('LLM-detected stakeholders from API:', stakeholderData);
        } else {
          console.log('No LLM stakeholders in API response, using fallback detection');
          // Fallback to local detection
          const stakeholderDetection = detectMultipleStakeholders(context, [...messages, userMessage, assistantMessage]);
          if (stakeholderDetection.detected && stakeholderDetection.stakeholders) {
            stakeholderData = stakeholderDetection.stakeholders;
          }
        }

        if (stakeholderData) {
          // Update context with stakeholder information for the right panel
          updateContext({
            multiStakeholderConsidered: true,
            multiStakeholderDetected: true,
            detectedStakeholders: stakeholderData
          });
        }

        // Add formatted questions component
        const questionsMessage: Message = {
          id: Date.now().toString() + '_questions',
          content: 'FORMATTED_QUESTIONS_COMPONENT',
          role: 'assistant',
          timestamp: new Date(),
          metadata: { type: 'component', questions: apiQuestions }
        };

        setMessages(prev => [...prev, questionsMessage]);

        // Add enhanced multi-stakeholder component if detected (only in chat, not in right panel)
        if (stakeholderData) {
          const enhancedMultiStakeholderMessage: Message = {
            id: Date.now().toString() + '_enhanced_multistakeholder',
            content: 'ENHANCED_MULTISTAKEHOLDER_COMPONENT',
            role: 'assistant',
            timestamp: new Date(),
            metadata: { type: 'component', stakeholders: stakeholderData }
          };

          setMessages(prev => [...prev, enhancedMultiStakeholderMessage]);
        }

        // Always add next steps
        const nextStepsMessage: Message = {
          id: Date.now().toString() + '_nextsteps',
          content: 'NEXT_STEPS_COMPONENT',
          role: 'assistant',
          timestamp: new Date()
        };

        setMessages(prev => [...prev, nextStepsMessage]);

        if (onComplete) {
          onComplete(apiQuestions);
        }
      }
    } catch (error) {
      logError(error, 'ChatInterface.handleSend');

      // Use error handler for consistent error messages
      const errorContent = formatErrorForUser(error);

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: errorContent,
        role: 'assistant',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Note: updateContextFromMessage function removed - now using LLM-based context extraction from backend

  const handleSuggestionClick = (suggestion: string) => {
    console.log('🔧 Suggestion clicked:', suggestion);
    handleSend(suggestion);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      // You could add a toast notification here if you have a toast system
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

  const handleClearClick = () => {
    // If there are only 1-2 messages (initial + maybe one user message), clear immediately
    if (messages.length <= 2) {
      clearChat();
    } else {
      // Show confirmation for longer conversations
      setShowClearConfirm(true);
    }
  };

  const clearChat = () => {
    // Reset all state to initial values
    setMessages([
      {
        id: '1',
        content: "Hi! I'm your customer research assistant. I'll help you create targeted research questions for your business idea. Let's start - what's your business idea?",
        role: 'assistant',
        timestamp: new Date(),
      }
    ]);
    setInput('');
    setIsLoading(false);
    setConversationStarted(false);
    setCurrentSuggestions([]); // Clear suggestions on reset
    setSessionId(null);
    setShowClearConfirm(false);

    // Reset context using the hook
    updateContext({
      businessIdea: '',
      targetCustomer: '',
      problem: '',
      questionsGenerated: false,
      multiStakeholderConsidered: false
    });
  };

  // Note: getConversationContext function removed - conversation context now handled by backend

  return (
    <div className="w-full h-screen flex flex-col">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 flex-1 p-4 min-h-0">
        {/* Chat Interface */}
        <Card className="lg:col-span-2 flex flex-col h-full min-h-0">
          {/* Header */}
          <div className="flex items-center justify-between p-3 lg:p-4 border-b flex-shrink-0">
            <div className="flex items-center gap-2">
              {onBack && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBack}
                  className="mr-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <Bot className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-sm lg:text-base">Customer Research Assistant</h3>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearClick}
                title="Clear chat and start over"
              >
                <RotateCcw className="h-4 w-4 mr-1 lg:mr-2" />
                <span className="hidden sm:inline">Clear</span>
              </Button>
              {currentQuestions && (
                <Button variant="outline" size="sm" onClick={() => exportQuestions('txt')}>
                  <Download className="h-4 w-4 mr-1 lg:mr-2" />
                  <span className="hidden sm:inline">Export</span>
                </Button>
              )}
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-3 lg:p-4">
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div key={message.id}>
                  <div
                    className={`flex gap-2 lg:gap-3 ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {message.role === 'assistant' && (
                      <div className="flex-shrink-0">
                        <div className="w-6 h-6 lg:w-8 lg:h-8 bg-primary/10 rounded-full flex items-center justify-center">
                          <Bot className="h-3 w-3 lg:h-4 lg:w-4 text-primary" />
                        </div>
                      </div>
                    )}

                    <div
                      className={`max-w-[85%] lg:max-w-[80%] ${
                        message.content === 'MULTI_STAKEHOLDER_COMPONENT' ||
                        message.content === 'NEXT_STEPS_COMPONENT' ||
                        message.content === 'STAKEHOLDER_ALERT_COMPONENT' ||
                        message.content === 'FORMATTED_QUESTIONS_COMPONENT' ||
                        message.content === 'ENHANCED_MULTISTAKEHOLDER_COMPONENT' ||
                        message.content === 'STAKEHOLDER_QUESTIONS_COMPONENT' ||
                        message.content === 'THINKING_PROCESS_COMPONENT'
                          ? ''
                          : `rounded-lg p-2 lg:p-3 text-sm lg:text-base ${
                              message.role === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary text-secondary-foreground border border-border'
                            }`
                      }`}
                    >
                  {message.content === 'STAKEHOLDER_ALERT_COMPONENT' ? (
                    <StakeholderAlert
                      onContinueWithCurrent={() => {
                        const confirmMessage: Message = {
                          id: Date.now().toString() + '_confirm_single',
                          content: "Perfect! I'll continue with single-stakeholder research questions focused on your primary audience.",
                          role: 'assistant',
                          timestamp: new Date()
                        };
                        setMessages(prev => [...prev, confirmMessage]);
                      }}
                      onViewMultiStakeholder={() => {
                        const multiStakeholderMessage: Message = {
                          id: Date.now().toString() + '_multistakeholder_early',
                          content: 'MULTI_STAKEHOLDER_COMPONENT',
                          role: 'assistant',
                          timestamp: new Date()
                        };
                        setMessages(prev => [...prev, multiStakeholderMessage]);
                      }}
                    />
                  ) : message.content === 'MULTI_STAKEHOLDER_COMPONENT' ? (
                    <MultiStakeholderChatMessage
                      onContinueWithCurrent={() => {
                        // Add a message confirming the choice
                        const confirmMessage: Message = {
                          id: Date.now().toString() + '_confirm',
                          content: "Great! You'll continue with the current research questions. They're well-suited for your primary stakeholders and will provide valuable insights.",
                          role: 'assistant',
                          timestamp: new Date()
                        };
                        setMessages(prev => [...prev, confirmMessage]);
                      }}
                      onViewDetailedPlan={() => {
                        // Add detailed multi-stakeholder plan to chat
                        const detailedPlanMessage: Message = {
                          id: Date.now().toString() + '_detailed_plan',
                          content: `## 📋 Complete Multi-Stakeholder Research Questionnaire

### ⚠️ **Important: Primary Objective First**
**Start with your primary stakeholder research to validate core assumptions, then expand to secondary stakeholders to refine and validate your approach.**

---

## **Phase 1: Primary Stakeholders (Week 1-2)**
### 🏢 **Target: 5-7 Primary Stakeholders**

#### **🔍 Problem Discovery Questions:**
1. "Walk me through your current process for handling this challenge."
2. "What's the most frustrating part of your current workflow?"
3. "How much time do you spend each day on this type of task?"
4. "What happens when the current process doesn't work as expected?"
5. "How do you currently handle communication around this issue?"

#### **✅ Solution Validation Questions:**
1. "Would a solution that addresses this problem be valuable to your organization?"
2. "What features would be most important in an ideal solution?"
3. "How much would you be willing to invest in a solution that significantly improves this process?"
4. "What concerns would you have about implementing a new system?"
5. "How do you typically evaluate new solutions in this area?"

#### **💡 Follow-up Questions:**
1. "Who else would be involved in the decision to adopt this type of solution?"
2. "What integration requirements would you have with existing systems?"
3. "How would you measure the success of this type of solution?"

---

## **Phase 2: Secondary Stakeholders (Week 3)**

### 👥 **Secondary Users (5-6 interviews)**

#### **🔍 Problem Discovery Questions:**
1. "Describe your last experience with this type of process."
2. "What's most frustrating about the current approach?"
3. "How do you prefer to interact with this type of system?"
4. "What information do you need to feel confident using a solution?"
5. "How important is ease of use in this context?"

#### **✅ Solution Validation Questions:**
1. "Would you be interested in a solution that simplifies this process?"
2. "What features would be most important to you?"
3. "How much would convenience influence your choice to use this solution?"
4. "What concerns would you have about using a new system?"
5. "How do you currently make decisions in this area?"

---

## **Phase 3: Cross-Stakeholder Validation (Week 4)**

### 🔄 **Synthesis Questions for All Groups:**
1. "Based on what we've learned, does this approach address your main concerns?"
2. "What potential conflicts do you see between different user needs?"
3. "How would you prioritize these features: [list top features from all groups]?"

### 📊 **Expected Deliverables:**
- **Primary Stakeholder Requirements** (workflow needs, pricing expectations)
- **User Experience Guidelines** (preferences, communication channels, trust factors)
- **Feature Priority Matrix** (ranked by stakeholder impact and business value)
- **Go-to-Market Strategy** (tailored messaging for each stakeholder group)

### 🎯 **Success Metrics:**
- **Primary stakeholder adoption criteria** clearly defined
- **User acceptance requirements** validated
- **Pricing strategy** validated across all groups
- **Technical requirements** prioritized by stakeholder value

**This complete questionnaire ensures you gather actionable insights from all stakeholders while maintaining focus on your primary business objectives.**`,
                          role: 'assistant',
                          timestamp: new Date()
                        };
                        setMessages(prev => [...prev, detailedPlanMessage]);
                      }}
                    />
                  ) : message.content === 'FORMATTED_QUESTIONS_COMPONENT' ? (
                    <FormattedQuestionsComponent
                      questions={currentQuestions ? [
                        ...currentQuestions.problemDiscovery.map((q: string, index: number) => ({
                          id: `discovery_${index}`,
                          text: q,
                          category: 'discovery' as const,
                          priority: 'high' as const
                        })),
                        ...currentQuestions.solutionValidation.map((q: string, index: number) => ({
                          id: `validation_${index}`,
                          text: q,
                          category: 'validation' as const,
                          priority: 'medium' as const
                        })),
                        ...currentQuestions.followUp.map((q: string, index: number) => ({
                          id: `followup_${index}`,
                          text: q,
                          category: 'follow_up' as const,
                          priority: 'low' as const
                        }))
                      ] : []}
                      onExport={() => exportQuestions('txt').catch(console.error)}
                      onContinue={() => continueToAnalysis()}
                    />
                  ) : message.content === 'ENHANCED_MULTISTAKEHOLDER_COMPONENT' ? (
                    (() => {
                      // Use message metadata if available, otherwise detect from context
                      const stakeholderData = message.metadata?.stakeholders ||
                        detectMultipleStakeholders(context, messages).stakeholders;

                      console.log('Raw stakeholder data:', stakeholderData);

                      // Convert stakeholder data to proper format - now with LLM-generated descriptions
                      const formatStakeholders = (stakeholders: any[], type: 'primary' | 'secondary') => {
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

                      const formattedStakeholders = [
                        ...formatStakeholders(stakeholderData?.primary || [], 'primary'),
                        ...formatStakeholders(stakeholderData?.secondary || [], 'secondary')
                      ];

                      if (!stakeholderData) {
                        return null;
                      }

                      // Display LLM reasoning if available
                      const reasoning = stakeholderData.reasoning;

                      return (
                        <div className="space-y-4">
                          {reasoning && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                              <div className="flex items-start gap-2">
                                <span className="text-blue-600 text-sm font-medium">🧠 AI Analysis:</span>
                                <p className="text-sm text-blue-800">{reasoning}</p>
                              </div>
                            </div>
                          )}
                          <EnhancedMultiStakeholderComponent
                            industry={stakeholderData.industry}
                            stakeholders={formattedStakeholders}
                            businessContext={context.businessIdea}
                            onContinueWithCurrent={() => {
                              // Generate stakeholder-specific questions and show them in a formatted component
                              const allStakeholders = generateStakeholderQuestions(
                                formattedStakeholders,
                                context.businessIdea || 'your business',
                                stakeholderData.industry || 'general'
                              );

                              const stakeholderQuestionsMessage: Message = {
                                id: Date.now().toString() + '_stakeholder_questions',
                                content: 'STAKEHOLDER_QUESTIONS_COMPONENT',
                                role: 'assistant',
                                timestamp: new Date(),
                                metadata: {
                                  type: 'component',
                                  stakeholders: allStakeholders,
                                  businessContext: context.businessIdea
                                }
                              };
                              setMessages(prev => [...prev, stakeholderQuestionsMessage]);
                            }}
                            onViewDetailedPlan={() => {
                              // Generate stakeholder-specific questions
                              const allStakeholders = generateStakeholderQuestions(
                                formattedStakeholders,
                                context.businessIdea || 'your business',
                                stakeholderData.industry || 'general'
                              );

                              const primaryStakeholders = allStakeholders.filter(s => s.type === 'primary');
                              const secondaryStakeholders = allStakeholders.filter(s => s.type === 'secondary');

                              // Create detailed plan with actual stakeholder names and questions
                              const detailedPlanContent = `## 📋 Complete Multi-Stakeholder Research Questionnaire

### ⚠️ **Important: Primary Objective First**
**Start with your primary stakeholder research to validate core assumptions, then expand to secondary stakeholders to refine and validate your approach.**

---

## **Phase 1: Primary Stakeholders (Week 1-2)**
### 🏢 **Target: 5-7 Primary Stakeholders**

${primaryStakeholders.map((stakeholder, index) => `
### ${index + 1}. ${stakeholder.name}
*${stakeholder.description}*

#### **🔍 Problem Discovery Questions:**
${stakeholder.questions.discovery.map((q, i) => `${i + 1}. "${q}"`).join('\n')}

#### **✅ Solution Validation Questions:**
${stakeholder.questions.validation.map((q, i) => `${i + 1}. "${q}"`).join('\n')}

#### **💡 Follow-up Questions:**
${stakeholder.questions.followUp.map((q, i) => `${i + 1}. "${q}"`).join('\n')}
`).join('\n---\n')}

---

## **Phase 2: Secondary Stakeholders (Week 3)**
### 👥 **Secondary Users (5-6 interviews)**

${secondaryStakeholders.length > 0 ? secondaryStakeholders.map((stakeholder, index) => `
### ${index + 1}. ${stakeholder.name}
*${stakeholder.description}*

#### **🔍 Problem Discovery Questions:**
${stakeholder.questions.discovery.map((q, i) => `${i + 1}. "${q}"`).join('\n')}

#### **✅ Solution Validation Questions:**
${stakeholder.questions.validation.map((q, i) => `${i + 1}. "${q}"`).join('\n')}

#### **💡 Follow-up Questions:**
${stakeholder.questions.followUp.map((q, i) => `${i + 1}. "${q}"`).join('\n')}
`).join('\n---\n') : '*No secondary stakeholders detected for this business model.*'}

---

## **Phase 3: Cross-Stakeholder Validation (Week 4)**

### 🔄 **Synthesis Questions for All Groups:**
1. "Based on what we've learned, does this approach address your main concerns?"
2. "What potential conflicts do you see between different user needs?"
3. "How would you prioritize these features: [list top features from all groups]?"

### 📊 **Expected Deliverables:**
- **Primary Stakeholder Requirements** (workflow needs, pricing expectations)
- **User Experience Guidelines** (preferences, communication channels, trust factors)
- **Feature Priority Matrix** (ranked by stakeholder impact and business value)
- **Go-to-Market Strategy** (tailored messaging for each stakeholder group)

### 🎯 **Success Metrics:**
- **Primary stakeholder adoption criteria** clearly defined
- **User acceptance requirements** validated
- **Pricing strategy** validated across all groups
- **Technical requirements** prioritized by stakeholder value

**This complete questionnaire ensures you gather actionable insights from all stakeholders while maintaining focus on your primary business objectives.**`;

                              const detailedPlanMessage: Message = {
                                id: Date.now().toString() + '_detailed_plan_enhanced',
                                content: detailedPlanContent,
                                role: 'assistant',
                                timestamp: new Date()
                              };
                              setMessages(prev => [...prev, detailedPlanMessage]);
                            }}
                          />
                        </div>
                      );
                    })()
                  ) : message.content === 'STAKEHOLDER_QUESTIONS_COMPONENT' ? (
                    (() => {
                      const stakeholderData = message.metadata?.stakeholders || [];
                      const businessContext = message.metadata?.businessContext || 'your business';

                      return (
                        <StakeholderQuestionsComponent
                          stakeholders={stakeholderData}
                          businessContext={businessContext}
                          onExport={() => exportQuestions('txt').catch(console.error)}
                          onContinue={() => continueToAnalysis()}
                        />
                      );
                    })()
                  ) : message.content === 'NEXT_STEPS_COMPONENT' ? (
                    <NextStepsChatMessage
                      onExportQuestions={() => {
                        exportQuestions('txt').catch(console.error);
                      }}
                      onStartResearch={() => {
                        continueToAnalysis();
                      }}
                    />
                  ) : message.content === 'THINKING_PROCESS_COMPONENT' ? (
                    <ThinkingProcess
                      steps={message.metadata?.thinking_steps || []}
                      isExpanded={false}
                      className="max-w-none"
                      isVisible={thinkingProcessVisible[message.metadata?.request_id || ''] !== false}
                      isLive={message.metadata?.isLive || false}
                      onToggleVisibility={() => {
                        const requestId = message.metadata?.request_id;
                        if (requestId) {
                          setThinkingProcessVisible(prev => ({
                            ...prev,
                            [requestId]: !prev[requestId]
                          }));
                        }
                      }}
                    />
                  ) : (
                    <div>
                      {/* Show thinking process if available for assistant messages */}
                      {message.role === 'assistant' && message.metadata?.thinking_steps && message.metadata.thinking_steps.length > 0 && (
                        <div className="mb-4">
                          <ThinkingProcess
                            steps={message.metadata.thinking_steps}
                            isExpanded={false}
                            className="max-w-none"
                            isVisible={thinkingProcessVisible[message.metadata?.request_id || message.id] !== false}
                            isLive={false} // Assistant messages are always complete
                            onToggleVisibility={() => {
                              const requestId = message.metadata?.request_id || message.id;
                              setThinkingProcessVisible(prev => ({
                                ...prev,
                                [requestId]: !prev[requestId]
                              }));
                            }}
                          />
                        </div>
                      )}
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    </div>
                  )}
                  {message.content !== 'MULTI_STAKEHOLDER_COMPONENT' &&
                   message.content !== 'NEXT_STEPS_COMPONENT' &&
                   message.content !== 'STAKEHOLDER_ALERT_COMPONENT' &&
                   message.content !== 'FORMATTED_QUESTIONS_COMPONENT' &&
                   message.content !== 'ENHANCED_MULTISTAKEHOLDER_COMPONENT' &&
                   message.content !== 'STAKEHOLDER_QUESTIONS_COMPONENT' &&
                   message.content !== 'THINKING_PROCESS_COMPONENT' && (
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs opacity-70">
                        {message.timestamp.toLocaleTimeString()}
                      </span>
                      {message.role === 'assistant' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyMessage(message.content)}
                          className="h-6 w-6 p-0 opacity-70 hover:opacity-100"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {message.role === 'user' && (
                  <div className="flex-shrink-0">
                    <div className="w-6 h-6 lg:w-8 lg:h-8 bg-muted rounded-full flex items-center justify-center">
                      <User className="h-3 w-3 lg:h-4 lg:w-4 text-muted-foreground" />
                    </div>
                  </div>
                )}
              </div>

              {/* Show suggestions after assistant messages (but not after component messages) */}
              {message.role === 'assistant' &&
               index === messages.length - 1 &&
               !isLoading &&
               currentSuggestions.length > 0 &&
               !message.content.includes('_COMPONENT') && (
                <div className="mt-3 ml-8 lg:ml-11">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-muted-foreground">💡 Quick replies:</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {currentSuggestions.map((suggestion, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        size="sm"
                        className="h-auto py-1 px-2 text-xs hover:bg-muted"
                        onClick={() => handleSuggestionClick(suggestion)}
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Debug: Show current suggestions state */}
              {process.env.NODE_ENV === 'development' && message.role === 'assistant' && index === messages.length - 1 && (
                <div className="mt-2 ml-8 lg:ml-11 text-xs text-gray-500">
                  Debug: Suggestions count: {currentSuggestions.length}, Loading: {isLoading.toString()}
                  {currentSuggestions.length > 0 && (
                    <div>Suggestions: {JSON.stringify(currentSuggestions)}</div>
                  )}
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-2 lg:gap-3 justify-start">
              <div className="flex-shrink-0">
                <div className="w-6 h-6 lg:w-8 lg:h-8 bg-primary/10 rounded-full flex items-center justify-center">
                  <Bot className="h-3 w-3 lg:h-4 lg:w-4 text-primary" />
                </div>
              </div>
              <div className="bg-muted rounded-lg p-2 lg:p-3">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
              </div>
            </div>
          )}
        </div>
        <div ref={messagesEndRef} />
      </ScrollArea>

          {/* Input */}
          <div className="p-3 lg:p-4 border-t flex-shrink-0">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe your business idea or ask for help..."
                disabled={isLoading}
                className="flex-1 text-sm lg:text-base"
              />
              <Button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                size="sm"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </Card>

        {/* Clear Confirmation Dialog */}
        {showClearConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md">
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-2">Clear Chat?</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  This will clear your entire conversation and reset all progress. This action cannot be undone.
                </p>
                <div className="flex gap-3 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setShowClearConfirm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={clearChat}
                  >
                    Clear Chat
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Context Panel - Hidden on mobile, shown on desktop */}
        <div className="hidden lg:block lg:col-span-1 min-h-0">
          <div className="h-full overflow-y-auto space-y-4 min-h-0">
            <ContextPanel
              context={context}
              questions={currentQuestions || undefined}
              onExport={() => exportQuestions('txt')}
              onContinueToAnalysis={continueToAnalysis}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
