import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, ChevronDown, ChevronUp, CheckCircle2, XCircle, Loader2, Trophy, AlertCircle } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { getResultsHistory, DayResult } from '../services/db';
import { useAppContext } from '../context/AppContext';

export const Results: React.FC = () => {
    const { language } = useAppContext();
    const [history, setHistory] = useState<DayResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedDay, setExpandedDay] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const data = await getResultsHistory(30);
                setHistory(data);
                if (data.length > 0) setExpandedDay(data[0].date);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const totalWon = history.reduce((s, d) => s + d.wonCount, 0);
    const totalLost = history.reduce((s, d) => s + d.lostCount, 0);
    const totalGraded = totalWon + totalLost;
    const overallRate = totalGraded > 0 ? Math.round((totalWon / totalGraded) * 100) : 0;

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr + 'T12:00:00');
        return d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB', {
            weekday: 'short', day: 'numeric', month: 'short',
        });
    };

    return (
        <div className="space-y-5 pb-24">
            {/* Header */}
            <div className="flex flex-col space-y-1">
                <div className="flex items-center gap-2">
                    <History size={22} className="text-vantage-cyan" />
                    <h1 className="text-2xl font-bold font-orbitron text-slate-900 dark:text-white">
                        {language === 'fr' ? 'ARCHIVE' : 'RESULTS'}{' '}
                        <span className="text-vantage-cyan">{language === 'fr' ? 'DES RÉSULTATS' : 'HISTORY'}</span>
                    </h1>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {language === 'fr'
                        ? '30 derniers jours · Données vérifiées & archivées'
                        : 'Last 30 days · Verified & archived prediction data'}
                </p>
            </div>

            {/* Summary Banner */}
            {!loading && totalGraded > 0 && (
                // @ts-ignore
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                >
                    <GlassCard className="border-vantage-cyan/20 bg-vantage-cyan/5">
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                                <p className="text-2xl font-black font-orbitron text-green-500">{totalWon}</p>
                                <p className="text-[10px] uppercase text-gray-500">{language === 'fr' ? 'Gagnés' : 'Won'}</p>
                            </div>
                            <div>
                                <p className="text-2xl font-black font-orbitron text-vantage-cyan">{overallRate}%</p>
                                <p className="text-[10px] uppercase text-gray-500">{language === 'fr' ? 'Taux Global' : 'Win Rate'}</p>
                            </div>
                            <div>
                                <p className="text-2xl font-black font-orbitron text-red-400">{totalLost}</p>
                                <p className="text-[10px] uppercase text-gray-500">{language === 'fr' ? 'Perdus' : 'Lost'}</p>
                            </div>
                        </div>
                    </GlassCard>
                </motion.div>
            )}

            {/* Content */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <Loader2 className="animate-spin text-vantage-cyan" size={36} />
                    <p className="text-sm text-gray-500">{language === 'fr' ? 'Chargement des résultats...' : 'Loading results...'}</p>
                </div>
            ) : history.length === 0 ? (
                <GlassCard className="flex flex-col items-center py-12 text-center gap-3 border-slate-200 dark:border-white/5">
                    <AlertCircle size={36} className="text-gray-400" />
                    <h3 className="font-bold text-slate-900 dark:text-white">
                        {language === 'fr' ? 'Aucun résultat archivé' : 'No archived results yet'}
                    </h3>
                    <p className="text-sm text-gray-500 max-w-xs">
                        {language === 'fr'
                            ? "Les résultats apparaîtront ici une fois que l'admin a noté les prédictions."
                            : 'Results will appear here once the admin grades predictions each day.'}
                    </p>
                </GlassCard>
            ) : (
                <div className="space-y-3">
                    {history.map((day, i) => {
                        const dayRate = day.totalGraded > 0 ? Math.round((day.wonCount / day.totalGraded) * 100) : 0;
                        const isExpanded = expandedDay === day.date;

                        return (
                            // @ts-ignore
                            <motion.div
                                key={day.date}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.03 }}
                            >
                                <button
                                    className="w-full"
                                    onClick={() => setExpandedDay(isExpanded ? null : day.date)}
                                >
                                    <GlassCard className={`transition-all ${isExpanded ? 'border-vantage-cyan/40' : 'border-white/5'}`}>
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black font-orbitron
                                                    ${dayRate >= 70 ? 'bg-green-500/15 text-green-500' : dayRate >= 50 ? 'bg-yellow-500/15 text-yellow-500' : 'bg-red-500/15 text-red-500'}`}>
                                                    {dayRate}%
                                                </div>
                                                <div className="text-left">
                                                    <p className="text-sm font-bold text-slate-900 dark:text-white">{formatDate(day.date)}</p>
                                                    <p className="text-[10px] text-gray-500 flex items-center gap-2">
                                                        <span className="flex items-center gap-1 text-green-500"><Trophy size={10} />{day.wonCount} Won</span>
                                                        <span className="flex items-center gap-1 text-red-400"><XCircle size={10} />{day.lostCount} Lost</span>
                                                        <span>{day.totalGraded} graded</span>
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-gray-400">
                                                {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                            </div>
                                        </div>
                                    </GlassCard>
                                </button>

                                <AnimatePresence>
                                    {isExpanded && (
                                        // @ts-ignore
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="overflow-hidden mt-2 space-y-2 pl-2"
                                        >
                                            {day.matches.filter(m => m.status === 'won' || m.status === 'lost').map((match) => {
                                                const won = match.status === 'won';
                                                const pred = language === 'fr' ? (match.prediction_fr || match.prediction) : (match.prediction_en || match.prediction);
                                                return (
                                                    <div
                                                        key={match.id}
                                                        className={`flex items-center justify-between p-3 rounded-xl border text-sm
                                                            ${won ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}
                                                    >
                                                        <div className="flex items-center gap-2 overflow-hidden min-w-0">
                                                            {won
                                                                ? <CheckCircle2 size={16} className="text-green-500 shrink-0" />
                                                                : <XCircle size={16} className="text-red-400 shrink-0" />
                                                            }
                                                            <div className="flex flex-col min-w-0">
                                                                <span className="font-bold text-slate-900 dark:text-white truncate text-xs">
                                                                    {match.homeTeam} vs {match.awayTeam}
                                                                </span>
                                                                <span className="text-[10px] text-gray-500 truncate">{match.league} · {pred}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col items-end shrink-0 ml-2">
                                                            <span className={`text-xs font-bold font-orbitron ${won ? 'text-green-500' : 'text-red-400'}`}>
                                                                {won ? 'WON' : 'LOST'}
                                                            </span>
                                                            <span className="text-[10px] text-gray-500">@ {match.odds}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {day.matches.filter(m => m.status === 'won' || m.status === 'lost').length === 0 && (
                                                <div className="text-center py-4 text-xs text-gray-500">
                                                    {language === 'fr' ? 'Aucun match noté pour ce jour' : 'No graded matches for this day'}
                                                </div>
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
