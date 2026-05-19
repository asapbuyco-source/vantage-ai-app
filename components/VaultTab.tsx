import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Unlock, CheckCircle2, XCircle, RefreshCw, TrendingUp, TrendingDown, Minus, Calendar, ChevronDown, ChevronUp, Pencil, Info, AlertTriangle } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { VaultPick, VaultDay } from '../types';
import { getVaultDay, saveVaultDay, confirmVaultBet } from '../services/db';

const DEFAULT_BANKROLL = 10000;

function getTodayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function calcBankrollEnd(picks: VaultPick[], startBankroll: number): number {
    let bankroll = startBankroll;
    for (const pick of picks) {
        if (!pick.confirmed) continue;
        if (pick.result === 'pending') continue;
        bankroll += pick.profit ?? 0;
    }
    return bankroll;
}

function dayNumber(startDate: string): number {
    const start = new Date(startDate);
    const now = new Date();
    const diff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(1, diff + 1);
}

export const VaultTab: React.FC<{ quantPredictions: any[], onEditBankroll?: () => void }> = ({ quantPredictions, onEditBankroll }) => {
    const { language } = useAppContext();
    const { user, userProfile } = useAuth();

    const [vaultDay, setVaultDay] = useState<VaultDay | null>(null);
    const [loading, setLoading] = useState(false);
    const [confirming, setConfirming] = useState<string | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [showInfo, setShowInfo] = useState(false);

    const todayKey = getTodayKey();
    const vaultStartDate = userProfile?.vaultProgress?.startDate || user?.metadata?.creationTime?.split('T')[0] || todayKey;
    const currentDay = dayNumber(vaultStartDate);
    const bankrollStart = userProfile?.portfolioBankroll || DEFAULT_BANKROLL;

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        getVaultDay(user.uid, todayKey).then(day => {
            if (day) {
                setVaultDay(day as VaultDay);
            } else {
                autoPopulate();
            }
        }).finally(() => setLoading(false));
    }, [user, todayKey]);

    const autoPopulate = async () => {
        if (!user || quantPredictions.length === 0) {
            const empty: VaultDay = {
                dayNumber: currentDay,
                dateKey: todayKey,
                picks: [],
                bankrollStart,
                bankrollEnd: bankrollStart,
                status: 'active'
            };
            setVaultDay(empty);
            await saveVaultDay(user!.uid, todayKey, empty);
            return;
        }

        const topPicks = quantPredictions
            .filter(m => (m.ev_pct ?? ((m.expected_value ?? 0) * 100)) >= 2)
            .slice(0, 3);

        const picks: VaultPick[] = topPicks.map(m => ({
            fixtureId: m.fixture_id || m.id,
            homeTeam: m.home_team || m.homeTeam,
            awayTeam: m.away_team || m.awayTeam,
            market: m.prediction_en || m.prediction || m.bet_type,
            odds: m.odds || 1.5,
            kellyStakePct: m.kelly_stake || 0,
            stakeAmount: Math.round(bankrollStart * ((m.kelly_stake || 0) / 100)),
            result: 'pending',
            profit: null,
            confirmed: false
        }));

        const day: VaultDay = {
            dayNumber: currentDay,
            dateKey: todayKey,
            picks,
            bankrollStart,
            bankrollEnd: bankrollStart,
            status: 'active'
        };
        setVaultDay(day);
        await saveVaultDay(user!.uid, todayKey, day);
    };

    const handleConfirmBet = async (fixtureId: string) => {
        if (!user || !vaultDay) return;
        setConfirming(fixtureId);
        try {
            await confirmVaultBet(user.uid, todayKey, fixtureId);
            const updated: VaultDay = {
                ...vaultDay,
                picks: vaultDay.picks.map(p => p.confirmed ? p : { ...p, confirmed: true })
            };
            setVaultDay(updated);
        } finally {
            setConfirming(null);
        }
    };

    const currentBankroll = vaultDay ? calcBankrollEnd(vaultDay.picks, bankrollStart) : bankrollStart;
    const pnl = currentBankroll - bankrollStart;
    const pnlPct = ((pnl / bankrollStart) * 100).toFixed(1);

    const chartData = useMemo(() => {
        if (!vaultDay) return { path: '', labels: [] };
        const confirmedPicks = vaultDay.picks.filter(p => p.confirmed && p.result !== 'pending');
        if (confirmedPicks.length === 0) return { path: '', labels: [] };

        const maxY = bankrollStart * 1.5;
        const minY = bankrollStart * 0.5;
        const range = maxY - minY;

        const points: [number, number][] = [];
        let runningBankroll = bankrollStart;

        for (let i = 0; i < vaultDay.picks.length; i++) {
            const p = vaultDay.picks[i];
            if (p.confirmed) {
                runningBankroll += p.profit ?? 0;
                points.push([(i + 1) / vaultDay.picks.length * 100, 100 - ((runningBankroll - minY) / range * 100)]);
            }
        }

        if (points.length === 0) return { path: '', labels: [] };

        const path = points.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt[0]},${pt[1]}`).join(' ');
        return { path, labels: [] };
    }, [vaultDay]);

    const confirmedCount = vaultDay?.picks.filter(p => p.confirmed).length || 0;
    const wonCount = vaultDay?.picks.filter(p => p.result === 'won').length || 0;
    const lostCount = vaultDay?.picks.filter(p => p.result === 'lost').length || 0;
    const pendingCount = vaultDay?.picks.filter(p => p.result === 'pending').length || 0;

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <RefreshCw size={24} className="animate-spin text-vantage-cyan" />
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                        <TrendingUp size={20} className="text-emerald-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white">
                            {language === 'fr' ? `Jour ${currentDay}` : `Day ${currentDay}`}
                        </h3>
                        <span className="text-[10px] text-gray-500 font-mono">{todayKey}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowInfo(!showInfo)}
                        className={`text-[10px] font-bold flex items-center gap-1 transition-colors ${showInfo ? 'text-amber-500' : 'text-gray-400 hover:text-white'}`}
                    >
                        <Info size={14} /> {language === 'fr' ? 'Règles' : 'Rules'}
                    </button>
                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        className="text-[10px] font-bold text-gray-400 hover:text-white flex items-center gap-1 ml-2"
                    >
                        <Calendar size={12} /> {showHistory ? 'Hide' : 'History'}
                        {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                </div>
            </div>

            <AnimatePresence>
                {showInfo && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2 mb-2">
                            <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                            <div>
                                <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wide">
                                    {language === 'fr' ? 'RÈGLE CRITIQUE : NE PAS COMBINER' : 'CRITICAL RULE: DO NOT ACCUMULATE'}
                                </h4>
                                <p className="text-[11px] text-amber-500/80 leading-relaxed mt-1">
                                    {language === 'fr' 
                                        ? 'Jouez chaque pick du Vault comme un pari SIMPLE. La taille de mise Kelly (Stake) est calculée mathématiquement pour des événements individuels. Combiner ces paris détruit l\'avantage mathématique et garantit une perte à long terme.' 
                                        : 'Play every Vault pick as a SINGLE bet. The Kelly Stake size is mathematically calculated for individual events. Accumulating these picks destroys the mathematical edge and guarantees a long-term loss.'}
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-800/50 rounded-xl p-3 text-center border border-slate-700">
                    <div className={`text-lg font-bold font-mono ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {pnl >= 0 ? '+' : ''}{pnlPct}%
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                        {language === 'fr' ? 'P&L' : 'P&L'}
                    </div>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-3 text-center border border-slate-700 relative">
                    {onEditBankroll && (
                        <button 
                            onClick={onEditBankroll}
                            className="absolute top-2 right-2 p-1 rounded hover:bg-slate-700 text-gray-500 hover:text-white transition-colors"
                            title="Edit Bankroll"
                        >
                            <Pencil size={10} />
                        </button>
                    )}
                    <div className="text-lg font-bold font-mono text-white">
                        {currentBankroll.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                        {language === 'fr' ? 'Bankroll' : 'Bankroll'}
                    </div>
                </div>
                <div className="bg-slate-800/50 rounded-xl p-3 text-center border border-slate-700">
                    <div className="text-lg font-bold font-mono text-vantage-cyan">
                        {vaultDay?.picks.length || 0}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                        {language === 'fr' ? 'Picks' : 'Picks'}
                    </div>
                </div>
            </div>

            {chartData.path && (
                <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                        {language === 'fr' ? 'Courbe du bankroll' : 'Bankroll Curve'}
                    </div>
                    <svg viewBox="0 0 100 50" className="w-full h-16" preserveAspectRatio="none">
                        <line x1="0" y1="25" x2="100" y2="25" stroke="#334155" strokeWidth="0.3" strokeDasharray="2,2" />
                        <polyline
                            points={chartData.path.replace(/[\d.]+,[\d.]+/g, (m) => {
                                const [x, y] = m.split(',').map(Number);
                                return `${x},${Math.max(5, Math.min(45, y))}`;
                            })}
                            fill="none"
                            stroke="#22d3ee"
                            strokeWidth="1.5"
                            vectorEffect="non-scaling-stroke"
                        />
                    </svg>
                </div>
            )}

            <div className="flex items-center gap-2 text-[10px] text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> {language === 'fr' ? 'Gagnés' : 'Won'}: {wonCount}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500"></span> {language === 'fr' ? 'Perdus' : 'Lost'}: {lostCount}</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-500"></span> {language === 'fr' ? 'En attente' : 'Pending'}: {pendingCount}</span>
                <span className="flex items-center gap-1 ml-auto"><span className="w-2 h-2 rounded-full bg-amber-500"></span> {language === 'fr' ? 'Confirmés' : 'Confirmed'}: {confirmedCount}</span>
            </div>

            {vaultDay?.picks.length === 0 ? (
                <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700 text-center">
                    <div className="text-gray-400 text-sm font-bold mb-1">
                        {language === 'fr' ? 'Aucun pick disponible' : 'No picks available today'}
                    </div>
                    <div className="text-gray-500 text-xs">
                        {language === 'fr' ? "Revenez demain pour les nouveaux picks." : "Check back tomorrow for new picks."}
                    </div>
                </div>
            ) : (
                <div className="space-y-2">
                    {vaultDay?.picks.map((pick, i) => {
                        const isConfirmed = pick.confirmed;
                        const isPending = pick.result === 'pending';
                        const isWon = pick.result === 'won';
                        const isLost = pick.result === 'lost';
                        const isVoid = pick.result === 'void';

                        return (
                            <motion.div
                                key={pick.fixtureId}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className={`rounded-xl border p-3 ${
                                    isWon ? 'bg-emerald-500/5 border-emerald-500/20' :
                                    isLost ? 'bg-rose-500/5 border-rose-500/20' :
                                    isVoid ? 'bg-amber-500/5 border-amber-500/20' :
                                    'bg-slate-800/30 border-slate-700/50'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold text-white truncate">
                                            {pick.homeTeam} vs {pick.awayTeam}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                                                {pick.market}
                                            </span>
                                            <span className="text-[10px] font-mono text-vantage-cyan">
                                                @ {pick.odds.toFixed(2)}
                                            </span>
                                            {pick.kellyStakePct > 0 && (
                                                <span className="text-[10px] text-gray-500">
                                                    • {pick.kellyStakePct.toFixed(1)}% Kelly
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {isWon && (
                                            <div className="flex items-center gap-1 text-emerald-400">
                                                <TrendingUp size={12} /> <span className="text-[10px] font-bold">WON</span>
                                            </div>
                                        )}
                                        {isLost && (
                                            <div className="flex items-center gap-1 text-rose-400">
                                                <TrendingDown size={12} /> <span className="text-[10px] font-bold">LOST</span>
                                            </div>
                                        )}
                                        {isVoid && (
                                            <div className="flex items-center gap-1 text-amber-400">
                                                <Minus size={12} /> <span className="text-[10px] font-bold">VOID</span>
                                            </div>
                                        )}
                                        {isPending && !isConfirmed && (
                                            <button
                                                onClick={() => handleConfirmBet(pick.fixtureId)}
                                                disabled={confirming === pick.fixtureId}
                                                className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-vantage-purple/20 text-vantage-purple hover:bg-vantage-purple/30 disabled:opacity-50 transition-colors"
                                            >
                                                {confirming === pick.fixtureId ? (
                                                    <RefreshCw size={10} className="animate-spin" />
                                                ) : (
                                                    <CheckCircle2 size={10} />
                                                )}
                                                {language === 'fr' ? 'Pari-placé' : 'Bet Placed'}
                                            </button>
                                        )}
                                        {isPending && isConfirmed && (
                                            <div className="flex items-center gap-1 text-amber-400">
                                                <CheckCircle2 size={12} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {isPending && pick.stakeAmount > 0 && (
                                    <div className="mt-1.5 text-[10px] text-gray-500 font-mono">
                                        Stake: {pick.stakeAmount.toLocaleString()} FCFA
                                        {pick.profit !== null && (
                                            <span className={pick.profit >= 0 ? 'text-emerald-400 ml-2' : 'text-rose-400 ml-2'}>
                                                {pick.profit >= 0 ? '+' : ''}{pick.profit.toLocaleString()} FCFA
                                            </span>
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        );
                    })}
                </div>
            )}

            <button
                onClick={autoPopulate}
                className="w-full py-2.5 rounded-xl border border-dashed border-slate-700 text-[10px] font-bold text-gray-500 hover:text-white hover:border-slate-500 transition-colors flex items-center justify-center gap-1.5"
            >
                <RefreshCw size={12} />
                {language === 'fr' ? 'Régénérer les picks' : 'Refresh picks from today'}
            </button>
        </div>
    );
};