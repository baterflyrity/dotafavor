import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardTitle } from "../../components/ui/Card";
import type { MatchDetail, PlayerStats } from "../../domain/models";
import { formatDuration } from "../../lib/format";

/**
 * Графики экономики/опыта/преимущества команд.
 * Рисуются только при наличии реальных временных рядов из API.
 */
export function AdvantageChart({
  match,
  player,
}: {
  match: MatchDetail;
  player: PlayerStats | undefined;
}) {
  const gold = match.radiantGoldAdv;
  const xp = match.radiantXpAdv;

  if (!gold && !xp) {
    return (
      <Card>
        <CardTitle>Ход матча</CardTitle>
        <p className="mt-2 text-sm text-muted">
          Временные ряды преимущества по золоту и опыту для этого матча
          недоступны — график не строится, чтобы не выдавать догадки за данные.
        </p>
      </Card>
    );
  }

  const sign = player?.side === "dire" ? -1 : 1;
  const series = gold ?? xp!;
  const data = series.map((value, i) => ({
    time: (i + 1) * 60,
    gold: gold ? value * sign : null,
    xp: xp && xp[i] !== undefined ? xp[i] * sign : null,
  }));

  const zeroLine = sign === 1 ? 0 : 0;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Преимущество команд</CardTitle>
        <span className="text-xs text-muted">
          отрицательное = в пользу {player?.side === "dire" ? "Radiant" : "Dire"}
        </span>
      </div>
      <div className="mt-3 h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#252d3d" strokeDasharray="3 3" />
            <XAxis
              dataKey="time"
              stroke="#8b94a7"
              tickFormatter={(v: number) => formatDuration(v)}
              minTickGap={40}
              fontSize={11}
            />
            <YAxis stroke="#8b94a7" fontSize={11} width={48} />
            <Tooltip
              contentStyle={{
                background: "#121722",
                border: "1px solid #252d3d",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v) => formatDuration(Number(v))}
              formatter={(value) => [
                typeof value === "number" ? Math.round(value) : "—",
                "",
              ]}
            />
            {gold && (
              <Line
                type="monotone"
                dataKey="gold"
                name="Золото"
                stroke="#d9a13d"
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
                connectNulls
              />
            )}
            {xp && (
              <Line
                type="monotone"
                dataKey="xp"
                name="Опыт"
                stroke="#3d9dd9"
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
                connectNulls
              />
            )}
            <Line
              type="monotone"
              dataKey={() => zeroLine}
              name="Равенство"
              stroke="#8b94a7"
              strokeDasharray="4 4"
              dot={false}
              strokeWidth={1}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Ряд дан в терминах стороны игрока: значения приведены к его стороне.
      </p>
    </Card>
  );
}
