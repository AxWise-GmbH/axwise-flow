import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { User, Users, Target, Lightbulb, AlertCircle, TrendingUp } from 'lucide-react';

interface Persona {
  name: string;
  description: string;
  archetype?: string;
  demographics?: {
    value: string;
    evidence: string[];
  };
  goals_and_motivations?: {
    value: string;
    evidence: string[];
  };
  pain_points?: {
    value: string;
    evidence: string[];
  };
  key_quotes?: {
    value: string;
    evidence: string[];
  };
  patterns?: {
    value: string;
    evidence: string[];
  };
  confidence_score?: number;
  stakeholder_type?: string;
}

interface MultiStakeholderPersonasViewProps {
  personas: Persona[];
  stakeholderIntelligence?: any;
}

const MultiStakeholderPersonasView: React.FC<MultiStakeholderPersonasViewProps> = ({
  personas,
  stakeholderIntelligence
}) => {
  const [selectedPersona, setSelectedPersona] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'grid' | 'detailed'>('grid');

  const getStakeholderTypeColor = (type?: string) => {
    if (!type) return 'bg-gray-100 text-gray-800';
    
    const colors = {
      'decision_maker': 'bg-red-100 text-red-800',
      'primary_customer': 'bg-blue-100 text-blue-800',
      'secondary_customer': 'bg-green-100 text-green-800',
      'internal_stakeholder': 'bg-purple-100 text-purple-800',
      'external_partner': 'bg-orange-100 text-orange-800',
      'technical_lead': 'bg-indigo-100 text-indigo-800',
      'end_user': 'bg-teal-100 text-teal-800'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'text-gray-600';
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const renderPersonaCard = (persona: Persona, index: number) => {
    return (
      <Card 
        key={index} 
        className={`cursor-pointer transition-all ${
          selectedPersona === index ? 'ring-2 ring-blue-500' : 'hover:shadow-md'
        }`}
        onClick={() => setSelectedPersona(index)}
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center space-x-2">
              <User className="h-5 w-5" />
              <span>{persona.name}</span>
            </CardTitle>
            {persona.confidence_score && (
              <span className={`text-sm font-medium ${getConfidenceColor(persona.confidence_score)}`}>
                {Math.round(persona.confidence_score * 100)}%
              </span>
            )}
          </div>
          {persona.stakeholder_type && (
            <Badge className={getStakeholderTypeColor(persona.stakeholder_type)}>
              {persona.stakeholder_type.replace('_', ' ')}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 line-clamp-3">{persona.description}</p>
          {persona.archetype && (
            <div className="mt-2">
              <Badge variant="outline">{persona.archetype}</Badge>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderDetailedPersona = (persona: Persona) => {
    return (
      <div className="space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-2xl flex items-center space-x-3">
                <User className="h-6 w-6" />
                <span>{persona.name}</span>
              </CardTitle>
              <div className="flex items-center space-x-2">
                {persona.stakeholder_type && (
                  <Badge className={getStakeholderTypeColor(persona.stakeholder_type)}>
                    {persona.stakeholder_type.replace('_', ' ')}
                  </Badge>
                )}
                {persona.confidence_score && (
                  <span className={`text-lg font-medium ${getConfidenceColor(persona.confidence_score)}`}>
                    {Math.round(persona.confidence_score * 100)}% confidence
                  </span>
                )}
              </div>
            </div>
            {persona.archetype && (
              <Badge variant="outline" className="w-fit">{persona.archetype}</Badge>
            )}
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">{persona.description}</p>
          </CardContent>
        </Card>

        {/* Detailed Information Tabs */}
        <Tabs defaultValue="demographics" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="demographics">Demographics</TabsTrigger>
            <TabsTrigger value="goals">Goals</TabsTrigger>
            <TabsTrigger value="pain-points">Pain Points</TabsTrigger>
            <TabsTrigger value="quotes">Key Quotes</TabsTrigger>
            <TabsTrigger value="patterns">Patterns</TabsTrigger>
          </TabsList>

          <TabsContent value="demographics" className="space-y-4">
            {persona.demographics && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Target className="h-5 w-5" />
                    <span>Demographics & Profile</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2">Profile</h4>
                      <p className="text-sm text-gray-700">{persona.demographics.value}</p>
                    </div>
                    {persona.demographics.evidence && persona.demographics.evidence.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2">Supporting Evidence</h4>
                        <ul className="list-disc list-inside space-y-1">
                          {persona.demographics.evidence.map((evidence, idx) => (
                            <li key={idx} className="text-sm text-gray-600">{evidence}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="goals" className="space-y-4">
            {persona.goals_and_motivations && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <TrendingUp className="h-5 w-5" />
                    <span>Goals & Motivations</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2">Primary Goals</h4>
                      <p className="text-sm text-gray-700">{persona.goals_and_motivations.value}</p>
                    </div>
                    {persona.goals_and_motivations.evidence && persona.goals_and_motivations.evidence.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2">Supporting Evidence</h4>
                        <ul className="list-disc list-inside space-y-1">
                          {persona.goals_and_motivations.evidence.map((evidence, idx) => (
                            <li key={idx} className="text-sm text-gray-600">{evidence}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="pain-points" className="space-y-4">
            {persona.pain_points && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <AlertCircle className="h-5 w-5" />
                    <span>Pain Points & Challenges</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2">Key Challenges</h4>
                      <p className="text-sm text-gray-700">{persona.pain_points.value}</p>
                    </div>
                    {persona.pain_points.evidence && persona.pain_points.evidence.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2">Supporting Evidence</h4>
                        <ul className="list-disc list-inside space-y-1">
                          {persona.pain_points.evidence.map((evidence, idx) => (
                            <li key={idx} className="text-sm text-gray-600">{evidence}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="quotes" className="space-y-4">
            {persona.key_quotes && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Lightbulb className="h-5 w-5" />
                    <span>Key Quotes</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2">Representative Quotes</h4>
                      <p className="text-sm text-gray-700">{persona.key_quotes.value}</p>
                    </div>
                    {persona.key_quotes.evidence && persona.key_quotes.evidence.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2">Actual Quotes</h4>
                        <div className="space-y-2">
                          {persona.key_quotes.evidence.map((quote, idx) => (
                            <blockquote key={idx} className="border-l-4 border-blue-500 pl-4 italic text-sm text-gray-600">
                              "{quote}"
                            </blockquote>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="patterns" className="space-y-4">
            {persona.patterns && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Users className="h-5 w-5" />
                    <span>Behavioral Patterns</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2">Identified Patterns</h4>
                      <p className="text-sm text-gray-700">{persona.patterns.value}</p>
                    </div>
                    {persona.patterns.evidence && persona.patterns.evidence.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2">Supporting Evidence</h4>
                        <ul className="list-disc list-inside space-y-1">
                          {persona.patterns.evidence.map((evidence, idx) => (
                            <li key={idx} className="text-sm text-gray-600">{evidence}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    );
  };

  if (!personas || personas.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-gray-500">
            <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No personas available for this analysis.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with view mode toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center space-x-2">
            <Users className="h-6 w-6" />
            <span>Stakeholder Personas</span>
          </h2>
          <p className="text-gray-600">
            {personas.length} persona{personas.length !== 1 ? 's' : ''} identified from the analysis
          </p>
        </div>
        
        <div className="flex space-x-2">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-2 rounded-md text-sm ${
              viewMode === 'grid' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Grid View
          </button>
          <button
            onClick={() => setViewMode('detailed')}
            className={`px-3 py-2 rounded-md text-sm ${
              viewMode === 'detailed' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Detailed View
          </button>
        </div>
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {personas.map(renderPersonaCard)}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Persona selector */}
          <div className="flex space-x-2 overflow-x-auto pb-2">
            {personas.map((persona, index) => (
              <button
                key={index}
                onClick={() => setSelectedPersona(index)}
                className={`px-4 py-2 rounded-md text-sm whitespace-nowrap ${
                  selectedPersona === index
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {persona.name}
              </button>
            ))}
          </div>
          
          {/* Detailed persona view */}
          {renderDetailedPersona(personas[selectedPersona])}
        </div>
      )}
    </div>
  );
};

export default MultiStakeholderPersonasView;
