import React, { useState } from 'react';
import { Gift, Loader2 } from 'lucide-react';

interface NameGateModalProps {
  calendarTitle: string;
  onSubmit: (firstName: string, lastName: string) => Promise<void>;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export const NameGateModal: React.FC<NameGateModalProps> = ({ calendarTitle, onSubmit }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const f = clean(firstName);
    const l = clean(lastName);
    if (f.length < 2 || l.length < 2) {
      setError('Merci de renseigner votre prénom et votre nom (2 caractères minimum).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(f, l);
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message}. Vérifiez votre connexion puis réessayez.`
          : 'Une erreur est survenue, réessayez.'
      );
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#0F172A]/80 backdrop-blur-sm">
      <div className="animate-pop-in w-full max-w-md rounded-3xl bg-[#FFFDF7] border-[3px] border-[#1C2B24]/15 shadow-sm p-6 sm:p-7">
        <div className="text-center mb-5">
          <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-[#86BC25] to-[#5D8A16] border border-[#1C2B24]/15 shadow-sm flex items-center justify-center text-white">
            <Gift className="w-8 h-8" />
          </div>
          <h2 className="font-display text-2xl font-bold text-[#0F172A]">Bienvenue ! 🎄</h2>
          <p className="text-sm text-[#475569] mt-1">{calendarTitle}</p>
          <p className="text-xs text-[#64748B] mt-3">
            Pour commencer, indiquez votre prénom et votre nom. Ils servent uniquement à suivre la
            participation au calendrier en interne.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="gate-first" className="block text-xs font-bold text-[#0F172A] mb-1">
              Prénom
            </label>
            <input
              id="gate-first"
              type="text"
              autoFocus
              autoComplete="given-name"
              maxLength={60}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-[#1C2B24]/15 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#86BC25]"
            />
          </div>
          <div>
            <label htmlFor="gate-last" className="block text-xs font-bold text-[#0F172A] mb-1">
              Nom
            </label>
            <input
              id="gate-last"
              type="text"
              autoComplete="family-name"
              maxLength={60}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-[#1C2B24]/15 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#86BC25]"
            />
          </div>

          {error && <p className="text-xs font-bold text-[#E11D48]">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="cartoon-btn w-full py-2.5 rounded-xl bg-[#86BC25] text-[#0F172A] font-display font-bold text-base cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Accéder au calendrier →
          </button>
        </form>
      </div>
    </div>
  );
};
