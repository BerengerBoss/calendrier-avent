import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Link2, Loader2, Lock, LockOpen, Plus, Trash2 } from 'lucide-react';
import { ShareLink } from '../../types/advent';
import {
  createShareLink,
  deleteShareLink,
  listShareLinks,
  setShareLinkOpen,
  shareLinkUrl,
} from '../../lib/api';
import { formatDateTimeFR } from '../../utils/calendar';

interface SharePanelProps {
  onNotify: (msg: string) => void;
}

export const SharePanel: React.FC<SharePanelProps> = ({ onNotify }) => {
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLinks(await listShareLinks());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(shareLinkUrl(token));
      onNotify('Lien copié dans le presse-papiers.');
    } catch {
      window.prompt('Copiez le lien :', shareLinkUrl(token));
    }
  };

  const run = async (key: string, action: () => Promise<void>, msg: string) => {
    setBusy(key);
    try {
      await action();
      onNotify(msg);
      await reload();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Action impossible');
    } finally {
      setBusy(null);
    }
  };

  const handleCreate = () =>
    run(
      'create',
      async () => {
        const link = await createShareLink(label, includeDrafts);
        setLabel('');
        try {
          await navigator.clipboard.writeText(shareLinkUrl(link.token));
        } catch {
          // clipboard unavailable: the link stays visible in the list
        }
      },
      'Lien créé et copié dans le presse-papiers.'
    );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="cartoon-box rounded-2xl bg-white p-5 space-y-4">
        <div>
          <h3 className="font-display text-lg font-semibold flex items-center gap-2">
            <Link2 className="w-4 h-4" /> Créer un lien de partage
          </h3>
          <p className="text-sm text-[#1C2B24]/70 mt-1">
            Les personnes qui ouvrent ce lien s&apos;inscrivent comme sur le calendrier normal, mais{' '}
            <strong>toutes les cases sont déjà ouvertes et grattables</strong>, quelle que soit la date. Vous
            pouvez fermer l&apos;accès à tout moment : il est coupé côté serveur et le calendrier redevient
            normal pour eux en moins de 30 secondes.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label htmlFor="share-label" className="block text-xs font-semibold mb-1">
              Nom du lien (pour vous)
            </label>
            <input
              id="share-label"
              type="text"
              value={label}
              maxLength={80}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ex : Relecture équipe, Comité de direction…"
              className="w-full px-3 py-2 rounded-lg border border-[#1C2B24]/20 text-sm"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer pb-2">
            <input
              type="checkbox"
              checked={includeDrafts}
              onChange={(e) => setIncludeDrafts(e.target.checked)}
              className="w-4 h-4 accent-[#A8201A]"
            />
            Inclure les brouillons
          </label>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void handleCreate()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#A8201A] hover:bg-[#8E1B16] text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
          >
            {busy === 'create' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Créer le lien
          </button>
        </div>
      </div>

      <div className="cartoon-box rounded-2xl bg-white p-5">
        <h3 className="font-display text-lg font-semibold mb-3">Liens existants</h3>
        {error && <p className="text-sm text-[#A8201A]">{error}</p>}
        {!error && links === null && (
          <p className="text-sm text-[#1C2B24]/60 inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Chargement…
          </p>
        )}
        {links && links.length === 0 && (
          <p className="text-sm text-[#1C2B24]/60">Aucun lien pour l&apos;instant.</p>
        )}
        <ul className="divide-y divide-[#1C2B24]/10">
          {links?.map((l) => {
            const open = !l.revoked_at;
            return (
              <li key={l.token} className="py-3 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      open ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#F1F5F9] text-[#64748B]'
                    }`}
                  >
                    {open ? 'Ouvert' : 'Fermé'}
                  </span>
                  <span className="font-semibold text-sm">{l.label || 'Sans nom'}</span>
                  {l.include_drafts && <span className="text-xs text-[#9A6B12]">+ brouillons</span>}
                  <span className="text-xs text-[#1C2B24]/50 ml-auto">
                    créé le {formatDateTimeFR(l.created_at)}
                    {l.revoked_at ? ` • fermé le ${formatDateTimeFR(l.revoked_at)}` : ''}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    readOnly
                    value={shareLinkUrl(l.token)}
                    onFocus={(e) => e.target.select()}
                    className={`flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-[#1C2B24]/15 bg-[#FBF6EC] text-xs font-mono ${
                      open ? '' : 'line-through opacity-50'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => void copy(l.token)}
                    disabled={!open}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#1C2B24]/15 text-xs font-semibold cursor-pointer hover:bg-[#FBF6EC] disabled:opacity-40"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copier
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(
                        l.token,
                        () => setShareLinkOpen(l.token, !open),
                        open ? 'Accès fermé.' : 'Accès rouvert.'
                      )
                    }
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50 ${
                      open ? 'bg-[#1C2B24] text-white hover:bg-black' : 'border border-[#1C2B24]/15 hover:bg-[#FBF6EC]'
                    }`}
                  >
                    {open ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                    {open ? "Fermer l'accès" : 'Rouvrir'}
                  </button>
                  <button
                    type="button"
                    title="Supprimer définitivement"
                    disabled={busy !== null}
                    onClick={() => {
                      if (window.confirm('Supprimer définitivement ce lien ? Il ne fonctionnera plus.')) {
                        void run(l.token, () => deleteShareLink(l.token), 'Lien supprimé.');
                      }
                    }}
                    className="inline-flex items-center px-2 py-1.5 rounded-lg text-xs text-[#A8201A] hover:bg-[#FEE2E2] cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
