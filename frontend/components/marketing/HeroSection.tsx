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
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    const currentHook = hooks[currentHookIndex];
    const fullText = currentHook.text + currentHook.emphasis + currentHook.suffix;
    let currentIndex = 0;

    setDisplayedText('');
    setIsTyping(true);

    const typeInterval = setInterval(() => {
      if (currentIndex < fullText.length) {
        setDisplayedText(fullText.slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        clearInterval(typeInterval);
        setIsTyping(false);

        // Wait 2 seconds before starting next message
        setTimeout(() => {
          setCurrentHookIndex((prev) => (prev + 1) % hooks.length);
        }, 2000);
      }
    }, 50); // Typing speed: 50ms per character

    return () => clearInterval(typeInterval);
  }, [currentHookIndex]);

  const currentHook = hooks[currentHookIndex];

  // Function to render text with emphasis
  const renderTypedText = () => {
    const fullText = currentHook.text + currentHook.emphasis + currentHook.suffix;
    const emphasisStart = currentHook.text.length;
    const emphasisEnd = emphasisStart + currentHook.emphasis.length;

    return (
      <>
        {displayedText.slice(0, emphasisStart)}
        {displayedText.length > emphasisStart && (
          <span className="font-bold text-primary">
            {displayedText.slice(emphasisStart, Math.min(displayedText.length, emphasisEnd))}
          </span>
        )}
        {displayedText.length > emphasisEnd && displayedText.slice(emphasisEnd)}
        {isTyping && <span className="animate-pulse">|</span>}
      </>
    );
  };

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
                <span className="text-muted-foreground">Open source version coming when ready</span>
              </span>
              <Heart className="w-3 h-3 text-red-500" />
            </div>
          </Link>
        </div>

        {/* Hero Content */}
        <div className="text-center mb-12 md:mb-16 animate-fade-in">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-normal tracking-tight leading-[1.2] pb-3 mb-6 text-foreground">
            Validate Your Ideas & Understand Your Customers in <span className="font-bold">17 Minutes</span>, Not <span className="font-bold">6 Weeks</span>
          </h1>

          {/* Dynamic Hook with Typewriter Effect */}
          <div className="mb-6 h-8 flex items-center justify-center">
            <p className="text-base sm:text-lg text-muted-foreground font-medium min-h-[1.5rem]">
              {renderTypedText()}
            </p>
          </div>

          <p className="text-base sm:text-lg text-muted-foreground/80 max-w-3xl mx-auto mb-8 font-normal">
            Stop guessing what customers want. Generate smart research questions, get AI-powered insights from interviews, and create actionable product plans—all without hiring expensive researchers.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 justify-center mb-8">
            <Link href="/customer-research">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90 text-white font-medium text-base sm:text-lg px-8 sm:px-10 py-4 sm:py-5 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                onClick={() => trackCTAClick('Start Research', ButtonLocation.HERO, 'primary')}
              >
                <span className="flex items-center gap-2 text-white">
                  Start Research
                  <ArrowRight className="w-4 h-4" />
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
                  <span className="flex items-center font-medium">
                    Upload Interview Transcripts
                  </span>
                  <span className="text-xs font-normal opacity-75 mt-1">
                    To Get Detailed Product Requirements
                  </span>
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
        <div className="max-w-6xl mx-auto animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <div className="text-center mb-12">
            <div className="inline-block bg-gradient-to-r from-primary/20 to-accent/20 text-primary text-sm font-semibold px-6 py-3 rounded-full mb-6 border border-primary/30">
              Complete Workflow
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6 leading-tight">
              From Idea to Product in <span className="text-primary">17 Minutes</span>
            </h2>
            <p className="text-lg md:text-xl text-muted-foreground mb-6 max-w-3xl mx-auto leading-relaxed">
              <em>What took <span className="font-bold">6 weeks</span> now takes <span className="font-bold">17 minutes</span> with AI personas or <span className="font-bold">30-45 minutes</span> with real interviews</em>
            </p>
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-50 to-primary/10 dark:from-blue-900/20 dark:to-primary/20 text-blue-700 dark:text-blue-300 px-6 py-3 rounded-full text-sm font-medium border border-blue-200/50 dark:border-blue-800/50">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
              Powered by advanced AI research methodology
            </div>
          </div>

          {/* Horizontal Workflow Steps */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-6">
            {/* Step 1 */}
            <div className="relative">
              <div className="bg-gradient-to-br from-primary/5 to-accent/5 rounded-2xl p-8 border border-primary/20 h-full hover:shadow-xl hover:border-primary/30 transition-all duration-300 group">
                <div className="flex flex-col items-center text-center">
                  <div className="w-14 h-14 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg mb-6 group-hover:scale-110 transition-transform duration-300">1</div>
                  <div className="bg-gradient-to-r from-primary/20 to-accent/20 text-primary text-xs font-semibold px-3 py-2 rounded-full mb-4 border border-primary/30">10 minutes</div>
                  <h3 className="font-bold text-foreground mb-3 text-lg">Generate Research Questions</h3>
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">AI guiding you as professional consultant from big 4, to define scope with business idea, identifying target customer, and problem and then summarising that into discovery and validation questions for your particular problem</p>
                  <div className="text-xs text-muted-foreground bg-gradient-to-r from-muted/50 to-muted/30 p-3 rounded-lg italic border border-muted/30">
                    "What problem does this solve for users?"
                  </div>
                </div>
              </div>
              {/* Arrow for desktop */}
              <div className="hidden md:block absolute top-1/2 -right-3 transform -translate-y-1/2 z-10">
                <div className="w-8 h-8 bg-background border-2 border-primary/30 rounded-full flex items-center justify-center shadow-md">
                  <ArrowRight className="w-4 h-4 text-primary" />
                </div>
              </div>
              {/* Arrow for mobile */}
              <div className="md:hidden flex justify-center py-4">
                <div className="w-8 h-8 bg-background border-2 border-primary/30 rounded-full flex items-center justify-center shadow-md">
                  <ArrowDown className="w-4 h-4 text-primary" />
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="relative">
              <div className="bg-gradient-to-br from-primary/5 to-accent/5 rounded-2xl p-8 border border-primary/20 h-full hover:shadow-xl hover:border-primary/30 transition-all duration-300 group">
                <div className="flex flex-col items-center text-center">
                  <div className="w-14 h-14 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg mb-6 group-hover:scale-110 transition-transform duration-300">2</div>
                  <div className="bg-gradient-to-r from-primary/20 to-accent/20 text-primary text-xs font-semibold px-3 py-2 rounded-full mb-4 border border-primary/30">3 minutes</div>
                  <h3 className="font-bold text-foreground mb-3 text-lg">Conduct Research</h3>
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">30-45 minutes with real people OR get instant answers using Tailored Synthetic Personas based on your specific problem, business scope, and target audience</p>
                  <div className="text-xs text-muted-foreground bg-gradient-to-r from-muted/50 to-muted/30 p-3 rounded-lg italic border border-muted/30">
                    "Upload transcripts or chat with AI personas"
                  </div>
                </div>
              </div>
              {/* Arrow for desktop */}
              <div className="hidden md:block absolute top-1/2 -right-3 transform -translate-y-1/2 z-10">
                <div className="w-8 h-8 bg-background border-2 border-primary/30 rounded-full flex items-center justify-center shadow-md">
                  <ArrowRight className="w-4 h-4 text-primary" />
                </div>
              </div>
              {/* Arrow for mobile */}
              <div className="md:hidden flex justify-center py-4">
                <div className="w-8 h-8 bg-background border-2 border-primary/30 rounded-full flex items-center justify-center shadow-md">
                  <ArrowDown className="w-4 h-4 text-primary" />
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative">
              <div className="bg-gradient-to-br from-primary/5 to-accent/5 rounded-2xl p-8 border border-primary/20 h-full hover:shadow-xl hover:border-primary/30 transition-all duration-300 group">
                <div className="flex flex-col items-center text-center">
                  <div className="w-14 h-14 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg mb-6 group-hover:scale-110 transition-transform duration-300">3</div>
                  <div className="bg-gradient-to-r from-primary/20 to-accent/20 text-primary text-xs font-semibold px-3 py-2 rounded-full mb-4 border border-primary/30">2 minutes</div>
                  <h3 className="font-bold text-foreground mb-3 text-lg">Automatic Interview Analysis</h3>
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">AI extracts insights, patterns, themes and personas as real UX Researcher with 20 years of experience will do utilizing best practices of customer development and design thinking processes</p>
                  <div className="text-xs text-muted-foreground bg-gradient-to-r from-muted/50 to-muted/30 p-3 rounded-lg italic border border-muted/30">
                    "Users want faster checkout process"
                  </div>
                </div>
              </div>
              {/* Arrow for desktop */}
              <div className="hidden md:block absolute top-1/2 -right-3 transform -translate-y-1/2 z-10">
                <div className="w-8 h-8 bg-background border-2 border-primary/30 rounded-full flex items-center justify-center shadow-md">
                  <ArrowRight className="w-4 h-4 text-primary" />
                </div>
              </div>
              {/* Arrow for mobile */}
              <div className="md:hidden flex justify-center py-4">
                <div className="w-8 h-8 bg-background border-2 border-primary/30 rounded-full flex items-center justify-center shadow-md">
                  <ArrowDown className="w-4 h-4 text-primary" />
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div>
              <div className="bg-gradient-to-br from-primary/5 to-accent/5 rounded-2xl p-8 border border-primary/20 h-full hover:shadow-xl hover:border-primary/30 transition-all duration-300 group">
                <div className="flex flex-col items-center text-center">
                  <div className="w-14 h-14 bg-gradient-to-br from-primary to-primary/80 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg mb-6 group-hover:scale-110 transition-transform duration-300">4</div>
                  <div className="bg-gradient-to-r from-primary/20 to-accent/20 text-primary text-xs font-semibold px-3 py-2 rounded-full mb-4 border border-primary/30">2 minutes</div>
                  <h3 className="font-bold text-foreground mb-3 text-lg">Get Fully-Fledged PRDs</h3>
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">Product requirements are crafted from previous step, creating enterprise grade objectives as it would be PM with 20 years of experience in Agile and Product Management (technical & business), user stories with clear structure, tasks and even technical requirements and success metrics for both</p>
                  <div className="text-xs text-muted-foreground bg-gradient-to-r from-muted/50 to-muted/30 p-3 rounded-lg italic border border-muted/30">
                    "Feature: One-click checkout button"
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Social Proof Section */}
        <div className="mt-16 sm:mt-20 md:mt-24">
          <div className="text-center max-w-5xl mx-auto">
            <div className="bg-gradient-to-r from-muted/30 to-muted/10 rounded-2xl p-8 border border-muted/30">
              <div className="flex flex-col items-center justify-center gap-6">
                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-lg sm:text-xl text-muted-foreground text-center">
                    Trusted by <span className="font-bold">Product Designers</span>, <span className="font-bold">UX Researchers</span>, <span className="font-bold">Product Managers</span> from <span className="font-bold">Enterprises</span> and <span className="font-bold">Startup Founders</span>
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <Star className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                  <span className="text-lg sm:text-xl text-muted-foreground text-center">
                    Supported by <span className="font-bold">Constructor University Accelerator</span> as a partner
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
