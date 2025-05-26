'use client';

import React, { useState } from 'react';
import { PhaseTimeline } from './PhaseTimeline';
import { PhaseDetail } from './PhaseDetail';
import { roadmapData } from '@/lib/roadmapData';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Calendar, Target } from 'lucide-react';
import { trackRoadmapInteraction, trackButtonClick, ButtonLocation } from '@/lib/analytics';

export const RoadmapComponent: React.FC = () => {
  const [activePhase, setActivePhase] = useState(0);
  const [view, setView] = useState<'timeline' | 'detail'>('timeline');

  const handlePhaseSelect = (phaseIndex: number) => {
    setActivePhase(phaseIndex);
    setView('detail');
  };

  const handleBackToTimeline = () => {
    setView('timeline');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-foreground">Development Phases</h2>
        <div className="flex gap-2">
          <Button
            variant={view === 'timeline' ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setView('timeline');
              trackRoadmapInteraction('toggle_view', undefined, 'timeline');
            }}
          >
            Timeline View
          </Button>
          <Button
            variant={view === 'detail' ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              if (view === 'timeline') {
                handlePhaseSelect(0);
                trackRoadmapInteraction('toggle_view', 1, 'detail');
              }
            }}
            disabled={view === 'detail'}
          >
            Detail View
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-xl border overflow-hidden">
        {view === 'timeline' ? (
          <PhaseTimeline
            phases={roadmapData.phases}
            onPhaseSelect={handlePhaseSelect}
          />
        ) : (
          <PhaseDetail
            phase={roadmapData.phases[activePhase]}
            phaseIndex={activePhase}
            onBack={handleBackToTimeline}
            onNavigate={(direction: 'prev' | 'next') => {
              if (direction === 'next' && activePhase < roadmapData.phases.length - 1) {
                setActivePhase(activePhase + 1);
              } else if (direction === 'prev' && activePhase > 0) {
                setActivePhase(activePhase - 1);
              }
            }}
            hasNext={activePhase < roadmapData.phases.length - 1}
            hasPrev={activePhase > 0}
          />
        )}
      </div>

      {/* Navigation and Progress Section */}
      <div className="bg-card rounded-xl border p-6 space-y-4">
        {/* Progress Indicator */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-primary" />
            <div>
              <h3 className="font-semibold text-foreground">Roadmap Progress</h3>
              <p className="text-sm text-muted-foreground">
                {view === 'timeline'
                  ? `Viewing all ${roadmapData.phases.length} development phases`
                  : `Phase ${activePhase + 1} of ${roadmapData.phases.length}: ${roadmapData.phases[activePhase].title}`
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              <Target className="w-3 h-3 mr-1" />
              {view === 'timeline'
                ? `${roadmapData.phases.length} Phases Total`
                : `${roadmapData.phases[activePhase].timeframe}`
              }
            </Badge>
          </div>
        </div>

        {/* Phase Navigation (only show in detail view) */}
        {view === 'detail' && (
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (activePhase > 0) {
                  setActivePhase(activePhase - 1);
                  trackRoadmapInteraction('navigate', activePhase, 'detail');
                }
              }}
              disabled={activePhase === 0}
              className="flex items-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous Phase
            </Button>

            <div className="flex items-center gap-2">
              {roadmapData.phases.map((_, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    index === activePhase
                      ? 'bg-primary'
                      : index < activePhase
                        ? 'bg-primary/50'
                        : 'bg-muted'
                  }`}
                />
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (activePhase < roadmapData.phases.length - 1) {
                  setActivePhase(activePhase + 1);
                  trackRoadmapInteraction('navigate', activePhase + 2, 'detail');
                }
              }}
              disabled={activePhase === roadmapData.phases.length - 1}
              className="flex items-center gap-2"
            >
              Next Phase
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Roadmap Continuation Indicator */}
        <div className="bg-muted/30 rounded-lg p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Target className="w-4 h-4 text-primary" />
            <span className="font-medium text-foreground">Ongoing Development</span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            This roadmap represents our strategic development plan from foundation to market leadership.
            Each phase builds upon the previous, leading to our goal of €1M monthly revenue.
          </p>
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-primary"></div>
              Current Phase
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-primary/50"></div>
              Completed
            </span>
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-muted"></div>
              Upcoming
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
