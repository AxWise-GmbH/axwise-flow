import {
  validateInterviewDataset,
  validateInterview,
  isValidDate,
  isValidDateRange,
  isValidAge,
  validateRules,
  commonRules,
} from '../validation'

describe('Validation Utilities', () => {
  describe('validateInterviewDataset', () => {
    it('should validate a valid dataset', () => {
      const validDataset = {
        interviews: [
          {
            interview_id: '1',
            participant: 'John Doe',
            date: '2025-02-19',
            duration: '30 minutes',
            text: 'Interview content',
          },
        ],
        project: {
          name: 'Test Project',
          date_range: '2025-02-19 to 2025-02-20',
        },
      }

      const result = validateInterviewDataset(validDataset)
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject invalid dataset format', () => {
      const result = validateInterviewDataset('not an object')
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Invalid data format: must be an object')
    })

    it('should require at least one interview', () => {
      const emptyDataset = {
        interviews: [],
        project: { name: 'Test Project' },
      }

      const result = validateInterviewDataset(emptyDataset)
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Dataset must contain at least one interview')
    })
  })

  describe('validateInterview', () => {
    it('should validate a valid interview', () => {
      const validInterview = {
        interview_id: '1',
        participant: 'John Doe',
        date: '2025-02-19',
        duration: '30 minutes',
        text: 'Interview content',
      }

      const result = validateInterview(validInterview)
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should require all mandatory fields', () => {
      const invalidInterview = {
        interview_id: '1',
        // missing participant
        date: '2025-02-19',
        duration: '30 minutes',
        // missing text
      }

      const result = validateInterview(invalidInterview)
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Participant is required')
      expect(result.errors).toContain('Interview text is required')
    })

    it('should validate metadata if present', () => {
      const interviewWithInvalidMetadata = {
        interview_id: '1',
        participant: 'John Doe',
        date: '2025-02-19',
        duration: '30 minutes',
        text: 'Interview content',
        metadata: {
          age: 150, // invalid age
        },
      }

      const result = validateInterview(interviewWithInvalidMetadata)
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Invalid age in metadata')
    })
  })

  describe('Date Validation', () => {
    it('should validate correct dates', () => {
      expect(isValidDate('2025-02-19')).toBe(true)
      expect(isValidDate('2025-02-19T12:00:00Z')).toBe(true)
    })

    it('should reject invalid dates', () => {
      expect(isValidDate('not a date')).toBe(false)
      expect(isValidDate('2025-13-45')).toBe(false)
    })

    it('should validate date ranges', () => {
      expect(isValidDateRange('2025-02-19 to 2025-02-20')).toBe(true)
      expect(isValidDateRange('not a range')).toBe(false)
    })
  })

  describe('Age Validation', () => {
    it('should validate valid ages', () => {
      expect(isValidAge(25)).toBe(true)
      expect(isValidAge(0)).toBe(true)
      expect(isValidAge(120)).toBe(true)
    })

    it('should reject invalid ages', () => {
      expect(isValidAge(-1)).toBe(false)
      expect(isValidAge(121)).toBe(false)
      expect(isValidAge(NaN)).toBe(false)
    })
  })

  describe('Common Rules', () => {
    it('should validate required fields', () => {
      const { required } = commonRules
      expect(required.test('value')).toBe(true)
      expect(required.test('')).toBe(false)
      expect(required.test(null)).toBe(false)
      expect(required.test(undefined)).toBe(false)
    })

    it('should validate string length', () => {
      const minLength3 = commonRules.minLength(3)
      const maxLength5 = commonRules.maxLength(5)

      expect(minLength3.test('abc')).toBe(true)
      expect(minLength3.test('ab')).toBe(false)

      expect(maxLength5.test('12345')).toBe(true)
      expect(maxLength5.test('123456')).toBe(false)
    })

    it('should validate JSON format', () => {
      const { isJSON } = commonRules
      expect(isJSON.test('{"valid": "json"}')).toBe(true)
      expect(isJSON.test('invalid json')).toBe(false)
    })
  })

  describe('validateRules', () => {
    it('should validate multiple rules', () => {
      const rules = [
        commonRules.required,
        commonRules.minLength(3),
        commonRules.maxLength(5),
      ]

      const result = validateRules('1234', rules)
      expect(result.isValid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should collect all validation errors', () => {
      const rules = [
        commonRules.required,
        commonRules.minLength(3),
        commonRules.maxLength(5),
      ]

      const result = validateRules('a', rules)
      expect(result.isValid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('Minimum length is 3')
    })
  })
})