import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import VisualizationTabsRefactored from '../VisualizationTabs.refactored';
import * as storeHooks from '@/store/useDashboardStore.refactored';
import * as containerHooks from '../DashboardVisualizationContainer';

// Mock the required hooks and dependencies
jest.mock('@/store/useDashboardStore.refactored', () => ({
  useVisualizationTab: jest.fn(),
}));

jest.mock('../DashboardVisualizationContainer', () => ({
  useVisualizationContext: jest.fn(),
}));

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  useSearchParams: () => ({
    get: jest.fn(),
    toString: () => '',
  }),
}));

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    pathname: '/test-path',
  },
  writable: true,
});

describe('VisualizationTabsRefactored', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  it('renders analysis results with correct metadata', () => {
    // Mock visualization context
    (containerHooks.useVisualizationContext as jest.Mock).mockReturnValue({
      analysis: {
        id: '123',
        fileName: 'interview.txt',
        createdAt: '2023-01-01T12:00:00Z',
        llmProvider: 'OpenAI',
        themes: [{ id: 1, name: 'Test Theme', frequency: 5, keywords: [] }],
        patterns: [],
        sentiment: [],
        sentimentOverview: { positive: 0, neutral: 0, negative: 0 },
      },
      isLoading: false,
      activeTab: 'themes',
    });
    
    // Mock tab state
    (storeHooks.useVisualizationTab as jest.Mock).mockReturnValue({
      tab: 'themes',
      setTab: jest.fn(),
    });
    
    render(<VisualizationTabsRefactored />);
    
    // Check if metadata is displayed correctly
    expect(screen.getByText('Analysis Results: interview.txt')).toBeInTheDocument();
    expect(screen.getByText(/Created.*OpenAI Analysis/)).toBeInTheDocument();
  });
  
  it('displays themes tab content when themes tab is active', () => {
    // Mock visualization context with themes
    (containerHooks.useVisualizationContext as jest.Mock).mockReturnValue({
      analysis: {
        id: '123',
        fileName: 'interview.txt',
        createdAt: '2023-01-01T12:00:00Z',
        themes: [{ id: 1, name: 'Test Theme', frequency: 5, keywords: [] }],
        patterns: [],
        sentiment: [],
        sentimentOverview: { positive: 0, neutral: 0, negative: 0 },
      },
      isLoading: false,
      activeTab: 'themes',
    });
    
    // Mock tab state
    (storeHooks.useVisualizationTab as jest.Mock).mockReturnValue({
      tab: 'themes',
      setTab: jest.fn(),
    });
    
    // Mock ThemeChart component
    jest.mock('../ThemeChart', () => ({
      ThemeChart: () => <div data-testid="theme-chart">Theme Chart Content</div>,
    }));
    
    render(<VisualizationTabsRefactored />);
    
    // Check if tabs are displayed
    expect(screen.getByRole('tab', { name: 'Themes' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Patterns' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Sentiment' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Personas' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Priority' })).toBeInTheDocument();
  });
  
  it('calls setTab when a different tab is clicked', () => {
    const setTabMock = jest.fn();
    
    // Mock visualization context
    (containerHooks.useVisualizationContext as jest.Mock).mockReturnValue({
      analysis: {
        id: '123',
        fileName: 'interview.txt',
        createdAt: '2023-01-01T12:00:00Z',
        themes: [{ id: 1, name: 'Test Theme', frequency: 5, keywords: [] }],
        patterns: [{ id: 1, name: 'Test Pattern', category: 'test', description: 'description', frequency: 3 }],
        sentiment: [],
        sentimentOverview: { positive: 0, neutral: 0, negative: 0 },
      },
      isLoading: false,
      activeTab: 'themes',
    });
    
    // Mock tab state
    (storeHooks.useVisualizationTab as jest.Mock).mockReturnValue({
      tab: 'themes',
      setTab: setTabMock,
    });
    
    render(<VisualizationTabsRefactored />);
    
    // Click on patterns tab
    fireEvent.click(screen.getByRole('tab', { name: 'Patterns' }));
    
    // Check if setTab was called
    expect(setTabMock).toHaveBeenCalledWith('patterns');
  });
  
  it('displays "no data" message when there is no data for a tab', () => {
    // Mock visualization context with no themes
    (containerHooks.useVisualizationContext as jest.Mock).mockReturnValue({
      analysis: {
        id: '123',
        fileName: 'interview.txt',
        createdAt: '2023-01-01T12:00:00Z',
        themes: [],
        patterns: [],
        sentiment: [],
        sentimentOverview: { positive: 0, neutral: 0, negative: 0 },
      },
      isLoading: false,
      activeTab: 'themes',
    });
    
    // Mock tab state
    (storeHooks.useVisualizationTab as jest.Mock).mockReturnValue({
      tab: 'themes',
      setTab: jest.fn(),
    });
    
    render(<VisualizationTabsRefactored />);
    
    // Check if "no data" message is displayed
    expect(screen.getByText('No themes detected in this interview.')).toBeInTheDocument();
  });
  
  it('initializes tab from URL parameter if present', () => {
    const setTabMock = jest.fn();
    
    // Mock visualization context
    (containerHooks.useVisualizationContext as jest.Mock).mockReturnValue({
      analysis: {
        id: '123',
        fileName: 'interview.txt',
        createdAt: '2023-01-01T12:00:00Z',
        themes: [],
        patterns: [],
        sentiment: [],
        sentimentOverview: { positive: 0, neutral: 0, negative: 0 },
      },
      isLoading: false,
      activeTab: 'themes',
    });
    
    // Mock useSearchParams to return a tab
    jest.spyOn(require('next/navigation'), 'useSearchParams').mockReturnValue({
      get: jest.fn().mockReturnValue('patterns'),
      toString: () => 'tab=patterns',
    });
    
    // Mock tab state
    (storeHooks.useVisualizationTab as jest.Mock).mockReturnValue({
      tab: 'themes',
      setTab: setTabMock,
    });
    
    render(<VisualizationTabsRefactored />);
    
    // Check if setTab was called with the URL parameter
    expect(setTabMock).toHaveBeenCalledWith('patterns');
  });
});
