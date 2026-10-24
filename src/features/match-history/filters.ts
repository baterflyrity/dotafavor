/** Состояние фильтров истории матчей. */
export interface HistoryFilterState {
  query: string;
  heroId: "" | number;
  result: "all" | "win" | "loss";
  dateFrom: string;
  sort: "date_desc" | "date_asc" | "exp_desc" | "exp_asc" | "perf_desc" | "perf_asc";
}

export const defaultFilters: HistoryFilterState = {
  query: "",
  heroId: "",
  result: "all",
  dateFrom: "",
  sort: "date_desc",
};
