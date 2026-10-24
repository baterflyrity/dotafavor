/**
 * Match Experience Score (экспериментальная V1) — «Качество матча».
 *
 * Оценивает, насколько матч был интересным и конкурентным, по доступным данным.
 * Не сводится к победе/поражению и не претендует на объективную истину.
 *
 * Формулы и пороги задокументированы в docs/score-model.md.
 */

import { EXPERIENCE_WEIGHTS, MIN_EXPERIENCE_COVERAGE, THRESHOLDS, type ExperienceWeights } from "../config";
import { computeCoverage, type CoverageReport } from "../dataCoverage";
import { clamp, mean, round1, safeDiv, scaleLinear } from "../normalization";
import type { MatchDetail, PlayerStats, Side } from "../../domain/models";

export type ComponentKey = "parity" | "agency" | "teamwork" | "pace";

export interface ScoreComponent {
  key: ComponentKey;
  label: string;
  /** Оценка компонента 0–100. */
  score: number;
  /** Компонент недоступен из-за нехватки данных. */
  available: boolean;
  /** Метрики, повлиявшие на оценку (только реально доступные значения). */
  metrics: Record<string, number | string>;
  /** Краткое объяснение. */
  explanation: string;
  /** Отсутствующие данные, мешавшие оценке. */
  missing: string[];
}

export interface ExperienceScoreResult {
  /** Итоговый балл 0–100 или null, если покрытия недостаточно. */
  score: number | null;
  components: ScoreComponent[];
  /** Покрытие: доля доступных весов компонентов 0–1. */
  coverage: number;
  confidence: "low" | "medium" | "high";
  /** Причина отказа от итогового балла. */
  insufficientReason: string | null;
  missingData: string[];
}

const LABELS: Record<ComponentKey, string> = {
  parity: "Равенство и напряжённость",
  agency: "Возможность влиять на игру",
  teamwork: "Полезность союзников",
  pace: "Темп и вовлечённость",
};

function unavailable(key: ComponentKey, missing: string[], explanation: string): ScoreComponent {
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

/** Сторона игрока определяется по его данным в матче. */
function playerSide(player: PlayerStats | undefined): Side | undefined {
  return player?.side;
}

/**
 * 9.1. Равенство и напряжённость.
 * Использует radiant_gold_adv / radiant_xp_adv. Напряжение ряда оценивается
 * относительно стороны игрока (знак преимущества инвертируется для Dire).
 * Без временных рядов компонент недоступен — итог не выводится из конечного счёта.
 */
function computeParity(match: MatchDetail, side: Side | undefined): ScoreComponent {
  const missing: string[] = [];
  const gold = match.radiantGoldAdv;
  const xp = match.radiantXpAdv;

  if (!gold || gold.length < 5) {
    missing.push("radiant_gold_adv");
  }
  if (!xp || xp.length < 5) {
    missing.push("radiant_xp_adv");
  }
  if (gold === undefined && xp === undefined) {
    return unavailable(
      "parity",
      ["radiant_gold_adv", "radiant_xp_adv"],
      "Временных рядов преимущества нет — равенство по конечному счёту не оценивается.",
    );
  }

  const sign = side === "dire" ? -1 : 1;
  const metrics: Record<string, number | string> = {};

  // 1) Доля времени «в интриге»: |advantage| ниже порога с поправкой на длительность.
  let intrigueShare: number | undefined;
  if (gold && gold.length >= 5) {
    const durationMin = Math.max((match.duration ?? gold.length * 60) / 60, 1);
    // Порог масштабируется: 1500 золота на 10 минут игры.
    const gate = (THRESHOLDS.intrigueGoldPer10Min / 10) * durationMin;
    const close = gold.filter((g) => Math.abs(g * sign) < gate).length;
    intrigueShare = close / gold.length;
    metrics.intrigueShare = Math.round(intrigueShare * 100);
  }

  // 2) Смены лидерства (комбэки).
  const source = gold ?? xp!;
  let leadChanges = 0;
  let prevSign = 0;
  let maxSwing = 0;
  let prev = source[0] * sign;
  for (const raw of source) {
    const v = raw * sign;
    maxSwing = Math.max(maxSwing, Math.abs(v - prev));
    prev = v;
    const s = Math.sign(v);
    if (s !== 0 && prevSign !== 0 && s !== prevSign) leadChanges++;
    if (s !== 0) prevSign = s;
  }
  metrics.leadChanges = leadChanges;
  metrics.maxSwing = Math.round(maxSwing);

  // 3) Односторонность: среднее |advantage| относительно длительности.
  const absMean = mean(source.map((v) => Math.abs(v * sign)));
  const durationMin = Math.max((match.duration ?? source.length * 60) / 60, 1);
  const meanPer10 = absMean !== undefined ? (absMean / durationMin) * 10 : undefined;
  if (meanPer10 !== undefined) metrics.meanLeadPer10Min = Math.round(meanPer10);

  const intrigueScore =
    intrigueShare !== undefined
      ? scaleLinear(intrigueShare, 0.1, 0.7, 0, 100)
      : undefined;
  const swingScore = scaleLinear(leadChanges, 0, THRESHOLDS.minLeadChangesForComeback * 2, 20, 100);
  const balanceScore =
    meanPer10 !== undefined ? scaleLinear(meanPer10, 6000, 500, 0, 100) : undefined;

  const parts = [intrigueScore, swingScore, balanceScore].filter(
    (v): v is number => v !== undefined,
  );
  const score = Math.round(mean(parts) ?? 0);

  return {
    key: "parity",
    label: LABELS.parity,
    score: clamp(score, 0, 100),
    available: true,
    metrics,
    explanation:
      "Оценено по временным рядам преимущества: доля времени в интриге, смены лидерства и средний размер отрыва.",
    missing,
  };
}

/**
 * 9.2. Возможность влиять на игру.
 * Участие в убийствах команды, урон по героям и строениям, лечение, активность.
 * Не сводится к количеству убийств.
 */
function computeAgency(match: MatchDetail, player: PlayerStats | undefined): ScoreComponent {
  if (!player) {
    return unavailable("agency", ["player_stats"], "Данные игрока не получены.");
  }
  const missing: string[] = [];
  const metrics: Record<string, number | string> = {};

  const team = match.players.filter((p) => p.side === player.side);
  const teamKills = team.reduce((s, p) => s + (p.kills ?? 0), 0);
  const playerKills = player.kills ?? 0;
  const playerAssists = player.assists ?? 0;

  const participation =
    teamKills > 0 ? (playerKills + playerAssists) / teamKills : undefined;
  if (participation !== undefined) metrics.killParticipation = Math.round(participation * 100);
  else missing.push("kills/assists");

  const durationMin = match.duration !== undefined ? match.duration / 60 : undefined;
  const dmgPerMin =
    player.heroDamage !== undefined && durationMin
      ? player.heroDamage / durationMin
      : undefined;
  if (dmgPerMin !== undefined) metrics.heroDamagePerMin = Math.round(dmgPerMin);
  else missing.push("hero_damage");

  const towerPerMin =
    player.towerDamage !== undefined && durationMin
      ? player.towerDamage / durationMin
      : undefined;
  if (towerPerMin !== undefined) metrics.towerDamagePerMin = Math.round(towerPerMin);
  else missing.push("tower_damage");

  const healPerMin =
    player.heroHealing !== undefined && durationMin
      ? player.heroHealing / durationMin
      : undefined;
  if (healPerMin !== undefined) metrics.heroHealingPerMin = Math.round(healPerMin);

  const parts: number[] = [];
  if (participation !== undefined) {
    parts.push(scaleLinear(participation, THRESHOLDS.lowKillParticipation, THRESHOLDS.highKillParticipation, 15, 100));
  }
  if (dmgPerMin !== undefined) parts.push(scaleLinear(dmgPerMin, 150, 900, 20, 100));
  if (towerPerMin !== undefined) parts.push(scaleLinear(towerPerMin, 20, 250, 20, 100));
  if (healPerMin !== undefined) parts.push(scaleLinear(healPerMin, 0, 200, 40, 95));

  if (parts.length === 0) {
    return unavailable("agency", ["kills", "hero_damage", "tower_damage"], "Нет ни одного показателя воздействия.");
  }

  return {
    key: "agency",
    label: LABELS.agency,
    score: clamp(Math.round(mean(parts) ?? 0), 0, 100),
    available: true,
    metrics,
    explanation:
      "Суммируются участие в убийствах команды, урон по героям, давление на строения и лечение — убийства в отдельности не решают.",
    missing,
  };
}

/**
 * 9.3. Полезность и взаимодействие союзников.
 * Рассеяние помощи по команде, совместное участие в убийствах,
 * конвертация давления в цели (урон по строениям), поддержка лечением.
 */
function computeTeamwork(match: MatchDetail, player: PlayerStats | undefined): ScoreComponent {
  if (!player) {
    return unavailable("teamwork", ["player_stats"], "Данные игрока не получены.");
  }
  const missing: string[] = [];
  const metrics: Record<string, number | string> = {};

  const allies = match.players.filter((p) => p.side === player.side && p !== player);
  const team = [player, ...allies];
  const teamKills = team.reduce((s, p) => s + (p.kills ?? 0), 0);

  const assistsKnown = team.every((p) => p.assists !== undefined);
  if (assistsKnown && teamKills > 0) {
    const assists = team.map((p) => p.assists ?? 0);
    const totalAssists = assists.reduce((s, v) => s + v, 0);
    if (totalAssists > 0) {
      // Распределение помощи: чем равномернее вклад союзников, тем выше.
      const expected = totalAssists / assists.length;
      const deviation =
        assists.reduce((s, v) => s + Math.abs(v - expected), 0) / assists.length;
      const giniLike = expected > 0 ? deviation / expected : 1;
      metrics.assistBalance = round1(clamp(1 - giniLike / 2, 0, 1) * 100);
    }
    const avgAssists = totalAssists / team.length;
    metrics.avgAssistsPerPlayer = round1(avgAssists);
  } else {
    missing.push("assists (не у всех игроков)");
  }

  // Совместное участие: сколько союзников имеет ненулевые ассисты при убийствах команды.
  if (assistsKnown && teamKills > 0) {
    const involved = team.filter((p) => (p.assists ?? 0) > 0).length;
    metrics.teamInvolveShare = Math.round((involved / team.length) * 100);
  }

  // Конвертация давления в цели.
  const towerSum = team.reduce((s, p) => s + (p.towerDamage ?? 0), 0);
  const anyTower = team.some((p) => p.towerDamage !== undefined);
  if (anyTower) metrics.teamTowerDamage = Math.round(towerSum);
  else missing.push("tower_damage");

  const healingSum = team.reduce((s, p) => s + (p.heroHealing ?? 0), 0);
  const anyHeal = team.some((p) => p.heroHealing !== undefined);
  if (anyHeal) metrics.teamHealing = Math.round(healingSum);

  const parts: number[] = [];
  const balance = metrics.assistBalance as number | undefined;
  if (balance !== undefined) parts.push(balance);
  const involve = metrics.teamInvolveShare as number | undefined;
  if (involve !== undefined) parts.push(scaleLinear(involve, 30, 100, 20, 100));
  if (anyTower) parts.push(scaleLinear(towerSum, 2000, 15000, 30, 100));
  if (anyHeal) parts.push(scaleLinear(healingSum, 0, 8000, 45, 90));

  if (parts.length === 0) {
    return unavailable("teamwork", ["assists", "tower_damage"], "Нет данных о совместных действиях команды.");
  }

  return {
    key: "teamwork",
    label: LABELS.teamwork,
    score: clamp(Math.round(mean(parts) ?? 0), 0, 100),
    available: true,
    metrics,
    explanation:
      "Оценивается распределение помощи между союзниками, вовлечённость команды в убийства, общий урон по строениям и лечение. Мотивы и токсичность не оцениваются.",
    missing,
  };
}

/**
 * 9.4. Темп и вовлечённость.
 * Длительность в контексте Turbo, плотность событий, смерти, командные бои.
 * Длинный матч сам по себе не считается плохим.
 */
function computePace(match: MatchDetail, player: PlayerStats | undefined): ScoreComponent {
  if (match.duration === undefined || match.duration <= 0 || !player) {
    return unavailable("pace", ["duration", "player_stats"], "Нет длительности матча или данных игрока.");
  }
  const missing: string[] = [];
  const metrics: Record<string, number | string> = {};

  const durationMin = match.duration / 60;
  metrics.durationMin = round1(durationMin);

  const [idealMin, idealMax] = THRESHOLDS.turboDurationIdeal;
  const durationScore =
    match.duration < idealMin
      ? scaleLinear(match.duration, 300, idealMin, 45, 85)
      : match.duration > idealMax
        ? scaleLinear(match.duration, idealMax, 3600, 85, 50)
        : 90;
  metrics.durationScore = durationScore;

  // Плотность событий: смерти + убийства игрока в минуту.
  const events = (player.kills ?? 0) + (player.deaths ?? 0);
  const eventsPerMin = events / durationMin;
  metrics.eventsPerMin = round1(eventsPerMin);
  const activityScore = scaleLinear(eventsPerMin, 0.15, 1.2, 25, 100);

  // Командные бои (если есть): их количество говорит об активности матча.
  let fightScore: number | undefined;
  if (match.teamfights && match.teamfights.length > 0) {
    const fightsPerMin = match.teamfights.length / durationMin;
    metrics.teamfights = match.teamfights.length;
    fightScore = scaleLinear(fightsPerMin, 0.05, 0.5, 30, 100);
  } else {
    missing.push("teamfights");
  }

  const parts = [durationScore, activityScore, ...(fightScore !== undefined ? [fightScore] : [])];

  return {
    key: "pace",
    label: LABELS.pace,
    score: clamp(Math.round(mean(parts) ?? 0), 0, 100),
    available: true,
    metrics,
    explanation:
      "Длительность оценивается в контексте Turbo, вместе с плотностью боевых событий и количеством командных боёв при их наличии.",
    missing,
  };
}

export interface ExperienceScoreOptions {
  weights?: Partial<ExperienceWeights>;
}

/**
 * Рассчитывает Match Experience Score для матча с точки зрения игрока.
 *
 * Правила перераспределения весов:
 * - компонент без данных исключается, его вес делится между доступными
 *   пропорционально их исходным весам;
 * - если покрытие (сумма доступных весов) < MIN_EXPERIENCE_COVERAGE,
 *   итоговый балл не выдаётся (score = null).
 */
export function computeMatchExperienceScore(
  match: MatchDetail,
  player: PlayerStats | undefined,
  options: ExperienceScoreOptions = {},
): ExperienceScoreResult {
  const weights: ExperienceWeights = { ...EXPERIENCE_WEIGHTS, ...options.weights };

  const side = playerSide(player);
  const components: ScoreComponent[] = [
    computeParity(match, side),
    computeAgency(match, player),
    computeTeamwork(match, player),
    computePace(match, player),
  ];

  const available = components.filter((c) => c.available);
  const weightSum = available.reduce((s, c) => s + weights[c.key], 0);
  const coverage = round1(weightSum * 100) / 100;

  const coverageReport: CoverageReport = computeCoverage(match, player);
  const missingData = coverageReport.missing;

  const base: Omit<ExperienceScoreResult, "score" | "insufficientReason"> = {
    components,
    coverage,
    confidence: coverage >= 0.85 ? "high" : coverage >= 0.65 ? "medium" : "low",
    missingData,
  };

  if (weightSum < MIN_EXPERIENCE_COVERAGE) {
    return {
      ...base,
      score: null,
      insufficientReason:
        "Недостаточно данных для содержательной оценки: доступно " +
        Math.round(weightSum * 100) +
        "% весов модели (требуется минимум " +
        Math.round(MIN_EXPERIENCE_COVERAGE * 100) +
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

export { safeDiv };
