import { ChevronLeft, ChevronRight } from "lucide-react";
import { useApp } from "@/hooks/useApp";
import { monthKeyOf, monthLabel, shiftMonth } from "@/lib/format";

export function MonthSwitcher() {
  const { month, setMonth } = useApp();
  const current = monthKeyOf(new Date());
  return (
    <div className="flex items-center gap-0.5 rounded-full border bg-card px-1 shadow-[0_1px_2px_rgba(60,40,30,0.04)]">
      <button
        type="button"
        onClick={() => setMonth(shiftMonth(month, -1))}
        className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
        aria-label="前の月"
      >
        <ChevronLeft size={18} />
      </button>
      <label className="relative">
        <span className="block min-w-[6.5rem] text-center text-sm font-semibold tabular">{monthLabel(month)}</span>
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
        className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
        aria-label="次の月"
      >
        <ChevronRight size={18} />
      </button>
      {month !== current && (
        <button type="button" onClick={() => setMonth(current)} className="mr-1 rounded-full bg-accent px-2.5 py-1 text-xs text-accent-foreground hover:bg-accent/70">
          今月
        </button>
      )}
    </div>
  );
}
