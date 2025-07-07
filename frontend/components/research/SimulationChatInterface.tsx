'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  generatePersonasForChat
} from '@/lib/api/simulation';

interface SimulationMessage {
  id: string;
  content: string;
  role: 'interviewer' | 'interviewee' | 'system';
  timestamp: Date;
  persona?: AIPersona;
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
  const [currentPersona, setCurrentPersona] = useState<AIPersona | null>(null);
  const [currentStakeholder, setCurrentStakeholder] = useState<Stakeholder | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [simulationProgress, setSimulationProgress] = useState(0);
  const [completedInterviews, setCompletedInterviews] = useState<SimulatedInterview[]>([]);
  const [allPersonas, setAllPersonas] = useState<AIPersona[]>([]);
  const [currentPersonaIndex, setCurrentPersonaIndex] = useState(0);
  const [isGeneratingPersonas, setIsGeneratingPersonas] = useState(false);
  const [simulationPhase, setSimulationPhase] = useState<'setup' | 'personas' | 'interviews' | 'complete'>('setup');

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

1. **Generate AI Personas** - Create realistic personas for each stakeholder type
2. **Conduct Interviews** - Simulate Q&A sessions with each persona
3. **Save Results** - Export interview transcripts for analysis

**Business Context:**
- **Idea:** ${businessContext.business_idea}
- **Target Customer:** ${businessContext.target_customer}
- **Problem:** ${businessContext.problem}

Ready to start generating personas?`,
      role: 'system',
      timestamp: new Date()
    };

    setMessages([welcomeMessage]);
    setSimulationPhase('setup');
  }, [questionsData, businessContext]);

  const startPersonaGeneration = async () => {
    setIsGeneratingPersonas(true);
    setSimulationPhase('personas');

    const generatingMessage: SimulationMessage = {
      id: Date.now().toString(),
      content: "🤖 Generating AI personas for your stakeholders...",
      role: 'system',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, generatingMessage]);

    try {
      // Create simulation config
      const config: SimulationConfig = {
        depth: "detailed",
        personas_per_stakeholder: 1, // One persona per stakeholder for chat simulation
        response_style: "realistic",
        include_insights: false,
        temperature: 0.7
      };

      // Generate personas using the existing API method that handles all stakeholders
      const result = await generatePersonasForChat(questionsData, businessContext, config);

      if (result.success && result.personas.length > 0) {
        setAllPersonas(result.personas);

        // Show generated personas
        const personasMessage: SimulationMessage = {
          id: (Date.now() + 1).toString(),
          content: `✅ Generated ${result.personas.length} AI personas:

${result.personas.map((persona, index) =>
  `**${index + 1}. ${persona.name}** (${persona.stakeholder_type})
  - Age: ${persona.age}
  - Background: ${persona.background}
  - Communication Style: ${persona.communication_style}`
).join('\n\n')}

Ready to start the interviews?`,
          role: 'system',
          timestamp: new Date()
        };

        setMessages(prev => [...prev, personasMessage]);
        setSimulationPhase('interviews');
      } else {
        throw new Error('No personas were generated');
      }

    } catch (error) {
      console.error('Error generating personas:', error);
      const errorMessage: SimulationMessage = {
        id: (Date.now() + 2).toString(),
        content: `❌ Error generating personas: ${error instanceof Error ? error.message : 'Unknown error'}`,
        role: 'system',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsGeneratingPersonas(false);
    }
  };

  const startInterviewSimulation = async () => {
    if (allPersonas.length === 0) return;

    setIsSimulating(true);
    setCurrentPersonaIndex(0);

    // Start with first persona
    await simulatePersonaInterview(0);
  };

  const simulatePersonaInterview = async (personaIndex: number) => {
    if (personaIndex >= allPersonas.length) {
      // All interviews complete
      completeSimulation();
      return;
    }

    const persona = allPersonas[personaIndex];
    setCurrentPersona(persona);

    // Find the stakeholder data for this persona
    const allStakeholders = [
      ...(questionsData.stakeholders.primary || []),
      ...(questionsData.stakeholders.secondary || [])
    ];

    const stakeholder = allStakeholders.find(s => s.name === persona.stakeholder_type);
    if (!stakeholder) {
      console.error('No stakeholder found for persona:', persona.stakeholder_type);
      return;
    }

    setCurrentStakeholder(stakeholder);
    setCurrentQuestionIndex(0);

    // Introduction message
    const introMessage: SimulationMessage = {
      id: Date.now().toString(),
      content: `🎭 **Starting Interview with ${persona.name}**

*${persona.name} is a ${persona.age}-year-old ${persona.stakeholder_type}. ${persona.background}*

**Communication Style:** ${persona.communication_style}

---

**Interviewer:** Hello ${persona.name}, thank you for taking the time to speak with us today. I'd like to ask you some questions about ${businessContext.business_idea}.`,
      role: 'system',
      timestamp: new Date(),
      persona: persona
    };

    setMessages(prev => [...prev, introMessage]);

    // Start asking questions
    setTimeout(() => {
      askNextQuestion(stakeholder, persona, 0);
    }, 1500);
  };

  const askNextQuestion = async (stakeholder: Stakeholder, persona: AIPersona, questionIndex: number) => {
    if (questionIndex >= stakeholder.questions.length) {
      // Interview complete for this persona
      await completePersonaInterview(persona, stakeholder);
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

    // Simulate thinking time
    setTimeout(async () => {
      await generatePersonaResponse(question, persona, stakeholder, questionIndex);
    }, 1000 + Math.random() * 2000); // 1-3 seconds thinking time
  };

  const generatePersonaResponse = async (
    question: string,
    persona: AIPersona,
    stakeholder: Stakeholder,
    questionIndex: number
  ) => {
    try {
      // Create a temporary stakeholder with just this question for the API call
      const singleQuestionStakeholder: Stakeholder = {
        ...stakeholder,
        questions: [question]
      };

      // Use the existing testInterviewSimulation method
      const result = await testInterviewSimulation(
        persona,
        singleQuestionStakeholder,
        businessContext,
        {
          temperature: 0.7,
          response_style: "realistic"
        }
      );

      let personaResponse = "I'm not sure how to answer that.";

      if (result.success && result.interview.responses.length > 0) {
        personaResponse = result.interview.responses[0].response;
      }

      // Persona responds
      const responseMessage: SimulationMessage = {
        id: Date.now().toString(),
        content: personaResponse,
        role: 'interviewee',
        timestamp: new Date(),
        persona: persona,
        questionIndex: questionIndex
      };

      setMessages(prev => [...prev, responseMessage]);

      // Update progress
      const totalQuestions = stakeholder.questions.length;
      const progress = ((questionIndex + 1) / totalQuestions) * 100;
      setSimulationProgress(progress);
      setCurrentQuestionIndex(questionIndex + 1);

      // Continue to next question after a brief pause
      setTimeout(() => {
        askNextQuestion(stakeholder, persona, questionIndex + 1);
      }, 1500);

    } catch (error) {
      console.error('Error generating persona response:', error);
      const errorMessage: SimulationMessage = {
        id: Date.now().toString(),
        content: `❌ Error generating response: ${error instanceof Error ? error.message : 'Unknown error'}`,
        role: 'system',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const completePersonaInterview = async (persona: AIPersona, stakeholder: Stakeholder) => {
    // Create interview summary
    const interviewMessages = messages.filter(m =>
      m.persona?.id === persona.id && (m.role === 'interviewer' || m.role === 'interviewee')
    );

    const responses: InterviewResponse[] = [];
    for (let i = 0; i < interviewMessages.length; i += 2) {
      const questionMsg = interviewMessages[i];
      const responseMsg = interviewMessages[i + 1];

      if (questionMsg && responseMsg) {
        responses.push({
          question: questionMsg.content,
          response: responseMsg.content,
          sentiment: "neutral", // Could be analyzed
          key_insights: []
        });
      }
    }

    const simulatedInterview: SimulatedInterview = {
      persona_id: persona.id,
      stakeholder_type: persona.stakeholder_type,
      responses: responses,
      interview_duration_minutes: Math.ceil(responses.length * 2), // Estimate
      overall_sentiment: "neutral",
      key_themes: []
    };

    setCompletedInterviews(prev => [...prev, simulatedInterview]);

    // Show completion message
    const completionMessage: SimulationMessage = {
      id: Date.now().toString(),
      content: `✅ **Interview with ${persona.name} completed!**

Answered ${responses.length} questions in approximately ${simulatedInterview.interview_duration_minutes} minutes.

${currentPersonaIndex + 1 < allPersonas.length ?
  `Moving to next interview...` :
  `All interviews completed! 🎉`}`,
      role: 'system',
      timestamp: new Date(),
      isComplete: true
    };

    setMessages(prev => [...prev, completionMessage]);

    // Move to next persona or complete simulation
    if (currentPersonaIndex + 1 < allPersonas.length) {
      setCurrentPersonaIndex(prev => prev + 1);
      setTimeout(() => {
        simulatePersonaInterview(currentPersonaIndex + 1);
      }, 2000);
    } else {
      completeSimulation();
    }
  };

  const completeSimulation = () => {
    setSimulationPhase('complete');
    setIsSimulating(false);

    // Save simulation results to localStorage
    const simulationResults = {
      simulation_id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      personas: allPersonas,
      interviews: completedInterviews,
      messages: messages,
      business_context: businessContext,
      questions_data: questionsData,
      metadata: {
        total_personas: allPersonas.length,
        total_interviews: completedInterviews.length,
        total_questions: completedInterviews.reduce((sum, interview) => sum + interview.responses.length, 0),
        simulation_duration_minutes: completedInterviews.reduce((sum, interview) => sum + interview.interview_duration_minutes, 0)
      }
    };

    // Store in localStorage
    const existingResults = JSON.parse(localStorage.getItem('simulation_chat_results') || '[]');
    existingResults.push(simulationResults);
    localStorage.setItem('simulation_chat_results', JSON.stringify(existingResults));

    const finalMessage: SimulationMessage = {
      id: Date.now().toString(),
      content: `🎉 **Simulation Complete!**

Successfully completed ${completedInterviews.length} interviews with AI personas.

**Results Summary:**
- **Total Interviews:** ${completedInterviews.length}
- **Total Questions Answered:** ${completedInterviews.reduce((sum, interview) => sum + interview.responses.length, 0)}
- **Estimated Duration:** ${completedInterviews.reduce((sum, interview) => sum + interview.interview_duration_minutes, 0)} minutes

Results have been saved automatically. You can now download the interview transcripts or proceed to analysis.`,
      role: 'system',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, finalMessage]);

    // Call completion callback if provided
    if (onComplete) {
      const simulationResponse: SimulationResponse = {
        success: true,
        message: "Simulation completed successfully",
        simulation_id: simulationResults.simulation_id,
        personas: allPersonas,
        interviews: completedInterviews,
        metadata: simulationResults.metadata
      };
      onComplete(simulationResponse);
    }
  };

  const pauseSimulation = () => {
    setIsSimulating(false);

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
    if (currentPersona && currentStakeholder) {
      setTimeout(() => {
        askNextQuestion(currentStakeholder, currentPersona, currentQuestionIndex);
      }, 1000);
    }
  };

  const skipToNextPersona = () => {
    if (currentPersonaIndex + 1 < allPersonas.length) {
      const skipMessage: SimulationMessage = {
        id: Date.now().toString(),
        content: `⏭️ **Skipping to next persona**\n\nMoving to interview ${currentPersonaIndex + 2} of ${allPersonas.length}...`,
        role: 'system',
        timestamp: new Date()
      };

      setMessages(prev => [...prev, skipMessage]);

      setCurrentPersonaIndex(prev => prev + 1);
      setTimeout(() => {
        simulatePersonaInterview(currentPersonaIndex + 1);
      }, 1500);
    }
  };

  const downloadResults = () => {
    const content = completedInterviews.map((interview, index) => {
      const persona = allPersonas.find(p => p.id === interview.persona_id);

      return `INTERVIEW ${index + 1}
================

Persona: ${persona?.name || interview.persona_id}
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
    <div className="flex flex-col h-full">
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
                {simulationPhase === 'interviews' && currentPersona && `Interviewing ${currentPersona.name}`}
                {simulationPhase === 'complete' && 'Simulation complete'}
              </p>
            </div>
          </div>

          {/* Progress indicator */}
          {simulationPhase === 'interviews' && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-medium">
                  Persona {currentPersonaIndex + 1} of {allPersonas.length}
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
                <span>Completed: {completedInterviews.length}/{allPersonas.length} interviews</span>
              </div>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span>
                  Total Questions: {completedInterviews.reduce((sum, interview) => sum + interview.responses.length, 0)}
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
      <ScrollArea className="flex-1 p-4">
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
                {message.persona && (
                  <div className="mt-2 text-xs opacity-75">
                    {message.persona.name} • {message.persona.stakeholder_type}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div ref={messagesEndRef} />
      </ScrollArea>

      {/* Action buttons */}
      <div className="p-4 border-t">
        {simulationPhase === 'setup' && (
          <Button
            onClick={startPersonaGeneration}
            disabled={isGeneratingPersonas}
            className="w-full"
          >
            {isGeneratingPersonas ? (
              <>
                <Bot className="mr-2 h-4 w-4 animate-spin" />
                Generating Personas...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Start Simulation
              </>
            )}
          </Button>
        )}

        {simulationPhase === 'interviews' && !isSimulating && allPersonas.length > 0 && completedInterviews.length === 0 && (
          <Button
            onClick={startInterviewSimulation}
            className="w-full"
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Begin Interviews
          </Button>
        )}

        {simulationPhase === 'interviews' && isSimulating && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={pauseSimulation}
              className="flex-1"
            >
              <Pause className="mr-2 h-4 w-4" />
              Pause
            </Button>
            {currentPersonaIndex + 1 < allPersonas.length && (
              <Button
                variant="outline"
                onClick={skipToNextPersona}
                className="flex-1"
              >
                <SkipForward className="mr-2 h-4 w-4" />
                Skip to Next
              </Button>
            )}
          </div>
        )}

        {simulationPhase === 'interviews' && !isSimulating && completedInterviews.length > 0 && completedInterviews.length < allPersonas.length && (
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
              personas: allPersonas,
              interviews: completedInterviews
            })}>
              <FileText className="mr-2 h-4 w-4" />
              Analyze Results
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
