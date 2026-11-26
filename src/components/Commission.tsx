import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useApp } from "@/hooks/useApp";
import { NO_TYPE, parseRate, staffCommission } from "@/lib/commission";
import { downloadCsv, toCsv } from "@/lib/csv";
import { monthEnd, monthLabel, monthStart, yen } from "@/lib/format";
import { fetchCommissionRates, fetchSalesTypes, fetchStaff, fetchStaffSalesEntries } from "@/lib/queries";
import { supabase } from "@/lib/supabase";
import { tint, TINT_ROW } from "@/lib/summary";
import type { CommissionRates, SalesType, Staff, StaffSalesEntry } from "@/lib/types";
import { describeError } from "@/lib/utils";

const selectClass = "flex h-11 w-full rounded-xl border border-input bg-card px-3 text-base md:h-10 md:text-sm";
const SHOP_KEY = "salon-keihi:commission-shop";
const fmtRate = (n: number | null | undefined) => (n == null ? "" : String(Number(n)));

/** ％の入力欄。フォーカスを外したときに保存する（空にすると消す） */
function RateInput({ value, placeholder, label, onSave }: { value: number | null; placeholder: string; label: string; onSave: (next: number | null) => Promise<boolean> }) {
  const [text, setText] = useState(fmtRate(value));
  useEffect(() => setText(fmtRate(value)), [value]);
  const commit = async () => {
    const parsed = parseRate(text);
    if (parsed === "invalid") {
      toast.error("％は0〜100の数字で入れてください（小数は2桁まで）");
      setText(fmtRate(value));
      return;
    }
    if (parsed === value) return;
    if (!(await onSave(parsed))) setText(fmtRate(value));
  };
  return (
    <div className="relative">
      <Input
        inputMode="decimal"
        aria-label={label}
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="h-9 pr-7 text-right tabular md:h-9"
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
    </div>
  );
}

/**
 * 歩合（オーナーだけ）：店舗の売上のうち担当つきのものを、種類ごとに ％ をかけて計算する。
 * ％は「種類の標準」と「人ごと」。人ごとに入れてあればそちらを使う。少しずつ入れていけるよう、空欄は「未設定」として合計から外す。
 */
export function Commission() {
  const { month, usableShops, colors } = useApp();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [types, setTypes] = useState<SalesType[]>([]);
  const [rates, setRates] = useState<CommissionRates>({ defaults: {}, perStaff: {} });
  const [entries, setEntries] = useState<StaffSalesEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [newType, setNewType] = useState("");
  const [shopId, setShopIdState] = useState<string>(() => {
    try {
      return localStorage.getItem(SHOP_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const setShopId = (id: string) => {
    setShopIdState(id);
    try {
      localStorage.setItem(SHOP_KEY, id);
    } catch {
      // 覚えられなくても切り替えはできる
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([fetchStaff(), fetchSalesTypes(), fetchCommissionRates(), fetchStaffSalesEntries(monthStart(month), monthEnd(month))])
      .then(([s, t, r, e]) => {
        if (!active) return;
        setStaff(s);
        setTypes(t);
        setRates(r);
        setEntries(e);
      })
      .catch((error) => toast.error(`読み込めませんでした: ${describeError(error)}`))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [month, reloadKey]);

  // スタッフのいる店舗だけ。最初は覚えている店舗、なければスタッフのいる最初の店舗
  const shopsWithStaff = usableShops.filter((shop) => staff.some((s) => s.shop_id === shop.id));
  const currentShop = shopsWithStaff.find((s) => s.id === shopId) ?? shopsWithStaff[0];
  const shopTypes = useMemo(() => types.filter((t) => t.shop_id === currentShop?.id), [types, currentShop]);
  const shopEntries = useMemo(() => entries.filter((e) => e.shop_id === currentShop?.id), [entries, currentShop]);
  const people = staff.filter((s) => s.shop_id === currentShop?.id && (s.is_active || shopEntries.some((e) => e.staff_id === s.id)));
  const results = people.map((person) => ({ person, result: staffCommission({ staffId: person.id, entries: shopEntries, types: shopTypes, rates, showEmpty: true }) }));
  const totalCommission = results.reduce((sum, r) => sum + r.result.commission, 0);

  const saveStaffRate = async (staffId: string, typeId: string, rate: number | null) => {
    const { error } =
      rate == null
        ? await supabase.from("salon_commission_rates").delete().eq("staff_id", staffId).eq("type_id", typeId)
        : await supabase.from("salon_commission_rates").upsert({ staff_id: staffId, type_id: typeId, rate, updated_at: new Date().toISOString() });
    if (error) {
      toast.error(`保存できませんでした: ${describeError(error)}`);
      return false;
    }
    setRates((prev) => {
      const mine = { ...(prev.perStaff[staffId] ?? {}) };
      if (rate == null) delete mine[typeId];
      else mine[typeId] = rate;
      return { ...prev, perStaff: { ...prev.perStaff, [staffId]: mine } };
    });
    return true;
  };

  const saveDefaultRate = async (typeId: string, rate: number | null) => {
    const { error } =
      rate == null
        ? await supabase.from("salon_type_default_rates").delete().eq("type_id", typeId)
        : await supabase.from("salon_type_default_rates").upsert({ type_id: typeId, rate, updated_at: new Date().toISOString() });
    if (error) {
      toast.error(`保存できませんでした: ${describeError(error)}`);
      return false;
    }
    setRates((prev) => {
      const defaults = { ...prev.defaults };
      if (rate == null) delete defaults[typeId];
      else defaults[typeId] = rate;
      return { ...prev, defaults };
    });
    return true;
  };

  const renameType = async (type: SalesType, name: string) => {
    const next = name.trim();
    if (!next || next === type.name) return;
    const { error } = await supabase.from("salon_sales_types").update({ name: next.slice(0, 40) }).eq("id", type.id);
    if (error) return toast.error(`保存できませんでした: ${describeError(error)}`);
    setTypes((prev) => prev.map((t) => (t.id === type.id ? { ...t, name: next } : t)));
  };

  const addType = async () => {
    const name = newType.trim();
    if (!name || !currentShop) return;
    if (shopTypes.some((t) => t.name === name)) return toast.error("同じ名前の種類があります");
    const sort = Math.max(0, ...shopTypes.map((t) => t.sort_order)) + 1;
    const { error } = await supabase.from("salon_sales_types").insert({ shop_id: currentShop.id, name: name.slice(0, 40), sort_order: sort });
    if (error) return toast.error(`追加できませんでした: ${describeError(error)}`);
    setNewType("");
    setReloadKey((k) => k + 1);
  };

  const removeType = async (type: SalesType) => {
    const used = entries.some((e) => e.type_id === type.id);
    if (!window.confirm(`「${type.name}」を消しますか？${used ? "\nこの種類を付けた売上は残り、「種類なし」になります。" : ""}\n人ごとの％もいっしょに消えます。`)) return;
    const { error } = await supabase.from("salon_sales_types").delete().eq("id", type.id);
    if (error) return toast.error(`消せませんでした: ${describeError(error)}`);
    setReloadKey((k) => k + 1);
  };

  const exportCsv = () => {
    const rows = results.flatMap(({ person, result }) =>
      result.rows.filter((r) => r.sales > 0).map((r) => [person.name, r.name, r.count, r.sales, r.rate ?? "", r.commission ?? ""]),
    );
    const sums = results.map(({ person, result }) => [person.name, "合計", "", result.sales, "", result.commission]);
    downloadCsv(`歩合_${currentShop?.name ?? ""}_${month}.csv`, toCsv([["スタッフ", "種類", "件数", "売上", "歩合(%)", "歩合(円)"], ...rows, ...sums]));
  };

  if (loading && !staff.length) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" /></div>;
  if (!currentShop) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">スタッフのいる店舗がありません。「設定 → スタッフ」で登録すると、ここで歩合を計算できます。</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[14rem] flex-1">
          <Label htmlFor="commission-shop">店舗</Label>
          <select id="commission-shop" value={currentShop.id} onChange={(e) => setShopId(e.target.value)} className={selectClass}>
            {shopsWithStaff.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[11px] tracking-wider text-muted-foreground">{monthLabel(month)}の歩合の合計</p>
            <p className="num text-2xl font-medium">{yen(totalCommission)}</p>
          </div>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!shopEntries.length}>
            <Download /> CSV
          </Button>
        </div>
      </div>

      {!shopTypes.length && (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            まだ売上の種類がありません。下の「売上の種類と標準の％」で、回数券・体験などの種類を作ってください。
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {results.map(({ person, result }) => (
          <Card key={person.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[currentShop.id] }} />
                {person.name}
                {!person.is_active && <span className="text-xs font-normal text-muted-foreground">（休止中）</span>}
              </CardTitle>
              <div className="text-right">
                <p className="num text-xl font-medium">{yen(result.commission)}</p>
                <p className="text-[11px] text-muted-foreground">売上 {yen(result.sales)}</p>
              </div>
            </CardHeader>
            <CardContent className="pt-3">
              {result.unsetSales > 0 && (
                <p className="mb-3 rounded-xl px-3 py-2 text-xs" style={{ background: tint(colors[currentShop.id], TINT_ROW) }}>
                  ％が決まっていない売上が {yen(result.unsetSales)} あります（合計には入っていません）
                </p>
              )}
              <table className="w-full text-sm">
                <thead className="text-[11px] text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-1.5 text-left font-medium">種類</th>
                    <th className="py-1.5 text-right font-medium">売上</th>
                    <th className="w-24 py-1.5 pl-3 text-right font-medium">歩合</th>
                    <th className="py-1.5 text-right font-medium">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr key={row.typeId} className="border-b last:border-0">
                      <td className="py-2">
                        {row.name}
                        {row.count > 0 && <span className="ml-1 text-[11px] text-muted-foreground">{row.count}件</span>}
                      </td>
                      <td className="py-2 text-right tabular">{row.sales ? yen(row.sales) : <span className="text-muted-foreground">—</span>}</td>
                      <td className="py-1.5 pl-3">
                        {row.typeId === NO_TYPE ? (
                          <span className="block text-right text-[11px] text-muted-foreground">種類を付けると計算</span>
                        ) : (
                          <RateInput
                            label={`${person.name}さんの${row.name}の歩合`}
                            value={rates.perStaff[person.id]?.[row.typeId] ?? null}
                            placeholder={rates.defaults[row.typeId] != null ? `標準${fmtRate(rates.defaults[row.typeId])}` : "未設定"}
                            onSave={(next) => saveStaffRate(person.id, row.typeId, next)}
                          />
                        )}
                      </td>
                      <td className="py-2 text-right font-semibold tabular">
                        {row.commission == null ? (row.sales ? <span className="text-xs font-normal text-muted-foreground">未設定</span> : "—") : yen(row.commission)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-muted-foreground">歩合の欄が空なら、その種類の「標準の％」を使います。人によって違うときだけ入れてください。</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>売上の種類と標準の％（{currentShop.name}）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            売上を入れるときに「種類」で選べます。標準の％は、人ごとに決めていないときに使います。空欄のままでもかまいません（その種類は「未設定」になります）。
          </p>
          {shopTypes.map((type) => (
            <div key={type.id} className="flex items-center gap-2">
              <Input defaultValue={type.name} aria-label="種類の名前" onBlur={(e) => void renameType(type, e.target.value)} className="flex-1" />
              <div className="w-28">
                <RateInput label={`${type.name}の標準の歩合`} value={rates.defaults[type.id] ?? null} placeholder="未設定" onSave={(next) => saveDefaultRate(type.id, next)} />
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => void removeType(type)} aria-label={`${type.name}を消す`}>
                <Trash2 size={15} />
              </Button>
            </div>
          ))}
          <form
            className="flex items-center gap-2 border-t pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              void addType();
            }}
          >
            <Input value={newType} onChange={(e) => setNewType(e.target.value)} placeholder="新しい種類（例：物販・延長）" className="flex-1" />
            <Button type="submit" size="sm" disabled={!newType.trim()}>
              <Plus /> 追加
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
