import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Loader2, MessageCircle, ShieldCheck, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { GlassCard } from './GlassCard';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

const SUPPORT_URL =
  'https://wa.me/237688203629?text=Hi%2C%20I%20need%20help%20with%20my%20Vantage%20AI%20Google%20Play%20subscription.';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: {
    id: 'weekly' | 'monthly' | 'annual';
    label: string;
    price: string;
    features: string[];
  };
  onSuccess?: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, plan, onSuccess }) => {
  const { language, showToast, tr } = useAppContext();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [paymentFailed, setPaymentFailed] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoState, setPromoState] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle');
  const [promoMessage, setPromoMessage] = useState('');

  const isNative = Capacitor.isNativePlatform();
  const apiKey = import.meta.env.VITE_REVENUECAT_GOOGLE_API_KEY || '';
  const revenueCatConfigured = Boolean(apiKey) && !apiKey.includes('PLACEHOLDER') && !apiKey.includes('your_');

  // Poll the Firestore profile until the RevenueCat webhook grants VIP (usually < 10s).
  const waitForVipActivation = async (uid: string, attempts = 10) => {
    for (let i = 0; i < attempts; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const snap = await getDoc(doc(db, 'profiles', uid));
        if (snap.exists() && snap.data().isVip === true) return true;
      } catch (_) {}
    }
    return false;
  };

  useEffect(() => {
    if (!isOpen) return;
    setLoading(false);
    setPaymentFailed(false);
    setErrorDetail(null);
    setPromoCode('');
    setPromoState('idle');
    setPromoMessage('');
  }, [isOpen, plan.id]);

  const applyPromo = async () => {
    const code = promoCode.trim().toUpperCase();
    if (!code || !user?.uid) return;
    setPromoState('checking');
    setPromoMessage('');
    try {
      const snap = await getDoc(doc(db, 'referral_codes', code));
      if (!snap.exists()) {
        setPromoState('invalid');
        setPromoMessage(tr('Code invalide', 'Invalid code', 'Código inválido', 'Código inválido'));
        return;
      }
      const ownerUid = snap.data()?.ownerUid;
      if (ownerUid === user.uid) {
        setPromoState('invalid');
        setPromoMessage(tr('Vous ne pouvez pas utiliser votre propre code', 'You cannot use your own code', 'No puedes usar tu propio código', 'Você não pode usar seu próprio código'));
        return;
      }
      const bonus = Number(snap.data()?.bonusDays) || 7;
      await updateDoc(doc(db, 'profiles', user.uid), { appliedPromoCode: code });
      setPromoState('valid');
      setPromoMessage(tr(
        `Code appliqué — +${bonus} jours offerts sur votre premier paiement`,
        `Code applied — +${bonus} bonus days on your first payment`,
        `Código aplicado — +${bonus} días gratis en tu primer pago`,
        `Código aplicado — +${bonus} dias grátis no primeiro pagamento`
      ));
    } catch (e) {
      console.warn('[Payments] promo validation failed:', e);
      setPromoState('invalid');
      setPromoMessage(tr('Erreur de vérification', 'Could not verify code', 'No se pudo verificar', 'Não foi possível verificar'));
    }
  };

  const handlePayment = async () => {
    if (!user) {
      showToast(tr("Veuillez vous connecter d'abord", 'Please login first', 'Inicia sesión primero', 'Faça login primeiro'), 'info');
      return;
    }

    if (!isNative) {
      showToast(
        tr(
          "Les abonnements Play Store sont disponibles uniquement dans l'application Android.",
          'Play Store subscriptions are available only in the Android app.',
          'Las suscripciones de Play Store solo están disponibles en la app de Android.',
          'As assinaturas da Play Store estão disponíveis apenas no app Android.'
        ),
        'info'
      );
      setPaymentFailed(true);
      return;
    }

    if (!revenueCatConfigured) {
      showToast(
        tr(
          'Google Play Billing nest pas encore configure.',
          'Google Play Billing is not configured yet.',
          'Google Play Billing aún no está configurado.',
          'Google Play Billing ainda não está configurado.'
        ),
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
      
      const configStatus = await Purchases.isConfigured();
      if (!configStatus.isConfigured) {
        await Purchases.configure({ apiKey });
        if (user?.uid) {
          await Purchases.logIn({ appUserID: user.uid });
        }
      }

      const offerings = await Purchases.getOfferings();
      const packages = offerings.current?.availablePackages || [];
      if (packages.length === 0) {
        throw new Error(
          '[NO_PRODUCTS] RevenueCat returned 0 products. Fix: 1) RevenueCat > App Settings > upload your Google Play service account JSON, 2) Play Console > Monetize > Subscriptions must be ACTIVE, 3) RevenueCat product IDs must match your Play Console product IDs exactly.'
        );
      }

      const pkgToBuy =
        packages.find((pkg) => pkg.identifier === plan.id || pkg.identifier.includes(plan.id)) || packages[0];

      const purchaseResult = await Purchases.purchasePackage({ aPackage: pkgToBuy });

      // VIP is granted server-side by the RevenueCat webhook (Firebase Admin SDK).
      // Client-side writes to isVip/vipExpiry are rejected by Firestore rules, so we
      // wait for the webhook to land and poll the profile instead of writing directly.
      const activationConfirmed = await waitForVipActivation(user.uid);
      if (activationConfirmed) {
        const amount = Number.parseFloat(String(plan.price).replace(/[^\d.]/g, '')) || 0;
        import('../services/facebookTracking').then(({ logFacebookPurchase, logFacebookEvent }) => {
          logFacebookPurchase(amount, 'USD', { plan: plan.id }).catch(() => {});
          logFacebookEvent('Subscribe', { plan: plan.id, currency: 'USD' }).catch(() => {});
        }).catch(() => {});
        showToast(
          tr('🎉 VIP actif ! Profitez de toutes les fonctionnalités.', '🎉 VIP activated! Enjoy all premium features.', '🎉 ¡VIP activado! Disfruta de todas las funciones.', '🎉 VIP ativado! Aproveite todos os recursos.'),
          'success'
        );
      } else {
        showToast(
          tr(
            "Achat réussi. Le VIP sera activé automatiquement — reconnectez-vous si nécessaire.",
            'Purchase successful. VIP will activate automatically — re-login if needed.',
            'Compra exitosa. El VIP se activará automáticamente — vuelve a iniciar sesión si es necesario.',
            'Compra bem-sucedida. O VIP será ativado automaticamente — faça login novamente se necessário.'
          ),
          'success'
        );
      }

      localStorage.removeItem('pendingVipPlan');
      onSuccess?.();
      onClose();
    } catch (e: any) {
      if (e?.userCancelled) {
        showToast(tr('Paiement annule.', 'Payment cancelled.', 'Pago cancelado.', 'Pagamento cancelado.'), 'info');
      } else {
        // Build a human-readable error string from RevenueCat error object
        const code = e?.code ?? e?.underlyingErrorMessage ?? '';
        const rawMsg = e?.message ?? e?.localizedDescription ?? JSON.stringify(e);
        const msg = String(rawMsg).startsWith('[NO_PRODUCTS]')
          ? tr(
            'Aucun abonnement trouve dans Google Play. Contactez le support (WhatsApp) — cela vient des reglages RevenueCat/Play Console, pas de votre telephone.',
            'No Google Play subscriptions found. Contact support via WhatsApp — this is a RevenueCat/Play Console configuration issue, not your phone.',
            'No se encontraron suscripciones de Google Play. Contacta al soporte (WhatsApp) — es un problema de configuración de RevenueCat/Play Console, no de tu teléfono.',
            'Nenhuma assinatura da Google Play encontrada. Contate o suporte (WhatsApp) — é um problema de configuração do RevenueCat/Play Console, não do seu telefone.'
          )
          : rawMsg;
        const detail = `Code: ${code} | ${msg}`;
        console.error('[Payments] Google Play purchase failed:', detail, e);
        setErrorDetail(detail);
        showToast(
          tr(
            'Erreur Google Play. Reessayez ou contactez le support.',
            'Google Play error. Try again or contact support.',
            'Error de Google Play. Reintenta o contacta al soporte.',
            'Erro na Google Play. Tente novamente ou contate o suporte.'
          ),
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

              {/* Promo / influencer code — grants bonus days on the first payment */}
              {isNative && (
                <div className="mb-5">
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-gray-500">
                    {tr('Code promo (optionnel)', 'Promo code (optional)', 'Código promo (opcional)', 'Código promo (opcional)')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={promoCode}
                      onChange={(e) => {
                        setPromoCode(e.target.value.toUpperCase());
                        if (promoState !== 'idle') { setPromoState('idle'); setPromoMessage(''); }
                      }}
                      placeholder="CODE"
                      className="flex-1 rounded-xl bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-white/10 px-3 py-2.5 text-sm font-mono font-bold tracking-widest text-slate-900 dark:text-white outline-none focus:border-vantage-cyan"
                    />
                    <button
                      type="button"
                      onClick={applyPromo}
                      disabled={!promoCode.trim() || promoState === 'checking' || promoState === 'valid'}
                      className="px-4 rounded-xl bg-vantage-purple/10 text-vantage-purple text-xs font-bold border border-vantage-purple/20 hover:bg-vantage-purple/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      {promoState === 'checking' && <Loader2 size={14} className="animate-spin" />}
                      {promoState === 'valid'
                        ? tr('Appliqué', 'Applied', 'Aplicado', 'Aplicado')
                        : tr('Appliquer', 'Apply', 'Aplicar', 'Aplicar')}
                    </button>
                  </div>
                  {promoMessage && (
                    <p className={`mt-1.5 text-[10px] font-medium ${promoState === 'valid' ? 'text-emerald-500' : promoState === 'invalid' ? 'text-red-400' : 'text-gray-500'}`}>
                      {promoMessage}
                    </p>
                  )}
                </div>
              )}

              {!isNative && (
                <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
                    <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-200">
                      {tr(
                        "Pour respecter Google Play, les paiements externes ont ete retires. Ouvrez l'application Android pour acheter via Google Play.",
                        'External payments have been removed for Google Play compliance. Open the Android app to buy through Google Play.',
                        'Para cumplir con Google Play, los pagos externos fueron retirados. Abre la app de Android para comprar vía Google Play.',
                        'Para cumprir com a Google Play, os pagamentos externos foram removidos. Abra o app Android para comprar pela Google Play.'
                      )}
                    </p>
                  </div>
                </div>
              )}

              {isNative && !revenueCatConfigured && (
                <div className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
                    <p className="text-xs leading-relaxed text-red-600 dark:text-red-300">
                      {tr(
                        'RevenueCat nest pas configure dans cette build. Ajoutez VITE_REVENUECAT_GOOGLE_API_KEY dans Codemagic.',
                        'RevenueCat is not configured in this build. Add VITE_REVENUECAT_GOOGLE_API_KEY in Codemagic.',
                        'RevenueCat no está configurado en esta compilación. Agrega VITE_REVENUECAT_GOOGLE_API_KEY en Codemagic.',
                        'RevenueCat não está configurado nesta build. Adicione VITE_REVENUECAT_GOOGLE_API_KEY no Codemagic.'
                      )}
                    </p>
                  </div>
                </div>
              )}

              <button
                onClick={handlePayment}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 font-bold text-white shadow-lg shadow-emerald-500/30 transition-all hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <ShieldCheck size={19} />}
                <span>{tr('Payer avec Google Play', 'Pay with Google Play', 'Pagar con Google Play', 'Pagar com o Google Play')}</span>
              </button>

              {paymentFailed && (
                <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
                  <p className="mb-2 text-sm font-bold text-red-500">
                    {tr('Paiement non termine.', 'Payment not completed.', 'Pago no completado.', 'Pagamento não concluído.')}
                  </p>
                  {errorDetail && (
                    <p className="mb-2 text-[10px] break-all text-red-400 font-mono bg-red-500/10 rounded p-2">
                      {errorDetail}
                    </p>
                  )}
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
                  <a href="https://vantageai.online/privacy" target="_blank" rel="noreferrer" className="underline hover:text-vantage-cyan">Privacy Policy</a>
                  <a href="https://vantageai.online/terms" target="_blank" rel="noreferrer" className="underline hover:text-vantage-cyan">Terms of Service</a>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
