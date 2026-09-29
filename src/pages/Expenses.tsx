import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Paperclip, Repeat, Search } from "lucide-react";
import { Layout } from "@/components/Layout";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useApp } from "@/hooks/useApp";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatDay, monthEnd, monthStart, PAYMENT_LABELS, yen } from "@/lib/format";
import { fetchExpenses } from "@/lib/queries";
import { COMMON_KEY, COMMON_LABEL, shopKey } from "@/lib/summary";
import type { CategoryKind, Expense } from "@/lib/types";
import { cn, describeError } from "@/lib/utils";

type ShopFilter = "all" | string;
type KindFilter = "all" | CategoryKind;

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1.5 text-xs",
        active ? "border-primary bg-accent font-semibold text-accent-foreground" : "bg-card text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

export default function Expenses() {
  const { month, shops, categories, colors, shopName, dataVersion, openExpense } = useApp();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shopFilter, setShopFilter] = useState<ShopFilter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchExpenses(monthStart(month), monthEnd(month))
      .then((rows) => active && setExpenses(rows))
      .catch((err) => active && setError(describeError(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [month, dataVersion]);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const shopKeys = useMemo(() => {
    const present = new Set(expenses.map((e) => shopKey(e.shop_id)));
    const keys = shops.filter((s) => s.is_active || present.has(s.id)).map((s) => s.id);
    if (present.has(COMMON_KEY)) keys.push(COMMON_KEY);
    return keys;
  }, [expenses, shops]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return expenses.filter((e) => {
      if (shopFilter !== "all" && shopKey(e.shop_id) !== shopFilter) return false;
      const category = categoryById.get(e.category_id);
      if (kindFilter !== "all" && category?.kind !== kindFilter) return false;
      if (!q) return true;
      return [category?.name, e.vendor, e.description, String(e.amount)].some((v) => v?.toLowerCase().includes(q));
    });
  }, [expenses, shopFilter, kindFilter, query, categoryById]);

  const total = visible.reduce((sum, e) => sum + e.amount, 0);
  const byDate = useMemo(() => {
    const groups = new Map<string, Expense[]>();
    for (const e of visible) groups.set(e.expense_date, [...(groups.get(e.expense_date) ?? []), e]);
    return [...groups.entries()];
  }, [visible]);

  const exportCsv = () => {
    const rows = [...visible]
      .sort((a, b) => a.expense_date.localeCompare(b.expense_date))
      .map((e) => {
        const category = categoryById.get(e.category_id);
        return [
          e.expense_date,
          shopName(e.shop_id),
          category?.kind === "fixed" ? "固定費" : "変動費",
          category?.name ?? "",
          e.amount,
          PAYMENT_LABELS[e.payment_method],
          e.vendor,
          e.description,
          e.receipt_path ? "あり" : "",
        ];
      });
    downloadCsv(
      `経費_${month}${shopFilter === "all" ? "" : `_${shopName(shopFilter === COMMON_KEY ? null : shopFilter)}`}.csv`,
      toCsv([["日付", "店舗", "区分", "科目", "金額", "支払方法", "支払先", "メモ", "領収書"], ...rows]),
    );
  };

  return (
    <Layout title="経費" actions={<MonthSwitcher />}>
      <div className="space-y-3">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          <Chip active={shopFilter === "all"} onClick={() => setShopFilter("all")}>全店</Chip>
          {shopKeys.map((key) => (
            <Chip key={key} active={shopFilter === key} onClick={() => setShopFilter(key)}>
              <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: colors[key] }} />
              {key === COMMON_KEY ? COMMON_LABEL : shopName(key)}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5">
            {([["all", "すべて"], ["fixed", "固定費"], ["variable", "変動費"]] as const).map(([key, label]) => (
              <Chip key={key} active={kindFilter === key} onClick={() => setKindFilter(key)}>{label}</Chip>
            ))}
          </div>
          <div className="relative min-w-[160px] flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="科目・支払先・メモで検索" className="h-9 pl-8 text-sm" />
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!visible.length}>
            <Download /> CSV
          </Button>
        </div>

        <Card>
          <CardContent className="flex items-baseline justify-between py-3">
            <span className="text-sm text-muted-foreground">{visible.length}件</span>
            <span className="text-lg font-bold tabular">合計 {yen(total)}</span>
          </CardContent>
        </Card>

        {loading && !expenses.length ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
        ) : error ? (
          <p className="text-sm text-destructive">読み込めませんでした: {error}</p>
        ) : !visible.length ? (
          <div className="rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground">
            {expenses.length ? "条件に合う経費はありません" : "この月の経費はまだありません"}
            <div className="mt-3">
              <Button size="sm" onClick={() => openExpense()}>経費を入力する</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {byDate.map(([date, rows]) => (
              <section key={date}>
                <div className="mb-1.5 flex items-baseline justify-between px-1 text-xs text-muted-foreground">
                  <span className="font-semibold">{formatDay(date)}</span>
                  <span className="tabular">{yen(rows.reduce((s, e) => s + e.amount, 0))}</span>
                </div>
                <Card className="divide-y overflow-hidden">
                  {rows.map((e) => {
                    const category = categoryById.get(e.category_id);
                    const key = shopKey(e.shop_id);
                    return (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => openExpense(e)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
                      >
                        <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: colors[key] }} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-sm font-medium">
                            <span className="truncate">{category?.name ?? "（削除された科目）"}</span>
                            {e.template_id && <Repeat size={12} className="shrink-0 text-muted-foreground" aria-label="固定費" />}
                            {e.receipt_path && <Paperclip size={12} className="shrink-0 text-muted-foreground" aria-label="領収書あり" />}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {key === COMMON_KEY ? COMMON_LABEL : shopName(e.shop_id)}
                            {" ・ "}
                            {PAYMENT_LABELS[e.payment_method]}
                            {e.vendor ? ` ・ ${e.vendor}` : ""}
                            {e.description ? ` ・ ${e.description}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular">{yen(e.amount)}</span>
                      </button>
                    );
                  })}
                </Card>
              </section>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
