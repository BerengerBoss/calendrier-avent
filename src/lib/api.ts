import type { Session } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import {
  CalendarSettings,
  CardRecord,
  CardStatus,
  CardStyleId,
  CopilotTargetMode,
  DashboardData,
  QuizOption,
  QuizQuestion,
  QuizSlide,
  ResourceLink,
  ResourceType,
  ShareLink,
  TipCategory,
  TipContent,
  TipMedia,
  TipMediaKind,
  TipQuiz,
  TrackedEventType,
} from '../types/advent';
import { CARD_STYLES } from '../data/cardStyles';
import { isISODate } from '../utils/calendar';

// ---------------------------------------------------------------------------
//  Normalisation (protège le front contre un contenu jsonb incomplet)
// ---------------------------------------------------------------------------
const CATEGORIES: TipCategory[] = [
  "Cas d'usage",
  'Tip Prompt',
  'Agent Partagé',
  'News IA',
  'Ressource',
  'Challenge',
];
const COPILOT_MODES: CopilotTargetMode[] = ['m365', 'web', 'studio'];
const RESOURCE_TYPES: ResourceType[] = ['article', 'guide', 'agent', 'video', 'outil', 'podcast'];
const MEDIA_KINDS: TipMediaKind[] = ['youtube', 'embed', 'image', 'link'];
const SLIDE_THEMES: QuizSlide['theme'][] = ['light', 'dark', 'green'];

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const optStr = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v : undefined;

function normalizeMedia(raw: unknown): TipMedia | undefined {
  const m = obj(raw);
  if (!m) return undefined;
  const url = str(m.url).trim();
  if (!url || !MEDIA_KINDS.includes(m.kind as TipMediaKind)) return undefined;
  return {
    kind: m.kind as TipMediaKind,
    url,
    title: optStr(m.title),
    caption: optStr(m.caption),
    ctaLabel: optStr(m.ctaLabel),
  };
}

function normalizeSlide(raw: unknown): QuizSlide | undefined {
  const s = obj(raw);
  if (!s) return undefined;
  return {
    title: str(s.title),
    lines: Array.isArray(s.lines) ? s.lines.filter((l): l is string => typeof l === 'string') : [],
    theme: SLIDE_THEMES.includes(s.theme as QuizSlide['theme'])
      ? (s.theme as QuizSlide['theme'])
      : 'light',
  };
}

function normalizeQuestion(raw: unknown): QuizQuestion | null {
  const q = obj(raw);
  if (!q || !str(q.question).trim()) return null;
  const base = {
    question: str(q.question),
    explanation: str(q.explanation),
    sourceLabel: optStr(q.sourceLabel),
    sourceUrl: optStr(q.sourceUrl),
  };
  if (q.kind === 'choice') {
    const options: QuizOption[] = Array.isArray(q.options)
      ? q.options
          .map(obj)
          .filter((o): o is Record<string, unknown> => o !== null)
          .map((o) => ({
            label: str(o.label),
            correct: o.correct === true,
            image: optStr(o.image),
            slide: normalizeSlide(o.slide),
          }))
      : [];
    if (options.length < 2) return null;
    return { kind: 'choice', ...base, options };
  }
  return { kind: 'true-false', ...base, answer: q.answer !== false };
}

function normalizeQuiz(raw: unknown): TipQuiz | undefined {
  const z = obj(raw);
  if (!z || !Array.isArray(z.questions)) return undefined;
  const questions = z.questions
    .map(normalizeQuestion)
    .filter((q): q is QuizQuestion => q !== null);
  if (questions.length === 0) return undefined;
  return { title: optStr(z.title), questions, outro: optStr(z.outro) };
}

export const EMPTY_TIP_CONTENT: TipContent = {
  title: 'Nouvelle case',
  category: "Cas d'usage",
  practice: 'Transfo & Change',
  emoji: '🎁',
  summary: '',
  content: '',
  actionLabel: 'Copier le prompt',
  promptOrAction: '',
  copilotMode: 'm365',
  copilotUrl: '',
  resources: [],
  cardStyle: 'deloitte-emerald',
  badgeTag: '',
};

export function normalizeTipContent(raw: unknown): TipContent {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const category = CATEGORIES.includes(r.category as TipCategory)
    ? (r.category as TipCategory)
    : EMPTY_TIP_CONTENT.category;
  const cardStyle =
    typeof r.cardStyle === 'string' && r.cardStyle in CARD_STYLES
      ? (r.cardStyle as CardStyleId)
      : 'deloitte-emerald';
  const copilotMode = COPILOT_MODES.includes(r.copilotMode as CopilotTargetMode)
    ? (r.copilotMode as CopilotTargetMode)
    : 'm365';
  const resources: ResourceLink[] = Array.isArray(r.resources)
    ? (r.resources as unknown[])
        .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object')
        .map((x, i) => ({
          id: str(x.id) || `res-${i}-${Math.random().toString(36).slice(2, 8)}`,
          label: str(x.label),
          url: str(x.url),
          type: RESOURCE_TYPES.includes(x.type as ResourceType) ? (x.type as ResourceType) : 'article',
        }))
    : [];

  return {
    title: str(r.title),
    category,
    practice: str(r.practice),
    emoji: str(r.emoji, '🎁') || '🎁',
    summary: str(r.summary),
    content: str(r.content),
    actionLabel: str(r.actionLabel, 'Copier le prompt') || 'Copier le prompt',
    promptOrAction: str(r.promptOrAction),
    copilotMode,
    copilotUrl: str(r.copilotUrl),
    resources,
    cardStyle,
    badgeTag: str(r.badgeTag),
    media: normalizeMedia(r.media),
    quiz: normalizeQuiz(r.quiz),
    funFact: optStr(r.funFact),
  };
}

function normalizeCard(row: Record<string, unknown>): CardRecord | null {
  if (!isISODate(row.publish_date)) return null;
  return {
    publish_date: row.publish_date,
    status: row.status === 'published' ? 'published' : 'draft',
    content: normalizeTipContent(row.content),
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : undefined,
  };
}

function fail(prefix: string, error: { message?: string } | null): never {
  throw new Error(`${prefix}${error?.message ? ` : ${error.message}` : ''}`);
}

// ---------------------------------------------------------------------------
//  Public
// ---------------------------------------------------------------------------
export const DEFAULT_SETTINGS: CalendarSettings = {
  title: 'Le Calendrier de l’Avent de l’IA',
  subtitle:
    'Chaque jour ouvré, grattez une case pour découvrir une astuce concrète, un usage Copilot ou une ressource utile en mission.',
  start_date: '2026-12-01',
  end_date: '2026-12-24',
};

export async function fetchSettings(): Promise<CalendarSettings> {
  const { data, error } = await getSupabase()
    .from('settings')
    .select('title, subtitle, start_date, end_date')
    .eq('id', 1)
    .maybeSingle();
  if (error) fail('Lecture des réglages impossible', error);
  if (!data) return DEFAULT_SETTINGS;
  return {
    title: str(data.title) || DEFAULT_SETTINGS.title,
    subtitle: str(data.subtitle),
    start_date: isISODate(data.start_date) ? data.start_date : DEFAULT_SETTINGS.start_date,
    end_date: isISODate(data.end_date) ? data.end_date : DEFAULT_SETTINGS.end_date,
  };
}

/** Returns only what RLS allows: published & past cards for visitors, everything for admins. */
export async function fetchCards(): Promise<CardRecord[]> {
  const { data, error } = await getSupabase()
    .from('cards')
    .select('publish_date, status, content, updated_at')
    .order('publish_date', { ascending: true })
    .limit(500);
  if (error) fail('Lecture des cases impossible', error);
  return (data ?? [])
    .map((row) => normalizeCard(row as Record<string, unknown>))
    .filter((c): c is CardRecord => c !== null);
}

export async function fetchServerToday(): Promise<string | null> {
  const { data, error } = await getSupabase().rpc('get_server_today');
  if (error || !isISODate(data)) return null;
  return data;
}

export async function registerVisitor(firstName: string, lastName: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('register_visitor', {
    p_first_name: firstName,
    p_last_name: lastName,
  });
  if (error || typeof data !== 'string') fail('Inscription impossible', error);
  return data as string;
}

/**
 * Validates a stored visitor id. Returns names when it exists, null when it
 * was deleted. Throws on network errors (caller keeps the local identity).
 */
export async function visitorSession(
  visitorId: string,
  newVisit: boolean
): Promise<{ firstName: string; lastName: string } | null> {
  const { data, error } = await getSupabase().rpc('visitor_session', {
    p_visitor_id: visitorId,
    p_new_visit: newVisit,
  });
  if (error) {
    // invalid uuid => treat as unknown visitor
    if (error.code === '22P02') return null;
    fail('Vérification du participant impossible', error);
  }
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  return { firstName: str(d.first_name), lastName: str(d.last_name) };
}

export async function fetchMyOpens(visitorId: string): Promise<string[]> {
  const { data, error } = await getSupabase().rpc('get_my_opens', { p_visitor_id: visitorId });
  if (error) fail('Lecture de vos cases impossible', error);
  return Array.isArray(data) ? data.filter(isISODate) : [];
}

/** Thrown when a share link has been closed (or never existed). */
export class ShareClosedError extends Error {
  constructor() {
    super('Ce lien de partage a été fermé.');
    this.name = 'ShareClosedError';
  }
}

/** Every card reachable through a share link (server checks the link is still open). */
export async function fetchSharedCards(token: string): Promise<CardRecord[]> {
  const { data, error } = await getSupabase().rpc('get_shared_cards', { p_token: token });
  if (error) {
    if (error.message?.includes('share_closed')) throw new ShareClosedError();
    fail('Lecture des cases partagées impossible', error);
  }
  return (Array.isArray(data) ? data : [])
    .map((row) => normalizeCard(row as Record<string, unknown>))
    .filter((c): c is CardRecord => c !== null);
}

/** Only sent when present, so the app keeps working with an older schema. */
const shareParam = (token?: string | null) => (token ? { p_share_token: token } : {});

export async function recordOpen(
  visitorId: string,
  cardDate: string,
  shareToken?: string | null
): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('record_open', {
    p_visitor_id: visitorId,
    p_card_date: cardDate,
    ...shareParam(shareToken),
  });
  if (error) fail('Enregistrement impossible', error);
  return data === true;
}

export async function recordEvent(
  visitorId: string,
  type: TrackedEventType,
  cardDate: string,
  shareToken?: string | null
): Promise<void> {
  await getSupabase().rpc('record_event', {
    p_visitor_id: visitorId,
    p_type: type,
    p_card_date: cardDate,
    ...shareParam(shareToken),
  });
}

// ---------------------------------------------------------------------------
//  Quiz (cumulative score)
// ---------------------------------------------------------------------------
export interface QuizAnswerRecord {
  card_date: string;
  question_index: number;
  correct: boolean;
}

/** Records the FIRST answer to a question. The server decides if it is correct. */
export async function recordQuizAnswer(
  visitorId: string,
  cardDate: string,
  questionIndex: number,
  optionIndex: number,
  shareToken?: string | null
): Promise<{ recorded: boolean; correct?: boolean }> {
  const { data, error } = await getSupabase().rpc('record_quiz_answer', {
    p_visitor_id: visitorId,
    p_card_date: cardDate,
    p_question_index: questionIndex,
    p_option_index: optionIndex,
    ...shareParam(shareToken),
  });
  if (error) fail('Enregistrement de la réponse impossible', error);
  const d = obj(data);
  return {
    recorded: d?.recorded === true,
    correct: typeof d?.correct === 'boolean' ? d.correct : undefined,
  };
}

export async function fetchMyQuizAnswers(visitorId: string): Promise<QuizAnswerRecord[]> {
  const { data, error } = await getSupabase().rpc('get_my_quiz_answers', { p_visitor_id: visitorId });
  if (error) fail('Lecture de votre score impossible', error);
  return (Array.isArray(data) ? data : [])
    .map((r) => obj(r))
    .filter(
      (r): r is Record<string, unknown> =>
        !!r && isISODate(r.card_date) && Number.isInteger(r.question_index) && typeof r.correct === 'boolean'
    )
    .map((r) => ({
      card_date: r.card_date as string,
      question_index: r.question_index as number,
      correct: r.correct as boolean,
    }));
}

// ---------------------------------------------------------------------------
//  Share links (admin)
// ---------------------------------------------------------------------------
export async function listShareLinks(): Promise<ShareLink[]> {
  const { data, error } = await getSupabase()
    .from('share_links')
    .select('token, label, include_drafts, created_at, revoked_at')
    .order('created_at', { ascending: false });
  if (error) fail('Lecture des liens de partage impossible (schéma SQL à jour ?)', error);
  return (data ?? []) as ShareLink[];
}

export async function createShareLink(label: string, includeDrafts: boolean): Promise<ShareLink> {
  const { data, error } = await getSupabase()
    .from('share_links')
    .insert({ label: label.trim().slice(0, 80), include_drafts: includeDrafts })
    .select('token, label, include_drafts, created_at, revoked_at')
    .single();
  if (error || !data) fail('Création du lien impossible', error);
  return data as ShareLink;
}

export async function setShareLinkOpen(token: string, open: boolean): Promise<void> {
  const { error } = await getSupabase()
    .from('share_links')
    .update({ revoked_at: open ? null : new Date().toISOString() })
    .eq('token', token);
  if (error) fail('Mise à jour du lien impossible', error);
}

export async function deleteShareLink(token: string): Promise<void> {
  const { error } = await getSupabase().from('share_links').delete().eq('token', token);
  if (error) fail('Suppression du lien impossible', error);
}

export function shareLinkUrl(token: string): string {
  return `${window.location.origin}${window.location.pathname}?share=${encodeURIComponent(token)}`;
}

// ---------------------------------------------------------------------------
//  Admin
// ---------------------------------------------------------------------------
export async function getSession(): Promise<Session | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session;
}

export async function checkIsAdmin(): Promise<boolean> {
  const { data, error } = await getSupabase().rpc('is_admin');
  if (error) return false;
  return data === true;
}

export async function adminSignIn(email: string, password: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    throw new Error(
      error.message === 'Invalid login credentials'
        ? 'Email ou mot de passe incorrect.'
        : error.message
    );
  }
  const ok = await checkIsAdmin();
  if (!ok) {
    await sb.auth.signOut();
    throw new Error("Ce compte n'est pas déclaré comme administrateur (table public.admins).");
  }
}

export async function adminSignOut(): Promise<void> {
  await getSupabase().auth.signOut();
}

export async function saveCard(
  publishDate: string,
  status: CardStatus,
  content: TipContent
): Promise<void> {
  const { error } = await getSupabase()
    .from('cards')
    .upsert({ publish_date: publishDate, status, content }, { onConflict: 'publish_date' });
  if (error) fail('Enregistrement de la case impossible', error);
}

export async function deleteCard(publishDate: string): Promise<void> {
  const { error } = await getSupabase().from('cards').delete().eq('publish_date', publishDate);
  if (error) fail('Suppression impossible', error);
}

export async function saveSettings(settings: CalendarSettings): Promise<void> {
  const { error } = await getSupabase()
    .from('settings')
    .update({
      title: settings.title,
      subtitle: settings.subtitle,
      start_date: settings.start_date,
      end_date: settings.end_date,
    })
    .eq('id', 1);
  if (error) fail('Enregistrement des réglages impossible', error);
}

export async function fetchDashboard(): Promise<DashboardData> {
  const { data, error } = await getSupabase().rpc('admin_dashboard');
  if (error || !data) fail('Lecture des statistiques impossible', error);
  const d = data as Partial<DashboardData>;
  const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
  return {
    today: isISODate(d.today) ? d.today : '',
    visitors: (d.visitors ?? []).map((v) => ({
      ...v,
      visit_count: num(v.visit_count),
      copilot_count: num(v.copilot_count),
      resource_count: num(v.resource_count),
      opened_dates: Array.isArray(v.opened_dates) ? v.opened_dates : [],
    })),
    cards: (d.cards ?? []).map((c) => ({
      card_date: c.card_date,
      opens: num(c.opens),
      copilot: num(c.copilot),
      resources: num(c.resources),
    })),
    daily: (d.daily ?? []).map((x) => ({
      day: x.day,
      visits: num(x.visits),
      opens: num(x.opens),
      active_visitors: num(x.active_visitors),
    })),
    new_visitors: (d.new_visitors ?? []).map((x) => ({ day: x.day, count: num(x.count) })),
    hours: (d.hours ?? []).map((x) => ({ hour: num(x.hour), opens: num(x.opens) })),
  };
}

export async function deleteVisitor(visitorId: string): Promise<void> {
  const { error } = await getSupabase().from('visitors').delete().eq('id', visitorId);
  if (error) fail('Suppression du participant impossible', error);
}

export async function resetAllStats(): Promise<void> {
  const { error } = await getSupabase().rpc('admin_reset_stats');
  if (error) fail('Réinitialisation impossible', error);
}
