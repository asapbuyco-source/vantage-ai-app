import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check, Share2, Users, MousePointerClick, TrendingUp, Wallet, Crown, Loader2, Banknote, Clock, MessageCircle } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { GlassCard } from '../components/GlassCard';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { PayoutRequest } from '../types';

const WEB_BASE = 'https://vantageai.online';

export const Influencer: React.FC = () => {
    const navigate = useNavigate();
    const { language, tr, showToast } = useAppContext();
    const { user, userProfile, isAdmin, requestPayout, getPayoutRequests } = useAuth();

    const isInfluencer = userProfile?.isInfluencer === true || isAdmin;
    const code = userProfile?.referralCode || '';
    const shareLink = code ? `${WEB_BASE}/?ref=${code}` : '';
    const rate = userProfile?.commissionRate ?? 40;

    const [clicks, setClicks] = useState<number | null>(null);
    const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
    const [loadingPayouts, setLoadingPayouts] = useState(true);
    const [copied, setCopied] = useState<'link' | 'code' | null>(null);

    const [amount, setAmount] = useState('');
    const [phone, setPhone] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const earnings = userProfile?.referralEarnings || 0;
    const signups = userProfile?.referralCount || 0;
    const paying = userProfile?.referralPurchases || 0;
    const conversion = clicks && clicks > 0 ? Math.round((paying / clicks) * 100) : null;

    useEffect(() => {
        if (!code) return;
        getDoc(doc(db, 'referral_codes', code))
            .then(snap => setClicks(snap.exists() ? (snap.data().clicks || 0) : 0))
            .catch(() => setClicks(0));
    }, [code]);

    const loadPayouts = () => {
        if (!user) return;
        setLoadingPayouts(true);
        getPayoutRequests()
            .then(setPayouts)
            .catch(() => {})
            .finally(() => setLoadingPayouts(false));
    };
    useEffect(loadPayouts, [user?.uid]);

    const copy = async (text: string, kind: 'link' | 'code') => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(kind);
            setTimeout(() => setCopied(null), 1500);
            showToast(tr('Copié !', 'Copied!', '¡Copiado!', 'Copiado!'), 'success');
        } catch {
            showToast(tr('Copie impossible', 'Copy failed', 'No se pudo copiar', 'Falha ao copiar'), 'error');
        }
    };

    const shareWhatsApp = () => {
        if (!shareLink) return;
        const text = tr(
            `Rejoins Vantage AI avec mon lien et suis les meilleures analyses sportives : ${shareLink}`,
            `Join Vantage AI with my link and follow the best sports analytics: ${shareLink}`,
            `Únete a Vantage AI con mi enlace y sigue los mejores análisis deportivos: ${shareLink}`,
            `Entre no Vantage AI com meu link e acompanhe as melhores análises esportivas: ${shareLink}`
        );
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    };

    const submitPayout = async (e: React.FormEvent) => {
        e.preventDefault();
        const value = parseInt(amount, 10);
        if (isNaN(value) || value < 1000) {
            showToast(tr('Minimum 1000 FCFA', 'Minimum 1000 FCFA', 'Mínimo 1000 FCFA', 'Mínimo 1000 FCFA'), 'error');
            return;
        }
        if (value > earnings) {
            showToast(tr('Solde insuffisant', 'Insufficient balance', 'Saldo insuficiente', 'Saldo insuficiente'), 'error');
            return;
        }
        if (!phone.trim()) {
            showToast(tr('Entrez votre numéro Mobile Money', 'Enter your Mobile Money number', 'Ingresa tu número de Mobile Money', 'Digite seu número de Mobile Money'), 'error');
            return;
        }
        setSubmitting(true);
        try {
            await requestPayout(value, phone.trim());
            setAmount('');
            showToast(tr('Demande de retrait envoyée', 'Payout request sent', 'Solicitud de retiro enviada', 'Solicitação de saque enviada'), 'success');
            loadPayouts();
        } catch (err: any) {
            showToast(err?.message || tr('Échec de la demande', 'Request failed', 'Solicitud fallida', 'Solicitação falhou'), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const statusStyle = (status: string) =>
        status === 'paid'
            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
            : status === 'rejected'
                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                : 'bg-amber-500/10 text-amber-500 border-amber-500/20';

    const statusLabel = (status: string) =>
        status === 'paid'
            ? tr('Payé', 'Paid', 'Pagado', 'Pago')
            : status === 'rejected'
                ? tr('Refusé', 'Rejected', 'Rechazado', 'Recusado')
                : tr('En attente', 'Pending', 'Pendiente', 'Pendente');

    if (!isInfluencer) {
        return (
            <div className="space-y-5 pb-24">
                <GlassCard className="text-center py-12">
                    <Crown size={34} className="mx-auto mb-3 text-vantage-purple opacity-60" />
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                        {tr('Espace Partenaire', 'Partner Space', 'Espacio de Socios', 'Espaço de Parceiros')}
                    </h2>
                    <p className="text-sm text-gray-500 max-w-xs mx-auto mb-5">
                        {tr(
                            'Ce tableau de bord est réservé aux partenaires et influenceurs approuvés.',
                            'This dashboard is reserved for approved partners and influencers.',
                            'Este panel está reservado para socios e influencers aprobados.',
                            'Este painel é reservado para parceiros e influenciadores aprovados.'
                        )}
                    </p>
                    <button onClick={() => navigate('/')} className="px-6 py-3 bg-vantage-cyan text-slate-900 font-bold rounded-xl">
                        {tr('Retour', 'Back', 'Volver', 'Voltar')}
                    </button>
                </GlassCard>
            </div>
        );
    }

    return (
        <div className="space-y-5 pb-24">
            {/* Header */}
            <div className="flex items-center gap-3">
                <button onClick={() => navigate(-1)} className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 text-gray-500 hover:text-vantage-cyan transition-colors">
                    <ArrowLeft size={18} />
                </button>
                <div>
                    <h1 className="text-xl font-black font-orbitron text-slate-900 dark:text-white uppercase tracking-tight">
                        {tr('Espace', 'Partner', 'Espacio', 'Espaço')} <span className="text-vantage-purple">{tr('Partenaire', 'Space', 'Socios', 'Parceiros')}</span>
                    </h1>
                    <p className="text-xs text-gray-500">
                        {tr(`Gagnez ${rate}% sur chaque abonnement`, `Earn ${rate}% on every subscription`, `Gana ${rate}% en cada suscripción`, `Ganhe ${rate}% em cada assinatura`)}
                    </p>
                </div>
            </div>

            {/* Commission rate */}
            <div className="flex items-center justify-between rounded-2xl border border-vantage-purple/30 bg-gradient-to-r from-vantage-purple/15 to-transparent px-4 py-3">
                <div className="flex items-center gap-2.5">
                    <Crown size={18} className="text-vantage-purple" />
                    <span className="text-xs font-bold text-slate-800 dark:text-white/90">
                        {tr('Taux de commission', 'Commission rate', 'Tasa de comisión', 'Taxa de comissão')}
                    </span>
                </div>
                <span className="text-lg font-black font-mono text-vantage-purple">{rate}%</span>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
                <GlassCard className="p-4">
                    <div className="flex items-center gap-2 text-gray-500 text-[10px] uppercase font-bold mb-2">
                        <MousePointerClick size={14} className="text-vantage-cyan" />
                        {tr('Clics', 'Clicks', 'Clics', 'Cliques')}
                    </div>
                    <p className="text-2xl font-black font-orbitron text-slate-900 dark:text-white">{clicks === null ? '—' : clicks}</p>
                </GlassCard>
                <GlassCard className="p-4">
                    <div className="flex items-center gap-2 text-gray-500 text-[10px] uppercase font-bold mb-2">
                        <Users size={14} className="text-emerald-500" />
                        {tr('Inscriptions', 'Signups', 'Registros', 'Cadastros')}
                    </div>
                    <p className="text-2xl font-black font-orbitron text-slate-900 dark:text-white">{signups}</p>
                </GlassCard>
                <GlassCard className="p-4">
                    <div className="flex items-center gap-2 text-gray-500 text-[10px] uppercase font-bold mb-2">
                        <TrendingUp size={14} className="text-amber-500" />
                        {tr('Clients payants', 'Paying clients', 'Clientes de pago', 'Clientes pagantes')}
                    </div>
                    <p className="text-2xl font-black font-orbitron text-slate-900 dark:text-white">{paying}</p>
                </GlassCard>
                <GlassCard className="p-4 border-vantage-purple/25 bg-vantage-purple/5">
                    <div className="flex items-center gap-2 text-gray-500 text-[10px] uppercase font-bold mb-2">
                        <Wallet size={14} className="text-vantage-purple" />
                        {tr('Gains', 'Earnings', 'Ganancias', 'Ganhos')}
                    </div>
                    <p className="text-xl font-black font-mono text-vantage-purple">{earnings.toLocaleString()} <span className="text-xs">FCFA</span></p>
                </GlassCard>
            </div>

            {/* Real conversion: click → paying client */}
            {conversion !== null && (
                <div className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-4 py-2.5">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                        {tr('Conversion clic → client', 'Click → client conversion', 'Conversión clic → cliente', 'Conversão clique → cliente')}
                    </span>
                    <span className="text-sm font-black font-mono text-vantage-cyan">{conversion}%</span>
                </div>
            )}

            {/* Share */}
            <GlassCard className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">{tr('Votre lien', 'Your link', 'Tu enlace', 'Seu link')}</h3>
                <div className="flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-white/10 px-3 py-2.5">
                    <span className="text-xs font-mono text-slate-800 dark:text-white/90 truncate flex-1">{shareLink || '—'}</span>
                    <button onClick={() => copy(shareLink, 'link')} className="p-1.5 rounded-lg bg-white dark:bg-white/10 text-gray-500 hover:text-vantage-cyan shrink-0">
                        {copied === 'link' ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 rounded-xl bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-white/10 px-3 py-2.5 flex-1">
                        <span className="text-[10px] text-gray-500 uppercase font-bold">{tr('Code', 'Code', 'Código', 'Código')}</span>
                        <span className="text-sm font-black font-mono tracking-widest text-slate-900 dark:text-white">{code || '—'}</span>
                    </div>
                    <button onClick={() => copy(code, 'code')} className="p-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-gray-500 hover:text-vantage-cyan">
                        {copied === 'code' ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                    </button>
                    <button onClick={shareWhatsApp} className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20" title="WhatsApp">
                        <Share2 size={16} />
                    </button>
                </div>
                <p className="text-[10px] text-gray-500 leading-relaxed">
                    {tr(
                        'Partagez ce lien : vos filleuls entrent le code à l\'inscription. Vous gagnez la commission quand ils s\'abonnent.',
                        'Share this link: your referrals enter the code at signup. You earn commission when they subscribe.',
                        'Comparte este enlace: tus referidos ingresan el código al registrarse. Ganas comisión cuando se suscriben.',
                        'Compartilhe este link: seus indicados inserem o código no cadastro. Você ganha comissão quando eles assinam.'
                    )}
                </p>
            </GlassCard>

            {/* Payout request */}
            <GlassCard className="space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                        <Banknote size={14} className="text-emerald-500" />
                        {tr('Retrait', 'Payout', 'Retiro', 'Saque')}
                    </h3>
                    <span className="text-xs font-bold text-vantage-purple font-mono">{earnings.toLocaleString()} FCFA</span>
                </div>
                <form onSubmit={submitPayout} className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            type="number"
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            placeholder={tr('Montant (min 1000)', 'Amount (min 1000)', 'Monto (mín 1000)', 'Valor (mín 1000)')}
                            className="bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-vantage-cyan"
                        />
                        <input
                            type="tel"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            placeholder={tr('N° Mobile Money', 'Mobile Money number', 'N° Mobile Money', 'N° Mobile Money')}
                            className="bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-vantage-cyan"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={submitting || earnings < 1000}
                        className="w-full py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-emerald-600 transition-colors"
                    >
                        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Banknote size={16} />}
                        {tr('Demander le retrait', 'Request payout', 'Solicitar retiro', 'Solicitar saque')}
                    </button>
                </form>
                <p className="text-[10px] text-gray-500">
                    {tr(
                        'Paiement par Mobile Money (Orange / MTN). Traité sous 48h après approbation.',
                        'Paid via Mobile Money (Orange / MTN). Processed within 48h after approval.',
                        'Pago por Mobile Money (Orange / MTN). Procesado en 48h tras la aprobación.',
                        'Pagamento via Mobile Money (Orange / MTN). Processado em até 48h após aprovação.'
                    )}
                </p>
            </GlassCard>

            {/* Payout history */}
            <GlassCard className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                    <Clock size={14} />
                    {tr('Historique des retraits', 'Payout history', 'Historial de retiros', 'Histórico de saques')}
                </h3>
                {loadingPayouts ? (
                    <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-vantage-cyan" /></div>
                ) : payouts.length === 0 ? (
                    <p className="text-xs text-gray-500 py-3 text-center">{tr('Aucun retrait pour le moment.', 'No payouts yet.', 'Sin retiros por ahora.', 'Nenhum saque por enquanto.')}</p>
                ) : (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
                        {payouts.map(p => (
                            <div key={p.id} className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-white/5 px-3 py-2">
                                <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-900 dark:text-white">{Number(p.amount).toLocaleString()} FCFA</p>
                                    <p className="text-[10px] text-gray-500">
                                        {p.date ? new Date(p.date).toLocaleDateString() : ''} · {p.phoneNumber}
                                    </p>
                                </div>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${statusStyle(p.status)}`}>
                                    {statusLabel(p.status)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </GlassCard>

            {/* Support */}
            <a
                href="https://wa.me/237688203629?text=Hi%2C%20I%20am%20a%20Vantage%20AI%20influencer"
                target="_blank"
                rel="noreferrer"
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#25D366]/10 border border-[#25D366]/25 text-[#25D366] text-xs font-bold"
            >
                <MessageCircle size={14} />
                {tr('Contacter l\'équipe partenaires', 'Contact the partner team', 'Contactar al equipo de socios', 'Contatar a equipe de parceiros')}
            </a>
        </div>
    );
};
