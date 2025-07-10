'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Send,
  Bot,
  User,
  ArrowLeft,
  Play,
  Pause,
  SkipForward,
  Users,
  MessageSquare,
  CheckCircle2,
  Clock,
  Download,
  FileText
} from 'lucide-react';

import {
  AIPersona,
  SimulatedPerson,
  SimulatedInterview,
  InterviewResponse,
  SimulationResponse,
  QuestionsData,
  BusinessContext,
  SimulationConfig,
  Stakeholder,
  createSimulation,
  testPersonaGeneration,
  testInterviewSimulation,
  generatePersonasForChat,
  streamPersonaResponse
} from '@/lib/api/simulation';

interface SimulationMessage {
  id: string;
  content: string;
  role: 'interviewer' | 'interviewee' | 'system';
  timestamp: Date;
  person?: SimulatedPerson;  // Changed from persona
  questionIndex?: number;
  isComplete?: boolean;
}

interface SimulationChatInterfaceProps {
  questionsData: QuestionsData;
  businessContext: BusinessContext;
  onComplete?: (results: SimulationResponse) => void;
  onBack?: () => void;
}

export function SimulationChatInterface({
  questionsData,
  businessContext,
  onComplete,
  onBack
}: SimulationChatInterfaceProps) {
  // State management
  const [messages, setMessages] = useState<SimulationMessage[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [currentPerson, setCurrentPerson] = useState<SimulatedPerson | null>(null);  // Changed from persona
  const [currentStakeholder, setCurrentStakeholder] = useState<Stakeholder | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [simulationProgress, setSimulationProgress] = useState(0);
  const [completedInterviews, setCompletedInterviews] = useState<SimulatedInterview[]>([]);
  const [allPeople, setAllPeople] = useState<SimulatedPerson[]>([]);  // Changed from personas
  const [currentPersonIndex, setCurrentPersonIndex] = useState(0);  // Changed from persona
  const [isGeneratingPeople, setIsGeneratingPeople] = useState(false);  // Changed from personas
  const [simulationPhase, setSimulationPhase] = useState<'setup' | 'people' | 'interviews' | 'complete'>('setup');  // Updated phases

  // Question and answer tracking
  const [totalQuestionsAsked, setTotalQuestionsAsked] = useState(0);
  const [totalAnswersReceived, setTotalAnswersReceived] = useState(0);
  const [questionsPerPerson, setQuestionsPerPerson] = useState<Record<string, number>>({});  // Changed from persona
  const [answersPerPerson, setAnswersPerPerson] = useState<Record<string, number>>({});  // Changed from persona
  const [currentInterviewData, setCurrentInterviewData] = useState<Record<string, InterviewResponse[]>>({});

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom only if user is near the bottom
  useEffect(() => {
    const messagesContainer = messagesEndRef.current?.parentElement;
    if (messagesContainer) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
      const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100;

      // Only auto-scroll if user is near the bottom or if it's the first message
      if (isNearBottom || messages.length <= 1) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages]);

  // Initialize simulation
  useEffect(() => {
    if (questionsData && businessContext) {
      initializeSimulation();
    }
  }, [questionsData, businessContext]);

  const initializeSimulation = useCallback(() => {
    const welcomeMessage: SimulationMessage = {
      id: Date.now().toString(),
      content: `Welcome to Interview Simulation!

I'll help you conduct realistic interviews based on your questionnaire. Here's what will happen:

1. **Generate People** - Create realistic individuals for each stakeholder type
2. **Conduct Interviews** - Simulate Q&A sessions with each person
3. **Save Results** - Export interview transcripts for manual analysis

**Business Context:**
- **Idea:** ${businessContext.business_idea}
- **Target Customer:** ${businessContext.target_customer}
- **Problem:** ${businessContext.problem}

Ready to start generating people?`,
      role: 'system',
      timestamp: new Date()
    };

    setMessages([welcomeMessage]);
    setSimulationPhase('setup');
  }, [questionsData, businessContext]);

  const startPersonGeneration = async () => {
    setIsGeneratingPeople(true);
    setSimulationPhase('people');

    const generatingMessage: SimulationMessage = {
      id: Date.now().toString(),
      content: "🤖 Generating individual people for your stakeholders...",
      role: 'system',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, generatingMessage]);

    // Reset counters for new simulation
    setTotalQuestionsAsked(0);
    setTotalAnswersReceived(0);
    setQuestionsPerPerson({});
    setAnswersPerPerson({});
    setCurrentInterviewData({});

    try {
      // Create simulation config
      const config: SimulationConfig = {
        depth: "detailed",
        people_per_stakeholder: 1, // One person per stakeholder for chat simulation
        response_style: "realistic",
        include_insights: false,
        temperature: 0.7
      };

      // Generate people using the existing API method that handles all stakeholders
      const result = await generatePersonasForChat(questionsData, businessContext, config);

      if (result.success && result.personas && result.personas.length > 0) {
        setAllPeople(result.personas);  // Note: API still returns 'personas' field for backward compatibility

        // Show generated people
        const peopleMessage: SimulationMessage = {
          id: (Date.now() + 1).toString(),
          content: `✅ Generated ${result.personas.length} people to interview:

${result.personas.map((person, index) =>
  `**${index + 1}. ${person.name}** (${person.stakeholder_type})
  - Age: ${person.age}
  - Background: ${person.background}
  - Communication Style: ${person.communication_style}`
).join('\n\n')}

Ready to start the interviews?`,
          role: 'system',
          timestamp: new Date()
        };

        setMessages(prev => [...prev, peopleMessage]);
        setSimulationPhase('interviews');
      } else {
        throw new Error('No people were generated');
      }

    } catch (error) {
      console.error('Error generating people:', error);
      const errorMessage: SimulationMessage = {
        id: (Date.now() + 2).toString(),
        content: `❌ Error generating people: ${error instanceof Error ? error.message : 'Unknown error'}`,
        role: 'system',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsGeneratingPeople(false);
    }
  };

  const startInterviewSimulation = async () => {
    if (allPeople.length === 0) return;

    setIsSimulating(true);
    setCurrentPersonIndex(0);

    // Start with first person
    await simulatePersonInterview(0);
  };

  const simulatePersonInterview = async (personIndex: number) => {
    if (personIndex >= allPeople.length) {
      // All interviews complete
      completeSimulation();
      return;
    }

    const person = allPeople[personIndex];
    setCurrentPerson(person);

    // Find the stakeholder data for this person
    const allStakeholders = [
      ...(questionsData.stakeholders.primary || []),
      ...(questionsData.stakeholders.secondary || [])
    ];

    const stakeholder = allStakeholders.find(s => s.id === person.stakeholder_type);
    if (!stakeholder) {
      console.error('No stakeholder found for person:', person.stakeholder_type);
      return;
    }

    setCurrentStakeholder(stakeholder);
    setCurrentQuestionIndex(0);

    // Introduction message
    const introMessage: SimulationMessage = {
      id: Date.now().toString(),
      content: `🎭 **Starting Interview with ${person.name}**

*${person.name} is a ${person.age}-year-old ${person.stakeholder_type}. ${person.background}*

**Communication Style:** ${person.communication_style}

---

**Interviewer:** Hello ${person.name}, thank you for taking the time to speak with us today. I'd like to ask you some questions about ${businessContext.business_idea}.`,
      role: 'system',
      timestamp: new Date(),
      person: person
    };

    setMessages(prev => [...prev, introMessage]);

    // Start asking questions
    setTimeout(() => {
      askNextQuestion(stakeholder, person, 0);
    }, 1500);
  };

  const askNextQuestion = async (stakeholder: Stakeholder, person: SimulatedPerson, questionIndex: number) => {
    // Check if simulation is paused
    if (!isSimulating) {
      return;
    }

    if (questionIndex >= stakeholder.questions.length) {
      // Interview complete for this person
      await completePersonInterview(person, stakeholder);
      return;
    }

    const question = stakeholder.questions[questionIndex];

    // Interviewer asks question
    const questionMessage: SimulationMessage = {
      id: Date.now().toString(),
      content: question,
      role: 'interviewer',
      timestamp: new Date(),
      questionIndex: questionIndex
    };

    setMessages(prev => [...prev, questionMessage]);

    // Track question asked
    setTotalQuestionsAsked(prev => prev + 1);
    setQuestionsPerPerson(prev => ({
      ...prev,
      [person.id]: (prev[person.id] || 0) + 1
    }));

    // Simulate thinking time
    setTimeout(async () => {
      // Check if simulation is still running before generating response
      if (isSimulating) {
        await generatePersonResponse(question, person, stakeholder, questionIndex);
      }
    }, 1000 + Math.random() * 2000); // 1-3 seconds thinking time
  };

  const generatePersonResponse = async (
    question: string,
    person: SimulatedPerson,
    stakeholder: Stakeholder,
    questionIndex: number
  ) => {
    // Check if simulation is paused
    if (!isSimulating) {
      return;
    }

    try {
      // Create initial empty response message for streaming
      const responseMessageId = Date.now().toString();
      const responseMessage: SimulationMessage = {
        id: responseMessageId,
        content: '',
        role: 'interviewee',
        timestamp: new Date(),
        person: person,
        questionIndex: questionIndex
      };

      setMessages(prev => [...prev, responseMessage]);

      // Stream the person response with typing effect
      await streamPersonaResponse(  // Note: keeping old function name for API compatibility
        person,
        question,
        stakeholder,
        businessContext,
        {
          temperature: 0.7,
          response_style: "realistic"
        },
        // onChunk: append content to the message
        (chunk: string) => {
          setMessages(prev => prev.map(msg =>
            msg.id === responseMessageId
              ? { ...msg, content: msg.content + chunk }
              : msg
          ));
        },
        // onComplete: update progress and continue
        () => {
          // Track answer received
          setTotalAnswersReceived(prev => prev + 1);
          setAnswersPerPerson(prev => ({
            ...prev,
            [person.id]: (prev[person.id] || 0) + 1
          }));

          // Store the Q&A pair for this interview
          const currentResponse = messages.find(m => m.id === responseMessageId);
          if (currentResponse) {
            const interviewResponse: InterviewResponse = {
              question: question,
              response: currentResponse.content,
              sentiment: "neutral",
              key_insights: []
            };

            setCurrentInterviewData(prev => ({
              ...prev,
              [person.id]: [...(prev[person.id] || []), interviewResponse]
            }));
          }

          // Update progress
          const totalQuestions = stakeholder.questions.length;
          const progress = ((questionIndex + 1) / totalQuestions) * 100;
          setSimulationProgress(progress);
          setCurrentQuestionIndex(questionIndex + 1);

          // Continue to next question after a brief pause
          setTimeout(() => {
            if (isSimulating) {
              askNextQuestion(stakeholder, person, questionIndex + 1);
            }
          }, 1500);
        },
        // onError: handle errors
        (error: string) => {
          console.error('Error streaming person response:', error);
          setMessages(prev => prev.map(msg =>
            msg.id === responseMessageId
              ? { ...msg, content: `❌ Error generating response: ${error}` }
              : msg
          ));

          // Continue to next question even on error
          setTimeout(() => {
            if (isSimulating) {
              askNextQuestion(stakeholder, person, questionIndex + 1);
            }
          }, 2000);
        }
      );

    } catch (error) {
      console.error('Error generating person response:', error);
      const errorMessage: SimulationMessage = {
        id: Date.now().toString(),
        content: `❌ Error generating response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        role: 'system',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const completePersonInterview = async (person: SimulatedPerson, stakeholder: Stakeholder, simulatedInterview?: SimulatedInterview) => {
    // Use the tracked interview data or fallback to simulated interview data
    let finalSimulatedInterview: SimulatedInterview;

    // First try to use the tracked interview data
    const trackedResponses = currentInterviewData[person.id] || [];

    if (trackedResponses.length > 0) {
      // Use the tracked interview data
      finalSimulatedInterview = {
        person_id: person.id,  // Changed from persona_id
        stakeholder_type: person.stakeholder_type,
        responses: trackedResponses,
        interview_duration_minutes: Math.ceil(trackedResponses.length * 2),
        overall_sentiment: "neutral",
        key_themes: []
      };
    } else if (simulatedInterview) {
      // Use the backend-provided interview data
      finalSimulatedInterview = simulatedInterview;
    } else {
      // Final fallback: create interview summary from messages
      const interviewMessages = messages.filter(m =>
        m.person?.id === person.id && (m.role === 'interviewer' || m.role === 'interviewee')
      );

      const responses: InterviewResponse[] = [];
      for (let i = 0; i < interviewMessages.length; i += 2) {
        const questionMsg = interviewMessages[i];
        const responseMsg = interviewMessages[i + 1];

        if (questionMsg && responseMsg) {
          responses.push({
            question: questionMsg.content,
            response: responseMsg.content,
            sentiment: "neutral",
            key_insights: []
          });
        }
      }

      finalSimulatedInterview = {
        person_id: person.id,  // Changed from persona_id
        stakeholder_type: person.stakeholder_type,
        responses: responses,
        interview_duration_minutes: Math.ceil(responses.length * 2),
        overall_sentiment: "neutral",
        key_themes: []
      };
    }

    setCompletedInterviews(prev => [...prev, finalSimulatedInterview]);

    // Show completion message
    const completionMessage: SimulationMessage = {
      id: Date.now().toString(),
      content: `✅ **Interview with ${person.name} completed!**

Answered ${finalSimulatedInterview.responses.length} questions in approximately ${finalSimulatedInterview.interview_duration_minutes} minutes.

${currentPersonIndex + 1 < allPeople.length ?
  `Moving to next interview...` :
  `All interviews completed! 🎉`}`,
      role: 'system',
      timestamp: new Date(),
      isComplete: true
    };

    setMessages(prev => [...prev, completionMessage]);

    // Move to next person or start analysis
    if (currentPersonIndex + 1 < allPeople.length) {
      setCurrentPersonIndex(prev => prev + 1);
      setTimeout(() => {
        simulatePersonInterview(currentPersonIndex + 1);
      }, 2000);
    } else {
      completeSimulation();
    }
  };



  const completeSimulation = () => {
    setSimulationPhase('complete');
    setIsSimulating(false);

    // Save simulation results to localStorage in the format expected by history page
    const simulationId = Date.now().toString();
    const simulationResponse: SimulationResponse = {
      success: true,
      message: "Simulation completed successfully",
      simulation_id: simulationId,
      people: allPeople,
      interviews: completedInterviews,
      business_context: businessContext.business_idea,
      metadata: {
        total_personas: allPeople.length,  // Use 'personas' for backward compatibility
        total_interviews: completedInterviews.length,
        total_questions: completedInterviews.reduce((sum, interview) => sum + interview.responses.length, 0),
        simulation_duration_minutes: completedInterviews.reduce((sum, interview) => sum + interview.interview_duration_minutes, 0)
      }
    };

    const simulationResults = {
      simulation_id: simulationId,
      timestamp: new Date().toISOString(),
      session_id: null, // No session ID for chat simulations
      results: simulationResponse
    };

    // Store in localStorage (using the same key as expected by history page)
    const existingResults = JSON.parse(localStorage.getItem('simulation_results') || '[]');
    existingResults.push(simulationResults);
    localStorage.setItem('simulation_results', JSON.stringify(existingResults));

    const finalMessage: SimulationMessage = {
      id: Date.now().toString(),
      content: `🎉 **Simulation Complete!**

Successfully completed ${completedInterviews.length} interviews with individual people.

**Results Summary:**
- **People Interviewed:** ${allPeople.length}
- **Total Interviews:** ${completedInterviews.length}
- **Total Questions Answered:** ${completedInterviews.reduce((sum, interview) => sum + interview.responses.length, 0)}
- **Estimated Duration:** ${completedInterviews.reduce((sum, interview) => sum + interview.interview_duration_minutes, 0)} minutes

Results have been saved automatically. You can now download the interview transcripts or upload them to "Analyse Interviews" for persona pattern discovery.`,
      role: 'system',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, finalMessage]);

    // Call completion callback if provided
    if (onComplete) {
      onComplete(simulationResponse);
    }
  };

  const pauseSimulation = () => {
    setIsSimulating(false);

    // Abort any ongoing streaming requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    const pauseMessage: SimulationMessage = {
      id: Date.now().toString(),
      content: "⏸️ **Simulation Paused**\n\nYou can resume the simulation at any time.",
      role: 'system',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, pauseMessage]);
  };

  const resumeSimulation = () => {
    setIsSimulating(true);

    const resumeMessage: SimulationMessage = {
      id: Date.now().toString(),
      content: "▶️ **Simulation Resumed**\n\nContinuing with the interviews...",
      role: 'system',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, resumeMessage]);

    // Continue with current persona if available
    if (currentPerson && currentStakeholder) {
      setTimeout(() => {
        askNextQuestion(currentStakeholder, currentPerson, currentQuestionIndex);
      }, 1000);
    }
  };

  const skipToNextPerson = () => {
    if (currentPersonIndex + 1 < allPeople.length) {
      const skipMessage: SimulationMessage = {
        id: Date.now().toString(),
        content: `⏭️ **Skipping to next person**\n\nMoving to interview ${currentPersonIndex + 2} of ${allPeople.length}...`,
        role: 'system',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, skipMessage]);

      setCurrentPersonIndex(prev => prev + 1);
      setTimeout(() => {
        simulatePersonInterview(currentPersonIndex + 1);
      }, 1500);
    }
  };

  const downloadResults = () => {
    const content = completedInterviews.map((interview, index) => {
      const person = allPeople.find(p => p.id === interview.person_id || p.id === interview.persona_id);

      return `INTERVIEW ${index + 1}
================

Person: ${person?.name || interview.person_id || interview.persona_id}
Stakeholder Type: ${interview.stakeholder_type}
Duration: ${interview.interview_duration_minutes} minutes

RESPONSES:
----------

${interview.responses.map((response, i) => `Q${i + 1}: ${response.question}

A${i + 1}: ${response.response}
`).join('\n---\n')}

================
`;
    }).join('\n\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-simulation-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full max-h-screen">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <Button variant="ghost" size="sm" onClick={onBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div>
              <h2 className="text-lg font-semibold">Interview Simulation</h2>
              <p className="text-sm text-muted-foreground">
                {simulationPhase === 'setup' && 'Ready to start'}
                {simulationPhase === 'personas' && 'Generating personas...'}
                {simulationPhase === 'interviews' && currentPerson && `Interviewing ${currentPerson.name}`}
                {simulationPhase === 'complete' && 'Simulation complete'}
              </p>
            </div>
          </div>

          {/* Progress indicator */}
          {simulationPhase === 'interviews' && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-medium">
                  Persona {currentPersonIndex + 1} of {allPeople.length}
                </div>
                <div className="text-xs text-muted-foreground">
                  Question {currentQuestionIndex} of {currentStakeholder?.questions.length || 0}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Progress value={simulationProgress} className="w-32" />
                <div className="text-xs text-muted-foreground text-center">
                  {Math.round(simulationProgress)}% complete
                </div>
              </div>
            </div>
          )}

          {/* Persona generation progress */}
          {simulationPhase === 'personas' && isGeneratingPersonas && (
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              <span className="text-sm text-muted-foreground">Generating personas...</span>
            </div>
          )}
        </div>
      </div>

      {/* Overall Progress Summary */}
      {simulationPhase === 'interviews' && isSimulating && (
        <div className="px-4 py-2 bg-muted/50 border-b">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span>Completed: {completedInterviews.length}/{allPeople.length} interviews</span>
              </div>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span>
                  Q&A: {totalQuestionsAsked} questions / {totalAnswersReceived} answers
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>
                Est. Time: {completedInterviews.reduce((sum, interview) => sum + interview.interview_duration_minutes, 0)}min
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-4">
          {messages.map((message) => (
            <div key={message.id} className={`flex gap-3 ${
              message.role === 'interviewer' ? 'justify-end' : 'justify-start'
            }`}>
              {message.role !== 'interviewer' && (
                <div className="flex-shrink-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    message.role === 'system' ? 'bg-blue-100' : 'bg-green-100'
                  }`}>
                    {message.role === 'system' ? (
                      <Bot className="h-4 w-4 text-blue-600" />
                    ) : (
                      <User className="h-4 w-4 text-green-600" />
                    )}
                  </div>
                </div>
              )}

              <div className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'interviewer'
                  ? 'bg-primary text-primary-foreground'
                  : message.role === 'system'
                  ? 'bg-secondary'
                  : 'bg-green-50 border border-green-200'
              }`}>
                <div className="whitespace-pre-wrap">{message.content}</div>
                {message.person && (
                  <div className="mt-2 text-xs opacity-75">
                    {message.person.name} • {message.person.stakeholder_type}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Action buttons */}
      <div className="p-4 border-t">
        {simulationPhase === 'setup' && (
          <Button
            onClick={startPersonGeneration}
            disabled={isGeneratingPeople}
            className="w-full"
          >
            {isGeneratingPeople ? (
              <>
                <Bot className="mr-2 h-4 w-4 animate-spin" />
                Generating People...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Start Simulation
              </>
            )}
          </Button>
        )}

        {simulationPhase === 'interviews' && !isSimulating && allPeople.length > 0 && completedInterviews.length === 0 && (
          <Button
            onClick={startInterviewSimulation}
            className="w-full"
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Begin Interviews
          </Button>
        )}

        {/* Simulation Controls - positioned below chat */}
        {simulationPhase === 'interviews' && isSimulating && (
          <div className="flex gap-2 mb-3">
            <Button
              variant="outline"
              onClick={pauseSimulation}
              size="sm"
              className="flex-1"
            >
              <Pause className="mr-2 h-4 w-4" />
              Pause
            </Button>
            {currentPersonIndex + 1 < allPeople.length && (
              <Button
                variant="outline"
                onClick={skipToNextPerson}
                size="sm"
                className="flex-1"
              >
                <SkipForward className="mr-2 h-4 w-4" />
                Skip to Next
              </Button>
            )}
          </div>
        )}

        {simulationPhase === 'interviews' && !isSimulating && completedInterviews.length > 0 && completedInterviews.length < allPeople.length && (
          <Button
            onClick={resumeSimulation}
            className="w-full"
          >
            <Play className="mr-2 h-4 w-4" />
            Resume Simulation
          </Button>
        )}

        {simulationPhase === 'complete' && (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={downloadResults}>
              <Download className="mr-2 h-4 w-4" />
              Download Results
            </Button>
            <Button className="flex-1" onClick={() => onComplete && onComplete({
              success: true,
              message: "Redirecting to analysis",
              simulation_id: Date.now().toString(),
              people: allPeople,  // Changed from personas
              interviews: completedInterviews
            })}>
              <FileText className="mr-2 h-4 w-4" />
              Upload to Analysis
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
