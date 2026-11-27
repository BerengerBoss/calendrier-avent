export type TipCategory =
  | 'Cas d\'usage'
  | 'Tip Prompt'
  | 'Agent Partagé'
  | 'News IA'
  | 'Ressource'
  | 'Challenge';

export type CardStyleId =
  | 'deloitte-emerald'
  | 'holo-cyber'
  | 'golden-ticket'
  | 'neon-comic'
  | 'frosty-bot'
  | 'sunset-spark'
  | 'midnight-matrix'
  | 'candy-pop';

export type ResourceType = 'article' | 'guide' | 'agent' | 'video' | 'outil' | 'podcast';

/**
 * Media block shown at the top of a revealed card.
 *  - youtube : `url` = any YouTube URL (watch, youtu.be, shorts, embed) or a bare video id
 *  - embed   : `url` = an embeddable iframe URL (ex: https://embed.ted.com/talks/...)
 *  - image   : `url` = image URL
 *  - link    : `url` = external page, rendered as a big "poster" call-to-action
 *              (for replays that cannot be embedded, ex: arte.tv, lcp.fr)
 */
export type TipMediaKind = 'youtube' | 'embed' | 'image' | 'link';

export interface TipMedia {
  kind: TipMediaKind;
  url: string;
  title?: string;
  caption?: string; // ex: "Micode • 38 min"
  ctaLabel?: string; // only for kind 'link' (default "Regarder")
}

/** Mini slide mock rendered in CSS (used by "spot the AI slide" challenges). */
export interface QuizSlide {
  title: string;
  lines: string[];
  theme: 'light' | 'dark' | 'green';
}

export interface QuizOption {
  label: string;
  correct?: boolean;
  image?: string; // optional image URL shown inside the option
  slide?: QuizSlide; // optional CSS slide mock shown inside the option
}

/**
 * One quiz question.
 *  - true-false : options are generated automatically from `answer`
 *  - choice     : uses `options` (one or more `correct: true`)
 */
export interface QuizQuestion {
  kind: 'true-false' | 'choice';
  question: string;
  answer?: boolean; // true-false only
  options?: QuizOption[]; // choice only
  explanation: string; // shown after answering
  sourceLabel?: string;
  sourceUrl?: string;
}

export interface TipQuiz {
  title?: string; // ex: "Vrai ou faux ?"
  questions: QuizQuestion[];
  /** Message after the last question (ex: contest instructions). */
  outro?: string;
}

export interface ResourceLink {
  id: string;
  label: string;
  url: string;
  type: ResourceType;
}

export type CopilotTargetMode = 'm365' | 'web' | 'studio';

export interface CardStylePreset {
  id: CardStyleId;
  name: string;
  description: string;
  bgClass: string;
  edgeColor: string; // 3D volumetric thickness side color
  foilColors: [string, string, string];
  foilPattern: 'dots' | 'stripes' | 'circuit' | 'stars' | 'grid' | 'waves';
  badgeBg: string;
  badgeText: string;
  numberColor: string;
  accentHex: string;
}

/** Editable content of a card (stored as jsonb in Supabase `cards.content`). */
export interface TipContent {
  title: string;
  category: TipCategory;
  practice: string; // e.g. "Change & Culture", "Stakeholder Mgmt", "Learning & Adoption"
  emoji: string;
  summary: string;
  content: string;
  actionLabel: string;
  promptOrAction: string;
  copilotMode?: CopilotTargetMode;
  copilotUrl?: string; // Optional direct link to a shared Copilot Studio agent / M365 Copilot chat
  resources?: ResourceLink[]; // Curated links, articles, Deloitte Insights, etc.
  cardStyle: CardStyleId;
  badgeTag?: string;
  /** Video / image / poster shown at the top of the revealed card. */
  media?: TipMedia;
  /** Interactive quiz (true/false, multiple choice, spot-the-slide). */
  quiz?: TipQuiz;
  /** "Le saviez-vous ?" one-liner shown in a highlighted bubble. */
  funFact?: string;
}

/** A tip as rendered by the front-office. */
export interface AdventTip extends TipContent {
  day: number; // day of month (1..31)
  date: string; // ISO date YYYY-MM-DD
  /** Slot with no visible content yet (future day, or card not published). Always locked. */
  placeholder?: boolean;
  /** Short label displayed on locked cards (ex: "J-3", "Bientôt"). */
  lockLabel?: string;
}

/** Template tips shipped with the app (used to prefill new cards in admin). */
export interface TipTemplate extends TipContent {
  day: number;
  /** Suggested publish date (YYYY-MM-DD), working days only. */
  date?: string;
}

export type CardStatus = 'draft' | 'published';

export interface CardRecord {
  publish_date: string; // YYYY-MM-DD
  status: CardStatus;
  content: TipContent;
  updated_at?: string;
}

export interface CalendarSettings {
  title: string;
  subtitle: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
}

export interface Visitor {
  id: string;
  firstName: string;
  lastName: string;
}

export interface AdminPreview {
  date: string; // YYYY-MM-DD
  includeDrafts: boolean;
  /** Test mode: every card is openable, whatever its date. */
  unlockAll?: boolean;
}

export interface ShareLink {
  token: string;
  label: string;
  include_drafts: boolean;
  created_at: string;
  revoked_at: string | null;
}

export type TrackedEventType = 'copilot' | 'copy' | 'resource';

// ---- Admin dashboard payload (RPC admin_dashboard) ----
export interface DashboardVisitor {
  id: string;
  first_name: string;
  last_name: string;
  created_at: string;
  last_seen_at: string;
  visit_count: number;
  opened_dates: string[];
  last_open_at: string | null;
  copilot_count: number;
  resource_count: number;
  quiz_correct: number;
  quiz_total: number;
  quiz_by_card: { card_date: string; correct: number; total: number }[];
}

export interface DashboardQuizCard {
  card_date: string;
  players: number;
  correct: number;
  answers: number;
}

export interface DashboardCardStat {
  card_date: string;
  opens: number;
  copilot: number;
  resources: number;
}

export interface DashboardDaily {
  day: string;
  visits: number;
  opens: number;
  active_visitors: number;
}

export interface DashboardData {
  today: string;
  visitors: DashboardVisitor[];
  cards: DashboardCardStat[];
  quiz_cards: DashboardQuizCard[];
  daily: DashboardDaily[];
  new_visitors: { day: string; count: number }[];
  hours: { hour: number; opens: number }[];
}
