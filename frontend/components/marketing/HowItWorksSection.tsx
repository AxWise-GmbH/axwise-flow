import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Upload, Brain, BarChart3, FileText, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export const HowItWorksSection = () => {
  const steps = [
    {
      icon: Upload,
      step: "01",
      title: "Upload Your Interviews",
      description: "Simply drag and drop your interview files (text, JSON, or Excel) into AxWise",
      details: [
        "Supports multiple formats (JSON, TXT, XLSX, XLS)",
        "Batch upload for multiple interviews",
        "Secure, encrypted file handling"
      ],
      time: "30 seconds"
    },
    {
      icon: Brain,
      step: "02",
      title: "AI Analysis & Processing",
      description: "Our advanced AI analyzes your interviews to extract key insights and patterns",
      details: [
        "Automatic transcription and analysis",
        "Pattern recognition across interviews",
        "Sentiment and emotion detection"
      ],
      time: "5-10 minutes"
    },
    {
      icon: BarChart3,
      step: "03",
      title: "Review Interactive Insights",
      description: "Explore rich visualizations, personas, and insights through our intuitive dashboard",
      details: [
        "Interactive persona profiles",
        "Pain point analysis",
        "Opportunity identification"
      ],
      time: "Real-time"
    },
    {
      icon: FileText,
      step: "04",
      title: "Export & Share Results",
      description: "Generate comprehensive reports and PRDs ready to share with your team",
      details: [
        "Automated PRD generation",
        "Executive summary reports",
        "Shareable insight dashboards"
      ],
      time: "Instant"
    }
  ];

  const dataPoints = [
    { label: "User Personas", description: "Detailed profiles with demographics, goals, and pain points" },
    { label: "Pain Points", description: "Categorized and prioritized user frustrations" },
    { label: "Opportunities", description: "Actionable insights for product improvements" },
    { label: "Sentiment Analysis", description: "Emotional context behind user feedback" },
    { label: "Feature Requests", description: "Organized list of user-requested features" },
    { label: "Journey Maps", description: "Visual representation of user experiences" }
  ];

  return (
    <section className="py-16 md:py-24">
      <div className="container px-4 md:px-6 mx-auto">
        <div className="text-center mb-16">
          <Badge variant="default" className="mb-4">How It Works</Badge>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            From <span className="text-primary">Raw Interviews</span> to <span className="text-accent">Actionable Insights</span>
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
            Our streamlined process transforms hours of interview content into structured,
            actionable insights in just minutes.
          </p>
        </div>

        {/* Process Flow Diagram */}
        <div className="mb-16 text-center">
          <h3 className="text-2xl md:text-3xl font-bold mb-8">
            AxWise Process Flow
          </h3>
          <div className="bg-card rounded-2xl p-8 border border-primary/20 max-w-4xl mx-auto">
            <img
              src="/updatedflow.svg"
              alt="AxWise Process Flow Diagram"
              className="w-full h-auto max-h-96 object-contain"
            />
            <p className="text-sm text-muted-foreground mt-4">
              Visual representation of the AxWise workflow from interview upload to actionable insights
            </p>
          </div>
        </div>

        {/* Process Steps */}
        <div className="space-y-8 mb-16">
          {steps.map((step, index) => (
            <div key={index} className="flex flex-col lg:flex-row items-center gap-8">
              <div className={`flex-1 ${index % 2 === 1 ? 'lg:order-2' : ''}`}>
                <Card className="border-primary/20 hover:border-primary/40 transition-colors">
                  <CardContent className="p-8">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <step.icon className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <Badge variant="outline" className="text-xs mb-1">Step {step.step}</Badge>
                        <h3 className="text-xl font-semibold">{step.title}</h3>
                      </div>
                      <div className="ml-auto">
                        <Badge variant="secondary" className="text-xs">{step.time}</Badge>
                      </div>
                    </div>
                    <p className="text-muted-foreground mb-4">{step.description}</p>
                    <ul className="space-y-2">
                      {step.details.map((detail, detailIndex) => (
                        <li key={detailIndex} className="flex items-center text-sm">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary mr-2"></div>
                          {detail}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>

              <div className={`flex-shrink-0 ${index % 2 === 1 ? 'lg:order-1' : ''}`}>
                <div className="w-16 h-16 rounded-full bg-gradient-to-r from-primary to-accent flex items-center justify-center text-white font-bold text-xl">
                  {step.step}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Data Points Extracted */}
        <div className="bg-muted/30 rounded-2xl p-8 md:p-12 mb-16">
          <h3 className="text-2xl md:text-3xl font-bold text-center mb-8">
            Data Points Extracted from Your Interviews
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {dataPoints.map((point, index) => (
              <div key={index} className="text-center p-4 rounded-lg bg-card border border-primary/20">
                <h4 className="font-semibold mb-2">{point.label}</h4>
                <p className="text-sm text-muted-foreground">{point.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-2xl p-8 md:p-12 border border-primary/20">
            <h3 className="text-2xl md:text-3xl font-bold mb-4">
              Ready to Transform Your Research Process?
            </h3>
            <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
              Start analyzing your user interviews today and discover insights you never knew existed.
            </p>
            <Link href="/unified-dashboard">
              <Button size="lg" className="gradient-btn text-white font-medium px-8 py-6">
                Start Your Analysis <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};
