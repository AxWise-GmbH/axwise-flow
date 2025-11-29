'use client';

import React, { useState, useCallback } from 'react';
import {
  ProspectData,
  CallIntelligence,
  ChatMessage,
} from '@/lib/precall/types';
import { useGenerateIntelligence } from '@/lib/precall/hooks';
import {
  PrecallHeader,
  ProspectUpload,
  SalesWorkflowView,
  LiveChatCoach,
} from '@/components/precall';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { MessageCircle, FileUp, Bot } from 'lucide-react';
import { generateAnalysisId, setCurrentAnalysisId } from '@/lib/precall/personaImageCache';

/**
 * PRECALL - Pre-Call Intelligence Dashboard
 *
 * Main page for generating and viewing call intelligence from prospect data.
 */
export default function PrecallPage() {
  // State
  const [prospectData, setProspectData] = useState<ProspectData | null>(null);
  const [intelligence, setIntelligence] = useState<CallIntelligence | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [sidebarTab, setSidebarTab] = useState<'data' | 'coach'>('data');
  const [workflowStep, setWorkflowStep] = useState<string>('prep');

  // Mutations
  const generateMutation = useGenerateIntelligence();

  // Handlers
  const handleProspectDataChange = useCallback((data: ProspectData | null) => {
    setProspectData(data);
    // Clear intelligence when prospect data changes
    if (!data) {
      setIntelligence(null);
      setChatHistory([]);
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!prospectData) return;

    // Generate new analysis ID to invalidate cached persona images
    const analysisId = generateAnalysisId(JSON.stringify(prospectData));
    setCurrentAnalysisId(analysisId);

    const result = await generateMutation.mutateAsync(prospectData);
    if (result.success && result.intelligence) {
      setIntelligence(result.intelligence);
    }
  }, [prospectData, generateMutation]);

  const handleChatHistoryChange = useCallback((messages: ChatMessage[]) => {
    setChatHistory(messages);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-background">
      <PrecallHeader
        companyName={prospectData?.company_name as string | undefined}
        hasIntelligence={!!intelligence}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Tabbed: Prospect Data / Live Coach */}
        <div className="w-96 border-r flex flex-col overflow-hidden">
          <Tabs value={sidebarTab} onValueChange={(v) => setSidebarTab(v as 'data' | 'coach')} className="h-full flex flex-col">
            <TabsList className="w-full justify-start rounded-none border-b bg-muted/30 p-0 h-auto">
              <TabsTrigger
                value="data"
                className="flex-1 gap-2 py-3 rounded-none data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-b-primary"
              >
                <FileUp className="h-4 w-4" />
                Prospect Data
              </TabsTrigger>
              <TabsTrigger
                value="coach"
                className="flex-1 gap-2 py-3 rounded-none data-[state=active]:bg-background data-[state=active]:border-b-2 data-[state=active]:border-b-green-600"
              >
                <Bot className="h-4 w-4" />
                Live Coach
              </TabsTrigger>
            </TabsList>
            <TabsContent value="data" className="flex-1 m-0 overflow-auto">
              <ProspectUpload
                prospectData={prospectData}
                onProspectDataChange={handleProspectDataChange}
                onGenerate={handleGenerate}
                isGenerating={generateMutation.isPending}
              />
            </TabsContent>
            <TabsContent value="coach" className="flex-1 m-0 overflow-hidden">
              <LiveChatCoach
                prospectData={prospectData}
                intelligence={intelligence}
                chatHistory={chatHistory}
                onChatHistoryChange={handleChatHistoryChange}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Main Content - Sales Workflow View */}
        <div className="flex-1 overflow-hidden">
          {intelligence ? (
            <SalesWorkflowView
              intelligence={intelligence}
              localIntelligence={intelligence.localIntelligence}
              activeStep={workflowStep}
              onStepChange={setWorkflowStep}
              companyContext={prospectData?.company_name as string | undefined}
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <Card className="max-w-md">
                <CardContent className="pt-6 text-center">
                  <div className="h-16 w-16 rounded-full bg-muted mx-auto mb-4 flex items-center justify-center">
                    <MessageCircle className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">
                    No Intelligence Generated
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Upload or paste prospect data in the left panel, then click
                    "Generate Call Intelligence" to get started.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

