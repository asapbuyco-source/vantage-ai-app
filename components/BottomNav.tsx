import React from 'react';
import { motion } from 'framer-motion';
import { Home, Unlock, Lock, User, Sparkles, History, Radio, Briefcase, Zap } from 'lucide-react';
import { NavigationTab } from '../types';
import { useAppContext } from '../context/AppContext';
import { useData } from '../context/DataContext';

interface BottomNavProps {
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  const { t, language } = useAppContext();
  const { liveCount } = useData();

  const navItems = [
    { id: 'home', icon: Home, label: t('nav.home') },
    { id: 'free', icon: Unlock, label: t('nav.free') },
    { id: 'arb', icon: Zap, label: language === 'fr' ? 'Arbitrage' : 'Arb Finder' },
    { id: 'vip', icon: Lock, label: t('nav.vip') },
    { id: 'profile', icon: User, label: t('nav.profile') },
  ] as const;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:top-0 md:right-auto md:w-64 md:flex md:flex-col md:border-r border-gray-200 dark:border-white/10 md:bg-white/95 md:dark:bg-vantage-bg/95">
      {/* Glassmorphism Background (Mobile only, Desktop uses solid bg above) */}
      <div className="absolute inset-0 bg-white/90 dark:bg-black/80 backdrop-blur-xl border-t border-gray-200 dark:border-white/10 transition-colors duration-300 md:hidden" />

      {/* Desktop Logo Header */}
      <div className="hidden md:flex items-center px-6 py-8">
        <h1 className="text-2xl font-black font-orbitron tracking-tight text-slate-900 dark:text-white">
          VANTAGE<span className="text-vantage-cyan">AI</span>
        </h1>
      </div>

      <div className="relative flex justify-around items-center h-[72px] pb-safe pb-2 px-2 md:flex-col md:h-auto md:justify-start md:items-stretch md:space-y-2 md:px-4 md:pt-4 md:flex-1">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id as NavigationTab)}
              className={`relative flex flex-col md:flex-row items-center justify-center md:justify-start w-full h-full md:h-14 space-y-0.5 md:space-y-0 md:space-x-4 transition-all duration-200 md:rounded-xl md:px-4 ${isActive && 'md:bg-vantage-cyan/10'
                }`}
            >
              {/* Active sliding indicator bar */}
              {isActive && (
                <motion.div
                  className="absolute bottom-0 left-2 right-2 h-0.5 bg-vantage-cyan rounded-full md:block"
                  layoutId="activeTab"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              {/* Active background pill — sits behind everything, covers entire button */}
              {isActive && (
                // @ts-ignore
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-x-1 top-1.5 bottom-1.5 bg-vantage-cyan/12 rounded-2xl md:hidden"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <div className={`relative z-10 flex items-center justify-center transition-all duration-200 ${isActive ? 'text-vantage-cyan -translate-y-0.5 md:translate-y-0 md:scale-110' : 'text-gray-400 dark:text-gray-500 md:hover:text-vantage-cyan/70'}`}>
                <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} className="md:w-5 md:h-5" />
                {/* Live badge */}
                {'badge' in item && (item as any).badge !== undefined && (
                  <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-red-500 text-white text-[8px] font-black rounded-full flex items-center justify-center px-0.5 leading-none">
                    {String((item as any).badge)}
                  </span>
                )}
              </div>
              <span className={`relative z-10 text-[9px] md:text-sm font-semibold tracking-wide transition-colors ${isActive ? 'text-vantage-cyan md:font-bold' : 'text-gray-400 dark:text-gray-500 md:font-medium'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Desktop Footer (Optional info area) */}
      <div className="hidden md:block p-6 mt-auto">
        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center">
          Vantage AI Web
        </div>
      </div>
    </nav>
  );
};