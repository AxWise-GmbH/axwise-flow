import { motion } from 'motion/react';
import { Calendar, Download } from 'lucide-react';
import { useState } from 'react';

export function CTA() {
  const [formData, setFormData] = useState({
    workEmail: '',
    firstName: '',
    companyName: '',
    jobTitle: '',
    challenge: ''
  });

  const handleSubmit = (action: 'schedule' | 'download') => {
    // Handle form submission
    console.log('Form submitted:', action, formData);
    if (action === 'schedule') {
      window.open('https://tidycal.com/team/axwise/demo', '_blank');
    }
  };

  return (
    <section className="py-24 bg-black relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-white/5 blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            x: [0, 50, 0],
            y: [0, -30, 0],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        <motion.div
          className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full bg-white/5 blur-3xl"
          animate={{
            scale: [1, 1.1, 1],
            x: [0, -30, 0],
            y: [0, 50, 0],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </div>

      <div className="max-w-5xl mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-4xl md:text-5xl text-white mb-4 tracking-tight text-center">
            Ready to Accelerate Your Discovery?
          </h2>
          <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto text-center">
            Join forward thinking product teams using AxWise to automate research and deliver better specs, faster.
          </p>
          
          {/* Option Cards */}
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div className="bg-white rounded-2xl p-6">
              <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center mb-4">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-black mb-2">Schedule Architecture Review</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                80 minute technical deep dive with our team. Completely free, no obligation!
              </p>
            </div>

            <div className="bg-white rounded-2xl p-6">
              <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center mb-4">
                <Download className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-black mb-2">Get the Stuttgart Manufacturing Sample</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Download a curated sample of 30 high fidelity synthetic interviews across Supply Chain, ERP implementation, and Industry 4.0 adoption, delivered as JSON and Parquet.
              </p>
            </div>
          </div>

          {/* Form */}
          <div className="bg-white rounded-2xl p-8">
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-black text-xs mb-2 uppercase tracking-wider">
                  Work Email *
                </label>
                <input
                  type="email"
                  value={formData.workEmail}
                  onChange={(e) => setFormData({...formData, workEmail: e.target.value})}
                  placeholder="you@company.com"
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-black text-xs mb-2 uppercase tracking-wider">
                  First Name *
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                  placeholder="Jane"
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-black text-xs mb-2 uppercase tracking-wider">
                  Company Name *
                </label>
                <input
                  type="text"
                  value={formData.companyName}
                  onChange={(e) => setFormData({...formData, companyName: e.target.value})}
                  placeholder="Acme Corp"
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-black text-xs mb-2 uppercase tracking-wider">
                  Job Title *
                </label>
                <input
                  type="text"
                  value={formData.jobTitle}
                  onChange={(e) => setFormData({...formData, jobTitle: e.target.value})}
                  placeholder="VP of Product"
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-black placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-colors"
                />
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-black text-xs mb-2 uppercase tracking-wider">
                Primary Research Challenge *
              </label>
              <select
                value={formData.challenge}
                onChange={(e) => setFormData({...formData, challenge: e.target.value})}
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-black focus:outline-none focus:border-gray-400 transition-colors appearance-none cursor-pointer"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23000'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 1rem center',
                  backgroundSize: '1.25rem'
                }}
              >
                <option value="">Select a challenge</option>
                <option value="speed">Need faster product discovery</option>
                <option value="quality">Improve research quality</option>
                <option value="scale">Scale user research</option>
                <option value="validation">Better idea validation</option>
              </select>
            </div>

            {/* Action Buttons */}
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <motion.button
                onClick={() => handleSubmit('schedule')}
                whileHover={{ y: -2 }}
                whileTap={{ y: 0 }}
                className="w-full bg-black hover:bg-gray-900 text-white rounded-xl px-6 py-3.5 transition-all flex items-center justify-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                <span>Schedule Architecture Review</span>
              </motion.button>
              <motion.button
                onClick={() => handleSubmit('download')}
                whileHover={{ y: -2 }}
                whileTap={{ y: 0 }}
                className="w-full bg-white hover:bg-gray-50 text-black border-2 border-black rounded-xl px-6 py-3.5 transition-all flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Download Dataset</span>
              </motion.button>
            </div>

            {/* Privacy Notice */}
            <p className="text-xs text-gray-500 text-center leading-relaxed">
              By submitting this form, you agree to receive communications from AxWise. We respect your privacy and you can unsubscribe at any time.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}