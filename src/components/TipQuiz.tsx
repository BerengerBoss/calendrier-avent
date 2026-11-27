import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import confetti from 'canvas-confetti';
import { ArrowRight, ChevronLeft, ChevronRight, ExternalLink, Maximize2, RotateCcw, Trophy, X } from 'lucide-react';
import { QuizOption, QuizQuestion, QuizSlide, TipQuiz as TipQuizData } from '../types/advent';

interface TipQuizProps {
  quiz: TipQuizData;
  /** Resets the quiz when it changes (ex: card day). */
  resetKey: string | number;
  /** Kept for API compatibility (the quiz now uses the shared palette). */
  accentHex?: string;
  onTrack?: () => void;
  /** Called on every answer (unlocks the rest of the card, feeds the cumulative score). */
  onAnswer?: (questionIndex: number, optionIndex: number, correct: boolean) => void;
  /** Cumulative score over every quiz answered so far (first answers only). */
  cumulative?: { correct: number; total: number };
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function optionsFor(q: QuizQuestion): QuizOption[] {
  if (q.kind === 'true-false') {
    const answer = q.answer !== false;
    return [
      { label: 'Vrai', correct: answer },
      { label: 'Faux', correct: !answer },
    ];
  }
  return q.options ?? [];
}

const SLIDE_THEME: Record<QuizSlide['theme'], { bg: string; title: string; line: string; bar: string }> = {
  light: { bg: 'bg-white', title: 'text-[#0F172A]', line: 'text-[#475569]', bar: 'bg-[#86BC25]' },
  dark: { bg: 'bg-[#0F172A]', title: 'text-white', line: 'text-[#CBD5E1]', bar: 'bg-[#38BDF8]' },
  green: { bg: 'bg-[#F0FDF4]', title: 'text-[#14532D]', line: 'text-[#3F6212]', bar: 'bg-[#0F172A]' },
};

/** Slide mock whose text scales with its own width (readable in the grid and in the zoom). */
const MiniSlide: React.FC<{ slide: QuizSlide }> = ({ slide }) => {
  const t = SLIDE_THEME[slide.theme] ?? SLIDE_THEME.light;
  return (
    <div
      style={{ containerType: 'inline-size' }}
      className={`relative w-full aspect-video rounded-lg border border-[#1C2B24]/15 overflow-hidden ${t.bg} text-left`}
    >
      <div className={`absolute left-0 top-0 h-full ${t.bar}`} style={{ width: '1.4cqw' }} />
      <div style={{ padding: '5cqw 5cqw 4cqw 6.5cqw' }}>
        <div className={`font-display font-bold leading-[1.15] ${t.title}`} style={{ fontSize: '5.6cqw' }}>
          {slide.title}
        </div>
        <ul style={{ marginTop: '3.2cqw' }} className="space-y-[1.4cqw]">
          {slide.lines.map((l, i) => (
            <li key={i} className={`leading-snug ${t.line}`} style={{ fontSize: '3.9cqw' }}>
              {l}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const OptionVisual: React.FC<{ opt: QuizOption; zoomed?: boolean }> = ({ opt, zoomed }) =>
  opt.slide ? (
    <MiniSlide slide={opt.slide} />
  ) : opt.image ? (
    <img
      src={opt.image}
      alt={opt.label}
      loading="lazy"
      className={`w-full rounded-lg border border-[#1C2B24]/15 bg-white ${
        zoomed ? 'max-h-[78vh] object-contain' : 'aspect-[4/3] object-cover'
      }`}
    />
  ) : null;

export const TipQuiz: React.FC<TipQuizProps> = ({
  quiz,
  resetKey,
  onTrack,
  onAnswer,
  cumulative,
}) => {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null);

  useEffect(() => {
    setIndex(0);
    setPicked(null);
    setScore(0);
    setDone(false);
  }, [resetKey]);

  const total = quiz.questions.length;
  const question = quiz.questions[Math.min(index, total - 1)];
  const options = useMemo(() => optionsFor(question), [question]);
  const hasVisuals = options.some((o) => o.slide || o.image);
  const isTrueFalse = question.kind === 'true-false';
  const answered = picked !== null;
  const pickedCorrect = answered && Boolean(options[picked!]?.correct);

  const handlePick = (i: number) => {
    if (answered) return;
    setPicked(i);
    setZoom(null);
    onAnswer?.(index, i, Boolean(options[i]?.correct));
    if (options[i]?.correct) {
      setScore((s) => s + 1);
      confetti({
        particleCount: 40,
        spread: 55,
        startVelocity: 32,
        origin: { y: 0.65 },
        colors: ['#A8201A', '#1F5A43', '#D9A441', '#FBF6EC'],
      });
    } else {
      setShakeKey((k) => k + 1);
    }
  };

  const handleNext = () => {
    if (index + 1 < total) {
      setIndex(index + 1);
      setPicked(null);
      setZoom(null);
    } else {
      setDone(true);
      if (score === total) {
        confetti({ particleCount: 90, spread: 80, origin: { y: 0.55 }, colors: ['#A8201A', '#1F5A43', '#D9A441', '#FBF6EC'] });
      }
    }
  };

  const restart = () => {
    setIndex(0);
    setPicked(null);
    setScore(0);
    setDone(false);
  };

  // ---- Final screen ----
  if (done) {
    const perfect = score === total;
    const cum = cumulative && cumulative.total > 0 ? cumulative : { correct: score, total };
    return (
      <div className="rounded-2xl border border-[#1C2B24]/15 bg-white p-5 text-center shadow-sm animate-pop-in">
        <div className="text-5xl animate-bounce-in">{perfect ? '🏆' : score > 0 ? '🎉' : '🤓'}</div>
        <div className="text-xs font-semibold uppercase tracking-wider text-[#1C2B24]/55 mt-2">
          Votre score cumulé
        </div>
        <div className="font-display text-3xl font-bold">
          {cum.correct} / {cum.total} bonne{cum.correct > 1 ? 's' : ''} réponse{cum.correct > 1 ? 's' : ''}
        </div>
        <div className="text-sm text-[#1C2B24]/70 mt-0.5">
          Ce quiz : {score} / {total}
        </div>
        <p className="text-sm text-[#1C2B24]/70 mt-2">
          {perfect
            ? 'Sans faute ! Vous êtes officiellement à jour sur l’IA. ✨'
            : score > 0
            ? 'Joli score : vous en savez déjà plus que la moyenne !'
            : 'Pas grave : vous venez d’apprendre quelque chose de nouveau.'}
        </p>
        {quiz.outro && (
          <div className="mt-4 text-left text-sm whitespace-pre-line rounded-xl bg-[#FBF1DC] border border-[#1C2B24]/15 p-3.5">
            {quiz.outro}
          </div>
        )}
        <button
          type="button"
          onClick={restart}
          className="cartoon-btn mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-xs font-bold cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Rejouer
        </button>
        <p className="text-[11px] text-[#1C2B24]/50 mt-2">
          Le score cumulé garde vos premières réponses : rejouer ne le modifie pas.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#1C2B24]/15 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[#1C2B24]/10 bg-[#FBF1DC]"
      >
        <span className="font-display font-bold text-sm flex items-center gap-1.5">
          <Trophy className="w-4 h-4 text-[#9A6B12]" />
          {quiz.title || (isTrueFalse ? 'Vrai ou faux ?' : 'À vous de jouer !')}
        </span>
        {cumulative && cumulative.total > 0 && (
          <span className="ml-auto text-xs font-semibold text-[#1C2B24]/70" title="Score cumulé sur tous les quiz">
            Score : {cumulative.correct}/{cumulative.total}
          </span>
        )}
        {total > 1 && (
          <div className="flex items-center gap-1.5" aria-label={`Question ${index + 1} sur ${total}`}>
            {quiz.questions.map((_, i) => (
              <span
                key={i}
                className={`h-2.5 rounded-full border border-[#1C2B24]/15 transition-all ${
                  i < index ? 'w-2.5 bg-[#1F5A43]' : i === index ? 'w-6 bg-[#0E3B2E]' : 'w-2.5 bg-white'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="p-4 sm:p-5 space-y-4" key={index}>
        <p className="font-display text-lg sm:text-xl font-bold leading-snug animate-slide-up">
          {question.question}
        </p>

        {/* Options */}
        <div
          key={`shake-${shakeKey}`}
          className={`grid gap-2.5 ${shakeKey > 0 && answered && !pickedCorrect ? 'animate-shake' : ''} ${
            isTrueFalse
              ? 'grid-cols-2'
              : hasVisuals
              ? 'grid-cols-1 md:grid-cols-3 gap-4'
              : 'grid-cols-1 sm:grid-cols-2'
          }`}
        >
          {options.map((opt, i) => {
            const isPicked = picked === i;
            const reveal = answered && opt.correct;
            const wrongPick = answered && isPicked && !opt.correct;
            const tfIcon = isTrueFalse ? (opt.label === 'Vrai' ? '👍' : '👎') : null;
            if (opt.slide || opt.image) {
              return (
                <div
                  key={i}
                  style={{ animationDelay: `${i * 60}ms` }}
                  className={`animate-slide-up rounded-xl border p-2.5 transition-all ${
                    reveal
                      ? 'border-[#1F5A43] bg-[#EAF2EC] ring-2 ring-[#1F5A43]'
                      : wrongPick
                      ? 'border-[#A8201A] bg-[#F8E3E1] ring-2 ring-[#A8201A]'
                      : answered
                      ? 'border-[#1C2B24]/10 bg-white opacity-60'
                      : 'border-[#1C2B24]/15 bg-white shadow-sm'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setZoom(i)}
                    title="Agrandir"
                    className="group relative block w-full cursor-zoom-in"
                  >
                    <OptionVisual opt={opt} />
                    <span className="absolute top-2 right-2 p-1.5 rounded-md bg-black/55 text-white opacity-80 group-hover:opacity-100">
                      <Maximize2 className="w-4 h-4" />
                    </span>
                  </button>
                  <div className="flex items-center gap-2 mt-2.5">
                    <span className="shrink-0 w-7 h-7 rounded-md bg-[#0E3B2E] text-white text-sm font-bold flex items-center justify-center">
                      {LETTERS[i] ?? i + 1}
                    </span>
                    <span className="font-semibold text-[15px] truncate">{opt.label}</span>
                    {reveal && <span className="ml-auto text-lg animate-bounce-in">✅</span>}
                    {wrongPick && <span className="ml-auto text-lg animate-bounce-in">❌</span>}
                    {!answered && (
                      <button
                        type="button"
                        onClick={() => handlePick(i)}
                        className="ml-auto px-3.5 py-1.5 rounded-lg bg-[#A8201A] hover:bg-[#8E1B16] text-white text-sm font-semibold cursor-pointer"
                      >
                        Choisir
                      </button>
                    )}
                  </div>
                </div>
              );
            }
            return (
              <button
                key={i}
                type="button"
                disabled={answered}
                onClick={() => handlePick(i)}
                style={{ animationDelay: `${i * 60}ms` }}
                className={`animate-slide-up relative rounded-xl border border-[#1C2B24]/15 text-left transition-all cursor-pointer disabled:cursor-default ${
                  isTrueFalse ? 'py-4 px-3 text-center' : 'p-3'
                } ${
                  reveal
                    ? 'bg-[#EAF2EC] shadow-sm -translate-y-0.5'
                    : wrongPick
                    ? 'bg-[#F8E3E1] shadow-sm'
                    : answered
                    ? 'bg-[#FBF6EC] opacity-60'
                    : 'bg-white shadow-sm hover:-translate-y-0.5 hover:bg-[#EAF2EC]'
                }`}
              >
                {opt.slide && <MiniSlide slide={opt.slide} />}
                {opt.image && (
                  <img
                    src={opt.image}
                    alt={opt.label}
                    loading="lazy"
                    className="w-full aspect-video object-cover rounded-lg border border-[#1C2B24]/15"
                  />
                )}
                <span
                  className={`flex items-center gap-2 font-bold ${
                    isTrueFalse ? 'justify-center text-lg font-display' : 'text-sm'
                  } ${opt.slide || opt.image ? 'mt-2' : ''}`}
                >
                  {tfIcon ? (
                    <span className="text-2xl">{tfIcon}</span>
                  ) : (
                    <span className="shrink-0 w-6 h-6 rounded-md bg-[#0E3B2E] text-white text-[11px] flex items-center justify-center">
                      {LETTERS[i] ?? i + 1}
                    </span>
                  )}
                  <span>{opt.label}</span>
                  {reveal && <span className="ml-auto text-lg animate-bounce-in">✅</span>}
                  {wrongPick && <span className="ml-auto text-lg animate-bounce-in">❌</span>}
                </span>
              </button>
            );
          })}
        </div>

        {/* Zoom on a visual option */}
        {zoom !== null && options[zoom] && createPortal(
          <div
            className="fixed inset-0 z-[90] bg-[#0E3B2E]/90 backdrop-blur-sm flex items-center justify-center p-3 sm:p-8"
            onClick={() => setZoom(null)}
            role="dialog"
            aria-label="Visuel agrandi"
          >
            <div className="w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 mb-3 text-white">
                <span className="font-display text-xl font-semibold">
                  {LETTERS[zoom] ?? zoom + 1}. {options[zoom].label}
                </span>
                <button
                  type="button"
                  onClick={() => setZoom(null)}
                  aria-label="Fermer"
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <OptionVisual opt={options[zoom]} zoomed />
              <div className="flex items-center justify-between gap-3 mt-4">
                <button
                  type="button"
                  disabled={zoom === 0}
                  onClick={() => setZoom(zoom - 1)}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-white/10 text-white text-sm font-semibold hover:bg-white/20 cursor-pointer disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" /> Précédent
                </button>
                {!answered && (
                  <button
                    type="button"
                    onClick={() => handlePick(zoom)}
                    className="px-5 py-2.5 rounded-lg bg-[#A8201A] hover:bg-[#8E1B16] text-white font-semibold cursor-pointer"
                  >
                    Choisir {LETTERS[zoom] ?? zoom + 1}
                  </button>
                )}
                <button
                  type="button"
                  disabled={zoom === options.length - 1}
                  onClick={() => setZoom(zoom + 1)}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-white/10 text-white text-sm font-semibold hover:bg-white/20 cursor-pointer disabled:opacity-30"
                >
                  Suivant <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Feedback */}
        {answered && (
          <div
            className={`rounded-xl border border-[#1C2B24]/15 p-3.5 animate-pop-in ${
              pickedCorrect ? 'bg-[#EAF2EC]' : 'bg-[#FBF1DC]'
            }`}
          >
            <div className="font-display font-bold text-base mb-1">
              {pickedCorrect ? '🎯 Bien vu !' : '😮 Raté… mais bonne nouvelle, maintenant vous savez !'}
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-line text-[#1C2B24]">
              {question.explanation}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              {question.sourceLabel ? (
                question.sourceUrl ? (
                  <a
                    href={question.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => onTrack?.()}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1F5A43] hover:underline"
                  >
                    Source : {question.sourceLabel} <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-[11px] font-semibold text-[#1C2B24]/70">
                    Source : {question.sourceLabel}
                  </span>
                )
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={handleNext}
                className="cartoon-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1F5A43] text-white text-xs font-bold cursor-pointer"
              >
                {index + 1 < total ? 'Question suivante' : 'Voir mon score'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
