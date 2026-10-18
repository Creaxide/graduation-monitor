import { supabase } from "./supabase.js";
import { DataError } from "./errors.js";
import { generateStudents, generateChildrenFor } from "./dummy.js";

export { DataError };

function unwrap({ data, error }) {
  if (error) throw new DataError(error.message);
  return data;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new DataError(error.message);
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.replace("index.html");
    throw new DataError("Not authenticated");
  }
  return session;
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, advisor_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) return null;
  return data;
}

export async function listStudents() {
  return unwrap(
    await supabase
      .from("students")
      .select("*, programs(code,name,total_sks), advisors(kode_dosen,name)")
      .order("nim", { ascending: true })
  );
}

export async function listRequirements() {
  return unwrap(await supabase.from("requirements").select("*"));
}

export async function listPrograms() {
  return unwrap(await supabase.from("programs").select("*").order("code"));
}

export async function listAdvisors() {
  return unwrap(await supabase.from("advisors").select("*").order("kode_dosen"));
}

export async function getStudent(id) {
  return unwrap(
    await supabase
      .from("students")
      .select("*, programs(code,name,total_sks), advisors(kode_dosen,name)")
      .eq("id", id)
      .single()
  );
}

export async function listFailedCourses(studentId) {
  return unwrap(
    await supabase.from("failed_courses").select("*").eq("student_id", studentId).order("semester_taken")
  );
}

export async function listCertifications(studentId) {
  return unwrap(
    await supabase.from("certifications").select("*").eq("student_id", studentId).order("name")
  );
}

export async function loadDashboard() {
  const [students, requirements] = await Promise.all([listStudents(), listRequirements()]);
  return { students, requirements };
}

export async function loadStudentBundle(id) {
  const student = await getStudent(id);
  const [requirements, failed, certs] = await Promise.all([
    listRequirements(),
    listFailedCourses(id),
    listCertifications(id),
  ]);
  return { student, requirements, failed, certs };
}

// --------------------------------------------------------------- mutations --

export async function updateStudent(id, patch) {
  return unwrap(await supabase.from("students").update(patch).eq("id", id).select().single());
}

export async function insertStudent(row) {
  return unwrap(await supabase.from("students").insert(row).select().single());
}

/**
 * Generate `count` random students and insert them (plus sample failed courses
 * and certifications) into Supabase. Requires a dosen_aa profile (RLS).
 * Returns a summary of what was written.
 */
export async function seedDummyData(count = 10) {
  const n = Math.min(100, Math.max(1, Number(count) || 10));
  const [programs, advisors, requirements, profileRows] = await Promise.all([
    listPrograms(),
    listAdvisors(),
    listRequirements(),
    getProfile((await getCurrentUser())?.id),
  ]);
  if (!programs.length) {
    throw new DataError("No programs found. Run sql/seed.sql in the Supabase SQL Editor first.");
  }

  // New advisees must be visible to *this* dosen afterwards, so pin them to the
  // dosen's own advisor instead of a random one.
  const mine = advisors.find((a) => a.id === profileRows?.advisor_id) || advisors[0] || null;

  const rows = generateStudents({ count: n, programs, advisors: mine ? [mine] : advisors, requirements });
  const inserted = [];
  const errors = [];

  for (const row of rows) {
    try {
      inserted.push(await insertStudent(row));
    } catch (e) {
      errors.push(`${row.nim}: ${e.message}`);
    }
  }

  let failed = 0;
  let certs = 0;
  if (inserted.length) {
    const children = generateChildrenFor(inserted);
    if (children.failedCourses.length) {
      try {
        await insertFailedCourses(children.failedCourses);
        failed = children.failedCourses.length;
      } catch (e) {
        errors.push(`failed_courses: ${e.message}`);
      }
    }
    if (children.certifications.length) {
      try {
        await insertCertifications(children.certifications);
        certs = children.certifications.length;
      } catch (e) {
        errors.push(`certifications: ${e.message}`);
      }
    }
  }

  return { students: inserted.length, failed, certs, errors };
}

export async function upsertFailedCourse(row) {
  return unwrap(await supabase.from("failed_courses").upsert(row).select().single());
}

export async function deleteFailedCourse(id) {
  return unwrap(await supabase.from("failed_courses").delete().eq("id", id));
}

export async function insertFailedCourses(rows) {
  if (!rows.length) return [];
  // ignoreDuplicates + the unique index keep re-imports / re-seeds idempotent.
  return unwrap(
    await supabase
      .from("failed_courses")
      .upsert(rows, { onConflict: "student_id,kode_mk,semester_taken", ignoreDuplicates: true })
      .select()
  );
}

export async function upsertCertification(row) {
  return unwrap(await supabase.from("certifications").upsert(row).select().single());
}

export async function insertCertifications(rows) {
  if (!rows.length) return [];
  return unwrap(
    await supabase
      .from("certifications")
      .upsert(rows, { onConflict: "student_id,name", ignoreDuplicates: true })
      .select()
  );
}

export async function updateRequirements(rows) {
  const results = [];
  for (const row of rows) {
    results.push(
      unwrap(
        await supabase
          .from("requirements")
          .update({ total_required: row.total_required, targets: row.targets })
          .eq("id", row.id)
          .select()
          .single()
      )
    );
  }
  return results;
}

export async function logAudit(entry) {
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from("audit_log").insert({
      actor_id: data?.user?.id || null,
      ...entry,
      created_at: new Date().toISOString(),
    });
  } catch {
    /* audit is best-effort */
  }
}

export async function studentIdsByNim(nims) {
  if (!nims.length) return {};
  const { data, error } = await supabase.from("students").select("id, nim").in("nim", nims);
  if (error) throw new DataError(error.message);
  const map = {};
  for (const s of data) map[s.nim] = s.id;
  return map;
}
