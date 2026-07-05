import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Loader2, MessageCircle, ShieldCheck, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { GlassCard } from './GlassCard';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

const SUPPORT_URL =
  'https://wa.me/237688203629?text=Hi%2C%20I%20need%20help%20with%20my%20Vantage%20AI%20Google%20Play%20subscription.';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: {
    id: 'weekly' | 'monthly' | 'quarterly' | 'annual';
    label: string;
    price: string;
    features: string[];
  };
  onSuccess?: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, plan, onSuccess }) => {
  const { language, showToast } = useAppContext();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [paymentFailed, setPaymentFailed] = useState(false);

  const isNative = Capacitor.isNativePlatform();
  const apiKey = import.meta.env.VITE_REVENUECAT_GOOGLE_API_KEY || '';
  const revenueCatConfigured = Boolean(apiKey) && !apiKey.includes('PLACEHOLDER') && !apiKey.includes('your_');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(false);
    setPaymentFailed(false);
  }, [isOpen, plan.id]);

  const handlePayment = async () => {
    if (!user) {
      showToast(language === 'fr' ? "Veuillez vous connecter d'abord" : 'Please login first', 'info');
      return;
    }

    if (!isNative) {
      showToast(
        language === 'fr'
          ? "Les abonnements Play Store sont disponibles uniquement dans l'application Android."
          : 'Play Store subscriptions are available only in the Android app.',
        'info'
      );
      setPaymentFailed(true);
      return;
    }

    if (!revenueCatConfigured) {
      showToast(
        language === 'fr'
          ? 'Google Play Billing nest pas encore configure.'
          : 'Google Play Billing is not configured yet.',
        'error'
      );
      setPaymentFailed(true);
      return;
    }

    setLoading(true);
    setPaymentFailed(false);
    localStorage.setItem('pendingVipPlan', plan.id);

    try {
      if (typeof window !== 'undefined' && (window as any).fbq) {
        (window as any).fbq('track', 'InitiateCheckout', {
          currency: 'USD',
          value: Number.parseFloat(plan.price),
        });
      }
    } catch (err) {
      console.error('Pixel error', err);
    }

    try {
      // Dynamically import RevenueCat only when needed on native
      const { Purchases } = await import('@revenuecat/purchases-capacitor');
      const offerings = await Purchases.getOfferings();
      const packages = offerings.current?.availablePackages || [];
      if (packages.length === 0) {
        throw new Error('No Google Play products are available for this offering.');
      }

      const pkgToBuy =
        packages.find((pkg) => pkg.identifier === plan.id || pkg.identifier.includes(plan.id)) || packages[0];

      const purchaseResult = await Purchases.purchasePackage({ aPackage: pkgToBuy });
      const hasVip = Boolean(purchaseResult.customerInfo.entitlements.active.vip_access);

      if (hasVip) {
        localStorage.removeItem('pendingVipPlan');
        showToast(
          language === 'fr' ? 'Achat reussi. Bienvenue VIP.' : 'Purchase successful. Welcome VIP.',
          'success'
        );
        onSuccess?.();
        onClose();
        return;
      }

      showToast(
        language === 'fr'
          ? 'Achat traite. VIP sera active par webhook sous peu.'
          : 'Purchase processed. VIP will activate by webhook shortly.',
        'info'
      );
      onSuccess?.();
      onClose();
    } catch (e: any) {
      if (e?.userCancelled) {
        showToast(language === 'fr' ? 'Paiement annule.' : 'Payment cancelled.', 'info');
      } else {
        console.error('[Payments] Google Play purchase failed:', e);
        showToast(
          language === 'fr'
            ? 'Erreur Google Play. Reessayez ou contactez le support.'
            : 'Google Play error. Try again or contact support.',
          'error'
        );
        setPaymentFailed(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md"
          >
            <GlassCard className="border-vantage-purple/20 overflow-hidden">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-bold font-orbitron text-slate-900 dark:text-white">
                  {language === 'fr' ? 'Google Play Billing' : 'Google Play Billing'}
                </h2>
                <button
                  onClick={onClose}
                  className="rounded-full p-2 transition-colors hover:bg-slate-100 dark:hover:bg-white/10"
                >
                  <X size={20} className="text-gray-500" />
                </button>
              </div>

              <div className="mb-6 rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-500">{plan.label}</span>
                  <span className="text-lg font-bold text-vantage-purple">${plan.price}</span>
                </div>
                <div className="space-y-1">
                  {plan.features.slice(0, 3).map((feature, index) => (
                    <div key={index} className="flex items-center text-[11px] text-gray-500 dark:text-gray-400">
                      <CheckCircle2 size={11} className="mr-1.5 text-vantage-cyan" />
                      {feature}
                    </div>
                  ))}
                </div>
              </div>

              {!isNative && (
                <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
                    <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-200">
                      {language === 'fr'
                        ? "Pour respecter Google Play, les paiements externes ont ete retires. Ouvrez l'application Android pour acheter via Google Play."
                        : 'External payments have been removed for Google Play compliance. Open the Android app to buy through Google Play.'}
                    </p>
                  </div>
                </div>
              )}

              {isNative && !revenueCatConfigured && (
                <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
                    <p className="text-xs leading-relaxed text-red-600 dark:text-red-300">
                      {language === 'fr'
                        ? 'RevenueCat nest pas configure dans cette build. Ajoutez VITE_REVENUECAT_GOOGLE_API_KEY dans Codemagic.'
                        : 'RevenueCat is not configured in this build. Add VITE_REVENUECAT_GOOGLE_API_KEY in Codemagic.'}
                    </p>
                  </div>
                </div>
              )}

              <button
                onClick={handlePayment}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-vantage-purple py-4 font-bold text-white shadow-lg shadow-vantage-purple/30 transition-all hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <ShieldCheck size={19} />}
                <span>{language === 'fr' ? 'Payer avec Google Play' : 'Pay with Google Play'}</span>
              </button>

              {paymentFailed && (
                <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
                  <p className="mb-2 text-sm font-bold text-red-500">
                    {language === 'fr' ? 'Paiement non termine.' : 'Payment not completed.'}
                  </p>
                  <a
                    href={SUPPORT_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1 rounded-lg bg-green-500 px-3 py-2 text-xs font-bold text-white"
                  >
                    <MessageCircle size={12} /> Support
                  </a>
                </div>
              )}

              <div className="mt-4 flex flex-col items-center justify-center space-y-2 text-[10px] text-gray-500">
                <div className="flex items-center space-x-2">
                  <ShieldCheck size={12} className="text-green-500" />
                  <span>Google Play secure billing</span>
                </div>
                <div className="flex space-x-3">
                  <a href="https://vantage-ai.com/privacy" target="_blank" rel="noreferrer" className="underline hover:text-vantage-cyan">Privacy Policy</a>
                  <a href="https://vantage-ai.com/terms" target="_blank" rel="noreferrer" className="underline hover:text-vantage-cyan">Terms of Service</a>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
