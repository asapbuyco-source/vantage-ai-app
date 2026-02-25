import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Zap, TrendingUp, ShieldCheck, PlayCircle, Star, LogIn, Loader2 } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { TeamLogo } from '../components/TeamLogo';
import { getFirestorePredictionsOnly } from '../services/db';
import { Match } from '../types';

interface LandingPageProps {
    onGetStarted: () => void;
    onLogin: () => void;
    onShowStats: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onLogin, onShowStats }) => {
    const [liveMatch, setLiveMatch] = useState<Match | null>(null);
    const [loadingHero, setLoadingHero] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const predictions = await getFirestorePredictionsOnly();
                if (predictions && predictions.length > 0) {
                    // Pick the highest-confidence prediction as the hero
                    const top = [...predictions].sort((a, b) => b.confidence - a.confidence)[0];
                    setLiveMatch(top);
                }
            } catch (_) {
                // Fail silently, fallback renders below
            } finally {
                setLoadingHero(false);
            }
        })();
    }, []);

    // Fallback static content if no predictions available
    const heroMatch = liveMatch || {
        homeTeam: 'Real Madrid',
        awayTeam: 'Man City',
        homeTeamLogo: 'https://upload.wikimedia.org/wikipedia/en/5/56/Real_Madrid_CF.svg',
        awayTeamLogo: 'https://upload.wikimedia.org/wikipedia/en/e/eb/Manchester_City_FC_badge.svg',
        league: 'Champions League',
        time: '20:45',
        prediction_en: 'BTTS & Over 2.5',
        prediction: 'BTTS & Over 2.5',
        confidence: 87,
        odds: 2.15,
        category: 'safe' as const,
        id: 'fallback',
    };

    return (
        <div className="flex flex-col min-h-[90vh] pb-10">
            {/* Navbarish */}
            <div className="flex justify-between items-center py-4 px-2 mb-6">
                <h1 className="text-xl font-bold font-orbitron text-slate-900 dark:text-white">
                    VANTAGE<span className="text-vantage-cyan">AI</span>
                </h1>
                <button
                    onClick={onLogin}
                    className="text-sm font-bold text-slate-600 dark:text-gray-300 hover:text-vantage-cyan transition-colors flex items-center gap-1"
                >
                    <span>Login</span>
                    <LogIn size={14} />
                </button>
            </div>

            {/* Trust Banner / Stats Ticker */}
            <div className="px-2 mb-6">
                <button
                    onClick={onShowStats}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-green-500/10 border border-green-500/20 rounded-xl group transition-all"
                >
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-ping" />
                        <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest">
                            Live Performance stats verified
                        </span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-bold text-green-500 uppercase tracking-widest">
                        <span>Check Track Record</span>
                        <ChevronRight size={10} className="group-hover:translate-x-1 transition-transform" />
                    </div>
                </button>
            </div>

            {/* Hero Text */}
            <div className="text-center space-y-4 mb-8">
                {
                    // @ts-ignore
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="inline-flex items-center space-x-2 bg-vantage-cyan/10 border border-vantage-cyan/20 rounded-full px-3 py-1 mb-2"
                    >
                        <Zap size={12} className="text-vantage-cyan fill-current" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-vantage-cyan">Vantage AI Engine · Live Today</span>
                    </motion.div>
                }

                {
                    // @ts-ignore
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-4xl md:text-5xl font-bold font-orbitron text-slate-900 dark:text-white leading-tight"
                    >
                        Predict the <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-vantage-cyan to-vantage-purple">Future of Sport</span>
                    </motion.h1>
                }

                {
                    // @ts-ignore
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto leading-relaxed"
                    >
                        Advanced AI analyzes form, injuries, and market trends to give you a verified edge every day.
                    </motion.p>
                }
            </div>

            {/* Hero Visual — Live Match Card */}
            {
                // @ts-ignore
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: 0.3, type: 'spring' }}
                    className="relative mb-10 mx-2"
                >
                    {/* Glow Effects */}
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-vantage-purple/30 rounded-full blur-[60px] animate-pulse-slow" />
                    <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-vantage-cyan/30 rounded-full blur-[60px] animate-pulse-slow" />

                    <GlassCard className="border-vantage-cyan/50 relative overflow-hidden transform rotate-[-1deg]">
                        {/* Live / Today badge */}
                        <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl shadow-lg flex items-center gap-1 animate-pulse">
                            <span className="w-1.5 h-1.5 bg-white rounded-full" />
                            {liveMatch ? "TODAY'S PICK" : 'LIVE ANALYSIS'}
                        </div>

                        {loadingHero ? (
                            <div className="flex items-center justify-center py-10">
                                <Loader2 className="animate-spin text-vantage-cyan" size={32} />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center space-y-5 pt-3">
                                <div className="text-xs text-gray-400 font-bold uppercase tracking-[0.2em]">
                                    {heroMatch.league}
                                </div>

                                <div className="flex w-full items-center justify-between px-4">
                                    <div className="text-center flex flex-col items-center gap-2">
                                        <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center border border-slate-200 dark:border-white/10 shadow-lg p-2">
                                            <TeamLogo src={heroMatch.homeTeamLogo} teamName={heroMatch.homeTeam} className="w-full h-full" />
                                        </div>
                                        <span className="text-xs font-bold text-slate-900 dark:text-white">{heroMatch.homeTeam}</span>
                                    </div>

                                    <div className="flex flex-col items-center">
                                        <span className="text-2xl font-bold font-orbitron text-vantage-cyan">VS</span>
                                        <span className="text-[10px] text-gray-500">{heroMatch.time || 'Today'}</span>
                                    </div>

                                    <div className="text-center flex flex-col items-center gap-2">
                                        <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center border border-slate-200 dark:border-white/10 shadow-lg p-2">
                                            <TeamLogo src={heroMatch.awayTeamLogo} teamName={heroMatch.awayTeam} className="w-full h-full" />
                                        </div>
                                        <span className="text-xs font-bold text-slate-900 dark:text-white">{heroMatch.awayTeam}</span>
                                    </div>
                                </div>

                                {/* AI Prediction Area */}
                                <div className="w-full bg-slate-100 dark:bg-black/40 rounded-xl p-3 border border-slate-200 dark:border-white/10">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-[10px] text-gray-500 uppercase font-bold">Vantage Prediction</span>
                                        <div className="flex items-center text-green-500 text-xs font-bold gap-1">
                                            <ShieldCheck size={12} />
                                            <span>{heroMatch.confidence}% Confidence</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-lg font-bold font-orbitron text-slate-900 dark:text-white">
                                            {heroMatch.prediction_en || heroMatch.prediction}
                                        </span>
                                        <span className="text-sm font-bold text-vantage-cyan bg-vantage-cyan/10 px-2 py-1 rounded">
                                            @ {heroMatch.odds}
                                        </span>
                                    </div>

                                    {/* Animated Progress Bar */}
                                    <div className="mt-3 h-1.5 w-full bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                                        {
                                            // @ts-ignore
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${heroMatch.confidence}%` }}
                                                transition={{ duration: 1.5, delay: 0.5, ease: 'easeOut' }}
                                                className="h-full bg-gradient-to-r from-vantage-cyan to-vantage-purple"
                                            />
                                        }
                                    </div>
                                </div>
                            </div>
                        )}
                    </GlassCard>
                </motion.div>
            }

            {/* Feature Grid */}
            <div className="grid grid-cols-3 gap-3 mb-12">
                <div className="flex flex-col items-center text-center space-y-2">
                    <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500">
                        <PlayCircle size={20} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 dark:text-gray-300">Live<br />Scanning</span>
                </div>
                <div className="flex flex-col items-center text-center space-y-2">
                    <div className="p-3 bg-purple-500/10 rounded-xl text-purple-500">
                        <TrendingUp size={20} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 dark:text-gray-300">High<br />Win Rate</span>
                </div>
                <div className="flex flex-col items-center text-center space-y-2">
                    <div className="p-3 bg-yellow-500/10 rounded-xl text-yellow-500">
                        <Star size={20} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 dark:text-gray-300">Daily<br />VIP Tips</span>
                </div>
            </div>

            {/* CTA Section */}
            <div className="mt-auto space-y-3 px-2">
                {
                    // @ts-ignore
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={onGetStarted}
                        className="w-full py-4 bg-white text-slate-900 font-bold rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.3)] flex items-center justify-center space-x-2 relative overflow-hidden group"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-100 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                        <span className="relative z-10 text-lg">Get Started Free</span>
                        <ChevronRight className="relative z-10" size={20} />
                    </motion.button>
                }

                <p className="text-center text-[10px] text-gray-500">
                    No credit card required. Cancel anytime.
                </p>
            </div>
        </div>
    );
};