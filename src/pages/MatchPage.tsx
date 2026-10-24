import { ArrowLeft, RefreshCw } from "lucide-react";
import { ErrorState } from "../components/StateViews";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { LoadStages } from "../components/ui/LoadStages";
import { ExternalLinkIcon } from "../components/media/ExternalLinkIcon";
import { HeroIcon } from "../components/media/EntityIcons";
import { useAsync } from "../hooks/useAsync";
import { opendotaClient } from "../services/opendota";
import { mapMatchDetail } from "../domain/mappers/matchMapper";
import { computeMatchExperienceScore } from "../analytics/experience-score";
import { computePlayerPerformanceScore } from "../analytics/player-performance";
import { metricLabels } from "../i18n/metrics";
import {
  dotabuffHeroUrl,
  dotabuffMatchUrl,
  liquipediaHeroUrl,
  openDotaMatchUrl,
} from "../lib/externalLinks";
import {
  PerformanceScoreCard,
  ExperienceScoreCard,
} from "../features/analytics/ScoreCards";
import {
  AdvantageChart,
  BattleContribution,
  EventsBlock,
  ItemsBlock,
  TeamLineups,
} from "../features/match-details";
import { FeedbackBlock } from "../features/feedback";
import type { StoredProfile } from "../lib/storage";
import { formatDuration, formatMatchDate } from "../lib/format";

/** Подробная страница матча: статистика, составы, две оценки, впечатление. */
export function MatchPage({
  matchId,
  profile,
  onBack,
}: {
  matchId: number;
  profile: StoredProfile | null;
  onBack: () => void;
}) {
  const matchQuery = useAsync(
    (force) => opendotaClient.getMatch(matchId, { force: force ?? false }),
    [matchId],
  );
  const heroes = useAsync(() => opendotaClient.getHeroes(), []);
  const items = useAsync(() => opendotaClient.getItems(), []);

  const refreshing = matchQuery.status === "loading" && matchQuery.data !== null;
  const initialLoading = matchQuery.status === "loading" && matchQuery.data === null;
  const refreshError = matchQuery.status === "error" && matchQuery.data !== null;

  // Этапы отражают фактическое состояние запросов, без выдуманного процента.
  const stageIndex =
    matchQuery.data === null
      ? 0
      : heroes.status === "loading" || items.status === "loading"
        ? 1
        : 2;

  if (initialLoading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-6">
        <LoadStages
          steps={[
            "Загружаем подробную статистику матча…",
            "Загружаем справочники героев и предметов…",
            "Рассчитываем оценки…",
          ]}
          activeIndex={stageIndex}
        />
      </main>
    );
  }

  if (matchQuery.status === "error" && matchQuery.data === null) {
    const err = matchQuery.error;
    const message =
      err && typeof err === "object" && "message" in err
        ? String((err as { message: string }).message)
        : "Не удалось загрузить матч.";
    const action =
      err && typeof err === "object" && "action" in err
        ? ((err as { action: "retry" | "back" | "check_privacy" | "none" }).action)
        : "retry";
    return (
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Назад к истории
        </Button>
        <ErrorState
          message={message}
          action={action}
          onRetry={() => void matchQuery.run()}
        />
        {action !== "retry" && (
          <div className="mt-3 text-center">
            <Button variant="secondary" size="sm" onClick={onBack}>
              Вернуться к истории
            </Button>
          </div>
        )}
      </main>
    );
  }

  if (!matchQuery.data) return null;

  const match = mapMatchDetail(matchQuery.data);
  const accountId = profile?.accountId ?? null;
  const player =
    accountId !== null
      ? match.players.find((p) => p.accountId === accountId)
      : match.players[0];

  const itemCosts = items.data
    ? Object.fromEntries(
        Object.values(items.data).map((it) => [it.id, { cost: it.cost }]),
      )
    : undefined;

  const experience = computeMatchExperienceScore(match, player);
  const performance = computePlayerPerformanceScore(match, player, {
    itemCosts,
  });

  const heroConstant =
    player?.heroId !== undefined
      ? heroes.data?.[String(player.heroId)]
      : undefined;
  const heroName = heroConstant?.localized_name;

  // Время обновления данных матча из кэша (без сетевого запроса).
  const matchMeta = opendotaClient.cacheMeta(`matches/${matchId}`);
  const updatedLabel = matchMeta
    ? new Date(matchMeta.cachedAt).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const won =
    player?.side === "radiant"
      ? match.radiantWin === true
      : match.radiantWin === false
        ? true
        : match.radiantWin === undefined || match.radiantWin === null
          ? undefined
          : false;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 animate-in">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Назад к истории
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void matchQuery.run(true)}
          disabled={matchQuery.status === "loading"}
          aria-label="Обновить анализ матча"
          title="Принудительно перезапрашивает только этот матч, не очищая справочники и историю"
        >
          <RefreshCw
            className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            aria-hidden
          />
          {refreshing ? "Обновляем…" : "Обновить анализ"}
        </Button>
      </div>

      {/* Обновление выполняется: данные видимы, показываем статус */}
      {(refreshing || refreshError) && (
        <div
          role="status"
          aria-busy={refreshing || undefined}
          className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm"
        >
          <span className="text-muted">
            {refreshing
              ? "Обновляем анализ матча…"
              : "Не удалось обновить анализ — показаны прежние данные."}
          </span>
          <span className="flex items-center gap-2">
            {refreshError && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void matchQuery.run(true)}
              >
                Повторить
              </Button>
            )}
            {updatedLabel && !refreshing && (
              <span className="text-xs text-muted">Данные обновлены: {updatedLabel}</span>
            )}
          </span>
        </div>
      )}

      {/* Шапка матча */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <HeroIcon
              heroName={heroConstant?.name}
              displayName={heroName}
              className="h-12 w-12 shrink-0 rounded-md border border-border"
              eager
            />
            <div>
              <h1 className="text-xl font-bold">
                {heroName ?? `Герой #${player?.heroId ?? "?"}`}{" "}
                <span className="text-muted font-normal">· матч {match.matchId}</span>
              </h1>
              <p className="text-sm text-muted">
                {formatMatchDate(match.startTime)} · {formatDuration(match.duration)}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <ExternalLinkIcon
                  href={dotabuffMatchUrl(match.matchId)}
                  label="Матч на Dotabuff (откроется в новой вкладке)"
                />
                <ExternalLinkIcon
                  href={openDotaMatchUrl(match.matchId)}
                  label="Матч на OpenDota (откроется в новой вкладке)"
                />
                <ExternalLinkIcon
                  href={dotabuffHeroUrl(heroName)}
                  label={`Герой ${heroName ?? ""} на Dotabuff (откроется в новой вкладке)`}
                >
                  <span className="hidden sm:inline">Герой</span>
                </ExternalLinkIcon>
                <ExternalLinkIcon
                  href={liquipediaHeroUrl(heroName)}
                  label={`Герой ${heroName ?? ""} на Liquipedia (откроется в новой вкладки)`}
                >
                  <span className="hidden sm:inline">Wiki</span>
                </ExternalLinkIcon>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {won !== undefined && (
              <Badge tone={won ? "success" : "danger"}>
                {won ? "Победа" : "Поражение"}
              </Badge>
            )}
            <Badge tone="accent">{player?.side === "radiant" ? "Radiant" : "Dire"}</Badge>
            <Badge tone="neutral">Turbo</Badge>
          </div>
        </div>
        {match.missing.length > 0 && (
          <p className="mt-2 text-xs text-warning">
            Данные неполные: {metricLabels(match.missing).join(", ")} — оценки
            учитывают только доступные поля.
            {updatedLabel && ` Последняя проверка: ${updatedLabel}.`}
          </p>
        )}
      </Card>

      {/* Две оценки */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ExperienceScoreCard result={experience} />
        <PerformanceScoreCard result={performance} />
      </div>

      {/* Составы и статистика */}
      <div className="mb-4">
        <TeamLineups match={match} accountId={accountId} heroes={heroes.data ?? {}} />
      </div>

      {/* Боевой вклад */}
      {player && (
        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BattleContribution match={match} player={player} />
          <AdvantageChart match={match} player={player} />
        </div>
      )}

      {/* Предметы и события */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {player && (
          <ItemsBlock match={match} player={player} items={items.data} />
        )}
        <EventsBlock match={match} />
      </div>

      {/* Субъективная оценка */}
      <FeedbackBlock matchId={matchId} />

      <p className="mt-4 text-center text-xs text-muted">
        Оценки — экспериментальная модель V1.{" "}
        <a href="#/about" className="text-accent underline underline-offset-2">
          Как считаются оценки
        </a>
      </p>
    </main>
  );
}
