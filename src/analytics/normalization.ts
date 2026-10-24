/** Нормализация значений для оценок: шкалы, ограничения, вспомогательные функции. */

/** Ограничивает значение диапазоном [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Линейно отображает value из [inMin, inMax] в [outMin, outMax] с ограничением.
 * Монотонность сохраняется и при inMin > inMax (обратная шкала).
 */
export function scaleLinear(
  value: number,
  inMin: number,
  inMax: number,
  outMin = 0,
  outMax = 100,
): number {
  if (!Number.isFinite(value)) return outMin;
  if (inMin === inMax) return outMin;
  const t = (value - inMin) / (inMax - inMin);
  return clamp(outMin + t * (outMax - outMin), Math.min(outMin, outMax), Math.max(outMin, outMax));
}

/** Безопасное деление: при нулевом знаменателе возвращает undefined. */
export function safeDiv(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined || b === undefined) return undefined;
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return undefined;
  return a / b;
}

/** Среднее по массиву чисел; undefined, если массив пуст. */
export function mean(values: number[]): number | undefined {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return undefined;
  return finite.reduce((s, v) => s + v, 0) / finite.length;
}

/** Округление до одного знака. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
