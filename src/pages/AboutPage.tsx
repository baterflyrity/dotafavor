import { useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card, CardTitle } from "../components/ui/Card";
import { EXPERIENCE_WEIGHTS, PERFORMANCE_WEIGHTS } from "../analytics/config";
import { opendotaClient } from "../services/opendota";
import { TTL_MS } from "../services/opendota/ttl";

const DAY_HOURS = 24;
const TTL_DESC: Array<[string, string]> = [
  ["Справочники (герои, предметы, режимы)", `${Math.round(TTL_MS.constants / (DAY_HOURS * 3600_000))} дн`],
  ["Профиль игрока", `${Math.round(TTL_MS.profile / 3600_000)} ч`],
  ["История матчей", `${Math.round(TTL_MS.history / 60_000)} мин`],
  ["Полный обработанный матч", `${Math.round(TTL_MS.matchComplete / (DAY_HOURS * 3600_000))} дн`],
  ["Неполный/необработанный матч", `${Math.round(TTL_MS.matchIncomplete / 60_000)} мин`],
];

/** Раздел о методике расчёта оценок и ограничениях данных. */
export function AboutPage({ onBack }: { onBack: () => void }) {
  const [cacheInfo, setCacheInfo] = useState<string | null>(null);

  const handleClearCache = () => {
    opendotaClient.clearCache();
    setCacheInfo("Локальный кэш очищен. Данные будут запрошены заново.");
  };
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 animate-in">
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Назад
      </Button>

      <h1 className="text-2xl font-bold">Методика и ограничения</h1>

      <Card className="mt-4">
        <CardTitle>Качество матча (Match Experience Score)</CardTitle>
        <p className="mt-2 text-sm text-muted">
          Экспериментальная модель V1. Итоговый балл 0–100 складывается из четырёх
          компонентов. Веса — начальные гипотезы, а не научная калибровка.
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          <li>Равенство и напряжённость — {Math.round(EXPERIENCE_WEIGHTS.parity * 100)}%</li>
          <li>Возможность влиять на игру — {Math.round(EXPERIENCE_WEIGHTS.agency * 100)}%</li>
          <li>Полезность союзников — {Math.round(EXPERIENCE_WEIGHTS.teamwork * 100)}%</li>
          <li>Темп и вовлечённость — {Math.round(EXPERIENCE_WEIGHTS.pace * 100)}%</li>
        </ul>
        <p className="mt-2 text-sm text-muted">
          Если данных для компонента нет, он исключается, веса
          перераспределяются между доступными, а покрытие показывается явно.
          При покрытии ниже 50% итог не рассчитывается. Равенство оценивается
          только по временным рядам преимущества, а не по конечному счёту.
        </p>
      </Card>

      <Card className="mt-4">
        <CardTitle>Качество вашей игры (Player Performance Score)</CardTitle>
        <p className="mt-2 text-sm text-muted">
          Отдельная метрика для Turbo: экономика и темп —{" "}
          {Math.round(PERFORMANCE_WEIGHTS.economy * 100)}%, командные сражения —{" "}
          {Math.round(PERFORMANCE_WEIGHTS.teamfights * 100)}%, цели —{" "}
          {Math.round(PERFORMANCE_WEIGHTS.objectives * 100)}%, выживаемость —{" "}
          {Math.round(PERFORMANCE_WEIGHTS.survivability * 100)}%, полезность —{" "}
          {Math.round(PERFORMANCE_WEIGHTS.utility * 100)}%, предметы —{" "}
          {Math.round(PERFORMANCE_WEIGHTS.items * 100)}%.
        </p>
        <p className="mt-2 text-sm text-muted">
          Оценка не зависит только от победы и не сводится к KDA. Роли 1–5 в MVP
          не определяются. Отсутствующие показатели не подменяются нулями.
        </p>
      </Card>

      <Card className="mt-4">
        <CardTitle>Ограничения входа через Steam</CardTitle>
        <p className="mt-2 text-sm text-muted">
          Серверная проверка ответа Steam OpenID <strong>не выполняется</strong>:
          сайт статический и не имеет backend. Параметры возврата можно подделать.
          Это приемлемо только потому, что приложение использует ID исключительно
          для выбора публичного профиля и не предоставляет защищённых функций.
        </p>
      </Card>

      <Card className="mt-4">
        <CardTitle>Источник данных</CardTitle>
        <p className="mt-2 text-sm text-muted">
          Публичный OpenDota API без ключа, с ограничениями частоты запросов.
          Запросы идут через один централизованный клиент: очередь с паузой
          около 1,3 с между стартами запросов, дедупликация одинаковых
          запросов и кэш браузера. Матчи, ещё не обработанные OpenDota,
          показываются как «данные неполные». Автоматический разбор реплеев не
          запускается. Субъективные оценки хранятся только в вашем браузере
          (localStorage).
        </p>
        <p className="mt-2 text-sm text-muted">
          Подробные формулы: docs/score-model.md в репозитории.
        </p>
      </Card>

      <Card className="mt-4">
        <CardTitle>Локальный кэш данных</CardTitle>
        <p className="mt-2 text-sm text-muted">
          Ответы OpenDota кэшируются в браузере, чтобы не повторять запросы и
          не упираться в лимиты частоты. Кэш клиентский и привязан к этому
          браузеру — он не снижает число запросов других посетителей сайта.
        </p>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {TTL_DESC.map(([label, ttl]) => (
            <li key={label} className="flex justify-between gap-3">
              <span>{label}</span>
              <span className="tabular-nums">{ttl}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="danger" size="sm" onClick={handleClearCache}>
            <Trash2 className="h-4 w-4" aria-hidden />
            Очистить локальный кэш
          </Button>
          {cacheInfo && (
            <span role="status" className="text-xs text-success">
              {cacheInfo}
            </span>
          )}
        </div>
      </Card>
    </main>
  );
}
