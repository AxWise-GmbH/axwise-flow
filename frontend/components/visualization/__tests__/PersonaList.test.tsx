import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PersonaList } from '../PersonaList'; // Ensure named import
import type { Persona } from '../PersonaList';

// Mock data for personas
const mockPersonas: Persona[] = [
  {
    name: 'Data Analyst',
    description: 'Technical expert focused on extracting insights from data',
    role_context: {
      value: 'Works in business intelligence team',
      confidence: 0.85,
      evidence: ['Multiple participants mentioned BI role']
    },
    key_responsibilities: {
      value: ['Data processing', 'Report creation', 'Dashboard maintenance'],
      confidence: 0.9,
      evidence: ['Interview 2: "I create reports daily"']
    },
    tools_used: {
      value: ['Excel', 'SQL', 'Tableau'],
      confidence: 0.8,
      evidence: ['Survey responses mentioned these tools frequently']
    },
    collaboration_style: {
      value: 'Collaborative, works closely with stakeholders',
      confidence: 0.75,
      evidence: ['Observed collaboration in workflow study']
    },
    analysis_approach: {
      value: 'Methodical, detail-oriented',
      confidence: 0.85,
      evidence: ['Consistent approach observed across interviews']
    },
    pain_points: {
      value: ['Data quality issues', 'Manual processes', 'Tool limitations'],
      confidence: 0.9,
      evidence: ['Common complaints across all interviews']
    },
    patterns: ['Data verification', 'Report automation'],
    confidence: 0.85,
    evidence: ['Based on 12 interviews and 24 survey responses']
  },
  {
    name: 'Product Manager',
    description: 'Decision maker who uses data insights for product planning',
    role_context: {
      value: 'Works in product development',
      confidence: 0.8,
      evidence: ['Role identified in 8 interviews']
    },
    key_responsibilities: {
      value: ['Feature planning', 'Stakeholder management', 'Roadmap development'],
      confidence: 0.85,
      evidence: ['Consistent responsibilities across interviews']
    },
    tools_used: {
      value: ['Jira', 'Analytics dashboards', 'Presentation software'],
      confidence: 0.75,
      evidence: ['Tool usage patterns identified']
    },
    collaboration_style: {
      value: 'Driver, takes initiative in cross-functional teams',
      confidence: 0.8,
      evidence: ['Described as taking lead role in meetings']
    },
    analysis_approach: {
      value: 'Holistic, customer-centric',
      confidence: 0.85,
      evidence: ['Focus on customer needs in decision making']
    },
    pain_points: {
      value: ['Lack of data insights', 'Slow feedback cycles', 'Resource constraints'],
      confidence: 0.85,
      evidence: ['Consistent frustrations mentioned']
    },
    patterns: ['Quick decision making', 'Stakeholder alignment'],
    confidence: 0.8,
    evidence: ['Based on 9 interviews and 15 survey responses']
  }
];

describe('PersonaList Component', () => {
  it('renders the persona list with tabs', () => {
    render(<PersonaList personas={mockPersonas} />);
    
    // Check if persona tabs are rendered
    expect(screen.getByText('Data Analyst')).toBeInTheDocument();
    expect(screen.getByText('Product Manager')).toBeInTheDocument();
    
    // Check if description is rendered
    expect(screen.getByText('Technical expert focused on extracting insights from data')).toBeInTheDocument();
  });
  
  it('switches between personas when tabs are clicked', async () => {
    render(<PersonaList personas={mockPersonas} />);
    
    const user = userEvent.setup();
    
    // Initial persona should be Data Analyst
    expect(screen.getByText('Technical expert focused on extracting insights from data')).toBeInTheDocument();
    
    // Click on Product Manager tab
    // Use getByRole with name for better accessibility testing
    const productManagerTab = screen.getByRole('button', { name: /product manager/i }); 
    await user.click(productManagerTab);
    
    // Check if Product Manager content is now visible
    expect(screen.getByText('Decision maker who uses data insights for product planning')).toBeInTheDocument();
  });
  
  it('displays persona traits and evidence', () => {
    render(<PersonaList personas={mockPersonas} />);
    
    // Check if traits are displayed (using the value from the mock data)
    expect(screen.getByText('Works in business intelligence team')).toBeInTheDocument(); 
    
    // Check if evidence is shown when available (assuming evidence button/section exists)
    // This might require adjusting selectors based on actual implementation of evidence display
    // For now, just check if the text exists somewhere
    expect(screen.getByText('Multiple participants mentioned BI role', { exact: false })).toBeInTheDocument(); 
    
    // Check for arrays displayed as lists
    expect(screen.getByText('Data processing')).toBeInTheDocument();
    expect(screen.getByText('Report creation')).toBeInTheDocument();
    expect(screen.getByText('Dashboard maintenance')).toBeInTheDocument();
  });
  
  it('displays confidence levels for each trait', () => {
    render(<PersonaList personas={mockPersonas} />);
    
    // Check if confidence values are displayed (formatted as percentages)
    // Use more specific queries if possible, e.g., within specific trait cards
    expect(screen.getAllByText(/85%/).length).toBeGreaterThan(0); // Overall and others
    expect(screen.getAllByText(/90%/).length).toBeGreaterThan(0); // Key responsibilities
  });
  
  it('handles empty personas array gracefully', () => {
    render(<PersonaList personas={[]} />);
    
    // Should show a message for no personas
    expect(screen.getByText(/no personas found/i)).toBeInTheDocument(); 
  });
  
  it('applies custom className when provided', () => {
    // Render with test ID and check using getByTestId
    const { container } = render(<PersonaList personas={mockPersonas} className="custom-class" />);
    
    // Check if the custom class is applied to the root Card element
    // Note: The component structure might place the className on a different root element. Adjust if needed.
    expect(container.firstChild).toHaveClass('custom-class'); 
  });
});
