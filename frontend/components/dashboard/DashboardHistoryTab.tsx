// Server component for fetching history data for the dashboard
// This component is specifically for the dashboard tabs and will be replaced by the unified history implementation
import { serverApiClient } from '@/lib/serverApiClient';
import HistoryTabClient from './HistoryTabClient';
import { ListAnalysesParams } from '@/types/api';

interface DashboardHistoryTabProps {
  searchParams?: { 
    sortBy?: 'date' | 'name',
    sortDirection?: 'asc' | 'desc',
    status?: 'all' | 'completed' | 'pending' | 'failed'
  }
}

export default async function DashboardHistoryTab({ searchParams }: DashboardHistoryTabProps): Promise<JSX.Element> {
  // Default sorting and filtering parameters
  const sortBy = searchParams?.sortBy || 'date';
  const sortDirection = searchParams?.sortDirection || 'desc';
  const filterStatus = searchParams?.status || 'all';
  
  // Convert to API params format
  const apiParams: ListAnalysesParams = {
    sortBy: sortBy === 'date' ? 'createdAt' : 'fileName',
    sortDirection: sortDirection,
    status: filterStatus === 'all' ? undefined : filterStatus,
  };
  
  // Fetch analyses using serverApiClient
  const analyses = await serverApiClient.listAnalyses(apiParams);
  
  return (
    <HistoryTabClient 
      // Pass the correct type expected by HistoryTabClient
      sortBy={sortBy === 'date' ? 'createdAt' : 'fileName'} 
      sortDirection={sortDirection}
      filterStatus={filterStatus}
    />
  );
}
