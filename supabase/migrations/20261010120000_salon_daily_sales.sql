-- サロン経費管理：売上を日付ごとに入れる
-- 今までは店舗ごとの月合計（salon_monthly_sales）だけだったので、いつの売上がいくらか分からなかった。
-- salon_sales_entries に日付ごとの売上を入れ、月合計はトリガーで自動で足し上げる（ダッシュボード・利益は今まで通り月合計を見る）。
-- 日ごとの入力が1件もない月は、今まで通り月合計を直接入れた値のまま。

create table if not exists public.salon_sales_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.salon_shops(id) on delete cascade,
  sales_date date not null,
  amount integer not null check (amount >= 0),
  customer_count integer check (customer_count >= 0),
  note text check (note is null or char_length(note) <= 500),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_salon_sales_entries_shop_date on public.salon_sales_entries (shop_id, sales_date);

create trigger salon_sales_entries_touch before update on public.salon_sales_entries
  for each row execute function public.salon_touch_updated_at();

alter table public.salon_sales_entries enable row level security;
revoke all on public.salon_sales_entries from anon;
grant select, insert, update, delete on public.salon_sales_entries to authenticated;
create policy salon_sales_entries_all on public.salon_sales_entries for all to authenticated
  using (public.salon_can_access_shop(shop_id)) with check (public.salon_can_access_shop(shop_id));

-- その店舗・その月の日ごとの売上を足して、月合計に入れる
create or replace function public.salon_sync_monthly_sales(p_shop_id uuid, p_month date)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_count integer;
  v_amount bigint;
  v_customers bigint;
begin
  select count(*), coalesce(sum(amount), 0), sum(customer_count)
  into v_count, v_amount, v_customers
  from public.salon_sales_entries
  where shop_id = p_shop_id and sales_date >= v_month and sales_date < (v_month + interval '1 month');

  if v_count = 0 then
    -- 日ごとの入力を全部消した月は0円にする（月合計の行は残す）
    update public.salon_monthly_sales set amount = 0, customer_count = null
    where shop_id = p_shop_id and month = v_month;
    return;
  end if;

  insert into public.salon_monthly_sales (shop_id, month, amount, customer_count)
  values (p_shop_id, v_month, least(v_amount, 2147483647)::integer, v_customers::integer)
  on conflict (shop_id, month) do update
  set amount = excluded.amount, customer_count = excluded.customer_count;
end
$$;

create or replace function public.salon_sales_entries_sync()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.salon_sync_monthly_sales(old.shop_id, old.sales_date);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.salon_sync_monthly_sales(new.shop_id, new.sales_date);
  end if;
  return null;
end
$$;

revoke all on function public.salon_sync_monthly_sales(uuid, date) from public, anon, authenticated;
revoke all on function public.salon_sales_entries_sync() from public, anon, authenticated;

create trigger salon_sales_entries_sync
  after insert or update or delete on public.salon_sales_entries
  for each row execute function public.salon_sales_entries_sync();
