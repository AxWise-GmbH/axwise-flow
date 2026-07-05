import type {
  BusinessContext,
  PipelineExecutionResult,
  PipelineRunDetail,
  PersonaDatasetSummary,
} from './types';

/**
 * Extract text content from personas for search indexing
 */
function extractPersonaSearchText(personas: Record<string, unknown>[]): string {
  return personas
    .map((persona) => {
      const parts: string[] = [];
      
      // Extract common persona fields
      if (persona.name) parts.push(String(persona.name));
      if (persona.role) parts.push(String(persona.role));
      if (persona.title) parts.push(String(persona.title));
      
      // Extract goals
      if (Array.isArray(persona.goals)) {
        parts.push(...persona.goals.map(String));
      }
      
      // Extract pains/pain_points
      if (Array.isArray(persona.pains)) {
        parts.push(...persona.pains.map(String));
      }
      if (Array.isArray(persona.pain_points)) {
        parts.push(...persona.pain_points.map(String));
      }
      
      // Extract top_pains
      if (Array.isArray(persona.top_pains)) {
        parts.push(...persona.top_pains.map(String));
      }
      
      return parts.join(' ');
    })
    .join('\n');
}

/**
 * Determine dataset status based on pipeline status and quality
 */
function determineDatasetStatus(
  pipelineStatus: string,
  qualityScore?: number,
): 'draft' | 'validated' | 'live' {
  if (pipelineStatus === 'failed' || pipelineStatus === 'pending') {
    return 'draft';
  }
  
  // If quality score is high enough, mark as validated
  // For now, use a simple threshold; can be made configurable later
  if (qualityScore !== undefined && qualityScore >= 0.7) {
    return 'validated';
  }
  
  // Default to draft for completed runs without high quality
  return 'draft';
}

/**
 * Extract quality score from dataset quality object
 */
function extractQualityScore(quality?: Record<string, unknown>): number | undefined {
  if (!quality) return undefined;
  
  // Try common quality score field names
  if (typeof quality.score === 'number') return quality.score;
  if (typeof quality.overall_score === 'number') return quality.overall_score;
  if (typeof quality.quality_score === 'number') return quality.quality_score;
  if (typeof quality.average_persona_confidence === 'number') {
    return quality.average_persona_confidence;
  }
  
  return undefined;
}

/**
 * Generate tags from business context
 */
function generateTags(context: BusinessContext): string[] {
  const tags: string[] = [];
  
  if (context.industry) tags.push(context.industry);
  if (context.location) tags.push(context.location);
  
  // Add use-case tags based on context (can be enhanced later)
  // For now, all datasets are tagged as suitable for all use cases
  tags.push('CV', 'Recommender', 'Marketing');
  
  return tags;
}

/**
 * Build a search-ready PersonaDatasetSummary from pipeline execution result
 */
export function buildDatasetSummaryFromResult(
  context: BusinessContext,
  result: PipelineExecutionResult,
  jobId: string,
  createdAt: string,
): PersonaDatasetSummary {
  const dataset = result.dataset;
  const datasetId = dataset?.scope_id || `dataset_${jobId}`;
  
  // Build title from business idea and location
  const titleParts: string[] = [];
  if (context.location) titleParts.push(context.location);
  if (context.industry) titleParts.push(context.industry);
  if (context.target_customer) titleParts.push(context.target_customer);
  const title = titleParts.join(' – ') || context.business_idea || 'Untitled Dataset';
  
  // Build subtitle from business idea or problem
  const subtitle = context.business_idea || context.problem || 'No description';
  
  // Extract metrics
  const personasCount = dataset?.personas?.length || 0;
  const interviewsCount = dataset?.interviews?.length || 0;
  const qualityScore = extractQualityScore(dataset?.quality);
  
  // Determine status
  const status = determineDatasetStatus(result.status, qualityScore);
  
  // Generate tags
  const tags = generateTags(context);
  
  // Build comprehensive search text
  const searchTextParts: string[] = [
    context.business_idea,
    context.target_customer,
    context.problem,
    context.industry,
    context.location,
  ].filter(Boolean);
  
  if (dataset?.personas) {
    searchTextParts.push(extractPersonaSearchText(dataset.personas));
  }
  
  const searchText = searchTextParts.join('\n');
  
  return {
    datasetId,
    version: 'v1', // Default version for now
    title,
    subtitle,
    status,
    tags,
    personasCount,
    interviewsCount,
    qualityScore,
    createdAt,
    searchText,
    jobId,
  };
}

/**
 * Build a search-ready PersonaDatasetSummary from pipeline run detail
 */
export function buildDatasetSummaryFromRunDetail(
  runDetail: PipelineRunDetail,
): PersonaDatasetSummary {
  const result: PipelineExecutionResult = {
    dataset: runDetail.dataset,
    execution_trace: runDetail.execution_trace,
    total_duration_seconds: runDetail.total_duration_seconds || 0,
    status: runDetail.status === 'completed'
      ? 'completed'
      : runDetail.status === 'failed'
      ? 'failed'
      : 'partial',
  };
  
  return buildDatasetSummaryFromResult(
    runDetail.business_context,
    result,
    runDetail.job_id,
    runDetail.created_at,
  );
}

