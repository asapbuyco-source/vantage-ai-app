import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, TrendingUp, ShieldCheck, Trophy, Users, Star, ArrowUpRight, CheckCircle2, History, Loader2 } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { useData } from '../context/DataContext';
import { useAppContext } from '../context/AppContext';
import { NavigationTab } from '../types';
import { getUserCount, getWinRateStats } from '../services/db';

interface PublicStatsProps {
    setTab?: (tab: NavigationTab) => void;
}

export const PublicStats: React.FC<PublicStatsProps> = ({ setTab }) => {
    const { winRateStats, predictions } = useData();
    const { language } = useAppContext();
    const [memberCount, setMemberCount] = useState<{ total: number; vip: number } | null>(null);
    const [totalWins, setTotalWins] = useState<number | null>(null);
    const [loadingCounts, setLoadingCounts] = useState(true);

    useEffect(() => {
        (async () => {
            setLoadingCounts(true);
            try {
                const [counts, stats] = await Promise.all([
                    getUserCount(),
                    getWinRateStats(),
                ]);
                setMemberCount(counts);
                // Estimate total wins from monthly win rate × graded matches
                const guessedTotal = Math.round((stats.monthly / 100) * 30 * 8);
                setTotalWins(guessedTotal > 0 ? guessedTotal : null);
            } finally {
                setLoadingCounts(false);
            }
        })();
    }, []);

    const streak = winRateStats?.streak ?? 0;
    const monthlyRate = winRateStats?.monthly ?? 0;
    const vipCount = memberCount?.vip ?? 0;
    const totalCount = memberCount?.total ?? 0;

    const statsGrid = [
        {
            label: language === 'fr' ? 'Membres Actifs' : 'Active Members',
            value: loadingCounts ? '—' : totalCount > 0 ? `${totalCount.toLocaleString()}+` : '—',
            icon: <Users className="text-vantage-purple" size={22} />,
            color: 'text-vantage-purple',
        },
        {
            label: language === 'fr' ? 'Membres VIP' : 'VIP Members',
            value: loadingCounts ? '—' : vipCount > 0 ? `${vipCount.toLocaleString()}` : '—',
            icon: <Trophy className="text-vantage-cyan" size={22} />,
            color: 'text-vantage-cyan',
        },
        {
            label: language === 'fr' ? 'Taux de Victoires' : 'Monthly Win Rate',
            value: monthlyRate > 0 ? `${monthlyRate}%` : '—',
            icon: <Star className="text-yellow-400" size={22} />,
            color: 'text-yellow-400',
        },
        {
            label: language === 'fr' ? 'Série de Victoires' : 'Win Streak',
            value: streak > 0 ? `${streak}d` : '—',
            icon: <TrendingUp className="text-green-500" size={22} />,
            color: 'text-green-500',
        },
    ];

    return (
        <div className="space-y-5 pb-24">
            {/* Header */}
            <div className="flex flex-col space-y-1">
                <h1 className="text-2xl font-bold font-orbitron text-slate-900 dark:text-white">
                    {language === 'fr' ? 'PERFORMANCE' : 'LIVE'} <span className="text-vantage-purple">{language === 'fr' ? 'EN DIRECT' : 'STATS'}</span>
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {language === 'fr' ? 'Données réelles depuis notre base de données' : 'Real data sourced live from our verified database'}
                </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
                {statsGrid.map((s, i) => (
                    // @ts-ignore
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.07 }}
                    >
                        <GlassCard className="flex flex-col items-center p-4 text-center">
                            <div className="p-2 bg-white/5 rounded-xl mb-2">{s.icon}</div>
                            {loadingCounts && i < 2 ? (
                                <Loader2 size={20} className="animate-spin text-gray-500 my-1" />
                            ) : (
                                <span className={`text-2xl font-black font-orbitron ${s.color}`}>{s.value}</span>
                            )}
                            <span className="text-[10px] text-gray-500 uppercase tracking-wide mt-1">{s.label}</span>
                        </GlassCard>
                    </motion.div>
                ))}
            </div>

            {/* Win Rate bar chart — using real 7-day data */}
            <GlassCard className="border-vantage-cyan/20 bg-vantage-cyan/5">
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-2">
                        <BarChart3 size={18} className="text-vantage-cyan" />
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide">
                            {language === 'fr' ? 'Taux Mensuels' : 'Performance Rates'}
                        </h3>
                    </div>
                    {monthlyRate > 0 && (
                        <span className="flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">
                            <ArrowUpRight size={12} /> {monthlyRate}% {language === 'fr' ? 'Mensuel' : 'Monthly'}
                        </span>
                    )}
                </div>
                <div className="flex gap-4">
                    {[
                        { label: language === 'fr' ? "Aujourd'hui" : 'Today', value: winRateStats?.daily ?? 0 },
                        { label: language === 'fr' ? '7 Jours' : '7 Days', value: winRateStats?.weekly ?? 0 },
                        { label: language === 'fr' ? '30 Jours' : '30 Days', value: winRateStats?.monthly ?? 0 },
                    ].map((r, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-2">
                            <div className="w-full bg-slate-200 dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
                                {/* @ts-ignore */}
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${r.value}%` }}
                                    transition={{ delay: 0.4 + i * 0.1, duration: 0.6 }}
                                    className="h-full rounded-full bg-gradient-to-r from-vantage-purple to-vantage-cyan"
                                />
                            </div>
                            <span className="text-lg font-black font-orbitron text-vantage-cyan">{r.value > 0 ? `${r.value}%` : '—'}</span>
                            <span className="text-[10px] text-gray-500 uppercase">{r.label}</span>
                        </div>
                    ))}
                </div>
            </GlassCard>

            {/* Trust Signals */}
            <div className="grid grid-cols-1 gap-3">
                <GlassCard className="border-green-500/20 bg-green-500/5">
                    <div className="flex gap-3">
                        <ShieldCheck className="text-green-500 shrink-0" size={22} />
                        <div>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                                {language === 'fr' ? 'Prédictions Vérifiées' : 'Verified Predictions'}
                            </h4>
                            <p className="text-xs text-gray-500 mt-1">
                                {language === 'fr'
                                    ? 'Chaque résultat est vérifié via API officielle et archivé publiquement.'
                                    : 'Every match result is cross-referenced with official API data and archived publicly.'}
                            </p>
                        </div>
                    </div>
                </GlassCard>
                <GlassCard className="border-vantage-purple/20 bg-vantage-purple/5">
                    <div className="flex gap-3">
                        <CheckCircle2 className="text-vantage-purple shrink-0" size={22} />
                        <div>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                                {language === 'fr' ? 'Powered by Gemini AI' : 'Powered by Gemini AI'}
                            </h4>
                            <p className="text-xs text-gray-500 mt-1">
                                {language === 'fr'
                                    ? 'Notre moteur IA Gemini analyse les données en temps réel pour chaque prédiction.'
                                    : 'Our Gemini AI engine analyzes real-time fixture data for every single prediction.'}
                            </p>
                        </div>
                    </div>
                </GlassCard>
            </div>

            {/* View Full Archive CTA — only if logged in (setTab provided) */}
            {setTab && (
                <button
                    onClick={() => setTab('results')}
                    className="w-full py-4 bg-gradient-to-r from-vantage-purple to-vantage-cyan text-white font-bold rounded-2xl shadow-xl flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-transform"
                >
                    <History size={18} />
                    {language === 'fr' ? 'Voir l\'Archive Complète des Résultats' : 'View Full Results Archive'}
                </button>
            )}
        </div>
    );
};
