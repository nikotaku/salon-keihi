import { ChevronLeft, ChevronRight } from "lucide-react";
import { useApp } from "@/hooks/useApp";
import { monthKeyOf, monthLabel, shiftMonth } from "@/lib/format";

export function MonthSwitcher() {
  const { month, setMonth } = useApp();
  const current = monthKeyOf(new Date());
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setMonth(shiftMonth(month, -1))}
        className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
        aria-label="前の月"
      >
        <ChevronLeft size={20} />
      </button>
      <label className="relative">
        <span className="min-w-[7.5rem] text-center text-base font-semibold tabular block">{monthLabel(month)}</span>
        <input
          type="month"
          value={month}
          onChange={(e) => e.target.value && setMonth(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="月を選ぶ"
        />
      </label>
      <button
        type="button"
        onClick={() => setMonth(shiftMonth(month, 1))}
        className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
        aria-label="次の月"
      >
        <ChevronRight size={20} />
      </button>
      {month !== current && (
        <button type="button" onClick={() => setMonth(current)} className="ml-1 rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted">
          今月
        </button>
      )}
    </div>
  );
}
