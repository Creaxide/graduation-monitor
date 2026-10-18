-- =============================================================================
-- Seed data for local development / demo
-- Run AFTER schema.sql in the Supabase SQL Editor.
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
on conflict (kode_dosen) do nothing;

-- Requirements (targets = cumulative fraction of total required per semester) -
insert into requirements (program_id, category, label, unit, total_required, targets)
select p.id, v.category, v.label, v.unit, v.total_required, v.targets::jsonb
from programs p
cross join (values
  ('sks','SKS','SKS',146,
   '{"1":0.12,"2":0.25,"3":0.375,"4":0.5,"5":0.625,"6":0.75,"7":0.875,"8":1.0}'),
  ('comserv','Comserv','jam',30,
   '{"1":0.05,"2":0.10,"3":0.20,"4":0.30,"5":0.40,"6":0.55,"7":0.75,"8":1.0}'),
  ('sat','SAT','poin',120,
   '{"1":0.06,"2":0.12,"3":0.20,"4":0.30,"5":0.40,"6":0.55,"7":0.75,"8":1.0}'),
  ('belingua','Belingua','',1,
   '{"1":0.0,"2":0.0,"3":0.0,"4":1.0,"5":1.0,"6":1.0,"7":1.0,"8":1.0}'),
  ('sertifikasi','Sertifikasi','',1,
   '{"1":0.0,"2":0.0,"3":0.0,"4":0.0,"5":0.3,"6":0.5,"7":1.0,"8":1.0}')
) as v(category, label, unit, total_required, targets)
where p.code = 'CS'
on conflict (program_id, category) do update set
  label = excluded.label,
  unit = excluded.unit,
  total_required = excluded.total_required,
  targets = excluded.targets;

-- Students ------------------------------------------------------------------
insert into students
  (nim, name, program_id, advisor_id, angkatan, current_semester, status,
   total_sks_passed, comserv_hours, sat_hours, belingua_status, belingua_score)
select v.nim, v.name,
       (select id from programs where code = 'CS'),
       (select id from advisors where kode_dosen = v.kode_dosen),
       v.angkatan, v.sem, v.status, v.sks, v.comserv, v.sat, v.belingua, v.score
from (values
  ('2702314920','Andi Pratama',        'D001', 2023, 6, 'aktif',  126, 26, 20, 'proses',      480),
  ('2702314921','Bella Kartika',       'D001', 2023, 6, 'aktif',   92, 12,  8, 'belum_ambil', null),
  ('2702314922','Chandra Wijaya',      'D001', 2022, 8, 'aktif',  138, 38, 30, 'lulus',       560),
  ('2702314923','Dewi Anggraini',      'D001', 2024, 4, 'aktif',   60, 14, 12, 'belum_ambil', null),
  ('2702314924','Eko Nugroho',         'D002', 2023, 6, 'aktif',  108, 20, 16, 'proses',      455),
  ('2702352622','Gilbert Tobing',      'D002', 2023, 6, 'aktif',  120, 30, 24, 'lulus',       590),
  ('2702352623','Hana Salsabila',      'D002', 2024, 4, 'aktif',   72, 10,  6, 'belum_ambil', null),
  ('2702352624','Irfan Maulana',       'D002', 2022, 8, 'aktif',  132, 34, 28, 'lulus',       545),
  ('2702107493','Joseph D.',           'D003', 2023, 6, 'aktif',  100, 18, 14, 'proses',      470),
  ('2702107494','Kevin Sanjaya',       'D003', 2024, 4, 'aktif',   48,  6,  4, 'belum_ambil', null),
  ('2702376452','M. Andri Wibowo',     'D003', 2023, 6, 'aktif',  130, 28, 26, 'lulus',       555),
  ('2702376453','Nadia Puspita',       'D003', 2025, 2, 'aktif',   24,  2,  2, 'belum_ambil', null),
  ('2702314925','Oscar Lim',           'D001', 2024, 4, 'cuti',    36,  4,  4, 'belum_ambil', null)
) as v(nim, name, kode_dosen, angkatan, sem, status, sks, comserv, sat, belingua, score)
on conflict (nim) do nothing;

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
  ('2702352623','MATH6031','Kalkulus',3,'D',1)
) as v(nim, kode_mk, nama_mk, sks, nilai, semester_taken) on s.nim = v.nim;

-- Certifications ------------------------------------------------------------
insert into certifications (student_id, name, is_required, obtained, obtained_at)
select s.id, v.name, true, v.obtained, v.obtained_at::date
from students s
join (values
  ('2702314920','Sertifikasi Kompetensi Pemrograman', true,  '2025-06-01'),
  ('2702314920','Sertifikasi Jaringan Dasar',         false, '2025-08-15'),
  ('2702314921','Sertifikasi Kompetensi Pemrograman', false, null),
  ('2702314921','Sertifikasi Jaringan Dasar',         false, null),
  ('2702352622','Sertifikasi Kompetensi Pemrograman', true,  '2025-05-10'),
  ('2702352622','Sertifikasi Jaringan Dasar',         true,  '2025-09-01'),
  ('2702107493','Sertifikasi Kompetensi Pemrograman', false, null),
  ('2702107493','Sertifikasi Jaringan Dasar',         false, null),
  ('2702376452','Sertifikasi Kompetensi Pemrograman', true,  '2025-07-20'),
  ('2702376452','Sertifikasi Jaringan Dasar',         true,  '2025-10-05')
) as v(nim, name, obtained, obtained_at) on s.nim = v.nim;

-- =============================================================================
-- Linking users to advisors
-- After creating users in Authentication > Users, run e.g.:
--   update profiles set role = 'dosen_aa',
--          advisor_id = (select id from advisors where kode_dosen = 'D001')
--    where id = '<auth-user-uuid>';
--   update profiles set role = 'kaprodi' where id = '<kaprodi-uuid>';
-- =============================================================================
