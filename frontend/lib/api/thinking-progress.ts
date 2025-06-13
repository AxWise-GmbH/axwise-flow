/**
 * Thinking Progress Polling Service
 * Handles real-time polling of thinking process during analysis
 */

export interface ThinkingStep {
  step: string;
  status: 'in_progress' | 'completed' | 'failed';
  details: string;
  duration_ms: number;
  timestamp: number;
}

export interface ThinkingProgressResponse {
  request_id: string;
  thinking_process: ThinkingStep[];
  is_complete: boolean;
  total_steps: number;
  completed_steps: number;
  error?: string;
}

/**
 * Fetch current thinking progress from backend
 */
export async function fetchThinkingProgress(requestId: string): Promise<ThinkingProgressResponse> {
  try {
    const response = await fetch(`/api/research/v3-simple/thinking-progress/${requestId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to fetch thinking progress:', error);
    throw error;
  }
}

/**
 * Start polling thinking progress with callbacks
 */
export function startThinkingProgressPolling(
  requestId: string,
  onProgress: (progress: ThinkingProgressResponse) => void,
  onComplete: (finalProgress: ThinkingProgressResponse) => void,
  onError: (error: Error) => void,
  pollingInterval: number = 2000, // 2 seconds
  maxAttempts: number = 60 // 2 minutes max
): { stopPolling: () => void } {
  let attempts = 0;
  let timerId: NodeJS.Timeout | null = null;
  let isCompleted = false;

  const poll = async () => {
    if (attempts >= maxAttempts || isCompleted) {
      stopPolling();
      if (!isCompleted) {
        onError(new Error('Polling timeout: Maximum attempts reached'));
      }
      return;
    }

    attempts++;

    try {
      const progress = await fetchThinkingProgress(requestId);
      
      // Call progress callback
      onProgress(progress);

      // Check if complete
      if (progress.is_complete) {
        isCompleted = true;
        onComplete(progress);
        stopPolling();
        return;
      }

      // Schedule next poll
      if (!isCompleted) {
        timerId = setTimeout(poll, pollingInterval);
      }
    } catch (error) {
      console.error(`Thinking progress polling attempt ${attempts} failed:`, error);
      
      // Continue polling on error (backend might not be ready yet)
      if (attempts < maxAttempts && !isCompleted) {
        timerId = setTimeout(poll, pollingInterval);
      } else {
        onError(error as Error);
        stopPolling();
      }
    }
  };

  const stopPolling = () => {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  // Start polling immediately
  poll();

  return { stopPolling };
}

/**
 * Create initial thinking steps for immediate display
 */
export function createInitialThinkingSteps(): ThinkingStep[] {
  return [
    {
      step: "Initializing Analysis",
      status: 'in_progress',
      details: "Starting customer research analysis...",
      duration_ms: 0,
      timestamp: Date.now()
    },
    {
      step: "Processing Context",
      status: 'in_progress',
      details: "Analyzing business context and requirements...",
      duration_ms: 0,
      timestamp: Date.now()
    },
    {
      step: "Generating Insights",
      status: 'in_progress',
      details: "Creating research questions and recommendations...",
      duration_ms: 0,
      timestamp: Date.now()
    }
  ];
}
