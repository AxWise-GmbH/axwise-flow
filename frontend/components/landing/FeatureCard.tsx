import { motion } from 'motion/react';
import { LucideIcon } from 'lucide-react';

interface FeatureCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  badge: string;
  delay?: number;
}

export function FeatureCard({ icon: Icon, title, description, badge, delay = 0 }: FeatureCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, delay }}
      whileHover={{ y: -5 }}
      className="relative group"
    >
      <div className="bg-white rounded-3xl p-8 border border-gray-100 h-full"
        style={{
          boxShadow: '0 4px 24px 0 rgba(0, 0, 0, 0.06), 0 10px 40px 0 rgba(0, 0, 0, 0.04)'
        }}
      >
        <motion.div
          className="w-14 h-14 bg-black rounded-2xl flex items-center justify-center mb-6"
          whileHover={{ rotate: 5, scale: 1.05 }}
          transition={{ type: 'spring', stiffness: 400, damping: 10 }}
          style={{
            boxShadow: '0 4px 14px 0 rgba(0, 0, 0, 0.25)'
          }}
        >
          <Icon className="w-7 h-7 text-white" />
        </motion.div>

        <div className="inline-flex items-center gap-2 px-3 py-1 bg-gray-50 rounded-full mb-4">
          <span className="text-xs text-gray-600">{badge}</span>
        </div>

        <h3 className="text-black mb-3">{title}</h3>
        <p className="text-gray-600">{description}</p>
      </div>
    </motion.div>
  );
}
