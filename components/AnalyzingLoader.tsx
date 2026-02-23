import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Scan, Cpu, Globe, Hourglass, Search, BarChart3, ShieldCheck, Database } from 'lucide-react';

export const AnalyzingLoader: React.FC = () => {
  const [progress, setProgress] = useState(0);
  const [currentStage, setCurrentStage] = useState(0);

  const stages = [
    { text: "Initializing System...", icon: Cpu },
    { text: "Scanning Global Fixtures...", icon: Globe },
    { text: "Looking at Team Form...", icon: Search },
    { text: "Analyzing Matches...", icon: BarChart3 },
    { text: "Checking Outcomes...", icon: Scan },
    { text: "Simulating 10,000 Scenarios...", icon: Database },
    { text: "Verifying Confidence Scores...", icon: ShieldCheck },
    { text: "Please wait 1-2 mins... Filling Bets", icon: Hourglass }, // Final stage for 100%
  ];

  useEffect(() => {
    // Progress Timer
    const timer = setInterval(() => {
      setProgress((oldProgress) => {
        if (oldProgress >= 100) {
          clearInterval(timer);
          return 100;
        }
        // Progress speed
        const diff = 100 - oldProgress;
        // Slow down slightly as we get closer to build suspense, but ensure we hit 100 reasonably
        const increment = Math.random() * (diff / 15) + 0.8; 
        return Math.min(100, oldProgress + increment);
      });
    }, 150);

    return () => clearInterval(timer);
  }, []);

  // Stage switcher based on progress
  useEffect(() => {
    // Special case for 100% to ensure the "Wait" message shows
    if (progress >= 100) {
      setCurrentStage(stages.length - 1);
      return;
    }

    // Map 0-99 to the first n-1 stages
    const activeStagesCount = stages.length - 1;
    const stageIndex = Math.min(
      Math.floor((progress / 100) * activeStagesCount),
      activeStagesCount - 1
    );
    
    // Ensure we don't jump to the last stage prematurely
    setCurrentStage(stageIndex < 0 ? 0 : stageIndex);
  }, [progress]);

  const CurrentIcon = stages[currentStage].icon;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-white/95 dark:bg-vantage-bg/95 backdrop-blur-xl min-h-screen p-4">
       
       {/* Main Loader Visual */}
       <div className="relative w-72 h-72 flex items-center justify-center mb-12 shrink-0">
          {/* Outer Ring */}
          {
            // @ts-ignore
            <motion.div 
             animate={{ rotate: 360 }}
             transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
             className="absolute inset-0 rounded-full border-2 border-vantage-cyan/20 border-t-vantage-cyan border-b-transparent"
            />
          }
          {/* Middle Ring */}
          {
            // @ts-ignore
            <motion.div 
             animate={{ rotate: -360 }}
             transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
             className="absolute inset-4 rounded-full border-2 border-vantage-purple/20 border-r-vantage-purple border-l-transparent"
            />
          }
          {/* Inner Glow */}
          {
            // @ts-ignore
            <motion.div 
             animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
             transition={{ duration: 2, repeat: Infinity }}
             className="absolute inset-0 bg-vantage-cyan/5 rounded-full blur-2xl"
            />
          }

          {/* Central Progress */}
          <div className="flex flex-col items-center z-10 relative">
             <span className="text-6xl font-bold font-orbitron text-slate-800 dark:text-white tabular-nums tracking-tighter">
               {Math.floor(progress)}<span className="text-3xl text-vantage-cyan align-top">%</span>
             </span>
          </div>

          {/* Scanning Line Effect */}
          {
            // @ts-ignore
            <motion.div
            animate={{ top: ['0%', '100%', '0%'] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-vantage-cyan to-transparent shadow-[0_0_20px_rgba(34,211,238,0.8)] opacity-50"
            />
          }
       </div>

       {/* Animated Text Status */}
       <div className="h-32 w-full px-6 flex flex-col items-center justify-start space-y-4 shrink-0">
          <AnimatePresence mode="wait">
            {
                // @ts-ignore
                <motion.div 
                key={currentStage}
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 1.05 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center space-y-3"
                >
                <div className="p-3 bg-vantage-cyan/10 rounded-full text-vantage-cyan mb-1">
                    <CurrentIcon size={24} className={currentStage === stages.length - 1 ? "animate-bounce" : "animate-pulse"} />
                </div>
                <span className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-vantage-cyan to-vantage-purple font-orbitron tracking-wider uppercase text-center max-w-sm leading-relaxed">
                    {stages[currentStage].text}
                </span>
                
                {/* Additional helper text for the final stage */}
                {currentStage === stages.length - 1 && (
                    // @ts-ignore
                    <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-xs"
                    >
                    The system is finalizing the best combinations. Do not close the app.
                    </motion.p>
                )}
                </motion.div>
            }
          </AnimatePresence>
       </div>

       {/* Decorative Elements */}
       <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white dark:from-black/40 to-transparent pointer-events-none" />
       
       <div className="absolute bottom-12 left-0 right-0 flex justify-center space-x-2 opacity-10">
          {[...Array(10)].map((_, i) => (
             // @ts-ignore
             <motion.div 
               key={i}
               animate={{ height: [10, 30, 10], opacity: [0.2, 1, 0.2] }}
               transition={{ duration: 1 + Math.random(), repeat: Infinity, delay: Math.random() }}
               className="w-1 bg-vantage-cyan rounded-full"
             />
          ))}
       </div>
    </div>
  );
};