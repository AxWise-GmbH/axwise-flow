'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  User, 
  MapPin, 
  GraduationCap, 
  DollarSign, 
  Building2, 
  Briefcase, 
  Calendar,
  Home,
  Users,
  Target,
  ArrowLeft
} from 'lucide-react';
import { useRouter } from 'next/navigation';

// Sample demographics data for demonstration
const sampleDemographics = [
  { key: 'Age Range', value: '28-32', icon: Calendar },
  { key: 'Location', value: 'Newly developed residential area in Bremen Nord', icon: MapPin },
  { key: 'Education', value: "Master's Degree in Computer Science", icon: GraduationCap },
  { key: 'Income Level', value: 'Upper-middle', icon: DollarSign },
  { key: 'Company Size', value: 'Large Tech Company', icon: Building2 },
  { key: 'Industry Experience', value: '7 years in software development', icon: Briefcase },
  { key: 'Housing Status', value: 'First-time homeowner', icon: Home },
  { key: 'Household', value: 'Lives with partner', icon: Users },
  { key: 'Profile', value: 'Moved from a city apartment in Berlin, Max and his partner are first-time homeowners. They have very little gardening experience and bought a modern house with a small, undeveloped garden plot.', icon: Target }
];

// Icon mapping for different demographic categories
const getIconForKey = (key: string) => {
  const keyLower = key.toLowerCase();
  if (keyLower.includes('age')) return Calendar;
  if (keyLower.includes('location') || keyLower.includes('address')) return MapPin;
  if (keyLower.includes('education') || keyLower.includes('degree')) return GraduationCap;
  if (keyLower.includes('income') || keyLower.includes('salary')) return DollarSign;
  if (keyLower.includes('company') || keyLower.includes('organization')) return Building2;
  if (keyLower.includes('experience') || keyLower.includes('industry')) return Briefcase;
  if (keyLower.includes('housing') || keyLower.includes('home')) return Home;
  if (keyLower.includes('household') || keyLower.includes('family')) return Users;
  if (keyLower.includes('profile') || keyLower.includes('background')) return Target;
  return User; // Default icon
};

// Color scheme for different categories
const getCategoryColor = (key: string) => {
  const keyLower = key.toLowerCase();
  if (keyLower.includes('age') || keyLower.includes('profile') || keyLower.includes('background')) {
    return 'bg-blue-50 border-blue-200 text-blue-800';
  }
  if (keyLower.includes('location') || keyLower.includes('housing') || keyLower.includes('home')) {
    return 'bg-green-50 border-green-200 text-green-800';
  }
  if (keyLower.includes('education') || keyLower.includes('experience')) {
    return 'bg-purple-50 border-purple-200 text-purple-800';
  }
  if (keyLower.includes('income') || keyLower.includes('company') || keyLower.includes('industry')) {
    return 'bg-amber-50 border-amber-200 text-amber-800';
  }
  if (keyLower.includes('household') || keyLower.includes('family')) {
    return 'bg-pink-50 border-pink-200 text-pink-800';
  }
  return 'bg-gray-50 border-gray-200 text-gray-800'; // Default
};

// Enhanced Demographics Card Component
const EnhancedDemographicsCard: React.FC<{ demographics: typeof sampleDemographics }> = ({ demographics }) => {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5 text-blue-600" />
          Enhanced Demographics Design
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {demographics.map((item, index) => {
            const IconComponent = getIconForKey(item.key);
            const colorClass = getCategoryColor(item.key);
            const isLongContent = item.value.length > 50;
            
            return (
              <div
                key={index}
                className={`p-4 rounded-lg border ${colorClass} ${isLongContent ? 'md:col-span-2' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <IconComponent className="h-4 w-4 mt-0.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm mb-1">
                      {item.key}
                    </div>
                    <div className="text-sm leading-relaxed">
                      {item.value}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

// Current Simple Design (for comparison)
const SimpleDemographicsCard: React.FC<{ demographics: typeof sampleDemographics }> = ({ demographics }) => {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Current Simple Design</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {demographics.map((item, index) => (
            <div key={index} className="flex flex-col sm:flex-row sm:items-start border-l-2 border-gray-100 pl-3">
              <span className="font-semibold text-gray-900 min-w-[140px] mb-1 sm:mb-0 text-sm uppercase tracking-wide">
                {item.key}:
              </span>
              <span className="text-gray-700 sm:ml-3 leading-relaxed text-sm">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default function DemographicsDemo() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Demographics Design Comparison</h1>
            <p className="text-muted-foreground">
              Comparing current vs enhanced demographics styling for simulation history
            </p>
          </div>
        </div>

        {/* Design Comparison */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Enhanced Design */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-green-100 text-green-800">
                Enhanced
              </Badge>
              <h2 className="text-lg font-semibold">Proposed Design</h2>
            </div>
            <EnhancedDemographicsCard demographics={sampleDemographics} />
            
            <div className="text-sm text-muted-foreground space-y-2">
              <p><strong>Improvements:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Icons for visual hierarchy and quick recognition</li>
                <li>Color-coded categories for better organization</li>
                <li>Responsive grid layout for better space usage</li>
                <li>Long content spans full width automatically</li>
                <li>Consistent spacing and typography</li>
              </ul>
            </div>
          </div>

          {/* Current Design */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                Current
              </Badge>
              <h2 className="text-lg font-semibold">Current Design</h2>
            </div>
            <SimpleDemographicsCard demographics={sampleDemographics} />
            
            <div className="text-sm text-muted-foreground space-y-2">
              <p><strong>Current approach:</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Simple key-value pairs with border accent</li>
                <li>Uppercase labels for emphasis</li>
                <li>Responsive flex layout</li>
                <li>Minimal visual hierarchy</li>
                <li>Clean but basic presentation</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Implementation Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Implementation Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-medium mb-2">Key Features of Enhanced Design:</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="font-medium text-blue-600 mb-1">Visual Hierarchy</h4>
                  <p>Icons and color coding help users quickly identify different types of information</p>
                </div>
                <div>
                  <h4 className="font-medium text-green-600 mb-1">Smart Layout</h4>
                  <p>Responsive grid that adapts to content length and screen size</p>
                </div>
                <div>
                  <h4 className="font-medium text-purple-600 mb-1">Category Grouping</h4>
                  <p>Related information uses consistent colors (personal, professional, location)</p>
                </div>
                <div>
                  <h4 className="font-medium text-amber-600 mb-1">Accessibility</h4>
                  <p>High contrast colors and clear typography for better readability</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
