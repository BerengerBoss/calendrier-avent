import React, { useState } from 'react';
import { X, Eye, BarChart3, LayoutGrid, CalendarClock, Settings2, LogOut, Link2 } from 'lucide-react';
import { AdminPreview, CalendarSettings, CardRecord } from '../types/advent';
import { StatsPanel } from './admin/StatsPanel';
import { CardsPanel } from './admin/CardsPanel';
import { PreviewPanel } from './admin/PreviewPanel';
import { SettingsPanel } from './admin/SettingsPanel';
import { SharePanel } from './admin/SharePanel';

interface BackofficeStudioProps {
  settings: CalendarSettings;
  cards: CardRecord[];
  realToday: string;
  preview: AdminPreview | null;
  onChangePreview: (preview: AdminPreview | null) => void;
  onReload: () => Promise<void>;
  onClose: () => void;
  onNotify: (msg: string) => void;
  adminEmail: string | null;
  onSignOut: () => void;
}

type StudioTab = 'stats' | 'cards' | 'preview' | 'share' | 'settings';

const TABS: { id: StudioTab; label: string; icon: React.ReactNode; active: string }[] = [
  { id: 'stats', label: 'Statistiques', icon: <BarChart3 className="w-4 h-4" />, active: 'bg-[#1F5A43] text-white' },
  { id: 'cards', label: 'Cases', icon: <LayoutGrid className="w-4 h-4" />, active: 'bg-[#1F5A43] text-white' },
  { id: 'preview', label: 'Aperçu & date', icon: <CalendarClock className="w-4 h-4" />, active: 'bg-[#1F5A43] text-white' },
  { id: 'share', label: 'Partage', icon: <Link2 className="w-4 h-4" />, active: 'bg-[#1F5A43] text-white' },
  { id: 'settings', label: 'Réglages', icon: <Settings2 className="w-4 h-4" />, active: 'bg-[#1F5A43] text-white' },
];

export const BackofficeStudio: React.FC<BackofficeStudioProps> = ({
  settings,
  cards,
  realToday,
  preview,
  onChangePreview,
  onReload,
  onClose,
  onNotify,
  adminEmail,
  onSignOut,
}) => {
  const [activeTab, setActiveTab] = useState<StudioTab>('stats');
  const [cardsDirty, setCardsDirty] = useState(false);

  const confirmLeaveCards = () =>
    !cardsDirty || window.confirm('Des modifications de case ne sont pas enregistrées. Les abandonner ?');

  const handleClose = () => {
    if (!confirmLeaveCards()) return;
    onClose();
  };

  const switchTab = (tab: StudioTab) => {
    if (tab === activeTab) return;
    if (activeTab === 'cards' && !confirmLeaveCards()) return;
    if (activeTab === 'cards') setCardsDirty(false);
    setActiveTab(tab);
  };

  const handlePreview = (p: AdminPreview) => {
    if (!confirmLeaveCards()) return;
    onChangePreview(p);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-[#0E3B2E]/80 backdrop-blur-sm">
      <div className="animate-pop-in w-full max-w-6xl h-[94vh] rounded-3xl bg-[#FAF9F5] border-[3px] border-[#1C2B24]/15 shadow-sm flex flex-col overflow-hidden">
        <div className="px-5 py-4 bg-[#0E3B2E] text-white flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#A8201A] border border-white/20 flex items-center justify-center text-xl">🛠️</div>
            <div>
              <h2 className="font-display text-xl font-semibold tracking-wide">Studio Admin • Calendrier</h2>
              <p className="text-xs text-[#94A3B8]">
                Connecté{adminEmail ? ` : ${adminEmail}` : ''} • les modifications publiées sont visibles en direct (≤ 1 min).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSignOut}
              title="Se déconnecter"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 text-white border border-white/20 font-bold text-xs hover:bg-white/20 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FAF9F5] text-[#1C2B24] border border-[#1C2B24]/15 font-bold text-xs hover:bg-white transition-colors cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              Retour au calendrier
              <X className="w-4 h-4 ml-1" />
            </button>
          </div>
        </div>

        <div className="px-5 py-3 bg-white border-b-2 border-[#1C2B24]/15 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => switchTab(t.id)}
              className={`cartoon-btn inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold cursor-pointer ${
                activeTab === t.id ? t.active : 'bg-white text-[#1C2B24]'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeTab === 'stats' && (
            <StatsPanel settings={settings} cards={cards} realToday={realToday} onNotify={onNotify} />
          )}
          {activeTab === 'cards' && (
            <CardsPanel
              settings={settings}
              cards={cards}
              realToday={realToday}
              onReload={onReload}
              onNotify={onNotify}
              onPreview={handlePreview}
              onDirtyChange={setCardsDirty}
            />
          )}
          {activeTab === 'preview' && (
            <PreviewPanel
              settings={settings}
              cards={cards}
              realToday={realToday}
              preview={preview}
              onChangePreview={onChangePreview}
              onShowFront={onClose}
            />
          )}
          {activeTab === 'share' && <SharePanel onNotify={onNotify} />}
          {activeTab === 'settings' && (
            <SettingsPanel
              settings={settings}
              cards={cards}
              realToday={realToday}
              adminEmail={adminEmail}
              onReload={onReload}
              onNotify={onNotify}
              onSignOut={onSignOut}
            />
          )}
        </div>
      </div>
    </div>
  );
};
