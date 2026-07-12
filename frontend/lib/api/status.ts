/**
 * Status checking methods for the API client
 */

import { apiCore } from './core';
import { DetailedAnalysisResult } from './types';
import { getAnalysisById } from './results-detail';
import { checkAnalysisStatus } from './analysis';

/**
 * Get analysis by ID with polling until completion
 * 
 * @param id The analysis ID to retrieve
 * @param interval Polling interval in milliseconds (default: 1000)
 * @param maxAttempts Maximum number of polling attempts before giving up (default: 30)
 * @returns A promise that resolves to the completed analysis result
 */
export async function getAnalysisByIdWithPolling(
  id: string,
  interval: number = 1000,
  maxAttempts: number = 30
): Promise<DetailedAnalysisResult> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const status = await checkAnalysisStatus(id);

      // Fetch results only after the authoritative completion transaction commits.
      if (status.status === 'completed' && status.completed_at) {
        return await getAnalysisById(id);
      }
      if (status.status === 'failed') {
        throw new Error(status.error || 'Analysis failed');
      }

      // Otherwise wait for the specified interval
      await new Promise(resolve => setTimeout(resolve, interval));
      attempts++;
    } catch (error) {
      if (attempts >= maxAttempts - 1) {
        throw error; // Re-throw on last attempt
      }
      // Otherwise wait and try again
      await new Promise(resolve => setTimeout(resolve, interval));
      attempts++;
    }
  }

  throw new Error(`Analysis processing timed out after ${maxAttempts} attempts`);
}
