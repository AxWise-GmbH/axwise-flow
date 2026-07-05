'use client';

import { Navigation } from '@/components/layout/Navigation';
import { Hero } from '@/components/landing/Hero';
import { SocialProof } from '@/components/landing/SocialProof';
import { Features } from '@/components/landing/Features';
import { Benefits } from '@/components/landing/Benefits';
import { Services } from '@/components/landing/Services';
import { CaseStudies } from '@/components/landing/CaseStudies';
import { CTA } from '@/components/landing/CTA';
import { FAQ } from '@/components/landing/FAQ';
import { Footer } from '@/components/layout/Footer';
import { AnimatedBackground } from '@/components/landing/AnimatedBackground';

/**
 * Main landing page showcasing AxWise features and capabilities
 * Migrated from AxWise Landingpage
 */
export default function HomePage(): JSX.Element {
  return (
    <div className="min-h-screen relative">
      <AnimatedBackground />
      <div className="relative z-10">
        <Navigation />
        <Hero />
        <SocialProof />
        <Features />
        <Benefits />
        <Services />
        <CaseStudies />
        <CTA />
        <FAQ />
        <Footer />
      </div>
    </div>
  );
}
