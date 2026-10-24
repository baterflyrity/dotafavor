/**
 * Упрощённый клиентский сценарий Steam OpenID 2.0.
 *
 * ВАЖНО: серверная проверка подлинности ответа Steam (проверка подписи `sig`)
 * НЕ выполняется — приложение статическое и не имеет backend. Callback-параметры
 * могут быть подделаны. Форматная проверка ниже НЕ является криптографической
 * проверкой личности и не должна выдаваться за неё. Приложение использует ID
 * исключительно для выбора публичного профиля и не предоставляет защищённых функций.
 */

import { isValidSteamId64, steamId64ToSteam32 } from "./steamId";

export const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";

/** Маркер в return_to, по которому приложение узнаёт возврат из Steam. */
export const OPENID_CALLBACK_PARAM = "openid_callback";

/** Результат разбора параметров возврата. */
export type SteamCallbackResult =
  | { status: "success"; steamId64: string; accountId: number }
  | { status: "cancelled" }
  | { status: "ignored" }
  | { status: "invalid"; reason: string };

/**
 * Собирает URL перенаправления на официальный Steam OpenID endpoint.
 *
 * @param returnTo Абсолютный URL возврата с учётом BASE_URL (localhost или GitHub Pages).
 */
export function buildSteamLoginUrl(returnTo: string): string {
  const url = new URL(STEAM_OPENID_ENDPOINT);
  const realm = new URL(returnTo).origin + basePathOf(returnTo);

  url.searchParams.set("openid.ns", "http://specs.openid.net/auth/2.0");
  url.searchParams.set("openid.mode", "checkid_setup");
  url.searchParams.set("openid.return_to", returnTo);
  url.searchParams.set("openid.realm", realm);
  url.searchParams.set(
    "openid.identity",
    "http://specs.openid.net/auth/2.0/identifier_select",
  );
  url.searchParams.set(
    "openid.claimed_id",
    "http://specs.openid.net/auth/2.0/identifier_select",
  );
  return url.toString();
}

/** Часть пути URL до query-строки (базовый путь приложения). */
function basePathOf(href: string): string {
  const u = new URL(href);
  return u.pathname;
}

/** Формирует URL возврата из текущего адреса, сохраняя базовый путь приложения. */
export function buildReturnTo(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.search = "";
  url.hash = "";
  url.searchParams.set(OPENID_CALLBACK_PARAM, "1");
  return url.toString();
}

/**
 * Разбирает query-параметры возврата из Steam.
 *
 * Проверяет наличие маркера callback, обрабатывает отмену, проверяет формат
 * claimed_id (http://steamcommunity.com/openid/id/{steamid64}) и извлекает
 * SteamID64. Это форматная проверка, а не проверка подписи Steam.
 */
export function parseSteamCallback(params: URLSearchParams): SteamCallbackResult {
  const isCallback =
    params.get(OPENID_CALLBACK_PARAM) === "1" ||
    params.has("openid.ns") ||
    params.has("openid.mode") ||
    params.has("openid.claimed_id");

  if (!isCallback) return { status: "ignored" };

  const mode = params.get("openid.mode");
  if (mode === "cancel") return { status: "cancelled" };

  const claimedId = params.get("openid.claimed_id") ?? params.get("openid.identity");
  if (!claimedId) {
    if (mode && mode !== "id_res") {
      return { status: "invalid", reason: `неожиданный openid.mode: ${mode}` };
    }
    return { status: "invalid", reason: "отсутствует openid.claimed_id" };
  }

  const match = claimedId.match(
    /^https?:\/\/(?:www\.)?steamcommunity\.com\/openid\/id\/(\d{17})$/,
  );
  if (!match) {
    return { status: "invalid", reason: "некорректный формат claimed_id" };
  }

  const steamId64 = match[1];
  if (!isValidSteamId64(steamId64)) {
    return { status: "invalid", reason: "SteamID64 вне допустимого диапазона" };
  }

  try {
    return {
      status: "success",
      steamId64,
      accountId: steamId64ToSteam32(steamId64),
    };
  } catch (e) {
    return {
      status: "invalid",
      reason: e instanceof Error ? e.message : "ошибка преобразования SteamID",
    };
  }
}

/** Удаляет технические и чувствительные параметры возврата из адресной строки. */
export function stripCallbackParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete(OPENID_CALLBACK_PARAM);
  for (const key of [...next.keys()]) {
    if (key.startsWith("openid.")) next.delete(key);
  }
  return next;
}
