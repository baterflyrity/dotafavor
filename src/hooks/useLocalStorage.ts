import { useEffect, useState } from "react";

/** Хук состояния, синхронизированного с localStorage. */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // localStorage может быть недоступен (private mode) — не роняем UI.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
