import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, RefreshCw, Clock, Zap, ChevronDown, ChevronUp, Radio } from 'lucide-react';
import { getLiveMatchesFromDB } from '../services/sportsData';
import { LiveMatch, NavigationTab } from '../types';
import { TeamLogo } from '../components/TeamLogo';
import { useAppContext } from '../context/AppContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';

interface LiveScoresProps {
  setTab?: (tab: NavigationTab) => void;
}

const STATE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  '1H':  { label: '1ST HALF',  color: 'text-green-400',  bg: 'bg-green-400/15 border-green-400/30' },
  '2H':  { label: '2ND HALF',  color: 'text-green-400',  bg: 'bg-green-400/15 border-green-400/30' },
  'HT':  { label: 'HALF TIME', color: 'text-yellow-400', bg: 'bg-yellow-400/15 border-yellow-400/30' },
  'ET':  { label: 'EXTRA TIME',color: 'text-orange-400', bg: 'bg-orange-400/15 border-orange-400/30' },
  'PEN': { label: 'PENALTIES', color: 'text-red-400',    bg: 'bg-red-400/15 border-red-400/30' },
  'FT':  { label: 'FULL TIME', color: 'text-gray-400',   bg: 'bg-gray-400/15 border-gray-400/30' },
};

const EVENT_ICONS: Record<string, string> = {
  'goal':         '⚽',
  'yellow_card': '🟨',
  'yellowcard':  '🟨',
  'red_card':    '🟥',
  'redcard':    '🟥',
  'substitution': '🔄',
  'var':          '📺',
  'penalty':      '🎯',
  'own_goal':     '🤕',
  'penalty_miss': '❌',
};

function getEventIcon(type: string): string {
  const normalized = type.toLowerCase().replace(/\s+/g, '_');
  return EVENT_ICONS[normalized] || '•';
}

function getEventDisplay(ev: any, language: string): string {
  if (ev.type === 'goal' || ev.type === 'penalty') {
    const lbl = language === 'fr' ? 'But' : 'Goal';
    return `${ev.playerName || lbl}${ev.result ? ` (${ev.result})` : ''}`;
  }
  if (ev.type === 'substitution') {
    const out = ev.playerNameOut || ev.related_player_name || '?';
    return `${ev.playerName || '?'} ↔ ${out}`;
  }
  if (ev.type === 'yellow_card' || ev.type === 'red_card' || ev.type === 'yellowcard' || ev.type === 'redcard') {
    if (ev.playerName) return ev.playerName;
    if (ev.name) return ev.name;
    const isRed = (ev.type === 'redcard' || ev.type === 'red_card');
    if (language === 'fr') return isRed ? 'Carton Rouge' : 'Carton Jaune';
    return isRed ? 'Red Card' : 'Yellow Card';
  }
  if (ev.playerName) return ev.playerName;
  if (ev.name) return ev.name;
  
  const labels: Record<string, any> = {
    'var': { en: 'VAR', fr: 'VAR' },
    'event': { en: 'Event', fr: 'Événement' },
    'own_goal': { en: 'Own Goal', fr: 'Contre son camp' },
    'penalty_miss': { en: 'Penalty Miss', fr: 'Penalty raté' },
  };
  return labels[ev.type]?.[language] || labels[ev.type]?.en || 'Event';
}

function getStateConfig(short: string, language: string) {
  const key = short?.toUpperCase();
  const config = { ...(STATE_CONFIG[key] || { label: short || 'LIVE', color: 'text-green-400', bg: 'bg-green-400/15 border-green-400/30' }) };
  
  // Apply French overrides
  if (language === 'fr') {
      if (key === '1H') config.label = '1ÈRE MI-TEMPS';
      else if (key === '2H') config.label = '2ÈME MI-TEMPS';
      else if (key === 'HT') config.label = 'MI-TEMPS';
      else if (key === 'ET') config.label = 'PROLONGATION';
      else if (key === 'PEN') config.label = 'TIRS AU BUT';
      else if (key === 'FT') config.label = 'TERMINÉ';
  }
  return config;
}

const LiveMatchCard: React.FC<{ match: LiveMatch; idx: number; language: string }> = ({ match, idx, language }) => {
  const [expanded, setExpanded] = useState(false);
  const stateConf = getStateConfig(match.stateShort, language);
  const isLive = !['FT', 'NS', 'POSTP', 'ABD', 'CANC', 'TBD'].includes(match.stateShort?.toUpperCase());

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.05 }}
      className="rounded-2xl border border-white/8 bg-[#1a1d26] overflow-hidden"
    >
      {/* Score row */}
      <div className="px-4 py-3.5">
        {/* League + state */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] text-gray-500 font-semibold truncate max-w-[60%]">
            {match.league}
          </span>
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${stateConf.bg} ${stateConf.color}`}>
            {isLive && (
              <span className="relative flex h-1.5 w-1.5">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${stateConf.color.replace('text-', 'bg-')}`} />
                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${stateConf.color.replace('text-', 'bg-')}`} />
              </span>
            )}
            {stateConf.label}
            {match.minute > 0 && isLive && ` ${match.minute}'`}
          </div>
        </div>

        {/* Teams + Score */}
        <div className="flex items-center justify-between gap-3">
          {/* Home Team */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-white/5 flex items-center justify-center border border-white/8 p-1.5">
              <TeamLogo src={match.homeTeamLogo} teamName={match.homeTeam} className="w-full h-full" />
            </div>
            <span className="text-sm font-bold text-white leading-tight line-clamp-1">{match.homeTeam}</span>
          </div>

          {/* Score */}
          <div className="shrink-0 flex flex-col items-center px-3">
            <div className="flex items-center gap-2">
              <motion.span
                key={`home-${match.homeScore}`}
                initial={{ scale: 1.4 }}
                animate={{ scale: 1 }}
                className={`text-2xl font-black font-orbitron ${match.homeScore > match.awayScore ? 'text-vantage-cyan' : 'text-white'}`}
              >
                {match.homeScore}
              </motion.span>
              <span className="text-lg font-orbitron text-gray-600">-</span>
              <motion.span
                key={`away-${match.awayScore}`}
                initial={{ scale: 1.4 }}
                animate={{ scale: 1 }}
                className={`text-2xl font-black font-orbitron ${match.awayScore > match.homeScore ? 'text-vantage-purple' : 'text-white'}`}
              >
                {match.awayScore}
              </motion.span>
            </div>
          </div>

          {/* Away Team */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0 flex-row-reverse">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-white/5 flex items-center justify-center border border-white/8 p-1.5">
              <TeamLogo src={match.awayTeamLogo} teamName={match.awayTeam} className="w-full h-full" />
            </div>
            <span className="text-sm font-bold text-white leading-tight line-clamp-1 text-right">{match.awayTeam}</span>
          </div>
        </div>

        {/* Goals summary row */}
        {match.events && match.events.length > 0 && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="mt-3 w-full flex items-center justify-between pt-3 border-t border-white/5 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Zap size={10} className="text-vantage-cyan" />
              {match.events.filter(e => e.type === 'goal').length} goals · {match.events.length} events
            </span>
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>

      {/* Events panel */}
      <AnimatePresence>
        {expanded && match.events && match.events.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-1.5 border-t border-white/5">
              <p className="text-[9px] uppercase tracking-widest text-gray-600 pt-3 mb-2">Match Events</p>
              {match.events.slice(0, 10).map((ev, i) => (
                <div key={ev.id || i} className="flex items-center gap-2 text-xs">
                  <span className="text-[10px] text-gray-500 font-mono w-6 text-right shrink-0">{ev.minute}'</span>
                  <span>{getEventIcon(ev.type)}</span>
                  <span className="text-gray-300 font-medium truncate">
                    {getEventDisplay(ev, language)}
                  </span>
                  {ev.isHome !== undefined && (
                    <span className={`text-[9px] ${ev.isHome ? 'text-vantage-cyan' : 'text-vantage-purple'}`}>
                      {ev.isHome ? 'H' : 'A'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export const LiveScores: React.FC<LiveScoresProps> = ({ setTab }) => {
  const { language } = useAppContext();
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(120); // BUG-4 FIX: backend polls every 2 min, not 60s
  const [groupByLeague, setGroupByLeague] = useState(false);

  // Real-time Firestore listener — no polling needed, Firestore pushes updates
  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(
      doc(db, 'live_scores', 'current'),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as { matches: LiveMatch[]; updatedAt: string; count: number };
          setMatches(data.matches || []);
          setLastUpdated(data.updatedAt);
          setCountdown(120); // reset countdown when data arrives (2-min cycle)
        } else {
          setMatches([]);
        }
        setLoading(false);
      },
      (err) => {
        console.warn('[LiveScores] Firestore listener error:', err);
        // Fallback: one-time Firestore read
        getLiveMatchesFromDB().then(m => { setMatches(m); setLoading(false); });
      }
    );
    return () => unsub();
  }, []);

  // Countdown to next backend refresh (backend writes every 60s)
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(c => c > 0 ? c - 1 : 120);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Group by league option
  const grouped = groupByLeague
    ? matches.reduce<Record<string, LiveMatch[]>>((acc, m) => {
        const key = m.league || 'Unknown';
        if (!acc[key]) acc[key] = [];
        acc[key].push(m);
        return acc;
      }, {})
    : { 'All Matches': matches };

  return (
    <div className="space-y-4 pb-28">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold font-orbitron text-slate-900 dark:text-white">
              LIVE<span className="text-red-500">NOW</span>
            </h1>
            {matches.length > 0 && (
              <span className="text-xs font-bold bg-red-500 text-white px-2 py-0.5 rounded-full animate-pulse">
                {matches.length}
              </span>
            )}
          </div>
          <p className="text-[10px] text-gray-500 tracking-widest">
            {language === 'fr' ? 'Scores en temps réel' : 'Real-time scores via SportMonks'}
          </p>
        </div>

        {/* Countdown / last updated */}
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1 text-[10px] text-gray-500">
            <RefreshCw size={9} className={countdown < 10 ? 'animate-spin text-vantage-cyan' : ''} />
            <span className="font-mono">{countdown}s</span>
          </div>
          {lastUpdated && (
            <span className="text-[9px] text-gray-600">
              {new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="flex bg-slate-100 dark:bg-white/5 rounded-xl p-1 border border-slate-200 dark:border-white/10 flex-1">
          <button
            onClick={() => setGroupByLeague(false)}
            className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${!groupByLeague ? 'bg-white dark:bg-white/10 shadow text-vantage-cyan' : 'text-gray-500'}`}
          >
            {language === 'fr' ? 'Tous' : 'All'}
          </button>
          <button
            onClick={() => setGroupByLeague(true)}
            className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${groupByLeague ? 'bg-white dark:bg-white/10 shadow text-vantage-cyan' : 'text-gray-500'}`}
          >
            {language === 'fr' ? 'Par ligue' : 'By League'}
          </button>
        </div>
        <div className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
          <Radio size={12} className="text-red-500 animate-pulse" />
          <span className="text-[10px] font-bold text-red-500">LIVE</span>
        </div>
      </div>

      {/* Match List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-[88px] w-full bg-slate-200 dark:bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center mb-5 border border-slate-200 dark:border-white/10">
            <Activity size={36} className="text-gray-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
            {language === 'fr' ? 'Aucun match en direct' : 'No Matches Live'}
          </h3>
          <p className="text-sm text-gray-500 max-w-[220px] leading-relaxed">
            {language === 'fr'
              ? "Les matchs en direct apparaîtront ici dès qu'ils commencent."
              : 'Live matches will appear here as they kick off. Check back later!'}
          </p>
          <div className="flex items-center gap-1.5 mt-5 text-[11px] text-gray-400">
            <Clock size={11} />
            <span>{language === 'fr' ? 'Mis à jour toutes les 60s par le serveur' : 'Auto-updated every 60s by backend'}</span>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([league, leagueMatches]) => (
            <div key={league} className="space-y-3">
              {groupByLeague && (
                <div className="sticky top-0 z-10 py-2 bg-gradient-to-b from-vantage-lightBg/95 to-vantage-lightBg/0 dark:from-vantage-bg/95 dark:to-vantage-bg/0 backdrop-blur-sm">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-200/60 dark:bg-white/10 border border-slate-300 dark:border-white/10">
                    <span className="text-[10px] font-bold text-slate-700 dark:text-white uppercase tracking-wider">{league}</span>
                    <span className="text-[9px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold">{leagueMatches.length}</span>
                  </div>
                </div>
              )}
              <AnimatePresence>
                {leagueMatches.map((m, idx) => (
                  <LiveMatchCard key={m.id} match={m} idx={idx} language={language} />
                ))}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
