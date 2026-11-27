import React, { useEffect, useState } from 'react';
import { Save, Download, Upload, AlertTriangle, LogOut, Loader2 } from 'lucide-react';
import { CalendarSettings, CardRecord } from '../../types/advent';
import { normalizeTipContent, resetAllStats, saveCard, saveSettings } from '../../lib/api';
import { isISODate, isWorkingDay, listWorkingDays, sameMonth } from '../../utils/calendar';

interface SettingsPanelProps {
  settings: CalendarSettings;
  cards: CardRecord[];
  realToday: string;
  adminEmail: string | null;
  onReload: () => Promise<void>;
  onNotify: (msg: string) => void;
  onSignOut: () => void;
}

const inputCls =
  'w-full px-3 py-2 rounded-xl border border-[#1C2B24]/15 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-[#86BC25]';

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  cards,
  realToday,
  adminEmail,
  onReload,
  onNotify,
  onSignOut,
}) => {
  const [form, setForm] = useState<CalendarSettings>(settings);
  const [busy, setBusy] = useState(false);

  useEffect(() => setForm(settings), [settings]);

  const dirty = JSON.stringify(form) !== JSON.stringify(settings);

  const validation = (() => {
    if (!form.title.trim()) return 'Le titre est obligatoire.';
    if (!isISODate(form.start_date) || !isISODate(form.end_date)) return 'Dates invalides.';
    if (form.end_date < form.start_date) return 'La date de fin doit être après la date de début.';
    if (!sameMonth(form.start_date, form.end_date))
      return 'Le début et la fin doivent être dans le même mois.';
    if (listWorkingDays(form.start_date, form.end_date).length === 0)
      return 'La période ne contient aucun jour ouvré.';
    return null;
  })();

  const handleSave = async () => {
    if (validation) return;
    setBusy(true);
    try {
      await saveSettings({ ...form, title: form.title.trim(), subtitle: form.subtitle.trim() });
      await onReload();
      onNotify('✅ Réglages enregistrés et en ligne.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  };

  const handleExport = () => {
    const payload = { exported_at: new Date().toISOString(), settings, cards };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calendrier-cases-${realToday}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('Sauvegarde JSON téléchargée.');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as { cards?: unknown };
        const list = Array.isArray(parsed.cards) ? parsed.cards : Array.isArray(parsed) ? parsed : null;
        if (!list) throw new Error('Aucune liste de cases trouvée dans le fichier.');
        const valid = (list as Record<string, unknown>[]).filter(
          (c) => c && isISODate(c.publish_date) && isWorkingDay(c.publish_date as string)
        );
        if (valid.length === 0) throw new Error('Aucune case valide (date de jour ouvré) dans le fichier.');
        if (
          !window.confirm(
            `Importer ${valid.length} case(s) ? Les cases existantes aux mêmes dates seront remplacées.`
          )
        )
          return;
        setBusy(true);
        for (const c of valid) {
          await saveCard(
            c.publish_date as string,
            c.status === 'published' ? 'published' : 'draft',
            normalizeTipContent(c.content)
          );
        }
        await onReload();
        onNotify(`✅ ${valid.length} case(s) importée(s).`);
      } catch (err) {
        onNotify(err instanceof Error ? err.message : 'Import impossible');
      } finally {
        setBusy(false);
      }
    };
    reader.readAsText(file);
  };

  const handleReset = async () => {
    const answer = window.prompt(
      'Cette action supprime TOUS les participants et TOUTES les statistiques (les cases sont conservées).\nTapez SUPPRIMER pour confirmer.'
    );
    if (answer !== 'SUPPRIMER') return;
    setBusy(true);
    try {
      await resetAllStats();
      onNotify('Statistiques réinitialisées.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Réinitialisation impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="cartoon-box rounded-2xl bg-white p-5 space-y-4">
        <h3 className="font-display text-base font-bold">Textes &amp; période du calendrier</h3>
        <div>
          <label className="block text-xs font-bold mb-1">Titre</label>
          <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-bold mb-1">Sous-titre</label>
          <input type="text" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} className={inputCls} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold mb-1">Premier jour</label>
            <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-bold mb-1">Dernier jour</label>
            <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={inputCls} />
          </div>
        </div>
        <p className="text-[11px] text-[#64748B]">
          Seuls les jours du lundi au vendredi de cette période apparaissent dans le calendrier
          {validation ? '' : ` (${listWorkingDays(form.start_date, form.end_date).length} jours ouvrés)`}.
        </p>
        {validation && <p className="text-xs font-bold text-[#E11D48]">{validation}</p>}
        <button
          type="button"
          disabled={!dirty || Boolean(validation) || busy}
          onClick={() => void handleSave()}
          className="cartoon-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#86BC25] text-xs font-bold cursor-pointer disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Enregistrer les réglages
        </button>
      </div>

      <div className="cartoon-box rounded-2xl bg-white p-5 space-y-3">
        <h3 className="font-display text-base font-bold">Sauvegarde des cases</h3>
        <p className="text-xs text-[#64748B]">Exportez toutes les cases (brouillons compris) ou réimportez une sauvegarde.</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExport}
            className="cartoon-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0EA5E9] text-white text-xs font-bold cursor-pointer"
          >
            <Download className="w-4 h-4" /> Exporter JSON
          </button>
          <label className="cartoon-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-xs font-bold cursor-pointer">
            <Upload className="w-4 h-4" /> Importer JSON
            <input type="file" accept="application/json" onChange={handleImport} className="hidden" />
          </label>
        </div>
      </div>

      <div className="cartoon-box rounded-2xl bg-[#FFF1F2] p-5 space-y-3">
        <h3 className="font-display text-base font-bold flex items-center gap-2 text-[#BE123C]">
          <AlertTriangle className="w-4 h-4" /> Zone sensible
        </h3>
        <p className="text-xs text-[#475569]">
          Après vos tests, remettez les compteurs à zéro avant le lancement officiel.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleReset()}
            className="cartoon-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-[#BE123C] text-xs font-bold cursor-pointer disabled:opacity-50"
          >
            Réinitialiser participants &amp; statistiques
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="cartoon-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0F172A] text-white text-xs font-bold cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> Se déconnecter{adminEmail ? ` (${adminEmail})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
};
