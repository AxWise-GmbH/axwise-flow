import { apiClient } from '@/lib/apiClient';
import type { ProcessingStage, ProcessingStatus, ProcessingStep } from '@/components/ProcessingStepsLoader';


/**
 * Maps a backend stage to a frontend ProcessingStage
 * Only includes the stages we want to display in the UI
 */
const mapBackendStageToFrontend = (backendStage: string): ProcessingStage | null => {
  const stageMapping: Record<string, ProcessingStage> = {
    'FILE_UPLOAD': 'FILE_UPLOAD',
    'FILE_VALIDATION': 'FILE_VALIDATION',
    'DATA_VALIDATION': 'DATA_VALIDATION',
    'PREPROCESSING': 'PREPROCESSING',
    'ANALYSIS': 'ANALYSIS',
    'THEME_EXTRACTION': 'THEME_EXTRACTION',
    'PATTERN_DETECTION': 'PATTERN_DETECTION',
    'SENTIMENT_ANALYSIS': 'SENTIMENT_ANALYSIS',
    'PERSONA_FORMATION': 'PERSONA_FORMATION',
    'PERSONA_ENHANCEMENT': 'PERSONA_FORMATION', // Map new unified system to existing UI
    'STAKEHOLDER_ANALYSIS': 'PERSONA_FORMATION', // Map old stakeholder analysis to persona formation
    'INSIGHT_GENERATION': 'INSIGHT_GENERATION',
    'COMPLETION': 'COMPLETION'
  };

  return stageMapping[backendStage] || null;
};

/**
 * Maps a backend status to a frontend ProcessingStatus
 */
const mapBackendStatusToFrontend = (backendStatus: string): ProcessingStatus => {
  const statusMapping: Record<string, ProcessingStatus> = {
    'pending': 'pending',
    'in_progress': 'in_progress',
    'processing': 'in_progress', // Map backend "processing" to frontend "in_progress"
    'completed': 'completed',
    'failed': 'failed',
    'waiting': 'waiting'
  };

  return statusMapping[backendStatus] || 'pending';
};

// Define the order of stages we want to display
const displayOrder: ProcessingStage[] = [
  'FILE_UPLOAD',
  'FILE_VALIDATION',
  'DATA_VALIDATION',
  'PREPROCESSING',
  'ANALYSIS',
  'THEME_EXTRACTION',
  'PATTERN_DETECTION',
  'SENTIMENT_ANALYSIS',
  'PERSONA_FORMATION',
  'INSIGHT_GENERATION',
  'COMPLETION'
];

/**
 * Fetches processing status for a specific analysis
 */
export const fetchProcessingStatus = async (analysisId: string): Promise<{
  steps: ProcessingStep[];
  overallProgress: number;
  error?: string;
  isSimulated?: boolean;
  rawBackendData?: any; // Add raw backend data for progress detection
}> => {
  try {
    // Get processing status from the API
    const data = await apiClient.getProcessingStatus(analysisId);

    // Extract error if any
    const error = data.error_state?.error;

    // If the API doesn't provide stage_states, generate them based on current_stage
    if (!data.stage_states || Object.keys(data.stage_states).length === 0) {
      // Generate mock stage states based on overall progress
      const progress = data.progress || 0.5;
      const mockStageStates: Record<string, any> = {};

      // Determine which stage we're at based on progress
      let currentStageIndex = Math.floor(progress * displayOrder.length);
      if (currentStageIndex >= displayOrder.length) currentStageIndex = displayOrder.length - 1;

      // Generate states for each stage
      displayOrder.forEach((stage, index) => {
        if (index < currentStageIndex) {
          // Completed stages
          mockStageStates[stage] = {
            status: 'completed',
            message: `${stage.toLowerCase().replace(/_/g, ' ')} completed`,
            progress: 1
          };
        } else if (index === currentStageIndex) {
          // Current stage
          const stageProgress = (progress * displayOrder.length) - currentStageIndex;
          mockStageStates[stage] = {
            status: 'in_progress',
            message: `Processing ${stage.toLowerCase().replace(/_/g, ' ')}...`,
            progress: stageProgress
          };
        } else {
          // Pending stages
          mockStageStates[stage] = {
            status: 'pending',
            message: 'Not started',
            progress: 0
          };
        }
      });

      // Replace empty stage_states with our mock data
      data.stage_states = mockStageStates;

      // Return with isSimulated flag
      return {
        steps: displayOrder.map((stage: ProcessingStage) => ({
          stage,
          status: 'pending',
          message: 'Not started',
          progress: 0
        })),
        overallProgress: progress,
        error,
        isSimulated: true,
        rawBackendData: data
      };
    }

    // Map backend stages to frontend steps
    const steps: ProcessingStep[] = [];

    // Process each stage in order
    displayOrder.forEach(frontendStage => {
      // Find the corresponding backend stage
      Object.entries(data.stage_states).forEach(([backendStage, stateData]) => {
        const mappedStage = mapBackendStageToFrontend(backendStage);

        if (mappedStage === frontendStage) {
          // Add type casting to handle stateData as unknown type
          const typedStateData = stateData as {
            status: string;
            message: string;
            progress: number;
          };

          steps.push({
            stage: mappedStage,
            status: mapBackendStatusToFrontend(typedStateData.status),
            message: typedStateData.message || 'Processing',
            progress: typeof typedStateData.progress === 'number' ? typedStateData.progress : 0
          });
        }
      });
    });

    // For any stages that weren't found in the API response, add them as pending
    displayOrder.forEach(stage => {
      if (!steps.some(s => s.stage === stage)) {
        steps.push({
          stage,
          status: 'pending',
          message: 'Not started',
          progress: 0
        });
      }
    });

    // Sort steps according to display order
    steps.sort((a, b) => {
      return displayOrder.indexOf(a.stage) - displayOrder.indexOf(b.stage);
    });

    // Return without isSimulated flag (it's real data)
    return {
      steps,
      overallProgress: data.progress || 0,
      error,
      rawBackendData: data
    };
  } catch (error) {
    console.error('Error fetching processing status:', error);
    return {
      steps: displayOrder.map((stage: ProcessingStage) => ({
        stage,
        status: 'pending',
        message: 'Not started',
        progress: 0
      })),
      overallProgress: 0,
      error: 'Failed to fetch processing status',
      isSimulated: true,
      rawBackendData: null
    };
  }
};

// Helper function to enhance status data with simulation
const enhanceWithSimulation = (
  status: { steps: ProcessingStep[]; overallProgress: number; error?: string; rawBackendData?: any },
  mockProgress: number,
  currentStageIndex: number
): { steps: ProcessingStep[]; overallProgress: number; error?: string; isSimulated: boolean; rawBackendData?: any } => {
  // Generate simulated steps
  const simulatedSteps: ProcessingStep[] = displayOrder.map((stage, index) => {
    // If overall progress is very high (>95%), mark all steps as completed
    if (mockProgress > 0.95) {
      return {
        stage,
        status: 'completed',
        message: `${stage.toLowerCase().replace(/_/g, ' ')} completed`,
        progress: 1
      };
    }

    if (index < currentStageIndex) {
      // Completed stages
      return {
        stage,
        status: 'completed',
        message: `${stage.toLowerCase().replace(/_/g, ' ')} completed`,
        progress: 1
      };
    } else if (index === currentStageIndex) {
      // Current stage
      const stageProgress = (mockProgress * displayOrder.length) - currentStageIndex;
      const cappedProgress = Math.min(Math.max(stageProgress, 0), 1);

      return {
        stage,
        status: 'in_progress',
        message: `Processing ${stage.toLowerCase().replace(/_/g, ' ')}...`,
        progress: cappedProgress
      };
    } else {
      // Pending stages
      return {
        stage,
        status: 'pending',
        message: 'Not started',
        progress: 0
      };
    }
  });

  return {
    steps: simulatedSteps,
    overallProgress: mockProgress,
    error: undefined,
    isSimulated: true,
    rawBackendData: status.rawBackendData
  };
};

// Helper function to create simulated status during errors
const createSimulatedStatus = (
  mockProgress: number,
  currentStageIndex: number
): { steps: ProcessingStep[]; overallProgress: number; error?: string; isSimulated: boolean; rawBackendData?: any } => {
  const simulatedSteps = displayOrder.map((stage, index) => {
    if (index < currentStageIndex) {
      return {
        stage,
        status: 'completed' as ProcessingStatus,
        message: `${stage.toLowerCase().replace(/_/g, ' ')} completed`,
        progress: 1
      };
    } else if (index === currentStageIndex) {
      const stageProgress = (mockProgress * displayOrder.length) - currentStageIndex;
      const cappedProgress = Math.min(Math.max(stageProgress, 0), 1);

      return {
        stage,
        status: 'in_progress' as ProcessingStatus,
        message: `Processing ${stage.toLowerCase().replace(/_/g, ' ')}...`,
        progress: cappedProgress
      };
    } else {
      return {
        stage,
        status: 'pending' as ProcessingStatus,
        message: 'Not started',
        progress: 0
      };
    }
  });

  return {
    steps: simulatedSteps,
    overallProgress: mockProgress,
    error: undefined,
    isSimulated: true,
    rawBackendData: null
  };
};

/**
 * Polls processing status at regular intervals
 * @param analysisId The ID of the analysis to track
 * @param onStatusUpdate Callback to receive status updates
 * @param pollingInterval How often to poll (in ms)
 * @param maxAttempts Maximum number of polling attempts
 * @param simulateProgress Whether to simulate progress if the API doesn't work
 */
export const startProcessingStatusPolling = (
  analysisId: string,
  onStatusUpdate: (data: {
    steps: ProcessingStep[];
    overallProgress: number;
    error?: string;
    isSimulated?: boolean;
    rawBackendData?: any;
  }) => void,
  pollingInterval = 3000,
  maxAttempts = 60, // 3 minutes
  simulateProgress = true // Enable simulation by default for better UX during development
): { stopPolling: () => void } => {
  let attempts = 0;
  let timerId: NodeJS.Timeout | null = null;
  let isCompleted = false;

  // For simulation mode
  let mockProgress = 0.1;
  let currentStageIndex = 0;
  const simulationSpeed = 0.05; // Progress increment per poll

  const poll = async () => {
    if (attempts >= maxAttempts || isCompleted) {
      stopPolling();
      return;
    }

    try {
      // First try to fetch real status from the API
      let status = await fetchProcessingStatus(analysisId);

      // Check if all stages completed or overall progress is 1
      if (status.overallProgress >= 1 ||
          (status.steps.length > 0 && status.steps.every(step => step.status === 'completed'))) {
        isCompleted = true;
        onStatusUpdate(status);
        stopPolling();
        return;
      }

      // Check if we have real progress data from backend
      // Backend returns progress in stage_states format, check the raw backend data
      const hasRealProgress = status.overallProgress > 0.15 ||
        (status.steps && status.steps.some(step => step.progress > 0 && step.status === 'in_progress')) ||
        (status.rawBackendData && status.rawBackendData.stage_states &&
         Object.keys(status.rawBackendData.stage_states).length > 5) ||
        (status.rawBackendData && status.rawBackendData.current_stage &&
         status.rawBackendData.current_stage !== 'ANALYSIS');

      // Only use simulation if we don't have real progress data
      if (simulateProgress && !hasRealProgress) {
        // Simulate progress
        mockProgress += simulationSpeed;
        if (mockProgress > 1) mockProgress = 1;

        // Calculate which stage we're on
        if (mockProgress > (currentStageIndex + 1) / displayOrder.length) {
          currentStageIndex++;
          if (currentStageIndex >= displayOrder.length) {
            currentStageIndex = displayOrder.length - 1;
          }
        }

        // Enhance status with simulated data
        status = enhanceWithSimulation(status, mockProgress, currentStageIndex);

        // Check if simulation has completed
        if (mockProgress >= 1) {
          isCompleted = true;
          stopPolling();
        }
      }

      onStatusUpdate(status);
    } catch (error) {
      console.error('Error polling for status:', error);

      // If we encounter errors for too many consecutive attempts, switch to simulation
      if (simulateProgress) {
        mockProgress += simulationSpeed;
        if (mockProgress > 1) {
          mockProgress = 1;
          isCompleted = true;
          stopPolling();
        }

        // Calculate which stage we're on based on mock progress
        if (mockProgress > (currentStageIndex + 1) / displayOrder.length) {
          currentStageIndex++;
          if (currentStageIndex >= displayOrder.length) {
            currentStageIndex = displayOrder.length - 1;
          }
        }

        // Use simulation since API failed
        const simulatedStatus = createSimulatedStatus(mockProgress, currentStageIndex);
        onStatusUpdate(simulatedStatus);
      } else {
        // If simulation is disabled, report the error
        onStatusUpdate({
          steps: [],
          overallProgress: 0,
          error: 'Failed to fetch processing status',
          rawBackendData: null
        });
      }
    }

    attempts++;
    timerId = setTimeout(poll, pollingInterval);
  };

  const stopPolling = () => {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  // Start polling
  poll();

  return { stopPolling };
};

export default {
  fetchProcessingStatus,
  startProcessingStatusPolling
};
