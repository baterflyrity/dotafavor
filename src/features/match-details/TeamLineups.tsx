import { formatDuration, formatNumber } from "../../lib/format";
import { Badge } from "../../components/ui/Badge";
import { Card, CardTitle } from "../../components/ui/Card";
import type { MatchDetail, PlayerStats } from "../../domain/models";
import type { ApiConstantsHeroes } from "../../services/opendota/types";
import { cn } from "../../lib/cn";
import { HeroIcon } from "../../components/media/EntityIcons";
import { ExternalLinkIcon } from "../../components/media/ExternalLinkIcon";
import { steam32ToSteamId64 } from "../../features/steam-login/steamId";
import {
  dotabuffHeroUrl,
  dotabuffPlayerUrl,
  openDotaPlayerUrl,
  steamProfileUrl,
} from "../../lib/externalLinks";

const KDA_HEROES_HINT =
  "Полные позиционные модели (роли 1–5) в MVP не используются.";

function PlayerRow({
  player,
  isUser,
  heroName,
  heroInternalName,
  teamTowerMax,
}: {
  player: PlayerStats;
  isUser: boolean;
  heroName?: string;
  heroInternalName?: string;
  teamTowerMax: number;
}) {
  const steam64 =
    player.accountId !== undefined ? steam32ToSteamId64(player.accountId) : null;
  return (
    <tr
      className={cn(
        "border-t border-border/60",
        isUser && "bg-accent/5",
      )}
    >
      <td className="py-2 pr-2">
        <div className="flex items-center gap-2">
          <HeroIcon
            heroName={heroInternalName}
            displayName={heroName}
            className="h-7 w-7 shrink-0 rounded border border-border"
          />
          <span className="truncate max-w-[120px]">
            {heroName ?? `#${player.heroId ?? "?"}`}
          </span>
          {isUser && <Badge tone="accent">вы</Badge>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1 pl-9">
          {player.personaName && (
            <span className="truncate text-[11px] text-muted max-w-[120px]">
              {player.personaName}
            </span>
          )}
          <span className="flex items-center">
            <ExternalLinkIcon
              href={dotabuffPlayerUrl(player.accountId)}
              label="Игрок на Dotabuff (откроется в новой вкладке)"
            />
            <ExternalLinkIcon
              href={openDotaPlayerUrl(player.accountId)}
              label="Игрок на OpenDota (откроется в новой вкладке)"
            />
            <ExternalLinkIcon
              href={steamProfileUrl(steam64)}
              label="Профиль игрока в Steam (откроется в новой вкладке)"
            />
            <ExternalLinkIcon
              href={dotabuffHeroUrl(heroName)}
              label={`Герой ${heroName ?? ""} на Dotabuff (откроется в новой вкладке)`}
            />
          </span>
        </div>
      </td>
      <td className="py-2 text-right tabular-nums">
        {player.kills ?? "—"}/{player.deaths ?? "—"}/{player.assists ?? "—"}
      </td>
      <td className="py-2 text-right tabular-nums">{player.gpm ?? "—"}</td>
      <td className="py-2 text-right tabular-nums">{player.xpm ?? "—"}</td>
      <td className="py-2 text-right tabular-nums hidden sm:table-cell">
        {player.lastHits ?? "—"}/{player.denies ?? "—"}
      </td>
      <td className="py-2 text-right tabular-nums">{formatNumber(player.netWorth)}</td>
      <td className="py-2 text-right tabular-nums hidden md:table-cell">
        {formatNumber(player.heroDamage)}
      </td>
      <td className="py-2 text-right tabular-nums hidden md:table-cell">
        {formatNumber(player.towerDamage)}
        {teamTowerMax > 0 && player.towerDamage !== undefined && (
          <span className="ml-1 text-[10px] text-muted">
            {Math.round((player.towerDamage / teamTowerMax) * 100)}%
          </span>
        )}
      </td>
      <td className="py-2 text-right tabular-nums hidden lg:table-cell">
        {formatNumber(player.heroHealing)}
      </td>
    </tr>
  );
}

/** Составы команд и сравнение игроков по основным метрикам. */
export function TeamLineups({
  match,
  accountId,
  heroes,
}: {
  match: MatchDetail;
  accountId: number | null;
  heroes: ApiConstantsHeroes;
}) {
  const radiant = match.players.filter((p) => p.side === "radiant");
  const dire = match.players.filter((p) => p.side === "dire");
  const teamTowerMax = Math.max(
    1,
    ...match.players.map((p) => p.towerDamage ?? 0),
  );

  const isUser = (p: PlayerStats) =>
    accountId !== null && p.accountId === accountId;

  const teamKills = (team: PlayerStats[]) =>
    team.reduce((s, p) => s + (p.kills ?? 0), 0);

  const renderTeam = (team: PlayerStats[], label: string, won: boolean | null | undefined) => (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-3 w-3 rounded-full",
              label === "Radiant" ? "bg-success" : "bg-danger",
            )}
            aria-hidden
          />
          <CardTitle>{label}</CardTitle>
        </div>
        <span className="text-sm text-muted">
          Убийств: <span className="text-foreground">{teamKills(team)}</span>
          {won != null && (
            <Badge tone={won ? "success" : "danger"} className="ml-2">
              {won ? "победа" : "поражение"}
            </Badge>
          )}
        </span>
      </div>
      <div className="overflow-x-auto px-2 pb-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="px-2 py-2">Герой</th>
              <th className="px-2 py-2 text-right">K/D/A</th>
              <th className="px-2 py-2 text-right">GPM</th>
              <th className="px-2 py-2 text-right">XPM</th>
              <th className="px-2 py-2 text-right hidden sm:table-cell">LH/DN</th>
              <th className="px-2 py-2 text-right">Нетворс</th>
              <th className="px-2 py-2 text-right hidden md:table-cell">Урон</th>
              <th className="px-2 py-2 text-right hidden md:table-cell">Строения</th>
              <th className="px-2 py-2 text-right hidden lg:table-cell">Лечение</th>
            </tr>
          </thead>
          <tbody>
            {team.map((p, i) => (
              <PlayerRow
                key={`${p.playerSlot ?? i}`}
                player={p}
                isUser={isUser(p)}
                heroName={
                  p.heroId !== undefined
                    ? heroes[String(p.heroId)]?.localized_name
                    : undefined
                }
                heroInternalName={
                  p.heroId !== undefined ? heroes[String(p.heroId)]?.name : undefined
                }
                teamTowerMax={teamTowerMax}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-4 pb-3 text-[11px] text-muted sm:hidden">{KDA_HEROES_HINT}</p>
    </Card>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted">Счёт команд</span>
        <span className="text-lg font-semibold tabular-nums">
          {match.radiantScore ?? "—"} : {match.direScore ?? "—"}
        </span>
        <span className="text-muted">
          Длительность: {formatDuration(match.duration)}
        </span>
      </div>
      {renderTeam(radiant, "Radiant", match.radiantWin)}
      {renderTeam(dire, "Dire", match.radiantWin == null ? undefined : !match.radiantWin)}
    </div>
  );
}
