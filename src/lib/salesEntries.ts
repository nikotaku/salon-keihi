// 日付ごとの売上の並べ方・合計（画面とテストで共通）
import type { SalesEntry, StaffSalesEntry } from "./types.ts";

/** 日付の新しい順に、日ごとにまとめる */
export function groupEntriesByDate<T extends Pick<SalesEntry, "sales_date" | "created_at" | "amount">>(entries: T[]) {
  const groups = new Map<string, T[]>();
  const sorted = [...entries].sort((a, b) => b.sales_date.localeCompare(a.sales_date) || b.created_at.localeCompare(a.created_at));
  for (const entry of sorted) groups.set(entry.sales_date, [...(groups.get(entry.sales_date) ?? []), entry]);
  return [...groups.entries()].map(([date, rows]) => ({
    date,
    rows,
    amount: rows.reduce((sum, row) => sum + row.amount, 0),
  }));
}

/** 店舗ごとの合計（金額・件数・客数） */
export function totalsByShop(entries: SalesEntry[]) {
  const totals = new Map<string, { amount: number; days: number; customers: number | null }>();
  const days = new Map<string, Set<string>>();
  for (const entry of entries) {
    const current = totals.get(entry.shop_id) ?? { amount: 0, days: 0, customers: null };
    current.amount += entry.amount;
    if (entry.customer_count != null) current.customers = (current.customers ?? 0) + entry.customer_count;
    const set = days.get(entry.shop_id) ?? new Set<string>();
    set.add(entry.sales_date);
    days.set(entry.shop_id, set);
    current.days = set.size;
    totals.set(entry.shop_id, current);
  }
  return totals;
}

/** スタッフごとの合計（金額・出勤日数・客数）。金額の多い順 */
export function totalsByStaff(entries: StaffSalesEntry[]) {
  const totals = new Map<string, { staffId: string; shopId: string; amount: number; days: Set<string>; customers: number | null }>();
  for (const entry of entries) {
    const current = totals.get(entry.staff_id) ?? { staffId: entry.staff_id, shopId: entry.shop_id, amount: 0, days: new Set<string>(), customers: null };
    current.amount += entry.amount;
    current.days.add(entry.sales_date);
    if (entry.customer_count != null) current.customers = (current.customers ?? 0) + entry.customer_count;
    totals.set(entry.staff_id, current);
  }
  return [...totals.values()]
    .map(({ days, ...rest }) => ({ ...rest, days: days.size }))
    .sort((a, b) => b.amount - a.amount);
}

/** 入力した日時（日本時間の M/D HH:mm） */
export function enteredAtLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}
