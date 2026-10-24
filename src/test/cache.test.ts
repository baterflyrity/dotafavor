import { describe, expect, it } from "vitest";
import {
  CacheStore,
  buildCacheKey,
  CACHE_SCHEMA_VERSION,
} from "../services/opendota/cache";

/** Простое хранилище-заглушка для тестов постоянного уровня кэша. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    key: (i) => [...map.keys()][i] ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  } as Storage;
}

describe("buildCacheKey", () => {
  it("включает метод, endpoint, сегмент пользователя и параметры", () => {
    const key = buildCacheKey({
      endpoint: "players/5/matches",
      accountId: 5,
      query: { game_mode: 23, offset: 20 },
    });
    expect(key).toContain("GET");
    expect(key).toContain("players/5/matches");
    expect(key).toContain(":5:");
    expect(key).toContain("game_mode=23");
    expect(key).toContain("offset=20");
    expect(key).toContain(`v${CACHE_SCHEMA_VERSION}`);
  });

  it("разные параметры и разные пользователи дают разные ключи", () => {
    const a = buildCacheKey({ endpoint: "players/5/matches", accountId: 5, query: { offset: 0 } });
    const b = buildCacheKey({ endpoint: "players/5/matches", accountId: 5, query: { offset: 20 } });
    const c = buildCacheKey({ endpoint: "players/6/matches", accountId: 6, query: { offset: 0 } });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("порядок query-параметров не влияет на ключ", () => {
    const a = buildCacheKey({ endpoint: "x", query: { p: 1, q: 2 } });
    const b = buildCacheKey({ endpoint: "x", query: { q: 2, p: 1 } });
    expect(a).toBe(b);
  });
});

describe("CacheStore — TTL и выборки", () => {
  it("свежая запись возвращается, после TTL — нет", () => {
    let now = 1_000_000;
    const store = new CacheStore({ storage: null, now: () => now });
    store.set("k", { v: 1 }, 5_000, "matches/1");

    expect(store.get("k")?.value).toEqual({ v: 1 });
    now += 4_999;
    expect(store.get("k")).not.toBeNull();
    now += 2;
    expect(store.get("k")).toBeNull();
  });

  it("запись сохраняет cachedAt / expiresAt / version / endpoint", () => {
    const now = 100;
    const store = new CacheStore({ storage: null, now: () => now });
    store.set("k", 1, 1_000, "matches/42");
    const entry = store.get("k");
    expect(entry).toMatchObject({
      cachedAt: 100,
      expiresAt: 1_100,
      version: CACHE_SCHEMA_VERSION,
      endpoint: "matches/42",
    });
    expect(store.meta("k")).toMatchObject({ endpoint: "matches/42" });
  });

  it("устаревшие записи вычищаются clearExpired", () => {
    let now = 0;
    const store = new CacheStore({ storage: null, now: () => now });
    store.set("old", 1, 10, "matches/1");
    store.set("fresh", 2, 10_000, "matches/2");
    now = 100;
    expect(store.clearExpired()).toBe(1);
    expect(store.get("old")).toBeNull();
    expect(store.get("fresh")?.value).toBe(2);
  });
});

describe("CacheStore — персистентность (localStorage)", () => {
  it("запись переживает перезагрузку нового экземпляра до истечения TTL", () => {
    const storage = memoryStorage();
    const a = new CacheStore({ storage, now: () => 0 });
    a.set("k", { big: "data" }, 60_000, "matches/1");

    const b = new CacheStore({ storage, now: () => 59_000 });
    expect(b.get("k")?.value).toEqual({ big: "data" });

    const c = new CacheStore({ storage, now: () => 61_000 });
    expect(c.get("k")).toBeNull();
  });

  it("несовместимая версия схемы отбрасывается", () => {
    const storage = memoryStorage();
    storage.setItem(
      "dota2analytics:cache",
      JSON.stringify({
        version: CACHE_SCHEMA_VERSION + 1,
        entries: { k: { value: 1, cachedAt: 0, expiresAt: 1e15, version: CACHE_SCHEMA_VERSION + 1, endpoint: "x" } },
      }),
    );
    const store = new CacheStore({ storage, now: () => 0 });
    expect(store.get("k")).toBeNull();
  });

  it("повреждённый JSON не роняет кэш", () => {
    const storage = memoryStorage();
    storage.setItem("dota2analytics:cache", "{broken");
    const store = new CacheStore({ storage, now: () => 0 });
    expect(store.get("k")).toBeNull();
    store.set("ok", 1, 1_000, "x");
    expect(store.get("ok")?.value).toBe(1);
  });

  it("лимит числа записей: самые старые удаляются", () => {
    let now = 0;
    const store = new CacheStore({ storage: null, now: () => now, maxEntries: 2 });
    store.set("a", 1, 60_000, "x");
    now = 10;
    store.set("b", 2, 60_000, "x");
    now = 20;
    store.set("c", 3, 60_000, "x");
    expect(store.get("a")).toBeNull();
    expect(store.get("b")).not.toBeNull();
    expect(store.get("c")).not.toBeNull();
  });
});

describe("CacheStore — точечная инвалидация", () => {
  it("invalidateEndpoint удаляет только записи указанного endpoint", () => {
    const store = new CacheStore({ storage: null, now: () => 0 });
    store.set("m1", 1, 60_000, "matches/1");
    store.set("m1b", 11, 60_000, "matches/1");
    store.set("m2", 2, 60_000, "matches/2");
    store.set("heroes", 3, 60_000, "constants/heroes");
    store.set("history", 4, 60_000, "players/5/matches");

    const removed = store.invalidateEndpoint("matches/1");
    expect(removed).toBe(2);
    expect(store.get("m1")).toBeNull();
    expect(store.get("m1b")).toBeNull();
    expect(store.get("m2")?.value).toBe(2);
    expect(store.get("heroes")?.value).toBe(3);
    expect(store.get("history")?.value).toBe(4);
  });

  it("invalidateKey удаляет одну запись и в памяти, и в хранилище", () => {
    const storage = memoryStorage();
    const store = new CacheStore({ storage, now: () => 0 });
    store.set("a", 1, 60_000, "x");
    store.set("b", 2, 60_000, "y");
    expect(store.invalidateKey("a")).toBe(true);
    expect(store.get("a")).toBeNull();
    expect(new CacheStore({ storage, now: () => 0 }).get("a")).toBeNull();
    expect(store.get("b")?.value).toBe(2);
  });

  it("clear удаляет всё, включая постоянный уровень", () => {
    const storage = memoryStorage();
    const store = new CacheStore({ storage, now: () => 0 });
    store.set("a", 1, 60_000, "x");
    store.clear();
    expect(store.get("a")).toBeNull();
    expect(storage.getItem("dota2analytics:cache")).toBeNull();
  });

  it("latestMeta возвращает самую свежую запись по префиксу endpoint", () => {
    let now = 0;
    const store = new CacheStore({ storage: null, now: () => now });
    store.set("h0", 1, 60_000, "players/5/matches");
    now = 1_000;
    store.set("h20", 2, 60_000, "players/5/matches");
    now = 2_000;
    store.set("m", 3, 60_000, "matches/9");
    const meta = store.latestMeta("players/5/matches");
    expect(meta?.cachedAt).toBe(1_000);
    expect(store.latestMeta("players/6")).toBeNull();
  });
});
