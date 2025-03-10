import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient } from '@/lib/apiClient';
import type { UploadResponse, AnalysisResponse } from '@/types/api';

/**
 * Upload Store State Interface
 */
interface UploadState {
  // File state
  file: File | null;
  isTextFile: boolean;
  filePreview: string | null;
  
  // Upload state
  uploadResponse: UploadResponse | null;
  analysisResponse: AnalysisResponse | null;
  isUploading: boolean;
  isAnalyzing: boolean;
  
  // Error state
  uploadError: Error | null;
  analysisError: Error | null;
  
  // LLM provider
  llmProvider: 'openai' | 'gemini';
  
  // Actions
  setFile: (file: File | null) => void;
  clearFile: () => void;
  uploadFile: () => Promise<UploadResponse | null>;
  startAnalysis: () => Promise<AnalysisResponse | null>;
  setLlmProvider: (provider: 'openai' | 'gemini') => void;
  clearUploadState: () => void;
  clearErrors: () => void;
}

/**
 * Upload Store
 * Manages the state for file uploads and analysis initiation
 */
export const useUploadStore = create<UploadState>()(
  persist(
    (set, get) => ({
      // Initial state
      file: null,
      isTextFile: false,
      filePreview: null,
      uploadResponse: null,
      analysisResponse: null,
      isUploading: false,
      isAnalyzing: false,
      uploadError: null,
      analysisError: null,
      llmProvider: 'gemini',
      
      /**
       * Set the currently selected file
       * Also determine if it's a text file and generate preview
       */
      setFile: (file) => {
        // If null is passed, just clear the file
        if (!file) {
          set({ 
            file: null, 
            isTextFile: false, 
            filePreview: null 
          });
          return;
        }
        
        // Check if it's a text file by MIME type or extension
        const isText = file.type === 'text/plain' || 
                       file.name.endsWith('.txt') ||
                       file.name.endsWith('.text');
                       
        // Generate a preview for text files
        let preview: string | null = null;
        if (isText) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const text = e.target?.result as string;
            if (text) {
              // Just show the first 500 characters for preview
              const previewText = text.length > 500 
                ? `${text.substring(0, 500)}...` 
                : text;
                
              set({ filePreview: previewText });
            }
          };
          reader.readAsText(file);
        }
        
        set({ 
          file, 
          isTextFile: isText,
          filePreview: preview,  // Will be updated async for text files
          uploadError: null      // Clear previous errors
        });
      },
      
      /**
       * Clear the current file and related state
       */
      clearFile: () => {
        set({ 
          file: null, 
          isTextFile: false, 
          filePreview: null,
          uploadResponse: null, 
          uploadError: null 
        });
      },
      
      /**
       * Upload the currently selected file
       * Returns the upload response or null if error
       */
      uploadFile: async () => {
        const { file, isTextFile } = get();
        
        if (!file) {
          set({ uploadError: new Error('No file selected') });
          return null;
        }
        
        try {
          set({ isUploading: true, uploadError: null });
          
          // Upload the file using the API client
          const response = await apiClient.uploadData(file, isTextFile);
          
          set({ 
            uploadResponse: response,
            isUploading: false
          });
          
          return response;
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          set({ 
            uploadError: err,
            isUploading: false
          });
          return null;
        }
      },
      
      /**
       * Start analysis of the uploaded file
       * Returns the analysis response or null if error
       */
      startAnalysis: async () => {
        const { uploadResponse, llmProvider } = get();
        
        if (!uploadResponse) {
          set({ analysisError: new Error('No file has been uploaded') });
          return null;
        }
        
        try {
          set({ isAnalyzing: true, analysisError: null });
          
          // Start the analysis using the API client
          const response = await apiClient.analyzeData(
            uploadResponse.data_id,
            llmProvider
          );
          
          set({ 
            analysisResponse: response,
            isAnalyzing: false
          });
          
          return response;
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          set({ 
            analysisError: err,
            isAnalyzing: false
          });
          return null;
        }
      },
      
      /**
       * Set the LLM provider for analysis
       */
      setLlmProvider: (provider) => {
        set({ llmProvider: provider });
      },
      
      /**
       * Clear all upload state (for when switching tabs, etc.)
       */
      clearUploadState: () => {
        set({
          file: null,
          isTextFile: false,
          filePreview: null,
          uploadResponse: null,
          analysisResponse: null,
          isUploading: false,
          isAnalyzing: false,
          uploadError: null,
          analysisError: null
        });
      },
      
      /**
       * Clear any error states
       */
      clearErrors: () => {
        set({ uploadError: null, analysisError: null });
      }
    }),
    {
      name: 'interview-analysis-upload-storage',
      partialize: (state) => ({
        llmProvider: state.llmProvider, // Only persist the LLM provider preference
      }),
    }
  )
);

/**
 * Selector to get the current file
 */
export const useCurrentFile = () => useUploadStore((state) => ({
  file: state.file,
  isTextFile: state.isTextFile,
  filePreview: state.filePreview
}));

/**
 * Selector to get the upload status
 */
export const useUploadStatus = () => useUploadStore((state) => ({
  isUploading: state.isUploading,
  uploadResponse: state.uploadResponse,
  uploadError: state.uploadError
}));

/**
 * Selector to get the analysis status
 */
export const useAnalysisStatus = () => useUploadStore((state) => ({
  isAnalyzing: state.isAnalyzing,
  analysisResponse: state.analysisResponse,
  analysisError: state.analysisError
}));

/**
 * Selector to get and set the LLM provider
 */
export const useLlmProvider = () => {
  const provider = useUploadStore((state) => state.llmProvider);
  const setProvider = useUploadStore((state) => state.setLlmProvider);
  return { provider, setProvider };
}; 