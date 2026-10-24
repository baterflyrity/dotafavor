/**
 * Иконки игровых сущностей с устойчивым fallback (spec/iteration-02.md, §6).
 *
 * Источники изображений — официальный CDN Valve/Steam:
 * - герои:  https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/{name}.png
 * - предметы: тот же CDN + путь img из OpenDota constants;
 * - аватары: profile.avatarfull из ответа OpenDota.
 *
 * При ошибке загрузки показывается локальный SVG-плейсхолдер из репозитория;
 * цикл onError предотвращён: если сломался и сам плейсхолдер, рисуется
 * текстовый значок без further-запросов. Сбой CDN не блокирует аналитику.
 */

import { useEffect, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { cn } from "../../lib/cn";
import { heroImageUrl, itemImageUrl } from "../../lib/imageUrls";
import placeholderUrl from "../../assets/placeholder.svg";

function FallbackImage({ alt, className }: { alt: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  // Защита от цикла onError: после второй ошибки рисуется статичный значок.
  if (broken) {
    return (
      <span
        role="img"
        aria-label={alt}
        className={cn(
          "flex items-center justify-center bg-surface-2 text-muted",
          className,
        )}
      >
        <ImageIcon className="h-1/2 w-1/2" aria-hidden />
      </span>
    );
  }
  return (
    <img
      src={placeholderUrl}
      alt={alt}
      className={className}
      aria-hidden={false}
      onError={() => setBroken(true)}
    />
  );
}

/** Изображение с локальным fallback: ошибка CDN никогда не даёт «сломанный значок». */
function SafeImage({
  src,
  alt,
  className,
  eager,
}: {
  src: string | null;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (!src || failed) {
    return <FallbackImage alt={alt} className={className} />;
  }
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

/** Иконка героя по внутреннему имени и английскому названию из справочника. */
export function HeroIcon({
  heroName,
  displayName,
  className,
  eager,
}: {
  /** Внутреннее имя из constants: npc_dota_hero_antimage. */
  heroName?: string | null;
  /** Отображаемое имя (английское, из справочника) — для alt. */
  displayName?: string | null;
  className?: string;
  eager?: boolean;
}) {
  const alt = displayName ? `Герой ${displayName}` : "Иконка героя";
  return (
    <SafeImage
      src={heroImageUrl(heroName)}
      alt={alt}
      className={className}
      eager={eager}
    />
  );
}

/** Иконка предмета по полю img из OpenDota constants. */
export function ItemIcon({
  img,
  displayName,
  className,
}: {
  /** Путь img из constants (или абсолютный URL). */
  img?: string | null;
  displayName?: string | null;
  className?: string;
}) {
  const alt = displayName ? `Предмет ${displayName}` : "Иконка предмета";
  return <SafeImage src={itemImageUrl(img)} alt={alt} className={className} />;
}

/** Аватар Steam игрока (profile.avatarfull); без URL — локальный плейсхолдер. */
export function PlayerAvatar({
  src,
  name,
  className,
}: {
  src?: string | null;
  name?: string | null;
  className?: string;
}) {
  const alt = name ? `Аватар игрока ${name}` : "Аватар игрока";
  return <SafeImage src={src ?? null} alt={alt} className={className} />;
}
