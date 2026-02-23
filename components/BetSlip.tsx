import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, X, Trash2, Share2, ChevronDown } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { TeamLogo } from './TeamLogo';

export const BetSlip: React.FC = () => {
    const { savedPicks, clearSavedPicks, toggleSavedPick, language } = useAppContext();
    const [isOpen, setIsOpen] = useState(false);

    const count = savedPicks.length;

    const shareWhatsApp = () => {
        if (count === 0) return;
        const lines = savedPicks.map((p, i) => {
            const pred = language === 'fr' ? (p as any).prediction_fr || p.prediction : (p as any).prediction_en || p.prediction;
            return `${i + 1}. ${p.homeTeam} vs ${p.awayTeam}\n   📌 ${pred} (${p.confidence}% | @${p.odds})`;
        });
        const text = `*🤖 Vantage AI - My Slip*\n\n${lines.join('\n\n')}\n\n_Powered by VantageAI_`;
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    };

    return (
        <>
            {/* Floating Action Button */}
            {count > 0 && !isOpen && (
                // @ts-ignore
                <motion.button
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-24 right-4 z-50 w-14 h-14 rounded-full bg-vantage-purple shadow-xl shadow-vantage-purple/30 flex items-center justify-center text-white border border-vantage-purple/50"
                >
                    <Bookmark size={22} fill="white" />
                    {/* Badge */}
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border border-slate-900">
                        {count}
                    </span>
                </motion.button>
            )}

            {/* Slide-up Panel */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        {/* @ts-ignore */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsOpen(false)}
                            className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
                        />
                        {/* Panel */}
                        {/* @ts-ignore */}
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', stiffness: 300, damping: 35 }}
                            className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-white/10 rounded-t-3xl max-h-[80vh] flex flex-col"
                        >
                            {/* Handle */}
                            <div className="flex justify-center pt-3 pb-1">
                                <div className="w-10 h-1 rounded-full bg-white/20" />
                            </div>

                            {/* Header */}
                            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
                                <div className="flex items-center gap-2">
                                    <Bookmark size={18} className="text-vantage-purple" fill="currentColor" />
                                    <h2 className="font-bold text-white">
                                        {language === 'fr' ? 'Mon Slip' : 'My Slip'}
                                        <span className="ml-2 text-xs px-2 py-0.5 bg-vantage-purple/20 text-vantage-purple rounded-full">{count}</span>
                                    </h2>
                                </div>
                                <button onClick={() => setIsOpen(false)} className="p-2 rounded-full hover:bg-white/10 text-gray-400">
                                    <ChevronDown size={20} />
                                </button>
                            </div>

                            {/* Pick List */}
                            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 custom-scrollbar">
                                <AnimatePresence>
                                    {savedPicks.map((pick, i) => (
                                        // @ts-ignore
                                        <motion.div
                                            key={pick.id}
                                            layout
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, x: 20, height: 0, marginBottom: 0 }}
                                            transition={{ delay: i * 0.04 }}
                                            className="flex items-center gap-3 bg-white/5 rounded-2xl p-3 border border-white/10"
                                        >
                                            {/* Logos */}
                                            <div className="flex -space-x-2 shrink-0">
                                                <TeamLogo src={pick.homeTeamLogo} teamName={pick.homeTeam} className="w-8 h-8 border-2 border-slate-900" />
                                                <TeamLogo src={pick.awayTeamLogo} teamName={pick.awayTeam} className="w-8 h-8 border-2 border-slate-900" />
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-white truncate">
                                                    {pick.homeTeam} vs {pick.awayTeam}
                                                </p>
                                                <p className="text-[11px] text-gray-400 truncate">
                                                    {pick.prediction} · {pick.confidence}% · @{pick.odds}
                                                </p>
                                            </div>

                                            {/* Remove */}
                                            <button
                                                onClick={() => toggleSavedPick(pick)}
                                                className="shrink-0 text-gray-600 hover:text-red-400 transition-colors"
                                            >
                                                <X size={16} />
                                            </button>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>

                            {/* Actions */}
                            <div className="px-4 py-4 border-t border-white/10 flex gap-3">
                                <button
                                    onClick={clearSavedPicks}
                                    className="flex-1 py-3 rounded-xl bg-red-500/10 text-red-400 font-bold text-sm flex items-center justify-center gap-2 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                                >
                                    <Trash2 size={16} /> {language === 'fr' ? 'Vider' : 'Clear All'}
                                </button>
                                <button
                                    onClick={shareWhatsApp}
                                    className="flex-2 flex-grow py-3 rounded-xl bg-green-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-green-500/20 hover:bg-green-600 transition-colors"
                                >
                                    <Share2 size={16} /> {language === 'fr' ? 'Partager WhatsApp' : 'Share on WhatsApp'}
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
};
