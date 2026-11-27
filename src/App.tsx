import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Sparkles,
  BookOpen,
  Box,
  Lock,
  CalendarDays,
  CheckCircle2,
  Gift,
  Loader2,
  RefreshCw,
  Eye,
  UserRound,
} from 'lucide-react';
import {
  AdminPreview,
  AdventTip,
  CalendarSettings,
  CardRecord,
  TrackedEventType,
  Visitor,
} from './types/advent';
import { isSupabaseConfigured, getSupabase } from './lib/supabase';
import {
  DEFAULT_SETTINGS,
  EMPTY_TIP_CONTENT,
  adminSignOut,
  checkIsAdmin,
  fetchCards,
  fetchMyOpens,
  fetchServerToday,
  fetchSettings,
  recordEvent,
  recordOpen,
  registerVisitor,
  visitorSession,
} from './lib/api';
import {
  clearVisitor,
  consumeNewSessionFlag,
  loadBookmarks,
  loadLocalOpened,
  loadParallax,
  loadVisitor,
  markSessionVisited,
  saveBookmarks,
  saveLocalOpened,
  saveParallax,
  saveVisitor,
} from './utils/storage';
import {
  computeActiveDay,
  dayOfMonth,
  diffDays,
  formatDayMonthFR,
  formatLongFR,
  isTipLocked,
  listWorkingDays,
  parisTodayISO,
} from './utils/calendar';
import { AdventThreeGrid } from './components/AdventThreeGrid';
import { ScratchModal } from './components/ScratchModal';
import { PastTipsDrawer } from './components/PastTipsDrawer';
import { BackofficeAuthModal } from './components/BackofficeAuthModal';
import { BackofficeStudio } from './components/BackofficeStudio';
import { NameGateModal } from './components/NameGateModal';

type GridFilter = 'all' | 'to-scratch' | 'opened' | 'locked';

const REFRESH_INTERVAL_MS = 60_000;

const uniqSorted = (dates: string[]) => Array.from(new Set(dates)).sort();

export function App() {
  if (!isSupabaseConfigured) return <SetupScreen />;
  return <CalendarApp />;
}

function SetupScreen() {
  return (
    <div className="min-h-screen bg-[#FAF9F5] flex items-center justify-center p-6">
      <div className="cartoon-box-lg rounded-3xl bg-white p-8 max-w-lg text-center">
        <div className="text-4xl mb-3">🛠️</div>
        <h1 className="font-display text-2xl font-bold">Configuration manquante</h1>
        <p className="text-sm text-[#475569] mt-2">
          Les variables <code className="font-mono">VITE_SUPABASE_URL</code> et{' '}
          <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> ne sont pas définies. Consultez le
          fichier <code className="font-mono">README.md</code> (section « Déploiement »).
        </p>
      </div>
    </div>
  );
}

function CalendarApp() {
  // ---- Remote data ----
  const [settings, setSettings] = useState<CalendarSettings | null>(null);
  const [cards, setCards] = useState<CardRecord[]>([]);
  const [serverToday, setServerToday] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ---- Visitor ----
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const [visitorReady, setVisitorReady] = useState(false);
  const [openedDates, setOpenedDates] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [parallaxEnabled, setParallaxEnabled] = useState<boolean>(() => loadParallax());

  // ---- Admin ----
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [preview, setPreviewState] = useState<AdminPreview | null>(null);
  const [previewOpened, setPreviewOpened] = useState<string[]>([]);

  // ---- UI ----
  const [selectedTip, setSelectedTip] = useState<AdventTip | null>(null);
  const [showPastDrawer, setShowPastDrawer] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showBackoffice, setShowBackoffice] = useState(false);
  const [gridFilter, setGridFilter] = useState<GridFilter>('all');
  const [toast, setToast] = useState<string | null>(null);

  const visitorRef = useRef<Visitor | null>(null);
  visitorRef.current = visitor;

  const showToast = useCallback((msg: string) => setToast(msg), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // ------------------------------------------------------------------
  //  Data loading (settings + cards + server date), polled for live updates
  // ------------------------------------------------------------------
  const loadData = useCallback(async () => {
    try {
      const [s, c, t] = await Promise.all([fetchSettings(), fetchCards(), fetchServerToday()]);
      setSettings((prev) => (prev && JSON.stringify(prev) === JSON.stringify(s) ? prev : s));
      setCards((prev) => (JSON.stringify(prev) === JSON.stringify(c) ? prev : c));
      if (t) setServerToday(t);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  }, []);

  const syncOpens = useCallback(async (v: Visitor) => {
    const local = loadLocalOpened(v.id);
    let merged: string[];
    try {
      const server = await fetchMyOpens(v.id);
      // Re-send opens that were stored locally but never reached the server (offline...)
      const missing = local.filter((d) => !server.includes(d));
      const recovered: string[] = [];
      for (const d of missing) {
        try {
          if (await recordOpen(v.id, d)) recovered.push(d);
        } catch {
          recovered.push(d); // still offline: keep it locally, retry later
        }
      }
      merged = uniqSorted([...server, ...recovered]);
    } catch {
      merged = uniqSorted(local);
    }
    if (visitorRef.current?.id !== v.id) return;
    setOpenedDates((prev) => {
      const next = uniqSorted([...prev, ...merged]);
      saveLocalOpened(v.id, next);
      return next;
    });
  }, []);

  const refreshAll = useCallback(async () => {
    await loadData();
    const v = visitorRef.current;
    if (v) await syncOpens(v);
  }, [loadData, syncOpens]);

  useEffect(() => {
    void loadData();
    const id = window.setInterval(() => void refreshAll(), REFRESH_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshAll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadData, refreshAll]);

  // Admin rights change what RLS returns => reload cards
  useEffect(() => {
    void loadData();
  }, [isAdmin, loadData]);

  // ------------------------------------------------------------------
  //  Visitor identity
  // ------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const local = loadVisitor();
    if (!local) {
      setVisitorReady(true);
      return;
    }
    const newVisit = consumeNewSessionFlag(local.id);
    visitorSession(local.id, newVisit)
      .then((res) => {
        if (cancelled) return;
        if (res === null) {
          // Participant deleted from the admin: ask for the name again
          clearVisitor();
          setVisitor(null);
        } else {
          const v: Visitor = {
            id: local.id,
            firstName: res.firstName || local.firstName,
            lastName: res.lastName || local.lastName,
          };
          saveVisitor(v);
          setVisitor(v);
        }
      })
      .catch(() => {
        // Network issue: keep the local identity, never block the user
        if (!cancelled) setVisitor(local);
      })
      .finally(() => {
        if (!cancelled) setVisitorReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!visitor) {
      setOpenedDates([]);
      setBookmarks([]);
      return;
    }
    setOpenedDates(uniqSorted(loadLocalOpened(visitor.id)));
    setBookmarks(loadBookmarks(visitor.id));
    void syncOpens(visitor);
  }, [visitor, syncOpens]);

  const handleRegister = async (firstName: string, lastName: string) => {
    const id = await registerVisitor(firstName, lastName);
    markSessionVisited(id);
    const v: Visitor = { id, firstName, lastName };
    saveVisitor(v);
    setVisitor(v);
    showToast(`👋 Bienvenue ${firstName} !`);
  };

  const handleSwitchUser = () => {
    clearVisitor();
    setVisitor(null);
    setSelectedTip(null);
  };

  // ------------------------------------------------------------------
  //  Admin session
  // ------------------------------------------------------------------
  useEffect(() => {
    const sb = getSupabase();
    let cancelled = false;
    let seq = 0;
    const apply = async (email: string | null, hasSession: boolean) => {
      const mySeq = ++seq;
      if (!hasSession) {
        setIsAdmin(false);
        setAdminEmail(null);
        return;
      }
      const ok = await checkIsAdmin();
      if (cancelled || mySeq !== seq) return;
      setIsAdmin(ok);
      setAdminEmail(ok ? email : null);
    };
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      // Do not call Supabase synchronously inside this callback (documented deadlock)
      window.setTimeout(() => void apply(session?.user.email ?? null, Boolean(session)), 0);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setPreviewState(null);
      setPreviewOpened([]);
      setShowBackoffice(false);
    }
  }, [isAdmin]);

  const setPreview = useCallback((next: AdminPreview | null) => {
    setPreviewState(next);
    if (!next) setPreviewOpened([]);
  }, []);

  const openAdmin = useCallback(() => {
    if (isAdmin) setShowBackoffice(true);
    else setShowAuthModal(true);
  }, [isAdmin]);

  // Secret keyboard shortcut Ctrl+Shift+A / Cmd+Shift+A, and #admin in the URL
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        openAdmin();
      }
    };
    const onHash = () => {
      if (window.location.hash === '#admin') {
        openAdmin();
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    };
    onHash();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('hashchange', onHash);
    };
  }, [openAdmin]);

  const handleSignOut = async () => {
    await adminSignOut();
    setShowBackoffice(false);
    setPreview(null);
    showToast('Déconnecté du Studio admin.');
  };

  // ------------------------------------------------------------------
  //  Derived calendar view
  // ------------------------------------------------------------------
  const cal = settings ?? DEFAULT_SETTINGS;
  const realToday = serverToday ?? parisTodayISO();
  const previewActive = isAdmin && preview !== null;
  const viewDate = previewActive && preview ? preview.date : realToday;
  const includeDrafts = previewActive && preview ? preview.includeDrafts : false;
  const activeDay = computeActiveDay(viewDate, cal.start_date);

  const slots = useMemo(
    () => listWorkingDays(cal.start_date, cal.end_date),
    [cal.start_date, cal.end_date]
  );

  const tips = useMemo<AdventTip[]>(() => {
    const byDate = new Map(cards.map((c) => [c.publish_date, c]));
    const out: AdventTip[] = [];
    for (const date of slots) {
      const card = byDate.get(date);
      const diff = diffDays(viewDate, date);
      const lockLabel = diff > 0 ? `J-${diff}` : undefined;
      const visible =
        card &&
        (previewActive
          ? includeDrafts || card.status === 'published'
          : card.status === 'published' && date <= realToday);
      if (card && visible) {
        out.push({ ...card.content, day: dayOfMonth(date), date, lockLabel });
      } else if (date >= viewDate) {
        out.push({
          ...EMPTY_TIP_CONTENT,
          title: '',
          emoji: '🎁',
          day: dayOfMonth(date),
          date,
          placeholder: true,
          lockLabel: lockLabel ?? 'Bientôt',
        });
      }
      // past slot without visible content => hidden
    }
    return out;
  }, [cards, slots, viewDate, realToday, previewActive, includeDrafts]);

  const activeOpenedDates = previewActive ? previewOpened : openedDates;

  const availableTips = useMemo(
    () => tips.filter((t) => !isTipLocked(t, activeDay)),
    [tips, activeDay]
  );
  const openedDays = useMemo(
    () => availableTips.filter((t) => activeOpenedDates.includes(t.date)).map((t) => t.day),
    [availableTips, activeOpenedDates]
  );
  const bookmarkedDays = useMemo(
    () => tips.filter((t) => bookmarks.includes(t.date)).map((t) => t.day),
    [tips, bookmarks]
  );

  const openedAvailableCount = openedDays.length;
  const toScratchCount = availableTips.length - openedAvailableCount;
  const lockedCount = tips.length - availableTips.length;

  const filteredTips = useMemo(
    () =>
      tips.filter((t) => {
        const locked = isTipLocked(t, activeDay);
        const isOpened = !locked && openedDays.includes(t.day);
        if (gridFilter === 'to-scratch') return !locked && !isOpened;
        if (gridFilter === 'opened') return isOpened;
        if (gridFilter === 'locked') return locked;
        return true;
      }),
    [tips, activeDay, openedDays, gridFilter]
  );

  // Keep the open modal in sync with live updates (or close it if the card disappeared)
  useEffect(() => {
    if (!selectedTip) return;
    const fresh = tips.find((t) => t.date === selectedTip.date);
    if (!fresh || isTipLocked(fresh, activeDay)) setSelectedTip(null);
    else if (fresh !== selectedTip && JSON.stringify(fresh) !== JSON.stringify(selectedTip)) {
      setSelectedTip(fresh);
    }
  }, [tips, activeDay, selectedTip]);

  // ------------------------------------------------------------------
  //  Handlers
  // ------------------------------------------------------------------
  const emblemClicksRef = useRef<{ count: number; timer: number | null }>({ count: 0, timer: null });

  const handleEmblemClick = () => {
    const tracker = emblemClicksRef.current;
    tracker.count += 1;
    if (tracker.timer) window.clearTimeout(tracker.timer);
    if (tracker.count >= 3) {
      tracker.count = 0;
      openAdmin();
      return;
    }
    tracker.timer = window.setTimeout(() => {
      tracker.count = 0;
    }, 850);

    showToast(
      toScratchCount > 0
        ? `🎁 ${toScratchCount} case${toScratchCount > 1 ? 's' : ''} prête${
            toScratchCount > 1 ? 's' : ''
          } à être grattée${toScratchCount > 1 ? 's' : ''} !`
        : '🎄 Toutes les cases disponibles ont été découvertes !'
    );
  };

  const handleLockedClick = (tip: AdventTip) => {
    const diff = diffDays(viewDate, tip.date);
    if (diff <= 0) {
      showToast('⏳ La case du jour arrive très bientôt, revenez un peu plus tard !');
      return;
    }
    showToast(
      `🔒 Case verrouillée ! Rendez-vous le ${formatDayMonthFR(tip.date)} (dans ${diff} jour${
        diff > 1 ? 's' : ''
      }).`
    );
  };

  const handleSelectTip = (tip: AdventTip) => {
    if (isTipLocked(tip, activeDay)) {
      handleLockedClick(tip);
      return;
    }
    setSelectedTip(tip);
  };

  const handleRevealDay = (day: number) => {
    const tip = tips.find((t) => t.day === day);
    if (!tip || isTipLocked(tip, activeDay)) return;

    if (previewActive) {
      setPreviewOpened((prev) => (prev.includes(tip.date) ? prev : [...prev, tip.date]));
      showToast('✨ Case révélée (aperçu admin : non comptabilisé)');
      return;
    }

    if (!openedDates.includes(tip.date)) {
      const next = uniqSorted([...openedDates, tip.date]);
      setOpenedDates(next);
      if (visitor) {
        saveLocalOpened(visitor.id, next);
        recordOpen(visitor.id, tip.date).catch(() => {
          // kept locally, re-sent at the next sync
        });
      }
    }
    showToast(`✨ Case du ${formatDayMonthFR(tip.date)} révélée !`);
  };

  const handleTrack = (type: TrackedEventType) => {
    if (previewActive || !visitor || !selectedTip || selectedTip.placeholder) return;
    recordEvent(visitor.id, type, selectedTip.date).catch(() => {});
  };

  const handleToggleBookmark = (day: number) => {
    const tip = tips.find((t) => t.day === day);
    if (!tip) return;
    const next = bookmarks.includes(tip.date)
      ? bookmarks.filter((d) => d !== tip.date)
      : [...bookmarks, tip.date];
    setBookmarks(next);
    if (visitor) saveBookmarks(visitor.id, next);
  };

  const handleToggleParallax = () => {
    setParallaxEnabled((prev) => {
      saveParallax(!prev);
      return !prev;
    });
  };

  const selectedIndex = selectedTip
    ? availableTips.findIndex((t) => t.date === selectedTip.date)
    : -1;

  const handleModalNavigate = (direction: 'prev' | 'next') => {
    if (selectedIndex < 0) return;
    const target = availableTips[direction === 'prev' ? selectedIndex - 1 : selectedIndex + 1];
    if (target) setSelectedTip(target);
  };

  // ------------------------------------------------------------------
  //  Render
  // ------------------------------------------------------------------
  if (!settings) {
    return (
      <div className="min-h-screen bg-[#FAF9F5] bg-clean-grid flex items-center justify-center p-6">
        {loadError ? (
          <div className="cartoon-box-lg rounded-3xl bg-white p-8 max-w-md text-center">
            <div className="text-4xl mb-3">📡</div>
            <h1 className="font-display text-xl font-bold">Calendrier momentanément indisponible</h1>
            <p className="text-sm text-[#475569] mt-2">{loadError}</p>
            <button
              type="button"
              onClick={() => void loadData()}
              className="cartoon-btn mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#86BC25] text-xs font-bold cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" /> Réessayer
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm font-bold text-[#475569]">
            <Loader2 className="w-5 h-5 animate-spin text-[#86BC25]" />
            Chargement du calendrier…
          </div>
        )}
      </div>
    );
  }

  const progressDenominator = availableTips.length;

  return (
    <div className="relative min-h-screen bg-[#FAF9F5] bg-clean-grid text-[#0F172A] flex flex-col">
      {/* Admin preview banner (only ever rendered for an authenticated admin) */}
      {previewActive && preview && (
        <div className="relative z-30 bg-[#FEF3C7] border-b-2 border-[#0F172A] px-4 py-2 text-center text-xs font-bold flex flex-wrap items-center justify-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <Eye className="w-4 h-4" />
            Aperçu admin au <span className="underline capitalize">{formatLongFR(preview.date)}</span>
            {preview.includeDrafts ? ' • brouillons inclus' : ' • cases publiées uniquement'} — visible
            uniquement par vous, rien n&apos;est comptabilisé.
          </span>
          <button
            type="button"
            onClick={() => setShowBackoffice(true)}
            className="px-2.5 py-0.5 rounded-lg bg-white border border-[#0F172A] text-xs font-bold hover:bg-[#86BC25] cursor-pointer"
          >
            Régler l&apos;aperçu
          </button>
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="px-2.5 py-0.5 rounded-lg bg-[#0F172A] text-white text-xs font-bold cursor-pointer"
          >
            Quitter l&apos;aperçu (date réelle)
          </button>
        </div>
      )}

      {/* Main Layout */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12 flex-1">
        <header className="cartoon-box-lg rounded-3xl bg-white p-5 sm:p-7 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-start sm:items-center gap-4 sm:gap-5">
              <button
                type="button"
                onClick={handleEmblemClick}
                title="Calendrier Transfo & Change"
                className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-2xl bg-gradient-to-br from-[#86BC25] to-[#5D8A16] border-[2.5px] border-[#0F172A] shadow-[4px_4px_0px_#0F172A] flex items-center justify-center text-white hover:-translate-y-0.5 transition-transform cursor-pointer"
              >
                <Gift className="w-8 h-8 sm:w-10 sm:h-10" />
              </button>

              <div>
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#0F172A] text-white text-[11px] font-bold tracking-wide">
                    <span className="w-2 h-2 rounded-full bg-[#86BC25]" />
                    DELOITTE • TRANSFORMATION &amp; CHANGE
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] text-[11px] font-bold">
                    ✨ Édition Hiver {cal.start_date.slice(0, 4)}
                  </span>
                </div>

                <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-[#0F172A] tracking-tight leading-tight">
                  {cal.title}
                </h1>
                <p className="text-sm sm:text-[15px] text-[#475569] mt-1 max-w-2xl">{cal.subtitle}</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-3 shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-xl bg-[#F8FAFC] border-2 border-[#0F172A] px-3 py-1.5 flex items-center gap-2 text-xs font-bold capitalize">
                  <CalendarDays className="w-4 h-4 text-[#0284C7]" />
                  <span>{formatDayMonthFR(viewDate)}</span>
                </div>

                <div className="rounded-xl bg-[#ECFCCB] border-2 border-[#0F172A] px-3 py-1.5 flex items-center gap-2 text-xs font-bold text-[#3F6212]">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {openedAvailableCount}/{progressDenominator} découvert
                    {openedAvailableCount > 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPastDrawer(true)}
                  className="cartoon-btn inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FBBF24] text-[#0F172A] text-xs font-bold cursor-pointer"
                >
                  <BookOpen className="w-4 h-4" />
                  Voir les tips passés ({openedAvailableCount})
                </button>

                <button
                  type="button"
                  onClick={handleToggleParallax}
                  className={`cartoon-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                    parallaxEnabled ? 'bg-[#86BC25] text-[#0F172A]' : 'bg-[#F1F5F9] text-[#64748B]'
                  }`}
                >
                  <Box className="w-3.5 h-3.5" />
                  Parallax 3D {parallaxEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
          </div>

          {/* Filter Strip */}
          <div className="mt-5 pt-4 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: 'all', label: `Toutes (${tips.length})` },
                  { id: 'to-scratch', label: `✨ À gratter (${toScratchCount})` },
                  { id: 'opened', label: `✅ Débloquées (${openedAvailableCount})` },
                  { id: 'locked', label: `🔒 À venir (${lockedCount})` },
                ] as { id: GridFilter; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setGridFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl border-2 text-xs font-bold cursor-pointer transition-all ${
                    gridFilter === tab.id
                      ? 'border-[#0F172A] bg-[#0F172A] text-[#A3E635]'
                      : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#475569] hover:border-[#0F172A] hover:text-[#0F172A]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {toScratchCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#BE123C]">
                <Sparkles className="w-3.5 h-3.5" />
                {toScratchCount} case{toScratchCount > 1 ? 's' : ''} prête
                {toScratchCount > 1 ? 's' : ''} à gratter
              </span>
            )}
          </div>
        </header>

        <main className="rounded-3xl border-2 border-[#0F172A]/10 bg-white/50 backdrop-blur-xs p-2 sm:p-4 shadow-xs">
          {filteredTips.length === 0 ? (
            <div className="cartoon-box rounded-3xl bg-white p-12 text-center max-w-md mx-auto my-8">
              <div className="text-4xl mb-3">🎄</div>
              <h3 className="font-display text-xl font-bold">
                {tips.length === 0 ? 'Le calendrier est terminé' : 'Aucune case dans ce filtre'}
              </h3>
              <p className="text-sm text-[#64748B] mt-1 mb-4">
                {tips.length === 0
                  ? 'Merci pour votre participation, à l’année prochaine !'
                  : 'Revenez sur « Toutes » pour voir l’ensemble du calendrier.'}
              </p>
              {tips.length > 0 && (
                <button
                  type="button"
                  onClick={() => setGridFilter('all')}
                  className="cartoon-btn px-4 py-2 rounded-xl bg-[#86BC25] text-xs font-bold cursor-pointer"
                >
                  Afficher toutes les cases
                </button>
              )}
            </div>
          ) : (
            <AdventThreeGrid
              tips={filteredTips}
              activeDay={activeDay}
              openedDays={openedDays}
              bookmarkedDays={bookmarkedDays}
              parallaxEnabled={parallaxEnabled}
              onSelect={handleSelectTip}
              onLockedClick={handleLockedClick}
            />
          )}
        </main>
      </div>

      <footer className="relative z-10 border-t-2 border-[#0F172A]/10 bg-white/90 px-4 sm:px-8 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#64748B]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#86BC25] inline-block" />
            <strong className="text-[#0F172A]">Deloitte Transfo &amp; Change</strong>
            {visitor && (
              <>
                <span>—</span>
                <span className="inline-flex items-center gap-1">
                  <UserRound className="w-3.5 h-3.5" />
                  {visitor.firstName} {visitor.lastName}
                </span>
                <button
                  type="button"
                  onClick={handleSwitchUser}
                  className="underline hover:text-[#0F172A] cursor-pointer"
                >
                  Ce n&apos;est pas vous ?
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={openAdmin}
            title="Accès Studio Admin"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#94A3B8] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors cursor-pointer"
          >
            <Lock className="w-3 h-3" />
            {isAdmin ? 'Studio admin' : 'Admin'}
          </button>
        </div>
      </footer>

      {selectedTip && (
        <ScratchModal
          tip={selectedTip}
          activeDay={activeDay}
          isOpened={openedDays.includes(selectedTip.day)}
          isBookmarked={bookmarkedDays.includes(selectedTip.day)}
          onReveal={handleRevealDay}
          onToggleBookmark={handleToggleBookmark}
          onClose={() => setSelectedTip(null)}
          canGoPrev={selectedIndex > 0}
          canGoNext={selectedIndex >= 0 && selectedIndex < availableTips.length - 1}
          onNavigate={handleModalNavigate}
          onNotify={showToast}
          onTrack={handleTrack}
        />
      )}

      {showPastDrawer && (
        <PastTipsDrawer
          tips={tips}
          activeDay={activeDay}
          openedDays={openedDays}
          bookmarkedDays={bookmarkedDays}
          onSelectTip={handleSelectTip}
          onClose={() => setShowPastDrawer(false)}
        />
      )}

      {/* First visit: name required */}
      {visitorReady && !visitor && !showAuthModal && !showBackoffice && (
        <NameGateModal calendarTitle={cal.title} onSubmit={handleRegister} />
      )}

      {showAuthModal && (
        <BackofficeAuthModal
          onSuccess={() => {
            setShowAuthModal(false);
            setIsAdmin(true);
            setShowBackoffice(true);
          }}
          onClose={() => setShowAuthModal(false)}
        />
      )}

      {showBackoffice && isAdmin && (
        <BackofficeStudio
          settings={cal}
          cards={cards}
          realToday={realToday}
          preview={preview}
          onChangePreview={setPreview}
          onReload={loadData}
          onClose={() => setShowBackoffice(false)}
          onNotify={showToast}
          adminEmail={adminEmail}
          onSignOut={handleSignOut}
        />
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[80] animate-pop-in px-4 w-max max-w-full">
          <div className="cartoon-box rounded-2xl bg-[#0F172A] text-white px-5 py-2.5 text-xs sm:text-sm font-bold flex items-center gap-2 shadow-[4px_4px_0px_#86BC25]">
            <span>{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
