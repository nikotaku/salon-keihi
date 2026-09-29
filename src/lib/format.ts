// 金額と「月」（YYYY-MM）の扱い。月はブラウザの現地時間（日本時間）で数える。
import type { PaymentMethod } from "./types.ts";

export const yen = (value: number) => `¥${Math.round(value).toLocaleString("ja-JP")}`;

// グラフの目盛り用（1.2万 / 120万）
export function compactYen(value: number) {
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${trim(value / 100_000_000)}億`;
  if (abs >= 10_000) return `${trim(value / 10_000)}万`;
  return Math.round(value).toLocaleString("ja-JP");
}

const trim = (value: number) => (Math.round(value * 10) / 10).toLocaleString("ja-JP");

const pad = (n: number) => String(n).padStart(2, "0");

export const monthKeyOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;

export const isMonthKey = (value: string | null | undefined): value is string =>
  Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));

export function shiftMonth(key: string, delta: number) {
  const [year, month] = key.split("-").map(Number);
  const index = year * 12 + (month - 1) + delta;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

export function daysInMonth(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

// 月の初日・末日（YYYY-MM-DD）
export const monthStart = (key: string) => `${key}-01`;
export const monthEnd = (key: string) => `${key}-${pad(daysInMonth(key))}`;

export function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return `${year}年${month}月`;
}

export function shortMonthLabel(key: string) {
  return `${Number(key.split("-")[1])}月`;
}

// 直近 count か月（古い順、最後が key）
export function recentMonths(key: string, count: number) {
  return Array.from({ length: count }, (_, i) => shiftMonth(key, i - count + 1));
}

// 新しく経費を入れるときの日付。表示中の月が今月なら今日、それ以外はその月の1日
export function defaultDateFor(key: string, now = new Date()) {
  const today = `${monthKeyOf(now)}-${pad(now.getDate())}`;
  return monthKeyOf(now) === key ? today : monthStart(key);
}

export function formatDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = "日月火水木金土"[new Date(year, month - 1, day).getDay()];
  return `${month}/${day}(${weekday})`;
}

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "現金",
  card: "カード",
  bank_transfer: "振込",
  auto_debit: "口座引落",
  other: "その他",
};

// 入力欄の金額（全角数字・カンマ・円記号を許す）を整数にする。読めなければ null
export function parseAmount(input: string) {
  const normalized = input
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[,，、¥￥円\s]/g, "");
  if (!/^\d+$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isSafeInteger(value) ? value : null;
}

export function percent(value: number | null) {
  return value === null ? "—" : `${(Math.round(value * 1000) / 10).toFixed(1)}%`;
}
