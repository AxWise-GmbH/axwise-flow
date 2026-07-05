/**
 * Export methods for the API client
 */

import { apiCore } from './core';

/**
 * Export analysis results as Markdown
 *
 * @param analysisId The ID of the analysis to export
 * @returns A promise that resolves to a Blob containing the Markdown data
 */
export async function exportAnalysisMarkdown(analysisId: string): Promise<Blob> {
  try {
    console.log(`Exporting analysis ID: ${analysisId} as Markdown`);

    // Make the API call with responseType blob to get binary data
    const response = await apiCore.getClient().get(`/api/export/${analysisId}/markdown`, {
      responseType: 'blob',
      timeout: 60000, // 60 seconds timeout for potentially large files
    });

    console.log('Markdown export response received');

    // Return the blob directly
    return new Blob([response.data], { type: 'text/markdown' });
  } catch (error: Error | unknown) {
    console.error('Error exporting Markdown:', error);
    throw error;
  }
}

/**
 * Get the URL for exporting analysis results as Markdown
 *
 * @param analysisId The ID of the analysis to export
 * @returns The URL for downloading the Markdown
 */
export function getMarkdownExportUrl(analysisId: string): string {
  const baseUrl = apiCore.getBaseUrl();
  return `${baseUrl}/api/export/${analysisId}/markdown`;
}
