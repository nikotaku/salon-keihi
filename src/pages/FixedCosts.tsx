import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { useApp } from "@/hooks/useApp";
import { monthLabel, PAYMENT_LABELS, parseAmount, yen } from "@/lib/format";
import { fetchPostedTemplateIds, fetchTemplates } from "@/lib/queries";
import { COMMON_KEY, COMMON_LABEL, shopKey } from "@/lib/summary";
import { supabase } from "@/lib/supabase";
import type { ExpenseTemplate, PaymentMethod } from "@/lib/types";
import { cn, describeError } from "@/lib/utils";

interface Draft {
  id: string | null;
  shop: string;
  categoryId: string;
  amount: string;
  day: string;
  payment: PaymentMethod;
  vendor: string;
  description: string;
  isActive: boolean;
}

export default function FixedCosts() {
  const { month, shops, categories, colors, shopName, usableShops, canUseCommon, dataVersion, bumpData } = useApp();
  const [templates, setTemplates] = useState<ExpenseTemplate[]>([]);
  const [posted, setPosted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, p] = await Promise.all([fetchTemplates(), fetchPostedTemplateIds(month)]);
      setTemplates(t);
      setPosted(p);
    } catch (error) {
      toast.error(`読み込めませんでした: ${describeError(error)}`);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load, dataVersion]);

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "（削除された科目）";
  const fixedCategories = categories.filter((c) => c.kind === "fixed" && c.is_active);
  const otherCategories = categories.filter((c) => c.kind === "variable" && c.is_active);

  const groups = useMemo(() => {
    const order = [...shops.map((s) => s.id), COMMON_KEY];
    const map = new Map<string, ExpenseTemplate[]>();
    for (const t of templates) map.set(shopKey(t.shop_id), [...(map.get(shopKey(t.shop_id)) ?? []), t]);
    return order.filter((key) => map.has(key)).map((key) => ({ key, rows: map.get(key)! }));
  }, [templates, shops]);

  const active = templates.filter((t) => t.is_active);
  const unposted = active.filter((t) => !posted.has(t.id));
  const monthlyTotal = active.reduce((sum, t) => sum + t.amount, 0);

  const postMonth = async () => {
    setPosting(true);
    const { data, error } = await supabase.rpc("salon_post_fixed_expenses", { p_month: `${month}-01` });
    setPosting(false);
    if (error) {
      toast.error(`計上できませんでした: ${describeError(error)}`);
      return;
    }
    const count = Number(data) || 0;
    toast.success(count ? `${monthLabel(month)}の固定費を${count}件計上しました` : "計上済みです");
    bumpData();
  };

  const shopOptions = [
    ...usableShops.map((s) => ({ value: s.id, label: s.name })),
    ...(canUseCommon ? [{ value: COMMON_KEY, label: COMMON_LABEL }] : []),
  ];

  const openNew = () =>
    setDraft({
      id: null,
      shop: shopOptions[0]?.value ?? COMMON_KEY,
      categoryId: fixedCategories[0]?.id ?? "",
      amount: "",
      day: "27",
      payment: "bank_transfer",
      vendor: "",
      description: "",
      isActive: true,
    });

  const openEdit = (t: ExpenseTemplate) =>
    setDraft({
      id: t.id,
      shop: shopKey(t.shop_id),
      categoryId: t.category_id,
      amount: String(t.amount),
      day: String(t.day_of_month),
      payment: t.payment_method,
      vendor: t.vendor ?? "",
      description: t.description ?? "",
      isActive: t.is_active,
    });

  const save = async () => {
    if (!draft) return;
    const amount = parseAmount(draft.amount);
    const day = Number(draft.day);
    if (amount === null || amount <= 0) return toast.error("金額を入れてください");
    if (!draft.categoryId) return toast.error("科目を選んでください");
    if (!Number.isInteger(day) || day < 1 || day > 31) return toast.error("支払日は1〜31で入れてください");
    const row = {
      shop_id: draft.shop === COMMON_KEY ? null : draft.shop,
      category_id: draft.categoryId,
      amount,
      day_of_month: day,
      payment_method: draft.payment,
      vendor: draft.vendor.trim() || null,
      description: draft.description.trim() || null,
      is_active: draft.isActive,
    };
    setSaving(true);
    const { error } = draft.id
      ? await supabase.from("salon_expense_templates").update(row).eq("id", draft.id)
      : await supabase.from("salon_expense_templates").insert(row);
    setSaving(false);
    if (error) return toast.error(`保存できませんでした: ${describeError(error)}`);
    toast.success("固定費を保存しました（計上済みの月の経費は変わりません）");
    setDraft(null);
    void load();
  };

  const remove = async () => {
    if (!draft?.id || !window.confirm("この固定費を削除しますか？（計上済みの経費は残ります）")) return;
    setSaving(true);
    const { error } = await supabase.from("salon_expense_templates").delete().eq("id", draft.id);
    setSaving(false);
    if (error) return toast.error(`削除できませんでした: ${describeError(error)}`);
    setDraft(null);
    void load();
  };

  return (
    <Layout title="固定費" actions={<MonthSwitcher />}>
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">毎月の固定費（{active.length}件）</p>
                <p className="text-2xl font-bold tabular">{yen(monthlyTotal)}</p>
              </div>
              {active.length > 0 && (
                unposted.length > 0 ? (
                  <Button onClick={postMonth} disabled={posting}>
                    {posting && <Loader2 className="animate-spin" />}
                    {monthLabel(month)}分をまとめて計上（{unposted.length}件）
                  </Button>
                ) : (
                  <p className="flex items-center gap-1.5 text-sm font-medium text-good">
                    <CheckCircle2 size={16} /> {monthLabel(month)}分は計上済み
                  </p>
                )
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              家賃・システム利用料など毎月決まった支払いを登録しておくと、ボタン1つでその月の経費に入ります。同じ月に二重には入りません。金額が月によって違うときは、計上したあと経費の画面で直してください。
            </p>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button variant="outline" onClick={openNew} disabled={!shopOptions.length}>
            <Plus /> 固定費を追加
          </Button>
        </div>

        {loading && !templates.length ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" /></div>
        ) : !templates.length ? (
          <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">まだ固定費がありません</div>
        ) : (
          groups.map(({ key, rows }) => (
            <Card key={key}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[key] }} />
                  {key === COMMON_KEY ? COMMON_LABEL : shopName(key)}
                </CardTitle>
                <span className="text-sm font-semibold tabular">{yen(rows.filter((r) => r.is_active).reduce((s, r) => s + r.amount, 0))}/月</span>
              </CardHeader>
              <CardContent className="divide-y p-0 pt-2">
                {rows.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openEdit(t)}
                    className={cn("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50", !t.is_active && "opacity-50")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{categoryName(t.category_id)}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        毎月{t.day_of_month}日 ・ {PAYMENT_LABELS[t.payment_method]}
                        {t.vendor ? ` ・ ${t.vendor}` : ""}
                        {t.is_active ? "" : " ・ 停止中"}
                      </span>
                    </span>
                    {t.is_active && (
                      <span className={cn("shrink-0 text-[11px]", posted.has(t.id) ? "text-good" : "text-muted-foreground")}>
                        {posted.has(t.id) ? "計上済み" : "未計上"}
                      </span>
                    )}
                    <span className="shrink-0 text-sm font-semibold tabular">{yen(t.amount)}</span>
                  </button>
                ))}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent title={draft?.id ? "固定費を直す" : "固定費を追加"}>
          {draft && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div>
                <Label htmlFor="tpl-shop">店舗</Label>
                <Select id="tpl-shop" value={draft.shop} onChange={(e) => setDraft({ ...draft, shop: e.target.value })}>
                  {shopOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  {!shopOptions.some((o) => o.value === draft.shop) && <option value={draft.shop}>{shopName(draft.shop === COMMON_KEY ? null : draft.shop)}</option>}
                </Select>
              </div>
              <div>
                <Label htmlFor="tpl-category">科目</Label>
                <Select id="tpl-category" value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>
                  <option value="">選んでください</option>
                  <optgroup label="固定費">{fixedCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
                  <optgroup label="変動費">{otherCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="tpl-amount">金額（円/月）</Label>
                  <Input id="tpl-amount" inputMode="numeric" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} className="font-semibold tabular" />
                </div>
                <div>
                  <Label htmlFor="tpl-day">支払日（毎月）</Label>
                  <Input id="tpl-day" inputMode="numeric" value={draft.day} onChange={(e) => setDraft({ ...draft, day: e.target.value })} />
                </div>
              </div>
              <div>
                <Label htmlFor="tpl-payment">支払方法</Label>
                <Select id="tpl-payment" value={draft.payment} onChange={(e) => setDraft({ ...draft, payment: e.target.value as PaymentMethod })}>
                  {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="tpl-vendor">支払先</Label>
                  <Input id="tpl-vendor" placeholder="例: 〇〇不動産" value={draft.vendor} onChange={(e) => setDraft({ ...draft, vendor: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="tpl-description">メモ</Label>
                  <Input id="tpl-description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} className="h-4 w-4" />
                毎月計上する（解約したものは外す）
              </label>
              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <Button type="submit" size="lg" className="sm:flex-1" disabled={saving}>
                  {saving && <Loader2 className="animate-spin" />}保存する
                </Button>
                {draft.id && (
                  <Button type="button" variant="ghost" size="lg" className="text-destructive hover:text-destructive" onClick={() => void remove()} disabled={saving}>
                    削除
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
