import { CopilotTargetMode, Visitor } from '../types/advent';

/**
 * Local (per-browser) preferences only. Everything that matters
 * (cards, opened cases, participants) lives in Supabase.
 */
const PREFIX = 'deloitte_advent_v4';
const VISITOR_KEY = `${PREFIX}:visitor`;
const PARALLAX_KEY = `${PREFIX}:parallax`;
const bookmarksKey = (visitorId: string) => `${PREFIX}:bookmarks:${visitorId}`;
const openedKey = (visitorId: string) => `${PREFIX}:opened:${visitorId}`;
const sessionVisitKey = (visitorId: string) => `${PREFIX}:visit:${visitorId}`;

function readJSON<T>(key: string, fallback: T, storage: Storage = localStorage): T {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown, storage: Storage = localStorage): void {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode...) — ignore
  }
}

function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

export function loadVisitor(): Visitor | null {
  const v = readJSON<Partial<Visitor> | null>(VISITOR_KEY, null);
  if (v && typeof v.id === 'string' && v.id && typeof v.firstName === 'string' && typeof v.lastName === 'string') {
    return { id: v.id, firstName: v.firstName, lastName: v.lastName };
  }
  return null;
}

export function saveVisitor(visitor: Visitor): void {
  writeJSON(VISITOR_KEY, visitor);
}

export function clearVisitor(): void {
  removeKey(VISITOR_KEY);
}

export function loadBookmarks(visitorId: string): string[] {
  const v = readJSON<unknown>(bookmarksKey(visitorId), []);
  return isStringArray(v) ? v : [];
}

export function saveBookmarks(visitorId: string, dates: string[]): void {
  writeJSON(bookmarksKey(visitorId), dates);
}

export function loadLocalOpened(visitorId: string): string[] {
  const v = readJSON<unknown>(openedKey(visitorId), []);
  return isStringArray(v) ? v : [];
}

export function saveLocalOpened(visitorId: string, dates: string[]): void {
  writeJSON(openedKey(visitorId), dates);
}

export function loadParallax(): boolean {
  const v = readJSON<unknown>(PARALLAX_KEY, true);
  return typeof v === 'boolean' ? v : true;
}

export function saveParallax(value: boolean): void {
  writeJSON(PARALLAX_KEY, value);
}

/** True the first time it is called for this visitor in this browser tab session. */
export function consumeNewSessionFlag(visitorId: string): boolean {
  try {
    if (sessionStorage.getItem(sessionVisitKey(visitorId))) return false;
    sessionStorage.setItem(sessionVisitKey(visitorId), '1');
    return true;
  } catch {
    return true;
  }
}

export function markSessionVisited(visitorId: string): void {
  try {
    sessionStorage.setItem(sessionVisitKey(visitorId), '1');
  } catch {
    // ignore
  }
}

export function buildCopilotUrl(
  prompt: string,
  mode: CopilotTargetMode = 'm365',
  customUrl?: string
): string {
  if (customUrl && customUrl.trim()) {
    return customUrl.trim();
  }
  const encoded = encodeURIComponent(prompt.slice(0, 1800));
  if (mode === 'studio') {
    return 'https://copilotstudio.microsoft.com/';
  }
  if (mode === 'web') {
    return `https://copilot.microsoft.com/?q=${encoded}`;
  }
  return `https://m365.cloud.microsoft/chat?q=${encoded}`;
}
