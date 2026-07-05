import type { InterviewData, InterviewDataset, AnalysisResults } from '@/types/api'

/**
 * Mock interview data for testing
 */
export const mockInterviewData: InterviewData = {
  interview_id: 'test_001',
  participant: 'John Doe',
  date: '2025-02-19',
  duration: '30 minutes',
  text: 'Test interview content',
  metadata: {
    role: 'developer',
    age: 30,
    experience: '5 years'
  }
}

/**
 * Mock interview dataset for testing
 */
export const mockDataset: InterviewDataset = {
  interviews: [
    mockInterviewData,
    {
      interview_id: 'test_002',
      participant: 'Jane Smith',
      date: '2025-02-19',
      duration: '45 minutes',
      text: 'Another test interview',
      metadata: {
        role: 'designer',
        age: 28,
        experience: '3 years'
      }
    }
  ],
  project: {
    name: 'Test Project',
    description: 'A test project for unit tests',
    date_range: '2025-02-19 to 2025-02-20'
  }
}

/**
 * Mock analysis results for testing
 */
export const mockAnalysisResults: AnalysisResults = {
  status: 'completed',
  result_id: 123,
  analysis_date: '2025-02-19T12:00:00Z',
  results: {
    themes: [
      {
        id: 'theme_1',
        name: 'User Experience',
        confidence: 0.85,
        examples: ['Example 1', 'Example 2']
      },
      {
        id: 'theme_2',
        name: 'Performance',
        confidence: 0.75,
        examples: ['Example 3', 'Example 4']
      }
    ],
    patterns: [
      {
        id: 'pattern_1',
        description: 'Frequent mentions of loading time',
        frequency: 5,
        examples: ['Example 1', 'Example 2']
      }
    ],
    sentiment: {
      overall: 'positive',
      score: 0.75,
      breakdown: {
        positive: 0.75,
        negative: 0.15,
        neutral: 0.10
      }
    }
  },
  llm_provider: 'openai',
  llm_model: 'gpt-4o-2024-08-06'
}

/**
 * Test utilities
 */

/**
 * Creates a mock file for testing
 */
export function createMockFile(content: string, type = 'application/json'): File {
  return new File([content], 'test.json', { type })
}

/**
 * Formats a date for comparison in tests
 */
export function formatTestDate(date: string | Date): string {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Helper to simulate file upload in tests
 */
export async function simulateFileUpload(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

/**
 * Test matchers
 */
export const testMatchers = {
  toBeValidDate: () => ({
    pass: (received: string) => {
      const date = new Date(received)
      return !isNaN(date.getTime())
    },
    message: () => 'expected to be a valid date'
  }),
  toBeValidFileSize: () => ({
    pass: (received: string) => {
      const pattern = /^\d+(\.\d+)?\s*(B|KB|MB|GB)$/
      return pattern.test(received)
    },
    message: () => 'expected to be a valid file size string'
  })
}

/**
 * Test error messages
 */
export const testErrors = {
  invalidJson: 'Invalid JSON format',
  invalidDate: 'Invalid date format',
  invalidFileType: 'Invalid file type',
  invalidDataFormat: 'Invalid data format',
  unauthorized: 'Not authenticated',
  notFound: 'Resource not found'
}