import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Clock, Terminal, Cpu, LineChart, ShieldCheck } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { WEEKLY_REGULAR_PRICE, WEEKLY_TRIAL_PRICE } from '../src/constants/pricing';

const STORAGE_KEY_EXPIRY   = 'vantage_trial_expiry';
const STORAGE_KEY_CLAIMED  = 'vantage_trial_claimed';
const STORAGE_KEY_MINI     = 'vantage_trial_mini'; // collapsed to icon
const OFFER_DURATION_MS    = 24 * 60 * 60 * 1000; // 24 hours
const RADIUS               = 26;
const CIRCUMFERENCE        = 2 * Math.PI * RADIUS;

interface TrialOfferPopupProps {
  onClaim: () => void;
  isVip?: boolean;
}

function getOrCreateExpiry(): number | null {
  const claimed = localStorage.getItem(STORAGE_KEY_CLAIMED);
  if (claimed === 'true') return null; // already claimed

  const stored = localStorage.getItem(STORAGE_KEY_EXPIRY);
  if (stored === 'expired') return null; // already expired

  if (stored) {
    const ts = parseInt(stored, 10);
    if (!isNaN(ts)) return ts;
  }

  // First time — create expiry
  const expiry = Date.now() + OFFER_DURATION_MS;
  localStorage.setItem(STORAGE_KEY_EXPIRY, String(expiry));
  return expiry;
}

export const TrialOfferPopup: React.FC<TrialOfferPopupProps> = ({ onClaim, isVip = false }) => {
  const { language } = useAppContext();
  const [visible, setVisible]   = useState(false);
  const [expiry, setExpiry]     = useState<number | null>(null);
  const [remaining, setRemaining] = useState(OFFER_DURATION_MS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Translations
  const t = {
    limited: language === 'fr' ? 'Accès Prioritaire' : 'Priority Access',
    title: language === 'fr' ? 'Débloquer le Terminal Alpha' : 'Unlock Alpha Terminal',
    claim: language === 'fr' ? 'ACTIVER L\'ACCÈS ALPHA' : 'ACTIVATE ALPHA ACCESS',
    features: language === 'fr' 
      ? [
          '✓ Signaux +EV en Temps Réel', 
          '✓ Stratégie Kelly Bankroll',
          '✓ Filtres Avancés Screener'
        ]
      : [
          '✓ Real-Time +EV Signals', 
          '✓ Kelly Bankroll Strategy',
          '✓ Advanced Screener Filters'
        ],
    expires: language === 'fr' 
      ? 'La session d\'accès prioritaire expire automatiquement :' 
      : 'Priority access window closes automatically in :',
  };

  // Initialise on mount
  useEffect(() => {
    if (isVip) return;
    
    const ts = getOrCreateExpiry();
    if (!ts) return;

    const now = Date.now();
    const left = ts - now;
    if (left <= 0) {
      localStorage.setItem(STORAGE_KEY_EXPIRY, 'expired');
      return;
    }

    setExpiry(ts);
    setRemaining(left);
    const showTimer = setTimeout(() => setVisible(true), 2500);
    return () => clearTimeout(showTimer);
  }, [isVip]);

  // Tick countdown
  useEffect(() => {
    if (!visible || !expiry) return;

    intervalRef.current = setInterval(() => {
      const left = expiry - Date.now();
      if (left <= 0) {
        localStorage.setItem(STORAGE_KEY_EXPIRY, 'expired');
        setVisible(false);
        clearInterval(intervalRef.current!);
      } else {
        setRemaining(left);
      }
    }, 1000);

    return () => clearInterval(intervalRef.current!);
  }, [visible, expiry]);

  const handleClaim = useCallback(() => {
    localStorage.setItem(STORAGE_KEY_CLAIMED, 'true');
    setVisible(false);
    onClaim();
  }, [onClaim]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY_MINI, 'true');
    setVisible(false);
    setShowMini(true);
  }, []);

  const [showMini, setShowMini] = useState(() => {
    if (localStorage.getItem(STORAGE_KEY_CLAIMED) === 'true') return false;
    if (localStorage.getItem(STORAGE_KEY_EXPIRY) === 'expired') return false;
    return localStorage.getItem(STORAGE_KEY_MINI) === 'true';
  });

  const totalSeconds = OFFER_DURATION_MS / 1000;
  const elapsedSeconds = (OFFER_DURATION_MS - remaining) / 1000;
  const progress = Math.max(0, 1 - elapsedSeconds / totalSeconds);
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  const hh = String(Math.floor(remaining / 3600000)).padStart(2, '0');
  const mm = String(Math.floor((remaining % 3600000) / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            key="trial-popup"
            initial={{ y: 120, x: "-50%", opacity: 0 }}
            animate={{ y: 0,   x: "-50%", opacity: 1 }}
            exit={{ y: 140,  x: "-50%", opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            className="fixed bottom-[84px] left-1/2 -translate-x-1/2 w-[min(94vw,430px)] z-[9999]"
          >
            {/* Ambient Cyan glow behind */}
            <div className="absolute -inset-[1px] bg-gradient-to-r from-vantage-cyan to-indigo-500 rounded-[20px] opacity-40 blur-md pointer-events-none" />
            <div className="absolute inset-0 bg-[#0a0e17]/90 rounded-[18px] pointer-events-none border border-vantage-cyan/20 shadow-[0_0_30px_rgba(0,229,255,0.1)]" />

            {/* Content card */}
            <div className="relative bg-[#0a0e17]/95 rounded-[18px] p-5 overflow-hidden">
              
              {/* Shimmer stripe */}
              <motion.div
                animate={{ x: ['-100%', '200%'] }}
                transition={{ repeat: Infinity, duration: 3, ease: 'linear', repeatDelay: 2 }}
                className="absolute inset-0 bg-gradient-to-r from-transparent via-vantage-cyan/5 to-transparent pointer-events-none"
              />

              {/* Close Button */}
              <button
                id="trial-popup-dismiss"
                onClick={handleDismiss}
                aria-label="Dismiss offer"
                className="absolute top-3.5 right-3.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all rounded-lg w-7 h-7 flex items-center justify-center cursor-pointer text-gray-400 hover:text-white"
              >
                <X size={14} />
              </button>

              {/* Header row */}
              <div className="flex gap-4 items-start mb-4">
                {/* Advanced Tech-ring countdown */}
                <div className="relative flex-shrink-0 mt-1">
                  <svg width={64} height={64} viewBox="0 0 64 64" className="transform -rotate-90">
                    <circle cx={32} cy={32} r={RADIUS} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={3} />
                    <circle
                      cx={32} cy={32} r={RADIUS} fill="none"
                      stroke="#00E5FF" strokeWidth={3} strokeLinecap="round"
                      strokeDasharray={CIRCUMFERENCE} strokeDashoffset={dashOffset}
                      className="transition-all duration-1000 ease-linear"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-mono text-[9px] font-bold text-slate-400">SESSION</span>
                    <span className="font-mono text-[10px] font-black text-vantage-cyan">{hh}h</span>
                  </div>
                </div>

                {/* Offer title & pricing info */}
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Terminal size={12} className="text-vantage-cyan" />
                    <span className="text-[10px] font-extrabold text-vantage-cyan tracking-widest uppercase">
                      {t.limited}
                    </span>
                  </div>
                  <h3 className="text-white font-black text-[16px] leading-tight tracking-wide mb-1.5">
                    {t.title}
                  </h3>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-xs text-slate-400 line-through">
                      ${WEEKLY_REGULAR_PRICE} USD
                    </span>
                    <span className="font-mono text-xl font-black text-[#00E5FF]">
                      ${WEEKLY_TRIAL_PRICE} USD
                    </span>
                    <span className="text-[9px] font-extrabold text-[#00E5FF]/70 tracking-widest uppercase px-1.5 py-0.5 rounded border border-vantage-cyan/25 bg-vantage-cyan/5">
                      7-DAY ALPHA
                    </span>
                  </div>
                </div>
              </div>

              {/* Features grid with premium icons */}
              <div className="grid grid-cols-2 gap-2 mb-4 bg-slate-950/40 border border-white/5 rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <Cpu size={12} className="text-vantage-cyan animate-pulse" />
                  <span className="text-[11px] font-bold text-slate-300">Quant Signals</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap size={12} className="text-vantage-cyan" />
                  <span className="text-[11px] font-bold text-slate-300">Kelly Staking</span>
                </div>
                <div className="flex items-center gap-2">
                  <ShieldCheck size={12} className="text-vantage-cyan" />
                  <span className="text-[11px] font-bold text-slate-300">Full Screener</span>
                </div>
              </div>

              {/* CTA button */}
              <motion.button
                id="trial-popup-claim"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleClaim}
                className="w-full py-3 bg-gradient-to-r from-vantage-cyan via-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 transition-all border-none rounded-xl flex items-center justify-center gap-2 cursor-pointer text-[#0b0f19] font-black text-[13px] tracking-widest shadow-lg shadow-vantage-cyan/25 hover:shadow-cyan-400/30"
              >
                <Zap size={14} fill="currentColor" />
                {t.claim}
              </motion.button>

              {/* Timer status footer */}
              <div className="flex items-center justify-center gap-2 mt-3.5 border-t border-white/5 pt-3">
                <Clock size={11} className="text-slate-500 animate-pulse" />
                <span className="text-[10px] font-bold text-slate-500 tracking-wide uppercase">
                  {t.expires}
                </span>
                <span className="font-mono text-[11px] font-black text-vantage-cyan bg-slate-950/60 border border-white/5 px-2 py-0.5 rounded">
                  {hh}:{mm}:{ss}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating mini tab button if dismissed */}
      <AnimatePresence>
        {!isVip && showMini && !visible && (
          <motion.button
            key="trial-mini"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 20 }}
            onClick={() => {
              setShowMini(false);
              localStorage.removeItem(STORAGE_KEY_MINI);
              setVisible(true);
            }}
            aria-label="Reopen terminal offer"
            className="fixed bottom-[88px] left-4 z-[9998] w-12 h-12 rounded-full bg-gradient-to-r from-vantage-cyan to-indigo-500 border-none cursor-pointer flex items-center justify-center shadow-lg shadow-vantage-cyan/30"
          >
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="absolute -inset-1 rounded-full border-2 border-vantage-cyan animate-pulse"
            />
            <div className="text-center flex flex-col items-center">
              <span className="font-mono text-[10px] font-black text-white leading-none">{hh}:{mm}</span>
              <span className="text-[7px] font-extrabold text-white/80 tracking-wide uppercase mt-0.5">OPEN</span>
            </div>
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
};

export default TrialOfferPopup;
