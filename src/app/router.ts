import { useEffect, useState } from "react";

export type Route =
  | { name: "landing" }
  | { name: "dashboard" }
  | { name: "match"; matchId: number }
  | { name: "about" }
  | { name: "not_found" };

/** Преобразует hash-адрес в маршрут. Hash-routing работает и на GitHub Pages. */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, "").replace(/\/$/, "");
  if (path === "" || path === "matches") return { name: "dashboard" };
  if (path === "about") return { name: "about" };
  const match = path.match(/^match\/(\d+)$/);
  if (match) return { name: "match", matchId: Number(match[1]) };
  if (path === "login") return { name: "landing" };
  return { name: "not_found" };
}

/** Переход по hash-маршруту. */
export function navigate(route: string): void {
  window.location.hash = route;
}

/** Подписка на текущий маршрут. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
