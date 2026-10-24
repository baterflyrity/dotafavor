/**
 * OpenDotaClient: HTTP, типизация, кэш, ограничение частоты, обработка ошибок.
 *
 * Все запросы приложения идут через этот один клиент (spec/iteration-02.md, §5):
 * - централизованный rate limiter (интервал между стартами, параллелизм);
 * - дедупликация одинаковых одновременных запросов (in-flight Promise);
 * - кэш памяти + localStorage с TTL (spec/iteration-02.md, §4);
 * - 429 учитывает Retry-After и ставит общую очередь на паузу;
 * - сетевые ошибки и 5xx повторяются не более maxRetries раз с backoff + jitter;
 * - прочие 4xx без автоматических повторов;
 * - AbortController-таймаут на каждый реальный запрос.
 *
 * API-ключи не используются; секреты в кэш не пишутся.
 */

import { CacheStore, buildCacheKey, globalCache } from "./cache";
import type { CacheMeta } from "./cache";
import { RateLimiter } from "./rateLimiter";
import { TTL_MS } from "./ttl";
import type {
  ApiConstantsGameMode,
  ApiConstantsHeroes,
  ApiConstantsItems,
  ApiConstantsLobbyType,
  ApiMatchDetail,
  ApiMatchSummary,
  ApiPlayerProfile,
} from "./types";

export type OpenDotaErrorKind =
  | "rate_limit"
  | "unauthorized"
  | "not_found"
  | "server"
  | "network"
  | "invalid_json"
  | "private"
  | "not_processed"
  | "unknown";

/** Ошибка запроса к OpenDota с человекочитаемым сообщением и подсказкой действия. */
export class OpenDotaError extends Error {
  readonly kind: OpenDotaErrorKind;
  /** Что может сделать пользователь: повторить, вернуться, проверить приватность... */
  readonly action: "retry" | "back" | "check_privacy" | "none";

  constructor(
    kind: OpenDotaErrorKind,
    message: string,
    action: "retry" | "back" | "check_privacy" | "none" = "retry",
  ) {
    super(message);
    this.name = "OpenDotaError";
    this.kind = kind;
    this.action = action;
  }
}

export interface OpenDotaClientOptions {
  baseUrl?: string;
  /** Максимальное число повторов при сетевых ошибках, 5xx и 429. */
  maxRetries?: number;
  /** Базовая задержка backoff между повторами, мс (растёт экспоненциально). */
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Источник случайности для jitter (подменяется в тестах). */
  random?: () => number;
  /** Таймаут одного реального HTTP-запроса, мс. */
  timeoutMs?: number;
  /** Максимальная пауза по Retry-After, мс. */
  maxRetryAfterMs?: number;
  /** Потолок экспоненциального backoff, мс. */
  maxBackoffMs?: number;
  /** Доля jitter к backoff (0..1). */
  jitter?: number;
  /** Параметры общего limiter-а (интервал, параллелизм). */
  limiter?: { minIntervalMs?: number; maxConcurrent?: number };
  /** Слой кэша. По умолчанию — изолированный кэш в памяти; синглтон использует globalCache. */
  cache?: CacheStore;
}

export interface HistoryQuery {
  gameMode?: number;
  limit?: number;
  offset?: number;
  significant?: 0 | 1;
}

export interface GetMatchOptions {
  /** Принудительное обновление: инвалидирует кэш матча и полностью обходит его. */
  force?: boolean;
}

const DEFAULT_BASE = "https://api.opendota.com/api/";
const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Матч считается полностью обработанным только при явных признаках,
 * а не просто по HTTP 200 (spec/iteration-02.md, §4.2).
 */
export function isCompleteMatch(data: ApiMatchDetail): boolean {
  if (!Array.isArray(data.players) || data.players.length < 2) return false;
  if (data.radiant_win !== true && data.radiant_win !== false) return false;
  if (typeof data.duration !== "number" || data.duration <= 0) return false;
  if (!Array.isArray(data.radiant_gold_adv) || data.radiant_gold_adv.length === 0) {
    return false;
  }
  if (!Array.isArray(data.teamfights) || data.teamfights.length === 0) return false;
  if (!Array.isArray(data.objectives) || data.objectives.length === 0) return false;
  return true;
}

/** Retry-After: секунды либо HTTP-дата. */
function parseRetryAfter(
  header: string | null | undefined,
  nowMs: number,
): number | null {
  if (header === null || header === undefined) return null;
  const trimmed = header.trim();
  if (trimmed === "") return null;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - nowMs);
  return null;
}

export class OpenDotaClient {
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly maxBackoffMs: number;
  private readonly jitter: number;
  private readonly random: () => number;
  private readonly timeoutMs: number;
  private readonly maxRetryAfterMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  /** Общий ограничитель частоты — очередь и для фоновых, и для кнопок. */
  private readonly limiter: RateLimiter;
  /** Кэш ответов: память + localStorage (см. cache.ts). */
  private readonly cache: CacheStore;
  /** Публичный доступ к тому же кэшу (тесты, точечная инвалидация из UI). */
  readonly cacheStore: CacheStore;
  /** In-flight промисы по URL — дедупликация одинаковых одновременных запросов. */
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(options: OpenDotaClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 800;
    this.maxBackoffMs = options.maxBackoffMs ?? 10_000;
    this.jitter = options.jitter ?? 0.25;
    this.random = options.random ?? Math.random;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxRetryAfterMs = options.maxRetryAfterMs ?? 60_000;
    this.fetchImpl = options.fetchImpl ?? fetch.bind(globalThis);
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? (() => Date.now());
    this.limiter = new RateLimiter({
      sleep: this.sleep,
      now: this.now,
      minIntervalMs: options.limiter?.minIntervalMs,
      maxConcurrent: options.limiter?.maxConcurrent,
    });
    this.cache = options.cache ?? new CacheStore({ storage: null, now: this.now });
    this.cacheStore = this.cache;
  }

  private url(path: string, query?: Record<string, string | number | undefined>): string {
    const url = new URL(path.replace(/^\//, ""), this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  /** Экспоненциальный backoff с небольшим jitter и потолком. */
  private backoffMs(retryIndex: number): number {
    const base = this.retryDelayMs * 2 ** retryIndex;
    const withJitter = base + Math.floor(this.random() * base * this.jitter);
    return Math.min(withJitter, this.maxBackoffMs);
  }

  /** Один реальный HTTP-запрос внутри limiter-слота, с таймаутом через AbortController. */
  private async fetchThroughLimiter(target: string): Promise<Response> {
    return this.limiter.run<Response>(
      async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
          return await this.fetchImpl(target, {
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
        } catch (error) {
          if (controller.signal.aborted) {
            throw new OpenDotaError(
              "network",
              "OpenDota не ответил вовремя. Проверьте соединение и повторите.",
              "retry",
            );
          }
          throw error;
        } finally {
          clearTimeout(timer);
        }
      },
    );
  }

  /**
   * Цикл запроса с повторами и классификацией ошибок.
   * Ошибки НЕ кэшируются: кэшируется только успешный разобранный ответ.
   */
  private async execute(target: string): Promise<unknown> {
    let lastError: OpenDotaError | null = null;
    let delayOverride: number | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        await this.sleep(delayOverride ?? this.backoffMs(attempt - 1));
        delayOverride = null;
      }

      let response: Response;
      try {
        response = await this.fetchThroughLimiter(target);
      } catch (error) {
        if (error instanceof OpenDotaError) {
          lastError = error;
        } else {
          lastError = new OpenDotaError(
            "network",
            "Не удалось связаться с OpenDota. Проверьте подключение к интернету.",
            "retry",
          );
        }
        continue;
      }

      if (response.status === 429) {
        const headers = response.headers as Headers | undefined;
        const raw = headers?.get?.("Retry-After") ?? null;
        const retryAfter = parseRetryAfter(raw, this.now());
        const delayMs = Math.min(
          retryAfter ?? this.backoffMs(attempt),
          this.maxRetryAfterMs,
        );
        // Ставим общую очередь на паузу, чтобы очередь не крутилась в тесном цикле.
        this.limiter.pauseUntil(this.now() + delayMs);
        delayOverride = delayMs;
        lastError = new OpenDotaError(
          "rate_limit",
          "Превышен лимит запросов OpenDota. Подождите немного и повторите.",
          "retry",
        );
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        throw new OpenDotaError(
          "unauthorized",
          "Источник запретил доступ к данным (HTTP " + response.status + ").",
          "check_privacy",
        );
      }
      if (response.status === 404) {
        throw new OpenDotaError("not_found", "Данные не найдены (HTTP 404).", "back");
      }
      if (response.status >= 500) {
        lastError = new OpenDotaError(
          "server",
          "Сервер OpenDota временно недоступен (HTTP " + response.status + ").",
          "retry",
        );
        continue;
      }
      if (!response.ok) {
        throw new OpenDotaError(
          "unknown",
          "Неожиданный ответ сервера (HTTP " + response.status + ").",
          "retry",
        );
      }

      const text = await response.text();
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new OpenDotaError(
          "invalid_json",
          "OpenDota вернул некорректный JSON.",
          "retry",
        );
      }
    }

    throw lastError ?? new OpenDotaError("network", "Сетевая ошибка.", "retry");
  }

  /**
   * GET с дедупликацией: одинаковые одновременные запросы используют
   * один in-flight Promise (защита от cache stampede).
   */
  private async requestRaw(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<unknown> {
    const target = this.url(path, query);
    const existing = this.inflight.get(target);
    if (existing) return existing;

    const promise = this.execute(target);
    this.inflight.set(target, promise);
    void promise.then(
      () => this.inflight.delete(target),
      () => this.inflight.delete(target),
    );
    return promise;
  }

  /** Разбор ответа с ожиданием JSON-объекта; ошибочные объекта API превращаются в OpenDotaError. */
  private async requestJson<T>(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const data = await this.requestRaw(path, query);
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const obj = data as Record<string, unknown>;
      if (typeof obj.err === "string") {
        throw this.classifyApiError(obj.err);
      }
      if (obj.error && typeof obj.error === "string") {
        throw this.classifyApiError(obj.error);
      }
    }
    return data as T;
  }

  private classifyApiError(err: string): OpenDotaError {
    const lower = err.toLowerCase();
    if (lower.includes("not parsed") || lower.includes("pending")) {
      return new OpenDotaError(
        "not_processed",
        "Матч ещё не обработан OpenDota. Подробности появятся позже.",
        "back",
      );
    }
    if (lower.includes("private") || lower.includes("visibility")) {
      return new OpenDotaError(
        "private",
        "Данные игрока скрыты настройками приватности Dota 2.",
        "check_privacy",
      );
    }
    if (lower.includes("not found")) {
      return new OpenDotaError("not_found", "Запись не найдена.", "back");
    }
    return new OpenDotaError("unknown", err, "retry");
  }

  /** Чтение через кэш: при попадании сеть не вызывается вообще. */
  private async cached<T>(
    key: string,
    endpoint: string,
    ttlMs: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const hit = this.cache.get<T>(key);
    if (hit) return hit.value;
    const value = await loader();
    this.cache.set(key, value, ttlMs, endpoint);
    return value;
  }

  /** GET /players/{account_id} — профиль (кэш 4 часа). */
  async getPlayerProfile(accountId: number): Promise<ApiPlayerProfile> {
    const endpoint = `players/${accountId}`;
    const key = buildCacheKey({ endpoint, accountId });
    return this.cached(key, endpoint, TTL_MS.profile, () =>
      this.requestJson<ApiPlayerProfile>(endpoint),
    );
  }

  /**
   * GET /players/{account_id}/matches — история матчей (кэш 5 минут).
   * game_mode=23 (Turbo), постраничная загрузка через offset.
   * Ключ включает accountId и все параметры — страницы не конфликтуют.
   */
  async getPlayerMatches(
    accountId: number,
    query: HistoryQuery = {},
  ): Promise<ApiMatchSummary[]> {
    const endpoint = `players/${accountId}/matches`;
    const params = {
      game_mode: query.gameMode ?? 23,
      limit: query.limit ?? 20,
      significant: query.significant ?? 0,
      offset: query.offset ?? 0,
    };
    const key = buildCacheKey({ endpoint, accountId, query: params });
    return this.cached(key, endpoint, TTL_MS.history, async () => {
      const data = await this.requestRaw(endpoint, params);
      if (!Array.isArray(data)) {
        throw new OpenDotaError(
          "invalid_json",
          "Неожиданный формат ответа истории матчей.",
          "retry",
        );
      }
      return data as ApiMatchSummary[];
    });
  }

  /**
   * GET /matches/{match_id} — подробности матча.
   * Полностью обработанный матч кэшируется на 7 дней, неполный — на 5 минут,
   * чтобы позже можно было получить обновлённый ответ.
   * options.force: инвалидирует кэш этого матча и выполняет новый сетевой запрос,
   * обходя кэш; справочники и история при этом не трогаются.
   */
  async getMatch(matchId: number, options: GetMatchOptions = {}): Promise<ApiMatchDetail> {
    const endpoint = `matches/${matchId}`;
    const key = buildCacheKey({ endpoint });

    if (options.force) {
      this.cache.invalidateEndpoint(endpoint);
    } else {
      const hit = this.cache.get<ApiMatchDetail>(key);
      if (hit) return hit.value;
    }

    const data = await this.requestJson<ApiMatchDetail>(endpoint);
    if (!data || typeof data !== "object" || !Array.isArray(data.players) || data.players.length === 0) {
      throw new OpenDotaError(
        "not_processed",
        "Подробности матча ещё не обработаны OpenDota.",
        "back",
      );
    }

    const ttl = isCompleteMatch(data) ? TTL_MS.matchComplete : TTL_MS.matchIncomplete;
    this.cache.set(key, data, ttl, endpoint);
    return data;
  }

  /** GET /constants/heroes (кэш 7 дней). */
  async getHeroes(): Promise<ApiConstantsHeroes> {
    const endpoint = "constants/heroes";
    const key = buildCacheKey({ endpoint });
    return this.cached(key, endpoint, TTL_MS.constants, () =>
      this.requestJson<ApiConstantsHeroes>(endpoint),
    );
  }

  /** GET /constants/items (кэш 7 дней). */
  async getItems(): Promise<ApiConstantsItems> {
    const endpoint = "constants/items";
    const key = buildCacheKey({ endpoint });
    return this.cached(key, endpoint, TTL_MS.constants, () =>
      this.requestJson<ApiConstantsItems>(endpoint),
    );
  }

  /** GET /constants/game_mode (кэш 7 дней). */
  async getGameModes(): Promise<ApiConstantsGameMode> {
    const endpoint = "constants/game_mode";
    const key = buildCacheKey({ endpoint });
    return this.cached(key, endpoint, TTL_MS.constants, () =>
      this.requestJson<ApiConstantsGameMode>(endpoint),
    );
  }

  /** GET /constants/lobby_type (кэш 7 дней). */
  async getLobbyTypes(): Promise<ApiConstantsLobbyType> {
    const endpoint = "constants/lobby_type";
    const key = buildCacheKey({ endpoint });
    return this.cached(key, endpoint, TTL_MS.constants, () =>
      this.requestJson<ApiConstantsLobbyType>(endpoint),
    );
  }

  // --- служебные методы для UI ---------------------------------------------

  /** Метаданные самой свежей записи кэша с префиксом endpoint («данные обновлены …»). */
  cacheMeta(endpointPrefix: string): CacheMeta | null {
    return this.cache.latestMeta(endpointPrefix);
  }

  /** Полная очистка локального кэша браузера (действие пользователя в UI). */
  clearCache(): void {
    this.cache.clear();
  }

  /** Сводка по кэшу для раздела настроек/отладки. */
  cacheStats(): { entries: number; persisted: boolean } {
    return this.cache.stats();
  }
}

/**
 * Синглтон приложения: один клиент, один limiter, один постоянный кэш
 * (память + localStorage — работает между перезагрузками до истечения TTL).
 */
export const opendotaClient = new OpenDotaClient({ cache: globalCache });
