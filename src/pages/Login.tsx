import { useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [mode, setMode] = useState<"link" | "password">("link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const address = email.trim();
    // 登録済み（オーナーに招待された）人だけにリンクを送る。知らないアドレスで勝手にアカウントは作らない
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/` },
    });
    setLoading(false);
    if (otpError) {
      setError(
        /signups not allowed|not found/i.test(otpError.message)
          ? "このメールアドレスは登録されていません。オーナーに招待してもらってください"
          : /rate limit|security purposes/i.test(otpError.message)
            ? "続けて送りすぎています。少し待ってからもう一度お試しください"
            : "リンクを送れませんでした。もう一度お試しください",
      );
      return;
    }
    setSentTo(address);
  };

  const signInWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (signInError) setError("メールアドレスかパスワードが違います");
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-5 p-6">
          <div>
            <p className="text-xs text-muted-foreground">ネイル・国分町サロン・アイラッシュ・アイブロー</p>
            <h1 className="text-xl font-bold">サロン経費管理</h1>
          </div>

          {sentTo ? (
            <div className="space-y-4 text-sm">
              <div className="flex items-start gap-3 rounded-lg bg-muted/60 p-3">
                <MailCheck className="mt-0.5 shrink-0 text-primary" size={20} />
                <p>
                  <span className="font-semibold">{sentTo}</span> にログイン用のリンクを送りました。メールを開いてリンクを押すとログインできます。
                </p>
              </div>
              <p className="text-xs text-muted-foreground">届かないときは迷惑メールフォルダも確認してください。</p>
              <Button variant="outline" className="w-full" onClick={() => setSentTo(null)}>
                メールアドレスを入れ直す
              </Button>
            </div>
          ) : (
            <form onSubmit={mode === "link" ? sendLink : signInWithPassword} className="space-y-4">
              <div>
                <Label htmlFor="email">メールアドレス</Label>
                <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              {mode === "password" && (
                <div>
                  <Label htmlFor="password">パスワード</Label>
                  <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading && <Loader2 className="animate-spin" />}
                {mode === "link" ? "ログインリンクを送る" : "ログイン"}
              </Button>
            </form>
          )}

          {!sentTo && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-2"
              onClick={() => {
                setMode(mode === "link" ? "password" : "link");
                setError(null);
              }}
            >
              {mode === "link" ? "パスワードでログイン（キャスカンのアカウント）" : "メールのリンクでログイン"}
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
