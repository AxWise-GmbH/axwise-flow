/**
 * Configuration modal for simulation settings.
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Zap, Users, Clock, Brain, Settings } from 'lucide-react';

import { SimulationConfig, QuestionsData, getDefaultConfig } from '@/lib/api/simulation';

interface SimulationConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartSimulation: (config: SimulationConfig) => void;
  questionsData: QuestionsData;
}

export function SimulationConfigModal({
  isOpen,
  onClose,
  onStartSimulation,
  questionsData
}: SimulationConfigModalProps) {
  const [config, setConfig] = useState<SimulationConfig>({
    depth: 'detailed',
    personas_per_stakeholder: 2,
    response_style: 'realistic',
    include_insights: true,
    temperature: 0.7
  });

  const [loading, setLoading] = useState(false);
  const [estimatedTime, setEstimatedTime] = useState<number>(0);

  // Load default config on mount
  useEffect(() => {
    const loadDefaults = async () => {
      try {
        const defaults = await getDefaultConfig();
        setConfig(defaults.default_config);
      } catch (error) {
        console.error('Failed to load default config:', error);
      }
    };

    if (isOpen) {
      loadDefaults();
    }
  }, [isOpen]);

  // Calculate estimated time
  useEffect(() => {
    const calculateTime = () => {
      const totalStakeholders = Object.values(questionsData.stakeholders).flat().length;
      const totalPersonas = totalStakeholders * config.personas_per_stakeholder;
      
      // Base time estimates (in minutes)
      const baseTimePerPersona = config.depth === 'quick' ? 1 : config.depth === 'detailed' ? 2 : 3;
      const baseTimePerInterview = config.depth === 'quick' ? 2 : config.depth === 'detailed' ? 4 : 6;
      
      const personaTime = totalPersonas * baseTimePerPersona;
      const interviewTime = totalPersonas * baseTimePerInterview;
      const processingTime = 2; // Fixed processing overhead
      
      return personaTime + interviewTime + processingTime;
    };

    setEstimatedTime(calculateTime());
  }, [config, questionsData]);

  const handleStartSimulation = async () => {
    setLoading(true);
    try {
      await onStartSimulation(config);
      onClose();
    } catch (error) {
      console.error('Failed to start simulation:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalStakeholders = Object.values(questionsData.stakeholders).flat().length;
  const totalPersonas = totalStakeholders * config.personas_per_stakeholder;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configure AI Interview Simulation
          </DialogTitle>
          <DialogDescription>
            Customize how AI personas will be generated and interviewed for your research.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Simulation Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-blue-600">{totalStakeholders}</div>
                  <div className="text-xs text-muted-foreground">Stakeholder Types</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{totalPersonas}</div>
                  <div className="text-xs text-muted-foreground">AI Personas</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-600">{estimatedTime}m</div>
                  <div className="text-xs text-muted-foreground">Est. Time</div>
                </div>
              </div>
            </CardContent>
          </Card>

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

          {/* Personas per Stakeholder */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Personas per Stakeholder: {config.personas_per_stakeholder}
            </Label>
            <Slider
              value={[config.personas_per_stakeholder]}
              onValueChange={([value]) => setConfig({...config, personas_per_stakeholder: value})}
              min={1}
              max={5}
              step={1}
              className="w-full"
            />
            <div className="text-xs text-muted-foreground">
              More personas provide diverse perspectives but take longer to generate.
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

          {/* Include Insights */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Generate Insights</Label>
              <div className="text-xs text-muted-foreground">
                Automatically analyze simulation results for patterns and recommendations.
              </div>
            </div>
            <Switch
              checked={config.include_insights}
              onCheckedChange={(checked) => setConfig({...config, include_insights: checked})}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleStartSimulation} disabled={loading}>
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Starting...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Start Simulation
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
