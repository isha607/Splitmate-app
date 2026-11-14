-- ============ SPLITMATE MVP SCHEMA ============
-- All money is stored as BIGINT PAISE (₹1 = 100). Never floats.

-- ---------- 1. TABLES ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  email text,
  avatar_url text,
  upi_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  description text,
  room_code text not null unique,
  room_type text not null default 'other'
    check (room_type in ('trip','groceries','flatmates','friends','family','event','other')),
  created_by uuid not null references public.profiles(id),
  currency text not null default 'INR',
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now()
);

create table public.room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  status text not null default 'active' check (status in ('active','left','removed')),
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);
create index on public.room_members (user_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  description text,
  total_amount bigint not null check (total_amount > 0),
  currency text not null default 'INR',
  category text not null default 'other',
  paid_by uuid not null references public.profiles(id),
  split_method text not null default 'equal'
    check (split_method in ('equal','unequal','percentage','exact','shares','item')),
  created_by uuid not null references public.profiles(id),
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.expenses (room_id, created_at desc);

create table public.expense_participants (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  allocated_amount bigint not null check (allocated_amount >= 0),
  unique (expense_id, user_id)
);
create index on public.expense_participants (user_id);

-- Append-only ledger: rows are never deleted. Corrections = new rows later.
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  expense_id uuid not null references public.expenses(id) on delete cascade,
  payer_id uuid not null references public.profiles(id),
  receiver_id uuid not null references public.profiles(id),
  amount bigint not null check (amount > 0),
  payment_method text not null default 'upi'
    check (payment_method in ('upi','bank_transfer','cash','other')),
  status text not null default 'pending' check (status in ('pending','confirmed','reversed')),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  check (payer_id <> receiver_id)
);
create index on public.settlements (expense_id);
create index on public.settlements (room_id, created_at desc);

-- ---------- 2. PROFILE AUTO-CREATE ON SIGNUP ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 3. HELPER FUNCTIONS (used by security rules) ----------
create or replace function public.is_room_member(p_room uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from room_members
                 where room_id = p_room and user_id = auth.uid() and status = 'active');
$$;

create or replace function public.is_room_admin(p_room uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from room_members
                 where room_id = p_room and user_id = auth.uid()
                   and status = 'active' and role in ('owner','admin'));
$$;

-- ---------- 4. ROW LEVEL SECURITY ----------
alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_participants enable row level security;
alter table public.settlements enable row level security;

-- Profiles: see yourself and people who share a room with you; edit only yourself
create policy "profiles_select" on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from room_members a join room_members b on a.room_id = b.room_id
    where a.user_id = auth.uid() and a.status = 'active' and b.user_id = profiles.id)
);
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Everything else: read-only for members. ALL writes go through the functions below.
create policy "rooms_select" on public.rooms for select to authenticated
  using (public.is_room_member(id));
create policy "room_members_select" on public.room_members for select to authenticated
  using (public.is_room_member(room_id));
create policy "expenses_select" on public.expenses for select to authenticated
  using (public.is_room_member(room_id));
create policy "participants_select" on public.expense_participants for select to authenticated
  using (exists (select 1 from expenses e
                 where e.id = expense_id and public.is_room_member(e.room_id)));
create policy "settlements_select" on public.settlements for select to authenticated
  using (public.is_room_member(room_id));

-- Defense in depth: block direct writes and anonymous access
revoke all on all tables in schema public from anon;
revoke insert, update, delete on public.rooms, public.room_members, public.expenses,
  public.expense_participants, public.settlements from authenticated;

-- ---------- 5. ACTIONS (all validation happens here, on the server) ----------
create or replace function public.create_room(
  p_name text, p_description text default null, p_type text default 'other')
returns public.rooms language plpgsql security definer set search_path = public, extensions as $$
declare
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text; v_suffix text; v_room rooms; i int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  loop
    v_suffix := '';
    for i in 1..6 loop
      v_suffix := v_suffix || substr(v_chars, 1 + (get_byte(gen_random_bytes(1), 0) % 32), 1);
    end loop;
    v_code := upper(left(p_type, 4)) || v_suffix;
    begin
      insert into rooms (name, description, room_type, room_code, created_by)
      values (trim(p_name), p_description, p_type, v_code, auth.uid())
      returning * into v_room;
      exit;
    exception when unique_violation then null; -- code clash, try again
    end;
  end loop;
  insert into room_members (room_id, user_id, role) values (v_room.id, auth.uid(), 'owner');
  return v_room;
end $$;

-- Lets someone see a room BEFORE joining (name, type, member count only)
create or replace function public.preview_room(p_code text)
returns table (name text, room_type text, member_count bigint)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  return query
    select r.name, r.room_type,
           (select count(*) from room_members m where m.room_id = r.id and m.status = 'active')
    from rooms r where r.room_code = upper(trim(p_code)) and r.status = 'active';
end $$;

create or replace function public.join_room(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_room rooms; v_m room_members;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into v_room from rooms where room_code = upper(trim(p_code));
  if not found then raise exception 'Invalid room code'; end if;
  if v_room.status <> 'active' then raise exception 'This room is closed'; end if;
  select * into v_m from room_members where room_id = v_room.id and user_id = auth.uid();
  if found then
    if v_m.status = 'removed' then raise exception 'You were removed from this room'; end if;
    update room_members set status = 'active' where id = v_m.id;
  else
    insert into room_members (room_id, user_id) values (v_room.id, auth.uid());
  end if;
  return v_room.id;  -- joining never touches existing expenses
end $$;

-- p_shares = [{"user_id": "...", "amount": 50000}, ...] (paise, computed by splitEngine.ts)
create or replace function public.create_expense(
  p_room uuid, p_title text, p_description text, p_total bigint, p_category text,
  p_paid_by uuid, p_split_method text, p_shares jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_count int; v_sum bigint; v_bad int;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if not is_room_member(p_room) then raise exception 'You are not in this room'; end if;
  if not exists (select 1 from rooms where id = p_room and status = 'active') then
    raise exception 'This room is closed'; end if;
  if p_total is null or p_total <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if jsonb_typeof(p_shares) <> 'array' then raise exception 'Invalid shares'; end if;
  if not exists (select 1 from room_members where room_id = p_room
                 and user_id = p_paid_by and status = 'active') then
    raise exception 'Payer must be a room member'; end if;

  select count(*), coalesce(sum((x->>'amount')::bigint), 0)
    into v_count, v_sum from jsonb_array_elements(p_shares) x;
  if v_count = 0 then raise exception 'Select at least one participant'; end if;
  if v_sum <> p_total then raise exception 'Shares (%) must add up to the total (%)', v_sum, p_total; end if;

  select count(*) into v_bad from jsonb_array_elements(p_shares) x
   where (x->>'amount')::bigint < 0
      or not exists (select 1 from room_members m where m.room_id = p_room
                     and m.user_id = (x->>'user_id')::uuid and m.status = 'active');
  if v_bad > 0 then raise exception 'Invalid participant or negative amount'; end if;

  insert into expenses (room_id, title, description, total_amount, category,
                        paid_by, split_method, created_by)
  values (p_room, trim(p_title), p_description, p_total, coalesce(p_category,'other'),
          p_paid_by, p_split_method, auth.uid())
  returning id into v_id;

  insert into expense_participants (expense_id, user_id, allocated_amount)
  select v_id, x.user_id, x.amount
  from jsonb_to_recordset(p_shares) as x(user_id uuid, amount bigint);

  return v_id;
end $$;

-- Debtor says "I paid" -> pending. Creditor/admin records directly -> confirmed.
create or replace function public.create_settlement(
  p_expense uuid, p_payer uuid, p_amount bigint, p_method text default 'upi')
returns uuid language plpgsql security definer set search_path = public as $$
declare e expenses; v_remaining bigint; v_status text; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into e from expenses where id = p_expense;
  if not found or not is_room_member(e.room_id) then raise exception 'Expense not found'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if p_payer = e.paid_by then raise exception 'The payer of the bill does not owe themselves'; end if;

  select ep.allocated_amount - coalesce((select sum(amount) from settlements
           where expense_id = p_expense and payer_id = p_payer and status = 'confirmed'), 0)
    into v_remaining
    from expense_participants ep where ep.expense_id = p_expense and ep.user_id = p_payer;
  if v_remaining is null then raise exception 'That person is not part of this expense'; end if;
  if p_amount > v_remaining then raise exception 'Amount is more than the remaining balance'; end if;

  if auth.uid() = p_payer then v_status := 'pending';
  elsif auth.uid() = e.paid_by or is_room_admin(e.room_id) then v_status := 'confirmed';
  else raise exception 'Not allowed';
  end if;

  insert into settlements (room_id, expense_id, payer_id, receiver_id, amount, payment_method,
                           status, confirmed_by, confirmed_at)
  values (e.room_id, p_expense, p_payer, e.paid_by, p_amount, p_method, v_status,
          case when v_status = 'confirmed' then auth.uid() end,
          case when v_status = 'confirmed' then now() end)
  returning id into v_id;
  return v_id;
end $$;

-- "Yes, Received" button. Locks the row, so double-clicks can't confirm twice.
create or replace function public.confirm_settlement(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s settlements; v_remaining bigint;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into s from settlements where id = p_id for update;
  if not found or not is_room_member(s.room_id) then raise exception 'Payment not found'; end if;
  if auth.uid() = s.payer_id then raise exception 'You cannot confirm your own payment'; end if;
  if not (auth.uid() = s.receiver_id or is_room_admin(s.room_id)) then
    raise exception 'Only the person being paid can confirm'; end if;
  if s.status <> 'pending' then raise exception 'This payment was already processed'; end if;

  select ep.allocated_amount - coalesce((select sum(amount) from settlements
           where expense_id = s.expense_id and payer_id = s.payer_id and status = 'confirmed'), 0)
    into v_remaining from expense_participants ep
   where ep.expense_id = s.expense_id and ep.user_id = s.payer_id;
  if s.amount > v_remaining then raise exception 'Amount exceeds remaining balance'; end if;

  update settlements set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
   where id = p_id;
end $$;

-- ---------- 6. WHO OWES WHOM (calculated from real allocations + confirmed payments) ----------
create view public.expense_debts with (security_invoker = true) as
select ep.expense_id, e.room_id,
       ep.user_id  as debtor_id,
       e.paid_by   as creditor_id,
       ep.allocated_amount as owed,
       coalesce(p.paid, 0) as paid,
       ep.allocated_amount - coalesce(p.paid, 0) as remaining
from expense_participants ep
join expenses e on e.id = ep.expense_id and e.status = 'active'
left join lateral (
  select sum(s.amount) as paid from settlements s
  where s.expense_id = ep.expense_id and s.payer_id = ep.user_id and s.status = 'confirmed'
) p on true
where ep.user_id <> e.paid_by;

-- ---------- 7. PERMISSIONS + REALTIME ----------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant select on public.expense_debts to authenticated;

alter publication supabase_realtime add table
  public.expenses, public.settlements, public.room_members;