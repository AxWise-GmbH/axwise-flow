import { motion } from 'motion/react';
import { Github, Linkedin } from 'lucide-react';
import { Button3D } from './Button3D';

export function Footer() {
  const footerLinks = [
    { name: 'Solutions', href: '/b2b' },
    { name: 'Terms', href: '/terms-of-service' },
    { name: 'Privacy', href: '/privacy-policy' },
    { name: 'Imprint', href: '/impressum' },
    { name: 'Contact', href: 'mailto:support@axwise.de' }
  ];

  const socialLinks = [
    {
      name: 'GitHub',
      icon: Github,
      href: 'https://github.com/AxWise-GmbH/axwise-flow',
      ariaLabel: 'Visit our GitHub'
    },
    {
      name: 'LinkedIn',
      icon: Linkedin,
      href: 'https://www.linkedin.com/company/axwise/',
      ariaLabel: 'Visit our LinkedIn'
    }
  ];

  return (
    <footer className="relative py-24 overflow-hidden">

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        {/* Social Icons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex justify-center gap-3 mb-8"
        >
          {socialLinks.map((social, index) => (
            <motion.a
              key={social.name}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={social.ariaLabel}
              className="w-12 h-12 bg-white rounded-full flex items-center justify-center border border-gray-200 hover:border-black transition-all group"
              style={{
                boxShadow: '0 2px 8px 0 rgba(0, 0, 0, 0.06)'
              }}
              whileHover={{
                y: -3,
                boxShadow: '0 4px 16px 0 rgba(0, 0, 0, 0.12)'
              }}
              whileTap={{ scale: 0.95 }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <social.icon className="w-5 h-5 text-gray-600 group-hover:text-black transition-colors" />
            </motion.a>
          ))}
        </motion.div>

        {/* Logo and Branding */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex items-center justify-center gap-3 mb-4"
          >
            <motion.div
              className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center shadow-xl"
              whileHover={{ rotate: 5, scale: 1.05 }}
              transition={{ type: 'spring', stiffness: 400, damping: 10 }}
            >
              <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 6L32 13V27L20 34L8 27V13L20 6Z" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="20" cy="20" r="2.4" fill="white" />
              </svg>
            </motion.div>
            <h3 className="text-black tracking-tight">AXWISE</h3>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-gray-600 mb-6 max-w-md mx-auto"
          >
            Next-gen AI systems, built for tomorrow's innovators
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Button3D size="md" href="https://tidycal.com/team/axwise/demo">Get Started →</Button3D>
          </motion.div>
        </div>

        {/* Navigation Links */}
        <motion.nav
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="flex flex-wrap justify-center gap-6 mb-12 pt-12 border-t border-gray-100"
        >
          {footerLinks.map((link, index) => (
            <motion.a
              key={link.name}
              href={link.href}
              className="text-gray-600 hover:text-black transition-colors relative group"
              whileHover={{ y: -2 }}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: 0.4 + index * 0.05 }}
            >
              {link.name}
              <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-black group-hover:w-full transition-all duration-300"></span>
            </motion.a>
          ))}
        </motion.nav>

        {/* Copyright */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="text-center text-gray-500 text-sm"
        >
          <p>AXWISE © {new Date().getFullYear()}</p>
          <p className="mt-1 text-xs">Powered by Viral Buddy Agency</p>
        </motion.div>
      </div>
    </footer>
  );
}