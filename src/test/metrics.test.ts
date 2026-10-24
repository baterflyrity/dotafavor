import { describe, expect, it } from "vitest";
import { eventLabel, humanizeKey, metricLabel, metricLabels } from "../i18n/metrics";

describe("metricLabel — известные подписи", () => {
  it("поле статистики получает русскую подпись из словаря", () => {
    expect(metricLabel("hero_damage")).toBe("Урон героям");
    expect(metricLabel("tower_damage")).toBe("Урон строениям");
    expect(metricLabel("gold_per_min")).toBe("Золото в минуту (GPM)");
    expect(metricLabel("xp_per_min")).toBe("Опыт в минуту (XPM)");
    expect(metricLabel("last_hits")).toBe("Последние удары");
    expect(metricLabel("net_worth")).toBe("Нетворс");
    expect(metricLabel("radiant_gold_adv")).toBe("Ряд преимущества по золоту");
    expect(metricLabel("teamfights")).toBe("Командные бои");
  });

  it("metricLabels возвращает массив подписей", () => {
    expect(metricLabels(["kills", "deaths"])).toEqual(["Убийства", "Смерти"]);
  });
});

describe("metricLabel — fallback для неизвестного ключа", () => {
  it("неизвестный snake_case ключ становится читаемой подписью", () => {
    expect(metricLabel("some_new_field")).toBe("Some new field");
    expect(metricLabel("brand_metric_from_patch")).toBe("Brand metric from patch");
  });

  it("fallback никогда не возвращает undefined / NaN / [object Object] / пустое", () => {
    for (const key of ["", "x", "__weird__", "camelCaseKey", " yet_another "]) {
      const label = metricLabel(key);
      expect(label).not.toBe("");
      expect(label).not.toContain("undefined");
      expect(label).not.toContain("NaN");
      expect(label).not.toContain("[object Object]");
    }
  });

  it("нетехнические строки не ломаются", () => {
    expect(metricLabel("Помощь")).toBe("Помощь");
    expect(humanizeKey("item_black_king_bar")).toBe("Black king bar");
    expect(humanizeKey("CHAT_MESSAGE_FIRSTBLOOD")).toBe("FIRSTBLOOD");
  });
});

describe("eventLabel — события матча", () => {
  it("известный тип события переводится по словарю", () => {
    expect(eventLabel({ type: "CHAT_MESSAGE_FIRSTBLOOD" })).toBe("Первая кровь");
    expect(eventLabel({ type: "CHAT_MESSAGE_ROSHAN_KILL" })).toBe("Рошан убит");
    expect(eventLabel({ type: "DOTA_GLYPH_USED" })).toBe("Использован глиф");
  });

  it("человеческий label проходит без искажений", () => {
    expect(eventLabel({ label: "Roshan убит" })).toBe("Roshan убит");
  });

  it("сырой технический ключ не выводится как есть", () => {
    const label = eventLabel({ label: "CHAT_MESSAGE_SOMETHING_NEW" });
    expect(label).not.toBe("CHAT_MESSAGE_SOMETHING_NEW");
    expect(label).toContain("Something new");
  });

  it("пустое событие не даёт undefined", () => {
    expect(eventLabel({})).toBe("Событие");
    expect(eventLabel({ type: undefined, label: "" })).toBe("Событие");
  });
});
