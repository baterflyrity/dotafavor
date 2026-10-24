import { Swords, Target } from "lucide-react";
import { Card, CardTitle } from "../../components/ui/Card";
import type { MatchDetail, PlayerStats } from "../../domain/models";
import { formatDuration, formatNumber } from "../../lib/format";
import { eventLabel } from "../../i18n/metrics";

/** Боевой вклад игрока: урон, лечение, участие в убийствах. */
export function BattleContribution({
  match,
  player,
}: {
  match: MatchDetail;
  player: PlayerStats;
}) {
  const team = match.players.filter((p) => p.side === player.side);
  const teamKills = team.reduce((s, p) => s + (p.kills ?? 0), 0);
  const participation =
    teamKills > 0 && player.kills !== undefined && player.assists !== undefined
      ? Math.min(100, Math.round(((player.kills + player.assists) / teamKills) * 100))
      : undefined;

  const kda =
    player.kills !== undefined && player.deaths !== undefined && player.assists !== undefined
      ? ((player.kills + player.assists) / Math.max(player.deaths, 1)).toFixed(1)
      : undefined;

  const items: { label: string; value: string; icon?: boolean }[] = [
    { label: "KDA", value: kda ?? "—" },
    { label: "Участие в убийствах", value: participation !== undefined ? `${participation}%` : "—" },
    { label: "Урон по героям", value: formatNumber(player.heroDamage) },
    { label: "Урон по строениям", value: formatNumber(player.towerDamage) },
    { label: "Лечение", value: formatNumber(player.heroHealing) },
    { label: "Последние удары", value: formatNumber(player.lastHits) },
    { label: "Denies", value: formatNumber(player.denies) },
    { label: "Нетворс", value: formatNumber(player.netWorth) },
  ];

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Swords className="h-4 w-4 text-muted" aria-hidden />
        <CardTitle>Боевой вклад</CardTitle>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((it) => (
          <div key={it.label} className="rounded-md border border-border bg-surface-2/50 p-2">
            <dt className="text-[11px] text-muted">{it.label}</dt>
            <dd className="text-sm font-semibold tabular-nums">{it.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/** Командные бои и события матча (только если API их предоставил). */
export function EventsBlock({ match }: { match: MatchDetail }) {
  const fights = match.teamfights ?? [];
  const events = match.events ?? [];

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-muted" aria-hidden />
        <CardTitle>События матча</CardTitle>
      </div>

      {fights.length > 0 ? (
        <div className="mt-3">
          <p className="text-sm text-muted">
            Командных боёв зафиксировано: <span className="text-foreground">{fights.length}</span>
          </p>
          <ul className="mt-2 max-h-40 overflow-y-auto text-sm">
            {fights.slice(0, 15).map((f, i) => (
              <li key={i} className="flex items-center justify-between border-b border-border/50 py-1">
                <span className="tabular-nums text-muted">
                  {formatDuration(f.start)}
                </span>
                <span className="text-xs">
                  {f.end !== undefined && f.start !== undefined
                    ? `длительность ${Math.max(0, Math.round((f.end - f.start)))} с`
                    : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">
          OpenDota не предоставила данные о командных боях для этого матча.
        </p>
      )}

      {events.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-wide text-muted">Цели и события</p>
          <ul className="mt-1 max-h-40 overflow-y-auto text-sm">
            {events.slice(0, 20).map((e, i) => (
              <li key={i} className="flex items-center justify-between border-b border-border/50 py-1">
                <span className="truncate">{eventLabel(e)}</span>
                <span className="tabular-nums text-xs text-muted">
                  {e.time !== undefined ? formatDuration(e.time) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted">
          Список целей (roshan, башни, бараки) для этого матча недоступен.
        </p>
      )}
    </Card>
  );
}
