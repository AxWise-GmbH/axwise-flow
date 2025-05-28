'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar, Users, Target, CheckCircle, Clock, Trash2, Eye } from 'lucide-react';
import {
  getResearchSessions,
  getResearchSession,
  deleteResearchSession,
  LocalResearchStorage,
  type ResearchSession as APIResearchSession
} from '@/lib/api/research';

export default function ResearchDashboard() {
  const [sessions, setSessions] = useState<APIResearchSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<APIResearchSession | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      // Get sessions from local storage (for anonymous users)
      const data = await getResearchSessions(20);
      setSessions(data);
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const viewSession = async (sessionId: string) => {
    try {
      const data = await getResearchSession(sessionId);
      setSelectedSession(data);
    } catch (error) {
      console.error('Error fetching session details:', error);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this session? This action cannot be undone.')) return;

    try {
      await deleteResearchSession(sessionId);

      // Remove from local state
      setSessions(sessions.filter(s => s.session_id !== sessionId));

      // Clear selected session if it was the deleted one
      if (selectedSession && selectedSession.session_id === sessionId) {
        setSelectedSession(null);
      }

      console.log('Session deleted successfully');
    } catch (error) {
      console.error('Error deleting session:', error);
      alert(`Error deleting session: ${error}`);
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
      default: return <Clock className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-lg">Loading sessions...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-4 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Research Dashboard</h1>
          <p className="text-gray-600 mt-2">Manage and review customer research sessions</p>
          <Button
            onClick={() => window.location.href = '/customer-research'}
            className="mt-4"
          >
            Start New Research
          </Button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Sessions List */}
          <div className="xl:col-span-2">
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Research Sessions</CardTitle>
                <CardDescription>
                  {sessions.length} total sessions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {sessions.map((session) => (
                    <Card
                      key={session.session_id}
                      className="p-4 hover:bg-gray-50 transition-colors cursor-pointer border-l-4 border-l-blue-500"
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
                              <Badge variant="outline" className="text-xs bg-green-50 text-green-700">
                                Questions Generated
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(session.created_at).toLocaleDateString()}
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
                              handleDeleteSession(session.session_id);
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
                    <div className="text-center py-12 text-gray-500">
                      <div className="mb-4">
                        <Target className="h-12 w-12 mx-auto text-gray-300" />
                      </div>
                      <h3 className="text-lg font-medium mb-2">No research sessions found</h3>
                      <p className="text-sm mb-4">Start your first customer research session</p>
                      <Button onClick={() => window.location.href = '/customer-research'}>
                        Start New Research
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
                        onClick={() => window.location.href = `/customer-research?session=${selectedSession.session_id}`}
                      >
                        Continue Session
                      </Button>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <h5 className="text-sm font-medium text-gray-700 mb-1">Business Idea</h5>
                        <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                          {selectedSession.business_idea || 'Not specified'}
                        </p>
                      </div>

                      <div>
                        <h5 className="text-sm font-medium text-gray-700 mb-1">Target Customer</h5>
                        <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                          {selectedSession.target_customer || 'Not specified'}
                        </p>
                      </div>

                      <div>
                        <h5 className="text-sm font-medium text-gray-700 mb-1">Problem</h5>
                        <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                          {selectedSession.problem || 'Not specified'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{selectedSession.industry}</Badge>
                        <Badge className={getStatusColor(selectedSession.status)}>
                          {selectedSession.status}
                        </Badge>
                      </div>
                    </div>

                    <div>
                      <h5 className="text-sm font-medium text-gray-700 mb-2">
                        Messages ({selectedSession.messages?.length || 0})
                      </h5>
                      <ScrollArea className="h-40 border rounded p-3 bg-gray-50">
                        {selectedSession.messages && selectedSession.messages.length > 0 ? (
                          selectedSession.messages.map((msg: any, idx: number) => (
                            <div key={idx} className="mb-3 last:mb-0">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant={msg.role === 'user' ? 'default' : 'secondary'} className="text-xs">
                                  {msg.role === 'user' ? 'User' : 'AI'}
                                </Badge>
                                <span className="text-xs text-gray-500">
                                  {new Date(msg.timestamp).toLocaleTimeString()}
                                </span>
                              </div>
                              <p className="text-sm text-gray-700 pl-2 border-l-2 border-gray-200">
                                {msg.content}
                              </p>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-4 text-gray-500 text-sm">
                            No messages found
                          </div>
                        )}
                      </ScrollArea>
                    </div>

                    {selectedSession.research_questions && (
                      <div>
                        <h5 className="text-sm font-medium text-gray-700 mb-2">Generated Questions</h5>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between items-center p-2 bg-green-50 rounded">
                            <span className="font-medium text-green-800">Problem Discovery</span>
                            <Badge variant="outline" className="text-green-700">
                              {selectedSession.research_questions.problemDiscovery?.length || 0}
                            </Badge>
                          </div>
                          <div className="flex justify-between items-center p-2 bg-blue-50 rounded">
                            <span className="font-medium text-blue-800">Solution Validation</span>
                            <Badge variant="outline" className="text-blue-700">
                              {selectedSession.research_questions.solutionValidation?.length || 0}
                            </Badge>
                          </div>
                          <div className="flex justify-between items-center p-2 bg-purple-50 rounded">
                            <span className="font-medium text-purple-800">Follow-up</span>
                            <Badge variant="outline" className="text-purple-700">
                              {selectedSession.research_questions.followUp?.length || 0}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <Eye className="h-8 w-8 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm">Click on a session to view details</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
