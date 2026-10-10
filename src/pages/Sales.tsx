import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useApp } from "@/hooks/useApp";
import { downloadCsv, toCsv } from "@/lib/csv";
import {
  defaultDateFor,
  formatDay,
  monthEnd,
  monthLabel,
  monthStart,
  parseAmount,
  recentMonths,
  shortMonthLabel,
  yen,
} from "@/lib/format";
import { fetchSales, fetchSalesEntries } from "@/lib/queries";
import { enteredAtLabel, groupEntriesByDate, totalsByShop } from "@/lib/salesEntries";
import { supabase } from "@/lib/supabase";
import type { MonthlySales, SalesEntry } from "@/lib/types";
import { describeError } from "@/lib/utils";

interface Form {
  date: string;
  shopId: string;
  amount: string;
  customers: string;
  note: string;
}

/**
 * 売上：日付と店舗を選んで1日ずつ入れる（salon_sales_entries）。いつの売上がいくらか一覧で見られる。
 * 月合計（salon_monthly_sales）はDBのトリガーが日ごとの売上から自動で足し上げ、ダッシュボード・利益はそれを使う。
 */
export default function Sales() {
  const { month, usableShops, colors, shopName } = useApp();
  const [entries, setEntries] = useState<SalesEntry[]>([]);
  const [history, setHistory] = useState<MonthlySales[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const months = useMemo(() => recentMonths(month, 6), [month]);
  const emptyForm = (shopId = usableShops[0]?.id ?? ""): Form => ({ date: defaultDateFor(month), shopId, amount: "", customers: "", note: "" });
  const [form, setForm] = useState<Form>(() => emptyForm());

  useEffect(() => {
    setForm((prev) => ({ ...emptyForm(prev.shopId || usableShops[0]?.id) }));
    setEditingId(null);
    // 月を切り替えたときだけ日付を入れ直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => {
    if (!form.shopId && usableShops[0]) setForm((prev) => ({ ...prev, shopId: usableShops[0].id }));
  }, [form.shopId, usableShops]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([fetchSalesEntries(monthStart(month), monthEnd(month)), fetchSales(months[0], month)])
      .then(([entryRows, monthly]) => {
        if (!active) return;
        setEntries(entryRows);
        setHistory(monthly);
      })
      .catch((error) => toast.error(`読み込めませんでした: ${describeError(error)}`))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [month, months, reloadKey]);

  const usableIds = useMemo(() => new Set(usableShops.map((shop) => shop.id)), [usableShops]);
  const visibleEntries = useMemo(() => entries.filter((entry) => usableIds.has(entry.shop_id)), [entries, usableIds]);
  const groups = useMemo(() => groupEntriesByDate(visibleEntries), [visibleEntries]);
  const totals = useMemo(() => totalsByShop(visibleEntries), [visibleEntries]);
  const monthTotal = visibleEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const historyOf = (shopId: string, key: string) => history.find((s) => s.shop_id === shopId && s.month.startsWith(key));

  const save = async () => {
    const amount = parseAmount(form.amount);
    const customers = form.customers.trim() ? parseAmount(form.customers) : null;
    if (!form.shopId) return toast.error("店舗を選んでください");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return toast.error("日付を選んでください");
    if (amount === null) return toast.error("売上の金額を入れてください");
    if (form.customers.trim() && customers === null) return toast.error("客数は数字で入れてください");
    setSaving(true);
    const values = { shop_id: form.shopId, sales_date: form.date, amount, customer_count: customers, note: form.note.trim() || null };
    const { error } = editingId
      ? await supabase.from("salon_sales_entries").update(values).eq("id", editingId)
      : await supabase.from("salon_sales_entries").insert(values);
    setSaving(false);
    if (error) return toast.error(`保存できませんでした: ${describeError(error)}`);
    toast.success(`${formatDay(form.date)} ${shopName(form.shopId)}の売上を${editingId ? "直しました" : "入れました"}`);
    setEditingId(null);
    setForm((prev) => ({ ...emptyForm(prev.shopId), date: prev.date }));
    setReloadKey((key) => key + 1);
  };

  const edit = (entry: SalesEntry) => {
    setEditingId(entry.id);
    setForm({
      date: entry.sales_date,
      shopId: entry.shop_id,
      amount: String(entry.amount),
      customers: entry.customer_count != null ? String(entry.customer_count) : "",
      note: entry.note ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (entry: SalesEntry) => {
    if (!window.confirm(`${formatDay(entry.sales_date)} ${shopName(entry.shop_id)} ${yen(entry.amount)} を消しますか？`)) return;
    const { error } = await supabase.from("salon_sales_entries").delete().eq("id", entry.id);
    if (error) return toast.error(`消せませんでした: ${describeError(error)}`);
    if (editingId === entry.id) {
      setEditingId(null);
      setForm((prev) => emptyForm(prev.shopId));
    }
    setReloadKey((key) => key + 1);
  };

  const exportCsv = () => {
    const rows = [...visibleEntries]
      .sort((a, b) => a.sales_date.localeCompare(b.sales_date) || a.created_at.localeCompare(b.created_at))
      .map((entry) => [entry.sales_date, shopName(entry.shop_id), entry.amount, entry.customer_count, entry.note, enteredAtLabel(entry.created_at)]);
    downloadCsv(`売上_${month}.csv`, toCsv([["日付", "店舗", "売上", "客数", "メモ", "入力日時"], ...rows]));
  };

  return (
    <Layout title="売上" actions={<MonthSwitcher />}>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? "売上を直す" : "売上を入れる"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="sales-date">日付</Label>
                  <Input id="sales-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="sales-shop">店舗</Label>
                  <select
                    id="sales-shop"
                    value={form.shopId}
                    onChange={(e) => setForm({ ...form, shopId: e.target.value })}
                    className="flex h-11 w-full rounded-lg border border-input bg-card px-3 text-base md:h-10 md:text-sm"
                  >
                    {usableShops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor="sales-amount">売上（円・税込）</Label>
                <Input id="sales-amount" inputMode="numeric" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="text-lg font-semibold tabular" placeholder="例: 42000" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="sales-customers">客数（任意）</Label>
                  <Input id="sales-customers" inputMode="numeric" value={form.customers} onChange={(e) => setForm({ ...form, customers: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="sales-note">メモ</Label>
                  <Input id="sales-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={saving || !usableShops.length}>
                  {saving && <Loader2 className="animate-spin" />}{editingId ? "直す" : "入れる"}
                </Button>
                {editingId && (
                  <Button type="button" variant="ghost" onClick={() => { setEditingId(null); setForm((prev) => emptyForm(prev.shopId)); }}>
                    やめる
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                日付ごとに入れた売上は、その月の合計に自動で足されます（ダッシュボード・利益に反映）。同じ日に何回入れてもOKです。
              </p>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-3 md:grid-cols-3">
          {usableShops.map((shop) => {
            const total = totals.get(shop.id);
            const monthly = historyOf(shop.id, month);
            return (
              <Card key={shop.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[shop.id] }} />
                    {shop.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xl font-bold tabular">{yen(total?.amount ?? monthly?.amount ?? 0)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {total
                      ? `${monthLabel(month)}・${total.days}日分${total.customers != null ? `・${total.customers}人` : ""}`
                      : monthly && monthly.amount > 0
                        ? "月の合計で入力済み（日付なし）。日付ごとに入れると、日付ごとの合計に置き換わります"
                        : `${monthLabel(month)}はまだありません`}
                  </p>
                  <table className="w-full text-xs tabular">
                    <caption className="mb-1 text-left text-muted-foreground">直近6か月</caption>
                    <tbody>
                      {months.map((key) => (
                        <tr key={key} className="border-t">
                          <td className="py-1 text-muted-foreground">{shortMonthLabel(key)}</td>
                          <td className="py-1 text-right">{historyOf(shop.id, key) ? yen(historyOf(shop.id, key)!.amount) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">{monthLabel(month)}の売上（日付ごと）</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold tabular">合計 {yen(monthTotal)}</span>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!visibleEntries.length}>
              <Download /> CSV
            </Button>
          </div>
        </div>

        {loading && !entries.length ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
        ) : !groups.length ? (
          <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
            この月の日付ごとの売上はまだありません
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <section key={group.date}>
                <div className="mb-1.5 flex items-baseline justify-between px-1 text-xs text-muted-foreground">
                  <span className="font-semibold">{formatDay(group.date)}</span>
                  <span className="tabular">{yen(group.amount)}</span>
                </div>
                <Card className="divide-y overflow-hidden">
                  {group.rows.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: colors[entry.shop_id] }} aria-hidden />
                      <button type="button" onClick={() => edit(entry)} className="min-w-0 flex-1 text-left">
                        <span className="block text-sm font-medium">{shopName(entry.shop_id)}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {entry.customer_count != null ? `${entry.customer_count}人 ・ ` : ""}
                          {entry.note ? `${entry.note} ・ ` : ""}
                          入力 {enteredAtLabel(entry.created_at)}
                        </span>
                      </button>
                      <span className="shrink-0 text-sm font-semibold tabular">{yen(entry.amount)}</span>
                      <Button type="button" variant="ghost" size="icon" onClick={() => void remove(entry)} aria-label="この売上を消す">
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  ))}
                </Card>
              </section>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
