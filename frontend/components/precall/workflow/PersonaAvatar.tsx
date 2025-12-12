'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, User } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { getOrGeneratePersonaImage, getPersonaKey, getCachedImage } from '@/lib/precall/personaImageCache';

interface PersonaAvatarProps {
  name: string;
  role: string;
  communicationStyle?: string;
  companyContext?: string;
  /** Time period for historical context (e.g., '1943-1945') */
  timePeriod?: string;
  /** Additional historical context (e.g., 'World War II Military Intelligence') */
  historicalContext?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Render as div instead of button (use when inside another button like AccordionTrigger) */
  asDiv?: boolean;
}

const sizeClasses = {
  sm: 'h-8 w-8',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
};

/**
 * PersonaAvatar - Displays an AI-generated avatar image for a persona
 * Uses localStorage caching to avoid regenerating on tab switches
 * Includes built-in lightbox for full-size viewing
 */
export function PersonaAvatar({
  name,
  role,
  communicationStyle,
  companyContext,
  timePeriod,
  historicalContext,
  size = 'md',
  asDiv = false,
}: PersonaAvatarProps) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadImage = async () => {
      // First check cache synchronously for immediate display
      const personaKey = getPersonaKey(name, role);
      const cached = getCachedImage(personaKey);

      if (cached) {
        setImageUri(cached);
        setIsLoading(false);
        return;
      }

      // Not cached, need to generate
      setIsLoading(true);
      setError(null);

      const result = await getOrGeneratePersonaImage(
        name,
        role,
        communicationStyle,
        companyContext,
        timePeriod,
        historicalContext
      );

      if (cancelled) return;

      if (result.imageUri) {
        setImageUri(result.imageUri);
      } else {
        setError(result.error);
      }
      setIsLoading(false);
    };

    loadImage();

    return () => {
      cancelled = true;
    };
  }, [name, role, communicationStyle, companyContext, timePeriod, historicalContext]);

  const sizeClass = sizeClasses[size];

  const avatarContent = (
    <>
      {isLoading ? (
        <Loader2 className="h-5 w-5 text-purple-600 animate-spin" />
      ) : imageUri ? (
        <img
          src={imageUri}
          alt={`${name} avatar`}
          className="h-full w-full object-cover"
        />
      ) : (
        <User className="h-5 w-5 text-purple-600" />
      )}
    </>
  );

  const avatarClassName = `relative ${sizeClass} rounded-full overflow-hidden bg-purple-100 flex items-center justify-center flex-shrink-0 ${
    asDiv
      ? 'cursor-pointer'
      : 'cursor-pointer hover:ring-2 hover:ring-purple-400 hover:ring-offset-2 transition-all disabled:cursor-default disabled:hover:ring-0'
  }`;

  return (
    <>
      {/* Lightbox Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md w-[90vw] p-0 overflow-hidden" aria-describedby={undefined}>
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="flex items-center gap-2 text-base">
              {name}
              <span className="text-sm font-normal text-muted-foreground">
                — {role}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="relative w-full max-h-[60vh] bg-muted flex items-center justify-center">
            {imageUri && (
              <img
                src={imageUri}
                alt={`${name} full portrait`}
                className="w-full h-auto max-h-[60vh] object-contain"
              />
            )}
          </div>
          {communicationStyle && (
            <div className="p-4 pt-2 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Style:</span>
              <Badge variant="secondary">{communicationStyle}</Badge>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Avatar - render as div or button based on asDiv prop */}
      {asDiv ? (
        <div
          onClick={() => imageUri && setIsDialogOpen(true)}
          className={avatarClassName}
          title={imageUri ? 'Click to view full image' : undefined}
        >
          {avatarContent}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => imageUri && setIsDialogOpen(true)}
          disabled={!imageUri || isLoading}
          className={avatarClassName}
          title={imageUri ? 'Click to view full image' : undefined}
        >
          {avatarContent}
        </button>
      )}
    </>
  );
}

export default PersonaAvatar;

