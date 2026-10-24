/**
 * Централизованный ограничитель частоты запросов (spec/iteration-02.md, §5).
 *
 * Все GET-запросы к OpenDota проходят через один экземпляр:
 * - не чаще одного нового запроса каждые minIntervalMs (по умолчанию 1.3 с);
 * - параллелизм ограничен maxConcurrent (по умолчанию 2);
 * - при HTTP 429 очередь ставится на паузу (Retry-After / backoff),
 *   чтобы не продолжать в тесном цикле;
 * - очередь общая: она применяется и к экранам, и к фоновым эффектам, и к кнопкам.
 *
 * Ожидание выполняется событийно (через sleep/события завершения задач),
 * а не опросом — тесты подменяют now/sleep и работают детерминированно.
 */

export interface RateLimiterOptions {
  /** Минимальный интервал между стартами запросов, мс. */
  minIntervalMs?: number;
  /** Максимум одновременно выполняющихся запросов. */
  maxConcurrent?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export class RateLimiter {
  readonly minIntervalMs: number;
  readonly maxConcurrent: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  /** Когда можно стартовать следующий запрос (пауза после 429). */
  private pausedUntil = 0;
  private lastStartAt = -Infinity;
  private running = 0;
  /** Цепочка «право на следующий старт» — гарантирует FIFO-порядок. */
  private chain: Promise<void> = Promise.resolve();
  private releaseWaiters: Array<() => void> = [];
  private depth = 0;

  constructor(options: RateLimiterOptions = {}) {
    this.minIntervalMs = options.minIntervalMs ?? 1300;
    this.maxConcurrent = options.maxConcurrent ?? 2;
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? (() => Date.now());
  }

  /** Сколько задач ждут старта — для отладки/тестов. */
  get queueDepth(): number {
    return this.depth;
  }

  get runningCount(): number {
    return this.running;
  }

  /** Ставит старт очереди на паузу (например, после 429 с Retry-After). */
  pauseUntil(epochMs: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, epochMs);
  }

  /** Выполняет задачу, дождавшись своего слота в общей очереди. */
  async run<T>(task: () => Promise<T>): Promise<T> {
    this.depth++;
    let releaseChain!: () => void;
    const previous = this.chain;
    this.chain = new Promise<void>((resolve) => {
      releaseChain = resolve;
    });

    try {
      await previous;

      // Интервал между стартами + пауза после 429.
      const earliest = Math.max(
        this.lastStartAt + this.minIntervalMs,
        this.pausedUntil,
      );
      const wait = earliest - this.now();
      if (wait > 0 && Number.isFinite(wait)) {
        await this.sleep(wait);
      }

      // Ограничение параллелизма — событийное ожидание освобождения слота.
      while (this.running >= this.maxConcurrent) {
        await new Promise<void>((resolve) => this.releaseWaiters.push(resolve));
      }

      this.running++;
      this.lastStartAt = this.now();
    } finally {
      // Отпускаем следующую задачу в очереди сразу после захвата слота:
      // её интервал считается от нашего фактического старта.
      this.depth--;
      releaseChain();
    }

    try {
      return await task();
    } finally {
      this.running--;
      const waiter = this.releaseWaiters.shift();
      if (waiter) waiter();
    }
  }
}
