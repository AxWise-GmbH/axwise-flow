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
    <header className="border-b border-border/50 bg-white/40 dark:bg-slate-950/40 backdrop-blur-md sticky top-0 z-50">
      <div className="container flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
              <Phone className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                PRECALL
              </h1>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider -mt-0.5">
                Pre-Call Intelligence
              </p>
            </div>
          </div>

          {companyName && (
            <>
              <span className="text-border/50 text-xl font-light">/</span>
              <span className="text-sm font-medium bg-secondary/50 px-2 py-0.5 rounded-full backdrop-blur-sm border border-border/50">{companyName}</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasIntelligence && (
            <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-700 dark:text-green-300 border-green-200/50 dark:border-green-800/50 backdrop-blur-sm">
              <Sparkles className="h-3 w-3 mr-1" />
              Intelligence Ready
            </Badge>
          )}
          <Badge variant="outline" className="text-xs border-border/50 bg-background/50 backdrop-blur-sm">
            Powered by Gemini
          </Badge>
        </div>
      </div>
    </header>
  );
}

export default PrecallHeader;

