import assert from "node:assert/strict";
import test from "node:test";

import { commissionOf, NO_TYPE, parseRate, rateFor, staffCommission } from "../src/lib/commission.ts";
import type { CommissionRates, SalesType } from "../src/lib/types.ts";

const types: SalesType[] = [
  { id: "ticket", shop_id: "k", name: "回数券", sort_order: 1, is_active: true },
  { id: "trial", shop_id: "k", name: "初回体験", sort_order: 2, is_active: true },
  { id: "single", shop_id: "k", name: "都度払い", sort_order: 3, is_active: true },
];

const rates: CommissionRates = {
  defaults: { ticket: 30, trial: 50 },
  perStaff: { anzu: { ticket: 40 } },
};

test("％は人ごと → 種類の標準 の順に使い、どちらもなければ null", () => {
  assert.deepEqual(rateFor(rates, "anzu", "ticket"), { rate: 40, source: "staff" });
  assert.deepEqual(rateFor(rates, "anzu", "trial"), { rate: 50, source: "default" });
  assert.deepEqual(rateFor(rates, "kouga", "ticket"), { rate: 30, source: "default" });
  assert.deepEqual(rateFor(rates, "anzu", "single"), { rate: null, source: null });
});

test("歩合は1円未満切り捨て（小数の％でもずれない）", () => {
  assert.equal(commissionOf(56000, 40), 22400);
  assert.equal(commissionOf(3000, 33.33), 999);
  assert.equal(commissionOf(1000, 12.5), 125);
  assert.equal(commissionOf(0, 50), 0);
});

test("スタッフの歩合：種類ごとに足し、％のない種類と種類なしは合計に入れず別に数える", () => {
  const entries = [
    { staff_id: "anzu", type_id: "ticket", amount: 56000 },
    { staff_id: "anzu", type_id: "ticket", amount: 72000 },
    { staff_id: "anzu", type_id: "trial", amount: 3000 },
    { staff_id: "anzu", type_id: "single", amount: 8000 },
    { staff_id: "anzu", type_id: null, amount: 3000 },
    { staff_id: "anzu", type_id: "deleted-type", amount: 1000 },
    { staff_id: "kouga", type_id: "ticket", amount: 5000 },
  ];
  const r = staffCommission({ staffId: "anzu", entries, types, rates });
  assert.deepEqual(r.rows.map((x) => [x.typeId, x.sales, x.count, x.rate, x.commission]), [
    ["ticket", 128000, 2, 40, 51200],
    ["trial", 3000, 1, 50, 1500],
    ["single", 8000, 1, null, null],
    [NO_TYPE, 4000, 2, null, null],
  ]);
  assert.equal(r.sales, 143000);
  assert.equal(r.commission, 52700);
  assert.equal(r.unsetSales, 12000);
});

test("売上のない種類は出さない（showEmpty なら使っている種類だけ0円で出す）", () => {
  const r = staffCommission({ staffId: "kouga", entries: [], types, rates });
  assert.equal(r.rows.length, 0);
  const all = staffCommission({ staffId: "kouga", entries: [], types: [...types, { ...types[0], id: "old", is_active: false }], rates, showEmpty: true });
  assert.deepEqual(all.rows.map((x) => x.typeId), ["ticket", "trial", "single"]);
});

test("％の入力：空は null、全角や％付きも読む、範囲外は invalid", () => {
  assert.equal(parseRate(""), null);
  assert.equal(parseRate("４０％"), 40);
  assert.equal(parseRate("12.5"), 12.5);
  assert.equal(parseRate("101"), "invalid");
  assert.equal(parseRate("abc"), "invalid");
  assert.equal(parseRate("1.234"), "invalid");
});
