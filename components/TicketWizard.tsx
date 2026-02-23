import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Sparkles, TrendingUp, Target, ShieldCheck,
    Flame, RefreshCw, Check, ChevronRight,
    Wallet, DollarSign, Wand2, Info
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useData } from '../context/DataContext';
import { GlassCard } from './GlassCard';
import { TeamLogo } from './TeamLogo';
import { Match } from '../types';

export const TicketWizard: React.FC = () => {
    const { t } = useAppContext();
    const { predictions, basketballPredictions, toggleSavedPick, isPickSaved } = useData();

    const [step, setStep] = useState(1);
    const [stake, setStake] = useState<string>('1000');
    const [goal, setGoal] = useState<string>('5000');
    const [risk, setRisk] = useState<'low' | 'med' | 'high'>('med');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedTicket, setGeneratedTicket] = useState<Match[] | null>(null);

    const allMatches = useMemo(() => [...predictions, ...basketballPredictions], [predictions, basketballPredictions]);

    const generateTicket = () => {
        setIsGenerating(true);
        setGeneratedTicket(null);

        // Simulate AI "thinking"
        setTimeout(() => {
            const targetOdds = parseFloat(goal) / parseFloat(stake);
            const ticket = findBestCombination(allMatches, targetOdds, risk);
            setGeneratedTicket(ticket);
            setIsGenerating(false);
            setStep(3);
        }, 1500);
    };

    const findBestCombination = (matches: Match[], target: number, riskLevel: 'low' | 'med' | 'high'): Match[] | null => {
        if (matches.length === 0) return null;

        // Filter by risk
        let pool = matches.filter(m => {
            if (riskLevel === 'low') return m.confidence >= 80;
            if (riskLevel === 'med') return m.confidence >= 70;
            return true; // aggressive uses all
        });

        if (pool.length === 0) pool = matches; // Fallback if too restrictive

        // Simplified greedy algorithm to find combinations
        // We want matching odds product to be close to 'target'
        let bestTicket: Match[] = [];
        let currentOdds = 1;

        // Shuffle pool for variety
        const shuffled = [...pool].sort(() => Math.random() - 0.5);

        for (const match of shuffled) {
            if (currentOdds * match.odds <= target * 1.2) { // 20% margin
                bestTicket.push(match);
                currentOdds *= match.odds;

                if (currentOdds >= target * 0.9) break; // Close enough
            }
            if (bestTicket.length >= 5) break; // Limit to 5 matches Max for "Smart" feel
        }

        return bestTicket.length > 0 ? bestTicket : null;
    };

    const totalOdds = generatedTicket?.reduce((acc, m) => acc * m.odds, 1) || 0;
    const potentialPayout = totalOdds * parseFloat(stake);

    return (
        <div className="pb-24 pt-4 px-4 max-w-lg mx-auto">
            {/* Header */}
            <div className="mb-6 text-center">
                <h1 className="text-2xl font-black font-orbitron text-slate-900 dark:text-white flex items-center justify-center gap-2">
                    {t.concierge.title} <span className="text-vantage-purple">{t.concierge.title_accent}</span>
                </h1>
                <p className="text-gray-500 text-sm">{t.concierge.subtitle}</p>
            </div>

            <div className="flex justify-between mb-8 px-4">
                {[1, 2, 3].map((s) => (
                    <div key={s} className="flex flex-col items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step >= s ? 'bg-vantage-purple text-white shadow-lg shadow-vantage-purple/30' : 'bg-slate-200 dark:bg-white/10 text-gray-400'
                            }`}>
                            {step > s ? <Check size={16} /> : s}
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${step >= s ? 'text-vantage-purple' : 'text-gray-400'}`}>
                            {t.concierge[`step_${s}`]}
                        </span>
                    </div>
                ))}
            </div>

            <AnimatePresence mode="wait">
                {step === 1 && (
                    <motion.div
                        key="step1"
                        initial={{ x: 20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -20, opacity: 0 }}
                        className="space-y-6"
                    >
                        <GlassCard className="p-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
                                    <Wallet size={14} className="text-vantage-purple" /> {t.concierge.stake_label}
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={stake}
                                        onChange={(e) => setStake(e.target.value)}
                                        className="w-full bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl py-3 px-4 font-orbitron font-bold text-lg text-vantage-purple focus:outline-none focus:ring-2 focus:ring-vantage-purple/50"
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">FCFA</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
                                    <Target size={14} className="text-vantage-cyan" /> {t.concierge.goal_label}
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        value={goal}
                                        onChange={(e) => setGoal(e.target.value)}
                                        className="w-full bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl py-3 px-4 font-orbitron font-bold text-lg text-vantage-cyan focus:outline-none focus:ring-2 focus:ring-vantage-cyan/50"
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">FCFA</span>
                                </div>
                            </div>

                            <div className="pt-2">
                                <div className="p-3 bg-vantage-purple/5 border border-vantage-purple/10 rounded-lg flex items-start gap-3">
                                    <Info size={16} className="text-vantage-purple shrink-0 mt-0.5" />
                                    <p className="text-[11px] text-gray-500 italic">
                                        L'IA analysera les cotes disponibles pour atteindre votre objectif de <span className="text-vantage-purple font-bold">{goal} FCFA</span> avec une mise de <span className="text-vantage-purple font-bold">{stake} FCFA</span>.
                                    </p>
                                </div>
                            </div>
                        </GlassCard>

                        <button
                            onClick={() => setStep(2)}
                            className="w-full py-4 bg-vantage-purple hover:bg-purple-600 text-white font-bold rounded-2xl shadow-xl shadow-vantage-purple/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                        >
                            <span>{t.home.performance}</span>
                            <ChevronRight size={20} />
                        </button>
                    </motion.div>
                )}

                {step === 2 && (
                    <motion.div
                        key="step2"
                        initial={{ x: 20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -20, opacity: 0 }}
                        className="space-y-6"
                    >
                        <div className="space-y-3">
                            {[
                                { id: 'low', label: t.concierge.risk_low, icon: ShieldCheck, color: 'text-green-500', bg: 'bg-green-500/10', border: 'border-green-500/20' },
                                { id: 'med', label: t.concierge.risk_med, icon: TrendingUp, color: 'text-vantage-cyan', bg: 'bg-vantage-cyan/10', border: 'border-vantage-cyan/20' },
                                { id: 'high', label: t.concierge.risk_high, icon: Flame, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
                            ].map((r) => (
                                <button
                                    key={r.id}
                                    onClick={() => setRisk(r.id as any)}
                                    className={`w-full p-6 rounded-2xl border-2 transition-all flex items-center gap-4 ${risk === r.id
                                            ? `${r.border} ${r.bg} shadow-lg scale-[1.02]`
                                            : 'border-slate-100 dark:border-white/5 bg-white dark:bg-white/5 grayscale'
                                        }`}
                                >
                                    <div className={`p-3 rounded-xl ${r.bg} ${r.color}`}>
                                        <r.icon size={24} />
                                    </div>
                                    <div className="text-left">
                                        <span className={`block font-bold ${risk === r.id ? 'text-slate-900 dark:text-white' : 'text-gray-400'}`}>
                                            {r.label}
                                        </span>
                                        <span className="text-[10px] text-gray-500 uppercase tracking-tighter">
                                            {r.id === 'low' ? 'Confiance > 80%' : (r.id === 'med' ? 'Optimisé pour le profit' : 'Priorité aux grosses cotes')}
                                        </span>
                                    </div>
                                    {risk === r.id && <div className={`ml-auto w-6 h-6 rounded-full ${r.bg} ${r.color} flex items-center justify-center`}><Check size={14} /></div>}
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-4">
                            <button
                                onClick={() => setStep(1)}
                                className="flex-1 py-4 bg-slate-100 dark:bg-white/5 text-gray-500 font-bold rounded-2xl border border-slate-200 dark:border-white/10 transition-all active:scale-[0.98]"
                            >
                                Retour
                            </button>
                            <button
                                onClick={generateTicket}
                                disabled={isGenerating}
                                className="flex-[2] py-4 bg-vantage-purple hover:bg-purple-600 text-white font-bold rounded-2xl shadow-xl shadow-vantage-purple/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                            >
                                {isGenerating ? <RefreshCw className="animate-spin" size={20} /> : <Wand2 size={20} />}
                                <span>{t.concierge.generate_btn}</span>
                            </button>
                        </div>
                    </motion.div>
                )}

                {step === 3 && (
                    <motion.div
                        key="step3"
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="space-y-6"
                    >
                        {generatedTicket ? (
                            <div className="space-y-4">
                                <GlassCard className="overflow-hidden border-2 border-vantage-purple/30">
                                    <div className="bg-vantage-purple p-4 flex justify-between items-center text-white">
                                        <div>
                                            <p className="text-[10px] uppercase font-bold opacity-80">{t.concierge.total_odds}</p>
                                            <p className="text-2xl font-black font-orbitron">{totalOdds.toFixed(2)}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] uppercase font-bold opacity-80">{t.concierge.potential_win}</p>
                                            <p className="text-2xl font-black font-orbitron text-vantage-cyan">{potentialPayout.toLocaleString()} F</p>
                                        </div>
                                    </div>

                                    <div className="p-4 space-y-3">
                                        {generatedTicket.map((match) => (
                                            <div key={match.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-100 dark:border-white/5">
                                                <div className="flex -space-x-2 shrink-0">
                                                    <TeamLogo src={match.homeTeamLogo} teamName={match.homeTeam} className="w-8 h-8 rounded-full border-2 border-white dark:border-vantage-bg shadow-sm" />
                                                    <TeamLogo src={match.awayTeamLogo} teamName={match.awayTeam} className="w-8 h-8 rounded-full border-2 border-white dark:border-vantage-bg shadow-sm" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[10px] text-gray-400 font-bold truncate uppercase tracking-tighter">{match.league}</p>
                                                    <p className="text-xs font-bold text-slate-800 dark:text-white truncate">
                                                        {match.homeTeam} v {match.awayTeam}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[10px] font-black text-vantage-purple uppercase">{match.prediction}</span>
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-gray-500 font-bold">@{match.odds.toFixed(2)}</span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => toggleSavedPick({
                                                        id: match.id,
                                                        homeTeam: match.homeTeam,
                                                        awayTeam: match.awayTeam,
                                                        prediction: match.prediction,
                                                        confidence: match.confidence,
                                                        odds: match.odds,
                                                        league: match.league,
                                                        homeTeamLogo: match.homeTeamLogo,
                                                        awayTeamLogo: match.awayTeamLogo,
                                                        sport: match.sport,
                                                        savedAt: new Date().toISOString()
                                                    })}
                                                    className={`p-2 rounded-lg transition-all ${isPickSaved(match.id)
                                                            ? 'bg-vantage-purple text-white shadow-lg'
                                                            : 'bg-slate-100 dark:bg-white/5 text-gray-400 hover:text-vantage-purple'
                                                        }`}
                                                >
                                                    <Check size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="p-4 bg-slate-50 dark:bg-white/5 border-t border-slate-100 dark:border-white/5">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-gray-500 italic">Mise recommandée: {stake} FCFA</span>
                                            <div className="flex items-center gap-1 text-vantage-purple">
                                                <Sparkles size={12} />
                                                <span className="font-bold">Analysé par Vantage AI</span>
                                            </div>
                                        </div>
                                    </div>
                                </GlassCard>

                                <button
                                    onClick={() => setStep(1)}
                                    className="w-full py-4 bg-slate-100 dark:bg-white/5 text-gray-500 hover:text-vantage-purple font-bold rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] border border-slate-200 dark:border-white/10"
                                >
                                    <RefreshCw size={18} />
                                    <span>{t.concierge.regenerate_btn}</span>
                                </button>
                            </div>
                        ) : (
                            <div className="text-center py-12 px-6">
                                <div className="w-20 h-20 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                                    <Target size={40} />
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{t.concierge.no_matches}</h3>
                                <button
                                    onClick={() => setStep(1)}
                                    className="px-8 py-3 bg-vantage-purple text-white font-bold rounded-xl shadow-lg"
                                >
                                    {t.concierge.regenerate_btn}
                                </button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
