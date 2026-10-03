-- メールアドレスだけでメンバーを招待するための補助関数。
-- Edge Function（salon-invite-member、service_role）からだけ呼ぶ。画面からは呼べない。
create or replace function public.salon_user_id_by_email(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1
$$;

revoke execute on function public.salon_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.salon_user_id_by_email(text) to service_role;
