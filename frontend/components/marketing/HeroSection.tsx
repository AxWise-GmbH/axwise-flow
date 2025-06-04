'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, ArrowDown, GitBranch, Heart, Star, Users } from 'lucide-react';
import Link from 'next/link';
import { trackCTAClick, trackButtonClick, ButtonLocation } from '@/lib/analytics';

// Dynamic hooks with proper emphasis
const hooks = [
  {
    text: "Spending weeks on research that leads ",
    emphasis: "nowhere",
    suffix: "?"
  },
  {
    text: "Tired of building features ",
    emphasis: "nobody wants",
    suffix: "?"
  },
  {
    text: "Your competitors are shipping while you're still ",
    emphasis: "researching",
    suffix: ""
  },
  {
    text: "Stop losing customers to ",
    emphasis: "faster-moving competitors",
    suffix: ""
  },
  {
    text: "Build products customers actually want to ",
    emphasis: "buy",
    suffix: ""
  },
  {
    text: "Make ",
    emphasis: "data-driven decisions",
    suffix: ", not gut-feeling gambles"
  }
];

export const HeroSection = () => {
  const [currentHookIndex, setCurrentHookIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsVisible(false);

      setTimeout(() => {
        setCurrentHookIndex((prev) => (prev + 1) % hooks.length);
        setIsVisible(true);
      }, 300); // Half of transition duration
    }, 4000); // Change every 4 seconds

    return () => clearInterval(interval);
  }, []);

  const currentHook = hooks[currentHookIndex];

  return (
    <section className="relative pt-8 pb-10 md:pt-12 overflow-hidden">
      {/* Background elements */}
      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-primary/5 to-accent/5 -z-10"></div>
      <div className="absolute top-1/3 right-1/4 w-64 h-64 bg-primary/10 rounded-full blur-3xl -z-10"></div>
      <div className="absolute bottom-1/3 left-1/4 w-72 h-72 bg-accent/10 rounded-full blur-3xl -z-10"></div>

      <div className="container px-4 md:px-6 mx-auto">
        {/* Open Source Announcement Banner */}
        <div className="mb-4 md:mb-6 flex justify-center">
          <Link
            href="https://github.com/AxWise-GmbH/Flow"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackButtonClick('Open Source GitHub', ButtonLocation.HERO, 'https://github.com/AxWise-GmbH/Flow')}
            className="hover:scale-105 transition-transform duration-200"
          >
            <div className="bg-gradient-to-r from-green-500/10 to-blue-500/10 border border-green-500/20 rounded-full px-4 py-2 flex items-center gap-3 backdrop-blur-sm cursor-pointer">
              <GitBranch className="w-4 h-4 text-green-600 dark:text-green-400" />
              <span className="text-xs font-medium text-foreground">
                <span className="text-green-600 dark:text-green-400 font-semibold">AxWise is open source</span>
                {" • "}
                <span className="text-muted-foreground">Open source release coming soon in June 2025</span>
              </span>
              <Heart className="w-3 h-3 text-red-500" />
            </div>
          </Link>
        </div>

        {/* Hero Content */}
        <div className="text-center mb-12 md:mb-16 animate-fade-in">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-normal tracking-tight leading-[1.2] pb-3 mb-6 text-foreground">
            Validate Your Ideas & Understand Your Customers in <span className="font-bold">30 Minutes</span>, Not <span className="font-bold">6 Weeks</span>
          </h1>

          {/* Dynamic Hook - Moved below headline and made more subtle */}
          <div className="mb-6 h-6 flex items-center justify-center">
            <p
              className={`text-base sm:text-lg text-muted-foreground font-medium transition-opacity duration-300 ${
                isVisible ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {currentHook.text}
              <span className="font-bold text-primary">{currentHook.emphasis}</span>
              {currentHook.suffix}
            </p>
          </div>

          <p className="text-base sm:text-lg text-muted-foreground/80 max-w-3xl mx-auto mb-8 font-normal">
            Stop guessing what customers want. Generate smart research questions, get AI-powered insights from interviews, and create actionable product plans—all without hiring expensive researchers.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 justify-center mb-8">
            <Link href="/customer-research">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90 text-white font-medium text-base sm:text-lg px-8 sm:px-10 py-5 sm:py-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                onClick={() => trackCTAClick('Start Research', ButtonLocation.HERO, 'primary')}
              >
                <span className="flex flex-col items-center text-white">
                  <span className="flex items-center gap-2">
                    Start Research
                    <ArrowRight className="w-4 h-4" />
                  </span>
                  <span className="text-xs sm:text-sm font-normal opacity-90">Generate Questions</span>
                </span>
              </Button>
            </Link>

            <div className="hidden sm:flex items-center px-3">
              <span className="text-muted-foreground font-medium">OR</span>
            </div>

            <Link href="/unified-dashboard">
              <Button
                variant="outline"
                size="lg"
                className="border-2 border-muted-foreground/30 text-muted-foreground hover:bg-muted hover:text-foreground px-6 sm:px-8 py-4 sm:py-5 rounded-xl transition-all duration-300 bg-background"
                onClick={() => trackButtonClick('Upload Interview Transcripts', ButtonLocation.HERO, '/unified-dashboard')}
              >
                <span className="flex flex-col items-center">
                  <span className="flex items-center">
                    Upload Interview Transcripts
                  </span>
                  <span className="text-xs sm:text-sm font-normal opacity-75">Generate Product Requirements</span>
                </span>
              </Button>
            </Link>
          </div>

          {/* Risk Reversal */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-muted-foreground mb-8">
            <span>✓ No credit card required</span>
            <span className="hidden sm:inline">|</span>
            <span>✓ 2-minute setup</span>
            <span className="hidden sm:inline">|</span>
            <span>✓ Try with demo data</span>
          </div>
        </div>

        {/* Workflow Visualization */}
        <div className="max-w-5xl mx-auto animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-primary mb-2">From Idea to Product in <span className="font-bold">30 Minutes</span></h2>
            <p className="text-muted-foreground mb-4">
              <em>What took <span className="font-bold">6 weeks</span> now takes <span className="font-bold">30 minutes</span> with AI assistance</em>
            </p>
            <div className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-full text-sm font-medium">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
              Powered by advanced AI research methodology
            </div>
          </div>

          {/* Horizontal Workflow Steps */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-4">
            {/* Step 1 */}
            <div className="relative">
              <div className="bg-gradient-to-br from-primary/10 to-accent/10 rounded-xl p-6 border border-primary/20 h-full hover:shadow-lg transition-all duration-300">
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg mb-4">1</div>
                  <div className="bg-primary/10 text-primary text-xs font-medium px-2 py-1 rounded-full mb-2">2 minutes</div>
                  <h3 className="font-semibold text-foreground mb-2">Generate Research Questions</h3>
                  <p className="text-sm text-muted-foreground mb-3">AI creates custom questions for your idea</p>
                  <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded italic">
                    "What problem does this solve for users?"
                  </div>
                </div>
              </div>
              {/* Arrow for desktop */}
              <div className="hidden md:block absolute top-1/2 -right-2 transform -translate-y-1/2 z-10">
                <ArrowRight className="w-6 h-6 text-primary bg-background rounded-full p-1" />
              </div>
              {/* Arrow for mobile */}
              <div className="md:hidden flex justify-center py-3">
                <ArrowDown className="w-6 h-6 text-primary" />
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative">
              <div className="bg-gradient-to-br from-primary/10 to-accent/10 rounded-xl p-6 border border-primary/20 h-full hover:shadow-lg transition-all duration-300">
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg mb-4">2</div>
                  <div className="bg-primary/10 text-primary text-xs font-medium px-2 py-1 rounded-full mb-2">10 minutes</div>
                  <h3 className="font-semibold text-foreground mb-2">Conduct Research / Get AI Personas</h3>
                  <p className="text-sm text-muted-foreground mb-3">Real interviews or AI-generated responses</p>
                  <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded italic">
                    "Upload transcripts or chat with AI personas"
                  </div>
                </div>
              </div>
              {/* Arrow for desktop */}
              <div className="hidden md:block absolute top-1/2 -right-2 transform -translate-y-1/2 z-10">
                <ArrowRight className="w-6 h-6 text-primary bg-background rounded-full p-1" />
              </div>
              {/* Arrow for mobile */}
              <div className="md:hidden flex justify-center py-3">
                <ArrowDown className="w-6 h-6 text-primary" />
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative">
              <div className="bg-gradient-to-br from-primary/10 to-accent/10 rounded-xl p-6 border border-primary/20 h-full hover:shadow-lg transition-all duration-300">
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg mb-4">3</div>
                  <div className="bg-primary/10 text-primary text-xs font-medium px-2 py-1 rounded-full mb-2">10 minutes</div>
                  <h3 className="font-semibold text-foreground mb-2">Automatic Interview Analysis</h3>
                  <p className="text-sm text-muted-foreground mb-3">AI extracts insights & patterns</p>
                  <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded italic">
                    "Users want faster checkout process"
                  </div>
                </div>
              </div>
              {/* Arrow for desktop */}
              <div className="hidden md:block absolute top-1/2 -right-2 transform -translate-y-1/2 z-10">
                <ArrowRight className="w-6 h-6 text-primary bg-background rounded-full p-1" />
              </div>
              {/* Arrow for mobile */}
              <div className="md:hidden flex justify-center py-3">
                <ArrowDown className="w-6 h-6 text-primary" />
              </div>
            </div>

            {/* Step 4 */}
            <div>
              <div className="bg-gradient-to-br from-primary/10 to-accent/10 rounded-xl p-6 border border-primary/20 h-full hover:shadow-lg transition-all duration-300">
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg mb-4">4</div>
                  <div className="bg-primary/10 text-primary text-xs font-medium px-2 py-1 rounded-full mb-2">8 minutes</div>
                  <h3 className="font-semibold text-foreground mb-2">Get Fully-Fledged PRDs</h3>
                  <p className="text-sm text-muted-foreground mb-3">Complete product requirements ready to build</p>
                  <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded italic">
                    "Feature: One-click checkout button"
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 sm:mt-16 md:mt-20 flex flex-wrap justify-center gap-4 sm:gap-8">
          <div className="text-center max-w-4xl mx-auto">
            <div className="flex flex-col items-start justify-center gap-3 text-left">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-base sm:text-lg text-muted-foreground">Trusted by Product Designers, UX Researchers, Product Managers from Enterprises and Startup Founders</span>
              </div>
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-base sm:text-lg text-muted-foreground">Supported by Constructor University Accelerator as a partner</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
