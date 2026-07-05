'use client';

import React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  Brain,
  Server,
  Layout,
  Database,
  Zap,
  Code2,
  Bot,
  Calendar,
  BookOpen,
  Target,
} from 'lucide-react';

interface TechItem {
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  category: 'ai' | 'backend' | 'frontend' | 'infra';
}

const techStack: TechItem[] = [
  // AI & ML
  {
    name: 'Google Gemini 2.5 Flash',
    description: 'Advanced multimodal AI for text generation, coaching, and intelligence analysis',
    icon: <Sparkles className="h-6 w-6" />,
    color: 'text-blue-600 bg-blue-100',
    category: 'ai',
  },
  {
    name: 'Gemini 3 Pro Image Preview',
    description: 'AI-powered persona avatar generation with photorealistic results',
    icon: <Bot className="h-6 w-6" />,
    color: 'text-purple-600 bg-purple-100',
    category: 'ai',
  },
  {
    name: 'PydanticAI',
    description: 'Type-safe AI agent framework for structured outputs and validation',
    icon: <Brain className="h-6 w-6" />,
    color: 'text-green-600 bg-green-100',
    category: 'ai',
  },
  {
    name: 'Google Search Grounding',
    description: 'Real-time web search for live news and location-based intelligence',
    icon: <Zap className="h-6 w-6" />,
    color: 'text-amber-600 bg-amber-100',
    category: 'ai',
  },
  // Backend
  {
    name: 'FastAPI',
    description: 'High-performance Python web framework with async support',
    icon: <Server className="h-6 w-6" />,
    color: 'text-teal-600 bg-teal-100',
    category: 'backend',
  },
  {
    name: 'Pydantic',
    description: 'Data validation using Python type annotations',
    icon: <Code2 className="h-6 w-6" />,
    color: 'text-red-600 bg-red-100',
    category: 'backend',
  },
  // Frontend
  {
    name: 'Next.js 15',
    description: 'React framework with App Router and Server Components',
    icon: <Layout className="h-6 w-6" />,
    color: 'text-gray-800 bg-gray-100',
    category: 'frontend',
  },
  {
    name: 'React 19 + TypeScript',
    description: 'Type-safe UI components with modern React features',
    icon: <Code2 className="h-6 w-6" />,
    color: 'text-cyan-600 bg-cyan-100',
    category: 'frontend',
  },
  {
    name: 'Tailwind CSS + shadcn/ui',
    description: 'Utility-first styling with accessible component library',
    icon: <Layout className="h-6 w-6" />,
    color: 'text-sky-600 bg-sky-100',
    category: 'frontend',
  },
  // Infrastructure
  {
    name: 'PostgreSQL + SQLAlchemy',
    description: 'Robust database with async ORM for data persistence',
    icon: <Database className="h-6 w-6" />,
    color: 'text-indigo-600 bg-indigo-100',
    category: 'infra',
  },
];

const categories = [
  { id: 'ai', label: 'AI & Machine Learning', color: 'bg-gradient-to-r from-blue-500 to-purple-500' },
  { id: 'backend', label: 'Backend', color: 'bg-gradient-to-r from-teal-500 to-green-500' },
  { id: 'frontend', label: 'Frontend', color: 'bg-gradient-to-r from-gray-600 to-cyan-500' },
  { id: 'infra', label: 'Infrastructure', color: 'bg-gradient-to-r from-indigo-500 to-violet-500' },
];

export function TechStackTab() {
  return (
    <ScrollArea className="h-full">
      <div className="p-6">
        {/* Powered by Gemini Banner */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white shadow-lg">
            <Sparkles className="h-6 w-6" />
            <span className="text-lg font-bold">Powered by Google Gemini</span>
            <Sparkles className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Built for the Google AI Hackathon 2025
          </p>
          <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>Created: November 29, 2025 at 13:51 CET</span>
          </div>
        </div>

        {/* Methodology Section */}
        <Card className="mb-6 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              Sales Methodology & Inspiration
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              PRECALL is built on proven enterprise sales methodologies, combining:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong>MEDDIC/MEDDPICC</strong> - Metrics, Economic Buyer, Decision Criteria, Decision Process, Identify Pain, Champion</li>
              <li><strong>Challenger Sale</strong> - Teaching prospects new perspectives and challenging assumptions</li>
              <li><strong>SPIN Selling</strong> - Situation, Problem, Implication, Need-payoff questioning framework</li>
              <li><strong>Solution Selling</strong> - Pain-focused discovery and value-based positioning</li>
            </ul>
            <p className="pt-2">
              <Target className="h-3 w-3 inline mr-1" />
              The AI synthesizes these frameworks to generate context-aware coaching tailored to each prospect&apos;s specific situation.
            </p>
          </CardContent>
        </Card>

        {/* Tech Stack Grid by Category */}
        <div className="space-y-6">
          {categories.map(cat => {
            const items = techStack.filter(t => t.category === cat.id);
            if (items.length === 0) return null;

            return (
              <div key={cat.id}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`h-1 w-8 rounded ${cat.color}`} />
                  <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                    {cat.label}
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {items.map((tech, i) => (
                    <Card key={i} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4 flex items-start gap-3">
                        <div className={`p-2 rounded-lg ${tech.color}`}>
                          {tech.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm">{tech.name}</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">{tech.description}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}

export default TechStackTab;

