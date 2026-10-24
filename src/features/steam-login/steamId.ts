/**
 * Преобразование SteamID64 в Steam32 Account ID.
 *
 * SteamID64 — 64-битный идентификатор, для больших чисел используется BigInt,
 * чтобы исключить потерю точности в арифметике обычных чисел JavaScript.
 */

/** Константа смещения personal individual instance (из тех. документации Steam). */
export const STEAM_ID64_OFFSET = 76561197960265728n;

/** Ожидаемая длина числового SteamID64. */
export const STEAMID64_LENGTH = 17;

export class SteamIdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SteamIdError";
  }
}

/** Проверяет, что строка — корректный 17-значный SteamID64. */
export function isValidSteamId64(value: string): boolean {
  if (!/^\d{17}$/.test(value)) return false;
  try {
    const id = BigInt(value);
    return id >= STEAM_ID64_OFFSET;
  } catch {
    return false;
  }
}

/**
 * Преобразует SteamID64 в Steam32 Account ID вычитанием константы.
 * Все промежуточные вычисления выполняются в BigInt, результат
 * проверяется на диапазон 32-битного беззнакового числа перед
 * преобразованием в number.
 */
export function steamId64ToSteam32(steamId64: string | bigint): number {
  let id: bigint;
  try {
    id = typeof steamId64 === "bigint" ? steamId64 : BigInt(steamId64);
  } catch {
    throw new SteamIdError("SteamID64 не является числом");
  }

  if (id < STEAM_ID64_OFFSET) {
    throw new SteamIdError("SteamID64 меньше допустимого диапазона");
  }

  const accountId = id - STEAM_ID64_OFFSET;
  const UINT32_MAX = 4294967295n;
  if (accountId < 0n || accountId > UINT32_MAX) {
    throw new SteamIdError("Account ID выходит за 32-битный диапазон");
  }

  return Number(accountId);
}

/**
 * Обратное преобразование: Steam32 Account ID → SteamID64 (строка).
 * Выполняется в BigInt с проверкой диапазона — без арифметики обычных чисел.
 * Возвращает null, если account_id не является допустимым 32-битным ID.
 */
export function steam32ToSteamId64(accountId: number): string | null {
  if (!Number.isInteger(accountId) || accountId < 0) return null;
  const id = BigInt(accountId);
  const UINT32_MAX = 4294967295n;
  if (id > UINT32_MAX) return null;
  return String(id + STEAM_ID64_OFFSET);
}
