import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import { Briefcase, Clock, TrendingUp } from 'lucide-react';
import { ImageWithFallback } from '@/components/landing/figma/ImageWithFallback';

export function CaseStudies() {
  const [activeTab, setActiveTab] = useState(0);

  const projects = [
    {
      id: 1,
      category: 'SaaS',
      title: 'ERP Implementation Stakeholder Analysis',
      company: 'Enterprise Software Company',
      challenge: 'Multiple business units (IT, Finance, Operations) with conflicting priorities on a $2M ERP modernization.',
      researchTime: '4 hours',
      vsTime: '3 weeks',
      keyInsight: '8 critical conflict areas',
      quote: 'The consensus scoring revealed that Operations had risk concerns Finance completely missed - insights that would have taken us 3 months and 50 interviews to uncover. Instead, we had it in an afternoon.',
      attribution: 'Senior Product Manager',
      attributionCompany: 'Enterprise Software Company',
      image: 'https://images.unsplash.com/photo-1709715357520-5e1047a2b691?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxidXNpbmVzcyUyMHRlYW0lMjBtZWV0aW5nfGVufDF8fHx8MTc2NDk1NTg2OHww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
    },
    {
      id: 2,
      category: 'Professional Services',
      title: 'Pan-European Market Expansion',
      company: 'Fortune 500 Consulting Firm',
      challenge: 'Need to understand 12 diverse European market segments before launching go-to-market strategy.',
      researchTime: '6 hours',
      vsTime: '14 weeks',
      keyInsight: '96% demographic match to census',
      quote: 'We identified 12 previously unknown objection patterns across segments. This shaped our entire go-to-market strategy and saved 8 weeks of field research.',
      attribution: 'VP of Market Research',
      attributionCompany: 'Fortune 500 Consulting',
      image: 'https://images.unsplash.com/photo-1764726354539-96228698dc45?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxnbG9iYWwlMjBidXNpbmVzcyUyMHN0cmF0ZWd5fGVufDF8fHx8MTc2NTA2MDkwMXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
    },
    {
      id: 3,
      category: 'Manufacturing/Supply Chain',
      title: 'Supply Chain Optimization Study',
      company: 'Mid-Market Manufacturing',
      challenge: 'Evaluating vendor consolidation impact across procurement, logistics, and finance teams.',
      researchTime: '4 hours',
      vsTime: '9 weeks',
      keyInsight: 'Modeled all stakeholder concerns',
      quote: 'Instead of guessing which consolidation approach would work, we modeled all stakeholder concerns. Consensus scoring showed us the sweet spot between cost savings and operational risk.',
      attribution: 'Chief Procurement Officer',
      attributionCompany: 'Mid-Market Manufacturing',
      image: 'https://images.unsplash.com/photo-1573209680076-bd7ec7007616?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzdXBwbHklMjBjaGFpbiUyMGxvZ2lzdGljc3xlbnwxfHx8fDE3NjUwNjA5MDF8MA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral'
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
              PROJECT {project.id}
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