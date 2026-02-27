import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, Activity, ArrowRight, Lock, Globe, Clock, Calendar, Sun, Moon,
  Trophy, AlertTriangle, Hourglass, Search, SlidersHorizontal, ChevronDown,
  Flame, TrendingUp, ChevronRight, Shield, BarChart3
} from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { CircularProgress } from '../components/CircularProgress';
import { AnalyzingLoader } from '../components/AnalyzingLoader';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { NavigationTab, Match, Sport } from '../types';
import { TeamLogo } from '../components/TeamLogo';
import { MatchDetailsModal } from '../components/MatchDetailsModal';

interface HomeProps {
  setTab: (tab: NavigationTab) => void;
}

type SortKey = 'time' | 'league';

const CATEGORY_CONFIG = {
  safe: { label: 'SAFE', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  value: { label: 'VALUE', bg: 'bg-amber-500/15', border: 'border-amber-500/30', text: 'text-amber-400', dot: 'bg-amber-400' },
  risky: { label: 'RISKY', bg: 'bg-rose-500/15', border: 'border-rose-500/30', text: 'text-rose-400', dot: 'bg-rose-400' },
};

export const Home: React.FC<HomeProps> = ({ setTab }) => {
  const { t, language, setLanguage, theme, toggleTheme } = useAppContext();
  const { userProfile, isAdmin } = useAuth();
  const {
    activeDate, predictions, rawFixtures, basketballPredictions,
    winRateStats, loading, isSystemGenerating, systemError
  } = useData();

  const isVip = userProfile?.isVip || isAdmin;

  // ─── Filters ─────────────────────────────────────────────────────────────
  const [activeSport, setActiveSport] = useState<Sport>('football');
  const [sortKey, setSortKey] = useState<SortKey>('time');
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSortDropdown, setShowSortDropdown] = useState(false);

  // Root bug fix: fall back to AI predictions if rawFixtures is empty
  // rawFixtures = real API fixtures (preferred); predictions = AI generated (fallback)
  const fixturePool = activeSport === 'football'
    ? (rawFixtures && rawFixtures.length > 0 ? rawFixtures : predictions)
    : basketballPredictions;

  const filteredMatches = useMemo(() => {
    let result = [...fixturePool];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.homeTeam.toLowerCase().includes(q) ||
        m.awayTeam.toLowerCase().includes(q) ||
        m.league.toLowerCase().includes(q)
      );
    }
    switch (sortKey) {
      case 'time': result.sort((a, b) => a.time.localeCompare(b.time)); break;
      case 'league': result.sort((a, b) => a.league.localeCompare(b.league)); break;
    }
    return result;
  }, [fixturePool, searchQuery, sortKey]);

  const groupedMatches = useMemo(() => {
    if (sortKey !== 'league') return { 'All Matches': filteredMatches };
    const groups: Record<string, Match[]> = {};
    filteredMatches.forEach(p => {
      if (!groups[p.league]) groups[p.league] = [];
      groups[p.league].push(p);
    });
    return groups;
  }, [filteredMatches, sortKey]);

  const [year, month, day] = activeDate ? activeDate.split('-').map(Number) : [];
  const displayDateObj = activeDate ? new Date(year, month - 1, day) : new Date();

  const todayDisplay = displayDateObj.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB', {
    weekday: 'short', day: 'numeric', month: 'short'
  });

  const sortLabels: Record<SortKey, string> = {
    time: language === 'fr' ? 'Heure' : 'Time',
    league: language === 'fr' ? 'Ligue' : 'League',
  };

  if (isSystemGenerating) return <AnalyzingLoader />;

  return (
    <div className="space-y-5 pb-32">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-orbitron text-slate-900 dark:text-white">
            VANTAGE<span className="text-vantage-cyan">AI</span>
          </h1>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 tracking-widest">{t('home.system')}</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setLanguage(language === 'fr' ? 'en' : 'fr')}
            className="flex items-center space-x-1 bg-slate-100 dark:bg-white/5 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
          >
            <Globe size={12} className="text-slate-500 dark:text-gray-400" />
            <span className="text-[10px] font-bold font-orbitron text-slate-700 dark:text-gray-300 w-4 text-center">
              {language.toUpperCase()}
            </span>
          </button>
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center bg-slate-100 dark:bg-white/5 w-8 h-7 rounded-lg border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
          >
            {theme === 'dark' ? <Sun size={14} className="text-yellow-500" /> : <Moon size={14} className="text-slate-600" />}
          </button>
          {/* Live status dot */}
          <div className={`flex items-center justify-center w-8 h-7 rounded-lg border ${isSystemGenerating ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-vantage-cyan/10 border-vantage-cyan/20'}`}>
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isSystemGenerating ? 'bg-yellow-500' : 'bg-vantage-cyan'}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isSystemGenerating ? 'bg-yellow-500' : 'bg-vantage-cyan'}`} />
            </span>
          </div>
        </div>
      </div>

      {/* ── Date Bar ── */}
      <div className="flex items-center justify-between bg-black/5 dark:bg-white/5 px-4 py-2.5 rounded-xl border border-black/5 dark:border-white/5 text-xs">
        <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
          <Clock size={12} />
          <span className="font-medium uppercase tracking-wide">
            {language === 'fr' ? 'Prochain: 08:00' : 'Next: 08:00 AM'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-vantage-cyan font-bold">
          <Calendar size={12} />
          <span className="uppercase">{todayDisplay}</span>
        </div>
      </div>

      {/* ── Win Rate Stats ── */}
      <GlassCard delay={1}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2 text-vantage-purple">
            <Activity size={16} />
            <span className="text-sm font-bold uppercase tracking-wider">{t('home.performance')}</span>
          </div>
          {winRateStats.streak > 0 && (
            <div className="flex items-center gap-1 text-orange-400 bg-orange-400/10 border border-orange-400/20 px-2 py-0.5 rounded-full text-xs font-bold">
              <Flame size={12} /> {winRateStats.streak}d {language === 'fr' ? 'consécutifs' : 'streak'}
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t('home.daily_rate'), pct: winRateStats.daily, color: '#22d3ee' },
            { label: t('home.weekly_rate'), pct: winRateStats.weekly, color: '#a855f7' },
            { label: t('home.monthly_rate'), pct: winRateStats.monthly, color: '#eab308' },
          ].map((m, i) => (
            <div key={i} className="flex flex-col items-center">
              <CircularProgress percentage={m.pct || 0} label="" color={m.color} size={72} strokeWidth={6} />
              <span className="mt-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400 text-center uppercase leading-tight">{m.label}</span>
            </div>
          ))}
        </div>
        {winRateStats.todayTotal > 0 && (
          <div className="mt-3 pt-3 border-t border-white/5 flex justify-center">
            <span className="text-[11px] text-gray-500">
              {language === 'fr'
                ? `Aujourd'hui: ${winRateStats.todayWon}/${winRateStats.todayTotal} gagnés`
                : `Today: ${winRateStats.todayWon}/${winRateStats.todayTotal} won`}
            </span>
          </div>
        )}
      </GlassCard>

      {/* ─── SORT & FILTER TOOLBAR ─── */}
      <div className="space-y-3">
        {/* Sport Toggle */}
        <div className="flex bg-slate-100 dark:bg-white/5 rounded-xl p-1 border border-slate-200 dark:border-white/10">
          {(['football', 'basketball'] as Sport[]).map(sport => (
            <button
              key={sport}
              onClick={() => setActiveSport(sport)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${activeSport === sport
                ? 'bg-white dark:bg-white/10 shadow text-slate-900 dark:text-white'
                : 'text-gray-500'
                }`}
            >
              {sport === 'football' ? '⚽' : '🏀'}
              {sport === 'football'
                ? (language === 'fr' ? 'Football' : 'Football')
                : (language === 'fr' ? 'Basketball' : 'Basketball')}
            </button>
          ))}
        </div>

        {/* Search + Sort Row */}
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2">
            <Search size={14} className="text-gray-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={language === 'fr' ? 'Chercher équipe ou ligue...' : 'Search team or league...'}
              className="bg-transparent text-xs outline-none text-slate-800 dark:text-white placeholder-gray-500 w-full"
            />
          </div>
          <div className="relative">
            <button
              onClick={() => setShowSortDropdown(v => !v)}
              className="h-full px-3 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl flex items-center gap-1 text-xs font-bold text-slate-700 dark:text-white shrink-0"
            >
              <SlidersHorizontal size={13} />
              {sortLabels[sortKey]}
              <ChevronDown size={12} className={`transition-transform ${showSortDropdown ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {showSortDropdown && (
                // @ts-ignore
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  className="absolute right-0 top-full mt-1 z-30 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl shadow-xl overflow-hidden min-w-[130px]"
                >
                  {(Object.entries(sortLabels) as [SortKey, string][]).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => { setSortKey(key); setShowSortDropdown(false); }}
                      className={`w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-slate-50 dark:hover:bg-white/10 transition-colors ${sortKey === key ? 'text-vantage-cyan' : 'text-slate-700 dark:text-white'
                        }`}
                    >
                      {label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Match Count */}
        <div className="text-xs text-gray-500 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <TrendingUp size={11} />
            {language === 'fr'
              ? `${filteredMatches.length} matchs analysés`
              : `${filteredMatches.length} matches today`}
          </span>
          {rawFixtures.length === 0 && predictions.length > 0 && (
            <span className="text-[10px] text-amber-400 flex items-center gap-1">
              <Zap size={10} /> {language === 'fr' ? 'Mode IA' : 'AI Mode'}
            </span>
          )}
        </div>
      </div>

      {/* ─── MATCH LIST ─── */}
      <div className="space-y-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-[88px] w-full bg-slate-200 dark:bg-white/5 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : filteredMatches.length === 0 ? (
          <GlassCard className="text-center py-10 flex flex-col items-center justify-center min-h-[160px]">
            {systemError ? (
              <>
                <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-3">
                  <AlertTriangle size={24} className="text-red-500" />
                </div>
                <h3 className="text-slate-900 dark:text-white font-bold mb-1">
                  {language === 'fr' ? "Erreur de l'IA" : 'AI Analysis Error'}
                </h3>
                <p className="text-xs text-gray-500 max-w-[220px]">
                  {language === 'fr' ? 'Réessayez plus tard.' : 'Please try again later.'}
                </p>
              </>
            ) : searchQuery ? (
              <>
                <div className="w-12 h-12 bg-vantage-cyan/10 rounded-full flex items-center justify-center mb-3">
                  <Search size={24} className="text-vantage-cyan" />
                </div>
                <h3 className="text-slate-900 dark:text-white font-bold mb-1">
                  {language === 'fr' ? 'Aucun résultat' : 'No matches found'}
                </h3>
                <p className="text-xs text-gray-500">
                  {language === 'fr' ? 'Essayez une autre recherche.' : 'Try adjusting your search.'}
                </p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 bg-vantage-cyan/10 rounded-full flex items-center justify-center mb-3">
                  <Hourglass size={24} className="text-vantage-cyan" />
                </div>
                <h3 className="text-slate-900 dark:text-white font-bold mb-1">
                  {language === 'fr' ? 'Analyse en cours...' : 'Daily Analysis Pending'}
                </h3>
                <p className="text-xs text-gray-500 max-w-[220px] leading-relaxed">
                  {activeSport === 'basketball'
                    ? (language === 'fr' ? "Pas de pronostics basketball pour aujourd'hui." : 'No basketball predictions generated yet.')
                    : (language === 'fr' ? "L'algorithme analyse le marché. Revenez bientôt." : 'The algorithm is analyzing the market. Check back shortly.')}
                </p>
              </>
            )}
          </GlassCard>
        ) : (
          Object.keys(groupedMatches).map(groupKey => (
            <div key={groupKey} className="space-y-3">
              {groupKey !== 'All Matches' && (
                <div className="sticky top-0 z-10 py-2 bg-gradient-to-b from-vantage-lightBg/95 to-vantage-lightBg/50 dark:from-vantage-bg/95 dark:to-vantage-bg/50 backdrop-blur-md">
                  <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-200/50 dark:bg-white/10 border border-slate-300 dark:border-white/10">
                    <Trophy size={12} className="text-vantage-purple" />
                    <span className="text-[10px] font-bold text-slate-800 dark:text-white uppercase tracking-wider">{groupKey}</span>
                  </div>
                </div>
              )}

              <AnimatePresence>
                {groupedMatches[groupKey].map((match, idx) => {
                  const cat = (CATEGORY_CONFIG as any)[match.category] || CATEGORY_CONFIG.value;
                  const hasConfidence = match.confidence && match.confidence > 0;
                  const hasOdds = match.odds && match.odds > 1;
                  const hasPrediction = match.prediction_en || match.prediction;

                  return (
                    // @ts-ignore
                    <motion.div
                      key={match.id}
                      layout
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ delay: idx * 0.03 }}
                    >
                      <button
                        onClick={() => setSelectedMatch(match)}
                        className="w-full text-left group"
                      >
                        <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-[#1a1d26] hover:border-vantage-cyan/40 hover:bg-[#1e2230] transition-all duration-200 shadow-sm hover:shadow-md hover:shadow-vantage-cyan/5 group-hover:ring-1 group-hover:ring-vantage-cyan/10">

                          {/* Subtle gradient glow top edge */}
                          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-vantage-cyan/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                          {/* Category badge top-right */}
                          {hasPrediction && (
                            <div className={`absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-bold tracking-wider ${cat.bg} ${cat.border} ${cat.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${cat.dot}`} />
                              {cat.label}
                            </div>
                          )}

                          <div className="px-4 py-3.5">
                            {/* League + Time row */}
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 flex items-center gap-1 truncate">
                                <Clock size={9} className="shrink-0" />
                                <span className="text-vantage-cyan font-bold">{match.time}</span>
                                <span className="mx-0.5 text-gray-300 dark:text-gray-600">·</span>
                                <span className="truncate">{match.league}</span>
                              </span>
                            </div>

                            {/* Teams row */}
                            <div className="flex items-center justify-between gap-3">
                              {/* Home Team */}
                              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                <div className="w-10 h-10 shrink-0 rounded-xl bg-slate-100 dark:bg-white/8 flex items-center justify-center border border-slate-200 dark:border-white/8 p-1.5">
                                  <TeamLogo src={match.homeTeamLogo} teamName={match.homeTeam} className="w-full h-full" />
                                </div>
                                <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight line-clamp-1 text-left">
                                  {match.homeTeam}
                                </span>
                              </div>

                              {/* VS badge */}
                              <div className="shrink-0 flex flex-col items-center">
                                <span className="text-[11px] font-black font-orbitron text-gray-300 dark:text-gray-600 px-2">VS</span>
                              </div>

                              {/* Away Team */}
                              <div className="flex items-center gap-2.5 flex-1 min-w-0 flex-row-reverse">
                                <div className="w-10 h-10 shrink-0 rounded-xl bg-slate-100 dark:bg-white/8 flex items-center justify-center border border-slate-200 dark:border-white/8 p-1.5">
                                  <TeamLogo src={match.awayTeamLogo} teamName={match.awayTeam} className="w-full h-full" />
                                </div>
                                <span className="text-sm font-bold text-slate-900 dark:text-white leading-tight line-clamp-1 text-right">
                                  {match.awayTeam}
                                </span>
                              </div>
                            </div>

                            {/* Bottom row — confidence / CTA */}
                            <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/5 pt-3">
                              <div className="flex items-center gap-2">
                                {hasConfidence && (
                                  <span className="text-[10px] font-bold text-vantage-purple bg-vantage-purple/10 border border-vantage-purple/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <BarChart3 size={9} />
                                    {match.confidence}%
                                  </span>
                                )}
                                {!hasConfidence && (
                                  <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                    <Activity size={10} /> {language === 'fr' ? 'Analyse IA' : 'AI Analysis'}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] font-bold text-gray-400 group-hover:text-vantage-cyan transition-colors flex items-center gap-1">
                                {language === 'fr' ? 'Détails' : 'Details'}
                                <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          ))
        )}
      </div>

      {/* ─── STICKY VIP CTA ─── */}
      {/* @ts-ignore */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="fixed bottom-[72px] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md z-40 md:relative md:bottom-auto md:left-auto md:translate-x-0 md:max-w-full"
      >
        <button
          onClick={() => setTab('vip')}
          className="w-full relative overflow-hidden rounded-2xl py-4 px-5 flex items-center justify-between group shadow-xl shadow-vantage-purple/30"
          style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #06b6d4 100%)' }}
        >
          {/* Animated glow */}
          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-vantage-purple via-indigo-500 to-vantage-cyan opacity-0 group-hover:opacity-30 transition-opacity blur-sm" />

          <div className="relative flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Zap size={18} className="text-yellow-300 fill-yellow-300" />
            </div>
            <div className="text-left">
              <div className="text-sm font-black text-white tracking-wide">
                {language === 'fr' ? 'Accéder aux Prédictions IA' : 'Unlock AI Predictions'}
              </div>
              <div className="text-[10px] text-white/70 font-medium">
                {language === 'fr' ? 'Analyse complète + taux de réussite' : 'Full analysis + win-rate data'}
              </div>
            </div>
          </div>
          <div className="relative flex items-center gap-1.5">
            <span className="hidden sm:block text-xs font-bold text-white/80">VIP</span>
            <ArrowRight size={20} className="text-white group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
      </motion.div>

      <MatchDetailsModal
        match={selectedMatch}
        onClose={() => setSelectedMatch(null)}
        setTab={setTab}
      />
    </div>
  );
};