import { HeroSection } from '@/components/marketing/HeroSection';
import { FeaturesSection } from '@/components/marketing/FeaturesSection';
import { WhyChooseSection } from '@/components/marketing/WhyChooseSection';
import { HowItWorksSection } from '@/components/marketing/HowItWorksSection';
import { TestimonialsSection } from '@/components/marketing/TestimonialsSection';
import { SecuritySection } from '@/components/marketing/SecuritySection';
import { CTASection } from '@/components/marketing/CTASection';

/**
 * Main landing page showcasing AxWise features and capabilities
 */
export default function HomePage(): JSX.Element {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-grow">
        <HeroSection />
        <div id="features">
          <FeaturesSection />
        </div>
        <div id="testimonials" className="w-full">
          <TestimonialsSection />
        </div>
        <div id="security">
          <SecuritySection />
        </div>
        <div id="pricing">
          <CTASection />
        </div>
      </main>
    </div>
  );
}
