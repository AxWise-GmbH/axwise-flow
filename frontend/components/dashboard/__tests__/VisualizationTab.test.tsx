'use client';

import { render, screen, fireEvent } from '@testing-library/react';
import { VisualizationTab } from '../VisualizationTab';
import { useRouter, useSearchParams } from 'next/navigation';
import { DetailedAnalysisResult } from '@/types/api';
import { vi } from 'vitest';

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn()
}));

// Mock the visualization components
vi.mock('@/components/visualization/ThemeChart', () => ({
  ThemeChart: ({ themes }: { themes: any[] }) => (
    <div data-testid="theme-chart">
      {themes.length} themes found
    </div>
  )
}));

vi.mock('@/components/visualization/PatternList', () => ({
  PatternList: ({ patterns }: { patterns: any[] }) => (
    <div data-testid="pattern-list">
      {patterns.length} patterns found
    </div>
  )
}));

vi.mock('@/components/visualization/SentimentGraph', () => ({
  SentimentGraph: ({ sentiments }: { sentiments: any[] }) => (
    <div data-testid="sentiment-graph">
      {sentiments.length} sentiment data points
    </div>
  )
}));

vi.mock('@/components/visualization/PersonaCards', () => ({
  PersonaCards: ({ personas }: { personas: any[] }) => (
    <div data-testid="persona-cards">
      {personas.length} personas identified
    </div>
  )
}));

// Mock sample analysis data
const mockAnalysis: DetailedAnalysisResult = {
  result_id: '123',
  status: 'completed',
  created_at: '2023-01-01T00:00:00Z',
  updated_at: '2023-01-01T00:00:00Z',
  metadata: {
    filename: 'test-interview.txt',
    filesize: 1024,
    file_type: 'text',
    language: 'en'
  },
  themes: [{ name: 'Theme 1', sentiment: 0.5, count: 3 }],
  patterns: [{ pattern: 'Pattern 1', examples: ['Example 1'], count: 2 }],
  summary: 'Test summary of the analysis',
  sentiments: [{ topic: 'Topic 1', score: 0.7 }],
  user_personas: [{ name: 'Persona 1', characteristics: ['Characteristic 1'] }]
};

describe('VisualizationTab', () => {
  // Reset mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({
      push: vi.fn(),
      prefetch: vi.fn()
    });
    (useSearchParams as any).mockReturnValue(new URLSearchParams('vizTab=themes'));
  });

  it('renders visualization options when analysis is provided', () => {
    render(<VisualizationTab analysis={mockAnalysis} />);
    
    // Check that visualization options are rendered
    expect(screen.getByRole('tab', { name: /themes/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /patterns/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /sentiment/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /personas/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /summary/i })).toBeInTheDocument();
  });

  it('sets the active visualization tab based on URL parameter', () => {
    render(<VisualizationTab analysis={mockAnalysis} />);
    
    // The 'themes' tab should be active based on our mock URL params
    const themesTab = screen.getByRole('tab', { name: /themes/i });
    expect(themesTab).toHaveAttribute('data-state', 'active');
    
    // Theme chart should be visible
    expect(screen.getByTestId('theme-chart')).toBeInTheDocument();
    expect(screen.getByText('1 themes found')).toBeInTheDocument();
  });

  it('changes visualization tab when clicked', () => {
    const pushMock = vi.fn();
    (useRouter as any).mockReturnValue({
      push: pushMock,
      prefetch: vi.fn()
    });

    render(<VisualizationTab analysis={mockAnalysis} />);
    
    // Click the Patterns tab
    fireEvent.click(screen.getByRole('tab', { name: /patterns/i }));
    
    // Check that the router was called to update the URL
    expect(pushMock).toHaveBeenCalledWith('?vizTab=patterns');
  });

  it('displays theme chart when themes tab is active', () => {
    (useSearchParams as any).mockReturnValue(new URLSearchParams('vizTab=themes'));
    
    render(<VisualizationTab analysis={mockAnalysis} />);
    
    expect(screen.getByTestId('theme-chart')).toBeInTheDocument();
  });

  it('displays pattern list when patterns tab is active', () => {
    (useSearchParams as any).mockReturnValue(new URLSearchParams('vizTab=patterns'));
    
    render(<VisualizationTab analysis={mockAnalysis} />);
    
    expect(screen.getByTestId('pattern-list')).toBeInTheDocument();
  });

  it('displays sentiment graph when sentiment tab is active', () => {
    (useSearchParams as any).mockReturnValue(new URLSearchParams('vizTab=sentiment'));
    
    render(<VisualizationTab analysis={mockAnalysis} />);
    
    expect(screen.getByTestId('sentiment-graph')).toBeInTheDocument();
  });

  it('displays persona cards when personas tab is active', () => {
    (useSearchParams as any).mockReturnValue(new URLSearchParams('vizTab=personas'));
    
    render(<VisualizationTab analysis={mockAnalysis} />);
    
    expect(screen.getByTestId('persona-cards')).toBeInTheDocument();
  });

  it('displays summary when summary tab is active', () => {
    (useSearchParams as any).mockReturnValue(new URLSearchParams('vizTab=summary'));
    
    render(<VisualizationTab analysis={mockAnalysis} />);
    
    expect(screen.getByText('Test summary of the analysis')).toBeInTheDocument();
  });
});
