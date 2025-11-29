'use client';

import React, { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Building2,
  Sparkles,
  ZoomIn,
  Loader2,
  ImageOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { CallIntelligence } from '@/lib/precall/types';

interface OrgChartTabProps {
  intelligence: CallIntelligence;
}

export function OrgChartTab({ intelligence }: OrgChartTabProps) {
  const [imageError, setImageError] = useState(false);
  const { orgChartImage, personas } = intelligence;

  // Count by role
  const roleCounts = {
    primary: personas.filter(p => p.role_in_decision === 'primary').length,
    secondary: personas.filter(p => p.role_in_decision === 'secondary').length,
    executor: personas.filter(p => p.role_in_decision === 'executor').length,
    blocker: personas.filter(p => p.role_in_decision === 'blocker').length,
  };

  // If no image, show placeholder
  if (!orgChartImage) {
    return (
      <div className="h-full flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-indigo-100 flex items-center justify-center">
              <Building2 className="h-8 w-8 text-indigo-600" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Org Chart Generating...</h3>
            <p className="text-sm text-muted-foreground mb-4">
              The AI is creating an organizational chart showing stakeholder hierarchy
              and decision-making structure.
            </p>
            <div className="flex items-center justify-center gap-2 text-indigo-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Powered by Gemini</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (imageError) {
    return (
      <div className="h-full flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <ImageOff className="h-8 w-8 text-red-600" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Image Failed to Load</h3>
            <p className="text-sm text-muted-foreground">
              The org chart image could not be displayed.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold">Organization Structure</h2>
            <Badge variant="secondary" className="text-xs">
              <Sparkles className="h-3 w-3 mr-1" />
              AI Generated
            </Badge>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <ZoomIn className="h-4 w-4 mr-1" />
                Full Screen
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[95vw] max-h-[95vh] p-2" aria-describedby={undefined}>
              <img
                src={orgChartImage}
                alt="Organization Chart - Full View"
                className="w-full h-full object-contain"
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Role Summary Badges */}
        <Card className="mb-4 bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground mr-2">Stakeholders:</span>
              {roleCounts.primary > 0 && (
                <Badge className="bg-green-600 text-xs">{roleCounts.primary} Decision Maker{roleCounts.primary > 1 ? 's' : ''}</Badge>
              )}
              {roleCounts.secondary > 0 && (
                <Badge className="bg-blue-600 text-xs">{roleCounts.secondary} Influencer{roleCounts.secondary > 1 ? 's' : ''}</Badge>
              )}
              {roleCounts.executor > 0 && (
                <Badge className="bg-purple-600 text-xs">{roleCounts.executor} Executor{roleCounts.executor > 1 ? 's' : ''}</Badge>
              )}
              {roleCounts.blocker > 0 && (
                <Badge className="bg-red-600 text-xs">{roleCounts.blocker} Blocker{roleCounts.blocker > 1 ? 's' : ''}</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Org Chart Image */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <img
              src={orgChartImage}
              alt="Organization Chart"
              className="w-full h-auto"
              onError={() => setImageError(true)}
            />
          </CardContent>
        </Card>

        {/* Attribution */}
        <div className="mt-4 text-center text-xs text-muted-foreground">
          Generated by Gemini 3 Pro Image Preview
        </div>
      </div>
    </ScrollArea>
  );
}

export default OrgChartTab;

