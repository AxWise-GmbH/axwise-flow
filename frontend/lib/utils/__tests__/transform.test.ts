import {
  formatDate,
  formatFileSize,
  formatDuration,
  normalizeInterviewData,
  formatAnalysisResults,
  groupInterviewsByMetadata,
  getUniqueMetadataFields,
} from '../transform'
import type { InterviewData, AnalysisResults } from '@/types/api'

describe('Transform Utilities', () => {
  const mockDate = new Date('2025-02-19T12:00:00Z')

  describe('formatDate', () => {
    it('should format date strings correctly', () => {
      const result = formatDate('2025-02-19T12:00:00Z', 'en-US')
      expect(result).toMatch(/February 19, 2025/)
    })

    it('should handle invalid dates gracefully', () => {
      const result = formatDate('invalid-date')
      expect(result).toBe('invalid-date')
    })
  })

  describe('formatFileSize', () => {
    it('should format bytes correctly', () => {
      expect(formatFileSize(500)).toBe('500.0 B')
      expect(formatFileSize(1024)).toBe('1.0 KB')
      expect(formatFileSize(1024 * 1024)).toBe('1.0 MB')
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB')
    })
  })

  describe('formatDuration', () => {
    it('should format minutes correctly', () => {
      expect(formatDuration(30)).toBe('30 minutes')
      expect(formatDuration(60)).toBe('1 hours')
      expect(formatDuration(90)).toBe('1 hours 30 minutes')
    })
  })

  describe('normalizeInterviewData', () => {
    it('should handle JSON string input', () => {
      const jsonString = JSON.stringify({
        interviews: [{
          interview_id: '1',
          participant: 'Test User',
          date: '2025-02-19',
          text: 'Test content'
        }]
      })

      const result = normalizeInterviewData(jsonString)
      expect(result.interviews).toHaveLength(1)
      expect(result.interviews[0].participant).toBe('Test User')
    })

    it('should handle single interview object', () => {
      const singleInterview = {
        text: 'Test content',
        participant: 'Test User'
      }

      const result = normalizeInterviewData(singleInterview)
      expect(result.interviews).toHaveLength(1)
      expect(result.interviews[0].text).toBe('Test content')
    })

    it('should provide default values for missing fields', () => {
      const minimalData = {
        interviews: [{ text: 'Test content' }]
      }

      const result = normalizeInterviewData(minimalData)
      expect(result.interviews[0].participant).toBe('Anonymous')
      expect(result.interviews[0].interview_id).toBeDefined()
    })

    it('should throw error for invalid data', () => {
      expect(() => normalizeInterviewData(null)).toThrow('No data provided')
      expect(() => normalizeInterviewData('invalid json')).toThrow('Invalid JSON string')
    })
  })

  describe('formatAnalysisResults', () => {
    const mockResults: AnalysisResults = {
      status: 'completed',
      results: {
        themes: [
          { id: '1', name: 'Theme 1', confidence: 0.8, examples: ['example'] }
        ],
        patterns: [
          { id: '1', description: 'Pattern 1', frequency: 3, examples: ['example'] }
        ],
        sentiment: {
          overall: 'positive',
          score: 0.75,
          breakdown: { positive: 0.75, negative: 0.15, neutral: 0.1 }
        }
      }
    }

    it('should format analysis results correctly', () => {
      const formatted = formatAnalysisResults(mockResults)
      expect(formatted.themes).toContain('Theme 1 (80% confidence)')
      expect(formatted.patterns).toContain('Pattern 1 (found 3 times)')
      expect(formatted.sentiment).toContain('positive (75% positive)')
    })

    it('should handle missing results gracefully', () => {
      const emptyResults: AnalysisResults = { status: 'completed' }
      const formatted = formatAnalysisResults(emptyResults)
      expect(formatted.themes).toHaveLength(0)
      expect(formatted.sentiment).toBe('neutral')
    })
  })

  describe('groupInterviewsByMetadata', () => {
    const mockInterviews: InterviewData[] = [
      {
        interview_id: '1',
        participant: 'User 1',
        date: '2025-02-19',
        duration: '30m',
        text: 'content',
        metadata: { role: 'developer' }
      },
      {
        interview_id: '2',
        participant: 'User 2',
        date: '2025-02-19',
        duration: '30m',
        text: 'content',
        metadata: { role: 'designer' }
      }
    ]

    it('should group interviews by metadata field', () => {
      const grouped = groupInterviewsByMetadata(mockInterviews, 'role')
      expect(grouped.developer).toHaveLength(1)
      expect(grouped.designer).toHaveLength(1)
    })

    it('should handle missing metadata gracefully', () => {
      const interviews = [
        ...mockInterviews,
        {
          interview_id: '3',
          participant: 'User 3',
          date: '2025-02-19',
          duration: '30m',
          text: 'content'
        }
      ]

      const grouped = groupInterviewsByMetadata(interviews, 'role')
      expect(grouped.unknown).toHaveLength(1)
    })
  })

  describe('getUniqueMetadataFields', () => {
    it('should return unique metadata fields', () => {
      const interviews: InterviewData[] = [
        {
          interview_id: '1',
          participant: 'User 1',
          date: '2025-02-19',
          duration: '30m',
          text: 'content',
          metadata: { role: 'developer', age: 30 }
        },
        {
          interview_id: '2',
          participant: 'User 2',
          date: '2025-02-19',
          duration: '30m',
          text: 'content',
          metadata: { role: 'designer', experience: '5 years' }
        }
      ]

      const fields = getUniqueMetadataFields(interviews)
      expect(fields).toContain('role')
      expect(fields).toContain('age')
      expect(fields).toContain('experience')
      expect(fields).toHaveLength(3)
    })

    it('should handle interviews without metadata', () => {
      const interviews: InterviewData[] = [
        {
          interview_id: '1',
          participant: 'User 1',
          date: '2025-02-19',
          duration: '30m',
          text: 'content'
        }
      ]

      const fields = getUniqueMetadataFields(interviews)
      expect(fields).toHaveLength(0)
    })
  })
})