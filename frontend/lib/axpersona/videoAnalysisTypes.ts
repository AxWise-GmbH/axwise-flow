/**
 * Video Analysis Types for Multimodal AI Pipeline
 * 
 * These types support the video simulation feature where an LLM analyzes
 * video content and generates department-specific overlays (Security, Marketing, Operations).
 */

// Department status and analysis types
export type SecurityStatus = 'Red' | 'Yellow' | 'Green';
export type MarketingSentiment = 'Positive' | 'Negative' | 'Neutral';
export type OperationsFlowRate = 'Fast' | 'Slow' | 'Stagnant';

export interface SecurityAnalysis {
  status: SecurityStatus;
  label: string;
  detail?: string;
  icon?: string;
}

export interface MarketingAnalysis {
  sentiment: MarketingSentiment;
  label: string;
  detail?: string;
  icon?: string;
}

export interface OperationsAnalysis {
  flow_rate: OperationsFlowRate;
  label: string;
  detail?: string;
  icon?: string;
}

export interface VideoAnnotation {
  id: string;
  timestamp_start: string; // "MM:SS" format
  timestamp_end: string;   // "MM:SS" format
  coordinates: [number, number, number, number]; // [x, y, width, height] as percentages 0-100
  description: string;
  departments: {
    security: SecurityAnalysis;
    marketing: MarketingAnalysis;
    operations: OperationsAnalysis;
  };
}

// ============================================================================
// Technical Analysis Types (Signs & Navigation Tab)
// ============================================================================

export type SignType = 'directional' | 'informational' | 'retail' | 'safety' | 'wayfinding' | 'digital';
export type Readability = 'clear' | 'moderate' | 'poor';
export type VelocityLevel = 'static' | 'slow' | 'moderate' | 'fast';

export interface SignageAnalysis {
  sign_text: string;
  sign_type: SignType;
  visibility_score: number; // 1-10
  readability: Readability;
  location_description: string;
  issues?: string[];
}

export interface AgentBehaviorAnalysis {
  agent_count: number;
  static_spectators: number;
  transit_passengers: number;
  avg_velocity: VelocityLevel;
  dominant_gaze_target?: string;
  awe_struck_count: number;
  conversion_opportunities: number;
}

export interface ObjectDetection {
  luggage_trolleys: number;
  smartphones_cameras: number;
  strollers: number;
  wheelchairs: number;
  shopping_bags: number;
}

export interface TechnicalAnnotation {
  id: string;
  timestamp_start: string;
  timestamp_end: string;
  linked_annotation_id?: string;
  signs_detected: SignageAnalysis[];
  agent_behavior?: AgentBehaviorAnalysis;
  objects?: ObjectDetection;
  navigational_stress_score: number; // 0-100
  purchase_intent_score: number; // 0-100
  attention_availability: number; // 0-100
  summary: string;
}

export type DepartmentView = 'security' | 'marketing' | 'operations' | 'all' | 'none';

export interface VideoAnalysisRequest {
  video_url: string;
  analysis_prompt?: string;
  video_duration_seconds?: number; // Required for videos >10 min to enable chunked analysis
}

export interface VideoAnalysisResponse {
  success: boolean;
  video_url: string;
  video_id?: string;
  annotations: VideoAnnotation[];
  technical_annotations?: TechnicalAnnotation[];
  analysis_metadata: {
    total_annotations: number;
    duration_analyzed?: string;
    model_used?: string;
    processed_at: string;
  };
  error?: string;
}

export interface VideoPlayerState {
  isPlaying: boolean;
  currentTime: number; // in seconds
  duration: number;
  activeAnnotations: VideoAnnotation[];
}

// Overlay styling configurations per department
export interface OverlayStyle {
  borderColor: string;
  backgroundColor: string;
  textColor: string;
  iconColor: string;
  animation?: 'pulse' | 'blink' | 'glow' | 'none';
}

export const DEPARTMENT_STYLES: Record<DepartmentView, OverlayStyle> = {
  security: {
    borderColor: 'rgba(239, 68, 68, 0.9)', // red-500
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    textColor: '#fecaca', // red-200
    iconColor: '#f87171', // red-400
    animation: 'pulse',
  },
  marketing: {
    borderColor: 'rgba(168, 85, 247, 0.9)', // purple-500
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    textColor: '#e9d5ff', // purple-200
    iconColor: '#c084fc', // purple-400
    animation: 'glow',
  },
  operations: {
    borderColor: 'rgba(59, 130, 246, 0.9)', // blue-500
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    textColor: '#bfdbfe', // blue-200
    iconColor: '#60a5fa', // blue-400
    animation: 'none',
  },
  all: {
    borderColor: 'rgba(255, 255, 255, 0.7)',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    textColor: '#ffffff',
    iconColor: '#ffffff',
    animation: 'none',
  },
  none: {
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    textColor: 'transparent',
    iconColor: 'transparent',
    animation: 'none',
  },
};

// Helper function to parse timestamp to seconds
export function parseTimestamp(ts: string): number {
  const parts = ts.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

// Helper function to get active annotations for current time
export function getActiveAnnotations(
  annotations: VideoAnnotation[],
  currentTimeSeconds: number
): VideoAnnotation[] {
  return annotations.filter((ann) => {
    const start = parseTimestamp(ann.timestamp_start);
    const end = parseTimestamp(ann.timestamp_end);
    return currentTimeSeconds >= start && currentTimeSeconds <= end;
  });
}

// Helper function to get active technical annotations for current time
export function getActiveTechnicalAnnotations(
  annotations: TechnicalAnnotation[],
  currentTimeSeconds: number
): TechnicalAnnotation[] {
  return annotations.filter((ann) => {
    const start = parseTimestamp(ann.timestamp_start);
    const end = parseTimestamp(ann.timestamp_end);
    return currentTimeSeconds >= start && currentTimeSeconds <= end;
  });
}

// Service for video analysis API calls
export const videoAnalysisService = {
  /**
   * Analyze a video URL using multimodal AI.
   * Returns department-specific annotations for the video.
   */
  async analyzeVideo(
    videoUrl: string,
    analysisPrompt?: string
  ): Promise<VideoAnalysisResponse> {
    const response = await fetch('/api/axpersona/video-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_url: videoUrl,
        analysis_prompt: analysisPrompt,
      }),
    });

    if (!response.ok) {
      let message = 'Failed to analyze video';
      try {
        const errorData = await response.json();
        if (errorData?.error) {
          message = String(errorData.error);
        }
      } catch {
        // ignore JSON parse errors
      }
      throw new Error(message);
    }

    return await response.json();
  },
};

