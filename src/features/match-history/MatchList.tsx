import { useMemo, useState } from "react";
import { EmptyState, ErrorState, MatchListSkeleton } from "../../components/StateViews";
import { Button } from "../../components/ui/Button";
import type { MatchSummary } from "../../domain/models";
import type { OpenDotaError } from "../../services/opendota";
import {
  computeSummaryExperience,
  computeSummaryPerformance,
} from "../../analytics/summary-scores";
import { MatchCard } from "./MatchCard";
import {
  MatchFilters,
} from "./MatchFilters";
import { defaultFilters, type HistoryFilterState } from "./filters";

function applyFilters(matches: MatchSummary[], f: HistoryFilterState): MatchSummary[] {
  let out = matches;

  if (f.query.trim()) {
    const q = f.query.trim().toLowerCase();
    out = out.filter((m) => String(m.matchId).includes(q));
  }
  if (f.heroId !== "") {
    out = out.filter((m) => m.heroId === f.heroId);
  }
  if (f.result !== "all") {
    out = out.filter((m) => m.result === f.result);
  }
  if (f.dateFrom) {
    const from = new Date(f.dateFrom).getTime() / 1000;
    out = out.filter((m) => (m.startTime ?? 0) >= from);
  }

  const exp = (m: MatchSummary) => computeSummaryExperience(m).score ?? -1;
  const perf = (m: MatchSummary) => computeSummaryPerformance(m).score ?? -1;

  const sorted = [...out];
  switch (f.sort) {
    case "date_asc":
      sorted.sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
      break;
    case "exp_desc":
      sorted.sort((a, b) => exp(b) - exp(a));
      break;
    case "exp_asc":
      sorted.sort((a, b) => exp(a) - exp(b));
      break;
    case "perf_desc":
      sorted.sort((a, b) => perf(b) - perf(a));
      break;
    case "perf_asc":
      sorted.sort((a, b) => perf(a) - perf(b));
      break;
    default:
      sorted.sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0));
  }
  return sorted;
}

export interface MatchListProps {
  matches: MatchSummary[];
  status: "idle" | "loading" | "loading_more" | "success" | "error";
  error: OpenDotaError | null;
  hasMore: boolean;
  isEmpty: boolean;
  heroes: Record<string, { localized_name?: string; name?: string }>;
  onSelect: (matchId: number) => void;
  onLoadMore: () => void;
  onRetry: () => void;
}

export function MatchList({
  matches,
  status,
  error,
  hasMore,
  isEmpty,
  heroes,
  onSelect,
  onLoadMore,
  onRetry,
}: MatchListProps) {
  const [filters, setFilters] = useState<HistoryFilterState>(defaultFilters);

  const heroOptions = useMemo(() => {
    const used = new Set(matches.map((m) => m.heroId).filter((id): id is number => id !== undefined));
    return [...used]
      .map((id) => ({ id, name: heroes[String(id)]?.localized_name ?? `Герой #${id}` }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [matches, heroes]);

  const filtered = useMemo(() => applyFilters(matches, filters), [matches, filters]);

  if (status === "loading" && matches.length === 0) {
    return <MatchListSkeleton />;
  }

  if (status === "error" && matches.length === 0 && error) {
    return (
      <ErrorState
        message={error.message}
        action={error.action}
        onRetry={onRetry}
      />
    );
  }

  if (isEmpty) {
    return (
      <EmptyState
        title="Turbo-матчей не найдено"
        description="В истории нет матчей режима Turbo для выбранного профиля. Сыграйте матч Turbo или проверьте, что история матчей открыта в настройках приватности Dota 2."
      />
    );
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        title="Под фильтры ничего не подошло"
        description="Попробуйте изменить фильтры или сбросить поиск."
        action={
          <Button variant="secondary" size="sm" onClick={() => setFilters(defaultFilters)}>
            Сбросить фильтры
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <MatchFilters value={filters} onChange={setFilters} heroOptions={heroOptions} />

      {status === "error" && error && (
        <ErrorState message={error.message} action={error.action} onRetry={onRetry} />
      )}

      <ul className="flex flex-col gap-3" aria-label="Список матчей">
        {filtered.map((m) => {
          const hero = m.heroId !== undefined ? heroes[String(m.heroId)] : undefined;
          return (
            <MatchCard
              key={m.matchId}
              summary={m}
              heroName={hero?.localized_name}
              heroInternalName={hero?.name}
              experienceScore={computeSummaryExperience(m).score}
              performanceScore={computeSummaryPerformance(m).score}
              onClick={() => onSelect(m.matchId)}
            />
          );
        })}
      </ul>

      <div className="flex justify-center">
        {hasMore ? (
          <Button
            variant="secondary"
            onClick={onLoadMore}
            disabled={status === "loading_more"}
            aria-busy={status === "loading_more" || undefined}
          >
            {status === "loading_more" ? "Загрузка…" : "Загрузить ещё"}
          </Button>
        ) : (
          <p className="text-sm text-muted">Вся доступная история загружена.</p>
        )}
      </div>
    </div>
  );
}
