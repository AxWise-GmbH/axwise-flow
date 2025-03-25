'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

// Define necessary types directly
interface AnalysisHistory {
  id: string;
  filename?: string;
  createdAt?: string;
  llmProvider?: string;
  themes?: any[];
}

interface HistoryTabClientProps {
  historyItems: AnalysisHistory[];
  totalPages: number;
  currentPage: number;
}

export default function HistoryTabClient({
  historyItems,
  totalPages,
  currentPage
}: HistoryTabClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Local state for UI interactions
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  
  // Handle selecting an analysis for visualization
  const handleSelectAnalysis = (analysisId: string) => {
    setSelectedItem(analysisId);
    
    // Create URL with analysis ID and timestamp to prevent caching
    const timestamp = Date.now();
    const params = new URLSearchParams();
    params.set('tab', 'visualize');
    params.set('analysisId', analysisId);
    params.set('ts', timestamp.toString());
    
    // Navigate to visualization with the selected analysis
    router.push(`?${params.toString()}`);
  };
  
  // Handle pagination
  const handlePageChange = (page: number) => {
    // Create new search params
    const params = new URLSearchParams();
    
    // Copy all current params
    searchParams.forEach((value, key) => {
      params.set(key, value);
    });
    
    // Update page parameter
    params.set('page', page.toString());
    
    // Navigate to new page
    router.push(`?${params.toString()}`);
  };
  
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Analysis History</h2>
      
      {historyItems.length === 0 ? (
        <Card className="mt-4">
          <CardContent className="pt-6">
            <p>No analysis history found. Upload a file to start analyzing.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4 mt-4">
          {historyItems.map((item) => (
            <Card key={item.id} className={selectedItem === item.id ? 'border-blue-500' : ''}>
              <CardHeader>
                <CardTitle>{item.filename || 'Untitled Analysis'}</CardTitle>
                <CardDescription>
                  Created {new Date(item.createdAt || '').toLocaleString()} • 
                  {item.llmProvider || 'AI'} Analysis
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-500 truncate">
                  {item.themes && item.themes.length > 0 
                    ? `${item.themes.length} themes identified` 
                    : 'No themes available'}
                </p>
              </CardContent>
              <CardFooter>
                <Button
                  variant="outline"
                  onClick={() => handleSelectAnalysis(item.id)}
                  className="mr-2"
                >
                  View
                </Button>
              </CardFooter>
            </Card>
          ))}
          
          {totalPages > 1 && (
            <div className="flex justify-center mt-4">
              <div className="flex space-x-2">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <Button
                    key={i}
                    variant={currentPage === i + 1 ? "default" : "outline"}
                    onClick={() => handlePageChange(i + 1)}
                    className="w-10 h-10 p-0"
                  >
                    {i + 1}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 