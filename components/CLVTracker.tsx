import React, { useMemo } from 'react';
import { Target, Activity, TrendingUp, AlertTriangle } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

// Generate mock data for the MVP
const MOCK_TRACKER_DATA = Array.from({ length: 15 }, (_, i) => {
    const isWin = Math.random() > 0.4; // 60% win rate
    const placedOdds = 1.8 + Math.random() * 0.5;
    // Model beat the line if closing odds are lower than placed odds
    const beatLine = Math.random() > 0.2; // 80% beat rate
    const closingOdds = beatLine ? placedOdds - (Math.random() * 0.15 + 0.05) : placedOdds + (Math.random() * 0.1);
    const clvPercent = ((placedOdds / closingOdds) - 1) * 100;
    
    return {
        id: `trk-${i}`,
        date: new Date(Date.now() - (i * 86400000)).toLocaleDateString(),
        match: `Team ${String.fromCharCode(65 + (i % 26))} vs Team ${String.fromCharCode(90 - (i % 26))}`,
        pick: 'Home Win',
        placedOdds: placedOdds.toFixed(2),
        closingOdds: closingOdds.toFixed(2),
        clvPercent: clvPercent,
        result: isWin ? 'WON' : 'LOST'
    };
});

export const CLVTracker: React.FC = () => {
    const { language } = useAppContext();

    const stats = useMemo(() => {
        const beatCount = MOCK_TRACKER_DATA.filter(d => d.clvPercent > 0).length;
        const avgBeat = MOCK_TRACKER_DATA.reduce((acc, curr) => acc + curr.clvPercent, 0) / MOCK_TRACKER_DATA.length;
        return {
            total: MOCK_TRACKER_DATA.length,
            beatRate: (beatCount / MOCK_TRACKER_DATA.length) * 100,
            avgBeat
        };
    }, []);

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header Info */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-lg font-black uppercase tracking-wider text-white flex items-center gap-2">
                        <Target size={20} className="text-vantage-cyan" />
                        Closing Line Value (CLV)
                    </h2>
                    <p className="text-xs text-gray-500 mt-1 max-w-lg leading-relaxed">
                        {language === 'fr' 
                            ? "Le CLV mesure notre avantage par rapport au marché. Si notre cote de départ est supérieure à la cote de clôture, nous avons un avantage mathématique." 
                            : "CLV measures our edge against the market. Consistently beating the closing line is the only mathematical proof of a winning model."}
                    </p>
                </div>
                <div className="flex gap-2">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-orange-500/10 text-orange-500 border border-orange-500/20">
                        <AlertTriangle size={12} /> BETA DATA
                    </span>
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-center">
                    <span className="text-[10px] uppercase font-bold text-gray-500 mb-1">Tracked Signals</span>
                    <span className="text-2xl font-black font-mono text-white">{stats.total}</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-center">
                    <span className="text-[10px] uppercase font-bold text-gray-500 mb-1">CLV Beat Rate</span>
                    <span className="text-2xl font-black font-mono text-emerald-500">{stats.beatRate.toFixed(1)}%</span>
                </div>
                <div className="bg-slate-900 border border-vantage-cyan/20 rounded-xl p-4 flex flex-col justify-center relative overflow-hidden">
                    <div className="absolute -right-4 -bottom-4 opacity-10"><TrendingUp size={64} className="text-vantage-cyan" /></div>
                    <span className="text-[10px] uppercase font-bold text-gray-500 mb-1 relative z-10">Avg Edge Created</span>
                    <span className="text-2xl font-black font-mono text-vantage-cyan relative z-10">+{stats.avgBeat.toFixed(2)}%</span>
                </div>
            </div>

            {/* Log Table */}
            <div className="w-full overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 shadow-xl no-scrollbar">
                <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                        <tr className="bg-slate-800/80 text-[10px] uppercase tracking-wider text-gray-400 border-b border-slate-700">
                            <th className="py-3 px-4 font-bold">Date</th>
                            <th className="py-3 px-4 font-bold">Fixture</th>
                            <th className="py-3 px-4 font-bold text-right">Placed At</th>
                            <th className="py-3 px-4 font-bold text-right">Closed At</th>
                            <th className="py-3 px-4 font-bold text-right">CLV Edge</th>
                            <th className="py-3 px-4 font-bold text-center">Result</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {MOCK_TRACKER_DATA.map(log => {
                            const isPositiveEdge = log.clvPercent > 0;
                            return (
                                <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                                    <td className="py-3 px-4 text-xs text-gray-400 font-mono">{log.date}</td>
                                    <td className="py-3 px-4">
                                        <div className="text-xs font-bold text-white">{log.match}</div>
                                        <div className="text-[10px] text-gray-500 mt-0.5">{log.pick}</div>
                                    </td>
                                    <td className="py-3 px-4 text-right font-mono text-sm text-slate-300 font-bold">{log.placedOdds}</td>
                                    <td className="py-3 px-4 text-right font-mono text-sm text-slate-400">{log.closingOdds}</td>
                                    <td className="py-3 px-4 text-right">
                                        <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${isPositiveEdge ? 'bg-vantage-cyan/10 text-vantage-cyan' : 'bg-red-500/10 text-red-400'}`}>
                                            {isPositiveEdge ? '+' : ''}{log.clvPercent.toFixed(2)}%
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${log.result === 'WON' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                                            {log.result}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
