import { supabase } from "./supabase.js";
import { DataError } from "./errors.js";
import { sanitizeStudentFields } from "./engine.js";

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
  return unwrap(
    await supabase.from("requirements").select("*").order("category").order("program_id")
  );
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
  return unwrap(await supabase.from("students").update(sanitizeStudentFields(patch)).eq("id", id).select().single());
}

// Aktif / nonaktifkan banyak mahasiswa sekaligus dalam satu request.
// Nonaktif bukan penghapusan: hanya berhenti dipantau di dashboard.
//
// `reason` hanya dipakai saat menonaktifkan: alasan ini disimpan di
// deactivate_reason supaya bisa dibaca lagi di halaman detail mahasiswa.
// Saat diaktifkan kembali, alasan lama dibersihkan (riwayat tetap ada di
// audit log).
// Kolom alasan nonaktif ditambahkan belakangan (lihat sql/schema.sql dan
// sql/fix_deactivate_columns.sql). Kalau database belum dimigrasi, PostgREST
// menolak SELURUH update karena kolomnya tidak dikenal. Aksi aktif/nonaktif
// harus tetap jalan lewat kolom is_active, jadi error "kolom tidak ada"
// ditangani terpisah di bawah.
const MISSING_COLUMN_CODES = new Set(["42703", "PGRST204"]);
let warnedMissingDeactivateColumns = false;

function isMissingColumnError(error) {
  if (!error) return false;
  if (MISSING_COLUMN_CODES.has(error.code)) return true;
  return /does not exist|could not find the .*column/i.test(String(error.message || ""));
}

export async function setStudentsActive(ids, active, reason = "") {
  const clean = (ids || []).filter(Boolean);
  if (!clean.length) return [];
  const text = String(reason || "").trim();
  const patch = active
    ? { is_active: true, deactivate_reason: null, deactivated_at: null }
    : {
        is_active: false,
        deactivate_reason: text || null,
        deactivated_at: new Date().toISOString(),
      };

  let result = await supabase
    .from("students")
    .update(patch)
    .in("id", clean)
    .select("id, is_active, deactivate_reason, deactivated_at");

  if (result.error && isMissingColumnError(result.error)) {
    // Database lama: kolom deactivate_reason/deactivated_at belum ada.
    // Jangan gagalkan aksi inti — ubah is_active saja agar mahasiswa tetap
    // bisa diaktifkan/dinonaktifkan kembali.
    if (!warnedMissingDeactivateColumns) {
      warnedMissingDeactivateColumns = true;
      console.warn(
        "Kolom students.deactivate_reason / deactivated_at belum ada di database. " +
          "Jalankan sql/fix_deactivate_columns.sql supaya alasan nonaktif ikut tersimpan."
      );
    }
    result = await supabase
      .from("students")
      .update({ is_active: active })
      .in("id", clean)
      .select("id, is_active");
  }

  const rows = unwrap(result);
  // UPDATE yang diizinkan RLS tapi tidak mengenai baris apa pun tidak
  // menghasilkan error. Tanpa cek ini UI akan bilang "berhasil" padahal data
  // di database tidak berubah.
  if (!rows.length) {
    throw new DataError(
      "Tidak ada data mahasiswa yang berubah. Pastikan akun punya izin UPDATE " +
        "pada tabel students dan sql/schema.sql sudah dijalankan."
    );
  }

  await logAudit({
    entity: "students",
    entity_id: clean.join(","),
    action: active ? "activate_students" : "deactivate_students",
    detail: {
      ids: clean,
      count: clean.length,
      reason: active ? null : text || null,
    },
  });
  return rows;
}

export async function insertStudent(row) {
  return unwrap(await supabase.from("students").insert(sanitizeStudentFields(row)).select().single());
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
