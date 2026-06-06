import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, ChevronLeft, RefreshCw, Zap, TrendingUp, AlertTriangle } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { ArbCalculator } from '../components/ArbCalculator';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebaseConfig';
import { collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { NavigationTab } from '../types';

interface ArbFinderProps {
    setTab: (tab: NavigationTab) => void;
}

export const ArbFinder: React.FC<ArbFinderProps> = ({ setTab }) => {
    const { t, language } = useAppContext();
    const { userProfile } = useAuth();
    
    const [arbs, setArbs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedArb, setSelectedArb] = useState<any | null>(null);

    const isVip = userProfile?.isVip;

    useEffect(() => {
        if (!isVip) {
            setLoading(false);
            return;
        }

        const q = query(
            collection(db, 'arbitrage_bets'),
            orderBy('timestamp', 'desc'),
            limit(20)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedArbs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as any));
            
            // Filter out arbs older than 15 minutes (900 seconds)
            const now = Date.now() / 1000;
            const validArbs = fetchedArbs.filter(arb => (now - arb.timestamp) < 900);
            
            setArbs(validArbs);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching arbs:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [isVip]);

    if (!isVip) {
        return (
            <div className="space-y-5 pb-24 flex flex-col items-center justify-center pt-20">
                <ShieldCheck size={48} className="text-gray-400 mb-4" />
                <h1 className="text-2xl font-bold font-orbitron text-slate-900 dark:text-white">
                    ARB <span className="text-vantage-cyan">FINDER</span>
                </h1>
                <p className="text-gray-500 text-center max-w-xs mt-2">
                    {language === 'fr' 
                        ? 'Le scanner d\'Arbitrage (Surebet) est réservé aux abonnés VIP.' 
                        : 'The Arbitrage (Surebet) scanner is restricted to VIP subscribers.'}
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
                <div className="flex-1">
                    <h1 className="text-2xl font-bold font-orbitron text-slate-900 dark:text-white flex items-center gap-2">
                        ARB <span className="text-vantage-cyan">FINDER</span>
                    </h1>
                    <p className="text-xs text-gray-500">Live Surebet Scanner</p>
                </div>
                {loading && <RefreshCw size={18} className="text-vantage-cyan animate-spin" />}
            </div>

            <GlassCard className="border-vantage-cyan/20 bg-vantage-cyan/5">
                <div className="flex gap-3 items-start">
                    <Zap size={16} className="text-vantage-cyan shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-400 leading-relaxed">
                        {language === 'fr'
                            ? 'L\'IA scanne plusieurs bookmakers en temps réel pour trouver des écarts de cotes où un staking discipliné peut verrouiller un petit edge.'
                            : 'The AI scans multiple bookmakers in real-time to find odds discrepancies where disciplined stake sizing can lock in a small edge.'}
                    </p>
                </div>
            </GlassCard>

            <div className="space-y-4">
                {arbs.length === 0 && !loading ? (
                    <div className="text-center py-12 px-4 border border-dashed border-gray-300 dark:border-white/10 rounded-2xl">
                        <TrendingUp size={32} className="text-gray-400 mx-auto mb-3 opacity-50" />
                        <h3 className="text-sm font-bold text-slate-700 dark:text-gray-300 mb-1">
                            {language === 'fr' ? 'Aucune opportunité' : 'No Arbs Available'}
                        </h3>
                        <p className="text-xs text-gray-500">
                            {language === 'fr' 
                                ? 'L\'algorithme scanne les marchés. Les opportunités d\'arbitrage apparaissent et disparaissent rapidement.' 
                                : 'The algorithm is scanning the markets. Arbitrage opportunities appear and disappear rapidly.'}
                        </p>
                    </div>
                ) : (
                    arbs.map((arb) => (
                        <motion.div 
                            key={arb.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            <GlassCard className="overflow-hidden p-0">
                                <div className="p-4 border-b border-gray-100 dark:border-white/5 flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                            <span className="text-[10px] font-bold text-gray-500 uppercase">Live Arb</span>
                                        </div>
                                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{arb.match}</h3>
                                    </div>
                                    <div className="bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-lg text-center">
                                        <p className="text-xs text-green-500 font-bold">{arb.profit_margin}%</p>
                                        <p className="text-[9px] text-green-500/70 uppercase">Profit</p>
                                    </div>
                                </div>
                                
                                <div className="p-4 bg-slate-50 dark:bg-black/20">
                                    <div className="space-y-2 mb-4">
                                        {arb.legs.map((leg: any, idx: number) => (
                                            <div key={idx} className="flex justify-between items-center text-xs">
                                                <span className="text-gray-500">{leg.selection}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-700 dark:text-gray-300">{leg.bookmaker}</span>
                                                    <span className="bg-white dark:bg-white/10 px-2 py-0.5 rounded font-mono font-bold text-slate-900 dark:text-white">{leg.odds}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    <button 
                                        onClick={() => setSelectedArb(arb)}
                                        className="w-full py-2.5 bg-vantage-cyan/10 hover:bg-vantage-cyan/20 text-vantage-cyan font-bold text-xs rounded-xl transition-colors border border-vantage-cyan/20"
                                    >
                                        {language === 'fr' ? 'Calculer les Mises' : 'Calculate Stakes'}
                                    </button>
                                </div>
                            </GlassCard>
                        </motion.div>
                    ))
                )}
            </div>

            {selectedArb && (
                <ArbCalculator 
                    arb={selectedArb} 
                    onClose={() => setSelectedArb(null)} 
                />
            )}
        </div>
    );
};
