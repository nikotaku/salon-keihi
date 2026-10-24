import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Download, Loader2, Plus, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { useApp } from "@/hooks/useApp";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatDay, monthLabel, parseAmount, shiftMonth, yen } from "@/lib/format";
import {
  copyForNextMonth,
  PAYMENT_KIND_LABELS,
  PAYMENT_KINDS,
  PAYMENT_STATUS_LABELS,
  paymentStatus,
  sortPayments,
  summarizePayments,
  todayInTokyo,
  type PaymentStatus,
} from "@/lib/payments";
import { fetchPayments } from "@/lib/queries";
import { COMMON_KEY, COMMON_LABEL, shopKey } from "@/lib/summary";
import { supabase } from "@/lib/supabase";
import type { Payment, PaymentKind } from "@/lib/types";
import { cn, describeError } from "@/lib/utils";

interface Draft {
  id: string | null;
  payee: string;
  shop: string;
  amount: string;
  method: PaymentKind;
  dueDate: string;
  paidDate: string;
  note: string;
}

type Filter = "all" | "unpaid" | "paid";

const STATUS_STYLES: Record<PaymentStatus, string> = {
  paid: "bg-good/15 text-good",
  overdue: "bg-destructive/15 text-destructive",
  due_soon: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  unpaid: "bg-muted text-muted-foreground",
};

/**
 * 月末の支払い管理表：その月に払うもの（支払用紙・口座振替・引き落とし）を入れて、期日と払った日を記録する。
 * 経費とは別の表（salon_payments）。払った日を入れると支払済み、期日を過ぎて未払いなら期日切れになる。
 */
export default function Payments() {
  const { month, colors, shopName, usableShops, canUseCommon } = useApp();
  const [rows, setRows] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const today = todayInTokyo();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchPayments(month));
    } catch (error) {
      toast.error(`読み込めませんでした: ${describeError(error)}`);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const shopOptions = [
    ...(canUseCommon ? [{ value: COMMON_KEY, label: COMMON_LABEL }] : []),
    ...usableShops.map((s) => ({ value: s.id, label: s.name })),
  ];

  const sorted = useMemo(() => sortPayments(rows), [rows]);
  const visible = sorted.filter((row) => (filter === "all" ? true : filter === "paid" ? Boolean(row.paid_date) : !row.paid_date));
  const summary = useMemo(() => summarizePayments(rows, today), [rows, today]);
  const progress = summary.total ? Math.round((summary.paid / summary.total) * 100) : 0;

  const defaultDue = `${month}-27`;
  const openNew = () =>
    setDraft({ id: null, payee: "", shop: shopOptions[0]?.value ?? COMMON_KEY, amount: "", method: "slip", dueDate: defaultDue, paidDate: "", note: "" });

  const openEdit = (row: Payment) =>
    setDraft({
      id: row.id,
      payee: row.payee,
      shop: shopKey(row.shop_id),
      amount: String(row.amount),
      method: row.method,
      dueDate: row.due_date ?? "",
      paidDate: row.paid_date ?? "",
      note: row.note ?? "",
    });

  const save = async () => {
    if (!draft) return;
    const amount = parseAmount(draft.amount);
    if (!draft.payee.trim()) return toast.error("支払先を入れてください");
    if (amount === null) return toast.error("金額を入れてください");
    const values = {
      month: `${month}-01`,
      shop_id: draft.shop === COMMON_KEY ? null : draft.shop,
      payee: draft.payee.trim(),
      amount,
      method: draft.method,
      due_date: draft.dueDate || null,
      paid_date: draft.paidDate || null,
      note: draft.note.trim() || null,
    };
    setSaving(true);
    const { error } = draft.id
      ? await supabase.from("salon_payments").update(values).eq("id", draft.id)
      : await supabase.from("salon_payments").insert({ ...values, sort_order: Math.max(0, ...rows.map((r) => r.sort_order)) + 1 });
    setSaving(false);
    if (error) return toast.error(`保存できませんでした: ${describeError(error)}`);
    toast.success(`${values.payee}を${draft.id ? "直しました" : "追加しました"}`);
    setDraft(null);
    void load();
  };

  const remove = async () => {
    if (!draft?.id || !window.confirm(`${draft.payee}を支払い管理表から消しますか？`)) return;
    setSaving(true);
    const { error } = await supabase.from("salon_payments").delete().eq("id", draft.id);
    setSaving(false);
    if (error) return toast.error(`消せませんでした: ${describeError(error)}`);
    setDraft(null);
    void load();
  };

  // 一覧から「払った」をワンタップで（払った日＝今日）。もう一度押すと未払いに戻す
  const togglePaid = async (row: Payment) => {
    setBusyId(row.id);
    const paidDate = row.paid_date ? null : today;
    const { error } = await supabase.from("salon_payments").update({ paid_date: paidDate }).eq("id", row.id);
    setBusyId(null);
    if (error) return toast.error(`保存できませんでした: ${describeError(error)}`);
    toast.success(paidDate ? `${row.payee}を支払済みにしました（${formatDay(paidDate)}）` : `${row.payee}を未払いに戻しました`);
    void load();
  };

  const copyPrevious = async () => {
    const previous = shiftMonth(month, -1);
    setCopying(true);
    try {
      const source = await fetchPayments(previous);
      const allowed = new Set(shopOptions.map((o) => o.value));
      const targets = source.filter((row) => allowed.has(shopKey(row.shop_id)));
      if (!targets.length) {
        toast.error(`${monthLabel(previous)}の支払いがありません`);
        return;
      }
      const { error } = await supabase.from("salon_payments").insert(copyForNextMonth(targets, month));
      if (error) throw error;
      toast.success(`${monthLabel(previous)}の${targets.length}件を写しました。金額や期日が違うものは直してください`);
      void load();
    } catch (error) {
      toast.error(`写せませんでした: ${describeError(error)}`);
    } finally {
      setCopying(false);
    }
  };

  const exportCsv = () => {
    const lines = sorted.map((row) => [
      shopName(row.shop_id),
      row.payee,
      PAYMENT_KIND_LABELS[row.method],
      row.amount,
      row.due_date,
      row.paid_date,
      PAYMENT_STATUS_LABELS[paymentStatus(row, today)],
      row.note,
    ]);
    downloadCsv(`支払い管理_${month}.csv`, toCsv([["店舗", "支払先", "区分", "金額", "期日", "払った日", "状態", "メモ"], ...lines]));
  };

  return (
    <Layout title="支払い管理" actions={<MonthSwitcher />}>
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">{monthLabel(month)}の支払い（{summary.count}件）</p>
                <p className="text-xl font-bold tabular">{yen(summary.total)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">支払済み（{summary.paidCount}件）</p>
                <p className="text-xl font-bold tabular text-good">{yen(summary.paid)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">残り（{summary.count - summary.paidCount}件）</p>
                <p className="text-xl font-bold tabular">{yen(summary.remaining)}</p>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" aria-label={`支払済み ${progress}%`}>
              <div className="h-full rounded-full bg-good transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {PAYMENT_KINDS.map((kind) => (
                <span key={kind}>
                  {PAYMENT_KIND_LABELS[kind]} <span className="font-semibold text-foreground tabular">{yen(summary.byKind[kind])}</span>
                </span>
              ))}
            </div>
            {summary.overdueCount > 0 && (
              <p className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                <AlertTriangle size={16} /> 期日を過ぎた未払いが{summary.overdueCount}件あります
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="tablist" className="flex gap-1 rounded-lg bg-muted p-1">
            {([["all", "すべて"], ["unpaid", "未払い"], ["paid", "支払済み"]] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                onClick={() => setFilter(key)}
                className={cn("rounded-md px-3 py-1.5 text-sm", filter === key ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
              <Download /> CSV
            </Button>
            <Button size="sm" onClick={openNew} disabled={!shopOptions.length}>
              <Plus /> 支払いを追加
            </Button>
          </div>
        </div>

        {loading && !rows.length ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" /></div>
        ) : !rows.length ? (
          <div className="space-y-3 rounded-xl border border-dashed px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">{monthLabel(month)}の支払いはまだありません</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => void copyPrevious()} disabled={copying}>
                {copying ? <Loader2 className="animate-spin" /> : <Copy />}
                {monthLabel(shiftMonth(month, -1))}から写す
              </Button>
              <Button onClick={openNew} disabled={!shopOptions.length}>
                <Plus /> 支払いを追加
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">「写す」は前月の支払先・金額・区分をそのまま入れます（期日は1か月後、払った日は空）。</p>
          </div>
        ) : !visible.length ? (
          <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
            {filter === "paid" ? "支払済みのものはまだありません" : "未払いのものはありません"}
          </div>
        ) : (
          <Card className="divide-y overflow-hidden">
            {visible.map((row) => {
              const status = paymentStatus(row, today);
              return (
                <div key={row.id} className={cn("flex items-center gap-3 px-4 py-3", row.paid_date && "bg-muted/30")}>
                  <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: colors[shopKey(row.shop_id)] }} aria-hidden />
                  <button type="button" onClick={() => openEdit(row)} className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{row.payee}</span>
                      <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", STATUS_STYLES[status])}>
                        {PAYMENT_STATUS_LABELS[status]}
                      </span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {PAYMENT_KIND_LABELS[row.method]} ・ {shopName(row.shop_id)}
                      {row.due_date ? ` ・ 期日 ${formatDay(row.due_date)}` : " ・ 期日なし"}
                      {row.paid_date ? ` ・ 払った日 ${formatDay(row.paid_date)}` : ""}
                      {row.note ? ` ・ ${row.note}` : ""}
                    </span>
                  </button>
                  <span className="shrink-0 text-sm font-semibold tabular">{yen(row.amount)}</span>
                  <Button
                    type="button"
                    variant={row.paid_date ? "ghost" : "outline"}
                    size="sm"
                    className="shrink-0"
                    onClick={() => void togglePaid(row)}
                    disabled={busyId === row.id}
                    aria-label={row.paid_date ? "未払いに戻す" : "今日払ったことにする"}
                  >
                    {busyId === row.id ? <Loader2 className="animate-spin" /> : row.paid_date ? <Undo2 /> : <CheckCircle2 />}
                    {row.paid_date ? "戻す" : "払った"}
                  </Button>
                </div>
              );
            })}
          </Card>
        )}
        {rows.length > 0 && (
          <p className="text-xs text-muted-foreground">
            「払った」を押すと今日の日付で支払済みになります。別の日に払ったときは、支払いを押して「払った日」を直してください。この表は経費とは別なので、経費にも入れるときは経費の画面で入力してください。
          </p>
        )}
      </div>

      <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent title={draft?.id ? "支払いを直す" : "支払いを追加"} description={monthLabel(month)}>
          {draft && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div>
                <Label htmlFor="pay-payee">支払先</Label>
                <Input id="pay-payee" value={draft.payee} onChange={(e) => setDraft({ ...draft, payee: e.target.value })} placeholder="例: 電気代（東北電力）" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="pay-amount">金額（円）</Label>
                  <Input id="pay-amount" inputMode="numeric" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} className="font-semibold tabular" />
                </div>
                <div>
                  <Label htmlFor="pay-shop">店舗</Label>
                  <Select id="pay-shop" value={draft.shop} onChange={(e) => setDraft({ ...draft, shop: e.target.value })}>
                    {shopOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    {!shopOptions.some((o) => o.value === draft.shop) && (
                      <option value={draft.shop}>{shopName(draft.shop === COMMON_KEY ? null : draft.shop)}</option>
                    )}
                  </Select>
                </div>
              </div>
              <div>
                <Label>支払い方法</Label>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_KINDS.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setDraft({ ...draft, method: kind })}
                      className={cn(
                        "rounded-lg border px-2 py-2.5 text-sm",
                        draft.method === kind ? "border-primary bg-accent font-semibold text-accent-foreground" : "bg-card",
                      )}
                    >
                      {PAYMENT_KIND_LABELS[kind]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="pay-due">期日</Label>
                  <Input id="pay-due" type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="pay-paid">払った日</Label>
                  <Input id="pay-paid" type="date" value={draft.paidDate} onChange={(e) => setDraft({ ...draft, paidDate: e.target.value })} />
                  <div className="mt-1 flex gap-3 text-xs">
                    <button type="button" className="text-primary underline" onClick={() => setDraft({ ...draft, paidDate: today })}>今日</button>
                    {draft.paidDate && (
                      <button type="button" className="text-muted-foreground underline" onClick={() => setDraft({ ...draft, paidDate: "" })}>空にする（未払い）</button>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <Label htmlFor="pay-note">メモ</Label>
                <Input id="pay-note" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="例: コンビニで支払い、請求書番号など" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={saving}>
                  {saving && <Loader2 className="animate-spin" />}保存
                </Button>
                {draft.id && (
                  <Button type="button" variant="ghost" className="text-destructive" onClick={() => void remove()} disabled={saving}>
                    消す
                  </Button>
                )}
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
