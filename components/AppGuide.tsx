import React, { useEffect } from 'react';
import { ChevronLeft, BookOpen, TrendingUp, Target, ShieldCheck, AlertTriangle, Zap, Activity, Banknote } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { useAppContext } from '../context/AppContext';
import { motion } from 'framer-motion';

interface AppGuideProps {
  onBack: () => void;
}

export const AppGuide: React.FC<AppGuideProps> = ({ onBack }) => {
  const { language } = useAppContext();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const title = language === 'fr' ? 'Guide d\'Utilisation' : 'How to Use Vantage AI';

  return (
    <div className="space-y-6 animate-in slide-in-from-right duration-300 pb-10">
      {/* Header */}
      <div className="flex items-center space-x-3 sticky top-0 z-20 bg-vantage-bg/80 backdrop-blur-xl py-2 -mx-2 px-2 border-b border-white/5">
        <button 
          onClick={onBack}
          className="p-2 -ml-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/5 transition-colors"
        >
          <ChevronLeft size={24} className="text-slate-900 dark:text-white" />
        </button>
        <h1 className="text-xl font-bold font-orbitron text-slate-900 dark:text-white flex items-center gap-2">
           <BookOpen size={20} className="text-vantage-cyan" />
           {title}
        </h1>
      </div>

      <div className="space-y-4">
        {/* Intro */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <GlassCard className="p-5 border-vantage-cyan/20 bg-vantage-cyan/5">
            <h2 className="text-lg font-black font-orbitron text-white mb-2 flex items-center gap-2">
              <Zap size={18} className="text-vantage-cyan" />
              {language === 'fr' ? 'Arrêtez de Parier. Commencez à Investir.' : 'Stop Gambling. Start Investing.'}
            </h2>
            <p className="text-sm text-gray-300 leading-relaxed">
              {language === 'fr' 
                ? "Vantage AI n'est pas une application de paris ordinaires. C'est un terminal de trading quantitatif pour le sport. Notre objectif n'est pas de deviner les gagnants, mais de trouver un avantage mathématique (+EV) sur les bookmakers." 
                : "Vantage AI is not a regular betting app. It's a quantitative trading terminal for sports. Our goal is not to guess winners, but to find a mathematical edge (+EV) over the bookmakers."}
            </p>
          </GlassCard>
        </motion.div>

        {/* Section 1: Match Cards */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <GlassCard className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-vantage-purple/20 flex items-center justify-center">
                <Activity size={16} className="text-vantage-purple" />
              </div>
              <h3 className="font-bold text-white uppercase tracking-wider">
                {language === 'fr' ? 'Comprendre les Signaux' : 'Understanding Signals'}
              </h3>
            </div>
            <div className="space-y-3">
              <div className="flex gap-3">
                <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-emerald-400">Positive EV (+EV)</h4>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {language === 'fr' ? "La cote offerte par le bookmaker est plus élevée que la vraie probabilité. C'est ici que se trouve la rentabilité à long terme." : "The odds offered by the bookmaker are higher than the true probability. This is where long-term profitability lives."}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="w-2 h-2 rounded-full bg-vantage-cyan mt-1.5 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-vantage-cyan">Confidence (Probabilité)</h4>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {language === 'fr' ? "Le pourcentage de chance que l'événement se produise selon notre algorithme. Un pari à 60% perdra quand même 4 fois sur 10. La régularité est clé." : "The percentage chance the event happens according to our algorithm. A 60% bet will still lose 4 out of 10 times. Consistency is key."}
                  </p>
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* Section 2: Alpha Vault & Staking */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <GlassCard className="p-5 border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <Banknote size={16} className="text-emerald-500" />
              </div>
              <h3 className="font-bold text-white uppercase tracking-wider">
                {language === 'fr' ? 'Le Alpha Vault (Gestion de Bankroll)' : 'The Alpha Vault (Bankroll)'}
              </h3>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed mb-4">
              {language === 'fr' 
                ? "Le Vault est le cœur de Vantage AI. Il gère votre argent de manière professionnelle pour éviter la ruine." 
                : "The Vault is the core of Vantage AI. It manages your money professionally to prevent ruin."}
            </p>
            <div className="space-y-3">
              <div className="bg-black/30 rounded-xl p-3 border border-white/5">
                <h4 className="text-xs font-bold text-emerald-400 mb-1 flex items-center gap-1">
                  <Target size={14} /> Kelly Criterion (Mise)
                </h4>
                <p className="text-[11px] text-gray-400">
                  {language === 'fr' ? "Au lieu de parier des montants aléatoires, l'IA calcule exactement quel pourcentage de votre capital risquer sur chaque pari en fonction de l'avantage." : "Instead of betting random amounts, the AI calculates exactly what percentage of your bankroll to risk on each bet based on the edge."}
                </p>
              </div>
              <div className="bg-red-500/10 rounded-xl p-3 border border-red-500/20">
                <h4 className="text-xs font-bold text-red-400 mb-1 flex items-center gap-1">
                  <AlertTriangle size={14} /> NE COMBINEZ PAS (No Accumulators)
                </h4>
                <p className="text-[11px] text-red-300">
                  {language === 'fr' ? "Jouez chaque pari du Vault en SIMPLE. Combiner les paris détruit l'avantage mathématique et garantit la ruine à long terme." : "Play every Vault bet as a SINGLE. Accumulating bets destroys the mathematical edge and guarantees long-term ruin."}
                </p>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* Section 3: VIP vs Free */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <GlassCard className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <ShieldCheck size={16} className="text-amber-500" />
              </div>
              <h3 className="font-bold text-white uppercase tracking-wider">
                {language === 'fr' ? 'Free vs VIP' : 'Free vs VIP'}
              </h3>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              {language === 'fr' 
                ? "Les utilisateurs gratuits voient la direction générale du match, mais les données cruciales (+EV, Confiance, Kelly Stake) sont masquées. Le Pass VIP débloque les modèles mathématiques complets et le Tracker de Bankroll Vault pour un investissement sérieux." 
                : "Free users see the general direction of the match, but the crucial data (+EV, Confidence, Kelly Stake) is blurred out. The VIP Pass unlocks the full mathematical models and the Vault Bankroll Tracker for serious investing."}
            </p>
          </GlassCard>
        </motion.div>
      </div>
    </div>
  );
};
