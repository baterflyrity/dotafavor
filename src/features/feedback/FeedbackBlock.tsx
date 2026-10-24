import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { Card, CardTitle } from "../../components/ui/Card";
import { loadFeedback, saveFeedback, type FeedbackFields } from "../../lib/storage";
import { cn } from "../../lib/cn";

const QUESTIONS: { key: keyof FeedbackFields; label: string }[] = [
  { key: "liked", label: "Насколько понравился матч?" },
  { key: "balanced", label: "Ощущалась ли равная борьба?" },
  { key: "alliesUseful", label: "Были ли союзники полезны?" },
  { key: "ownImpact", label: "Насколько ты ощущал своё влияние на игру?" },
];

const SCALE = [1, 2, 3, 4, 5];

/**
 * «Как тебе матч?» — необязательная субъективная оценка 1–5.
 * Ответы хранятся только в localStorage и не отправляются никуда.
 * Не объединяется с автоматической оценкой.
 */
export function FeedbackBlock({ matchId }: { matchId: number }) {
  const [answers, setAnswers] = useState<Partial<FeedbackFields>>(
    () => loadFeedback()[matchId] ?? {},
  );
  const [saved, setSaved] = useState(false);

  const setAnswer = (key: keyof FeedbackFields, value: number) => {
    const next = { ...answers, [key]: value };
    setAnswers(next);
    saveFeedback(matchId, next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  return (
    <Card>
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted" aria-hidden />
        <CardTitle>Как тебе матч?</CardTitle>
      </div>
      <p className="mt-1 text-xs text-muted">
        Необязательно. Ответы сохраняются только в этом браузере и не влияют на
        автоматические оценки.
      </p>

      <div className="mt-3 flex flex-col gap-3">
        {QUESTIONS.map((q) => (
          <fieldset key={q.key}>
            <legend className="mb-1 text-sm">{q.label}</legend>
            <div className="flex gap-1" role="group">
              {SCALE.map((v) => {
                const active = answers[q.key] === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setAnswer(q.key, v)}
                    aria-pressed={active}
                    aria-label={`${q.label}: ${v} из 5`}
                    className={cn(
                      "h-8 w-8 rounded-md border text-sm transition-colors",
                      active
                        ? "border-accent bg-accent/20 text-foreground"
                        : "border-border bg-surface-2 text-muted hover:border-accent/50",
                    )}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <p
        className={cn(
          "mt-3 text-xs transition-opacity",
          saved ? "text-success opacity-100" : "opacity-0",
        )}
        aria-live="polite"
      >
        Сохранено локально.
      </p>
    </Card>
  );
}
