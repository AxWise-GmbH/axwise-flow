'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { User, MessageCircle, Lightbulb, Target, Loader2, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PersonaDetail } from '@/lib/precall/types';
import { generatePersonaImage } from '@/lib/precall/coachService';

interface PersonaCardProps {
  persona: PersonaDetail;
  companyContext?: string;
}

/**
 * Card component for displaying stakeholder persona details with AI-generated avatar
 */
export function PersonaCard({ persona, companyContext }: PersonaCardProps) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);

  // Generate image on first render
  useEffect(() => {
    const fetchImage = async () => {
      setIsLoadingImage(true);
      setImageError(null);

      try {
        const result = await generatePersonaImage(
          persona.name,
          persona.role,
          persona.communication_style,
          companyContext
        );

        if (result.success && result.image_data_uri) {
          setImageUri(result.image_data_uri);
        } else {
          setImageError(result.error || 'Failed to generate image');
        }
      } catch (err) {
        setImageError('Failed to generate image');
      } finally {
        setIsLoadingImage(false);
      }
    };

    // Auto-generate image
    fetchImage();
  }, [persona.name, persona.role, persona.communication_style, companyContext]);

  const handleRetryImage = async () => {
    setIsLoadingImage(true);
    setImageError(null);

    try {
      const result = await generatePersonaImage(
        persona.name,
        persona.role,
        persona.communication_style,
        companyContext
      );

      if (result.success && result.image_data_uri) {
        setImageUri(result.image_data_uri);
      } else {
        setImageError(result.error || 'Failed to generate image');
      }
    } catch (err) {
      setImageError('Failed to generate image');
    } finally {
      setIsLoadingImage(false);
    }
  };

  return (
    <>
      {/* Full-scale image dialog - sized to fit viewport */}
      <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
        <DialogContent className="max-w-md w-[90vw] p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="flex items-center gap-2 text-base">
              {persona.name}
              <span className="text-sm font-normal text-muted-foreground">
                — {persona.role}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="relative w-full max-h-[60vh] bg-muted flex items-center justify-center">
            {imageUri && (
              <img
                src={imageUri}
                alt={`${persona.name} full portrait`}
                className="w-full h-auto max-h-[60vh] object-contain"
              />
            )}
          </div>
          {persona.communication_style && (
            <div className="p-4 pt-2 border-t">
              <Badge variant="secondary">{persona.communication_style}</Badge>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card className="border-l-4 border-l-purple-500 hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            {/* Avatar with AI-generated image - clickable for full view */}
            <button
              type="button"
              onClick={() => imageUri && setIsImageDialogOpen(true)}
              disabled={!imageUri || isLoadingImage}
              className="relative h-12 w-12 rounded-full overflow-hidden bg-purple-100 flex items-center justify-center flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-purple-400 hover:ring-offset-2 transition-all disabled:cursor-default disabled:hover:ring-0"
              title={imageUri ? "Click to view full image" : undefined}
            >
              {isLoadingImage ? (
                <Loader2 className="h-5 w-5 text-purple-600 animate-spin" />
              ) : imageUri ? (
                <img
                  src={imageUri}
                  alt={`${persona.name} avatar`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-full w-full rounded-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRetryImage();
                  }}
                  title={imageError || "Generate avatar"}
                >
                  {imageError ? (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <User className="h-5 w-5 text-purple-600" />
                  )}
                </Button>
              )}
            </button>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base font-semibold truncate">
                {persona.name}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{persona.role}</p>
            </div>
          </div>
        </CardHeader>
      <CardContent className="pt-2">
        {persona.communication_style && (
          <div className="mb-3">
            <Badge variant="secondary" className="text-xs">
              {persona.communication_style}
            </Badge>
          </div>
        )}

        <Accordion type="multiple" className="w-full">
          {/* Likely Questions */}
          {persona.likely_questions?.length > 0 && (
            <AccordionItem value="questions" className="border-b-0">
              <AccordionTrigger className="hover:no-underline py-2 text-sm">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-muted-foreground" />
                  <span>Likely Questions ({persona.likely_questions.length})</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-2 text-sm">
                  {persona.likely_questions.map((q, i) => (
                    <li key={i} className="flex items-start gap-2 text-muted-foreground">
                      <span className="text-purple-500 font-medium">{i + 1}.</span>
                      <span>"{q}"</span>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Engagement Tips */}
          {persona.engagement_tips?.length > 0 && (
            <AccordionItem value="tips" className="border-b-0">
              <AccordionTrigger className="hover:no-underline py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-muted-foreground" />
                  <span>Engagement Tips ({persona.engagement_tips.length})</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-2 text-sm">
                  {persona.engagement_tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-muted-foreground">
                      <span className="text-green-500">✓</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Decision Factors */}
          {persona.decision_factors?.length > 0 && (
            <AccordionItem value="factors" className="border-b-0">
              <AccordionTrigger className="hover:no-underline py-2 text-sm">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <span>Decision Factors ({persona.decision_factors.length})</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-wrap gap-1.5">
                  {persona.decision_factors.map((factor, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {factor}
                    </Badge>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </CardContent>
    </Card>
    </>
  );
}

export default PersonaCard;

