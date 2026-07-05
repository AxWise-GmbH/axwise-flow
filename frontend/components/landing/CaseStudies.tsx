import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import { Clock, TrendingUp, Presentation } from 'lucide-react';export function CaseStudies() {
  const [activeTab, setActiveTab] = useState(0);

  const PricingShockViz = () => (
    <div className="w-full h-full bg-black flex items-center justify-center p-8 relative overflow-hidden">
      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_2px_2px,white_1px,transparent_0)] bg-[length:24px_24px]"></div>
      <svg viewBox="0 0 100 50" className="w-full h-full overflow-visible z-10">
        <motion.path
          d="M 0 40 Q 25 40, 50 25 T 100 10"
          fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.5, ease: "easeOut" }}
        />
        <motion.path
          d="M 0 45 Q 40 45, 60 35 T 100 0"
          fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.5, delay: 0.5, ease: "easeOut" }}
        />
        <motion.circle cx="60" cy="35" r="2" fill="white" animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }} transition={{ duration: 2, repeat: Infinity }} />
        <text x="60" y="30" fill="white" fontSize="4" textAnchor="middle" fontWeight="bold">Price Ceiling</text>
      </svg>
    </div>
  );

  const ReturnPolicyViz = () => (
    <div className="w-full h-full bg-slate-900 flex items-center justify-center p-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-tr from-blue-900/20 to-purple-900/20" />
      <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-2xl z-10">
        <motion.polygon points="10,10 90,10 70,40 30,40" fill="#3b82f6" fillOpacity="0.8" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} />
        <motion.polygon points="30,42 70,42 55,70 45,70" fill="#8b5cf6" fillOpacity="0.8" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} />
        <motion.polygon points="45,72 55,72 55,90 45,90" fill="#ec4899" fillOpacity="0.8" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.4 }} />
        <text x="50" y="55" fill="white" fontSize="5" textAnchor="middle" fontWeight="bold">Abandonment Risk</text>
      </svg>
    </div>
  );

  const MasterplanViz = () => (
    <div className="w-full h-full bg-[#0a0a0a] flex items-center justify-center p-8 relative overflow-hidden">
      <div className="grid grid-cols-6 gap-2 w-full h-full z-10 p-4">
        {[...Array(24)].map((_, i) => {
          const isHot = [7, 8, 13, 14, 15].includes(i);
          return (
            <motion.div key={i} className={`rounded-sm ${isHot ? 'bg-amber-500' : 'bg-slate-800'}`}
              animate={{ opacity: isHot ? [0.6, 1, 0.6] : 0.3, scale: isHot ? [0.95, 1.05, 0.95] : 1 }}
              transition={{ duration: isHot ? 2 : 0, repeat: Infinity, delay: i * 0.1 }}
            />
          )
        })}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent z-20" />
      <motion.div className="absolute bottom-6 left-6 right-6 h-12 bg-white/10 backdrop-blur border border-white/20 rounded-xl flex items-center justify-center z-30" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }}>
        <span className="text-white text-xs font-medium uppercase tracking-wider">Feasibility Forecast</span>
      </motion.div>
    </div>
  );

  const CheckoutViz = () => (
    <div className="w-full h-full bg-zinc-950 flex items-center justify-center p-8 relative overflow-hidden">
      <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      <svg viewBox="0 0 100 100" className="w-full h-full z-10">
        <motion.rect x="20" y="40" width="15" height="40" fill="#3b82f6" initial={{ height: 0, y: 80 }} animate={{ height: 40, y: 40 }} transition={{ duration: 1, ease: "easeOut" }} />
        <motion.rect x="45" y="30" width="15" height="50" fill="#60a5fa" initial={{ height: 0, y: 80 }} animate={{ height: 50, y: 30 }} transition={{ duration: 1, delay: 0.2, ease: "easeOut" }} />
        <motion.rect x="70" y="20" width="15" height="60" fill="#93c5fd" initial={{ height: 0, y: 80 }} animate={{ height: 60, y: 20 }} transition={{ duration: 1, delay: 0.4, ease: "easeOut" }} />
        
        <motion.path d="M 27 35 Q 52 10 77 15" fill="none" stroke="#f87171" strokeWidth="2" strokeDasharray="4 4" 
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.5, delay: 0.6 }} />
      </svg>
      <div className="absolute bottom-4 left-4 right-4 text-center">
        <span className="text-white/60 text-xs tracking-widest font-mono">ELASTICITY MODEL</span>
      </div>
    </div>
  );

  const AutonomousViz = () => (
    <div className="w-full h-full bg-[#050505] flex items-center justify-center p-8 relative overflow-hidden">
      <motion.div 
        className="w-32 h-32 rounded-full border border-white/20 flex items-center justify-center relative z-10"
        animate={{ rotate: [0, 90, 0] }}
        transition={{ duration: 6, ease: "easeInOut", repeat: Infinity }}
      >
        <div className="w-24 h-24 rounded-full border-t-2 border-r-2 border-emerald-400 absolute" />
        <div className="w-2 h-2 rounded-full bg-emerald-400" />
      </motion.div>
      <div className="absolute top-8 left-8 right-8 flex justify-between z-20">
        <motion.div className="h-1 bg-emerald-400/50 rounded-full w-8" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 2, repeat: Infinity }} />
        <motion.div className="h-1 bg-rose-500/50 rounded-full w-12" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 2.5, repeat: Infinity }} />
      </div>
    </div>
  );

  const PrivacyViz = () => (
    <div className="w-full h-full bg-slate-950 flex items-center justify-center p-8 relative overflow-hidden">
      <div className="grid grid-cols-4 gap-3 z-10 relative">
        {[...Array(16)].map((_, i) => (
          <motion.div 
            key={i}
            className="w-8 h-8 rounded-full border border-indigo-500/30 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: i * 0.05 }}
          >
            <motion.div 
              className="w-2 h-2 rounded-full bg-indigo-400"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: Math.random() * 2 + 1, repeat: Infinity, delay: Math.random() * 2 }}
            />
          </motion.div>
        ))}
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#020617_80%)] z-20" />
    </div>
  );

  const projects = [
    {
      id: 1,
      category: 'Q/E-Commerce',
      title: 'Pricing Shock Simulator',
      company: 'High-Volume Delivery Platform',
      challenge: 'Uncertainty around local price ceilings leading to margin-churn trade-offs.',
      researchTime: '2 hours',
      vsTime: '12 weeks',
      keyInsight: 'Hyper-local price elasticity maps',
      quote: 'We simulated checkout scenarios across entire cities and identified exact pricing caps before launching. We averted massive customer churn without live testing risks.',
      attribution: 'Head of Pricing Strategy',
      attributionCompany: 'Global Delivery Network',
      Visual: PricingShockViz,
      jiraStory: 'KAN-68'
    },
    {
      id: 2,
      category: 'Retail',
      title: 'Return Policy Friction Simulator',
      company: 'Enterprise Fashion Retailer',
      challenge: 'Need to balance logistics savings from paid returns against cart abandonment risks.',
      researchTime: '4 hours',
      vsTime: '8 weeks',
      keyInsight: 'Predictable abandonment modeling',
      quote: 'AxWise showed us exactly why a €2.99 fee would cause churn for suburban parents but be accepted by urban buyers. A highly targeted rollout saved millions in logistics.',
      attribution: 'VP of E-Commerce Logistics',
      attributionCompany: 'Top Fashion Brand',
      Visual: ReturnPolicyViz,
      jiraStory: 'KAN-77'
    },
    {
      id: 3,
      category: 'PropTech',
      title: 'Living Masterplan',
      company: 'Tier 1 Real Estate Developer',
      challenge: 'Mismatching long-term capital strategy with shifting neighborhood demographics.',
      researchTime: '1 day',
      vsTime: '6 months',
      keyInsight: 'Live perpetual forecasts',
      quote: 'Instead of static demographic PDFs, we have a living forecast that ensures we design building amenities perfectly matched for the tenants of tomorrow.',
      attribution: 'Chief Investment Officer',
      attributionCompany: 'Commercial Real Estate Group',
      Visual: MasterplanViz,
      jiraStory: 'KAN-74'
    },
    {
      id: 4,
      category: 'E-Commerce',
      title: 'Global Retail Checkout Optimization',
      company: 'Enterprise E-Commerce Platform',
      challenge: 'High-intent cart abandonment at shipping calculation costing $12M annually.',
      researchTime: '2 hours',
      vsTime: '6 weeks',
      keyInsight: 'Identified exact price elasticity threshold',
      quote: 'We simulated thousands of checkout flows instantly and pinpointed the exact pricing threshold that converts. We recovered millions in lost revenue without writing a single line of survey code.',
      attribution: 'VP of E-Commerce',
      attributionCompany: 'Retail Leader',
      Visual: CheckoutViz,
      jiraStory: 'KAN-55'
    },
    {
      id: 5,
      category: 'Automotive',
      title: 'Autonomous Vehicle Trust & In-Cabin UX',
      company: 'Global EV Manufacturer',
      challenge: 'Drivers disengaging Level 3 autonomous features due to confusing UI alerts and lack of system trust.',
      researchTime: '5 hours',
      vsTime: '12 weeks',
      keyInsight: 'Modeled cognitive load during handoffs',
      quote: 'Instead of expensive and dangerous physical driving simulations, we modeled the cognitive panic of a 70mph handoff synthetically. It shaped our entire in-cabin auditory alert system.',
      attribution: 'Head of Autonomous Driving',
      attributionCompany: 'Global EV Manufacturer',
      Visual: AutonomousViz,
      jiraStory: 'KAN-48'
    },
    {
      id: 6,
      category: 'AdTech',
      title: 'Privacy-First Bidding Algorithms',
      company: 'Programmatic Advertising Network',
      challenge: 'Deprecation of third-party cookies leading to degraded targeting and 25% drop in Return on Ad Spend.',
      researchTime: '8 hours',
      vsTime: '4 months',
      keyInsight: 'Generated 50k privacy-safe profiles',
      quote: 'We deployed synthetic cohorts that perfectly mimicked our target segments. We trained our new bidding models without touching a single piece of PII, completely de-risking our privacy compliance.',
      attribution: 'Chief Revenue Officer',
      attributionCompany: 'Programmatic AdTech',
      Visual: PrivacyViz,
      jiraStory: 'KAN-42'
    }
  ];

  // Auto-rotate through projects every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveTab((prev) => (prev + 1) % projects.length);
    }, 15000);

    return () => clearInterval(interval);
  }, [projects.length]);

  return (
    <section id="projects" className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-full mb-6"
          >
            <Presentation className="w-4 h-4" />
            <span className="text-sm text-gray-600">USE CASES</span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-black mb-4"
          >
            Simulate Outcomes Before Launch
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-gray-600 max-w-2xl mx-auto"
          >
            Explore how enterprise teams use AxWise to model pricing limits, predict abandonment, and plan real estate confidently. See our blueprint simulations in action.
          </motion.p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 lg:justify-center overflow-x-auto pb-4 mb-8 snap-x no-scrollbar">
          {projects.map((project, index) => (
            <motion.button
              key={project.id}
              onClick={() => setActiveTab(index)}
              className={`px-6 py-3 rounded-full whitespace-nowrap transition-all snap-center ${activeTab === index
                ? 'bg-black text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              whileHover={{ scale: activeTab === index ? 1 : 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{
                boxShadow: activeTab === index ? '0 4px 14px 0 rgba(0, 0, 0, 0.25)' : 'none'
              }}
            >
              {project.category}
            </motion.button>
          ))}
        </div>

        {/* Project Content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: 50, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -50, scale: 0.95 }}
          transition={{
            duration: 0.6,
            ease: "easeInOut"
          }}
          className="bg-gradient-to-br from-gray-50 to-white rounded-3xl p-8 border border-gray-100"
          style={{
            boxShadow: '0 4px 24px 0 rgba(0, 0, 0, 0.06)'
          }}
        >
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <motion.div
              className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-black"
              initial={{ opacity: 0, scale: 0.9, rotateY: -15 }}
              animate={{ opacity: 1, scale: 1, rotateY: 0 }}
              transition={{
                duration: 0.7,
                delay: 0.1,
                ease: "easeOut"
              }}
              style={{
                boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.12)'
              }}
            >
              {(() => {
                const VisualComponent = projects[activeTab].Visual;
                return <VisualComponent />;
              })()}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {/* Category Badge & Jira Story */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="inline-block px-3 py-1 bg-black text-white text-xs rounded-full">
                  {projects[activeTab].category}
                </div>
                <div className="inline-block px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 text-xs rounded-full">
                  User Story: {projects[activeTab].jiraStory}
                </div>
              </div>

              {/* Title & Company */}
              <h3 className="text-black mb-2">{projects[activeTab].title}</h3>
              <p className="text-sm text-gray-500 mb-6">{projects[activeTab].company}</p>

              {/* Challenge */}
              <div className="mb-6">
                <div className="text-sm uppercase tracking-wide text-gray-500 mb-2">Challenge</div>
                <p className="text-gray-700">{projects[activeTab].challenge}</p>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                {/* Research Time */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="bg-white rounded-xl p-4 border border-gray-100"
                  style={{
                    boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.04)'
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <div className="text-xs uppercase tracking-wide text-gray-500">Research Time</div>
                  </div>
                  <div className="text-2xl text-black mb-1">{projects[activeTab].researchTime}</div>
                  <p className="text-xs text-gray-500">vs {projects[activeTab].vsTime}</p>
                </motion.div>

                {/* Key Insight */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="bg-white rounded-xl p-4 border border-gray-100"
                  style={{
                    boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.04)'
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-gray-400" />
                    <div className="text-xs uppercase tracking-wide text-gray-500">Key Insight</div>
                  </div>
                  <div className="text-sm text-black">{projects[activeTab].keyInsight}</div>
                </motion.div>
              </div>

              {/* Quote */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="bg-gradient-to-br from-gray-50 to-white rounded-xl p-6 border border-gray-100"
                style={{
                  boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.04)'
                }}
              >
                <p className="text-gray-700 italic mb-4">&ldquo;{projects[activeTab].quote}&rdquo;</p>
                <div className="text-sm">
                  <div className="text-black">{projects[activeTab].attribution}</div>
                  <div className="text-gray-500">{projects[activeTab].attributionCompany}</div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </motion.div>

        {/* View All Use Cases Button */}
        <motion.div 
          className="mt-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <a 
            href="/use-cases" 
            className="inline-flex items-center gap-2 px-8 py-4 bg-black text-white rounded-full font-medium hover:bg-gray-800 transition-colors shadow-lg hover:shadow-xl"
          >
            <span>View All Use Cases</span>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 10H16M16 10L10 4M16 10L10 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </motion.div>
      </div>
    </section>
  );
}