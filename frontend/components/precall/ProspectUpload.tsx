'use client';

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileJson, Sparkles, AlertCircle, Loader2, CheckCircle } from 'lucide-react';
import { ProspectData } from '@/lib/precall/types';

interface ProspectUploadProps {
  onProspectDataChange: (data: ProspectData | null) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  prospectData: ProspectData | null;
}

/**
 * Component for uploading/pasting any JSON data for analysis.
 * Accepts flexible formats: AxPersona output, CRM data, meeting notes, etc.
 */
export function ProspectUpload({
  onProspectDataChange,
  onGenerate,
  isGenerating,
  prospectData,
}: ProspectUploadProps) {
  const [jsonInput, setJsonInput] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  const handleJsonChange = useCallback((value: string) => {
    setJsonInput(value);
    setParseError(null);

    if (!value.trim()) {
      onProspectDataChange(null);
      return;
    }

    try {
      const parsed = JSON.parse(value) as ProspectData;
      // Accept any valid JSON object
      if (typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length > 0) {
        onProspectDataChange(parsed);
      } else {
        setParseError('Please provide a non-empty JSON object');
        onProspectDataChange(null);
      }
    } catch {
      setParseError('Invalid JSON format');
      onProspectDataChange(null);
    }
  }, [onProspectDataChange]);

  const handleLoadExample = useCallback(() => {
    // Simple example that shows flexible format
    const example = {
      company_name: "TechCorp Industries",
      industry: "Manufacturing",
      description: "Mid-size manufacturing company looking to modernize supply chain",
      stakeholders: [
        { name: "Sarah Chen", role: "VP Operations", concerns: ["efficiency", "ROI"] },
        { name: "Mike Johnson", role: "IT Director", concerns: ["integration", "security"] }
      ],
      pain_points: ["20% productivity loss from current system", "Manual processes"],
      notes: "Second meeting - demo requested. Competitor also in consideration."
    };
    const jsonStr = JSON.stringify(example, null, 2);
    setJsonInput(jsonStr);
    setParseError(null);
    onProspectDataChange(example);
  }, [onProspectDataChange]);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      handleJsonChange(content);
    };
    reader.readAsText(file);
  }, [handleJsonChange]);

  const isValid = prospectData !== null && !parseError;

  return (
    <Card className="h-full flex flex-col border-0 rounded-none">
      <CardHeader className="pb-2 flex-shrink-0">
        <CardTitle className="text-base flex items-center gap-2">
          <FileJson className="h-4 w-4 text-blue-600" />
          Prospect Data
        </CardTitle>
        <CardDescription className="text-xs">
          Paste any JSON (AxPersona, CRM, meeting notes)
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-2 overflow-hidden p-3 pt-0">
        <div className="flex gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadExample}
            className="text-xs h-7"
          >
            <Sparkles className="h-3 w-3 mr-1" />
            Example
          </Button>
          <label>
            <input
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button variant="outline" size="sm" className="text-xs h-7" asChild>
              <span>
                <Upload className="h-3 w-3 mr-1" />
                Upload
              </span>
            </Button>
          </label>
        </div>

        <Textarea
          placeholder='Paste any JSON data here...'
          value={jsonInput}
          onChange={(e) => handleJsonChange(e.target.value)}
          className="flex-1 font-mono text-xs min-h-[100px] resize-none"
        />

        {parseError && (
          <Alert variant="destructive" className="py-2 flex-shrink-0">
            <AlertCircle className="h-3 w-3" />
            <AlertDescription className="text-xs">{parseError}</AlertDescription>
          </Alert>
        )}

        {isValid && (
          <div className="flex items-center gap-1 text-xs text-green-600 flex-shrink-0">
            <CheckCircle className="h-3 w-3" />
            <span>Valid JSON loaded</span>
          </div>
        )}

        <Button
          onClick={onGenerate}
          disabled={!isValid || isGenerating}
          className="w-full flex-shrink-0"
          size="sm"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Intelligence
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export default ProspectUpload;

