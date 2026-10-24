import { Chrome } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { startSteamLogin } from "./useSteamLogin";

/** Кнопка «Войти через Steam». */
export function SteamLoginButton({ size = "lg" }: { size?: "md" | "lg" }) {
  return (
    <Button size={size} onClick={() => startSteamLogin()} aria-label="Войти через Steam">
      <Chrome className="h-5 w-5" aria-hidden />
      Войти через Steam
    </Button>
  );
}
