'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { API_ENDPOINTS } from '@/lib/apiEndpoints';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ExportButtonProps {
  analysisId: string;
}

export function ExportButton({ analysisId }: ExportButtonProps): JSX.Element {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const handleExport = async (format: 'pdf' | 'markdown') => {
    try {
      setIsExporting(true);

      // Get API URL from environment or use default
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      // Get auth token from cookie
      const authToken = document.cookie
        .split('; ')
        .find(row => row.startsWith('auth_token='))
        ?.split('=')[1] || 'DEV_TOKEN_REDACTED'; // Fallback to dev token

      // Create URL for export endpoint
      const endpoint = format === 'pdf'
        ? API_ENDPOINTS.EXPORT_PDF(Number(analysisId))
        : API_ENDPOINTS.EXPORT_MARKDOWN(Number(analysisId));

      // Open the URL in a new tab/window with auth token as query parameter
      window.open(`${apiUrl}${endpoint}?auth_token=${encodeURIComponent(authToken)}`, '_blank');

      toast({
        title: 'Export Started',
        description: `Your ${format.toUpperCase()} export has started. Check your downloads folder.`,
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isExporting}>
          {isExporting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Exporting...
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Export
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport('pdf')}>
          Export as PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('markdown')}>
          Export as Markdown
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ExportButton;
