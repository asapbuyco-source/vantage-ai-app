import React from 'react';
import { motion } from 'framer-motion';
import { Home, Unlock, Lock, User, BookOpen, Calculator } from 'lucide-react';
import { NavigationTab } from '../types';
import { useAppContext } from '../context/AppContext';

interface BottomNavProps {
  activeTab: NavigationTab;
  onTabChange: (tab: NavigationTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  const { t } = useAppContext();

  const navItems = [
    { id: 'home', icon: Home, label: t('nav.home') },
    { id: 'free', icon: Unlock, label: t('nav.free') },
    { id: 'vip', icon: Lock, label: t('nav.vip') },
    { id: 'kelly', icon: Calculator, label: 'Kelly' },
    { id: 'guide', icon: BookOpen, label: t('nav.guide') },
    { id: 'profile', icon: User, label: t('nav.profile') },
  ] as const;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {/* Glassmorphism Background */}
      <div className="absolute inset-0 bg-white/90 dark:bg-black/80 backdrop-blur-xl border-t border-gray-200 dark:border-white/10 transition-colors duration-300" />

      <div className="relative flex justify-around items-center h-[72px] pb-safe pb-2 px-2">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id as NavigationTab)}
              className="flex flex-col items-center justify-center w-full h-full space-y-0.5 transition-all duration-200 relative"
            >
              {isActive && (
                // @ts-ignore
                <motion.div
                  layoutId="nav-pill"
                  className="absolute top-1 left-1/2 -translate-x-1/2 w-10 h-10 rounded-xl bg-vantage-cyan/15"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <div className={`relative z-10 p-2 rounded-xl transition-all duration-200 ${isActive ? 'text-vantage-cyan -translate-y-0.5' : 'text-gray-400 dark:text-gray-500'}`}>
                <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
              </div>
              <span className={`relative z-10 text-[9px] font-semibold tracking-wide transition-colors ${isActive ? 'text-vantage-cyan' : 'text-gray-400 dark:text-gray-500'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};