'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, GitBranch, Heart } from 'lucide-react';
import Link from 'next/link';
import { trackCTAClick, trackButtonClick, ButtonLocation } from '@/lib/analytics';

export const HeroSection = () => {
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

        <div className="flex flex-col lg:flex-row items-center gap-8 md:gap-12">
          <div className="flex-1 space-y-6 md:space-y-8 animate-fade-in mb-8 md:mb-12">
            <div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent leading-[1.2] pb-3">
                Build Better Products Faster: Your AI Co-Pilot from Raw Idea to Actionable Plan
              </h1>
              <p className="text-lg sm:text-xl md:text-2xl text-muted-foreground max-w-2xl mt-4 md:mt-6">
                AxWise empowers founders, product managers, and UX researchers to rapidly transform market research, user interviews, and feedback into validated strategies and clear development plans.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
              <Link href="/unified-dashboard" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="gradient-btn text-white font-medium text-base sm:text-lg px-6 sm:px-8 py-5 sm:py-6 rounded-xl shadow-lg w-full sm:w-auto"
                  onClick={() => trackCTAClick('Get Started', ButtonLocation.HERO, 'primary')}
                >
                  Get Started <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="block text-xs sm:text-sm font-normal mt-1">Start Analyzing Now</span>
                </Button>
              </Link>

              <Link href="/pricing">
                <Button
                  variant="outline"
                  size="lg"
                  className="border-primary text-primary hover:text-primary-foreground px-6 sm:px-8 py-5 sm:py-6 w-full sm:w-auto"
                  onClick={() => trackButtonClick('View Pricing', ButtonLocation.HERO, '/pricing')}
                >
                  View Pricing
                </Button>
              </Link>
            </div>
          </div>

          <div className="flex-1 w-full max-w-2xl animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <div className="relative rounded-2xl overflow-hidden shadow-lg border border-primary/20 bg-white/5 backdrop-blur-sm p-6 md:p-8">
              <div className="w-full h-full flex flex-col items-center justify-center">
                <div className="w-full h-auto max-h-[550px] bg-gradient-to-br from-primary/10 to-accent/10 rounded-lg flex items-center justify-center">
                  <div className="text-center p-8">
                    <h3 className="text-2xl font-bold text-primary mb-4">Transform Ideas into Impact</h3>
                    <p className="text-muted-foreground">Upload interviews → Get insights → Build better products</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground italic mt-4">*Simple flow representation of the AxWise process.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 sm:mt-16 md:mt-20 flex flex-wrap justify-center gap-4 sm:gap-8">
          <div className="text-center">
            <p className="text-base sm:text-lg italic text-muted-foreground">Join 10-20+ years of experience UXR, Product Managers and Product Designers from EU/US Corporations and Startups who make them more effective</p>
          </div>
        </div>
      </div>
    </section>
  );
};
