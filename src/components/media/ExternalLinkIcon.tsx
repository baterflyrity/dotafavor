import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "../../lib/cn";

/**
 * Внешняя ссылка-иконка (spec/iteration-02.md, §8):
 * всегда target=_blank, rel=noopener noreferrer, доступная подпись aria-label.
 * Рендерится только при наличии корректного href.
 */
export function ExternalLinkIcon({
  href,
  label,
  children,
  className,
}: {
  href: string | null;
  /** Подпись для screen reader и title, например «Открыть матч на Dotabuff». */
  label: string;
  /** Дополнительная иконка слева (например, логотип ресурса). */
  children?: ReactNode;
  className?: string;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted transition-colors",
        "hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
        className,
      )}
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
    </a>
  );
}
