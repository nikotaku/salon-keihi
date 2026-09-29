import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { compactYen, monthLabel, shortMonthLabel, yen } from "@/lib/format";
import type { TrendPoint } from "@/lib/summary";

interface Series {
  key: string;
  label: string;
  color: string;
}

const SURFACE = "#ffffff";
const GRID = "#e1e0d9";
const AXIS = "#c3c2b7";
const MUTED = "#898781";

function ChartTooltip({ active, payload, label, series }: TooltipProps<number, string> & { series: Series[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Record<string, number | string>;
  const total = series.reduce((sum, s) => sum + (Number(row[s.key]) || 0), 0);
  return (
    <div className="min-w-[180px] rounded-lg border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">{monthLabel(String(label))}</p>
      {[...series].reverse().map((s) => (
        <div key={s.key} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
          <span className="tabular">{yen(Number(row[s.key]) || 0)}</span>
        </div>
      ))}
      <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
        <span>合計</span>
        <span className="tabular">{yen(total)}</span>
      </div>
    </div>
  );
}

// 月別の経費を店舗ごとに積み上げた棒グラフ。色だけに頼らないよう凡例と表の切り替えを付ける
export function MonthlyExpenseChart({ trend, series }: { trend: TrendPoint[]; series: Series[] }) {
  const [asTable, setAsTable] = useState(false);
  const data = trend.map((point) => ({ month: point.month, ...Object.fromEntries(series.map((s) => [s.key, point.byShop[s.key] ?? 0])) }));
  const topKey = series[series.length - 1]?.key;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setAsTable((v) => !v)} className="text-xs text-primary underline-offset-2 hover:underline">
          {asTable ? "グラフで見る" : "表で見る"}
        </button>
      </div>

      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-xs tabular">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="py-1.5 pr-2 text-left font-medium">月</th>
                {series.map((s) => <th key={s.key} className="px-2 py-1.5 text-right font-medium">{s.label}</th>)}
                <th className="py-1.5 pl-2 text-right font-medium">合計</th>
              </tr>
            </thead>
            <tbody>
              {trend.map((point) => (
                <tr key={point.month} className="border-b last:border-0">
                  <td className="py-1.5 pr-2">{monthLabel(point.month)}</td>
                  {series.map((s) => <td key={s.key} className="px-2 py-1.5 text-right">{yen(point.byShop[s.key] ?? 0)}</td>)}
                  <td className="py-1.5 pl-2 text-right font-semibold">{yen(point.expenses)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-60" role="img" aria-label="直近6か月の経費（店舗別の積み上げ棒グラフ）。数値は「表で見る」で確認できます">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="month" tickFormatter={shortMonthLabel} tickLine={false} axisLine={{ stroke: AXIS }} tick={{ fill: MUTED, fontSize: 12 }} />
              <YAxis tickFormatter={compactYen} tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 11 }} width={44} />
              <Tooltip cursor={{ fill: "rgba(11,11,11,0.04)" }} content={<ChartTooltip series={series} />} />
              {series.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  stackId="expenses"
                  fill={s.color}
                  stroke={SURFACE}
                  strokeWidth={2}
                  maxBarSize={24}
                  radius={s.key === topKey ? [4, 4, 0, 0] : 0}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
