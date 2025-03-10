import type { ValidationResult, ValidationRule, InterviewDataset, InterviewData } from '@/types/api'

/**
 * Validates an interview dataset
 */
export function validateInterviewDataset(data: unknown): ValidationResult {
  const errors: string[] = []

  try {
    // Type guard
    if (!data || typeof data !== 'object') {
      return {
        isValid: false,
        errors: ['Invalid data format: must be an object'],
      }
    }

    const dataset = data as InterviewDataset

    // Validate interviews array exists and is not empty
    if (!Array.isArray(dataset.interviews) || dataset.interviews.length === 0) {
      errors.push('Dataset must contain at least one interview')
      return { isValid: false, errors }
    }

    // Validate each interview
    dataset.interviews.forEach((interview, index) => {
      const interviewErrors = validateInterview(interview)
      if (!interviewErrors.isValid) {
        errors.push(`Interview ${index + 1}: ${interviewErrors.errors.join(', ')}`)
      }
    })

    // Validate project data if present
    if (dataset.project) {
      if (!dataset.project.name) {
        errors.push('Project must have a name')
      }
      if (dataset.project.date_range && !isValidDateRange(dataset.project.date_range)) {
        errors.push('Invalid project date range format')
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  } catch (error) {
    return {
      isValid: false,
      errors: [(error as Error).message || 'Invalid data format'],
    }
  }
}

/**
 * Validates a single interview
 */
export function validateInterview(interview: unknown): ValidationResult {
  const errors: string[] = []

  try {
    if (!interview || typeof interview !== 'object') {
      return {
        isValid: false,
        errors: ['Interview must be an object'],
      }
    }

    const data = interview as InterviewData

    // Required fields
    if (!data.interview_id) errors.push('Interview ID is required')
    if (!data.participant) errors.push('Participant is required')
    if (!data.date) errors.push('Date is required')
    if (!data.text || data.text.trim().length === 0) errors.push('Interview text is required')

    // Validate date format
    if (data.date && !isValidDate(data.date)) {
      errors.push('Invalid date format')
    }

    // Validate metadata if present
    if (data.metadata) {
      if (typeof data.metadata !== 'object') {
        errors.push('Metadata must be an object')
      } else {
        if (data.metadata.age && !isValidAge(data.metadata.age)) {
          errors.push('Invalid age in metadata')
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  } catch (error) {
    return {
      isValid: false,
      errors: [(error as Error).message || 'Invalid interview data'],
    }
  }
}

/**
 * Helper function to validate date format
 */
export function isValidDate(dateStr: string): boolean {
  const date = new Date(dateStr)
  return date instanceof Date && !isNaN(date.getTime())
}

/**
 * Helper function to validate date range format
 */
export function isValidDateRange(range: string): boolean {
  const [start, end] = range.split(' to ')
  return isValidDate(start) && isValidDate(end)
}

/**
 * Helper function to validate age
 */
export function isValidAge(age: number): boolean {
  return typeof age === 'number' && age >= 0 && age <= 120
}

/**
 * Create a type-safe validation rule
 */
export function createValidationRule<T>(rule: ValidationRule<T>): ValidationRule<T> {
  return rule
}

/**
 * Run multiple validation rules
 */
export function validateRules<T>(value: T, rules: ValidationRule<T>[]): ValidationResult {
  const errors: string[] = []

  rules.forEach(rule => {
    if (!rule.test(value)) {
      errors.push(rule.message)
    }
  })

  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Common validation rules
 */
export const commonRules = {
  required: createValidationRule({
    test: (value: unknown) => value !== undefined && value !== null && value !== '',
    message: 'This field is required',
  }),
  minLength: (min: number) =>
    createValidationRule({
      test: (value: string) => value.length >= min,
      message: `Minimum length is ${min} characters`,
    }),
  maxLength: (max: number) =>
    createValidationRule({
      test: (value: string) => value.length <= max,
      message: `Maximum length is ${max} characters`,
    }),
  isJSON: createValidationRule({
    test: (value: string) => {
      try {
        JSON.parse(value)
        return true
      } catch {
        return false
      }
    },
    message: 'Invalid JSON format',
  }),
}