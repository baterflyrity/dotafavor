import { useEffect } from "react";
import { BarChart3, LogOut, UserCog } from "lucide-react";
import { useRoute, navigate } from "./app/router";
import { useSteamSession } from "./app/useSteamSession";
import { Button } from "./components/ui/Button";
import { Badge } from "./components/ui/Badge";
import { LandingPage } from "./pages/LandingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { MatchPage } from "./pages/MatchPage";
import { AboutPage } from "./pages/AboutPage";
import { SteamLoginButton } from "./features/steam-login/SteamLoginButton";
import { cn } from "./lib/cn";

export default function App() {
  const route = useRoute();
  const session = useSteamSession();
  const { profile } = session;

  // Без профиля доступен только стартовый экран и раздел методики.
  useEffect(() => {
    if (!profile && route.name !== "landing" && route.name !== "about") {
      navigate("/");
    }
  }, [profile, route]);

  const navLink = (href: string, label: string, active: boolean) => (
    <a
      href={href}
      className={cn(
        "flex items-center gap-1 rounded-md px-3 py-1.5 text-sm transition-colors",
        active
          ? "bg-surface-2 text-foreground"
          : "text-muted hover:bg-surface-2/60 hover:text-foreground",
      )}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </a>
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <a href={profile ? "#/matches" : "#/"} className="flex items-center gap-2 font-bold">
            <BarChart3 className="h-5 w-5 text-primary" aria-hidden />
            Dota 2 Analytics
          </a>

          <nav className="flex items-center gap-1" aria-label="Основная навигация">
            {navLink(
              profile ? "#/matches" : "#/",
              "История",
              route.name === "dashboard",
            )}
            {navLink("#/about", "Методика", route.name === "about")}
          </nav>

          <div className="flex items-center gap-2">
            {profile ? (
              <>
                <span className="hidden max-w-[160px] truncate text-sm text-muted sm:inline">
                  {profile.personaName ?? `#${profile.accountId}`}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={session.switchAccount}
                  title="Переключить аккаунт"
                >
                  <UserCog className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">Сменить</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={session.logout}
                  title="Выйти из профиля"
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                  <span className="hidden sm:inline">Выйти</span>
                </Button>
              </>
            ) : (
              <SteamLoginButton size="md" />
            )}
          </div>
        </div>

        {session.notice && (
          <div
            role="status"
            className={cn(
              "border-t px-4 py-2 text-center text-sm",
              session.noticeTone === "danger"
                ? "border-danger/40 bg-danger/10 text-danger"
                : session.noticeTone === "warning"
                  ? "border-warning/40 bg-warning/10 text-warning"
                  : "border-success/40 bg-success/10 text-success",
            )}
          >
            {session.notice}{" "}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={session.dismissNotice}
            >
              скрыть
            </button>
          </div>
        )}
      </header>

      {route.name === "landing" && <LandingPage />}
      {route.name === "dashboard" && (
        <DashboardPage profile={profile} onSelectMatch={(id) => navigate(`/match/${id}`)} />
      )}
      {route.name === "match" && (
        <MatchPage
          matchId={route.matchId}
          profile={profile}
          onBack={() => navigate("/matches")}
        />
      )}
      {route.name === "about" && <AboutPage onBack={() => navigate(profile ? "/matches" : "/")} />}
      {route.name === "not_found" && (
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-2xl font-bold">Страница не найдена</h1>
          <p className="mt-2 text-sm text-muted">
            Проверьте адрес или вернитесь к матчам.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="secondary" onClick={() => navigate(profile ? "/matches" : "/")}>
              На главную
            </Button>
            <Badge tone="neutral">404</Badge>
          </div>
        </main>
      )}

      <footer className="border-t border-border py-6 text-center text-xs text-muted">
        Данные предоставлены OpenDota API. Оценки — экспериментальная модель V1 и
        не являются объективной истиной.
      </footer>
    </div>
  );
}
