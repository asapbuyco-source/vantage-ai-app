import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { Toast as ToastType } from '../types';

const ICONS = {
    success: CheckCircle2,
    error: XCircle,
    info: Info,
    warning: AlertTriangle,
};

const COLORS = {
    success: {
        bg: 'bg-green-500/10 border-green-500/30',
        icon: 'text-green-400',
        text: 'text-green-100',
    },
    error: {
        bg: 'bg-red-500/10 border-red-500/30',
        icon: 'text-red-400',
        text: 'text-red-100',
    },
    info: {
        bg: 'bg-vantage-cyan/10 border-vantage-cyan/30',
        icon: 'text-vantage-cyan',
        text: 'text-slate-200',
    },
    warning: {
        bg: 'bg-orange-500/10 border-orange-500/30',
        icon: 'text-orange-400',
        text: 'text-orange-100',
    },
};

const ToastItem: React.FC<{ toast: ToastType; onDismiss: (id: string) => void }> = ({
    toast,
    onDismiss,
}) => {
    const Icon = ICONS[toast.type];
    const colors = COLORS[toast.type];

    return (
        // @ts-ignore
        <motion.div
            layout
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className={`
        flex items-start gap-3 px-4 py-3 rounded-2xl border backdrop-blur-lg shadow-xl
        min-w-[280px] max-w-[90vw] pointer-events-auto
        ${colors.bg}
      `}
        >
            <Icon className={`shrink-0 mt-0.5 ${colors.icon}`} size={18} />
            <p className={`text-sm flex-1 font-medium leading-snug ${colors.text}`}>
                {toast.message}
            </p>
            <button
                onClick={() => onDismiss(toast.id)}
                className="shrink-0 text-gray-500 hover:text-white transition-colors mt-0.5"
            >
                <X size={15} />
            </button>
        </motion.div>
    );
};

export const ToastContainer: React.FC = () => {
    const { toasts, removeToast } = useAppContext();

    return (
        <div
            className="fixed bottom-24 left-0 right-0 z-[9999] flex flex-col items-center gap-3 pointer-events-none px-4"
            aria-live="polite"
        >
            <AnimatePresence mode="popLayout">
                {toasts.map(toast => (
                    <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
                ))}
            </AnimatePresence>
        </div>
    );
};
