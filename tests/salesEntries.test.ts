import assert from "node:assert/strict";
import test from "node:test";

import { enteredAtLabel, groupEntriesByDate, totalsByShop } from "../src/lib/salesEntries.ts";
import type { SalesEntry } from "../src/lib/types.ts";

const entry = (id: string, shop: string, date: string, amount: number, customers: number | null, created: string): SalesEntry => ({
  id, shop_id: shop, sales_date: date, amount, customer_count: customers, note: null, created_at: created,
});

const entries = [
  entry("a", "nail", "2026-10-03", 30000, 3, "2026-10-03T12:00:00Z"),
  entry("b", "lash", "2026-10-05", 20000, null, "2026-10-05T10:00:00Z"),
  entry("c", "nail", "2026-10-05", 15000, 2, "2026-10-05T11:00:00Z"),
  entry("d", "nail", "2026-10-03", 5000, 1, "2026-10-03T13:00:00Z"),
];

test("日付の新しい順に日ごとにまとめ、日の合計を出す", () => {
  const groups = groupEntriesByDate(entries);
  assert.deepEqual(groups.map((g) => g.date), ["2026-10-05", "2026-10-03"]);
  assert.equal(groups[0].amount, 35000);
  assert.deepEqual(groups[0].rows.map((r) => r.id), ["c", "b"]); // 同じ日は新しく入れた順
  assert.equal(groups[1].amount, 35000);
});

test("店舗ごとの合計・入力した日数・客数（客数が無い店舗は null）", () => {
  const totals = totalsByShop(entries);
  assert.deepEqual(totals.get("nail"), { amount: 50000, days: 2, customers: 6 });
  assert.deepEqual(totals.get("lash"), { amount: 20000, days: 1, customers: null });
});

test("入力した日時は日本時間", () => {
  assert.equal(enteredAtLabel("2026-10-05T15:30:00Z"), "10/6 00:30");
  assert.equal(enteredAtLabel("bad"), "");
});
