// 店舗ごとの売上・経費・利益の集計。全店共通（shop_id が null）の経費は「共通」として別に数え、
// 全店の利益からだけ引く（どの店舗にも按分しない）。
import type { Category, CategoryKind, Expense, MonthlySales, Shop } from "./types.ts";

export const COMMON_KEY = "common";
export const COMMON_LABEL = "全店共通";

export const shopKey = (shopId: string | null) => shopId ?? COMMON_KEY;

export interface ShopSummary {
  key: string;
  name: string;
  sales: number | null; // 売上未入力は null
  customers: number | null;
  expenses: number;
  profit: number | null;
  margin: number | null;
}

export interface MonthSummary {
  shops: ShopSummary[];
  common: number;
  total: {
    sales: number;
    expenses: number;
    profit: number;
    margin: number | null;
    salesMissing: string[]; // 売上が未入力の店舗名
  };
  byKind: Record<CategoryKind, number>;
  byCategory: Array<{ categoryId: string; name: string; kind: CategoryKind | null; amount: number }>;
}

const inMonth = (date: string, month: string) => date.startsWith(`${month}-`);
const salesMonth = (row: MonthlySales) => row.month.slice(0, 7);

export function summarizeMonth(input: {
  month: string;
  shops: Shop[];
  categories: Category[];
  expenses: Expense[];
  sales: MonthlySales[];
}): MonthSummary {
  const expenses = input.expenses.filter((e) => inMonth(e.expense_date, input.month));
  const sales = input.sales.filter((s) => salesMonth(s) === input.month);
  const categoryById = new Map(input.categories.map((c) => [c.id, c]));

  const spentBy = new Map<string, number>();
  for (const e of expenses) spentBy.set(shopKey(e.shop_id), (spentBy.get(shopKey(e.shop_id)) ?? 0) + e.amount);

  // 休止中の店舗も、その月に経費や売上があれば出す
  const shops = input.shops.filter((shop) =>
    shop.is_active || spentBy.has(shop.id) || sales.some((s) => s.shop_id === shop.id)
  );

  const shopRows: ShopSummary[] = shops.map((shop) => {
    const row = sales.find((s) => s.shop_id === shop.id);
    const spent = spentBy.get(shop.id) ?? 0;
    const salesAmount = row ? row.amount : null;
    const profit = salesAmount === null ? null : salesAmount - spent;
    return {
      key: shop.id,
      name: shop.name,
      sales: salesAmount,
      customers: row?.customer_count ?? null,
      expenses: spent,
      profit,
      margin: salesAmount && profit !== null ? profit / salesAmount : null,
    };
  });

  const totalSales = shopRows.reduce((sum, r) => sum + (r.sales ?? 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const profit = totalSales - totalExpenses;

  const byKind: Record<CategoryKind, number> = { fixed: 0, variable: 0 };
  const byCategoryMap = new Map<string, number>();
  for (const e of expenses) {
    const kind = categoryById.get(e.category_id)?.kind;
    if (kind) byKind[kind] += e.amount;
    byCategoryMap.set(e.category_id, (byCategoryMap.get(e.category_id) ?? 0) + e.amount);
  }
  const byCategory = [...byCategoryMap.entries()]
    .map(([categoryId, amount]) => ({
      categoryId,
      amount,
      name: categoryById.get(categoryId)?.name ?? "（削除された科目）",
      kind: categoryById.get(categoryId)?.kind ?? null,
    }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "ja"));

  return {
    shops: shopRows,
    common: spentBy.get(COMMON_KEY) ?? 0,
    total: {
      sales: totalSales,
      expenses: totalExpenses,
      profit,
      margin: totalSales > 0 ? profit / totalSales : null,
      salesMissing: shopRows.filter((r) => r.sales === null && shops.find((s) => s.id === r.key)?.is_active).map((r) => r.name),
    },
    byKind,
    byCategory,
  };
}

export interface TrendPoint {
  month: string;
  sales: number;
  expenses: number;
  profit: number;
  // 店舗キー（全店共通は "common"）ごとの経費
  byShop: Record<string, number>;
}

export function monthlyTrend(input: { months: string[]; expenses: Expense[]; sales: MonthlySales[] }): TrendPoint[] {
  return input.months.map((month) => {
    const byShop: Record<string, number> = {};
    let expenses = 0;
    for (const e of input.expenses) {
      if (!inMonth(e.expense_date, month)) continue;
      byShop[shopKey(e.shop_id)] = (byShop[shopKey(e.shop_id)] ?? 0) + e.amount;
      expenses += e.amount;
    }
    const sales = input.sales.filter((s) => salesMonth(s) === month).reduce((sum, s) => sum + s.amount, 0);
    return { month, sales, expenses, profit: sales - expenses, byShop };
  });
}

// 前月比（前月が0なら出さない）
export function changeRatio(current: number, previous: number) {
  return previous > 0 ? (current - previous) / previous : null;
}

// グラフの色。店舗は並び順で固定の色を持つ（絞り込んでも色が変わらない）。全店共通は4番目の色
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const COMMON_COLOR = "#eda100";

export function shopColors(shops: Shop[]) {
  const ordered = [...shops].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "ja"));
  const colors: Record<string, string> = { [COMMON_KEY]: COMMON_COLOR };
  ordered.forEach((shop, index) => {
    colors[shop.id] = SERIES[index % SERIES.length];
  });
  return colors;
}
