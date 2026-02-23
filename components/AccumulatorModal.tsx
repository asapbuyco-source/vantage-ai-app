import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShieldCheck, Zap, Flame, TrendingUp, Copy, Check } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAppContext } from '../context/AppContext';
import { TeamLogo } from './TeamLogo';

interface AccumulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRisk?: 'low' | 'medium' | 'high';
}

type RiskLevel = 'low' | 'medium' | 'high';

export const AccumulatorModal: React.FC<AccumulatorModalProps> = ({ isOpen, onClose, initialRisk = 'medium' }) => {
  const [risk, setRisk] = useState<RiskLevel>(initialRisk);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { predictions, accumulators } = useData(); // Consume accumulators from context
  const { language } = useAppContext();
  
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && initialRisk) {
      setRisk(initialRisk);
    }
  }, [isOpen, initialRisk]);

  // Scroll list to top when tab changes
  useEffect(() => {
    if (listRef.current) {
        listRef.current.scrollTop = 0;
    }
  }, [risk]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const accumulatorData = useMemo(() => {
    const getPred = (m: any) => {
        if (language === 'fr') return m.prediction_fr || m.prediction;
        return m.prediction_en || m.prediction;
    };

    // Helper to format match for display
    const formatMatch = (m: any) => ({
      id: m.id,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      homeLogo: m.homeTeamLogo,
      awayLogo: m.awayTeamLogo,
      prediction: getPred(m),
      odds: m.odds
    });

    // Helper to calculate total odds
    const calcTotal = (matches: any[]) => matches.reduce((acc, m) => acc * m.odds, 1);

    // -------------------------------------------------------------------------
    // STRATEGY 1: USE DB/CONTEXT ACCUMULATORS
    // -------------------------------------------------------------------------
    let lowMatches: any[] = [];
    let mediumMatches: any[] = [];
    let highMatches: any[] = [];
    let usingAiLogic = false;

    if (accumulators) {
        // Helper to hydrate match IDs back to full match objects
        const hydrate = (ids: string[]) => {
            if (!ids || !Array.isArray(ids)) return [];
            return ids
                .map(id => predictions.find(p => p.id === id))
                .filter(Boolean)
                .map(formatMatch);
        };

        lowMatches = hydrate(accumulators.safe);
        mediumMatches = hydrate(accumulators.medium);
        highMatches = hydrate(accumulators.high);

        // If we successfully hydrated matches, flag as using AI logic
        if (lowMatches.length > 0 || mediumMatches.length > 0 || highMatches.length > 0) {
            usingAiLogic = true;
        }
    }

    // -------------------------------------------------------------------------
    // STRATEGY 2: FALLBACK ALGORITHM (If AI logic failed or no data)
    // -------------------------------------------------------------------------
    if (!usingAiLogic) {
        // 1. Deduplicate
        const uniquePredictions = predictions.filter((match, index, self) =>
            index === self.findIndex((m) => (
                m.homeTeam === match.homeTeam && m.awayTeam === match.awayTeam
            ))
        );

        // 2. Sort by confidence
        const sortedByConf = [...uniquePredictions].sort((a, b) => b.confidence - a.confidence);

        // 3. Mutually Exclusive Categorization
        const usedIds = new Set<string>();

        lowMatches = sortedByConf.filter(m => {
            const isEligible = m.category === 'safe' || m.odds < 1.60;
            if (isEligible && !usedIds.has(m.id)) {
                usedIds.add(m.id);
                return true;
            }
            return false;
        }).slice(0, 3).map(formatMatch);

        mediumMatches = sortedByConf.filter(m => {
            const isEligible = m.category === 'value' || (m.odds >= 1.60 && m.odds < 2.40);
            if (isEligible && !usedIds.has(m.id)) {
                usedIds.add(m.id);
                return true;
            }
            return false;
        }).slice(0, 4).map(formatMatch);

        highMatches = sortedByConf.filter(m => {
            const isEligible = m.category === 'risky' || m.odds >= 2.40;
            if (isEligible && !usedIds.has(m.id)) {
                usedIds.add(m.id);
                return true;
            }
            return false;
        }).slice(0, 5).map(formatMatch);
        
        // Fill gaps if strictly categorical filtering yielded too few
        const remainingMatches = sortedByConf
            .filter(m => !usedIds.has(m.id))
            .sort((a, b) => a.odds - b.odds);

        if (lowMatches.length < 2) lowMatches = [...lowMatches, ...remainingMatches.splice(0, 3 - lowMatches.length).map(formatMatch)];
        if (mediumMatches.length < 2) mediumMatches = [...mediumMatches, ...remainingMatches.splice(0, 4 - mediumMatches.length).map(formatMatch)];
        if (highMatches.length < 2) highMatches = [...highMatches, ...remainingMatches.splice(-(5 - highMatches.length)).map(formatMatch)];
    }

    return {
      low: {
        label: language === 'fr' ? 'Prudent' : 'Safe',
        icon: ShieldCheck,
        color: 'text-green-500',
        matches: lowMatches,
        totalOdds: calcTotal(lowMatches)
      },
      medium: {
        label: language === 'fr' ? 'Modéré' : 'Balanced',
        icon: Zap,
        color: 'text-vantage-cyan',
        matches: mediumMatches,
        totalOdds: calcTotal(mediumMatches)
      },
      high: {
        label: language === 'fr' ? 'Risqué' : 'High Risk',
        icon: Flame,
        color: 'text-orange-500',
        matches: highMatches,
        totalOdds: calcTotal(highMatches)
      },
      isAiGenerated: usingAiLogic
    };
  }, [predictions, accumulators, language]);

  const currentData = accumulatorData[risk];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {
            // @ts-ignore
            <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-md"
            />
          }

          <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-10 pointer-events-none">
            {
                // @ts-ignore
                <motion.div
                initial={{ scale: 0.9, opacity: 0, y: -20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: -20 }}
                className="w-full max-w-sm pointer-events-auto bg-white/90 dark:bg-vantage-bg/95 border border-white/20 dark:border-white/10 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-xl flex flex-col max-h-[85dvh]"
                >
                <div className="flex justify-between items-center p-5 border-b border-slate-200 dark:border-white/5 shrink-0">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl font-bold font-orbitron text-slate-900 dark:text-white">{language === 'fr' ? 'Accumulateur' : 'Accumulator'}</h2>
                            {accumulatorData.isAiGenerated && (
                                <span className="px-2 py-0.5 bg-vantage-purple/20 text-vantage-purple text-[10px] font-bold rounded border border-vantage-purple/30 animate-pulse">
                                    AI GEN
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            {language === 'fr' ? 'Générateur intelligent (Sans Doublons)' : 'Smart Generator (No Duplicates)'}
                        </p>
                    </div>
                    <button 
                    onClick={onClose}
                    className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                    >
                    <X size={20} className="text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                <div className="px-5 pt-4 shrink-0">
                    <div className="flex bg-slate-100 dark:bg-black/40 p-1 rounded-xl">
                    {(['low', 'medium', 'high'] as RiskLevel[]).map((level) => {
                        const isActive = risk === level;
                        const ItemIcon = accumulatorData[level].icon;
                        return (
                        <button
                            key={level}
                            onClick={() => setRisk(level)}
                            className={`flex-1 flex items-center justify-center py-2.5 rounded-lg text-xs font-bold transition-all duration-300 space-x-1
                            ${isActive 
                                ? 'bg-white dark:bg-white/10 shadow-sm text-slate-900 dark:text-white' 
                                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}
                            `}
                        >
                            <ItemIcon size={14} className={isActive ? accumulatorData[level].color : ''} />
                            <span>{accumulatorData[level].label}</span>
                        </button>
                        );
                    })}
                    </div>
                </div>

                <div ref={listRef} className="p-5 space-y-3 overflow-y-auto flex-1 custom-scrollbar scroll-smooth">
                    {currentData.matches.length > 0 ? (
                        currentData.matches.map((match: any, idx: number) => (
                            // @ts-ignore
                            <motion.div 
                            key={match.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="flex justify-between items-center p-3 rounded-xl border bg-slate-50/50 dark:bg-white/5 border-slate-200 dark:border-white/5 hover:border-vantage-cyan/30 transition-colors group"
                            >
                            <div className="flex flex-col flex-1 mr-2 min-w-0">
                                <div className="flex items-center space-x-2">
                                    <div className="flex -space-x-1.5 shrink-0">
                                        <TeamLogo src={match.homeLogo} teamName={match.homeTeam} className="w-5 h-5 rounded-full border border-white dark:border-slate-800 bg-slate-200" />
                                        <TeamLogo src={match.awayLogo} teamName={match.awayTeam} className="w-5 h-5 rounded-full border border-white dark:border-slate-800 bg-slate-200" />
                                    </div>
                                    <span className="text-xs font-bold text-slate-700 dark:text-gray-300 truncate">{match.homeTeam} vs {match.awayTeam}</span>
                                </div>
                                <div className="flex items-center space-x-2 mt-1 pl-0.5">
                                    <TrendingUp size={10} className={currentData.color} />
                                    <span className={`text-[10px] font-bold ${currentData.color} truncate`}>{match.prediction}</span>
                                    <button 
                                    onClick={() => handleCopy(`${match.homeTeam} vs ${match.awayTeam}`, match.id)}
                                    className="ml-auto p-1 rounded bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-gray-500 dark:text-gray-400"
                                    >
                                    {copiedId === match.id ? <Check size={10} className="text-green-500"/> : <Copy size={10} />}
                                    </button>
                                </div>
                            </div>
                            <div className="px-2 py-1 bg-white dark:bg-black/30 rounded-lg border border-slate-200 dark:border-white/5 shrink-0">
                                <span className="text-xs font-bold font-orbitron text-slate-900 dark:text-white">{match.odds.toFixed(2)}</span>
                            </div>
                            </motion.div>
                        ))
                    ) : (
                        <div className="text-center py-10 text-gray-400 text-xs">
                            {language === 'fr' ? 'Aucun match disponible.' : 'No matches available.'}
                        </div>
                    )}
                </div>

                <div className="p-5 border-t border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-black/20 shrink-0">
                    <div className="flex justify-between items-end mb-4">
                        <div className="text-gray-500 text-xs uppercase tracking-wider font-bold">{language === 'fr' ? 'Cote Totale' : 'Total Odds'}</div>
                        <div className={`text-3xl font-bold font-orbitron ${currentData.color}`}>
                        {currentData.totalOdds.toFixed(2)}
                        </div>
                    </div>
                    
                    <button 
                        onClick={onClose}
                        className="w-full py-3.5 rounded-xl font-bold text-slate-700 dark:text-white bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 shadow-lg flex items-center justify-center space-x-2 transition-all active:scale-95"
                    >
                        <span>{language === 'fr' ? 'Fermer' : 'Close'}</span>
                    </button>
                </div>
                </motion.div>
            }
          </div>
        </>
      )}
    </AnimatePresence>
  );
};