export type Role = "owner" | "staff";

export type PaymentMethod = "cash" | "card" | "bank_transfer" | "auto_debit" | "other";

export type CategoryKind = "fixed" | "variable";

export interface Shop {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  sort_order: number;
  is_active: boolean;
}

export interface Expense {
  id: string;
  shop_id: string | null;
  expense_date: string;
  category_id: string;
  amount: number;
  payment_method: PaymentMethod;
  vendor: string | null;
  description: string | null;
  receipt_path: string | null;
  template_id: string | null;
  created_at: string;
}

export interface ExpenseTemplate {
  id: string;
  shop_id: string | null;
  category_id: string;
  amount: number;
  day_of_month: number;
  payment_method: PaymentMethod;
  vendor: string | null;
  description: string | null;
  is_active: boolean;
}

export interface MonthlySales {
  shop_id: string;
  month: string;
  amount: number;
  customer_count: number | null;
  note: string | null;
}

// 日付ごとの売上（月合計 salon_monthly_sales はDBのトリガーが自動で足し上げる）
export interface SalesEntry {
  id: string;
  shop_id: string;
  staff_id: string | null; // 担当（だれの売上か）。任意
  type_id: string | null; // 種類（回数券・体験など）。歩合の計算に使う。任意
  sales_date: string;
  amount: number;
  customer_count: number | null;
  note: string | null;
  created_at: string;
}

export interface Member {
  user_id: string;
  email: string;
  role: Role;
  shop_ids: string[] | null;
  created_at: string;
}

// 店舗のスタッフ（施術者）。アプリにログインしない人も名前だけで登録できる
export interface Staff {
  id: string;
  shop_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

// スタッフごとの日別売上（店舗の売上のうち担当が入っているもの。店舗の合計・利益にも入る）
export interface StaffSalesEntry {
  id: string;
  shop_id: string;
  staff_id: string;
  type_id: string | null;
  sales_date: string;
  amount: number;
  customer_count: number | null;
  note: string | null;
  created_at: string;
}

// 月末の支払い管理表（支払用紙・口座振替・引き落とし）
export type PaymentKind = "slip" | "account_transfer" | "auto_debit";

export interface Payment {
  id: string;
  month: string;
  shop_id: string | null;
  payee: string;
  amount: number;
  method: PaymentKind;
  due_date: string | null;
  paid_date: string | null;
  note: string | null;
  image_paths: string[];
  sort_order: number;
  created_at: string;
}

// 売上の種類（店舗ごと。例：回数券・月額コース・初回体験）。歩合はこの種類ごとに決める
export interface SalesType {
  id: string;
  shop_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

// 歩合（％）。種類の標準と、人ごと。人ごとがあればそちらを使う（オーナーだけ読める）
export interface CommissionRates {
  defaults: Record<string, number>; // type_id -> ％
  perStaff: Record<string, Record<string, number>>; // staff_id -> type_id -> ％
}
