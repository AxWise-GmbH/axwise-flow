'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  History,
  MessageSquare,
  Calendar,
  CheckCircle,
  Clock,
  Trash2,
  Download,
  Eye
} from 'lucide-react';
import { getResearchSessions, deleteResearchSession, type ResearchSession } from '@/lib/api/research';

interface SessionManagerProps {
  onLoadSession?: (sessionId: string) => void;
  currentSessionId?: string;
}

export function SessionManager({ onLoadSession, currentSessionId }: SessionManagerProps) {
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const loadSessions = async () => {
    setIsLoading(true);
    try {
      const data = await getResearchSessions(10);
      setSessions(data);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen]);

  const deleteSession = async (sessionId: string) => {
    try {
      await deleteResearchSession(sessionId);
      setSessions(prev => prev.filter(s => s.session_id !== sessionId));
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  const getStatusBadge = (session: ResearchSession) => {
    if (session.status === 'completed') {
      return <Badge className="bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400">Completed</Badge>;
    } else if (session.questions_generated) {
      return <Badge className="bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400">Questions Ready</Badge>;
    } else {
      return <Badge variant="secondary">In Progress</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fixed top-4 left-4 z-50">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2"
          >
            <History className="h-4 w-4" />
            Sessions
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96" align="start">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Research Sessions</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadSessions}
                disabled={isLoading}
              >
                {isLoading ? <Clock className="h-4 w-4 animate-spin" /> : 'Refresh'}
              </Button>
            </div>

            {sessions.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No research sessions yet</p>
                <p className="text-xs">Start a conversation to create your first session</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {sessions.map((session) => (
                  <Card
                    key={session.session_id}
                    className={`p-3 cursor-pointer transition-colors ${
                      session.session_id === currentSessionId
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => {
                      if (onLoadSession && session.session_id !== currentSessionId) {
                        onLoadSession(session.session_id);
                        setIsOpen(false);
                      }
                    }}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {session.business_idea || 'Untitled Session'}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            {getStatusBadge(session)}
                            <span className="text-xs text-muted-foreground">
                              {session.message_count} messages
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-1 ml-2">
                          {session.session_id === currentSessionId && (
                            <Badge variant="outline" className="text-xs border-primary text-primary">
                              Current
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm('Delete this session?')) {
                                deleteSession(session.session_id);
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(session.created_at)}
                        </div>
                        <span className="capitalize">{session.stage}</span>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            <div className="border-t pt-3">
              <div className="text-xs text-muted-foreground space-y-1">
                <p>💡 <strong>Tip:</strong> Sessions are automatically saved as you chat</p>
                <p>🔄 Click a session to continue where you left off</p>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
