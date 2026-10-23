import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useApp } from "@/hooks/useApp";
import { downloadCsv, toCsv } from "@/lib/csv";
import { defaultDateFor, formatDay, monthEnd, monthLabel, monthStart, parseAmount, yen } from "@/lib/format";
import { fetchStaff, fetchStaffSalesEntries } from "@/lib/queries";
import { enteredAtLabel, groupEntriesByDate, totalsByStaff } from "@/lib/salesEntries";
import { supabase } from "@/lib/supabase";
import type { Staff, StaffSalesEntry } from "@/lib/types";
import { describeError } from "@/lib/utils";

interface Form {
  date: string;
  shopId: string;
  staffId: string;
  amount: string;
  customers: string;
  note: string;
}

const selectClass = "flex h-11 w-full rounded-lg border border-input bg-card px-3 text-base md:h-10 md:text-sm";

/**
 * 個人の売上：日付・店舗・スタッフを選んで入れる（salon_staff_sales_entries）。
 * 店舗の売上とは別に入れる内訳なので、店舗の合計・利益・ダッシュボードには入らない。
 */
export function StaffSales() {
  const { month, usableShops, colors, shopName, isOwner } = useApp();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [entries, setEntries] = useState<StaffSalesEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const activeStaffOf = (shopId: string) => staff.filter((s) => s.shop_id === shopId && s.is_active);
  const emptyForm = (shopId = usableShops[0]?.id ?? "", staffId = ""): Form => ({
    date: defaultDateFor(month),
    shopId,
    staffId,
    amount: "",
    customers: "",
    note: "",
  });
  const [form, setForm] = useState<Form>(() => emptyForm());

  useEffect(() => {
    setForm((prev) => emptyForm(prev.shopId || usableShops[0]?.id, prev.staffId));
    setEditingId(null);
    // 月を切り替えたときだけ日付を入れ直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  useEffect(() => {
    if (!form.shopId && usableShops[0]) setForm((prev) => ({ ...prev, shopId: usableShops[0].id }));
  }, [form.shopId, usableShops]);

  // 店舗を変えたら、その店舗のスタッフを選び直す
  useEffect(() => {
    if (editingId) return;
    const list = staff.filter((s) => s.shop_id === form.shopId && s.is_active);
    if (!list.some((s) => s.id === form.staffId)) setForm((prev) => ({ ...prev, staffId: list[0]?.id ?? "" }));
  }, [form.shopId, form.staffId, staff, editingId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([fetchStaff(), fetchStaffSalesEntries(monthStart(month), monthEnd(month))])
      .then(([staffRows, entryRows]) => {
        if (!active) return;
        setStaff(staffRows);
        setEntries(entryRows);
      })
      .catch((error) => toast.error(`読み込めませんでした: ${describeError(error)}`))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [month, reloadKey]);

  const staffName = (id: string) => staff.find((s) => s.id === id)?.name ?? "（不明なスタッフ）";
  const usableIds = useMemo(() => new Set(usableShops.map((shop) => shop.id)), [usableShops]);
  const visibleEntries = useMemo(() => entries.filter((entry) => usableIds.has(entry.shop_id)), [entries, usableIds]);
  const groups = useMemo(() => groupEntriesByDate(visibleEntries), [visibleEntries]);
  const totals = useMemo(() => totalsByStaff(visibleEntries), [visibleEntries]);
  const monthTotal = visibleEntries.reduce((sum, entry) => sum + entry.amount, 0);

  // 編集中のスタッフが辞めていても選べるように残す
  const staffOptions = staff.filter((s) => s.shop_id === form.shopId && (s.is_active || s.id === form.staffId));

  const save = async () => {
    const amount = parseAmount(form.amount);
    const customers = form.customers.trim() ? parseAmount(form.customers) : null;
    if (!form.shopId) return toast.error("店舗を選んでください");
    if (!form.staffId) return toast.error("スタッフを選んでください");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return toast.error("日付を選んでください");
    if (amount === null) return toast.error("売上の金額を入れてください");
    if (form.customers.trim() && customers === null) return toast.error("客数は数字で入れてください");
    setSaving(true);
    const values = {
      shop_id: form.shopId,
      staff_id: form.staffId,
      sales_date: form.date,
      amount,
      customer_count: customers,
      note: form.note.trim() || null,
    };
    const { error } = editingId
      ? await supabase.from("salon_staff_sales_entries").update(values).eq("id", editingId)
      : await supabase.from("salon_staff_sales_entries").insert(values);
    setSaving(false);
    if (error) return toast.error(`保存できませんでした: ${describeError(error)}`);
    toast.success(`${formatDay(form.date)} ${staffName(form.staffId)}さんの売上を${editingId ? "直しました" : "入れました"}`);
    setEditingId(null);
    setForm((prev) => ({ ...emptyForm(prev.shopId, prev.staffId), date: prev.date }));
    setReloadKey((key) => key + 1);
  };

  const edit = (entry: StaffSalesEntry) => {
    setEditingId(entry.id);
    setForm({
      date: entry.sales_date,
      shopId: entry.shop_id,
      staffId: entry.staff_id,
      amount: String(entry.amount),
      customers: entry.customer_count != null ? String(entry.customer_count) : "",
      note: entry.note ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm((prev) => emptyForm(prev.shopId, prev.staffId));
  };

  const remove = async (entry: StaffSalesEntry) => {
    if (!window.confirm(`${formatDay(entry.sales_date)} ${staffName(entry.staff_id)}さん ${yen(entry.amount)} を消しますか？`)) return;
    const { error } = await supabase.from("salon_staff_sales_entries").delete().eq("id", entry.id);
    if (error) return toast.error(`消せませんでした: ${describeError(error)}`);
    if (editingId === entry.id) cancelEdit();
    setReloadKey((key) => key + 1);
  };

  const exportCsv = () => {
    const rows = [...visibleEntries]
      .sort((a, b) => a.sales_date.localeCompare(b.sales_date) || a.created_at.localeCompare(b.created_at))
      .map((entry) => [
        entry.sales_date,
        shopName(entry.shop_id),
        staffName(entry.staff_id),
        entry.amount,
        entry.customer_count,
        entry.note,
        enteredAtLabel(entry.created_at),
      ]);
    downloadCsv(`個人売上_${month}.csv`, toCsv([["日付", "店舗", "スタッフ", "売上", "客数", "メモ", "入力日時"], ...rows]));
  };

  const noStaffYet = !loading && usableShops.every((shop) => !activeStaffOf(shop.id).length);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{editingId ? "個人の売上を直す" : "個人の売上を入れる"}</CardTitle>
        </CardHeader>
        <CardContent>
          {noStaffYet ? (
            <p className="text-sm text-muted-foreground">
              まだスタッフが登録されていません。
              {isOwner ? (
                <>
                  <Link to="/settings" className="font-medium text-primary underline">設定 → スタッフ</Link>で店舗ごとにスタッフ名を登録してください。
                </>
              ) : (
                "オーナーに「設定 → スタッフ」で登録してもらってください。"
              )}
            </p>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="staff-sales-date">日付</Label>
                  <Input id="staff-sales-date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="staff-sales-shop">店舗</Label>
                  <select
                    id="staff-sales-shop"
                    value={form.shopId}
                    onChange={(e) => setForm({ ...form, shopId: e.target.value, staffId: "" })}
                    className={selectClass}
                  >
                    {usableShops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor="staff-sales-staff">スタッフ</Label>
                {staffOptions.length ? (
                  <select id="staff-sales-staff" value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })} className={selectClass}>
                    {staffOptions.map((person) => (
                      <option key={person.id} value={person.id}>{person.name}{person.is_active ? "" : "（退職）"}</option>
                    ))}
                  </select>
                ) : (
                  <p className="py-2 text-sm text-muted-foreground">この店舗にはスタッフが登録されていません</p>
                )}
              </div>
              <div>
                <Label htmlFor="staff-sales-amount">売上（円・税込）</Label>
                <Input
                  id="staff-sales-amount"
                  inputMode="numeric"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  className="text-lg font-semibold tabular"
                  placeholder="例: 18000"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="staff-sales-customers">客数（任意）</Label>
                  <Input id="staff-sales-customers" inputMode="numeric" value={form.customers} onChange={(e) => setForm({ ...form, customers: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="staff-sales-note">メモ</Label>
                  <Input id="staff-sales-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={saving || !form.staffId}>
                  {saving && <Loader2 className="animate-spin" />}{editingId ? "直す" : "入れる"}
                </Button>
                {editingId && (
                  <Button type="button" variant="ghost" onClick={cancelEdit}>
                    やめる
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                個人の売上は店舗の売上とは別に記録されます（店舗の合計・利益・ダッシュボードには入りません）。同じ日に何回入れてもOKです。
              </p>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{monthLabel(month)}の個人別合計</CardTitle>
        </CardHeader>
        <CardContent>
          {!totals.length ? (
            <p className="text-sm text-muted-foreground">{loading ? "読み込み中…" : "この月の個人の売上はまだありません"}</p>
          ) : (
            <div className="space-y-4">
              {usableShops
                .filter((shop) => totals.some((t) => t.shopId === shop.id))
                .map((shop) => {
                  const rows = totals.filter((t) => t.shopId === shop.id);
                  const shopTotal = rows.reduce((sum, row) => sum + row.amount, 0);
                  return (
                    <div key={shop.id}>
                      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-2 font-semibold">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[shop.id] }} />
                          {shop.name}
                        </span>
                        <span className="tabular">計 {yen(shopTotal)}</span>
                      </div>
                      <table className="w-full text-sm tabular">
                        <tbody>
                          {rows.map((row) => (
                            <tr key={row.staffId} className="border-t">
                              <td className="py-2">{staffName(row.staffId)}</td>
                              <td className="py-2 text-right text-xs text-muted-foreground">
                                {row.days}日{row.customers != null ? `・${row.customers}人` : ""}
                              </td>
                              <td className="w-28 py-2 text-right font-semibold">{yen(row.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">{monthLabel(month)}の個人の売上（日付ごと）</h2>
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
          この月の個人の売上はまだありません
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
                      <span className="block text-sm font-medium">{staffName(entry.staff_id)}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {shopName(entry.shop_id)} ・ {entry.customer_count != null ? `${entry.customer_count}人 ・ ` : ""}
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
  );
}
