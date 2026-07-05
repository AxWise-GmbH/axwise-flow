'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Target,
  Users,
  Lightbulb,
  CheckCircle2,
  AlertCircle,
  Clock,
  MessageSquare,
  Edit3,
  Eye,
  Save
} from 'lucide-react';

interface ResearchContext {
  businessIdea?: string;
  targetCustomer?: string;
  problem?: string;
  stage?: string;
  questionsGenerated?: boolean;
  multiStakeholderConsidered?: boolean;
  multiStakeholderDetected?: boolean;
  detectedStakeholders?: {
    primary: string[];
    secondary: string[];
    industry?: string;
  };
}

type ContextMode = 'view' | 'chat' | 'manual';

interface ResearchContextDisplayProps {
  context: ResearchContext;
  completeness: number;
  onContextUpdate?: (updates: Partial<ResearchContext>) => void;
  onStartChat?: () => void;
}

export function ResearchContextDisplay({
  context,
  completeness,
  onContextUpdate,
  onStartChat
}: ResearchContextDisplayProps) {
  const [mode, setMode] = useState<ContextMode>('view');
  const [editedContext, setEditedContext] = useState<ResearchContext>(context);

  const handleSaveContext = () => {
    if (onContextUpdate) {
      onContextUpdate(editedContext);
    }
    setMode('view');
  };

  const handleStartChat = () => {
    if (onStartChat) {
      onStartChat();
    } else {
      // Default behavior - navigate to chat
      window.location.href = '/customer-research';
    }
  };

  const getStageColor = (stage?: string) => {
    switch (stage) {
      case 'initial': return 'bg-gray-100 text-gray-800';
      case 'business_idea': return 'bg-blue-100 text-blue-800';
      case 'target_customer': return 'bg-yellow-100 text-yellow-800';
      case 'problem_validation': return 'bg-orange-100 text-orange-800';
      case 'solution_validation': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getProgressColor = (completeness: number) => {
    if (completeness >= 100) return 'bg-green-500';
    if (completeness >= 66) return 'bg-yellow-500';
    if (completeness >= 33) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Research Context</CardTitle>
            <CardDescription>
              Current business research information
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={getStageColor(context.stage)}>
              {context.stage?.replace('_', ' ') || 'Not Started'}
            </Badge>
            {completeness >= 100 ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <Clock className="h-5 w-5 text-orange-500" />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Context Completeness</span>
            <span className="font-medium">{completeness}%</span>
          </div>
          <Progress
            value={completeness}
            className="h-2"
            style={{
              background: 'var(--muted)',
            }}
          />
        </div>

        {/* Mode Tabs */}
        <Tabs value={mode} onValueChange={(value) => setMode(value as ContextMode)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="view" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              View
            </TabsTrigger>
            <TabsTrigger value="chat" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <Edit3 className="h-4 w-4" />
              Manual
            </TabsTrigger>
          </TabsList>

          {/* View Mode - Current Context Display */}
          <TabsContent value="view" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Business Idea */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-medium">Business Idea</span>
              {context.businessIdea ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-orange-500" />
              )}
            </div>
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md min-h-[60px]">
              {context.businessIdea || 'Not defined yet'}
            </div>
          </div>

          {/* Target Customer */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">Target Customer</span>
              {context.targetCustomer ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-orange-500" />
              )}
            </div>
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md min-h-[60px]">
              {context.targetCustomer || 'Not defined yet'}
            </div>
          </div>

          {/* Problem */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-red-500" />
              <span className="text-sm font-medium">Problem</span>
              {context.problem ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-orange-500" />
              )}
            </div>
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md min-h-[60px]">
              {context.problem || 'Not defined yet'}
            </div>
          </div>
        </div>

        {/* Stakeholder Information */}
        {context.detectedStakeholders && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">Detected Stakeholders</span>
              <Badge variant="secondary">
                {context.detectedStakeholders.industry || 'General'}
              </Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {context.detectedStakeholders.primary?.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Primary</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {context.detectedStakeholders.primary.map((stakeholder, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {typeof stakeholder === 'string' ? stakeholder : stakeholder.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {context.detectedStakeholders.secondary?.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Secondary</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {context.detectedStakeholders.secondary.map((stakeholder, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {typeof stakeholder === 'string' ? stakeholder : stakeholder.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
          </TabsContent>

          {/* Chat Mode */}
          <TabsContent value="chat" className="space-y-4">
            <div className="text-center py-8">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Refine Context with AI Chat</h3>
              <p className="text-muted-foreground mb-4">
                Continue your conversation with the AI research assistant to improve and expand your business context.
              </p>
              <Button onClick={handleStartChat} className="bg-primary hover:bg-primary/90">
                <MessageSquare className="mr-2 h-4 w-4" />
                Start Research Chat
              </Button>
            </div>
          </TabsContent>

          {/* Manual Mode */}
          <TabsContent value="manual" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="business-idea">Business Idea</Label>
                <Textarea
                  id="business-idea"
                  placeholder="Describe your business idea in detail..."
                  value={editedContext.businessIdea || ''}
                  onChange={(e) => setEditedContext({...editedContext, businessIdea: e.target.value})}
                  className="min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="target-customer">Target Customer</Label>
                <Textarea
                  id="target-customer"
                  placeholder="Who are your target customers?"
                  value={editedContext.targetCustomer || ''}
                  onChange={(e) => setEditedContext({...editedContext, targetCustomer: e.target.value})}
                  className="min-h-[60px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="problem">Problem</Label>
                <Textarea
                  id="problem"
                  placeholder="What problem does your business solve?"
                  value={editedContext.problem || ''}
                  onChange={(e) => setEditedContext({...editedContext, problem: e.target.value})}
                  className="min-h-[60px]"
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSaveContext} className="flex-1">
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
                <Button variant="outline" onClick={() => setMode('view')}>
                  Cancel
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
