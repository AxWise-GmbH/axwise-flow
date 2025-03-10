import React, { useRef } from 'react';
import { 
  useUploadStore, 
  useCurrentFile, 
  useUploadStatus, 
  useAnalysisStatus,
  useLlmProvider 
} from '@/store/useUploadStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, FileText, Upload, Sparkles } from 'lucide-react';
import { useToast } from '@/components/providers/toast-provider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

/**
 * UploadPanel Component
 * Handles file selection, upload, and analysis initiation
 */
export default function UploadPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  
  // Get access to the upload store actions
  const setFile = useUploadStore((state) => state.setFile);
  const clearFile = useUploadStore((state) => state.clearFile);
  const uploadFile = useUploadStore((state) => state.uploadFile);
  const startAnalysis = useUploadStore((state) => state.startAnalysis);
  const clearErrors = useUploadStore((state) => state.clearErrors);
  
  // Get current state from the store using selectors
  const { file, isTextFile, filePreview } = useCurrentFile();
  const { isUploading, uploadResponse, uploadError } = useUploadStatus();
  const { isAnalyzing, analysisResponse, analysisError } = useAnalysisStatus();
  const { provider: llmProvider, setProvider: setLlmProvider } = useLlmProvider();
  
  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };
  
  // Handle file upload
  const handleUpload = async () => {
    if (!file) {
      showToast('Please select a file to upload', { variant: 'error' });
      return;
    }
    
    const response = await uploadFile();
    if (response) {
      showToast('File uploaded successfully', { variant: 'success' });
    }
  };
  
  // Handle analysis start
  const handleStartAnalysis = async () => {
    if (!uploadResponse) {
      showToast('Please upload a file first', { variant: 'error' });
      return;
    }
    
    const response = await startAnalysis();
    if (response) {
      showToast('Analysis started successfully', { variant: 'success' });
    }
  };
  
  // Trigger file input click
  const handleSelectFileClick = () => {
    fileInputRef.current?.click();
  };
  
  // Handle clear file
  const handleClearFile = () => {
    clearFile();
    // Also clear the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle>Upload Interview Data</CardTitle>
        <CardDescription>
          Upload your interview transcript file to analyze themes, patterns, and sentiment.
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* File Input Section */}
        <div className="space-y-4">
          <Label htmlFor="file-upload">Select Interview File</Label>
          
          <div className="flex items-center space-x-4">
            <Input
              ref={fileInputRef}
              id="file-upload"
              type="file"
              className="hidden"
              onChange={handleFileChange}
              accept=".txt,.text,.json"
            />
            
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleSelectFileClick}
              className="flex-1"
              disabled={isUploading}
            >
              <FileText className="mr-2 h-4 w-4" />
              {file ? 'Change File' : 'Select File'}
            </Button>
            
            {file && (
              <Button 
                type="button" 
                variant="ghost" 
                onClick={handleClearFile}
                disabled={isUploading}
              >
                Clear
              </Button>
            )}
          </div>
          
          {/* File Details */}
          {file && (
            <div className="bg-muted p-3 rounded-md">
              <p className="font-medium">{file.name}</p>
              <p className="text-sm text-muted-foreground">
                {isTextFile ? 'Text file' : 'JSON file'} - {(file.size / 1024).toFixed(2)} KB
              </p>
              
              {/* Text Preview for text files */}
              {isTextFile && filePreview && (
                <div className="mt-2">
                  <Label className="text-xs">Preview:</Label>
                  <div className="bg-background p-2 rounded text-xs mt-1 max-h-20 overflow-y-auto">
                    {filePreview}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Upload Error */}
          {uploadError && (
            <Alert variant="destructive">
              <AlertTitle>Upload Error</AlertTitle>
              <AlertDescription>{uploadError.message}</AlertDescription>
            </Alert>
          )}
        </div>
        
        {/* LLM Provider Selection */}
        <div className="space-y-3">
          <Label htmlFor="llm-provider">LLM Provider</Label>
          <RadioGroup 
            id="llm-provider" 
            value={llmProvider} 
            onValueChange={(value) => setLlmProvider(value as 'openai' | 'gemini')}
            className="flex space-x-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="openai" id="openai" />
              <Label htmlFor="openai">OpenAI</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="gemini" id="gemini" />
              <Label htmlFor="gemini">Gemini</Label>
            </div>
          </RadioGroup>
        </div>
      </CardContent>
      
      <CardFooter className="flex flex-col space-y-4">
        {/* Upload Button */}
        <Button 
          onClick={handleUpload} 
          disabled={!file || isUploading || !!uploadResponse}
          className="w-full"
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload File
            </>
          )}
        </Button>
        
        {/* Analysis Button - Only show when upload is complete */}
        {uploadResponse && !analysisResponse && (
          <Button 
            onClick={handleStartAnalysis} 
            disabled={isAnalyzing}
            className="w-full"
            variant="secondary"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting Analysis...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Start Analysis
              </>
            )}
          </Button>
        )}
        
        {/* Analysis Error */}
        {analysisError && (
          <Alert variant="destructive">
            <AlertTitle>Analysis Error</AlertTitle>
            <AlertDescription>{analysisError.message}</AlertDescription>
          </Alert>
        )}
        
        {/* Success State */}
        {analysisResponse && (
          <Alert>
            <AlertTitle>Analysis Started</AlertTitle>
            <AlertDescription>
              Your analysis has been started. Analysis ID: {analysisResponse.result_id}
            </AlertDescription>
          </Alert>
        )}
      </CardFooter>
    </Card>
  );
} 