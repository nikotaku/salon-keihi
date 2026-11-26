import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { CalendarCheck, JapaneseYen, LayoutDashboard, Plus, ReceiptText, Repeat, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExpenseDialog } from "@/components/ExpenseDialog";
import { useApp } from "@/hooks/useApp";
import { cn } from "@/lib/utils";
import { tint } from "@/lib/summary";

const NAV = [
  { to: "/", label: "ホーム", icon: LayoutDashboard, end: true },
  { to: "/sales", label: "売上", icon: JapaneseYen },
  { to: "/expenses", label: "経費", icon: ReceiptText },
  { to: "/fixed", label: "固定費", icon: Repeat },
  { to: "/payments", label: "支払い", icon: CalendarCheck },
  { to: "/settings", label: "設定", icon: Settings },
];

export function Layout({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const { openExpense, shops, usableShops, isOwner, colors } = useApp();
  const navigate = useNavigate();
  const shopLinks = isOwner ? shops.filter((s) => s.is_active) : usableShops;
  return (
    <div className="min-h-dvh">
      {/* PC: 左のメニュー */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r bg-card md:flex">
        <div className="px-6 pb-5 pt-7">
          <p className="brand-eyebrow">SALON MANAGEMENT</p>
          <p className="mt-1 font-serif text-xl font-semibold tracking-widest">サロン管理</p>
        </div>
        <div className="space-y-2 px-4">
          <Button className="w-full" onClick={() => navigate(`/sales?new=${Date.now()}`)}>
            <Plus /> 売上を入力
          </Button>
          <Button variant="outline" size="sm" className="w-full" onClick={() => openExpense()}>
            <Plus /> 経費を入力
          </Button>
        </div>
        <nav className="mt-5 space-y-0.5 px-4">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm tracking-wide transition-colors",
                  isActive ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground hover:bg-muted",
                )
              }
            >
              <item.icon size={18} strokeWidth={1.7} /> {item.label}
            </NavLink>
          ))}
        </nav>
        {shopLinks.length > 0 && (
          <nav className="mt-6 space-y-0.5 px-4" aria-label="店舗ごとのページ">
            <p className="brand-eyebrow px-3 pb-1.5">SHOPS</p>
            {shopLinks.map((shop) => (
              <NavLink
                key={shop.id}
                to={`/shops/${shop.id}`}
                style={({ isActive }) => (isActive ? { background: tint(colors[shop.id], 0.16) } : undefined)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm",
                    isActive ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground hover:bg-muted",
                  )
                }
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[shop.id] }} />
                <span className="truncate">{shop.name}</span>
              </NavLink>
            ))}
          </nav>
        )}
      </aside>

      <div className="md:pl-60">
        <header className="sticky top-0 z-30 bg-background/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-2 px-5 pb-3 pt-4 md:px-8 md:pt-7">
            <div>
              <p className="brand-eyebrow md:hidden">SALON MANAGEMENT</p>
              <h1 className="font-serif text-[22px] font-semibold tracking-widest md:text-2xl">{title}</h1>
            </div>
            {actions}
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-36 pt-2 md:px-8 md:pb-12">{children}</main>
      </div>

      {/* スマホ: 下のタブと、売上入力のボタン（売上の画面を開いて金額の欄に入る） */}
      <button
        type="button"
        onClick={() => navigate(`/sales?new=${Date.now()}`)}
        className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-40 flex h-14 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold tracking-wider text-primary-foreground shadow-[0_10px_24px_rgba(154,84,104,0.35)] md:hidden"
        aria-label="売上を入力"
      >
        <Plus size={20} /> 売上
      </button>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur safe-bottom md:hidden">
        <div className="grid grid-cols-6">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn("flex flex-col items-center gap-1 pb-1.5 pt-2.5 text-[10.5px] tracking-wide", isActive ? "font-semibold text-primary" : "text-muted-foreground/80")
              }
            >
              <item.icon size={21} strokeWidth={1.6} />
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>

      <ExpenseDialog />
    </div>
  );
}
