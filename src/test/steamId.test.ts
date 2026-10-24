import { describe, expect, it } from "vitest";
import {
  STEAM_ID64_OFFSET,
  SteamIdError,
  isValidSteamId64,
  steamId64ToSteam32,
} from "../features/steam-login/steamId";

describe("steamId64ToSteam32", () => {
  it("преобразует типичный SteamID64 вычитанием константы", () => {
    // 76561198000000000 - 76561197960265728 = 39734272
    expect(steamId64ToSteam32("76561198000000000")).toBe(39734272);
  });

  it("работает с BigInt и не теряет точность на больших числах", () => {
    const id64 = STEAM_ID64_OFFSET + 4294967295n;
    expect(steamId64ToSteam32(id64)).toBe(4294967295);
  });

  it("принимает смещение как границу (account id = 0 не возникает в практике, но диапазон допустим)", () => {
    expect(steamId64ToSteam32(STEAM_ID64_OFFSET)).toBe(0);
  });

  it("отклоняет значения меньше смещения", () => {
    expect(() => steamId64ToSteam32("76561197960265727")).toThrow(SteamIdError);
  });

  it("отклоняет нечисловые строки", () => {
    expect(() => steamId64ToSteam32("not-a-number")).toThrow(SteamIdError);
  });

  it("отклоняет ID, не помещающиеся в 32-битный account id", () => {
    const tooBig = STEAM_ID64_OFFSET + 4294967296n + 100n;
    expect(() => steamId64ToSteam32(tooBig)).toThrow(SteamIdError);
  });
});

describe("isValidSteamId64", () => {
  it("принимает корректный 17-значный идентификатор", () => {
    expect(isValidSteamId64("76561198000000000")).toBe(true);
  });

  it("отклоняет неверную длину", () => {
    expect(isValidSteamId64("7656119800000000")).toBe(false);
    expect(isValidSteamId64("765611980000000000")).toBe(false);
    expect(isValidSteamId64("")).toBe(false);
  });

  it("отклоняет нецифровые символы", () => {
    expect(isValidSteamId64("7656119800000000a")).toBe(false);
  });

  it("отклоняет число меньше смещения Steam", () => {
    expect(isValidSteamId64("00000000000000001")).toBe(false);
  });
});
