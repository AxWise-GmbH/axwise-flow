'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SimulationProgress } from '@/components/research/simulation/SimulationProgress';

export default function TestProgressPage() {
  const [showProgress, setShowProgress] = useState(false);
  const [simulationId, setSimulationId] = useState<string>('');

  // Use a recent simulation ID from the backend
  const testSimulationId = 'ee631164-1bf9-4944-a737-e23c95adb48f';

  const handleStartTest = () => {
    setSimulationId(testSimulationId);
    setShowProgress(true);
  };

  const handleCancel = () => {
    setShowProgress(false);
    setSimulationId('');
  };

  const handleComplete = (id: string) => {
    console.log('Simulation completed:', id);
    setShowProgress(false);
    setSimulationId('');
  };

  const mockConfig = {
    depth: "detailed" as const,
    people_per_stakeholder: 5,
    response_style: "realistic" as const,
    include_insights: false,
    temperature: 0.7
  };

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Test Enhanced Progress Component</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>This page tests the enhanced SimulationProgress component.</p>
          
          <div className="space-y-2">
            <p><strong>Test Simulation ID:</strong> {testSimulationId}</p>
            <p><strong>Status:</strong> {showProgress ? 'Progress Modal Open' : 'Ready to Test'}</p>
          </div>

          <Button 
            onClick={handleStartTest}
            disabled={showProgress}
          >
            Test Enhanced Progress Component
          </Button>

          {showProgress && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-700">
                Enhanced progress modal should be visible now. Check if it shows detailed progress information.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <SimulationProgress
        isVisible={showProgress}
        simulationId={simulationId || undefined}
        onCancel={handleCancel}
        onComplete={handleComplete}
        simulationConfig={mockConfig}
      />
    </div>
  );
}
