'use client';

import React, { useState } from 'react';
import { ThemeChart, PatternList, SentimentGraph } from '@/components/visualization';
import { mockThemes, mockPatterns, mockSentimentOverview, mockSentimentData } from '@/lib/mockData';
import type { Theme, Pattern } from '@/types/api';

/**
 * Demo page for visualization components
 * This page showcases all the visualization components with mock data
 */
export default function DemoPage() {
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Visualization Components Demo</h1>
        <p className="text-muted-foreground mt-2">
          This page demonstrates the visualization components for the Interview Insight Analyst application.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8">
        {/* Theme Chart Section */}
        <section className="bg-card p-6 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Theme Chart</h2>
          <p className="text-muted-foreground mb-6">
            Visualizes themes identified in the interview data, showing frequency and sentiment.
          </p>
          
          <ThemeChart 
            data={mockThemes} 
            onThemeClick={(theme) => setSelectedTheme(theme)}
          />
          
          {selectedTheme && (
            <div className="mt-4 p-4 bg-muted/30 rounded-md">
              <h3 className="font-medium">Selected Theme: {selectedTheme.name}</h3>
              <p className="text-sm mt-1">
                Frequency: {Math.round((selectedTheme.frequency || 0) * 100)}% | 
                Sentiment: {(selectedTheme.sentiment || 0).toFixed(1)}
              </p>
              {selectedTheme.keywords && selectedTheme.keywords.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground">Keywords:</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedTheme.keywords.map((keyword, i) => (
                      <span key={i} className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Pattern List Section */}
        <section className="bg-card p-6 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Pattern List</h2>
          <p className="text-muted-foreground mb-6">
            Displays patterns recognized across interviews with visual indicators for frequency and sentiment.
          </p>
          
          <PatternList 
            data={mockPatterns} 
            onPatternClick={(pattern) => setSelectedPattern(pattern)}
          />
          
          {selectedPattern && (
            <div className="mt-4 p-4 bg-muted/30 rounded-md">
              <h3 className="font-medium">Selected Pattern: {selectedPattern.category}</h3>
              <p className="text-sm mt-1">
                Frequency: {Math.round((selectedPattern.frequency || 0) * 100)}% | 
                Sentiment: {(selectedPattern.sentiment || 0).toFixed(1)}
              </p>
              <p className="text-sm mt-2">{selectedPattern.description}</p>
            </div>
          )}
        </section>

        {/* Sentiment Graph Section */}
        <section className="bg-card p-6 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Sentiment Graph</h2>
          <p className="text-muted-foreground mb-6">
            Visualizes sentiment distribution across the interviews.
          </p>
          
          <SentimentGraph 
            data={mockSentimentOverview}
            detailedData={mockSentimentData}
          />
        </section>
      </div>

      <footer className="mt-12 text-center text-sm text-muted-foreground">
        <p>
          These visualization components are part of the Interview Insight Analyst application.
        </p>
      </footer>
    </div>
  );
}