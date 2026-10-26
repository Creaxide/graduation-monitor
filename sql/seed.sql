-- =============================================================================
-- Seed data for local development / demo
-- Run AFTER schema.sql in the Supabase SQL Editor.
--
-- Re-runnable / idempotent:
--   * master rows (programs, advisors, requirements, students) are upserted,
--     so re-running refreshes stale values instead of duplicating them;
--   * child rows (failed_courses, certifications) upsert on their natural keys,
--     enforced by the unique guards created in schema.sql.
--
-- Curriculum totals are the graduation config used by the UI:
--   146 SKS, 30 Comserv hours, 120 SAT points, Beelingua by semester 4,
--   1 required certification. Targets are the cumulative fraction of the
--   curriculum total a student must have reached by the end of each semester.
-- =============================================================================

-- Programs ------------------------------------------------------------------
insert into programs (code, name, total_sks) values
  ('CS', 'Computer Science', 146),
  ('IS', 'Information Systems', 146)
on conflict (code) do update set name = excluded.name, total_sks = excluded.total_sks;

-- Advisors ------------------------------------------------------------------
insert into advisors (kode_dosen, name) values
  ('D001', 'Dr. Reynold Suherman'),
  ('D002', 'Gilbert Viant Tokona Gultom, M.Kom'),
  ('D003', 'Joseph Mario Danubio, M.Sc')
on conflict (kode_dosen) do update set name = excluded.name;

-- Requirements (targets = cumulative fraction of total_required per semester) -
-- Inserted for EVERY program so no category is ever silently treated as
-- "0 required" (which the engine would read as met).
--
-- SKS / Comserv / SAT disebar rata ke 8 semester dengan nilai bulat
-- (nilai kumulatif per semester):
--   SKS     146 -> 18, 37, 55, 73, 91, 110, 128, 146
--   Comserv  30 ->  4,  8, 11, 15, 19,  23,  26,  30
--   SAT     120 -> 15, 30, 45, 60, 75,  90, 105, 120
insert into requirements (program_id, category, label, unit, total_required, targets)
select p.id, c.category, c.label, c.unit, c.total_required, c.targets::jsonb
from programs p
cross join (values
  ('sks','SKS','SKS',146,
   '{"1":0.1232876712328767,"2":0.2534246575342466,"3":0.3767123287671233,"4":0.5,"5":0.6232876712328767,"6":0.7534246575342466,"7":0.8767123287671232,"8":1.0}'),
  ('comserv','Comserv','jam',30,
   '{"1":0.13333333333333333,"2":0.26666666666666666,"3":0.36666666666666664,"4":0.5,"5":0.6333333333333333,"6":0.7666666666666666,"7":0.8666666666666667,"8":1.0}'),
  ('sat','SAT','poin',120,
   '{"1":0.125,"2":0.25,"3":0.375,"4":0.5,"5":0.625,"6":0.75,"7":0.875,"8":1.0}'),
  ('beelingua','Beelingua','',1,
   '{"1":0.0,"2":0.0,"3":0.0,"4":1.0,"5":1.0,"6":1.0,"7":1.0,"8":1.0}'),
  ('sertifikasi','Sertifikasi','',1,
   '{"1":0.0,"2":0.0,"3":0.0,"4":0.0,"5":0.3,"6":0.5,"7":0.7,"8":1.0}')
) as c(category, label, unit, total_required, targets)
where p.code in ('CS', 'IS')
on conflict (program_id, category) do update set
  label          = excluded.label,
  unit           = excluded.unit,
  total_required = excluded.total_required,
  targets        = excluded.targets;

-- Students ------------------------------------------------------------------
-- beelingua_status is kept consistent with the semester: before semester 4 the
-- Beelingua target is 0 (nothing required), from semester 4 onward the target is
-- 100%, so 'lulus' is required to stay on track.
insert into students
  (nim, name, program_id, advisor_id, angkatan, current_semester, status,
   total_sks_passed, comserv_hours, sat_hours, beelingua_status, beelingua_score)
select v.nim, v.name,
       (select id from programs where code = v.program_code),
       (select id from advisors where kode_dosen = v.kode_dosen),
       v.angkatan, v.sem, v.status, v.sks, v.comserv, v.sat, v.beelingua, v.score
from (values
  ('2702314920','Andi Pratama',      'CS','D001', 2023, 6, 'aktif', 126, 26, 20, 'proses',       480),
  ('2702314921','Bella Kartika',     'CS','D001', 2023, 6, 'aktif',  92, 12,  8, 'belum_ambil',  null),
  ('2702314922','Chandra Wijaya',    'CS','D001', 2022, 8, 'aktif', 138, 38, 30, 'lulus',        560),
  ('2702314923','Dewi Anggraini',    'CS','D001', 2024, 4, 'aktif',  60, 14, 12, 'belum_ambil',  null),
  ('2702314924','Eko Nugroho',       'CS','D002', 2023, 6, 'aktif', 108, 20, 16, 'proses',       455),
  ('2702352622','Gilbert Tobing',    'CS','D002', 2023, 6, 'aktif', 120, 30, 70, 'lulus',        590),
  ('2702352623','Hana Salsabila',    'CS','D002', 2024, 4, 'aktif',  66, 11, 33, 'lulus',        500),
  ('2702352624','Irfan Maulana',     'CS','D002', 2022, 8, 'aktif', 132, 34, 28, 'lulus',        545),
  ('2702107493','Joseph D.',         'CS','D003', 2023, 6, 'aktif', 100, 18, 14, 'proses',       470),
  ('2702107494','Kevin Sanjaya',     'CS','D003', 2024, 4, 'aktif',  48,  6,  4, 'belum_ambil',  null),
  ('2702376452','M. Andri Wibowo',   'CS','D003', 2023, 6, 'aktif', 130, 28, 68, 'lulus',        555),
  ('2702376453','Nadia Puspita',     'CS','D003', 2025, 2, 'aktif',  24,  2,  2, 'belum_ambil',  null),
  ('2702314925','Oscar Lim',         'CS','D001', 2024, 4, 'cuti',   36,  4,  4, 'belum_ambil',  null),
  ('2702416100','Rizky Ramadhan',    'IS','D001', 2024, 4, 'aktif',  64, 10,  9, 'proses',       460),
  ('2702416101','Sinta Lestari',     'IS','D002', 2023, 6, 'aktif', 118, 24, 68, 'lulus',        570),
  ('2702416102','Taufik Hidayat',    'IS','D003', 2022, 8, 'aktif', 140, 32, 34, 'lulus',        600)
) as v(nim, name, program_code, kode_dosen, angkatan, sem, status, sks, comserv, sat, beelingua, score)
on conflict (nim) do update set
  name             = excluded.name,
  program_id       = excluded.program_id,
  advisor_id       = excluded.advisor_id,
  angkatan         = excluded.angkatan,
  current_semester = excluded.current_semester,
  status           = excluded.status,
  total_sks_passed = excluded.total_sks_passed,
  comserv_hours    = excluded.comserv_hours,
  sat_hours        = excluded.sat_hours,
  beelingua_status  = excluded.beelingua_status,
  beelingua_score   = excluded.beelingua_score;

-- Failed courses ------------------------------------------------------------
insert into failed_courses (student_id, kode_mk, nama_mk, sks, nilai, semester_taken)
select s.id, v.kode_mk, v.nama_mk, v.sks, v.nilai, v.semester_taken
from students s
join (values
  ('2702314921','COMP6047','Algoritma dan Pemrograman',4,'D',2),
  ('2702314921','MATH6031','Kalkulus',3,'E',1),
  ('2702314921','COMP6123','Struktur Data',4,'D',3),
  ('2702314924','COMP6047','Algoritma dan Pemrograman',4,'C-',2),
  ('2702107493','SCIE6064','Fisika Dasar',3,'D',2),
  ('2702107493','COMP6123','Struktur Data',4,'D',3),
  ('2702314920','COMP6083','Basis Data',4,'D',4),
  ('2702352623','MATH6031','Kalkulus',3,'D',1),
  ('2702416100','COMP6267','Pemrograman Web',4,'D',3)
) as v(nim, kode_mk, nama_mk, sks, nilai, semester_taken) on s.nim = v.nim
on conflict (student_id, kode_mk, semester_taken) do update set
  nama_mk = excluded.nama_mk,
  sks     = excluded.sks,
  nilai   = excluded.nilai;

-- Certifications ------------------------------------------------------------
-- `obtained` is derived from whether an obtained_at date is present. The
-- engine counts DISTINCT obtained certification names against the category's
-- curriculum total, so duplicates can no longer inflate the requirement.
insert into certifications (student_id, name, is_required, obtained, obtained_at)
select s.id, v.name, v.is_required, (v.obtained_at is not null), v.obtained_at::date
from students s
join (values
  ('2702314920','Sertifikasi Kompetensi Pemrograman', true,  '2025-06-01'),
  ('2702314920','Sertifikasi Jaringan Dasar',         false, '2025-08-15'),
  ('2702314921','Sertifikasi Kompetensi Pemrograman', true,  null),
  ('2702314921','Sertifikasi Jaringan Dasar',         false, null),
  ('2702352622','Sertifikasi Kompetensi Pemrograman', true,  '2025-05-10'),
  ('2702352622','Sertifikasi Jaringan Dasar',         true,  '2025-09-01'),
  ('2702107493','Sertifikasi Kompetensi Pemrograman', true,  null),
  ('2702107493','Sertifikasi Jaringan Dasar',         false, null),
  ('2702376452','Sertifikasi Kompetensi Pemrograman', true,  '2025-07-20'),
  ('2702376452','Sertifikasi Jaringan Dasar',         true,  '2025-10-05'),
  ('2702416101','Sertifikasi Kompetensi Pemrograman', true,  '2025-06-18'),
  ('2702416102','Sertifikasi Kompetensi Pemrograman', true,  '2025-04-22')
) as v(nim, name, is_required, obtained_at) on s.nim = v.nim
on conflict (student_id, name) do update set
  is_required = excluded.is_required,
  obtained    = excluded.obtained,
  obtained_at = excluded.obtained_at;

-- =============================================================================
-- Linking users to advisors
-- After creating users in Authentication > Users, run e.g.:
--   update profiles set role = 'dosen_aa',
--          advisor_id = (select id from advisors where kode_dosen = 'D001')
--    where id = '<auth-user-uuid>';
--   update profiles set role = 'kaprodi' where id = '<kaprodi-uuid>';
-- =============================================================================
