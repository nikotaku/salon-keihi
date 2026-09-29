import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { JapaneseYen, LayoutDashboard, Plus, ReceiptText, Repeat, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExpenseDialog } from "@/components/ExpenseDialog";
import { useApp } from "@/hooks/useApp";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "ホーム", icon: LayoutDashboard, end: true },
  { to: "/expenses", label: "経費", icon: ReceiptText },
  { to: "/fixed", label: "固定費", icon: Repeat },
  { to: "/sales", label: "売上", icon: JapaneseYen },
  { to: "/settings", label: "設定", icon: Settings },
];

export function Layout({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const { openExpense } = useApp();
  return (
    <div className="min-h-dvh">
      {/* PC: 左のメニュー */}
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r bg-card md:flex">
        <div className="px-5 py-5">
          <p className="text-xs text-muted-foreground">各店舗の経費をまとめて管理</p>
          <p className="text-lg font-bold">サロン経費管理</p>
        </div>
        <div className="px-3">
          <Button className="w-full" onClick={() => openExpense()}>
            <Plus /> 経費を入力
          </Button>
        </div>
        <nav className="mt-4 space-y-0.5 px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                  isActive ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground hover:bg-muted",
                )
              }
            >
              <item.icon size={18} /> {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="md:pl-56">
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <h1 className="text-lg font-bold">{title}</h1>
            {actions}
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-32 pt-4 md:pb-10">{children}</main>
      </div>

      {/* スマホ: 下のタブと、経費入力のボタン */}
      <button
        type="button"
        onClick={() => openExpense()}
        className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-lg md:hidden"
        aria-label="経費を入力"
      >
        <Plus size={20} /> 経費
      </button>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card safe-bottom md:hidden">
        <div className="grid grid-cols-5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", isActive ? "font-semibold text-primary" : "text-muted-foreground")
              }
            >
              <item.icon size={21} />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <ExpenseDialog />
    </div>
  );
}
