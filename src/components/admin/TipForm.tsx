import React, { useEffect, useState } from 'react';
import { Bot, Link2, Plus, Trash2, Film, HelpCircle, Lightbulb } from 'lucide-react';
import {
  CardStyleId,
  CopilotTargetMode,
  ResourceLink,
  ResourceType,
  TipCategory,
  TipContent,
  TipMedia,
  TipMediaKind,
  TipQuiz,
} from '../../types/advent';
import {
  CARD_STYLES,
  CARD_STYLE_LIST,
  CATEGORY_META,
  RESOURCE_TYPE_META,
} from '../../data/cardStyles';

interface TipFormProps {
  content: TipContent;
  dayNumber: number;
  onChange: (patch: Partial<TipContent>) => void;
  /** Reports whether the quiz JSON currently typed is invalid (blocks saving). */
  onValidityChange?: (valid: boolean) => void;
}

const inputCls =
  'w-full px-3 py-2 rounded-xl border border-[#1C2B24]/15 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-[#86BC25]';
const smallInputCls =
  'w-full px-3 py-1.5 rounded-xl border border-[#1C2B24]/15 text-xs font-medium bg-white focus:outline-none focus:ring-2 focus:ring-[#86BC25]';

const MEDIA_KINDS: { id: TipMediaKind; label: string }[] = [
  { id: 'youtube', label: 'Vidéo YouTube' },
  { id: 'embed', label: 'Iframe intégrable' },
  { id: 'image', label: 'Image' },
  { id: 'link', label: 'Lien « affiche » (replay non intégrable)' },
];

const QUIZ_EXAMPLE: TipQuiz = {
  title: 'Vrai ou faux ?',
  questions: [
    {
      kind: 'true-false',
      question: 'Copilot peut résumer un fil Teams.',
      answer: true,
      explanation: 'Oui, via « Résumer » dans Teams.',
    },
  ],
};

function validateQuiz(value: unknown): value is TipQuiz {
  if (!value || typeof value !== 'object') return false;
  const q = value as Record<string, unknown>;
  if (!Array.isArray(q.questions)) return false;
  return q.questions.every((x) => {
    if (!x || typeof x !== 'object') return false;
    const qq = x as Record<string, unknown>;
    if (qq.kind !== 'true-false' && qq.kind !== 'choice') return false;
    if (typeof qq.question !== 'string') return false;
    if (qq.kind === 'choice' && !Array.isArray(qq.options)) return false;
    return true;
  });
}

export const TipForm: React.FC<TipFormProps> = ({ content, dayNumber, onChange, onValidityChange }) => {
  const style = CARD_STYLES[content.cardStyle] || CARD_STYLES['deloitte-emerald'];
  const resources = content.resources ?? [];

  // ---- Quiz JSON editor (local text, committed when valid) ----
  const quizToText = (q?: TipQuiz) => (q ? JSON.stringify(q, null, 2) : '');
  const [quizText, setQuizText] = useState(() => quizToText(content.quiz));
  const [quizError, setQuizError] = useState<string | null>(null);

  // Re-sync when another card is loaded
  const quizKey = JSON.stringify(content.quiz ?? null);
  useEffect(() => {
    setQuizText((cur) => {
      try {
        if (cur.trim() && JSON.stringify(JSON.parse(cur)) === quizKey) return cur;
      } catch {
        // fallthrough
      }
      return quizToText(content.quiz);
    });
    setQuizError(null);
    onValidityChange?.(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizKey]);

  const handleQuizText = (text: string) => {
    setQuizText(text);
    if (!text.trim()) {
      setQuizError(null);
      onValidityChange?.(true);
      onChange({ quiz: undefined });
      return;
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!validateQuiz(parsed)) {
        setQuizError('Structure invalide : il faut { "questions": [ { "kind": "true-false" | "choice", "question": "…", … } ] }');
        onValidityChange?.(false);
        return;
      }
      setQuizError(null);
      onValidityChange?.(true);
      onChange({ quiz: parsed });
    } catch {
      setQuizError('JSON invalide (vérifiez les virgules et les guillemets).');
      onValidityChange?.(false);
    }
  };

  // ---- Media ----
  const media = content.media;
  const patchMedia = (patch: Partial<TipMedia>) => {
    const base: TipMedia = media ?? { kind: 'youtube', url: '' };
    onChange({ media: { ...base, ...patch } });
  };

  // ---- Resources ----
  const updateResource = (id: string, patch: Partial<ResourceLink>) =>
    onChange({ resources: resources.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const addResource = () =>
    onChange({
      resources: [
        ...resources,
        { id: `res-${Date.now()}`, label: 'Nouvelle ressource', url: 'https://', type: 'article' },
      ],
    });
  const removeResource = (id: string) => onChange({ resources: resources.filter((r) => r.id !== id) });

  const catMeta = CATEGORY_META[content.category] ?? Object.values(CATEGORY_META)[0];

  return (
    <div className="space-y-5">
      {/* Style & preview */}
      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-4 items-start">
        <div
          className={`rounded-2xl p-3.5 min-h-[160px] border border-[#1C2B24]/15 shadow-sm flex flex-col justify-between ${style.bgClass}`}
        >
          <div className="flex items-center justify-between">
            <span className="w-8 h-8 rounded-lg bg-[#FAF9F5] border border-[#1C2B24]/15 flex items-center justify-center font-display font-bold text-base">
              {dayNumber}
            </span>
            {content.badgeTag && (
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${style.badgeBg} ${style.badgeText}`}>
                {content.badgeTag}
              </span>
            )}
          </div>
          <div className="text-center bg-white/90 rounded-lg py-1 px-2 border border-[#1C2B24]/15 text-[10px] font-extrabold">
            Gratter la case ✨
          </div>
          <div className="text-[10px] font-bold bg-white/80 px-2 py-0.5 rounded w-fit truncate max-w-full">
            {catMeta?.icon} {content.emoji} {content.title || 'Sans titre'}
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold mb-1.5">Style visuel de la carte</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CARD_STYLE_LIST.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onChange({ cardStyle: preset.id as CardStyleId })}
                className={`flex items-center gap-2 p-2 rounded-xl border text-left text-xs font-bold cursor-pointer transition-all ${
                  content.cardStyle === preset.id
                    ? 'border-[#1C2B24]/15 bg-[#F0FDF4] shadow-sm'
                    : 'border-[#E2E8F0] hover:border-[#1C2B24]/15'
                }`}
              >
                <span className={`w-5 h-5 rounded-md border border-[#1C2B24]/15 shrink-0 ${preset.bgClass}`} />
                <span className="truncate">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Texts */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="sm:col-span-3">
          <label className="block text-xs font-bold mb-1">Titre</label>
          <input type="text" value={content.title} onChange={(e) => onChange({ title: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-bold mb-1">Emoji</label>
          <input
            type="text"
            value={content.emoji}
            onChange={(e) => onChange({ emoji: e.target.value })}
            className={`${inputCls} text-center text-lg`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-bold mb-1">Catégorie</label>
          <select
            value={content.category}
            onChange={(e) => onChange({ category: e.target.value as TipCategory })}
            className={inputCls}
          >
            {(Object.keys(CATEGORY_META) as TipCategory[]).map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_META[cat].icon} {CATEGORY_META[cat].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold mb-1">Pôle / Thème Change</label>
          <input type="text" value={content.practice} onChange={(e) => onChange({ practice: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-bold mb-1">Badge</label>
          <input
            type="text"
            value={content.badgeTag ?? ''}
            placeholder="ex : ESSENTIEL"
            onChange={(e) => onChange({ badgeTag: e.target.value })}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold mb-1">Accroche courte</label>
        <input type="text" value={content.summary} onChange={(e) => onChange({ summary: e.target.value })} className={inputCls} />
      </div>

      <div>
        <label className="block text-xs font-bold mb-1">
          Explication (paragraphes séparés par une ligne vide, puces avec « • » ou « - »)
        </label>
        <textarea
          rows={6}
          value={content.content}
          onChange={(e) => onChange({ content: e.target.value })}
          className={inputCls}
        />
      </div>

      {/* Fun fact */}
      <div className="p-3.5 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-bold">
          <Lightbulb className="w-4 h-4 text-[#B45309]" />
          « Le saviez-vous ? » (optionnel)
        </div>
        <input
          type="text"
          value={content.funFact ?? ''}
          onChange={(e) => onChange({ funFact: e.target.value || undefined })}
          className={smallInputCls}
        />
      </div>

      {/* Media */}
      <div className="p-3.5 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-bold">
            <Film className="w-4 h-4 text-[#BE123C]" />
            Média en tête de carte (optionnel)
          </span>
          {media ? (
            <button
              type="button"
              onClick={() => onChange({ media: undefined })}
              className="text-[11px] font-bold text-[#BE123C] hover:underline cursor-pointer"
            >
              Retirer le média
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onChange({ media: { kind: 'youtube', url: '' } })}
              className="cartoon-btn inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white text-[11px] font-bold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Ajouter un média
            </button>
          )}
        </div>
        {media && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold mb-1">Type</label>
              <select
                value={media.kind}
                onChange={(e) => patchMedia({ kind: e.target.value as TipMediaKind })}
                className={smallInputCls}
              >
                {MEDIA_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold mb-1">URL</label>
              <input
                type="url"
                value={media.url}
                onChange={(e) => patchMedia({ url: e.target.value })}
                placeholder="https://…"
                className={`${smallInputCls} font-mono`}
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold mb-1">Titre</label>
              <input type="text" value={media.title ?? ''} onChange={(e) => patchMedia({ title: e.target.value })} className={smallInputCls} />
            </div>
            <div>
              <label className="block text-[11px] font-bold mb-1">Légende</label>
              <input
                type="text"
                value={media.caption ?? ''}
                placeholder="ex : Micode • 38 min"
                onChange={(e) => patchMedia({ caption: e.target.value })}
                className={smallInputCls}
              />
            </div>
            {media.kind === 'link' && (
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-bold mb-1">Texte du bouton</label>
                <input
                  type="text"
                  value={media.ctaLabel ?? ''}
                  placeholder="Regarder"
                  onChange={(e) => patchMedia({ ctaLabel: e.target.value })}
                  className={smallInputCls}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Copilot */}
      <div className="p-3.5 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
        <div className="flex items-center gap-1.5 text-xs font-bold">
          <Bot className="w-4 h-4 text-[#0EA5E9]" />
          Prompt &amp; redirection Microsoft Copilot
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold mb-1">Libellé du bloc prompt</label>
            <input type="text" value={content.actionLabel} onChange={(e) => onChange({ actionLabel: e.target.value })} className={smallInputCls} />
          </div>
          <div>
            <label className="block text-[11px] font-bold mb-1">Destination Copilot par défaut</label>
            <select
              value={content.copilotMode || 'm365'}
              onChange={(e) => onChange({ copilotMode: e.target.value as CopilotTargetMode })}
              className={smallInputCls}
            >
              <option value="m365">Copilot M365 Enterprise</option>
              <option value="web">Copilot Web</option>
              <option value="studio">Copilot Studio Agent</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-bold mb-1">URL Copilot personnalisée (optionnel)</label>
          <input
            type="url"
            value={content.copilotUrl ?? ''}
            placeholder="https://m365.cloud.microsoft/chat…"
            onChange={(e) => onChange({ copilotUrl: e.target.value })}
            className={`${smallInputCls} font-mono`}
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold mb-1">Texte du prompt / instruction</label>
          <textarea
            rows={4}
            value={content.promptOrAction}
            onChange={(e) => onChange({ promptOrAction: e.target.value })}
            className={`${smallInputCls} font-mono`}
          />
        </div>
      </div>

      {/* Quiz */}
      <div className="p-3.5 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold">
            <HelpCircle className="w-4 h-4 text-[#6D28D9]" />
            Quiz interactif (optionnel, format JSON)
          </span>
          {!quizText.trim() && (
            <button
              type="button"
              onClick={() => handleQuizText(JSON.stringify(QUIZ_EXAMPLE, null, 2))}
              className="cartoon-btn inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white text-[11px] font-bold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Insérer un exemple
            </button>
          )}
        </div>
        <textarea
          rows={quizText ? 8 : 2}
          value={quizText}
          onChange={(e) => handleQuizText(e.target.value)}
          placeholder="Laisser vide pour ne pas afficher de quiz"
          spellCheck={false}
          className={`${smallInputCls} font-mono ${quizError ? 'border-[#E11D48] bg-[#FFF1F2]' : ''}`}
        />
        {quizError && <p className="text-[11px] font-bold text-[#E11D48]">{quizError}</p>}
      </div>

      {/* Resources */}
      <div className="p-3.5 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] space-y-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-bold">
            <Link2 className="w-4 h-4 text-[#86BC25]" />
            Articles, guides &amp; liens ({resources.length})
          </span>
          <button
            type="button"
            onClick={addResource}
            className="cartoon-btn inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#86BC25] text-[11px] font-bold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Ajouter un lien
          </button>
        </div>
        {resources.length === 0 ? (
          <p className="text-xs text-[#64748B] italic">Aucun lien pour cette case.</p>
        ) : (
          <div className="space-y-2">
            {resources.map((res) => (
              <div
                key={res.id}
                className="p-2.5 rounded-xl bg-white border border-[#CBD5E1] grid grid-cols-1 sm:grid-cols-12 gap-2 items-center"
              >
                <select
                  value={res.type}
                  onChange={(e) => updateResource(res.id, { type: e.target.value as ResourceType })}
                  className="sm:col-span-3 px-2 py-1.5 rounded-lg border border-[#1C2B24]/15 text-xs font-semibold bg-white"
                >
                  {(Object.keys(RESOURCE_TYPE_META) as ResourceType[]).map((t) => (
                    <option key={t} value={t}>
                      {RESOURCE_TYPE_META[t].icon} {RESOURCE_TYPE_META[t].label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={res.label}
                  placeholder="Titre du lien"
                  onChange={(e) => updateResource(res.id, { label: e.target.value })}
                  className="sm:col-span-4 px-2.5 py-1.5 rounded-lg border border-[#1C2B24]/15 text-xs font-medium"
                />
                <input
                  type="url"
                  value={res.url}
                  placeholder="https://…"
                  onChange={(e) => updateResource(res.id, { url: e.target.value })}
                  className="sm:col-span-4 px-2.5 py-1.5 rounded-lg border border-[#1C2B24]/15 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => removeResource(res.id)}
                  title="Supprimer ce lien"
                  className="sm:col-span-1 p-1.5 rounded-lg text-[#BE123C] hover:bg-[#FFE4E6] flex items-center justify-center cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
