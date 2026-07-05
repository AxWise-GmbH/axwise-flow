/**
 * Status checking methods for the API client
 */

import { apiCore } from './core';
import { DetailedAnalysisResult } from './types';
import { getAnalysisById } from './results-detail';

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
      const result = await getAnalysisById(id);

      // If analysis is completed, return it
      if (result.status === 'completed') {
        return result;
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
