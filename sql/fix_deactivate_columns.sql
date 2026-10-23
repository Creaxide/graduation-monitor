-- =============================================================================
-- Fix: mahasiswa nonaktif tidak bisa diaktifkan kembali
-- =============================================================================
-- Gejala:
--   Tombol "Aktifkan" / "Nonaktifkan" di dashboard gagal dengan pesan
--     column students.deactivate_reason does not exist
--     column students.deactivated_at does not exist
--
-- Penyebab:
--   Kode terbaru menulis is_active + deactivate_reason + deactivated_at dalam
--   satu UPDATE. Database yang dibuat sebelum fitur alasan nonaktif belum
--   punya dua kolom terakhir, sehingga PostgreSQL menolak seluruh UPDATE —
--   termasuk saat mengaktifkan kembali mahasiswa.
--
-- Jalankan file ini SEKALI di Supabase -> SQL Editor.
-- Aman dijalankan berulang (idempotent).
-- =============================================================================

alter table students add column if not exists is_active boolean not null default true;
alter table students add column if not exists deactivate_reason text;
alter table students add column if not exists deactivated_at timestamptz;

create index if not exists idx_students_active on students (advisor_id, is_active);

-- Cek hasil: kedua kolom harus muncul.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'students'
  and column_name in ('is_active', 'deactivate_reason', 'deactivated_at')
order by column_name;
