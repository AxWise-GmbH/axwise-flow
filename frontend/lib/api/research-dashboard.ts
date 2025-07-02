/**
 * API client for Research Dashboard functionality
 * Handles dashboard-specific question generation and context validation
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface DashboardQuestionRequest {
  business_idea: string;
  target_customer: string;
  problem: string;
  session_id?: string;
}

export interface ContextValidationResponse {
  is_valid: boolean;
  completeness_score: number;
  missing_fields: string[];
  suggestions: string[];
}

export interface DashboardQuestionResponse {
  success: boolean;
  message: string;
  questions: {
    primaryStakeholders?: Array<{
      name: string;
      description: string;
      questions: {
        problemDiscovery: string[];
        solutionValidation: string[];
        followUp: string[];
      };
    }>;
    secondaryStakeholders?: Array<{
      name: string;
      description: string;
      questions: {
        problemDiscovery: string[];
        solutionValidation?: string[];
        followUp?: string[];
      };
    }>;
    timeEstimate?: {
      totalQuestions: number;
      estimatedMinutes: string;
      breakdown: {
        baseTime: number;
        withBuffer: number;
        perQuestion: number;
      };
    };
  };
  metadata: {
    context_completeness?: number;
    stakeholder_count?: {
      primary: number;
      secondary: number;
    };
    total_questions?: number;
    generation_method?: string;
    conversation_routine?: boolean;
  };
}

/**
 * Validate research context completeness
 */
export async function validateResearchContext(
  request: DashboardQuestionRequest
): Promise<ContextValidationResponse> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/research/dashboard/validate-context`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      }
    );

    if (!response.ok) {
      throw new Error(`Context validation failed: ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error("Context validation error:", error);
    throw error;
  }
}

/**
 * Generate research questions using dashboard endpoint
 */
export async function generateDashboardQuestions(
  request: DashboardQuestionRequest
): Promise<DashboardQuestionResponse> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/research/dashboard/generate-questions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...request,
          session_id: request.session_id || `dashboard-${Date.now()}`,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Question generation failed: ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error("Question generation error:", error);
    throw error;
  }
}

/**
 * Test dashboard question generation
 */
export async function testDashboardGeneration(): Promise<any> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/research/dashboard/test-generation`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Test generation failed: ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error("Test generation error:", error);
    throw error;
  }
}

/**
 * Check dashboard health
 */
export async function checkDashboardHealth(): Promise<{ status: string; service: string }> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/research/dashboard/health`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }

    return response.json();
  } catch (error) {
    console.error("Health check error:", error);
    throw error;
  }
}

/**
 * Export questions in various formats
 */
export function exportQuestionsToText(questions: DashboardQuestionResponse['questions']): string {
  let output = "# Research Questions\n\n";
  
  if (questions.primaryStakeholders) {
    output += "## Primary Stakeholders\n\n";
    questions.primaryStakeholders.forEach((stakeholder, index) => {
      output += `### ${index + 1}. ${stakeholder.name}\n`;
      output += `**Description:** ${stakeholder.description}\n\n`;
      
      if (stakeholder.questions.problemDiscovery?.length > 0) {
        output += "**Problem Discovery Questions:**\n";
        stakeholder.questions.problemDiscovery.forEach((q, i) => {
          output += `${i + 1}. ${q}\n`;
        });
        output += "\n";
      }
      
      if (stakeholder.questions.solutionValidation?.length > 0) {
        output += "**Solution Validation Questions:**\n";
        stakeholder.questions.solutionValidation.forEach((q, i) => {
          output += `${i + 1}. ${q}\n`;
        });
        output += "\n";
      }
      
      if (stakeholder.questions.followUp?.length > 0) {
        output += "**Follow-up Questions:**\n";
        stakeholder.questions.followUp.forEach((q, i) => {
          output += `${i + 1}. ${q}\n`;
        });
        output += "\n";
      }
      
      output += "---\n\n";
    });
  }
  
  if (questions.secondaryStakeholders) {
    output += "## Secondary Stakeholders\n\n";
    questions.secondaryStakeholders.forEach((stakeholder, index) => {
      output += `### ${index + 1}. ${stakeholder.name}\n`;
      output += `**Description:** ${stakeholder.description}\n\n`;
      
      if (stakeholder.questions.problemDiscovery?.length > 0) {
        output += "**Problem Discovery Questions:**\n";
        stakeholder.questions.problemDiscovery.forEach((q, i) => {
          output += `${i + 1}. ${q}\n`;
        });
        output += "\n";
      }
      
      output += "---\n\n";
    });
  }
  
  if (questions.timeEstimate) {
    output += "## Time Estimate\n\n";
    output += `**Total Questions:** ${questions.timeEstimate.totalQuestions}\n`;
    output += `**Estimated Time:** ${questions.timeEstimate.estimatedMinutes}\n`;
  }
  
  return output;
}

/**
 * Export questions as JSON
 */
export function exportQuestionsToJSON(questions: DashboardQuestionResponse['questions']): string {
  return JSON.stringify(questions, null, 2);
}

/**
 * Export questions as CSV
 */
export function exportQuestionsToCSV(questions: DashboardQuestionResponse['questions']): string {
  let csv = "Stakeholder Type,Stakeholder Name,Question Category,Question\n";
  
  if (questions.primaryStakeholders) {
    questions.primaryStakeholders.forEach((stakeholder) => {
      stakeholder.questions.problemDiscovery?.forEach((q) => {
        csv += `Primary,"${stakeholder.name}",Problem Discovery,"${q.replace(/"/g, '""')}"\n`;
      });
      stakeholder.questions.solutionValidation?.forEach((q) => {
        csv += `Primary,"${stakeholder.name}",Solution Validation,"${q.replace(/"/g, '""')}"\n`;
      });
      stakeholder.questions.followUp?.forEach((q) => {
        csv += `Primary,"${stakeholder.name}",Follow-up,"${q.replace(/"/g, '""')}"\n`;
      });
    });
  }
  
  if (questions.secondaryStakeholders) {
    questions.secondaryStakeholders.forEach((stakeholder) => {
      stakeholder.questions.problemDiscovery?.forEach((q) => {
        csv += `Secondary,"${stakeholder.name}",Problem Discovery,"${q.replace(/"/g, '""')}"\n`;
      });
    });
  }
  
  return csv;
}

/**
 * Download questions in specified format
 */
export function downloadQuestions(
  questions: DashboardQuestionResponse['questions'],
  format: 'txt' | 'json' | 'csv',
  filename?: string
): void {
  let content: string;
  let mimeType: string;
  let extension: string;
  
  switch (format) {
    case 'txt':
      content = exportQuestionsToText(questions);
      mimeType = 'text/plain';
      extension = 'txt';
      break;
    case 'json':
      content = exportQuestionsToJSON(questions);
      mimeType = 'application/json';
      extension = 'json';
      break;
    case 'csv':
      content = exportQuestionsToCSV(questions);
      mimeType = 'text/csv';
      extension = 'csv';
      break;
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
  
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  link.href = url;
  link.download = filename || `research-questions-${Date.now()}.${extension}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
