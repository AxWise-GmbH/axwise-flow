/**
 * Hook for checking file content for encoding issues
 * This is a client-side only hook that uses the FileReader API
 */

import { useCallback } from 'react';

/**
 * Hook to check file content for encoding issues
 * @returns A function that checks a file for encoding issues
 */
export function useFileContentCheck() {
  /**
   * Check a file for encoding issues
   * @param file The file to check
   * @returns A promise that resolves when the check is complete
   */
  const checkFileForEncodingIssues = useCallback(async (file: File): Promise<void> => {
    if (typeof window === 'undefined' || !file) {
      // Skip if we're not in a browser context or if no file is provided
      return;
    }

    console.log('Checking file for encoding issues:', file.name);

    // Check for encoding issues in the filename
    const hasEncodingIssues = /[\u0080-\uFFFF]/.test(file.name);
    if (hasEncodingIssues) {
      console.warn('File name contains non-ASCII characters that might cause issues:',
        Array.from(file.name).map(char => ({ char, code: char.charCodeAt(0).toString(16) }))
      );
    }

    // Try to read a small sample of the file to check for encoding issues
    return new Promise((resolve) => {
      try {
        const reader = new FileReader();
        reader.onload = (e) => {
          const sample = e.target?.result?.toString().substring(0, 200) || '';
          console.log('File content sample:', sample);

          // Check for potential encoding issues in content
          const contentHasEncodingIssues = /[\u0080-\uFFFF]/.test(sample);
          if (contentHasEncodingIssues) {
            console.warn('File content contains non-ASCII characters that might cause issues');
          }
          resolve();
        };
        reader.onerror = () => {
          console.error('Error reading file sample');
          resolve();
        };
        reader.readAsText(file.slice(0, 1000)); // Read first 1000 bytes
      } catch (readError) {
        console.error('Error reading file sample:', readError);
        resolve();
      }
    });
  }, []);

  return { checkFileForEncodingIssues };
}
