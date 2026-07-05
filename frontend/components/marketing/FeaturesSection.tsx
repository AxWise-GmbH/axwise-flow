import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brain, Palette, Zap, Shield, BarChart3, FileText } from 'lucide-react';

export const FeaturesSection = () => {
  const coreFeatures = [
    {
      icon: Brain,
      title: "Customer Research Assistant",
      description: "AI-powered research question generation and dynamic forms",
      benefits: ["Custom research questions", "No experience needed", "5-minute setup"],
      highlight: "Like Google Forms, but intelligent"
    },
    {
      icon: FileText,
      title: "Interview Analysis",
      description: "Transform raw interviews into structured insights automatically",
      benefits: ["Pattern recognition", "Sentiment analysis", "Persona generation"],
      highlight: "Automated insight extraction"
    },
    {
      icon: BarChart3,
      title: "PRD Generation",
      description: "Create comprehensive product requirements documents from insights",
      benefits: ["Operational PRDs", "Technical specifications", "Action plans"],
      highlight: "From insights to implementation"
    }
  ];

  const capabilities = [
    {
      icon: Zap,
      title: "Fast & Efficient",
      metric: "Minutes, not weeks",
      description: "Streamlined workflow from research to PRD generation"
    },
    {
      icon: Palette,
      title: "No Expertise Required",
      metric: "User-friendly design",
      description: "Intuitive interface designed for any team member"
    },
    {
      icon: Shield,
      title: "Enterprise Ready",
      metric: "Secure & Compliant",
      description: "SOC 2 Type II in progress and end-to-end encryption"
    }
  ];

  return (
    <section className="py-16 md:py-24">
      <div className="container px-4 md:px-6 mx-auto">
        {/* Core Features */}
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-4">Core Features</Badge>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            Complete Research & Development <span className="text-primary">Workflow</span>
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
            From idea validation to product launch—everything you need in one integrated platform.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          {coreFeatures.map((feature, index) => (
            <Card key={index} className="border-primary/20 hover:border-primary/40 transition-colors relative">
              <CardHeader>
                <div className="w-12 h-12 mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <CardTitle className="text-xl">{feature.title}</CardTitle>
                <Badge variant="secondary" className="absolute top-4 right-4 text-xs">
                  {feature.highlight}
                </Badge>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">{feature.description}</p>
                <ul className="space-y-2">
                  {feature.benefits.map((benefit, benefitIndex) => (
                    <li key={benefitIndex} className="flex items-center text-sm">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full mr-2"></div>
                      {benefit}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Capabilities */}
        <div className="text-center mb-12">
          <h3 className="text-2xl md:text-3xl font-bold mb-6">
            Why Teams Choose AxWise
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {capabilities.map((capability, index) => (
            <div key={index} className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                <capability.icon className="w-8 h-8 text-primary" />
              </div>
              <h4 className="font-semibold text-lg mb-2">{capability.title}</h4>
              <p className="text-primary font-medium mb-2">{capability.metric}</p>
              <p className="text-sm text-muted-foreground">{capability.description}</p>
            </div>
          ))}
        </div>


      </div>
    </section>
  );
};
