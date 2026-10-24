/** Доменные модели приложения (нормализованные ответы OpenDota). */

export type Side = "radiant" | "dire";
export type MatchResult = "win" | "loss" | "unknown";

/** Итоговая сборка предметов игрока. */
export interface PlayerItems {
  /** 6 основных слотов (null — слот пуст). */
  main: (number | null)[];
  backpack: (number | null)[];
  neutral: number | null;
  neutral2: number | null;
}

/**
 * Итоговые показатели игрока в матче.
 * `undefined` означает «нет данных», НЕ ноль.
 */
export interface PlayerStats {
  playerSlot?: number;
  accountId?: number;
  heroId?: number;
  personaName?: string | null;
  side: Side;
  kills?: number;
  deaths?: number;
  assists?: number;
  lastHits?: number;
  denies?: number;
  gpm?: number;
  xpm?: number;
  level?: number;
  netWorth?: number;
  gold?: number;
  goldSpent?: number;
  heroDamage?: number;
  towerDamage?: number;
  heroHealing?: number;
  leaverStatus?: number;
  items: PlayerItems;
  purchaseLog?: { key: string; time: number }[];
}

/** Строка истории матчей. */
export interface MatchSummary {
  matchId: number;
  startTime?: number;
  duration?: number;
  heroId?: number;
  gameMode?: number;
  lobbyType?: number;
  result: MatchResult;
  side?: Side;
  kills?: number;
  deaths?: number;
  assists?: number;
  lastHits?: number;
  denies?: number;
  gpm?: number;
  xpm?: number;
  netWorth?: number;
  leaverStatus?: number;
  /** Данные матча неполные — влияет на интерпретацию оценок. */
  incomplete: boolean;
}

/** Командное событие/цель матча. */
export interface MatchEvent {
  type?: string;
  time?: number;
  label?: string;
}

/** Детальный матч. */
export interface MatchDetail {
  matchId: number;
  startTime?: number;
  duration?: number;
  radiantWin?: boolean | null;
  gameMode?: number;
  lobbyType?: number;
  radiantScore?: number;
  direScore?: number;
  patch?: number;
  players: PlayerStats[];
  /** Временные ряды преимущества Radiant (золото/опыт), если предоставлены API. */
  radiantGoldAdv?: number[];
  radiantXpAdv?: number[];
  teamfights?: {
    start?: number;
    end?: number;
    win?: number;
    damage?: number[];
    goldDelta?: number[];
  }[];
  events?: MatchEvent[];
  /** Каких данных не хватает (для отображения и оценок). */
  missing: string[];
}
