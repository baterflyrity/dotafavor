import { Trophy, Skull, AlertCircle } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { HeroIcon } from "../../components/media/EntityIcons";
import { ExternalLinkIcon } from "../../components/media/ExternalLinkIcon";
import { dotabuffMatchUrl, dotabuffHeroUrl } from "../../lib/externalLinks";
import type { MatchSummary } from "../../domain/models";
import {
  formatDuration,
  formatKda,
  formatMatchDate,
  formatNumber,
} from "../../lib/format";
import { cn } from "../../lib/cn";

/** Подпись оценки балла 0–100 с индикатором качества. */
export function ScoreChip({
  label,
  score,
  approximate,
  title,
}: {
  label: string;
  score: number | null;
  approximate?: boolean;
  title?: string;
}) {
  const tone =
    score === null
      ? "neutral"
      : score >= 70
        ? "success"
        : score >= 45
          ? "warning"
          : "danger";
  return (
    <div
      className="flex flex-col items-start gap-1"
      title={title ?? (approximate ? "Оценка по кратким данным истории" : undefined)}
    >
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
      <Badge tone={tone}>
        {score === null ? "—" : score}
        {score !== null && approximate && <span aria-hidden>≈</span>}
      </Badge>
    </div>
  );
}

/** Карточка матча в истории. */
export function MatchCard({
  summary,
  heroName,
  heroInternalName,
  experienceScore,
  performanceScore,
  onClick,
}: {
  summary: MatchSummary;
  heroName?: string;
  /** Внутреннее имя героя (npc_dota_hero_…) — для иконки с CDN. */
  heroInternalName?: string;
  experienceScore: number | null;
  performanceScore: number | null;
  onClick: () => void;
}) {
  const won = summary.result === "win";
  const lost = summary.result === "loss";

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full rounded-lg border border-border bg-surface p-4 text-left transition-colors",
          "hover:border-accent/50 focus-visible:border-accent",
          "grid grid-cols-2 gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center",
        )}
        aria-label={`Матч ${summary.matchId}, ${won ? "победа" : lost ? "поражение" : "результат неизвестен"}`}
      >
        {/* Иконка героя/результата */}
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-md border",
              won
                ? "border-success/50 bg-success/10 text-success"
                : lost
                  ? "border-danger/50 bg-danger/10 text-danger"
                  : "border-border bg-surface-2 text-muted",
            )}
            aria-hidden
          >
            {won ? (
              <Trophy className="h-5 w-5" />
            ) : lost ? (
              <Skull className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
          </span>
          <HeroIcon
            heroName={heroInternalName}
            displayName={heroName}
            className="h-10 w-10 shrink-0 rounded-md border border-border"
          />
          <div>
            <p className="font-medium leading-tight">
              {heroName ?? `Герой #${summary.heroId ?? "?"}`}
            </p>
            <p className="text-xs text-muted">{formatMatchDate(summary.startTime)}</p>
            <div className="mt-0.5 flex items-center gap-1">
              <ExternalLinkIcon
                href={dotabuffMatchUrl(summary.matchId)}
                label={`Матч ${summary.matchId} на Dotabuff (откроется в новой вкладке)`}
              />
              <ExternalLinkIcon
                href={dotabuffHeroUrl(heroName)}
                label={`Герой ${heroName ?? ""} на Dotabuff (откроется в новой вкладке)`}
              />
            </div>
          </div>
        </div>

        {/* Основная статистика */}
        <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted sm:col-span-1">
          <span className={cn("font-semibold", won ? "text-success" : lost ? "text-danger" : "")}>
            {won ? "Победа" : lost ? "Поражение" : "—"}
          </span>
          <span>{formatDuration(summary.duration)}</span>
          <span>
            K/D/A:{" "}
            <span className="text-foreground">
              {summary.kills ?? "—"}/{summary.deaths ?? "—"}/{summary.assists ?? "—"}
            </span>
          </span>
          <span>
            GPM <span className="text-foreground">{summary.gpm ?? "—"}</span>
          </span>
          <span>
            XPM <span className="text-foreground">{summary.xpm ?? "—"}</span>
          </span>
          <span>
            NW <span className="text-foreground">{formatNumber(summary.netWorth)}</span>
          </span>
          <span className="hidden sm:inline">
            KDA <span className="text-foreground">{formatKda(summary.kills, summary.deaths, summary.assists)}</span>
          </span>
          {summary.incomplete && (
            <Badge tone="warning" title="Данные матча неполные — оценки могут меняться">
              неполные данные
            </Badge>
          )}
        </div>

        {/* Оценки */}
        <div className="flex items-center gap-3 sm:justify-end">
          <ScoreChip label="Качество матча" score={experienceScore} approximate />
          <ScoreChip label="Моя игра" score={performanceScore} approximate />
        </div>
      </button>
    </li>
  );
}
