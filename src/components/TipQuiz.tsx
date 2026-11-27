import React, { useEffect, useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import { ArrowRight, ExternalLink, RotateCcw, Trophy } from 'lucide-react';
import { QuizOption, QuizQuestion, QuizSlide, TipQuiz as TipQuizData } from '../types/advent';

interface TipQuizProps {
  quiz: TipQuizData;
  /** Resets the quiz when it changes (ex: card day). */
  resetKey: string | number;
  accentHex: string;
  onTrack?: () => void;
  /** Called on every answer (used to unlock the rest of the card). */
  onAnswer?: () => void;
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

const MiniSlide: React.FC<{ slide: QuizSlide }> = ({ slide }) => {
  const t = SLIDE_THEME[slide.theme] ?? SLIDE_THEME.light;
  return (
    <div
      className={`relative w-full aspect-video rounded-lg border border-[#1C2B24]/15 overflow-hidden ${t.bg} p-2.5 sm:p-3 text-left`}
    >
      <div className={`absolute left-0 top-0 h-full w-1.5 ${t.bar}`} />
      <div className={`font-display font-bold text-[11px] sm:text-[13px] leading-tight ${t.title} pl-1.5`}>
        {slide.title}
      </div>
      <ul className="mt-1.5 space-y-0.5 pl-1.5">
        {slide.lines.map((l, i) => (
          <li key={i} className={`text-[9px] sm:text-[10.5px] leading-snug ${t.line}`}>
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
};

export const TipQuiz: React.FC<TipQuizProps> = ({
  quiz,
  resetKey,
  accentHex,
  onTrack,
  onAnswer,
}) => {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

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
    onAnswer?.();
    if (options[i]?.correct) {
      setScore((s) => s + 1);
      confetti({
        particleCount: 40,
        spread: 55,
        startVelocity: 32,
        origin: { y: 0.65 },
        colors: ['#86BC25', '#A3E635', '#FBBF24', '#0EA5E9'],
      });
    } else {
      setShakeKey((k) => k + 1);
    }
  };

  const handleNext = () => {
    if (index + 1 < total) {
      setIndex(index + 1);
      setPicked(null);
    } else {
      setDone(true);
      if (score === total) {
        confetti({ particleCount: 90, spread: 80, origin: { y: 0.55 } });
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
    return (
      <div className="rounded-2xl border border-[#1C2B24]/15 bg-white p-5 text-center shadow-sm animate-pop-in">
        <div className="text-5xl animate-bounce-in">{perfect ? '🏆' : score > 0 ? '🎉' : '🤓'}</div>
        <div className="font-display text-2xl font-bold mt-2">
          {score} / {total} bonne{score > 1 ? 's' : ''} réponse{score > 1 ? 's' : ''}
        </div>
        <p className="text-sm text-[#475569] mt-1">
          {perfect
            ? 'Sans faute ! Vous êtes officiellement à jour sur l’IA. ✨'
            : score > 0
            ? 'Joli score : vous en savez déjà plus que la moyenne !'
            : 'Pas grave : vous venez d’apprendre quelque chose de nouveau.'}
        </p>
        {quiz.outro && (
          <div className="mt-4 text-left text-sm whitespace-pre-line rounded-xl bg-[#FEF9C3] border border-[#1C2B24]/15 p-3.5">
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
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#1C2B24]/15 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-2.5 border-b-2 border-[#1C2B24]/15 animate-hero-shift"
        style={{ backgroundImage: `linear-gradient(110deg, #FEF9C3, #FFFFFF, ${accentHex}33, #FEF9C3)` }}
      >
        <span className="font-display font-bold text-sm flex items-center gap-1.5">
          <Trophy className="w-4 h-4 text-[#CA8A04]" />
          {quiz.title || (isTrueFalse ? 'Vrai ou faux ?' : 'À vous de jouer !')}
        </span>
        {total > 1 && (
          <div className="flex items-center gap-1.5" aria-label={`Question ${index + 1} sur ${total}`}>
            {quiz.questions.map((_, i) => (
              <span
                key={i}
                className={`h-2.5 rounded-full border border-[#1C2B24]/15 transition-all ${
                  i < index ? 'w-2.5 bg-[#86BC25]' : i === index ? 'w-6 bg-[#0F172A]' : 'w-2.5 bg-white'
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
              ? 'grid-cols-1 sm:grid-cols-3'
              : 'grid-cols-1 sm:grid-cols-2'
          }`}
        >
          {options.map((opt, i) => {
            const isPicked = picked === i;
            const reveal = answered && opt.correct;
            const wrongPick = answered && isPicked && !opt.correct;
            const tfIcon = isTrueFalse ? (opt.label === 'Vrai' ? '👍' : '👎') : null;
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
                    ? 'bg-[#DCFCE7] shadow-sm -translate-y-0.5'
                    : wrongPick
                    ? 'bg-[#FFE4E6] shadow-sm'
                    : answered
                    ? 'bg-[#F8FAFC] opacity-60'
                    : 'bg-white shadow-sm hover:-translate-y-0.5 hover:bg-[#F7FEE7]'
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
                    <span className="shrink-0 w-6 h-6 rounded-md bg-[#0F172A] text-white text-[11px] flex items-center justify-center">
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

        {/* Feedback */}
        {answered && (
          <div
            className={`rounded-xl border border-[#1C2B24]/15 p-3.5 animate-pop-in ${
              pickedCorrect ? 'bg-[#F0FDF4]' : 'bg-[#FFF7ED]'
            }`}
          >
            <div className="font-display font-bold text-base mb-1">
              {pickedCorrect ? '🎯 Bien vu !' : '😮 Raté… mais bonne nouvelle, maintenant vous savez !'}
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-line text-[#1E293B]">
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
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0284C7] hover:underline"
                  >
                    Source : {question.sourceLabel} <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-[11px] font-semibold text-[#64748B]">
                    Source : {question.sourceLabel}
                  </span>
                )
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={handleNext}
                className="cartoon-btn inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#86BC25] text-[#0F172A] text-xs font-bold cursor-pointer"
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
