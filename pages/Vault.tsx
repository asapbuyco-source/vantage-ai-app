import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, TrendingUp, AlertTriangle, Info, Zap, ShieldCheck, Target, Briefcase } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { useAppContext } from '../context/AppContext';
import { useData } from '../context/DataContext';
import { NavigationTab, Match } from '../types';
import { useAuth } from '../context/AuthContext';

interface VaultProps {
    setTab: (tab: NavigationTab) => void;
}

const DAILY_ROI = 0.0079; // 0.79% per day roughly, or we use 7.9% per X bets. Let's assume 1% daily growth for the projection based on volume.
// If ROI is 7.9% and user bets 1-2% of bankroll... 
// The bot makes ~7.9% ROI per dollar wagered.

export const Vault: React.FC<VaultProps> = ({ setTab }) => {
    const { t, language } = useAppContext();
    const { predictions } = useData();
    const { userProfile } = useAuth();

    // Default to VIP check, though App.tsx might protect it. We show a lock if not VIP.
    const isVip = userProfile?.isVip;

    const [bankroll, setBankroll] = useState(() => {
        return localStorage.getItem('vantage_vault_bankroll') || '';
    });
    const [duration, setDuration] = useState(() => {
        return localStorage.getItem('vantage_vault_duration') || '30';
    });
    
    const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
    const [showPicker, setShowPicker] = useState(false);

    useEffect(() => {
        if (bankroll) localStorage.setItem('vantage_vault_bankroll', bankroll);
        if (duration) localStorage.setItem('vantage_vault_duration', duration);
    }, [bankroll, duration]);

    const parsedBankroll = parseFloat(bankroll) || 0;
    const parsedDuration = parseInt(duration) || 30;

    // Daily flat bet size (1% of current bankroll)
    const flatBetSize = parsedBankroll * 0.01;

    // Projection calculation: compounding daily.
    // If they bet 10% of bankroll per day across 5 matches, and ROI is 7.9%:
    // Daily return = 10% * 7.9% = 0.79% daily growth.
    const dailyGrowthRate = 0.0079; 
    
    const finalProjectedBankroll = parsedBankroll * Math.pow(1 + dailyGrowthRate, parsedDuration);
    const totalProfit = finalProjectedBankroll - parsedBankroll;

    const selectMatch = (match: Match) => {
        setSelectedMatch(match);
        setShowPicker(false);
    };

    if (!isVip) {
        return (
            <div className="space-y-5 pb-24 flex flex-col items-center justify-center pt-20">
                <ShieldCheck size={48} className="text-gray-400 mb-4" />
                <h1 className="text-2xl font-bold font-orbitron text-slate-900 dark:text-white">
                    ALPHA <span className="text-vantage-cyan">VAULT</span>
                </h1>
                <p className="text-gray-500 text-center max-w-xs mt-2">
                    {language === 'fr' 
                        ? 'La gestion de bankroll professionnelle est réservée aux abonnés VIP.' 
                        : 'Professional bankroll management is restricted to VIP subscribers.'}
                </p>
                <button 
                    onClick={() => setTab('vip')}
                    className="mt-6 px-6 py-3 bg-vantage-cyan text-slate-900 font-bold rounded-full hover:bg-cyan-400 transition"
                >
                    {language === 'fr' ? 'Devenir VIP' : 'Upgrade to VIP'}
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-5 pb-24">
            {/* Header */}
            <div className="flex items-center space-x-3">
                <button onClick={() => setTab('home')} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                    <ChevronLeft size={24} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold font-orbitron text-slate-900 dark:text-white">
                        ALPHA <span className="text-vantage-cyan">VAULT</span>
                    </h1>
                    <p className="text-xs text-gray-500">
                        {language === 'fr' ? 'Planificateur de Bankroll' : 'Bankroll Strategy Planner'}
                    </p>
                </div>
            </div>

            {/* Info Banner */}
            <GlassCard className="border-vantage-cyan/20 bg-vantage-cyan/5">
                <div className="flex gap-3 items-start">
                    <Briefcase size={16} className="text-vantage-cyan shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-400 leading-relaxed">
                        {language === 'fr'
                            ? 'Planifiez et projetez la croissance de votre bankroll en utilisant le ROI historique de 7,9 % de l\'IA.'
                            : 'Plan and project your bankroll growth using the AI\'s historic 7.9% ROI edge.'}
                    </p>
                </div>
            </GlassCard>

            {/* Inputs */}
            <GlassCard>
                <h3 className="text-sm font-bold mb-4 text-slate-900 dark:text-white">
                    {language === 'fr' ? 'Configuration' : 'Vault Setup'}
                </h3>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-gray-500 uppercase font-bold mb-1 block">
                            {language === 'fr' ? 'Capital de Départ (FCFA)' : 'Starting Bankroll (FCFA)'}
                        </label>
                        <input
                            type="number"
                            value={bankroll}
                            onChange={e => setBankroll(e.target.value)}
                            placeholder="ex: 100000"
                            className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-vantage-cyan/50 outline-none text-slate-900 dark:text-white"
                        />
                    </div>
                    
                    <div>
                        <label className="text-xs text-gray-500 uppercase font-bold mb-1 block">
                            {language === 'fr' ? 'Durée (Jours)' : 'Duration (Days)'}
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                            {[7, 14, 30, 90].map(days => (
                                <button
                                    key={days}
                                    onClick={() => setDuration(days.toString())}
                                    className={`py-2 rounded-xl text-xs font-bold transition-colors ${
                                        parsedDuration === days 
                                        ? 'bg-vantage-cyan text-slate-900' 
                                        : 'bg-slate-50 dark:bg-white/5 text-gray-500 hover:text-white'
                                    }`}
                                >
                                    {days} {language === 'fr' ? 'J' : 'D'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </GlassCard>

            {/* Daily Action Plan */}
            {parsedBankroll > 0 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <GlassCard className="border-green-500/30 bg-green-500/5">
                        <h3 className="text-sm font-bold mb-3 flex items-center gap-2 text-slate-900 dark:text-white">
                            <Target size={15} className="text-green-400" />
                            {language === 'fr' ? 'Plan d\'Action Quotidien' : 'Daily Action Plan'}
                        </h3>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                                <div>
                                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                                        {language === 'fr' ? 'Taille de Mise Sécurisée (1%)' : 'Safe Unit Size (1%)'}
                                    </p>
                                    <p className="text-[11px] text-gray-500">
                                        {language === 'fr' ? 'Misez ceci sur les matchs High Confidence' : 'Bet this on High Confidence matches'}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-lg font-black font-orbitron text-green-400">
                                        {Math.round(flatBetSize).toLocaleString()} F
                                    </p>
                                </div>
                            </div>
                            <p className="text-[10px] text-gray-500 mt-2">
                                * {language === 'fr' 
                                    ? 'Ne misez jamais plus de 10 à 15 % de votre capital total en une seule journée pour éviter la ruine.' 
                                    : 'Never risk more than 10-15% of your total bankroll in a single day to prevent ruin.'}
                            </p>
                        </div>
                    </GlassCard>
                </motion.div>
            )}

            {/* AI Match Kelly Integration */}
            {parsedBankroll > 0 && predictions.length > 0 && (
                <GlassCard>
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2 text-slate-900 dark:text-white">
                        <Zap size={15} className="text-vantage-cyan" />
                        {language === 'fr' ? 'Taille de Mise Kelly' : 'Kelly Sizing Sizing'}
                    </h3>
                    <p className="text-xs text-gray-500 mb-3">
                        {language === 'fr' 
                            ? 'Calculez la mise exacte du Quart de Kelly pour un match spécifique.' 
                            : 'Calculate exact Quarter-Kelly stake for a specific match.'}
                    </p>
                    <button
                        onClick={() => setShowPicker(v => !v)}
                        className="w-full text-left p-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm flex justify-between items-center"
                    >
                        <span className={selectedMatch ? 'text-slate-900 dark:text-white font-medium' : 'text-gray-500'}>
                            {selectedMatch
                                ? `${selectedMatch.homeTeam} vs ${selectedMatch.awayTeam}`
                                : (language === 'fr' ? 'Sélectionner un match...' : 'Select a match...')}
                        </span>
                        <ChevronLeft className={`transition-transform ${showPicker ? '-rotate-90' : 'rotate-180'}`} size={16} />
                    </button>
                    {showPicker && (
                        <div className="mt-2 max-h-48 overflow-y-auto space-y-1 custom-scrollbar">
                            {predictions.map(m => (
                                <button
                                    key={m.id}
                                    onClick={() => selectMatch(m)}
                                    className="w-full text-left p-2.5 rounded-xl hover:bg-white/10 border border-transparent hover:border-white/10 transition-all"
                                >
                                    <span className="text-xs font-bold text-slate-900 dark:text-white block">{m.homeTeam} vs {m.awayTeam}</span>
                                    <span className="text-[11px] text-gray-400">{m.prediction} · @{m.odds} · {m.confidence}%</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {selectedMatch && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 p-4 rounded-xl bg-vantage-cyan/10 border border-vantage-cyan/20">
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="text-xs font-bold text-vantage-cyan uppercase">
                                        {language === 'fr' ? 'Quart de Kelly Recommandé' : 'Recommended Quarter-Kelly'}
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        {selectedMatch.homeTeam} vs {selectedMatch.awayTeam}
                                    </p>
                                </div>
                                <div className="text-right">
                                    {(() => {
                                        const parsedOdds = Math.max(1.01, selectedMatch.odds);
                                        const parsedProb = Math.min(0.99, Math.max(0.01, selectedMatch.confidence / 100));
                                        const b = parsedOdds - 1;
                                        const k = (b * parsedProb - (1 - parsedProb)) / b;
                                        const qk = Math.max(0, k * 0.25);
                                        
                                        if (qk <= 0) return <span className="text-sm font-bold text-red-400">NO BET (Negative EV)</span>;
                                        
                                        return (
                                            <p className="text-xl font-black font-orbitron text-white">
                                                {Math.round(parsedBankroll * qk).toLocaleString()} F
                                            </p>
                                        );
                                    })()}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </GlassCard>
            )}

            {/* Projection Chart / Summary */}
            {parsedBankroll > 0 && (
                <GlassCard className="mb-8">
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2 text-slate-900 dark:text-white">
                        <TrendingUp size={15} className="text-vantage-cyan" />
                        {language === 'fr' ? `Projection sur ${parsedDuration} Jours` : `${parsedDuration}-Day Projection`}
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
                            <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">
                                {language === 'fr' ? 'Capital Final' : 'Final Bankroll'}
                            </p>
                            <p className="text-lg font-black font-orbitron text-vantage-cyan">
                                {Math.round(finalProjectedBankroll).toLocaleString()} F
                            </p>
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
                            <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">
                                {language === 'fr' ? 'Profit Estimé' : 'Est. Profit'}
                            </p>
                            <p className="text-lg font-black font-orbitron text-green-400">
                                +{Math.round(totalProfit).toLocaleString()} F
                            </p>
                        </div>
                    </div>
                    
                    <p className="text-[10px] text-gray-500">
                        * {language === 'fr' 
                            ? 'Basé sur un ROI historique de 7,9 % sur plus de 1000 pronostics de l\'IA. Les performances passées ne garantissent pas les résultats futurs.' 
                            : 'Based on a historical 7.9% ROI over 1,000+ AI predictions. Past performance does not guarantee future results.'}
                    </p>
                </GlassCard>
            )}
        </div>
    );
};
