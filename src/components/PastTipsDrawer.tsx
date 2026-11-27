import React, { useState } from 'react';
import { X, Star, Search, Check, ArrowRight } from 'lucide-react';
import { AdventTip, TipCategory } from '../types/advent';
import { CATEGORY_META } from '../data/cardStyles';
import { formatDayMonthFR, formatWeekdayShortFR, isTipLocked } from '../utils/calendar';

interface PastTipsDrawerProps {
  tips: AdventTip[];
  activeDay: number;
  openedDays: number[];
  bookmarkedDays: number[];
  onSelectTip: (tip: AdventTip) => void;
  onClose: () => void;
}

type Filter = 'ALL' | 'TODO' | 'BOOKMARKS' | TipCategory;

export const PastTipsDrawer: React.FC<PastTipsDrawerProps> = ({
  tips,
  activeDay,
  openedDays,
  bookmarkedDays,
  onSelectTip,
  onClose,
}) => {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');

  const availableTips = tips.filter((t) => !isTipLocked(t, activeDay));
  const openedCount = availableTips.filter((t) => openedDays.includes(t.day)).length;
  const todoCount = availableTips.length - openedCount;
  const favCount = availableTips.filter((t) => bookmarkedDays.includes(t.day)).length;
  const usedCategories = Array.from(
    new Set(availableTips.filter((t) => openedDays.includes(t.day)).map((t) => t.category))
  );
  const progress = availableTips.length ? Math.round((openedCount / availableTips.length) * 100) : 0;

  const filtered = availableTips.filter((t) => {
    const isOpened = openedDays.includes(t.day);
    if (filter === 'TODO' && isOpened) return false;
    if (filter === 'BOOKMARKS' && !bookmarkedDays.includes(t.day)) return false;
    if (filter !== 'ALL' && filter !== 'TODO' && filter !== 'BOOKMARKS' && t.category !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      // Only search the text of opened cards, so nothing gets spoiled
      if (!isOpened) return `${t.day}`.includes(q);
      return (
        t.title.toLowerCase().includes(q) ||
        t.summary.toLowerCase().includes(q) ||
        t.practice.toLowerCase().includes(q) ||
        `${t.day}`.includes(q)
      );
    }
    return true;
  });

  const chip = (id: Filter, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setFilter(id)}
      className={`px-3 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-colors ${
        filter === id
          ? 'bg-[#1F5A43] text-white'
          : 'bg-white text-[#1C2B24]/75 border border-[#1C2B24]/15 hover:border-[#1F5A43] hover:text-[#1F5A43]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#0E3B2E]/70 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl h-full bg-[#FBF6EC] shadow-2xl flex flex-col animate-slide-up"
      >
        {/* Header */}
        <div className="bg-[#0E3B2E] text-white px-6 pt-6 pb-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Mon calendrier</p>
              <h2 className="font-display text-3xl font-semibold mt-1">Cases ouvertes</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-5 flex items-end justify-between gap-4">
            <p className="text-[15px] text-white/85">
              <strong className="text-white text-xl">{openedCount}</strong> ouverte{openedCount > 1 ? 's' : ''} sur{' '}
              {availableTips.length} disponible{availableTips.length > 1 ? 's' : ''}
              {todoCount > 0 && (
                <span className="text-[#F2C96B]"> | {todoCount} à gratter</span>
              )}
            </p>
            <span className="text-sm text-white/60">{progress} %</span>
          </div>
          <div className="mt-2 h-2 rounded-full bg-white/15 overflow-hidden">
            <div className="h-full rounded-full bg-[#D9A441] transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Search & filters */}
        <div className="px-6 py-4 space-y-3 border-b border-[#1C2B24]/10">
          <div className="relative">
            <Search className="w-4 h-4 text-[#1C2B24]/50 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher dans les cases ouvertes…"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white border border-[#1C2B24]/15 text-[15px] focus:outline-none focus:border-[#1F5A43] focus:ring-2 focus:ring-[#1F5A43]/20"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {chip('ALL', `Toutes (${availableTips.length})`)}
            {todoCount > 0 && chip('TODO', `À gratter (${todoCount})`)}
            {favCount > 0 && chip('BOOKMARKS', `Favoris (${favCount})`)}
            {usedCategories.map((c) => chip(c, CATEGORY_META[c].label))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2.5">
          {filtered.length === 0 ? (
            <div className="text-center py-16 px-4">
              <p className="font-display text-xl font-semibold text-[#1C2B24]">Rien à afficher</p>
              <p className="text-[15px] text-[#1C2B24]/65 mt-1">
                {availableTips.length === 0
                  ? 'Aucune case n’est encore disponible : revenez le premier jour du calendrier.'
                  : 'Grattez des cases du calendrier pour les retrouver ici.'}
              </p>
            </div>
          ) : (
            filtered.map((tip) => {
              const isOpened = openedDays.includes(tip.day);
              const isBookmarked = bookmarkedDays.includes(tip.day);
              const catMeta = CATEGORY_META[tip.category];
              return (
                <button
                  key={tip.date}
                  type="button"
                  onClick={() => {
                    onClose();
                    onSelectTip(tip);
                  }}
                  className="group w-full text-left rounded-xl bg-white border border-[#1C2B24]/10 hover:border-[#1F5A43]/40 hover:shadow-md transition-all cursor-pointer flex items-stretch overflow-hidden"
                >
                  <div
                    className={`w-16 shrink-0 flex flex-col items-center justify-center py-3 ${
                      isOpened ? 'bg-[#1F5A43] text-white' : 'bg-[#A8201A] text-white'
                    }`}
                  >
                    <span className="font-display text-2xl font-semibold leading-none">{tip.day}</span>
                    <span className="text-[11px] uppercase tracking-wide opacity-80 mt-1">
                      {formatWeekdayShortFR(tip.date).replace('.', '')}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0 px-4 py-3">
                    {isOpened ? (
                      <>
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#9A6B12]">
                          {catMeta.label}
                          {isBookmarked && <Star className="w-3.5 h-3.5 fill-[#D9A441] text-[#D9A441]" />}
                          <Check className="w-3.5 h-3.5 text-[#1F5A43] ml-auto" />
                        </div>
                        <h4 className="font-display text-[17px] font-semibold text-[#1C2B24] mt-1 leading-snug line-clamp-2">
                          {tip.title}
                        </h4>
                        {tip.summary && (
                          <p className="text-sm text-[#1C2B24]/65 mt-0.5 line-clamp-1">{tip.summary}</p>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="text-xs font-semibold uppercase tracking-wide text-[#A8201A]">
                          Pas encore grattée
                        </div>
                        <p className="font-display text-[17px] font-semibold text-[#1C2B24] mt-1 capitalize">
                          {formatDayMonthFR(tip.date)}
                        </p>
                        <p className="text-sm text-[#A8201A] mt-0.5 inline-flex items-center gap-1">
                          Gratter maintenant <ArrowRight className="w-3.5 h-3.5" />
                        </p>
                      </>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
