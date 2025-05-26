'use client';

import { AdminLayout } from '@/components/admin/admin-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  User, 
  Database, 
  Activity, 
  Settings, 
  FileText, 
  BarChart3,
  AlertTriangle,
  ExternalLink
} from 'lucide-react';
import Link from 'next/link';

/**
 * Main Admin Dashboard
 * Central hub for all administrative tools and debug panels
 */
export default function AdminDashboard() {
  const debugTools = [
    {
      title: "Authentication Debug",
      description: "Monitor and debug Clerk authentication system",
      icon: Shield,
      href: "/clerk-debug",
      status: "active",
      category: "Authentication"
    },
    {
      title: "Firebase Integration",
      description: "Test Firebase services and integration status",
      icon: Database,
      href: "/firebase-official",
      status: "active",
      category: "Database"
    },
    {
      title: "API Testing",
      description: "Test backend API endpoints and responses",
      icon: Activity,
      href: "/fetch-debug",
      status: "active",
      category: "API"
    },
    {
      title: "Integration Tests",
      description: "Run comprehensive integration tests",
      icon: FileText,
      href: "/integration-test",
      status: "active",
      category: "Testing"
    },
    {
      title: "User Management",
      description: "Manage user accounts and permissions",
      icon: User,
      href: "/test-clerk",
      status: "active",
      category: "Users"
    }
  ];

  const systemStats = [
    {
      label: "Active Users",
      value: "1,234",
      change: "+12%",
      trend: "up"
    },
    {
      label: "API Requests",
      value: "45.2K",
      change: "+8%",
      trend: "up"
    },
    {
      label: "Error Rate",
      value: "0.02%",
      change: "-15%",
      trend: "down"
    },
    {
      label: "Uptime",
      value: "99.9%",
      change: "0%",
      trend: "stable"
    }
  ];

  return (
    <AdminLayout 
      title="Admin Dashboard" 
      description="Central administration and debugging interface for AxWise"
    >
      <div className="space-y-6">
        {/* System Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {systemStats.map((stat, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-bold">{stat.value}</p>
                  </div>
                  <div className="text-right">
                    <Badge 
                      variant={stat.trend === 'up' ? 'default' : stat.trend === 'down' ? 'secondary' : 'outline'}
                      className="text-xs"
                    >
                      {stat.change}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Debug Tools */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Debug & Monitoring Tools
            </CardTitle>
            <CardDescription>
              Access debugging panels and system monitoring tools
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {debugTools.map((tool, index) => {
                const Icon = tool.icon;
                return (
                  <Card key={index} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Icon className="h-5 w-5 text-primary" />
                          <Badge variant="outline" className="text-xs">
                            {tool.category}
                          </Badge>
                        </div>
                        <Badge 
                          variant={tool.status === 'active' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {tool.status}
                        </Badge>
                      </div>
                      <h3 className="font-semibold mb-2">{tool.title}</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        {tool.description}
                      </p>
                      <Button asChild className="w-full" size="sm">
                        <Link href={tool.href} className="flex items-center gap-2">
                          Open Tool
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                System Health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Database Connection</span>
                <Badge variant="default">Healthy</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Authentication Service</span>
                <Badge variant="default">Operational</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">API Gateway</span>
                <Badge variant="default">Online</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">File Storage</span>
                <Badge variant="default">Available</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Recent Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  No critical alerts in the last 24 hours
                </div>
                <Button variant="outline" size="sm" className="w-full">
                  View All Logs
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
