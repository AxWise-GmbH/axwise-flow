/**
 * Utility functions for handling file uploads
 */

/**
 * Checks if a file can be uploaded in the current environment
 * @returns true if file uploads are supported, false otherwise
 */
export function isFileUploadSupported(): boolean {
  // Check if we're in a browser environment
  if (typeof window === 'undefined') {
    return false;
  }
  
  // Check if FormData is available
  if (typeof FormData === 'undefined') {
    return false;
  }
  
  // Check if File API is available
  if (typeof File === 'undefined') {
    return false;
  }
  
  return true;
}

/**
 * Sanitizes a file name to remove special characters
 * @param fileName The original file name
 * @returns The sanitized file name
 */
export function sanitizeFileName(fileName: string): string {
  // Replace non-ASCII characters with underscores
  return fileName.replace(/[^\x00-\x7F]/g, '_');
}

/**
 * Creates a new File object with a sanitized name
 * @param file The original file
 * @returns A promise that resolves to a new File object with a sanitized name
 */
export async function createSanitizedFile(file: File): Promise<File> {
  try {
    // Check if the file name contains problematic characters
    if (!/[\u0080-\uFFFF]/.test(file.name)) {
      // No special characters, return the original file
      return file;
    }
    
    // Create a sanitized file name
    const sanitizedName = sanitizeFileName(file.name);
    
    // Get the file content as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    
    // Create a new File object with the sanitized name
    return new File([arrayBuffer], sanitizedName, { type: file.type });
  } catch (error) {
    console.error('Failed to create sanitized file:', error);
    // Fall back to the original file
    return file;
  }
}

/**
 * Checks if a file upload is in progress in sessionStorage
 * @returns The pending upload info or null if none exists
 */
export function getPendingUpload(): {
  fileName: string;
  fileSize: number;
  fileType: string;
  isTextFile: boolean;
  timestamp: number;
} | null {
  try {
    // Only run in browser context
    if (typeof window === 'undefined') return null;
    
    const pendingUploadStr = sessionStorage.getItem('pendingUpload');
    if (!pendingUploadStr) return null;
    
    const pendingUpload = JSON.parse(pendingUploadStr);
    
    // Check if the pending upload is recent (within the last 5 minutes)
    const isRecent = Date.now() - pendingUpload.timestamp < 5 * 60 * 1000;
    
    if (!isRecent) {
      // Clear old pending uploads
      sessionStorage.removeItem('pendingUpload');
      return null;
    }
    
    return pendingUpload;
  } catch (error) {
    console.error('Error checking for pending uploads:', error);
    return null;
  }
}

/**
 * Saves a pending upload to sessionStorage
 * @param file The file to upload
 * @param isTextFile Whether the file is a text file
 */
export function savePendingUpload(file: File, isTextFile: boolean): void {
  try {
    // Only run in browser context
    if (typeof window === 'undefined') return;
    
    sessionStorage.setItem('pendingUpload', JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      isTextFile: isTextFile,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.error('Failed to store pending upload info:', error);
  }
}

/**
 * Clears a pending upload from sessionStorage
 */
export function clearPendingUpload(): void {
  try {
    // Only run in browser context
    if (typeof window === 'undefined') return;
    
    sessionStorage.removeItem('pendingUpload');
  } catch (error) {
    console.error('Failed to clear pending upload info:', error);
  }
}
