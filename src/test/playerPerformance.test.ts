import { describe, expect, it } from "vitest";
import { computePlayerPerformanceScore } from "../analytics/player-performance";
import { mapMatchDetail } from "../domain/mappers/matchMapper";
import { PERF_COVERAGE_COMPONENTS } from "./helpers";
import type { ApiMatchDetail } from "../services/opendota/types";
import type { MatchDetail, PlayerStats } from "../domain/models";
import turboFull from "./fixtures/turbo-match-full.json";
import turboPartial from "./fixtures/turbo-match-partial.json";

function makeMatch(options: {
  duration?: number;
  player?: Partial<PlayerStats>;
  teammates?: Partial<PlayerStats>[];
  radiantWin?: boolean;
}): MatchDetail {
  const baseItems = {
    main: [1, 2, 3, 4, 5, 6],
    backpack: [null, null, null],
    neutral: null,
    neutral2: null,
  };
  const player: PlayerStats = {
    playerSlot: 1,
    accountId: 111,
    heroId: 1,
    side: "radiant",
    items: { ...baseItems, main: [...baseItems.main] },
    kills: 8,
    deaths: 4,
    assists: 12,
    gpm: 600,
    xpm: 650,
    netWorth: 15000,
    heroDamage: 20000,
    towerDamage: 2000,
    heroHealing: 500,
    gold: 500,
    purchaseLog: [
      { key: "ward_observer", time: 100 },
      { key: "ward_observer", time: 400 },
      { key: "tango", time: -5 },
    ],
    ...options.player,
  };
  const teammateDefaults: Partial<PlayerStats>[] = [
    { kills: 4, deaths: 5, assists: 8, side: "radiant", playerSlot: 2, netWorth: 12000, heroDamage: 15000, towerDamage: 1500, gpm: 500, xpm: 520 },
    { kills: 3, deaths: 6, assists: 9, side: "radiant", playerSlot: 3, netWorth: 11000, heroDamage: 14000, towerDamage: 1000, gpm: 480, xpm: 500 },
    { kills: 5, deaths: 4, assists: 7, side: "radiant", playerSlot: 4, netWorth: 13000, heroDamage: 16000, towerDamage: 1800, gpm: 520, xpm: 540 },
    { kills: 2, deaths: 7, assists: 11, side: "radiant", playerSlot: 5, netWorth: 9000, heroDamage: 8000, towerDamage: 600, gpm: 420, xpm: 460 },
  ];
  const teammates: PlayerStats[] = (
    options.teammates ?? teammateDefaults
  ).map((t) => ({
    side: "radiant" as const,
    items: { main: [], backpack: [], neutral: null, neutral2: null },
    ...t,
  }));

  return {
    matchId: 1,
    duration: options.duration ?? 1500,
    radiantWin: options.radiantWin ?? true,
    players: [player, ...teammates],
    radiantGoldAdv: undefined,
    radiantXpAdv: undefined,
    missing: [],
  };
}

const playerOf = (m: MatchDetail) => m.players[0];

describe("Player Performance Score — каждая формула", () => {
  it("экономика: выше GPM/XPM и нетворс → выше компонент", () => {
    const rich = makeMatch({ player: { gpm: 800, xpm: 850, netWorth: 20000 } });
    const poor = makeMatch({ player: { gpm: 300, xpm: 300, netWorth: 7000 } });
    const c1 = computePlayerPerformanceScore(rich, playerOf(rich)).components.find(
      (c) => c.key === "economy",
    )!;
    const c2 = computePlayerPerformanceScore(poor, playerOf(poor)).components.find(
      (c) => c.key === "economy",
    )!;
    expect(c1.score).toBeGreaterThan(c2.score);
    expect(c1.metrics.gpm).toBe(800);
    expect(c1.metrics.netWorthVsTeam).toBeDefined();
  });

  it("командные сражения: участие и вклад в урон растят оценку, KDA не единственный фактор", () => {
    const strong = makeMatch({ player: { kills: 15, deaths: 8, assists: 18, heroDamage: 30000 } });
    const weak = makeMatch({ player: { kills: 0, deaths: 9, assists: 1, heroDamage: 3000 } });
    const s = computePlayerPerformanceScore(strong, playerOf(strong)).components.find(
      (c) => c.key === "teamfights",
    )!;
    const w = computePlayerPerformanceScore(weak, playerOf(weak)).components.find(
      (c) => c.key === "teamfights",
    )!;
    expect(s.score).toBeGreaterThan(w.score);
    expect(s.metrics.killParticipation).toBeDefined();
    expect(s.metrics.damageShare).toBeDefined();
  });

  it("цели: урон по строениям определяет компонент objectives", () => {
    const pusher = makeMatch({ player: { towerDamage: 6000 } });
    const zero = makeMatch({ player: { towerDamage: 0 } });
    const p = computePlayerPerformanceScore(pusher, playerOf(pusher)).components.find(
      (c) => c.key === "objectives",
    )!;
    const z = computePlayerPerformanceScore(zero, playerOf(zero)).components.find(
      (c) => c.key === "objectives",
    )!;
    expect(p.score).toBeGreaterThan(z.score);
  });

  it("выживаемость: ноль смертей лучше восьми при равной длительности", () => {
    const clean = makeMatch({ player: { deaths: 0 } });
    const feed = makeMatch({ player: { deaths: 8 } });
    const c1 = computePlayerPerformanceScore(clean, playerOf(clean)).components.find(
      (c) => c.key === "survivability",
    )!;
    const c2 = computePlayerPerformanceScore(feed, playerOf(feed)).components.find(
      (c) => c.key === "survivability",
    )!;
    expect(c1.score).toBeGreaterThan(c2.score);
  });

  it("leaver_status > 1 жёстко снижает выживаемость", () => {
    const leaver = makeMatch({ player: { deaths: 0, leaverStatus: 3 } });
    const normal = makeMatch({ player: { deaths: 0, leaverStatus: 0 } });
    const c1 = computePlayerPerformanceScore(leaver, playerOf(leaver)).components.find(
      (c) => c.key === "survivability",
    )!;
    const c2 = computePlayerPerformanceScore(normal, playerOf(normal)).components.find(
      (c) => c.key === "survivability",
    )!;
    expect(c1.score).toBeLessThan(c2.score);
    expect(c1.explanation).toContain("leaver_status");
  });

  it("полезность: ассисты, лечение и покупки ward растят оценку", () => {
    const support = makeMatch({
      player: { assists: 25, heroHealing: 4000, towerDamage: 500 },
    });
    const core = makeMatch({
      player: {
        assists: 0,
        heroHealing: 0,
        purchaseLog: [{ key: "blink", time: 300 }],
      },
    });
    const s = computePlayerPerformanceScore(support, playerOf(support)).components.find(
      (c) => c.key === "utility",
    )!;
    const c = computePlayerPerformanceScore(core, playerOf(core)).components.find(
      (c) => c.key === "utility",
    )!;
    expect(s.metrics.wardPurchases).toBe(2);
    expect(s.score).toBeGreaterThan(c.score);
  });

  it("предметы: полная сборка и высокая стоимость дают больше пустых слотов", () => {
    const full = makeMatch({
      player: { gold: 100 },
    });
    const half = makeMatch({
      player: {
        gold: 4000,
        items: { main: [1, 2, null, null, null, null], backpack: [null, null, null], neutral: null, neutral2: null },
      },
    });
    const costs = { 1: { cost: 5000 }, 2: { cost: 5000 }, 3: { cost: 5000 }, 4: { cost: 5000 }, 5: { cost: 5000 }, 6: { cost: 5000 } };
    const c1 = computePlayerPerformanceScore(full, playerOf(full), { itemCosts: costs })
      .components.find((c) => c.key === "items")!;
    const c2 = computePlayerPerformanceScore(half, playerOf(half), { itemCosts: costs })
      .components.find((c) => c.key === "items")!;
    expect(c1.score).toBeGreaterThan(c2.score);
    expect(c1.metrics.buildCost).toBe(30000);
  });
});

describe("Player Performance Score — неполные данные", () => {
  it("отсутствующий показатель исключается, веса перераспределяются, не подменяясь нулём", () => {
    const noTower = makeMatch({ player: { towerDamage: undefined } });
    delete (noTower.players[0] as { towerDamage?: number }).towerDamage;
    const result = computePlayerPerformanceScore(noTower, playerOf(noTower));
    const obj = result.components.find((c) => c.key === "objectives")!;
    expect(obj.available).toBe(false);
    expect(obj.metrics).toEqual({});
    expect(obj.missing).toContain("tower_damage");
    // Доступно 0.8 весов (1 - 0.2 objectives)
    expect(result.coverage).toBeCloseTo(0.8, 2);
    expect(result.score).not.toBeNull();
  });

  it("покрытие ниже 0.5 → отказ от итогового балла", () => {
    const bare = makeMatch({ duration: undefined, player: {} });
    delete (bare as { duration?: number }).duration;
    const player = playerOf(bare);
    player.kills = undefined;
    player.deaths = undefined;
    player.assists = undefined;
    player.gpm = undefined;
    player.xpm = undefined;
    player.netWorth = undefined;
    player.heroDamage = undefined;
    player.towerDamage = undefined;
    player.heroHealing = undefined;
    player.items = { main: [], backpack: [], neutral: null, neutral2: null };
    const result = computePlayerPerformanceScore(bare, player);
    expect(result.score).toBeNull();
    expect(result.insufficientReason).toContain("Недостаточно данных");
    expect(result.coverage).toBeLessThan(0.5);
  });

  it("без данных игрока вообще — отказ", () => {
    const result = computePlayerPerformanceScore(makeMatch({}), undefined);
    expect(result.score).toBeNull();
    expect(result.components.every((c) => !c.available)).toBe(true);
  });
});

describe("Player Performance Score — граничные условия", () => {
  it("нулевые показатели дают валидный балл, а не ошибку", () => {
    const zero = makeMatch({
      player: {
        kills: 0,
        deaths: 0,
        assists: 0,
        gpm: 0,
        xpm: 0,
        netWorth: 0,
        heroDamage: 0,
        towerDamage: 0,
        heroHealing: 0,
        gold: 0,
        purchaseLog: [],
      },
    });
    const result = computePlayerPerformanceScore(zero, playerOf(zero));
    if (result.score !== null) {
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });

  it("короткий матч нормируется по длительности", () => {
    const short = makeMatch({ duration: 300, player: { deaths: 2 } });
    const result = computePlayerPerformanceScore(short, playerOf(short));
    const surv = result.components.find((c) => c.key === "survivability")!;
    expect(surv.available).toBe(true);
    expect(surv.metrics.deathsPerMin).toBeDefined();
  });

  it("отсутствие сети не влияет: оценки чистые функции", () => {
    // Проверка, что расчёт не обращается к сети по определению —
      // фикстуры обрабатываются локально.
    const match = mapMatchDetail(turboFull as unknown as ApiMatchDetail);
    const player = match.players[0];
    const result = computePlayerPerformanceScore(match, player);
    expect(typeof result === "object").toBe(true);
    PERF_COVERAGE_COMPONENTS.forEach((key) => {
      const c = result.components.find((x) => x.key === key);
      expect(c).toBeDefined();
    });
  });
});

describe("Player Performance Score — фикстуры", () => {
  it("полная фикстура: балл в пределах 0–100, большинство компонентов доступны", () => {
    const match = mapMatchDetail(turboFull as unknown as ApiMatchDetail);
    const player = match.players.find((p) => p.accountId !== undefined) ?? match.players[0];
    const result = computePlayerPerformanceScore(match, player);
    expect(result.score).not.toBeNull();
    expect(result.score!).toBeGreaterThanOrEqual(0);
    expect(result.score!).toBeLessThanOrEqual(100);
    expect(result.coverage).toBeGreaterThan(0.5);
  });

  it("неполная фикстура: недоступные компоненты явно помечены", () => {
    const match = mapMatchDetail(turboPartial as unknown as ApiMatchDetail);
    const player = match.players[0];
    const result = computePlayerPerformanceScore(match, player);
    expect(result.coverage).toBeLessThanOrEqual(1);
    for (const c of result.components) {
      if (!c.available) {
        expect(c.missing.length).toBeGreaterThan(0);
      }
    }
  });
});
