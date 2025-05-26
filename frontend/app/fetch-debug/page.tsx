'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AdminLayout } from '@/components/admin/admin-layout';
import { Activity, Database, Shield, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface SystemInfo {
  status: string;
  timestamp: string;
  system: {
    python_version: string;
    platform: string;
    executable: string;
    path: string[];
  };
  environment: {
    has_gemini_key: boolean;
    has_CLERK_...=***REMOVED***
    has_stripe_key: boolean;
    enable_CLERK_...=***REMOVED***
    llm_provider: string;
    database_type: string;
  };
  server_id: string;
}

interface DatabaseStatus {
  status: string;
  timestamp: string;
  database: {
    type: string;
    version: string;
    url_masked: string;
  };
  statistics: {
    users: number;
    analyses: number;
    interviews: number;
  };
}

export default function FetchDebugPage() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const fetchSystemInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/debug/system-info`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setSystemInfo(data);
    } catch (err) {
      setError(`Failed to fetch system info: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchDatabaseStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/api/debug/database-status`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setDatabaseStatus(data);
    } catch (err) {
      setError(`Failed to fetch database status: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllData = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchSystemInfo(), fetchDatabaseStatus()]);
    } catch (err) {
      setError(`Failed to fetch debug data: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const getStatusIcon = (status: boolean | string) => {
    if (typeof status === 'boolean') {
      return status ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />;
    }
    return status === 'connected' || status === 'success' ? 
      <CheckCircle className="h-4 w-4 text-green-500" /> : 
      <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  };

  const getStatusBadge = (status: boolean | string) => {
    if (typeof status === 'boolean') {
      return (
        <Badge variant={status ? 'default' : 'destructive'}>
          {status ? 'Available' : 'Missing'}
        </Badge>
      );
    }
    return (
      <Badge variant={status === 'connected' || status === 'success' ? 'default' : 'secondary'}>
        {status}
      </Badge>
    );
  };

  return (
    <AdminLayout 
      title="API Testing & Debug" 
      description="Test backend API endpoints and monitor system status"
    >
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Backend API Debug Panel</h2>
            <p className="text-muted-foreground">Monitor backend health and configuration</p>
          </div>
          <Button onClick={fetchAllData} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh All'}
          </Button>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* API Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              API Configuration
            </CardTitle>
            <CardDescription>Current API endpoint configuration</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="font-medium">Backend URL:</span>
                <code className="text-sm bg-muted px-2 py-1 rounded">{apiUrl}</code>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Environment:</span>
                <Badge variant="outline">{process.env.NODE_ENV || 'development'}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* System Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              System Information
            </CardTitle>
            <CardDescription>Backend system status and configuration</CardDescription>
          </CardHeader>
          <CardContent>
            {systemInfo ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Environment Variables</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span>Gemini API Key:</span>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(systemInfo.environment.has_gemini_key)}
                          {getStatusBadge(systemInfo.environment.has_gemini_key)}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Clerk Secret Key:</span>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(systemInfo.environment.has_clerk_key)}
                          {getStatusBadge(systemInfo.environment.has_clerk_key)}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Stripe Secret Key:</span>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(systemInfo.environment.has_stripe_key)}
                          {getStatusBadge(systemInfo.environment.has_stripe_key)}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Configuration</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>LLM Provider:</span>
                        <Badge variant="outline">{systemInfo.environment.llm_provider}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Database Type:</span>
                        <Badge variant="outline">{systemInfo.environment.database_type}</Badge>
                      </div>
                      <div className="flex justify-between">
                        <span>Clerk Validation:</span>
                        <Badge variant={systemInfo.environment.enable_CLERK_...=***REMOVED*** 'true' ? 'default' : 'secondary'}>
                          {systemInfo.environment.enable_clerk_validation}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">System Details</h4>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p><strong>Python:</strong> {systemInfo.system.python_version}</p>
                    <p><strong>Platform:</strong> {systemInfo.system.platform}</p>
                    <p><strong>Server ID:</strong> {systemInfo.server_id}</p>
                    <p><strong>Last Updated:</strong> {new Date(systemInfo.timestamp).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {loading ? 'Loading system information...' : 'Click "Refresh All" to load system information'}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Database Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Database Status
            </CardTitle>
            <CardDescription>Database connection and statistics</CardDescription>
          </CardHeader>
          <CardContent>
            {databaseStatus ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Connection Status:</span>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(databaseStatus.status)}
                    {getStatusBadge(databaseStatus.status)}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Database Info</h4>
                    <div className="space-y-1 text-sm">
                      <p><strong>Type:</strong> {databaseStatus.database.type}</p>
                      <p><strong>Version:</strong> {databaseStatus.database.version}</p>
                      <p><strong>URL:</strong> {databaseStatus.database.url_masked}</p>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Statistics</h4>
                    <div className="space-y-1 text-sm">
                      <p><strong>Users:</strong> {databaseStatus.statistics.users}</p>
                      <p><strong>Analyses:</strong> {databaseStatus.statistics.analyses}</p>
                      <p><strong>Interviews:</strong> {databaseStatus.statistics.interviews}</p>
                    </div>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p><strong>Last Checked:</strong> {new Date(databaseStatus.timestamp).toLocaleString()}</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {loading ? 'Loading database status...' : 'Click "Refresh All" to load database status'}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
