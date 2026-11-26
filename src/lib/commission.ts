// 個人の歩合の計算（画面とテストで共通）
import type { CommissionRates, SalesType } from "./types.ts";

export const NO_TYPE = "__none__";

export interface CommissionRow {
  typeId: string; // NO_TYPE は「種類なし」
  name: string;
  sales: number; // その種類の売上合計
  count: number; // 件数
  rate: number | null; // 使う％（人ごと → 種類の標準）。決まっていなければ null
  rateSource: "staff" | "default" | null;
  commission: number | null; // 歩合（円・1円未満切り捨て）。％がなければ null
}

export interface StaffCommission {
  staffId: string;
  sales: number;
  commission: number; // ％が決まっている分の合計
  unsetSales: number; // ％が決まっていない（種類なしを含む）売上
  rows: CommissionRow[];
}

/** 使う％：人ごとに決めてあればそれ、なければ種類の標準。どちらもなければ null */
export function rateFor(rates: CommissionRates, staffId: string, typeId: string) {
  const own = rates.perStaff[staffId]?.[typeId];
  if (own != null) return { rate: own, source: "staff" as const };
  const def = rates.defaults[typeId];
  if (def != null) return { rate: def, source: "default" as const };
  return { rate: null, source: null };
}

/** 1円未満は切り捨て（浮動小数の誤差で 1 円ずれないよう、0.01％単位の整数で計算） */
export function commissionOf(amount: number, rate: number) {
  return Math.floor((amount * Math.round(rate * 100)) / 10000);
}

/**
 * スタッフ1人ぶんの歩合。entries はその月・その店舗の売上（担当つき）。
 * 種類の並びは types の順。売上のない種類は出さない（showEmpty なら出す）。
 */
export function staffCommission(input: {
  staffId: string;
  entries: { staff_id: string | null; type_id: string | null; amount: number }[];
  types: SalesType[];
  rates: CommissionRates;
  showEmpty?: boolean;
}): StaffCommission {
  const mine = input.entries.filter((e) => e.staff_id === input.staffId);
  const sums = new Map<string, { sales: number; count: number }>();
  for (const entry of mine) {
    const key = entry.type_id && input.types.some((t) => t.id === entry.type_id) ? entry.type_id : NO_TYPE;
    const cur = sums.get(key) ?? { sales: 0, count: 0 };
    cur.sales += entry.amount;
    cur.count += 1;
    sums.set(key, cur);
  }
  const rows: CommissionRow[] = [];
  for (const type of input.types) {
    const sum = sums.get(type.id);
    if (!sum && !(input.showEmpty && type.is_active)) continue;
    const { rate, source } = rateFor(input.rates, input.staffId, type.id);
    const sales = sum?.sales ?? 0;
    rows.push({
      typeId: type.id,
      name: type.name,
      sales,
      count: sum?.count ?? 0,
      rate,
      rateSource: source,
      commission: rate == null ? null : commissionOf(sales, rate),
    });
  }
  const none = sums.get(NO_TYPE);
  if (none) rows.push({ typeId: NO_TYPE, name: "種類なし", sales: none.sales, count: none.count, rate: null, rateSource: null, commission: null });
  return {
    staffId: input.staffId,
    sales: rows.reduce((s, r) => s + r.sales, 0),
    commission: rows.reduce((s, r) => s + (r.commission ?? 0), 0),
    unsetSales: rows.filter((r) => r.commission == null).reduce((s, r) => s + r.sales, 0),
    rows,
  };
}

/** 入力された％を読む（空なら null。0〜100、小数2桁まで） */
export function parseRate(text: string): number | null | "invalid" {
  const t = text.normalize("NFKC").replace(/[%％\s]/g, "");
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return "invalid";
  const n = Number(t);
  return n >= 0 && n <= 100 ? n : "invalid";
}
