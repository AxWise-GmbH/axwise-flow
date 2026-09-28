'use client';

import React from 'react';
import { motion } from 'motion/react';

interface PartnerItem {
  id: string;
  name: string;
  logo: string;
  isSvg?: boolean;
}

interface AcceleratorItem {
  id: string;
  name: string;
  program: string;
  relationship: string;
  logo: string;
  url: string;
}

// Active startup accelerator and incubator programs
const ACCELERATORS: AcceleratorItem[] = [
  {
    id: 'nvidia-inception',
    name: 'NVIDIA Inception',
    program: 'Global Deep Tech & AI Ecosystem',
    relationship: 'Inception Member / AI Startups',
    logo: '/logos/nvidia-inception.png',
    url: 'https://www.nvidia.com/en-us/startups/',
  },
  {
    id: 'google-for-startups',
    name: 'Google for Startups',
    program: 'Google Cloud Startup Program',
    relationship: 'Cloud Program & Scale Partner',
    logo: '/logos/google-for-startups.svg',
    url: 'https://startup.google.com/',
  },
  {
    id: 'constructor-start',
    name: 'Constructor Start Accelerator',
    program: 'Constructor University · Bremen',
    relationship: 'Accelerator Alumni / Incubated Venture',
    logo: '/logos/constructor-start.svg',
    url: 'https://constructor.university/constructor-entrepreneurship-and-innovation-center/constructor-start',
  },
  {
    id: 'imaguru',
    name: 'Imaguru Startup Hub',
    program: 'Madrid · Warsaw · Global',
    relationship: 'Venture Network & Program Partner',
    logo: '/logos/imaguru.svg',
    url: 'https://imaguru.co',
  },
];

// Companies represented by repository stargazers & builders
const COMMUNITY_LOGOS: PartnerItem[] = [
  { id: 'sap', name: 'SAP', logo: '/logos/sap.svg', isSvg: true },
  { id: 'epam', name: 'EPAM Systems', logo: '/logos/epam.png' },
  { id: 'nestle', name: 'Nestlé', logo: '/logos/nestle.svg', isSvg: true },
  { id: 'omio', name: 'Omio', logo: '/logos/omio.svg', isSvg: true },
  { id: 'hclsoftware', name: 'HCLSoftware', logo: '/logos/hclsoftware.svg', isSvg: true },
  { id: 'if-insurance', name: 'If Insurance', logo: '/logos/if-insurance.png' },
  { id: 'smartbox', name: 'Smartbox Group', logo: '/logos/smartbox.png' },
  { id: 'e2b', name: 'E2B', logo: '/logos/e2b.png' },
  { id: 'rhesis-ai', name: 'Rhesis AI', logo: '/logos/rhesis-ai.svg', isSvg: true },
  { id: 'traide-ai', name: 'Traide AI', logo: '/logos/traide-ai.png' },
  { id: 'vexa-ai', name: 'Vexa AI', logo: '/logos/vexa-ai.svg', isSvg: true },
  { id: 'ellamind', name: 'Ellamind', logo: '/logos/ellamind.svg', isSvg: true },
  { id: 'writingmate', name: 'Writingmate', logo: '/logos/writingmate.png' },
  { id: 'noredink', name: 'NoRedInk', logo: '/logos/noredink.png' },
  { id: 'vikunja', name: 'Vikunja', logo: '/logos/vikunja.svg', isSvg: true },
  { id: 'mloda-ai', name: 'Mloda AI', logo: '/logos/mloda-ai.png' },
  { id: 'openchamber', name: 'OpenChamber', logo: '/logos/openchamber.svg', isSvg: true },
  { id: 'knowledgator', name: 'Knowledgator', logo: '/logos/knowledgator.png' },
  { id: 'openexpert', name: 'OpenExpert', logo: '/logos/openexpert.png' },
  { id: 'newframe-ai', name: 'Newframe AI', logo: '/logos/newframe-ai.png' },
  { id: 'premia', name: 'Premian Labs', logo: '/logos/premia.png' },
  { id: 'spearbit', name: 'Spearbit', logo: '/logos/spearbit.png' },
  { id: 'nualogic', name: 'Nualogic', logo: '/logos/nualogic.png' },
  { id: 'unizd', name: 'University of Zadar', logo: '/logos/unizd.png' },
  { id: 'meexle', name: 'Meexle LLC', logo: '/logos/meexle.png' },
  { id: 'acceliontech', name: 'AccelionTech', logo: '/logos/acceliontech.png' },
];

export function EcosystemLogos(): React.JSX.Element {
  const duplicatedLogos = [...COMMUNITY_LOGOS, ...COMMUNITY_LOGOS];

  return (
    <section className="border-t border-[#EAE6DF] py-20 bg-transparent overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 lg:px-16">
        
        {/* Accelerator & Innovation Program Badges */}
        <div className="text-center max-w-2xl mx-auto mb-10 space-y-4">
          <span className="text-xs font-mono uppercase tracking-wider text-emerald-600 font-semibold">
            // ACCELERATORS &amp; ECOSYSTEM
          </span>
          <h2 className="font-serif text-3xl md:text-4xl text-stone-900">
            Supported and incubated by
          </h2>
          <p className="text-stone-600 text-sm">
            AxWise has been supported, incubated, and backed by leading European startup accelerators and global technology innovation programs.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto mb-20">
          {ACCELERATORS.map((accel) => (
            <a
              key={accel.id}
              href={accel.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col justify-between items-center text-center bg-white border border-[#EAE6DF] rounded-xl p-5 hover:border-emerald-400 hover:shadow-md transition-all group"
            >
              <div className="h-12 w-full flex items-center justify-center mb-3">
                <img
                  src={accel.logo}
                  alt={accel.name}
                  className="max-h-full max-w-[150px] object-contain filter grayscale group-hover:grayscale-0 opacity-80 group-hover:opacity-100 transition-all duration-300"
                />
              </div>
              <div className="pt-3 border-t border-stone-100 w-full space-y-1">
                <div className="text-xs font-semibold text-stone-900 group-hover:text-emerald-700 transition-colors">
                  {accel.name}
                </div>
                <div className="text-[11px] font-mono text-stone-500">
                  {accel.relationship}
                </div>
              </div>
            </a>
          ))}
        </div>

        {/* Developer Community Marquee */}
        <div className="pt-8 border-t border-[#EAE6DF]/60">
          <div className="text-center max-w-2xl mx-auto mb-10 space-y-2">
            <span className="text-xs font-mono uppercase tracking-wider text-stone-500 font-semibold">
              // REPOSITORY STARGAZERS &amp; COMMUNITY
            </span>
            <p className="text-stone-600 text-sm">
              Engineers, product leaders, and architects from leading technology and enterprise organizations who starred and tested AxWise repositories:
            </p>
          </div>

          <div className="relative w-full overflow-hidden py-4">
            <div className="absolute left-0 top-0 bottom-0 w-20 md:w-32 bg-gradient-to-r from-[#FCFAF7] to-transparent z-10 pointer-events-none" />
            <div className="absolute right-0 top-0 bottom-0 w-20 md:w-32 bg-gradient-to-l from-[#FCFAF7] to-transparent z-10 pointer-events-none" />
            
            <motion.div
              className="flex items-center gap-12"
              animate={{ x: ['0%', '-50%'] }}
              transition={{
                duration: 45,
                repeat: Infinity,
                ease: 'linear',
              }}
            >
              {duplicatedLogos.map((item, idx) => (
                <div
                  key={`${item.id}-${idx}`}
                  title={item.name}
                  className="flex-shrink-0 h-8 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity grayscale hover:grayscale-0 duration-300 cursor-default"
                >
                  <img
                    src={item.logo}
                    alt={item.name}
                    className="max-h-full w-auto object-contain"
                  />
                </div>
              ))}
            </motion.div>
          </div>
        </div>

      </div>
    </section>
  );
}

export default EcosystemLogos;
