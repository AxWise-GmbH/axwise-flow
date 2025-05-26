'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Check, Star, Zap } from 'lucide-react';
import Link from 'next/link';
import { trackCTAClick, trackPricingInteraction, ButtonLocation } from '@/lib/analytics';

export const CTASection = () => {
  const pricingTiers = [
    {
      name: "Community Edition",
      price: "€0",
      description: "Free & Open Source, Self-Hosted",
      features: [
        "Complete AxWise Open-Source Platform",
        "All Core Software Features",
        "Use with Your Own LLMs",
        "Full Data Sovereignty & Control",
        "Community Forum Support",
        "Apache v2 License"
      ],
      cta: "Download from GitHub",
      href: "/pricing",
      popular: false
    },
    {
      name: "Starter Pack",
      price: "€15",
      period: "/month",
      description: "Your AI Co-Pilot, Fully Managed",
      features: [
        "Fully Hosted AxWise Platform",
        "Powered by Managed Gemini AI",
        "Up to 20 Core Analyses per month",
        "Up to 2 PRD outputs per month",
        "Standard Email Support",
        "1 user seat"
      ],
      cta: "Choose Starter Plan",
      href: "/pricing",
      popular: false
    },
    {
      name: "Pro Version",
      price: "€49",
      period: "/month",
      description: "Scale Your Strategic AI Power",
      features: [
        "All Starter Pack features",
        "Up to 100 Core Analyses per month",
        "Up to 100 PRD outputs per month",
        "Priority Email Support",
        "Team Collaboration (up to 5 users)",
        "7-Day Free Trial option"
      ],
      cta: "Start 7-Day Free Trial",
      href: "/pricing",
      popular: true
    },
    {
      name: "Enterprise",
      price: "Custom",
      description: "Bespoke AI Strategy & Support",
      features: [
        "All Pro Version features",
        "Unlimited/Custom High-Volume Analyses",
        "Direct Prompt Adjustment capabilities",
        "Dedicated Account Manager",
        "Advanced Security & Compliance",
        "Industry-specific Fine-tuning"
      ],
      cta: "Contact Sales",
      href: "/contact",
      popular: false
    }
  ];

  const benefits = [
    "Start analyzing in under 2 minutes",
    "No credit card required for free tier",
    "Cancel anytime",
    "30-day money-back guarantee"
  ];

  return (
    <section className="py-16 md:py-24 bg-gradient-to-br from-primary/5 to-accent/5">
      <div className="container px-4 md:px-6 mx-auto">
        <div className="text-center mb-16">
          <Badge variant="default" className="mb-4">Pricing</Badge>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-6">
            Choose Your <span className="text-primary">Research Superpower</span>
          </h2>
          <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-4">
            Start free and scale as you grow. All plans include our core AI analysis
            and insight generation capabilities.
          </p>
          <p className="text-sm text-muted-foreground">
            Monthly pricing shown. Weekly (€4/€15) and annual billing (save up to 17%) available.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          {pricingTiers.map((tier, index) => (
            <Card
              key={index}
              className={`relative border-2 transition-all duration-300 hover:shadow-lg ${
                tier.popular
                  ? 'border-primary shadow-lg scale-105'
                  : 'border-primary/20 hover:border-primary/40'
              }`}
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-primary text-white px-4 py-1">
                    <Star className="w-3 h-3 mr-1" />
                    Most Popular
                  </Badge>
                </div>
              )}

              <CardContent className="p-8">
                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold mb-2">{tier.name}</h3>
                  <div className="mb-2">
                    <span className="text-3xl font-bold">{tier.price}</span>
                    {tier.period && <span className="text-muted-foreground">{tier.period}</span>}
                  </div>
                  <p className="text-sm text-muted-foreground">{tier.description}</p>
                </div>

                <ul className="space-y-3 mb-8">
                  {tier.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center text-sm">
                      <Check className="w-4 h-4 text-primary mr-2 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link href={tier.href} className="w-full">
                  <Button
                    className={`w-full ${
                      tier.popular
                        ? 'gradient-btn text-white'
                        : 'variant-outline'
                    }`}
                    size="lg"
                    onClick={() => trackPricingInteraction('select_plan', tier.name, tier.price)}
                  >
                    {tier.cta}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Benefits */}
        <div className="text-center mb-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {benefits.map((benefit, index) => (
              <div key={index} className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Check className="w-4 h-4 text-primary" />
                {benefit}
              </div>
            ))}
          </div>
        </div>

        {/* Final CTA */}
        <div className="text-center">
          <div className="bg-card rounded-2xl p-8 md:p-12 border border-primary/20 max-w-4xl mx-auto">
            <Zap className="w-16 h-16 mx-auto mb-6 text-primary" />
            <h3 className="text-2xl md:text-3xl font-bold mb-4">
              Ready to Transform Your User Research?
            </h3>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Join hundreds of product teams who have already revolutionized their research process.
              Start your journey from insights to impact today.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/unified-dashboard">
                <Button
                  size="lg"
                  className="gradient-btn text-white font-medium px-8 py-6"
                  onClick={() => trackCTAClick('Start Free Analysis', ButtonLocation.CTA, 'primary')}
                >
                  Start Free Analysis <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>

              <Link href="/contact">
                <Button
                  variant="outline"
                  size="lg"
                  className="px-8 py-6"
                  onClick={() => trackCTAClick('Schedule Demo', ButtonLocation.CTA, 'secondary')}
                >
                  Schedule Demo
                </Button>
              </Link>
            </div>

            <p className="text-xs text-muted-foreground mt-4">
              No credit card required • 2-minute setup • Cancel anytime
            </p>
          </div>
        </div>


      </div>
    </section>
  );
};
