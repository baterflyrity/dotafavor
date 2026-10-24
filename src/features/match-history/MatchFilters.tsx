import { Search } from "lucide-react";
import type { HistoryFilterState } from "./filters";

export type { HistoryFilterState };

const sortOptions: { value: HistoryFilterState["sort"]; label: string }[] = [
  { value: "date_desc", label: "Сначала новые" },
  { value: "date_asc", label: "Сначала старые" },
  { value: "exp_desc", label: "Качество матча ↓" },
  { value: "exp_asc", label: "Качество матча ↑" },
  { value: "perf_desc", label: "Моя игра ↓" },
  { value: "perf_asc", label: "Моя игра ↑" },
];

const inputClass =
  "h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none";

/**
 * Панель фильтров: поиск, герой, результат, дата, сортировка.
 */
export function MatchFilters({
  value,
  onChange,
  heroOptions,
}: {
  value: HistoryFilterState;
  onChange: (next: HistoryFilterState) => void;
  heroOptions: { id: number; name: string }[];
}) {
  const set = <K extends keyof HistoryFilterState>(
    key: K,
    v: HistoryFilterState[K],
  ) => onChange({ ...value, [key]: v });

  return (
    <div
      className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-5"
      aria-label="Фильтры матчей"
    >
      <label className="relative flex items-center">
        <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted" aria-hidden />
        <span className="sr-only">Поиск по номеру матча</span>
        <input
          type="search"
          className={inputClass + " pl-8"}
          placeholder="Поиск: № матча"
          value={value.query}
          onChange={(e) => set("query", e.target.value)}
        />
      </label>

      <label className="flex items-center gap-2">
        <span className="sr-only">Герой</span>
        <select
          className={inputClass}
          value={value.heroId}
          onChange={(e) =>
            set("heroId", e.target.value === "" ? "" : Number(e.target.value))
          }
        >
          <option value="">Все герои</option>
          {heroOptions.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2">
        <span className="sr-only">Результат</span>
        <select
          className={inputClass}
          value={value.result}
          onChange={(e) =>
            set("result", e.target.value as HistoryFilterState["result"])
          }
        >
          <option value="all">Все результаты</option>
          <option value="win">Только победы</option>
          <option value="loss">Только поражения</option>
        </select>
      </label>

      <label className="flex items-center gap-2">
        <span className="text-xs text-muted">С даты</span>
        <input
          type="date"
          className={inputClass}
          value={value.dateFrom}
          onChange={(e) => set("dateFrom", e.target.value)}
          aria-label="Матчи начиная с даты"
        />
      </label>

      <label className="flex items-center gap-2">
        <span className="sr-only">Сортировка</span>
        <select
          className={inputClass}
          value={value.sort}
          onChange={(e) => set("sort", e.target.value as HistoryFilterState["sort"])}
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
