import { describe, expect, it } from "vitest";
import {
  dotabuffHeroUrl,
  dotabuffItemUrl,
  dotabuffMatchUrl,
  dotabuffPlayerUrl,
  isValidSlug,
  liquipediaHeroUrl,
  openDotaMatchUrl,
  openDotaPlayerUrl,
  steamProfileUrl,
  toDotabuffSlug,
  toLiquipediaSlug,
} from "../lib/externalLinks";

describe("Нормализация слагов", () => {
  it("toDotabuffSlug: lowercase, апостроф удаляется, прочее → дефис", () => {
    expect(toDotabuffSlug("Anti-Mage")).toBe("anti-mage");
    expect(toDotabuffSlug("Nature's Prophet")).toBe("natures-prophet");
    expect(toDotabuffSlug("Black King Bar")).toBe("black-king-bar");
    expect(toDotabuffSlug("Aghanim's Scepter")).toBe("aghanims-scepter");
    expect(toDotabuffSlug("Queen of Pain")).toBe("queen-of-pain");
  });

  it("toDotabuffSlug: некорректный вход → null (ссылка не строится)", () => {
    expect(toDotabuffSlug(null)).toBeNull();
    expect(toDotabuffSlug(undefined)).toBeNull();
    expect(toDotabuffSlug("")).toBeNull();
    expect(toDotabuffSlug("   ")).toBeNull();
    expect(toDotabuffSlug("???")).toBeNull();
  });

  it("toLiquipediaSlug: пробел → подчёркивание, апостроф сохраняется", () => {
    expect(toLiquipediaSlug("Nature's Prophet")).toBe("Nature's_Prophet");
    expect(toLiquipediaSlug("Anti-Mage")).toBe("Anti-Mage");
    expect(toLiquipediaSlug("Shadow Fiend")).toBe("Shadow_Fiend");
  });

  it("toLiquipediaSlug: кириллица/спецсимволы → null", () => {
    expect(toLiquipediaSlug("Карл")).toBeNull();
    expect(toLiquipediaSlug("a/b")).toBeNull();
    expect(toLiquipediaSlug("")).toBeNull();
  });

  it("isValidSlug принимает только [a-z0-9-] без краевых дефисов", () => {
    expect(isValidSlug("anti-mage")).toBe(true);
    expect(isValidSlug("natures-prophet")).toBe(true);
    expect(isValidSlug("-anti")).toBe(false);
    expect(isValidSlug("anti-")).toBe(false);
    expect(isValidSlug("Anti_Mage")).toBe(false);
    expect(isValidSlug("")).toBe(false);
  });
});

describe("URL матчей и игроков", () => {
  it("корректные ID дают корректные URL", () => {
    expect(dotabuffMatchUrl(7150401495)).toBe("https://www.dotabuff.com/matches/7150401495");
    expect(openDotaMatchUrl(7150401495)).toBe("https://www.opendota.com/matches/7150401495");
    expect(dotabuffPlayerUrl(89342021)).toBe("https://www.dotabuff.com/players/89342021");
    expect(openDotaPlayerUrl(89342021)).toBe("https://www.opendota.com/players/89342021");
    expect(openDotaMatchUrl("123")).toBe("https://www.opendota.com/matches/123");
  });

  it("некорректные ID не дают URL (null, не сомнительная ссылка)", () => {
    for (const bad of [0, -5, 1.5, Number.NaN, null, undefined, "", "abc"]) {
      expect(dotabuffMatchUrl(bad as never)).toBeNull();
      expect(openDotaMatchUrl(bad as never)).toBeNull();
      expect(dotabuffPlayerUrl(bad as never)).toBeNull();
      expect(openDotaPlayerUrl(bad as never)).toBeNull();
    }
  });

  it("Steam-профиль только по валидному 17-значному SteamID64", () => {
    expect(steamProfileUrl("76561197960265728")).toBe(
      "https://steamcommunity.com/profiles/76561197960265728",
    );
    expect(steamProfileUrl("12345")).toBeNull();
    expect(steamProfileUrl("7656119796026572x")).toBeNull();
    expect(steamProfileUrl(null)).toBeNull();
    expect(steamProfileUrl(undefined)).toBeNull();
  });
});

describe("URL героев и предметов", () => {
  it("Dotabuff-герои из английского названия справочника", () => {
    expect(dotabuffHeroUrl("Anti-Mage")).toBe("https://www.dotabuff.com/heroes/anti-mage");
    expect(dotabuffHeroUrl("Nature's Prophet")).toBe(
      "https://www.dotabuff.com/heroes/natures-prophet",
    );
  });

  it("Liquipedia-герои кодируются корректно", () => {
    expect(liquipediaHeroUrl("Nature's Prophet")).toBe(
      "https://liquipedia.net/dota2/Nature%27s_Prophet",
    );
    expect(liquipediaHeroUrl("Anti-Mage")).toBe("https://liquipedia.net/dota2/Anti-Mage");
  });

  it("без названия ссылки нет", () => {
    expect(dotabuffHeroUrl(undefined)).toBeNull();
    expect(liquipediaHeroUrl(undefined)).toBeNull();
    expect(dotabuffItemUrl(undefined)).toBeNull();
  });

  it("Dotabuff-предметы из dname справочника", () => {
    expect(dotabuffItemUrl("Black King Bar")).toBe(
      "https://www.dotabuff.com/items/black-king-bar",
    );
    expect(dotabuffItemUrl("Town Portal Scroll")).toBe(
      "https://www.dotabuff.com/items/town-portal-scroll",
    );
    expect(dotabuffItemUrl("Aghanim's Scepter")).toBe(
      "https://www.dotabuff.com/items/aghanims-scepter",
    );
  });
});
