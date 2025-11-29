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
  IntelligenceLeftPanel,
  IntelligenceRightPanel,
} from '@/components/precall';
import { FloatingChatWidget, ActiveTabContext } from '@/components/precall/FloatingChatWidget';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Lightbulb, Users, MessageCircle } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<ActiveTabContext>('insights');

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

    const result = await generateMutation.mutateAsync(prospectData);
    if (result.success && result.intelligence) {
      setIntelligence(result.intelligence);
      // Switch to insights tab after generation
      setActiveTab('insights');
    }
  }, [prospectData, generateMutation]);

  const handleChatHistoryChange = useCallback((messages: ChatMessage[]) => {
    setChatHistory(messages);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-background">
      <PrecallHeader
        companyName={prospectData?.company_name}
        hasIntelligence={!!intelligence}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Prospect Upload Only */}
        <div className="w-96 border-r flex flex-col overflow-auto">
          <ProspectUpload
            prospectData={prospectData}
            onProspectDataChange={handleProspectDataChange}
            onGenerate={handleGenerate}
            isGenerating={generateMutation.isPending}
          />
        </div>

        {/* Main Content - Intelligence Display */}
        <div className="flex-1 overflow-hidden">
          {intelligence ? (
            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as ActiveTabContext)}
              className="h-full flex flex-col"
            >
              <div className="border-b px-4">
                <TabsList className="h-12">
                  <TabsTrigger value="insights" className="gap-2">
                    <Lightbulb className="h-4 w-4" />
                    Insights & Objections
                  </TabsTrigger>
                  <TabsTrigger value="personas" className="gap-2">
                    <Users className="h-4 w-4" />
                    Personas & Guide
                  </TabsTrigger>
                </TabsList>
              </div>
              <div className="flex-1 overflow-hidden">
                <TabsContent value="insights" className="h-full m-0">
                  <IntelligenceLeftPanel intelligence={intelligence} />
                </TabsContent>
                <TabsContent value="personas" className="h-full m-0">
                  <IntelligenceRightPanel
                    intelligence={intelligence}
                    companyContext={
                      // Extract company context from prospect data for image generation
                      prospectData?.company_name as string ||
                      prospectData?.industry as string ||
                      (prospectData?.dataset as Record<string, unknown>)?.scope_name as string ||
                      undefined
                    }
                  />
                </TabsContent>
              </div>
            </Tabs>
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

      {/* Floating Chat Widget - Context-Aware */}
      <FloatingChatWidget
        prospectData={prospectData}
        intelligence={intelligence}
        chatHistory={chatHistory}
        onChatHistoryChange={handleChatHistoryChange}
        activeTab={activeTab}
      />
    </div>
  );
}

