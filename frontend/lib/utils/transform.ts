import type {
  InterviewData,
  InterviewDataset,
  Theme,
  Pattern,
  Sentiment,
  AnalysisResults,
} from '@/types/api'

/**
 * Formats a date string into a localized date string
 */
export function formatDate(date: string | Date, locale: string = 'en-US'): string {
  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(dateObj)
  } catch (error) {
    console.error('Error formatting date:', error)
    return String(date)
  }
}

/**
 * Formats file size in bytes to human readable format
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`
}

/**
 * Formats duration in minutes to human readable format
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (hours === 0) return `${minutes} minutes`
  if (remainingMinutes === 0) return `${hours} hours`
  return `${hours} hours ${remainingMinutes} minutes`
}

/**
 * Normalizes interview data from various formats
 */
export function normalizeInterviewData(data: unknown): InterviewDataset {
  // Handle string input (JSON)
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch (error) {
      throw new Error('Invalid JSON string')
    }
  }

  // Handle null/undefined
  if (!data) {
    throw new Error('No data provided')
  }

  // Handle single interview
  if (!Array.isArray(data) && typeof data === 'object' && 'text' in data) {
    return {
      interviews: [normalizeInterview(data as Partial<InterviewData>)],
    }
  }

  // Handle array of interviews
  if (Array.isArray(data)) {
    return {
      interviews: data.map(interview => normalizeInterview(interview)),
    }
  }

  // Handle full dataset
  if (typeof data === 'object' && 'interviews' in data) {
    const dataset = data as Partial<InterviewDataset>
    return {
      interviews: (dataset.interviews || []).map(interview => normalizeInterview(interview)),
      project: dataset.project,
    }
  }

  throw new Error('Invalid data format')
}

/**
 * Normalizes a single interview
 */
function normalizeInterview(data: Partial<InterviewData>): InterviewData {
  return {
    interview_id: data.interview_id || generateId(),
    participant: data.participant || 'Anonymous',
    date: data.date || new Date().toISOString(),
    duration: data.duration || 'unknown',
    text: data.text || '',
    metadata: data.metadata || {},
  }
}

/**
 * Formats analysis results for display
 */
export function formatAnalysisResults(results: AnalysisResults): {
  themes: string[]
  patterns: string[]
  sentiment: string
  confidence: number
} {
  const defaultResult = {
    themes: [],
    patterns: [],
    sentiment: 'neutral',
    confidence: 0,
  }

  if (!results.results) return defaultResult

  const { themes = [], patterns = [], sentiment } = results.results

  return {
    themes: themes.map(formatTheme),
    patterns: patterns.map(formatPattern),
    sentiment: formatSentiment(sentiment),
    confidence: calculateConfidence(results.results),
  }
}

/**
 * Formats a theme for display
 */
function formatTheme(theme: Theme): string {
  return `${theme.name} (${Math.round(theme.confidence * 100)}% confidence)`
}

/**
 * Formats a pattern for display
 */
function formatPattern(pattern: Pattern): string {
  return `${pattern.description} (found ${pattern.frequency} times)`
}

/**
 * Formats sentiment for display
 */
function formatSentiment(sentiment?: Sentiment): string {
  if (!sentiment) return 'neutral'
  
  const score = sentiment.score || 0
  const overall = sentiment.overall || 'neutral'
  return `${overall} (${Math.round(score * 100)}% positive)`
}

/**
 * Calculates overall confidence score
 */
function calculateConfidence(results: NonNullable<AnalysisResults['results']>): number {
  const themeConfidence = results.themes?.reduce((acc, theme) => acc + theme.confidence, 0) || 0
  const totalThemes = results.themes?.length || 1
  return Math.round((themeConfidence / totalThemes) * 100)
}

/**
 * Generates a unique ID
 */
function generateId(): string {
  return `interview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Groups interviews by metadata field
 */
export function groupInterviewsByMetadata(
  interviews: InterviewData[],
  field: string
): Record<string, InterviewData[]> {
  return interviews.reduce((groups, interview) => {
    const value = interview.metadata?.[field] || 'unknown'
    return {
      ...groups,
      [value]: [...(groups[value] || []), interview],
    }
  }, {} as Record<string, InterviewData[]>)
}

/**
 * Extracts unique metadata fields from interviews
 */
export function getUniqueMetadataFields(interviews: InterviewData[]): string[] {
  const fields = new Set<string>()
  interviews.forEach(interview => {
    if (interview.metadata) {
      Object.keys(interview.metadata).forEach(key => fields.add(key))
    }
  })
  return Array.from(fields)
}