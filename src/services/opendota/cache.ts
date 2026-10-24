/**
 * Клиентский кэш ответов OpenDota: память текущей сессии + localStorage.
 *
 * Возможности (spec/iteration-02.md, §4):
 * - ключ включает метод, endpoint, account ID и все существенные query-параметры;
 * - каждая запись хранит cachedAt / expiresAt / версию схемы / исходный endpoint;
 * - ошибки, 429, 5xx и некорректный JSON не кэшируются (кэшируется только
 *   уже проверенный успешный результат — см. OpenDotaClient);
 * - сегментация по endpoint и ID пользователя: история/профиль ключуются
 *   по accountId, справочники — общие;
 * - объём постоянного кэша ограничен, просроченные записи вычищаются;
 * - есть in-flight дедупликация (см. OpenDotaClient) и точечная инвалидация.
 *
 * Кэш клиентский и привязан к браузеру: он снижает число запросов
 * конкретного пользователя, а не всех пользователей сайта.
 */

export const CACHE_SCHEMA_VERSION = 1;
export const CACHE_STORAGE_KEY = "dota2analytics:cache";

export interface CacheEntry<T = unknown> {
  value: T;
  /** Когда значение было сохранено (epoch ms). */
  cachedAt: number;
  /** Когда запись считается устаревшей (epoch ms). */
  expiresAt: number;
  /** Версия схемы/ключей: при несовместимости запись отбрасывается. */
  version: number;
  /** Исходный endpoint, например "matches/123". */
  endpoint: string;
}

/** Метаданные записи без значения — для отображения времени обновления. */
export interface CacheMeta {
  cachedAt: number;
  expiresAt: number;
  endpoint: string;
}

export interface CacheKeyInput {
  /** Endpoint без базового URL, например "players/1/matches". */
  endpoint: string;
  /** Account ID — сегмент для данных пользователя (история, профиль). */
  accountId?: number | null;
  /** Query-параметры запроса (существенные участвуют в ключе). */
  query?: Record<string, string | number | undefined>;
}

/**
 * Строит ключ кэша: версия схемы + метод + endpoint + сегмент пользователя
 * + отсортированные query-параметры. Разные страницы/фильтры не конфликтуют.
 */
export function buildCacheKey({ endpoint, accountId, query }: CacheKeyInput): string {
  const parts: string[] = [];
  if (query) {
    for (const key of Object.keys(query).sort()) {
      const value = query[key];
      if (value !== undefined) parts.push(`${key}=${String(value)}`);
    }
  }
  const segment = accountId === undefined || accountId === null ? "~" : String(accountId);
  return `v${CACHE_SCHEMA_VERSION}:GET:${endpoint}:${segment}:${parts.join("&")}`;
}

interface PersistedState {
  version: number;
  entries: Record<string, CacheEntry>;
}

export interface CacheStoreOptions {
  /** Хранилище для постоянного уровня. null — только память (для тестов). */
  storage?: Storage | null;
  now?: () => number;
  /** Максимум записей (после вычистки просроченных удаляются самые старые). */
  maxEntries?: number;
  /** Ограничение сериализованного объёма, байт (защита от quota). */
  maxBytes?: number;
}

const DEFAULT_MAX_ENTRIES = 300;
const DEFAULT_MAX_BYTES = 2_000_000;

/** Локальное хранилище с памятью первого уровня. */
export class CacheStore {
  private readonly memory = new Map<string, CacheEntry>();
  private readonly storage: Storage | null;
  private readonly now: () => number;
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  /** Ленивая загрузка постоянного уровня. */
  private hydrated = false;

  constructor(options: CacheStoreOptions = {}) {
    this.storage = options.storage === undefined ? safeLocalStorage() : options.storage;
    this.now = options.now ?? (() => Date.now());
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  /** Возвращает живую запись или null (истёкшая запись считается отсутствующей). */
  get<T>(key: string): CacheEntry<T> | null {
    const now = this.now();
    const memo = this.memory.get(key);
    if (memo) {
      if (memo.version === CACHE_SCHEMA_VERSION && memo.expiresAt > now) {
        return memo as CacheEntry<T>;
      }
      this.memory.delete(key);
    }

    const persisted = this.readPersisted();
    if (!persisted) return null;
    const entry = persisted.entries[key];
    if (!entry) return null;
    if (entry.version !== CACHE_SCHEMA_VERSION || entry.expiresAt <= now) {
      delete persisted.entries[key];
      this.writePersisted(persisted);
      return null;
    }
    this.memory.set(key, entry);
    return entry as CacheEntry<T>;
  }

  /** Сохраняет значение с указанным TTL. Ошибки в value не сохраняются — вызывающий код отвечает сам. */
  set<T>(key: string, value: T, ttlMs: number, endpoint: string): void {
    const now = this.now();
    const entry: CacheEntry<T> = {
      value,
      cachedAt: now,
      expiresAt: now + ttlMs,
      version: CACHE_SCHEMA_VERSION,
      endpoint,
    };
    this.memory.set(key, entry as CacheEntry);
    // Ограничение и для памяти: без этого запись могла пережить вытеснение
    // из постоянного уровня и игнорировать лимит (spec/iteration-02.md, §4.1).
    if (this.memory.size > this.maxEntries) {
      const sorted = [...this.memory.entries()].sort(
        (a, b) => a[1].cachedAt - b[1].cachedAt,
      );
      for (let i = 0; i < sorted.length - this.maxEntries; i++) {
        this.memory.delete(sorted[i][0]);
      }
    }

    const persisted = this.readPersisted() ?? { version: CACHE_SCHEMA_VERSION, entries: {} };
    persisted.entries[key] = entry as CacheEntry;
    this.prune(persisted);
    this.writePersisted(persisted);
  }

  /** Метаданные записи по ключу (без значения). */
  meta(key: string): CacheMeta | null {
    const entry = this.get(key);
    return entry
      ? { cachedAt: entry.cachedAt, expiresAt: entry.expiresAt, endpoint: entry.endpoint }
      : null;
  }

  /** Самая свежая запись среди endpoint-ов с указанным префиксом (для «данные обновлены …»). */
  latestMeta(endpointPrefix: string): CacheMeta | null {
    this.hydrate();
    const now = this.now();
    let best: CacheEntry | null = null;
    const scan = (entries: Record<string, CacheEntry>) => {
      for (const entry of Object.values(entries)) {
        if (!entry.endpoint.startsWith(endpointPrefix)) continue;
        if (entry.version !== CACHE_SCHEMA_VERSION || entry.expiresAt <= now) continue;
        if (!best || entry.cachedAt > best.cachedAt) best = entry;
      }
    };
    scan(Object.fromEntries(this.memory));
    const persisted = this.readPersisted();
    if (persisted) scan(persisted.entries);
    return best
      ? { cachedAt: (best as CacheEntry).cachedAt, expiresAt: (best as CacheEntry).expiresAt, endpoint: (best as CacheEntry).endpoint }
      : null;
  }

  /** Точечная инвалидация одной записи. */
  invalidateKey(key: string): boolean {
    const had = this.memory.delete(key);
    const persisted = this.readPersisted();
    if (persisted && persisted.entries[key]) {
      delete persisted.entries[key];
      this.writePersisted(persisted);
      return true;
    }
    return had;
  }

  /** Инвалидация всех записей указанного endpoint (например, "matches/123"). */
  invalidateEndpoint(endpoint: string): number {
    let removed = 0;
    for (const [key, entry] of this.memory) {
      if (entry.endpoint === endpoint) {
        this.memory.delete(key);
        removed++;
      }
    }
    const persisted = this.readPersisted();
    if (persisted) {
      let changed = false;
      for (const [key, entry] of Object.entries(persisted.entries)) {
        if (entry.endpoint === endpoint) {
          delete persisted.entries[key];
          removed++;
          changed = true;
        }
      }
      if (changed) this.writePersisted(persisted);
    }
    return removed;
  }

  /** Удаляет просроченные записи. */
  clearExpired(): number {
    const now = this.now();
    let removed = 0;
    for (const [key, entry] of this.memory) {
      if (entry.expiresAt <= now) {
        this.memory.delete(key);
        removed++;
      }
    }
    const persisted = this.readPersisted();
    if (persisted) {
      let changed = false;
      for (const [key, entry] of Object.entries(persisted.entries)) {
        if (entry.expiresAt <= now || entry.version !== CACHE_SCHEMA_VERSION) {
          delete persisted.entries[key];
          removed++;
          changed = true;
        }
      }
      if (changed) this.writePersisted(persisted);
    }
    return removed;
  }

  /** Полная очистка кэша (действие в настройках приложения). */
  clear(): void {
    this.memory.clear();
    try {
      this.storage?.removeItem(CACHE_STORAGE_KEY);
    } catch {
      /* хранилище недоступно */
    }
  }

  /** Сводка для UI/отладки. */
  stats(): { entries: number; persisted: boolean } {
    this.hydrate();
    const persisted = this.readPersisted();
    return {
      entries: persisted ? Object.keys(persisted.entries).length : this.memory.size,
      persisted: persisted !== null,
    };
  }

  // --- внутренние методы -------------------------------------------------

  private hydrate(): void {
    if (this.hydrated) return;
    this.hydrated = true;
    const persisted = this.readPersisted();
    if (!persisted) return;
    const now = this.now();
    for (const [key, entry] of Object.entries(persisted.entries)) {
      if (entry.version === CACHE_SCHEMA_VERSION && entry.expiresAt > now) {
        this.memory.set(key, entry);
      }
    }
  }

  private readPersisted(): PersistedState | null {
    this.hydrate();
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(CACHE_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PersistedState;
      if (!parsed || typeof parsed !== "object" || parsed.version !== CACHE_SCHEMA_VERSION) {
        this.storage.removeItem(CACHE_STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch {
      try {
        this.storage.removeItem(CACHE_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return null;
    }
  }

  private writePersisted(state: PersistedState): void {
    if (!this.storage) return;
    const serialize = () => JSON.stringify(state);
    let payload = serialize();
    // Ограничение объёма: сначала выкидываем просроченное, затем самые старые.
    if (payload.length > this.maxBytes) {
      this.prune(state);
      payload = serialize();
    }
    const write = (data: string) => this.storage!.setItem(CACHE_STORAGE_KEY, data);
    try {
      write(payload);
    } catch {
      // Переполнение quota: вычищаем половину самых старых записей и повторяем.
      const entries = Object.entries(state.entries).sort(
        (a, b) => a[1].cachedAt - b[1].cachedAt,
      );
      const drop = Math.max(1, Math.ceil(entries.length / 2));
      for (let i = 0; i < drop; i++) delete state.entries[entries[i][0]];
      try {
        write(JSON.stringify(state));
      } catch {
        /* сдаёмся: остаётся только кэш в памяти */
      }
    }
  }

  private prune(state: PersistedState): void {
    const now = this.now();
    for (const [key, entry] of Object.entries(state.entries)) {
      if (entry.expiresAt <= now || entry.version !== CACHE_SCHEMA_VERSION) {
        delete state.entries[key];
      }
    }
    const keys = Object.keys(state.entries);
    if (keys.length > this.maxEntries) {
      const sorted = keys
        .map((k) => [k, state.entries[k].cachedAt] as const)
        .sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < keys.length - this.maxEntries; i++) {
        delete state.entries[sorted[i][0]];
      }
    }
  }
}

function safeLocalStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    // Проверка на реальную доступность (приватный режим и т.п.)
    const probe = "__d2a_cache_probe__";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

/** Глобальный постоянный кэш приложения (используется синглтоном OpenDotaClient). */
export const globalCache = new CacheStore();
