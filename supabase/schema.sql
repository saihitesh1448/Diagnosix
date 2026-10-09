-- Diagnosix — the "secure database" half of sign-in.
--
-- Run this in the Supabase dashboard (SQL Editor -> New query -> paste -> Run).
-- It creates the tables that hold family health records and locks every one of
-- them down so an account can only ever touch its own rows. Safe to run again:
-- every statement is idempotent, so a half-finished run can simply be repeated.
--
-- Why this is the part that actually protects the data:
--   * The key shipped to the browser is public, so it protects nothing by
--     itself. Row-level security is what stands between one family's records
--     and everybody else's.
--   * `owner` defaults to `auth.uid()` and every policy re-checks it, so a
--     modified client cannot write rows on someone else's behalf.
--   * No policy exists for anonymous visitors, so signed-out requests read
--     exactly nothing.

-- ---------------------------------------------------------------- patients --
create table if not exists public.patients (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  relation   text,
  sex        text,
  created_at timestamptz not null default now()
);

alter table public.patients enable row level security;

drop policy if exists "patients: read own"   on public.patients;
drop policy if exists "patients: insert own" on public.patients;
drop policy if exists "patients: update own" on public.patients;
drop policy if exists "patients: delete own" on public.patients;

create policy "patients: read own"   on public.patients for select using (auth.uid() = owner);
create policy "patients: insert own" on public.patients for insert with check (auth.uid() = owner);
create policy "patients: update own" on public.patients for update using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "patients: delete own" on public.patients for delete using (auth.uid() = owner);

create index if not exists patients_owner_idx on public.patients (owner, created_at desc);

-- ---------------------------------------------------------------- readings --
create table if not exists public.readings (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  patient_id  uuid not null references public.patients (id) on delete cascade,
  marker_id   text not null,
  label       text not null,
  value       double precision,
  unit        text,
  status      text,
  source      text,
  verified    boolean not null default false,
  recorded_at timestamptz not null default now()
);

alter table public.readings enable row level security;

drop policy if exists "readings: read own"   on public.readings;
drop policy if exists "readings: insert own" on public.readings;
drop policy if exists "readings: update own" on public.readings;
drop policy if exists "readings: delete own" on public.readings;

create policy "readings: read own"   on public.readings for select using (auth.uid() = owner);
create policy "readings: insert own" on public.readings for insert with check (auth.uid() = owner);
create policy "readings: update own" on public.readings for update using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "readings: delete own" on public.readings for delete using (auth.uid() = owner);

-- The trend graph asks for one patient's history, newest last.
create index if not exists readings_patient_recorded_idx on public.readings (patient_id, recorded_at);

-- ---------------------------------------------------------------- symptoms --
create table if not exists public.symptoms (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  patient_id  uuid not null references public.patients (id) on delete cascade,
  symptom_id  text not null,
  recorded_at timestamptz not null default now()
);

alter table public.symptoms enable row level security;

drop policy if exists "symptoms: read own"   on public.symptoms;
drop policy if exists "symptoms: insert own" on public.symptoms;
drop policy if exists "symptoms: update own" on public.symptoms;
drop policy if exists "symptoms: delete own" on public.symptoms;

create policy "symptoms: read own"   on public.symptoms for select using (auth.uid() = owner);
create policy "symptoms: insert own" on public.symptoms for insert with check (auth.uid() = owner);
create policy "symptoms: update own" on public.symptoms for update using (auth.uid() = owner) with check (auth.uid() = owner);
create policy "symptoms: delete own" on public.symptoms for delete using (auth.uid() = owner);

create index if not exists symptoms_patient_idx on public.symptoms (patient_id, recorded_at desc);
