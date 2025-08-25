'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SimplePersonaCard } from './SimplePersonaCard';
import { API_ENDPOINTS } from '@/lib/apiEndpoints';

// Interface for simplified persona response
interface SimplifiedPersonaResponse {
  status: string;
  result_id: number;
  personas: SimplePersona[];
  total_personas: number;
  design_thinking_optimized: boolean;
}

interface SimplePersona {
  persona_id?: number;
  name: string;
  archetype: string;
  overall_confidence: number;
  populated_traits: {
    demographics?: PersonaTrait;
    goals_and_motivations?: PersonaTrait;
    challenges_and_frustrations?: PersonaTrait;
    key_quotes?: PersonaTrait;
  };
  trait_count: number;
  evidence_count: number;
}

interface PersonaTrait {
  value: string;
  confidence: number;
  evidence: string[];
}

interface SimplePersonaListProps {
  resultId: number;
  className?: string;
}

export const SimplePersonaList: React.FC<SimplePersonaListProps> = ({
  resultId,
  className
}) => {
  const [personas, setPersonas] = useState<SimplePersona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getToken, isSignedIn } = useAuth();
  const [retryCount, setRetryCount] = useState(0);

  const fetchSimplifiedPersonas = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check if user is signed in
      if (!isSignedIn) {
        throw new Error('Authentication required. Please sign in to view personas.');
      }

      // Get authentication token from Clerk
      const token = await getToken();
      if (!token) {
        throw new Error('Authentication token not available. Please sign in again.');
      }

      const response = await fetch(API_ENDPOINTS.GET_SIMPLIFIED_PERSONAS(resultId), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication failed. Please sign in again.');
        }
        throw new Error(`Failed to fetch personas: ${response.status} ${response.statusText}`);
      }

      const data: SimplifiedPersonaResponse = await response.json();

      if (data.status === 'success') {
        setPersonas(data.personas || []);
      } else {
        throw new Error('API returned non-success status');
      }
    } catch (err) {
      console.error('Error fetching simplified personas:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    fetchSimplifiedPersonas();
  };

  useEffect(() => {
    fetchSimplifiedPersonas();
  }, [resultId, retryCount]);

  if (loading) {
    return (
      <Card className={cn("w-full", className)}>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-muted-foreground">Loading design thinking personas...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn("w-full", className)}>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 mx-auto mb-4 text-red-600" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {error.includes('Authentication') ? 'Authentication Required' : 'Error Loading Personas'}
            </h3>
            <p className="text-red-600 mb-4">Error loading personas: {error}</p>
            {error.includes('Authentication') ? (
              <div className="space-y-2">
                <Button onClick={() => window.location.href = '/sign-in'} variant="default" size="sm">
                  Sign In
                </Button>
                <Button onClick={fetchSimplifiedPersonas} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
              </div>
            ) : (
              <Button onClick={fetchSimplifiedPersonas} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (personas.length === 0) {
    return (
      <Card className={cn("w-full", className)}>
        <CardHeader>
          <CardTitle>🎯 User Personas</CardTitle>
          <CardDescription>No personas found with sufficient confidence for design thinking analysis.</CardDescription>
        </CardHeader>
        <CardContent className="text-center py-8">
          <p className="text-muted-foreground">
            Try running the analysis again or check if the interview data contains enough user insights.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center">
              🎯 Design Thinking Personas
              <Badge variant="secondary" className="ml-2 bg-green-100 text-green-800">
                Empathy Ready
              </Badge>
            </CardTitle>
            <CardDescription>
              {personas.length} evidence-backed persona{personas.length !== 1 ? 's' : ''} with demographics, goals, challenges, and authentic quotes—ready for empathy mapping, journey mapping, and ideation workshops
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">
              Total Evidence: {personas.reduce((sum, p) => sum + p.evidence_count, 0)} quotes
            </div>
            <div className="text-xs text-muted-foreground">
              Avg Confidence: {Math.round(personas.reduce((sum, p) => sum + p.overall_confidence, 0) / personas.length * 100)}%
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Design Thinking Usage Guide */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-start space-x-3">
            <div className="text-blue-600 mt-0.5">💡</div>
            <div>
              <h4 className="font-medium text-blue-900 mb-2">How to Use These Personas</h4>
              <p className="text-sm text-blue-800 leading-relaxed">
                Each persona includes <strong>demographics</strong> (who they are), <strong>goals & motivations</strong> (what they want),
                <strong>challenges & frustrations</strong> (what blocks them), and <strong>authentic quotes</strong> (their voice).
                Use them for empathy mapping, user journey creation, and solution ideation in your design thinking workshops.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-2">
          {personas.map((persona, index) => (
            <SimplePersonaCard
              key={persona.persona_id || `persona-${index}`}
              persona={persona}
            />
          ))}
        </div>

        {/* Summary Footer */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="flex justify-center text-sm text-gray-600">
            <span>
              ✅ Filtered for quality: Only showing traits with 70%+ confidence and sufficient supporting evidence
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SimplePersonaList;
