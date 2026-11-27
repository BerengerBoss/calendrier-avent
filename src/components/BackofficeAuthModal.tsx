import React, { useState } from 'react';
import { Lock, Eye, EyeOff, X, ShieldCheck, Loader2 } from 'lucide-react';
import { adminSignIn } from '../lib/api';

interface BackofficeAuthModalProps {
  onSuccess: () => void;
  onClose: () => void;
}

export const BackofficeAuthModal: React.FC<BackofficeAuthModalProps> = ({
  onSuccess,
  onClose,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Renseignez votre email et votre mot de passe.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await adminSignIn(email, password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible.');
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#0F172A]/75 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-pop-in w-full max-w-md rounded-3xl bg-[#FFFDF7] border-[3.5px] border-[#1E293B] shadow-[10px_10px_0px_#1E293B] p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-[#1E293B] text-[#A3E635] text-xs font-bold">
            <ShieldCheck className="w-4 h-4" />
            ACCÈS ADMIN • CALENDRIER
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="cartoon-btn p-1.5 rounded-xl bg-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-center mb-5">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-[#FEF3C7] border-[2.5px] border-[#1E293B] shadow-[3px_3px_0px_#1E293B] flex items-center justify-center">
            <Lock className="w-7 h-7 text-[#1E293B]" />
          </div>
          <h2 className="font-display text-2xl font-bold text-[#1E293B]">
            Backoffice Transfo &amp; Change
          </h2>
          <p className="text-xs font-medium text-[#64748B] mt-1">
            Connectez-vous avec votre compte administrateur pour gérer les cases, l&apos;aperçu et les statistiques.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="admin-email" className="block text-xs font-bold text-[#1E293B] mb-1.5">
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              autoFocus
              autoComplete="username"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
              className="w-full px-4 py-2.5 rounded-xl border-[2.5px] border-[#1E293B] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#86BC25]"
            />
          </div>
          <div>
            <label htmlFor="admin-password" className="block text-xs font-bold text-[#1E293B] mb-1.5">
              Mot de passe
            </label>
            <div className="relative">
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                className={`w-full pr-11 pl-4 py-2.5 rounded-xl border-[2.5px] font-mono text-sm focus:outline-none ${
                  error
                    ? 'border-[#E11D48] bg-[#FFF1F2] animate-wiggle'
                    : 'border-[#1E293B] bg-white focus:ring-2 focus:ring-[#86BC25]'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#1E293B] cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {error && <p className="text-xs font-bold text-[#E11D48] mt-1.5">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={busy}
            className="cartoon-btn w-full py-2.5 rounded-xl bg-[#86BC25] text-[#1E293B] font-display font-bold text-base cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Déverrouiller le Studio →
          </button>
        </form>
      </div>
    </div>
  );
};
