import { describe, expect, it } from "vitest";
import { RateLimiter } from "../services/opendota/rateLimiter";

/**
 * Тесты подменяют now/sleep: реальные задержки в секундах не используются.
 * sleep только фиксирует запрошенные паузы и продвигает «время».
 */
function makeLimiter(opts: {
  minIntervalMs?: number;
  maxConcurrent?: number;
}) {
  let now = 0;
  const sleeps: number[] = [];
  const limiter = new RateLimiter({
    minIntervalMs: opts.minIntervalMs ?? 1000,
    maxConcurrent: opts.maxConcurrent ?? 2,
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
  });
  return { limiter, sleeps, advance: (ms: number) => (now += ms) };
}

describe("RateLimiter — ограничение частоты", () => {
  it("первый запрос стартует сразу, второй ждёт minInterval", async () => {
    const { limiter, sleeps } = makeLimiter({ minIntervalMs: 1000 });
    await limiter.run(async () => {});
    await limiter.run(async () => {});
    expect(sleeps).toEqual([1000]);
  });

  it("пауза между стартами не меньше minInterval с учётом прошедшего времени", async () => {
    const { limiter, sleeps, advance } = makeLimiter({ minIntervalMs: 1200 });
    await limiter.run(async () => {});
    advance(500); // часть интервала уже прошла
    await limiter.run(async () => {});
    expect(sleeps).toEqual([700]);
  });

  it("параллелизм ограничен maxConcurrent", async () => {
    const { limiter } = makeLimiter({ minIntervalMs: 0, maxConcurrent: 2 });
    let running = 0;
    let peak = 0;
    const task = async () => {
      running++;
      peak = Math.max(peak, running);
      await Promise.resolve();
      running--;
    };
    await Promise.all([limiter.run(task), limiter.run(task), limiter.run(task), limiter.run(task)]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("pauseUntil ставит старт следующего запроса на паузу (после 429)", async () => {
    const { limiter, sleeps, advance } = makeLimiter({ minIntervalMs: 1000 });
    await limiter.run(async () => {});
    advance(10_000); // интервал уже прошёл
    limiter.pauseUntil(50_000); // сервер просил подождать до t=50000
    await limiter.run(async () => {});
    // Пауза = pausedUntil(50000) - now(10000+) ≈ 40000, без неё старт был бы сразу.
    expect(sleeps[sleeps.length - 1]).toBeGreaterThan(30_000);
  });

  it("очередь сохраняет порядок и не теряет задачи", async () => {
    const { limiter } = makeLimiter({ minIntervalMs: 0, maxConcurrent: 1 });
    const order: number[] = [];
    await Promise.all(
      [0, 1, 2, 3].map((i) =>
        limiter.run(async () => {
          order.push(i);
        }),
      ),
    );
    expect(order).toEqual([0, 1, 2, 3]);
  });

  it("ошибка задачи не ломает очередь", async () => {
    const { limiter } = makeLimiter({ minIntervalMs: 0, maxConcurrent: 1 });
    await expect(
      limiter.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await expect(limiter.run(async () => 7)).resolves.toBe(7);
  });
});
