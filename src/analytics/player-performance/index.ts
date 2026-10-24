/**
 * Player Performance Score (экспериментальная V1) — «Качество собственной игры».
 *
 * Оценивает эффективность действий пользователя, не сводя её к победе
 * и не отождествляя с высоким KDA. Веса настроены под Turbo.
 *
 * Формулы задокументированы в docs/score-model.md.
 */

import {
  MIN_PERFORMANCE_COVERAGE,
  PERFORMANCE_WEIGHTS,
  THRESHOLDS,
  type PerformanceWeights,
} from "../config";
import { computeCoverage } from "../dataCoverage";
import { clamp, mean, round1, scaleLinear } from "../normalization";
import type { MatchDetail, PlayerStats } from "../../domain/models";

export type PerformanceComponentKey =
  | "economy"
  | "teamfights"
  | "objectives"
  | "survivability"
  | "utility"
  | "items";

export interface PerformanceComponent {
  key: PerformanceComponentKey;
  label: string;
  score: number;
  available: boolean;
  metrics: Record<string, number | string>;
  explanation: string;
  missing: string[];
}

export interface PerformanceScoreResult {
  score: number | null;
  components: PerformanceComponent[];
  coverage: number;
  confidence: "low" | "medium" | "high";
  insufficientReason: string | null;
  missingData: string[];
}

const LABELS: Record<PerformanceComponentKey, string> = {
  economy: "Экономика и темп",
  teamfights: "Командные сражения",
  objectives: "Цели и реализация преимущества",
  survivability: "Выживаемость и решения",
  utility: "Полезность для команды",
  items: "Эффективность предметов и сборки",
};

function unavailable(
  key: PerformanceComponentKey,
  missing: string[],
  explanation: string,
): PerformanceComponent {
  return {
    key,
    label: LABELS[key],
    score: 0,
    available: false,
    metrics: {},
    explanation,
    missing,
  };
}

/**
 * Экономика и темп: GPM, XPM, нетворс относительно команды.
 * Относительное сравнение внутри команды учитывает особенности конкретного матча.
 */
function computeEconomy(match: MatchDetail, player: PlayerStats | undefined): PerformanceComponent {
  if (!player) return unavailable("economy", ["player_stats"], "Данные игрока не получены.");
  const missing: string[] = [];
  const metrics: Record<string, number | string> = {};

  const parts: number[] = [];

  if (player.gpm !== undefined) {
    metrics.gpm = player.gpm;
    parts.push(scaleLinear(player.gpm, THRESHOLDS.gpmLow, THRESHOLDS.gpmHigh, 10, 100));
  } else missing.push("gold_per_min");

  if (player.xpm !== undefined) {
    metrics.xpm = player.xpm;
    parts.push(scaleLinear(player.xpm, THRESHOLDS.xpmLow, THRESHOLDS.xpmHigh, 10, 100));
  } else missing.push("xp_per_min");

  const team = match.players.filter((p) => p.side === player.side);
  const nwValues = team.map((p) => p.netWorth).filter((v): v is number => v !== undefined);
  if (player.netWorth !== undefined && nwValues.length >= 2) {
    const avg = nwValues.reduce((s, v) => s + v, 0) / nwValues.length;
    metrics.netWorth = player.netWorth;
    if (avg > 0) {
      const ratio = player.netWorth / avg;
      metrics.netWorthVsTeam = round1(ratio * 100);
      parts.push(scaleLinear(ratio, 0.6, 1.3, 20, 100));
    }
  } else missing.push("net_worth");

  if (parts.length === 0) {
    return unavailable("economy", missing, "Экономические показатели недоступны.");
  }

  return {
    key: "economy",
    label: LABELS.economy,
    score: clamp(Math.round(mean(parts) ?? 0), 0, 100),
    available: true,
    metrics,
    explanation: "GPM и XPM на абсолютной шкале Turbo плюс нетворс относительно среднего по команде.",
    missing,
  };
}

/**
 * Командные сражения: участие в убийствах команды, качество KDA (убийства+помощи к смертям),
 * вклад в общий урон команды.
 */
function computeTeamfights(match: MatchDetail, player: PlayerStats | undefined): PerformanceComponent {
  if (!player) return unavailable("teamfights", ["player_stats"], "Данные игрока не получены.");
  const missing: string[] = [];
  const metrics: Record<string, number | string> = {};

  const team = match.players.filter((p) => p.side === player.side);
  const teamKills = team.reduce((s, p) => s + (p.kills ?? 0), 0);
  const parts: number[] = [];

  const k = player.kills ?? 0;
  const a = player.assists ?? 0;

  if (player.kills !== undefined && player.deaths !== undefined && player.assists !== undefined) {
    const deaths: number = player.deaths;
    const kda = deaths === 0 ? k + a : (k + a) / deaths;
    metrics.kda = round1(kda);
    // KDA учитывается наравне с участием, а не как главный показатель.
    parts.push(scaleLinear(kda, 0.5, 5, 10, 95));
  } else {
    missing.push("kills/deaths/assists");
  }

  if (teamKills > 0 && player.kills !== undefined && player.assists !== undefined) {
    const participation = (k + a) / teamKills;
    metrics.killParticipation = Math.round(participation * 100);
    parts.push(scaleLinear(participation, 0.15, 0.65, 15, 100));
  } else {
    missing.push("team_kills");
  }

  const teamDmg = team.reduce((s, p) => s + (p.heroDamage ?? 0), 0);
  if (teamDmg > 0 && player.heroDamage !== undefined) {
    const share = player.heroDamage / teamDmg;
    metrics.damageShare = Math.round(share * 100);
    parts.push(scaleLinear(share, 0.08, 0.3, 20, 100));
  } else {
    missing.push("hero_damage");
  }

  if (parts.length === 0) {
    return unavailable("teamfights", missing, "Нет данных о боевых действиях.");
  }

  return {
    key: "teamfights",
    label: LABELS.teamfights,
    score: clamp(Math.round(mean(parts) ?? 0), 0, 100),
    available: true,
    metrics,
    explanation: "Вклад в убийства команды, доля в общем уроне и умеренно взвешенный KDA.",
    missing,
  };
}

/**
 * Цели и реализация: урон по строениям, участие в целях (objectives из API),
 * вклад в счёт команды относительно союзников.
 */
function computeObjectives(match: MatchDetail, player: PlayerStats | undefined): PerformanceComponent {
  if (!player) return unavailable("objectives", ["player_stats"], "Данные игрока не получены.");
  const missing: string[] = [];
  const metrics: Record<string, number | string> = {};
  const parts: number[] = [];

  if (player.towerDamage !== undefined) {
    metrics.towerDamage = player.towerDamage;
    parts.push(
      scaleLinear(
        player.towerDamage,
        THRESHOLDS.towerDamageLow,
        THRESHOLDS.towerDamageHigh,
        15,
        100,
      ),
    );
  } else {
    missing.push("tower_damage");
  }

  const durationMin = match.duration !== undefined && match.duration > 0 ? match.duration / 60 : undefined;
  if (durationMin && player.towerDamage !== undefined) {
    metrics.towerDamagePerMin = Math.round(player.towerDamage / durationMin);
  }

  // Метрика урона по строениям у всех игроков команды для сравнения.
  const team = match.players.filter((p) => p.side === player.side);
  const teamTower = team.reduce((s, p) => s + (p.towerDamage ?? 0), 0);
  if (teamTower > 0 && player.towerDamage !== undefined) {
    const share = player.towerDamage / teamTower;
    metrics.towerShare = Math.round(share * 100);
    parts.push(scaleLinear(share, 0.05, 0.4, 25, 95));
  }

  if (parts.length === 0) {
    return unavailable("objectives", ["tower_damage"], "Данные о влиянии на строения недоступны.");
  }

  return {
    key: "objectives",
    label: LABELS.objectives,
    score: clamp(Math.round(mean(parts) ?? 0), 0, 100),
    available: true,
    metrics,
    explanation: "Урон по строениям абсолютный и относительно команды; давление на цели конвертируется в оценку.",
    missing,
  };
}

/**
 * Выживаемость и решения: смерти в минуту относительно команды,
 * доля смертей от общего числа в команде, показатель утечки (leaver_status).
 */
function computeSurvivability(
  match: MatchDetail,
  player: PlayerStats | undefined,
): PerformanceComponent {
  if (!player) return unavailable("survivability", ["player_stats"], "Данные игрока не получены.");
  if (player.deaths === undefined || match.duration === undefined || match.duration <= 0) {
    return unavailable("survivability", ["deaths", "duration"], "Нет данных о смертях или длительности.");
  }
  const missing: string[] = [];
  const metrics: Record<string, number | string> = {};
  const parts: number[] = [];

  const durationMin = match.duration / 60;
  const deathsPerMin = player.deaths / durationMin;
  metrics.deaths = player.deaths;
  metrics.deathsPerMin = round1(deathsPerMin * 100) / 100;
  parts.push(
    scaleLinear(deathsPerMin, THRESHOLDS.deathsPerMinuteHigh, 0, 15, 100),
  );

  const team = match.players.filter((p) => p.side === player.side);
  const teamDeaths = team.reduce((s, p) => s + (p.deaths ?? 0), 0);
  if (teamDeaths > 0) {
    const share = player.deaths / teamDeaths;
    metrics.deathShare = Math.round(share * 100);
    parts.push(scaleLinear(share, 0.35, 0.08, 25, 95));
  } else {
    missing.push("team_deaths");
  }

  if (player.leaverStatus !== undefined) {
    metrics.leaverStatus = player.leaverStatus;
    if (player.leaverStatus > 1) {
      // Покидал игру — штраф.
      return {
        key: "survivability",
        label: LABELS.survivability,
        score: 5,
        available: true,
        metrics,
        explanation: "Игрок прерывал игру (leaver_status > 1), что жёстко снижает оценку.",
        missing,
      };
    }
  }

  return {
    key: "survivability",
    label: LABELS.survivability,
    score: clamp(Math.round(mean(parts) ?? 0), 0, 100),
    available: true,
    metrics,
    explanation: "Частота смертей в минуту и доля смертей от команды, с учётом длительности матча.",
    missing,
  };
}

/**
 * Полезность для команды: ассисты, лечение, покупки обзора (ward purchases)
 * по логу покупок, вклад союзнической поддержки.
 */
function computeUtility(match: MatchDetail, player: PlayerStats | undefined): PerformanceComponent {
  if (!player) return unavailable("utility", ["player_stats"], "Данные игрока не получены.");
  const missing: string[] = [];
  const metrics: Record<string, number | string> = {};
  const parts: number[] = [];

  const team = match.players.filter((p) => p.side === player.side);
  const teamAssists = team.reduce((s, p) => s + (p.assists ?? 0), 0);
  if (teamAssists > 0 && player.assists !== undefined) {
    const share = player.assists / teamAssists;
    metrics.assistShare = Math.round(share * 100);
    parts.push(scaleLinear(share, 0.1, 0.35, 25, 100));
  } else {
    missing.push("assists");
  }

  if (player.heroHealing !== undefined) {
    metrics.heroHealing = player.heroHealing;
    parts.push(
      scaleLinear(player.heroHealing, THRESHOLDS.healingLow, THRESHOLDS.healingHigh, 45, 95),
    );
  }

  // Покупки обзора: observer/sentry в логе покупок.
  const purchaseLog = player.purchaseLog;
  if (purchaseLog && purchaseLog.length > 0) {
    const wards = purchaseLog.filter(
      (e) => e.key === "ward_observer" || e.key === "ward_sentry",
    ).length;
    const obs = purchaseLog.filter((e) => e.key === "ward_observer").length;
    metrics.wardPurchases = wards;
    metrics.observerPurchases = obs;
    parts.push(scaleLinear(obs, 0, 6, 40, 90));
  } else {
    missing.push("purchase_log");
  }

  if (parts.length === 0) {
    return unavailable("utility", missing, "Нет данных о вкладе в поддержку команды.");
  }

  return {
    key: "utility",
    label: LABELS.utility,
    score: clamp(Math.round(mean(parts) ?? 0), 0, 100),
    available: true,
    metrics,
    explanation: "Доля в ассистах команды, лечение и покупки предметов обзора из лога покупок.",
    missing,
  };
}

/**
 * Эффективность предметов и сборки: заполненность слотов, непотраченный золото,
 * наличие предметов верхней ценовой категории по справочнику.
 */
export interface ItemConstantLike {
  cost?: number;
}

function computeItems(
  player: PlayerStats | undefined,
  itemCosts: Record<number, ItemConstantLike> | undefined,
): PerformanceComponent {
  if (!player) return unavailable("items", ["player_stats"], "Данные игрока не получены.");
  const filled = player.items.main.filter((id): id is number => id !== null);
  if (filled.length === 0) {
    return unavailable("items", ["item_slots"], "Сборка предметов не получена из API.");
  }
  const missing: string[] = [];
  const metrics: Record<string, number | string> = {};
  const parts: number[] = [];

  // Заполненность основных слотов.
  const slotFill = filled.length / 6;
  metrics.filledSlots = filled.length;
  parts.push(scaleLinear(slotFill, 3 / 6, 1, 30, 85));

  // Стоимость сборки, если известны цены предметов.
  if (itemCosts) {
    const totalCost = filled.reduce((s, id) => s + (itemCosts[id]?.cost ?? 0), 0);
    metrics.buildCost = totalCost;
    if (totalCost > 0) {
      parts.push(scaleLinear(totalCost, 4000, 20000, 25, 100));
      // Непотраченное золото в конце матча — признак низкой конвертации.
      if (player.gold !== undefined) {
        const unspentRatio = player.gold / (player.gold + totalCost);
        metrics.unspentShare = Math.round(unspentRatio * 100);
        parts.push(scaleLinear(unspentRatio, 0.3, 0.02, 30, 90));
      }
    }
  } else {
    missing.push("item_costs");
  }

  return {
    key: "items",
    label: LABELS.items,
    score: clamp(Math.round(mean(parts) ?? 0), 0, 100),
    available: true,
    metrics,
    explanation: "Заполненность слотов, стоимость сборки по справочнику предметов и доля непотраченного золота.",
    missing,
  };
}

export interface PerformanceScoreOptions {
  weights?: Partial<PerformanceWeights>;
  /** Стоимости предметов: itemId -> { cost } (из GET /constants/items). */
  itemCosts?: Record<number, ItemConstantLike>;
}

/**
 * Рассчитывает Player Performance Score.
 *
 * Правила при неполных данных:
 * - недоступный компонент не заменяется нулям, а исключается;
 * - веса доступных компонентов перераспределяются пропорционально;
 * - при покрытии < MIN_PERFORMANCE_COVERAGE итог не выдаётся.
 */
export function computePlayerPerformanceScore(
  match: MatchDetail,
  player: PlayerStats | undefined,
  options: PerformanceScoreOptions = {},
): PerformanceScoreResult {
  const weights: PerformanceWeights = { ...PERFORMANCE_WEIGHTS, ...options.weights };

  const components: PerformanceComponent[] = [
    computeEconomy(match, player),
    computeTeamfights(match, player),
    computeObjectives(match, player),
    computeSurvivability(match, player),
    computeUtility(match, player),
    computeItems(player, options.itemCosts),
  ];

  const available = components.filter((c) => c.available);
  const weightSum = available.reduce((s, c) => s + weights[c.key], 0);
  const coverage = round1(weightSum * 100) / 100;
  const missingData = computeCoverage(match, player).missing;

  const base: Omit<PerformanceScoreResult, "score" | "insufficientReason"> = {
    components,
    coverage,
    confidence: coverage >= 0.85 ? "high" : coverage >= 0.65 ? "medium" : "low",
    missingData,
  };

  if (weightSum < MIN_PERFORMANCE_COVERAGE) {
    return {
      ...base,
      score: null,
      insufficientReason:
        "Недостаточно данных для оценки игры: доступно " +
        Math.round(weightSum * 100) +
        "% весов модели (требуется минимум " +
        Math.round(MIN_PERFORMANCE_COVERAGE * 100) +
        "%).",
    };
  }

  const total =
    available.reduce((s, c) => s + c.score * weights[c.key], 0) / weightSum;

  return {
    ...base,
    score: clamp(Math.round(total), 0, 100),
    insufficientReason: null,
  };
}
