import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PatternList from '../PatternList';
import type { Pattern } from '@/types/api';

// Mock data for testing
const mockPatterns: Pattern[] = [
  {
    id: 1,
    name: 'Frequent data exports',
    description: 'Users regularly export data for offline analysis',
    frequency: 0.75,
    category: 'Workflow',
    evidence: ['Interview 1: "I export data daily"', 'Survey response: "Exports are crucial"'],
    sentiment: 0.3,
  },
  {
    id: 2,
    name: 'Manual data verification',
    description: 'Users double-check automated results manually',
    frequency: 0.6,
    category: 'Coping Strategy',
    evidence: ['Interview 3: "Always verify results"'],
    sentiment: -0.2,
  },
  {
    id: 3,
    name: 'Feature workaround',
    description: 'Users create workarounds for missing features',
    frequency: 0.4,
    category: 'Workaround',
    evidence: ['Observation: Users creating external tools'],
    sentiment: -0.5,
  },
];

describe('PatternList Component', () => {
  it('renders pattern list correctly with categories', () => {
    render(<PatternList patterns={mockPatterns} />);
    
    // Check if all categories are rendered
    expect(screen.getByText('Workflow')).toBeInTheDocument();
    expect(screen.getByText('Coping Strategy')).toBeInTheDocument();
    expect(screen.getByText('Workaround')).toBeInTheDocument();
    
    // Check if pattern names are visible
    expect(screen.getByText('Frequent data exports')).toBeInTheDocument();
    expect(screen.getByText('Manual data verification')).toBeInTheDocument();
    expect(screen.getByText('Feature workaround')).toBeInTheDocument();
  });

  it('filters patterns based on search term', async () => {
    render(<PatternList patterns={mockPatterns} />);
    
    const user = userEvent.setup();
    const searchInput = screen.getByPlaceholderText(/search patterns/i);
    
    // Type search term
    await user.type(searchInput, 'export');
    
    // Should only show patterns containing "export"
    expect(screen.getByText('Frequent data exports')).toBeInTheDocument();
    expect(screen.queryByText('Manual data verification')).not.toBeInTheDocument();
    expect(screen.queryByText('Feature workaround')).not.toBeInTheDocument();
  });

  it('calls onPatternClick when a pattern is clicked', async () => {
    const handlePatternClick = vi.fn();
    render(<PatternList patterns={mockPatterns} onPatternClick={handlePatternClick} />);
    
    const user = userEvent.setup();
    // Find and click on a pattern card
    const patternCard = screen.getByText('Frequent data exports').closest('.pattern-card');
    
    if (patternCard) {
      await user.click(patternCard);
      expect(handlePatternClick).toHaveBeenCalledTimes(1);
      expect(handlePatternClick).toHaveBeenCalledWith(mockPatterns[0]);
    } else {
      // If pattern-card selector doesn't work, try to find another way
      // This is a fallback for testing purposes
      fail('Pattern card not found');
    }
  });

  it('gracefully handles empty pattern array', () => {
    render(<PatternList patterns={[]} />);
    expect(screen.getByText(/no patterns found/i)).toBeInTheDocument();
  });

  it('handles null values in pattern objects', () => {
    const patternsWithNulls: Pattern[] = [
      {
        id: 4,
        name: null as any, // Testing null name handling
        description: 'This pattern has a null name',
        frequency: 0.3,
        category: 'Habit',
        evidence: [],
        sentiment: 0,
      },
      {
        id: 5,
        name: 'Valid Pattern',
        description: null as any, // Testing null description
        frequency: null as any, // Testing null frequency
        category: null as any, // Testing null category
        evidence: null as any, // Testing null evidence
        sentiment: null as any, // Testing null sentiment
      },
    ];

    // Should render without crashing
    render(<PatternList patterns={patternsWithNulls} />);
    
    // Even with null name, the pattern should appear under Uncategorized
    expect(screen.getByText('Uncategorized')).toBeInTheDocument();
    expect(screen.getByText('Valid Pattern')).toBeInTheDocument();
  });
});
