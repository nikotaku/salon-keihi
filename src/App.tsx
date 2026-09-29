import { Navigate, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useApp } from "@/hooks/useApp";
import { supabase } from "@/lib/supabase";
import Dashboard from "@/pages/Dashboard";
import Expenses from "@/pages/Expenses";
import FixedCosts from "@/pages/FixedCosts";
import Login from "@/pages/Login";
import Sales from "@/pages/Sales";
import Settings from "@/pages/Settings";

function NoAccess({ email }: { email: string | undefined }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 p-6 text-sm">
          <h1 className="text-lg font-bold">このアカウントはまだ使えません</h1>
          <p className="text-muted-foreground">
            {email} はサロン経費管理のメンバーに登録されていません。オーナーに「設定 → メンバー」から追加してもらってください。
          </p>
          <Button variant="outline" className="w-full" onClick={() => void supabase.auth.signOut()}>
            別のアカウントでログイン
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function App() {
  const { session, authLoading, member, memberLoading } = useApp();

  if (authLoading || (session && memberLoading)) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );
  }
  if (!session) return <Login />;
  if (!member) return <NoAccess email={session.user.email} />;

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/expenses" element={<Expenses />} />
      <Route path="/fixed" element={<FixedCosts />} />
      <Route path="/sales" element={<Sales />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
