import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, FileText, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { useApp } from "@/hooks/useApp";
import { defaultDateFor, PAYMENT_LABELS, parseAmount } from "@/lib/format";
import { moveReceipt, receiptUrl, removeReceipt, uploadReceipt } from "@/lib/receipt";
import { COMMON_KEY, COMMON_LABEL } from "@/lib/summary";
import { supabase } from "@/lib/supabase";
import type { Expense, PaymentMethod } from "@/lib/types";
import { cn, describeError } from "@/lib/utils";

const LAST_KEY = "salon-keihi:last-entry";

interface LastEntry {
  shop: string;
  payment: PaymentMethod;
}

function readLast(): Partial<LastEntry> {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) || "{}") as Partial<LastEntry>;
  } catch {
    return {};
  }
}

function writeLast(entry: LastEntry) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(entry));
  } catch {
    // 次回の初期値が前回と同じにならないだけ
  }
}

interface FormState {
  shop: string; // 店舗ID か "common"
  date: string;
  amount: string;
  categoryId: string;
  payment: PaymentMethod;
  vendor: string;
  description: string;
}

export function ExpenseDialog() {
  const { expenseDialog, closeExpense, usableShops, canUseCommon, categories, month, bumpData, shopName } = useApp();
  const editing = expenseDialog.expense;
  const shopOptions = useMemo(() => {
    const options = usableShops.map((shop) => ({ value: shop.id, label: shop.name }));
    if (canUseCommon) options.push({ value: COMMON_KEY, label: COMMON_LABEL });
    // 休止中の店舗の経費を直すときは、その店舗も選べるようにする
    if (editing?.shop_id && !options.some((o) => o.value === editing.shop_id)) {
      options.unshift({ value: editing.shop_id, label: shopName(editing.shop_id) });
    }
    return options;
  }, [usableShops, canUseCommon, editing, shopName]);

  const [form, setForm] = useState<FormState | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [existingUrl, setExistingUrl] = useState<string | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);

  const reset = (keepShop?: string, keepPayment?: PaymentMethod, keepDate?: string) => {
    const last = readLast();
    const shop = keepShop ?? (shopOptions.some((o) => o.value === last.shop) ? last.shop! : shopOptions[0]?.value ?? COMMON_KEY);
    setForm({
      shop,
      date: keepDate ?? defaultDateFor(month),
      amount: "",
      categoryId: "",
      payment: keepPayment ?? last.payment ?? "cash",
      vendor: "",
      description: "",
    });
    setFile(null);
    setRemoveExisting(false);
    setExistingUrl(null);
  };

  useEffect(() => {
    if (!expenseDialog.open) return;
    if (editing) {
      setForm({
        shop: editing.shop_id ?? COMMON_KEY,
        date: editing.expense_date,
        amount: String(editing.amount),
        categoryId: editing.category_id,
        payment: editing.payment_method,
        vendor: editing.vendor ?? "",
        description: editing.description ?? "",
      });
      setFile(null);
      setRemoveExisting(false);
      setExistingUrl(null);
      if (editing.receipt_path) {
        receiptUrl(editing.receipt_path).then(setExistingUrl).catch(() => setExistingUrl(null));
      }
    } else {
      reset();
    }
    // 開いたときだけ初期化する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseDialog.open, editing]);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const activeCategories = categories.filter((c) => c.is_active || c.id === form?.categoryId);
  const fixed = activeCategories.filter((c) => c.kind === "fixed");
  const variable = activeCategories.filter((c) => c.kind === "variable");

  const update = (patch: Partial<FormState>) => setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  const save = async (continueAfter: boolean) => {
    if (!form) return;
    const amount = parseAmount(form.amount);
    if (amount === null || amount <= 0) {
      toast.error("金額を入れてください");
      amountInput.current?.focus();
      return;
    }
    if (!form.categoryId) {
      toast.error("科目を選んでください");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      toast.error("日付を入れてください");
      return;
    }
    const shopId = form.shop === COMMON_KEY ? null : form.shop;
    setSaving(true);
    let uploaded: string | null = null;
    try {
      let receiptPath = editing?.receipt_path ?? null;
      if (file) {
        uploaded = await uploadReceipt(shopId, form.date, file);
        receiptPath = uploaded;
      } else if (removeExisting) {
        receiptPath = null;
      } else if (receiptPath && editing && editing.shop_id !== shopId) {
        receiptPath = await moveReceipt(receiptPath, shopId, form.date);
      }
      const row = {
        shop_id: shopId,
        expense_date: form.date,
        category_id: form.categoryId,
        amount,
        payment_method: form.payment,
        vendor: form.vendor.trim() || null,
        description: form.description.trim() || null,
        receipt_path: receiptPath,
      };
      const { error } = editing
        ? await supabase.from("salon_expenses").update(row).eq("id", editing.id)
        : await supabase.from("salon_expenses").insert(row);
      if (error) throw error;
      // 写真を差し替え・削除したら古いほうを消す
      if (editing?.receipt_path && editing.receipt_path !== receiptPath && (file || removeExisting)) {
        await removeReceipt(editing.receipt_path);
      }
      writeLast({ shop: form.shop, payment: form.payment });
      bumpData();
      toast.success(editing ? "経費を直しました" : `経費を登録しました（${shopOptions.find((o) => o.value === form.shop)?.label ?? ""}）`);
      if (continueAfter && !editing) {
        reset(form.shop, form.payment, form.date);
        setTimeout(() => amountInput.current?.focus(), 50);
      } else {
        closeExpense();
      }
    } catch (error) {
      if (uploaded) await removeReceipt(uploaded);
      toast.error(`保存できませんでした: ${describeError(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing || !window.confirm("この経費を削除しますか？")) return;
    setSaving(true);
    const { error } = await supabase.from("salon_expenses").delete().eq("id", editing.id);
    setSaving(false);
    if (error) {
      toast.error(`削除できませんでした: ${describeError(error)}`);
      return;
    }
    await removeReceipt(editing.receipt_path);
    bumpData();
    toast.success("削除しました");
    closeExpense();
  };

  const hasReceipt = Boolean(file) || (Boolean(editing?.receipt_path) && !removeExisting);

  return (
    <Dialog open={expenseDialog.open} onOpenChange={(open) => !open && closeExpense()}>
      <DialogContent title={editing ? "経費を直す" : "経費を入力"} description={editing?.template_id ? "固定費から計上した経費です" : undefined}>
        {form && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save(false);
            }}
          >
            <div>
              <Label>店舗</Label>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {shopOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => update({ shop: option.value })}
                    className={cn(
                      "min-h-[44px] rounded-lg border px-2 py-1.5 text-xs leading-tight",
                      form.shop === option.value ? "border-primary bg-accent font-semibold text-accent-foreground" : "bg-card",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="expense-amount">金額（円）</Label>
                <Input
                  id="expense-amount"
                  ref={amountInput}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="例: 12000"
                  value={form.amount}
                  onChange={(e) => update({ amount: e.target.value })}
                  className="text-lg font-semibold tabular"
                  autoFocus={!editing}
                />
              </div>
              <div>
                <Label htmlFor="expense-date">日付</Label>
                <Input id="expense-date" type="date" value={form.date} onChange={(e) => update({ date: e.target.value })} />
              </div>
            </div>

            <div>
              <Label htmlFor="expense-category">科目</Label>
              <Select id="expense-category" value={form.categoryId} onChange={(e) => update({ categoryId: e.target.value })}>
                <option value="">選んでください</option>
                <optgroup label="固定費">
                  {fixed.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
                <optgroup label="変動費">
                  {variable.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </optgroup>
              </Select>
            </div>

            <div>
              <Label>支払方法</Label>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => update({ payment: method })}
                    className={cn(
                      "min-h-[40px] rounded-full border px-3.5 text-sm",
                      form.payment === method ? "border-primary bg-accent font-semibold text-accent-foreground" : "bg-card",
                    )}
                  >
                    {PAYMENT_LABELS[method]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="expense-vendor">支払先</Label>
                <Input id="expense-vendor" placeholder="例: 〇〇商事" value={form.vendor} onChange={(e) => update({ vendor: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="expense-description">メモ</Label>
                <Input id="expense-description" placeholder="例: ジェル補充" value={form.description} onChange={(e) => update({ description: e.target.value })} />
              </div>
            </div>

            <div>
              <Label>領収書</Label>
              <input
                ref={fileInput}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files?.[0] ?? null;
                  if (picked && picked.size > 20 * 1024 * 1024) {
                    toast.error("20MBまでのファイルにしてください");
                    return;
                  }
                  setFile(picked);
                  e.target.value = "";
                }}
              />
              {hasReceipt ? (
                <div className="flex items-center gap-3 rounded-lg border p-2">
                  {preview || (existingUrl && !file && !/\.pdf$/i.test(editing?.receipt_path ?? "")) ? (
                    <a href={preview ?? existingUrl ?? undefined} target="_blank" rel="noreferrer">
                      <img src={preview ?? existingUrl ?? undefined} alt="領収書" className="h-16 w-16 rounded-md object-cover" />
                    </a>
                  ) : (
                    <a
                      href={existingUrl ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-16 w-16 items-center justify-center rounded-md bg-muted text-muted-foreground"
                    >
                      <FileText size={22} />
                    </a>
                  )}
                  <div className="min-w-0 flex-1 text-xs text-muted-foreground">
                    {file ? file.name : "登録済み（タップで開く）"}
                  </div>
                  <button
                    type="button"
                    onClick={() => (file ? setFile(null) : setRemoveExisting(true))}
                    className="rounded-md p-2 text-muted-foreground hover:bg-muted"
                    aria-label="領収書を外す"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <Button type="button" variant="outline" className="w-full" onClick={() => fileInput.current?.click()}>
                  <Camera /> 写真を撮る・選ぶ
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
              <Button type="submit" size="lg" className="sm:flex-1" disabled={saving}>
                {saving && <Loader2 className="animate-spin" />}
                {editing ? "保存する" : "登録する"}
              </Button>
              {!editing && (
                <Button type="button" variant="outline" size="lg" className="sm:flex-1" disabled={saving} onClick={() => void save(true)}>
                  登録して続けて入力
                </Button>
              )}
              {editing && (
                <Button type="button" variant="ghost" size="lg" className="text-destructive hover:text-destructive" disabled={saving} onClick={() => void remove()}>
                  <Trash2 /> 削除
                </Button>
              )}
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
