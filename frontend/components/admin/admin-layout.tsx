'use client';

import { useAdminAccess } from '@/hooks/use-admin-access';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Shield, Lock, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { ReactNode } from 'react';

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  description?: string;
  requireSuperAdmin?: boolean;
}

/**
 * Admin Layout Component
 * Provides access control and consistent layout for admin pages
 */
export function AdminLayout({ 
  children, 
  title, 
  description,
  requireSuperAdmin = false 
}: AdminLayoutProps) {
  const { isAdmin, isLoading, user } = useAdminAccess();

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Checking admin access...</p>
        </div>
      </div>
    );
  }

  // Access denied
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <Lock className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle className="text-red-600">Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access this admin panel.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              This area is restricted to administrators only.
            </p>
            <Link href="/unified-dashboard">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Return to Dashboard
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Super admin check
  if (requireSuperAdmin) {
    const userRole = user?.publicMetadata?.role as string;
    const isSuperAdmin = userRole === 'super_admin' || 
      user?.primaryEmailAddress?.emailAddress === 'vitalijs@axwise.de';
    
    if (!isSuperAdmin) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
                <Shield className="h-6 w-6 text-orange-600" />
              </div>
              <CardTitle className="text-orange-600">Super Admin Required</CardTitle>
              <CardDescription>
                This section requires super administrator privileges.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Link href="/admin">
                <Button variant="outline" className="w-full">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Admin Panel
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      );
    }
  }

  // Admin access granted
  return (
    <div className="min-h-screen bg-background">
      {/* Admin Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/unified-dashboard">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Dashboard
                </Button>
              </Link>
              <div className="flex items-center space-x-2">
                <Shield className="h-5 w-5 text-primary" />
                <h1 className="text-xl font-semibold">{title}</h1>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">
                Admin: {user?.firstName || user?.emailAddresses[0]?.emailAddress}
              </span>
            </div>
          </div>
          {description && (
            <p className="text-sm text-muted-foreground mt-2">{description}</p>
          )}
        </div>
      </div>

      {/* Admin Content */}
      <div className="container mx-auto px-4 py-6">
        <Alert className="mb-6">
          <Shield className="h-4 w-4" />
          <AlertDescription>
            You are accessing the admin debug panel. All actions are logged and monitored.
          </AlertDescription>
        </Alert>
        
        {children}
      </div>
    </div>
  );
}
