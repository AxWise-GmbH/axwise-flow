import { motion } from 'motion/react';
import { Clock, Target, Users, TrendingUp, Zap, CheckCircle } from 'lucide-react';

export function Benefits() {
  const benefits = [
    {
      icon: Clock,
      title: 'Real Time Discovery',
      description: 'Get instant feedback from AI personas instead of waiting weeks for user interviews.',
      stat: '94% Faster'
    },
    {
      icon: Target,
      title: 'De Risk Development',
      description: 'Validate concepts before writing a single line of code. Make data driven decisions.',
      stat: '70% Cost Reduction'
    },
    {
      icon: Users,
      title: 'Scale Research',
      description: 'Interview hundreds of AI personas simultaneously to uncover edge cases and insights.',
      stat: '100x Scale'
    }
  ];

  const additionalBenefits = [
    'Automated User Stories',
    'Instant PRD Generation',
    'Data Driven Insights',
    'Collaboration Tools',
    'Version Control',
    'Export to Any Format'
  ];

  const oceanTraits = [
    {
      letter: 'O',
      trait: 'Openness',
      description: 'Curiosity, creativity, and willingness to try new experiences'
    },
    {
      letter: 'C',
      trait: 'Conscientiousness',
      description: 'Organization, dependability, and goal directed behavior'
    },
    {
      letter: 'E',
      trait: 'Extraversion',
      description: 'Sociability, assertiveness, and positive emotionality'
    },
    {
      letter: 'A',
      trait: 'Agreeableness',
      description: 'Compassion, cooperation, and tendency to be trusting'
    },
    {
      letter: 'N',
      trait: 'Neuroticism',
      description: 'Emotional stability, anxiety levels, and stress responses'
    }
  ];

  return (
    <section id="benefits" className="pt-12 pb-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm mb-6"
          >
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm text-gray-600">BENEFITS</span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-black mb-4"
          >
            Why Choose AxWise
          </motion.h2>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-gray-600 max-w-2xl mx-auto"
          >
            Partner with an AI platform delivering smart product development solutions.
          </motion.p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {benefits.map((benefit, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="relative"
            >
              <div className="bg-white rounded-3xl p-8 h-full border border-gray-100"
                style={{
                  boxShadow: '0 4px 24px 0 rgba(0, 0, 0, 0.06)'
                }}
              >
                <motion.div
                  className="w-16 h-16 bg-gradient-to-br from-gray-50 to-white rounded-2xl flex items-center justify-center mb-6 border border-gray-100"
                  whileHover={{ scale: 1.05, rotate: 5 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 10 }}
                  style={{
                    boxShadow: '0 4px 14px 0 rgba(0, 0, 0, 0.08)'
                  }}
                >
                  <benefit.icon className="w-8 h-8 text-black" />
                </motion.div>

                <div className="inline-block px-3 py-1 bg-black text-white rounded-full text-sm mb-4">
                  {benefit.stat}
                </div>

                <h3 className="text-black mb-3">{benefit.title}</h3>
                <p className="text-gray-600">{benefit.description}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="bg-white rounded-3xl p-12 border border-gray-100 mb-16"
          style={{
            boxShadow: '0 4px 24px 0 rgba(0, 0, 0, 0.06)'
          }}
        >
          <div className="grid md:grid-cols-3 gap-6">
            {additionalBenefits.map((benefit, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                className="flex items-center gap-3"
              >
                <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.2)'
                  }}
                >
                  <CheckCircle className="w-5 h-5 text-white" />
                </div>
                <span className="text-black">{benefit}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* OCEAN Model Framework */}
        <motion.div
          id="ocean"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white rounded-3xl p-8 md:p-12 border border-gray-100"
          style={{
            boxShadow: '0 4px 24px 0 rgba(0, 0, 0, 0.06)'
          }}
        >
          <div className="text-center mb-12">
            <h3 className="text-black mb-3">The OCEAN Model Framework</h3>
            <p className="text-gray-600 max-w-3xl mx-auto">
              To ensure personas behave consistently across different interviews, we sample Big Five personality traits conditional on occupation and age.
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-3">
            {oceanTraits.map((trait, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className="flex flex-col items-center"
              >
                <motion.div
                  className="w-20 h-20 bg-black text-white rounded-xl flex items-center justify-center mb-4"
                  style={{
                    boxShadow: '0 4px 14px 0 rgba(0, 0, 0, 0.25)'
                  }}
                  whileHover={{ 
                    scale: 1.05,
                    boxShadow: '0 6px 20px 0 rgba(0, 0, 0, 0.3)'
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 10 }}
                >
                  <span className="text-3xl font-bold">{trait.letter}</span>
                </motion.div>
                <h4 className="text-black mb-2 text-center">{trait.trait}</h4>
                <p className="text-gray-600 text-sm text-center leading-relaxed">
                  {trait.description}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}