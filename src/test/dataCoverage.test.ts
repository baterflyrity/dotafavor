import { describe, expect, it } from "vitest";
import { computeCoverage } from "../analytics/dataCoverage";
import {
  computeSummaryExperience,
  computeSummaryPerformance,
} from "../analytics/summary-scores";
import type { MatchDetail, MatchSummary, PlayerStats } from "../domain/models";

const player: PlayerStats = {
  playerSlot: 1,
  side: "radiant",
  kills: 5,
  deaths: 3,
  assists: 7,
  gpm: 550,
  items: { main: [1], backpack: [null, null, null], neutral: null, neutral2: null },
};

const emptyMatch: MatchDetail = {
  matchId: 1,
  players: [player],
  missing: [],
};

describe("DataCoverage", () => {
  it("собирает доступные и отсутствующие флаги", () => {
    const report = computeCoverage(emptyMatch, player);
    expect(report.available).toContain("player_stats");
    expect(report.available).toContain("items");
    expect(report.missing).toContain("gold_adv");
    expect(report.missing).toContain("teamfights");
    expect(report.ratio).toBeGreaterThan(0);
    expect(report.ratio).toBeLessThan(1);
  });

  it("полный матч покрыт полностью", () => {
    const full: MatchDetail = {
      matchId: 2,
      duration: 1500,
      players: [player, { ...player, playerSlot: 2, purchaseLog: [{ key: "t", time: 0 }] }],
      radiantGoldAdv: [1, 2, 3],
      radiantXpAdv: [1, 2, 3],
      teamfights: [{ start: 0, end: 10 }],
      events: [{ type: "CHAT_MESSAGE_ROSHAN_KILL", time: 100 }],
      missing: [],
    };
    const report = computeCoverage(full, { ...player, purchaseLog: [{ key: "t", time: 0 }] });
    expect(report.missing).toEqual([]);
    expect(report.ratio).toBe(1);
  });

  it("без игрока player_stats отсутствует", () => {
    const report = computeCoverage(emptyMatch, undefined);
    expect(report.missing).toContain("player_stats");
    expect(report.missing).toContain("items");
  });
});

describe("Оценки в списке матчей (summary-scores)", () => {
  const base: MatchSummary = {
    matchId: 1,
    duration: 1500,
    startTime: 1726000000,
    result: "win",
    kills: 10,
    deaths: 2,
    assists: 12,
    gpm: 600,
    incomplete: false,
  };

  it("качество матча по кратким данным доступно и приблизительно", () => {
    const r = computeSummaryExperience(base);
    expect(r.score).not.toBeNull();
    expect(r.approximate).toBe(true);
    expect(r.score!).toBeGreaterThanOrEqual(0);
    expect(r.score!).toBeLessThanOrEqual(100);
  });

  it("без длительности и статистики оценка не выдаётся", () => {
    const r = computeSummaryExperience({ matchId: 2, result: "unknown", incomplete: true });
    expect(r.score).toBeNull();
    expect(r.reason).toContain("Недостаточно данных");
  });

  it("оценка собственной игры считается из GPM/KDA/смертей и отказывается при нехватке", () => {
    const ok = computeSummaryPerformance(base);
    expect(ok.score).not.toBeNull();

    const noData = computeSummaryPerformance({
      matchId: 3,
      result: "unknown",
      incomplete: true,
    });
    expect(noData.score).toBeNull();
    expect(noData.coverage).toBeLessThan(0.5);
  });

  it("границы: нулевые значения не приводят к ошибкам и остаются в 0–100", () => {
    const zero: MatchSummary = {
      matchId: 4,
      duration: 60,
      startTime: 1,
      result: "loss",
      kills: 0,
      deaths: 0,
      assists: 0,
      gpm: 0,
      incomplete: false,
    };
    const e = computeSummaryExperience(zero);
    const p = computeSummaryPerformance(zero);
    if (e.score !== null) {
      expect(e.score).toBeGreaterThanOrEqual(0);
      expect(e.score).toBeLessThanOrEqual(100);
    }
    if (p.score !== null) {
      expect(p.score).toBeGreaterThanOrEqual(0);
      expect(p.score).toBeLessThanOrEqual(100);
    }
  });
});
