import React, { useEffect, useMemo, useState } from 'react';
import { Save, Send, Undo2, Trash2, Eye, Plus, Loader2, FileText, AlertTriangle } from 'lucide-react';
import { AdminPreview, CalendarSettings, CardRecord, CardStatus, TipContent } from '../../types/advent';
import { EMPTY_TIP_CONTENT, deleteCard, normalizeTipContent, saveCard } from '../../lib/api';
import {
  dayOfMonth,
  formatDayMonthFR,
  formatShortFR,
  formatWeekdayShortFR,
  groupByWeek,
  isWorkingDay,
  listWorkingDays,
} from '../../utils/calendar';
import { TipForm } from './TipForm';

interface CardsPanelProps {
  settings: CalendarSettings;
  cards: CardRecord[];
  realToday: string;
  onReload: () => Promise<void>;
  onNotify: (msg: string) => void;
  onPreview: (preview: AdminPreview) => void;
  onDirtyChange: (dirty: boolean) => void;
}

interface Draft {
  status: CardStatus;
  content: TipContent;
  isNew: boolean;
}

/** Deep copy of an existing card's content (never share references with the source). */
function cloneContent(content: TipContent): TipContent {
  const copy = normalizeTipContent(JSON.parse(JSON.stringify(content)));
  return {
    ...copy,
    resources: (copy.resources ?? []).map((r, i) => ({ ...r, id: `res-${Date.now()}-${i}` })),
  };
}

export const CardsPanel: React.FC<CardsPanelProps> = ({
  settings,
  cards,
  realToday,
  onReload,
  onNotify,
  onPreview,
  onDirtyChange,
}) => {
  const slots = useMemo(
    () => listWorkingDays(settings.start_date, settings.end_date),
    [settings.start_date, settings.end_date]
  );
  const weeks = useMemo(() => groupByWeek(slots), [slots]);
  const byDate = useMemo(() => new Map(cards.map((c) => [c.publish_date, c])), [cards]);
  const outOfRange = useMemo(
    () => cards.filter((c) => !slots.includes(c.publish_date)),
    [cards, slots]
  );

  const [selected, setSelected] = useState<string>(
    () => slots.find((d) => d >= realToday) ?? slots[0] ?? realToday
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [quizValid, setQuizValid] = useState(true);
  const [sourceDate, setSourceDate] = useState<string>('');
  const duplicableCards = useMemo(
    () => [...cards].sort((a, b) => (a.publish_date < b.publish_date ? -1 : 1)),
    [cards]
  );

  const current = byDate.get(selected) ?? null;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  // Load the selected card into the editor (unless the admin has unsaved changes)
  useEffect(() => {
    if (dirty) return;
    setDraft(current ? { status: current.status, content: current.content, isNew: false } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, current]);

  const selectDate = (date: string) => {
    if (date === selected) return;
    if (dirty && !window.confirm('Des modifications ne sont pas enregistrées. Les abandonner ?')) return;
    setDirty(false);
    setQuizValid(true);
    setSelected(date);
  };

  const patchDraft = (patch: Partial<TipContent>) => {
    setDraft((d) => (d ? { ...d, content: { ...d.content, ...patch } } : d));
    setDirty(true);
  };

  const startNew = (content: TipContent) => {
    setDraft({ status: 'draft', content, isNew: true });
    setDirty(true);
  };

  const persist = async (status: CardStatus, msg: string) => {
    if (!draft) return;
    if (!draft.content.title.trim()) {
      onNotify('⚠️ Le titre est obligatoire.');
      return;
    }
    if (!quizValid) {
      onNotify('⚠️ Le JSON du quiz est invalide : corrigez-le avant d’enregistrer.');
      return;
    }
    if (!isWorkingDay(selected)) {
      onNotify('⚠️ Les cases ne peuvent être placées que du lundi au vendredi.');
      return;
    }
    setBusy(true);
    try {
      await saveCard(selected, status, draft.content);
      setDirty(false);
      setDraft({ ...draft, status, isNew: false });
      await onReload();
      onNotify(msg);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (date: string) => {
    if (!window.confirm(`Supprimer définitivement la case du ${formatDayMonthFR(date)} ?`)) return;
    setBusy(true);
    try {
      await deleteCard(date);
      if (date === selected) {
        setDirty(false);
        setDraft(null);
      }
      await onReload();
      onNotify('Case supprimée.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Suppression impossible');
    } finally {
      setBusy(false);
    }
  };

  const statusOf = (date: string) => {
    const c = byDate.get(date);
    if (!c) return 'empty' as const;
    return c.status;
  };

  const isPastOrToday = selected <= realToday;
  const savedStatus = current?.status ?? null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left: weeks */}
      <div className="lg:col-span-4 space-y-4">
        <div className="cartoon-box rounded-2xl bg-white p-4">
          <h3 className="font-display font-bold text-sm mb-1">Cases (jours ouvrés)</h3>
          <p className="text-[11px] text-[#64748B] mb-3">
            Du {formatDayMonthFR(settings.start_date)} au {formatDayMonthFR(settings.end_date)}. Une case
            publiée devient visible automatiquement à sa date (heure de Paris).
          </p>
          <div className="flex flex-wrap gap-3 text-[10px] font-bold mb-3">
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#86BC25] border border-[#1C2B24]/15" /> Publiée</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-[#FEF3C7] border border-[#1C2B24]/15" /> Brouillon</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-white border border-dashed border-[#94A3B8]" /> Vide</span>
          </div>
          <div className="space-y-3">
            {weeks.map((w) => (
              <div key={w.monday}>
                <div className="text-[10px] font-bold uppercase tracking-wide text-[#64748B] mb-1">
                  Semaine du {formatShortFR(w.monday)}
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {w.dates.map((d) => {
                    const st = statusOf(d);
                    const isSel = d === selected;
                    const isToday = d === realToday;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => selectDate(d)}
                        title={formatDayMonthFR(d)}
                        className={`py-1.5 rounded-xl border text-center cursor-pointer transition-all ${
                          st === 'published'
                            ? 'bg-[#86BC25] border-[#1C2B24]/15'
                            : st === 'draft'
                            ? 'bg-[#FEF3C7] border-[#1C2B24]/15'
                            : 'bg-white border-dashed border-[#94A3B8]'
                        } ${isSel ? 'ring-2 ring-offset-2 ring-[#0EA5E9]' : ''}`}
                      >
                        <div className="text-[9px] font-bold uppercase text-[#475569]">{formatWeekdayShortFR(d)}</div>
                        <div className="font-display font-bold text-sm text-[#0F172A]">
                          {dayOfMonth(d)}
                          {isToday && <span className="text-[#BE123C]">•</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {outOfRange.length > 0 && (
          <div className="cartoon-box-sm rounded-2xl bg-[#FFF1F2] p-4">
            <p className="text-xs font-bold text-[#BE123C] flex items-center gap-1.5 mb-2">
              <AlertTriangle className="w-4 h-4" /> Cases hors période (non affichées)
            </p>
            <div className="space-y-1.5">
              {outOfRange.map((c) => (
                <div key={c.publish_date} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">
                    {formatShortFR(c.publish_date)} — {c.content.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleDelete(c.publish_date)}
                    className="p-1 rounded text-[#BE123C] hover:bg-[#FFE4E6] cursor-pointer"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: editor */}
      <div className="lg:col-span-8">
        <div className="cartoon-box rounded-2xl bg-white p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E2E8F0] pb-3">
            <div>
              <h3 className="font-display text-lg font-bold text-[#0F172A] capitalize">
                {formatDayMonthFR(selected)}
              </h3>
              <p className="text-xs mt-0.5">
                {savedStatus === null ? (
                  <span className="text-[#64748B]">Aucune case créée pour ce jour.</span>
                ) : savedStatus === 'published' ? (
                  <span className="font-bold text-[#3F6212]">
                    ● Publiée —{' '}
                    {isPastOrToday ? 'visible par tous en ce moment' : `visible automatiquement le ${formatDayMonthFR(selected)}`}
                  </span>
                ) : (
                  <span className="font-bold text-[#B45309]">● Brouillon — invisible pour le public</span>
                )}
                {dirty && <span className="ml-2 font-bold text-[#BE123C]">• modifications non enregistrées</span>}
              </p>
            </div>
            {draft && (
              <button
                type="button"
                onClick={() => onPreview({ date: selected, includeDrafts: true })}
                className="cartoon-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-xs font-bold cursor-pointer"
                title={dirty ? 'Enregistrez d’abord pour voir vos dernières modifications' : undefined}
              >
                <Eye className="w-3.5 h-3.5" /> Aperçu à cette date
              </button>
            )}
          </div>

          {!draft ? (
            <div className="py-6 space-y-4">
              <div className="text-center">
                <div className="text-4xl mb-2">🗓️</div>
                <p className="text-sm font-bold">Créer la case du {formatDayMonthFR(selected)}</p>
                <p className="text-xs text-[#64748B]">Elle sera créée en brouillon : rien n&apos;est visible tant que vous ne publiez pas.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto">
                <div className="p-4 rounded-2xl border border-[#1C2B24]/15 bg-[#F8FAFC] space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <FileText className="w-4 h-4" /> Dupliquer une case existante
                  </div>
                  {duplicableCards.length === 0 ? (
                    <p className="text-[11px] text-[#64748B]">
                      Aucune case à dupliquer. Astuce : importez les modèles (Réglages &gt; Importer JSON).
                    </p>
                  ) : (
                    <>
                      <select
                        value={sourceDate}
                        onChange={(e) => setSourceDate(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-xl border border-[#1C2B24]/15 text-xs font-medium bg-white"
                      >
                        <option value="">— Choisir une case —</option>
                        {duplicableCards.map((c) => (
                          <option key={c.publish_date} value={c.publish_date}>
                            {formatShortFR(c.publish_date)} — {c.content.emoji} {c.content.title}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!byDate.get(sourceDate)}
                        onClick={() => {
                          const src = byDate.get(sourceDate);
                          if (src) startNew(cloneContent(src.content));
                        }}
                        className="cartoon-btn w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#86BC25] text-xs font-bold cursor-pointer disabled:opacity-50"
                      >
                        <Plus className="w-3.5 h-3.5" /> Dupliquer
                      </button>
                    </>
                  )}
                </div>
                <div className="p-4 rounded-2xl border border-[#1C2B24]/15 bg-[#F8FAFC] flex flex-col justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold">
                    <Plus className="w-4 h-4" /> Case vierge
                  </div>
                  <p className="text-[11px] text-[#64748B]">Partir d&apos;un contenu vide et tout rédiger.</p>
                  <button
                    type="button"
                    onClick={() => startNew({ ...EMPTY_TIP_CONTENT })}
                    className="cartoon-btn w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-xs font-bold cursor-pointer"
                  >
                    Créer une case vierge
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <TipForm
                key={selected}
                content={draft.content}
                dayNumber={dayOfMonth(selected)}
                onChange={patchDraft}
                onValidityChange={setQuizValid}
              />

              {/* Action bar */}
              <div className="sticky bottom-0 -mx-5 -mb-5 px-5 py-3 bg-white/95 backdrop-blur border-t-2 border-[#1C2B24]/15 rounded-b-2xl flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {!draft.isNew && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDelete(selected)}
                      className="cartoon-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FFE4E6] text-[#BE123C] text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Supprimer
                    </button>
                  )}
                  {dirty && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setDirty(false);
                        setQuizValid(true);
                        setDraft(current ? { status: current.status, content: current.content, isNew: false } : null);
                      }}
                      className="cartoon-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      Annuler les modifications
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {busy && <Loader2 className="w-4 h-4 animate-spin self-center" />}
                  {savedStatus === 'published' ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void persist('draft', 'Case repassée en brouillon (masquée du public).')}
                        className="cartoon-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#FEF3C7] text-xs font-bold cursor-pointer disabled:opacity-50"
                      >
                        <Undo2 className="w-3.5 h-3.5" /> Dépublier
                      </button>
                      <button
                        type="button"
                        disabled={busy || !dirty}
                        onClick={() => void persist('published', isPastOrToday ? '✅ Modifications en ligne !' : '✅ Modifications enregistrées.')}
                        className="cartoon-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#86BC25] text-xs font-bold cursor-pointer disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" /> Enregistrer {isPastOrToday ? '(en ligne)' : ''}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busy || (!dirty && !draft.isNew)}
                        onClick={() => void persist('draft', 'Brouillon enregistré.')}
                        className="cartoon-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-xs font-bold cursor-pointer disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" /> Enregistrer le brouillon
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (
                            isPastOrToday &&
                            !window.confirm('Cette date est déjà atteinte : la case sera visible par tout le monde immédiatement. Publier ?')
                          )
                            return;
                          void persist(
                            'published',
                            isPastOrToday
                              ? '🚀 Case publiée et visible maintenant !'
                              : `🚀 Case publiée : visible le ${formatDayMonthFR(selected)}.`
                          );
                        }}
                        className="cartoon-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#86BC25] text-xs font-bold cursor-pointer disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" /> Publier
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
