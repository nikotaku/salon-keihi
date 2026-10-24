import assert from "node:assert/strict";
import test from "node:test";

import { copyForNextMonth, paymentStatus, shiftDateByMonths, sortPayments, summarizePayments, todayInTokyo } from "../src/lib/payments.ts";
import type { Payment } from "../src/lib/types.ts";

const payment = (id: string, patch: Partial<Payment> = {}): Payment => ({
  id, month: "2026-10-01", shop_id: null, payee: id, amount: 10000, method: "slip",
  due_date: null, paid_date: null, note: null, image_paths: [], sort_order: 0, created_at: "2026-10-01T00:00:00Z", ...patch,
});

test("状態：払った日があれば支払済み、期日を過ぎたら期日切れ、3日以内はもうすぐ", () => {
  const today = "2026-10-24";
  assert.equal(paymentStatus({ due_date: "2026-10-20", paid_date: "2026-10-19" }, today), "paid");
  assert.equal(paymentStatus({ due_date: "2026-10-23", paid_date: null }, today), "overdue");
  assert.equal(paymentStatus({ due_date: "2026-10-24", paid_date: null }, today), "due_soon");
  assert.equal(paymentStatus({ due_date: "2026-10-27", paid_date: null }, today), "due_soon");
  assert.equal(paymentStatus({ due_date: "2026-10-28", paid_date: null }, today), "unpaid");
  assert.equal(paymentStatus({ due_date: null, paid_date: null }, today), "unpaid");
});

test("並び：未払いを期日の早い順（期日なしは後ろ）、支払済みは最後", () => {
  const rows = sortPayments([
    payment("paid", { due_date: "2026-10-01", paid_date: "2026-10-01" }),
    payment("none"),
    payment("late", { due_date: "2026-10-31" }),
    payment("early", { due_date: "2026-10-10" }),
  ]);
  assert.deepEqual(rows.map((r) => r.id), ["early", "late", "none", "paid"]);
});

test("合計：支払済み・残り・期日切れの件数・区分ごと", () => {
  const summary = summarizePayments([
    payment("a", { amount: 30000, method: "slip", paid_date: "2026-10-05" }),
    payment("b", { amount: 20000, method: "account_transfer", due_date: "2026-10-20" }),
    payment("c", { amount: 5000, method: "auto_debit", due_date: "2026-10-30" }),
  ], "2026-10-24");
  assert.equal(summary.total, 55000);
  assert.equal(summary.paid, 30000);
  assert.equal(summary.remaining, 25000);
  assert.equal(summary.paidCount, 1);
  assert.equal(summary.overdueCount, 1);
  assert.deepEqual(summary.byKind, { slip: 30000, account_transfer: 20000, auto_debit: 5000 });
});

test("日付を1か月ずらす（月末は合わせる・年をまたぐ）", () => {
  assert.equal(shiftDateByMonths("2026-10-27", 1), "2026-11-27");
  assert.equal(shiftDateByMonths("2026-10-31", 1), "2026-11-30");
  assert.equal(shiftDateByMonths("2026-12-31", 2), "2027-02-28");
});

test("前月から写す：期日は1か月後、払った日・写真は写さない", () => {
  const [copied] = copyForNextMonth([payment("家賃", { amount: 150000, method: "account_transfer", due_date: "2026-10-27", paid_date: "2026-10-27", note: "A棟", image_paths: ["common/2026-10/a.jpg"] })], "2026-11");
  assert.deepEqual(copied, {
    month: "2026-11-01", shop_id: null, payee: "家賃", amount: 150000, method: "account_transfer",
    due_date: "2026-11-27", paid_date: null, note: "A棟", sort_order: 0,
  });
});

test("日本時間の今日", () => {
  assert.equal(todayInTokyo(new Date("2026-10-24T16:00:00Z")), "2026-10-25");
  assert.equal(todayInTokyo(new Date("2026-10-24T14:59:00Z")), "2026-10-24");
});
