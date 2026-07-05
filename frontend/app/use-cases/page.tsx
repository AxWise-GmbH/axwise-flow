'use client';

import { motion } from 'motion/react';
import { Navigation } from '@/components/layout/Navigation';
import { Footer } from '@/components/layout/Footer';
import { Shield, Clock, TrendingUp, CheckCircle2, Target, BarChart3 } from 'lucide-react';

const detailedCases = [
  {
    category: 'E-Commerce',
    title: 'Pricing Shock Simulator',
    company: 'High-Volume Delivery Platform',
    challenge: 'Uncertainty around local price ceilings leading to margin-churn trade-offs.',
    solution: 'Simulated checkout scenarios across entire cities to identify exact pricing caps before launching new delivery fee structures. Models captured hyper-local elasticity dynamically.',
    researchTime: '2 hours',
    vsTime: '12 weeks',
    keyInsight: 'Hyper-local price elasticity maps',
    outcomes: [
      'Averted massive customer churn',
      'Eluded live A/B testing risks',
      'Optimized margins by 4.2% globally'
    ],
    quote: 'We simulated checkout scenarios across entire cities and identified exact pricing caps before launching. We averted massive customer churn without live testing risks.',
    attribution: 'Head of Pricing Strategy',
    attributionCompany: 'Global Delivery Network',
    jiraStory: 'KAN-68'
  },
  {
    category: 'Retail',
    title: 'Return Policy Friction Simulator',
    company: 'Enterprise Fashion Retailer',
    challenge: 'Need to balance logistics savings from paid returns against cart abandonment risks.',
    solution: 'Modeled customer reactions to various return fee thresholds across demographic segments. Discovered distinct tolerance levels between urban and suburban buyers.',
    researchTime: '4 hours',
    vsTime: '8 weeks',
    keyInsight: 'Predictable abandonment modeling',
    outcomes: [
      'Targeted rollout saved millions in logistics',
      'Identified €2.99 as optimal penalty fee',
      'Preserved conversion rates for key demographics'
    ],
    quote: 'AxWise showed us exactly why a €2.99 fee would cause churn for suburban parents but be accepted by urban buyers. A highly targeted rollout saved millions in logistics.',
    attribution: 'VP of E-Commerce Logistics',
    attributionCompany: 'Top Fashion Brand',
    jiraStory: 'KAN-77'
  },
  {
    category: 'PropTech',
    title: 'Living Masterplan',
    company: 'Tier 1 Real Estate Developer',
    challenge: 'Mismatching long-term capital strategy with shifting neighborhood demographics.',
    solution: 'Instead of static demographic PDFs, we deployed a living forecast using real-time neighborhood trajectory data to ensure building amenities match the tenants of tomorrow.',
    researchTime: '1 day',
    vsTime: '6 months',
    keyInsight: 'Live perpetual forecasts',
    outcomes: [
      'Re-allocated $5M from parking to communal workspaces',
      'Aligned capital strategy with 10-year demographic trends',
      'Reduced commercial vacancy risk by 20%'
    ],
    quote: 'Instead of static demographic PDFs, we have a living forecast that ensures we design building amenities perfectly matched for the tenants of tomorrow.',
    attribution: 'Chief Investment Officer',
    attributionCompany: 'Commercial Real Estate Group',
    jiraStory: 'KAN-74'
  },
  {
    category: 'E-Commerce',
    title: 'Global Retail Checkout Optimization',
    company: 'Enterprise E-Commerce Platform',
    challenge: 'High-intent cart abandonment at shipping calculation costing $12M annually.',
    solution: 'Simulated thousands of checkout flows instantly to pinpoint the exact pricing threshold that converts, substituting costly user surveys and live revenue-risking A/B tests.',
    researchTime: '2 hours',
    vsTime: '6 weeks',
    keyInsight: 'Identified exact price elasticity threshold',
    outcomes: [
      'Recovered millions in lost revenue',
      'Zero lines of survey code written',
      'Identified hidden psychological pricing barriers'
    ],
    quote: 'We simulated thousands of checkout flows instantly and pinpointed the exact pricing threshold that converts. We recovered millions in lost revenue without writing a single line of survey code.',
    attribution: 'VP of E-Commerce',
    attributionCompany: 'Retail Leader',
    jiraStory: 'KAN-55'
  },
  {
    category: 'Automotive',
    title: 'Autonomous Vehicle Trust & In-Cabin UX',
    company: 'Global EV Manufacturer',
    challenge: 'Drivers disengaging Level 3 autonomous features due to confusing UI alerts and lack of system trust.',
    solution: 'Synthetically modeled the cognitive panic of a 70mph handoff scenario. This circumvented the need for expensive and physically dangerous physical driving simulations.',
    researchTime: '5 hours',
    vsTime: '12 weeks',
    keyInsight: 'Modeled cognitive load during handoffs',
    outcomes: [
      'Shaped the entire in-cabin auditory alert system',
      'Reduced driver disengagement by 35%',
      'Accelerated UX safety compliance approvals'
    ],
    quote: 'Instead of expensive and dangerous physical driving simulations, we modeled the cognitive panic of a 70mph handoff synthetically. It shaped our entire in-cabin auditory alert system.',
    attribution: 'Head of Autonomous Driving',
    attributionCompany: 'Global EV Manufacturer',
    jiraStory: 'KAN-48'
  },
  {
    category: 'AdTech',
    title: 'Privacy-First Bidding Algorithms',
    company: 'Programmatic Advertising Network',
    challenge: 'Deprecation of third-party cookies leading to degraded targeting and 25% drop in Return on Ad Spend.',
    solution: 'Deployed synthetic cohorts that perfectly mimicked target segments. Trained new bidding models without touching a single piece of PII, completely de-risking privacy compliance.',
    researchTime: '8 hours',
    vsTime: '4 months',
    keyInsight: 'Generated 50k privacy-safe profiles',
    outcomes: [
      'Zero usage of personally identifiable information (PII)',
      'Restored ROAS to pre-cookie deprecation levels',
      'Future-proofed algorithm against future privacy laws'
    ],
    quote: 'We deployed synthetic cohorts that perfectly mimicked our target segments. We trained our new bidding models without touching a single piece of PII, completely de-risking our privacy compliance.',
    attribution: 'Chief Revenue Officer',
    attributionCompany: 'Programmatic AdTech',
    jiraStory: 'KAN-42'
  }
];

export default function UseCasesPage() {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      
      <main className="pt-32 pb-24">
        {/* Header Section */}
        <section className="max-w-7xl mx-auto px-6 mb-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-full mb-6 border border-gray-100"
          >
            <Shield className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-medium text-gray-700">ENTERPRISE VALIDATED</span>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-6xl font-bold tracking-tight text-gray-900 mb-6"
          >
            Proven Across Industries
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl text-gray-600 max-w-3xl mx-auto"
          >
            Discover how leading organizations leverage AxWise simulations to reduce risk, optimize strategies, and make decisions confidently in hours instead of months.
          </motion.p>
        </section>

        {/* Detailed Cases Grid */}
        <section className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col gap-12">
            {detailedCases.map((feature, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.7 }}
                className="bg-gray-50 rounded-3xl p-8 lg:p-12 border border-gray-100 grid lg:grid-cols-12 gap-12 items-start"
              >
                {/* Left Column: Context & Challenge */}
                <div className="lg:col-span-7">
                  <div className="flex flex-wrap items-center gap-3 mb-6">
                    <span className="px-4 py-1.5 bg-black text-white text-sm font-medium rounded-full">
                      {feature.category}
                    </span>
                    <span className="px-4 py-1.5 bg-blue-100 text-blue-800 border border-blue-200 text-sm font-medium rounded-full flex items-center gap-2">
                       Jira Story: {feature.jiraStory}
                    </span>
                  </div>
                  
                  <h2 className="text-3xl font-bold text-gray-900 mb-2">{feature.title}</h2>
                  <p className="text-lg text-gray-500 mb-8">{feature.company}</p>

                  <div className="space-y-8">
                    <div>
                      <h4 className="text-sm uppercase tracking-wider text-gray-400 font-bold mb-3">The Challenge</h4>
                      <p className="text-gray-700 leading-relaxed text-lg">{feature.challenge}</p>
                    </div>
                    
                    <div>
                      <h4 className="text-sm uppercase tracking-wider text-gray-400 font-bold mb-3 flex items-center gap-2">
                        <Target className="w-4 h-4" />
                        Our Solution
                      </h4>
                      <p className="text-gray-800 leading-relaxed text-lg bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                        {feature.solution}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right Column: Outcomes & Metrics */}
                <div className="lg:col-span-5 space-y-6">
                  {/* Performance Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                      <div className="flex items-center gap-2 mb-3 text-gray-400">
                        <Clock className="w-4 h-4" />
                        <span className="text-xs uppercase tracking-wider font-bold">Time to Insight</span>
                      </div>
                      <div className="text-3xl font-bold text-gray-900 mb-1">{feature.researchTime}</div>
                      <div className="text-sm text-gray-500 font-medium tracking-wide">vs {feature.vsTime} traditional</div>
                    </div>
                    
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                      <div className="flex items-center gap-2 mb-3 text-gray-400">
                        <TrendingUp className="w-4 h-4" />
                        <span className="text-xs uppercase tracking-wider font-bold">Key Insight</span>
                      </div>
                      <div className="text-lg font-semibold text-gray-800 leading-tight">
                        {feature.keyInsight}
                      </div>
                    </div>
                  </div>

                  {/* Bullet Points */}
                  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <h4 className="text-sm uppercase tracking-wider text-gray-400 font-bold mb-4 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      Demonstrated Outcomes
                    </h4>
                    <ul className="space-y-3">
                      {feature.outcomes.map((outcome, oIdx) => (
                        <li key={oIdx} className="flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                          <span className="text-gray-700">{outcome}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Quote */}
                  <div className="bg-gray-900 text-white p-6 rounded-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 -mt-2 -mr-2 text-8xl text-gray-800 opacity-50 font-serif leading-none">"</div>
                    <p className="text-gray-300 italic mb-6 relative z-10">"{feature.quote}"</p>
                    <div className="relative z-10 border-t border-gray-800 pt-4">
                      <div className="font-semibold text-white">{feature.attribution}</div>
                      <div className="text-sm text-gray-400">{feature.attributionCompany}</div>
                    </div>
                  </div>

                </div>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
