'use client';

import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface AnalysisOptionsProps {
  provider: 'openai' | 'gemini';
  onProviderChange: (provider: 'openai' | 'gemini') => void;
}

/**
 * Component for selecting analysis options (LLM provider)
 */
const AnalysisOptions = ({ provider, onProviderChange }: AnalysisOptionsProps): JSX.Element => {
  return (
    <div className="space-y-4">
      <div>
        <Label className="text-base">Select LLM Provider</Label>
        <p className="text-sm text-muted-foreground">
          Choose which AI model to use for analysis
        </p>
      </div>

      <RadioGroup
        value={provider}
        onValueChange={(value) => onProviderChange(value as 'openai' | 'gemini')}
        className="grid grid-cols-2 gap-4"
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="gemini" id="gemini" />
          <Label htmlFor="gemini" className="font-normal cursor-pointer">
            Google Gemini
          </Label>
        </div>

        <div className="flex items-center space-x-2">
          <RadioGroupItem value="openai" id="openai" />
          <Label htmlFor="openai" className="font-normal cursor-pointer">
            OpenAI GPT
          </Label>
        </div>
      </RadioGroup>

      <div className="text-sm text-muted-foreground mt-2">
        {provider === 'gemini' ? (
          <span>Using Gemini 2.5 Flash - Optimized for structured schema-based analysis</span>
        ) : (
          <span>Using GPT-4o - Best for nuanced sentiment and theme detection</span>
        )}
      </div>
    </div>
  );
};

export default AnalysisOptions;
