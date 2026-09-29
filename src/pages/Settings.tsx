import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, LogOut, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { useApp } from "@/hooks/useApp";
import { supabase } from "@/lib/supabase";
import type { Category, CategoryKind, Member, Role, Shop } from "@/lib/types";
import { cn, describeError } from "@/lib/utils";

function NameField({ value, disabled, onSave }: { value: string; disabled: boolean; onSave: (next: string) => Promise<void> }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    const next = text.trim();
    if (!next) {
      setText(value);
      return;
    }
    if (next !== value) void onSave(next);
  };
  return (
    <Input
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      className="h-10 min-w-0 flex-1"
    />
  );
}

function ShopsSection() {
  const { shops, isOwner, reloadMaster, colors } = useApp();
  const [newName, setNewName] = useState("");

  const update = async (id: string, patch: Partial<Shop>) => {
    const { error } = await supabase.from("salon_shops").update(patch).eq("id", id);
    if (error) toast.error(`保存できませんでした: ${describeError(error)}`);
    await reloadMaster();
  };

  const move = async (index: number, delta: number) => {
    const target = shops[index + delta];
    const current = shops[index];
    if (!target) return;
    await Promise.all([
      supabase.from("salon_shops").update({ sort_order: target.sort_order }).eq("id", current.id),
      supabase.from("salon_shops").update({ sort_order: current.sort_order === target.sort_order ? current.sort_order + delta : current.sort_order }).eq("id", target.id),
    ]);
    await reloadMaster();
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    const { error } = await supabase.from("salon_shops").insert({ name, sort_order: Math.max(0, ...shops.map((s) => s.sort_order)) + 1 });
    if (error) return toast.error(`追加できませんでした: ${describeError(error)}`);
    setNewName("");
    await reloadMaster();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>店舗</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {shops.map((shop, index) => (
          <div key={shop.id} className={cn("flex items-center gap-2", !shop.is_active && "opacity-60")}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[shop.id] }} />
            <NameField value={shop.name} disabled={!isOwner} onSave={(name) => update(shop.id, { name })} />
            {isOwner && (
              <>
                <button type="button" onClick={() => void move(index, -1)} disabled={index === 0} className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="上へ">
                  <ArrowUp size={16} />
                </button>
                <button type="button" onClick={() => void move(index, 1)} disabled={index === shops.length - 1} className="rounded p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30" aria-label="下へ">
                  <ArrowDown size={16} />
                </button>
                <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <input type="checkbox" checked={shop.is_active} onChange={(e) => void update(shop.id, { is_active: e.target.checked })} />
                  営業中
                </label>
              </>
            )}
          </div>
        ))}
        {isOwner && (
          <div className="flex gap-2 pt-2">
            <Input placeholder="店舗を追加" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-10" />
            <Button variant="outline" onClick={() => void add()} disabled={!newName.trim()}><Plus /> 追加</Button>
          </div>
        )}
        <p className="pt-1 text-xs text-muted-foreground">店舗名はそのまま書き換えられます。閉店した店舗は「営業中」を外すと、過去の経費は残したまま入力の候補から消えます。</p>
      </CardContent>
    </Card>
  );
}

function CategoriesSection() {
  const { categories, isOwner, reloadMaster } = useApp();
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<CategoryKind>("variable");

  const update = async (id: string, patch: Partial<Category>) => {
    const { error } = await supabase.from("salon_expense_categories").update(patch).eq("id", id);
    if (error) toast.error(`保存できませんでした: ${describeError(error)}`);
    await reloadMaster();
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    const sortOrder = Math.max(0, ...categories.filter((c) => c.kind === newKind).map((c) => c.sort_order)) + 5;
    const { error } = await supabase.from("salon_expense_categories").insert({ name, kind: newKind, sort_order: sortOrder });
    if (error) return toast.error(`追加できませんでした: ${describeError(error)}`);
    setNewName("");
    await reloadMaster();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>科目</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {(["fixed", "variable"] as const).map((kind) => (
          <div key={kind}>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">{kind === "fixed" ? "固定費" : "変動費"}</p>
            <div className="space-y-2">
              {categories.filter((c) => c.kind === kind).map((category) => (
                <div key={category.id} className={cn("flex items-center gap-2", !category.is_active && "opacity-60")}>
                  <NameField value={category.name} disabled={!isOwner} onSave={(name) => update(category.id, { name })} />
                  {isOwner && (
                    <>
                      <Select
                        value={category.kind}
                        onChange={(e) => void update(category.id, { kind: e.target.value as CategoryKind })}
                        className="h-10 w-24 shrink-0 text-sm"
                        aria-label="区分"
                      >
                        <option value="fixed">固定費</option>
                        <option value="variable">変動費</option>
                      </Select>
                      <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <input type="checkbox" checked={category.is_active} onChange={(e) => void update(category.id, { is_active: e.target.checked })} />
                        使う
                      </label>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {isOwner && (
          <div className="flex gap-2">
            <Input placeholder="科目を追加" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-10" />
            <Select value={newKind} onChange={(e) => setNewKind(e.target.value as CategoryKind)} className="h-10 w-24 shrink-0 text-sm" aria-label="区分">
              <option value="fixed">固定費</option>
              <option value="variable">変動費</option>
            </Select>
            <Button variant="outline" onClick={() => void add()} disabled={!newName.trim()}><Plus /> 追加</Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">使わない科目は「使う」を外すと、過去の経費は残したまま入力の候補から消えます。</p>
      </CardContent>
    </Card>
  );
}

function MembersSection() {
  const { session, shops } = useApp();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [limitTo, setLimitTo] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("salon_list_members");
    if (error) toast.error(`メンバーを読み込めませんでした: ${describeError(error)}`);
    setMembers((data || []) as Member[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!email.trim()) return;
    setAdding(true);
    const { error } = await supabase.rpc("salon_add_member", {
      p_email: email.trim(),
      p_role: role,
      p_shop_ids: role === "staff" && limitTo.length ? limitTo : null,
    });
    setAdding(false);
    if (error) return toast.error(describeError(error));
    toast.success("メンバーを追加しました");
    setEmail("");
    setLimitTo([]);
    void load();
  };

  const remove = async (member: Member) => {
    if (!window.confirm(`${member.email} をメンバーから外しますか？`)) return;
    const { error } = await supabase.from("salon_members").delete().eq("user_id", member.user_id);
    if (error) return toast.error(`外せませんでした: ${describeError(error)}`);
    void load();
  };

  const shopNames = (ids: string[] | null) =>
    ids ? ids.map((id) => shops.find((s) => s.id === id)?.name ?? "（不明）").join("・") : "全店舗";

  return (
    <Card>
      <CardHeader>
        <CardTitle>メンバー</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <Loader2 className="animate-spin text-primary" />
        ) : (
          <ul className="divide-y rounded-lg border">
            {members.map((member) => (
              <li key={member.user_id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{member.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {member.role === "owner" ? "オーナー（すべて）" : `スタッフ（${shopNames(member.shop_ids)}）`}
                  </p>
                </div>
                {member.user_id !== session?.user.id && (
                  <button type="button" onClick={() => void remove(member)} className="rounded p-1.5 text-muted-foreground hover:bg-muted" aria-label="外す">
                    <Trash2 size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2 rounded-lg bg-muted/60 p-3">
          <Label htmlFor="member-email">メンバーを追加（キャスカンのアカウントのメールアドレス）</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input id="member-email" type="email" placeholder="example@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)} className="h-10 sm:w-40">
              <option value="staff">スタッフ</option>
              <option value="owner">オーナー</option>
            </Select>
            <Button onClick={() => void add()} disabled={adding || !email.trim()}>
              {adding && <Loader2 className="animate-spin" />}追加
            </Button>
          </div>
          {role === "staff" && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <span className="text-muted-foreground">見られる店舗:</span>
              {shops.filter((s) => s.is_active).map((shop) => (
                <label key={shop.id} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={limitTo.includes(shop.id)}
                    onChange={(e) => setLimitTo((prev) => (e.target.checked ? [...prev, shop.id] : prev.filter((id) => id !== shop.id)))}
                  />
                  {shop.name}
                </label>
              ))}
              <span className="text-muted-foreground">（何も選ばなければ全店舗）</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            オーナーは設定の変更とメンバーの管理ができます。スタッフは経費・固定費・売上の入力ができます（店舗を選ぶと、その店舗の分だけ見られます）。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { session, isOwner, member } = useApp();
  return (
    <Layout title="設定">
      <div className="space-y-4">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm">{session?.user.email}</p>
              <p className="text-xs text-muted-foreground">{member?.role === "owner" ? "オーナー" : "スタッフ"}</p>
            </div>
            <Button variant="outline" onClick={() => void supabase.auth.signOut()}>
              <LogOut /> ログアウト
            </Button>
          </CardContent>
        </Card>
        <ShopsSection />
        <CategoriesSection />
        {isOwner && <MembersSection />}
      </div>
    </Layout>
  );
}
