import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Lock } from "lucide-react";
import { Button } from "./ui/Button";
import { Skeleton } from "./ui/Loading";

/** Пустое состояние. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface/50 px-6 py-12 text-center">
      <Inbox className="h-8 w-8 text-muted" aria-hidden />
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action}
    </div>
  );
}

/**
 * Состояние ошибки загрузки с понятным сообщением и подходящим действием.
 */
export function ErrorState({
  message,
  action,
  onRetry,
}: {
  message: string;
  /** Что может сделать пользователь: retry / back / check_privacy / none. */
  action?: "retry" | "back" | "check_privacy" | "none";
  onRetry?: () => void;
  onBack?: () => void;
}) {
  const icon =
    action === "check_privacy" ? (
      <Lock className="h-8 w-8 text-warning" aria-hidden />
    ) : (
      <AlertTriangle className="h-8 w-8 text-danger" aria-hidden />
    );

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-danger/40 bg-danger/5 px-6 py-10 text-center"
    >
      {icon}
      <p className="max-w-md text-sm">{message}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {(action === "retry" || action === undefined) && onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Повторить запрос
          </Button>
        )}
        {action === "check_privacy" && (
          <p className="text-xs text-muted">
            Проверьте настройки публичности данных Dota 2 в Steam.
          </p>
        )}
      </div>
    </div>
  );
}

/** Скелетон списка матчей. */
export function MatchListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-label="Загрузка матчей" role="status">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4"
        >
          <Skeleton className="h-10 w-10 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}
