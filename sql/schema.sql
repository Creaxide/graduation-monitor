-- =============================================================================
-- Sistem Monitoring Kelulusan Mahasiswa - Database Schema
-- Backend: Supabase (PostgreSQL)
-- Run this in the Supabase SQL Editor.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Reference / master tables
-- ---------------------------------------------------------------------------

create table if not exists programs (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,
  name        text not null,
  total_sks   int  not null default 144,
  created_at  timestamptz default now()
);

create table if not exists advisors (
  id          uuid primary key default gen_random_uuid(),
  kode_dosen  text unique not null,
  name        text not null,
  created_at  timestamptz default now()
);

create table if not exists profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  full_name    text,
  role         text not null default 'dosen_aa'
                 check (role in ('dosen_aa','kaprodi')),
  advisor_id   uuid references advisors (id) on delete set null,
  created_at   timestamptz default now()
);

create table if not exists students (
  id            uuid primary key default gen_random_uuid(),
  nim           text unique not null,
  name          text not null,
  program_id    uuid references programs (id) on delete set null,
  advisor_id    uuid references advisors (id) on delete set null,
  angkatan      int,
  current_semester int not null default 1 check (current_semester between 1 and 14),
  status         text not null default 'aktif'
                   check (status in ('aktif','cuti','lulus','do')),
  total_sks_passed int not null default 0,
  comserv_hours    numeric not null default 0,
  sat_hours        numeric not null default 0,
  belingua_status  text not null default 'belum_ambil'
                     check (belingua_status in ('belum_ambil','proses','lulus')),
  belingua_score   numeric,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create index if not exists idx_students_advisor on students (advisor_id);
create index if not exists idx_students_program on students (program_id);

-- Requirement targets: total required + normative cumulative target per semester
create table if not exists requirements (
  id            uuid primary key default gen_random_uuid(),
  program_id    uuid references programs (id) on delete cascade,
  category      text not null check (category in
                   ('sks','comserv','sat','belingua','sertifikasi')),
  label         text not null,
  unit          text not null default '',
  total_required numeric not null default 0,
  -- target per semester index 1..14, each a fraction (0..1) of total_required
  targets       jsonb not null default '{}'::jsonb,
  unique (program_id, category)
);

-- Failed courses (mata kuliah tidak lulus)
create table if not exists failed_courses (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students (id) on delete cascade,
  kode_mk       text not null,
  nama_mk       text not null,
  sks           int not null default 0,
  nilai         text,
  semester_taken int,
  created_at    timestamptz default now()
);

create index if not exists idx_failed_courses_student on failed_courses (student_id);

-- Certifications held by student
create table if not exists certifications (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students (id) on delete cascade,
  name          text not null,
  is_required   boolean not null default true,
  obtained      boolean not null default false,
  obtained_at   date,
  created_at    timestamptz default now()
);

create index if not exists idx_certifications_student on certifications (student_id);

-- Audit trail for data changes
create table if not exists audit_log (
  id           bigserial primary key,
  actor_id     uuid references auth.users (id) on delete set null,
  entity       text not null,
  entity_id    text,
  action       text not null,
  detail       jsonb,
  created_at   timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 2. Row Level Security
--    Dosen AA: full read + write (own advisees' students + all title/master data).
--    Kaprodi: read-only across the program.
-- ---------------------------------------------------------------------------

create or replace function public.current_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select role from profiles where id = auth.uid()), 'dosen_aa');
$$;

create or replace function public.current_advisor()
returns uuid language sql stable security definer set search_path = public as $$
  select advisor_id from profiles where id = auth.uid();
$$;

alter table programs        enable row level security;
alter table advisors        enable row level security;
alter table profiles        enable row level security;
alter table students        enable row level security;
alter table requirements    enable row level security;
alter table failed_courses  enable row level security;
alter table certifications  enable row level security;
alter table audit_log       enable row level security;

-- profiles: user can read own; dosen can read all (for display)
create policy profiles_self_read on profiles for select
  using (id = auth.uid() or public.current_role() = 'dosen_aa');
create policy profiles_self_update on profiles for update
  using (id = auth.uid() or public.current_role() = 'dosen_aa');

-- reference tables: everyone authenticated can read; dosen manages
create policy programs_read on programs for select using (auth.uid() is not null);
create policy advisors_read on advisors for select using (auth.uid() is not null);
create policy requirements_read on requirements for select using (auth.uid() is not null);
create policy reference_admin_programs on programs for all
  using (public.current_role() = 'dosen_aa') with check (public.current_role() = 'dosen_aa');
create policy reference_admin_advisors on advisors for all
  using (public.current_role() = 'dosen_aa') with check (public.current_role() = 'dosen_aa');
create policy reference_admin_requirements on requirements for all
  using (public.current_role() = 'dosen_aa') with check (public.current_role() = 'dosen_aa');

-- students: kaprodi reads all, dosen reads own advisees; only dosen writes
create policy students_read on students for select
  using (
    public.current_role() in ('dosen_aa','kaprodi')
    or advisor_id = public.current_advisor()
  );
create policy students_write on students for all
  using (public.current_role() = 'dosen_aa')
  with check (public.current_role() = 'dosen_aa');

-- child tables follow the parent student visibility
create policy failed_courses_read on failed_courses for select using (
  exists (select 1 from students s where s.id = failed_courses.student_id
    and (public.current_role() in ('dosen_aa','kaprodi') or s.advisor_id = public.current_advisor()))
);
create policy failed_courses_write on failed_courses for all
  using (public.current_role() = 'dosen_aa') with check (public.current_role() = 'dosen_aa');

create policy certifications_read on certifications for select using (
  exists (select 1 from students s where s.id = certifications.student_id
    and (public.current_role() in ('dosen_aa','kaprodi') or s.advisor_id = public.current_advisor()))
);
create policy certifications_write on certifications for all
  using (public.current_role() = 'dosen_aa') with check (public.current_role() = 'dosen_aa');

create policy audit_read on audit_log for select using (
  public.current_role() in ('dosen_aa','kaprodi')
);
create policy audit_insert on audit_log for insert with check (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------------

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email),
          coalesce(new.raw_user_meta_data->>'role', 'dosen_aa'))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- keep students.updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_students_touch on students;
create trigger trg_students_touch
  before update on students
  for each row execute function public.touch_updated_at();
