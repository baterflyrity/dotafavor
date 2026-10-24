/** Форматирование значений для отображения. */

/** Форматирует длительность матча как м:сс. */
export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Форматирует дату матча. */
export function formatMatchDate(startTime: number | undefined): string {
  if (startTime === undefined || !Number.isFinite(startTime)) return "—";
  return new Date(startTime * 1000).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Форматирует число с разделителем разрядов. */
export function formatNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return value.toLocaleString("ru-RU");
}

/** Форматирует значение 0–100 как процент. */
export function formatPercent(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}

/** KDA: (kills + assists) / max(deaths, 1). */
export function formatKda(
  kills: number | undefined,
  deaths: number | undefined,
  assists: number | undefined,
): string {
  if (kills === undefined || deaths === undefined || assists === undefined) return "—";
  return ((kills + assists) / Math.max(deaths, 1)).toFixed(1);
}
