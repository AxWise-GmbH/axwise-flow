'use client';

import { useAuth, useUser, SignInButton, SignUpButton, SignOutButton } from '@clerk/nextjs';
import { isClerkConfigured } from '@/lib/clerk-config';
import { useEffect, useState } from 'react';
import { AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { User, Shield, Key, Settings, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

/**
 * Admin Authentication Debug Panel
 * Comprehensive authentication debugging and monitoring for administrators
 */
export default function AdminAuthPanel() {
  const { isSignedIn, userId, isLoaded } = useAuth();
  const { user } = useUser();
  const [clientSide, setClientSide] = useState(false);
  const [clerkConfigured, setClerkConfigured] = useState(false);

  useEffect(() => {
    setClientSide(true);
    setClerkConfigured(isClerkConfigured());
  }, []);

  if (!clientSide) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading Admin Panel...</p>
        </div>
      </div>
    );
  }

  const getStatusIcon = (status: boolean) => {
    return status ? (
      <CheckCircle className="h-4 w-4 text-green-600" />
    ) : (
      <XCircle className="h-4 w-4 text-red-600" />
    );
  };

  const getStatusBadge = (status: boolean, label: string) => {
    return (
      <Badge variant={status ? "default" : "destructive"} className="ml-2">
        {status ? "✅" : "❌"} {label}
      </Badge>
    );
  };

  return (
    <AdminLayout
      title="Authentication Debug Panel"
      description="Monitor and debug Clerk authentication system"
    >
      <Tabs defaultValue="status" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="status" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Status
          </TabsTrigger>
          <TabsTrigger value="user" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            User Info
          </TabsTrigger>
          <TabsTrigger value="config" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="actions" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            Actions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="status" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                System Status
              </CardTitle>
              <CardDescription>
                Real-time authentication system status and health checks
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="font-medium">Client Loaded</span>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(clientSide)}
                    {getStatusBadge(clientSide, clientSide ? "Ready" : "Loading")}
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="font-medium">Clerk Configured</span>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(clerkConfigured)}
                    {getStatusBadge(clerkConfigured, clerkConfigured ? "Configured" : "Missing")}
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="font-medium">Clerk Loaded</span>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(isLoaded)}
                    {getStatusBadge(isLoaded, isLoaded ? "Loaded" : "Loading")}
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="font-medium">User Authenticated</span>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(isSignedIn)}
                    {getStatusBadge(isSignedIn, isSignedIn ? "Signed In" : "Not Signed In")}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Configuration Details
              </CardTitle>
              <CardDescription>
                Environment variables and Clerk configuration settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="p-4 border rounded-lg bg-muted/50">
                  <h4 className="font-semibold mb-2">Environment</h4>
                  <p className="text-sm text-muted-foreground">
                    <strong>NODE_ENV:</strong> {process.env.NODE_ENV}
                  </p>
                </div>
                <div className="p-4 border rounded-lg bg-muted/50">
                  <h4 className="font-semibold mb-2">Clerk Configuration</h4>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p><strong>Publishable Key:</strong> {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.substring(0, 20)}...</p>
                    <p><strong>Domain:</strong> {process.env.NEXT_PUBLIC_CLERK_DOMAIN || 'Not set'}</p>
                    <p><strong>Sign In URL:</strong> {process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL || '/sign-in'}</p>
                    <p><strong>Sign Up URL:</strong> {process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL || '/sign-up'}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="user" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                User Information
              </CardTitle>
              <CardDescription>
                Current user authentication status and profile data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    {getStatusIcon(!!isSignedIn)}
                    Authentication Status
                  </h4>
                  <div className="space-y-2 text-sm">
                    <p><strong>Signed In:</strong> {isSignedIn ? '✅ Yes' : '❌ No'}</p>
                    <p><strong>User ID:</strong> {userId || 'Not available'}</p>
                  </div>
                </div>
                {isSignedIn && user && (
                  <div className="p-4 border rounded-lg">
                    <h4 className="font-semibold mb-2">Profile Information</h4>
                    <div className="space-y-2 text-sm">
                      <p><strong>Email:</strong> {user.emailAddresses?.[0]?.emailAddress || 'Not available'}</p>
                      <p><strong>First Name:</strong> {user.firstName || 'Not available'}</p>
                      <p><strong>Last Name:</strong> {user.lastName || 'Not available'}</p>
                      <p><strong>Created:</strong> {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Not available'}</p>
                      <p><strong>Last Sign In:</strong> {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleDateString() : 'Not available'}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Authentication Actions
              </CardTitle>
              <CardDescription>
                Test authentication flows and debug tools
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!clerkConfigured ? (
                <div className="p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
                  <p className="text-yellow-800 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Clerk is not properly configured. Check your environment variables.
                  </p>
                </div>
              ) : !isLoaded ? (
                <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg">
                  <p className="text-blue-800">⏳ Clerk is loading...</p>
                </div>
              ) : !isSignedIn ? (
                <div className="space-y-4">
                  <h4 className="font-semibold">Sign In Options</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <SignInButton mode="modal">
                      <Button className="w-full">
                        🔑 Sign In (Modal)
                      </Button>
                    </SignInButton>
                    <SignInButton mode="redirect">
                      <Button variant="secondary" className="w-full">
                        🔑 Sign In (Redirect)
                      </Button>
                    </SignInButton>
                  </div>
                  <h4 className="font-semibold">Sign Up Options</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <SignUpButton mode="modal">
                      <Button variant="outline" className="w-full">
                        📝 Sign Up (Modal)
                      </Button>
                    </SignUpButton>
                    <SignUpButton mode="redirect">
                      <Button variant="outline" className="w-full">
                        📝 Sign Up (Redirect)
                      </Button>
                    </SignUpButton>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <h4 className="font-semibold">User Actions</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <SignOutButton>
                      <Button variant="destructive" className="w-full">
                        🚪 Sign Out
                      </Button>
                    </SignOutButton>
                    <Button asChild className="w-full">
                      <a href="/unified-dashboard">
                        📊 Go to Dashboard
                      </a>
                    </Button>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t">
                <h4 className="font-semibold mb-2">Debug Tools</h4>
                <Button
                  variant="outline"
                  onClick={() => {
                    console.log('=== CLERK DEBUG INFO ===');
                    console.log('Window Clerk:', window.Clerk);
                    console.log('Clerk Config:', {
                      publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
                      domain: process.env.NEXT_PUBLIC_CLERK_DOMAIN,
                      isLoaded,
                      isSignedIn,
                      userId
                    });
                    console.log('========================');
                  }}
                  className="w-full"
                >
                  🔍 Log Debug Info to Console
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
}
