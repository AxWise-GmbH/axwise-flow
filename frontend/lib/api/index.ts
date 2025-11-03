/**
 * API client module
 *
 * This module re-exports all API client functionality for backward compatibility.
 * It maintains the same API as the original apiClient.ts file.
 */

// Re-export everything from the individual modules
export * from './auth';
export * from './upload';
export * from './analysis';
export * from './results';
export * from './results-detail';
export * from './status';
export * from './persona';
export * from './insights';
export * from './export';
export * from './mocks';
export * from './types';

// Import core for singleton instance
import { apiCore } from './core';

// Re-export the core client for direct access
export { apiCore };
