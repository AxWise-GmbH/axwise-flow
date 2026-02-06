import { motion } from 'motion/react';
import { Target, BarChart3, FileText, ArrowRight, Sparkles } from 'lucide-react';
const flowDiagramImage = 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2670&auto=format&fit=crop';

function FeatureCard({ icon: Icon, title, description, badge, delay }: any) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay }}
      className="bg-white rounded-2xl p-8 border border-gray-100"
      style={{
        boxShadow: '0 2px 12px 0 rgba(0, 0, 0, 0.04)'
      }}
    >
      <div className="inline-block px-3 py-1 bg-gray-50 rounded-full text-xs mb-6">
        {badge}
      </div>
      <div className="w-14 h-14 bg-black rounded-xl flex items-center justify-center mb-6">
        <Icon className="w-7 h-7 text-white" />
      </div>
      <h3 className="mb-4">{title}</h3>
      <p className="text-gray-600 text-sm leading-relaxed">
        {description}
      </p>
    </motion.div>
  );
}

export function Features() {
  const features = [
    {
      icon: Target,
      title: 'Simulates Research',
      description: 'Conduct synthetic interviews with AI personas to test concepts instantly. No waiting, no scheduling—just immediate insights.',
      badge: 'AI POWERED'
    },
    {
      icon: BarChart3,
      title: 'Automates Analysis',
      description: 'Converts raw data into deep insights and user stories automatically. Transform interviews into actionable intelligence.',
      badge: 'SMART ANALYSIS'
    },
    {
      icon: FileText,
      title: 'Delivers Specs',
      description: 'Generates comprehensive Product Requirement Documents (PRDs) automatically. From concept to detailed specification in minutes.',
      badge: 'INSTANT DOCS'
    }
  ];

  return (
    <section id="features" className="pt-12 pb-16">
      <div className="max-w-7xl mx-auto px-6">
        {/* Main Feature Showcase */}
        <div className="grid lg:grid-cols-2 gap-8 items-center mb-16">
          {/* Left Column - Content */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="text-xs tracking-wider text-gray-500 mb-6 uppercase">
                Product Discovery Automation
              </div>

              <h2 className="text-black mb-8" style={{ fontSize: 'clamp(2.5rem, 4vw, 4rem)' }}>
                All features in 1 platform
              </h2>

              <p className="text-gray-600 mb-10 max-w-lg text-xl leading-relaxed">
                AxWise is designed for efficiency, enabling product teams to validate ideas across a range of workflows—from initial concept to comprehensive PRD—while maintaining high performance and a reduced time footprint.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-4 mb-16">
                <motion.a
                  href="https://tidycal.com/team/axwise/demo"
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ y: -2 }}
                  whileTap={{ y: 0 }}
                  className="px-8 py-4 bg-black text-white rounded-xl transition-all text-lg inline-block"
                  style={{
                    boxShadow: '0 4px 14px 0 rgba(0, 0, 0, 0.25)'
                  }}
                >
                  Get Started
                </motion.a>
                <motion.a
                  href="#ocean"
                  whileHover={{ y: -2 }}
                  whileTap={{ y: 0 }}
                  className="px-8 py-4 bg-white text-black rounded-xl border border-gray-200 transition-all flex items-center gap-2 text-lg"
                  style={{
                    boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.06)'
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById('ocean')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  Learn more
                  <ArrowRight className="w-5 h-5" />
                </motion.a>
              </div>

              {/* Feature Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="bg-white rounded-2xl p-8 border border-gray-100"
                style={{
                  boxShadow: '0 2px 12px 0 rgba(0, 0, 0, 0.04)'
                }}
              >
                <div className="flex items-start gap-6">
                  <div className="w-16 h-16 bg-black rounded-xl flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-8 h-8 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="inline-block px-3 py-1.5 bg-black text-white text-xs rounded-md">
                        NEW
                      </span>
                    </div>
                    <h3 className="mb-3 text-xl">
                      Introducing AxWise 2.0: The Most Reliable Idea to PRD Engine on the Market
                    </h3>
                    <a
                      href="#ocean"
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById('ocean')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="text-base text-gray-600 hover:text-black transition-colors flex items-center gap-1.5"
                    >
                      Learn more
                      <ArrowRight className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>

          {/* Right Column - Flow Diagram */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative flex items-center justify-center mt-20"
          >
            <img src={flowDiagramImage} alt="Flow Diagram" className="w-full max-w-2xl rounded-xl" />
          </motion.div>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <FeatureCard
              key={index}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              badge={feature.badge}
              delay={index * 0.1}
            />
          ))}
        </div>
      </div>
    </section>
  );
}