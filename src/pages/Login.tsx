import { useState } from "react";
import { KeyRound, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  // ホーム画面に追加したアプリでは、メールのリンクがSafariで開いてしまうので、パスワードでも入れるようにする
  const [mode, setMode] = useState<"link" | "password">("link");
  const [password, setPassword] = useState("");

  const signInWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (signInError) {
      setError(
        /invalid login credentials/i.test(signInError.message)
          ? "メールアドレスかパスワードが違います。パスワードをまだ決めていなければ、ログインリンクで入ってから「設定」で決めてください"
          : /rate limit|security purposes/i.test(signInError.message)
            ? "続けて試しすぎています。少し待ってからもう一度お試しください"
            : "ログインできませんでした。もう一度お試しください",
      );
    }
  };

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

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-5 p-6">
          <div>
            <p className="brand-eyebrow">SALON MANAGEMENT</p>
            <h1 className="mt-1 font-serif text-xl font-semibold tracking-widest">サロン管理</h1>
            <p className="mt-1 text-xs text-muted-foreground">ネイル・国分町サロン・アイラッシュ・アイブロー</p>
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
          ) : mode === "password" ? (
            <form onSubmit={signInWithPassword} className="space-y-4">
              <div>
                <Label htmlFor="email">メールアドレス</Label>
                <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="password">パスワード</Label>
                <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading && <Loader2 className="animate-spin" />}
                ログイン
              </Button>
            </form>
          ) : (
            <form onSubmit={sendLink} className="space-y-4">
              <div>
                <Label htmlFor="email">メールアドレス</Label>
                <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" size="lg" className="w-full" disabled={loading}>
                {loading && <Loader2 className="animate-spin" />}
                ログインリンクを送る
              </Button>
            </form>
          )}

          {!sentTo && (
            <div className="space-y-3 border-t pt-4">
              <p className="text-xs text-muted-foreground">
                {mode === "link"
                  ? "招待されたメールアドレスを入れると、ログイン用のリンクが届きます。"
                  : "パスワードは、ログインしたあと「設定」→「ログイン用パスワード」で決められます。"}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  setMode(mode === "link" ? "password" : "link");
                  setError(null);
                }}
              >
                {mode === "link" ? <><KeyRound /> パスワードでログイン</> : <><MailCheck /> メールのリンクでログイン</>}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
