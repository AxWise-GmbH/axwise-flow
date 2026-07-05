import { motion } from 'motion/react';
import { Lightbulb, Wand2, Bot, Workflow } from 'lucide-react';

export function Services() {
  const services = [
    {
      icon: Lightbulb,
      title: 'AI Strategy Consulting',
      description: 'Get expert guidance to implement AI solutions that drive business growth and product innovation.',
      visual: (
        <div className="flex gap-3 mb-6">
          <motion.div
            className="w-16 h-16 bg-white rounded-2xl shadow-lg flex items-center justify-center border border-gray-100"
            whileHover={{ rotate: -5, y: -5 }}
            transition={{ type: 'spring', stiffness: 400, damping: 10 }}
          >
            <Lightbulb className="w-8 h-8 text-black" />
          </motion.div>
          <motion.div
            className="w-16 h-16 bg-gray-50 rounded-2xl shadow flex items-center justify-center border border-gray-100"
            whileHover={{ rotate: 5, y: -5 }}
            transition={{ type: 'spring', stiffness: 400, damping: 10 }}
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" />
              <path d="M2 17L12 22L22 17" />
            </svg>
          </motion.div>
        </div>
      )
    },
    {
      icon: Wand2,
      title: 'Product Generation',
      description: 'We provide seamless content creation solutions that generate captivating, high-quality PRDs in line with your brand\'s voice.',
      visual: (
        <div className="flex flex-col gap-2 mb-6">
          <div className="flex gap-2">
            <div className="flex-1 h-8 bg-white rounded-lg shadow border border-gray-100 flex items-center px-3 overflow-hidden">
              <div className="w-2 h-2 rounded-full bg-gray-300 mr-2"></div>
              <motion.span 
                className="text-xs text-gray-400"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                Generating specs...
              </motion.span>
            </div>
            <motion.button
              className="px-4 h-8 bg-black text-white rounded-lg shadow-lg text-xs font-medium"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              animate={{ 
                boxShadow: ['0 4px 6px -1px rgba(0, 0, 0, 0.1)', '0 10px 15px -3px rgba(0, 0, 0, 0.2)', '0 4px 6px -1px rgba(0, 0, 0, 0.1)']
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              Generate
            </motion.button>
          </div>
          <motion.div 
            className="flex-1 h-8 bg-gray-50 rounded-lg border border-gray-100 flex items-center px-3"
            initial={{ width: "40%" }}
            whileInView={{ width: "100%" }}
            transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
          >
            <span className="text-xs text-gray-400">Fixing edge cases...</span>
          </motion.div>
          <div className="flex-1 h-8 bg-gray-50 rounded-lg border border-gray-100 flex items-center px-3">
            <span className="text-xs text-gray-400">Detailed analysis</span>
          </div>
        </div>
      )
    },
    {
      icon: Bot,
      title: 'AI-Powered Research',
      description: 'We develop AI-driven research tools with advanced cognitive technologies to elevate discovery and automate insights.',
      visual: (
        <div className="flex gap-3 mb-6">
          <motion.div
            className="w-16 h-16 bg-gray-50 rounded-2xl shadow flex items-center justify-center border border-gray-100"
            whileHover={{ y: -5 }}
            transition={{ type: 'spring', stiffness: 400, damping: 10 }}
          >
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </motion.div>
          <div className="flex-1 bg-white rounded-2xl shadow-lg border border-gray-100 p-3 flex items-center relative overflow-hidden">
            <motion.div 
              className="absolute left-3 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-black"
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.8, repeat: Infinity }}
            />
            <span className="text-xs text-gray-400 ml-2">Analyzing user interviews...</span>
          </div>
        </div>
      )
    },
    {
      icon: Workflow,
      title: 'Automated Workflows',
      description: 'Automate workflows to streamline tasks, boost efficiency, and save time throughout your development cycle.',
      visual: (
        <div className="flex gap-3 mb-6 justify-center">
          <motion.div
            className="w-14 h-14 bg-white rounded-2xl shadow-lg flex items-center justify-center border border-gray-100"
            whileHover={{ rotate: -10, y: -5 }}
            transition={{ type: 'spring', stiffness: 400, damping: 10 }}
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
            </svg>
          </motion.div>
          <motion.div
            className="w-14 h-14 bg-black rounded-2xl shadow-xl flex items-center justify-center"
            whileHover={{ scale: 1.1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 10 }}
          >
            <Workflow className="w-7 h-7 text-white" />
          </motion.div>
          <motion.div
            className="w-14 h-14 bg-white rounded-2xl shadow-lg flex items-center justify-center border border-gray-100"
            whileHover={{ rotate: 10, y: -5 }}
            transition={{ type: 'spring', stiffness: 400, damping: 10 }}
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="4" />
            </svg>
          </motion.div>
          <motion.div
            className="w-14 h-14 bg-gray-50 rounded-2xl shadow flex items-center justify-center border border-gray-100"
            whileHover={{ rotate: -5, y: -5 }}
            transition={{ type: 'spring', stiffness: 400, damping: 10 }}
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </motion.div>
        </div>
      )
    }
  ];

  return (
    <section id="services" className="pt-12 pb-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm mb-6"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v20M2 12h20" />
            </svg>
            <span className="text-sm text-gray-600">SERVICES</span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-black mb-4"
          >
            Our AI-Driven Services
          </motion.h2>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-gray-600 max-w-2xl mx-auto"
          >
            Leverage AI features that boost performance to your business.
          </motion.p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {services.map((service, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="bg-white rounded-3xl p-8 border border-gray-100"
              style={{
                boxShadow: '0 4px 24px 0 rgba(0, 0, 0, 0.06)'
              }}
            >
              {service.visual}
              
              <h3 className="text-black mb-3">{service.title}</h3>
              <p className="text-gray-600">{service.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}