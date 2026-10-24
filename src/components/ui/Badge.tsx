import type { HTMLAttributes, PropsWithChildren } from "react";
import { cn } from "../../lib/cn";

type Tone = "neutral" | "success" | "danger" | "accent" | "warning";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-border",
  success: "bg-success/15 text-success border-success/40",
  danger: "bg-danger/15 text-danger border-danger/40",
  accent: "bg-accent/15 text-accent border-accent/40",
  warning: "bg-warning/15 text-warning border-warning/40",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLSpanElement>> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
