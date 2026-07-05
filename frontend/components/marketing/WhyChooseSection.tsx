import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, TrendingUp, Users } from 'lucide-react';

export const WhyChooseSection = () => {
  const benefits = [
    {
      icon: Clock,
      title: "10x Faster Analysis",
      description: "What used to take weeks now takes hours",
      metric: "95% time reduction",
      details: "Transform hours of interviews into actionable insights in minutes, not weeks."
    },
    {
      icon: TrendingUp,
      title: "Higher Quality Insights",
      description: "AI catches patterns humans miss",
      metric: "3x more insights",
      details: "Our AI identifies subtle patterns and connections across multiple interviews."
    },
    {
      icon: Users,
      title: "Better Team Alignment",
      description: "Clear, visual insights everyone understands",
      metric: "90% stakeholder buy-in",
      details: "Present research findings in compelling, visual formats that drive decisions."
    },
    {
      icon: CheckCircle,
      title: "Proven ROI",
      description: "Measurable impact on product success",
      metric: "40% faster time-to-market",
      details: "Teams using AxWise ship better products faster with higher user satisfaction."
    }
  ];

  const comparisons = [
    {
      traditional: "Manual analysis takes 2-3 weeks",
      axwise: "AI analysis in 10-15 minutes",
      improvement: "95% faster"
    },
    {
      traditional: "Subjective interpretation varies by analyst",
      axwise: "Consistent, objective AI-driven insights",
      improvement: "Standardized quality"
    },
    {
      traditional: "Limited pattern recognition across interviews",
      axwise: "Cross-interview pattern detection",
      improvement: "3x more insights"
    },
    {
      traditional: "Static reports hard to share and act on",
      axwise: "Interactive dashboards and exports",
      improvement: "Better collaboration"
    }
  ];

  return (
    <section className="py-16 md:py-24 bg-muted/30">
      <div className="container px-4 md:px-6 mx-auto">
        <div className="text-center mb-16">
          <Badge variant="default" className="mb-4">Why Choose AxWise</Badge>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            The <span className="text-primary">Competitive Advantage</span> Your Team Needs
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
            Don't just take our word for it. See how AxWise transforms the way 
            product teams understand and act on user feedback.
          </p>
        </div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {benefits.map((benefit, index) => (
            <Card key={index} className="text-center border-primary/20 hover:border-primary/40 transition-colors">
              <CardContent className="p-6">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                  <benefit.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{benefit.title}</h3>
                <p className="text-sm text-muted-foreground mb-3">{benefit.description}</p>
                <Badge variant="secondary" className="text-xs">{benefit.metric}</Badge>
                <p className="text-xs text-muted-foreground mt-2">{benefit.details}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Comparison Table */}
        <div className="bg-card rounded-2xl p-8 border border-primary/20">
          <h3 className="text-2xl font-bold text-center mb-8">Traditional vs. AxWise Approach</h3>
          <div className="space-y-6">
            {comparisons.map((comparison, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center p-4 rounded-lg bg-muted/50">
                <div className="text-center md:text-left">
                  <p className="text-sm text-muted-foreground mb-1">Traditional Method</p>
                  <p className="font-medium">{comparison.traditional}</p>
                </div>
                <div className="text-center md:text-left">
                  <p className="text-sm text-muted-foreground mb-1">AxWise Method</p>
                  <p className="font-medium text-primary">{comparison.axwise}</p>
                </div>
                <div className="text-center md:text-right">
                  <Badge variant="default" className="text-xs">
                    {comparison.improvement}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Call to Action */}
        <div className="mt-16 text-center">
          <div className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-2xl p-8 md:p-12 border border-primary/20">
            <h3 className="text-2xl md:text-3xl font-bold mb-4">
              Join the Future of User Research
            </h3>
            <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
              Stop spending weeks on analysis. Start getting insights in minutes. 
              Your users (and your team) will thank you.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
