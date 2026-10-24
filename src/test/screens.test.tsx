import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LandingPage } from "../pages/LandingPage";
import { MatchList } from "../features/match-history/MatchList";
import { FeedbackBlock } from "../features/feedback/FeedbackBlock";
import { ErrorState, EmptyState } from "../components/StateViews";
import { OpenDotaError } from "../services/opendota/client";
import type { MatchSummary } from "../domain/models";

beforeEach(() => {
  cleanup();
  localStorage.clear();
});

describe("Стартовый экран", () => {
  it("содержит кнопку «Войти через Steam» и описание возможностей", () => {
    render(<LandingPage />);
    expect(
      screen.getByRole("button", { name: /войти через steam/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Dota 2 Analytics",
    );
    expect(screen.getByText(/Качество матча/)).toBeInTheDocument();
  });

  it("предупреждает об отсутствии серверной проверки Steam", () => {
    render(<LandingPage />);
    expect(
      screen.getByText(/Серверная проверка Steam OpenID не выполняется/i),
    ).toBeInTheDocument();
  });
});

const summary: MatchSummary = {
  matchId: 111,
  startTime: 1726000000,
  duration: 1500,
  heroId: 9,
  result: "win",
  side: "radiant",
  kills: 10,
  deaths: 2,
  assists: 12,
  gpm: 600,
  xpm: 620,
  incomplete: false,
};

describe("Состояния списка матчей", () => {
  it("показывает пустую историю", () => {
    render(
      <MatchList
        matches={[]}
        status="success"
        error={null}
        hasMore={false}
        isEmpty
        heroes={{}}
        onSelect={vi.fn()}
        onLoadMore={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText(/Turbo-матчей не найдено/)).toBeInTheDocument();
  });

  it("показывает ошибку загрузки с кнопкой повтора", () => {
    const error = new OpenDotaError("rate_limit", "Превышен лимит запросов OpenDota.", "retry");
    render(
      <MatchList
        matches={[]}
        status="error"
        error={error}
        hasMore={false}
        isEmpty={false}
        heroes={{}}
        onSelect={vi.fn()}
        onLoadMore={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Превышен лимит");
    expect(
      screen.getByRole("button", { name: "Повторить запрос" }),
    ).toBeInTheDocument();
  });

  it("показывает скелетон во время загрузки", () => {
    render(
      <MatchList
        matches={[]}
        status="loading"
        error={null}
        hasMore={false}
        isEmpty={false}
        heroes={{}}
        onSelect={vi.fn()}
        onLoadMore={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("рендерит карточки матчей с оценками и приглашает к загрузке следующей страницы", async () => {
    const onSelect = vi.fn();
    render(
      <MatchList
        matches={[summary]}
        status="success"
        error={null}
        hasMore
        isEmpty={false}
        heroes={{ "9": { localized_name: "Лина" } }}
        onSelect={onSelect}
        onLoadMore={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getAllByText("Лина").length).toBeGreaterThan(0);
    expect(screen.getByText("Победа")).toBeInTheDocument();
    expect(screen.getByText("Качество матча")).toBeInTheDocument();
    expect(screen.getByText("Моя игра")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Матч 111/ }));
    expect(onSelect).toHaveBeenCalledWith(111);
  });

  it("фильтр «только поражения» скрывает победы", async () => {
    render(
      <MatchList
        matches={[summary]}
        status="success"
        error={null}
        hasMore={false}
        isEmpty={false}
        heroes={{}}
        onSelect={vi.fn()}
        onLoadMore={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText("Результат"), "loss");
    expect(screen.getByText(/ничего не подошло/i)).toBeInTheDocument();
  });
});

describe("Состояние ошибки (общий компонент)", () => {
  it("показывает сообщение о приватности с подсказкой", () => {
    render(
      <ErrorState
        message="Данные игрока скрыты настройками приватности Dota 2."
        action="check_privacy"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("приватности");
    expect(screen.getByText(/настройки публичности/i)).toBeInTheDocument();
  });

  it("пустое состояние отображается с описанием", () => {
    render(<EmptyState title="Нет данных" description="Описание" />);
    expect(screen.getByText("Нет данных")).toBeInTheDocument();
    expect(screen.getByText("Описание")).toBeInTheDocument();
  });
});

describe("Субъективная оценка матча", () => {
  it("сохраняет ответы только в localStorage", async () => {
    render(<FeedbackBlock matchId={4242} />);
    const button = screen.getByRole("button", { name: "Насколько понравился матч?: 4 из 5" });
    await userEvent.click(button);

    expect(button).toHaveAttribute("aria-pressed", "true");
    const stored = JSON.parse(localStorage.getItem("dota2analytics:feedback") ?? "{}");
    expect(stored["4242"].liked).toBe(4);
    // Другие ключи не используются
    expect(localStorage.getItem("dota2analytics:profile")).toBeNull();
  });

  it("восстанавливает сохранённые ответы при повторном открытии", async () => {
    localStorage.setItem(
      "dota2analytics:feedback",
      JSON.stringify({ 4242: { balanced: 2 } }),
    );
    render(<FeedbackBlock matchId={4242} />);
    expect(
      screen.getByRole("button", { name: "Ощущалась ли равная борьба?: 2 из 5" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
