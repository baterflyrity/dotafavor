import { Badge } from "../../components/ui/Badge";
import { Card, CardTitle } from "../../components/ui/Card";
import { ProgressBar } from "../../components/ui/Loading";
import { metricLabel, metricLabels } from "../../i18n/metrics";
import type {
  ExperienceScoreResult,
} from "../../analytics/experience-score";
import type {
  PerformanceScoreResult,
} from "../../analytics/player-performance";
import { cn } from "../../lib/cn";

function scoreTone(score: number | null): string {
  if (score === null) return "text-muted";
  if (score >= 70) return "text-success";
  if (score >= 45) return "text-warning";
  return "text-danger";
}

function ComponentRow({
  label,
  score,
  available,
  explanation,
  metrics,
  missing,
}: {
  label: string;
  score: number;
  available: boolean;
  explanation: string;
  metrics: Record<string, number | string>;
  missing: string[];
}) {
  const metricEntries = Object.entries(metrics);
  return (
    <div className="rounded-md border border-border bg-surface-2/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {available ? (
          <span className={cn("text-sm font-semibold", scoreTone(score))}>{score}</span>
        ) : (
          <Badge tone="neutral">нет данных</Badge>
        )}
      </div>
      {available && (
        <ProgressBar
          value={score}
          label={`${label}: ${score} из 100`}
          className="mt-2 h-1.5"
        />
      )}
      <p className="mt-2 text-xs text-muted">{explanation}</p>
      {metricEntries.length > 0 && (
        <p className="mt-1 text-[11px] text-muted">
          {metricEntries.map(([k, v]) => `${metricLabel(k)}: ${v}`).join(" · ")}
        </p>
      )}
      {missing.length > 0 && (
        <p className="mt-1 text-[11px] text-warning">
          Нет данных: {metricLabels(missing).join(", ")}
        </p>
      )}
    </div>
  );
}

/** Выразительная карточка основной оценки качества матча. */
export function ExperienceScoreCard({ result }: { result: ExperienceScoreResult }) {
  return (
    <Card className="animate-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Качество матча</CardTitle>
          <p className="mt-1 text-xs text-muted">
            Match Experience Score · экспериментальная модель V1
          </p>
        </div>
        <div className="flex flex-col items-start sm:items-end">
          <span
            className={cn("text-5xl font-bold tabular-nums", scoreTone(result.score))}
            aria-label={
              result.score === null
                ? "Итоговая оценка не рассчитана"
                : `Качество матча: ${result.score} из 100`
            }
          >
            {result.score === null ? "—" : result.score}
          </span>
          <span className="text-xs text-muted">
            {result.score === null
              ? "недостаточно данных"
              : "из 100 · " +
                (result.confidence === "high"
                  ? "высокая уверенность"
                  : result.confidence === "medium"
                    ? "средняя уверенность"
                    : "низкая уверенность")}
          </span>
        </div>
      </div>

      {result.insufficientReason && (
        <p className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          {result.insufficientReason}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
        {result.components.map((c) => (
          <ComponentRow
            key={c.key}
            label={c.label}
            score={c.score}
            available={c.available}
            explanation={c.explanation}
            metrics={c.metrics}
            missing={c.missing}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
        <span>Покрытие данных: {Math.round(result.coverage * 100)}%</span>
        {result.missingData.length > 0 && (
          <span className="text-warning">
            Нет данных: {metricLabels(result.missingData).join(", ")}
          </span>
        )}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Это экспериментальная автоматическая оценка, а не объективная истина и не
        замена вашему впечатлению.
      </p>
    </Card>
  );
}

/** Карточка оценки качества собственной игры. */
export function PerformanceScoreCard({ result }: { result: PerformanceScoreResult }) {
  return (
    <Card className="animate-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Качество вашей игры</CardTitle>
          <p className="mt-1 text-xs text-muted">
            Player Performance Score · экспериментальная модель V1 (Turbo)
          </p>
        </div>
        <div className="flex flex-col items-start sm:items-end">
          <span
            className={cn("text-5xl font-bold tabular-nums", scoreTone(result.score))}
            aria-label={
              result.score === null
                ? "Итоговая оценка не рассчитана"
                : `Качество вашей игры: ${result.score} из 100`
            }
          >
            {result.score === null ? "—" : result.score}
          </span>
          <span className="text-xs text-muted">
            {result.score === null
              ? "недостаточно данных"
              : "из 100 · покрытие " +
                Math.round(result.coverage * 100) +
                "%"}
          </span>
        </div>
      </div>

      {result.insufficientReason && (
        <p className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          {result.insufficientReason}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
        {result.components.map((c) => (
          <ComponentRow
            key={c.key}
            label={c.label}
            score={c.score}
            available={c.available}
            explanation={c.explanation}
            metrics={c.metrics}
            missing={c.missing}
          />
        ))}
      </div>
    </Card>
  );
}
