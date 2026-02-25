import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CreditCard, Smartphone, CheckCircle2, ShieldCheck, ArrowRight, Loader2, Globe } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { initiatePayment } from '../services/fapshi';
import { initiateSelarPayment } from '../services/selar';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: {
    id: 'daily' | 'weekly' | 'monthly' | 'annual';
    label: string;
    price: string;
    features: string[];
  };
  onSuccess?: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, plan, onSuccess }) => {
  const { t, language, showToast } = useAppContext();
  const { user, userProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [gateway, setGateway] = useState<'fapshi' | 'selar'>('fapshi');

  const handlePayment = async () => {
    if (!user) {
      showToast(language === 'fr' ? "Veuillez vous connecter d'abord" : "Please login first", "info");
      return;
    }

    setLoading(true);
    localStorage.setItem('pendingVipPlan', plan.id);

    try {
      if (gateway === 'fapshi') {
        const { link } = await initiatePayment(
          parseInt(plan.price),
          user.email || 'user@vantage.ai',
          user.uid
        );
        window.location.href = link;
      } else {
        const { checkout_url } = await initiateSelarPayment(
          plan.id,
          user.email || 'user@vantage.ai',
          user.uid
        );
        window.location.href = checkout_url;
      }
    } catch (e: any) {
      showToast(e.message || "Payment initiation failed", "error");
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
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold font-orbitron text-slate-900 dark:text-white">
                  {language === 'fr' ? 'Paiement Sécurisé' : 'Secure Payment'}
                </h2>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors"
                >
                  <X size={20} className="text-gray-500" />
                </button>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/10 mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-500">{plan.label}</span>
                  <span className="text-lg font-bold text-vantage-purple">{plan.price} FCFA</span>
                </div>
                <div className="space-y-1">
                  {plan.features.slice(0, 2).map((feat, i) => (
                    <div key={i} className="flex items-center text-[10px] text-gray-400">
                      <CheckCircle2 size={10} className="text-vantage-cyan mr-1.5" />
                      {feat}
                    </div>
                  ))}
                </div>
              </div>

              {/* Gateway Selection */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <button
                  onClick={() => setGateway('fapshi')}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${gateway === 'fapshi' ? 'border-vantage-purple bg-vantage-purple/10 text-vantage-purple' : 'border-slate-200 dark:border-white/10 text-gray-500 dark:text-gray-400'}`}
                >
                  <Smartphone size={20} />
                  <span className="text-xs font-bold">Cameroon (MoMo)</span>
                </button>
                <button
                  onClick={() => setGateway('selar')}
                  className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${gateway === 'selar' ? 'border-vantage-cyan bg-vantage-cyan/10 text-vantage-cyan' : 'border-slate-200 dark:border-white/10 text-gray-500 dark:text-gray-400'}`}
                >
                  <Globe size={20} />
                  <span className="text-xs font-bold">Global (Selar)</span>
                </button>
              </div>

              <button
                onClick={handlePayment}
                disabled={loading}
                className="w-full py-4 bg-vantage-purple hover:bg-purple-600 text-white font-bold rounded-2xl transition-all shadow-lg shadow-vantage-purple/30 flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    <span>{language === 'fr' ? 'Payer Maintenant' : 'Pay Now'}</span>
                    <ArrowRight size={20} />
                  </>
                )}
              </button>

              <div className="mt-4 flex items-center justify-center space-x-2 text-[10px] text-gray-500">
                <ShieldCheck size={12} className="text-green-500" />
                <span>Secure SSL Encryption • Vantage AI v4.0</span>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};