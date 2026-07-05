'use client';

import React, { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  FileText,
  Upload,
  CheckCircle2,
  Users,
  Target,
  MessageCircle,
  AlertCircle,
  X
} from 'lucide-react';
import { type DashboardQuestionResponse } from '@/lib/api/research-dashboard';

interface QuestionnaireSelectorProps {
  generatedQuestions: DashboardQuestionResponse | null;
  onQuestionnaireSelect: (questionnaire: DashboardQuestionResponse) => void;
}

export function QuestionnaireSelector({
  generatedQuestions,
  onQuestionnaireSelect
}: QuestionnaireSelectorProps) {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setUploadError(null);
    }
  };

  const handleFileUpload = async () => {
    if (!uploadedFile) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const fileContent = await uploadedFile.text();
      let parsedData;

      // Try to parse as JSON first
      try {
        parsedData = JSON.parse(fileContent);

        // Validate JSON structure
        if (!parsedData.questions || !parsedData.questions.primaryStakeholders) {
          throw new Error('Invalid JSON questionnaire format');
        }
      } catch (jsonError) {
        // If JSON parsing fails, use backend's PydanticAI parser for structured text
        console.log('JSON parsing failed, using backend parser for structured questionnaire');

        try {
          const response = await fetch('/api/research/simulation-bridge/parse-questionnaire', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              content: fileContent,
              config: {
                depth: "detailed",
                people_per_stakeholder: 5,
                response_style: "realistic",
                include_insights: true,
                temperature: 0.7
              }
            }),
          });

          if (!response.ok) {
            throw new Error(`Backend parsing failed: ${response.statusText}`);
          }

          const backendResult = await response.json();

          // Transform backend result to frontend format
          parsedData = {
            success: true,
            message: 'Questionnaire parsed successfully',
            questions: {
              primaryStakeholders: backendResult.questions_data.stakeholders.primary || [],
              secondaryStakeholders: backendResult.questions_data.stakeholders.secondary || []
            },
            metadata: {
              total_questions: backendResult.questions_data.stakeholders.primary?.reduce(
                (total: number, stakeholder: any) => total + (stakeholder.questions?.length || 0), 0
              ) || 0,
              generation_method: 'file_upload_parsed',
              conversation_routine: false,
              business_context: backendResult.business_context
            }
          };
        } catch (backendError) {
          console.error('Backend parsing also failed:', backendError);

          // Final fallback: basic text parsing
          console.log('Using fallback basic text parsing');
          const lines = fileContent.split('\n').filter(line => line.trim());
          parsedData = {
            success: true,
            message: 'Questions loaded from text file (basic parsing)',
            questions: {
              primaryStakeholders: [{
                id: 'primary_stakeholder',
                name: 'Primary Stakeholder',
                description: 'Stakeholder from uploaded file',
                questions: {
                  problemDiscovery: lines.slice(0, Math.ceil(lines.length / 2)),
                  solutionValidation: lines.slice(Math.ceil(lines.length / 2)),
                  followUp: []
                }
              }],
              secondaryStakeholders: []
            },
            metadata: {
              total_questions: lines.length,
              generation_method: 'file_upload_fallback',
              conversation_routine: false
            }
          };
        }
      }

      // Validate the structure
      if (!parsedData.questions || !parsedData.questions.primaryStakeholders) {
        throw new Error('Invalid questionnaire format');
      }

      onQuestionnaireSelect(parsedData);
      setUploadedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Failed to upload questionnaire:', error);
      setUploadError(error instanceof Error ? error.message : 'Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  };

  const clearFile = () => {
    setUploadedFile(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const renderQuestionPreview = (questions: any) => {
    if (!questions) return null;

    const totalQuestions = questions.primaryStakeholders?.reduce((total: number, stakeholder: any) => {
      return total +
        (stakeholder.questions?.problemDiscovery?.length || 0) +
        (stakeholder.questions?.solutionValidation?.length || 0) +
        (stakeholder.questions?.followUp?.length || 0);
    }, 0) || 0;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Current Questionnaire</span>
          <Badge variant="outline" className="text-green-600 border-green-200">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            {totalQuestions} Questions
          </Badge>
        </div>

        <ScrollArea className="h-32">
          <div className="space-y-2 pr-4">
            {questions.primaryStakeholders?.map((stakeholder: any, index: number) => (
              <div key={index} className="text-xs bg-muted/50 p-2 rounded">
                <div className="flex items-center gap-1 mb-1">
                  <Users className="h-3 w-3 text-blue-500" />
                  <span className="font-medium">{stakeholder.name}</span>
                  <Badge variant="outline" className="text-xs">Primary</Badge>
                </div>
                <div className="text-muted-foreground">
                  {(stakeholder.questions?.problemDiscovery?.length || 0) +
                   (stakeholder.questions?.solutionValidation?.length || 0) +
                   (stakeholder.questions?.followUp?.length || 0)} questions
                </div>
              </div>
            ))}
            {questions.secondaryStakeholders?.map((stakeholder: any, index: number) => (
              <div key={index} className="text-xs bg-muted/50 p-2 rounded">
                <div className="flex items-center gap-1 mb-1">
                  <Users className="h-3 w-3 text-purple-500" />
                  <span className="font-medium">{stakeholder.name}</span>
                  <Badge variant="outline" className="text-xs">Secondary</Badge>
                </div>
                <div className="text-muted-foreground">
                  {(stakeholder.questions?.problemDiscovery?.length || 0) +
                   (stakeholder.questions?.solutionValidation?.length || 0) +
                   (stakeholder.questions?.followUp?.length || 0)} questions
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Questionnaire Selection
        </CardTitle>
        <CardDescription>
          Select or upload a questionnaire for simulation
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Questionnaire */}
        {generatedQuestions?.questions && (
          <div className="space-y-3">
            {renderQuestionPreview(generatedQuestions.questions)}
            <div className="text-xs text-muted-foreground bg-green-50 border border-green-200 rounded p-2">
              <CheckCircle2 className="h-3 w-3 inline mr-1" />
              Questionnaire ready for simulation
            </div>
          </div>
        )}

        {/* No Questionnaire State */}
        {!generatedQuestions?.questions && (
          <div className="text-center py-6">
            <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-4">
              No questionnaire available. Generate questions in the Research Helper or upload a file.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.href = '/customer-research'}
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Generate Questions
            </Button>
          </div>
        )}

        {/* File Upload Section */}
        <div className="space-y-3 pt-4 border-t">
          <Label className="text-sm font-medium">Upload Questionnaire</Label>

          <div className="space-y-2">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".json,.txt"
              onChange={handleFileSelect}
              className="hidden"
            />

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1"
                disabled={isUploading}
              >
                <Upload className="mr-2 h-4 w-4" />
                {uploadedFile ? 'Change File' : 'Select File'}
              </Button>

              {uploadedFile && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFile}
                  disabled={isUploading}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {uploadedFile && (
              <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                <FileText className="h-3 w-3 inline mr-1" />
                {uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(1)} KB)
              </div>
            )}

            {uploadError && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                <AlertCircle className="h-3 w-3 inline mr-1" />
                {uploadError}
              </div>
            )}

            {uploadedFile && (
              <Button
                onClick={handleFileUpload}
                disabled={isUploading}
                className="w-full"
                size="sm"
              >
                {isUploading ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-3 w-3" />
                    Upload Questionnaire
                  </>
                )}
              </Button>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            Supports JSON and TXT files. TXT files will be parsed using AI to extract structured questionnaire data.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
