import type { AnalyzedTheme as ThemeType } from '@/types/api';

export interface AnalyzedTheme {
  id: string;
  name: string;
  prevalence: number;
  frequency: number;
  sentiment: number;
  keywords: string[];
  statements: string[];
  definition: string;
  codes: string[];
  reliability: number;
  process: string;
}

export const mockThemes: ThemeType[] = [
  {
    id: 'theme-1',
    name: 'Career Growth',
    prevalence: 0.65,
    frequency: 0.65,
    sentiment: 0.3,
    keywords: ['career', 'promotion', 'growth', 'advancement', 'development'],
    statements: [
      'Employees want clearer promotion paths',
      'Mentorship program requests'
    ],
    definition: 'Discussions around professional advancement and skill development',
    codes: ['HR', 'Professional Development'],
    reliability: 0.82,
    process: 'enhanced'
  },
  {
    id: 'theme-2',
    name: 'Work-Life Balance',
    prevalence: 0.55,
    frequency: 0.55,
    sentiment: -0.2,
    keywords: ['balance', 'hours', 'flexibility', 'remote', 'burnout'],
    statements: [
      'Too many late night meetings',
      'Need more flexible work arrangements'
    ],
    definition: 'Topics related to managing professional responsibilities with personal life',
    codes: ['Wellbeing', 'Culture'],
    reliability: 0.78,
    process: 'enhanced'
  },
  {
    id: 'theme-3',
    name: 'Communication',
    prevalence: 0.45,
    frequency: 0.45,
    sentiment: 0.1,
    keywords: ['communication', 'transparency', 'meetings', 'updates'],
    statements: [
      'More regular updates from leadership would help',
      'Team communication could be improved'
    ],
    definition: 'Discussions about information flow between teams and leadership',
    codes: ['Internal Processes', 'Leadership'],
    reliability: 0.75,
    process: 'basic'
  }
];

export const mockPatterns = [
  { id: 'pattern-1', name: 'Feedback Frequency', count: 12, category: 'Communication', description: 'Regular feedback was mentioned across teams', frequency: 0.38, sentiment: 0.2 },
  { id: 'pattern-2', name: 'Remote Work', count: 9, category: 'Work Environment', description: 'Discussions around remote work flexibility', frequency: 0.28, sentiment: 0.4 },
  { id: 'pattern-3', name: 'Meeting Efficiency', count: 7, category: 'Productivity', description: 'Concerns about meeting length and frequency', frequency: 0.22, sentiment: -0.3 }
];

export const mockSentimentOverview = {
  positive: 62,
  neutral: 28,
  negative: 10
};

export const mockSentimentData = {
  labels: ['Very Negative', 'Negative', 'Neutral', 'Positive', 'Very Positive'],
  values: [5, 15, 30, 35, 15],
  statements: {
    positive: [
      "The new training program has been very helpful for my team.",
      "I appreciate the flexibility to work remotely when needed."
    ],
    neutral: [
      "The office layout is functional but could use updates.",
      "Team meetings are regular but sometimes run too long."
    ],
    negative: [
      "Communication between departments needs improvement.",
      "The performance review process feels arbitrary."
    ]
  }
};
