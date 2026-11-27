import React, { useState } from 'react';
import { Eye, EyeOff, CalendarClock } from 'lucide-react';
import { AdminPreview, CalendarSettings, CardRecord } from '../../types/advent';
import {
  formatDayMonthFR,
  formatLongFR,
  formatShortFR,
  groupByWeek,
  isISODate,
  listWorkingDays,
} from '../../utils/calendar';

interface PreviewPanelProps {
  settings: CalendarSettings;
  cards: CardRecord[];
  realToday: string;
  preview: AdminPreview | null;
  onChangePreview: (preview: AdminPreview | null) => void;
  onShowFront: () => void;
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({
  settings,
  cards,
  realToday,
  preview,
  onChangePreview,
  onShowFront,
}) => {
  const [date, setDate] = useState(preview?.date ?? realToday);
  const [includeDrafts, setIncludeDrafts] = useState(preview?.includeDrafts ?? true);

  const slots = listWorkingDays(settings.start_date, settings.end_date);
  const weeks = groupByWeek(slots);
  const published = cards.filter((c) => c.status === 'published');
  const liveNow = published.filter((c) => c.publish_date <= realToday && slots.includes(c.publish_date));
  const scheduled = published.filter((c) => c.publish_date > realToday && slots.includes(c.publish_date));
  const drafts = cards.filter((c) => c.status === 'draft' && slots.includes(c.publish_date));
  const nextScheduled = scheduled[0]?.publish_date;
  const missingSoon = slots.filter((d) => d >= realToday && !cards.some((c) => c.publish_date === d && c.status === 'published'));

  const apply = (d: string, drafts: boolean) => {
    if (!isISODate(d)) return;
    onChangePreview({ date: d, includeDrafts: drafts });
    onShowFront();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* What the public sees */}
      <div className="cartoon-box rounded-2xl bg-white p-5">
        <h3 className="font-display text-base font-bold mb-2">Ce que voit le public en ce moment</h3>
        <p className="text-xs text-[#475569] capitalize">
          Date du serveur : <strong>{formatLongFR(realToday)}</strong> (heure de Paris)
        </p>
        <div className="grid grid-cols-3 gap-3 mt-3 text-center">
          <div className="rounded-xl bg-[#ECFCCB] border-2 border-[#0F172A] p-3">
            <div className="font-display text-2xl font-bold">{liveNow.length}</div>
            <div className="text-[11px] font-bold text-[#3F6212]">cases visibles</div>
          </div>
          <div className="rounded-xl bg-[#E0F2FE] border-2 border-[#0F172A] p-3">
            <div className="font-display text-2xl font-bold">{scheduled.length}</div>
            <div className="text-[11px] font-bold text-[#0369A1]">publiées à venir</div>
          </div>
          <div className="rounded-xl bg-[#FEF3C7] border-2 border-[#0F172A] p-3">
            <div className="font-display text-2xl font-bold">{drafts.length}</div>
            <div className="text-[11px] font-bold text-[#B45309]">brouillons</div>
          </div>
        </div>
        <p className="text-[11px] text-[#64748B] mt-3">
          {nextScheduled
            ? `Prochaine ouverture programmée : ${formatDayMonthFR(nextScheduled)}.`
            : 'Aucune case programmée pour les prochains jours.'}{' '}
          {missingSoon.length > 0 &&
            `${missingSoon.length} jour${missingSoon.length > 1 ? 's' : ''} ouvré${missingSoon.length > 1 ? 's' : ''} restant${missingSoon.length > 1 ? 's' : ''} sans case publiée (le public y voit une case verrouillée « Bientôt »).`}
        </p>
      </div>

      {/* Preview controls */}
      <div className="cartoon-box rounded-2xl bg-white p-5 space-y-4">
        <div>
          <h3 className="font-display text-base font-bold flex items-center gap-2">
            <CalendarClock className="w-4 h-4" /> Prévisualiser le calendrier à une autre date
          </h3>
          <p className="text-xs text-[#64748B] mt-1">
            L&apos;aperçu n&apos;est visible que dans votre navigateur, connecté en admin. Les visiteurs voient
            toujours la date réelle. Rien n&apos;est comptabilisé dans les statistiques pendant l&apos;aperçu.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="preview-date" className="block text-xs font-bold mb-1">Date simulée</label>
            <input
              id="preview-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 rounded-xl border-2 border-[#0F172A] text-sm font-bold"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer pb-2">
            <input
              type="checkbox"
              checked={includeDrafts}
              onChange={(e) => setIncludeDrafts(e.target.checked)}
              className="w-4 h-4 accent-[#86BC25]"
            />
            Inclure les brouillons
          </label>
          <button
            type="button"
            disabled={!isISODate(date)}
            onClick={() => apply(date, includeDrafts)}
            className="cartoon-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0EA5E9] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            <Eye className="w-4 h-4" /> {preview ? 'Mettre à jour l’aperçu' : 'Lancer l’aperçu'}
          </button>
          {preview && (
            <button
              type="button"
              onClick={() => onChangePreview(null)}
              className="cartoon-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0F172A] text-white text-xs font-bold cursor-pointer"
            >
              <EyeOff className="w-4 h-4" /> Quitter l&apos;aperçu
            </button>
          )}
        </div>

        {preview && (
          <p className="text-xs font-bold text-[#0369A1] capitalize">
            Aperçu actif : {formatLongFR(preview.date)} {preview.includeDrafts ? '(brouillons inclus)' : '(publiées uniquement)'}
          </p>
        )}

        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Raccourcis</p>
          {weeks.map((w) => (
            <div key={w.monday} className="flex flex-wrap gap-1.5">
              {w.dates.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    setDate(d);
                    apply(d, includeDrafts);
                  }}
                  className={`px-2.5 py-1 rounded-lg border-2 text-[11px] font-bold cursor-pointer ${
                    preview?.date === d
                      ? 'border-[#0F172A] bg-[#0F172A] text-[#A3E635]'
                      : 'border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#0F172A]'
                  }`}
                >
                  {formatShortFR(d)}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
