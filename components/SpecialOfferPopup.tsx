import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Gift, Zap, ArrowRight } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { PaymentModal } from './PaymentModal';

export const SpecialOfferPopup: React.FC = () => {
  const { language } = useAppContext();
  const { userProfile, isAdmin } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  const isVip = userProfile?.isVip === true || isAdmin;

  useEffect(() => {
    // Never show to VIP users or admins
    if (isVip) return;
    if (!sessionStorage.getItem('offerPopupSeen')) {
      const timer = setTimeout(() => {
        setIsOpen(true);
        sessionStorage.setItem('offerPopupSeen', 'true');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isVip]);

  const handleClaim = () => {
    setIsOpen(false);
    setShowPayment(true);
  };

  const trialPlan = {
    id: 'weekly',
    label: language === 'fr' ? 'Essai VIP (1 Semaine)' : 'VIP Trial (1 Week)',
    price: '1000',
    features: ['Accumulator Access', 'Sure Bet Matches'],
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-[#1a1d26] border border-vantage-purple/30 rounded-2xl overflow-hidden shadow-2xl"
            >
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-vantage-cyan to-vantage-purple" />
              <button 
                onClick={() => setIsOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-white p-1 rounded-full bg-white/5"
              >
                <X size={16} />
              </button>

              <div className="p-6 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-vantage-purple to-vantage-cyan rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-vantage-purple/30">
                  <Gift size={32} className="text-white" />
                </div>
                <h2 className="text-xl font-bold font-orbitron text-white mb-2">
                  {language === 'fr' ? 'Offre Exclusive !' : 'Exclusive Offer!'}
                </h2>
                <p className="text-sm text-gray-400 mb-6">
                  {language === 'fr' 
                    ? 'Débloquez 1 Semaine d\'essai VIP pour seulement 2000 FCFA. De plus, profitez de 50% de bonus sur le plan mensuel !'
                    : 'Unlock 1 Week VIP Trial for just 2000 FCFA. Plus, get 50% bonus on the monthly plan!'}
                </p>

                <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6 text-left">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold text-gray-300">1-Week Trial</span>
                    <span className="text-lg font-bold text-vantage-purple">1 000 FCFA</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
                    <Zap size={12} className="text-vantage-cyan" /> Access to daily accumulators
                  </div>
                </div>

                <button
                  onClick={handleClaim}
                  className="w-full bg-vantage-purple hover:bg-purple-600 text-white font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <span>{language === 'fr' ? 'Réclamer Maintenant' : 'Claim Offer Now'}</span>
                  <ArrowRight size={18} />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <PaymentModal 
        isOpen={showPayment}
        onClose={() => setShowPayment(false)}
        plan={trialPlan as any}
      />
    </>
  );
};
