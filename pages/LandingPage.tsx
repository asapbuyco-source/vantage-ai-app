import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Zap, TrendingUp, ShieldCheck, PlayCircle, Star, LogIn, Loader2, BookOpen, ArrowRight, Trophy, CheckCircle, XCircle } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { TeamLogo } from '../components/TeamLogo';
import { getFirestorePredictionsOnly, getPredictionsForDate } from '../services/db';
import { Match } from '../types';

interface LandingPageProps {
    onGetStarted: () => void;
    onLogin: () => void;
    onShowStats: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onLogin, onShowStats }) => {
    const [liveMatch, setLiveMatch] = useState<Match | null>(null);
    const [loadingHero, setLoadingHero] = useState(true);
    const [yesterdayResults, setYesterdayResults] = useState<{won: number; lost: number; rate: number} | null>(null);

    useEffect(() => {
        // Load yesterday's results
        (async () => {
            try {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const dateKey = yesterday.toISOString().split('T')[0];
                const preds = await getPredictionsForDate(dateKey);
                if (preds && preds.length > 0) {
                    const won = preds.filter(p => p.status === 'won').length;
                    const lost = preds.filter(p => p.status === 'lost').length;
                    const total = won + lost;
                    setYesterdayResults({
                        won,
                        lost,
                        rate: total > 0 ? Math.round((won / total) * 100) : 0
                    });
                }
            } catch (_) {}
        })();

        // Load today's top prediction
        (async () => {
            try {
                const predictions = await getFirestorePredictionsOnly();
                if (predictions && predictions.length > 0) {
                    const top = [...predictions].sort((a, b) => b.confidence - a.confidence)[0];
                    setLiveMatch(top);
                }
            } catch (_) {
                // Fail silently
            } finally {
                setLoadingHero(false);
            }
        })();
    }, []);

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
        <div className="flex flex-col min-h-[90vh] pb-10 md:pb-20">
            {/* Navbar */}
            <div className="flex justify-between items-center py-4 px-2 md:px-8 mb-4 md:mb-8">
                <h1 className="text-xl md:text-2xl font-bold font-orbitron text-slate-900 dark:text-white">
                    VANTAGE<span className="text-vantage-cyan">AI</span>
                </h1>
                <div className="flex items-center gap-4">
                    {/* Desktop Yesterday Results */}
                    {yesterdayResults && (
                        <button
                            onClick={onShowStats}
                            className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full"
                        >
                            <Trophy size={12} className="text-green-500" />
                            <span className="text-xs font-bold text-green-500">
                                Yesterday: {yesterdayResults.rate}%
                            </span>
                            {yesterdayResults.rate >= 60 
                                ? <CheckCircle size={12} className="text-green-500" />
                                : <XCircle size={12} className="text-red-400" />}
                        </button>
                    )}
                    <button
                        onClick={onShowStats}
                        className="hidden md:flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-gray-300 hover:text-vantage-cyan transition-colors"
                    >
                        <TrendingUp size={16} />
                        <span>Track Record</span>
                    </button>
                    <button
                        onClick={onLogin}
                        className="text-sm font-bold text-slate-600 dark:text-gray-300 hover:text-vantage-cyan transition-colors flex items-center gap-1"
                    >
                        <LogIn size={14} />
                        <span className="hidden md:inline">Login</span>
                    </button>
                </div>
            </div>

            {/* Trust Banner - Mobile only */}
            <div className="px-2 md:hidden mb-6">
                {/* Yesterday's Results Banner */}
                {yesterdayResults && (
                    <button
                        onClick={onShowStats}
                        className="w-full flex items-center justify-between px-4 py-2.5 bg-green-500/10 border border-green-500/20 rounded-xl mb-3"
                    >
                        <div className="flex items-center gap-2">
                            <Trophy size={14} className="text-green-500" />
                            <span className="text-xs font-bold text-green-500">
                                Yesterday: {yesterdayResults.won}/{yesterdayResults.won + yesterdayResults.lost} Won ({yesterdayResults.rate}%)
                            </span>
                        </div>
                        {yesterdayResults.rate >= 60 && <CheckCircle size={14} className="text-green-500" />}
                    </button>
                )}
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
                    <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest">Check →</span>
                </button>
            </div>

            {/* Main Content Row */}
            <div className="flex-1 flex flex-col md:flex-row md:gap-12 md:px-8 md:items-center">
                {/* Left Column - Text */}
                <div className="flex-1 px-2 md:px-0">
                    <div className="text-center md:text-left space-y-4 mb-8">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="inline-flex items-center space-x-2 bg-vantage-cyan/10 border border-vantage-cyan/20 rounded-full px-3 py-1 mb-2"
                        >
                            <Zap size={12} className="text-vantage-cyan fill-current" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-vantage-cyan">Vantage AI · Live</span>
                        </motion.div>

                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="text-4xl md:text-5xl lg:text-6xl font-bold font-orbitron text-slate-900 dark:text-white leading-tight"
                        >
                            Predict the <br className="hidden md:block" />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-vantage-cyan to-vantage-purple">Future of Sport</span>
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className="text-sm md:text-base text-gray-500 dark:text-gray-400 max-w-md mx-auto md:mx-0"
                        >
                            Advanced AI analyzes form, injuries, and market trends to give you a verified edge every day.
                        </motion.p>

                        {/* Desktop Stats */}
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3 }}
                            className="hidden md:flex gap-4 py-4"
                        >
                            <div className="flex flex-col items-center px-4 py-2 bg-green-500/10 rounded-xl border border-green-500/20">
                                <span className="text-xl font-bold text-green-500">72%</span>
                                <span className="text-[10px] text-gray-500">Win Rate</span>
                            </div>
                            <div className="flex flex-col items-center px-4 py-2 bg-vantage-cyan/10 rounded-xl border border-vantage-cyan/20">
                                <span className="text-xl font-bold text-vantage-cyan">30+</span>
                                <span className="text-[10px] text-gray-500">Daily Picks</span>
                            </div>
                            <div className="flex flex-col items-center px-4 py-2 bg-purple-500/10 rounded-xl border border-purple-500/20">
                                <span className="text-xl font-bold text-purple-500">500+</span>
                                <span className="text-[10px] text-gray-500">VIP Members</span>
                            </div>
                        </motion.div>

                        {/* CTA */}
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={onGetStarted}
                            className="w-full md:w-auto py-4 px-8 bg-white text-slate-900 font-bold rounded-xl shadow-lg flex items-center justify-center space-x-2"
                        >
                            <span className="text-lg">Get Started Free</span>
                            <ChevronRight size={20} />
                        </motion.button>
                        <p className="text-[10px] text-gray-500">No credit card required</p>
                    </div>
                </div>

                {/* Right Column - Match Card */}
                <div className="flex-1 px-2 md:px-0">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="relative"
                    >
                        <div className="absolute -top-10 -right-10 w-40 h-40 bg-vantage-purple/30 rounded-full blur-[60px] hidden md:block" />
                        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-vantage-cyan/30 rounded-full blur-[60px] hidden md:block" />

                        <GlassCard className="border-vantage-cyan/50 relative overflow-hidden">
                            <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-white rounded-full" />
                                {liveMatch ? "TODAY'S PICK" : 'LIVE'}
                            </div>

                            {loadingHero ? (
                                <div className="flex items-center justify-center py-10">
                                    <Loader2 className="animate-spin text-vantage-cyan" size={32} />
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center space-y-5 pt-3">
                                    <div className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                                        {heroMatch.league}
                                    </div>

                                    <div className="flex w-full items-center justify-between px-4">
                                        <div className="text-center flex flex-col items-center gap-2">
                                            <div className="w-14 md:w-20 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center border border-slate-200 dark:border-white/10 shadow-lg p-2">
                                                <TeamLogo src={heroMatch.homeTeamLogo} teamName={heroMatch.homeTeam} className="w-full h-full" />
                                            </div>
                                            <span className="text-xs md:text-sm font-bold text-slate-900 dark:text-white">{heroMatch.homeTeam}</span>
                                        </div>

                                        <div className="flex flex-col items-center">
                                            <span className="text-2xl md:text-3xl font-bold text-vantage-cyan">VS</span>
                                            <span className="text-[10px] text-gray-500">{heroMatch.time}</span>
                                        </div>

                                        <div className="text-center flex flex-col items-center gap-2">
                                            <div className="w-14 md:w-20 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center border border-slate-200 dark:border-white/10 shadow-lg p-2">
                                                <TeamLogo src={heroMatch.awayTeamLogo} teamName={heroMatch.awayTeam} className="w-full h-full" />
                                            </div>
                                            <span className="text-xs md:text-sm font-bold text-slate-900 dark:text-white">{heroMatch.awayTeam}</span>
                                        </div>
                                    </div>

                                    <div className="w-full bg-slate-100 dark:bg-black/40 rounded-xl p-3 md:p-4">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-[10px] text-gray-500 uppercase">Prediction</span>
                                            <div className="flex items-center text-green-500 text-xs font-bold gap-1">
                                                <ShieldCheck size={12} />
                                                <span>{heroMatch.confidence}%</span>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">
                                                {heroMatch.prediction_en || heroMatch.prediction}
                                            </span>
                                            <span className="text-sm font-bold text-vantage-cyan bg-vantage-cyan/10 px-2 py-1 rounded">
                                                @ {heroMatch.odds}
                                            </span>
                                        </div>
                                        <div className="mt-3 h-1.5 w-full bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${heroMatch.confidence}%` }}
                                                transition={{ duration: 1.5, delay: 0.5 }}
                                                className="h-full bg-gradient-to-r from-vantage-cyan to-vantage-purple"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </GlassCard>
                    </motion.div>
                </div>
            </div>

            {/* Feature Grid */}
            <div className="grid grid-cols-3 gap-3 mb-10 px-2 md:px-8 mt-8 md:mt-16">
                <div className="flex flex-col items-center text-center space-y-2">
                    <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500">
                        <PlayCircle size={20} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 dark:text-gray-300">Live Scanning</span>
                </div>
                <div className="flex flex-col items-center text-center space-y-2">
                    <div className="p-3 bg-purple-500/10 rounded-xl text-purple-500">
                        <TrendingUp size={20} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 dark:text-gray-300">High Win Rate</span>
                </div>
                <div className="flex flex-col items-center text-center space-y-2">
                    <div className="p-3 bg-yellow-500/10 rounded-xl text-yellow-500">
                        <Star size={20} />
                    </div>
                    <span className="text-xs font-bold text-slate-700 dark:text-gray-300">Daily VIP Tips</span>
                </div>
            </div>

            {/* Blog CTA */}
            <div className="mb-10 px-2 md:px-8">
                <button
                    onClick={() => window.location.href = '/blog'}
                    className="w-full relative overflow-hidden group rounded-xl p-[1px]"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-vantage-cyan via-vantage-purple to-vantage-cyan rounded-xl opacity-30 group-hover:opacity-100 transition-opacity" />
                    <div className="relative bg-slate-900/90 dark:bg-black/90 backdrop-blur-md rounded-xl px-4 py-5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-vantage-cyan/10 rounded-lg">
                                <BookOpen size={20} className="text-vantage-cyan" />
                            </div>
                            <div className="text-left">
                                <h3 className="text-sm font-bold text-white">Daily AI Blog</h3>
                                <p className="text-[10px] text-gray-400">Free betting tips (No login)</p>
                            </div>
                        </div>
                        <ArrowRight size={18} className="text-gray-400 group-hover:text-white" />
                    </div>
                </button>
            </div>
        </div>
    );
};