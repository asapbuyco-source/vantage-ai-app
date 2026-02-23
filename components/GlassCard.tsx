import React from 'react';
import { motion } from 'framer-motion';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  highlight?: boolean;
  delay?: number;
  onClick?: () => void;
}

export const GlassCard: React.FC<GlassCardProps> = ({ 
  children, 
  className = '', 
  highlight = false, 
  delay = 0,
  onClick
}) => {
  return (
    // @ts-ignore
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: delay * 0.1 }}
      onClick={onClick}
      className={`
        relative overflow-hidden rounded-2xl border
        ${onClick ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}
        ${highlight 
          ? 'border-vantage-cyan/40 bg-vantage-cyan/10 dark:bg-vantage-cyan/5' 
          : 'border-slate-200 bg-white/60 dark:border-white/10 dark:bg-white/5'}
        backdrop-blur-md shadow-lg p-5
        ${className}
      `}
    >
      {/* Subtle shine effect - hidden in light mode to keep it clean, visible in dark */}
      <div className="absolute -top-10 -right-10 w-20 h-20 bg-white/40 dark:bg-white/5 rounded-full blur-2xl pointer-events-none opacity-50 dark:opacity-100" />
      <div className="absolute -bottom-10 -left-10 w-20 h-20 bg-vantage-cyan/10 dark:bg-vantage-cyan/5 rounded-full blur-2xl pointer-events-none" />
      
      {/* Metallic Shimmer for Premium Feel */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20 dark:opacity-10 bg-gradient-to-tr from-transparent via-white/10 to-transparent skew-y-12 translate-x-[-100%] animate-[shimmer_8s_infinite]" />

      <div className="relative z-10">
        {children}
      </div>
    </motion.div>
  );
};