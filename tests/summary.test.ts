import assert from "node:assert/strict";
import test from "node:test";

import {
  compactYen,
  defaultDateFor,
  monthEnd,
  parseAmount,
  recentMonths,
  shiftMonth,
} from "../src/lib/format.ts";
import { changeRatio, COMMON_KEY, monthlyTrend, shopColors, summarizeMonth } from "../src/lib/summary.ts";
import type { Category, Expense, MonthlySales, Shop } from "../src/lib/types.ts";

const shops: Shop[] = [
  { id: "nail", name: "ネイルサロン", sort_order: 1, is_active: true },
  { id: "kokubun", name: "国分町サロン", sort_order: 2, is_active: true },
  { id: "lash", name: "アイラッシュ", sort_order: 3, is_active: true },
];
const categories: Category[] = [
  { id: "rent", name: "家賃", kind: "fixed", sort_order: 1, is_active: true },
  { id: "material", name: "材料費", kind: "variable", sort_order: 2, is_active: true },
];
const expense = (shop_id: string | null, expense_date: string, category_id: string, amount: number): Expense => ({
  id: `${shop_id}-${expense_date}-${amount}`,
  shop_id,
  expense_date,
  category_id,
  amount,
  payment_method: "cash",
  vendor: null,
  description: null,
  receipt_path: null,
  template_id: null,
  created_at: "",
});
const sale = (shop_id: string, month: string, amount: number): MonthlySales => ({
  shop_id,
  month: `${month}-01`,
  amount,
  customer_count: null,
  note: null,
});

test("月の切り替えは年をまたいでも正しい", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.deepEqual(recentMonths("2026-02", 3), ["2025-12", "2026-01", "2026-02"]);
  assert.equal(monthEnd("2028-02"), "2028-02-29");
});

test("金額の入力は全角・カンマ・円を読める", () => {
  assert.equal(parseAmount("１２，０００円"), 12000);
  assert.equal(parseAmount("¥3,500"), 3500);
  assert.equal(parseAmount("12.5"), null);
  assert.equal(parseAmount(""), null);
});

test("目盛りは万単位で短くする", () => {
  assert.equal(compactYen(1_200_000), "120万");
  assert.equal(compactYen(15_000), "1.5万");
  assert.equal(compactYen(800), "800");
});

test("新しい経費の日付は、今月なら今日・それ以外は月初", () => {
  const now = new Date(2026, 8, 28);
  assert.equal(defaultDateFor("2026-09", now), "2026-09-28");
  assert.equal(defaultDateFor("2026-08", now), "2026-08-01");
});

test("店舗ごとの利益と、全店共通の経費は全体からだけ引く", () => {
  const summary = summarizeMonth({
    month: "2026-09",
    shops,
    categories,
    expenses: [
      expense("nail", "2026-09-01", "rent", 100_000),
      expense("nail", "2026-09-15", "material", 20_000),
      expense("lash", "2026-09-10", "material", 30_000),
      expense(null, "2026-09-05", "material", 10_000),
      expense("nail", "2026-08-31", "rent", 999_999), // 前月分は数えない
    ],
    sales: [sale("nail", "2026-09", 500_000), sale("lash", "2026-09", 200_000), sale("nail", "2026-08", 1)],
  });
  const nail = summary.shops.find((s) => s.key === "nail")!;
  assert.equal(nail.expenses, 120_000);
  assert.equal(nail.profit, 380_000);
  assert.equal(nail.margin, 0.76);
  const kokubun = summary.shops.find((s) => s.key === "kokubun")!;
  assert.equal(kokubun.sales, null);
  assert.equal(kokubun.profit, null);
  assert.equal(summary.common, 10_000);
  assert.equal(summary.total.sales, 700_000);
  assert.equal(summary.total.expenses, 160_000);
  assert.equal(summary.total.profit, 540_000);
  assert.deepEqual(summary.total.salesMissing, ["国分町サロン"]);
  assert.deepEqual(summary.byKind, { fixed: 100_000, variable: 60_000 });
  assert.equal(summary.byCategory[0].categoryId, "rent");
});

test("休止中の店舗は、その月に動きがなければ出さない", () => {
  const withClosed = [...shops, { id: "closed", name: "旧店舗", sort_order: 9, is_active: false }];
  const quiet = summarizeMonth({ month: "2026-09", shops: withClosed, categories, expenses: [], sales: [] });
  assert.equal(quiet.shops.some((s) => s.key === "closed"), false);
  const busy = summarizeMonth({
    month: "2026-09",
    shops: withClosed,
    categories,
    expenses: [expense("closed", "2026-09-02", "rent", 5_000)],
    sales: [],
  });
  assert.equal(busy.shops.some((s) => s.key === "closed"), true);
  assert.deepEqual(busy.total.salesMissing, ["ネイルサロン", "国分町サロン", "アイラッシュ"]);
});

test("月別の推移は店舗ごと・全店共通ごとに経費を分ける", () => {
  const trend = monthlyTrend({
    months: ["2026-08", "2026-09"],
    expenses: [expense("nail", "2026-08-03", "rent", 1_000), expense(null, "2026-09-03", "rent", 500)],
    sales: [sale("nail", "2026-09", 3_000)],
  });
  assert.deepEqual(trend[0].byShop, { nail: 1_000 });
  assert.deepEqual(trend[1].byShop, { [COMMON_KEY]: 500 });
  assert.equal(trend[1].profit, 2_500);
});

test("前月比は前月が0なら出さない", () => {
  assert.equal(changeRatio(120, 100), 0.2);
  assert.equal(changeRatio(120, 0), null);
});

test("店舗の色は並び順で決まり、全店共通は別の色", () => {
  const colors = shopColors([...shops].reverse());
  assert.equal(colors.nail, "#2a78d6");
  assert.equal(colors.kokubun, "#eb6834");
  assert.equal(colors.lash, "#1baf7a");
  assert.equal(colors[COMMON_KEY], "#eda100");
});

test("店舗ごと：その店舗の経費だけを数え、全店共通やほかの店舗は入れない", async () => {
  const { summarizeShopMonth } = await import("../src/lib/summary.ts");
  const expenses = [
    expense("nail", "2026-10-03", "rent", 100000),
    expense("nail", "2026-10-20", "material", 20000),
    expense("lash", "2026-10-05", "material", 9999),
    expense(null, "2026-10-05", "rent", 50000),
    expense("nail", "2026-09-30", "material", 7777),
  ];
  const sales = [{ ...sale("nail", "2026-10", 400000), customer_count: 80 }, sale("lash", "2026-10", 1)];
  const s = summarizeShopMonth({ shopId: "nail", month: "2026-10", categories, expenses, sales });
  assert.equal(s.expenses, 120000);
  assert.equal(s.sales, 400000);
  assert.equal(s.profit, 280000);
  assert.equal(s.margin, 0.7);
  assert.equal(s.perCustomer, 5000);
  assert.deepEqual(s.byKind, { fixed: 100000, variable: 20000 });
  assert.deepEqual(s.byCategory.map((c) => [c.name, c.amount]), [["家賃", 100000], ["材料費", 20000]]);
});

test("店舗ごと：売上が未入力の月は売上・利益・客単価が空", async () => {
  const { summarizeShopMonth } = await import("../src/lib/summary.ts");
  const s = summarizeShopMonth({ shopId: "kokubun", month: "2026-10", categories, expenses: [expense("kokubun", "2026-10-01", "rent", 1000)], sales: [] });
  assert.equal(s.sales, null);
  assert.equal(s.profit, null);
  assert.equal(s.margin, null);
  assert.equal(s.perCustomer, null);
  assert.equal(s.expenses, 1000);
});

test("店舗ごとの推移：月ごとに売上・経費・利益を出す", async () => {
  const { shopTrend } = await import("../src/lib/summary.ts");
  const t = shopTrend({
    shopId: "nail",
    months: ["2026-09", "2026-10"],
    expenses: [expense("nail", "2026-09-10", "rent", 300), expense("nail", "2026-10-10", "rent", 500), expense("lash", "2026-10-10", "rent", 99)],
    sales: [sale("nail", "2026-10", 2000)],
  });
  assert.deepEqual(t, [
    { month: "2026-09", sales: null, expenses: 300, profit: null },
    { month: "2026-10", sales: 2000, expenses: 500, profit: 1500 },
  ]);
});
