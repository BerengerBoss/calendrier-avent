import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { AdventTip } from '../types/advent';
import { CATEGORY_META } from '../data/cardStyles';
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

/** Shared palette — one coherent look for every card (cardStyle is not used on the wall). */
const PALETTE = {
  red: '#A8201A',
  redDark: '#7A1712',
  green: '#1F5A43',
  greenDark: '#143D2D',
  cream: '#FBF6EC',
  creamDark: '#D9CFBC',
  gold: '#D9A441',
  ink: '#1C2B24',
  grey: '#55625B',
  greyDark: '#3E4943',
  muted: '#7C8A82',
};

const SERIF = 'Fraunces, Georgia, serif';
const SANS = 'Inter, system-ui, sans-serif';

const TEX_W = 600;
const TEX_H = 656; // same ratio as the card (2.05 x 2.24)

function finishTexture(canvas: HTMLCanvasElement, maxAnisotropy: number): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, maxAnisotropy);
  texture.needsUpdate = true;
  return texture;
}

function drawLock(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = size * 0.14;
  ctx.beginPath();
  ctx.arc(cx, cy - size * 0.18, size * 0.28, Math.PI, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(cx - size * 0.42, cy - size * 0.18, size * 0.84, size * 0.62, size * 0.1);
  ctx.fill();
  ctx.restore();
}

/** Thin gold ribbon cross, no bow — reads as a gift without clutter. */
function drawRibbon(ctx: CanvasRenderingContext2D, w: number, h: number, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = PALETTE.gold;
  const rw = 22;
  const rx = w * 0.74;
  const ry = h * 0.7;
  ctx.fillRect(rx - rw / 2, 0, rw, h);
  ctx.fillRect(0, ry - rw / 2, w, rw);
  ctx.restore();
}

function buildCardFaceTexture(
  tip: AdventTip,
  activeDay: number,
  isOpened: boolean,
  isBookmarked: boolean,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const w = TEX_W;
  const h = TEX_H;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const pad = 44;

  const isLocked = isTipLocked(tip, activeDay);
  const isToday = tip.day === activeDay;
  const weekday = formatWeekdayShortFR(tip.date).replace('.', '');
  const monthLabel = formatShortFR(tip.date).replace(/^\d+\s*/, '');

  ctx.textBaseline = 'alphabetic';

  if (isOpened) {
    // ---- Opened: cream paper, readable title ----
    ctx.fillStyle = PALETTE.cream;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = PALETTE.red;
    ctx.fillRect(0, 0, w, 14);

    ctx.fillStyle = PALETTE.red;
    ctx.font = `700 76px ${SANS}`;
    ctx.textAlign = 'left';
    ctx.fillText(String(tip.day), pad, 118);

    ctx.fillStyle = PALETTE.muted;
    ctx.font = `600 34px ${SANS}`;
    ctx.textAlign = 'right';
    ctx.fillText(isBookmarked ? '★ Ouverte' : '✓ Ouverte', w - pad, 104);

    const cat = CATEGORY_META[tip.category]?.label ?? '';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9A6B12';
    ctx.font = `700 32px ${SANS}`;
    ctx.fillText(cat.toUpperCase(), pad, 196);

    ctx.fillStyle = PALETTE.ink;
    ctx.font = `600 50px ${SERIF}`;
    ctx.textBaseline = 'top';
    drawWrappedText(ctx, tip.title, pad, 222, w - pad * 2, 60, 5);

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = PALETTE.red;
    ctx.font = `700 38px ${SANS}`;
    ctx.fillText('Relire →', pad, h - pad);
    return finishTexture(canvas, maxAnisotropy);
  }

  if (isLocked) {
    // ---- Locked: wrapped in green, date clearly shown ----
    ctx.fillStyle = PALETTE.green;
    ctx.fillRect(0, 0, w, h);
    drawRibbon(ctx, w, h, 0.45);

    ctx.fillStyle = 'rgba(251, 246, 236, 0.92)';
    ctx.font = `600 190px ${SERIF}`;
    ctx.textAlign = 'left';
    ctx.fillText(String(tip.day), pad - 8, 236);

    ctx.font = `600 40px ${SANS}`;
    ctx.fillStyle = 'rgba(251, 246, 236, 0.75)';
    ctx.fillText(`${weekday} · ${monthLabel}`, pad, 300);

    drawLock(ctx, pad + 26, h - pad - 30, 52, 'rgba(251, 246, 236, 0.85)');
    ctx.font = `600 34px ${SANS}`;
    ctx.fillStyle = 'rgba(251, 246, 236, 0.85)';
    const label = tip.day <= activeDay ? 'Bientôt' : tip.lockLabel ?? '';
    ctx.fillText(label, pad + 72, h - pad - 18);
    return finishTexture(canvas, maxAnisotropy);
  }

  // ---- Available, not opened yet: red gift to scratch ----
  ctx.fillStyle = PALETTE.red;
  ctx.fillRect(0, 0, w, h);
  drawRibbon(ctx, w, h);

  if (isToday) {
    ctx.strokeStyle = PALETTE.gold;
    ctx.lineWidth = 18;
    ctx.strokeRect(9, 9, w - 18, h - 18);
  }

  ctx.fillStyle = PALETTE.cream;
  ctx.font = `600 190px ${SERIF}`;
  ctx.textAlign = 'left';
  ctx.fillText(String(tip.day), pad - 8, 236);
  ctx.font = `600 40px ${SANS}`;
  ctx.fillStyle = 'rgba(251, 246, 236, 0.85)';
  ctx.fillText(isToday ? "Aujourd'hui" : `${weekday} · ${monthLabel}`, pad, 300);

  // Call to action
  const ctaText = 'Gratter';
  ctx.font = `700 38px ${SANS}`;
  const cw = ctx.measureText(ctaText).width + 64;
  const ch = 76;
  const cx = pad;
  const cy = h - pad - ch;
  ctx.fillStyle = PALETTE.cream;
  ctx.beginPath();
  ctx.roundRect(cx, cy, cw, ch, ch / 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.red;
  ctx.textBaseline = 'middle';
  ctx.fillText(ctaText, cx + 32, cy + ch / 2 + 2);
  return finishTexture(canvas, maxAnisotropy);
}

/** Grey weekend tile (not openable). */
function buildWeekendTexture(date: string, aspect: number, maxAnisotropy: number) {
  const h = TEX_H;
  const w = Math.round(h * aspect);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = PALETTE.grey;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `600 120px ${SERIF}`;
  ctx.fillText(String(Number(date.slice(8, 10))), w / 2, 200);
  ctx.font = `600 34px ${SANS}`;
  ctx.fillText(formatWeekdayShortFR(date).replace('.', ''), w / 2, 260);
  ctx.font = `600 30px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText('Week-end', w / 2, h - 50);
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
  ctx.fillStyle = PALETTE.grey;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const days = dates.map((d) => `${formatWeekdayShortFR(d).replace('.', '')} ${Number(d.slice(8, 10))}`).join(' – ');
  ctx.font = `600 ${Math.round(h * 0.4)}px ${SANS}`;
  ctx.fillText(`Week-end · ${days}`, w / 2, h / 2 + 2, w - 40);
  return finishTexture(canvas, maxAnisotropy);
}

const edgeColorFor = (locked: boolean, opened: boolean) =>
  opened ? PALETTE.creamDark : locked ? PALETTE.greenDark : PALETTE.redDark;

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
const WEEKEND_W = 0.95;
const BAND_H = 0.55;
/** Empty space around the grid (world units) so hover pop & parallax never get cropped. */
const MARGINS: Record<LayoutMode, { x: number; y: number }> = {
  wide: { x: 0.55, y: 0.5 },
  medium: { x: 0.5, y: 0.45 },
  narrow: { x: 0.35, y: 0.4 },
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
    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 200);
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
      const depth = cell.kind === 'card' ? 0.3 : 0.12;
      const geo = new THREE.BoxGeometry(cell.w, cell.h, depth);
      geometries.push(geo);

      let tex: THREE.CanvasTexture;
      let sideHex = PALETTE.greyDark;
      if (cell.kind === 'card') {
        const tip = tipByDate.get(cell.date)!;
        const isFuture = isTipLocked(tip, activeDay);
        const isOpened = !isFuture && openedDays.includes(tip.day);
        sideHex = edgeColorFor(isFuture, isOpened);
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
    // Parallax expressed as a viewing angle (~2.6° / 1.7°): keeps the 3D feel at any
    // camera distance while the grid edges stay inside the margin
    const PARALLAX_X = 0.045;
    const PARALLAX_Y = 0.03;

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const now = performance.now();
      const tp = sceneStateRef.current.targetParallax;
      const dist = camera.position.z;
      const targetCamX = parallaxRef.current ? tp.x * PARALLAX_X * dist : 0;
      const targetCamY = parallaxRef.current ? -tp.y * PARALLAX_Y * dist : 0;
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
        const targetZ = baseZ + (isHovered && isCard ? (locked ? 0.08 : 0.3) : 0);
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
      const sideHex = edgeColorFor(isFuture, isOpened);
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
    </div>
  );
};
