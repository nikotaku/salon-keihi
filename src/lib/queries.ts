import { supabase } from "./supabase";
import type { Expense, ExpenseTemplate, MonthlySales, Payment, SalesEntry, Staff, StaffSalesEntry } from "./types";

export const EXPENSE_COLUMNS =
  "id,shop_id,expense_date,category_id,amount,payment_method,vendor,description,receipt_path,template_id,created_at";

const PAGE = 1000;

// PostgRESTは1回に1000行までしか返さないので、ページを分けて全部読む
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

export function fetchExpenses(fromDate: string, toDate: string) {
  return fetchAll<Expense>((from, to) =>
    supabase
      .from("salon_expenses")
      .select(EXPENSE_COLUMNS)
      .gte("expense_date", fromDate)
      .lte("expense_date", toDate)
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to),
  );
}

// fromMonth / toMonth は YYYY-MM
export function fetchSales(fromMonth: string, toMonth: string) {
  return fetchAll<MonthlySales>((from, to) =>
    supabase
      .from("salon_monthly_sales")
      .select("shop_id,month,amount,customer_count,note")
      .gte("month", `${fromMonth}-01`)
      .lte("month", `${toMonth}-01`)
      .order("month")
      .range(from, to),
  );
}

export const SALES_ENTRY_COLUMNS = "id,shop_id,sales_date,amount,customer_count,note,created_at";

// 日付ごとの売上（fromDate / toDate は YYYY-MM-DD）
export function fetchSalesEntries(fromDate: string, toDate: string) {
  return fetchAll<SalesEntry>((from, to) =>
    supabase
      .from("salon_sales_entries")
      .select(SALES_ENTRY_COLUMNS)
      .gte("sales_date", fromDate)
      .lte("sales_date", toDate)
      .order("sales_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to),
  );
}

// スタッフ一覧（使わないスタッフも含む。並び順どおり）
export async function fetchStaff() {
  const { data, error } = await supabase
    .from("salon_staff")
    .select("id,shop_id,name,sort_order,is_active")
    .order("sort_order")
    .order("created_at");
  if (error) throw error;
  return (data || []) as Staff[];
}

export const STAFF_SALES_COLUMNS = "id,shop_id,staff_id,sales_date,amount,customer_count,note,created_at";

// スタッフごとの日別売上（fromDate / toDate は YYYY-MM-DD）
export function fetchStaffSalesEntries(fromDate: string, toDate: string) {
  return fetchAll<StaffSalesEntry>((from, to) =>
    supabase
      .from("salon_staff_sales_entries")
      .select(STAFF_SALES_COLUMNS)
      .gte("sales_date", fromDate)
      .lte("sales_date", toDate)
      .order("sales_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to),
  );
}

export const PAYMENT_COLUMNS = "id,month,shop_id,payee,amount,method,due_date,paid_date,note,image_paths,sort_order,created_at";

// 月末の支払い管理表（month は YYYY-MM）
export function fetchPayments(month: string) {
  return fetchAll<Payment>((from, to) =>
    supabase
      .from("salon_payments")
      .select(PAYMENT_COLUMNS)
      .eq("month", `${month}-01`)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at")
      .range(from, to),
  );
}

export async function fetchTemplates() {
  const { data, error } = await supabase
    .from("salon_expense_templates")
    .select("id,shop_id,category_id,amount,day_of_month,payment_method,vendor,description,is_active")
    .order("day_of_month")
    .order("created_at");
  if (error) throw error;
  return (data || []) as ExpenseTemplate[];
}

// その月にもう計上した固定費（template_id）
export async function fetchPostedTemplateIds(month: string) {
  const { data, error } = await supabase
    .from("salon_expenses")
    .select("template_id")
    .eq("template_month", `${month}-01`)
    .not("template_id", "is", null);
  if (error) throw error;
  return new Set(((data || []) as Array<{ template_id: string }>).map((row) => row.template_id));
}
