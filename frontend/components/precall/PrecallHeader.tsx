'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Phone, Sparkles } from 'lucide-react';

interface PrecallHeaderProps {
  companyName?: string;
  hasIntelligence?: boolean;
}

/**
 * Header component for the PRECALL dashboard
 */
export function PrecallHeader({ companyName, hasIntelligence }: PrecallHeaderProps) {
  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Phone className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                PRECALL
              </h1>
              <p className="text-xs text-muted-foreground -mt-0.5">
                Pre-Call Intelligence Dashboard
              </p>
            </div>
          </div>
          
          {companyName && (
            <>
              <span className="text-muted-foreground">/</span>
              <span className="text-sm font-medium">{companyName}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasIntelligence && (
            <Badge variant="secondary" className="text-xs">
              <Sparkles className="h-3 w-3 mr-1" />
              Intelligence Ready
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            Powered by Gemini
          </Badge>
        </div>
      </div>
    </header>
  );
}

export default PrecallHeader;

