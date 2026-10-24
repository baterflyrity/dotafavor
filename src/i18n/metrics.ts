/**
 * Русские подписи статистики, полей и событий (spec/iteration-02.md, §7.2).
 *
 * Правила:
 * - raw key (snake_case), имя enum или технический идентификатор не должны
 *   быть видимым названием в интерфейсе;
 * - неизвестный ключ получает общую читаемую подпись через fallback;
 * - «undefined», «[object Object]», «NaN» и сырой enum не выводятся.
 *
 * Названия игровых сущностей (герои, предметы, способности) по правке 01
 * (spec/iteration-02-amendments.md) остаются английскими — они приходят из
 * справочников OpenDota, здесь локализуются только подписи и описания.
 */

/** Известные подписи полей статистики и структурных полей матча. */
const METRIC_LABELS: Record<string, string> = {
  // Показатели игрока
  kills: "Убийства",
  deaths: "Смерти",
  assists: "Помощь (ассисты)",
  last_hits: "Последние удары",
  denies: "Запреты (дени)",
  gold_per_min: "Золото в минуту (GPM)",
  xp_per_min: "Опыт в минуту (XPM)",
  gpm: "Золото в минуту (GPM)",
  xpm: "Опыт в минуту (XPM)",
  net_worth: "Нетворс",
  gold: "Непотраченное золото",
  gold_spent: "Потрачено золота",
  total_gold: "Всего золота",
  total_xp: "Всего опыта",
  hero_damage: "Урон героям",
  tower_damage: "Урон строениям",
  hero_healing: "Лечение союзников",
  level: "Уровень",
  leaver_status: "Покинул игру (leaver status)",
  benchmarks: "Бенчмарки OpenDota",
  percentile: "Процентиль",

  // Матч в целом
  match_id: "Номер матча",
  duration: "Длительность",
  start_time: "Время начала",
  radiant_win: "Исход матча",
  radiant_score: "Очки Radiant",
  dire_score: "Очки Dire",
  game_mode: "Режим игры",
  lobby_type: "Тип лобби",
  patch: "Патч",
  region: "Регион",
  human_players: "Игроков",
  player_slot: "Слот игрока",
  account_id: "Аккаунт",
  hero_id: "Герой",

  // Временные ряды и структура данных
  radiant_gold_adv: "Ряд преимущества по золоту",
  radiant_xp_adv: "Ряд преимущества по опыту",
  xp_adv: "Ряд преимущества по опыту",
  gold_adv: "Ряд преимущества по золоту",
  teamfights: "Командные бои",
  objectives: "Цели и события",
  picks_bans: "Пики и баны",
  lane_pos: "Позиции по линиям",
  purchase_log: "История покупок",
  ability_upgrades: "Прокачка способностей",
  isRadiant: "Сторона Radiant",
  win: "Победа",
  lose: "Поражение",
};

/** Известные типы событий матча (objectives). */
const EVENT_LABELS: Record<string, string> = {
  CHAT_MESSAGE_FIRSTBLOOD: "Первая кровь",
  CHAT_MESSAGE_HERO_KILL: "Убийство героя",
  CHAT_MESSAGE_KILL: "Убийство",
  CHAT_MESSAGE_TOWER_KILL: "Уничтожение башни",
  CHAT_MESSAGE_BARRACKS_KILL: "Уничтожение казарм",
  CHAT_MESSAGE_ROSHAN_KILL: "Рошан убит",
  CHAT_MESSAGE_AEGIS: "Поднята Эгида бессмертия",
  CHAT_MESSAGE_MANA_DRAIN: "Вытянута мана",
  CHAT_MESSAGE_INCOMING_RUNE: "Подобрана руна",
  DOTA_ROSHAN_KILL: "Рошан убит",
  DOTA_GLYPH_USED: "Использован глиф",
  DOTA_WARD_KILL: "Уничтожено вард",
  DOTA_COURIER_KILL: "Убит курьер",
};

/** Типы событий, для которых нет перевода — humanize безопасен по ним. */
const UPPER_SNAKE = /^[A-Z0-9_]+$/;

/**
 * Общая подпись для неизвестного ключа: читаемое имя без сырого формата.
 * Технические префиксы и разделители убираются; результат никогда не пуст.
 */
export function humanizeKey(key: string): string {
  const raw = typeof key === "string" ? key.trim() : "";
  if (!raw) return "Показатель";
  const stripped = raw.replace(
    /^(npc_dota_hero_|item_|api_|chat_message_|dota_)/i,
    "",
  );
  const words = stripped.split(/[_\-.]+/).filter(Boolean);
  if (words.length === 0) return "Показатель";

  if (words.length === 1) {
    const word = words[0];
    // Слова целиком в верхнем регистре (GPM, FIRSTBLOOD) не трогаем.
    if (UPPER_SNAKE.test(word)) return word;
    // camelCase → «camel Case» с заглавной буквы.
    const spaced = word.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
  }

  const joined = words.join(" ");
  // UPPER_SNAKE из нескольких слов (SOMETHING_NEW) → «Something new».
  if (UPPER_SNAKE.test(words.join("_"))) {
    return joined.charAt(0).toUpperCase() + joined.slice(1).toLowerCase();
  }
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/**
 * Подпись метрики для UI: известная — из словаря, неизвестная — fallback.
 * Никогда не возвращает undefined/NaN/[object Object].
 */
export function metricLabel(key: string): string {
  if (typeof key !== "string" || key.length === 0) return "Показатель";
  return METRIC_LABELS[key] ?? humanizeKey(key);
}

/** Человекочитаемое название события матча (известное — из словаря). */
export function eventLabel(event: {
  type?: string;
  label?: string;
}): string {
  if (event.type && EVENT_LABELS[event.type]) return EVENT_LABELS[event.type];
  const label = event.label;
  if (typeof label === "string" && label.trim().length > 0) {
    // Технические ключи (UPPER_SNAKE / snake_case) прогоняем через fallback.
    if (/^[A-Za-z][A-Za-z0-9]*([ _-][A-Za-z0-9]+)*$/.test(label) && label.includes("_")) {
      return humanizeKey(label);
    }
    if (/^[A-Z0-9_]+$/.test(label)) return humanizeKey(label);
    return label;
  }
  if (event.type) return humanizeKey(event.type);
  return "Событие";
}

/** Список подписей для массива ключей (например, «нет данных»). */
export function metricLabels(keys: readonly string[]): string[] {
  return keys.map(metricLabel);
}
