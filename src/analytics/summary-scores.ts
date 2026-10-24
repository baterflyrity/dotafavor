/**
 * Оценки для элементов списка матчей.
 *
 * В истории доступны только краткие поля игрока — без временных рядов
 * и данных союзников, поэтому для списка используется документированный
 * упрощённый вариант: часть компонентов недоступна, их веса
 * перераспределяются. Точная оценка считается на странице матча.
 *
 * Подробности: docs/score-model.md (раздел «Оценки в списке»).
 */

import { clamp, mean, round1, scaleLinear } from "./normalization";
import { THRESHOLDS } from "./config";
import type { MatchSummary } from "../domain/models";

export interface SummaryScore {
  score: number | null;
  /** Доля доступных весов 0–1. */
  coverage: number;
  /** Оценка приблизительная (без временных рядов и данных команды). */
  approximate: boolean;
  reason?: string;
}

/** Качество матча по кратким данным истории: темп + вовлечённость. */
export function computeSummaryExperience(summary: MatchSummary): SummaryScore {
  const hasDuration = summary.duration !== undefined && summary.duration > 0;
  const hasStats =
    summary.kills !== undefined && summary.deaths !== undefined;

  const parts: number[] = [];
  let weightAvailable = 0;

  if (hasDuration) {
    weightAvailable += 0.5;
    const [idealMin, idealMax] = THRESHOLDS.turboDurationIdeal;
    const durationScore =
      summary.duration! < idealMin
        ? scaleLinear(summary.duration!, 300, idealMin, 45, 85)
        : summary.duration! > idealMax
          ? scaleLinear(summary.duration!, idealMax, 3600, 85, 50)
          : 90;
    parts.push(durationScore);
  }

  if (hasDuration && hasStats) {
    weightAvailable += 0.5;
    const perMin = (summary.kills! + summary.deaths!) / (summary.duration! / 60);
    parts.push(scaleLinear(perMin, 0.15, 1.2, 25, 100));
  }

  const coverage = round1(weightAvailable * 100) / 100;
  if (weightAvailable < 0.5 || parts.length === 0) {
    return {
      score: null,
      coverage,
      approximate: true,
      reason: "Недостаточно данных истории для оценки.",
    };
  }

  return {
    score: clamp(Math.round(mean(parts) ?? 0), 0, 100),
    coverage,
    approximate: true,
  };
}

/** Качество собственной игры по кратким данным истории: экономика, боевой вклад, выживаемость. */
export function computeSummaryPerformance(summary: MatchSummary): SummaryScore {
  const parts: { w: number; v: number }[] = [];
  let weightAvailable = 0;

  if (summary.gpm !== undefined) {
    weightAvailable += 0.4;
    parts.push({
      w: 0.4,
      v: scaleLinear(summary.gpm, THRESHOLDS.gpmLow, THRESHOLDS.gpmHigh, 10, 100),
    });
  }
  if (
    summary.kills !== undefined &&
    summary.deaths !== undefined &&
    summary.assists !== undefined
  ) {
    weightAvailable += 0.3;
    const kda = (summary.kills + summary.assists) / Math.max(summary.deaths, 1);
    parts.push({ w: 0.3, v: scaleLinear(kda, 0.5, 5, 10, 95) });
  }
  if (summary.deaths !== undefined && summary.duration !== undefined && summary.duration > 0) {
    weightAvailable += 0.3;
    const dpm = summary.deaths / (summary.duration / 60);
    parts.push({ w: 0.3, v: scaleLinear(dpm, THRESHOLDS.deathsPerMinuteHigh, 0, 15, 100) });
  }

  const coverage = round1(weightAvailable * 100) / 100;
  if (weightAvailable < 0.5 || parts.length === 0) {
    return {
      score: null,
      coverage,
      approximate: true,
      reason: "Недостаточно данных истории для оценки.",
    };
  }

  const total = parts.reduce((s, p) => s + p.v * p.w, 0) / weightAvailable;
  return {
    score: clamp(Math.round(total), 0, 100),
    coverage,
    approximate: true,
  };
}
