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

export interface Member {
  user_id: string;
  email: string;
  role: Role;
  shop_ids: string[] | null;
  created_at: string;
}
