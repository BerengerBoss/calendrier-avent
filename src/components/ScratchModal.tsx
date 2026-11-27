import React, { useEffect, useRef, useState, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  X,
  Copy,
  Check,
  Sparkles,
  Star,
  ChevronLeft,
  ChevronRight,
  Wand2,
  ExternalLink,
  Lock,
  Bot,
  BookOpen,
} from 'lucide-react';
import { AdventTip, CopilotTargetMode, TrackedEventType } from '../types/advent';
import { CARD_STYLES, CATEGORY_META, RESOURCE_TYPE_META } from '../data/cardStyles';
import { buildCopilotUrl } from '../utils/storage';
import { formatDayMonthFR, isTipLocked } from '../utils/calendar';
import { TipMedia } from './TipMedia';
import { TipQuiz } from './TipQuiz';

const CONTENT_HEADING: Record<AdventTip['category'], string> = {
  "Cas d'usage": 'Pas à pas',
  'Tip Prompt': 'En pratique',
  'Agent Partagé': 'Comment l’utiliser',
  'News IA': 'Le décryptage',
  Ressource: 'Pourquoi ça vaut le détour',
  Challenge: 'Le défi du jour',
};

interface ScratchModalProps {
  tip: AdventTip;
  activeDay: number;
  isOpened: boolean;
  isBookmarked: boolean;
  onReveal: (day: number) => void;
  onToggleBookmark: (day: number) => void;
  onClose: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  onNavigate: (direction: 'prev' | 'next') => void;
  onNotify?: (msg: string) => void;
  onTrack?: (type: TrackedEventType) => void;
  /** Cumulative quiz score across every card. */
  quizScore?: { correct: number; total: number };
  onQuizAnswer?: (questionIndex: number, optionIndex: number, correct: boolean) => void;
}

export const ScratchModal: React.FC<ScratchModalProps> = ({
  tip,
  activeDay,
  isOpened,
  isBookmarked,
  onReveal,
  onToggleBookmark,
  onClose,
  canGoPrev,
  canGoNext,
  onNavigate,
  onNotify,
  onTrack,
  quizScore,
  onQuizAnswer,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const strokeCountRef = useRef(0);

  const [scratchPercent, setScratchPercent] = useState(0);
  const [justRevealed, setJustRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copilotTarget, setCopilotTarget] = useState<CopilotTargetMode>(
    tip.copilotMode || 'm365'
  );
  const [quizAnswered, setQuizAnswered] = useState(false);
  const hasPrompt = Boolean(tip.promptOrAction && tip.promptOrAction.trim());
  // With a quiz, the explanation text stays hidden until a first answer (no spoilers!)
  const contentUnlocked = !tip.quiz || quizAnswered;

  useEffect(() => {
    setQuizAnswered(false);
  }, [tip.date]);

  const stylePreset = CARD_STYLES[tip.cardStyle] || CARD_STYLES['deloitte-emerald'];
  const catMeta = CATEGORY_META[tip.category];

  // Strict protection: future cases CANNOT be scratched or revealed
  const isFutureLocked = isTipLocked(tip, activeDay);
  const showFullContent = !isFutureLocked && (isOpened || justRevealed);

  useEffect(() => {
    setCopilotTarget(tip.copilotMode || 'm365');
  }, [tip.day, tip.copilotMode]);

  const initFoilCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);

    // Same red gift wrap as the cards on the wall
    ctx.fillStyle = '#A8201A';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#D9A441';
    ctx.fillRect(w * 0.74 - 8, 0, 16, h);
    ctx.fillRect(0, h * 0.7 - 8, w, 16);

    ctx.save();
    const boxW = 250;
    const boxH = 96;
    const bx = (w - boxW) / 2;
    const by = (h - boxH) / 2;
    ctx.fillStyle = '#FBF6EC';
    ctx.beginPath();
    ctx.roundRect(bx, by, boxW, boxH, 14);
    ctx.fill();

    ctx.fillStyle = '#1C2B24';
    ctx.font = '600 28px Fraunces, Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${tip.day} ${new Intl.DateTimeFormat('fr-FR', { month: 'long', timeZone: 'UTC' }).format(new Date(`${tip.date}T00:00:00Z`))}`,
      w / 2,
      by + 44
    );

    ctx.fillStyle = '#A8201A';
    ctx.font = '600 13px Inter, sans-serif';
    ctx.fillText('GRATTEZ POUR DÉCOUVRIR', w / 2, by + 72);
    ctx.restore();
  }, [stylePreset, tip.day, tip.date]);

  useEffect(() => {
    setScratchPercent(0);
    setJustRevealed(false);
    setCopied(false);
    strokeCountRef.current = 0;
    if (!isOpened && !isFutureLocked) {
      const timer = requestAnimationFrame(() => initFoilCanvas());
      return () => cancelAnimationFrame(timer);
    }
  }, [tip.day, isOpened, isFutureLocked, initFoilCanvas]);

  const triggerRevealCelebration = useCallback(() => {
    if (isFutureLocked || justRevealed || isOpened) return;
    setJustRevealed(true);
    setScratchPercent(100);
    onReveal(tip.day);

    confetti({
      particleCount: 55,
      spread: 65,
      origin: { y: 0.55 },
      colors: ['#86BC25', '#0EA5E9', '#FBBF24', '#FB7185'],
    });
  }, [isFutureLocked, justRevealed, isOpened, onReveal, tip.day]);

  const computeScratchPercentage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 0;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0;
    let total = 0;
    for (let i = 3; i < imageData.length; i += 64) {
      total++;
      if (imageData[i] < 128) transparent++;
    }
    const pct = Math.round((transparent / total) * 100);
    setScratchPercent(pct);
    if (pct >= 48) {
      triggerRevealCelebration();
    }
    return pct;
  };

  const getPointerPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const scratchAt = (pos: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 44;

    ctx.beginPath();
    if (lastPosRef.current) {
      ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else {
      ctx.arc(pos.x, pos.y, 22, 0, Math.PI * 2);
      ctx.fill();
    }
    lastPosRef.current = pos;

    strokeCountRef.current += 1;
    if (strokeCountRef.current % 10 === 0) {
      computeScratchPercentage();
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (showFullContent || isFutureLocked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    const pos = getPointerPos(e);
    lastPosRef.current = pos;
    scratchAt(pos);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || showFullContent || isFutureLocked) return;
    scratchAt(getPointerPos(e));
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPosRef.current = null;
    if (!showFullContent && !isFutureLocked) {
      computeScratchPercentage();
    }
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(tip.promptOrAction);
    } catch {
      // ignore clipboard errors
    }
    onTrack?.('copy');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLaunchCopilot = async () => {
    try {
      await navigator.clipboard.writeText(tip.promptOrAction);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore
    }
    onTrack?.('copilot');
    const url = buildCopilotUrl(tip.promptOrAction, copilotTarget, tip.copilotUrl);
    onNotify?.('✨ Prompt copié ! Redirection vers Microsoft Copilot...');
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[#0F172A]/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-pop-in relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl bg-[#FAF9F5] border-[3px] border-[#1C2B24]/15 shadow-sm p-5 sm:p-7"
      >
        {/* Top Modal Header */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center justify-center px-3 py-1 rounded-xl border border-[#1C2B24]/15 font-display text-base font-bold ${stylePreset.bgClass} ${stylePreset.numberColor}`}
            >
              Jour {tip.day}
            </span>
            {!isFutureLocked && (
              <>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border border-[#1C2B24]/15/20 text-xs font-bold ${catMeta.bg} ${catMeta.text}`}
                >
                  {catMeta.icon} {catMeta.label}
                </span>
                <span className="text-xs font-semibold text-[#64748B] bg-white px-2.5 py-1 rounded-lg border border-[#E2E8F0]">
                  {tip.practice}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {showFullContent && (
              <button
                type="button"
                onClick={() => onToggleBookmark(tip.day)}
                title={isBookmarked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                className={`cartoon-btn p-2 rounded-xl cursor-pointer ${
                  isBookmarked ? 'bg-[#FEF3C7]' : 'bg-white'
                }`}
              >
                <Star
                  className={`w-4 h-4 ${
                    isBookmarked
                      ? 'fill-[#F59E0B] text-[#0F172A]'
                      : 'text-[#0F172A]'
                  }`}
                />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="cartoon-btn p-2 rounded-xl bg-white hover:bg-[#FFE4E6] cursor-pointer"
            >
              <X className="w-4 h-4 text-[#0F172A]" />
            </button>
          </div>
        </div>

        {/* HARD GUARD: Future Day */}
        {isFutureLocked ? (
          <div className="py-10 px-4 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[#E2E8F0] border border-[#1C2B24]/15 flex items-center justify-center">
              <Lock className="w-8 h-8 text-[#475569]" />
            </div>
            <h2 className="font-display text-2xl font-bold text-[#0F172A]">
              {tip.placeholder && tip.day <= activeDay
                ? 'Cette case arrive très bientôt'
                : `Case verrouillée jusqu'au ${formatDayMonthFR(tip.date)}`}
            </h2>
            <p className="text-sm text-[#64748B] max-w-md mx-auto">
              Pas de triche ! Il est impossible de gratter les cases futures avant leur date d&apos;ouverture.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="cartoon-btn px-5 py-2.5 rounded-xl bg-[#86BC25] text-xs font-bold cursor-pointer"
            >
              Compris, retour au calendrier
            </button>
          </div>
        ) : !showFullContent ? (
          /* Interactive Scratch-Off Layer */
          <div className="space-y-4">
            <div className="relative w-full h-[280px] sm:h-[310px] rounded-2xl border border-[#1C2B24]/15 shadow-sm overflow-hidden bg-white select-none">
              <div className="absolute inset-0 p-6 flex flex-col items-center justify-center text-center bg-gradient-to-br from-[#FAF9F5] to-[#F0FDF4]">
                <div className="text-5xl mb-3">{tip.emoji}</div>
                <span
                  className={`px-3 py-0.5 rounded-full text-xs font-bold mb-2 ${catMeta.bg} ${catMeta.text}`}
                >
                  {catMeta.icon} {catMeta.label}
                </span>
                <h3 className="font-display text-xl sm:text-2xl font-bold text-[#0F172A] max-w-md">
                  {tip.title}
                </h3>
                <p className="text-sm text-[#475569] mt-2 max-w-md">
                  {tip.summary}
                </p>
              </div>

              <canvas
                ref={canvasRef}
                width={640}
                height={330}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
              />
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-[#1C2B24]/15">
              <div className="flex items-center gap-3 w-full sm:w-auto flex-1">
                <Sparkles className="w-4 h-4 text-[#86BC25] shrink-0" />
                <div className="flex-1">
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span>Grattage</span>
                    <span>{Math.min(100, scratchPercent * 2)}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-[#E2E8F0] rounded-full border border-[#1C2B24]/15 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#86BC25] to-[#0EA5E9] transition-all duration-150"
                      style={{ width: `${Math.min(100, scratchPercent * 2)}%` }}
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={triggerRevealCelebration}
                className="cartoon-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FBBF24] text-[#0F172A] text-xs font-bold cursor-pointer shrink-0"
              >
                <Wand2 className="w-3.5 h-3.5" />
                Tout révéler
              </button>
            </div>
          </div>
        ) : (
          /* Revealed Full Deloitte Change Tip View */
          <div className="space-y-4 animate-pop-in">
            {/* Animated Title Hero */}
            <div
              className="relative overflow-hidden rounded-2xl border border-[#1C2B24]/15 shadow-sm p-5 sm:p-6 animate-hero-shift"
              style={{
                backgroundImage: `linear-gradient(120deg, ${stylePreset.foilColors[0]}, ${stylePreset.foilColors[2]}, ${stylePreset.foilColors[1]}, ${stylePreset.foilColors[0]})`,
              }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -right-4 -bottom-6 text-[110px] sm:text-[130px] opacity-25 rotate-12 select-none"
              >
                {tip.emoji}
              </span>
              <div className="relative flex items-start gap-4">
                <div className="w-16 h-16 shrink-0 rounded-2xl bg-white border border-[#1C2B24]/15 shadow-sm flex items-center justify-center text-4xl animate-float">
                  {tip.emoji}
                </div>
                <div className="min-w-0">
                  {tip.badgeTag && (
                    <span className="inline-block mb-1.5 px-2 py-0.5 rounded-md bg-[#0F172A] text-white text-[10px] font-bold tracking-wider">
                      {tip.badgeTag}
                    </span>
                  )}
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-[#0F172A] leading-tight [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
                    {tip.title}
                  </h2>
                  {tip.summary && (
                    <p className="text-sm font-semibold text-[#0F172A]/80 mt-1.5 bg-white/70 inline-block rounded-lg px-2 py-1">
                      {tip.summary}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Video / image / poster */}
            {tip.media && (
              <TipMedia
                media={tip.media}
                accentHex={stylePreset.accentHex}
                fallbackEmoji={tip.emoji}
                onTrack={() => onTrack?.('resource')}
              />
            )}

            {/* Interactive quiz */}
            {tip.quiz && (
              <TipQuiz
                quiz={tip.quiz}
                resetKey={tip.date}
                accentHex={stylePreset.accentHex}
                onTrack={() => onTrack?.('resource')}
                onAnswer={(qi, oi, ok) => {
                  setQuizAnswered(true);
                  onQuizAnswer?.(qi, oi, ok);
                }}
                cumulative={quizScore}
              />
            )}

            {/* Practical content with paragraphs & bullets */}
            {tip.content.trim() && !contentUnlocked && (
              <div className="rounded-2xl border border-dashed border-[#94A3B8] bg-white/60 p-4 text-center text-sm font-semibold text-[#64748B]">
                🔐 Répondez au quiz pour débloquer le décryptage complet
              </div>
            )}
            {tip.content.trim() && contentUnlocked && (
            <div className="bg-[#F0FDF4] p-4 sm:p-5 rounded-2xl border border-[#1C2B24]/15 space-y-2.5 animate-slide-up">
              <h4 className="font-display font-bold text-xs uppercase tracking-wider text-[#3F6212] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                {CONTENT_HEADING[tip.category] ?? 'En pratique'}
              </h4>
              <div className="space-y-2.5 text-sm sm:text-[15px] leading-relaxed text-[#0F172A]">
                {tip.content.split('\n\n').map((block, bIdx) => {
                  const lines = block.split('\n').filter(Boolean);
                  const hasBullets = lines.some(
                    (l) => l.trim().startsWith('•') || l.trim().startsWith('-')
                  );

                  if (hasBullets) {
                    return (
                      <div key={bIdx} className="space-y-1.5">
                        {lines.map((line, lIdx) => {
                          const trimmed = line.trim();
                          const isBullet =
                            trimmed.startsWith('•') || trimmed.startsWith('-');
                          if (isBullet) {
                            return (
                              <div
                                key={lIdx}
                                className="flex items-start gap-2 pl-1"
                              >
                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#65A30D] shrink-0" />
                                <span>{trimmed.replace(/^[•-]\s*/, '')}</span>
                              </div>
                            );
                          }
                          return (
                            <p key={lIdx} className="font-semibold text-[#1E293B]">
                              {trimmed}
                            </p>
                          );
                        })}
                      </div>
                    );
                  }

                  return (
                    <p key={bIdx} className="whitespace-pre-line">
                      {block}
                    </p>
                  );
                })}
              </div>
            </div>
            )}

            {/* "Le saviez-vous ?" bubble */}
            {tip.funFact && contentUnlocked && (
              <div className="relative flex items-start gap-3 rounded-2xl border border-[#1C2B24]/15 bg-[#FEF9C3] p-4 shadow-sm animate-slide-up">
                <span className="text-3xl animate-float shrink-0">💡</span>
                <div>
                  <div className="font-display font-bold text-xs uppercase tracking-wider text-[#A16207]">
                    Le saviez-vous ?
                  </div>
                  <p className="text-sm text-[#1E293B] mt-0.5 leading-relaxed">{tip.funFact}</p>
                </div>
              </div>
            )}

            {/* Smart Microsoft Copilot Redirection & Copy Box */}
            {hasPrompt && contentUnlocked && (
            <div className="bg-[#0F172A] text-white p-4 sm:p-5 rounded-2xl border border-[#1C2B24]/15 shadow-sm space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#A3E635] flex items-center gap-1.5">
                  <Bot className="w-4 h-4" />
                  {tip.actionLabel}
                </span>

                <div className="flex items-center gap-1.5">
                  {/* Target Switcher */}
                  <select
                    value={copilotTarget}
                    onChange={(e) =>
                      setCopilotTarget(e.target.value as CopilotTargetMode)
                    }
                    aria-label="Destination Copilot"
                    className="px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-[11px] font-semibold text-white focus:outline-none cursor-pointer"
                  >
                    <option value="m365" className="text-[#0F172A]">
                      Copilot M365 (Pro)
                    </option>
                    <option value="web" className="text-[#0F172A]">
                      Copilot Web
                    </option>
                    <option value="studio" className="text-[#0F172A]">
                      Copilot Studio
                    </option>
                  </select>

                  <button
                    type="button"
                    onClick={handleCopyPrompt}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-white/20 text-[11px] font-bold transition-colors cursor-pointer ${
                      copied
                        ? 'bg-[#86BC25] text-[#0F172A]'
                        : 'bg-white/10 hover:bg-white/20 text-white'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="w-3 h-3" /> Copié
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> Copier
                      </>
                    )}
                  </button>
                </div>
              </div>

              <pre className="font-mono text-xs whitespace-pre-wrap text-[#E2E8F0] leading-relaxed bg-black/35 p-3.5 rounded-xl border border-white/10">
                {tip.promptOrAction}
              </pre>

              {/* Smart Redirection CTA */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-[#94A3B8]">
                  Copie le prompt automatiquement et ouvre votre espace Copilot.
                </span>
                <button
                  type="button"
                  onClick={handleLaunchCopilot}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#0EA5E9] to-[#6366F1] hover:brightness-110 text-white text-xs font-bold border border-white/25 shadow-sm transition-all cursor-pointer"
                >
                  <Bot className="w-3.5 h-3.5" />
                  Lancer dans Copilot
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            )}

            {/* External Articles, Guides & Links */}
            {tip.resources && tip.resources.length > 0 && (
              <div className="bg-white p-4 rounded-2xl border border-[#1C2B24]/15 space-y-2.5">
                <h4 className="font-display font-bold text-xs uppercase tracking-wider text-[#475569] flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-[#0EA5E9]" />
                  Pour aller plus loin
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {tip.resources.map((res) => {
                    const meta = RESOURCE_TYPE_META[res.type] || RESOURCE_TYPE_META.article;
                    return (
                      <a
                        key={res.id}
                        href={res.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => onTrack?.('resource')}
                        className="group flex items-center justify-between gap-2 p-2.5 rounded-xl border border-[#CBD5E1] hover:border-[#1C2B24]/15 hover:bg-[#F8FAFC] transition-all"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <span
                            className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold ${meta.badgeClass}`}
                          >
                            {meta.icon} {meta.label}
                          </span>
                          <span className="text-xs font-semibold text-[#0F172A] truncate group-hover:text-[#0EA5E9]">
                            {res.label}
                          </span>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-[#94A3B8] group-hover:text-[#0EA5E9] shrink-0" />
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Bottom Navigation */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                disabled={!canGoPrev}
                onClick={() => onNavigate('prev')}
                className="cartoon-btn inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                Précédent
              </button>

              <button
                type="button"
                onClick={onClose}
                className="cartoon-btn px-5 py-2 rounded-xl bg-[#86BC25] text-[#0F172A] text-xs font-bold cursor-pointer"
              >
                Fermer
              </button>

              <button
                type="button"
                disabled={!canGoNext}
                onClick={() => onNavigate('next')}
                className="cartoon-btn inline-flex items-center gap-1 px-3.5 py-2 rounded-xl bg-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Suivant
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
