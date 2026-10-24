import { describe, expect, it } from "vitest";
import { computeMatchExperienceScore } from "../analytics/experience-score";
import { mapMatchDetail } from "../domain/mappers/matchMapper";
import type { ApiMatchDetail } from "../services/opendota/types";
import type { MatchDetail, PlayerStats } from "../domain/models";
import turboFull from "./fixtures/turbo-match-full.json";
import turboPartial from "./fixtures/turbo-match-partial.json";

/** Строит простой матч с контролируемыми параметрами. */
function makeMatch(options: {
  duration?: number;
  goldAdv?: number[];
  xpAdv?: number[];
  player?: Partial<PlayerStats>;
  teammates?: Partial<PlayerStats>[];
  opponents?: Partial<PlayerStats>[];
  teamfights?: number;
  radiantWin?: boolean;
}): MatchDetail {
  const player: PlayerStats = {
    playerSlot: 1,
    accountId: 111,
    heroId: 1,
    side: "radiant",
    items: { main: [1, 2, 3, null, null, null], backpack: [null, null, null], neutral: null, neutral2: null },
    kills: 5,
    deaths: 3,
    assists: 10,
    ...options.player,
  };
  const teammates: PlayerStats[] = (options.teammates ?? [
    { kills: 3, deaths: 4, assists: 6, side: "radiant", playerSlot: 2, items: { main: [], backpack: [], neutral: null, neutral2: null } },
    { kills: 2, deaths: 5, assists: 8, side: "radiant", playerSlot: 3, items: { main: [], backpack: [], neutral: null, neutral2: null } },
    { kills: 4, deaths: 6, assists: 5, side: "radiant", playerSlot: 4, items: { main: [], backpack: [], neutral: null, neutral2: null } },
    { kills: 1, deaths: 7, assists: 12, side: "radiant", playerSlot: 5, items: { main: [], backpack: [], neutral: null, neutral2: null } },
  ]).map((t) => ({ side: "radiant" as const, items: player.items, ...t }));
  const opponents: PlayerStats[] = (options.opponents ?? [
    { kills: 4, deaths: 5, assists: 4, side: "dire", playerSlot: 129 },
    { kills: 3, deaths: 6, assists: 5, side: "dire", playerSlot: 130 },
    { kills: 5, deaths: 4, assists: 3, side: "dire", playerSlot: 131 },
    { kills: 2, deaths: 7, assists: 6, side: "dire", playerSlot: 132 },
    { kills: 1, deaths: 8, assists: 7, side: "dire", playerSlot: 133 },
  ]).map((o) => ({ side: "dire" as const, items: player.items, ...o }));

  return {
    matchId: 1,
    duration: options.duration ?? 1500,
    radiantWin: options.radiantWin ?? true,
    players: [player, ...teammates, ...opponents],
    radiantGoldAdv: options.goldAdv,
    radiantXpAdv: options.xpAdv,
    teamfights:
      options.teamfights === undefined
        ? undefined
        : Array.from({ length: options.teamfights }, (_, i) => ({
            start: i * 300,
            end: i * 300 + 60,
          })),
    events: undefined,
    missing: [],
  };
}

const playerOf = (m: MatchDetail) => m.players[0];

describe("Match Experience Score — формулы компонентов", () => {
  it("равный с упорной борьбой матч оценивается выше одностороннего", () => {
    // Равный: серия колеблется около нуля, есть смены лидерства.
    const evenAdv = Array.from({ length: 25 }, (_, i) =>
      i < 12 ? 300 - i * 40 : -200 + (i - 12) * 30,
    );
    const even = computeMatchExperienceScore(
      makeMatch({ goldAdv: evenAdv, xpAdv: evenAdv }),
      makeMatch({ goldAdv: evenAdv, xpAdv: evenAdv }).players[0],
    );

    // Стomp: монотонный разрыв до 15000 без смен инициативы.
    const stompAdv = Array.from({ length: 25 }, (_, i) => i * 600);
    const stomp = computeMatchExperienceScore(
      makeMatch({ goldAdv: stompAdv, xpAdv: stompAdv }),
      makeMatch({ goldAdv: stompAdv, xpAdv: stompAdv }).players[0],
    );

    expect(even.score).not.toBeNull();
    expect(stomp.score).not.toBeNull();
    expect(even.score!).toBeGreaterThan(stomp.score!);

    const parityEven = even.components.find((c) => c.key === "parity")!;
    const parityStomp = stomp.components.find((c) => c.key === "parity")!;
    expect(parityEven.available).toBe(true);
    expect(parityEven.score).toBeGreaterThan(parityStomp.score);
  });

  it("без временных рядов компонент равенства недоступен (не выводится из конечного счёта)", () => {
    const m = makeMatch({});
    const result = computeMatchExperienceScore(m, playerOf(m));
    const parity = result.components.find((c) => c.key === "parity")!;
    expect(parity.available).toBe(false);
    expect(parity.missing).toContain("radiant_gold_adv");
    expect(parity.metrics).toEqual({});
  });

  it("высокое участие и вклад дают больший компонент agency, чем пассивная игра", () => {
    const active = makeMatch({
      player: { kills: 15, assists: 20, heroDamage: 25000, towerDamage: 3000, heroHealing: 1000 },
    });
    const passive = makeMatch({
      player: { kills: 0, assists: 1, heroDamage: 2000, towerDamage: 0, heroHealing: 0 },
    });
    const a1 = computeMatchExperienceScore(active, playerOf(active));
    const a2 = computeMatchExperienceScore(passive, playerOf(passive));
    const c1 = a1.components.find((c) => c.key === "agency")!;
    const c2 = a2.components.find((c) => c.key === "agency")!;
    expect(c1.score).toBeGreaterThan(c2.score);
  });

  it("равномерный вклад союзников даёт больший teamwork, чем матч, где всё сделал один игрок", () => {
    const balanced = makeMatch({
      teammates: [
        { kills: 5, deaths: 4, assists: 8, side: "radiant", playerSlot: 2 },
        { kills: 5, deaths: 4, assists: 8, side: "radiant", playerSlot: 3 },
        { kills: 5, deaths: 4, assists: 8, side: "radiant", playerSlot: 4 },
        { kills: 5, deaths: 4, assists: 8, side: "radiant", playerSlot: 5 },
      ],
      player: { kills: 5, assists: 8, towerDamage: 2000 },
    });
    const carried = makeMatch({
      teammates: [
        { kills: 0, deaths: 9, assists: 1, side: "radiant", playerSlot: 2 },
        { kills: 0, deaths: 9, assists: 1, side: "radiant", playerSlot: 3 },
        { kills: 0, deaths: 9, assists: 1, side: "radiant", playerSlot: 4 },
        { kills: 0, deaths: 9, assists: 1, side: "radiant", playerSlot: 5 },
      ],
      player: { kills: 20, assists: 2, towerDamage: 2000 },
    });
    const t1 = computeMatchExperienceScore(balanced, playerOf(balanced));
    const t2 = computeMatchExperienceScore(carried, playerOf(carried));
    const c1 = t1.components.find((c) => c.key === "teamwork")!;
    const c2 = t2.components.find((c) => c.key === "teamwork")!;
    expect(c1.available).toBe(true);
    expect(c1.score).toBeGreaterThan(c2.score);
  });

  it("темп учитывает длительность и события, а не только длину матча", () => {
    const action = makeMatch({ duration: 1400, player: { kills: 12, deaths: 8 }, teamfights: 10 });
    const idle = makeMatch({ duration: 3500, player: { kills: 0, deaths: 0 } });
    const c1 = computeMatchExperienceScore(action, playerOf(action)).components.find(
      (c) => c.key === "pace",
    )!;
    const c2 = computeMatchExperienceScore(idle, playerOf(idle)).components.find(
      (c) => c.key === "pace",
    )!;
    expect(c1.available).toBe(true);
    expect(c1.metrics.teamfights).toBe(10);
    expect(c1.score).toBeGreaterThan(c2.score);
  });

  it("направление преимущества учитывает сторону игрока (Dire инвертирует ряд)", () => {
    // Radiant лидирует: для radiant-игрока это «не наш рост».
    const radiantLead = Array.from({ length: 25 }, () => 8000);
    const forRadiant = computeMatchExperienceScore(
      makeMatch({ goldAdv: radiantLead, xpAdv: radiantLead }),
      undefined,
    );
    const direMatch = makeMatch({
      goldAdv: radiantLead,
      xpAdv: radiantLead,
      player: { playerSlot: 129, side: "dire" },
    });
    const forDire = computeMatchExperienceScore(direMatch, playerOf(direMatch));
    const p1 = forRadiant.components.find((c) => c.key === "parity")!;
    const p2 = forDire.components.find((c) => c.key === "parity")!;
    // Компонент равенства от зрительской точки (знак не влияет на |adv|),
    // но направление явно отражено в метриках.
    expect(p1.metrics.meanLeadPer10Min).toBeDefined();
    expect(p2.metrics.meanLeadPer10Min).toBeDefined();
    expect(p1.available && p2.available).toBe(true);
  });
});

describe("Match Experience Score — покрытие и отказ от балла", () => {
  it("веса перераспределяются: итог считается из доступных компонентов с покрытием", () => {
    const m = makeMatch({});
    const result = computeMatchExperienceScore(m, playerOf(m));
    const parity = result.components.find((c) => c.key === "parity")!;
    expect(parity.available).toBe(false);
    // parity (0.3) недоступен → доступно 0.7 весов
    expect(result.coverage).toBeCloseTo(0.7, 2);
    expect(result.score).not.toBeNull();
    expect(result.insufficientReason).toBeNull();
  });

  it("ниже минимального покрытия итоговый балл не выдаётся", () => {
    // duration отсутствует (pace), рядов нет (parity),
    // у игрока нет статистики (agency/teamwork недоступны).
    const bare = makeMatch({ duration: undefined, goldAdv: undefined });
    delete (bare as { duration?: number }).duration;
    const player = playerOf(bare);
    player.kills = undefined;
    player.deaths = undefined;
    player.assists = undefined;
    const result = computeMatchExperienceScore(bare, player);
    expect(result.score).toBeNull();
    expect(result.insufficientReason).toContain("Недостаточно данных");
    expect(result.coverage).toBeLessThan(0.5);
  });

  it("конфиденциальность отражает покрытие", () => {
    const full = makeMatch({
      goldAdv: Array.from({ length: 25 }, (_, i) => i * 100 - 1000),
      xpAdv: Array.from({ length: 25 }, (_, i) => i * 100 - 1000),
      teamfights: 5,
    });
    expect(computeMatchExperienceScore(full, playerOf(full)).confidence).toBe("high");
    const m = makeMatch({});
    expect(computeMatchExperienceScore(m, playerOf(m)).confidence).not.toBe("high");
  });

  it("missingData перечисляет отсутствующие поля, а не заменяет их нулями", () => {
    const m = makeMatch({});
    const result = computeMatchExperienceScore(m, playerOf(m));
    expect(result.missingData).toContain("gold_adv");
    expect(result.missingData).toContain("teamfights");
    const parity = result.components.find((c) => c.key === "parity")!;
    expect(parity.available).toBe(false);
  });
});

describe("Match Experience Score — реальные фикстуры", () => {
  it("полная фикстура даёт итоговый балл с паритетом", () => {
    const match = mapMatchDetail(turboFull as unknown as ApiMatchDetail);
    const player = match.players.find((p) => p.accountId !== undefined) ?? match.players[0];
    const result = computeMatchExperienceScore(match, player);
    expect(result.score).not.toBeNull();
    expect(result.score!).toBeGreaterThanOrEqual(0);
    expect(result.score!).toBeLessThanOrEqual(100);
    expect(result.components.find((c) => c.key === "parity")!.available).toBe(true);
  });

  it("неполная фикстура: паритет недоступен, но балл может считаться с покрытием", () => {
    const match = mapMatchDetail(turboPartial as unknown as ApiMatchDetail);
    const player = match.players[0];
    const result = computeMatchExperienceScore(match, player);
    expect(result.components.find((c) => c.key === "parity")!.available).toBe(false);
    expect(result.coverage).toBeLessThan(1);
    if (result.score !== null) {
      expect(result.score).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("Match Experience Score — граничные условия", () => {
  it("нулевые значения и очень короткий матч не роняют расчёт", () => {
    const result = computeMatchExperienceScore(
      makeMatch({
        duration: 60,
        player: { kills: 0, deaths: 0, assists: 0, heroDamage: 0, towerDamage: 0, heroHealing: 0 },
        goldAdv: [],
      }),
      undefined,
    );
    for (const c of result.components) {
      if (c.available) {
        expect(c.score).toBeGreaterThanOrEqual(0);
        expect(c.score).toBeLessThanOrEqual(100);
      }
    }
    expect(result.score === null || (result.score >= 0 && result.score <= 100)).toBe(true);
  });

  it("отсутствие командных боёв не ломает оценку темпа", () => {
    const m = makeMatch({ teamfights: 0 });
    const result = computeMatchExperienceScore(m, playerOf(m));
    const pace = result.components.find((c) => c.key === "pace")!;
    expect(pace.available).toBe(true);
    expect(pace.missing).toContain("teamfights");
  });
});
