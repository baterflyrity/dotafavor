/**
 * Локальное хранилище: профиль, настройки, субъективные оценки матчей.
 * Данные остаются только в браузере пользователя.
 */

const PROFILE_KEY = "dota2analytics:profile";
const FEEDBACK_KEY = "dota2analytics:feedback";

export interface StoredProfile {
  steamId64: string;
  accountId: number;
  personaName?: string | null;
  avatar?: string | null;
}

export type FeedbackAnswers = Record<number, Partial<FeedbackFields>>;

export interface FeedbackFields {
  liked: number;
  balanced: number;
  alliesUseful: number;
  ownImpact: number;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Читает сохранённый профиль (или null). */
export function loadProfile(): StoredProfile | null {
  const data = safeParse<StoredProfile>(localStorage.getItem(PROFILE_KEY));
  if (!data || typeof data.steamId64 !== "string" || typeof data.accountId !== "number") {
    return null;
  }
  return data;
}

export function saveProfile(profile: StoredProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function clearProfile(): void {
  localStorage.removeItem(PROFILE_KEY);
}

/** Читает все субъективные оценки матчей. */
export function loadFeedback(): FeedbackAnswers {
  return safeParse<FeedbackAnswers>(localStorage.getItem(FEEDBACK_KEY)) ?? {};
}

export function saveFeedback(matchId: number, fields: Partial<FeedbackFields>): void {
  const all = loadFeedback();
  all[matchId] = { ...all[matchId], ...fields };
  localStorage.setItem(FEEDBACK_KEY, JSON.stringify(all));
}
