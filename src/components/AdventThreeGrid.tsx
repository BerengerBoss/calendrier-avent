import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { AdventTip } from '../types/advent';
import { CARD_STYLES, CATEGORY_META } from '../data/cardStyles';
import {
  addDays,
  formatShortFR,
  formatWeekdayShortFR,
  isTipLocked,
  isoWeekday,
} from '../utils/calendar';

interface AdventThreeGridProps {
  tips: AdventTip[];
  activeDay: number;
  openedDays: number[];
  bookmarkedDays: number[];
  parallaxEnabled: boolean;
  /** true: real calendar (Mon→Sun rows, grey weekends). false: compact flow (filtered views). */
  calendarLayout: boolean;
  rangeStart: string;
  rangeEnd: string;
  onSelect: (tip: AdventTip) => void;
  onLockedClick: (tip: AdventTip) => void;
  onWeekendClick: (date: string) => void;
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  const visible = lines.slice(0, maxLines);
  visible.forEach((line, idx) => {
    let out = line;
    if (idx === maxLines - 1 && lines.length > maxLines) {
      out = out.slice(0, Math.max(0, out.length - 1)) + '…';
    }
    ctx.fillText(out, x, y + idx * lineHeight);
  });
}

function drawGiftWrap(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  stylePreset: (typeof CARD_STYLES)[keyof typeof CARD_STYLES]
) {
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, stylePreset.foilColors[0]);
  grad.addColorStop(0.55, stylePreset.foilColors[1]);
  grad.addColorStop(1, stylePreset.foilColors[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Festive wrapping-paper pattern
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#FFFFFF';
  if (stylePreset.foilPattern === 'dots') {
    for (let x = 28; x < w; x += 40) {
      for (let y = 28; y < h; y += 40) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (stylePreset.foilPattern === 'stripes') {
    for (let i = -h; i < w + h; i += 48) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 14, 0);
      ctx.lineTo(i - h + 14, h);
      ctx.lineTo(i - h, h);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    ctx.globalAlpha = 0.32;
    ctx.font = '30px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const glyphs = ['❄', '★', '✦'];
    let k = 0;
    for (let y = 40; y < h; y += 78) {
      for (let x = (y / 78) % 2 ? 30 : 70; x < w; x += 82) {
        ctx.fillText(glyphs[k++ % glyphs.length], x, y);
      }
    }
  }
  ctx.restore();

  // Gift ribbon (vertical + horizontal band) with a bow
  ctx.save();
  const ribbonW = 46;
  const ribbonX = w * 0.68;
  const ribbonY = h * 0.78;
  ctx.fillStyle = '#FDE68A';
  ctx.fillRect(ribbonX - ribbonW / 2, 0, ribbonW, h);
  ctx.fillRect(0, ribbonY - ribbonW / 2, w, ribbonW);
  ctx.strokeStyle = 'rgba(120, 53, 15, 0.45)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(ribbonX - ribbonW / 2, 0);
  ctx.lineTo(ribbonX - ribbonW / 2, h);
  ctx.moveTo(ribbonX + ribbonW / 2, 0);
  ctx.lineTo(ribbonX + ribbonW / 2, h);
  ctx.moveTo(0, ribbonY - ribbonW / 2);
  ctx.lineTo(w, ribbonY - ribbonW / 2);
  ctx.moveTo(0, ribbonY + ribbonW / 2);
  ctx.lineTo(w, ribbonY + ribbonW / 2);
  ctx.stroke();

  ctx.fillStyle = '#FBBF24';
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 4;
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(ribbonX + dir * 34, ribbonY - 6, 34, 20, dir * -0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(ribbonX, ribbonY, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function finishTexture(canvas: HTMLCanvasElement, maxAnisotropy: number): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, maxAnisotropy);
  texture.needsUpdate = true;
  return texture;
}

function buildCardFaceTexture(
  tip: AdventTip,
  activeDay: number,
  isOpened: boolean,
  isBookmarked: boolean,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const w = 512;
  const h = 560;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const stylePreset = CARD_STYLES[tip.cardStyle] || CARD_STYLES['deloitte-emerald'];
  const catMeta = CATEGORY_META[tip.category];
  const isFuture = isTipLocked(tip, activeDay);
  const isToday = tip.day === activeDay;
  const isPastUnopened = tip.day < activeDay && !isOpened;

  // ---- Background ----
  if (isOpened) {
    ctx.fillStyle = '#FFFDF7';
    ctx.fillRect(0, 0, w, h);
    // Candy-cane bottom strip
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, h - 110, w, 110);
    ctx.clip();
    ctx.fillStyle = stylePreset.foilColors[0];
    ctx.fillRect(0, h - 110, w, 110);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = -110; i < w + 110; i += 44) {
      ctx.beginPath();
      ctx.moveTo(i, h);
      ctx.lineTo(i + 18, h);
      ctx.lineTo(i + 128, h - 110);
      ctx.lineTo(i + 110, h - 110);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  } else {
    drawGiftWrap(ctx, w, h, stylePreset);
    if (isFuture) {
      // Still wrapped and colourful, just a light frost veil
      ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.fillRect(0, 0, w, h);
    }
  }

  // Inner frame
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, w - 14, h - 14);

  // ---- Day badge (number + weekday) ----
  const badgeX = 34;
  const badgeY = 34;
  const badgeSize = 96;
  ctx.save();
  ctx.fillStyle = '#0F172A';
  ctx.beginPath();
  ctx.roundRect(badgeX + 5, badgeY + 5, badgeSize, badgeSize, 18);
  ctx.fill();

  if (isOpened) {
    const g2 = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeSize, badgeY + badgeSize);
    g2.addColorStop(0, stylePreset.foilColors[0]);
    g2.addColorStop(1, stylePreset.foilColors[1]);
    ctx.fillStyle = g2;
  } else {
    ctx.fillStyle = '#FFFDF7';
  }
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeSize, badgeSize, 18);
  ctx.fill();
  ctx.stroke();

  const badgeFg =
    isOpened && stylePreset.numberColor === 'text-white' ? '#FFFFFF' : '#0F172A';
  ctx.fillStyle = badgeFg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 46px Fredoka, "Space Grotesk", sans-serif';
  ctx.fillText(String(tip.day), badgeX + badgeSize / 2, badgeY + badgeSize / 2 - 8);
  ctx.font = '700 19px "Space Grotesk", sans-serif';
  ctx.fillStyle = isOpened ? badgeFg : '#B91C1C';
  ctx.fillText(
    formatWeekdayShortFR(tip.date).replace('.', '').toUpperCase(),
    badgeX + badgeSize / 2,
    badgeY + badgeSize - 18
  );
  ctx.restore();

  // ---- Status pill ----
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  let pillText = '';
  let pillBg = '#FFFFFF';
  let pillFg = '#0F172A';

  if (isFuture) {
    pillText = `🔒 ${tip.lockLabel ?? `J-${Math.max(1, tip.day - activeDay)}`}`;
    pillBg = '#FFFFFF';
    pillFg = '#334155';
  } else if (isOpened) {
    pillText = isBookmarked ? '⭐ Ouvert' : '✓ Ouvert';
    pillBg = '#DCFCE7';
    pillFg = '#166534';
  } else if (isToday) {
    pillText = '✨ JOUR J';
    pillBg = '#B91C1C';
    pillFg = '#FFFFFF';
  } else if (isPastUnopened) {
    pillText = 'À gratter';
    pillBg = '#FFF1F2';
    pillFg = '#BE123C';
  }

  if (pillText) {
    ctx.font = '700 22px "Space Grotesk", sans-serif';
    const tw = ctx.measureText(pillText).width;
    const pw = tw + 34;
    const ph = 44;
    const px = w - 34 - pw;
    const py = 46;

    ctx.fillStyle = pillBg;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 22);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = pillFg;
    ctx.fillText(pillText, px + pw / 2, py + ph / 2 + 1);
  }
  ctx.restore();

  // ---- Center ----
  ctx.save();
  if (isFuture) {
    const label = tip.day <= activeDay ? 'Bientôt dispo' : `Le ${formatShortFR(tip.date)}`;
    ctx.font = '700 28px "Space Grotesk", sans-serif';
    const lw = Math.max(250, ctx.measureText(label).width + 60);
    const lh = 116;
    const lx = (w - lw) / 2;
    const ly = h / 2 - 60;
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.roundRect(lx + 6, ly + 6, lw, lh, 22);
    ctx.fill();
    ctx.fillStyle = '#FFFDF7';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(lx, ly, lw, lh, 22);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '40px sans-serif';
    ctx.fillText('🔒', w / 2, ly + 36);
    ctx.fillStyle = '#0F172A';
    ctx.font = '700 28px "Space Grotesk", sans-serif';
    ctx.fillText(label, w / 2, ly + 84);
  } else if (isOpened) {
    ctx.font = '700 21px "Space Grotesk", sans-serif';
    const catLabel = `${catMeta.icon} ${catMeta.label}`;
    const cw = ctx.measureText(catLabel).width + 30;
    ctx.fillStyle = '#FEF3C7';
    ctx.beginPath();
    ctx.roundRect(34, 156, cw, 38, 12);
    ctx.fill();
    ctx.fillStyle = '#92400E';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(catLabel, 49, 175);

    ctx.fillStyle = '#0F172A';
    ctx.font = '700 31px Fredoka, "Space Grotesk", sans-serif';
    ctx.textBaseline = 'top';
    drawWrappedText(ctx, `${tip.emoji} ${tip.title}`, 34, 216, w - 68, 42, 4);
  } else {
    const ctaW = 330;
    const ctaH = 74;
    const cx = (w - ctaW) / 2;
    const cy = h / 2 - 28;

    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.roundRect(cx + 6, cy + 6, ctaW, ctaH, 20);
    ctx.fill();

    ctx.fillStyle = isToday ? '#B91C1C' : '#FFFDF7';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(cx, cy, ctaW, ctaH, 20);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isToday ? '#FFFFFF' : '#0F172A';
    ctx.font = '700 27px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Gratter la case ✨', w / 2, cy + ctaH / 2 + 1);

    if (tip.badgeTag) {
      ctx.font = '700 20px "Space Grotesk", sans-serif';
      const bw = ctx.measureText(tip.badgeTag).width + 32;
      const bx = (w - bw) / 2;
      const by = cy + ctaH + 24;
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, 36, 10);
      ctx.fill();
      ctx.fillStyle = '#FFFDF7';
      ctx.fillText(tip.badgeTag, w / 2, by + 19);
    }
  }
  ctx.restore();

  // ---- Footer ----
  ctx.save();
  ctx.textBaseline = 'middle';
  if (isOpened) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 21px "Space Grotesk", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(tip.practice, 34, h - 52);
    ctx.font = '700 23px "Space Grotesk", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Ouvrir →', w - 34, h - 52);
  } else {
    const formatChip = isFuture
      ? ''
      : tip.quiz
      ? '🎲 Quiz'
      : tip.media && (tip.media.kind === 'youtube' || tip.media.kind === 'embed')
      ? '🎬 Vidéo'
      : tip.media?.kind === 'link'
      ? '📺 À voir'
      : '';
    if (formatChip) {
      ctx.font = '700 22px "Space Grotesk", sans-serif';
      const fw = ctx.measureText(formatChip).width + 30;
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.roundRect(34, h - 68, fw, 42, 12);
      ctx.fill();
      ctx.fillStyle = '#FFFDF7';
      ctx.textAlign = 'left';
      ctx.fillText(formatChip, 49, h - 46);
    }
    ctx.font = '40px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(tip.emoji || '🎁', w - 34, h - 48);
  }
  ctx.restore();

  return finishTexture(canvas, maxAnisotropy);
}

/** Grey weekend tile (not openable). */
function buildWeekendTexture(date: string, aspect: number, maxAnisotropy: number) {
  const h = 560;
  const w = Math.round(h * aspect);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#E2E8F0');
  grad.addColorStop(1, '#CBD5E1');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 18; i++) {
    const x = ((Math.sin(i * 91.7 + w) + 1) / 2) * w;
    const y = ((Math.sin(i * 17.3 + 3) + 1) / 2) * h;
    ctx.beginPath();
    ctx.arc(x, y, 4 + (i % 3) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, w - 12, h - 12);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#64748B';
  ctx.font = '700 30px "Space Grotesk", sans-serif';
  ctx.fillText(formatWeekdayShortFR(date).replace('.', '').toUpperCase(), w / 2, 80);
  ctx.font = '700 84px Fredoka, "Space Grotesk", sans-serif';
  ctx.fillText(String(Number(date.slice(8, 10))), w / 2, 160);
  ctx.font = '64px sans-serif';
  ctx.fillText(isoWeekday(date) === 6 ? '💤' : '☕', w / 2, h / 2 + 40);
  ctx.font = '700 26px "Space Grotesk", sans-serif';
  ctx.fillText('Week-end', w / 2, h - 80);
  return finishTexture(canvas, maxAnisotropy);
}

/** Thin grey band shown between weeks on narrower screens. */
function buildWeekendBandTexture(dates: string[], aspect: number, maxAnisotropy: number) {
  const w = 2048;
  const h = Math.max(96, Math.round(w / aspect));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = Math.max(6, h * 0.06);
  ctx.strokeRect(0, 0, w, h);
  ctx.fillStyle = '#64748B';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const days = dates
    .map((d) => `${formatWeekdayShortFR(d)} ${Number(d.slice(8, 10))}`)
    .join(' & ');
  ctx.font = `700 ${Math.round(h * 0.42)}px "Space Grotesk", sans-serif`;
  ctx.fillText(`💤 Week-end · ${days} — pas de case, l'IA recharge ses batteries 🔋`, w / 2, h / 2 + 2, w - 40);
  return finishTexture(canvas, maxAnisotropy);
}

// ------------------------------------------------------------------
//  Layout
// ------------------------------------------------------------------
type LayoutMode = 'wide' | 'medium' | 'narrow';

interface Cell {
  key: string;
  kind: 'card' | 'weekend' | 'band';
  date: string; // card/weekend date, or Saturday for a band
  dates?: string[]; // band only
  x: number; // centre, world units
  y: number;
  w: number;
  h: number;
}

const CARD_W = 2.05;
const CARD_H = 2.24;
const GAP_X = 0.3;
const GAP_Y = 0.34;
const WEEKEND_W = 1.15;
const BAND_H = 0.55;
/** Empty space around the grid (world units) so hover pop & parallax never get cropped. */
const MARGINS: Record<LayoutMode, { x: number; y: number }> = {
  wide: { x: 1.0, y: 0.8 },
  medium: { x: 0.85, y: 0.7 },
  narrow: { x: 0.45, y: 0.5 },
};

function getMode(width: number): LayoutMode {
  if (width >= 900) return 'wide';
  if (width >= 560) return 'medium';
  return 'narrow';
}

function computeLayout(
  tips: AdventTip[],
  mode: LayoutMode,
  calendarLayout: boolean,
  rangeStart: string,
  rangeEnd: string
): { cells: Cell[]; totalW: number; totalH: number } {
  // Top-left based rectangles first, centred at the end
  const out: (Omit<Cell, 'x' | 'y'> & { left: number; top: number })[] = [];
  let totalW = 0;
  let cursorY = 0;

  if (!calendarLayout) {
    const cols = mode === 'wide' ? 6 : mode === 'medium' ? 4 : 2;
    totalW = cols * CARD_W + (cols - 1) * GAP_X;
    tips.forEach((tip, i) => {
      out.push({
        key: `c:${tip.date}`,
        kind: 'card',
        date: tip.date,
        w: CARD_W,
        h: CARD_H,
        left: (i % cols) * (CARD_W + GAP_X),
        top: Math.floor(i / cols) * (CARD_H + GAP_Y),
      });
    });
    const rows = Math.max(1, Math.ceil(tips.length / cols));
    cursorY = rows * CARD_H + (rows - 1) * GAP_Y;
  } else {
    // Group by ISO week (Monday)
    const weeks = new Map<string, AdventTip[]>();
    for (const t of tips) {
      const monday = addDays(t.date, -(isoWeekday(t.date) - 1));
      const list = weeks.get(monday) ?? [];
      list.push(t);
      weeks.set(monday, list);
    }
    const mondays = Array.from(weeks.keys()).sort();
    const weekendIn = (monday: string) =>
      [addDays(monday, 5), addDays(monday, 6)].filter((d) => d >= rangeStart && d <= rangeEnd);

    const colsW =
      mode === 'wide'
        ? [CARD_W, CARD_W, CARD_W, CARD_W, CARD_W, WEEKEND_W, WEEKEND_W]
        : mode === 'medium'
        ? [CARD_W, CARD_W, CARD_W, CARD_W, CARD_W]
        : [CARD_W, CARD_W];
    const colLeft: number[] = [];
    colsW.reduce((acc, cw, i) => {
      colLeft[i] = acc;
      return acc + cw + GAP_X;
    }, 0);
    totalW = colsW.reduce((a, b) => a + b, 0) + (colsW.length - 1) * GAP_X;

    mondays.forEach((monday, wi) => {
      const weekTips = weeks.get(monday)!;
      const byDate = new Map(weekTips.map((t) => [t.date, t]));
      if (wi > 0) cursorY += GAP_Y;

      if (mode === 'wide') {
        for (let wd = 1; wd <= 7; wd++) {
          const date = addDays(monday, wd - 1);
          if (byDate.has(date)) {
            out.push({ key: `c:${date}`, kind: 'card', date, w: CARD_W, h: CARD_H, left: colLeft[wd - 1], top: cursorY });
          } else if (wd >= 6 && date >= rangeStart && date <= rangeEnd) {
            out.push({ key: `w:${date}`, kind: 'weekend', date, w: WEEKEND_W, h: CARD_H, left: colLeft[wd - 1], top: cursorY });
          }
        }
        cursorY += CARD_H;
      } else {
        if (mode === 'medium') {
          for (const t of weekTips) {
            const wd = isoWeekday(t.date);
            if (wd > 5) continue;
            out.push({ key: `c:${t.date}`, kind: 'card', date: t.date, w: CARD_W, h: CARD_H, left: colLeft[wd - 1], top: cursorY });
          }
          cursorY += CARD_H;
        } else {
          weekTips.forEach((t, i) => {
            out.push({
              key: `c:${t.date}`,
              kind: 'card',
              date: t.date,
              w: CARD_W,
              h: CARD_H,
              left: colLeft[i % 2],
              top: cursorY + Math.floor(i / 2) * (CARD_H + GAP_Y),
            });
          });
          const rows = Math.ceil(weekTips.length / 2);
          cursorY += rows * CARD_H + (rows - 1) * GAP_Y;
        }
        const we = weekendIn(monday);
        if (we.length > 0 && wi < mondays.length - 1) {
          cursorY += GAP_Y;
          out.push({ key: `b:${we[0]}`, kind: 'band', date: we[0], dates: we, w: totalW, h: BAND_H, left: 0, top: cursorY });
          cursorY += BAND_H;
        }
      }
    });
  }

  const totalH = Math.max(CARD_H, cursorY);
  const cells: Cell[] = out.map(({ left, top, ...c }) => ({
    ...c,
    x: -totalW / 2 + left + c.w / 2,
    y: totalH / 2 - top - c.h / 2,
  }));
  return { cells, totalW, totalH };
}

export const AdventThreeGrid: React.FC<AdventThreeGridProps> = ({
  tips,
  activeDay,
  openedDays,
  bookmarkedDays,
  parallaxEnabled,
  calendarLayout,
  rangeStart,
  rangeEnd,
  onSelect,
  onLockedClick,
  onWeekendClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = React.useState<LayoutMode>(() =>
    typeof window !== 'undefined' ? getMode(window.innerWidth) : 'wide'
  );

  useEffect(() => {
    const update = () => {
      const w = containerRef.current?.clientWidth || window.innerWidth;
      setMode(getMode(w));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const callbacksRef = useRef({ onSelect, onLockedClick, onWeekendClick });
  callbacksRef.current = { onSelect, onLockedClick, onWeekendClick };

  const activeDayRef = useRef(activeDay);
  activeDayRef.current = activeDay;

  const parallaxRef = useRef(parallaxEnabled);
  parallaxRef.current = parallaxEnabled;

  const tipsRef = useRef(tips);
  tipsRef.current = tips;

  const sceneStateRef = useRef<{
    renderer?: THREE.WebGLRenderer;
    meshes: Map<string, THREE.Mesh>;
    textures: Map<string, THREE.CanvasTexture>;
    hoveredKey: string | null;
    wiggleEnd: Map<string, number>;
    targetParallax: { x: number; y: number };
  }>({
    meshes: new Map(),
    textures: new Map(),
    hoveredKey: null,
    wiggleEnd: new Map(),
    targetParallax: { x: 0, y: 0 },
  });

  const layoutSignature = `${mode}|${calendarLayout}|${rangeStart}|${rangeEnd}|${tips
    .map((t) => t.date)
    .join(',')}`;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { cells, totalW, totalH } = computeLayout(
      tipsRef.current,
      mode,
      calendarLayout,
      rangeStart,
      rangeEnd
    );
    const margin = MARGINS[mode];
    const worldW = totalW + 2 * margin.x;
    const worldH = totalH + 2 * margin.y;

    const sizeFor = (w: number) => Math.max(260, Math.round((worldH * w) / worldW));
    const width = container.clientWidth || 1000;
    const height = sizeFor(width);
    container.style.height = `${height}px`;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 200);
    const fovRad = (camera.fov * Math.PI) / 180;
    const fitDistance = (aspect: number) =>
      Math.max(worldH / 2 / Math.tan(fovRad / 2), worldW / 2 / (Math.tan(fovRad / 2) * aspect));
    camera.position.set(0, 0, fitDistance(width / height));
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    scene.add(new THREE.AmbientLight(0xffffff, 1.55));
    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.4);
    keyLight.position.set(6, 9, 14);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.65);
    fillLight.position.set(-8, -5, 10);
    scene.add(fillLight);

    const meshes = new Map<string, THREE.Mesh>();
    const textures = new Map<string, THREE.CanvasTexture>();
    const geometries: THREE.BufferGeometry[] = [];
    const tipByDate = new Map(tipsRef.current.map((t) => [t.date, t]));

    for (const cell of cells) {
      const depth = cell.kind === 'card' ? 0.24 : 0.1;
      const geo = new THREE.BoxGeometry(cell.w, cell.h, depth);
      geometries.push(geo);

      let tex: THREE.CanvasTexture;
      let sideHex = '#94A3B8';
      if (cell.kind === 'card') {
        const tip = tipByDate.get(cell.date)!;
        const isFuture = isTipLocked(tip, activeDay);
        const isOpened = !isFuture && openedDays.includes(tip.day);
        const stylePreset = CARD_STYLES[tip.cardStyle] || CARD_STYLES['deloitte-emerald'];
        sideHex = isOpened ? '#B91C1C' : stylePreset.edgeColor;
        tex = buildCardFaceTexture(tip, activeDay, isOpened, bookmarkedDays.includes(tip.day), maxAnisotropy);
      } else if (cell.kind === 'weekend') {
        tex = buildWeekendTexture(cell.date, cell.w / cell.h, maxAnisotropy);
      } else {
        tex = buildWeekendBandTexture(cell.dates ?? [cell.date], cell.w / cell.h, maxAnisotropy);
      }
      textures.set(cell.key, tex);

      const sideMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(sideHex), roughness: 0.45, metalness: 0.08 });
      const backMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1E293B'), roughness: 0.6 });
      const frontMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.32, metalness: 0.04 });
      // BoxGeometry material order: [+x, -x, +y, -y, +z (front), -z (back)]
      const mesh = new THREE.Mesh(geo, [sideMat, sideMat, sideMat, sideMat, frontMat, backMat]);
      mesh.position.set(cell.x, cell.y, cell.kind === 'card' ? 0 : -0.07);
      mesh.userData = { key: cell.key, kind: cell.kind, date: cell.date };
      scene.add(mesh);
      meshes.set(cell.key, mesh);
    }

    sceneStateRef.current = { ...sceneStateRef.current, renderer, meshes, textures };

    const findTip = (date: string) => tipsRef.current.find((t) => t.date === date);

    const raycaster = new THREE.Raycaster();
    const pointerVec = new THREE.Vector2();
    let downCoords: { x: number; y: number } | null = null;

    const getHit = (clientX: number, clientY: number): THREE.Object3D | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerVec.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerVec, camera);
      const hits = raycaster.intersectObjects(Array.from(meshes.values()), false);
      return hits.length > 0 ? hits[0].object : null;
    };

    const handlePointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      sceneStateRef.current.targetParallax = {
        x: ((e.clientX - rect.left) / rect.width - 0.5) * 2,
        y: ((e.clientY - rect.top) / rect.height - 0.5) * 2,
      };
      const hit = getHit(e.clientX, e.clientY);
      sceneStateRef.current.hoveredKey = hit ? (hit.userData.key as string) : null;
      if (!hit) {
        renderer.domElement.style.cursor = 'default';
      } else if (hit.userData.kind !== 'card') {
        renderer.domElement.style.cursor = 'default';
      } else {
        const tip = findTip(hit.userData.date as string);
        renderer.domElement.style.cursor =
          !tip || isTipLocked(tip, activeDayRef.current) ? 'not-allowed' : 'pointer';
      }
    };

    const handlePointerLeave = () => {
      sceneStateRef.current.hoveredKey = null;
      sceneStateRef.current.targetParallax = { x: 0, y: 0 };
      renderer.domElement.style.cursor = 'default';
    };

    const handlePointerDown = (e: PointerEvent) => {
      downCoords = { x: e.clientX, y: e.clientY };
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!downCoords) return;
      const dist = Math.hypot(e.clientX - downCoords.x, e.clientY - downCoords.y);
      downCoords = null;
      if (dist > 14) return;
      const hit = getHit(e.clientX, e.clientY);
      if (!hit) return;
      const key = hit.userData.key as string;
      const date = hit.userData.date as string;
      if (hit.userData.kind !== 'card') {
        sceneStateRef.current.wiggleEnd.set(key, performance.now() + 450);
        callbacksRef.current.onWeekendClick(date);
        return;
      }
      const tip = findTip(date);
      if (!tip) return;
      if (isTipLocked(tip, activeDayRef.current)) {
        sceneStateRef.current.wiggleEnd.set(key, performance.now() + 450);
        callbacksRef.current.onLockedClick(tip);
      } else {
        callbacksRef.current.onSelect(tip);
      }
    };

    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    const handleResize = () => {
      const w = container.clientWidth || 1000;
      const h = sizeFor(w);
      container.style.height = `${h}px`;
      camera.aspect = w / h;
      camera.position.z = fitDistance(w / h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    let rafId = 0;
    const camPos = { x: 0, y: 0 };
    // Parallax amplitude kept well inside MARGIN so edges never get cropped
    const PARALLAX_X = Math.min(0.75, margin.x * 0.7);
    const PARALLAX_Y = Math.min(0.5, margin.y * 0.6);

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const now = performance.now();
      const tp = sceneStateRef.current.targetParallax;
      const targetCamX = parallaxRef.current ? tp.x * PARALLAX_X : 0;
      const targetCamY = parallaxRef.current ? -tp.y * PARALLAX_Y : 0;
      camPos.x += (targetCamX - camPos.x) * 0.08;
      camPos.y += (targetCamY - camPos.y) * 0.08;
      camera.position.x = camPos.x;
      camera.position.y = camPos.y;
      camera.lookAt(0, 0, 0);

      meshes.forEach((mesh, key) => {
        const isCard = mesh.userData.kind === 'card';
        const isHovered = sceneStateRef.current.hoveredKey === key;
        const tip = isCard ? findTip(mesh.userData.date as string) : undefined;
        const locked = !tip || isTipLocked(tip, activeDayRef.current);

        const baseZ = isCard ? 0 : -0.07;
        const targetZ = baseZ + (isHovered && isCard ? (locked ? 0.14 : 0.42) : 0);
        const targetRx = isHovered && isCard && !locked ? -0.08 : 0;
        const targetRy = isHovered && isCard && !locked ? 0.1 : 0;
        let targetRz = 0;
        const wiggleUntil = sceneStateRef.current.wiggleEnd.get(key);
        if (wiggleUntil && now < wiggleUntil) {
          targetRz = Math.sin((wiggleUntil - now) * 0.045) * (isCard ? 0.1 : 0.04);
        }
        mesh.position.z += (targetZ - mesh.position.z) * 0.16;
        mesh.rotation.x += (targetRx - mesh.rotation.x) * 0.14;
        mesh.rotation.y += (targetRy - mesh.rotation.y) * 0.14;
        mesh.rotation.z += (targetRz - mesh.rotation.z) * 0.25;
      });

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      geometries.forEach((g) => g.dispose());
      meshes.forEach((m) => {
        if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
      });
      textures.forEach((t) => t.dispose());
      renderer.dispose();
    };
    // Textures are refreshed by the effect below; rebuild only when the layout changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutSignature]);

  // Incrementally refresh card faces & side colours
  useEffect(() => {
    const { renderer, meshes, textures } = sceneStateRef.current;
    if (!renderer || meshes.size === 0) return;
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    tips.forEach((tip) => {
      const key = `c:${tip.date}`;
      const mesh = meshes.get(key);
      if (!mesh || !Array.isArray(mesh.material)) return;
      const isFuture = isTipLocked(tip, activeDay);
      const isOpened = !isFuture && openedDays.includes(tip.day);
      const stylePreset = CARD_STYLES[tip.cardStyle] || CARD_STYLES['deloitte-emerald'];
      const sideHex = isOpened ? '#B91C1C' : stylePreset.edgeColor;
      for (let i = 0; i < 4; i++) (mesh.material[i] as THREE.MeshStandardMaterial).color.set(sideHex);

      const oldTex = textures.get(key);
      const newTex = buildCardFaceTexture(tip, activeDay, isOpened, bookmarkedDays.includes(tip.day), maxAnisotropy);
      const frontMat = mesh.material[4] as THREE.MeshStandardMaterial;
      frontMat.map = newTex;
      frontMat.needsUpdate = true;
      textures.set(key, newTex);
      oldTex?.dispose();
    });
  }, [tips, activeDay, openedDays, bookmarkedDays]);

  return (
    <div className="relative w-full">
      <div
        ref={containerRef}
        className="w-full relative select-none touch-manipulation"
        aria-label="Grille 3D interactive des cases du calendrier de l'Avent"
      />
      <SnowLayer />
    </div>
  );
};

/** Decorative snowfall above the grid (no pointer events, hidden with reduced motion). */
const SNOWFLAKES = Array.from({ length: 22 }, (_, i) => {
  // deterministic pseudo-random so it doesn't change on re-render
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return {
    left: `${Math.round(r(1) * 100)}%`,
    size: 10 + Math.round(r(2) * 12),
    duration: 9 + r(3) * 9,
    delay: -r(4) * 18,
    drift: `${Math.round((r(5) - 0.5) * 80)}px`,
    opacity: 0.45 + r(6) * 0.45,
    glyph: r(7) > 0.5 ? '❄' : '•',
  };
});

const SnowLayer: React.FC = () => (
  <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
    {SNOWFLAKES.map((f, i) => (
      <span
        key={i}
        className="snowflake"
        style={
          {
            left: f.left,
            fontSize: f.size,
            opacity: f.opacity,
            animationDuration: `${f.duration}s`,
            animationDelay: `${f.delay}s`,
            '--drift': f.drift,
          } as React.CSSProperties
        }
      >
        {f.glyph}
      </span>
    ))}
  </div>
);
