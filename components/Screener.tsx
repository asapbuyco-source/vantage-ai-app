import React, { useState, useMemo } from 'react';
import { Match } from '../types';
import { Filter, SlidersHorizontal, AlertCircle, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

interface ScreenerProps {
    matches: Match[];
}

export const Screener: React.FC<ScreenerProps> = ({ matches }) => {
    const { language } = useAppContext();
    const { userProfile } = useAuth();
    
    const [minEV, setMinEV] = useState<number>(2); // 2% default
    const [minConf, setMinConf] = useState<number>(60);
    const [minOdds, setMinOdds] = useState<number>(1.2);
    const [sportFilter, setSportFilter] = useState<'all' | 'football' | 'basketball' | 'cricket'>('all');
    
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [showFilters, setShowFilters] = useState(true);

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const filteredMatches = useMemo(() => {
        return matches.filter(m => {
            const ev = m.ev_pct ?? ((m.expected_value ?? 0) * 100);
            if (ev < minEV) return false;
            if ((m.confidence || 0) < minConf) return false;
            if ((m.odds || 0) < minOdds) return false;
            if (sportFilter !== 'all' && m.sport !== sportFilter) return false;
            return true;
        }).sort((a, b) => {
            const evA = a.ev_pct ?? ((a.expected_value ?? 0) * 100);
            const evB = b.ev_pct ?? ((b.expected_value ?? 0) * 100);
            return evB - evA;
        });
    }, [matches, minEV, minConf, minOdds, sportFilter]);

    // Risk multiplier for Kelly
    const riskMultipliers = { 'low': 0.25, 'medium': 0.5, 'high': 1.0 };
    const riskMult = userProfile?.riskTolerance ? riskMultipliers[userProfile.riskTolerance] : 0.5;
    const bankroll = userProfile?.portfolioBankroll || 0;

    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            {/* Control Panel */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
                <button 
                    onClick={() => setShowFilters(!showFilters)}
                    className="w-full px-4 py-3 flex items-center justify-between bg-slate-800/50 hover:bg-slate-800 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <SlidersHorizontal size={16} className="text-vantage-cyan" />
                        <span className="font-bold uppercase tracking-wider text-xs text-white">
                            {language === 'fr' ? 'Filtres Quantitatifs' : 'Quantitative Screener'}
                        </span>
                    </div>
                    {showFilters ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                </button>

                {showFilters && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-black/20">
                        {/* EV Slider */}
                        <div>
                            <label className="flex justify-between text-[10px] font-bold text-gray-400 uppercase mb-2">
                                <span>Min EV%</span>
                                <span className="font-mono text-vantage-cyan">+{minEV}%</span>
                            </label>
                            <input 
                                type="range" min="0" max="20" step="0.5" 
                                value={minEV} onChange={e => setMinEV(parseFloat(e.target.value))}
                                className="w-full accent-vantage-cyan"
                            />
                        </div>
                        {/* Confidence Slider */}
                        <div>
                            <label className="flex justify-between text-[10px] font-bold text-gray-400 uppercase mb-2">
                                <span>Min Model Prob</span>
                                <span className="font-mono text-emerald-500">{minConf}%</span>
                            </label>
                            <input 
                                type="range" min="50" max="95" step="1" 
                                value={minConf} onChange={e => setMinConf(parseInt(e.target.value))}
                                className="w-full accent-emerald-500"
                            />
                        </div>
                        {/* Odds Slider */}
                        <div>
                            <label className="flex justify-between text-[10px] font-bold text-gray-400 uppercase mb-2">
                                <span>Min Odds</span>
                                <span className="font-mono text-white">{minOdds.toFixed(2)}x</span>
                            </label>
                            <input 
                                type="range" min="1.0" max="5.0" step="0.1" 
                                value={minOdds} onChange={e => setMinOdds(parseFloat(e.target.value))}
                                className="w-full accent-slate-300"
                            />
                        </div>
                        {/* Sport Filter */}
                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Sport</label>
                            <select 
                                value={sportFilter} 
                                onChange={e => setSportFilter(e.target.value as any)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold py-1.5 px-2 text-white outline-none focus:border-vantage-cyan"
                            >
                                <option value="all">All Markets</option>
                                <option value="football">Football</option>
                                <option value="basketball">Basketball</option>
                                <option value="cricket">Cricket</option>
                            </select>
                        </div>
                    </div>
                )}
            </div>

            {/* Results Header */}
            <div className="flex items-center justify-between px-1">
                <span className="text-xs text-gray-500">
                    Showing <strong className="text-vantage-cyan">{filteredMatches.length}</strong> anomalies
                </span>
                {bankroll === 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-500/20">
                        <AlertCircle size={10} /> Bankroll not configured for Kelly
                    </span>
                )}
            </div>

            {/* Data Table */}
            <div className="w-full overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 shadow-xl no-scrollbar">
                <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                        <tr className="bg-slate-800/80 text-[10px] uppercase tracking-wider text-gray-400 border-b border-slate-700">
                            <th className="py-3 px-4 font-bold">Time / League</th>
                            <th className="py-3 px-4 font-bold">Fixture</th>
                            <th className="py-3 px-4 font-bold">Target Market</th>
                            <th className="py-3 px-4 font-bold text-right">Odds</th>
                            <th className="py-3 px-4 font-bold text-center">Model / Implied</th>
                            <th className="py-3 px-4 font-bold text-right">EV</th>
                            <th className="py-3 px-4 font-bold text-right">Kelly Stake</th>
                            <th className="py-3 px-4"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {filteredMatches.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="py-12 text-center text-gray-500 text-sm">
                                    No anomalies match current parameters.
                                </td>
                            </tr>
                        ) : (
                            filteredMatches.map(m => {
                                const ev = m.ev_pct ?? ((m.expected_value ?? 0) * 100);
                                const conf = m.confidence || 0;
                                const odds = m.odds || 0;
                                const implied = odds > 0 ? (1 / odds) * 100 : 0;
                                const kelly = m.kelly_stake || 0;
                                const stakeAmt = bankroll > 0 ? Math.round(bankroll * (kelly / 100) * riskMult) : 0;
                                
                                const teamString = `${m.home_team || m.homeTeam} v ${m.away_team || m.awayTeam}`;
                                const predictionStr = m.prediction_en || m.prediction || m.bet_type;

                                return (
                                    <tr key={m.id || m.fixture_id} className="hover:bg-slate-800/40 transition-colors group">
                                        <td className="py-3 px-4">
                                            <div className="text-xs text-white truncate max-w-[120px]">{m.league}</div>
                                            <div className="text-[10px] text-gray-500 font-mono mt-0.5">{m.kickoff_local || m.time}</div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="text-xs font-bold text-white whitespace-nowrap">{teamString}</div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap">
                                                {predictionStr}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <span className="font-mono text-sm font-bold text-white">{odds.toFixed(2)}</span>
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <span className="font-mono text-xs text-emerald-400 font-bold">{conf}%</span>
                                                <span className="text-gray-600">/</span>
                                                <span className="font-mono text-xs text-gray-400">{implied.toFixed(1)}%</span>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded ${ev > 5 ? 'bg-vantage-cyan/10 text-vantage-cyan' : 'text-emerald-500'}`}>
                                                +{ev.toFixed(1)}%
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            {stakeAmt > 0 ? (
                                                <span className="font-mono text-xs text-slate-300">{stakeAmt.toLocaleString()}</span>
                                            ) : (
                                                <span className="font-mono text-xs text-gray-500">{kelly.toFixed(1)}%</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <button 
                                                onClick={() => handleCopy(`${teamString} - ${predictionStr} @ ${odds.toFixed(2)}`, m.id || m.fixture_id as any)}
                                                className="p-1.5 rounded bg-slate-800 hover:bg-vantage-cyan/20 text-gray-400 hover:text-vantage-cyan transition-colors"
                                                title="Copy Signal"
                                            >
                                                {copiedId === (m.id || m.fixture_id) ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
