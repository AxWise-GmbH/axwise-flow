import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useUploadStore } from '@/store/useUploadStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/providers/toast-provider';
import { AlertCircle, CheckCircle2, FileUp, FileText, FilePen, X } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { UploadResponse } from '@/types/api';
import { apiClient } from '@/lib/apiClient'; // Fix the import path

/**
 * Emergency UploadPanel Component (Loop-Free Version)
 * 
 * This component completely bypasses Zustand subscription mechanisms
 * that were causing infinite loops and instead uses React's useState
 * for local state management with manual synchronization to the store.
 */
export default function EmergencyUploadPanel() {
  const { showToast } = useToast();
  
  // Reference to file input
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Local state instead of store subscription
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<number>(0);
  const [isTextFile, setIsTextFile] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadComplete, setUploadComplete] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<Error | null>(null);
  const [uploadResponse, setUploadResponse] = useState<UploadResponse | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<Error | null>(null);
  const [resultId, setResultId] = useState<string | null>(null);
  
  // Handle file selection
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLocalFile(file);
      setFileName(file.name);
      setFileSize(file.size);
      setIsTextFile(file.type.includes('text') || file.name.endsWith('.txt'));
      
      // Reset states when file changes
      setUploadComplete(false);
      setResultId(null);
      setUploadError(null);
      setAnalysisError(null);
    }
  }, []);
  
  // Set auth token for API calls
  useEffect(() => {
    // Set auth token when component mounts (important for direct API calls)
    // Using hardcoded token for development - this should be replaced with proper auth in production
    apiClient.setAuthToken('dev-token-12345');
  }, []);

  // When the file is selected, update our local state
  useEffect(() => {
    if (localFile) {
      // Don't directly update the store's file property
      // Just set other relevant properties and let the store handle the file
      
      // Create a FormData object directly to provide to the store
      const formData = new FormData();
      formData.append('file', localFile);
      formData.append('is_free_text', String(isTextFile));
      formData.append('filename', localFile.name);
      formData.append('content_type', localFile.type);
      
      // Instead of setting the file directly, we'll prepare for upload
      useUploadStore.setState({
        // Don't set the file property at all
        isTextFile: isTextFile,
        filePreview: null,
        uploadError: null, 
        analysisError: null,
        uploadResponse: null
      });
    }
  }, [localFile, isTextFile]);
  
  // Handle file upload
  const handleUpload = useCallback(async () => {
    if (!localFile) {
      setUploadError(new Error('Please select a file to upload'));
      showToast('Please select a file to upload', { variant: 'error' });
      return;
    }
    
    setIsUploading(true);
    setUploadError(null);
    
    try {
      console.log('Starting upload in EmergencyUploadPanel...');
      
      // Call the API client directly instead of going through the store
      // This bypasses the type issues in the store
      const response = await apiClient.uploadData(localFile, isTextFile);
      console.log('Upload response in EmergencyUploadPanel:', response);
      
      if (response) {
        setUploadComplete(true);
        setUploadResponse(response);
        showToast('File uploaded successfully', { variant: 'success' });
        
        // Update the store with the response so other components can access it
        useUploadStore.setState({
          uploadResponse: response,
          isUploading: false
        });
      } else {
        // If we don't have a response but also no error thrown, show a generic message
        setUploadError(new Error('Upload completed but no response received'));
        showToast('Upload issue: No response from server', { variant: 'info' });
      }
    } catch (error) {
      console.error('Upload error in EmergencyUploadPanel:', error);
      
      // Enhanced server error debugging
      if (error && (error as any).response && (error as any).response.data) {
        const serverError = (error as any).response.data;
        console.error('Server error details:', serverError);
        
        // Verbose error logging for debugging
        console.error('Full error object:', JSON.stringify(error, (key, value) => {
          if (key === 'request') return undefined; // Exclude request object to avoid circular references
          return value;
        }, 2));
        
        // Extract detailed error message if available
        const errorDetail = serverError.detail;
        const errorMessage = typeof errorDetail === 'string' 
          ? errorDetail 
          : JSON.stringify(errorDetail);
          
        setUploadError(new Error(`Server error: ${errorMessage}`));
        showToast(`Upload failed: ${errorMessage}`, { variant: 'error' });
      } else {
        setUploadError(error instanceof Error ? error : new Error('Unknown upload error'));
        
        // Show a more user-friendly error message
        const errorMessage = error instanceof Error ? error.message : 'Unknown upload error';
        showToast(`Upload failed: ${errorMessage}`, { variant: 'error' });
      }
    } finally {
      setIsUploading(false);
    }
  }, [localFile, isTextFile, showToast]);
  
  // Handle analysis
  const handleAnalysis = useCallback(async () => {
    if (!uploadComplete || !uploadResponse) {
      setAnalysisError(new Error('Please upload a file first'));
      showToast('Please upload a file first', { variant: 'error' });
      return;
    }
    
    setIsAnalyzing(true);
    setAnalysisError(null);
    
    try {
      console.log('Starting analysis in EmergencyUploadPanel...');
      
      // Call the API client directly with required parameters
      // Explicitly use gemini for the LLM provider to avoid OpenAI API key issues
      const response = await apiClient.analyzeData(
        uploadResponse.data_id, // data_id is already a number according to UploadResponse
        'gemini', // Hard-code gemini as the provider to avoid OpenAI key issues
        'gemini-2.0-flash', // Use gemini-2.0-flash model
        isTextFile  // Pass the isTextFile flag
      );
      
      console.log('Analysis response in EmergencyUploadPanel:', response);
      
      if (response) {
        setResultId(response.result_id.toString());
        showToast('Analysis completed successfully', { variant: 'success' });
        
        // Update the store with the response
        useUploadStore.setState({
          analysisResponse: response,
          isAnalyzing: false
        });
      } else {
        setAnalysisError(new Error('Analysis completed but no result ID received'));
        showToast('Analysis issue: No result ID received', { variant: 'info' });
      }
    } catch (error) {
      console.error('Analysis error in EmergencyUploadPanel:', error);
      
      // Enhanced server error debugging
      if (error && (error as any).response && (error as any).response.data) {
        const serverError = (error as any).response.data;
        console.error('Server error details:', serverError);
        
        // Verbose error logging for debugging
        console.error('Full error object:', JSON.stringify(error, (key, value) => {
          if (key === 'request') return undefined; // Exclude request object to avoid circular references
          return value;
        }, 2));
        
        // Extract detailed error message if available
        const errorDetail = serverError.detail;
        const errorMessage = typeof errorDetail === 'string' 
          ? errorDetail 
          : JSON.stringify(errorDetail);
          
        setAnalysisError(new Error(`Server error: ${errorMessage}`));
        showToast(`Analysis failed: ${errorMessage}`, { variant: 'error' });
      } else {
        setAnalysisError(error instanceof Error ? error : new Error('Unknown analysis error'));
        
        // Show a more user-friendly error message
        const errorMessage = error instanceof Error ? error.message : 'Unknown analysis error';
        showToast(`Analysis failed: ${errorMessage}`, { variant: 'error' });
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, [uploadResponse, uploadComplete, showToast, isTextFile]);
  
  // Trigger file input click
  const handleSelectFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  
  // Handle clear file
  const handleClearFile = useCallback(() => {
    setLocalFile(null);
    setFileName('');
    setFileSize(0);
    setUploadComplete(false);
    setResultId(null);
    setUploadError(null);
    setAnalysisError(null);
    
    // Also clear the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    // Manual store update without subscription
    useUploadStore.setState(state => ({
      ...state,
      file: undefined,
      isTextFile: false,
      filePreview: null,
      uploadResponse: null,
      analysisResponse: null,
      uploadError: null,
      analysisError: null
    }));
  }, []);
  
  // Toggle text file setting
  const handleToggleTextFile = useCallback((value: string) => {
    const isText = value === 'text';
    setIsTextFile(isText);
    
    // Also update the store setting
    useUploadStore.setState(state => ({
      ...state,
      isTextFile: isText
    }));
  }, []);
  
  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Upload Data for Analysis</CardTitle>
        <CardDescription>
          Upload a file to analyze with design thinking frameworks.
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {/* File Type Selection */}
          <div className="mb-4">
            <Label htmlFor="data-type" className="mb-2 block">Data Type</Label>
            <RadioGroup 
              defaultValue={isTextFile ? 'text' : 'structured'} 
              onValueChange={handleToggleTextFile}
              className="flex space-x-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="structured" id="structured" />
                <Label htmlFor="structured">Structured Data (CSV, Excel)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="text" id="text" />
                <Label htmlFor="text">Free Text</Label>
              </div>
            </RadioGroup>
          </div>
          
          {/* File Upload Area */}
          <div 
            className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-gray-50 cursor-pointer transition-colors"
            onClick={handleSelectFileClick}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleFileChange}
              accept={isTextFile ? ".txt,.md,.doc,.docx" : ".csv,.xlsx,.xls,.json"}
            />
            
            {!fileName ? (
              <div className="flex flex-col items-center justify-center text-muted-foreground">
                <FileUp className="h-10 w-10 mb-2" />
                <p className="text-sm mb-1">Click to upload or drag and drop</p>
                <p className="text-xs">
                  {isTextFile ? 
                    "TXT, DOC, DOCX or MD files" : 
                    "CSV, XLSX or JSON files"}
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  {isTextFile ? <FileText className="h-8 w-8 mr-2" /> : <FilePen className="h-8 w-8 mr-2" />}
                  <div className="text-left">
                    <p className="text-sm font-medium text-foreground">{fileName}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(fileSize)}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClearFile();
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          
          {/* Error message */}
          {uploadError && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {uploadError.message}
              </AlertDescription>
            </Alert>
          )}
          
          {/* Analysis error message */}
          {analysisError && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {analysisError.message}
              </AlertDescription>
            </Alert>
          )}
          
          {/* Success message */}
          {uploadComplete && !uploadError && (
            <Alert variant="default" className="mt-4 bg-green-50 text-green-800 border-green-200">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                File uploaded successfully {resultId && `(ID: ${resultId})`}
              </AlertDescription>
            </Alert>
          )}
          
          {/* Upload progress */}
          {isUploading && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span>Uploading...</span>
                <span>Please wait</span>
              </div>
              <Progress value={80} className="h-2" />
            </div>
          )}
          
          {/* Analysis progress */}
          {isAnalyzing && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span>Analyzing...</span>
                <span>This may take a moment</span>
              </div>
              <Progress value={60} className="h-2" />
            </div>
          )}
        </div>
      </CardContent>
      
      <CardFooter className="flex justify-between">
        <Button 
          variant="outline" 
          onClick={handleClearFile}
          disabled={isUploading || isAnalyzing || !fileName}
        >
          Clear
        </Button>
        <div className="space-x-2">
          <Button
            variant="secondary"
            onClick={handleUpload}
            disabled={isUploading || isAnalyzing || !fileName || uploadComplete}
          >
            {isUploading ? 'Uploading...' : 'Upload'}
          </Button>
          <Button
            onClick={handleAnalysis}
            disabled={isUploading || isAnalyzing || !uploadComplete}
          >
            {isAnalyzing ? 'Analyzing...' : 'Analyze'}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
