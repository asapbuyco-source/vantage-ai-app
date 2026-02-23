
import React, { useEffect } from 'react';
import { ChevronLeft, Shield, FileText, Lock } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { useAppContext } from '../context/AppContext';

interface LegalDocProps {
  type: 'privacy' | 'terms';
  onBack: () => void;
}

export const LegalDoc: React.FC<LegalDocProps> = ({ type, onBack }) => {
  const { language } = useAppContext();

  // Scroll to top when opened
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const isPrivacy = type === 'privacy';
  const title = isPrivacy 
    ? (language === 'fr' ? 'Politique de Confidentialité' : 'Privacy Policy')
    : (language === 'fr' ? 'Conditions d\'Utilisation' : 'Terms of Service');

  return (
    <div className="space-y-6 animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="flex items-center space-x-3 sticky top-0 z-20 bg-vantage-bg/80 backdrop-blur-xl py-2 -mx-2 px-2">
        <button 
          onClick={onBack}
          className="p-2 -ml-2 rounded-full hover:bg-slate-200 dark:hover:bg-white/5 transition-colors"
        >
          <ChevronLeft size={24} className="text-slate-900 dark:text-white" />
        </button>
        <h1 className="text-xl font-bold font-orbitron text-slate-900 dark:text-white flex items-center gap-2">
           {isPrivacy ? <Shield size={20} className="text-vantage-cyan" /> : <FileText size={20} className="text-vantage-purple" />}
           {title}
        </h1>
      </div>

      <GlassCard className="prose dark:prose-invert max-w-none prose-sm prose-headings:font-orbitron prose-headings:text-slate-900 dark:prose-headings:text-white prose-p:text-slate-600 dark:prose-p:text-gray-300 prose-li:text-slate-600 dark:prose-li:text-gray-300">
        
        {/* PRIVACY POLICY CONTENT */}
        {isPrivacy && (
            language === 'fr' ? (
                <>
                    <p><strong>Dernière mise à jour :</strong> {new Date().toLocaleDateString()}</p>
                    <p>Chez <strong>Vantage AI</strong>, nous accordons une importance capitale à la confidentialité de vos données. Ce document explique comment nous collectons, utilisons et protégeons vos informations.</p>
                    
                    <h3>1. Collecte des Données</h3>
                    <p>Nous collectons les informations suivantes lorsque vous utilisez notre application :</p>
                    <ul>
                        <li><strong>Informations de Compte :</strong> Adresse email, nom d'affichage et photo de profil (via Google Auth ou Email).</li>
                        <li><strong>Données de Paiement :</strong> Historique des transactions pour les abonnements VIP (montant, date, ID de transaction). Nous ne stockons PAS vos informations bancaires ou de carte de crédit ; celles-ci sont gérées par nos partenaires de paiement sécurisés (Fapshi).</li>
                        <li><strong>Données d'Utilisation :</strong> Interactions avec l'application pour améliorer nos prédictions AI.</li>
                    </ul>

                    <h3>2. Utilisation des Données</h3>
                    <p>Vos données sont utilisées pour :</p>
                    <ul>
                        <li>Fournir l'accès aux services (Prédictions gratuites et VIP).</li>
                        <li>Gérer votre abonnement et vérifier les paiements.</li>
                        <li>Améliorer la précision de notre algorithme Vantage AI.</li>
                        <li>Vous contacter en cas de problème technique ou de mise à jour importante.</li>
                    </ul>

                    <h3>3. Sécurité</h3>
                    <p>Nous utilisons des protocoles de sécurité standards (chiffrement SSL, authentification Firebase sécurisée) pour protéger vos données contre tout accès non autorisé.</p>

                    <h3>4. Partage des Données</h3>
                    <p>Nous ne vendons jamais vos données personnelles. Les données peuvent être partagées uniquement avec :</p>
                    <ul>
                        <li><strong>Fournisseurs de services :</strong> Hébergement (Google Cloud), Authentification (Firebase), Paiement (Fapshi).</li>
                        <li><strong>Obligations légales :</strong> Si requis par la loi.</li>
                    </ul>

                    <h3>5. Vos Droits</h3>
                    <p>Vous avez le droit d'accéder, de rectifier ou de supprimer vos données personnelles. Pour exercer ce droit, veuillez contacter notre support via la section Profil.</p>
                </>
            ) : (
                <>
                    <p><strong>Last Updated:</strong> {new Date().toLocaleDateString()}</p>
                    <p>At <strong>Vantage AI</strong>, we prioritize your data privacy. This document explains how we collect, use, and protect your information.</p>
                    
                    <h3>1. Data Collection</h3>
                    <p>We collect the following information when you use our app:</p>
                    <ul>
                        <li><strong>Account Information:</strong> Email address, display name, and profile photo (via Google Auth or Email).</li>
                        <li><strong>Payment Data:</strong> Transaction history for VIP subscriptions (amount, date, transaction ID). We do NOT store your banking or credit card details; these are handled by our secure payment partners (Fapshi).</li>
                        <li><strong>Usage Data:</strong> Interactions with the app to improve our AI predictions.</li>
                    </ul>

                    <h3>2. Data Usage</h3>
                    <p>Your data is used to:</p>
                    <ul>
                        <li>Provide access to services (Free and VIP predictions).</li>
                        <li>Manage your subscription and verify payments.</li>
                        <li>Improve the accuracy of our Vantage AI algorithm.</li>
                        <li>Contact you regarding technical issues or important updates.</li>
                    </ul>

                    <h3>3. Security</h3>
                    <p>We use standard security protocols (SSL encryption, secure Firebase authentication) to protect your data against unauthorized access.</p>

                    <h3>4. Data Sharing</h3>
                    <p>We never sell your personal data. Data may only be shared with:</p>
                    <ul>
                        <li><strong>Service Providers:</strong> Hosting (Google Cloud), Authentication (Firebase), Payment (Fapshi).</li>
                        <li><strong>Legal Obligations:</strong> If required by law.</li>
                    </ul>

                    <h3>5. Your Rights</h3>
                    <p>You have the right to access, correct, or delete your personal data. To exercise this right, please contact our support via the Profile section.</p>
                </>
            )
        )}

        {/* TERMS OF SERVICE CONTENT */}
        {!isPrivacy && (
             language === 'fr' ? (
                <>
                    <p>En utilisant l'application <strong>Vantage AI</strong>, vous acceptez les conditions suivantes :</p>

                    <h3>1. Nature du Service</h3>
                    <p>Vantage AI est un outil d'analyse sportive utilisant l'intelligence artificielle pour fournir des statistiques et des prédictions sur les matchs de football. <strong>Ce n'est pas une application de paris sportifs ni un bookmaker.</strong></p>

                    <h3>2. Avertissement sur les Risques</h3>
                    <div className="bg-red-500/10 p-3 rounded-lg border border-red-500/20 text-red-600 dark:text-red-400 not-prose my-4 flex items-start gap-2">
                        <Lock className="shrink-0 mt-1" size={16} />
                        <span className="text-xs font-bold">Les paris sportifs comportent des risques financiers. Les prédictions fournies par Vantage AI sont à titre informatif uniquement et ne garantissent aucun gain. Vous êtes seul responsable de vos paris.</span>
                    </div>
                    <p>L'utilisateur reconnaît que les performances passées de l'algorithme ne garantissent pas les résultats futurs.</p>

                    <h3>3. Abonnements VIP</h3>
                    <ul>
                        <li>L'accès VIP est activé après confirmation du paiement via Mobile Money.</li>
                        <li>Les abonnements (Journalier, Hebdomadaire, Mensuel) ne sont <strong>pas remboursables</strong> une fois le service (prédictions) consommé.</li>
                        <li>En cas d'échec technique avéré, veuillez contacter le support pour une résolution.</li>
                    </ul>

                    <h3>4. Propriété Intellectuelle</h3>
                    <p>Tout le contenu de l'application (logos, algorithmes, design) est la propriété exclusive de Vantage AI. Toute reproduction ou distribution non autorisée est interdite.</p>

                    <h3>5. Résiliation</h3>
                    <p>Nous nous réservons le droit de suspendre tout compte ne respectant pas ces conditions, notamment en cas de tentative de fraude, de partage abusif de compte ou de comportement inapproprié.</p>
                </>
            ) : (
                <>
                    <p>By using the <strong>Vantage AI</strong> application, you agree to the following terms:</p>

                    <h3>1. Nature of Service</h3>
                    <p>Vantage AI is a sports analysis tool using artificial intelligence to provide statistics and predictions on football matches. <strong>It is not a sports betting application or a bookmaker.</strong></p>

                    <h3>2. Risk Warning</h3>
                    <div className="bg-red-500/10 p-3 rounded-lg border border-red-500/20 text-red-600 dark:text-red-400 not-prose my-4 flex items-start gap-2">
                        <Lock className="shrink-0 mt-1" size={16} />
                        <span className="text-xs font-bold">Sports betting involves financial risks. Predictions provided by Vantage AI are for informational purposes only and do not guarantee any winnings. You are solely responsible for your bets.</span>
                    </div>
                    <p>The user acknowledges that past performance of the algorithm does not guarantee future results.</p>

                    <h3>3. VIP Subscriptions</h3>
                    <ul>
                        <li>VIP access is activated after confirmation of payment via Mobile Money.</li>
                        <li>Subscriptions (Daily, Weekly, Monthly) are <strong>non-refundable</strong> once the service (predictions) has been consumed.</li>
                        <li>In case of a proven technical failure, please contact support for resolution.</li>
                    </ul>

                    <h3>4. Intellectual Property</h3>
                    <p>All content in the application (logos, algorithms, design) is the exclusive property of Vantage AI. Any unauthorized reproduction or distribution is prohibited.</p>

                    <h3>5. Termination</h3>
                    <p>We reserve the right to suspend any account that violates these terms, particularly in cases of attempted fraud, account sharing, or inappropriate behavior.</p>
                </>
            )
        )}
      </GlassCard>

      <div className="text-center pt-8 pb-4">
         <p className="text-[10px] text-gray-400">© 2024 Vantage AI. All rights reserved.</p>
      </div>
    </div>
  );
};
