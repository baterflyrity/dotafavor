import { describe, expect, it } from "vitest";
import {
  OPENID_CALLBACK_PARAM,
  buildReturnTo,
  buildSteamLoginUrl,
  parseSteamCallback,
  stripCallbackParams,
} from "../features/steam-login/steamOpenId";

const VALID_CLAIMED =
  "https://steamcommunity.com/openid/id/76561198000000000";

function params(record: Record<string, string>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(record)) p.set(k, v);
  return p;
}

describe("buildSteamLoginUrl", () => {
  it("формирует URL официального endpoint с обязательными параметрами OpenID 2.0", () => {
    const url = new URL(buildSteamLoginUrl("http://localhost:5173/?openid_callback=1"));
    expect(url.origin + url.pathname).toBe("https://steamcommunity.com/openid/login");
    expect(url.searchParams.get("openid.ns")).toBe("http://specs.openid.net/auth/2.0");
    expect(url.searchParams.get("openid.mode")).toBe("checkid_setup");
    expect(url.searchParams.get("openid.return_to")).toBe(
      "http://localhost:5173/?openid_callback=1",
    );
    expect(url.searchParams.get("openid.realm")).toBe("http://localhost:5173/");
    expect(url.searchParams.get("openid.identity")).toBe(
      "http://specs.openid.net/auth/2.0/identifier_select",
    );
    expect(url.searchParams.get("openid.claimed_id")).toBe(
      "http://specs.openid.net/auth/2.0/identifier_select",
    );
  });

  it("сохраняет базовый путь приложения (GitHub Pages /repo/)", () => {
    const url = new URL(
      buildSteamLoginUrl("https://user.github.io/repo/?openid_callback=1"),
    );
    expect(url.searchParams.get("openid.return_to")).toBe(
      "https://user.github.io/repo/?openid_callback=1",
    );
    expect(url.searchParams.get("openid.realm")).toBe("https://user.github.io/repo/");
  });
});

describe("buildReturnTo", () => {
  it("ставит маркер callback и убирает hash/query", () => {
    const result = buildReturnTo("http://localhost:5173/#/matches?x=1");
    expect(result).toBe(`http://localhost:5173/?${OPENID_CALLBACK_PARAM}=1`);
  });
});

describe("parseSteamCallback — успешный возврат", () => {
  it("извлекает SteamID64 и преобразует в Steam32", () => {
    const p = params({
      openid_ns: "",
      "openid.mode": "id_res",
      "openid.claimed_id": VALID_CLAIMED,
      [OPENID_CALLBACK_PARAM]: "1",
    });
    p.set("openid.ns", "http://specs.openid.net/auth/2.0");
    const result = parseSteamCallback(p);
    expect(result).toEqual({
      status: "success",
      steamId64: "76561198000000000",
      accountId: 39734272,
    });
  });

  it("принимает http:// вместо https:// и www", () => {
    const p = params({
      "openid.mode": "id_res",
      "openid.claimed_id": "http://www.steamcommunity.com/openid/id/76561198000000000",
      [OPENID_CALLBACK_PARAM]: "1",
    });
    expect(parseSteamCallback(p).status).toBe("success");
  });
});

describe("parseSteamCallback — отмена и ошибки", () => {
  it("обрабатывает отмену входа", () => {
    const p = params({ "openid.mode": "cancel", [OPENID_CALLBACK_PARAM]: "1" });
    expect(parseSteamCallback(p)).toEqual({ status: "cancelled" });
  });

  it("возвращает ignored, когда параметров Steam нет", () => {
    expect(parseSteamCallback(new URLSearchParams())).toEqual({ status: "ignored" });
  });

  it("отклоняет claimed_id с чужим hostname", () => {
    const p = params({
      "openid.mode": "id_res",
      "openid.claimed_id": "https://evil.example/openid/id/76561198000000000",
      [OPENID_CALLBACK_PARAM]: "1",
    });
    const result = parseSteamCallback(p);
    expect(result.status).toBe("invalid");
  });

  it("отклоняет короткий (не 17-значный) id", () => {
    const p = params({
      "openid.mode": "id_res",
      "openid.claimed_id": "https://steamcommunity.com/openid/id/12345",
      [OPENID_CALLBACK_PARAM]: "1",
    });
    expect(parseSteamCallback(p).status).toBe("invalid");
  });

  it("отклоняет отсутствие claimed_id", () => {
    const p = params({ "openid.mode": "id_res", [OPENID_CALLBACK_PARAM]: "1" });
    const result = parseSteamCallback(p);
    expect(result.status).toBe("invalid");
  });

  it("форматная проверка не является проверкой подлинности: подделанный, но корректный по формату callback принимается", () => {
    // Документированное ограничение: приложение НЕ проверяет подпись Steam.
    const p = params({
      "openid.mode": "id_res",
      "openid.claimed_id": "https://steamcommunity.com/openid/id/76561198111111111",
      [OPENID_CALLBACK_PARAM]: "1",
    });
    const result = parseSteamCallback(p);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.steamId64).toBe("76561198111111111");
    }
  });
});

describe("stripCallbackParams", () => {
  it("удаляет маркер и все openid.* параметры", () => {
    const p = params({
      [OPENID_CALLBACK_PARAM]: "1",
      "openid.mode": "id_res",
      "openid.sig": "abc",
      keep: "yes",
    });
    const cleaned = stripCallbackParams(p);
    expect(cleaned.has(OPENID_CALLBACK_PARAM)).toBe(false);
    expect([...cleaned.keys()].some((k) => k.startsWith("openid."))).toBe(false);
    expect(cleaned.get("keep")).toBe("yes");
  });
});
