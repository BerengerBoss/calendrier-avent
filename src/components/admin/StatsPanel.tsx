import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Download, Search, Trash2, Loader2, Check } from 'lucide-react';
import { CalendarSettings, CardRecord, DashboardData, DashboardVisitor } from '../../types/advent';
import { deleteVisitor, fetchDashboard } from '../../lib/api';
import {
  addDays,
  diffDays,
  formatDateTimeFR,
  formatShortFR,
  formatWeekdayShortFR,
  listWorkingDays,
  timestampToParisISO,
} from '../../utils/calendar';
import { BarChart, BarDatum } from './BarChart';

interface StatsPanelProps {
  settings: CalendarSettings;
  cards: CardRecord[];
  realToday: string;
  onNotify: (msg: string) => void;
}

type SortKey = 'last_seen' | 'opens' | 'quiz' | 'name';
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

const Card: React.FC<{ title?: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }> = ({
  title,
  sub,
  right,
  children,
}) => (
  <section className="rounded-2xl bg-white border border-[#1C2B24]/10 shadow-sm p-5">
    {(title || right) && (
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          {title && <h3 className="font-display text-lg font-semibold text-[#1C2B24]">{title}</h3>}
          {sub && <p className="text-sm text-[#1C2B24]/60 mt-0.5">{sub}</p>}
        </div>
        {right}
      </div>
    )}
    {children}
  </section>
);

const Kpi: React.FC<{ label: string; value: string | number; sub?: string; tone?: 'green' | 'red' | 'gold' | 'ink' }> = ({
  label,
  value,
  sub,
  tone = 'ink',
}) => {
  const color = { green: '#1F5A43', red: '#A8201A', gold: '#9A6B12', ink: '#1C2B24' }[tone];
  return (
    <div className="rounded-2xl bg-white border border-[#1C2B24]/10 shadow-sm p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-[#1C2B24]/55">{label}</div>
      <div className="font-display text-[34px] leading-none font-semibold mt-2" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-sm text-[#1C2B24]/60 mt-1.5">{sub}</div>}
    </div>
  );
};

/** Colour of a quiz result: all right = green, some = gold, none = red. */
const quizTone = (correct: number, total: number) =>
  total === 0 ? '' : correct === total ? 'bg-[#1F5A43] text-white' : correct === 0 ? 'bg-[#A8201A] text-white' : 'bg-[#D9A441] text-[#1C2B24]';

export const StatsPanel: React.FC<StatsPanelProps> = ({ settings, cards, realToday, onNotify }) => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('last_seen');
  const [metric, setMetric] = useState<DailyMetric>('active_visitors');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchDashboard());
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
  const visitors = useMemo(() => data?.visitors ?? [], [data]);
  const cardByDate = useMemo(() => new Map(cards.map((c) => [c.publish_date, c])), [cards]);

  /**
   * Columns of the "who opened what" grid: every working day that has a card,
   * plus any date that has opens (ex: opened through a share link, card deleted since).
   * All opens are counted, whatever the card's status or date.
   */
  const columns = useMemo(() => {
    const set = new Set<string>();
    for (const d of listWorkingDays(settings.start_date, settings.end_date)) if (cardByDate.has(d)) set.add(d);
    for (const v of visitors) {
      v.opened_dates.forEach((d) => set.add(d));
      v.quiz_by_card.forEach((q) => set.add(q.card_date));
    }
    return Array.from(set).sort();
  }, [settings.start_date, settings.end_date, cardByDate, visitors]);

  const kpis = useMemo(() => {
    const participants = visitors.length;
    const activeToday = visitors.filter((v) => timestampToParisISO(v.last_seen_at) === today).length;
    const active7 = visitors.filter((v) => {
      const d = timestampToParisISO(v.last_seen_at);
      return d && diffDays(d, today) < 7;
    }).length;
    const totalOpens = visitors.reduce((s, v) => s + v.opened_dates.length, 0);
    const quizCorrect = visitors.reduce((s, v) => s + v.quiz_correct, 0);
    const quizTotal = visitors.reduce((s, v) => s + v.quiz_total, 0);
    const quizPlayers = visitors.filter((v) => v.quiz_total > 0).length;
    return {
      participants,
      activeToday,
      active7,
      totalOpens,
      avgOpens: participants > 0 ? (totalOpens / participants).toFixed(1).replace('.', ',') : '0',
      neverOpened: visitors.filter((v) => v.opened_dates.length === 0).length,
      quizRate: pct(quizCorrect, quizTotal),
      quizTotal,
      quizPlayers,
      copilot: visitors.reduce((s, v) => s + v.copilot_count, 0),
      resources: visitors.reduce((s, v) => s + v.resource_count, 0),
    };
  }, [visitors, today]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = visitors.filter((v) => !q || `${v.first_name} ${v.last_name}`.toLowerCase().includes(q));
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, 'fr');
        case 'opens':
          return b.opened_dates.length - a.opened_dates.length;
        case 'quiz':
          return b.quiz_correct - a.quiz_correct || pct(b.quiz_correct, b.quiz_total) - pct(a.quiz_correct, a.quiz_total);
        default:
          return a.last_seen_at < b.last_seen_at ? 1 : -1;
      }
    });
  }, [visitors, search, sortKey]);

  const leaderboard = useMemo(
    () =>
      visitors
        .filter((v) => v.quiz_total > 0)
        .sort(
          (a, b) =>
            b.quiz_correct - a.quiz_correct ||
            pct(b.quiz_correct, b.quiz_total) - pct(a.quiz_correct, a.quiz_total) ||
            a.last_name.localeCompare(b.last_name, 'fr')
        )
        .slice(0, 10),
    [visitors]
  );

  const perCard = useMemo(() => {
    const opens = new Map((data?.cards ?? []).map((c) => [c.card_date, c]));
    const quiz = new Map((data?.quiz_cards ?? []).map((q) => [q.card_date, q]));
    return columns.map((d) => ({
      date: d,
      title: cardByDate.get(d)?.content.title ?? '(case supprimée)',
      opens: opens.get(d)?.opens ?? 0,
      copilot: opens.get(d)?.copilot ?? 0,
      quiz: quiz.get(d),
    }));
  }, [data, columns, cardByDate]);

  const dailySeries = useMemo<BarDatum[]>(() => {
    if (!data) return [];
    const byDay = new Map(data.daily.map((d) => [d.day, d]));
    const newByDay = new Map(data.new_visitors.map((d) => [d.day, d.count]));
    const allDays = [...data.daily.map((d) => d.day), ...data.new_visitors.map((d) => d.day)].sort();
    if (allDays.length === 0) return [];
    let start = allDays[0];
    if (diffDays(start, today) > 44) start = addDays(today, -44);
    const meta = DAILY_METRICS.find((m) => m.id === metric)!;
    const out: BarDatum[] = [];
    for (let d = start; d <= today; d = addDays(d, 1)) {
      const row = byDay.get(d);
      const value = metric === 'new_visitors' ? newByDay.get(d) ?? 0 : row ? row[metric] : 0;
      out.push({ key: d, label: formatShortFR(d), value, tooltip: `${formatShortFR(d)} : ${value} ${meta.unit}` });
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

  const handleExportCsv = () => {
    const header = [
      'Prénom',
      'Nom',
      'Inscription',
      'Dernière visite',
      'Visites',
      'Cases ouvertes',
      'Quiz bonnes réponses',
      'Quiz réponses',
      'Quiz %',
      'Clics Copilot/copie',
      'Clics ressources',
      ...columns.map((d) => `Case ${formatShortFR(d)}`),
    ];
    const lines = rows.map((v) => {
      const qByCard = new Map(v.quiz_by_card.map((q) => [q.card_date, q]));
      return [
        v.first_name,
        v.last_name,
        formatDateTimeFR(v.created_at),
        formatDateTimeFR(v.last_seen_at),
        v.visit_count,
        v.opened_dates.length,
        v.quiz_correct,
        v.quiz_total,
        pct(v.quiz_correct, v.quiz_total),
        v.copilot_count,
        v.resource_count,
        ...columns.map((d) => {
          const q = qByCard.get(d);
          const opened = v.opened_dates.includes(d) ? 'ouverte' : '';
          return q ? `${opened} quiz ${q.correct}/${q.total}`.trim() : opened;
        }),
      ]
        .map(csvEscape)
        .join(';');
    });
    const blob = new Blob(['﻿' + [header.join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `participants-calendrier-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('Export CSV téléchargé.');
  };

  const handleDelete = async (v: DashboardVisitor) => {
    if (!window.confirm(`Supprimer ${v.first_name} ${v.last_name} et tout son historique ? Action irréversible.`)) return;
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
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-[#1C2B24]/70">
        <Loader2 className="w-5 h-5 animate-spin" /> Chargement des statistiques…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl bg-white border border-[#1C2B24]/10 p-6 max-w-lg mx-auto text-center">
        <p className="font-semibold text-[#A8201A]">{error ?? 'Statistiques indisponibles.'}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 px-4 py-2 rounded-lg bg-[#1F5A43] text-white text-sm font-semibold cursor-pointer"
        >
          Réessayer
        </button>
      </div>
    );
  }

  const selectCls =
    'px-3 py-2 rounded-lg border border-[#1C2B24]/15 text-sm bg-white focus:outline-none focus:border-[#1F5A43]';

  return (
    <div className="space-y-6 text-[#1C2B24]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#1C2B24]/60">
          Données en direct, actualisées chaque minute. Toutes les ouvertures sont comptées (y compris via un lien de
          partage).
          {error && <span className="text-[#A8201A] font-semibold ml-2">({error})</span>}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#1C2B24]/15 bg-white text-sm font-medium cursor-pointer hover:bg-[#FBF6EC] disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          label="Participants"
          value={kpis.participants}
          sub={`${kpis.activeToday} aujourd'hui | ${kpis.active7} sur 7 jours`}
        />
        <Kpi
          label="Cases ouvertes"
          value={kpis.totalOpens}
          tone="green"
          sub={`${kpis.avgOpens} par participant | ${kpis.neverOpened} sans ouverture`}
        />
        <Kpi
          label="Réussite aux quiz"
          value={kpis.quizTotal > 0 ? `${kpis.quizRate} %` : '–'}
          tone="gold"
          sub={`${kpis.quizTotal} réponse${kpis.quizTotal > 1 ? 's' : ''} | ${kpis.quizPlayers} joueur${kpis.quizPlayers > 1 ? 's' : ''}`}
        />
        <Kpi
          label="Passage à l'action"
          value={kpis.copilot}
          tone="red"
          sub={`clics Copilot/copie | ${kpis.resources} ressources`}
        />
      </div>

      {/* Who opened what */}
      <Card
        title="Qui a ouvert quoi"
        sub={`${rows.length} participant${rows.length > 1 ? 's' : ''} | ${columns.length} case${columns.length > 1 ? 's' : ''}`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-[#1C2B24]/45 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un nom…"
                className={`${selectCls} pl-9 w-52`}
              />
            </div>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className={selectCls} aria-label="Trier par">
              <option value="last_seen">Tri : dernière visite</option>
              <option value="opens">Tri : cases ouvertes</option>
              <option value="quiz">Tri : score quiz</option>
              <option value="name">Tri : nom</option>
            </select>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1F5A43] hover:bg-[#174634] text-white text-sm font-semibold cursor-pointer"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
        }
      >
        {rows.length === 0 ? (
          <p className="text-sm text-[#1C2B24]/60">Aucun participant pour le moment.</p>
        ) : columns.length === 0 ? (
          <p className="text-sm text-[#1C2B24]/60">Aucune case créée pour le moment.</p>
        ) : (
          <>
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-white text-left font-semibold text-xs uppercase tracking-wide text-[#1C2B24]/55 pb-2 pr-4 min-w-[170px]">
                      Participant
                    </th>
                    {columns.map((d) => {
                      const card = cardByDate.get(d);
                      return (
                        <th
                          key={d}
                          title={`${formatShortFR(d)} | ${card?.content.title ?? 'case supprimée'}${
                            card?.status === 'draft' ? ' (brouillon)' : ''
                          }`}
                          className="pb-2 px-0.5 font-normal"
                        >
                          <div
                            className={`w-9 mx-auto text-center leading-tight ${
                              d > today ? 'text-[#1C2B24]/40' : 'text-[#1C2B24]'
                            }`}
                          >
                            <div className="font-display text-base font-semibold">{Number(d.slice(8, 10))}</div>
                            <div className="text-[10px] uppercase">{formatWeekdayShortFR(d).replace('.', '')}</div>
                          </div>
                        </th>
                      );
                    })}
                    <th className="pb-2 pl-4 text-right font-semibold text-xs uppercase tracking-wide text-[#1C2B24]/55">Ouvertes</th>
                    <th className="pb-2 pl-4 text-right font-semibold text-xs uppercase tracking-wide text-[#1C2B24]/55">Quiz</th>
                    <th className="pb-2 pl-4 text-left font-semibold text-xs uppercase tracking-wide text-[#1C2B24]/55 whitespace-nowrap">
                      Dernière visite
                    </th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => {
                    const qByCard = new Map(v.quiz_by_card.map((q) => [q.card_date, q]));
                    return (
                      <tr key={v.id} className="group">
                        <td className="sticky left-0 z-10 bg-white group-hover:bg-[#FBF6EC] py-1.5 pr-4 border-t border-[#1C2B24]/8 font-medium whitespace-nowrap">
                          {v.first_name} {v.last_name}
                        </td>
                        {columns.map((d) => {
                          const opened = v.opened_dates.includes(d);
                          const q = qByCard.get(d);
                          return (
                            <td key={d} className="py-1.5 px-0.5 border-t border-[#1C2B24]/8 group-hover:bg-[#FBF6EC]">
                              <div
                                title={`${formatShortFR(d)} : ${opened ? 'ouverte' : 'non ouverte'}${
                                  q ? ` | quiz ${q.correct}/${q.total}` : ''
                                }`}
                                className={`w-9 h-8 mx-auto rounded-md flex items-center justify-center text-[11px] font-semibold ${
                                  q
                                    ? quizTone(q.correct, q.total)
                                    : opened
                                    ? 'bg-[#1F5A43] text-white'
                                    : 'bg-[#1C2B24]/[0.06] text-transparent'
                                }`}
                              >
                                {q ? `${q.correct}/${q.total}` : opened ? <Check className="w-4 h-4" /> : '·'}
                              </div>
                            </td>
                          );
                        })}
                        <td className="py-1.5 pl-4 border-t border-[#1C2B24]/8 text-right font-semibold group-hover:bg-[#FBF6EC]">
                          {v.opened_dates.length}
                        </td>
                        <td className="py-1.5 pl-4 border-t border-[#1C2B24]/8 text-right whitespace-nowrap group-hover:bg-[#FBF6EC]">
                          {v.quiz_total > 0 ? (
                            <>
                              <span className="font-semibold">
                                {v.quiz_correct}/{v.quiz_total}
                              </span>{' '}
                              <span className="text-[#1C2B24]/50">({pct(v.quiz_correct, v.quiz_total)} %)</span>
                            </>
                          ) : (
                            <span className="text-[#1C2B24]/35">–</span>
                          )}
                        </td>
                        <td className="py-1.5 pl-4 border-t border-[#1C2B24]/8 text-[#1C2B24]/65 whitespace-nowrap group-hover:bg-[#FBF6EC]">
                          {formatDateTimeFR(v.last_seen_at)}
                        </td>
                        <td className="py-1.5 pl-2 border-t border-[#1C2B24]/8 text-right group-hover:bg-[#FBF6EC]">
                          <button
                            type="button"
                            onClick={() => void handleDelete(v)}
                            title="Supprimer ce participant"
                            className="p-1.5 rounded-md text-[#A8201A] opacity-40 group-hover:opacity-100 hover:bg-[#F8E3E1] cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-4 text-xs text-[#1C2B24]/65">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 h-4 rounded bg-[#1F5A43] inline-flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </span>
                ouverte
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 h-4 rounded bg-[#1F5A43]" /> quiz tout juste
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 h-4 rounded bg-[#D9A441]" /> quiz en partie juste
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 h-4 rounded bg-[#A8201A]" /> quiz raté
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 h-4 rounded bg-[#1C2B24]/[0.06]" /> non ouverte
              </span>
            </div>
          </>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leaderboard */}
        <Card title="Classement des quiz" sub="Premières réponses uniquement, rejouer ne compte pas">
          {leaderboard.length === 0 ? (
            <p className="text-sm text-[#1C2B24]/60">Personne n&apos;a encore répondu à un quiz.</p>
          ) : (
            <ol className="space-y-2">
              {leaderboard.map((v, i) => {
                const p = pct(v.quiz_correct, v.quiz_total);
                return (
                  <li key={v.id} className="flex items-center gap-3">
                    <span
                      className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold ${
                        i === 0 ? 'bg-[#D9A441] text-[#1C2B24]' : i < 3 ? 'bg-[#1F5A43] text-white' : 'bg-[#1C2B24]/[0.06]'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium truncate">
                          {v.first_name} {v.last_name}
                        </span>
                        <span className="text-sm whitespace-nowrap">
                          <strong>
                            {v.quiz_correct}/{v.quiz_total}
                          </strong>{' '}
                          <span className="text-[#1C2B24]/50">{p} %</span>
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-[#1C2B24]/[0.06] overflow-hidden">
                        <div className="h-full rounded-full bg-[#1F5A43]" style={{ width: `${p}%` }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>

        {/* Per card */}
        <Card title="Résultats par case" sub="Ouvertures (part des participants) et réussite au quiz">
          {perCard.length === 0 ? (
            <p className="text-sm text-[#1C2B24]/60">Aucune case pour le moment.</p>
          ) : (
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {perCard.map((c) => {
                const p = pct(c.opens, kpis.participants);
                const qp = c.quiz ? pct(c.quiz.correct, c.quiz.answers) : null;
                return (
                  <div key={c.date}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate">
                        <span className="text-[#1C2B24]/50 mr-2">{formatShortFR(c.date)}</span>
                        <span className="font-medium">{c.title}</span>
                      </span>
                      <span className="whitespace-nowrap font-semibold">
                        {c.opens} <span className="text-[#1C2B24]/50 font-normal">({p} %)</span>
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-[#1C2B24]/[0.06] overflow-hidden">
                      <div className="h-full rounded-full bg-[#1F5A43]" style={{ width: `${p}%` }} />
                    </div>
                    <div className="text-xs text-[#1C2B24]/55 mt-1">
                      {c.copilot} clic{c.copilot > 1 ? 's' : ''} Copilot/copie
                      {c.quiz && (
                        <>
                          {' | '}quiz : <strong className="text-[#9A6B12]">{qp} %</strong> de bonnes réponses (
                          {c.quiz.players} joueur{c.quiz.players > 1 ? 's' : ''})
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Activité par jour"
        right={
          <div className="inline-flex flex-wrap rounded-lg bg-[#1C2B24]/[0.06] p-1 gap-1">
            {DAILY_METRICS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMetric(m.id)}
                className={`px-3 py-1.5 rounded-md text-sm cursor-pointer ${
                  metric === m.id ? 'bg-white shadow-sm font-semibold' : 'text-[#1C2B24]/65 hover:text-[#1C2B24]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        }
      >
        <BarChart data={dailySeries} ariaLabel={`${DAILY_METRICS.find((m) => m.id === metric)!.label} par jour`} />
      </Card>

      <Card title="Heures d'ouverture des cases" sub="Heure de Paris, utile pour choisir le moment d'une relance">
        <BarChart data={hourSeries} labelEvery={3} ariaLabel="Ouvertures par heure de la journée" />
      </Card>
    </div>
  );
};
