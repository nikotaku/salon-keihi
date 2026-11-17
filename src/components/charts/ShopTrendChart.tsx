import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { compactYen, monthLabel, shortMonthLabel, yen } from "@/lib/format";
import type { ShopTrendPoint } from "@/lib/summary";
import { cn } from "@/lib/utils";

const SURFACE = "#ffffff";
const GRID = "#e1e0d9";
const AXIS = "#c3c2b7";
const MUTED = "#898781";
const EXPENSE = "#b9b7ad";

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as ShopTrendPoint & { color: string };
  return (
    <div className="min-w-[170px] rounded-lg border bg-card px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-semibold">{monthLabel(String(label))}</p>
      <div className="flex justify-between gap-4 py-0.5"><span className="text-muted-foreground">売上</span><span className="tabular">{row.sales === null ? "未入力" : yen(row.sales)}</span></div>
      <div className="flex justify-between gap-4 py-0.5"><span className="text-muted-foreground">経費</span><span className="tabular">{yen(row.expenses)}</span></div>
      <div className="mt-1 flex justify-between gap-4 border-t pt-1 font-semibold">
        <span>利益</span>
        <span className={cn("tabular", row.profit !== null && row.profit < 0 && "text-destructive")}>{row.profit === null ? "—" : yen(row.profit)}</span>
      </div>
    </div>
  );
}

// 1店舗の月ごとの売上と経費（横に並べた棒）。利益はツールチップと表で出す
export function ShopTrendChart({ trend, color }: { trend: ShopTrendPoint[]; color: string }) {
  const [asTable, setAsTable] = useState(false);
  const data = trend.map((p) => ({ ...p, salesBar: p.sales ?? 0, color }));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />売上</li>
          <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: EXPENSE }} />経費</li>
        </ul>
        <button type="button" onClick={() => setAsTable((v) => !v)} className="text-xs text-primary underline-offset-2 hover:underline">
          {asTable ? "グラフで見る" : "表で見る"}
        </button>
      </div>
      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[360px] text-xs tabular">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="py-1.5 pr-2 text-left font-medium">月</th>
                <th className="px-2 py-1.5 text-right font-medium">売上</th>
                <th className="px-2 py-1.5 text-right font-medium">経費</th>
                <th className="py-1.5 pl-2 text-right font-medium">利益</th>
              </tr>
            </thead>
            <tbody>
              {trend.map((p) => (
                <tr key={p.month} className="border-b last:border-0">
                  <td className="py-1.5 pr-2">{monthLabel(p.month)}</td>
                  <td className="px-2 py-1.5 text-right">{p.sales === null ? "未入力" : yen(p.sales)}</td>
                  <td className="px-2 py-1.5 text-right">{yen(p.expenses)}</td>
                  <td className={cn("py-1.5 pl-2 text-right font-semibold", p.profit !== null && p.profit < 0 && "text-destructive")}>{p.profit === null ? "—" : yen(p.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-60" role="img" aria-label="直近6か月の売上と経費の棒グラフ。数値は「表で見る」で確認できます">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={2}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="month" tickFormatter={shortMonthLabel} tickLine={false} axisLine={{ stroke: AXIS }} tick={{ fill: MUTED, fontSize: 12 }} />
              <YAxis tickFormatter={compactYen} tickLine={false} axisLine={false} tick={{ fill: MUTED, fontSize: 11 }} width={44} />
              <Tooltip cursor={{ fill: "rgba(11,11,11,0.04)" }} content={<ChartTooltip />} />
              <Bar dataKey="salesBar" name="売上" fill={color} stroke={SURFACE} strokeWidth={1} maxBarSize={20} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="expenses" name="経費" fill={EXPENSE} stroke={SURFACE} strokeWidth={1} maxBarSize={20} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
