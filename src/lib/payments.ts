// 月末の支払い管理表：状態・並べ方・合計・前月からの写し（画面とテストで共通）
import type { Payment, PaymentKind } from "./types.ts";

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  slip: "支払用紙",
  account_transfer: "口座振替",
  auto_debit: "引き落とし",
};

export const PAYMENT_KINDS = Object.keys(PAYMENT_KIND_LABELS) as PaymentKind[];

export type PaymentStatus = "paid" | "overdue" | "due_soon" | "unpaid";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: "支払済み",
  overdue: "期日切れ",
  due_soon: "もうすぐ期日",
  unpaid: "未払い",
};

const pad = (n: number) => String(n).padStart(2, "0");

/** 日本時間の今日（YYYY-MM-DD） */
export function todayInTokyo(now = new Date()) {
  const parts = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** 払った日があれば支払済み。未払いで期日を過ぎたら期日切れ、3日以内ならもうすぐ期日 */
export function paymentStatus(payment: Pick<Payment, "due_date" | "paid_date">, today: string): PaymentStatus {
  if (payment.paid_date) return "paid";
  if (!payment.due_date) return "unpaid";
  if (payment.due_date < today) return "overdue";
  if (payment.due_date <= addDays(today, 3)) return "due_soon";
  return "unpaid";
}

/** 未払いを先に、期日の早い順（期日なしは後ろ）。支払済みは払った日の順で最後 */
export function sortPayments<T extends Pick<Payment, "due_date" | "paid_date" | "sort_order" | "created_at">>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const paidA = a.paid_date ? 1 : 0;
    const paidB = b.paid_date ? 1 : 0;
    if (paidA !== paidB) return paidA - paidB;
    const dueA = a.due_date ?? "9999-12-31";
    const dueB = b.due_date ?? "9999-12-31";
    return dueA.localeCompare(dueB) || a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);
  });
}

/** 合計・支払済み・残り・区分ごとの合計 */
export function summarizePayments(rows: Pick<Payment, "amount" | "method" | "paid_date" | "due_date">[], today: string) {
  const byKind: Record<PaymentKind, number> = { slip: 0, account_transfer: 0, auto_debit: 0 };
  let total = 0;
  let paid = 0;
  let overdueCount = 0;
  for (const row of rows) {
    total += row.amount;
    byKind[row.method] += row.amount;
    if (row.paid_date) paid += row.amount;
    else if (paymentStatus(row, today) === "overdue") overdueCount += 1;
  }
  return { total, paid, remaining: total - paid, count: rows.length, paidCount: rows.filter((r) => r.paid_date).length, overdueCount, byKind };
}

/** 日付を同じ日のまま n か月ずらす（31日→30日のように月末に合わせる） */
export function shiftDateByMonths(date: string, months: number) {
  const [y, m, d] = date.split("-").map(Number);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const last = new Date(year, month, 0).getDate();
  return `${year}-${pad(month)}-${pad(Math.min(d, last))}`;
}

/** 前月の支払いを今月分として写す（金額・区分・支払先はそのまま、期日は1か月後、払った日は空） */
export function copyForNextMonth(rows: Payment[], month: string) {
  return rows.map((row) => ({
    month: `${month}-01`,
    shop_id: row.shop_id,
    payee: row.payee,
    amount: row.amount,
    method: row.method,
    due_date: row.due_date ? shiftDateByMonths(row.due_date, 1) : null,
    paid_date: null,
    note: row.note,
    sort_order: row.sort_order,
  }));
}
