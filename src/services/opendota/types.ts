/**
 * Типы ответов OpenDota. Все поля, кроме явно отмеченных, считаются необязательными:
 * ответ API меняется со временем, и часть матчей содержит неполные данные.
 */

/** Строка истории (GET /players/{id}/matches). */
export interface ApiMatchSummary {
  match_id: number;
  player_slot?: number;
  hero_id?: number;
  game_mode?: number;
  lobby_type?: number;
  duration?: number;
  start_time?: number;
  radiant_win?: boolean | null;
  kills?: number;
  deaths?: number;
  assists?: number;
  last_hits?: number;
  denies?: number;
  gold_per_min?: number;
  xp_per_min?: number;
  total_gold?: number;
  total_xp?: number;
  level?: number;
  net_worth?: number;
  hero_damage?: number;
  tower_damage?: number;
  hero_healing?: number;
  kda?: number;
  leaver_status?: number;
  party_size?: number;
  version?: number | null;
  patch?: number;
  region?: number;
}

/** Одна позиция предмета у игрока в деталях матча. */
export type ApiItemSlot =
  | "item_0"
  | "item_1"
  | "item_2"
  | "item_3"
  | "item_4"
  | "item_5"
  | "backpack_0"
  | "backpack_1"
  | "backpack_2"
  | "item_neutral"
  | "item_neutral2";

/** Покупка из purchase_log. */
export interface ApiPurchaseLogEntry {
  key: string;
  time: number;
}

/** Событие матча (objectives). */
export interface ApiObjective {
  type?: string;
  time?: number;
  player_slot?: number;
  key?: string;
  team?: number;
}

/** Командный бой (teamfights). */
export interface ApiTeamfight {
  start?: number;
  end?: number;
  win?: number;
  deaths_pos?: unknown;
  players?: {
    deaths_pos?: unknown;
    ability_uses?: Record<string, number>;
    item_uses?: Record<string, number>;
    killed?: Record<string, number>;
    assists?: number;
    damage?: number;
    heal?: number;
    gold_delta?: number;
    xp_delta?: number;
  }[];
}

/** Позиции по линиям (lane_pos): { "1": { kills, deaths } ... } не гарантируется. */
export type ApiLanePos = Record<string, unknown>;

/** Строка игрока в деталях матча (GET /matches/{id}). */
export interface ApiMatchPlayer {
  player_slot?: number;
  team_number?: number;
  team_slot?: number;
  hero_id?: number;
  account_id?: number;
  personaname?: string | null;
  item_0?: number | null;
  item_1?: number | null;
  item_2?: number | null;
  item_3?: number | null;
  item_4?: number | null;
  item_5?: number | null;
  backpack_0?: number | null;
  backpack_1?: number | null;
  backpack_2?: number | null;
  item_neutral?: number | null;
  item_neutral2?: number | null;
  kills?: number;
  deaths?: number;
  assists?: number;
  last_hits?: number;
  denies?: number;
  gold_per_min?: number;
  xp_per_min?: number;
  level?: number;
  net_worth?: number;
  gold?: number;
  gold_spent?: number;
  hero_damage?: number;
  tower_damage?: number;
  hero_healing?: number;
  leaver_status?: number;
  ability_upgrades?: number[];
  purchase_log?: ApiPurchaseLogEntry[];
  purchase?: Record<string, number>;
  lane_pos?: ApiLanePos;
  benchmarks?: {
    gold_per_min?: { percentile?: number };
    xp_per_min?: { percentile?: number };
    kills?: { percentile?: number };
    deaths?: { percentile?: number };
    assists?: { percentile?: number };
    last_hits?: { percentile?: number };
    hero_damage?: { percentile?: number };
    healing?: { percentile?: number };
    [key: string]: { percentile?: number } | undefined;
  };
  isRadiant?: boolean;
  win?: number;
  lose?: number;
}

/** Детальный ответ матча (GET /matches/{id}). */
export interface ApiMatchDetail {
  match_id: number;
  radiant_win?: boolean | null;
  duration?: number;
  pre_game_duration?: number;
  start_time?: number;
  lobby_type?: number;
  game_mode?: number;
  human_players?: number;
  radiant_score?: number;
  dire_score?: number;
  patch?: number;
  region?: number;
  players: ApiMatchPlayer[];
  radiant_gold_adv?: number[] | null;
  radiant_xp_adv?: number[] | null;
  teamfights?: ApiTeamfight[] | null;
  objectives?: ApiObjective[] | null;
  picks_bans?: unknown[] | null;
}

/** Профиль игрока (GET /players/{id}). */
export interface ApiPlayerProfile {
  profile?: {
    account_id?: number;
    personaname?: string | null;
    avatar?: string | null;
    avatarfull?: string | null;
    profileurl?: string | null;
    last_login?: string | null;
    plus?: boolean;
  };
  mmr_estimate?: { estimate?: number } | null;
  solo_competitive_rank?: string | null;
  competitive_rank?: string | null;
}

/** Справочник game_mode / lobby_type. */
export interface ApiLookupEntry {
  id: number;
  name?: string;
  balanced?: boolean;
}

export type ApiConstantsGameMode = Record<string, ApiLookupEntry>;
export type ApiConstantsLobbyType = Record<string, ApiLookupEntry>;

/** Справочник героев: объект hero_id -> данные. */
export interface ApiHeroConstant {
  id: number;
  name?: string;
  localized_name?: string;
  /** Путь к изображению на CDN Valve из ответа API (предпочтительнее сборки URL). */
  img?: string;
  /** Путь к иконке меньшего размера. */
  icon?: string;
  primary_attr?: string;
  attack_type?: string;
  roles?: string[];
}

export type ApiConstantsHeroes = Record<string, ApiHeroConstant>;

/** Справочник предметов: объект item_id -> данные. */
export interface ApiItemConstant {
  id: number;
  /** Внутреннее имя (например item_black_king_bar) — не для основного UI. */
  name?: string;
  /** Отображаемое английское название из официальных данных. */
  dname?: string;
  /** Путь к изображению на CDN Valve из ответа API. */
  img?: string;
  cost?: number;
  secret_shop?: number;
  basic?: boolean;
  recipes?: number[];
}

export type ApiConstantsItems = Record<string, ApiItemConstant>;
