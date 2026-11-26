import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowDownRight, ArrowUpRight, ChevronRight, Loader2, Repeat } from "lucide-react";
import { Layout } from "@/components/Layout";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { CategoryBars } from "@/components/charts/CategoryBars";
import { MonthlyExpenseChart } from "@/components/charts/MonthlyExpenseChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApp } from "@/hooks/useApp";
import { monthEnd, monthLabel, monthStart, percent, recentMonths, shiftMonth, yen } from "@/lib/format";
import { fetchExpenses, fetchPostedTemplateIds, fetchSales, fetchTemplates } from "@/lib/queries";
import { changeRatio, COMMON_KEY, COMMON_LABEL, monthlyTrend, summarizeMonth } from "@/lib/summary";
import type { Expense, ExpenseTemplate, MonthlySales } from "@/lib/types";
import { cn, describeError } from "@/lib/utils";

const TREND_MONTHS = 6;

function Delta({ ratio, upIsGood }: { ratio: number | null; upIsGood: boolean }) {
  if (ratio === null) return <span className="text-xs text-muted-foreground">前月比 —</span>;
  const up = ratio >= 0;
  const good = up === upIsGood;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", good ? "text-good" : "text-destructive")}>
      <Icon size={13} />
      前月比 {up ? "+" : ""}
      {percent(ratio)}
    </span>
  );
}

export default function Dashboard() {
  const { month, shops, categories, colors, dataVersion, usableShops } = useApp();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [sales, setSales] = useState<MonthlySales[]>([]);
  const [templates, setTemplates] = useState<ExpenseTemplate[]>([]);
  const [posted, setPosted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const months = useMemo(() => recentMonths(month, TREND_MONTHS), [month]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchExpenses(monthStart(months[0]), monthEnd(month)),
      fetchSales(months[0], month),
      fetchTemplates(),
      fetchPostedTemplateIds(month),
    ])
      .then(([e, s, t, p]) => {
        if (!active) return;
        setExpenses(e);
        setSales(s);
        setTemplates(t);
        setPosted(p);
      })
      .catch((err) => active && setError(describeError(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [month, months, dataVersion]);

  const summary = useMemo(() => summarizeMonth({ month, shops, categories, expenses, sales }), [month, shops, categories, expenses, sales]);
  const previous = useMemo(
    () => summarizeMonth({ month: shiftMonth(month, -1), shops, categories, expenses, sales }),
    [month, shops, categories, expenses, sales],
  );
  const trend = useMemo(() => monthlyTrend({ months, expenses, sales }), [months, expenses, sales]);

  // グラフの系列：店舗（並び順）＋ 全店共通（あれば）
  const series = useMemo(() => {
    const keys = new Set(trend.flatMap((p) => Object.keys(p.byShop)));
    const list = shops
      .filter((shop) => shop.is_active || keys.has(shop.id))
      .map((shop) => ({ key: shop.id, label: shop.name, color: colors[shop.id] }));
    if (keys.has(COMMON_KEY)) list.push({ key: COMMON_KEY, label: COMMON_LABEL, color: colors[COMMON_KEY] });
    return list;
  }, [trend, shops, colors]);

  const unposted = templates.filter((t) => t.is_active && !posted.has(t.id));
  const hasAnything = expenses.length > 0 || sales.length > 0;

  return (
    <Layout title="ホーム" actions={<MonthSwitcher />}>
      {loading && !hasAnything ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>
      ) : error ? (
        <Card><CardContent className="text-sm text-destructive">読み込めませんでした: {error}</CardContent></Card>
      ) : (
        <div className="space-y-5">
          {(unposted.length > 0 || summary.total.salesMissing.length > 0) && (
            <div className="space-y-2">
              {unposted.length > 0 && (
                <Link to="/fixed" className="flex items-center gap-3 rounded-2xl bg-accent px-4 py-3 text-[13px] text-accent-foreground">
                  <Repeat size={17} className="shrink-0" />
                  <span className="flex-1">
                    {monthLabel(month)}の固定費が <strong>{unposted.length}件</strong> まだ計上されていません
                  </span>
                  <span className="shrink-0 text-xs font-semibold">計上する ›</span>
                </Link>
              )}
              {summary.total.salesMissing.length > 0 && usableShops.length > 0 && (
                <Link to="/sales" className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-[13px]">
                  <AlertCircle size={17} className="shrink-0 text-gold" />
                  <span className="flex-1">
                    売上が未入力: {summary.total.salesMissing.join("・")}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-primary">入力する ›</span>
                </Link>
              )}
            </div>
          )}

          <section>
            <h2 className="mb-2.5 mt-2 px-1 font-serif text-[15px] font-semibold tracking-widest">店舗ごと</h2>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {summary.shops.map((row) => (
                <Link
                  key={row.key}
                  to={`/shops/${row.key}`}
                  className="flex items-center gap-3.5 rounded-2xl border border-border/70 bg-card px-4 py-3.5 shadow-[0_1px_2px_rgba(60,40,30,0.04)] transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl font-serif text-sm font-semibold text-white"
                    style={{ background: colors[row.key] }}
                    aria-hidden
                  >
                    {row.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{row.name}</span>
                    <span className="block truncate text-[11px] text-muted-foreground tabular">
                      売上 {row.sales === null ? "未入力" : yen(row.sales)} ・ 経費 {yen(row.expenses)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={cn("num block text-lg font-medium", row.profit !== null && row.profit < 0 && "text-destructive")}>
                      {row.profit === null ? "—" : yen(row.profit)}
                    </span>
                    <span className="text-[10.5px] text-muted-foreground">利益{row.margin !== null ? ` ${percent(row.margin)}` : ""}</span>
                  </span>
                  <ChevronRight size={16} className="-ml-1 shrink-0 text-muted-foreground/50" />
                </Link>
              ))}
            </div>
            {summary.common > 0 && (
              <p className="mt-2 px-1 text-xs text-muted-foreground">
                ほかに{COMMON_LABEL}の経費 {yen(summary.common)}（店舗ごとの利益には含めず、全店の利益からだけ引いています）
              </p>
            )}
          </section>

          <section>
            <h2 className="mb-2.5 mt-2 px-1 font-serif text-[15px] font-semibold tracking-widest">全店の合計</h2>
            <Card>
              <CardContent className="grid gap-0 md:grid-cols-[1fr_1fr_1.4fr] md:items-stretch">
                <div className="grid grid-cols-2 md:contents">
                  <div className="pb-4 md:pb-0 md:pr-5">
                    <p className="text-[11px] tracking-wider text-muted-foreground">売上</p>
                    <p className="num mt-1 text-[22px] font-medium md:text-[28px]">{yen(summary.total.sales)}</p>
                    <Delta ratio={changeRatio(summary.total.sales, previous.total.sales)} upIsGood />
                  </div>
                  <div className="border-l pb-4 pl-4 md:pb-0 md:pl-5 md:pr-5">
                    <p className="text-[11px] tracking-wider text-muted-foreground">経費</p>
                    <p className="num mt-1 text-[22px] font-medium md:text-[28px]">{yen(summary.total.expenses)}</p>
                    <Delta ratio={changeRatio(summary.total.expenses, previous.total.expenses)} upIsGood={false} />
                  </div>
                </div>
                <div className="border-t pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                  <p className="text-[11px] tracking-[0.12em] text-muted-foreground">{monthLabel(month)}の利益（全店）</p>
                  <p className={cn("num mt-1 text-[44px] font-medium leading-tight md:text-5xl", summary.total.profit < 0 && "text-destructive")}>
                    {yen(summary.total.profit)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    利益率 {percent(summary.total.margin)} ・ 固定費 {yen(summary.byKind.fixed)} ・ 変動費 {yen(summary.byKind.variable)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>月別の経費（直近6か月）</CardTitle>
              </CardHeader>
              <CardContent>
                <MonthlyExpenseChart trend={trend} series={series} />
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>科目別の経費（{monthLabel(month)}）</CardTitle>
                <Link to="/expenses" className="text-xs text-primary">明細 →</Link>
              </CardHeader>
              <CardContent>
                <CategoryBars rows={summary.byCategory} total={summary.total.expenses} />
              </CardContent>
            </Card>
          </div>

          {!hasAnything && (
            <Card>
              <CardContent className="space-y-3 text-sm">
                <p className="font-semibold">はじめに</p>
                <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                  <li>「設定」で店舗名と科目を確認する</li>
                  <li>「固定費」に家賃などの毎月の支払いを登録して、今月分を計上する</li>
                  <li>レシートが出たら「経費」の画面の「＋ 経費を入力」から入力する（写真も付けられます）</li>
                  <li>月末に「売上」へ各店舗の売上を入れると、利益が出ます</li>
                </ol>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm"><Link to="/fixed">固定費を登録する</Link></Button>
                  <Button asChild variant="outline" size="sm"><Link to="/settings">設定を開く</Link></Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </Layout>
  );
}
