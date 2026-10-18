-- =============================================================================
-- One-time cleanup for duplicate failed_courses / certifications rows.
-- Run this in the Supabase SQL Editor BEFORE re-running seed.sql or importing.
--
-- Why: earlier versions of seed.sql inserted these child rows without any
-- uniqueness guard, so every re-run appended a second copy. Certifications
-- were the visible symptom (a student appearing to need "4 sertifikasi"
-- instead of 2), because the app counted the student's own required rows.
--
-- Safe to run more than once.
-- =============================================================================

-- Remove duplicate failed courses, keeping the earliest row per
-- (student, mata kuliah, semester).
delete from failed_courses
where id in (
  select id from (
    select id,
           row_number() over (
             partition by student_id, kode_mk, semester_taken
             order by created_at, id
           ) as rn
    from failed_courses
  ) t
  where t.rn > 1
);

-- Remove duplicate certifications, keeping the earliest row per
-- (student, certification name).
delete from certifications
where id in (
  select id from (
    select id,
           row_number() over (
             partition by student_id, name
             order by created_at, id
           ) as rn
    from certifications
  ) t
  where t.rn > 1
);

-- Enforce uniqueness so the duplicates cannot come back.
create unique index if not exists uq_failed_courses_student_mk
  on failed_courses (student_id, kode_mk, semester_taken);
create unique index if not exists uq_certifications_student_name
  on certifications (student_id, name);
