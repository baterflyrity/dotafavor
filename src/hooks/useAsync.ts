import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncStatus = "idle" | "loading" | "success" | "error";

export interface AsyncState<T> {
  status: AsyncStatus;
  data: T | null;
  error: unknown;
}

/**
 * Запускает асинхронную задачу с состоянием загрузки/ошибки.
 *
 * Поведение (spec/iteration-02.md, §3):
 * - отменяет (игнорирует) устаревшие результаты при смене key;
 * - при смене key прежние данные очищаются сразу — экран другого игрока/матча
 *   не показывает данные предыдущего даже кратковременно;
 * - при повторном вызове run() с тем же key (refresh) уже показанные данные
 *   сохраняются, включая состояние ошибки обновления;
 * - fn получает флаг force — для принудительного обновления в обход кэша.
 */
export function useAsync<T>(
  fn: (force?: boolean) => Promise<T>,
  deps: readonly unknown[],
  auto = true,
) {
  const [state, setState] = useState<AsyncState<T>>({
    status: auto ? "loading" : "idle",
    data: null,
    error: null,
  });
  const runIdRef = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  /** Ключ (deps), которому принадлежат текущие data. */
  const dataKeyRef = useRef<string | null>(auto ? null : null);
  const currentKeyRef = useRef<string>(JSON.stringify(deps));

  const run = useCallback(async (force = false) => {
    const runId = ++runIdRef.current;
    setState((s) => ({ ...s, status: "loading", error: null }));
    try {
      const data = await fnRef.current(force);
      if (runId === runIdRef.current) {
        dataKeyRef.current = currentKeyRef.current;
        setState({ status: "success", data, error: null });
      }
    } catch (error) {
      if (runId === runIdRef.current) {
        // Прежние данные сохраняются: при ошибке обновления старые данные остаются видимыми.
        setState((s) => ({ ...s, status: "error", error }));
      }
    }
  }, []);

  useEffect(() => {
    const key = JSON.stringify(deps);
    currentKeyRef.current = key;
    if (dataKeyRef.current !== key) {
      // Новый ключ: не показываем данные предыдущего объекта.
      dataKeyRef.current = null;
      setState((s) =>
        s.data === null && s.status === (auto ? "loading" : "idle")
          ? s
          : { status: auto ? "loading" : "idle", data: null, error: null },
      );
    }
    if (auto) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, run };
}
