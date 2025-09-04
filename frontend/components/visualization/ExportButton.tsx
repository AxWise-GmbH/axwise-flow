'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { getMarkdownExportUrl } from '@/lib/api';

interface ExportButtonProps {
  analysisId: string;
}

export function ExportButton({ analysisId }: ExportButtonProps): JSX.Element {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    try {
      setIsExporting(true);

      // Get auth token from Clerk
      const { getAuthToken } = await import('@/lib/api/auth');
      const authToken = await getAuthToken();

      if (!authToken) {
        toast({
          title: 'Authentication Required',
          description: 'Please sign in to export analysis results.',
          variant: 'destructive',
        });
        return;
      }

      // Get the markdown export URL
      const exportUrl = getMarkdownExportUrl(analysisId);

      // Open the URL in a new tab/window with auth token as query parameter
      window.open(`${exportUrl}?auth_token=${encodeURIComponent(authToken)}`, '_blank');

      toast({
        title: 'Export Started',
        description: 'Your Markdown export has started. Check your downloads folder.',
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: 'Export Failed',
        description: 'There was an error exporting your report. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button variant="outline" size="sm" disabled={isExporting} onClick={handleExport}>
      {isExporting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Exporting...
        </>
      ) : (
        <>
          <Download className="mr-2 h-4 w-4" />
          Export Markdown
        </>
      )}
    </Button>
  );
}

export default ExportButton;
