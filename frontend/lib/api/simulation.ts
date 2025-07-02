/**
 * API client for the Simulation Bridge system.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface SimulationConfig {
  depth: "quick" | "detailed" | "comprehensive";
  personas_per_stakeholder: number;
  response_style: "realistic" | "optimistic" | "critical" | "mixed";
  include_insights: boolean;
  temperature: number;
}

export interface BusinessContext {
  business_idea: string;
  target_customer: string;
  problem: string;
  industry?: string;
}

export interface Stakeholder {
  id: string;
  name: string;
  description: string;
  questions: string[];
}

export interface QuestionsData {
  stakeholders: {
    primary?: Stakeholder[];
    secondary?: Stakeholder[];
  };
  timeEstimate?: {
    totalQuestions: number;
  };
}

export interface AIPersona {
  id: string;
  name: string;
  age: number;
  background: string;
  motivations: string[];
  pain_points: string[];
  communication_style: string;
  stakeholder_type: string;
  demographic_details: Record<string, any>;
}

export interface InterviewResponse {
  question: string;
  response: string;
  sentiment: string;
  insights: string[];
  follow_ups?: string[];
}

export interface SimulatedInterview {
  persona_id: string;
  stakeholder_type: string;
  responses: InterviewResponse[];
  interview_duration_minutes: number;
  overall_sentiment: string;
  key_themes: string[];
}

export interface SimulationInsights {
  overall_sentiment: string;
  key_themes: string[];
  stakeholder_priorities: Record<string, string[]>;
  potential_risks: string[];
  opportunities: string[];
  recommendations: string[];
}

export interface SimulationResponse {
  success: boolean;
  message: string;
  simulation_id?: string;
  data?: Record<string, any>;
  metadata?: Record<string, any>;
  personas?: AIPersona[];
  interviews?: SimulatedInterview[];
  simulation_insights?: SimulationInsights;
  recommendations?: string[];
}

export interface SimulationProgress {
  simulation_id: string;
  stage: string;
  progress_percentage: number;
  current_task: string;
  estimated_time_remaining?: number;
  completed_personas: number;
  total_personas: number;
  completed_interviews: number;
  total_interviews: number;
}

export async function createSimulation(
  questionsData: QuestionsData,
  businessContext: BusinessContext,
  config: SimulationConfig
): Promise<SimulationResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/research/simulation-bridge/simulate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        questions_data: questionsData,
        business_context: businessContext,
        config: config,
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Simulation failed: ${response.statusText}`);
  }

  return response.json();
}

export async function getSimulationProgress(
  simulationId: string
): Promise<SimulationProgress> {
  const response = await fetch(
    `${API_BASE_URL}/api/research/simulation-bridge/simulate/${simulationId}/progress`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to get progress: ${response.statusText}`);
  }

  return response.json();
}

export async function cancelSimulation(simulationId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/research/simulation-bridge/simulate/${simulationId}`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to cancel simulation: ${response.statusText}`);
  }
}

export async function getDefaultConfig(): Promise<{
  default_config: SimulationConfig;
  available_options: Record<string, any>;
}> {
  const response = await fetch(
    `${API_BASE_URL}/api/research/simulation-bridge/config/defaults`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get default config: ${response.statusText}`);
  }

  return response.json();
}

export async function testPersonaGeneration(
  businessContext: BusinessContext,
  stakeholderInfo: Stakeholder,
  config?: Partial<SimulationConfig>
): Promise<{ success: boolean; personas: AIPersona[]; count: number }> {
  const response = await fetch(
    `${API_BASE_URL}/api/research/simulation-bridge/test-personas`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        business_context: businessContext,
        stakeholder_info: stakeholderInfo,
        config: config,
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Persona test failed: ${response.statusText}`);
  }

  return response.json();
}

export async function testInterviewSimulation(
  personaData: AIPersona,
  stakeholderInfo: Stakeholder,
  businessContext: BusinessContext,
  config?: Partial<SimulationConfig>
): Promise<{ success: boolean; interview: SimulatedInterview; response_count: number }> {
  const response = await fetch(
    `${API_BASE_URL}/api/research/simulation-bridge/test-interview`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        persona_data: personaData,
        stakeholder_info: stakeholderInfo,
        business_context: businessContext,
        config: config,
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Interview test failed: ${response.statusText}`);
  }

  return response.json();
}
