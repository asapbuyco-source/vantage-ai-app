import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Calculator, X, TrendingUp } from 'lucide-react';

interface ArbCalculatorProps {
    arb: any;
    onClose: () => void;
}

export const ArbCalculator: React.FC<ArbCalculatorProps> = ({ arb, onClose }) => {
    const [totalStake, setTotalStake] = useState('50000');
    
    const parsedStake = parseFloat(totalStake) || 0;
    
    // To calculate stakes for arbitrage:
    // Implied probability of a leg = 1 / odds
    // Total Implied Prob = sum(1 / odds)
    // Individual Stake = (Total Investment * Implied Prob) / Total Implied Prob
    
    const impliedProbs = arb.legs.map((leg: any) => 1 / leg.odds);
    const totalImpliedProb = impliedProbs.reduce((a: number, b: number) => a + b, 0);
    
    const stakes = arb.legs.map((leg: any, index: number) => {
        return (parsedStake * impliedProbs[index]) / totalImpliedProb;
    });

    const guaranteedReturn = parsedStake > 0 ? (stakes[0] * arb.legs[0].odds) : 0;
    const netProfit = guaranteedReturn - parsedStake;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md overflow-hidden relative"
            >
                <div className="flex justify-between items-center p-4 border-b border-white/10 bg-black/20">
                    <div className="flex items-center gap-2">
                        <Calculator size={18} className="text-vantage-cyan" />
                        <h3 className="font-bold text-white">Surebet Calculator</h3>
                    </div>
                    <button onClick={onClose} className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-white/10">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-5 space-y-6">
                    <div className="text-center space-y-1">
                        <p className="text-sm font-bold text-white">{arb.match}</p>
                        <span className="inline-flex px-2 py-1 bg-green-500/10 text-green-400 text-xs font-bold rounded border border-green-500/20">
                            {arb.profit_margin}% Guaranteed Profit
                        </span>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Total Investment (FCFA)</label>
                        <input 
                            type="number" 
                            value={totalStake}
                            onChange={(e) => setTotalStake(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-vantage-cyan"
                        />
                    </div>

                    <div className="space-y-3">
                        <label className="block text-xs font-bold text-gray-400 uppercase">Exact Stake Distribution</label>
                        {arb.legs.map((leg: any, i: number) => (
                            <div key={i} className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5">
                                <div>
                                    <p className="text-xs font-bold text-gray-400">{leg.bookmaker}</p>
                                    <p className="text-sm font-bold text-white">{leg.selection} @ {leg.odds}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-gray-500 mb-0.5">Bet exactly:</p>
                                    <p className="text-lg font-black font-orbitron text-vantage-cyan">
                                        {Math.round(stakes[i]).toLocaleString()} F
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="pt-4 border-t border-white/10">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-400 font-bold">Guaranteed Return:</span>
                            <span className="text-xl font-black text-white font-orbitron">
                                {Math.round(guaranteedReturn).toLocaleString()} F
                            </span>
                        </div>
                        <div className="flex justify-between items-center mt-1">
                            <span className="text-sm text-gray-400 font-bold">Net Profit:</span>
                            <span className="text-lg font-black text-green-400 font-orbitron flex items-center gap-1">
                                <TrendingUp size={14} />
                                +{Math.round(netProfit).toLocaleString()} F
                            </span>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
