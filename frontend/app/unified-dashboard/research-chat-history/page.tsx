'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

// Client-side timestamp component to avoid hydration errors
function ClientTimestamp({ timestamp, format = 'localeString' }: { timestamp: string; format?: 'localeString' | 'localeTimeString' | 'localeDateString' }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <span>Loading...</span>;
  }

  const date = new Date(timestamp);

  // Debug: Check for invalid dates only
  const isInvalid = isNaN(date.getTime());

  if (isInvalid) {
    console.warn('Invalid timestamp detected:', timestamp);
    return <span className="text-red-500">Invalid date</span>;
  }

  // Log the actual date for debugging
  console.log('Displaying timestamp:', timestamp, '→', date.toLocaleDateString('en-GB'));

  if (format === 'localeTimeString') {
    return <span>{date.toLocaleTimeString('en-GB')}</span>;
  } else if (format === 'localeDateString') {
    // Use DD/MM/YYYY format as per user preferences
    return <span>{date.toLocaleDateString('en-GB')}</span>;
  } else {
    // Use DD/MM/YYYY format for full datetime
    return <span>{date.toLocaleString('en-GB')}</span>;
  }
}
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Clock,
  Target,
  Users,
  CheckCircle,
  MessageSquare,
  Calendar,
  Trash2,
  Eye,
  ArrowRight,
  Plus,
  FileText,
  Download
} from 'lucide-react';
import { useToast } from '@/components/providers/toast-provider';
import { getResearchSessions, deleteResearchSession, type ResearchSession } from '@/lib/api/research';

export default function ResearchChatHistory() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { showToast } = useToast();
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [allSessions, setAllSessions] = useState<ResearchSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ResearchSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'sessions');
  const [showOnlyWithQuestionnaires, setShowOnlyWithQuestionnaires] = useState(true);

  // Function to fix only truly corrupted (invalid) timestamps in localStorage
  const fixCorruptedTimestamps = () => {
    try {
      const stored = localStorage.getItem('axwise_research_sessions');
      if (!stored) return;

      const sessions = JSON.parse(stored);
      let hasChanges = false;
      const now = new Date().toISOString();

      const fixedSessions = sessions.map((session: any) => {
        const createdDate = new Date(session.created_at);
        const updatedDate = new Date(session.updated_at);

        // Only fix truly invalid dates (NaN), not past or future dates
        if (isNaN(createdDate.getTime())) {
          console.warn(`Fixing invalid created_at for session ${session.session_id}:`, session.created_at);
          session.created_at = now;
          hasChanges = true;
        }

        if (isNaN(updatedDate.getTime())) {
          console.warn(`Fixing invalid updated_at for session ${session.session_id}:`, session.updated_at);
          session.updated_at = now;
          hasChanges = true;
        }

        return session;
      });

      if (hasChanges) {
        localStorage.setItem('axwise_research_sessions', JSON.stringify(fixedSessions));
        console.log('✅ Fixed corrupted timestamps in localStorage');
        showToast('Fixed corrupted session timestamps', { variant: 'success' });
      } else {
        console.log('ℹ️ No corrupted timestamps found');
      }
    } catch (error) {
      console.error('Error fixing corrupted timestamps:', error);
    }
  };

  // Function to toggle between showing all sessions vs only those with questionnaires
  const toggleSessionFilter = () => {
    const newValue = !showOnlyWithQuestionnaires;
    setShowOnlyWithQuestionnaires(newValue);

    if (newValue) {
      // Show only sessions with questionnaires
      const sessionsWithQuestionnaires = allSessions.filter(session => {
        if (session.questions_generated) return true;

        if (session.messages && session.messages.length > 0) {
          const hasQuestionnaireMessage = session.messages.some(msg =>
            msg.metadata?.comprehensiveQuestions ||
            msg.metadata?.questionnaire ||
            (msg.role === 'assistant' && msg.content && msg.content.includes('questionnaire'))
          );
          if (hasQuestionnaireMessage) return true;
        }

        const hasBusinessIdea = session.business_idea && session.business_idea.trim().length > 0;
        const hasMessages = session.messages && session.messages.length > 1;
        return hasBusinessIdea && hasMessages;
      });
      setSessions(sessionsWithQuestionnaires);
    } else {
      // Show all sessions
      setSessions(allSessions);
    }
  };

  useEffect(() => {
    // Fix any corrupted timestamps before loading sessions
    fixCorruptedTimestamps();
    loadSessions();
  }, []);

  // Calculate questionnaire stats when sessions change
  useEffect(() => {
    const calculateStats = async () => {
      const stats: Record<string, { questions: number; stakeholders: number }> = {};

      for (const session of sessions) {
        if (session.questions_generated) {
          // For local sessions, we need to get the full session data with messages
          if (session.session_id.startsWith('local_')) {
            try {
              // Import LocalResearchStorage dynamically
              const { LocalResearchStorage } = await import('@/lib/api/research');
              const fullSession = LocalResearchStorage.getSession(session.session_id);
              if (fullSession) {
                stats[session.session_id] = calculateQuestionnaireStats(fullSession);
              } else {
                stats[session.session_id] = { questions: 0, stakeholders: 0 };
              }
            } catch (error) {
              console.error(`Error loading local session ${session.session_id}:`, error);
              stats[session.session_id] = { questions: 0, stakeholders: 0 };
            }
          } else {
            // For backend sessions, use the session data we already have
            stats[session.session_id] = calculateQuestionnaireStats(session);
          }
        }
      }

      setQuestionnaireStats(stats);
    };

    if (sessions.length > 0) {
      calculateStats();
    }
  }, [sessions]);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const data = await getResearchSessions(50);

      // Filter sessions to only show those with generated questionnaires
      const sessionsWithQuestionnaires = data.filter(session => {
        // Check if session has questions_generated flag set to true
        if (session.questions_generated) {
          return true;
        }

        // Also check if session has questionnaire messages
        if (session.messages && session.messages.length > 0) {
          const hasQuestionnaireMessage = session.messages.some(msg =>
            msg.metadata?.comprehensiveQuestions ||
            msg.metadata?.questionnaire ||
            (msg.role === 'assistant' && msg.content && msg.content.includes('questionnaire'))
          );
          if (hasQuestionnaireMessage) {
            return true;
          }
        }

        // Exclude empty sessions without business ideas or meaningful content
        const hasBusinessIdea = session.business_idea && session.business_idea.trim().length > 0;
        const hasMessages = session.messages && session.messages.length > 1; // More than just initial message

        return hasBusinessIdea && hasMessages;
      });

      console.log(`📊 Filtered sessions: ${data.length} total → ${sessionsWithQuestionnaires.length} with questionnaires`);

      // Store both filtered and unfiltered data
      setAllSessions(data);
      setSessions(showOnlyWithQuestionnaires ? sessionsWithQuestionnaires : data);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const viewSession = (sessionId: string) => {
    const session = sessions.find(s => s.session_id === sessionId);
    setSelectedSession(session || null);
  };

  const deleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this research chat session?')) {
      return;
    }

    try {
      await deleteResearchSession(sessionId);
      setSessions(sessions.filter(s => s.session_id !== sessionId));

      if (selectedSession && selectedSession.session_id === sessionId) {
        setSelectedSession(null);
      }

      console.log('Session deleted successfully');
    } catch (error) {
      console.error('Error deleting session:', error);
      alert(`Error deleting session: ${error}`);
    }
  };

  // Helper function to generate comprehensive questionnaire text
  const generateComprehensiveQuestionnaireText = (questionnaire: any, title: string): string => {
    let content = `# Research Questionnaire: ${title}\n\n`;
    content += `Generated on: ${new Date().toLocaleDateString('en-GB')}\n\n`;

    if (questionnaire.timeEstimate) {
      content += `## Time Estimate\n`;
      content += `Total Questions: ${questionnaire.timeEstimate.totalQuestions || 'N/A'}\n`;
      content += `Estimated Duration: ${questionnaire.timeEstimate.estimatedMinutes || 'N/A'}\n\n`;
    }

    // Primary Stakeholders
    if (questionnaire.primaryStakeholders && questionnaire.primaryStakeholders.length > 0) {
      content += `## Primary Stakeholders\n\n`;
      questionnaire.primaryStakeholders.forEach((stakeholder: any, index: number) => {
        content += `### ${index + 1}. ${stakeholder.name}\n`;
        if (stakeholder.description) {
          content += `**Description:** ${stakeholder.description}\n\n`;
        }

        if (stakeholder.questions) {
          if (stakeholder.questions.problemDiscovery && stakeholder.questions.problemDiscovery.length > 0) {
            content += `**Problem Discovery Questions:**\n`;
            stakeholder.questions.problemDiscovery.forEach((q: string, qIndex: number) => {
              content += `${qIndex + 1}. ${q}\n`;
            });
            content += `\n`;
          }

          if (stakeholder.questions.solutionValidation && stakeholder.questions.solutionValidation.length > 0) {
            content += `**Solution Validation Questions:**\n`;
            stakeholder.questions.solutionValidation.forEach((q: string, qIndex: number) => {
              content += `${qIndex + 1}. ${q}\n`;
            });
            content += `\n`;
          }

          if (stakeholder.questions.followUp && stakeholder.questions.followUp.length > 0) {
            content += `**Follow-up Questions:**\n`;
            stakeholder.questions.followUp.forEach((q: string, qIndex: number) => {
              content += `${qIndex + 1}. ${q}\n`;
            });
            content += `\n`;
          }
        }
        content += `---\n\n`;
      });
    }

    // Secondary Stakeholders
    if (questionnaire.secondaryStakeholders && questionnaire.secondaryStakeholders.length > 0) {
      content += `## Secondary Stakeholders\n\n`;
      questionnaire.secondaryStakeholders.forEach((stakeholder: any, index: number) => {
        content += `### ${index + 1}. ${stakeholder.name}\n`;
        if (stakeholder.description) {
          content += `**Description:** ${stakeholder.description}\n\n`;
        }

        if (stakeholder.questions) {
          if (stakeholder.questions.problemDiscovery && stakeholder.questions.problemDiscovery.length > 0) {
            content += `**Problem Discovery Questions:**\n`;
            stakeholder.questions.problemDiscovery.forEach((q: string, qIndex: number) => {
              content += `${qIndex + 1}. ${q}\n`;
            });
            content += `\n`;
          }

          if (stakeholder.questions.solutionValidation && stakeholder.questions.solutionValidation.length > 0) {
            content += `**Solution Validation Questions:**\n`;
            stakeholder.questions.solutionValidation.forEach((q: string, qIndex: number) => {
              content += `${qIndex + 1}. ${q}\n`;
            });
            content += `\n`;
          }

          if (stakeholder.questions.followUp && stakeholder.questions.followUp.length > 0) {
            content += `**Follow-up Questions:**\n`;
            stakeholder.questions.followUp.forEach((q: string, qIndex: number) => {
              content += `${qIndex + 1}. ${q}\n`;
            });
            content += `\n`;
          }
        }
        content += `---\n\n`;
      });
    }

    content += `\nGenerated by AxWise Customer Research Assistant\nReady for simulation bridge and interview analysis`;
    return content;
  };

  // State to store questionnaire stats for each session
  const [questionnaireStats, setQuestionnaireStats] = useState<Record<string, { questions: number; stakeholders: number }>>({});

  // Helper function to calculate questionnaire stats from session data
  const calculateQuestionnaireStats = (session: ResearchSession) => {
    if (!session?.messages) return { questions: 0, stakeholders: 0 };

    try {
      // Use the same detection logic as other components
      const questionnaireMessages = session.messages.filter((msg: any) =>
        msg.metadata?.comprehensiveQuestions ||
        (msg.content === 'COMPREHENSIVE_QUESTIONS_COMPONENT' && msg.metadata?.comprehensiveQuestions)
      );

      if (questionnaireMessages.length === 0) {
        return { questions: 0, stakeholders: 0 };
      }

      // Get the most recent questionnaire message
      const questionnaireMessage = questionnaireMessages.sort((a: any, b: any) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )[0];

      if (!questionnaireMessage?.metadata?.comprehensiveQuestions) {
        return { questions: 0, stakeholders: 0 };
      }

      const questionnaire = questionnaireMessage.metadata.comprehensiveQuestions;
      const primaryStakeholders = questionnaire.primaryStakeholders || [];
      const secondaryStakeholders = questionnaire.secondaryStakeholders || [];
      const allStakeholders = [...primaryStakeholders, ...secondaryStakeholders];

      // Count total questions across all categories
      const totalQuestions = allStakeholders.reduce((total: number, stakeholder: any) => {
        const questions = stakeholder.questions || {};
        return total +
          (questions.problemDiscovery?.length || 0) +
          (questions.solutionValidation?.length || 0) +
          (questions.followUp?.length || 0);
      }, 0);

      return {
        questions: totalQuestions,
        stakeholders: allStakeholders.length
      };
    } catch (error) {
      console.error('Error calculating questionnaire stats:', error);
      return { questions: 0, stakeholders: 0 };
    }
  };

  // Helper function to get questionnaire stats (now uses pre-calculated state)
  const getQuestionnaireStats = (sessionId: string) => {
    return questionnaireStats[sessionId] || { questions: 0, stakeholders: 0 };
  };

  // Handle downloading questionnaire
  const handleDownloadQuestionnaire = async (sessionId: string, title: string) => {
    try {
      console.log('📥 Downloading questionnaire for session:', sessionId);

      let questionnaire = null;

      if (sessionId.startsWith('local_')) {
        // Handle local session
        if (typeof window !== 'undefined') {
          const { LocalResearchStorage } = await import('@/lib/api/research');
          const session = LocalResearchStorage.getSession(sessionId);

          if (session?.messages) {
            // Use the same detection logic as other components
            const questionnaireMessage = session.messages.find((msg: any) =>
              msg.metadata?.comprehensiveQuestions ||
              (msg.content === 'COMPREHENSIVE_QUESTIONS_COMPONENT' && msg.metadata?.comprehensiveQuestions)
            );

            if (questionnaireMessage?.metadata?.comprehensiveQuestions) {
              questionnaire = questionnaireMessage.metadata.comprehensiveQuestions;
              console.log('📋 Local questionnaire data for download:', questionnaire);
            }
          }
        }
      } else {
        // Handle backend session
        const response = await fetch(`/api/research/sessions/${sessionId}/questionnaire`);

        if (response.ok) {
          const data = await response.json();
          questionnaire = data.questionnaire;
          console.log('📋 Backend questionnaire data for download:', questionnaire);
        } else {
          const errorText = await response.text();
          console.error('❌ Download failed:', response.status, errorText);
          showToast(`Failed to download questionnaire: ${response.status}`, { variant: 'error' });
          return;
        }
      }

      if (questionnaire) {
        // V3 Enhanced format only - validate structure
        if (!questionnaire.primaryStakeholders && !questionnaire.secondaryStakeholders) {
          throw new Error('Invalid questionnaire format - V3 Enhanced format required');
        }

        // Generate V3 Enhanced format
        const textContent = generateComprehensiveQuestionnaireText(questionnaire, title);

        // Create and download the file
        const blob = new Blob([textContent], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `questionnaire-${title.replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showToast('Questionnaire downloaded successfully', { variant: 'success' });
      } else {
        showToast('No questionnaire data found for this session', { variant: 'error' });
      }
    } catch (error) {
      console.error('❌ Download error:', error);
      showToast('Failed to download questionnaire', { variant: 'error' });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'active': return 'bg-blue-100 text-blue-800';
      case 'abandoned': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStageIcon = (stage: string) => {
    switch (stage) {
      case 'initial': return <Clock className="h-4 w-4" />;
      case 'business_idea': return <Target className="h-4 w-4" />;
      case 'target_customer': return <Users className="h-4 w-4" />;
      case 'validation': return <CheckCircle className="h-4 w-4" />;
      case 'conversation': return <MessageSquare className="h-4 w-4" />;
      case 'completed': return <CheckCircle className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading research chat history...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Research History</h1>
        <p className="text-muted-foreground mt-2">
          {showOnlyWithQuestionnaires
            ? 'Showing research sessions that have generated questionnaires'
            : 'View and manage all your research chat conversations and generated questionnaires'
          }
        </p>

        {/* Filter Toggle */}
        <div className="flex items-center gap-4 mt-4 p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="questionnaire-filter"
              checked={showOnlyWithQuestionnaires}
              onChange={toggleSessionFilter}
              className="rounded border-gray-300"
            />
            <label htmlFor="questionnaire-filter" className="text-sm font-medium">
              Show only sessions with questionnaires
            </label>
          </div>
          <div className="text-xs text-muted-foreground">
            Showing {sessions.length} of {allSessions.length} sessions
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <Button
            onClick={() => {
              localStorage.removeItem('current_research_session');
              window.location.href = '/unified-dashboard/research-chat';
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Start New Research Chat
          </Button>
          <Button
            variant="outline"
            onClick={() => window.location.href = '/unified-dashboard/research'}
          >
            <ArrowRight className="mr-2 h-4 w-4" />
            Go to Interview Simulation
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              fixCorruptedTimestamps();
              loadSessions();
            }}
            className="text-amber-600 hover:text-amber-700"
          >
            <Calendar className="mr-2 h-4 w-4" />
            Fix Timestamps
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="sessions" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Chat Sessions
          </TabsTrigger>
          <TabsTrigger value="questionnaires" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Questionnaires
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sessions" className="mt-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6">
        {/* Sessions List */}
        <div className="xl:col-span-2">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Research Chat Sessions</CardTitle>
              <CardDescription>
                {sessions.length} total sessions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {sessions.map((session) => (
                  <Card
                    key={session.session_id}
                    className="p-3 lg:p-4 hover:bg-muted/50 transition-colors cursor-pointer border-l-4 border-l-primary"
                    onClick={() => viewSession(session.session_id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          {getStageIcon(session.stage)}
                          <h3 className="font-medium truncate">
                            {session.business_idea || 'Untitled Session'}
                          </h3>
                        </div>

                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            {session.industry}
                          </Badge>
                          <Badge className={`text-xs ${getStatusColor(session.status)}`}>
                            {session.status}
                          </Badge>
                          {session.questions_generated && (
                            <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
                              Questions Generated
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <ClientTimestamp timestamp={session.created_at} format="localeDateString" />
                          </span>
                          <span>{session.message_count || session.messages?.length || 0} messages</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            viewSession(session.session_id);
                          }}
                          className="h-8 w-8 p-0"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(session.session_id);
                          }}
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
                {sessions.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg font-medium">No research chat sessions yet</p>
                    <p className="text-sm">Start a research chat to create your first session</p>
                    <Button
                      className="mt-4"
                      onClick={() => window.location.href = '/unified-dashboard/research-chat'}
                    >
                      Start Research Chat
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Session Details */}
        <div>
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle>Session Details</CardTitle>
              <CardDescription>
                {selectedSession ? 'Session information' : 'Click a session to view details'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedSession ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Session Info</h4>
                    <Button
                      size="sm"
                      onClick={() => {
                        // Navigate to research chat with session ID as URL parameter
                        window.location.href = `/unified-dashboard/research-chat?session=${selectedSession.session_id}`;
                      }}
                    >
                      Continue Session
                    </Button>
                  </div>

                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="font-medium">Business Idea:</span>
                      <p className="text-muted-foreground mt-1">{selectedSession.business_idea || 'Not specified'}</p>
                    </div>

                    {selectedSession.target_customer && (
                      <div>
                        <span className="font-medium">Target Customer:</span>
                        <p className="text-muted-foreground mt-1">{selectedSession.target_customer}</p>
                      </div>
                    )}

                    {selectedSession.problem && (
                      <div>
                        <span className="font-medium">Problem:</span>
                        <p className="text-muted-foreground mt-1">{selectedSession.problem}</p>
                      </div>
                    )}

                    <div>
                      <span className="font-medium">Status:</span>
                      <Badge className={`ml-2 text-xs ${getStatusColor(selectedSession.status)}`}>
                        {selectedSession.status}
                      </Badge>
                    </div>

                    <div>
                      <span className="font-medium">Created:</span>
                      <p className="text-muted-foreground mt-1">
                        <ClientTimestamp timestamp={selectedSession.created_at} />
                      </p>
                    </div>

                    <div>
                      <span className="font-medium">Messages:</span>
                      <p className="text-muted-foreground mt-1">
                        {selectedSession.message_count || selectedSession.messages?.length || 0} messages
                      </p>
                    </div>
                  </div>

                  {/* Questionnaire Actions */}
                  {selectedSession.questions_generated && (
                    <div className="mt-6">
                      <h5 className="font-medium mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Generated Questionnaire
                      </h5>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/unified-dashboard/questionnaire/${selectedSession.session_id}`)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadQuestionnaire(selectedSession.session_id, selectedSession.business_idea || 'questionnaire')}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => router.push(`/unified-dashboard/research?session=${selectedSession.session_id}`)}
                        >
                          <ArrowRight className="h-4 w-4 mr-2" />
                          Simulate
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Message History */}
                  {selectedSession.messages && selectedSession.messages.length > 0 && (
                    <div className="mt-6">
                      <h5 className="font-medium mb-3">
                        Messages ({selectedSession.messages?.length || 0})
                      </h5>
                      <ScrollArea className="h-40 border rounded p-3 bg-muted">
                        {selectedSession.messages && selectedSession.messages.length > 0 ? (
                          selectedSession.messages.map((msg: any, idx: number) => (
                            <div key={idx} className="mb-3 last:mb-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant={msg.role === 'user' ? 'default' : 'secondary'} className="text-xs">
                                  {msg.role}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  <ClientTimestamp timestamp={msg.timestamp} format="localeTimeString" />
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {msg.content.length > 100 ? `${msg.content.substring(0, 100)}...` : msg.content}
                              </p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">No messages available</p>
                        )}
                      </ScrollArea>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Eye className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-sm">Click on a session to view details</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
          </div>
        </TabsContent>

        <TabsContent value="questionnaires" className="mt-6">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6">
            {/* Questionnaires List */}
            <div className="xl:col-span-2">
              <Card className="h-fit">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Generated Questionnaires
                  </CardTitle>
                  <CardDescription>
                    {sessions.filter(s => s.questions_generated).length} questionnaires available
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-[600px] overflow-y-auto">
                    {sessions.filter(s => s.questions_generated).map((session) => (
                      <Card
                        key={session.session_id}
                        className="p-3 lg:p-4 hover:bg-muted/50 transition-colors border-l-4 border-l-green-500"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText className="h-4 w-4 text-green-600" />
                              <h3 className="font-medium truncate">
                                {session.business_idea || 'Untitled Questionnaire'}
                              </h3>
                            </div>

                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <Badge variant="outline" className="text-xs">
                                {session.industry}
                              </Badge>
                              <Badge className="text-xs bg-green-100 text-green-800">
                                Questionnaire Available
                              </Badge>
                              {(() => {
                                const stats = getQuestionnaireStats(session.session_id);
                                return (
                                  <>
                                    <Badge variant="outline" className="text-xs">
                                      {stats.questions} questions
                                    </Badge>
                                    <Badge variant="outline" className="text-xs">
                                      {stats.stakeholders} stakeholders
                                    </Badge>
                                  </>
                                );
                              })()}
                            </div>

                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                <ClientTimestamp timestamp={session.created_at} format="localeDateString" />
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 ml-4">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => router.push(`/unified-dashboard/questionnaire/${session.session_id}`)}
                              className="h-8 px-3"
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View Details
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDownloadQuestionnaire(session.session_id, session.business_idea || 'questionnaire')}
                              className="h-8 px-3"
                            >
                              <Download className="h-4 w-4 mr-1" />
                              Download
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.location.href = `/unified-dashboard/research?session=${session.session_id}`}
                              className="h-8 px-3"
                            >
                              <ArrowRight className="h-4 w-4 mr-1" />
                              Simulate
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                    {sessions.filter(s => s.questions_generated).length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-lg font-medium">No questionnaires generated yet</p>
                        <p className="text-sm">Complete a research chat session to generate questionnaires</p>
                        <Button
                          className="mt-4"
                          onClick={() => window.location.href = '/unified-dashboard/research-chat'}
                        >
                          Start Research Chat
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Questionnaire Details */}
            <div>
              <Card className="sticky top-4">
                <CardHeader>
                  <CardTitle>Questionnaire Info</CardTitle>
                  <CardDescription>
                    Download questionnaires or use them for interview simulation
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
                    <p className="text-sm">Click download to get questionnaire files</p>
                    <p className="text-xs mt-2">Or use "Simulate" to run interview simulations</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
