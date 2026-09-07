-- Ottodot Trial Booking — Postgres / Supabase schema
-- Capacity is 4 per trial class. Enforced via transaction + SELECT FOR UPDATE.
-- Duplicate confirmed bookings prevented via partial unique index.

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- Parents
create table if not exists parents (
  id text primary key,
  name text not null,
  email text not null unique,
  created_at timestamptz not null default now()
);

-- Students
create table if not exists students (
  id text primary key,
  parent_id text not null references parents(id) on delete cascade,
  name text not null,
  age int not null check (age between 3 and 18),
  created_at timestamptz not null default now()
);
create index if not exists idx_students_parent on students(parent_id);

-- Trial classes (capacity always 4 for trial, but stored explicitly)
create table if not exists trial_classes (
  id text primary key,
  title text not null,
  subject text not null,
  starts_at timestamptz not null,
  capacity int not null check (capacity = 4),
  teacher_name text not null,
  created_at timestamptz not null default now()
);

-- Bookings
create table if not exists bookings (
  id text primary key,
  student_id text not null references students(id) on delete cascade,
  trial_class_id text not null references trial_classes(id) on delete cascade,
  parent_id text not null references parents(id) on delete cascade,
  status text not null check (status in ('pending_payment','confirmed','payment_failed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_bookings_class_status on bookings(trial_class_id, status);
create index if not exists idx_bookings_student_class on bookings(student_id, trial_class_id);

-- Prevent duplicate CONFIRMED bookings for same child+class (allows re-try after failed/cancelled)
create unique index if not exists uniq_confirmed_booking
  on bookings(student_id, trial_class_id)
  where status = 'confirmed';

-- Prevent duplicate pending as well if desired: uncomment to also guard at DB level
-- create unique index if not exists uniq_pending_booking
--   on bookings(student_id, trial_class_id)
--   where status = 'pending_payment';

-- Payment attempts (audit trail)
create table if not exists payment_attempts (
  id text primary key,
  booking_id text not null references bookings(id) on delete cascade,
  status text not null check (status in ('pending','succeeded','failed')),
  amount_cents int not null,
  provider_ref text,
  created_at timestamptz not null default now()
);
create index if not exists idx_payments_booking on payment_attempts(booking_id);

-- Updated_at trigger
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_bookings_updated_at on bookings;
create trigger trg_bookings_updated_at
  before update on bookings for each row execute function set_updated_at();

-- -------------------------------------------------
-- Transactional confirmation logic (the source of truth)
-- Call this from your API inside a transaction instead of ad-hoc UPDATE.
-- Handles: duplicate check, capacity check with row lock, idempotency.
-- -------------------------------------------------
create or replace function confirm_booking(p_booking_id text, p_provider_ref text, p_amount_cents int)
returns table (booking_id text, new_status text) as $$
declare
  v_class_id text;
  v_student_id text;
  v_status text;
  v_confirmed_count int;
  v_capacity int;
begin
  -- Lock the booking row
  select trial_class_id, student_id, status
    into v_class_id, v_student_id, v_status
  from bookings where id = p_booking_id for update;

  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_status = 'confirmed' then
    -- idempotent
    return query select p_booking_id, v_status;
    return;
  end if;

  if v_status != 'pending_payment' then
    raise exception 'INVALID_STATUS: %', v_status using errcode = 'P0001';
  end if;

  -- Lock the class row to serialize capacity checks (pessimistic locking)
  select capacity into v_capacity from trial_classes where id = v_class_id for update;
  if not found then
    raise exception 'CLASS_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Duplicate confirmed check (also enforced by partial unique index, but check early for nice error)
  if exists (
    select 1 from bookings
    where student_id = v_student_id and trial_class_id = v_class_id and status = 'confirmed'
  ) then
    raise exception 'DUPLICATE_BOOKING' using errcode = '23505';
  end if;

  -- Capacity check
  select count(*) into v_confirmed_count
  from bookings where trial_class_id = v_class_id and status = 'confirmed';

  if v_confirmed_count >= v_capacity then
    raise exception 'CLASS_FULL' using errcode = 'P0001';
  end if;

  -- Confirm
  update bookings set status = 'confirmed' where id = p_booking_id;

  insert into payment_attempts (id, booking_id, status, amount_cents, provider_ref)
  values (gen_random_uuid()::text, p_booking_id, 'succeeded', p_amount_cents, p_provider_ref);

  return query select p_booking_id, 'confirmed'::text;
end;
$$ language plpgsql;

-- Example usage:
-- begin;
-- select * from confirm_booking('bk_xxx', 'mock_ref_123', 99000);
-- commit;
