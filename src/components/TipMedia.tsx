import React, { useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import { TipMedia as TipMediaData } from '../types/advent';

/** Extracts a YouTube video id from any common URL shape (or returns the id itself). */
export function getYouTubeId(input: string): string | null {
  const value = input.trim();
  if (/^[\w-]{11}$/.test(value)) return value;
  try {
    const u = new URL(value);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1, 12) || null;
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      const v = u.searchParams.get('v');
      if (v) return v.slice(0, 11);
      const m = u.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/);
      if (m) return m[1];
    }
  } catch {
    // not a URL
  }
  return null;
}

function getYouTubeStart(input: string): number {
  try {
    const u = new URL(input.trim());
    const t = u.searchParams.get('t') || u.searchParams.get('start');
    if (!t) return 0;
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
    if (!m) return 0;
    return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  } catch {
    return 0;
  }
}

const isSafeHttpUrl = (url: string) => /^https:\/\//i.test(url.trim());

interface TipMediaProps {
  media: TipMediaData;
  accentHex: string;
  fallbackEmoji: string;
  onTrack?: () => void;
}

export const TipMedia: React.FC<TipMediaProps> = ({ media, accentHex, fallbackEmoji, onTrack }) => {
  const [playing, setPlaying] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

  const frame =
    'relative w-full overflow-hidden rounded-2xl border border-[#1C2B24]/15 shadow-sm bg-[#0E3B2E]';

  const caption = (media.title || media.caption) && (
    <div className="flex flex-wrap items-baseline justify-between gap-2 px-1 pt-2">
      {media.title && (
        <span className="font-display text-sm font-bold text-[#1C2B24]">{media.title}</span>
      )}
      {media.caption && (
        <span className="text-[11px] font-semibold text-[#1C2B24]/70">{media.caption}</span>
      )}
    </div>
  );

  // ---- YouTube: click-to-play facade (no third-party load until the user asks) ----
  if (media.kind === 'youtube') {
    const id = getYouTubeId(media.url);
    if (!id) return null;
    const start = getYouTubeStart(media.url);
    const src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1${
      start ? `&start=${start}` : ''
    }`;
    return (
      <figure className="animate-pop-in">
        <div className={`${frame} aspect-video`}>
          {playing ? (
            <iframe
              src={src}
              title={media.title || 'Vidéo YouTube'}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setPlaying(true);
                onTrack?.();
              }}
              className="group absolute inset-0 w-full h-full cursor-pointer"
              aria-label={`Lire la vidéo${media.title ? ` : ${media.title}` : ''}`}
            >
              {!thumbFailed ? (
                <img
                  src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
                  alt=""
                  loading="lazy"
                  onError={() => setThumbFailed(true)}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div
                  className="absolute inset-0 flex items-center justify-center text-7xl"
                  style={{ background: `linear-gradient(135deg, ${accentHex}, #0E3B2E)` }}
                >
                  {fallbackEmoji}
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#1C2B24]/80 via-transparent to-transparent" />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="relative flex items-center justify-center">
                  <span className="absolute w-20 h-20 rounded-full bg-[#A8201A]/50 animate-ping-slow" />
                  <span className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#A8201A] border-[3px] border-white shadow-lg flex items-center justify-center transition-transform group-hover:scale-110">
                    <Play className="w-7 h-7 sm:w-8 sm:h-8 text-white fill-white ml-1" />
                  </span>
                </span>
              </span>
              <span className="absolute left-3 bottom-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white text-[#1C2B24] text-[11px] font-bold border border-[#1C2B24]/15">
                ▶ Lire ici, sans quitter le calendrier
              </span>
            </button>
          )}
        </div>
        {caption}
      </figure>
    );
  }

  // ---- Generic embeddable iframe (TED, Vimeo, …) ----
  if (media.kind === 'embed') {
    if (!isSafeHttpUrl(media.url)) return null;
    return (
      <figure className="animate-pop-in">
        <div className={`${frame} aspect-video`}>
          {playing ? (
            <iframe
              src={media.url}
              title={media.title || 'Vidéo'}
              className="absolute inset-0 w-full h-full"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setPlaying(true);
                onTrack?.();
              }}
              className="group absolute inset-0 w-full h-full cursor-pointer flex flex-col items-center justify-center gap-3 text-white"
              style={{ background: `radial-gradient(circle at 30% 20%, ${accentHex}, #0E3B2E 70%)` }}
            >
              <span className="text-6xl animate-float">{fallbackEmoji}</span>
              <span className="relative w-16 h-16 rounded-full bg-white/95 border-[3px] border-[#1C2B24]/15 flex items-center justify-center transition-transform group-hover:scale-110">
                <Play className="w-7 h-7 text-[#1C2B24] fill-[#1C2B24] ml-1" />
              </span>
              <span className="text-xs font-bold tracking-wide uppercase opacity-90">
                Lancer la vidéo
              </span>
            </button>
          )}
        </div>
        {caption}
      </figure>
    );
  }

  // ---- Image ----
  if (media.kind === 'image') {
    if (!isSafeHttpUrl(media.url)) return null;
    return (
      <figure className="animate-pop-in">
        <div className={`${frame} bg-white`}>
          <img
            src={media.url}
            alt={media.title || ''}
            loading="lazy"
            className="w-full max-h-[340px] object-cover"
          />
        </div>
        {caption}
      </figure>
    );
  }

  // ---- Link "poster" (replays that cannot be embedded) ----
  if (!isSafeHttpUrl(media.url)) return null;
  return (
    <a
      href={media.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onTrack?.()}
      className="group block animate-pop-in"
    >
      <div
        className={`${frame} p-5 sm:p-6 flex items-center gap-4 sm:gap-5 transition-transform group-hover:-translate-y-0.5`}
        style={{ background: `linear-gradient(120deg, #0E3B2E 0%, #14523C 55%, ${accentHex} 140%)` }}
      >
        <span className="shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white/10 border border-white/30 flex items-center justify-center text-4xl sm:text-5xl animate-float">
          {fallbackEmoji}
        </span>
        <div className="min-w-0 flex-1 text-white">
          {media.caption && (
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#D9A441] mb-1">
              {media.caption}
            </div>
          )}
          <div className="font-display text-lg sm:text-xl font-bold leading-tight">
            {media.title || 'Voir le contenu'}
          </div>
          <span className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-[#1C2B24] text-xs font-bold border border-[#1C2B24]/15 group-hover:bg-[#D9A441] transition-colors">
            {media.ctaLabel || 'Regarder'}
            <ExternalLink className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </a>
  );
};
