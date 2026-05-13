import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Calculator, ChevronLeft, TrendingUp, TrendingDown, AlertTriangle, Info, Zap } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { useAppContext } from '../context/AppContext';
import { useData } from '../context/DataContext';
import { NavigationTab, Match } from '../types';

interface KellyProps {
    setTab: (tab: NavigationTab) => void;
}

const critRisk = (k: number) => {
    if (k >= 0.25) return { label: 'Aggressive 🔴', color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/30' };
    if (k >= 0.12) return { label: 'Moderate 🟡', color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/30' };
    return { label: 'Conservative 🟢', color: 'text-green-400', bg: 'bg-green-400/10 border-green-400/30' };
};

export const Kelly: React.FC<KellyProps> = ({ setTab }) => {
    const { t, language } = useAppContext();
    const { predictions } = useData();

    const [bankroll, setBankroll] = useState('');
    const [odds, setOdds] = useState('');
    const [prob, setProb] = useState('');
    const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
    const [showPicker, setShowPicker] = useState(false);

    const parsedBankroll = parseFloat(bankroll) || 0;
    const parsedOdds = parseFloat(odds) || 0;
    const parsedProb = parseFloat(prob) / 100 || 0;

    const kelly = useMemo(() => {
        if (parsedOdds <= 1.01 || parsedProb <= 0 || parsedProb >= 1) return null;
        const clampedOdds = Math.max(1.01, parsedOdds);
        const clampedProb = Math.min(0.99, Math.max(0.01, parsedProb));
        const b = clampedOdds - 1;
        const k = (b * clampedProb - (1 - clampedProb)) / b;
        return Math.max(0, k);
    }, [parsedOdds, parsedProb]);

    const selectMatch = (match: Match) => {
        setSelectedMatch(match);
        setOdds(String(match.odds));
        setProb(String(match.confidence));
        setShowPicker(false);
    };

    const fractions = kelly !== null
        ? [
            { label: language === 'fr' ? 'Kelly Complet' : 'Full Kelly', mult: 1 },
            { label: language === 'fr' ? 'Demi Kelly' : 'Half Kelly', mult: 0.5 },
            { label: language === 'fr' ? 'Quart Kelly' : 'Quarter Kelly', mult: 0.25 },
        ].map(f => ({
            ...f,
            pct: (kelly * f.mult * 100).toFixed(1),
            amount: Math.round(parsedBankroll * kelly * f.mult),
            profit: Math.round(parsedBankroll * kelly * f.mult * (parsedOdds - 1)),
        }))
        : [];

    // 7-day compounding projection
    const projections = kelly !== null && parsedBankroll > 0
        ? Array.from({ length: 7 }, (_, i) => {
            const stake = parsedBankroll * kelly * 0.5;
            const profit = stake * (parsedOdds - 1);
            const dayBankroll = parsedBankroll * Math.pow(1 + kelly * 0.5 * (parsedProb * parsedOdds - 1), i + 1);
            return { day: i + 1, bankroll: Math.round(dayBankroll), profit: Math.round(profit) };
        })
        : [];

    const risk = kelly !== null ? critRisk(kelly) : null;
    const isNegativeEV = parsedProb > 0 && parsedOdds > 1 && kelly !== null && kelly <= 0;

    return (
        <div className="space-y-5 pb-24">
            {/* Header */}
            <div className="flex items-center space-x-3">
                <button onClick={() => setTab('home')} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                    <ChevronLeft size={24} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold font-orbitron text-slate-900 dark:text-white">
                        KELLY <span className="text-vantage-cyan">CALC</span>
                    </h1>
                    <p className="text-xs text-gray-500">Bankroll Management Tool</p>
                </div>
            </div>

            {/* Info Banner */}
            <GlassCard className="border-vantage-cyan/20 bg-vantage-cyan/5">
                <div className="flex gap-3 items-start">
                    <Info size={16} className="text-vantage-cyan shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-400 leading-relaxed">
                        {language === 'fr'
                            ? 'Le critère de Kelly calcule le % optimal de votre bankroll à miser pour maximiser la croissance à long terme.'
                            : 'The Kelly Criterion calculates the optimal % of your bankroll to stake to maximize long-term growth.'}
                    </p>
                </div>
            </GlassCard>

            {/* Quick Pick from Predictions */}
            {predictions.length > 0 && (
                <GlassCard>
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2 text-slate-900 dark:text-white">
                        <Zap size={15} className="text-vantage-cyan" />
                        {language === 'fr' ? 'Choisir un match d\'aujourd\'hui' : 'Pick from Today\'s Matches'}
                    </h3>
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
                                    <span className="text-xs font-bold text-white block">{m.homeTeam} vs {m.awayTeam}</span>
                                    <span className="text-[11px] text-gray-400">{m.prediction} · @{m.odds} · {m.confidence}%</span>
                                </button>
                            ))}
                        </div>
                    )}
                </GlassCard>
            )}

            {/* Inputs */}
            <GlassCard>
                <h3 className="text-sm font-bold mb-4 text-slate-900 dark:text-white">
                    {language === 'fr' ? 'Paramètres' : 'Parameters'}
                </h3>
                <div className="space-y-3">
                    {/* Bankroll */}
                    <div>
                        <label className="text-xs text-gray-500 uppercase font-bold mb-1 block">
                            {language === 'fr' ? 'Bankroll (FCFA)' : 'Bankroll (FCFA)'}
                        </label>
                        <input
                            type="number"
                            value={bankroll}
                            onChange={e => setBankroll(e.target.value)}
                            placeholder="ex: 50000"
                            className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-vantage-cyan/50 outline-none text-slate-900 dark:text-white"
                        />
                    </div>
                    {/* Odds & Prob in 2 cols */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-gray-500 uppercase font-bold mb-1 block">
                                {language === 'fr' ? 'Cote Décimale' : 'Decimal Odds'}
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                min="1.01"
                                value={odds}
                                onChange={e => setOdds(e.target.value)}
                                placeholder="ex: 1.85"
                                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-vantage-cyan/50 outline-none text-slate-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 uppercase font-bold mb-1 block">
                                {language === 'fr' ? 'Prob. Victoire (%)' : 'Win Probability (%)'}
                            </label>
                            <input
                                type="number"
                                min="1"
                                max="99"
                                value={prob}
                                onChange={e => setProb(e.target.value)}
                                placeholder="ex: 65"
                                className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-vantage-cyan/50 outline-none text-slate-900 dark:text-white"
                            />
                        </div>
                    </div>
                </div>
            </GlassCard>

            {/* Results */}
            {kelly !== null && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                >
                    {/* Negative EV Warning */}
                    {isNegativeEV && (
                        <GlassCard className="border-red-500/30 bg-red-500/5">
                            <div className="flex gap-2 items-center">
                                <AlertTriangle size={18} className="text-red-400" />
                                <p className="text-sm font-bold text-red-400">
                                    {language === 'fr' ? 'Valeur espérée négative — NE PAS miser.' : 'Negative Expected Value — DO NOT bet.'}
                                </p>
                            </div>
                        </GlassCard>
                    )}

                    {!isNegativeEV && (
                        <>
                            {/* Risk Level */}
                            <GlassCard className={risk!.bg}>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                                        {language === 'fr' ? 'Niveau de Risque' : 'Risk Level'}
                                    </span>
                                    <span className={`font-bold ${risk!.color}`}>{risk!.label}</span>
                                </div>
                            </GlassCard>

                            {/* Fraction Table */}
                            <GlassCard>
                                <h3 className="text-sm font-bold mb-3 text-slate-900 dark:text-white">
                                    {language === 'fr' ? 'Mises Recommandées' : 'Recommended Stakes'}
                                </h3>
                                <div className="space-y-2">
                                    {fractions.map((f, i) => (
                                        <div
                                            key={f.label}
                                            className={`flex items-center justify-between p-3 rounded-xl border ${i === 1 ? 'bg-vantage-cyan/10 border-vantage-cyan/30' : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10'}`}
                                        >
                                            <div>
                                                <p className={`text-xs font-bold ${i === 1 ? 'text-vantage-cyan' : 'text-slate-900 dark:text-white'}`}>
                                                    {f.label} {i === 1 && '⭐'}
                                                </p>
                                                <p className="text-[11px] text-gray-500">{f.pct}% de la bankroll</p>
                                            </div>
                                            <div className="text-right">
                                                <p className={`text-base font-black font-orbitron ${i === 1 ? 'text-vantage-cyan' : 'text-slate-900 dark:text-white'}`}>
                                                    {f.amount.toLocaleString()} F
                                                </p>
                                                <p className="text-[11px] text-green-400">+{f.profit.toLocaleString()} F</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </GlassCard>

                            {/* 7-Day Projection */}
                            <GlassCard>
                                <h3 className="text-sm font-bold mb-3 flex items-center gap-2 text-slate-900 dark:text-white">
                                    <TrendingUp size={15} className="text-green-400" />
                                    {language === 'fr' ? 'Projection 7 Jours (½ Kelly)' : '7-Day Projection (½ Kelly)'}
                                </h3>
                                <div className="space-y-1.5">
                                    {projections.map((p) => (
                                        <div key={p.day} className="flex items-center gap-3">
                                            <span className="text-xs text-gray-500 w-10 shrink-0">
                                                {language === 'fr' ? `J${p.day}` : `Day ${p.day}`}
                                            </span>
                                            {/* Progress bar */}
                                            <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-gradient-to-r from-vantage-cyan to-vantage-purple transition-all"
                                                    style={{ width: `${Math.min(100, (p.bankroll / (parsedBankroll * 2)) * 100)}%` }}
                                                />
                                            </div>
                                            <span className="text-xs font-bold text-right w-24 shrink-0 text-vantage-cyan font-orbitron">
                                                {p.bankroll.toLocaleString()} F
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[10px] text-gray-600 mt-3">
                                    {language === 'fr'
                                        ? '* Projection théorique si chaque pari est gagnant. Le trading sportif comporte des risques.'
                                        : '* Theoretical projection if every bet wins. Sports betting involves risk.'}
                                </p>
                            </GlassCard>
                        </>
                    )}
                </motion.div>
            )}
        </div>
    );
};
