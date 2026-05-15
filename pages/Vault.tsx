import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Info, ShieldCheck, Target, Check, Calendar, HelpCircle, X, Sparkles } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { useAppContext } from '../context/AppContext';
import { useData } from '../context/DataContext';
import { NavigationTab } from '../types';
import { useAuth } from '../context/AuthContext';

interface VaultProps {
    setTab: (tab: NavigationTab) => void;
}

export const Vault: React.FC<VaultProps> = ({ setTab }) => {
    const { language } = useAppContext();
    const { predictions } = useData();
    const { userProfile, updateVaultProgress } = useAuth();

    const isVip = userProfile?.isVip;
    const vaultProgress = userProfile?.vaultProgress;

    const hasActiveVault = !!(vaultProgress && vaultProgress.bankroll > 0);

    const [showSetup, setShowSetup] = useState(true);
    const [startingBankroll, setStartingBankroll] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showHelp, setShowHelp] = useState(false);

    useEffect(() => {
        if (vaultProgress && vaultProgress.bankroll > 0) {
            setShowSetup(false);
        } else {
            setShowSetup(true);
        }
    }, [vaultProgress]);

    const currentBankroll = vaultProgress?.bankroll || 0;
    const currentDay = vaultProgress?.currentDay || 1;
    const completedDays = vaultProgress?.completedDays || [];

    const unitSize = currentBankroll * 0.01;
    const daysRemaining = Math.max(0, 31 - currentDay);
    const expectedFinalBankroll = currentBankroll * Math.pow(1.0079, daysRemaining);
    const expectedProfit = expectedFinalBankroll - currentBankroll;

    const filteredMatches = useMemo(() => {
        return predictions.filter(p => p.confidence >= 55);
    }, [predictions]);

    const handleInitializeVault = async () => {
        const amount = parseFloat(startingBankroll);
        if (!amount || isNaN(amount) || amount <= 0) {
            alert(language === 'fr' ? 'Veuillez entrer un montant valide' : 'Please enter a valid amount');
            return;
        }

        console.log('Initializing vault with amount:', amount);
        setIsSubmitting(true);
        try {
            await updateVaultProgress({
                currentDay: 1,
                bankroll: amount,
                startDate: new Date().toISOString().split('T')[0],
                completedDays: []
            });
            console.log('Vault initialized successfully');
        } catch (e: any) {
            console.error("Failed to initialize vault:", e);
            alert(language === 'fr' ? 'Erreur lors de l\'initialisation: ' + e.message : 'Failed to initialize: ' + e.message);
        }
        setIsSubmitting(false);
    };

    const handleMarkDayComplete = async () => {
        if (!vaultProgress || currentDay > 30) return;

        const newCompletedDays = [...completedDays];
        if (!newCompletedDays.includes(currentDay)) {
            newCompletedDays.push(currentDay);
        }

        const newDay = Math.min(currentDay + 1, 31);
        const projectedBankroll = currentBankroll * 1.0079;

        await updateVaultProgress({
            currentDay: newDay,
            bankroll: projectedBankroll,
            startDate: vaultProgress.startDate,
            completedDays: newCompletedDays
        });
    };

    const handleResetVault = async () => {
        await updateVaultProgress({
            currentDay: 1,
            bankroll: 0,
            startDate: '',
            completedDays: []
        });
        setStartingBankroll('');
    };

    const vaultExplanation = language === 'fr' ? {
        title: 'Comment ça marche?',
        headline: 'Votre argent travaille pendant que vous dormez.',
        points: [
            'Entrez votre capital de départ',
            'L\'IA vous donne une liste de paris à faire chaque jour',
            'Vous misez 1% sur chaque match recommandé',
            'Marquez le jour comme terminé et votre bankroll grandit',
            'En 30 jours, votre argent devrait avoir GROSSI'
        ],
        cta: 'Essayez-le gratuitement avec votre VIP!'
    } : {
        title: 'How it works?',
        headline: 'Your money works while you sleep.',
        points: [
            'Enter your starting bankroll',
            'AI gives you a list of bets to make each day',
            'You bet 1% on each recommended match',
            'Mark the day complete and your bankroll grows',
            'In 30 days, your money should have GROWN'
        ],
        cta: 'Try it free with your VIP!'
    };

    if (!isVip) {
        return (
            <div className="space-y-5 pb-24 flex flex-col items-center justify-center pt-20">
                <div className="relative">
                    <ShieldCheck size={56} className="text-gray-400" />
                    <Sparkles size={20} className="absolute -top-1 -right-1 text-yellow-400" />
                </div>
                <h1 className="text-2xl font-bold font-orbitron text-slate-900 dark:text-white">
                    ALPHA <span className="text-vantage-cyan">VAULT</span>
                </h1>
                <p className="text-gray-500 text-center max-w-xs mt-2">
                    {language === 'fr'
                        ? 'Gérez votre bankroll comme un pro. Résultats prouvés sur 30 jours.'
                        : 'Manage your bankroll like a pro. Proven results over 30 days.'}
                </p>
                <div className="bg-gradient-to-r from-green-500/10 to-cyan-500/10 border border-green-500/20 rounded-xl p-4 mt-4 max-w-xs">
                    <p className="text-xs text-center text-gray-300">
                        {language === 'fr' ? 'Vos 100,000 F deviennent...' : 'Your 100,000 F becomes...'}
                    </p>
                    <p className="text-2xl font-black font-orbitron text-green-400 text-center mt-1">
                        126,700 F
                    </p>
                    <p className="text-[10px] text-center text-gray-500 mt-1">
                        {language === 'fr' ? '+26.7% en 30 jours' : '+26.7% in 30 days'}
                    </p>
                </div>
                <button
                    onClick={() => setTab('vip')}
                    className="mt-6 px-8 py-4 bg-vantage-cyan text-slate-900 font-bold rounded-full hover:bg-cyan-400 transition shadow-lg shadow-cyan-500/20"
                >
                    {language === 'fr' ? 'Devenir VIP Maintenant' : 'Upgrade to VIP Now'}
                </button>
            </div>
        );
    }

    if (showSetup) {
        return (
            <div className="space-y-5 pb-24">
                <div className="flex items-center space-x-3">
                    <button onClick={() => setTab('home')} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                        <ChevronLeft size={24} />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-2xl font-bold font-orbitron text-slate-900 dark:text-white">
                            ALPHA <span className="text-vantage-cyan">VAULT</span>
                        </h1>
                        <p className="text-xs text-gray-500">
                            {language === 'fr' ? 'Votre plan de croissance en 30 jours' : 'Your 30-day growth plan'}
                        </p>
                    </div>
                    <button
                        onClick={() => setShowHelp(true)}
                        className="p-2 rounded-full hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
                    >
                        <HelpCircle size={20} />
                    </button>
                </div>

                <GlassCard className="border-gradient-to-r from-green-500/20 to-cyan-500/20 bg-gradient-to-br from-green-500/5 to-cyan-500/5">
                    <div className="text-center mb-4">
                        <p className="text-xs text-gray-400 uppercase tracking-wide">
                            {language === 'fr' ? 'Entrez votre capital' : 'Enter your bankroll'}
                        </p>
                        <input
                            type="number"
                            value={startingBankroll}
                            onChange={e => setStartingBankroll(e.target.value)}
                            placeholder="100000"
                            className="mt-2 w-full bg-slate-800 text-center text-4xl font-black font-orbitron text-white placeholder-gray-500 outline-none rounded-lg px-4 py-3"
                        />
                        <p className="text-xs text-gray-500 mt-1">FCFA</p>
                    </div>
                    {startingBankroll && parseFloat(startingBankroll) > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="border-t border-white/10 pt-4 mt-4"
                        >
                            <p className="text-[10px] text-gray-400 uppercase tracking-wide text-center mb-2">
                                {language === 'fr' ? 'Dans 30 jours, vous pourriez avoir' : 'In 30 days, you could have'}
                            </p>
                            <p className="text-3xl font-black font-orbitron text-green-400 text-center">
                                {Math.round(parseFloat(startingBankroll) * 1.267).toLocaleString()} F
                            </p>
                            <p className="text-sm text-green-400/70 text-center mt-1">
                                +{Math.round(parseFloat(startingBankroll) * 0.267).toLocaleString()} F {language === 'fr' ? 'de profit' : 'profit'}
                            </p>
                        </motion.div>
                    )}
                </GlassCard>

                <button
                    onClick={handleInitializeVault}
                    className="w-full py-4 bg-gradient-to-r from-green-500 to-cyan-500 text-white font-bold rounded-xl hover:opacity-90 transition shadow-lg shadow-green-500/20"
                >
                    {isSubmitting
                        ? (language === 'fr' ? 'Démarrage...' : 'Starting...')
                        : (language === 'fr' ? 'Commencer ma Croissance' : 'Start My Growth')}
                </button>

                <GlassCard>
                    <div className="flex items-center gap-2 mb-3">
                        <Calendar size={16} className="text-vantage-cyan" />
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                            {language === 'fr' ? 'Comment ça marche?' : 'How it works?'}
                        </h3>
                    </div>
                    <div className="space-y-3">
                        {[
                            { num: '1', text: language === 'fr' ? 'Entrez votre capital' : 'Enter your bankroll' },
                            { num: '2', text: language === 'fr' ? 'Recevez vos paris du jour' : 'Get daily picks' },
                            { num: '3', text: language === 'fr' ? 'Misez 1% sur chaque match' : 'Bet 1% on each match' },
                            { num: '4', text: language === 'fr' ? 'Marquez le jour terminé' : 'Mark day complete' },
                            { num: '5', text: language === 'fr' ? 'Regardez votre argent grandir' : 'Watch your money grow' }
                        ].map((step, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <div className="w-6 h-6 rounded-full bg-vantage-cyan/20 flex items-center justify-center text-xs font-bold text-vantage-cyan">
                                    {step.num}
                                </div>
                                <p className="text-xs text-gray-400">{step.text}</p>
                            </div>
                        ))}
                    </div>
                </GlassCard>

                <AnimatePresence>
                    {showHelp && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                            onClick={() => setShowHelp(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.95, opacity: 0 }}
                                className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full"
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-lg font-bold text-white">{vaultExplanation.title}</h3>
                                    <button onClick={() => setShowHelp(false)} className="p-1 hover:bg-white/10 rounded-full">
                                        <X size={18} className="text-gray-400" />
                                    </button>
                                </div>
                                <p className="text-sm text-cyan-400 font-bold mb-3">{vaultExplanation.headline}</p>
                                <ul className="space-y-2">
                                    {vaultExplanation.points.map((point, i) => (
                                        <li key={i} className="text-sm text-gray-300 flex gap-2">
                                            <span className="text-green-400">✓</span>
                                            {point}
                                        </li>
                                    ))}
                                </ul>
                                <p className="text-xs text-yellow-400 mt-4 text-center">{vaultExplanation.cta}</p>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    }

    const dayGrid = Array.from({ length: 30 }, (_, i) => i + 1);
    const isComplete = currentDay > 30;

    return (
        <div className="space-y-5 pb-24">
            <div className="flex items-center space-x-3">
                <button onClick={() => setTab('home')} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                    <ChevronLeft size={24} />
                </button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold font-orbitron text-slate-900 dark:text-white">
                        ALPHA <span className="text-vantage-cyan">VAULT</span>
                    </h1>
                    <p className="text-xs text-gray-500">
                        {language === 'fr' ? 'Jour ' + Math.min(currentDay, 30) + '/30' : 'Day ' + Math.min(currentDay, 30) + '/30'}
                    </p>
                </div>
                <button
                    onClick={() => setShowHelp(true)}
                    className="p-2 rounded-full hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
                >
                    <HelpCircle size={20} />
                </button>
            </div>

            <GlassCard className="border-gradient-to-r from-green-500/20 to-cyan-500/20 bg-gradient-to-br from-green-500/5 to-cyan-500/5">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                            {language === 'fr' ? 'Bankroll Actuelle' : 'Current Bankroll'}
                        </p>
                        <p className="text-2xl font-black font-orbitron text-white">
                            {Math.round(currentBankroll).toLocaleString()} F
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                            {language === 'fr' ? 'Mise (1%)' : 'Stake (1%)'}
                        </p>
                        <p className="text-lg font-bold font-orbitron text-green-400">
                            {Math.round(unitSize).toLocaleString()} F
                        </p>
                    </div>
                </div>
                {!isComplete && (
                    <div className="border-t border-white/10 pt-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                                    {language === 'fr' ? 'Objectif Final' : 'Final Target'}
                                </p>
                                <p className="text-xl font-black font-orbitron text-cyan-400">
                                    {Math.round(expectedFinalBankroll).toLocaleString()} F
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                                    {language === 'fr' ? 'Profit Attendu' : 'Expected Profit'}
                                </p>
                                <p className="text-lg font-bold font-orbitron text-green-400">
                                    +{Math.round(expectedProfit).toLocaleString()} F
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center justify-between mt-3 bg-black/20 rounded-lg p-2">
                            <p className="text-xs text-gray-400">
                                {language === 'fr' ? 'Jours restants' : 'Days remaining'}
                            </p>
                            <p className="text-sm font-bold text-white">{daysRemaining}</p>
                        </div>
                    </div>
                )}
            </GlassCard>

            <GlassCard>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Calendar size={15} className="text-vantage-cyan" />
                        {language === 'fr' ? 'Calendrier' : 'Calendar'}
                    </h3>
                    <div className="flex items-center gap-2 text-xs">
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-3 rounded bg-green-500/20 border border-green-500/30" />
                            <span className="text-gray-500">{language === 'fr' ? 'Terminé' : 'Done'}</span>
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-3 h-3 rounded bg-cyan-500/20 border border-cyan-500/30" />
                            <span className="text-gray-500">{language === 'fr' ? 'Actuel' : 'Current'}</span>
                        </span>
                    </div>
                </div>
                <div className="grid grid-cols-6 gap-2">
                    {dayGrid.map(day => {
                        const isCompleted = completedDays.includes(day);
                        const isCurrent = day === Math.min(currentDay, 30);
                        return (
                            <div
                                key={day}
                                className={`aspect-square rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
                                    isCompleted
                                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                        : isCurrent
                                        ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                                        : 'bg-slate-50 dark:bg-white/5 text-gray-500 border border-transparent'
                                }`}
                            >
                                {isCompleted ? <Check size={12} /> : day}
                            </div>
                        );
                    })}
                </div>
            </GlassCard>

            {!isComplete && (
                <>
                    <GlassCard className="border-green-500/30 bg-green-500/5">
                        <h3 className="text-sm font-bold mb-3 flex items-center gap-2 text-slate-900 dark:text-white">
                            <Target size={15} className="text-green-400" />
                            {language === 'fr' ? 'Tâches du Jour ' + currentDay : 'Day ' + currentDay + ' Tasks'}
                            <span className="ml-auto text-xs text-gray-500">
                                {filteredMatches.length} {language === 'fr' ? 'matchs' : 'matches'}
                            </span>
                        </h3>
                        <p className="text-[10px] text-gray-500 mb-3">
                            {language === 'fr'
                                ? 'Misez 1% de votre bankroll sur chaque match.'
                                : 'Bet 1% of your bankroll on each match.'}
                        </p>

                        {filteredMatches.length === 0 ? (
                            <div className="text-center py-6">
                                <p className="text-sm text-gray-500">
                                    {language === 'fr'
                                        ? 'Aucun match disponible aujourd\'hui.'
                                        : 'No matches available today.'}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {filteredMatches.slice(0, 10).map(match => (
                                    <div
                                        key={match.id}
                                        className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                                {match.homeTeam} vs {match.awayTeam}
                                            </p>
                                            <p className="text-[10px] text-gray-500">
                                                {match.prediction} · {match.confidence}% · @{match.odds}
                                            </p>
                                        </div>
                                        <div className="ml-3 text-right">
                                            <p className="text-sm font-bold text-green-400">
                                                {Math.round(unitSize).toLocaleString()} F
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                {filteredMatches.length > 10 && (
                                    <p className="text-xs text-gray-500 text-center py-2">
                                        +{filteredMatches.length - 10} {language === 'fr' ? 'autres matchs' : 'more matches'}
                                    </p>
                                )}
                            </div>
                        )}
                    </GlassCard>

                    <button
                        onClick={handleMarkDayComplete}
                        className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold rounded-xl hover:opacity-90 transition shadow-lg shadow-green-500/20"
                    >
                        {language === 'fr' ? '✓ Jour Terminé - Bankroll +0.79%' : '✓ Day Complete - Bankroll +0.79%'}
                    </button>
                </>
            )}

            {isComplete && (
                <GlassCard className="border-yellow-500/30 bg-yellow-500/5">
                    <div className="text-center">
                        <Sparkles size={32} className="text-yellow-400 mx-auto mb-2" />
                        <p className="text-lg font-bold text-yellow-400 mb-2">
                            {language === 'fr' ? 'Défi Terminé!' : 'Challenge Complete!'}
                        </p>
                        <p className="text-sm text-gray-400">
                            {language === 'fr'
                                ? 'Félicitations! Vous avez terminé le défi.'
                                : 'Congratulations! You completed the challenge.'}
                        </p>
                        <p className="text-3xl font-black font-orbitron text-green-400 mt-3">
                            {Math.round(currentBankroll).toLocaleString()} F
                        </p>
                        <p className="text-sm text-green-400/70 mt-1">
                            {language === 'fr' ? 'Bankroll finale' : 'Final bankroll'}
                        </p>
                    </div>
                </GlassCard>
            )}

            <button
                onClick={handleResetVault}
                className="w-full py-3 border border-red-500/30 text-red-400/70 text-sm font-bold rounded-xl hover:bg-red-500/10 hover:text-red-400 transition"
            >
                {language === 'fr' ? '🗑️ Supprimer le Défi et Recommencer' : '🗑️ Delete Challenge & Start Over'}
            </button>

            <AnimatePresence>
                {showHelp && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
                        onClick={() => setShowHelp(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-white">{vaultExplanation.title}</h3>
                                <button onClick={() => setShowHelp(false)} className="p-1 hover:bg-white/10 rounded-full">
                                    <X size={18} className="text-gray-400" />
                                </button>
                            </div>
                            <p className="text-sm text-cyan-400 font-bold mb-3">{vaultExplanation.headline}</p>
                            <ul className="space-y-2">
                                {vaultExplanation.points.map((point, i) => (
                                    <li key={i} className="text-sm text-gray-300 flex gap-2">
                                        <span className="text-green-400">✓</span>
                                        {point}
                                    </li>
                                ))}
                            </ul>
                            <p className="text-xs text-yellow-400 mt-4 text-center">{vaultExplanation.cta}</p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};