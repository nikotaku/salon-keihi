// サロン経費管理：オーナーがメールアドレスを登録すると、その人用のログインリンクを発行して返す。
// メールは送らない（Supabase 標準のメールはプロジェクトのメンバー宛にしか届かないため）。
// 返したリンクをオーナーが LINE などで本人に送り、本人がリンクを押すとそのままログインできる。
// - まだアカウントがない人 → アカウントを作ってからリンクを発行
// - もうアカウントがある人 → リンクだけ発行
// どちらも salon_members に登録（resend のときは登録内容は変えずにリンクだけ発行し直す）。
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = ["https://salon-keihi-j6uh.vercel.app", "https://salon-keihi.vercel.app", "http://localhost:8081"];
const DEFAULT_REDIRECT = "https://salon-keihi-j6uh.vercel.app/";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST だけ受け付けます" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // 呼んだ人がオーナーか確認
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: caller, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !caller.user) return json({ error: "ログインし直してください" }, 401);
  const { data: me } = await admin.from("salon_members").select("role").eq("user_id", caller.user.id).maybeSingle();
  if (me?.role !== "owner") return json({ error: "オーナーだけがメンバーを招待できます" }, 403);

  let body: { email?: string; role?: string; shop_ids?: string[] | null; redirect_to?: string; resend?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "送られた内容が読めません" }, 400);
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ error: "メールアドレスが正しくありません" }, 400);
  const role = body.role === "owner" ? "owner" : "staff";
  const shopIds = role === "staff" && Array.isArray(body.shop_ids) && body.shop_ids.length ? body.shop_ids : null;
  const redirectTo = body.redirect_to && ALLOWED_ORIGINS.some((o) => body.redirect_to!.startsWith(o + "/") || body.redirect_to === o)
    ? body.redirect_to
    : DEFAULT_REDIRECT;

  const { data: existingId, error: lookupError } = await admin.rpc("salon_user_id_by_email", { p_email: email });
  if (lookupError) return json({ error: `確認できませんでした: ${lookupError.message}` }, 500);

  let userId = existingId as string | null;
  const created = !userId;

  // 発行し直しはメンバーだけ（先に確認してから発行する）
  if (body.resend) {
    if (!userId) return json({ error: "このメールアドレスはまだ登録されていません" }, 404);
    const { data: member } = await admin.from("salon_members").select("user_id").eq("user_id", userId).maybeSingle();
    if (!member) return json({ error: "この人はメンバーではありません" }, 404);
  }

  if (!userId) {
    // 新しい人：メール確認済みのアカウントを作る（メールは送らない）
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error || !data.user) return json({ error: `アカウントを作れませんでした: ${error?.message ?? "不明なエラー"}` }, 400);
    userId = data.user.id;
  }

  if (!body.resend) {
    const { error } = await admin
      .from("salon_members")
      .upsert({ user_id: userId, role, shop_ids: shopIds }, { onConflict: "user_id" });
    if (error) return json({ error: `メンバーに登録できませんでした: ${error.message}` }, 500);
  }

  // ログインリンクを発行（メールは送られない）。アプリが ?token_hash=…&type=magiclink を受け取ってログインする
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const hashed = link?.properties?.hashed_token;
  if (linkError || !hashed) return json({ error: `ログインリンクを作れませんでした: ${linkError?.message ?? "不明なエラー"}` }, 400);

  const loginUrl = new URL(redirectTo);
  loginUrl.searchParams.set("token_hash", hashed);
  loginUrl.searchParams.set("type", "magiclink");

  return json({ ok: true, mode: created ? "created" : "existing", user_id: userId, login_url: loginUrl.toString() });
});
