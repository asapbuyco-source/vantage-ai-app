import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Smartphone, Loader2, ArrowRight } from 'lucide-react';
import { initiatePayment } from '../services/fapshi';
import { useAuth } from '../context/AuthContext';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: { id: string; label: string; price: string };
  onSuccess: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({ isOpen, onClose, plan, onSuccess }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePay = async () => {
    if (!user?.email) {
      setError("Email requis pour le reçu.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Sanitize price (remove non-digits) to handle "1 500" or "1,500" formatted strings
      const numericPrice = parseInt(plan.price.replace(/\D/g, ''));

      // 1. Initiate Payment
      const result = await initiatePayment(numericPrice, user.email, user.uid);

      // 2. Handle Redirect Flow
      if (result.link) {
        // Save the plan ID to localStorage so we can retrieve it when the user returns
        localStorage.setItem('pendingVipPlan', plan.id);

        // Redirect the user to the payment page (Fapshi)
        // They will be redirected back to our site with a transaction ID
        window.location.href = result.link;
      } else {
        throw new Error("Pas de lien de paiement reçu.");
      }

    } catch (err: any) {
      console.error(err);
      setError("Erreur de paiement. Veuillez réessayer.");
      setLoading(false);
    }
  };

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
              className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md"
            />
          }
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
            {
              // @ts-ignore
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="w-full max-w-sm pointer-events-auto bg-white dark:bg-vantage-bg border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden"
              >
                {/* Decorative background */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-vantage-purple/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>

                <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors z-10">
                  <X size={20} className="text-gray-500" />
                </button>

                <div className="space-y-6">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-vantage-purple/10 text-vantage-purple rounded-2xl flex items-center justify-center mx-auto mb-4 border border-vantage-purple/20">
                      <Smartphone size={32} />
                    </div>
                    <h2 className="text-xl font-bold font-orbitron text-slate-900 dark:text-white">Paiement Mobile</h2>
                    <p className="text-sm text-gray-500 mt-1">Sécurisé par Fapshi</p>
                  </div>

                  <div className="bg-slate-50 dark:bg-black/20 p-4 rounded-xl border border-slate-200 dark:border-white/5 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Plan</span>
                      <span className="font-bold text-slate-900 dark:text-white">{plan.label}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Montant</span>
                      <span className="font-bold text-vantage-purple font-orbitron text-lg">{plan.price} FCFA</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">Compte</span>
                      <span className="font-medium text-slate-700 dark:text-gray-300 truncate max-w-[150px]">{user?.email}</span>
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 bg-red-500/10 text-red-500 text-xs rounded-lg border border-red-500/20 text-center">
                      {error}
                    </div>
                  )}

                  <button
                    onClick={handlePay}
                    disabled={loading}
                    className="w-full py-4 bg-vantage-purple hover:bg-purple-600 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-vantage-purple/30 flex items-center justify-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={20} className="animate-spin" />
                        <span>Redirection...</span>
                      </>
                    ) : (
                      <>
                        <span>Payer Maintenant</span>
                        <ArrowRight size={18} />
                      </>
                    )}
                  </button>

                  <div className="flex justify-center items-center space-x-4 opacity-50 grayscale">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/3/3f/MTN-logo.jpg" alt="MTN" className="h-6" />
                    <img src="https://upload.wikimedia.org/wikipedia/commons/c/c8/Orange_logo.svg" alt="Orange" className="h-6" />
                  </div>
                </div>
              </motion.div>
            }
          </div>
        </>
      )}
    </AnimatePresence>
  );
};