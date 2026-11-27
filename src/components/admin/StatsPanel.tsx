import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Download,
  Search,
  Trash2,
  ChevronDown,
  ChevronRight,
  Users,
  MousePointerClick,
  Trophy,
  Activity,
  Loader2,
} from 'lucide-react';
import { CardRecord, DashboardData, DashboardVisitor } from '../../types/advent';
import { deleteVisitor, fetchDashboard } from '../../lib/api';
import {
  addDays,
  diffDays,
  formatDateTimeFR,
  formatShortFR,
  timestampToParisISO,
} from '../../utils/calendar';
import { BarChart, BarDatum } from './BarChart';

interface StatsPanelProps {
  cards: CardRecord[];
  realToday: string;
  onNotify: (msg: string) => void;
}

type SortKey = 'name' | 'last_seen' | 'opens' | 'visits' | 'created';
type DailyMetric = 'active_visitors' | 'opens' | 'visits' | 'new_visitors';

const DAILY_METRICS: { id: DailyMetric; label: string; unit: string }[] = [
  { id: 'active_visitors', label: 'Participants actifs', unit: 'participant(s) actif(s)' },
  { id: 'opens', label: 'Cases ouvertes', unit: 'case(s) ouverte(s)' },
  { id: 'visits', label: 'Visites', unit: 'visite(s)' },
  { id: 'new_visitors', label: 'Nouveaux inscrits', unit: 'nouvel(s) inscrit(s)' },
];

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);

function csvEscape(v: string | number): string {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ cards, realToday, onNotify }) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('last_seen');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [metric, setMetric] = useState<DailyMetric>('active_visitors');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchDashboard();
      setData(d);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const today = data?.today || realToday;

  // Cards that are actually visible to everyone today
  const liveCards = useMemo(
    () => cards.filter((c) => c.status === 'published' && c.publish_date <= today),
    [cards, today]
  );
  const liveDates = useMemo(() => new Set(liveCards.map((c) => c.publish_date)), [liveCards]);
  const titleByDate = useMemo(
    () => new Map(cards.map((c) => [c.publish_date, c.content.title])),
    [cards]
  );

  const visitors = data?.visitors ?? [];
  const nLive = liveCards.length;
  const openedLive = (v: DashboardVisitor) => v.opened_dates.filter((d) => liveDates.has(d)).length;

  const kpis = useMemo(() => {
    const participants = visitors.length;
    const activeToday = visitors.filter((v) => timestampToParisISO(v.last_seen_at) === today).length;
    const active7 = visitors.filter((v) => {
      const d = timestampToParisISO(v.last_seen_at);
      return d && diffDays(d, today) < 7;
    }).length;
    const totalOpens = visitors.reduce((s, v) => s + openedLive(v), 0);
    const completers = nLive > 0 ? visitors.filter((v) => openedLive(v) >= nLive).length : 0;
    const neverOpened = visitors.filter((v) => v.opened_dates.length === 0).length;
    const copilot = visitors.reduce((s, v) => s + v.copilot_count, 0);
    const resources = visitors.reduce((s, v) => s + v.resource_count, 0);
    return {
      participants,
      activeToday,
      active7,
      totalOpens,
      avgOpens: participants > 0 ? (totalOpens / participants).toFixed(1) : '0',
      completion: pct(totalOpens, participants * nLive),
      completers,
      neverOpened,
      copilot,
      resources,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitors, today, nLive, liveDates]);

  // ---- Daily series (from first activity to today, max 45 days) ----
  const dailySeries = useMemo<BarDatum[]>(() => {
    if (!data) return [];
    const byDay = new Map(data.daily.map((d) => [d.day, d]));
    const newByDay = new Map(data.new_visitors.map((d) => [d.day, d.count]));
    const allDays = [...data.daily.map((d) => d.day), ...data.new_visitors.map((d) => d.day)].sort();
    if (allDays.length === 0) return [];
    let start = allDays[0];
    if (diffDays(start, today) > 44) start = addDays(today, -44);
    const out: BarDatum[] = [];
    const meta = DAILY_METRICS.find((m) => m.id === metric)!;
    for (let d = start; d <= today; d = addDays(d, 1)) {
      const row = byDay.get(d);
      const value =
        metric === 'new_visitors'
          ? newByDay.get(d) ?? 0
          : row
          ? row[metric]
          : 0;
      out.push({
        key: d,
        label: formatShortFR(d),
        value,
        tooltip: `${formatShortFR(d)} : ${value} ${meta.unit}`,
      });
    }
    return out;
  }, [data, metric, today]);

  const hourSeries = useMemo<BarDatum[]>(() => {
    const map = new Map((data?.hours ?? []).map((h) => [h.hour, h.opens]));
    return Array.from({ length: 24 }, (_, h) => ({
      key: String(h),
      label: `${h}h`,
      value: map.get(h) ?? 0,
      tooltip: `${h}h–${h + 1}h : ${map.get(h) ?? 0} ouverture(s)`,
    }));
  }, [data]);

  // ---- Per card ----
  const cardRows = useMemo(() => {
    const stats = new Map((data?.cards ?? []).map((c) => [c.card_date, c]));
    return liveCards
      .map((c) => {
        const s = stats.get(c.publish_date);
        return {
          date: c.publish_date,
          title: c.content.title,
          opens: s?.opens ?? 0,
          copilot: s?.copilot ?? 0,
          resources: s?.resources ?? 0,
        };
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [data, liveCards]);

  // ---- Participants table ----
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = visitors.filter(
      (v) => !q || `${v.first_name} ${v.last_name}`.toLowerCase().includes(q)
    );
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, 'fr');
        case 'opens':
          return openedLive(b) - openedLive(a);
        case 'visits':
          return b.visit_count - a.visit_count;
        case 'created':
          return a.created_at < b.created_at ? 1 : -1;
        default:
          return a.last_seen_at < b.last_seen_at ? 1 : -1;
      }
    });
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitors, search, sortKey, liveDates]);

  const handleExportCsv = () => {
    const header = [
      'Prénom',
      'Nom',
      'Inscription',
      'Dernière visite',
      'Visites',
      `Cases ouvertes (sur ${nLive})`,
      'Progression %',
      'Clics Copilot/copie',
      'Clics ressources',
      'Cases ouvertes (dates)',
    ];
    const lines = rows.map((v) =>
      [
        v.first_name,
        v.last_name,
        formatDateTimeFR(v.created_at),
        formatDateTimeFR(v.last_seen_at),
        v.visit_count,
        openedLive(v),
        pct(openedLive(v), nLive),
        v.copilot_count,
        v.resource_count,
        v.opened_dates.join(' '),
      ]
        .map(csvEscape)
        .join(';')
    );
    const blob = new Blob(['﻿' + [header.join(';'), ...lines].join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `participants-calendrier-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('Export CSV téléchargé.');
  };

  const handleDelete = async (v: DashboardVisitor) => {
    if (
      !window.confirm(
        `Supprimer ${v.first_name} ${v.last_name} et tout son historique ? Cette action est irréversible.`
      )
    )
      return;
    try {
      await deleteVisitor(v.id);
      onNotify('Participant supprimé.');
      await load();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Suppression impossible');
    }
  };

  if (!data && loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm font-bold text-[#475569]">
        <Loader2 className="w-5 h-5 animate-spin" /> Chargement des statistiques…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="cartoon-box rounded-2xl bg-white p-6 max-w-lg mx-auto text-center">
        <p className="font-bold text-[#BE123C]">{error ?? 'Statistiques indisponibles.'}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="cartoon-btn mt-3 px-4 py-2 rounded-xl bg-[#86BC25] text-xs font-bold cursor-pointer"
        >
          Réessayer
        </button>
      </div>
    );
  }

  const Kpi = ({
    label,
    value,
    sub,
    icon,
  }: {
    label: string;
    value: string | number;
    sub?: string;
    icon: React.ReactNode;
  }) => (
    <div className="cartoon-box-sm rounded-2xl bg-white p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#64748B] uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <div className="font-display text-3xl font-bold text-[#0F172A] mt-1">{value}</div>
      {sub && <div className="text-[11px] text-[#64748B] mt-0.5">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[#64748B]">
          Données en direct • {nLive} case{nLive > 1 ? 's' : ''} visible{nLive > 1 ? 's' : ''} par le public à ce jour.
          {error && <span className="text-[#BE123C] font-bold ml-2">({error})</span>}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="cartoon-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-xs font-bold cursor-pointer disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          icon={<Users className="w-3.5 h-3.5" />}
          label="Participants"
          value={kpis.participants}
          sub={`${kpis.neverOpened} n'ont encore rien ouvert`}
        />
        <Kpi
          icon={<Activity className="w-3.5 h-3.5" />}
          label="Actifs"
          value={kpis.activeToday}
          sub={`aujourd'hui • ${kpis.active7} sur 7 jours`}
        />
        <Kpi
          icon={<MousePointerClick className="w-3.5 h-3.5" />}
          label="Cases ouvertes"
          value={kpis.totalOpens}
          sub={`${kpis.avgOpens} par participant • ${kpis.completion}% de complétion`}
        />
        <Kpi
          icon={<Trophy className="w-3.5 h-3.5" />}
          label="À jour"
          value={kpis.completers}
          sub={`ont tout ouvert • ${kpis.copilot} clics Copilot, ${kpis.resources} ressources`}
        />
      </div>

      {/* Daily activity */}
      <div className="cartoon-box rounded-2xl bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="font-display text-base font-bold">Activité par jour</h3>
          <div className="flex flex-wrap gap-1.5">
            {DAILY_METRICS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMetric(m.id)}
                className={`px-2.5 py-1 rounded-lg border-2 text-[11px] font-bold cursor-pointer ${
                  metric === m.id
                    ? 'border-[#0F172A] bg-[#0F172A] text-[#A3E635]'
                    : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#475569] hover:border-[#0F172A]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <BarChart
          data={dailySeries}
          ariaLabel={`${DAILY_METRICS.find((m) => m.id === metric)!.label} par jour`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Per card */}
        <div className="cartoon-box rounded-2xl bg-white p-5">
          <h3 className="font-display text-base font-bold mb-3">Performance par case</h3>
          {cardRows.length === 0 ? (
            <p className="text-xs text-[#64748B] italic">Aucune case publiée et visible pour le moment.</p>
          ) : (
            <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
              {cardRows.map((c) => {
                const p = pct(c.opens, kpis.participants);
                return (
                  <div key={c.date} className="text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold truncate">
                        <span className="text-[#64748B] mr-1.5">{formatShortFR(c.date)}</span>
                        {titleByDate.get(c.date) || c.title}
                      </span>
                      <span className="shrink-0 font-bold text-[#0F172A]">
                        {c.opens} <span className="text-[#64748B] font-semibold">({p}%)</span>
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-[#F1F5F9] overflow-hidden">
                      <div className="h-full rounded-full bg-[#65A30D]" style={{ width: `${p}%` }} />
                    </div>
                    <div className="text-[10px] text-[#64748B] mt-0.5">
                      {c.copilot} clic{c.copilot > 1 ? 's' : ''} Copilot/copie • {c.resources} clic
                      {c.resources > 1 ? 's' : ''} ressource
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Hours */}
        <div className="cartoon-box rounded-2xl bg-white p-5">
          <h3 className="font-display text-base font-bold mb-1">Heures d&apos;ouverture des cases</h3>
          <p className="text-[11px] text-[#64748B] mb-4">
            Utile pour choisir le meilleur moment d&apos;une relance (heure de Paris).
          </p>
          <BarChart data={hourSeries} labelEvery={3} ariaLabel="Ouvertures par heure de la journée" />
        </div>
      </div>

      {/* Participants */}
      <div className="cartoon-box rounded-2xl bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="font-display text-base font-bold">
            Participants ({rows.length}
            {rows.length !== visitors.length ? ` / ${visitors.length}` : ''})
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un nom…"
                className="pl-8 pr-3 py-1.5 rounded-xl border-2 border-[#0F172A] text-xs font-medium w-48"
              />
            </div>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="px-2.5 py-1.5 rounded-xl border-2 border-[#0F172A] text-xs font-bold bg-white"
              aria-label="Trier par"
            >
              <option value="last_seen">Tri : dernière visite</option>
              <option value="opens">Tri : cases ouvertes</option>
              <option value="visits">Tri : nombre de visites</option>
              <option value="created">Tri : inscription récente</option>
              <option value="name">Tri : nom</option>
            </select>
            <button
              type="button"
              onClick={handleExportCsv}
              className="cartoon-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0EA5E9] text-white text-xs font-bold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="text-xs text-[#64748B] italic">Aucun participant pour le moment.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[#64748B] border-b-2 border-[#E2E8F0]">
                  <th className="py-2 pr-2 w-6" />
                  <th className="py-2 pr-3">Nom</th>
                  <th className="py-2 pr-3">Inscription</th>
                  <th className="py-2 pr-3">Dernière visite</th>
                  <th className="py-2 pr-3 text-right">Visites</th>
                  <th className="py-2 pr-3 min-w-[140px]">Cases ouvertes</th>
                  <th className="py-2 pr-3 text-right">Clics</th>
                  <th className="py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => {
                  const opened = openedLive(v);
                  const p = pct(opened, nLive);
                  const isOpen = expanded === v.id;
                  return (
                    <React.Fragment key={v.id}>
                      <tr className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
                        <td className="py-2 pr-2">
                          <button
                            type="button"
                            onClick={() => setExpanded(isOpen ? null : v.id)}
                            aria-label="Détail"
                            className="p-0.5 rounded hover:bg-[#E2E8F0] cursor-pointer"
                          >
                            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                        <td className="py-2 pr-3 font-bold text-[#0F172A] whitespace-nowrap">
                          {v.first_name} {v.last_name}
                        </td>
                        <td className="py-2 pr-3 text-[#475569] whitespace-nowrap">{formatDateTimeFR(v.created_at)}</td>
                        <td className="py-2 pr-3 text-[#475569] whitespace-nowrap">{formatDateTimeFR(v.last_seen_at)}</td>
                        <td className="py-2 pr-3 text-right font-semibold">{v.visit_count}</td>
                        <td className="py-2 pr-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-[#F1F5F9] overflow-hidden">
                              <div className="h-full rounded-full bg-[#65A30D]" style={{ width: `${p}%` }} />
                            </div>
                            <span className="font-bold whitespace-nowrap">
                              {opened}/{nLive}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-right text-[#475569]">{v.copilot_count + v.resource_count}</td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={() => void handleDelete(v)}
                            title="Supprimer ce participant"
                            className="p-1 rounded-lg text-[#BE123C] hover:bg-[#FFE4E6] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-[#F8FAFC]">
                          <td />
                          <td colSpan={7} className="py-3 pr-3">
                            <div className="text-[11px] text-[#475569] mb-1.5">
                              Dernière case ouverte : <strong>{formatDateTimeFR(v.last_open_at)}</strong> •{' '}
                              {v.copilot_count} clic(s) Copilot/copie • {v.resource_count} clic(s) ressource
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {liveCards.map((c) => {
                                const has = v.opened_dates.includes(c.publish_date);
                                return (
                                  <span
                                    key={c.publish_date}
                                    title={c.content.title}
                                    className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${
                                      has
                                        ? 'bg-[#ECFCCB] border-[#65A30D] text-[#3F6212]'
                                        : 'bg-white border-[#CBD5E1] text-[#94A3B8]'
                                    }`}
                                  >
                                    {has ? '✓' : '○'} {formatShortFR(c.publish_date)}
                                  </span>
                                );
                              })}
                              {liveCards.length === 0 && <span className="text-[11px] italic">Aucune case visible.</span>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
