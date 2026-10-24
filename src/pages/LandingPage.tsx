import { Gamepad2, LineChart, ShieldCheck, Star } from "lucide-react";
import { SteamLoginButton } from "../features/steam-login/SteamLoginButton";
import { Card } from "../components/ui/Card";

const features = [
  {
    icon: LineChart,
    title: "Качество матча",
    text: "Насколько матч был равным, интересным и позволял влиять на происходящее.",
  },
  {
    icon: Star,
    title: "Оценка вашей игры",
    text: "Отдельная прозрачная метрика эффективности ваших действий в Turbo.",
  },
  {
    icon: Gamepad2,
    title: "Стандартная статистика",
    text: "История Turbo-матчей, составы команд, предметы и события матча.",
  },
  {
    icon: ShieldCheck,
    title: "Без сервера и ключей",
    text: "Всё считается в браузере, данные берутся из публичного OpenDota API.",
  },
];

/** Стартовый экран. */
export function LandingPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 animate-in">
      <section className="text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">
          Dota 2 Analytics <span className="text-accent">для Turbo</span>
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-muted">
          Узнай, насколько матч был равным и увлекательным, оцени свою игру и
          разбери статистику — прямо в браузере, без регистрации и серверов.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <SteamLoginButton />
          <p className="text-xs text-muted">
            Вход выполняется на официальном сайте Steam. Пароль здесь не вводится.
          </p>
        </div>
      </section>

      <section className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {features.map((f) => (
          <Card key={f.title} className="flex items-start gap-3">
            <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
            <div>
              <h2 className="font-semibold">{f.title}</h2>
              <p className="text-sm text-muted">{f.text}</p>
            </div>
          </Card>
        ))}
      </section>

      <p className="mt-8 text-center text-xs text-muted">
        Серверная проверка Steam OpenID не выполняется: приложение использует ID
        только для выбора публичного профиля. Подробности — в разделе
        «Методика».
      </p>
    </main>
  );
}
