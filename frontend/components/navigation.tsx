'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

// Remove Zustand import
// import { useAnalysisStore } from '@/store/useAnalysisStore';

export default function NavigationTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // Get active tab from URL params instead of Zustand
  const activeTab = searchParams.get('tab') || 'upload';
  
  // Navigate without Zustand
  const handleTabChange = (tab: string) => {
    // Create new search params - fix the type issue by creating a new URLSearchParams
    const params = new URLSearchParams();
    
    // Copy all current params
    searchParams.forEach((value, key) => {
      params.set(key, value);
    });
    
    // Set the tab parameter
    params.set('tab', tab);
    
    // Navigate to the new URL
    router.push(`${pathname}?${params.toString()}`);
  };
  
  return (
    <Card className="mb-6 p-2 shadow-sm">
      <div className="flex space-x-2">
        <Button
          variant={activeTab === 'upload' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('upload')}
        >
          Upload
        </Button>
        <Button
          variant={activeTab === 'visualize' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('visualize')}
        >
          Visualization
        </Button>
        <Button
          variant={activeTab === 'history' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('history')}
        >
          History
        </Button>
        <Button
          variant={activeTab === 'documentation' ? 'default' : 'ghost'}
          onClick={() => handleTabChange('documentation')}
        >
          Documentation
        </Button>
      </div>
    </Card>
  );
} 