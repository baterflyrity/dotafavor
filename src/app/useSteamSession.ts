import { useEffect, useState } from "react";
import {
  parseSteamCallback,
  stripCallbackParams,
} from "../features/steam-login/steamOpenId";
import type { StoredProfile } from "../lib/storage";
import { loadProfile, saveProfile, clearProfile } from "../lib/storage";
import { opendotaClient } from "../services/opendota";
import { startSteamLogin } from "../features/steam-login/useSteamLogin";
import { navigate } from "./router";

export interface SteamSession {
  profile: StoredProfile | null;
  /** Сообщение о результате обработки callback (успех, отмена, ошибка формата). */
  notice: string | null;
  noticeTone: "success" | "danger" | "warning" | null;
  dismissNotice: () => void;
  logout: () => void;
  switchAccount: () => void;
}

/**
 * Обрабатывает возврат из Steam при загрузке приложения:
 * проверяет callback-параметры, извлекает SteamID64, сохраняет профиль,
 * очищает адресную строку от технических параметров.
 *
 * Проверка формата claimed_id НЕ является криптографической проверкой Steam.
 */
export function useSteamSession(): SteamSession {
  const [profile, setProfile] = useState<StoredProfile | null>(() => loadProfile());
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<SteamSession["noticeTone"]>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = parseSteamCallback(params);
    if (result.status === "ignored") return;

    // Очищаем технические параметры из адресной строки сразу после разбора.
    const cleaned = stripCallbackParams(params);
    const query = cleaned.toString();
    const url =
      window.location.pathname + (query ? `?${query}` : "") + window.location.hash;
    window.history.replaceState(null, "", url);

    if (result.status === "cancelled") {
      setNotice("Вход через Steam был отменён.");
      setNoticeTone("warning");
      return;
    }
    if (result.status === "invalid") {
      setNotice(`Не удалось разобрать ответ Steam: ${result.reason}.`);
      setNoticeTone("danger");
      return;
    }

    // success: загружаем профиль для отображения имени и аватара.
    const newProfile: StoredProfile = {
      steamId64: result.steamId64,
      accountId: result.accountId,
    };
    saveProfile(newProfile);
    setProfile(newProfile);
    setNotice("Вход выполнен. Загружаем профиль…");
    setNoticeTone("success");
    navigate("/matches");

    void opendotaClient
      .getPlayerProfile(result.accountId)
      .then((p) => {
        const enriched: StoredProfile = {
          ...newProfile,
          personaName: p.profile?.personaname ?? null,
          avatar: p.profile?.avatarfull ?? p.profile?.avatar ?? null,
        };
        saveProfile(enriched);
        setProfile(enriched);
        setNotice(null);
      })
      .catch(() => {
        // Профиль не критичен — история загрузится и без него.
        setNotice(null);
      });
  }, []);

  const logout = () => {
    clearProfile();
    setProfile(null);
    navigate("/");
  };

  const switchAccount = () => {
    logout();
    // После выхода сразу запускаем вход в новый аккаунт.
    startSteamLogin();
  };

  return {
    profile,
    notice,
    noticeTone,
    dismissNotice: () => setNotice(null),
    logout,
    switchAccount,
  };
}
