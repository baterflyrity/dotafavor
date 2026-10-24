/**
 * MatchMapper: нормализация внешних ответов OpenDota в модели приложения.
 *
 * Отсутствующие поля НЕ заменяются нулями — они остаются undefined,
 * чтобы слои оценок могли отличить «нет данных» от «ноль».
 */

import type {
  ApiMatchDetail,
  ApiMatchPlayer,
  ApiMatchSummary,
} from "../../services/opendota/types";
import type {
  MatchDetail,
  MatchResult,
  MatchSummary,
  PlayerItems,
  PlayerStats,
  Side,
} from "../models";

/** Слот 0–127 соответствует Radiant, 128–255 — Dire. */
export function sideFromSlot(playerSlot: number): Side {
  return playerSlot < 128 ? "radiant" : "dire";
}

/**
 * Определяет результат матча относительно стороны игрока.
 * Победа учитывает radiant_win и сторону игрока.
 * Если radiant_win неизвестен — результат "unknown", а не поражение.
 */
export function resultForPlayer(
  radiantWin: boolean | null | undefined,
  side: Side,
): MatchResult {
  if (radiantWin === null || radiantWin === undefined) return "unknown";
  const radiantWon = radiantWin;
  if (side === "radiant") return radiantWon ? "win" : "loss";
  return radiantWon ? "loss" : "win";
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function pickItems(p: ApiMatchPlayer): PlayerItems {
  const slot = (key: "item_0" | "item_1" | "item_2" | "item_3" | "item_4" | "item_5") =>
    typeof p[key] === "number" ? (p[key] as number) : null;
  const bag = (key: "backpack_0" | "backpack_1" | "backpack_2") =>
    typeof p[key] === "number" ? (p[key] as number) : null;
  return {
    main: [slot("item_0"), slot("item_1"), slot("item_2"), slot("item_3"), slot("item_4"), slot("item_5")],
    backpack: [bag("backpack_0"), bag("backpack_1"), bag("backpack_2")],
    neutral: typeof p.item_neutral === "number" ? p.item_neutral : null,
    neutral2: typeof p.item_neutral2 === "number" ? p.item_neutral2 : null,
  };
}

/** Маппинг строки истории. */
export function mapMatchSummary(api: ApiMatchSummary): MatchSummary {
  const side = api.player_slot !== undefined ? sideFromSlot(api.player_slot) : undefined;
  const result = side ? resultForPlayer(api.radiant_win, side) : "unknown";

  const summary: MatchSummary = {
    matchId: api.match_id,
    startTime: num(api.start_time),
    duration: num(api.duration),
    heroId: num(api.hero_id),
    gameMode: num(api.game_mode),
    lobbyType: num(api.lobby_type),
    result,
    side,
    kills: num(api.kills),
    deaths: num(api.deaths),
    assists: num(api.assists),
    lastHits: num(api.last_hits),
    denies: num(api.denies),
    gpm: num(api.gold_per_min),
    xpm: num(api.xp_per_min),
    netWorth: num(api.net_worth),
    leaverStatus: num(api.leaver_status),
    incomplete:
      api.player_slot === undefined ||
      api.radiant_win === undefined ||
      api.radiant_win === null ||
      api.duration === undefined ||
      api.duration <= 0,
  };
  return summary;
}

function mapPlayer(p: ApiMatchPlayer): PlayerStats {
  const side: Side =
    p.isRadiant !== undefined
      ? p.isRadiant
        ? "radiant"
        : "dire"
      : sideFromSlot(p.player_slot ?? 0);

  const stats: PlayerStats = {
    playerSlot: num(p.player_slot),
    accountId: num(p.account_id),
    heroId: num(p.hero_id),
    personaName: p.personaname ?? null,
    side,
    kills: num(p.kills),
    deaths: num(p.deaths),
    assists: num(p.assists),
    lastHits: num(p.last_hits),
    denies: num(p.denies),
    gpm: num(p.gold_per_min),
    xpm: num(p.xp_per_min),
    level: num(p.level),
    netWorth: num(p.net_worth),
    gold: num(p.gold),
    goldSpent: num(p.gold_spent),
    heroDamage: num(p.hero_damage),
    towerDamage: num(p.tower_damage),
    heroHealing: num(p.hero_healing),
    leaverStatus: num(p.leaver_status),
    items: pickItems(p),
    purchaseLog: Array.isArray(p.purchase_log)
      ? p.purchase_log
          .filter((e) => e && typeof e.key === "string")
          .map((e) => ({ key: e.key, time: num(e.time) ?? 0 }))
      : undefined,
  };
  return stats;
}

/** Маппинг детального матча с фиксацией отсутствующих данных. */
export function mapMatchDetail(api: ApiMatchDetail): MatchDetail {
  const missing: string[] = [];
  const players = (api.players ?? []).map(mapPlayer);

  const hasAdv = Array.isArray(api.radiant_gold_adv) && api.radiant_gold_adv.length > 0;
  const hasXpAdv = Array.isArray(api.radiant_xp_adv) && api.radiant_xp_adv.length > 0;
  if (!hasAdv) missing.push("radiant_gold_adv");
  if (!hasXpAdv) missing.push("radiant_xp_adv");
  if (!Array.isArray(api.teamfights) || api.teamfights.length === 0) missing.push("teamfights");
  if (!Array.isArray(api.objectives) || api.objectives.length === 0) missing.push("objectives");
  if (api.duration === undefined) missing.push("duration");

  const teamfights =
    Array.isArray(api.teamfights) && api.teamfights.length > 0
      ? api.teamfights.map((tf) => ({
          start: num(tf.start),
          end: num(tf.end),
          win: num(tf.win),
          damage: tf.players?.map((pp) => num(pp.damage) ?? 0),
          goldDelta: tf.players?.map((pp) => num(pp.gold_delta) ?? 0),
        }))
      : undefined;

  const events =
    Array.isArray(api.objectives) && api.objectives.length > 0
      ? api.objectives.map((o) => ({
          type: o.type,
          time: num(o.time),
          label: typeof o.key === "string" ? o.key : o.type,
        }))
      : undefined;

  return {
    matchId: api.match_id,
    startTime: num(api.start_time),
    duration: num(api.duration),
    radiantWin: api.radiant_win ?? null,
    gameMode: num(api.game_mode),
    lobbyType: num(api.lobby_type),
    radiantScore: num(api.radiant_score),
    direScore: num(api.dire_score),
    patch: num(api.patch),
    players,
    radiantGoldAdv: hasAdv ? (api.radiant_gold_adv as number[]) : undefined,
    radiantXpAdv: hasXpAdv ? (api.radiant_xp_adv as number[]) : undefined,
    teamfights,
    events,
    missing,
  };
}
