/**
 * Централизованные TTL для кэша ответов OpenDota.
 *
 * Значения заданы здесь, а не разбросаны по UI и компонентам.
 * Источник — spec/iteration-02.md, §4.2.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const TTL_MS = {
  /** Статические справочники: герои, предметы, режимы, лобби. */
  constants: 7 * DAY,
  /** Профиль игрока (имя, аватар). */
  profile: 4 * HOUR,
  /** История матчей: после новой игры список может измениться. */
  history: 5 * MINUTE,
  /** Подробности полностью обработанного матча. */
  matchComplete: 7 * DAY,
  /** Подробности матча с неполными/необработанными данными — чтобы позже получить обновление. */
  matchIncomplete: 5 * MINUTE,
} as const;

export type TtlName = keyof typeof TTL_MS;
