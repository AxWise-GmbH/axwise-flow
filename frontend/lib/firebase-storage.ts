'use client';

import { storage } from './firebase';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  listAll, 
  deleteObject,
  uploadString,
  uploadBytesResumable
} from 'firebase/storage';

/**
 * Firebase Storage utility functions
 * These functions provide a simplified interface for common storage operations
 */

/**
 * Upload a file to Firebase Storage
 * 
 * @param file The file to upload
 * @param path The path in storage where the file should be stored
 * @param metadata Optional metadata for the file
 * @returns A promise that resolves to the download URL
 */
export async function uploadFile(
  file: File, 
  path: string, 
  metadata?: { [key: string]: string }
): Promise<string> {
  try {
    // Create a storage reference
    const storageRef = ref(storage, path);
    
    // Upload the file
    const snapshot = await uploadBytes(storageRef, file, { customMetadata: metadata });
    
    // Get the download URL
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    return downloadURL;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}

/**
 * Upload a file with progress tracking
 * 
 * @param file The file to upload
 * @param path The path in storage where the file should be stored
 * @param onProgress Callback function that receives the upload progress (0-100)
 * @param metadata Optional metadata for the file
 * @returns A promise that resolves to the download URL
 */
export function uploadFileWithProgress(
  file: File,
  path: string,
  onProgress: (progress: number) => void,
  metadata?: { [key: string]: string }
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      // Create a storage reference
      const storageRef = ref(storage, path);
      
      // Create the upload task
      const uploadTask = uploadBytesResumable(storageRef, file, { customMetadata: metadata });
      
      // Register three observers:
      // 1. 'state_changed' observer, called any time the state changes
      // 2. Error observer, called on failure
      // 3. Completion observer, called on successful completion
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          // Observe state change events such as progress, pause, and resume
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          onProgress(progress);
        },
        (error) => {
          // Handle unsuccessful uploads
          console.error('Error uploading file:', error);
          reject(error);
        },
        async () => {
          // Handle successful uploads on complete
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(downloadURL);
          } catch (error) {
            reject(error);
          }
        }
      );
    } catch (error) {
      console.error('Error setting up upload:', error);
      reject(error);
    }
  });
}

/**
 * Upload a string to Firebase Storage
 * 
 * @param content The string content to upload
 * @param path The path in storage where the content should be stored
 * @param format The format of the string ('raw', 'data_url', 'base64', or 'base64url')
 * @param metadata Optional metadata for the file
 * @returns A promise that resolves to the download URL
 */
export async function uploadString(
  content: string,
  path: string,
  format: 'raw' | 'data_url' | 'base64' | 'base64url' = 'raw',
  metadata?: { [key: string]: string }
): Promise<string> {
  try {
    // Create a storage reference
    const storageRef = ref(storage, path);
    
    // Upload the string
    const snapshot = await uploadString(storageRef, content, format, { customMetadata: metadata });
    
    // Get the download URL
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    return downloadURL;
  } catch (error) {
    console.error('Error uploading string:', error);
    throw error;
  }
}

/**
 * Get the download URL for a file in Firebase Storage
 * 
 * @param path The path to the file in storage
 * @returns A promise that resolves to the download URL
 */
export async function getFileUrl(path: string): Promise<string> {
  try {
    const storageRef = ref(storage, path);
    return await getDownloadURL(storageRef);
  } catch (error) {
    console.error('Error getting file URL:', error);
    throw error;
  }
}

/**
 * List all files in a directory in Firebase Storage
 * 
 * @param path The path to the directory in storage
 * @returns A promise that resolves to an array of file references
 */
export async function listFiles(path: string): Promise<string[]> {
  try {
    const storageRef = ref(storage, path);
    const result = await listAll(storageRef);
    
    // Get download URLs for all items
    const urls = await Promise.all(
      result.items.map(itemRef => getDownloadURL(itemRef))
    );
    
    return urls;
  } catch (error) {
    console.error('Error listing files:', error);
    throw error;
  }
}

/**
 * Delete a file from Firebase Storage
 * 
 * @param path The path to the file in storage
 * @returns A promise that resolves when the file is deleted
 */
export async function deleteFile(path: string): Promise<void> {
  try {
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error;
  }
}
