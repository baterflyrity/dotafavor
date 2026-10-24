/**
 * Централизованная генерация внешних ссылок (spec/iteration-02.md, §8).
 *
 * Правила:
 * - URL матча, игрока и Steam-профиля строятся только из валидных числовых ID;
 * - слаги героев/предметов получаем из официальных английских названий
 *   (localized_name / dname) детерминированным преобразованием, проверенным
 *   на реальных ответах API: lowercase, апостроф удаляется, всё
 *   небуквенно-цифровое → дефис (Dotabuff) или подчёркивание (Liquipedia);
 * - если slug не удалось получить (пустой/некорректный вход), возвращаем null
 *   и ссылка не показывается — сомнительные URL не генерируются;
 * - внешние ссылки должны открываться с target="_blank" rel="noopener noreferrer".
 *
 * Источники соответствия слагов (проверено 24.10.2026):
 * - Dotabuff heroes: Anti-Mage → /heroes/anti-mage, Nature's Prophet → /heroes/natures-prophet;
 * - Dotabuff items: Black King Bar → /items/black-king-bar, Aghanim's Scepter → /items/aghanims-scepter;
 * - Liquipedia: Nature's Prophet → /dota2/Nature%27s_Prophet (пробел → _).
 */

/** Числовой позитивный ID (match_id, account_id). */
function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** Допустимый слаг после нормализации: [a-z0-9-] без краевых дефисов. */
export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

/**
 * Нормализует английское название сущности в слаг Dotabuff:
 * lowercase, апострофы удаляются, прочие символы → дефис.
 */
export function toDotabuffSlug(displayName: string | null | undefined): string | null {
  if (typeof displayName !== "string") return null;
  const slug = displayName
    .normalize("NFKD")
    .replace(/['’`]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return isValidSlug(slug) ? slug : null;
}

/** Слаг Liquipedia: пробел → подчёркивание, апостроф остаётся (URL-кодируется позже). */
export function toLiquipediaSlug(displayName: string | null | undefined): string | null {
  if (typeof displayName !== "string") return null;
  const trimmed = displayName.trim();
  if (trimmed.length === 0) return null;
  if (!/^[A-Za-z0-9 '-]+$/.test(trimmed)) return null;
  return trimmed.replace(/ +/g, "_");
}

/** Строгое преобразование числа/строки в положительный int-ID или null. */
function toId(value: number | string | null | undefined): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return isPositiveInt(n) ? n : null;
}

// --- Матч -----------------------------------------------------------------

export function dotabuffMatchUrl(matchId: number | string | null | undefined): string | null {
  const id = toId(matchId);
  return id === null ? null : `https://www.dotabuff.com/matches/${id}`;
}

export function openDotaMatchUrl(matchId: number | string | null | undefined): string | null {
  const id = toId(matchId);
  return id === null ? null : `https://www.opendota.com/matches/${id}`;
}

// --- Игрок ----------------------------------------------------------------

export function dotabuffPlayerUrl(accountId: number | string | null | undefined): string | null {
  const id = toId(accountId);
  return id === null ? null : `https://www.dotabuff.com/players/${id}`;
}

export function openDotaPlayerUrl(accountId: number | string | null | undefined): string | null {
  const id = toId(accountId);
  return id === null ? null : `https://www.opendota.com/players/${id}`;
}

/** Steam-профиль — только по валидному 17-значному SteamID64. */
export function steamProfileUrl(steamId64: string | null | undefined): string | null {
  if (typeof steamId64 !== "string" || !/^\d{17}$/.test(steamId64.trim())) return null;
  return `https://steamcommunity.com/profiles/${steamId64.trim()}`;
}

// --- Герои ----------------------------------------------------------------

/** Страница героя на Dotabuff; slug — из английского названия из справочника. */
export function dotabuffHeroUrl(localizedName: string | null | undefined): string | null {
  const slug = toDotabuffSlug(localizedName);
  return slug === null ? null : `https://www.dotabuff.com/heroes/${slug}`;
}

/** Страница героя в Liquipedia (актуальная Dota 2 Wiki). */
export function liquipediaHeroUrl(localizedName: string | null | undefined): string | null {
  const slug = toLiquipediaSlug(localizedName);
  if (slug === null) return null;
  // encodeURIComponent не кодирует апостроф — Liquipedia требует %27
  // (например Nature's Prophet → Nature%27s_Prophet).
  const encoded = encodeURIComponent(slug).replace(/'/g, "%27");
  return `https://liquipedia.net/dota2/${encoded}`;
}

// --- Предметы -------------------------------------------------------------

/** Страница предмета на Dotabuff; slug — из dname справочника. */
export function dotabuffItemUrl(dname: string | null | undefined): string | null {
  const slug = toDotabuffSlug(dname);
  return slug === null ? null : `https://www.dotabuff.com/items/${slug}`;
}
