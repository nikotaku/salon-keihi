import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, NavLink, useParams } from "react-router-dom";
import { AlertCircle, ArrowDownRight, ArrowUpRight, CalendarCheck, Loader2, Paperclip, Plus, Repeat } from "lucide-react";
import { Layout } from "@/components/Layout";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { CategoryBars } from "@/components/charts/CategoryBars";
import { ShopTrendChart } from "@/components/charts/ShopTrendChart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApp } from "@/hooks/useApp";
import { formatDay, monthEnd, monthLabel, monthStart, PAYMENT_LABELS, percent, recentMonths, shiftMonth, yen } from "@/lib/format";
import { PAYMENT_KIND_LABELS, PAYMENT_STATUS_LABELS, paymentStatus, sortPayments, summarizePayments, todayInTokyo } from "@/lib/payments";
import { fetchExpenses, fetchPayments, fetchSales, fetchSalesEntries, fetchStaff, fetchStaffSalesEntries } from "@/lib/queries";
import { totalsByStaff } from "@/lib/salesEntries";
import { changeRatio, shopTrend, summarizeShopMonth, tint, TINT_BORDER, TINT_CARD, TINT_ROW } from "@/lib/summary";
import type { Expense, MonthlySales, Payment, SalesEntry, Staff, StaffSalesEntry } from "@/lib/types";
import { cn, describeError } from "@/lib/utils";

const TREND_MONTHS = 6;
const EXPENSE_PREVIEW = 8;

function Delta({ ratio, upIsGood }: { ratio: number | null; upIsGood: boolean }) {
  if (ratio === null) return <span className="text-xs text-muted-foreground">前月比 —</span>;
  const up = ratio >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", up === upIsGood ? "text-good" : "text-destructive")}>
      <Icon size={13} />
      前月比 {up ? "+" : ""}
      {percent(ratio)}
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-muted text-muted-foreground",
  overdue: "bg-red-100 text-red-800",
  due_soon: "bg-amber-100 text-amber-800",
  unpaid: "bg-sky-100 text-sky-800",
};

// 店舗ごとのページ：その店舗の売上・経費・利益をまとめて見る
export default function ShopPage() {
  const { shopId = "" } = useParams();
  const { month, shops, categories, colors, dataVersion, usableShops, isOwner, openExpense } = useApp();

  // オーナーはすべての店舗（休止中を除く）、スタッフは担当の店舗だけ
  const pageShops = isOwner ? shops.filter((s) => s.is_active || s.id === shopId) : usableShops;
  const shop = pageShops.find((s) => s.id === shopId);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [sales, setSales] = useState<MonthlySales[]>([]);
  const [entries, setEntries] = useState<SalesEntry[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [staffEntries, setStaffEntries] = useState<StaffSalesEntry[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const months = useMemo(() => recentMonths(month, TREND_MONTHS), [month]);

  useEffect(() => {
    if (!shop) return;
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchExpenses(monthStart(months[0]), monthEnd(month)),
      fetchSales(months[0], month),
      fetchSalesEntries(monthStart(month), monthEnd(month)),
      fetchStaff(),
      fetchStaffSalesEntries(monthStart(month), monthEnd(month)),
      fetchPayments(month),
    ])
      .then(([e, s, se, st, sse, p]) => {
        if (!active) return;
        setExpenses(e.filter((x) => x.shop_id === shop.id));
        setSales(s.filter((x) => x.shop_id === shop.id));
        setEntries(se.filter((x) => x.shop_id === shop.id));
        setStaff(st);
        setStaffEntries(sse.filter((x) => x.shop_id === shop.id));
        setPayments(p.filter((x) => x.shop_id === shop.id));
      })
      .catch((err) => active && setError(describeError(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [shop, month, months, dataVersion]);

  const now = useMemo(
    () => (shop ? summarizeShopMonth({ shopId: shop.id, month, categories, expenses, sales }) : null),
    [shop, month, categories, expenses, sales],
  );
  const prev = useMemo(
    () => (shop ? summarizeShopMonth({ shopId: shop.id, month: shiftMonth(month, -1), categories, expenses, sales }) : null),
    [shop, month, categories, expenses, sales],
  );
  const trend = useMemo(() => (shop ? shopTrend({ shopId: shop.id, months, expenses, sales }) : []), [shop, months, expenses, sales]);
  const monthExpenses = useMemo(() => expenses.filter((e) => e.expense_date.startsWith(`${month}-`)), [expenses, month]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const staffTotals = useMemo(() => totalsByStaff(staffEntries), [staffEntries]);
  const today = todayInTokyo();
  const sortedPayments = useMemo(() => sortPayments(payments), [payments]);
  const paySummary = useMemo(() => summarizePayments(payments, today), [payments, today]);
  const dailySales = useMemo(() => {
    const byDay = new Map<string, { amount: number; customers: number | null }>();
    for (const e of entries) {
      const cur = byDay.get(e.sales_date) ?? { amount: 0, customers: null };
      cur.amount += e.amount;
      if (e.customer_count != null) cur.customers = (cur.customers ?? 0) + e.customer_count;
      byDay.set(e.sales_date, cur);
    }
    return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [entries]);

  if (!shop) {
    const first = pageShops[0];
    return first ? <Navigate to={`/shops/${first.id}`} replace /> : <Navigate to="/" replace />;
  }

  const color = colors[shop.id];
  const hasAnything = expenses.length > 0 || sales.length > 0 || entries.length > 0;

  return (
    <Layout title={shop.name} actions={<MonthSwitcher />}>
      <div className="space-y-4">
        {/* 店舗の切り替え */}
        {pageShops.length > 1 && (
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
            {pageShops.map((s) => (
              <NavLink
                key={s.id}
                to={`/shops/${s.id}`}
                style={({ isActive }) => ({ background: tint(colors[s.id], isActive ? 0.22 : TINT_ROW), borderColor: isActive ? colors[s.id] : tint(colors[s.id], TINT_BORDER) })}
                className={({ isActive }) =>
                  cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs",
                    isActive ? "border-primary bg-accent font-semibold text-accent-foreground" : "bg-card text-muted-foreground",
                  )
                }
              >
                <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: colors[s.id] }} />
                {s.name}
              </NavLink>
            ))}
          </div>
        )}

        {loading && !hasAnything ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary" /></div>
        ) : error ? (
          <Card><CardContent className="text-sm text-destructive">読み込めませんでした: {error}</CardContent></Card>
        ) : now && prev && (
          <>
            {now.sales === null && (
              <Link to={`/sales?shop=${shop.id}`} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm">
                <AlertCircle size={18} className="shrink-0 text-muted-foreground" />
                <span className="flex-1">{monthLabel(month)}の売上がまだ入っていません</span>
                <span className="shrink-0 text-xs font-semibold text-primary">入力する →</span>
              </Link>
            )}

            <Card className="overflow-hidden" style={{ background: tint(color, TINT_CARD), borderColor: tint(color, TINT_BORDER) }}>
              <div className="h-1" style={{ background: color }} aria-hidden />
              <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr] sm:items-end">
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-xs text-muted-foreground">{monthLabel(month)}の利益</p>
                  <p className={cn("mt-1 text-4xl font-bold tracking-tight md:text-5xl", now.profit !== null && now.profit < 0 && "text-destructive")}>
                    {now.profit === null ? "—" : yen(now.profit)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">利益率 {percent(now.margin)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">売上</p>
                  <p className="mt-1 text-xl font-semibold">{now.sales === null ? <span className="text-muted-foreground">未入力</span> : yen(now.sales)}</p>
                  <Delta ratio={now.sales !== null && prev.sales !== null ? changeRatio(now.sales, prev.sales) : null} upIsGood />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">経費</p>
                  <p className="mt-1 text-xl font-semibold">{yen(now.expenses)}</p>
                  <Delta ratio={changeRatio(now.expenses, prev.expenses)} upIsGood={false} />
                </div>
                <dl className="col-span-2 grid grid-cols-2 gap-x-6 gap-y-1 border-t pt-3 text-sm sm:col-span-1 sm:block sm:space-y-1 sm:border-0 sm:pt-0">
                  <div className="flex items-baseline justify-between gap-2"><dt className="text-xs text-muted-foreground">客数</dt><dd className="font-semibold tabular">{now.customers == null ? "—" : `${now.customers.toLocaleString("ja-JP")}人`}</dd></div>
                  <div className="flex items-baseline justify-between gap-2"><dt className="text-xs text-muted-foreground">客単価</dt><dd className="font-semibold tabular">{now.perCustomer === null ? "—" : yen(now.perCustomer)}</dd></div>
                  <div className="flex items-baseline justify-between gap-2"><dt className="text-xs text-muted-foreground">固定費</dt><dd className="font-semibold tabular">{yen(now.byKind.fixed)}</dd></div>
                  <div className="flex items-baseline justify-between gap-2"><dt className="text-xs text-muted-foreground">変動費</dt><dd className="font-semibold tabular">{yen(now.byKind.variable)}</dd></div>
                </dl>
              </CardContent>
            </Card>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => openExpense(null, shop.id)}><Plus /> この店舗の経費を入力</Button>
              <Button size="sm" variant="outline" asChild><Link to={`/sales?shop=${shop.id}`}>売上を入力</Link></Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-5">
              <Card className="lg:col-span-3">
                <CardHeader><CardTitle>売上と経費（直近6か月）</CardTitle></CardHeader>
                <CardContent><ShopTrendChart trend={trend} color={color} /></CardContent>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle>科目別の経費（{monthLabel(month)}）</CardTitle></CardHeader>
                <CardContent><CategoryBars rows={now.byCategory} total={now.expenses} /></CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>日別の売上</CardTitle>
                  <Link to={`/sales?shop=${shop.id}`} className="text-xs text-primary">入力・修正 →</Link>
                </CardHeader>
                <CardContent>
                  {dailySales.length ? (
                    <table className="w-full text-sm tabular">
                      <tbody>
                        {dailySales.map(([date, d]) => (
                          <tr key={date} className="border-b last:border-0">
                            <td className="py-1.5">{formatDay(date)}</td>
                            <td className="py-1.5 text-right text-xs text-muted-foreground">{d.customers == null ? "" : `${d.customers}人`}</td>
                            <td className="py-1.5 pl-3 text-right font-semibold">{yen(d.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      {now.sales !== null ? `日別の入力はありません（月の合計 ${yen(now.sales)} が入っています）` : "この月の売上はまだありません"}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>スタッフ別の売上</CardTitle>
                  <Link to={`/sales?shop=${shop.id}&tab=staff`} className="text-xs text-primary">入力 →</Link>
                </CardHeader>
                <CardContent>
                  {staffTotals.length ? (
                    <table className="w-full text-sm tabular">
                      <thead className="text-xs text-muted-foreground">
                        <tr className="border-b"><th className="py-1 text-left font-medium">スタッフ</th><th className="py-1 text-right font-medium">出勤</th><th className="py-1 text-right font-medium">客数</th><th className="py-1 text-right font-medium">売上</th></tr>
                      </thead>
                      <tbody>
                        {staffTotals.map((t) => (
                          <tr key={t.staffId} className="border-b last:border-0">
                            <td className="py-1.5">{staffById.get(t.staffId)?.name ?? "（削除されたスタッフ）"}</td>
                            <td className="py-1.5 text-right text-xs text-muted-foreground">{t.days}日</td>
                            <td className="py-1.5 text-right text-xs text-muted-foreground">{t.customers == null ? "—" : `${t.customers}人`}</td>
                            <td className="py-1.5 pl-3 text-right font-semibold">{yen(t.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="py-4 text-center text-sm text-muted-foreground">この月のスタッフ別の売上はまだありません</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>経費の明細（{monthExpenses.length}件）</CardTitle>
                  <Link to={`/expenses?shop=${shop.id}`} className="text-xs text-primary">すべて見る →</Link>
                </CardHeader>
                <CardContent className="p-0">
                  {monthExpenses.length ? (
                    <div className="divide-y">
                      {monthExpenses.slice(0, EXPENSE_PREVIEW).map((e) => {
                        const category = categoryById.get(e.category_id);
                        return (
                          <button key={e.id} type="button" onClick={() => openExpense(e)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50">
                            <span className="w-14 shrink-0 text-xs text-muted-foreground tabular">{formatDay(e.expense_date)}</span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5 text-sm">
                                <span className="truncate">{category?.name ?? "（削除された科目）"}</span>
                                {e.template_id && <Repeat size={12} className="shrink-0 text-muted-foreground" aria-label="固定費" />}
                                {e.receipt_path && <Paperclip size={12} className="shrink-0 text-muted-foreground" aria-label="領収書あり" />}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {PAYMENT_LABELS[e.payment_method]}{e.vendor ? ` ・ ${e.vendor}` : ""}{e.description ? ` ・ ${e.description}` : ""}
                              </span>
                            </span>
                            <span className="shrink-0 text-sm font-semibold tabular">{yen(e.amount)}</span>
                          </button>
                        );
                      })}
                      {monthExpenses.length > EXPENSE_PREVIEW && (
                        <Link to={`/expenses?shop=${shop.id}`} className="block px-4 py-2.5 text-center text-xs text-primary">ほか{monthExpenses.length - EXPENSE_PREVIEW}件を見る</Link>
                      )}
                    </div>
                  ) : (
                    <p className="px-4 py-6 text-center text-sm text-muted-foreground">この月の経費はまだありません</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>月末の支払い</CardTitle>
                  <Link to="/payments" className="text-xs text-primary">支払い管理 →</Link>
                </CardHeader>
                <CardContent>
                  {payments.length ? (
                    <>
                      <p className="mb-2 text-xs text-muted-foreground">
                        合計 <span className="font-semibold text-foreground tabular">{yen(paySummary.total)}</span>
                        {" ・ "}残り <span className="font-semibold text-foreground tabular">{yen(paySummary.remaining)}</span>
                        {paySummary.overdueCount > 0 && <span className="ml-1 font-semibold text-destructive">（期日切れ{paySummary.overdueCount}件）</span>}
                      </p>
                      <ul className="divide-y text-sm">
                        {sortedPayments.map((p) => {
                          const st = paymentStatus(p, today);
                          return (
                            <li key={p.id} className="flex items-center gap-2 py-2">
                              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_STYLE[st])}>{PAYMENT_STATUS_LABELS[st]}</span>
                              <span className="min-w-0 flex-1 truncate">
                                {p.payee}
                                <span className="ml-1 text-xs text-muted-foreground">{PAYMENT_KIND_LABELS[p.method]}{p.due_date ? ` ・ 期日 ${formatDay(p.due_date)}` : ""}</span>
                              </span>
                              <span className="shrink-0 font-semibold tabular">{yen(p.amount)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : (
                    <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><CalendarCheck size={16} />この月の支払いは登録されていません</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
