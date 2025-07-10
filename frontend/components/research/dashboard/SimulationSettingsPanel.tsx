'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Settings,
  Zap,
  Users,
  Clock,
  Brain,
  Target,
  AlertCircle,
  Play
} from 'lucide-react';

import { SimulationConfig, QuestionsData, getDefaultConfig } from '@/lib/api/simulation';

interface SimulationSettingsPanelProps {
  questionsData: QuestionsData;
  onStartSimulation: (config: SimulationConfig) => void;
  disabled?: boolean;
}

export function SimulationSettingsPanel({
  questionsData,
  onStartSimulation,
  disabled = false
}: SimulationSettingsPanelProps) {
  const [config, setConfig] = useState<SimulationConfig>({
    depth: 'detailed',
    people_per_stakeholder: 5,  // Changed from personas_per_stakeholder
    response_style: 'realistic',
    include_insights: false, // Always false - simulation only generates interview files
    temperature: 0.7
  });

  const [loading, setLoading] = useState(false);
  const [estimatedTime, setEstimatedTime] = useState<number>(0);

  // Load default config on mount
  useEffect(() => {
    const loadDefaults = async () => {
      try {
        const defaults = await getDefaultConfig();
        // Override include_insights to always be false
        setConfig({
          ...defaults.default_config,
          include_insights: false
        });
      } catch (error) {
        console.error('Failed to load default config:', error);
      }
    };

    loadDefaults();
  }, []);

  // Calculate estimated time
  useEffect(() => {
    const calculateTime = () => {
      const totalStakeholders = Object.values(questionsData.stakeholders).flat().length;
      const totalPeople = totalStakeholders * config.people_per_stakeholder;  // Changed from personas

      // Base time estimates (in minutes)
      const baseTimePerPerson = config.depth === 'quick' ? 1 : config.depth === 'detailed' ? 2 : 3;
      const baseTimePerInterview = config.depth === 'quick' ? 2 : config.depth === 'detailed' ? 4 : 6;

      const personTime = totalPeople * baseTimePerPerson;
      const interviewTime = totalPeople * baseTimePerInterview;
      const analysisTime = 3; // Time to analyze interviews and generate persona patterns
      const processingTime = 2; // Fixed processing overhead

      return personTime + interviewTime + analysisTime + processingTime;
    };

    setEstimatedTime(calculateTime());
  }, [config, questionsData]);

  const handleStartSimulation = async () => {
    setLoading(true);
    try {
      await onStartSimulation(config);
    } catch (error) {
      console.error('Failed to start simulation:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalStakeholders = Object.values(questionsData.stakeholders).flat().length;
  const totalPeople = totalStakeholders * config.people_per_stakeholder;  // Changed from personas

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Configure AI Interview Simulation
        </CardTitle>
        <CardDescription>
          Customize how AI personas will be generated and interviewed for your research.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Simulation Overview */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Simulation Overview</Label>
          <div className="grid grid-cols-3 gap-4 text-center bg-muted/50 p-3 rounded-lg">
            <div>
              <div className="text-xl font-bold text-blue-600">{totalStakeholders}</div>
              <div className="text-xs text-muted-foreground">Stakeholder Types</div>
            </div>
            <div>
              <div className="text-xl font-bold text-green-600">{totalPeople}</div>
              <div className="text-xs text-muted-foreground">People to Interview</div>
            </div>
            <div>
              <div className="text-xl font-bold text-purple-600">{estimatedTime}m</div>
              <div className="text-xs text-muted-foreground">Est. Time</div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Simulation Depth */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Simulation Depth</Label>
          <Select value={config.depth} onValueChange={(value: any) => setConfig({...config, depth: value})}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="quick">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  <div>
                    <div className="font-medium">Quick</div>
                    <div className="text-xs text-muted-foreground">Fast, basic responses</div>
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="detailed">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  <div>
                    <div className="font-medium">Detailed</div>
                    <div className="text-xs text-muted-foreground">Comprehensive responses</div>
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="comprehensive">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <div>
                    <div className="font-medium">Comprehensive</div>
                    <div className="text-xs text-muted-foreground">Deep, nuanced responses</div>
                  </div>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* People per Stakeholder */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">
            People per Stakeholder: {config.people_per_stakeholder}
          </Label>
          <Slider
            value={[config.people_per_stakeholder]}
            onValueChange={([value]) => setConfig({...config, people_per_stakeholder: value})}
            min={1}
            max={10}
            step={1}
            className="w-full"
          />
          <div className="text-xs text-muted-foreground">
            More people provide diverse perspectives but take longer to interview. Persona patterns will be generated from all interviews.
          </div>
        </div>

        {/* Response Style */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Response Style</Label>
          <Select value={config.response_style} onValueChange={(value: any) => setConfig({...config, response_style: value})}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="realistic">Realistic - Balanced, authentic responses</SelectItem>
              <SelectItem value="optimistic">Optimistic - Positive, enthusiastic responses</SelectItem>
              <SelectItem value="critical">Critical - Skeptical, challenging responses</SelectItem>
              <SelectItem value="mixed">Mixed - Varied response styles</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Temperature */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">
            Creativity Level: {config.temperature.toFixed(1)}
          </Label>
          <Slider
            value={[config.temperature]}
            onValueChange={([value]) => setConfig({...config, temperature: value})}
            min={0.0}
            max={1.0}
            step={0.1}
            className="w-full"
          />
          <div className="text-xs text-muted-foreground">
            Higher values create more creative and varied responses.
          </div>
        </div>

        <Separator />

        {/* Start Simulation Button */}
        <div className="space-y-3">
          {disabled && (
            <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
              <AlertCircle className="h-3 w-3 inline mr-1" />
              Select a questionnaire to enable simulation
            </div>
          )}

          <Button
            onClick={handleStartSimulation}
            disabled={loading || disabled}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Starting Simulation...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Start Simulation
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
