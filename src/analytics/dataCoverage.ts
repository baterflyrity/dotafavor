/**
 * DataCoverage: полнота и достоверность исходных данных.
 *
 * Определяет, какие поля реально доступны в ответе API, чтобы оценки
 * не подменяли отсутствие данных нулями и умели отказаться от итогового балла.
 */

import type { MatchDetail, PlayerStats } from "../domain/models";

/** Имена полей, участвующих в покрытии. */
export type CoverageFlag =
  | "duration"
  | "players"
  | "player_stats"
  | "gold_adv"
  | "xp_adv"
  | "objectives"
  | "teamfights"
  | "items"
  | "purchase_log";

export interface CoverageReport {
  /** Доступные флаги. */
  available: CoverageFlag[];
  /** Отсутствующие флаги. */
  missing: CoverageFlag[];
  /** Доля доступных флагов 0–1. */
  ratio: number;
}

function hasPlayerStats(player: PlayerStats | undefined): boolean {
  if (!player) return false;
  return (
    player.kills !== undefined ||
    player.deaths !== undefined ||
    player.assists !== undefined ||
    player.gpm !== undefined ||
    player.netWorth !== undefined
  );
}

function hasItems(player: PlayerStats | undefined): boolean {
  if (!player) return false;
  return player.items.main.some((id) => id !== null) || player.items.neutral !== null;
}

const ALL_FLAGS: CoverageFlag[] = [
  "duration",
  "players",
  "player_stats",
  "gold_adv",
  "xp_adv",
  "objectives",
  "teamfights",
  "items",
  "purchase_log",
];

/** Собирает отчёт о покрытии данных матча относительно игрока. */
export function computeCoverage(
  match: MatchDetail,
  player: PlayerStats | undefined,
): CoverageReport {
  const flags: Record<CoverageFlag, boolean> = {
    duration: match.duration !== undefined && match.duration > 0,
    players: match.players.length >= 2,
    player_stats: hasPlayerStats(player),
    gold_adv: (match.radiantGoldAdv?.length ?? 0) > 0,
    xp_adv: (match.radiantXpAdv?.length ?? 0) > 0,
    objectives: (match.events?.length ?? 0) > 0,
    teamfights: (match.teamfights?.length ?? 0) > 0,
    items: hasItems(player),
    purchase_log: (player?.purchaseLog?.length ?? 0) > 0,
  };

  const available = ALL_FLAGS.filter((f) => flags[f]);
  const missing = ALL_FLAGS.filter((f) => !flags[f]);
  return {
    available,
    missing,
    ratio: available.length / ALL_FLAGS.length,
  };
}
