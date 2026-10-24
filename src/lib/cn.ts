import { clsx, type ClassValue } from "clsx";

/** Объединение классов Tailwind. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
