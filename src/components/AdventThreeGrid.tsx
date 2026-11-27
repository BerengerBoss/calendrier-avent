import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { AdventTip } from '../types/advent';
import { CARD_STYLES, CATEGORY_META } from '../data/cardStyles';
import { formatShortFR, isTipLocked } from '../utils/calendar';

interface AdventThreeGridProps {
  tips: AdventTip[];
  activeDay: number;
  openedDays: number[];
  bookmarkedDays: number[];
  parallaxEnabled: boolean;
  onSelect: (tip: AdventTip) => void;
  onLockedClick: (tip: AdventTip) => void;
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

  // Base Card Background
  if (isFuture) {
    ctx.fillStyle = '#F1F5F9';
    ctx.fillRect(0, 0, w, h);
  } else if (isOpened) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
  } else {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, stylePreset.foilColors[0]);
    grad.addColorStop(0.55, stylePreset.foilColors[1]);
    grad.addColorStop(1, stylePreset.foilColors[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle geometric paper texture
    ctx.save();
    ctx.globalAlpha = 0.14;
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
      for (let i = -h; i < w + h; i += 72) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 24, 0);
        ctx.lineTo(i - h + 24, h);
        ctx.lineTo(i - h, h);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();

    // Gift ribbon (vertical + horizontal band) with a little bow on top
    ctx.save();
    const ribbonW = 46;
    const ribbonX = w * 0.68;
    const ribbonY = h * 0.78;
    ctx.fillStyle = 'rgba(250, 249, 245, 0.92)';
    ctx.fillRect(ribbonX - ribbonW / 2, 0, ribbonW, h);
    ctx.fillRect(0, ribbonY - ribbonW / 2, w, ribbonW);
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
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

    // Bow loops at the crossing
    ctx.fillStyle = '#FAF9F5';
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

  // Crisp Inner Frame Border
  ctx.strokeStyle = isFuture ? '#CBD5E1' : '#0F172A';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, w - 14, h - 14);

  // Top-left Day Number Badge
  const badgeX = 34;
  const badgeY = 34;
  const badgeSize = 86;
  ctx.save();
  if (!isFuture) {
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.roundRect(badgeX + 5, badgeY + 5, badgeSize, badgeSize, 18);
    ctx.fill();
  }

  if (isFuture) {
    ctx.fillStyle = '#E2E8F0';
  } else if (isOpened) {
    const g2 = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeSize, badgeY + badgeSize);
    g2.addColorStop(0, stylePreset.foilColors[0]);
    g2.addColorStop(1, stylePreset.foilColors[1]);
    ctx.fillStyle = g2;
  } else {
    ctx.fillStyle = '#FAF9F5';
  }

  ctx.strokeStyle = isFuture ? '#CBD5E1' : '#0F172A';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeSize, badgeSize, 18);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = isFuture
    ? '#64748B'
    : isOpened
    ? stylePreset.numberColor === 'text-white'
      ? '#FFFFFF'
      : '#0F172A'
    : '#0F172A';
  ctx.font = '700 44px Fredoka, "Space Grotesk", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(tip.day), badgeX + badgeSize / 2, badgeY + badgeSize / 2 + 2);
  ctx.restore();

  // Top-right Status Pill
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  let pillText = '';
  let pillBg = '#FFFFFF';
  let pillFg = '#0F172A';

  if (isFuture) {
    pillText = `🔒 ${tip.lockLabel ?? `J-${Math.max(1, tip.day - activeDay)}`}`;
    pillBg = '#FFFFFF';
    pillFg = '#64748B';
  } else if (isOpened) {
    pillText = isBookmarked ? '⭐ Ouvert' : '✓ Ouvert';
    pillBg = '#ECFCCB';
    pillFg = '#3F6212';
  } else if (isToday) {
    pillText = '✨ JOUR J';
    pillBg = '#0F172A';
    pillFg = '#A3E635';
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
    ctx.strokeStyle = isFuture ? '#CBD5E1' : '#0F172A';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, 22);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = pillFg;
    ctx.fillText(pillText, px + pw / 2, py + ph / 2 + 1);
  }
  ctx.restore();

  // Center Content
  ctx.save();
  if (isFuture) {
    ctx.textAlign = 'center';
    ctx.font = '64px sans-serif';
    ctx.fillText('🔒', w / 2, h / 2 - 14);
    ctx.fillStyle = '#64748B';
    ctx.font = '700 24px "Space Grotesk", sans-serif';
    ctx.fillText(
      tip.day <= activeDay ? 'Bientôt disponible' : `Disponible le ${formatShortFR(tip.date)}`,
      w / 2,
      h / 2 + 56
    );
  } else if (isOpened) {
    // Category tag
    ctx.font = '700 21px "Space Grotesk", sans-serif';
    const catLabel = `${catMeta.icon} ${catMeta.label}`;
    const cw = ctx.measureText(catLabel).width + 30;
    ctx.fillStyle = '#F1F5F9';
    ctx.beginPath();
    ctx.roundRect(34, 152, cw, 38, 12);
    ctx.fill();
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(catLabel, 49, 171);

    // Title with Emoji
    ctx.fillStyle = '#0F172A';
    ctx.font = '700 31px Fredoka, "Space Grotesk", sans-serif';
    ctx.textBaseline = 'top';
    drawWrappedText(ctx, `${tip.emoji} ${tip.title}`, 34, 214, w - 68, 42, 4);
  } else {
    // Sealed Foil Card Center Call-to-action
    const ctaW = 330;
    const ctaH = 74;
    const cx = (w - ctaW) / 2;
    const cy = h / 2 - 28;

    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.roundRect(cx + 6, cy + 6, ctaW, ctaH, 20);
    ctx.fill();

    ctx.fillStyle = '#FAF9F5';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(cx, cy, ctaW, ctaH, 20);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0F172A';
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
      ctx.fillStyle = '#FAF9F5';
      ctx.fillText(tip.badgeTag, w / 2, by + 19);
    }
  }
  ctx.restore();

  // Footer strip
  ctx.save();
  ctx.textBaseline = 'middle';
  if (isFuture) {
    ctx.fillStyle = '#94A3B8';
    ctx.font = '600 21px "Space Grotesk", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Case verrouillée', 34, h - 46);
  } else if (isOpened) {
    ctx.fillStyle = '#64748B';
    ctx.font = '600 21px "Space Grotesk", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(tip.practice, 34, h - 46);

    ctx.fillStyle = '#0284C7';
    ctx.font = '700 22px "Space Grotesk", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Ouvrir →', w - 34, h - 46);
  } else {
    // Sealed gift: no wrapping-paper name, just a format teaser + emoji
    const formatChip = tip.quiz
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
      ctx.fillStyle = '#FAF9F5';
      ctx.textAlign = 'left';
      ctx.fillText(formatChip, 49, h - 46);
    }
    ctx.font = '40px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(tip.emoji, w - 34, h - 48);
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, maxAnisotropy);
  texture.needsUpdate = true;
  return texture;
}

function getColsForWidth(width: number): number {
  if (width >= 1024) return 6;
  if (width >= 640) return 4;
  return 2;
}

export const AdventThreeGrid: React.FC<AdventThreeGridProps> = ({
  tips,
  activeDay,
  openedDays,
  bookmarkedDays,
  parallaxEnabled,
  onSelect,
  onLockedClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [colsCount, setColsCount] = React.useState<number>(() =>
    typeof window !== 'undefined' ? getColsForWidth(window.innerWidth) : 6
  );

  useEffect(() => {
    const updateCols = () => {
      const w = containerRef.current?.clientWidth || window.innerWidth;
      setColsCount(getColsForWidth(w));
    };
    updateCols();
    window.addEventListener('resize', updateCols);
    return () => window.removeEventListener('resize', updateCols);
  }, []);

  // Refs to keep Three.js event listeners synced with latest props/callbacks
  const callbacksRef = useRef({ onSelect, onLockedClick });
  callbacksRef.current = { onSelect, onLockedClick };

  const activeDayRef = useRef(activeDay);
  activeDayRef.current = activeDay;

  const parallaxRef = useRef(parallaxEnabled);
  parallaxRef.current = parallaxEnabled;

  const tipsRef = useRef(tips);
  tipsRef.current = tips;

  // Store Three.js scene objects for incremental texture updates
  const sceneStateRef = useRef<{
    renderer?: THREE.WebGLRenderer;
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    meshes: Map<number, THREE.Mesh>;
    textures: Map<number, THREE.CanvasTexture>;
    hoveredDay: number | null;
    wiggleEnd: Map<number, number>;
    pointerNDC: { x: number; y: number };
    targetParallax: { x: number; y: number };
    cols: number;
    rows: number;
  }>({
    meshes: new Map(),
    textures: new Map(),
    hoveredDay: null,
    wiggleEnd: new Map(),
    pointerNDC: { x: 99, y: 99 },
    targetParallax: { x: 0, y: 0 },
    cols: 6,
    rows: 4,
  });

  // Compute responsive columns & container height
  const getLayoutMetrics = (width: number, count: number) => {
    const cols = width >= 1024 ? 6 : width >= 640 ? 4 : 2;
    const rows = Math.max(1, Math.ceil(count / cols));
    return { cols, rows };
  };

  // Initialize & rebuild Three.js grid whenever tip count/order or breakpoint columns change
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 1000;
    const cols = colsCount;
    const rows = Math.max(1, Math.ceil(tips.length / cols));
    const desiredHeight = Math.max(360, rows * (cols === 2 ? 235 : cols === 4 ? 220 : 210));
    container.style.height = `${desiredHeight}px`;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, width / desiredHeight, 0.1, 100);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, desiredHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    // Lighting for warm, tactile 3D blocks
    const ambient = new THREE.AmbientLight(0xffffff, 1.55);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.4);
    keyLight.position.set(6, 9, 14);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.65);
    fillLight.position.set(-8, -5, 10);
    scene.add(fillLight);

    const cardW = 2.05;
    const cardH = 2.24;
    const cardDepth = 0.24;
    const gapX = 0.34;
    const gapY = 0.36;

    const totalW = cols * cardW + (cols - 1) * gapX;
    const totalH = rows * cardH + (rows - 1) * gapY;

    // Position camera so the entire grid fits cleanly with comfortable margins
    const fovRad = (camera.fov * Math.PI) / 180;
    const aspect = width / desiredHeight;
    const distForH = (totalH / 2 + 0.7) / Math.tan(fovRad / 2);
    const distForW = (totalW / 2 + 0.7) / (Math.tan(fovRad / 2) * aspect);
    const baseCamZ = Math.max(distForH, distForW);
    camera.position.set(0, 0, baseCamZ);
    camera.lookAt(0, 0, 0);

    const boxGeo = new THREE.BoxGeometry(cardW, cardH, cardDepth);
    const meshes = new Map<number, THREE.Mesh>();
    const textures = new Map<number, THREE.CanvasTexture>();

    tips.forEach((tip, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);

      const x = -totalW / 2 + cardW / 2 + col * (cardW + gapX);
      const y = totalH / 2 - cardH / 2 - row * (cardH + gapY);

      const isFuture = isTipLocked(tip, activeDay);
      const isOpened = !isFuture && openedDays.includes(tip.day);
      const isBookmarked = bookmarkedDays.includes(tip.day);

      const stylePreset = CARD_STYLES[tip.cardStyle] || CARD_STYLES['deloitte-emerald'];
      const sideHex = isFuture ? '#CBD5E1' : isOpened ? '#94A3B8' : stylePreset.edgeColor;

      const sideMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(sideHex),
        roughness: 0.45,
        metalness: 0.08,
      });

      const backMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color('#1E293B'),
        roughness: 0.6,
      });

      const tex = buildCardFaceTexture(tip, activeDay, isOpened, isBookmarked, maxAnisotropy);
      textures.set(tip.day, tex);

      const frontMat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.32,
        metalness: 0.04,
      });

      // BoxGeometry material order: [+x, -x, +y, -y, +z (front), -z (back)]
      const mesh = new THREE.Mesh(boxGeo, [
        sideMat,
        sideMat,
        sideMat,
        sideMat,
        frontMat,
        backMat,
      ]);

      mesh.position.set(x, y, 0);
      mesh.userData = {
        day: tip.day,
        baseX: x,
        baseY: y,
        col,
        row,
      };
      scene.add(mesh);
      meshes.set(tip.day, mesh);
    });

    sceneStateRef.current = {
      ...sceneStateRef.current,
      renderer,
      scene,
      camera,
      meshes,
      textures,
      cols,
      rows,
    };

    const raycaster = new THREE.Raycaster();
    const pointerVec = new THREE.Vector2();
    let downCoords: { x: number; y: number } | null = null;

    const getHitDay = (clientX: number, clientY: number): number | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerVec.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerVec, camera);
      const intersects = raycaster.intersectObjects(Array.from(meshes.values()), false);
      if (intersects.length > 0) {
        return intersects[0].object.userData.day as number;
      }
      return null;
    };

    const handlePointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      sceneStateRef.current.targetParallax = { x: nx, y: ny };

      const hitDay = getHitDay(e.clientX, e.clientY);
      sceneStateRef.current.hoveredDay = hitDay;

      if (hitDay !== null) {
        const hitTip = tipsRef.current.find((t) => t.day === hitDay);
        const isFuture = !hitTip || isTipLocked(hitTip, activeDayRef.current);
        renderer.domElement.style.cursor = isFuture ? 'not-allowed' : 'pointer';
      } else {
        renderer.domElement.style.cursor = 'default';
      }
    };

    const handlePointerLeave = () => {
      sceneStateRef.current.hoveredDay = null;
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

      const hitDay = getHitDay(e.clientX, e.clientY);
      if (hitDay === null) return;

      const tip = tipsRef.current.find((t) => t.day === hitDay);
      if (!tip) return;

      if (isTipLocked(tip, activeDayRef.current)) {
        sceneStateRef.current.wiggleEnd.set(tip.day, performance.now() + 450);
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
      if (!container) return;
      const w = container.clientWidth || 1000;
      const nextMetrics = getLayoutMetrics(w, tipsRef.current.length);
      const nextH = Math.max(
        360,
        nextMetrics.rows * (nextMetrics.cols === 2 ? 235 : nextMetrics.cols === 4 ? 220 : 210)
      );
      container.style.height = `${nextH}px`;
      camera.aspect = w / nextH;
      const nextAspect = w / nextH;
      const dH = (totalH / 2 + 0.7) / Math.tan(fovRad / 2);
      const dW = (totalW / 2 + 0.7) / (Math.tan(fovRad / 2) * nextAspect);
      camera.position.z = Math.max(dH, dW);
      camera.updateProjectionMatrix();
      renderer.setSize(w, nextH);
    };
    window.addEventListener('resize', handleResize);

    // 60fps 3D Animation Loop
    let rafId = 0;
    const camPos = { x: 0, y: 0 };

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const now = performance.now();

      // Smooth 3D camera parallax across the wall of cards
      const targetCamX = parallaxRef.current
        ? sceneStateRef.current.targetParallax.x * 1.45
        : 0;
      const targetCamY = parallaxRef.current
        ? -sceneStateRef.current.targetParallax.y * 1.05
        : 0;

      camPos.x += (targetCamX - camPos.x) * 0.08;
      camPos.y += (targetCamY - camPos.y) * 0.08;
      camera.position.x = camPos.x;
      camera.position.y = camPos.y;
      camera.lookAt(0, 0, 0);

      meshes.forEach((mesh, day) => {
        const isHovered = sceneStateRef.current.hoveredDay === day;
        const meshTip = tipsRef.current.find((t) => t.day === day);
        const isFuture = !meshTip || isTipLocked(meshTip, activeDayRef.current);

        // Subtle idle 3D breathing + pop-forward on hover
        const targetZ = isHovered ? (isFuture ? 0.14 : 0.48) : 0;
        const targetRx = isHovered && !isFuture ? -0.09 : 0;
        const targetRy = isHovered && !isFuture ? 0.11 : 0;

        let targetRz = 0;
        const wiggleUntil = sceneStateRef.current.wiggleEnd.get(day);
        if (wiggleUntil && now < wiggleUntil) {
          targetRz = Math.sin((wiggleUntil - now) * 0.045) * 0.1;
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
      boxGeo.dispose();
      meshes.forEach((m) => {
        if (Array.isArray(m.material)) {
          m.material.forEach((mat) => mat.dispose());
        }
      });
      textures.forEach((t) => t.dispose());
      renderer.dispose();
    };
    // Rebuild geometry layout when visible tip list or responsive column count changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tips.map((t) => t.day).join(','), colsCount]);

  // Incrementally refresh textures & side colors when tips, activeDay, openedDays, or bookmarks change
  useEffect(() => {
    const { renderer, meshes, textures } = sceneStateRef.current;
    if (!renderer || meshes.size === 0) return;
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    tips.forEach((tip) => {
      const mesh = meshes.get(tip.day);
      if (!mesh || !Array.isArray(mesh.material)) return;

      const isFuture = isTipLocked(tip, activeDay);
      const isOpened = !isFuture && openedDays.includes(tip.day);
      const isBookmarked = bookmarkedDays.includes(tip.day);

      const stylePreset = CARD_STYLES[tip.cardStyle] || CARD_STYLES['deloitte-emerald'];
      const sideHex = isFuture ? '#CBD5E1' : isOpened ? '#94A3B8' : stylePreset.edgeColor;

      // Update side materials (0..3)
      for (let i = 0; i < 4; i++) {
        const mat = mesh.material[i] as THREE.MeshStandardMaterial;
        mat.color.set(sideHex);
      }

      // Update front face CanvasTexture (index 4)
      const oldTex = textures.get(tip.day);
      const newTex = buildCardFaceTexture(tip, activeDay, isOpened, isBookmarked, maxAnisotropy);
      const frontMat = mesh.material[4] as THREE.MeshStandardMaterial;
      frontMat.map = newTex;
      frontMat.needsUpdate = true;
      textures.set(tip.day, newTex);
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
