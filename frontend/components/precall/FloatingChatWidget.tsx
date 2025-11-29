'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MessageCircle, Minus, X, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  ChatMessage, 
  ProspectData, 
  CallIntelligence 
} from '@/lib/precall/types';
import { LiveChatCoach } from './LiveChatCoach';

// Tab context descriptions for the AI
export type ActiveTabContext = 'insights' | 'personas';

const TAB_CONTEXT_DESCRIPTIONS: Record<ActiveTabContext, string> = {
  insights: 'User is viewing the Insights & Objections tab - focus on key insights, objection handling, and evidence-based recommendations.',
  personas: 'User is viewing the Personas & Guide tab - focus on stakeholder personas, communication styles, and call guide tactics.',
};

interface Position {
  x: number;
  y: number;
}

interface FloatingChatWidgetProps {
  prospectData: ProspectData | null;
  intelligence: CallIntelligence | null;
  chatHistory: ChatMessage[];
  onChatHistoryChange: (messages: ChatMessage[]) => void;
  activeTab: ActiveTabContext;
}

const STORAGE_KEY = 'precall-chat-position';
const DEFAULT_POSITION: Position = { x: 20, y: 100 };

/**
 * Floating chat widget that can be dragged, minimized, and is context-aware
 */
export function FloatingChatWidget({
  prospectData,
  intelligence,
  chatHistory,
  onChatHistoryChange,
  activeTab,
}: FloatingChatWidgetProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [position, setPosition] = useState<Position>(DEFAULT_POSITION);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });
  const widgetRef = useRef<HTMLDivElement>(null);

  // Load position from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Position;
        setPosition(parsed);
      }
    } catch {
      // Use default position
    }
  }, []);

  // Save position to localStorage
  useEffect(() => {
    if (!isDragging) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
      } catch {
        // Ignore storage errors
      }
    }
  }, [position, isDragging]);

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (widgetRef.current) {
      const rect = widgetRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      setIsDragging(true);
    }
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      const newX = Math.max(0, Math.min(window.innerWidth - 380, e.clientX - dragOffset.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.y));
      setPosition({ x: newX, y: newY });
    }
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Attach global mouse listeners when dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Get context description for the current tab
  const viewContext = TAB_CONTEXT_DESCRIPTIONS[activeTab];

  return (
    <div
      ref={widgetRef}
      className={cn(
        'fixed z-50 shadow-2xl rounded-lg border bg-background transition-all duration-200',
        isDragging && 'cursor-grabbing opacity-90',
        isExpanded ? 'w-[360px]' : 'w-auto'
      )}
      style={{
        left: position.x,
        top: position.y,
        maxHeight: isExpanded ? 'calc(100vh - 120px)' : 'auto',
      }}
    >
      {/* Header - Draggable Handle */}
      <div
        className={cn(
          'flex items-center justify-between px-3 py-2 border-b bg-muted/50 rounded-t-lg',
          'cursor-grab select-none',
          isDragging && 'cursor-grabbing'
        )}
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
          <MessageCircle className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium">Live Coach</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            <Minus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Chat Content - Only shown when expanded */}
      {isExpanded && (
        <div className="h-[400px]">
          <LiveChatCoach
            prospectData={prospectData}
            intelligence={intelligence}
            chatHistory={chatHistory}
            onChatHistoryChange={onChatHistoryChange}
            viewContext={viewContext}
          />
        </div>
      )}
    </div>
  );
}

export default FloatingChatWidget;

