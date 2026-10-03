import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { isMonthKey, monthKeyOf } from "@/lib/format";
import { COMMON_KEY, COMMON_LABEL, shopColors } from "@/lib/summary";
import type { Category, Expense, Role, Shop } from "@/lib/types";

interface Membership {
  role: Role;
  shop_ids: string[] | null;
}

interface AppState {
  session: Session | null;
  authLoading: boolean;
  member: Membership | null;
  memberLoading: boolean;
  isOwner: boolean;
  shops: Shop[];
  categories: Category[];
  colors: Record<string, string>;
  // 入力できる店舗（スタッフを店舗で絞っているときはその店舗だけ）
  usableShops: Shop[];
  canUseCommon: boolean;
  shopName: (shopId: string | null) => string;
  reloadMaster: () => Promise<void>;
  month: string;
  setMonth: (month: string) => void;
  // 経費を保存・削除したら増える。各画面はこれを見て読み直す
  dataVersion: number;
  bumpData: () => void;
  expenseDialog: { open: boolean; expense: Expense | null };
  openExpense: (expense?: Expense | null) => void;
  closeExpense: () => void;
}

const AppContext = createContext<AppState | null>(null);

const MONTH_KEY = "salon-keihi:month";

function initialMonth() {
  try {
    const saved = sessionStorage.getItem(MONTH_KEY);
    if (isMonthKey(saved)) return saved;
  } catch {
    // 保存できない環境では今月から
  }
  return monthKeyOf(new Date());
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [member, setMember] = useState<Membership | null>(null);
  const [memberLoading, setMemberLoading] = useState(true);
  const [shops, setShops] = useState<Shop[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [month, setMonthState] = useState(initialMonth);
  const [dataVersion, setDataVersion] = useState(0);
  const [expenseDialog, setExpenseDialog] = useState<{ open: boolean; expense: Expense | null }>({ open: false, expense: null });

  useEffect(() => {
    // メールのログインリンク（?token_hash=…&type=…）で開かれたら、その場でログインする
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const type = params.get("type");
    if (tokenHash && (type === "magiclink" || type === "invite" || type === "email" || type === "signup")) {
      window.history.replaceState(null, "", window.location.pathname);
      void supabase.auth.verifyOtp({ token_hash: tokenHash, type: type === "magiclink" || type === "signup" ? "email" : type });
    }
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAuthLoading(false);
    });
    void supabase.auth.getSession().then(({ data: { session: current } }) => {
      setSession(current);
      setAuthLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id ?? null;

  const reloadMaster = useCallback(async () => {
    const [shopRes, categoryRes] = await Promise.all([
      supabase.from("salon_shops").select("id,name,sort_order,is_active").order("sort_order").order("name"),
      supabase.from("salon_expense_categories").select("id,name,kind,sort_order,is_active").order("sort_order").order("name"),
    ]);
    setShops((shopRes.data || []) as Shop[]);
    setCategories((categoryRes.data || []) as Category[]);
  }, []);

  useEffect(() => {
    if (!userId) {
      setMember(null);
      setMemberLoading(false);
      return;
    }
    let active = true;
    setMemberLoading(true);
    void (async () => {
      const { data } = await supabase.from("salon_members").select("role,shop_ids").eq("user_id", userId).maybeSingle();
      if (!active) return;
      setMember((data as Membership | null) ?? null);
      if (data) await reloadMaster();
      if (active) setMemberLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [userId, reloadMaster]);

  const setMonth = useCallback((next: string) => {
    setMonthState(next);
    try {
      sessionStorage.setItem(MONTH_KEY, next);
    } catch {
      // 保存できなくても画面の切り替えはできる
    }
  }, []);

  const value = useMemo<AppState>(() => {
    const isOwner = member?.role === "owner";
    const restricted = !isOwner && member?.shop_ids ? new Set(member.shop_ids) : null;
    const usableShops = shops.filter((shop) => shop.is_active && (!restricted || restricted.has(shop.id)));
    const names = new Map(shops.map((shop) => [shop.id, shop.name]));
    return {
      session,
      authLoading,
      member,
      memberLoading,
      isOwner,
      shops,
      categories,
      colors: shopColors(shops),
      usableShops,
      canUseCommon: Boolean(member) && !restricted,
      shopName: (shopId) => (shopId === null || shopId === COMMON_KEY ? COMMON_LABEL : names.get(shopId) ?? "（不明な店舗）"),
      reloadMaster,
      month,
      setMonth,
      dataVersion,
      bumpData: () => setDataVersion((v) => v + 1),
      expenseDialog,
      openExpense: (expense) => setExpenseDialog({ open: true, expense: expense ?? null }),
      closeExpense: () => setExpenseDialog((prev) => ({ ...prev, open: false })),
    };
  }, [session, authLoading, member, memberLoading, shops, categories, reloadMaster, month, setMonth, dataVersion, expenseDialog]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp は AppProvider の中で使ってください");
  return context;
}
