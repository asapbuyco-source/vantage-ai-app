import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useSpring, useMotionValue, useTransform } from 'framer-motion';
import { Lock, Star, ShieldCheck, CheckCircle2, Loader2, Zap, Flame, Copy, Check, Clock, User, ArrowRight, ShieldAlert, BrainCircuit, Layers, RefreshCw, Crown, Sparkles, Trophy } from 'lucide-react';
import { GlassCard } from '../components/GlassCard';
import { useAppContext } from '../context/AppContext';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { PaymentModal } from '../components/PaymentModal';
import { NavigationTab, Match } from '../types';
import { TeamLogo } from '../components/TeamLogo';
import { AccumulatorModal } from '../components/AccumulatorModal';
import { getAppSettings } from '../services/db';

// ── Currency detection helper ──────────────────────────────────────
const CURRENCY_MAP: Record<string, { symbol: string; rate: number; label: string }> = {
  'ng': { symbol: '₦', rate: 0.85, label: 'NGN' },
  'ke': { symbol: 'KSh', rate: 13.0, label: 'KES' },
  'gh': { symbol: 'GH₵', rate: 0.13, label: 'GHS' },
  'za': { symbol: 'R', rate: 0.22, label: 'ZAR' },
  'us': { symbol: '$', rate: 0.00167, label: 'USD' },
  'gb': { symbol: '£', rate: 0.00132, label: 'GBP' },
};

function getLocalPrice(fcfa: number): string | null {
  const lang = navigator.language?.toLowerCase() || '';
  for (const [code, cur] of Object.entries(CURRENCY_MAP)) {
    if (lang.includes(`-${code}`) || lang.startsWith(code)) {
      const converted = Math.round(fcfa * cur.rate);
      return `≈ ${cur.symbol}${converted.toLocaleString()}`;
    }
  }
  return null;
}

interface VIPProps {
  setTab: (tab: NavigationTab) => void;
}

export const VIP: React.FC<VIPProps> = ({ setTab }) => {
  const { t, language, showToast } = useAppContext();
  const { predictions, loading } = useData();
  const { user, userProfile, isAdmin, verifyTransaction } = useAuth();

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<'daily' | 'weekly' | 'monthly' | 'annual'>('daily');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Accumulator Modal State
  const [isAccuOpen, setIsAccuOpen] = useState(false);
  const [accuRisk, setAccuRisk] = useState<'low' | 'medium' | 'high'>('medium');
  const [whatsappGroupUrl, setWhatsappGroupUrl] = useState<string | null>(null);

  useEffect(() => {
    getAppSettings().then(s => {
      if (s.whatsappGroupUrl) setWhatsappGroupUrl(s.whatsappGroupUrl);
    });
  }, []);

  const plans: Array<{
    id: 'daily' | 'weekly' | 'monthly' | 'annual';
    label: string;
    price: string;
    originalPrice: string | null;
    badge: string | null;
    features: string[];
    color: string;
  }> = [
      {
        id: 'daily',
        label: t('vip.plan_daily'),
        price: '500',
        originalPrice: null,
        badge: null,
        features: [t('vip.feat_1')],
        color: 'border-slate-700 bg-slate-800/50'
      },
      {
        id: 'weekly',
        label: t('vip.plan_weekly'),
        price: '1500',
        originalPrice: '3500', // 500 * 7 = 3500
        badge: 'MOST POPULAR',
        features: [t('vip.feat_1'), 'Accumulator Access', 'Priority Support'],
        color: 'border-vantage-purple bg-vantage-purple/10 shadow-[0_0_30px_rgba(168,85,247,0.15)]'
      },
      {
        id: 'monthly',
        label: t('vip.plan_monthly'),
        price: '4500',
        originalPrice: '15000', // 500 * 30 = 15000
        badge: 'BEST VALUE',
        features: ['Full Month Access', 'All Features', 'VIP WhatsApp', 'Biggest Saving'],
        color: 'border-vantage-cyan bg-vantage-cyan/10 shadow-[0_0_30px_rgba(34,211,238,0.15)]'
      },
      {
        id: 'annual',
        label: language === 'fr' ? 'Annuel' : 'Annual',
        price: '25000',
        originalPrice: '54000', // 4500 * 12 = 54000
        badge: '🔥 BEST DEAL',
        features: ['Full Year Access (365 days)', 'All VIP Features', 'VIP WhatsApp Group', '54% CHEAPER than monthly'],
        color: 'border-yellow-500 bg-yellow-500/10 shadow-[0_0_30px_rgba(234,179,8,0.15)]'
      },
    ];

  const handlePlanClick = (planId: 'daily' | 'weekly' | 'monthly' | 'annual') => {
    setSelectedPlanId(planId);
    setShowPaymentModal(true);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const openAccumulator = (risk: 'low' | 'medium' | 'high') => {
    setAccuRisk(risk);
    setIsAccuOpen(true);
  };

  const handleManualCheck = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const transId = urlParams.get('transId');

    if (!transId) {
      showToast(
        language === 'fr' ? "Aucune transaction trouvée dans l'URL." : "No transaction ID found.",
        'info'
      );
      return;
    }

    setIsVerifying(true);
    const success = await verifyTransaction(transId);
    setIsVerifying(false);

    if (success) {
      showToast(
        language === 'fr' ? "Transaction validée ! Bienvenue VIP." : "Transaction verified! Welcome VIP.",
        'success'
      );
    } else {
      showToast(
        language === 'fr' ? "Transaction non trouvée ou échouée." : "Transaction not found or failed.",
        'warning'
      );
    }
  };

  const getPredictionText = (match: Match) => {
    if (language === 'fr') return match.prediction_fr || match.prediction;
    return match.prediction_en || match.prediction;
  };

  const getAnalysisText = (match: Match) => {
    if (language === 'fr') return match.analysis_fr || match.analysis;
    return match.analysis_en || match.analysis;
  };

  const isUnlocked = (userProfile?.isVip === true) || isAdmin;

  const safeBets = predictions.filter(m => m.category === 'safe');
  const valueBets = predictions.filter(m => m.category === 'value');
  const riskyBets = predictions.filter(m => m.category === 'risky');

  // ── Category styling config ────────────────────────────────────────────────
  const CAT_CONFIG = {
    safe: { border: 'border-l-green-500', badge: 'bg-green-500/15 text-green-500 border-green-500/30', icon: <ShieldCheck size={12} />, label: '🟢 Safe' },
    value: { border: 'border-l-vantage-cyan', badge: 'bg-vantage-cyan/15 text-vantage-cyan border-vantage-cyan/30', icon: <Star size={12} />, label: '⭐ Value' },
    risky: { border: 'border-l-orange-500', badge: 'bg-orange-500/15 text-orange-500 border-orange-500/30', icon: <Flame size={12} />, label: '🔥 Risky' },
  } as const;

  // ── Animated confidence bar component ────────────────────────────────────
  const ConfidenceBar = ({ pct }: { pct: number }) => (
    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-200 dark:bg-white/5 overflow-hidden">
      <motion.div
        className="h-full bg-gradient-to-r from-vantage-cyan to-green-400"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.3 }}
      />
    </div>
  );

  const renderMatchList = (matches: Match[], title: string, icon: React.ReactNode, color: string) => {
    if (matches.length === 0) return null;
    return (
      <div className="space-y-3 mb-6">
        <h3 className={`text-sm font-bold uppercase tracking-widest flex items-center gap-2 ${color}`}>
          {icon} {title}
          <span className="ml-auto text-[10px] font-normal text-gray-500">{matches.length} picks</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-3">
          <AnimatePresence>
            {matches.map((match, idx) => {
              const cat = match.category as keyof typeof CAT_CONFIG;
              const cfg = CAT_CONFIG[cat] || CAT_CONFIG.safe;
              return (
                <motion.div
                  key={match.id}
                  initial={{ opacity: 0, y: 20, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.35, delay: idx * 0.07, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="h-full"
                >
                  <div className={`relative overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-white/5 backdrop-blur-md shadow-lg border-l-4 h-full flex flex-col ${cfg.border}`}>

                    {/* Header row */}
                    <div className="flex justify-between items-center px-4 pt-4 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest leading-none truncate max-w-[80px]">{match.league}</span>
                        <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${cfg.badge}`}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                          <Clock size={10} />{match.time}
                        </span>
                        <button
                          onClick={() => handleCopy(`${match.homeTeam} vs ${match.awayTeam} — ${getPredictionText(match)}`, match.id)}
                          className="p-1.5 rounded-md bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors text-gray-400 hover:text-vantage-cyan shrink-0"
                        >
                          {copiedId === match.id ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
                        </button>
                      </div>
                    </div>

                    {/* Teams row */}
                    <div className="flex justify-between items-center px-4 py-3">
                      <div className="flex items-center gap-2.5 w-5/12 overflow-hidden">
                        <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center border border-slate-200 dark:border-white/5 shrink-0 p-1">
                          <TeamLogo src={match.homeTeamLogo} teamName={match.homeTeam} className="w-7 h-7" />
                        </div>
                        <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate leading-tight">{match.homeTeam}</span>
                      </div>
                      <div className="flex flex-col items-center gap-1 shrink-0 px-1">
                        <span className="text-[10px] font-orbitron text-gray-400">VS</span>
                        {match.odds > 1 && (
                          <span className="text-[10px] font-bold bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">{match.odds.toFixed(2)}x</span>
                        )}
                      </div>
                      <div className="flex items-center justify-end gap-2.5 w-5/12 overflow-hidden">
                        <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white text-right truncate leading-tight">{match.awayTeam}</span>
                        <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center border border-slate-200 dark:border-white/5 shrink-0 p-1">
                          <TeamLogo src={match.awayTeamLogo} teamName={match.awayTeam} className="w-7 h-7" />
                        </div>
                      </div>
                    </div>

                    {/* Prediction + confidence row */}
                    <div className="relative mx-4 mb-3 p-3 bg-slate-50 dark:bg-black/30 rounded-xl border border-slate-200 dark:border-white/5 overflow-hidden mt-auto">
                      <ConfidenceBar pct={match.confidence} />
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col flex-1 mr-3 min-w-0">
                          <span className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">{t('free.pred_label')}</span>
                          <span className="text-xs sm:text-sm font-bold text-vantage-cyan leading-tight break-words line-clamp-2" title={getPredictionText(match)}>{getPredictionText(match)}</span>
                        </div>
                        <div className="flex flex-col items-center shrink-0">
                          <span className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">{t('free.prob_label')}</span>
                          <motion.span
                            className="text-lg font-bold font-orbitron text-green-500 dark:text-green-400"
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: idx * 0.07 + 0.4, type: 'spring', stiffness: 300 }}
                          >
                            {match.confidence}%
                          </motion.span>
                        </div>
                      </div>
                    </div>

                    {/* AI Reasoning */}
                    <div className="mx-4 mb-4 p-3 rounded-xl bg-gradient-to-r from-vantage-purple/5 to-transparent border border-vantage-purple/15">
                      <div className="flex items-start gap-2">
                        <BrainCircuit size={13} className="text-vantage-purple mt-0.5 shrink-0" />
                        <div>
                          <span className="text-[10px] text-vantage-purple font-bold uppercase tracking-wide">AI Analysis</span>
                          <p className="text-[11px] text-gray-600 dark:text-gray-300 leading-relaxed mt-0.5 line-clamp-3" title={getAnalysisText(match)}>{getAnalysisText(match)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    );
  };

  const selectedPlanObj = plans.find(p => p.id === selectedPlanId) || plans[0];

  // --- UNLOCKED VIEW (Active VIP) ---
  if (isUnlocked) {
    const expiryDate = userProfile?.vipExpiry ? new Date(userProfile.vipExpiry) : null;
    const daysLeft = expiryDate ? Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / 86400000)) : null;

    return (
      <div className="space-y-4 pb-24 relative min-h-screen">
        {/* Header */}
        <motion.div
          className="flex flex-col space-y-1"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-2xl font-bold font-orbitron text-slate-900 dark:text-white">
            {t('vip.title')} <span className="text-vantage-purple">{t('vip.title_accent')}</span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('vip.subtitle')}</p>
        </motion.div>

        {/* Premium VIP status badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className={`relative overflow-hidden rounded-2xl p-4 border ${isAdmin
            ? 'border-red-500/30 bg-red-500/5'
            : 'border-vantage-purple/40 bg-gradient-to-r from-vantage-purple/10 to-vantage-cyan/5'
            }`}
        >
          {/* Animated ring */}
          {!isAdmin && (
            <motion.div
              className="absolute -top-4 -right-4 w-24 h-24 rounded-full border-2 border-vantage-purple/20"
              animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isAdmin ? 'bg-red-500/20 text-red-500' : 'bg-vantage-purple/20 text-vantage-purple'
                }`}>
                {isAdmin ? <ShieldAlert size={20} /> : <Crown size={20} />}
              </div>
              <div>
                <p className="font-bold text-slate-900 dark:text-white text-sm">
                  {isAdmin ? 'Admin Bypass Active' : t('vip.active')}
                </p>
                {daysLeft !== null && !isAdmin && (
                  <p className="text-[11px] text-vantage-purple font-semibold">
                    {daysLeft === 0 ? 'Expires today!' : `${daysLeft}d remaining`}
                  </p>
                )}
              </div>
            </div>
            {expiryDate && !isAdmin && (
              <div className="text-right">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Expires</p>
                <p className="text-xs font-bold font-orbitron text-white">
                  {expiryDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </p>
              </div>
            )}
          </div>
        </motion.div>

        {/* WhatsApp Community CTA (for active VIPs) */}
        {whatsappGroupUrl && (
          <a
            href={whatsappGroupUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-[#25D366]/15 border border-[#25D366]/30 text-[#25D366] font-bold text-sm hover:bg-[#25D366]/25 active:scale-[0.98] transition-all"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.553 4.122 1.523 5.858L.057 23.945l6.305-1.654A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.906a9.896 9.896 0 01-5.043-1.38l-.361-.214-3.744.982.999-3.648-.235-.374A9.86 9.86 0 012.094 12C2.094 6.58 6.58 2.094 12 2.094S21.906 6.58 21.906 12 17.42 21.906 12 21.906z" />
            </svg>
            {language === 'fr' ? 'Rejoindre le Groupe VIP WhatsApp' : 'Join VIP WhatsApp Group'}
          </a>
        )}

        {/* SMART ACCUMULATORS SECTION */}
        <div className="mb-8">
          <h3 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 text-slate-700 dark:text-gray-300 mb-3">
            <Layers size={16} className="text-vantage-purple" /> Smart Accumulators
          </h3>

          {/* MAIN GENERATOR BUTTON */}
          <button
            onClick={() => openAccumulator('medium')}
            className="w-full mb-3 py-3 bg-gradient-to-r from-vantage-purple to-vantage-cyan text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 relative overflow-hidden group border border-white/20"
          >
            <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
            <Layers size={20} />
            <span>{language === 'fr' ? 'Générer Accumulateur Intelligent' : 'Generate Smart Accumulator'}</span>
          </button>

          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => openAccumulator('low')}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-green-500/50 hover:bg-green-500/10 transition-all group"
            >
              <ShieldCheck size={24} className="text-green-500 mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold text-slate-700 dark:text-white">Safe Acca</span>
              <span className="text-[10px] text-gray-500">Low Risk</span>
            </button>
            <button
              onClick={() => openAccumulator('medium')}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-vantage-cyan/50 hover:bg-vantage-cyan/10 transition-all group"
            >
              <Zap size={24} className="text-vantage-cyan mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold text-slate-700 dark:text-white">Value Acca</span>
              <span className="text-[10px] text-gray-500">Best Odds</span>
            </button>
            <button
              onClick={() => openAccumulator('high')}
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-orange-500/50 hover:bg-orange-500/10 transition-all group"
            >
              <Flame size={24} className="text-orange-500 mb-2 group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold text-slate-700 dark:text-white">High Risk</span>
              <span className="text-[10px] text-gray-500">Big Win</span>
            </button>
          </div>
        </div>

        {renderMatchList(safeBets, "Sure Bets (Safe)", <ShieldCheck size={16} />, "text-green-500")}
        {renderMatchList(valueBets, "Value Picks", <Star size={16} />, "text-vantage-cyan")}
        {renderMatchList(riskyBets, "High Risk / High Reward", <Flame size={16} />, "text-orange-500")}

        <AccumulatorModal isOpen={isAccuOpen} onClose={() => setIsAccuOpen(false)} initialRisk={accuRisk} />
      </div>
    );
  }

  // --- LOCKED VIEW (Conversion Page) ---
  return (
    <div className="space-y-4 pb-24 relative min-h-screen">
      <div className="flex flex-col space-y-1 relative z-10">
        <h1 className="text-2xl font-bold font-orbitron text-slate-900 dark:text-white">{t('vip.title')} <span className="text-vantage-purple">{t('vip.title_accent')}</span></h1>
        <div className="flex items-center gap-2 text-xs text-vantage-purple font-bold bg-vantage-purple/10 w-fit px-2 py-1 rounded-full border border-vantage-purple/20">
          <Crown size={12} />
          {t('vip.exclusive_community') || 'VIP Exclusive Community'}
        </div>
      </div>

      <div className="absolute top-20 right-0 w-64 h-64 bg-vantage-purple/10 rounded-full blur-[80px] pointer-events-none" />

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="animate-spin text-vantage-purple" size={40} />
        </div>
      ) : !user ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <GlassCard className="flex flex-col items-center text-center p-8 border-vantage-purple/20 bg-vantage-purple/5">
            <div className="w-16 h-16 bg-slate-200 dark:bg-white/10 rounded-full flex items-center justify-center mb-4 text-gray-500 dark:text-gray-400">
              <User size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{t('auth.auth_error') || 'Authentication Required'}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              {t('auth.login_subtitle') || 'Please log in or create an account to view VIP plans and predictions.'}
            </p>
            <button
              onClick={() => setTab('profile')}
              className="px-6 py-3 bg-vantage-purple hover:bg-purple-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-vantage-purple/20 flex items-center space-x-2"
            >
              <span>{t('auth.login_btn')}</span>
              <ArrowRight size={18} />
            </button>
          </GlassCard>
        </div>
      ) : (
        <>
          {/* TEASER SECTION (Locked Content Visual) */}
          <div className="relative mb-8">
            {/* The "Blur" Effect Layer */}
            <div className="absolute inset-0 z-20 backdrop-blur-[6px] bg-vantage-bg/30 rounded-2xl flex flex-col items-center justify-center text-center p-4 border border-vantage-purple/30">
              <div className="w-14 h-14 bg-vantage-purple text-white rounded-full flex items-center justify-center mb-3 shadow-[0_0_20px_rgba(168,85,247,0.4)]">
                <Lock size={24} />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">Premium Analysis Locked</h3>
              <p className="text-xs text-gray-300 mb-4 max-w-[200px]">
                Unlock 3 "Sure Banker" matches and our high-yield accumulator for today.
              </p>
              <button
                onClick={() => document.getElementById('plans-section')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-xs font-bold text-vantage-cyan flex items-center gap-1 hover:underline"
              >
                View Access Plans <ArrowRight size={12} />
              </button>
            </div>

            {/* Fake Content Behind Blur */}
            <div className="opacity-50 pointer-events-none select-none filter grayscale-[50%]">
              {[1, 2].map(i => (
                <div key={i} className="mb-3 p-4 rounded-xl border border-white/5 bg-white/5 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-700" />
                    <div className="space-y-1">
                      <div className="h-3 w-20 bg-slate-700 rounded" />
                      <div className="h-2 w-12 bg-slate-700 rounded" />
                    </div>
                  </div>
                  <div className="h-6 w-12 bg-green-500/20 rounded" />
                </div>
              ))}
            </div>
          </div>

          <div id="plans-section" className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest">{t('vip.select_plan')}</h3>
              <div className="flex items-center gap-1.5 text-[10px] text-vantage-purple bg-vantage-purple/10 px-2 py-0.5 rounded border border-vantage-purple/20">
                <Sparkles size={10} /> 90% Win Rate
              </div>
            </div>

            {/* HIGH CONVERSION PRICING CARDS */}
            <div className="flex flex-col gap-4">
              {plans.map((plan) => (
                <motion.button
                  key={plan.id}
                  onClick={() => handlePlanClick(plan.id as any)}
                  whileTap={{ scale: 0.98 }}
                  className={`
                            relative w-full text-left p-0 rounded-2xl border transition-all duration-300 overflow-hidden group
                            ${plan.color}
                            ${selectedPlanId === plan.id ? 'ring-2 ring-vantage-purple ring-offset-2 ring-offset-black' : ''}
                        `}
                >
                  {/* Popular Badge */}
                  {plan.badge && (
                    <div className="absolute top-0 right-0 bg-gradient-to-l from-vantage-purple to-purple-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl shadow-lg flex items-center gap-1 z-10">
                      {plan.badge === 'MOST POPULAR' && <Crown size={10} fill="currentColor" />}
                      {plan.badge}
                    </div>
                  )}

                  <div className="p-5 flex justify-between items-center relative z-0">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-bold text-slate-300 uppercase tracking-wide">{plan.label}</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold font-orbitron text-white">{plan.price} <span className="text-sm text-gray-400 font-sans">FCFA</span></span>
                        {plan.originalPrice && (
                          <span className="text-xs text-gray-500 line-through decoration-red-500 decoration-2">{plan.originalPrice}</span>
                        )}
                      </div>
                      {(() => {
                        const local = getLocalPrice(Number(plan.price)); return local ? (
                          <span className="text-[10px] text-vantage-cyan/70 font-mono">{local}</span>
                        ) : null;
                      })()}
                      <div className="flex items-center gap-2 mt-2">
                        {plan.features.map((feat, idx) => (
                          <span key={idx} className="text-[10px] flex items-center text-gray-400 bg-black/20 px-2 py-0.5 rounded-full">
                            <Check size={8} className="mr-1 text-vantage-cyan" /> {feat}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-vantage-purple group-hover:text-white transition-colors text-gray-400">
                      <ArrowRight size={20} />
                    </div>
                  </div>

                  {/* Hover Effect */}
                  <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                </motion.button>
              ))}
            </div>

            {/* Trust Signals */}
            <div className="pt-4 flex flex-col items-center space-y-3">
              <div className="flex items-center justify-center gap-4 opacity-70 grayscale hover:grayscale-0 transition-all flex-wrap">
                <img src="https://upload.wikimedia.org/wikipedia/commons/3/3f/MTN-logo.jpg" alt="MTN" className="h-6 object-contain rounded-sm" />
                <img src="https://upload.wikimedia.org/wikipedia/commons/c/c8/Orange_logo.svg" alt="Orange" className="h-6 object-contain" />
                <div className="bg-white px-2 py-0.5 rounded flex items-center justify-center h-6">
                  <img src="https://selar.co/images/logo.png" alt="Selar" className="h-4 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = '<span class="text-black font-bold text-xs tracking-tight">Selar</span>'; }} />
                </div>
              </div>

              <div className="flex items-center gap-1 text-[10px] text-gray-500 text-center">
                <ShieldCheck size={12} className="text-green-500 shrink-0" />
                <span>Secure Payment via Fapshi & Selar • Instant Activation</span>
              </div>

              {/* Manual Verification Button */}
              <div className="w-full border-t border-slate-200 dark:border-white/5 pt-2 mt-2">
                <button
                  onClick={handleManualCheck}
                  disabled={isVerifying}
                  className="w-full text-xs text-gray-500 hover:text-vantage-cyan flex items-center justify-center space-x-1 py-1"
                >
                  <RefreshCw size={12} className={isVerifying ? "animate-spin" : ""} />
                  <span>
                    {language === 'fr' ? "Problème d'activation ? Vérifier le statut" : "Activation issue? Check status"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        plan={selectedPlanObj}
        onSuccess={() => console.log("Payment flow completed")}
      />
    </div>
  );
};