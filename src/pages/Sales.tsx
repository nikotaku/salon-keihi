import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useApp } from "@/hooks/useApp";
import { monthLabel, parseAmount, recentMonths, shortMonthLabel, yen } from "@/lib/format";
import { fetchSales } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import type { MonthlySales } from "@/lib/types";
import { describeError } from "@/lib/utils";

interface Row {
  amount: string;
  customers: string;
  note: string;
}

export default function Sales() {
  const { month, usableShops, colors } = useApp();
  const [history, setHistory] = useState<MonthlySales[]>([]);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const months = useMemo(() => recentMonths(month, 6), [month]);
  // 経費の入力画面を開くたびに入力中の売上が消えないよう、店舗の顔ぶれが変わったときだけ読み直す
  const shopIds = usableShops.map((shop) => shop.id).join(",");

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchSales(months[0], month)
      .then((data) => {
        if (!active) return;
        setHistory(data);
        const current = data.filter((s) => s.month.startsWith(month));
        setRows(
          Object.fromEntries(
            shopIds.split(",").filter(Boolean).map((shopId) => {
              const row = current.find((s) => s.shop_id === shopId);
              return [shopId, { amount: row ? String(row.amount) : "", customers: row?.customer_count != null ? String(row.customer_count) : "", note: row?.note ?? "" }];
            }),
          ),
        );
      })
      .catch((error) => toast.error(`読み込めませんでした: ${describeError(error)}`))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [month, months, shopIds]);

  const save = async (shopId: string) => {
    const row = rows[shopId];
    const amount = parseAmount(row.amount);
    const customers = row.customers.trim() ? parseAmount(row.customers) : null;
    if (amount === null) return toast.error("売上の金額を入れてください");
    if (row.customers.trim() && customers === null) return toast.error("客数は数字で入れてください");
    setSaving(shopId);
    const saved: MonthlySales = { shop_id: shopId, month: `${month}-01`, amount, customer_count: customers, note: row.note.trim() || null };
    const { error } = await supabase.from("salon_monthly_sales").upsert(saved, { onConflict: "shop_id,month" });
    setSaving(null);
    if (error) return toast.error(`保存できませんでした: ${describeError(error)}`);
    toast.success("売上を保存しました");
    // ほかの店舗の入力中の値を消さないよう、読み直さずに手元の履歴だけ更新する
    setHistory((prev) => [...prev.filter((s) => !(s.shop_id === shopId && s.month === saved.month)), saved]);
  };

  const clear = async (shopId: string) => {
    if (!window.confirm("この月の売上を消しますか？")) return;
    const { error } = await supabase.from("salon_monthly_sales").delete().eq("shop_id", shopId).eq("month", `${month}-01`);
    if (error) return toast.error(`消せませんでした: ${describeError(error)}`);
    setHistory((prev) => prev.filter((s) => !(s.shop_id === shopId && s.month.startsWith(month))));
    setRows((prev) => ({ ...prev, [shopId]: { amount: "", customers: "", note: "" } }));
  };

  const historyOf = (shopId: string, key: string) => history.find((s) => s.shop_id === shopId && s.month.startsWith(key));

  return (
    <Layout title="売上" actions={<MonthSwitcher />}>
      <p className="mb-3 text-xs text-muted-foreground">
        各店舗の{monthLabel(month)}の売上（税込の合計）を入れてください。レジや予約システムの月次集計の数字でOKです。経費と合わせて利益を出します。
      </p>
      {loading && !history.length ? (
        <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {usableShops.map((shop) => {
            const row = rows[shop.id] ?? { amount: "", customers: "", note: "" };
            const saved = historyOf(shop.id, month);
            const update = (patch: Partial<Row>) => setRows((prev) => ({ ...prev, [shop.id]: { ...row, ...patch } }));
            return (
              <Card key={shop.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[shop.id] }} />
                    {shop.name}
                  </CardTitle>
                  {saved && <span className="text-[11px] text-good">保存済み</span>}
                </CardHeader>
                <CardContent className="space-y-3">
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void save(shop.id);
                    }}
                  >
                    <div>
                      <Label htmlFor={`sales-${shop.id}`}>売上（円）</Label>
                      <Input id={`sales-${shop.id}`} inputMode="numeric" value={row.amount} onChange={(e) => update({ amount: e.target.value })} className="text-lg font-semibold tabular" placeholder="例: 850000" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor={`customers-${shop.id}`}>客数（任意）</Label>
                        <Input id={`customers-${shop.id}`} inputMode="numeric" value={row.customers} onChange={(e) => update({ customers: e.target.value })} />
                      </div>
                      <div>
                        <Label htmlFor={`note-${shop.id}`}>メモ</Label>
                        <Input id={`note-${shop.id}`} value={row.note} onChange={(e) => update({ note: e.target.value })} />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" className="flex-1" disabled={saving === shop.id}>
                        {saving === shop.id && <Loader2 className="animate-spin" />}保存
                      </Button>
                      {saved && <Button type="button" variant="ghost" onClick={() => void clear(shop.id)}>消す</Button>}
                    </div>
                  </form>
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
      )}
    </Layout>
  );
}
