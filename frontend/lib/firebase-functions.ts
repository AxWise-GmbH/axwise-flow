'use client';

import { functions } from './firebase';
import { httpsCallable, HttpsCallableResult } from 'firebase/functions';

/**
 * Firebase Cloud Functions utility
 * These functions provide a simplified interface for calling Firebase Cloud Functions
 */

/**
 * Call a Firebase Cloud Function
 * 
 * @param functionName The name of the function to call
 * @param data The data to pass to the function
 * @returns A promise that resolves to the function result
 */
export async function callFunction<T = any, R = any>(
  functionName: string,
  data?: T
): Promise<R> {
  try {
    const functionRef = httpsCallable<T, R>(functions, functionName);
    const result = await functionRef(data);
    return result.data;
  } catch (error) {
    console.error(`Error calling function ${functionName}:`, error);
    throw error;
  }
}

/**
 * Generate a Firebase token for a Clerk user
 * 
 * @param clerkUserId The Clerk user ID
 * @returns A promise that resolves to the Firebase token
 */
export async function generateFirebaseToken(
  clerkUserId: string
): Promise<string> {
  try {
    const result = await callFunction<{ clerkUserId: string }, { token: string }>(
      'generateFirebaseToken',
      { clerkUserId }
    );
    return result.token;
  } catch (error) {
    console.error('Error generating Firebase token:', error);
    throw error;
  }
}

/**
 * Process a file using Firebase Functions
 * 
 * @param fileUrl The URL of the file to process
 * @param options Processing options
 * @returns A promise that resolves to the processing result
 */
export async function processFile<T = any>(
  fileUrl: string,
  options?: Record<string, any>
): Promise<T> {
  try {
    return await callFunction<{ fileUrl: string; options?: Record<string, any> }, T>(
      'processFile',
      { fileUrl, options }
    );
  } catch (error) {
    console.error('Error processing file:', error);
    throw error;
  }
}

/**
 * Analyze text using Firebase Functions
 * 
 * @param text The text to analyze
 * @param options Analysis options
 * @returns A promise that resolves to the analysis result
 */
export async function analyzeText<T = any>(
  text: string,
  options?: Record<string, any>
): Promise<T> {
  try {
    return await callFunction<{ text: string; options?: Record<string, any> }, T>(
      'analyzeText',
      { text, options }
    );
  } catch (error) {
    console.error('Error analyzing text:', error);
    throw error;
  }
}

/**
 * Generate a report using Firebase Functions
 * 
 * @param data The data to use for the report
 * @param options Report options
 * @returns A promise that resolves to the report result
 */
export async function generateReport<T = any>(
  data: Record<string, any>,
  options?: Record<string, any>
): Promise<T> {
  try {
    return await callFunction<{ data: Record<string, any>; options?: Record<string, any> }, T>(
      'generateReport',
      { data, options }
    );
  } catch (error) {
    console.error('Error generating report:', error);
    throw error;
  }
}
