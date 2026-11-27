import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  BookOpen,
  Lock,
  CalendarDays,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Eye,
  UserRound,
  Trophy,
} from 'lucide-react';
import {
  AdminPreview,
  AdventTip,
  CalendarSettings,
  CardStyleId,
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
  fetchSharedCards,
  fetchMyQuizAnswers,
  recordQuizAnswer,
  recordEvent,
  recordOpen,
  registerVisitor,
  visitorSession,
  ShareClosedError,
} from './lib/api';
import {
  clearShareToken,
  clearVisitor,
  consumeNewSessionFlag,
  loadBookmarks,
  loadLocalOpened,
  loadShareToken,
  loadLocalQuiz,
  quizAnswerKey,
  saveLocalQuiz,
  QuizAnswerMap,
  loadVisitor,
  markSessionVisited,
  saveBookmarks,
  saveLocalOpened,
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
/** Faster polling with a share link, so closing the link takes effect quickly. */
const SHARE_REFRESH_INTERVAL_MS = 20_000;

const uniqSorted = (dates: string[]) => Array.from(new Set(dates)).sort();

/** Christmas colours rotated on boxes that have no content yet. */
const PLACEHOLDER_STYLES: CardStyleId[] = [
  'neon-comic',
  'deloitte-emerald',
  'golden-ticket',
  'holo-cyber',
  'candy-pop',
  'sunset-spark',
];

const WEEKEND_MESSAGES = [
  '💤 Week-end : pas de case, même l’IA a droit au repos !',
  '🔋 Week-end : l’IA recharge ses batteries, rendez-vous lundi !',
  '☕ Week-end : on débranche, la prochaine case arrive lundi.',
];

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

  // ---- Share link (early access to every card) ----
  const [shareToken, setShareToken] = useState<string | null>(() => loadShareToken());
  const [sharedCards, setSharedCards] = useState<CardRecord[] | null>(null);
  const [shareClosedNotice, setShareClosedNotice] = useState(false);
  const shareTokenRef = useRef<string | null>(shareToken);
  shareTokenRef.current = shareToken;

  // ---- Visitor ----
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const [visitorReady, setVisitorReady] = useState(false);
  const [openedDates, setOpenedDates] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  // Quiz answers (first answer per question counts) => cumulative score
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswerMap>({});
  const [previewQuiz, setPreviewQuiz] = useState<QuizAnswerMap>({});

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
      const token = shareTokenRef.current;
      if (token) {
        try {
          const shared = await fetchSharedCards(token);
          setSharedCards((prev) => (JSON.stringify(prev) === JSON.stringify(shared) ? prev : shared));
        } catch (err) {
          if (err instanceof ShareClosedError) {
            // Link closed by the admin: back to the normal calendar, immediately
            clearShareToken();
            setShareToken(null);
            setSharedCards(null);
            setShareClosedNotice(true);
          }
          // other errors (network): keep the last known state
        }
      }
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
          if (await recordOpen(v.id, d, shareTokenRef.current)) recovered.push(d);
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
    const id = window.setInterval(
      () => void refreshAll(),
      shareToken ? SHARE_REFRESH_INTERVAL_MS : REFRESH_INTERVAL_MS
    );
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshAll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadData, refreshAll, shareToken]);

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

  const syncQuiz = useCallback(async (v: Visitor) => {
    const local = loadLocalQuiz(v.id);
    try {
      const server = await fetchMyQuizAnswers(v.id);
      const merged: QuizAnswerMap = { ...local };
      for (const r of server) {
        const k = quizAnswerKey(r.card_date, r.question_index);
        merged[k] = { correct: r.correct, option: local[k]?.option ?? -1, synced: true };
      }
      // Answers given offline: send them now
      for (const [k, a] of Object.entries(merged)) {
        if (a.synced || a.option < 0) continue;
        const [date, qi] = k.split('#');
        try {
          const res = await recordQuizAnswer(v.id, date, Number(qi), a.option, shareTokenRef.current);
          if (res.recorded) merged[k] = { ...a, correct: res.correct ?? a.correct, synced: true };
        } catch {
          // still offline, retry later
        }
      }
      if (visitorRef.current?.id !== v.id) return;
      saveLocalQuiz(v.id, merged);
      setQuizAnswers(merged);
    } catch {
      if (visitorRef.current?.id === v.id) setQuizAnswers(local);
    }
  }, []);

  useEffect(() => {
    if (!visitor) {
      setOpenedDates([]);
      setBookmarks([]);
      setQuizAnswers({});
      return;
    }
    setOpenedDates(uniqSorted(loadLocalOpened(visitor.id)));
    setBookmarks(loadBookmarks(visitor.id));
    setQuizAnswers(loadLocalQuiz(visitor.id));
    void syncOpens(visitor);
    void syncQuiz(visitor);
  }, [visitor, syncOpens, syncQuiz]);

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
    if (!next) {
      setPreviewOpened([]);
      setPreviewQuiz({});
    }
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
  // Share link active (admin preview always wins, so the admin can still test dates)
  const shareActive = !previewActive && Boolean(shareToken) && sharedCards !== null;
  const unlockAll = (previewActive && preview ? Boolean(preview.unlockAll) : false) || shareActive;
  // "Tout déverrouiller" / share link: every slot with content becomes openable
  const activeDay = unlockAll ? 32 : computeActiveDay(viewDate, cal.start_date);

  const slots = useMemo(
    () => listWorkingDays(cal.start_date, cal.end_date),
    [cal.start_date, cal.end_date]
  );

  const tips = useMemo<AdventTip[]>(() => {
    const source = shareActive && sharedCards ? sharedCards : cards;
    const byDate = new Map(source.map((c) => [c.publish_date, c]));
    const out: AdventTip[] = [];
    slots.forEach((date, index) => {
      const card = byDate.get(date);
      const diff = diffDays(viewDate, date);
      const lockLabel = diff > 0 && !unlockAll ? `J-${diff}` : undefined;
      const visible =
        card &&
        (previewActive
          ? includeDrafts || card.status === 'published'
          : shareActive
          ? true // the server already filtered what this link may see
          : card.status === 'published' && date <= realToday);
      if (card && visible) {
        out.push({ ...card.content, day: dayOfMonth(date), date, lockLabel });
      } else {
        // Every working day keeps its box, even without content (wrapped & locked)
        out.push({
          ...EMPTY_TIP_CONTENT,
          title: '',
          emoji: '🎁',
          cardStyle: PLACEHOLDER_STYLES[index % PLACEHOLDER_STYLES.length],
          day: dayOfMonth(date),
          date,
          placeholder: true,
          lockLabel: lockLabel ?? 'Bientôt',
        });
      }
    });
    return out;
  }, [cards, sharedCards, shareActive, slots, viewDate, realToday, previewActive, includeDrafts, unlockAll]);

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

  const handleWeekendClick = (date: string) => {
    showToast(WEEKEND_MESSAGES[dayOfMonth(date) % WEEKEND_MESSAGES.length]);
  };

  const handleLockedClick = (tip: AdventTip) => {
    if (previewActive && tip.placeholder) {
      showToast(
        includeDrafts
          ? `🛠️ Aucune case créée pour le ${formatDayMonthFR(tip.date)} (onglet « Cases » du Studio).`
          : `🛠️ Pas de case publiée le ${formatDayMonthFR(tip.date)} | cochez « Inclure les brouillons » dans l’aperçu.`
      );
      return;
    }
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
        recordOpen(visitor.id, tip.date, shareActive ? shareToken : null).catch(() => {
          // kept locally, re-sent at the next sync
        });
      }
    }
    showToast(`✨ Case du ${formatDayMonthFR(tip.date)} révélée !`);
  };

  const activeQuiz = previewActive ? previewQuiz : quizAnswers;
  const quizScore = useMemo(() => {
    const all = Object.values(activeQuiz);
    return { correct: all.filter((a) => a.correct).length, total: all.length };
  }, [activeQuiz]);

  /** First answer to a question of the open card: adds to the cumulative score. */
  const handleQuizAnswer = (questionIndex: number, optionIndex: number, correct: boolean) => {
    if (!selectedTip || selectedTip.placeholder) return;
    const date = selectedTip.date;
    const key = quizAnswerKey(date, questionIndex);
    if (activeQuiz[key]) return; // already answered: replays don't count

    if (previewActive) {
      setPreviewQuiz((prev) => ({ ...prev, [key]: { correct, option: optionIndex } }));
      return;
    }
    const v = visitor;
    setQuizAnswers((prev) => {
      if (prev[key]) return prev;
      const next = { ...prev, [key]: { correct, option: optionIndex } };
      if (v) saveLocalQuiz(v.id, next);
      return next;
    });
    if (!v) return;
    recordQuizAnswer(v.id, date, questionIndex, optionIndex, shareActive ? shareToken : null)
      .then((res) => {
        if (!res.recorded || visitorRef.current?.id !== v.id) return;
        setQuizAnswers((prev) => {
          const cur = prev[key];
          if (!cur) return prev;
          // the server is the reference for correctness
          const next = { ...prev, [key]: { ...cur, correct: res.correct ?? cur.correct, synced: true } };
          saveLocalQuiz(v.id, next);
          return next;
        });
      })
      .catch(() => {
        // kept locally, re-sent at the next sync
      });
  };

  const handleTrack = (type: TrackedEventType) => {
    if (previewActive || !visitor || !selectedTip || selectedTip.placeholder) return;
    recordEvent(visitor.id, type, selectedTip.date, shareActive ? shareToken : null).catch(() => {});
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
      <div className="min-h-screen bg-festive flex items-center justify-center p-6">
        {loadError ? (
          <div className="cartoon-box-lg rounded-3xl bg-white p-8 max-w-md text-center">
            <div className="text-4xl mb-3">📡</div>
            <h1 className="font-display text-xl font-semibold">Calendrier momentanément indisponible</h1>
            <p className="text-sm text-[#475569] mt-2">{loadError}</p>
            <button
              type="button"
              onClick={() => void loadData()}
              className="cartoon-btn mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1F5A43] text-white text-xs font-bold cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" /> Réessayer
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm font-bold text-white">
            <Loader2 className="w-5 h-5 animate-spin text-[#D9A441]" />
            Chargement du calendrier…
          </div>
        )}
      </div>
    );
  }

  const progressDenominator = availableTips.length;

  return (
    <div className="relative min-h-screen bg-festive text-[#1C2B24] flex flex-col">
      <PageSnow />
      {/* Admin preview banner (only ever rendered for an authenticated admin) */}
      {previewActive && preview && (
        <div className="relative z-30 bg-[#D9A441] text-[#1C2B24] px-4 py-2 text-center text-xs font-bold flex flex-wrap items-center justify-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <Eye className="w-4 h-4" />
            Aperçu admin au <span className="underline capitalize">{formatLongFR(preview.date)}</span>
            {preview.includeDrafts ? ' • brouillons inclus' : ' • cases publiées uniquement'}
            {preview.unlockAll ? ' • 🔓 toutes les cases déverrouillées' : ''} | visible
            uniquement par vous, rien n&apos;est comptabilisé.
          </span>
          <button
            type="button"
            onClick={() => setShowBackoffice(true)}
            className="px-2.5 py-0.5 rounded-lg bg-white border border-[#1C2B24]/15 text-xs font-bold hover:bg-[#FBF6EC] cursor-pointer"
          >
            Régler l&apos;aperçu
          </button>
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="px-2.5 py-0.5 rounded-lg bg-[#0E3B2E] text-white text-xs font-bold cursor-pointer"
          >
            Quitter l&apos;aperçu (date réelle)
          </button>
        </div>
      )}

      {shareActive && (
        <div className="relative z-30 bg-[#D9A441] text-[#1C2B24] px-4 py-2 text-center text-sm font-medium">
          Accès anticipé : toutes les cases du calendrier sont ouvertes pour vous.
        </div>
      )}
      {shareClosedNotice && (
        <div className="relative z-30 bg-[#FBF6EC] text-[#1C2B24] px-4 py-2 text-center text-sm flex flex-wrap items-center justify-center gap-3">
          <span>Ce lien de partage a été fermé : vous voyez maintenant le calendrier normal.</span>
          <button
            type="button"
            onClick={() => setShareClosedNotice(false)}
            className="underline font-medium cursor-pointer"
          >
            OK
          </button>
        </div>
      )}

      {/* Main Layout */}
      <div className="relative z-10 w-full max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 pt-6 pb-12 flex-1">
        <header className="cartoon-box-lg rounded-2xl bg-[#FBF6EC] mb-6 overflow-hidden">
          <div className="h-1.5 bg-[#A8201A]" />
          <div className="px-5 sm:px-8 pt-5 pb-5 sm:pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#1C2B24]/10">
              <button
                type="button"
                onClick={handleEmblemClick}
                title="Deloitte Transformation & Change"
                className="flex items-center gap-3 h-9 cursor-pointer text-left"
              >
                <span className="text-[26px] sm:text-[30px] font-bold tracking-tight text-black leading-none" style={{ fontFamily: 'Inter, Arial, sans-serif' }}>
                  Deloitte<span className="text-[#86BC25]">.</span>
                </span>
                <span aria-hidden className="w-px h-6 bg-[#1C2B24]/20" />
                <span className="text-sm sm:text-[15px] font-medium leading-none text-[#1C2B24]/80">Transformation &amp; Change</span>
              </button>
              <div className="flex items-center gap-4 h-9 text-sm leading-none text-[#1C2B24]/70">
                <span className="inline-flex items-center gap-1.5 capitalize">
                  <CalendarDays className="w-4 h-4" />
                  {formatDayMonthFR(viewDate)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-[#1F5A43]" />
                  {openedAvailableCount}/{progressDenominator} ouverte{openedAvailableCount > 1 ? 's' : ''}
                </span>
                {quizScore.total > 0 && (
                  <span className="inline-flex items-center gap-1.5" title="Score cumulé aux quiz">
                    <Trophy className="w-4 h-4 text-[#B7791F]" />
                    Quiz {quizScore.correct}/{quizScore.total}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 pt-5">
              <div className="min-w-0">
                <h1 className="font-display text-3xl sm:text-4xl lg:text-[44px] font-semibold text-[#A8201A] tracking-tight leading-[1.1]">
                  {cal.title}
                </h1>
                {cal.subtitle && (
                  <p className="text-[15px] sm:text-base text-[#1C2B24]/75 mt-2 max-w-2xl">{cal.subtitle}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowPastDrawer(true)}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#A8201A] hover:bg-[#8E1B16] text-white text-sm font-semibold cursor-pointer transition-colors"
                >
                  <BookOpen className="w-4 h-4" />
                  Cases ouvertes ({openedAvailableCount})
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex flex-wrap rounded-lg bg-[#1C2B24]/[0.06] p-1 gap-1">
                {(
                  [
                    { id: 'all', label: `Calendrier` },
                    { id: 'to-scratch', label: `À gratter (${toScratchCount})` },
                    { id: 'opened', label: `Ouvertes (${openedAvailableCount})` },
                    { id: 'locked', label: `À venir (${lockedCount})` },
                  ] as { id: GridFilter; label: string }[]
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setGridFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium cursor-pointer transition-colors ${
                      gridFilter === tab.id
                        ? 'bg-white text-[#1C2B24] shadow-sm'
                        : 'text-[#1C2B24]/65 hover:text-[#1C2B24]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {toScratchCount > 0 && (
                <span className="text-sm font-medium text-[#A8201A]">
                  {toScratchCount} case{toScratchCount > 1 ? 's' : ''} à gratter
                </span>
              )}
            </div>
          </div>
        </header>

        <main className="rounded-2xl bg-black/10 p-1 sm:p-3">
          {gridFilter === 'all' && <WeekdayHeader />}
          {filteredTips.length === 0 ? (
            <div className="cartoon-box rounded-3xl bg-white p-12 text-center max-w-md mx-auto my-8">
              <div className="text-4xl mb-3">🎄</div>
              <h3 className="font-display text-xl font-semibold">
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
                  className="cartoon-btn px-4 py-2 rounded-xl bg-[#1F5A43] text-white text-xs font-bold cursor-pointer"
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
              parallaxEnabled
              calendarLayout={gridFilter === 'all'}
              rangeStart={cal.start_date}
              rangeEnd={cal.end_date}
              onSelect={handleSelectTip}
              onLockedClick={handleLockedClick}
              onWeekendClick={handleWeekendClick}
            />
          )}
        </main>
      </div>

      <footer className="relative z-10 border-t border-white/10 px-4 sm:px-8 py-4">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/60">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-white/80">Deloitte<span className="text-[#86BC25]">.</span> Transformation &amp; Change</strong>
            {visitor && (
              <>
                <span className="text-white/30">|</span>
                <span className="inline-flex items-center gap-1">
                  <UserRound className="w-3.5 h-3.5" />
                  {visitor.firstName} {visitor.lastName}
                </span>
                <button
                  type="button"
                  onClick={handleSwitchUser}
                  className="underline hover:text-white cursor-pointer"
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
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
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
          quizScore={quizScore}
          onQuizAnswer={handleQuizAnswer}
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
          <div className="cartoon-box rounded-2xl bg-[#0E3B2E] text-white border-white/10 px-5 py-2.5 text-xs sm:text-sm font-bold flex items-center gap-2 shadow-sm">
            <span>{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

/** Weekday names above the calendar grid (wide screens only, matches the 3D columns). */
function WeekdayHeader() {
  const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
  return (
    <div aria-hidden className="hidden min-[960px]:flex px-[3.65%] pt-3 -mb-3 gap-[2%] text-center">
      {days.map((d) => (
        <div key={d} className="flex-[2.05] text-xs font-medium uppercase tracking-[0.18em] text-white/70">
          {d}
        </div>
      ))}
      {['Sam', 'Dim'].map((d) => (
        <div key={d} className="flex-[0.95] text-xs font-medium uppercase tracking-[0.18em] text-white/35">
          {d}
        </div>
      ))}
    </div>
  );
}

const PAGE_FLAKES = Array.from({ length: 18 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 7.13 + n * 41.7) * 9301.17) % 1 + 1) % 1;
  return {
    left: `${Math.round(r(1) * 100)}%`,
    size: 6 + Math.round(r(2) * 6),
    duration: 12 + r(3) * 14,
    delay: -r(4) * 26,
    drift: `${Math.round((r(5) - 0.5) * 120)}px`,
    opacity: 0.15 + r(6) * 0.3,
  };
});

/** Gentle snowfall over the whole page background. */
function PageSnow() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden z-0">
      {PAGE_FLAKES.map((f, i) => (
        <span
          key={i}
          className="snowflake"
          style={
            {
              left: f.left,
              fontSize: f.size,
              opacity: f.opacity,
              color: '#FFFFFF',
              animationDuration: `${f.duration}s`,
              animationDelay: `${f.delay}s`,
              '--drift': f.drift,
            } as React.CSSProperties
          }
        >
          •
        </span>
      ))}
    </div>
  );
}
