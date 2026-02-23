

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, XCircle, MinusCircle, Loader2, Calendar } from 'lucide-react';
import { Match } from '../types';
import { getPredictionsForDate, getGlobalYesterdayKey } from '../services/db';
import { useAppContext } from '../context/AppContext';
import { TeamLogo } from './TeamLogo';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose }) => {
  const { language } = useAppContext();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateStr, setDateStr] = useState('');

  useEffect(() => {
    if (isOpen) {
        const yesterday = getGlobalYesterdayKey();
        setDateStr(yesterday);
        setLoading(true);
        getPredictionsForDate(yesterday)
            .then((data) => {
                if (data) setMatches(data);
                else setMatches([]);
            })
            .catch(() => setMatches([]))
            .finally(() => setLoading(false));
    }
  }, [isOpen]);

  const stats = {
      won: matches.filter(m => m.status === 'won').length,
      lost: matches.filter(m => m.status === 'lost').length,
      total: matches.length
  };

  const winRate = stats.total > 0 ? Math.round((stats.won / stats.total) * 100) : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {
            // @ts-ignore
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm"
            />
          }
          
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
             {
                // @ts-ignore
                <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="w-full max-w-md pointer-events-auto bg-vantage-bg border border-slate-700 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
                >
                    {/* Header */}
                    <div className="p-5 border-b border-white/10 flex justify-between items-center bg-white/5">
                        <div>
                            <h2 className="text-lg font-bold font-orbitron text-white flex items-center gap-2">
                                <Calendar size={18} className="text-vantage-cyan" />
                                {language === 'fr' ? 'Résultats d\'Hier' : 'Yesterday\'s Results'}
                            </h2>
                            <span className="text-xs text-gray-500">{dateStr}</span>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-gray-400">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
                        {loading ? (
                            <div className="flex justify-center py-10">
                                <Loader2 className="animate-spin text-vantage-cyan" />
                            </div>
                        ) : matches.length === 0 ? (
                            <div className="text-center py-10 text-gray-500">
                                <p>{language === 'fr' ? 'Aucune donnée disponible.' : 'No data available for yesterday.'}</p>
                                <p className="text-xs mt-2">{language === 'fr' ? 'Les résultats n\'ont pas encore été publiés par l\'Admin.' : 'Results have not been published by Admin yet.'}</p>
                            </div>
                        ) : (
                            matches.map((match, idx) => (
                                // @ts-ignore
                                <motion.div 
                                    key={match.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className={`
                                        relative p-3 rounded-xl border flex items-center justify-between
                                        ${match.status === 'won' ? 'bg-green-500/10 border-green-500/30' : 
                                        match.status === 'lost' ? 'bg-red-500/10 border-red-500/30' : 
                                        'bg-slate-800/50 border-white/5'}
                                    `}
                                >
                                    <div className="flex flex-col gap-2 min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <div className="flex -space-x-1.5">
                                                <TeamLogo src={match.homeTeamLogo} teamName={match.homeTeam} className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700" />
                                                <TeamLogo src={match.awayTeamLogo} teamName={match.awayTeam} className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700" />
                                            </div>
                                            <span className="text-xs font-bold text-gray-300 truncate">{match.homeTeam} vs {match.awayTeam}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-vantage-cyan">
                                                {language === 'fr' ? (match.prediction_fr || match.prediction) : (match.prediction_en || match.prediction)}
                                            </span>
                                            {match.score && (
                                                <span className="text-[10px] font-mono bg-black/40 px-1.5 py-0.5 rounded text-white border border-white/10">
                                                    {match.score}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="pl-3">
                                        {match.status === 'won' && <CheckCircle2 className="text-green-500" size={24} />}
                                        {match.status === 'lost' && <XCircle className="text-red-500" size={24} />}
                                        {(!match.status || match.status === 'pending') && <MinusCircle className="text-gray-500" size={24} />}
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </div>

                    {/* Footer Stats */}
                    {!loading && matches.length > 0 && (
                        <div className="p-4 bg-white/5 border-t border-white/10 flex justify-between items-center">
                            <div className="flex gap-4">
                                <div className="text-center">
                                    <span className="text-xs text-gray-500 uppercase">Won</span>
                                    <div className="text-lg font-bold text-green-500">{stats.won}</div>
                                </div>
                                <div className="text-center">
                                    <span className="text-xs text-gray-500 uppercase">Lost</span>
                                    <div className="text-lg font-bold text-red-500">{stats.lost}</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-xs text-gray-500 uppercase">Accuracy</span>
                                <div className="text-xl font-bold font-orbitron text-vantage-cyan">{winRate}%</div>
                            </div>
                        </div>
                    )}
                </motion.div>
             }
          </div>
        </>
      )}
    </AnimatePresence>
  );
};