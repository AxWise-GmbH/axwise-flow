import { Suspense } from 'react';
import HistoryTabClient from './HistoryTabClient';
import { fetchAnalysisHistory } from '@/app/actions';

export interface AnalysisHistory {
  id: string;
  filename?: string;
  createdAt?: string;
  llmProvider?: string;
  themes?: any[];
}

// This is a Server Component so it doesn't use 'use client'
export default async function HistoryTab({
  searchParams
}: {
  searchParams: { page?: string }
}) {
  // Parse current page from URL or default to 1
  const currentPage = searchParams.page ? parseInt(searchParams.page, 10) : 1;
  const pageSize = 5; // Number of items per page
  
  // Fetch data server-side
  const result = await fetchAnalysisHistory(currentPage, pageSize);
  
  // Format for the client component
  const historyItems = result.items || [];
  const totalPages = Math.ceil((result.totalItems || 0) / pageSize);
  
  return (
    <Suspense fallback={<div>Loading history...</div>}>
      <HistoryTabClient 
        historyItems={historyItems}
        totalPages={totalPages}
        currentPage={currentPage}
      />
    </Suspense>
  );
} 