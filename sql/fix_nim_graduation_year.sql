-- =============================================================================
-- Perbaikan NIM: dua digit pertama = estimasi tahun kelulusan
--
-- Aturan: estimasi tahun kelulusan = tahun masuk + 4 tahun (8 semester).
-- Tahun masuk dihitung dari semester mahasiswa pada tahun ajaran acuan
-- Semester Ganjil 2025/2026 (semester 1). Contoh:
--   semester 1-2 -> masuk 2025 -> lulus 2029 -> NIM 29xxxxxxx
--   semester 3-4 -> masuk 2024 -> lulus 2028 -> NIM 28xxxxxxx
--   semester 5-6 -> masuk 2023 -> lulus 2027 -> NIM 27xxxxxxx
--   semester 7-8 -> masuk 2022 -> lulus 2026 -> NIM 26xxxxxxx
--   semester 9   -> masuk 2021 -> lulus 2025 -> NIM 25xxxxxxx
--
-- Sisanya (digit ke-3 dan seterusnya) tidak diubah. Aman dijalankan berulang:
-- setelah dijalankan, prefix sudah sesuai sehingga update berikutnya no-op.
-- Jalankan di Supabase SQL Editor. Backup NIM lama disimpan di
-- public.students_nim_backup (RLS aktif, hanya service role yang bisa akses).
-- =============================================================================

begin;

create table if not exists public.students_nim_backup (
  student_id   uuid primary key,
  old_nim      text not null,
  backed_up_at timestamptz not null default now()
);
alter table public.students_nim_backup enable row level security;

insert into public.students_nim_backup (student_id, old_nim)
select id, nim from public.students
on conflict (student_id) do nothing;

update public.students
set nim = public.nim_with_graduation_prefix(nim, current_semester)
where nim ~ '^[0-9]{3,}$';

commit;
