import { motion, AnimatePresence } from 'motion/react';
import { useState } from 'react';
import { ChevronDown, Mail, HelpCircle } from 'lucide-react';
import { Button3D } from './Button3D';

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      question: 'What services do you offer?',
      answer: 'We specialize in AI solutions, including machine learning models, automation, chatbots, predictive analytics, and consulting tailored to your business needs. Our platform helps you go from idea to PRD in minutes.'
    },
    {
      question: 'How long does it take to develop an AI solution?',
      answer: 'With AxWise, product discovery is instant. Our AI personas can conduct synthetic interviews immediately, and PRD generation takes minutes instead of weeks. Traditional development timelines are reduced by up to 80%.'
    },
    {
      question: 'Do I need technical expertise to work with you?',
      answer: 'No technical expertise required! AxWise is designed for product teams of all backgrounds. Our intuitive platform guides you through research, analysis, and documentation with AI assistance every step of the way.'
    },
    {
      question: 'Is my data safe when working with your agency?',
      answer: 'Absolutely. We implement enterprise-grade security measures, including encryption, secure data storage, and compliance with GDPR and SOC 2 standards. Your data privacy is our top priority.'
    },
    {
      question: 'Can AI really help my business grow?',
      answer: 'Yes! AI accelerates product development, reduces risks, and enables data driven decisions. Our clients see 65% faster validation, 45% cost reduction, and significantly improved product market fit before writing any code.'
    }
  ];

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-24">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm mb-6"
          >
            <HelpCircle className="w-4 h-4" />
            <span className="text-sm text-gray-600">FAQS</span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-black mb-4"
          >
            Questions? Answers!
          </motion.h2>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-gray-600"
          >
            Find Some quick answers to the most common questions.
          </motion.p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.05 }}
              className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
              style={{
                boxShadow: '0 2px 12px 0 rgba(0, 0, 0, 0.04)'
              }}
            >
              <button
                onClick={() => toggleFAQ(index)}
                className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
              >
                <span className="text-black pr-8">{faq.question}</span>
                <motion.div
                  animate={{ rotate: openIndex === index ? 180 : 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex-shrink-0"
                >
                  <ChevronDown className="w-5 h-5 text-gray-600" />
                </motion.div>
              </button>

              <AnimatePresence>
                {openIndex === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="px-6 pb-5 text-gray-600 border-t border-gray-100 pt-4">
                      {faq.answer}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-12 text-center"
        >
          <div className="bg-white rounded-2xl px-8 py-6 inline-flex items-center gap-4 border border-gray-100"
            style={{
              boxShadow: '0 4px 14px 0 rgba(0, 0, 0, 0.06)'
            }}
          >
            <Mail className="w-5 h-5 text-gray-600" />
            <span className="text-gray-600">Feel free to mail us for any enquiries</span>
            <a href="mailto:support@axwise.de" className="text-black underline">
              support@axwise.de
            </a>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-16 text-center"
        >
          <h3 className="text-black mb-4">Ready to transform your product development?</h3>
          <p className="text-gray-600 mb-6">Start your journey from idea to PRD today.</p>
          <Button3D size="lg" href="https://tidycal.com/team/axwise/demo">Get Started Free →</Button3D>
        </motion.div>
      </div>
    </section>
  );
}