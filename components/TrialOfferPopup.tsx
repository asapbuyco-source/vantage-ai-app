/**
 * TrialOfferPopup.tsx
 * ───────────────────
 * Time-limited 1-week trial offer popup.
 *
 * Logic:
 *  - First render: set expiry = now + 1 hour in localStorage
 *  - Countdown ring ticks every second
 *  - At expiry: auto-dismiss, never shown again this device
 *  - On CLAIM: mark claimed, call onClaim() immediately
 *  - On dismiss (×): mark expired immediately
 *  - Never shown to VIP users or admins
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Flame, Zap, Clock } from 'lucide-react';

const STORAGE_KEY_EXPIRY   = 'vantage_trial_expiry';
const STORAGE_KEY_CLAIMED  = 'vantage_trial_claimed';
const OFFER_DURATION_MS    = 60 * 60 * 1000; // 1 hour
const RADIUS               = 28;
const CIRCUMFERENCE        = 2 * Math.PI * RADIUS;

interface TrialOfferPopupProps {
  /** Called immediately when the user clicks "CLAIM NOW" */
  onClaim: () => void;
}

function getOrCreateExpiry(): number | null {
  const claimed = localStorage.getItem(STORAGE_KEY_CLAIMED);
  if (claimed === 'true') return null; // already claimed — never show

  const stored = localStorage.getItem(STORAGE_KEY_EXPIRY);
  if (stored === 'expired') return null; // already expired — never show

  if (stored) {
    const ts = parseInt(stored, 10);
    if (!isNaN(ts)) return ts;
  }

  // First time — create expiry
  const expiry = Date.now() + OFFER_DURATION_MS;
  localStorage.setItem(STORAGE_KEY_EXPIRY, String(expiry));
  return expiry;
}

export const TrialOfferPopup: React.FC<TrialOfferPopupProps> = ({ onClaim }) => {
  const [visible, setVisible]   = useState(false);
  const [expiry, setExpiry]     = useState<number | null>(null);
  const [remaining, setRemaining] = useState(OFFER_DURATION_MS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialise on mount
  useEffect(() => {
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
    // Small delay so the page renders first, then popup slides in
    const showTimer = setTimeout(() => setVisible(true), 1800);
    return () => clearTimeout(showTimer);
  }, []);

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
    localStorage.setItem(STORAGE_KEY_EXPIRY, 'expired');
    setVisible(false);
  }, []);

  // ── SVG Ring helpers ──────────────────────────────────────────────────────
  const totalSeconds = OFFER_DURATION_MS / 1000;
  const elapsedSeconds = (OFFER_DURATION_MS - remaining) / 1000;
  const progress = Math.max(0, 1 - elapsedSeconds / totalSeconds);
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  const mm = String(Math.floor(remaining / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');

  // Urgency colour: orange → red in last 10 minutes
  const isUrgent = remaining < 10 * 60 * 1000;
  const ringColour = isUrgent ? '#ef4444' : '#f97316';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="trial-popup"
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0,   opacity: 1 }}
          exit={{ y: 140,  opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          style={{
            position: 'fixed',
            bottom: '80px',        // above bottom nav
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'min(96vw, 420px)',
            zIndex: 9999,
          }}
        >
          {/* Glow layer */}
          <div style={{
            position: 'absolute', inset: -2,
            borderRadius: 20,
            background: 'linear-gradient(135deg, #f97316, #ef4444, #a855f7)',
            opacity: 0.6,
            filter: 'blur(8px)',
          }} />

          {/* Card */}
          <div style={{
            position: 'relative',
            background: 'linear-gradient(145deg, #0f0f1a, #1a1028)',
            border: '1.5px solid rgba(249,115,22,0.5)',
            borderRadius: 18,
            padding: '18px 18px 16px',
            overflow: 'hidden',
          }}>

            {/* Subtle shimmer strip */}
            <motion.div
              animate={{ x: ['-100%', '200%'] }}
              transition={{ repeat: Infinity, duration: 2.5, ease: 'linear', repeatDelay: 1.5 }}
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '100%',
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)',
                pointerEvents: 'none',
              }}
            />

            {/* Dismiss button */}
            <button
              id="trial-popup-dismiss"
              onClick={handleDismiss}
              aria-label="Dismiss offer"
              style={{
                position: 'absolute', top: 10, right: 10,
                background: 'rgba(255,255,255,0.08)',
                border: 'none', borderRadius: 999,
                width: 26, height: 26, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#9ca3af',
              }}
            >
              <X size={13} />
            </button>

            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              {/* Countdown ring */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <svg width={70} height={70} viewBox="0 0 70 70">
                  {/* Background track */}
                  <circle
                    cx={35} cy={35} r={RADIUS}
                    fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5}
                  />
                  {/* Progress arc */}
                  <circle
                    cx={35} cy={35} r={RADIUS}
                    fill="none"
                    stroke={ringColour}
                    strokeWidth={5}
                    strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={dashOffset}
                    transform="rotate(-90 35 35)"
                    style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s' }}
                  />
                  {/* Timer text */}
                  <text x="35" y="33" textAnchor="middle" fontSize={11} fontWeight="700"
                    fill={ringColour} fontFamily="monospace">{mm}:{ss}</text>
                  <text x="35" y="46" textAnchor="middle" fontSize={7}
                    fill="rgba(255,255,255,0.4)" fontFamily="sans-serif">left</text>
                </svg>

                {/* Pulsing outer ring when urgent */}
                {isUrgent && (
                  <motion.div
                    animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ repeat: Infinity, duration: 1.2 }}
                    style={{
                      position: 'absolute', inset: -4,
                      borderRadius: '50%',
                      border: `2px solid ${ringColour}`,
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </div>

              {/* Offer text */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                  <Flame size={13} color="#f97316" />
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#f97316',
                    textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Limited Offer
                  </span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#ffffff', lineHeight: 1.2,
                  marginBottom: 4 }}>
                  1-Week VIP Trial
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 20, fontWeight: 900, color: '#f97316' }}>
                    1 000 FCFA
                  </span>
                  <span style={{
                    fontSize: 12, color: '#6b7280',
                    textDecoration: 'line-through',
                  }}>
                    2 000 FCFA
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: '#10b981',
                    background: 'rgba(16,185,129,0.15)',
                    border: '1px solid rgba(16,185,129,0.3)',
                    borderRadius: 999, padding: '1px 6px',
                  }}>-50%</span>
                </div>
              </div>
            </div>

            {/* Feature pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 13 }}>
              {['✓ Full predictions', '✓ Accumulators', '✓ Kelly stakes', '✓ All leagues'].map(f => (
                <span key={f} style={{
                  fontSize: 10, color: '#d1d5db',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 999, padding: '2px 8px',
                }}>{f}</span>
              ))}
            </div>

            {/* CTA button */}
            <motion.button
              id="trial-popup-claim"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleClaim}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #f97316, #ef4444)',
                border: 'none', borderRadius: 12,
                padding: '11px 0',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                cursor: 'pointer',
                color: '#ffffff', fontWeight: 800, fontSize: 14,
                letterSpacing: '0.04em',
                boxShadow: '0 4px 20px rgba(249,115,22,0.4)',
              }}
            >
              <Zap size={15} fill="white" />
              CLAIM NOW →
            </motion.button>

            {/* Urgency footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 5, marginTop: 8 }}>
              <Clock size={10} color="#6b7280" />
              <span style={{ fontSize: 10, color: '#6b7280' }}>
                Offer expires automatically when timer ends
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TrialOfferPopup;
