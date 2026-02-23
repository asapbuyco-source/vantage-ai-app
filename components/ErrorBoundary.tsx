import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { GlassCard } from './GlassCard';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const isConfigError = this.state.error?.message.includes("api-key") || this.state.error?.message.includes("configuration");

      return (
        <div className="min-h-screen flex items-center justify-center bg-vantage-bg p-4">
          <GlassCard className="max-w-md w-full text-center p-8 border-red-500/30 bg-red-500/5">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
              <AlertTriangle size={32} />
            </div>
            <h1 className="text-xl font-bold font-orbitron text-slate-900 dark:text-white mb-2">
              {isConfigError ? "Configuration Error" : "System Malfunction"}
            </h1>
            <p className="text-gray-400 text-sm mb-6">
              {isConfigError 
                ? "The application is missing required configuration keys (API Key)." 
                : "The application encountered an unexpected error."}
            </p>
            
            <div className="bg-black/30 p-3 rounded-lg text-xs font-mono text-red-400 mb-6 text-left overflow-auto max-h-32">
              {this.state.error?.message}
            </div>

            {isConfigError && (
              <div className="text-xs text-gray-500 mb-6 bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/20 text-left">
                <strong>Hint:</strong> Ensure your <code>.env</code> file is created and contains <code>VITE_FIREBASE_API_KEY</code>.
              </div>
            )}

            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-red-500/20 flex items-center justify-center space-x-2"
            >
              <RefreshCw size={18} />
              <span>Reboot System</span>
            </button>
          </GlassCard>
        </div>
      );
    }

    return (this as any).props.children;
  }
}