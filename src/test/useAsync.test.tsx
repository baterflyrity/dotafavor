import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAsync } from "../hooks/useAsync";

afterEach(cleanup);

/** deferred-промис, чтобы тест управлял порядком завершения запросов. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useAsync — устаревшие запросы", () => {
  it("при смене key результат старого запроса игнорируется", async () => {
    const d1 = deferred<string>();
    const d2 = deferred<string>();

    function Probe({ id }: { id: number }) {
      const state = useAsync(
        () => (id === 1 ? d1.promise : d2.promise),
        [id],
      );
      return (
        <div>
          <span data-testid="status">{state.status}</span>
          <span data-testid="data">{state.data ?? "—"}</span>
        </div>
      );
    }

    const { rerender } = render(<Probe id={1} />);
    // Переключились на второй запрос, не дожидаясь первого.
    rerender(<Probe id={2} />);

    // Сначала отвечает новый запрос…
    await act(async () => {
      d2.resolve("second");
      await d2.promise;
    });
    // …потом медленный устаревший — его результат должен быть отброшен.
    await act(async () => {
      d1.resolve("first");
      await d1.promise;
    });

    await waitFor(() =>
      expect(screen.getByTestId("data")).toHaveTextContent("second"),
    );
    expect(screen.getByTestId("data")).not.toHaveTextContent("first");
    expect(screen.getByTestId("status")).toHaveTextContent("success");
  });

  it("данные предыдущего key не показываются даже кратковременно", async () => {
    const d1 = deferred<string>();

    function Probe({ id }: { id: number }) {
      const state = useAsync(
        () => (id === 1 ? d1.promise : Promise.resolve("loaded-2")),
        [id],
      );
      return <span data-testid="data">{state.data ?? "—"}</span>;
    }

    const { rerender } = render(<Probe id={1} />);
    await act(async () => {
      d1.resolve("loaded-1");
      await d1.promise;
    });
    expect(screen.getByTestId("data")).toHaveTextContent("loaded-1");

    rerender(<Probe id={2} />);
    // Сразу после смены ключа прежние данные очищены.
    expect(screen.getByTestId("data")).toHaveTextContent("—");
    await waitFor(() =>
      expect(screen.getByTestId("data")).toHaveTextContent("loaded-2"),
    );
  });
});

describe("useAsync — обновление и блокировка дублей", () => {
  it("повторный run(force) сохраняет уже показанные данные во время загрузки", async () => {
    const d2 = deferred<string>();
    let calls = 0;

    function Probe() {
      const state = useAsync(() => {
        calls++;
        return calls === 1 ? Promise.resolve("v1") : d2.promise;
      }, []);
      return (
        <div>
          <span data-testid="status">{state.status}</span>
          <span data-testid="data">{state.data ?? "—"}</span>
          <button type="button" onClick={() => void state.run(true)}>
            refresh
          </button>
        </div>
      );
    }

    render(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId("data")).toHaveTextContent("v1"),
    );

    await userEvent.click(screen.getByRole("button", { name: "refresh" }));
    // Данные не пропали, идёт обновление.
    expect(screen.getByTestId("data")).toHaveTextContent("v1");
    expect(screen.getByTestId("status")).toHaveTextContent("loading");

    await act(async () => {
      d2.resolve("v2");
      await d2.promise;
    });
    await waitFor(() =>
      expect(screen.getByTestId("data")).toHaveTextContent("v2"),
    );
  });

  it("ошибка обновления не убирает прежние данные и не оставляет вечный спиннер", async () => {
    const d2 = deferred<string>();
    let calls = 0;

    function Probe() {
      const state = useAsync(() => {
        calls++;
        return calls === 1 ? Promise.resolve("v1") : d2.promise;
      }, []);
      return (
        <div>
          <span data-testid="status">{state.status}</span>
          <span data-testid="data">{state.data ?? "—"}</span>
          <button type="button" onClick={() => void state.run(true)}>
            refresh
          </button>
        </div>
      );
    }

    render(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId("data")).toHaveTextContent("v1"),
    );

    await userEvent.click(screen.getByRole("button", { name: "refresh" }));
    await act(async () => {
      d2.reject(new Error("network down"));
      try {
        await d2.promise;
      } catch {
        /* ожидаемо */
      }
    });

    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("error"),
    );
    expect(screen.getByTestId("data")).toHaveTextContent("v1");
  });

  it("автозапуск происходит один раз на ключ, а не на каждый рендер", async () => {
    let calls = 0;

    function Probe() {
      const state = useAsync(async () => {
        calls++;
        return "x";
      }, ["fixed"]);
      return <span data-testid="status">{state.status}</span>;
    }

    const { rerender } = render(<Probe />);
    rerender(<Probe />);
    rerender(<Probe />);
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("success"),
    );
    expect(calls).toBe(1);
  });
});
