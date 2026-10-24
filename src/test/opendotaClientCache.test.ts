import { describe, expect, it, vi } from "vitest";
import { OpenDotaClient } from "../services/opendota/client";
import { CacheStore } from "../services/opendota/cache";
import { TTL_MS } from "../services/opendota/ttl";
import turboFull from "./fixtures/turbo-match-full.json";
import turboPartial from "./fixtures/turbo-match-partial.json";
import historyRows from "./fixtures/history-turbo.json";

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headers?.[name] ?? null,
    },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/**
 * Клиент с подменёнными fetch/now/sleep/random: реальные таймеры не используются,
 * cache store — изолированный в памяти (или переданный тестом).
 */
function makeClient(options: {
  fetchImpl: typeof fetch;
  cache?: CacheStore;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
  random?: () => number;
}) {
  const sleeps: number[] = [];
  let nowValue = 0;
  const now = options.now ?? (() => nowValue);
  return {
    client: new OpenDotaClient({
      fetchImpl: options.fetchImpl,
      cache: options.cache ?? new CacheStore({ storage: null, now }),
      now,
      sleep:
        options.sleep ??
        (async (ms: number) => {
          sleeps.push(ms);
          // Сон продвигает время — как в реальном выполнении,
          // иначе пауза лимитера дублировала бы backoff клиента.
          nowValue += ms;
        }),
      maxRetries: options.maxRetries ?? 2,
      retryDelayMs: 100,
      random: options.random ?? (() => 0),
      limiter: { minIntervalMs: 0 },
    }),
    sleeps,
    advance: (ms: number) => (nowValue += ms),
    getNow: () => nowValue,
  };
}

describe("OpenDotaClient — кэш и TTL", () => {
  it("свежий ответ берётся из кэша без повторного запроса", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(historyRows)) as unknown as typeof fetch;
    const cache = new CacheStore({ storage: null, now: () => 0 });
    const { client } = makeClient({ fetchImpl, cache });

    await client.getPlayerMatches(1);
    await client.getPlayerMatches(1);
    await client.getPlayerMatches(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("после истечения TTL данные запрашиваются заново", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(historyRows)) as unknown as typeof fetch;
    let now = 0;
    const cache = new CacheStore({ storage: null, now: () => now });
    const { client, advance } = makeClient({ fetchImpl, cache, now: () => now });
    void advance;

    await client.getPlayerMatches(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    now += TTL_MS.history + 1;
    await client.getPlayerMatches(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("разные страницы истории не конфликтуют в кэше", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse([]));
    const fetchImpl = fetchMock as unknown as typeof fetch;
    const { client } = makeClient({ fetchImpl });
    await client.getPlayerMatches(1, { offset: 0 });
    await client.getPlayerMatches(1, { offset: 20 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toContain("offset=0");
    expect(urls[1]).toContain("offset=20");
  });

  it("ошибка (429/5xx/сеть) не кэшируется как успешные данные", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValue(jsonResponse(historyRows)) as unknown as typeof fetch;
    const { client } = makeClient({ fetchImpl });

    await expect(client.getPlayerMatches(1)).rejects.toMatchObject({ kind: "server" });
    // Ошибки не записаны: следующий успешный запрос проходит в сеть и кэшируется.
    const rows = await client.getPlayerMatches(1);
    expect(rows).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(4); // 3 падения (maxRetries=2) + 1 успех
    await client.getPlayerMatches(1);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});

describe("OpenDotaClient — дедупликация in-flight запросов", () => {
  it("одновременные одинаковые запросы выполняют один HTTP-вызов", async () => {
    let release!: (r: Response) => void;
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    ) as unknown as typeof fetch;
    const { client } = makeClient({ fetchImpl });

    const p1 = client.getPlayerMatches(1);
    const p2 = client.getPlayerMatches(1);
    const p3 = client.getPlayerMatches(1);
    // Даём лимитеру дойти до fetch до освобождения промиса ответа.
    await new Promise((r) => setTimeout(r, 0));
    release(jsonResponse(historyRows));

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).toHaveLength(2);
    expect(r2).toEqual(r1);
    expect(r3).toEqual(r1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("OpenDotaClient — принудительное обновление матча", () => {
  it("force инвалидирует только этот матч, справочники и история остаются", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("constants/heroes")) return jsonResponse({ "1": { id: 1, name: "npc_dota_hero_antimage" } });
      if (url.includes("/matches/")) return jsonResponse(turboFull);
      return jsonResponse(historyRows);
    });
    const fetchImpl = fetchMock as unknown as typeof fetch;
    const cache = new CacheStore({ storage: null, now: () => 0 });
    const { client } = makeClient({ fetchImpl, cache });

    // Прогреваем кэш: матч, справочник, история.
    await client.getHeroes();
    await client.getMatch(111);
    await client.getPlayerMatches(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Повторные обращения идут в кэш.
    await client.getHeroes();
    await client.getMatch(111);
    await client.getPlayerMatches(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Принудительное обновление: только матч уходит в сеть.
    await client.getMatch(111, { force: true });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const forcedUrl = String(fetchMock.mock.calls[3][0]);
    expect(forcedUrl).toContain("/matches/111");

    // Справочники и история по-прежнему в кэше.
    await client.getHeroes();
    await client.getPlayerMatches(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    // Матч снова кэшируется после успешного ответа.
    await client.getMatch(111);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("после force-обновления неполного матча TTL короткий (5 минут)", async () => {
    let now = 0;
    const fetchImpl = vi.fn(async () => jsonResponse(turboPartial)) as unknown as typeof fetch;
    const cache = new CacheStore({ storage: null, now: () => now });
    const { client } = makeClient({ fetchImpl, cache, now: () => now });

    await client.getMatch(222);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    now += TTL_MS.matchIncomplete + 1;
    await client.getMatch(222);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("полностью обработанный матч кэшируется на 7 дней", async () => {
    let now = 0;
    const fetchImpl = vi.fn(async () => jsonResponse(turboFull)) as unknown as typeof fetch;
    const cache = new CacheStore({ storage: null, now: () => now });
    const { client } = makeClient({ fetchImpl, cache, now: () => now });

    await client.getMatch(333);
    now += TTL_MS.matchComplete - 1000;
    await client.getMatch(333);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now += 2000;
    await client.getMatch(333);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("OpenDotaClient — 429, Retry-After и ограниченные повторы", () => {
  it("429 учитывает Retry-After (в секундах) как задержку до следующей попытки", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429, { "Retry-After": "3" }))
      .mockResolvedValue(jsonResponse(historyRows)) as unknown as typeof fetch;
    const { client, sleeps } = makeClient({ fetchImpl });

    await expect(client.getPlayerMatches(1)).resolves.toHaveLength(2);
    expect(sleeps).toContain(3000);
  });

  it("429 с HTTP-датой в Retry-After — задержка до наступления даты", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({}, 429, { "Retry-After": new Date(Date.now() + 5000).toUTCString() }),
      )
      .mockResolvedValue(jsonResponse(historyRows)) as unknown as typeof fetch;
    // Клиент сравнивает Retry-After-дату со своим now → нужен реальный clock.
    const { client, sleeps } = makeClient({ fetchImpl, now: () => Date.now() });

    await client.getPlayerMatches(1);
    const maxSleep = Math.max(...sleeps);
    // Дата в будущем; допускается погрешность парсинга до секунды.
    expect(maxSleep).toBeGreaterThan(0);
    expect(maxSleep).toBeLessThanOrEqual(5000);
  });

  it("без Retry-After используется экспоненциальный backoff", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, 429)) as unknown as typeof fetch;
    const { client, sleeps } = makeClient({ fetchImpl, maxRetries: 2 });

    await expect(client.getPlayerMatches(1)).rejects.toMatchObject({ kind: "rate_limit" });
    // Повторы ограничены: первая попытка + maxRetries.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    // Backoff растёт экспоненциально (base 100, jitter=0): 100, 200.
    expect(sleeps).toEqual([100, 200]);
  });

  it("5xx повторяется не более двух раз и падает как server", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 503)) as unknown as typeof fetch;
    const { client } = makeClient({ fetchImpl, maxRetries: 2 });
    await expect(client.getPlayerMatches(1)).rejects.toMatchObject({ kind: "server" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("4xx (кроме 429) не повторяются автоматически", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 404)) as unknown as typeof fetch;
    const { client } = makeClient({ fetchImpl, maxRetries: 2 });
    await expect(client.getMatch(1)).rejects.toMatchObject({ kind: "not_found" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("лимитер ставит общую очередь на паузу после 429 (следующий запрос не в тесном цикле)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429, { "Retry-After": "2" }))
      .mockResolvedValue(jsonResponse(historyRows)) as unknown as typeof fetch;
    const { client, sleeps } = makeClient({ fetchImpl });

    await client.getPlayerMatches(1);
    // Пауза по Retry-After была применена как минимум один раз (клиент + очередь).
    expect(sleeps.some((s) => s >= 2000)).toBe(true);
  });
});
