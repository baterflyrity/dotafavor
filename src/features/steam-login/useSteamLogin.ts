import { buildReturnTo, buildSteamLoginUrl } from "./steamOpenId";

/**
 * Возвращает URL перенаправления на Steam OpenID.
 * Использует текущий адрес с учётом BASE_URL — работает на localhost
 * и на GitHub Pages в каталоге /repository-name/.
 */
export function getSteamLoginUrl(): string {
  const returnTo = buildReturnTo(window.location.href);
  return buildSteamLoginUrl(returnTo);
}

/** Запускает вход через Steam (перенаправление на официальный сайт). */
export function startSteamLogin(): void {
  window.location.assign(getSteamLoginUrl());
}
