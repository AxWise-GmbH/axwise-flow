import React, { useEffect } from 'react';
import { useAnalysisStore, useAnalysisHistory } from '@/store/useAnalysisStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Loader2, ChevronDown, Search, ArrowUpDown, ChevronRight } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { DetailedAnalysisResult } from '@/types/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * HistoryPanel Component
 * Displays a list of past analyses and allows selecting one for visualization
 */
export default function HistoryPanel() {
  // Get history state from the store
  const { 
    history, 
    isLoading, 
    error, 
    filters, 
    setFilters, 
    fetchHistory 
  } = useAnalysisHistory();
  
  // Get methods to set current analysis
  const setCurrentAnalysis = useAnalysisStore(state => state.setCurrentAnalysis);
  
  // Fetch history on mount
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory, filters]);
  
  // Handle selecting an analysis
  const handleSelectAnalysis = (analysis: DetailedAnalysisResult) => {
    setCurrentAnalysis(analysis);
    
    // Navigate programmatically to visualize tab if needed
    // You could use router.push or a similar method here
  };
  
  // Toggle sort direction
  const toggleSortDirection = () => {
    setFilters({ 
      sortDirection: filters.sortDirection === 'asc' ? 'desc' : 'asc' 
    });
  };
  
  // Change sort field
  const changeSortBy = (field: 'createdAt' | 'fileName') => {
    setFilters({ sortBy: field });
  };
  
  // Change status filter
  const changeStatusFilter = (status: 'all' | 'completed' | 'pending' | 'failed') => {
    setFilters({ status });
  };
  
  // Format file size for display
  const formatFileSize = (bytes: number | undefined) => {
    if (!bytes) return 'Unknown';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(2)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
  };
  
  // Get status badge with valid variants
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="secondary">Completed</Badge>;
      case 'pending':
        return <Badge variant="outline">Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };
  
  // Loading state
  if (isLoading && history.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="flex justify-center items-center py-12">
          <div className="flex flex-col items-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading analysis history...</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  // Error state
  if (error && history.length === 0) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error Loading History</AlertTitle>
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Analysis History</CardTitle>
        <CardDescription>
          View and manage your previous analyses
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            <Input
              placeholder="Search analyses..."
              className="w-full"
              // Implement search functionality if needed
            />
          </div>
          
          <div className="flex gap-2">
            <Select
              value={filters.status}
              onValueChange={(value) => changeStatusFilter(value as any)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="ml-auto">
                  Sort By <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => changeSortBy('createdAt')}>
                  Date {filters.sortBy === 'createdAt' && '✓'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => changeSortBy('fileName')}>
                  File Name {filters.sortBy === 'fileName' && '✓'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={toggleSortDirection}>
                  {filters.sortDirection === 'desc' ? 'Newest First ✓' : 'Oldest First ✓'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        
        {/* Analysis Table */}
        {history.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">
                    <div className="flex items-center space-x-1">
                      <span>File Name</span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="ml-1 h-8 w-8 p-0"
                        onClick={() => {
                          changeSortBy('fileName');
                          if (filters.sortBy === 'fileName') {
                            toggleSortDirection();
                          }
                        }}
                      >
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center space-x-1">
                      <span>Date</span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="ml-1 h-8 w-8 p-0"
                        onClick={() => {
                          changeSortBy('createdAt');
                          if (filters.sortBy === 'createdAt') {
                            toggleSortDirection();
                          }
                        }}
                      >
                        <ArrowUpDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Status</TableHead>
                  <TableHead className="hidden md:table-cell">Size</TableHead>
                  <TableHead className="hidden md:table-cell">Provider</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((analysis) => (
                  <TableRow key={analysis.id}>
                    <TableCell className="font-medium">
                      {analysis.fileName.length > 20
                        ? `${analysis.fileName.substring(0, 20)}...`
                        : analysis.fileName}
                    </TableCell>
                    <TableCell>
                      {new Date(analysis.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {getStatusBadge(analysis.status)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {formatFileSize(analysis.fileSize)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {analysis.llmProvider || 'Unknown'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSelectAnalysis(analysis)}
                        disabled={analysis.status !== 'completed'}
                      >
                        <span className="sr-only md:not-sr-only md:inline-block mr-2">
                          View
                        </span>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 border rounded-md">
            <p className="text-muted-foreground">No analyses found.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Upload a file and run an analysis to get started.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 