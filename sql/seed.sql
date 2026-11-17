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
   '{"1":0.0,"2":0.0,"3":0.0,"4":0.0,"5":0.0,"6":0.0,"7":0.0,"8":1.0}')
) as c(category, label, unit, total_required, targets)
where p.code in ('CS', 'IS')
on conflict (program_id, category) do update set
  label          = excluded.label,
  unit           = excluded.unit,
  total_required = excluded.total_required,
  targets        = excluded.targets;

-- Students ------------------------------------------------------------------
-- Demo students with varied semesters (1-8+) showing different badge states.
-- Each student has unique NIM to demonstrate the full range of scenarios.
-- Badge logic:
--   - INFO (semester 1-2): Beelingua belum jatuh tempo
--   - WARN (semester 3-4): Beelingua proses, target masih 0
--   - DANGER (semester 5+): Beelingua target 100%, belum lulus
--   - SAFE: Beelingua lulus
insert into students
  (nim, name, program_id, advisor_id, angkatan, current_semester, status,
   total_sks_passed, comserv_hours, sat_hours, beelingua_status, beelingua_score)
select v.nim, v.name,
       (select id from programs where code = v.program_code),
       (select id from advisors where kode_dosen = v.kode_dosen),
       v.angkatan, v.sem, v.status, v.sks, v.comserv, v.sat, v.beelingua, v.score
from (values
  -- Sebaran risiko seed ini: 10 MENDESAK, 10 PERHATIAN, 3 AMAN (23 mahasiswa aktif).
  -- Hitung ulang sebaran ini bila nilai di bawah diubah.
  -- Angkatan mengikuti NIM: semester 1-2 = 2025, 3-4 = 2024, 5-6 = 2023,
  -- 7-8 = 2022, 9 = 2021.
  -- Semester 1-2: angkatan 2025 (NIM 29xxxx)
  ('2902314920','Andi Pratama',      'CS','D001', 2025, 1, 'aktif',  18,  4, 13, 'proses',       460),
  ('2902314921','Bella Kartika',     'CS','D001', 2025, 1, 'aktif',  17,  4, 14, 'proses',       460),
  ('2902376453','Nadia Puspita',     'CS','D003', 2025, 2, 'aktif',  38,  2, 26, 'belum_ambil',  460),
  ('2902416100','Rizky Ramadhan',    'IS','D001', 2025, 2, 'aktif',  38,  7, 23, 'proses',       460),
  -- Semester 3-4: angkatan 2024 (NIM 28xxxx)
  ('2802416102','Taufik Hidayat',    'IS','D003', 2024, 3, 'aktif',  60,  8, 39, 'lulus',        600),
  ('2802314923','Dewi Anggraini',    'CS','D001', 2024, 4, 'aktif',  70, 14, 46, 'lulus',        460),
  ('2802352623','Hana Salsabila',    'CS','D002', 2024, 4, 'aktif',  60, 15, 55, 'lulus',        500),
  ('2802416101','Sinta Lestari',     'IS','D002', 2024, 4, 'aktif',  60, 10, 51, 'lulus',        570),
  -- Semester 5-6: angkatan 2023 (NIM 27xxxx)
  ('2702107493','Joseph D.',         'CS','D003', 2023, 5, 'aktif',  85, 18, 70, 'lulus',        470),
  ('2702107494','Kevin Sanjaya',     'CS','D003', 2023, 5, 'aktif',  55,  8, 64, 'belum_ambil',  460),
  ('2702314924','Eko Nugroho',       'CS','D002', 2023, 5, 'aktif',  95, 18, 68, 'lulus',        455),
  ('2702352624','Irfan Maulana',     'CS','D002', 2023, 5, 'aktif',  95, 20, 78, 'lulus',        545),
  ('2702352622','Gilbert Tobing',    'CS','D002', 2023, 6, 'aktif', 120, 30, 90, 'lulus',        590),
  ('2702376452','M. Andri Wibowo',   'CS','D003', 2023, 6, 'aktif', 130, 28, 68, 'lulus',        555),
  ('2702416105','Fira Nur',          'CS','D001', 2023, 6, 'aktif', 126, 18, 80, 'lulus',        480),
  ('2702416106','Doni Santoso',      'CS','D001', 2023, 6, 'aktif',  92, 12,  8, 'belum_ambil',  460),
  -- Semester 7-8: angkatan 2022 (NIM 26xxxx) - tidak ada lagi waktu mengejar
  ('2602416107','Sari Wulandari',    'CS','D001', 2022, 7, 'aktif', 145, 28,106, 'lulus',        480),
  ('2602416108','Agus Subroto',      'CS','D001', 2022, 7, 'aktif', 130, 27, 20, 'belum_ambil',  460),
  ('2602416112','Rizky Ramadhan II', 'IS','D001', 2022, 7, 'aktif', 129, 27, 22, 'proses',       460),
  ('2602416113','Irfan Maulana II',  'CS','D002', 2022, 7, 'aktif', 140, 32, 95, 'lulus',        545),
  ('2602416109','Chandra Wijaya',    'CS','D001', 2022, 8, 'aktif', 146, 38,120, 'lulus',        560),
  ('2602416110','Gilbert Tobing II', 'CS','D002', 2022, 8, 'aktif', 136, 30,110, 'lulus',        590),
  -- Semester 9: angkatan 2021 (NIM 25xxxx), jendela retake
  ('2502416111','Demo Retake',       'CS','D001', 2021, 9, 'aktif',  80, 15, 12, 'lulus',        560)
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
  ('2902314921','COMP6047','Algoritma dan Pemrograman',4,'D',2),
  ('2902314921','MATH6031','Kalkulus',3,'E',1),
  ('2902314921','COMP6123','Struktur Data',4,'D',3),
  ('2702314924','COMP6047','Algoritma dan Pemrograman',4,'C-',2),
  ('2702107493','SCIE6064','Fisika Dasar',3,'D',2),
  ('2702107493','COMP6123','Struktur Data',4,'D',3),
  ('2902314920','COMP6083','Basis Data',4,'D',4),
  ('2802352623','MATH6031','Kalkulus',3,'D',1),
  ('2902314921','MATH6031','Kalkulus',3,'E',1),
  ('2602416108','COMP6047','Algoritma dan Pemrograman',4,'D',2),
  ('2702416106','MATH6031','Kalkulus',3,'E',1),
  ('2702416106','COMP6123','Struktur Data',4,'D',3)
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
  ('2902314920','Sertifikasi Kompetensi Pemrograman', true,  '2025-06-01'),
  ('2902314920','Sertifikasi Jaringan Dasar',         false, '2025-08-15'),
  ('2902314921','Sertifikasi Kompetensi Pemrograman', true,  null),
  ('2902314921','Sertifikasi Jaringan Dasar',         false, null),
  ('2702416105','Sertifikasi Kompetensi Pemrograman', true,  '2025-05-01'),
  ('2702416106','Sertifikasi Kompetensi Pemrograman', true,  null),
  ('2602416108','Sertifikasi Kompetensi Pemrograman', true,  null),
  ('2502416111','Sertifikasi Jaringan Dasar',         false, '2023-01-15'),
  ('2702352622','Sertifikasi Kompetensi Pemrograman', true,  '2025-05-10'),
  ('2702352622','Sertifikasi Jaringan Dasar',         true,  '2025-09-01'),
  ('2702107493','Sertifikasi Kompetensi Pemrograman', true,  null),
  ('2702107493','Sertifikasi Jaringan Dasar',         false, null),
  ('2702376452','Sertifikasi Kompetensi Pemrograman', true,  '2025-07-20'),
  ('2702376452','Sertifikasi Jaringan Dasar',         true,  '2025-10-05'),
  ('2802416101','Sertifikasi Kompetensi Pemrograman', true,  '2025-06-18'),
  ('2802416102','Sertifikasi Kompetensi Pemrograman', true,  '2025-04-22'),
  ('2602416107','Sertifikasi Kompetensi Pemrograman', true,  '2025-09-10'),
  ('2602416113','Sertifikasi Kompetensi Pemrograman', true,  '2025-09-10'),
  ('2602416109','Sertifikasi Kompetensi Pemrograman', true,  '2025-03-15'),
  ('2602416110','Sertifikasi Kompetensi Pemrograman', true,  '2025-02-20'),
  ('2502416111','Sertifikasi Kompetensi Pemrograman', true,  '2023-01-15')
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
