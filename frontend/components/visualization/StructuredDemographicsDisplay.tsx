'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Quote, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StructuredDemographics, AttributedField } from '@/types/api';

interface StructuredDemographicsDisplayProps {
  demographics: StructuredDemographics;
  className?: string;
}

interface DemographicItemProps {
  label: string;
  attributedField: AttributedField;
  icon?: React.ComponentType<{ className?: string }>;
}

// Component to display a single demographic item with its evidence
const DemographicItem: React.FC<DemographicItemProps> = ({ 
  label, 
  attributedField, 
  icon: Icon 
}) => {
  const [showEvidence, setShowEvidence] = useState(false);

  if (!attributedField || !attributedField.value) {
    return null;
  }

  const hasEvidence = attributedField.evidence && attributedField.evidence.length > 0;

  return (
    <div className="p-4 rounded-lg border border-gray-200 bg-white hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {Icon && <Icon className="h-4 w-4 text-gray-500" />}
            <span className="font-medium text-sm text-gray-900 uppercase tracking-wide">
              {label}
            </span>
            {hasEvidence && (
              <Badge variant="outline" className="text-xs">
                {attributedField.evidence.length} evidence
              </Badge>
            )}
          </div>
          <div className="text-gray-700 leading-relaxed mb-2">
            {attributedField.value}
          </div>
          
          {hasEvidence && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowEvidence(!showEvidence)}
              className="text-xs text-blue-600 hover:text-blue-800 p-0 h-auto font-normal"
            >
              <Info className="h-3 w-3 mr-1" />
              {showEvidence ? 'Hide' : 'Show'} Supporting Evidence
              {showEvidence ? (
                <ChevronUp className="h-3 w-3 ml-1" />
              ) : (
                <ChevronDown className="h-3 w-3 ml-1" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Evidence Section */}
      {hasEvidence && showEvidence && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="space-y-2">
            {attributedField.evidence.map((quote, index) => (
              <div
                key={index}
                className="flex items-start gap-2 p-2 bg-blue-50 rounded border-l-2 border-blue-200"
              >
                <Quote className="h-3 w-3 text-blue-500 mt-0.5 flex-shrink-0" />
                <span className="text-xs text-gray-700 italic leading-relaxed">
                  "{quote}"
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Main component for displaying structured demographics
export const StructuredDemographicsDisplay: React.FC<StructuredDemographicsDisplayProps> = ({
  demographics,
  className
}) => {
  if (!demographics) {
    return null;
  }

  // Define the demographic fields with their display labels
  const demographicFields = [
    { key: 'experience_level', label: 'Experience Level' },
    { key: 'industry', label: 'Industry' },
    { key: 'location', label: 'Location' },
    { key: 'age_range', label: 'Age Range' },
    { key: 'professional_context', label: 'Professional Context' },
    { key: 'roles', label: 'Roles' }
  ] as const;

  // Filter out fields that don't have values
  const availableFields = demographicFields.filter(
    field => demographics[field.key] && demographics[field.key]?.value
  );

  if (availableFields.length === 0) {
    return (
      <Card className={cn("w-full", className)}>
        <CardContent className="p-6">
          <div className="text-center text-gray-500">
            No structured demographic data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">
            Demographics
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {Math.round(demographics.confidence * 100)}% confidence
            </Badge>
            <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
              Enhanced
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {availableFields.map(({ key, label }) => {
            const attributedField = demographics[key];
            if (!attributedField) return null;

            return (
              <DemographicItem
                key={key}
                label={label}
                attributedField={attributedField}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default StructuredDemographicsDisplay;
