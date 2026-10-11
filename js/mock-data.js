import { DataError } from "./errors.js";

const DB_KEY = "graduation-monitor-mock-db";
const SESSION_KEY = "graduation-monitor-mock-session";
const DELAY = 60;

const MOCK_USER = { id: "mock-user-1", email: "advisor@binus.ac.id" };
const MOCK_PROFILE = {
  id: "mock-user-1",
  full_name: "Dr. Demo Advisor",
  role: "admin",
  advisor_id: "adv-d001",
};

const PROGRAMS = [
  { id: "prog-cs", code: "CS", name: "Computer Science", total_sks: 144 },
  { id: "prog-is", code: "IS", name: "Information Systems", total_sks: 144 },
];

const ADVISORS = [
  { id: "adv-d001", kode_dosen: "D001", name: "Dr. Reynold Suherman" },
  { id: "adv-d002", kode_dosen: "D002", name: "Gilbert Viant Tokona Gultom, M.Kom" },
  { id: "adv-d003", kode_dosen: "D003", name: "Joseph Mario Danubio, M.Sc" },
];

const CS_TARGETS = {
  sks: { 1: 0.12, 2: 0.25, 3: 0.375, 4: 0.5, 5: 0.625, 6: 0.75, 7: 0.875, 8: 1 },
  comserv: { 1: 0.05, 2: 0.1, 3: 0.2, 4: 0.3, 5: 0.4, 6: 0.55, 7: 0.75, 8: 1 },
  sat: { 1: 0.06, 2: 0.12, 3: 0.2, 4: 0.3, 5: 0.4, 6: 0.55, 7: 0.75, 8: 1 },
  belingua: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0.5, 6: 1, 7: 1, 8: 1 },
  sertifikasi: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0.3, 6: 0.5, 7: 1, 8: 1 },
};

const REQUIREMENTS = [
  { id: "req-cs-sks", program_id: "prog-cs", category: "sks", label: "SKS", unit: "SKS", total_required: 144, targets: CS_TARGETS.sks },
  { id: "req-cs-comserv", program_id: "prog-cs", category: "comserv", label: "Comserv", unit: "jam", total_required: 40, targets: CS_TARGETS.comserv },
  { id: "req-cs-sat", program_id: "prog-cs", category: "sat", label: "SAT", unit: "jam", total_required: 32, targets: CS_TARGETS.sat },
  { id: "req-cs-belingua", program_id: "prog-cs", category: "belingua", label: "Belingua", unit: "", total_required: 1, targets: CS_TARGETS.belingua },
  { id: "req-cs-sertifikasi", program_id: "prog-cs", category: "sertifikasi", label: "Sertifikasi", unit: "", total_required: 1, targets: CS_TARGETS.sertifikasi },
  { id: "req-is-sks", program_id: "prog-is", category: "sks", label: "SKS", unit: "SKS", total_required: 144, targets: CS_TARGETS.sks },
  { id: "req-is-comserv", program_id: "prog-is", category: "comserv", label: "Comserv", unit: "jam", total_required: 40, targets: CS_TARGETS.comserv },
  { id: "req-is-sat", program_id: "prog-is", category: "sat", label: "SAT", unit: "jam", total_required: 32, targets: CS_TARGETS.sat },
  { id: "req-is-belingua", program_id: "prog-is", category: "belingua", label: "Belingua", unit: "", total_required: 1, targets: CS_TARGETS.belingua },
  { id: "req-is-sertifikasi", program_id: "prog-is", category: "sertifikasi", label: "Sertifikasi", unit: "", total_required: 1, targets: CS_TARGETS.sertifikasi },
];

const NAMES = [
  "Andi Pratama", "Bella Kartika", "Chandra Wijaya", "Dewi Anggraini", "Eko Nugroho",
  "Farah Amelia", "Gilbert Tobing", "Hana Salsabila", "Irfan Maulana", "Joseph Danubio",
  "Kevin Sanjaya", "Larasati Putri", "Muhammad Rizki", "Nadia Puspita", "Oscar Lim",
  "Putra Mahendra", "Qanita Zahra", "Rangga Aditya", "Sinta Dewi", "Taufik Hidayat",
  "Umar Abdullah", "Vina Marlina", "Wahyu Setiawan", "Xavier Lim", "Yulia Rahmawati",
  "Zaki Firmansyah", "Dian Fitriani", "Bagus Nugraha", "Citra Lestari", "Doni Saputra",
  "Elsa Permata", "Fajar Ramadhan", "Gita Nirmala", "Hendra Wijaya", "Indah Sari",
  "Joko Susilo", "Kartika Sari", "Lukman Hakim", "Maya Anggita", "Nanda Pratama",
];

const BELINGUA_STATES = ["belum_ambil", "proses", "lulus"];
const STATUS_STATES = ["aktif", "aktif", "aktif", "aktif", "cuti", "do"];

const FAILED_POOL = [
  ["COMP6047", "Algoritma dan Pemrograman", 4],
  ["MATH6031", "Kalkulus", 3],
  ["COMP6123", "Struktur Data", 4],
  ["COMP6083", "Basis Data", 4],
  ["SCIE6064", "Fisika Dasar", 3],
  ["COMP6144", "Jaringan Komputer", 3],
  ["STAT6150", "Statistika", 3],
  ["COMP6267", "Pemrograman Web", 4],
];

const CERT_POOL = [
  "Sertifikasi Kompetensi Pemrograman",
  "Sertifikasi Jaringan Dasar",
  "Sertifikasi Basis Data",
  "Sertifikasi Manajemen Proyek",
];

function nowIso() {
  return new Date().toISOString();
}

function buildRequirementsForProgram(programId) {
  return REQUIREMENTS.filter((r) => r.program_id === programId).map((r) => ({
    ...r,
    targets: { ...r.targets },
  }));
}

function generateDatabase() {
  const students = [];
  const failed = [];
  const certifications = [];
  const count = 40;

  for (let i = 0; i < count; i++) {
    const program = PROGRAMS[i % 2];
    const advisor = ADVISORS[i % 3];
    const semester = 1 + ((i * 3) % 8);
    const angkatan = 2026 - Math.ceil(semester / 2);
    const name = NAMES[i % NAMES.length];
    const id = `stu-${String(i + 1).padStart(3, "0")}`;

    const targetSks = CS_TARGETS.sks[semester] * program.total_sks;
    const targetComserv = CS_TARGETS.comserv[semester] * 40;
    const targetSat = CS_TARGETS.sat[semester] * 32;

    const sksFactor = 0.55 + Math.random() * 0.55;
    const comservFactor = 0.45 + Math.random() * 0.65;
    const satFactor = 0.5 + Math.random() * 0.6;

    const total_sks_passed = Math.max(0, Math.min(program.total_sks, Math.round(targetSks * sksFactor)));
    const comserv_hours = Math.max(0, Math.round(targetComserv * comservFactor));
    const sat_hours = Math.max(0, Math.round(targetSat * satFactor));

    const r = Math.random();
    const belingua_status = semester >= 6 ? (r < 0.45 ? "lulus" : r < 0.8 ? "proses" : "belum_ambil") : BELINGUA_STATES[Math.floor(Math.random() * 3)];
    const belingua_score = belingua_status === "belum_ambil" ? null : 420 + Math.floor(Math.random() * 200);

    students.push({
      id,
      nim: `${2702310000 + i}`,
      name,
      program_id: program.id,
      advisor_id: advisor.id,
      angkatan,
      current_semester: semester,
      status: STATUS_STATES[Math.floor(Math.random() * STATUS_STATES.length)],
      total_sks_passed,
      comserv_hours,
      sat_hours,
      belingua_status,
      belingua_score,
      created_at: nowIso(),
      updated_at: nowIso(),
      programs: { code: program.code, name: program.name, total_sks: program.total_sks },
      advisors: { kode_dosen: advisor.kode_dosen, name: advisor.name },
    });

    if (Math.random() < 0.6) {
      const n = 1 + Math.floor(Math.random() * 3);
      const used = new Set();
      for (let k = 0; k < n; k++) {
        const pick = FAILED_POOL[(i + k * 3) % FAILED_POOL.length];
        if (used.has(pick[0])) continue;
        used.add(pick[0]);
        failed.push({
          id: `fc-${id}-${k}`,
          student_id: id,
          kode_mk: pick[0],
          nama_mk: pick[1],
          sks: pick[2],
          nilai: ["D", "E", "C-", "D+"][Math.floor(Math.random() * 4)],
          semester_taken: Math.max(1, semester - 1 - Math.floor(Math.random() * 2)),
          created_at: nowIso(),
        });
      }
    }

    const certCount = 2 + Math.floor(Math.random() * 2);
    for (let c = 0; c < certCount; c++) {
      const certName = CERT_POOL[c % CERT_POOL.length];
      const isRequired = c < 2;
      const obtained = isRequired ? Math.random() < (semester / 9) : Math.random() < 0.5;
      certifications.push({
        id: `cert-${id}-${c}`,
        student_id: id,
        name: certName,
        is_required: isRequired,
        obtained,
        obtained_at: obtained ? `2025-0${1 + (c % 8)}-15` : null,
        created_at: nowIso(),
      });
    }
  }

  return {
    version: 1,
    generated_at: nowIso(),
    mock_user: MOCK_USER,
    profile: MOCK_PROFILE,
    programs: PROGRAMS,
    advisors: ADVISORS,
    requirements: REQUIREMENTS.map((r) => ({ ...r, targets: { ...r.targets } })),
    students,
    failed_courses: failed,
    certifications,
    audit_log: [],
  };
}

function load() {
  try {
    const raw = sessionStorage.getItem(DB_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persist(db) {
  try {
    sessionStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* ignore */
  }
}

function delay() {
  return new Promise((resolve) => setTimeout(resolve, DELAY));
}

function fail(message) {
  throw new DataError(message);
}

export function mockHasData() {
  return load() !== null;
}

export function mockGenerate({ count } = {}) {
  const db = generateDatabase();
  if (Number.isInteger(count) && count > 0) {
    db.students = db.students.slice(0, count);
    const ids = new Set(db.students.map((s) => s.id));
    db.failed_courses = db.failed_courses.filter((f) => ids.has(f.student_id));
    db.certifications = db.certifications.filter((c) => ids.has(c.student_id));
  }
  persist(db);
  return { students: db.students.length, failed: db.failed_courses.length, certs: db.certifications.length };
}

export function mockAddStudent(overrides = {}) {
  const db = load();
  if (!db) fail("No dummy data loaded. Click 'Generate dummy data' first.");
  const program = db.programs.find((p) => p.id === (overrides.program_id || "prog-cs")) || db.programs[0];
  const advisor = db.advisors.find((a) => a.id === (overrides.advisor_id || "adv-d001")) || db.advisors[0];
  const semester = overrides.current_semester || 6;
  const id = `stu-manual-${Date.now()}`;
  const student = {
    id,
    nim: overrides.nim || `${2702400000 + db.students.length}`,
    name: overrides.name || `Manual Student ${db.students.length + 1}`,
    program_id: program.id,
    advisor_id: advisor.id,
    angkatan: overrides.angkatan || 2023,
    current_semester: semester,
    status: "aktif",
    total_sks_passed: overrides.total_sks_passed ?? 0,
    comserv_hours: overrides.comserv_hours ?? 0,
    sat_hours: overrides.sat_hours ?? 0,
    belingua_status: overrides.belingua_status || "belum_ambil",
    belingua_score: overrides.belingua_score ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
    programs: { code: program.code, name: program.name, total_sks: program.total_sks },
    advisors: { kode_dosen: advisor.kode_dosen, name: advisor.name },
  };
  db.students.push(student);
  persist(db);
  return student;
}

export function mockClear() {
  sessionStorage.removeItem(DB_KEY);
}

export async function getSession() {
  await delay();
  const signedIn = sessionStorage.getItem(SESSION_KEY);
  return signedIn ? { user: MOCK_USER } : null;
}

export async function getCurrentUser() {
  await delay();
  return sessionStorage.getItem(SESSION_KEY) ? MOCK_USER : null;
}

export async function signIn(email, password) {
  await delay();
  if (!password) fail("Password is required.");
  sessionStorage.setItem(SESSION_KEY, "1");
  return { user: { ...MOCK_USER, email: email || MOCK_USER.email } };
}

export async function signOut() {
  await delay();
  sessionStorage.removeItem(SESSION_KEY);
}

export async function requireAuth() {
  return getSession();
}

export async function getProfile() {
  await delay();
  return MOCK_PROFILE;
}

function withRelations(db, student) {
  if (!student) return null;
  const program = db.programs.find((p) => p.id === student.program_id);
  const advisor = db.advisors.find((a) => a.id === student.advisor_id);
  return {
    ...student,
    programs: program ? { code: program.code, name: program.name, total_sks: program.total_sks } : null,
    advisors: advisor ? { kode_dosen: advisor.kode_dosen, name: advisor.name } : null,
  };
}

export async function listStudents() {
  await delay();
  const db = load();
  if (!db) return [];
  return db.students
    .slice()
    .sort((a, b) => a.nim.localeCompare(b.nim))
    .map((s) => withRelations(db, s));
}

export async function listRequirements() {
  await delay();
  return load()?.requirements || [];
}

export async function listPrograms() {
  await delay();
  return (load()?.programs || PROGRAMS).map((p) => ({ ...p }));
}

export async function listAdvisors() {
  await delay();
  return (load()?.advisors || ADVISORS).map((a) => ({ ...a }));
}

export async function getStudent(id) {
  await delay();
  const db = load();
  const student = db?.students.find((s) => s.id === id);
  if (!student) fail("Student not found.");
  return withRelations(db, student);
}

export async function listFailedCourses(studentId) {
  const courses = (load()?.failed_courses || []).filter((f) => f.student_id === studentId);
  return courses.sort((a, b) => (a.semester_taken || 0) - (b.semester_taken || 0));
}

export async function listCertifications(studentId) {
  const certs = (load()?.certifications || []).filter((c) => c.student_id === studentId);
  return certs.sort((a, b) => a.name.localeCompare(b.name));
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

export async function updateStudent(id, patch) {
  const db = load();
  if (!db) fail("No dummy data loaded.");
  const student = db.students.find((s) => s.id === id);
  if (!student) fail("Student not found.");
  Object.assign(student, patch, { updated_at: nowIso() });
  persist(db);
  return withRelations(db, student);
}

export async function insertStudent(row) {
  const db = load();
  if (!db) fail("No dummy data loaded. Click 'Generate dummy data' first.");
  if (db.students.some((s) => s.nim === row.nim)) fail(`NIM ${row.nim} already exists.`);
  const student = {
    id: `stu-manual-${Date.now()}`,
    status: "aktif",
    total_sks_passed: 0,
    comserv_hours: 0,
    sat_hours: 0,
    belingua_status: "belum_ambil",
    belingua_score: null,
    created_at: nowIso(),
    updated_at: nowIso(),
    ...row,
  };
  db.students.push(student);
  persist(db);
  return withRelations(db, student);
}

export async function insertFailedCourses(rows) {
  const db = load();
  if (!db) fail("No dummy data loaded.");
  const inserted = rows.map((row, i) => ({ id: `fc-manual-${Date.now()}-${i}`, created_at: nowIso(), ...row }));
  db.failed_courses.push(...inserted);
  persist(db);
  return inserted;
}

export async function insertCertifications(rows) {
  const db = load();
  if (!db) fail("No dummy data loaded.");
  const inserted = rows.map((row, i) => ({ id: `cert-manual-${Date.now()}-${i}`, created_at: nowIso(), ...row }));
  db.certifications.push(...inserted);
  persist(db);
  return inserted;
}

export async function updateRequirements(rows) {
  const db = load();
  if (!db) fail("No dummy data loaded.");
  for (const row of rows) {
    const target = db.requirements.find((r) => r.id === row.id);
    if (target) {
      target.total_required = row.total_required;
      target.targets = row.targets;
    }
  }
  persist(db);
  return rows;
}

export async function logAudit(entry) {
  const db = load();
  if (!db) return;
  db.audit_log.push({ id: Date.now(), ...entry, created_at: nowIso() });
  persist(db);
}

export async function studentIdsByNim(nims) {
  await delay();
  const db = load();
  const map = {};
  for (const s of db?.students || []) {
    if (nims.includes(s.nim)) map[s.nim] = s.id;
  }
  return map;
}
