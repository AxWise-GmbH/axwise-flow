import { useCallback } from 'react';
import { Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import StickyNav from './sections/StickyNav';
import Hero from './sections/Hero';
import TrustStrip from './sections/TrustStrip';
import ProblemPromise from './sections/ProblemPromise';
import FeatureGrid from './sections/FeatureGrid';
import EarnCommunityBlock from './sections/EarnCommunityBlock';
import HowItWorks from './sections/HowItWorks';
import ConsiliumBanner from './sections/ConsiliumBanner';
import AIAgentDNA from './sections/AIAgentDNA';
import TokenTrackingBanner from './sections/TokenTrackingBanner';
import VoiceChannels from './sections/VoiceChannels';
import WhoItsFor from './sections/WhoItsFor';
import LandingFeaturesBridge from './sections/LandingFeaturesBridge';
import TechTrust from './sections/TechTrust';
import Pricing from './sections/Pricing';
import FAQ from './sections/FAQ';
import FinalCTA from './sections/FinalCTA';
import Footer from './sections/Footer';
import ScrollingOrb from './ScrollingOrb';
import MarketingCtaGlobalStyles from '../../components/Public/primitives/MarketingCtaGlobalStyles';
import { LANDING_PAGE_ROOT_SX } from '../../utils/mobileTouchScroll';

function OrbZone({ id, children }) {
  return (
    <Box data-orb-section={id} sx={{ position: 'relative' }}>
      {children}
    </Box>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();

  const goSignup = useCallback(() => navigate('/signup'), [navigate]);
  const goContact = useCallback(() => navigate('/contact'), [navigate]);

  return (
    <Box
      data-landing-root
      sx={{
        bgcolor: 'background.default',
        scrollBehavior: 'smooth',
        position: 'relative',
        ...LANDING_PAGE_ROOT_SX,
      }}
    >
      <MarketingCtaGlobalStyles />
      <ScrollingOrb />
      <StickyNav onPrimaryCta={goSignup} />
      <Box id="main-content" sx={{ position: 'relative', zIndex: 1 }}>
        <OrbZone id="hero">
          <Hero />
        </OrbZone>
        <OrbZone id="trust">
          <TrustStrip />
        </OrbZone>
        <OrbZone id="problem">
          <ProblemPromise />
        </OrbZone>
        <OrbZone id="how-it-works">
          <HowItWorks />
        </OrbZone>
        <OrbZone id="personas">
          <WhoItsFor />
        </OrbZone>
        <LandingFeaturesBridge />
        <OrbZone id="consilium">
          <ConsiliumBanner />
        </OrbZone>
        <OrbZone id="ai-agent-dna">
          <AIAgentDNA />
        </OrbZone>
        <OrbZone id="token-tracking">
          <TokenTrackingBanner />
        </OrbZone>
        <OrbZone id="pricing">
          <Pricing />
        </OrbZone>
        <OrbZone id="earn">
          <EarnCommunityBlock />
        </OrbZone>
        <OrbZone id="tech">
          <TechTrust />
        </OrbZone>
        <OrbZone id="voice">
          <VoiceChannels />
        </OrbZone>
        <OrbZone id="features">
          <FeatureGrid />
        </OrbZone>
        <OrbZone id="faq">
          <FAQ />
        </OrbZone>
        <OrbZone id="cta">
          <FinalCTA onPrimaryCta={goSignup} onSecondaryCta={goContact} />
        </OrbZone>
        <Footer />
      </Box>
    </Box>
  );
}
