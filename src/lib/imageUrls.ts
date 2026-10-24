/**
 * Построение URL изображений игровых сущностей на официальном CDN Valve/Steam
 * (spec/iteration-02.md, §6).
 *
 * Источники:
 * - герои:  https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/{name}.png
 * - предметы: путь img из OpenDota constants (абсолютный URL или /apps/...).
 *
 * Не принимается произвольные внешние источники: только CDN Valve/Steam
 * или URL, уже полученный из ответа API.
 */

const STEAM_CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react";

/** URL иконки героя по внутреннему имени (npc_dota_hero_antimage → …/heroes/antimage.png). */
export function heroImageUrl(internalName: string | null | undefined): string | null {
  if (!internalName) return null;
  const short = internalName.replace(/^npc_dota_hero_/, "");
  if (!/^[a-z0-9_]+$/.test(short)) return null;
  return `${STEAM_CDN}/heroes/${short}.png`;
}

/** URL иконки предмета из поля img OpenDota constants (путь или абсолютный URL). */
export function itemImageUrl(img: string | null | undefined): string | null {
  if (!img) return null;
  if (/^https?:\/\//.test(img)) return img.split("?")[0];
  if (img.startsWith("/apps/")) return `https://cdn.cloudflare.steamstatic.com${img.split("?")[0]}`;
  return null;
}
