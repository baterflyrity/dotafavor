import { cn } from "../../lib/cn";

/** Индикатор загрузки с подсказкой. */
export function Spinner({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Загрузка"
      className={cn(
        "h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-accent",
        className,
      )}
    />
  );
}

/** Скелетон-заглушка. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

/** Полоса прогресса 0–100. */
export function ProgressBar({
  value,
  className,
  label,
}: {
  value: number;
  className?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-2", className)}
    >
      <div
        className="h-full rounded-full bg-accent transition-all duration-500"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
