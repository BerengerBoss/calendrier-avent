import React, { useState } from 'react';
import { X, Star, Lock, Sparkles, Search, CheckCircle2 } from 'lucide-react';
import { AdventTip, TipCategory } from '../types/advent';
import { CATEGORY_META } from '../data/cardStyles';
import { formatDayMonthFR, isTipLocked } from '../utils/calendar';

interface PastTipsDrawerProps {
  tips: AdventTip[];
  activeDay: number;
  openedDays: number[];
  bookmarkedDays: number[];
  onSelectTip: (tip: AdventTip) => void;
  onClose: () => void;
}

export const PastTipsDrawer: React.FC<PastTipsDrawerProps> = ({
  tips,
  activeDay,
  openedDays,
  bookmarkedDays,
  onSelectTip,
  onClose,
}) => {
  const [filterCat, setFilterCat] = useState<'ALL' | 'BOOKMARKS' | TipCategory>('ALL');
  const [search, setSearch] = useState('');

  const availableTips = tips.filter((t) => !isTipLocked(t, activeDay));
  const availableDays = new Set(availableTips.map((t) => t.day));
  const unopenedPast = availableTips.filter((t) => !openedDays.includes(t.day));

  const filtered = availableTips.filter((t) => {
    const isOpened = openedDays.includes(t.day);
    if (filterCat === 'BOOKMARKS') {
      if (!bookmarkedDays.includes(t.day)) return false;
    } else if (filterCat !== 'ALL') {
      if (t.category !== filterCat) return false;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      // Only match text of opened tips so we don't spoil unopened ones!
      if (!isOpened) return `jour ${t.day}`.includes(q);
      return (
        t.title.toLowerCase().includes(q) ||
        t.summary.toLowerCase().includes(q) ||
        t.practice.toLowerCase().includes(q) ||
        `jour ${t.day}`.includes(q)
      );
    }
    return true;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#0F172A]/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg h-full bg-[#FFFDF7] border-l-[3.5px] border-[#1E293B] shadow-[-8px_0px_0px_#1E293B] flex flex-col animate-pop-in"
      >
        {/* Header */}
        <div className="p-5 border-b-[3px] border-[#1E293B] bg-[#F8FAFC] flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#1E293B] flex items-center gap-2">
              📚 Tips Passés &amp; Favoris
            </h2>
            <p className="text-xs font-semibold text-[#64748B] mt-0.5">
              {openedDays.filter((d) => availableDays.has(d)).length} débloqués sur {availableTips.length} jours disponibles
              {unopenedPast.length > 0 && (
                <span className="text-[#E11D48] ml-1">
                  • {unopenedPast.length} encore à gratter !
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cartoon-btn p-2 rounded-xl bg-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Category Filters */}
        <div className="p-4 border-b-2 border-[#E2E8F0] space-y-3 bg-white">
          <div className="relative">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un tip débloqué, un agent, une équipe..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-[#1E293B] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#86BC25]"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(['ALL', 'BOOKMARKS', ...(Object.keys(CATEGORY_META) as TipCategory[])] as const).map(
              (cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilterCat(cat)}
                  className={`px-2.5 py-1 rounded-lg border border-[#1E293B] text-xs font-bold cursor-pointer transition-colors ${
                    filterCat === cat
                      ? 'bg-[#1E293B] text-white'
                      : 'bg-[#F8FAFC] text-[#1E293B] hover:bg-[#E2E8F0]'
                  }`}
                >
                  {cat === 'ALL'
                    ? 'Tous'
                    : cat === 'BOOKMARKS'
                    ? `⭐ Favoris (${bookmarkedDays.filter((d) => availableDays.has(d)).length})`
                    : `${CATEGORY_META[cat].icon} ${CATEGORY_META[cat].label}`}
                </button>
              )
            )}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="text-4xl mb-2">🤖</div>
              <p className="font-display font-bold text-lg text-[#1E293B]">
                Aucun tip trouvé
              </p>
              <p className="text-sm text-[#64748B] mt-1">
                Grattez des cases du calendrier pour débloquer plus de tips !
              </p>
            </div>
          ) : (
            filtered.map((tip) => {
              const isOpened = openedDays.includes(tip.day);
              const isBookmarked = bookmarkedDays.includes(tip.day);
              const catMeta = CATEGORY_META[tip.category];

              return (
                <button
                  key={tip.day}
                  type="button"
                  onClick={() => {
                    onClose();
                    onSelectTip(tip);
                  }}
                  className={`w-full text-left p-3.5 rounded-2xl border border-[#1E293B] shadow-sm hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-sm transition-all cursor-pointer flex items-start gap-3 ${
                    isOpened ? 'bg-white' : 'bg-[#FFF1F2]'
                  }`}
                >
                  <div
                    className={`w-11 h-11 shrink-0 rounded-xl border border-[#1E293B] flex items-center justify-center font-display font-bold text-lg ${
                      isOpened ? 'bg-[#86BC25] text-white' : 'bg-[#FFE4E6] text-[#E11D48]'
                    }`}
                  >
                    {tip.day}
                  </div>

                  {isOpened ? (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[#1E293B] text-[10px] font-bold ${catMeta.bg} ${catMeta.text}`}
                        >
                          {catMeta.icon} {catMeta.label}
                        </span>
                        <div className="flex items-center gap-1">
                          {isBookmarked && (
                            <Star className="w-3.5 h-3.5 fill-[#F59E0B] text-[#1E293B]" />
                          )}
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#65A30D]" />
                        </div>
                      </div>
                      <h4 className="font-display font-bold text-sm text-[#1E293B] mt-1 truncate">
                        {tip.emoji} {tip.title}
                      </h4>
                      <p className="text-xs text-[#64748B] line-clamp-1 mt-0.5">
                        {tip.summary}
                      </p>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#E11D48]">
                          <Lock className="w-3 h-3" />
                          NON GRATTÉ
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#00A3E0]">
                          <Sparkles className="w-3 h-3" />
                          Gratter maintenant →
                        </span>
                      </div>
                      <p className="font-display font-bold text-sm text-[#1E293B] mt-1">
                        Case du {formatDayMonthFR(tip.date)} encore fermée
                      </p>
                      <p className="text-xs text-[#64748B]">
                        Cliquez pour gratter et découvrir le tip caché !
                      </p>
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
