import React from 'react';
import { motion } from 'framer-motion';
import { Gift, ArrowRight } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

export const SpecialOfferBanner: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const { language } = useAppContext();
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="cursor-pointer bg-gradient-to-r from-vantage-purple to-purple-600 rounded-xl p-3 mb-4 flex items-center justify-between shadow-lg shadow-vantage-purple/20 border border-white/10"
    >
      <div className="flex items-center gap-3">
        <div className="bg-white/20 p-2 rounded-lg">
          <Gift size={20} className="text-white" />
        </div>
        <div>
          <h3 className="text-white font-bold text-sm leading-tight">
            {language === 'fr' ? 'Offre Spéciale !' : 'Special Offer!'}
          </h3>
          <p className="text-white/80 text-xs">
            {language === 'fr' 
              ? 'Essai VIP à 1000 FCFA & 50% de bonus mensuel' 
              : '1000 FCFA Trial & 50% Monthly Bonus'}
          </p>
        </div>
      </div>
      <div className="bg-white/10 p-1.5 rounded-full text-white">
        <ArrowRight size={16} />
      </div>
    </motion.div>
  );
};
