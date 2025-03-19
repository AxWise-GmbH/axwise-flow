import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SentimentGraph from '../SentimentGraph';
import type { SentimentOverview } from '@/types/api';

// Mock recharts components to simplify testing
vi.mock('recharts', () => {
  const OriginalModule = vi.importActual('recharts');
  return {
    ...OriginalModule,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="mock-responsive-container">{children}</div>
    ),
    PieChart: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="mock-pie-chart">{children}</div>
    ),
    Pie: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="mock-pie">{children}</div>
    ),
    Cell: (props: any) => <div data-testid={`mock-cell-${props.fill?.replace('#', '')}`} />,
    Tooltip: () => <div data-testid="mock-tooltip" />,
    Sector: () => <div data-testid="mock-sector" />,
  };
});

// Mock data for testing
const mockSentimentData: SentimentOverview = {
  positive: 45,  // 45%
  neutral: 30,   // 30%
  negative: 25,  // 25%
};

const mockSupportingStatements = {
  positive: [
    'The interface is intuitive and easy to navigate',
    'I love how responsive the app is',
  ],
  neutral: [
    'It works as expected most of the time',
    'The performance is acceptable',
  ],
  negative: [
    'Error messages are confusing',
    'The system freezes occasionally',
  ],
};

describe('SentimentGraph Component', () => {
  it('renders with sentiment data', () => {
    render(<SentimentGraph data={mockSentimentData} />);
    
    // Check if component renders
    expect(screen.getByTestId('mock-responsive-container')).toBeInTheDocument();
    expect(screen.getByTestId('mock-pie-chart')).toBeInTheDocument();
    expect(screen.getByTestId('mock-pie')).toBeInTheDocument();
    
    // Check if sentiment percentages are displayed
    expect(screen.getByText('45%')).toBeInTheDocument(); // Positive
    expect(screen.getByText('30%')).toBeInTheDocument(); // Neutral
    expect(screen.getByText('25%')).toBeInTheDocument(); // Negative
  });
  
  it('displays supporting statements when provided', () => {
    render(
      <SentimentGraph 
        data={mockSentimentData} 
        supportingStatements={mockSupportingStatements}
        showStatements={true}
      />
    );
    
    // Check if supporting statements are displayed
    expect(screen.getByText('The interface is intuitive and easy to navigate')).toBeInTheDocument();
    expect(screen.getByText('It works as expected most of the time')).toBeInTheDocument();
    expect(screen.getByText('Error messages are confusing')).toBeInTheDocument();
  });
  
  it('hides supporting statements when showStatements is false', () => {
    render(
      <SentimentGraph 
        data={mockSentimentData} 
        supportingStatements={mockSupportingStatements}
        showStatements={false}
      />
    );
    
    // Statements should not be in the document
    expect(screen.queryByText('The interface is intuitive and easy to navigate')).not.toBeInTheDocument();
  });
  
  it('handles empty data gracefully', () => {
    const emptySentimentData: SentimentOverview = {
      positive: 0,
      neutral: 0,
      negative: 0,
    };
    
    render(<SentimentGraph data={emptySentimentData} />);
    
    // Should show empty state message
    expect(screen.getByText(/no sentiment data available/i)).toBeInTheDocument();
  });
  
  it('accepts sentimentData prop as alternative to data prop', () => {
    render(<SentimentGraph data={mockSentimentData} sentimentData={mockSentimentData} />);
    
    // Check if component renders with sentimentData prop
    expect(screen.getByTestId('mock-responsive-container')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument(); // Positive
  });
  
  it('adjusts height based on the height prop', () => {
    const { container } = render(<SentimentGraph data={mockSentimentData} height={300} />);
    
    // Find the chart container and verify its height
    const chartContainer = container.querySelector('[style*="height: 300px"]');
    expect(chartContainer).toBeInTheDocument();
  });
  
  it('shows legend when showLegend is true', () => {
    render(<SentimentGraph data={mockSentimentData} showLegend={true} />);
    
    // Check for legend items
    expect(screen.getByText('Positive')).toBeInTheDocument();
    expect(screen.getByText('Neutral')).toBeInTheDocument();
    expect(screen.getByText('Negative')).toBeInTheDocument();
  });
  
  it('hides legend when showLegend is false', () => {
    render(<SentimentGraph data={mockSentimentData} showLegend={false} />);
    
    // Legend items should not be in a legend container
    const legendContainer = screen.queryByTestId('sentiment-legend');
    expect(legendContainer).not.toBeInTheDocument();
  });
});
