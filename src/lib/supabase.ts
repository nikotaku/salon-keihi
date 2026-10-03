import { createClient } from "@supabase/supabase-js";

// 経費管理専用のSupabaseプロジェクト（salon-keihi。公開鍵なのでコードに置いてよい）。キャスカンとは別。
// データは salon_* テーブルにあり、salon_members に登録された人だけが読み書きできる。
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://rvkqbxahwlzcyburvjvw.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_PP5H2bkdGQ72P0BzkM9qVA_DhxxvQnm";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "salon-keihi-auth" },
});

export const RECEIPT_BUCKET = "salon-receipts";
