import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, TrendingUp, Target, ChevronDown, Loader2, Star } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import {
    getStandingsFromCache,
    getTopScorersFromCache,
    getLeaguesFromCache,
    StandingRow,
    TopScorerRow,
    LeagueMeta,
} from '../services/sportsData';
import { NavigationTab } from '../types';

interface Props {
    setTab?: (tab: NavigationTab) => void;
}

const LEAGUE_OPTIONS = [
    { id: 8,   name: 'Premier League',  flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
    { id: 82,  name: 'Bundesliga',      flag: '🇩🇪' },
    { id: 301, name: 'La Liga',         flag: '🇪🇸' },
    { id: 384, name: 'Serie A',         flag: '🇮🇹' },
    { id: 2,   name: 'Ligue 1',         flag: '🇫🇷' },
    { id: 5,   name: 'Eredivisie',      flag: '🇳🇱' },
    { id: 72,  name: 'Primeira Liga',   flag: '🇵🇹' },
    { id: 564, name: 'Championship',    flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
];

type ActiveView = 'table' | 'scorers';

function FormBadge({ result }: { result: string }) {
    const color =
        result === 'W' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
        result === 'L' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                         'bg-gray-500/20 text-gray-400 border-gray-500/30';
    return (
        <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold border ${color}`}>
            {result}
        </span>
    );
}

export const LeagueTables: React.FC<Props> = ({ setTab }) => {
    const { language } = useAppContext();
    const [selectedLeague, setSelectedLeague] = useState(LEAGUE_OPTIONS[0]);
    const [view, setView] = useState<ActiveView>('table');
    const [standings, setStandings] = useState<StandingRow[]>([]);
    const [scorers, setScorers] = useState<TopScorerRow[]>([]);
    const [leagueMeta, setLeagueMeta] = useState<LeagueMeta | null>(null);
    const [loading, setLoading] = useState(true);
    const [showLeagueDropdown, setShowLeagueDropdown] = useState(false);
    const fr = language === 'fr';

    useEffect(() => {
        setLoading(true);
        Promise.all([
            getStandingsFromCache(selectedLeague.id),
            getTopScorersFromCache(selectedLeague.id),
            getLeaguesFromCache(),
        ]).then(([s, sc, leagues]) => {
            setStandings(s);
            setScorers(sc);
            setLeagueMeta(leagues[selectedLeague.id] || null);
        }).finally(() => setLoading(false));
    }, [selectedLeague.id]);

    const positionColor = (pos: number) => {
        if (pos <= 4) return 'text-vantage-cyan';
        if (pos <= 6) return 'text-purple-400';
        if (pos >= standings.length - 2) return 'text-red-400';
        return 'text-gray-400';
    };

    const positionBg = (pos: number) => {
        if (pos <= 4) return 'bg-vantage-cyan/10 border-l-2 border-vantage-cyan/40';
        if (pos <= 6) return 'bg-purple-500/5 border-l-2 border-purple-500/30';
        if (pos >= standings.length - 2) return 'bg-red-500/5 border-l-2 border-red-500/20';
        return '';
    };

    return (
        <div className="space-y-5 pb-10">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-orbitron font-bold tracking-tight bg-gradient-to-r from-vantage-cyan to-vantage-purple bg-clip-text text-transparent">
                        {fr ? 'Classements' : 'League Tables'}
                    </h1>
                    <p className="text-xs text-gray-500 mt-0.5">
                        {fr ? 'Données mises à jour chaque semaine' : 'Updated weekly from Sportmonks'}
                    </p>
                </div>
                {leagueMeta?.logo && (
                    <img src={leagueMeta.logo} alt={selectedLeague.name} className="w-10 h-10 object-contain opacity-80" />
                )}
            </div>

            {/* League Selector */}
            <div className="relative">
                <button
                    onClick={() => setShowLeagueDropdown(p => !p)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm font-bold hover:bg-white/10 transition-colors"
                >
                    <span>{selectedLeague.flag} {selectedLeague.name}</span>
                    <ChevronDown size={16} className={`text-gray-400 transition-transform ${showLeagueDropdown ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                    {showLeagueDropdown && (
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.15 }}
                            className="absolute top-full left-0 right-0 z-20 mt-1 rounded-xl bg-[#1a1d25] border border-white/10 overflow-hidden shadow-2xl"
                        >
                            {LEAGUE_OPTIONS.map(l => (
                                <button
                                    key={l.id}
                                    onClick={() => { setSelectedLeague(l); setShowLeagueDropdown(false); }}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium hover:bg-white/5 transition-colors text-left ${selectedLeague.id === l.id ? 'text-vantage-cyan bg-vantage-cyan/5' : 'text-gray-300'}`}
                                >
                                    <span>{l.flag}</span>
                                    <span>{l.name}</span>
                                    {selectedLeague.id === l.id && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-vantage-cyan" />}
                                </button>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* View Toggle */}
            <div className="flex gap-2 p-1 bg-white/5 rounded-xl border border-white/5">
                {([
                    { id: 'table', icon: Trophy, label: fr ? 'Classement' : 'Table' },
                    { id: 'scorers', icon: Target, label: fr ? 'Buteurs' : 'Top Scorers' },
                ] as { id: ActiveView; icon: any; label: string }[]).map(v => (
                    <button
                        key={v.id}
                        onClick={() => setView(v.id)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${
                            view === v.id
                                ? 'bg-vantage-cyan/15 text-vantage-cyan border border-vantage-cyan/30 shadow-inner'
                                : 'text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        <v.icon size={14} />
                        {v.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-3">
                    <Loader2 className="w-8 h-8 text-vantage-cyan animate-spin" />
                    <p className="text-sm text-gray-500 animate-pulse">
                        {fr ? 'Chargement...' : 'Loading...'}
                    </p>
                </div>
            ) : (
                <AnimatePresence mode="wait">
                    <motion.div
                        key={view}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                    >
                        {/* ── LEAGUE TABLE ── */}
                        {view === 'table' && (
                            <div className="rounded-2xl bg-white/3 border border-white/8 overflow-hidden">
                                {standings.length === 0 ? (
                                    <div className="text-center py-16 text-gray-500 text-sm space-y-2">
                                        <Trophy size={32} className="mx-auto text-gray-600 mb-3" />
                                        <p>{fr ? 'Données non disponibles' : 'No standings data yet'}</p>
                                        <p className="text-xs text-gray-600">{fr ? 'Revenez après le prochain sync hebdomadaire' : 'Run the static seed from Admin panel to populate'}</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Column headers */}
                                        <div className="grid grid-cols-[28px_1fr_32px_32px_32px_32px_32px_44px] gap-1 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-600 border-b border-white/5">
                                            <span>#</span>
                                            <span>{fr ? 'Équipe' : 'Team'}</span>
                                            <span className="text-center">P</span>
                                            <span className="text-center">W</span>
                                            <span className="text-center">D</span>
                                            <span className="text-center">L</span>
                                            <span className="text-center">GD</span>
                                            <span className="text-center font-black text-vantage-cyan">Pts</span>
                                        </div>

                                        {standings.map((row, i) => (
                                            <motion.div
                                                key={row.teamId}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: i * 0.02 }}
                                                className={`grid grid-cols-[28px_1fr_32px_32px_32px_32px_32px_44px] gap-1 px-3 py-2.5 text-xs items-center ${positionBg(row.position)} ${i < standings.length - 1 ? 'border-b border-white/[0.04]' : ''} hover:bg-white/5 transition-colors`}
                                            >
                                                <span className={`font-bold text-[11px] ${positionColor(row.position)}`}>{row.position}</span>
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {row.teamLogo && <img src={row.teamLogo} alt="" className="w-5 h-5 object-contain shrink-0" />}
                                                    <span className="font-semibold text-slate-200 truncate text-[11px]">{row.teamName}</span>
                                                </div>
                                                <span className="text-center text-gray-400">{row.played}</span>
                                                <span className="text-center text-green-400 font-bold">{row.won}</span>
                                                <span className="text-center text-gray-400">{row.drawn}</span>
                                                <span className="text-center text-red-400">{row.lost}</span>
                                                <span className={`text-center font-medium ${row.goalDiff > 0 ? 'text-green-400' : row.goalDiff < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                                                    {row.goalDiff > 0 ? '+' : ''}{row.goalDiff}
                                                </span>
                                                <span className="text-center font-black text-vantage-cyan">{row.points}</span>
                                            </motion.div>
                                        ))}

                                        {/* Legend */}
                                        <div className="px-3 py-3 border-t border-white/5 flex flex-wrap gap-x-4 gap-y-1">
                                            <div className="flex items-center gap-1.5 text-[10px] text-vantage-cyan"><span className="w-2 h-2 rounded-full bg-vantage-cyan" />{fr ? 'Champions League' : 'Champions League'}</div>
                                            <div className="flex items-center gap-1.5 text-[10px] text-purple-400"><span className="w-2 h-2 rounded-full bg-purple-400" />{fr ? 'Europa League' : 'Europa League'}</div>
                                            <div className="flex items-center gap-1.5 text-[10px] text-red-400"><span className="w-2 h-2 rounded-full bg-red-400" />{fr ? 'Relégation' : 'Relegation'}</div>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* ── TOP SCORERS ── */}
                        {view === 'scorers' && (
                            <div className="space-y-2">
                                {scorers.length === 0 ? (
                                    <div className="text-center py-16 text-gray-500 text-sm space-y-2">
                                        <Target size={32} className="mx-auto text-gray-600 mb-3" />
                                        <p>{fr ? 'Données non disponibles' : 'No scorer data yet'}</p>
                                        <p className="text-xs text-gray-600">{fr ? 'Revenez après le prochain sync' : 'Run the static seed from Admin panel'}</p>
                                    </div>
                                ) : scorers.map((s, i) => (
                                    <motion.div
                                        key={s.playerId}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: i * 0.04 }}
                                        className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/8 hover:bg-white/8 transition-colors"
                                    >
                                        {/* Rank */}
                                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                                            i === 0 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                                            i === 1 ? 'bg-gray-400/20 text-gray-300 border border-gray-400/30' :
                                            i === 2 ? 'bg-orange-600/20 text-orange-400 border border-orange-600/30' :
                                            'bg-white/5 text-gray-500 border border-white/10'
                                        }`}>
                                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : s.rank}
                                        </div>

                                        {/* Team logo */}
                                        {s.teamLogo && <img src={s.teamLogo} alt="" className="w-7 h-7 object-contain rounded shrink-0" />}

                                        {/* Player info */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-slate-100 truncate">{s.playerName}</p>
                                            <p className="text-[10px] text-gray-500 truncate">{s.teamName}</p>
                                        </div>

                                        {/* Stats */}
                                        <div className="flex items-center gap-3 shrink-0">
                                            <div className="text-center">
                                                <p className="text-lg font-black text-vantage-cyan">{s.goals}</p>
                                                <p className="text-[9px] text-gray-600 uppercase">{fr ? 'Buts' : 'Goals'}</p>
                                            </div>
                                            {s.assists > 0 && (
                                                <div className="text-center">
                                                    <p className="text-sm font-bold text-purple-400">{s.assists}</p>
                                                    <p className="text-[9px] text-gray-600 uppercase">Ast</p>
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            )}
        </div>
    );
};
