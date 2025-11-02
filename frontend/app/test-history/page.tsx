'use client';

import { useEffect, useState } from 'react';

export default function TestHistoryPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('TestHistoryPage: Starting fetch...');
        const response = await fetch('http://localhost:8000/api/analyses', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN || 'DEV_TOKEN_REDACTED'}`,
            'Content-Type': 'application/json',
          },
        });

        console.log('TestHistoryPage: Response status:', response.status);
        
        if (response.ok) {
          const result = await response.json();
          console.log('TestHistoryPage: Data received:', result.length, 'items');
          setData(result);
        } else {
          const errorText = await response.text();
          console.error('TestHistoryPage: Error:', errorText);
          setError(`API Error: ${response.status} ${errorText}`);
        }
      } catch (err) {
        console.error('TestHistoryPage: Fetch error:', err);
        setError(`Fetch Error: ${err}`);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return <div className="p-4">Loading test history...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-500">Error: {error}</div>;
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Test History Data</h1>
      <p className="mb-4">Found {data?.length || 0} analyses</p>
      
      {data && data.length > 0 && (
        <div className="space-y-4">
          {data.slice(0, 5).map((analysis: any) => (
            <div key={analysis.id} className="border p-4 rounded">
              <h3 className="font-semibold">Analysis #{analysis.id}</h3>
              <p>File: {analysis.fileName}</p>
              <p>Status: {analysis.status}</p>
              <p>Created: {new Date(analysis.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
      
      <details className="mt-8">
        <summary className="cursor-pointer font-semibold">Raw Data (Click to expand)</summary>
        <pre className="mt-2 p-4 bg-gray-100 rounded text-xs overflow-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}
