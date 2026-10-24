import { useMemo } from "react";
import { ShoppingBag } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Card, CardTitle } from "../../components/ui/Card";
import type { MatchDetail, PlayerStats } from "../../domain/models";
import type { ApiConstantsItems } from "../../services/opendota/types";
import { formatDuration, formatNumber } from "../../lib/format";
import { ItemIcon } from "../../components/media/EntityIcons";
import { ExternalLinkIcon } from "../../components/media/ExternalLinkIcon";
import { dotabuffItemUrl } from "../../lib/externalLinks";
import { humanizeKey, metricLabel } from "../../i18n/metrics";

/** Индекс предмета → запись справочника (для отображения названий и ссылок). */
type ItemEntry = { dname?: string; img?: string; cost?: number; name?: string };

/** Одна позиция инвентаря: иконка с fallback и всплывающая подпись. */
function ItemSlot({
  itemId,
  entry,
  label,
}: {
  itemId: number | null;
  entry: ItemEntry | undefined;
  label: string;
}) {
  if (itemId === null) {
    return (
      <span className="flex flex-col items-center gap-1">
        <span
          className="flex h-8 w-8 items-center justify-center rounded border border-dashed border-border text-[10px] text-muted"
          title="Пустой слот"
          aria-label={`Пустой слот: ${label}`}
        >
          —
        </span>
        <span className="text-[9px] text-muted">{label}</span>
      </span>
    );
  }
  const name = entry?.dname;
  return (
    <span className="flex flex-col items-center gap-1">
      <ItemIcon img={entry?.img} displayName={name} className="h-8 w-8 rounded border border-border" />
      <span className="text-[9px] text-muted">{label}</span>
      <span className="sr-only">{name ?? metricLabel(String(itemId))}</span>
    </span>
  );
}

/** Итоговая сборка, лог покупок и сопоставление с таймлайном. */
export function ItemsBlock({
  match,
  player,
  items,
}: {
  match: MatchDetail;
  player: PlayerStats;
  /** Справочник items из OpenDota constants (передаётся страницей, без повторного запроса). */
  items?: ApiConstantsItems | null;
}) {
  // Карты строятся один раз на загрузку справочника: id → запись и имя → запись.
  const { byId, byName } = useMemo(() => {
    const idMap = new Map<number, ItemEntry>();
    const nameMap = new Map<string, ItemEntry>();
    if (items) {
      for (const entry of Object.values(items)) {
        if (typeof entry.id === "number") idMap.set(entry.id, entry);
        if (entry.name) nameMap.set(entry.name, entry);
        // Ключи справочника — внутренние имена вида black_king_bar.
      }
      for (const [key, entry] of Object.entries(items)) {
        nameMap.set(key, { ...entry, name: entry.name ?? key });
      }
    }
    return { byId: idMap, byName: nameMap };
  }, [items]);

  /** Покупка: ключ purchase_log (tango, black_king_bar) → запись справочника. */
  const purchaseEntry = (key: string): ItemEntry | undefined =>
    byName.get(key) ?? byName.get(`item_${key}`);

  const slotLabels = [
    "Слот 1",
    "Слот 2",
    "Слот 3",
    "Слот 4",
    "Слот 5",
    "Слот 6",
  ];

  return (
    <Card>
      <div className="flex items-center gap-2">
        <ShoppingBag className="h-4 w-4 text-muted" aria-hidden />
        <CardTitle>Предметы</CardTitle>
      </div>

      <div className="mt-3 flex flex-wrap items-start gap-2">
        {player.items.main.map((id, i) => (
          <ItemSlot
            key={`main-${i}`}
            itemId={id}
            entry={id !== null ? byId.get(id) : undefined}
            label={slotLabels[i]}
          />
        ))}
        <span className="mx-2 h-8 w-px bg-border" aria-hidden />
        {player.items.backpack.map((id, i) => (
          <ItemSlot
            key={`bag-${i}`}
            itemId={id}
            entry={id !== null ? byId.get(id) : undefined}
            label={`Рюкзак ${i + 1}`}
          />
        ))}
        <span className="mx-2 h-8 w-px bg-border" aria-hidden />
        <ItemSlot
          itemId={player.items.neutral}
          entry={player.items.neutral !== null ? byId.get(player.items.neutral) : undefined}
          label="Нейтральный"
        />
      </div>

      <div className="mt-4">
        <h4 className="text-xs uppercase tracking-wide text-muted">
          История покупок
        </h4>
        {player.purchaseLog && player.purchaseLog.length > 0 ? (
          <ul className="mt-2 max-h-48 overflow-y-auto text-sm">
            {player.purchaseLog.map((p, i) => {
              const entry = purchaseEntry(p.key);
              const display = entry?.dname ?? humanizeKey(p.key);
              return (
                <li
                  key={`${p.key}-${i}`}
                  className="flex items-center justify-between border-b border-border/50 py-1"
                >
                  <span className="flex min-w-0 items-center gap-1 truncate">
                    <ItemIcon
                      img={entry?.img}
                      displayName={display}
                      className="h-5 w-5 shrink-0 rounded border border-border"
                    />
                    <span className="truncate">{display}</span>
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <ExternalLinkIcon
                      href={dotabuffItemUrl(entry?.dname ?? display)}
                      label={`${display} на Dotabuff (откроется в новой вкладке)`}
                    />
                    {entry?.cost !== undefined && (
                      <span>{formatNumber(entry.cost)} зол.</span>
                    )}
                    <span className="tabular-nums">
                      {p.time >= 0 ? "+" : "−"}
                      {formatDuration(Math.abs(p.time))}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Лог покупок OpenDota для этого матча не предоставила — сопоставление
            предметов с таймлайном недоступно.
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
        <Badge tone="neutral">
          Непотраченное золото: {formatNumber(player.gold)}
        </Badge>
        <Badge tone="neutral">
          Потрачено: {formatNumber(player.goldSpent)}
        </Badge>
      </div>

      <p className="mt-2 text-[11px] text-muted">
        Матч {match.matchId}: сборка отражает предметы на конец игры.
      </p>
    </Card>
  );
}
