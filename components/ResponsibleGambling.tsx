import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, X, ExternalLink, HeartHandshake, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

interface ResponsibleGamblingProps {
  compact?: boolean;
}

export const ResponsibleGambling: React.FC<ResponsibleGamblingProps> = ({ compact = false }) => {
  const { language } = useAppContext();
  const [expanded, setExpanded] = useState(false);

  const text = {
    title: language === 'fr' ? 'Jeu Responsable' : 'Responsible Gambling',
    subtitle: language === 'fr'
      ? 'Les pronostics ne garantissent pas les gains. Pariez de manière responsable.'
      : 'Predictions do not guarantee winnings. Gamble responsibly.',
    age: language === 'fr' ? 'Réservé aux 18 ans et plus' : '18+ Only',
    helpTitle: language === 'fr' ? 'Besoin d\'aide ?' : 'Need help?',
    helpText: language === 'fr'
      ? 'Si vous pensez avoir un problème de jeu, des organisations peuvent vous aider gratuitement et confidentiellement.'
      : 'If you think you have a gambling problem, free and confidential support is available.',
    selfExclude: language === 'fr' ? 'Auto-exclusion' : 'Self-Exclude',
    reminders: [
      language === 'fr' ? '🎯 Fixez-vous un budget et respectez-le' : '🎯 Set a budget and stick to it',
      language === 'fr' ? '⏰ Limitez votre temps de jeu' : '⏰ Limit your gambling time',
      language === 'fr' ? '🚫 Ne pariez jamais ce que vous ne pouvez pas perdre' : '🚫 Never bet what you cannot afford to lose',
      language === 'fr' ? '🧘 Le jeu doit rester un divertissement' : '🧘 Gambling should remain entertainment',
    ],
  };

  if (compact) {
    return (
      <div className="w-full">
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full flex items-center justify-between p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-left hover:bg-amber-500/10 transition-colors"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} className="text-amber-400 shrink-0" />
            <span className="text-xs font-bold text-amber-400">{text.title}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">{text.age}</span>
          </div>
          {expanded ? <ChevronUp size={14} className="text-amber-400" /> : <ChevronDown size={14} className="text-amber-400" />}
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-3 px-3 pb-3 space-y-2">
                <p className="text-[11px] text-amber-300/80 leading-relaxed">{text.subtitle}</p>
                <ul className="space-y-1.5">
                  {text.reminders.map((r, i) => (
                    <li key={i} className="text-[11px] text-gray-400">{r}</li>
                  ))}
                </ul>
                <a
                  href="https://www.gamblingtherapy.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] text-amber-400 hover:text-amber-300 font-bold transition-colors"
                >
                  <HeartHandshake size={12} />
                  {text.helpTitle} — gamblingtherapy.org
                  <ExternalLink size={10} />
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-amber-500/15">
        <div className="p-2 rounded-xl bg-amber-500/15">
          <ShieldAlert size={18} className="text-amber-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-amber-400">{text.title}</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-black border border-red-500/20">
              {text.age}
            </span>
          </div>
          <p className="text-[11px] text-amber-300/70 mt-0.5">{text.subtitle}</p>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-1 gap-2">
          {text.reminders.map((r, i) => (
            <div key={i} className="text-xs text-gray-400 flex items-start gap-2">
              <span>{r}</span>
            </div>
          ))}
        </div>

        <div className="p-3 rounded-xl bg-white/5 border border-white/10 mt-3">
          <p className="text-[11px] text-gray-400 mb-2">{text.helpText}</p>
          <a
            href="https://www.gamblingtherapy.org"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 font-bold transition-colors"
          >
            <HeartHandshake size={13} />
            GamblingTherapy.org
            <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </div>
  );
};

export default ResponsibleGambling;
