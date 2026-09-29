import { yen } from "@/lib/format";
import type { MonthSummary } from "@/lib/summary";

const BAR = "#2a78d6";

// 科目別の経費（多い順の横棒）。1系列なので色は1つ、値は棒の横に文字で出す
export function CategoryBars({ rows, total, limit = 8 }: { rows: MonthSummary["byCategory"]; total: number; limit?: number }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">この月の経費はまだありません</p>;
  const shown = rows.slice(0, limit);
  const rest = rows.slice(limit).reduce((sum, r) => sum + r.amount, 0);
  const list = rest > 0 ? [...shown, { categoryId: "rest", name: `その他 ${rows.length - limit}科目`, kind: null, amount: rest }] : shown;
  const max = Math.max(...list.map((r) => r.amount), 1);
  return (
    <ul className="space-y-2.5">
      {list.map((row) => (
        <li key={row.categoryId} title={`${row.name}: ${yen(row.amount)}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate">
              {row.name}
              {row.kind && <span className="ml-1.5 text-muted-foreground">{row.kind === "fixed" ? "固定" : "変動"}</span>}
            </span>
            <span className="shrink-0 tabular">
              <span className="font-semibold">{yen(row.amount)}</span>
              <span className="ml-1.5 text-muted-foreground">{total > 0 ? `${Math.round((row.amount / total) * 100)}%` : ""}</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full" style={{ width: `${Math.max(2, (row.amount / max) * 100)}%`, background: BAR }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
