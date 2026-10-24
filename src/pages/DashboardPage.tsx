import { EmptyState, ErrorState, MatchListSkeleton } from "../components/StateViews";
import { MatchList } from "../features/match-history/MatchList";
import { useMatchHistory } from "../features/match-history/useMatchHistory";
import { useAsync } from "../hooks/useAsync";
import { opendotaClient } from "../services/opendota";
import type { StoredProfile } from "../lib/storage";
import { Card } from "../components/ui/Card";
import { PlayerAvatar } from "../components/media/EntityIcons";
import { ExternalLinkIcon } from "../components/media/ExternalLinkIcon";
import { steam32ToSteamId64 } from "../features/steam-login/steamId";
import {
  dotabuffPlayerUrl,
  openDotaPlayerUrl,
  steamProfileUrl,
} from "../lib/externalLinks";

/** Личный кабинет: профиль, история Turbo, фильтры и пагинация. */
export function DashboardPage({
  profile,
  onSelectMatch,
}: {
  profile: StoredProfile | null;
  onSelectMatch: (matchId: number) => void;
}) {
  const history = useMatchHistory(profile?.accountId ?? null);
  const heroes = useAsync(() => opendotaClient.getHeroes(), []);

  // Время обновления истории из кэша — без сетевого запроса.
  const historyMeta = profile
    ? opendotaClient.cacheMeta(`players/${profile.accountId}/matches`)
    : null;
  const historyUpdated = historyMeta
    ? new Date(historyMeta.cachedAt).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const steam64 = profile ? steam32ToSteamId64(profile.accountId) : null;

  if (!profile) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <EmptyState
          title="Профиль не выбран"
          description="Войдите через Steam, чтобы загрузить историю матчей."
        />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 animate-in">
      <Card className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <PlayerAvatar
            src={profile.avatar}
            name={profile.personaName}
            className="h-10 w-10 rounded-md border border-border"
          />
          <div>
            <p className="font-semibold leading-tight">
              {profile.personaName ?? "Игрок Steam"}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              <ExternalLinkIcon
                href={dotabuffPlayerUrl(profile.accountId)}
                label="Профиль на Dotabuff (откроется в новой вкладке)"
              />
              <ExternalLinkIcon
                href={openDotaPlayerUrl(profile.accountId)}
                label="Профиль на OpenDota (откроется в новой вкладке)"
              />
              <ExternalLinkIcon
                href={steamProfileUrl(profile.steamId64 ?? steam64)}
                label="Профиль в Steam (откроется в новой вкладке)"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-sm text-muted">
          <span>История: Turbo</span>
          {historyUpdated && (
            <span className="text-xs">Обновлено: {historyUpdated}</span>
          )}
        </div>
      </Card>

      {heroes.status === "error" ? (
        <p className="mb-3 text-xs text-warning">
          Справочник героев недоступен — имена заменены на идентификаторы.
        </p>
      ) : null}

      {history.status === "loading" && history.matches.length === 0 ? (
        <div aria-busy="true">
          <p className="mb-2 text-sm text-muted" role="status" aria-live="polite">
            Загружаем историю матчей…
          </p>
          <MatchListSkeleton />
        </div>
      ) : history.status === "error" && history.error ? (
        <ErrorState
          message={history.error.message}
          action={history.error.action}
          onRetry={history.retry}
        />
      ) : history.isEmpty ? (
        <EmptyState
          title="Turbo-матчей не найдено"
          description="В истории нет матчей режима Turbo. Сыграйте матч Turbo или проверьте настройки публичности данных Dota 2."
        />
      ) : (
        <MatchList
          matches={history.matches}
          status={history.status}
          error={history.error}
          hasMore={history.hasMore}
          isEmpty={history.isEmpty}
          heroes={heroes.data ?? {}}
          onSelect={onSelectMatch}
          onLoadMore={history.loadMore}
          onRetry={history.retry}
        />
      )}
    </main>
  );
}
