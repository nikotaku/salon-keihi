-- 美容サロン3店舗（ネイル・国分町サロン・アイラッシュ／アイブロー）の経費を一元管理するサイト（apps/salon-keihi）用。
-- キャスカン（メンエス）とは別のアプリで、store_id / store_isolation の対象外。
-- salon_members に登録された人だけが読み書きできる（ログインはキャスカンと同じアカウント）。

create table public.salon_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  -- null = 全店舗（全店共通の経費を含む）。スタッフを特定の店舗だけに絞るときに使う
  shop_ids uuid[],
  created_at timestamptz not null default now()
);

create table public.salon_shops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.salon_expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  kind text not null default 'variable' check (kind in ('fixed', 'variable')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 毎月決まって出る固定費。「今月分をまとめて計上」で salon_expenses に入れる
create table public.salon_expense_templates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.salon_shops(id) on delete cascade, -- null = 全店共通
  category_id uuid not null references public.salon_expense_categories(id),
  amount integer not null check (amount >= 0),
  day_of_month integer not null default 1 check (day_of_month between 1 and 31),
  payment_method text not null default 'bank_transfer'
    check (payment_method in ('cash', 'card', 'bank_transfer', 'auto_debit', 'other')),
  vendor text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.salon_expenses (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.salon_shops(id) on delete restrict, -- null = 全店共通（本部）
  expense_date date not null,
  category_id uuid not null references public.salon_expense_categories(id),
  amount integer not null check (amount >= 0),
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'card', 'bank_transfer', 'auto_debit', 'other')),
  vendor text,
  description text,
  receipt_path text,
  template_id uuid references public.salon_expense_templates(id) on delete set null,
  template_month date,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 同じ固定費を同じ月に二重計上しない
  unique (template_id, template_month)
);
create index salon_expenses_date_idx on public.salon_expenses (expense_date);
create index salon_expenses_shop_date_idx on public.salon_expenses (shop_id, expense_date);

create table public.salon_monthly_sales (
  shop_id uuid not null references public.salon_shops(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount integer not null default 0 check (amount >= 0),
  customer_count integer check (customer_count >= 0),
  note text,
  updated_at timestamptz not null default now(),
  primary key (shop_id, month)
);

create or replace function public.salon_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger salon_expenses_touch before update on public.salon_expenses
  for each row execute function public.salon_touch_updated_at();
create trigger salon_monthly_sales_touch before update on public.salon_monthly_sales
  for each row execute function public.salon_touch_updated_at();

-- 権限の判定（RLSから呼ぶので security definer）
create or replace function public.salon_role()
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.salon_members m where m.user_id = auth.uid()
$$;

-- p_shop_id が null のときは全店共通の経費
create or replace function public.salon_can_access_shop(p_shop_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.salon_members m
    where m.user_id = auth.uid()
      and (m.role = 'owner' or m.shop_ids is null or (p_shop_id is not null and p_shop_id = any (m.shop_ids)))
  )
$$;

-- 領収書のパスは「店舗ID/年-月/ファイル名」（全店共通は common/…）
create or replace function public.salon_can_access_receipt(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  head text := split_part(p_name, '/', 1);
begin
  if head = 'common' then
    return public.salon_can_access_shop(null);
  end if;
  if head !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.salon_can_access_shop(head::uuid);
end;
$$;

alter table public.salon_members enable row level security;
alter table public.salon_shops enable row level security;
alter table public.salon_expense_categories enable row level security;
alter table public.salon_expense_templates enable row level security;
alter table public.salon_expenses enable row level security;
alter table public.salon_monthly_sales enable row level security;

revoke all on public.salon_members, public.salon_shops, public.salon_expense_categories,
  public.salon_expense_templates, public.salon_expenses, public.salon_monthly_sales from anon;
grant select, insert, update, delete on public.salon_members, public.salon_shops, public.salon_expense_categories,
  public.salon_expense_templates, public.salon_expenses, public.salon_monthly_sales to authenticated;

create policy salon_members_select on public.salon_members for select to authenticated
  using (user_id = auth.uid() or public.salon_role() = 'owner');
create policy salon_members_write on public.salon_members for all to authenticated
  using (public.salon_role() = 'owner') with check (public.salon_role() = 'owner');

create policy salon_shops_select on public.salon_shops for select to authenticated
  using (public.salon_role() is not null);
create policy salon_shops_write on public.salon_shops for all to authenticated
  using (public.salon_role() = 'owner') with check (public.salon_role() = 'owner');

create policy salon_categories_select on public.salon_expense_categories for select to authenticated
  using (public.salon_role() is not null);
create policy salon_categories_write on public.salon_expense_categories for all to authenticated
  using (public.salon_role() = 'owner') with check (public.salon_role() = 'owner');

create policy salon_templates_all on public.salon_expense_templates for all to authenticated
  using (public.salon_can_access_shop(shop_id)) with check (public.salon_can_access_shop(shop_id));

create policy salon_expenses_all on public.salon_expenses for all to authenticated
  using (public.salon_can_access_shop(shop_id)) with check (public.salon_can_access_shop(shop_id));

create policy salon_sales_all on public.salon_monthly_sales for all to authenticated
  using (public.salon_can_access_shop(shop_id)) with check (public.salon_can_access_shop(shop_id));

-- 固定費を指定月にまとめて計上する（計上済みのものは飛ばす）。呼んだ人のRLSで動く
create or replace function public.salon_post_fixed_expenses(p_month date)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  month_start date := date_trunc('month', p_month)::date;
  last_day integer := extract(day from (date_trunc('month', p_month) + interval '1 month - 1 day'))::integer;
  inserted integer;
begin
  insert into public.salon_expenses (
    shop_id, expense_date, category_id, amount, payment_method, vendor, description, template_id, template_month
  )
  select t.shop_id, month_start + (least(t.day_of_month, last_day) - 1), t.category_id, t.amount,
         t.payment_method, t.vendor, t.description, t.id, month_start
  from public.salon_expense_templates t
  where t.is_active
  on conflict (template_id, template_month) do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- メンバー一覧（メールアドレス付き）。オーナーだけ
create or replace function public.salon_list_members()
returns table (user_id uuid, email text, role text, shop_ids uuid[], created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.user_id, u.email::text, m.role, m.shop_ids, m.created_at
  from public.salon_members m
  join auth.users u on u.id = m.user_id
  where public.salon_role() = 'owner'
  order by m.created_at
$$;

-- メールアドレスでメンバーを追加する（キャスカンのアカウントがある人だけ）。オーナーだけ
create or replace function public.salon_add_member(p_email text, p_role text default 'staff', p_shop_ids uuid[] default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
begin
  if public.salon_role() is distinct from 'owner' then
    raise exception 'オーナーだけがメンバーを追加できます' using errcode = '42501';
  end if;
  if p_role not in ('owner', 'staff') then
    raise exception '権限の種類が正しくありません' using errcode = '22023';
  end if;
  select u.id into target from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1;
  if target is null then
    raise exception 'このメールアドレスのアカウントが見つかりません' using errcode = 'P0002';
  end if;
  insert into public.salon_members (user_id, role, shop_ids)
  values (target, p_role, p_shop_ids)
  on conflict (user_id) do update set role = excluded.role, shop_ids = excluded.shop_ids;
  return target;
end;
$$;

revoke execute on function
  public.salon_role(), public.salon_can_access_shop(uuid), public.salon_can_access_receipt(text),
  public.salon_post_fixed_expenses(date), public.salon_list_members(), public.salon_add_member(text, text, uuid[])
  from public, anon;
grant execute on function
  public.salon_role(), public.salon_can_access_shop(uuid), public.salon_can_access_receipt(text),
  public.salon_post_fixed_expenses(date), public.salon_list_members(), public.salon_add_member(text, text, uuid[])
  to authenticated, service_role;

-- 領収書の写真（非公開）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('salon-receipts', 'salon-receipts', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;

create policy salon_receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'salon-receipts' and public.salon_can_access_receipt(name));
create policy salon_receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'salon-receipts' and public.salon_can_access_receipt(name));
create policy salon_receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'salon-receipts' and public.salon_can_access_receipt(name));

-- 初期データ。店舗名・科目は画面の「設定」から変えられる
insert into public.salon_shops (name, sort_order) values
  ('ネイルサロン', 1),
  ('国分町サロン（パーソナルネイル）', 2),
  ('アイラッシュ・アイブロー', 3);

insert into public.salon_expense_categories (name, kind, sort_order) values
  ('家賃', 'fixed', 10),
  ('水道光熱費', 'fixed', 20),
  ('通信費（ネット・電話）', 'fixed', 30),
  ('広告費（ホットペッパー等の掲載料）', 'fixed', 40),
  ('予約・レジシステム利用料', 'fixed', 50),
  ('リース料', 'fixed', 60),
  ('保険料', 'fixed', 70),
  ('給与', 'fixed', 80),
  ('材料費（ネイル）', 'variable', 110),
  ('材料費（まつげ・眉）', 'variable', 120),
  ('消耗品費', 'variable', 130),
  ('備品・器具', 'variable', 140),
  ('業務委託費・歩合', 'variable', 150),
  ('決済手数料', 'variable', 160),
  ('広告費（単発）', 'variable', 170),
  ('交通費', 'variable', 180),
  ('接待交際費', 'variable', 190),
  ('研修・講習費', 'variable', 200),
  ('修繕費', 'variable', 210),
  ('雑費', 'variable', 220);

-- キャスカンのオーナーを最初のオーナーにする（あとから画面でメンバーを追加できる）
insert into public.salon_members (user_id, role)
select distinct us.user_id, 'owner' from public.user_stores us where us.role = 'owner'
on conflict (user_id) do nothing;
