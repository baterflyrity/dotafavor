import { describe, expect, it } from "vitest";
import {
  mapMatchDetail,
  mapMatchSummary,
  resultForPlayer,
  sideFromSlot,
} from "../domain/mappers/matchMapper";
import type { ApiMatchDetail, ApiMatchSummary } from "../services/opendota/types";
import turboFull from "./fixtures/turbo-match-full.json";
import turboPartial from "./fixtures/turbo-match-partial.json";
import historyRows from "./fixtures/history-turbo.json";

describe("сторона игрока и результат", () => {
  it("слоты 0–127 — Radiant, 128–255 — Dire", () => {
    expect(sideFromSlot(0)).toBe("radiant");
    expect(sideFromSlot(127)).toBe("radiant");
    expect(sideFromSlot(128)).toBe("dire");
    expect(sideFromSlot(255)).toBe("dire");
  });

  it("Radiant побеждает → победа для Radiant, поражение для Dire", () => {
    expect(resultForPlayer(true, "radiant")).toBe("win");
    expect(resultForPlayer(true, "dire")).toBe("loss");
  });

  it("Dire побеждает → победа для Dire, поражение для radiant", () => {
    expect(resultForPlayer(false, "dire")).toBe("win");
    expect(resultForPlayer(false, "radiant")).toBe("loss");
  });

  it("неизвестный radiant_win не превращается в поражение", () => {
    expect(resultForPlayer(undefined, "radiant")).toBe("unknown");
    expect(resultForPlayer(null, "dire")).toBe("unknown");
  });
});

describe("mapMatchSummary", () => {
  it("нормализует строку истории (фикстура history-turbo.json)", () => {
    const rows = historyRows as ApiMatchSummary[];
    const radiant = mapMatchSummary(rows[0]);
    expect(radiant.matchId).toBe(8462082943);
    expect(radiant.side).toBe("radiant");
    expect(radiant.result).toBe("win");
    expect(radiant.gpm).toBe(650);
    expect(radiant.incomplete).toBe(false);

    const dire = mapMatchSummary(rows[1]);
    expect(dire.side).toBe("dire");
    // radiant_win=false, игрок за Dire → победа
    expect(dire.result).toBe("win");
    // duration=0 и gpm отсутствуют → undefined, а не 0/игнор
    expect(dire.duration).toBe(0);
    expect(dire.gpm).toBeUndefined();
    // матч без длительности считается неполным
    expect(dire.incomplete).toBe(true);
  });

  it("отсутствующие поля остаются undefined, а не нулями", () => {
    const summary = mapMatchSummary({ match_id: 1, player_slot: 5 } as ApiMatchSummary);
    expect(summary.kills).toBeUndefined();
    expect(summary.gpm).toBeUndefined();
    expect(summary.result).toBe("unknown");
    expect(summary.incomplete).toBe(true);
  });
});

describe("mapMatchDetail — фикстуры", () => {
  it("полный Turbo-ответ маппится без потери ключевых данных", () => {
    const detail = mapMatchDetail(turboFull as unknown as ApiMatchDetail);
    expect(detail.players).toHaveLength(10);
    expect(detail.duration).toBeGreaterThan(0);
    expect(detail.radiantGoldAdv?.length).toBeGreaterThan(0);
    expect(detail.missing).not.toContain("radiant_gold_adv");
    expect(detail.teamfights?.length).toBeGreaterThan(0);
    expect(detail.events?.length).toBeGreaterThan(0);
    // У всех игроков определена сторона
    expect(detail.players.every((p) => p.side === "radiant" || p.side === "dire")).toBe(true);
  });

  it("неполный ответ фиксирует отсутствующие данные явно", () => {
    const detail = mapMatchDetail(turboPartial as unknown as ApiMatchDetail);
    expect(detail.missing).toContain("radiant_gold_adv");
    expect(detail.missing).toContain("teamfights");
    expect(detail.radiantGoldAdv).toBeUndefined();
    // Отсутствующие статистики не подменены нулями
    const anyMissingStat = detail.players.some(
      (p) => p.purchaseLog === undefined || p.heroDamage === undefined,
    );
    expect(anyMissingStat).toBe(true);
  });

  it("purchase_log и предметы нормализуются аккуратно", () => {
    const detail = mapMatchDetail(turboFull as unknown as ApiMatchDetail);
    for (const p of detail.players) {
      expect(p.items.main).toHaveLength(6);
      expect(p.items.backpack).toHaveLength(3);
      for (const id of p.items.main) {
        expect(id === null || typeof id === "number").toBe(true);
      }
    }
  });
});
