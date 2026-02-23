import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import { Briefcase, Clock, TrendingUp } from 'lucide-react';
import { ImageWithFallback } from '@/components/landing/figma/ImageWithFallback';

export function CaseStudies() {
  const [activeTab, setActiveTab] = useState(0);

  const projects = [
    {
      id: 1,
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
      // high quality ecommerce checkout or shopping image
      image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxlY29tbWVyY2V8ZW58MHx8fHwxNzY1MDU0MTU3fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
    },
    {
      id: 2,
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
      // car interior UI or autonomous driving image
      image: 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhdXRvbW90aXZlJTIwaW50ZXJpb3J8ZW58MHx8fHwxNzY1MDU0MjEyfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
    },
    {
      id: 3,
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
      // data, analytics, tech abstraction image 
      image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkYXRhJTIwYW5hbHl0aWNzfGVufDB8fHx8MTc2NTA1NDI4Nnww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
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
            <Briefcase className="w-4 h-4" />
            <span className="text-sm text-gray-600">PROJECTS</span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-black mb-4"
          >
            Real Results from Real Organizations
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-gray-600 max-w-2xl mx-auto"
          >
            Enterprise teams using AxWise are compressing months of research into hours while gaining deeper, more nuanced insights.
          </motion.p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 justify-center mb-12">
          {projects.map((project, index) => (
            <motion.button
              key={project.id}
              onClick={() => setActiveTab(index)}
              className={`px-6 py-3 rounded-full transition-all ${activeTab === index
                ? 'bg-black text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              whileHover={{ scale: activeTab === index ? 1 : 1.05 }}
              whileTap={{ scale: 0.95 }}
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
              className="relative aspect-[4/3] rounded-2xl overflow-hidden"
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
              <ImageWithFallback
                src={projects[activeTab].image}
                alt={projects[activeTab].title}
                className="w-full h-full object-cover"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              {/* Category Badge */}
              <div className="inline-block px-3 py-1 bg-black text-white text-xs rounded-full mb-4">
                {projects[activeTab].category}
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
      </div>
    </section>
  );
}