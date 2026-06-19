import React from 'react';
import { LineupPlayer } from '../services/sportsData';
import { motion } from 'framer-motion';

interface VisualPitchProps {
    homeTeamName: string;
    awayTeamName: string;
    homeLineup: LineupPlayer[];
    awayLineup: LineupPlayer[];
}

export const VisualPitch: React.FC<VisualPitchProps> = ({ homeTeamName, awayTeamName, homeLineup, awayLineup }) => {

    const parseGrid = (gridStr: string | undefined, isHome: boolean) => {
        if (!gridStr) return { row: 0, col: 0 };
        const [r, c] = gridStr.split(':').map(v => parseInt(v, 10));
        let row = r || 1;
        const col = c || 1;
        // Mirror away team rows so they attack toward the top
        if (!isHome) row = 6 - row;
        return { row, col };
    };

    const renderPlayer = (player: LineupPlayer, i: number, isHome: boolean) => {
        const { row, col } = parseGrid(player.grid, isHome);
        if (row === 0) return null;

        // Vertical placement: home occupies bottom half, away top half
        const topPct = isHome ? 100 - row * 16 : row * 16;

        // Horizontal: count siblings in same original row for even spacing
        const rowKey = player.grid?.split(':')[0] ?? '';
        const teamLineup = isHome ? homeLineup : awayLineup;
        const siblings = teamLineup.filter(p => (p.grid?.split(':')[0] ?? '') === rowKey);
        const total = siblings.length || 1;
        const leftPct = total === 1 ? 50 : 10 + (col - 1) * (80 / Math.max(total - 1, 1));

        const bubbleClass = isHome
            ? 'bg-cyan-500 border-cyan-300 shadow-cyan-500/40'
            : 'bg-purple-500 border-purple-300 shadow-purple-500/40';

        return (
            <motion.div
                key={`${isHome ? 'h' : 'a'}-${i}`}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.04, type: 'spring', stiffness: 280 }}
                className="absolute flex flex-col items-center"
                style={{ top: `${topPct}%`, left: `${leftPct}%`, transform: 'translate(-50%,-50%)', zIndex: 10 }}
            >
                <div className={`w-7 h-7 md:w-9 md:h-9 rounded-full border-2 flex items-center justify-center text-[10px] md:text-xs font-black text-white shadow-lg ${bubbleClass}`}>
                    {player.number ?? '?'}
                </div>
                <div className="mt-0.5 px-1 rounded bg-black/70 backdrop-blur-sm text-[8px] text-white font-bold max-w-[56px] truncate text-center leading-[1.3]">
                    {player.name.split(' ').pop()}
                </div>
            </motion.div>
        );
    };

    const hasGridData = homeLineup.some(p => p.grid) || awayLineup.some(p => p.grid);

    return (
        <div className="space-y-2">
            {/* Legend */}
            <div className="flex items-center justify-between text-xs font-bold px-1 select-none">
                <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-full bg-cyan-500 shadow-sm shadow-cyan-500/60 inline-block" />
                    {homeTeamName}
                </span>
                <span className="text-gray-500 text-[10px] uppercase tracking-widest">vs</span>
                <span className="flex items-center gap-1.5">
                    {awayTeamName}
                    <span className="w-3 h-3 rounded-full bg-purple-500 shadow-sm shadow-purple-500/60 inline-block" />
                </span>
            </div>

            {/* Pitch field */}
            <div className="relative w-full bg-[#1a5c2a] rounded-xl overflow-hidden border-2 border-white/20 shadow-2xl" style={{ aspectRatio: '2/3', maxHeight: 520 }}>

                {/* Pitch markings (non-interactive) */}
                <div className="absolute inset-0 pointer-events-none">
                    {/* alternating grass stripes */}
                    {[...Array(10)].map((_, i) => (
                        <div key={i} className={`absolute w-full ${i % 2 === 0 ? 'bg-white/[0.04]' : ''}`} style={{ top: `${i * 10}%`, height: '10%' }} />
                    ))}
                    {/* Center line */}
                    <div className="absolute top-1/2 left-0 right-0 h-px bg-white/40" />
                    {/* Center circle */}
                    <div className="absolute top-1/2 left-1/2 w-24 h-24 rounded-full border-2 border-white/30" style={{ transform: 'translate(-50%,-50%)' }} />
                    <div className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full bg-white/60" style={{ transform: 'translate(-50%,-50%)' }} />
                    {/* Penalty boxes */}
                    <div className="absolute top-0 left-1/2 w-[55%] h-[15%] border-2 border-t-0 border-white/30" style={{ transform: 'translateX(-50%)' }} />
                    <div className="absolute top-0 left-1/2 w-[25%] h-[6%] border-2 border-t-0 border-white/30" style={{ transform: 'translateX(-50%)' }} />
                    <div className="absolute bottom-0 left-1/2 w-[55%] h-[15%] border-2 border-b-0 border-white/30" style={{ transform: 'translateX(-50%)' }} />
                    <div className="absolute bottom-0 left-1/2 w-[25%] h-[6%] border-2 border-b-0 border-white/30" style={{ transform: 'translateX(-50%)' }} />
                </div>

                {/* Players */}
                {awayLineup.map((p, i) => renderPlayer(p, i, false))}
                {homeLineup.map((p, i) => renderPlayer(p, i, true))}

                {/* Fallback overlay when grid data is missing */}
                {!hasGridData && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm rounded-xl">
                        <div className="bg-white/10 border border-white/20 px-5 py-4 rounded-xl text-center">
                            <p className="text-white font-bold text-sm">Formation Data Unavailable</p>
                            <p className="text-gray-300 text-xs mt-1">See the Starting XI list below.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
