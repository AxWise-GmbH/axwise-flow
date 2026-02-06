import { motion, AnimatePresence } from 'motion/react';
import { Button3D } from './Button3D';
import { Sparkles, CheckCircle2, FileText, Zap } from 'lucide-react';
import { useState, useEffect } from 'react';

export function Hero() {
  const [currentStep, setCurrentStep] = useState(0);
  const [showPRD, setShowPRD] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        const next = (prev + 1) % 5;
        if (next === 4) {
          setShowPRD(true);
        } else if (next === 0) {
          setShowPRD(false);
        }
        return next;
      });
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Update scroll offset with delay
  useEffect(() => {
    const timer = setTimeout(() => {
      setScrollOffset(currentStep * -100);
    }, 1500); // 1.5 second delay after step changes
    return () => clearTimeout(timer);
  }, [currentStep]);

  const questions = [
    "What problem does your product solve?",
    "Who are your target users?",
    "What are the key features?",
    "What's your timeline?"
  ];

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      
      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-32 pb-20">
        <div className="grid lg:grid-cols-2 gap-20 items-center">
          {/* Left Column - Content */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="flex flex-wrap items-center gap-3 mb-8"
            >
              <a
                href="#features"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border border-gray-200 hover:border-gray-300 transition-colors cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-gray-700" />
                <span className="text-sm text-gray-700">AxWise Simulation Engine</span>
              </a>
              <a 
                href="https://github.com/AxWise-GmbH/axwise-flow"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-full shadow-sm hover:bg-gray-800 transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                </svg>
                <span className="text-sm">Open Source Available</span>
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mb-8"
            >
              <div className="inline-flex items-center gap-4 mb-10">
                <motion.div
                  className="relative w-16 h-16 bg-black rounded-2xl flex items-center justify-center shadow-lg"
                  animate={{
                    y: [0, -8, 0],
                  }}
                  transition={{
                    duration: 6,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                >
                  <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 6L32 13V27L20 34L8 27V13L20 6Z" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="20" cy="20" r="2.4" fill="white"/>
                  </svg>
                </motion.div>
                <div>
                  <div className="text-sm text-gray-500 mb-1">AXWISE</div>
                  <div className="text-xs text-gray-400">Product Discovery Platform</div>
                </div>
              </div>
              
              {/* Clean, Elegant Headline */}
              <h1 className="text-black mb-6 tracking-tight leading-[1.15]" style={{ fontSize: 'clamp(2.5rem, 5vw, 3.75rem)' }}>
                From Raw Idea to Validated PRD in{' '}
                <span className="inline-block bg-black text-white px-4 py-1 rounded-lg">
                  17 Minutes
                </span>
                .
              </h1>
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-gray-600 max-w-xl mb-12 leading-relaxed text-lg"
            >
              Stop spending weeks on manual discovery. Use AI synthetic personas to conduct research, analyze patterns, and write your Product Requirement Documents automatically.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-wrap items-center gap-4"
            >
              <Button3D size="lg" href="https://tidycal.com/team/axwise/demo">Get Started →</Button3D>
              <Button3D size="lg" variant="secondary" href="https://tidycal.com/team/axwise/demo">See How It Works</Button3D>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex items-center gap-12 mt-12"
            >
              <div>
                <div className="text-3xl mb-1">94%</div>
                <div className="text-sm text-gray-500">Time Saved</div>
              </div>
              <div>
                <div className="text-3xl mb-1">17min</div>
                <div className="text-sm text-gray-500">Avg. Duration</div>
              </div>
              <div>
                <div className="text-3xl mb-1">1000+</div>
                <div className="text-sm text-gray-500">PRD Generated</div>
              </div>
              <div>
                <div className="text-3xl mb-1">97.2%</div>
                <div className="text-sm text-gray-500">Demographic Accuracy</div>
              </div>
            </motion.div>
          </div>

          {/* Right Column - Animated Dashboard */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="relative lg:block hidden"
          >
            {/* Main Dashboard Card */}
            <div className="relative bg-white rounded-3xl shadow-xl border border-gray-200 overflow-hidden">
              {/* Dashboard Header */}
              <div className="bg-gradient-to-br from-black to-gray-900 text-white p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm">Discovery Session</div>
                      <div className="text-xs opacity-60 mt-0.5">Powered by AI Personas</div>
                    </div>
                  </div>
                  <motion.div
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="flex items-center gap-2 text-xs bg-white/10 backdrop-blur px-3 py-1.5 rounded-lg"
                  >
                    <motion.div 
                      className="w-1.5 h-1.5 bg-green-400 rounded-full"
                      animate={{
                        scale: [1, 1.3, 1],
                      }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                      }}
                    />
                    Active
                  </motion.div>
                </div>

                {/* Progress Bar */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs opacity-70">Progress</span>
                    <span className="text-xs opacity-70">{Math.min(100, (currentStep + 1) * 25)}%</span>
                  </div>
                  <div className="h-1.5 bg-white/10 backdrop-blur rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-white"
                      animate={{ width: `${Math.min(100, (currentStep + 1) * 25)}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                </div>
              </div>

              {/* Questions Container - Scrolling Content */}
              <div className="relative h-[420px] overflow-hidden bg-gray-50">
                <motion.div
                  className="p-6 space-y-4"
                  animate={{ y: scrollOffset }}
                  transition={{ duration: 0.8, ease: "easeInOut" }}
                >
                  {questions.map((question, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ 
                        opacity: 1,
                        x: 0,
                      }}
                      transition={{ 
                        duration: 0.5,
                        delay: index * 0.05,
                      }}
                      className="flex items-start gap-4 bg-white rounded-xl p-4 shadow-sm border border-gray-100"
                    >
                      <motion.div
                        animate={{
                          scale: index === currentStep ? [1, 1.05, 1] : 1,
                        }}
                        transition={{
                          duration: 1,
                          repeat: index === currentStep ? Infinity : 0,
                        }}
                        className="flex-shrink-0 mt-0.5"
                      >
                        {index < currentStep ? (
                          <motion.div
                            initial={{ scale: 0, rotate: -90 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ duration: 0.3 }}
                          >
                            <CheckCircle2 className="w-5 h-5 text-black" />
                          </motion.div>
                        ) : index === currentStep ? (
                          <div className="w-5 h-5 rounded-full border-2 border-black border-t-transparent animate-spin" />
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                        )}
                      </motion.div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm mb-2 ${index <= currentStep ? 'text-black' : 'text-gray-400'}`}>
                          {question}
                        </div>
                        {index < currentStep && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            transition={{ duration: 0.3 }}
                            className="text-xs text-gray-500 flex items-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Completed
                          </motion.div>
                        )}
                        {index === currentStep && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            transition={{ duration: 0.3 }}
                            className="text-xs text-gray-500 flex items-center gap-1.5"
                          >
                            <Zap className="w-3 h-3" />
                            Analyzing...
                          </motion.div>
                        )}
                      </div>
                    </motion.div>
                  ))}

                  {/* PRD Output */}
                  <AnimatePresence>
                    {showPRD && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ duration: 0.5 }}
                        className="bg-gradient-to-br from-black to-gray-900 text-white rounded-xl p-5 shadow-lg"
                      >
                        <div className="flex items-center gap-2 mb-4">
                          <FileText className="w-5 h-5" />
                          <span className="text-sm">PRD Generated</span>
                          <CheckCircle2 className="w-5 h-5 ml-auto" />
                        </div>
                        <div className="space-y-2.5 text-xs opacity-90">
                          {[
                            'Problem Statement',
                            'User Personas (3)',
                            'Feature Requirements (12)',
                            'Success Metrics'
                          ].map((item, idx) => (
                            <motion.div
                              key={item}
                              initial={{ opacity: 0, x: -15 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.3, delay: idx * 0.08 }}
                              className="flex items-center gap-2"
                            >
                              <div className="w-1 h-1 bg-white rounded-full" />
                              {item}
                            </motion.div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* Gradient fade at bottom */}
                <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-gray-50 to-transparent pointer-events-none" />
              </div>
            </div>

            {/* Subtle decorative accent */}
            <motion.div
              className="absolute -top-6 -right-6 w-32 h-32 bg-gray-100 rounded-full blur-3xl opacity-40"
              animate={{
                scale: [1, 1.2, 1],
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
              }}
            />

            {/* Floating "Powered by AI Personas" Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.2, duration: 0.5 }}
              className="absolute -bottom-6 -left-6 bg-gradient-to-br from-black to-gray-900 text-white rounded-2xl shadow-2xl p-5 border border-gray-800"
            >
              <div className="flex items-center gap-3">
                <motion.div
                  animate={{
                    rotate: [0, 360],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "linear"
                  }}
                >
                  <Zap className="w-6 h-6" />
                </motion.div>
                <div>
                  <div className="text-xs opacity-80">Powered by</div>
                  <div className="text-sm">AI Personas</div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}