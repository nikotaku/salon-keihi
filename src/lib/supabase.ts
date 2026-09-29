import { createClient } from "@supabase/supabase-js";

// キャスカンと同じSupabaseプロジェクト（公開鍵なのでコードに置いてよい）。ログインもキャスカンと同じアカウント。
// データは salon_* テーブルにあり、salon_members に登録された人だけが読み書きできる。
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://imrxzkivwrkqbhqfbbes.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_T0a9mtOIbupU5n_VAe9caw_xlnbbWfB";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "salon-keihi-auth" },
});

export const RECEIPT_BUCKET = "salon-receipts";
