-- サロン経費管理：月末の支払い管理表
-- その月に払うもの（請求書・支払用紙・口座振替・引き落とし）を手で入れ、期日と実際に払った日を記録する。
-- 請求書などの写真も付けられる（領収書と同じバケット・同じ権限）。
-- 経費（salon_expenses）とは別の管理表。払った日を入れると「支払済み」、期日を過ぎて未払いなら「期日切れ」と表示する。

create table if not exists public.salon_payments (
  id uuid primary key default gen_random_uuid(),
  month date not null check (extract(day from month) = 1),
  shop_id uuid references public.salon_shops(id) on delete restrict, -- null = 全店共通（本部）
  payee text not null check (char_length(trim(payee)) between 1 and 100), -- 支払先
  amount integer not null check (amount >= 0),
  method text not null check (method in ('slip', 'account_transfer', 'auto_debit')), -- 支払用紙・口座振替・引き落とし
  due_date date,  -- 期日
  paid_date date, -- 実際に払った日（入っていれば支払済み）
  note text check (note is null or char_length(note) <= 500),
  -- 請求書・払込票などの写真（非公開バケット salon-receipts。パスは「店舗ID/年-月/…」、全店共通は common/…）
  image_paths text[] not null default '{}' check (cardinality(image_paths) <= 5),
  sort_order integer not null default 0,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_salon_payments_month on public.salon_payments (month, due_date);

create trigger salon_payments_touch before update on public.salon_payments
  for each row execute function public.salon_touch_updated_at();

alter table public.salon_payments enable row level security;
revoke all on public.salon_payments from anon;
grant select, insert, update, delete on public.salon_payments to authenticated;
-- 経費と同じ：その店舗を見られる人（全店共通は店舗を絞っていない人）が読み書きできる
create policy salon_payments_all on public.salon_payments for all to authenticated
  using (public.salon_can_access_shop(shop_id)) with check (public.salon_can_access_shop(shop_id));
