import { useCallback, useEffect, useRef, useState } from "react";
import { mapMatchSummary } from "../../domain/mappers/matchMapper";
import type { MatchSummary } from "../../domain/models";
import { OpenDotaError, opendotaClient } from "../../services/opendota";

const PAGE_SIZE = 20;

export interface MatchHistoryState {
  matches: MatchSummary[];
  status: "idle" | "loading" | "loading_more" | "success" | "error";
  error: OpenDotaError | null;
  hasMore: boolean;
  /** Пустая история — отдельное состояние, не ошибка. */
  isEmpty: boolean;
}

/**
 * Постраничная загрузка истории Turbo-матчей.
 * Первая страница — 20 матчей, далее offset.
 */
export function useMatchHistory(accountId: number | null) {
  const [state, setState] = useState<MatchHistoryState>({
    matches: [],
    status: "idle",
    error: null,
    hasMore: false,
    isEmpty: false,
  });
  const offsetRef = useRef(0);
  const runIdRef = useRef(0);

  const load = useCallback(
    async (accountId: number, offset: number, append: boolean) => {
      const runId = ++runIdRef.current;
      setState((s) => ({
        ...s,
        status: append ? "loading_more" : "loading",
        error: null,
      }));
      try {
        const raw = await opendotaClient.getPlayerMatches(accountId, {
          gameMode: 23,
          limit: PAGE_SIZE,
          offset,
          significant: 0,
        });
        if (runId !== runIdRef.current) return;
        const mapped = raw.map(mapMatchSummary);
        offsetRef.current = offset + mapped.length;
        setState((s) => ({
          matches: append ? [...s.matches, ...mapped] : mapped,
          status: "success",
          error: null,
          hasMore: mapped.length === PAGE_SIZE,
          isEmpty: !append && mapped.length === 0,
        }));
      } catch (error) {
        if (runId !== runIdRef.current) return;
        setState((s) => ({
          ...s,
          status: "error",
          error:
            error instanceof OpenDotaError
              ? error
              : new OpenDotaError("unknown", "Неизвестная ошибка загрузки.", "retry"),
        }));
      }
    },
    [],
  );

  useEffect(() => {
    offsetRef.current = 0;
    // Сбрасываем runId: результат уже выполняющегося запроса старого профиля
    // будет проигнорирован — экран нового аккаунта не показывает чужие данные.
    runIdRef.current++;
    if (accountId === null) {
      setState({
        matches: [],
        status: "idle",
        error: null,
        hasMore: false,
        isEmpty: false,
      });
      return;
    }
    // Сразу очищаем список прежнего профиля, даже кратковременно не показывая
    // чужие матчи на экране нового аккаунта (spec/iteration-02.md, §9).
    setState({
      matches: [],
      status: "loading",
      error: null,
      hasMore: false,
      isEmpty: false,
    });
    void load(accountId, 0, false);
  }, [accountId, load]);

  const loadMore = useCallback(() => {
    if (accountId === null) return;
    void load(accountId, offsetRef.current, true);
  }, [accountId, load]);

  const retry = useCallback(() => {
    if (accountId === null) return;
    offsetRef.current = 0;
    void load(accountId, 0, false);
  }, [accountId, load]);

  return { ...state, loadMore, retry };
}
