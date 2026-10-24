import { Check, LoaderCircle } from "lucide-react";
import { cn } from "../../lib/cn";

/**
 * Визуальные этапы длительной загрузки (spec/iteration-02.md, §3).
 *
 * Показывает реальные последовательные этапы без выдуманного процента:
 * общее число операций здесь конечно и известно, но процент не рисуется —
 * этапы отражают фактическое состояние запросов.
 * Доступность: role="status", aria-live, aria-current="step".
 */
export function LoadStages({
  steps,
  activeIndex,
  className,
}: {
  steps: string[];
  /** Индекс текущего этапа; все предыдущие помечаются выполненными. */
  activeIndex: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-5",
        className,
      )}
    >
      <ol className="flex flex-col gap-2">
        {steps.map((label, i) => {
          const done = i < activeIndex;
          const active = i === activeIndex;
          return (
            <li
              key={label}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 text-sm",
                done && "text-muted",
                active && "text-foreground font-medium",
                !done && !active && "text-muted/60",
              )}
            >
              {done ? (
                <Check className="h-4 w-4 shrink-0 text-success" aria-hidden />
              ) : active ? (
                <LoaderCircle
                  className="h-4 w-4 shrink-0 animate-spin text-accent"
                  aria-hidden
                />
              ) : (
                <span className="h-4 w-4 shrink-0" aria-hidden />
              )}
              <span>{label}</span>
              <span className="sr-only">
                {done ? " — выполнено" : active ? " — выполняется" : " — ожидает"}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted">Обычно занимает несколько секунд.</p>
    </div>
  );
}
