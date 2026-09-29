import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
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
          <form onSubmit={submit} className="space-y-4">
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
              {loading && <Loader2 className="animate-spin" />}ログイン
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">キャスカンと同じメールアドレス・パスワードでログインできます。</p>
        </CardContent>
      </Card>
    </div>
  );
}
