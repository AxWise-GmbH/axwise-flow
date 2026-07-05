import { motion } from 'motion/react';

export function SocialProof() {
  const companies = [
    'CARIAD (Volkswagen Group)',
    'Coinbase',
    'People.ai',
    'Refact.ai',
    'Vexa.ai',
    'Rhesis AI',
    'Upcode Systematic',
    'Encoway',
    'Constructor University',
    'Delta Campus',
    'Bremen Startups',
    'Traide',
    'Archipelago',
    'idev.agency'
  ];

  // Duplicate companies for seamless loop
  const duplicatedCompanies = [...companies, ...companies];

  return (
    <section className="relative py-8 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col items-center">
          {/* Header Text */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <p className="text-xl text-gray-500 mb-8 tracking-wide uppercase font-medium">
              Trusted by Product Teams at:
            </p>

            {/* Scrolling Company Names */}
            <div className="relative w-full max-w-7xl mx-auto mb-12 overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-white to-transparent z-10" />
              <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-white to-transparent z-10" />
              <motion.div
                className="flex gap-12"
                animate={{
                  x: ['0%', '-50%'],
                }}
                transition={{
                  duration: 40,
                  repeat: Infinity,
                  ease: 'linear',
                }}
              >
                {duplicatedCompanies.map((company, index) => (
                  <div
                    key={`${company}-${index}`}
                    className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity duration-300"
                  >
                    <span className="text-gray-700 whitespace-nowrap">
                      {company}
                    </span>
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Metric */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="inline-flex items-center gap-3 px-8 py-4 bg-gray-50 rounded-full border border-gray-200"
            >
              <div className="w-3 h-3 bg-black rounded-full animate-pulse" />
              <span className="text-lg text-gray-700">
                <strong className="text-black text-xl">10,000+</strong> Synthetic Interviews Conducted
              </span>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}