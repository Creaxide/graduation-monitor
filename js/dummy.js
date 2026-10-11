import { normativeTarget } from "./engine.js";

const FIRST_NAMES = [
  "Andi", "Bella", "Chandra", "Dewi", "Eko", "Farah", "Gilbert", "Hana", "Irfan",
  "Joseph", "Kevin", "Larasati", "Muhammad", "Nadia", "Oscar", "Putra", "Qanita",
  "Rangga", "Sinta", "Taufik", "Umar", "Vina", "Wahyu", "Xavier", "Yulia", "Zaki",
  "Dian", "Bagus", "Citra", "Doni", "Elsa", "Fajar", "Gita", "Hendra", "Indah",
  "Joko", "Kartika", "Lukman", "Maya", "Nanda", "Rizki", "Salsa", "Tirta", "Wulan",
];

const LAST_NAMES = [
  "Pratama", "Kartika", "Wijaya", "Anggraini", "Nugroho", "Amelia", "Tobing",
  "Salsabila", "Maulana", "Danubio", "Sanjaya", "Putri", "Rizki", "Puspita", "Lim",
  "Mahendra", "Zahra", "Aditya", "Dewi", "Hidayat", "Abdullah", "Marlina",
  "Setiawan", "Rahmawati", "Firmansyah", "Fitriani", "Nugraha", "Lestari",
  "Saputra", "Permata", "Ramadhan", "Nirmala", "Sari", "Susilo", "Hakim", "Anggita",
];

const FAILED_POOL = [
  ["COMP6047", "Algoritma dan Pemrograman", 4],
  ["MATH6031", "Kalkulus", 3],
  ["COMP6123", "Struktur Data", 4],
  ["COMP6083", "Basis Data", 4],
  ["SCIE6064", "Fisika Dasar", 3],
  ["COMP6144", "Jaringan Komputer", 3],
  ["STAT6150", "Statistika", 3],
  ["COMP6267", "Pemrograman Web", 4],
  ["COMP6114", "Pemrograman Berorientasi Objek", 4],
  ["MGMT6012", "Manajemen Proyek", 3],
];

const CERT_POOL = [
  "Sertifikasi Kompetensi Pemrograman",
  "Sertifikasi Jaringan Dasar",
  "Sertifikasi Basis Data",
  "Sertifikasi Manajemen Proyek",
  "Sertifikasi Keamanan Informasi",
];

const FAILED_GRADES = ["D", "E", "C-", "D+", "C"];

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randFloat(min, max) {
  return min + Math.random() * (max - min);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

// Unique-ish 10 digit NIM that does not collide within a batch.
function makeNim(index, salt) {
  const n = (salt + index * 7919) % 100000000;
  return `27${String(n).padStart(8, "0")}`;
}
/**
 * Generate student rows ready to insert into the `students` table.
 * `programs`, `advisors` and `requirements` come from the active backend.
 */
export function generateStudents({ count = 10, programs, advisors, requirements = [] }) {
  if (!programs || !programs.length) return [];
  const salt = Date.now() % 100000000;
  const rows = [];
  const usedNims = new Set();

  for (let i = 0; i < count; i++) {
    const program = programs[i % programs.length];
    const advisor = advisors && advisors.length ? pick(advisors) : null;
    const semester = randInt(1, 8);
    const reqs = requirements.filter((r) => r.program_id === program.id);

    const targetFor = (category) => {
      const req = reqs.find((r) => r.category === category);
      return req ? normativeTarget(req, semester) * Number(req.total_required) : 0;
    };

    let nim;
    do {
      nim = makeNim(i + rows.length, salt);
    } while (usedNims.has(nim));
    usedNims.add(nim);

    const sksTarget = targetFor("sks") || program.total_sks;
    const belinguaTarget = targetFor("belingua");
    const belinguaRoll = Math.random();
    const belingua_status =
      belinguaTarget <= 0
        ? "belum_ambil"
        : belinguaRoll < 0.5
        ? "lulus"
        : belinguaRoll < 0.8
        ? "proses"
        : "belum_ambil";

    rows.push({
      nim,
      name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      program_id: program.id,
      advisor_id: advisor ? advisor.id : null,
      angkatan: 2026 - Math.ceil(semester / 2),
      current_semester: semester,
      status: Math.random() < 0.92 ? "aktif" : "cuti",
      total_sks_passed: clamp(Math.round(sksTarget * randFloat(0.45, 1.1)), 0, program.total_sks),
      comserv_hours: Math.max(0, Math.round(targetFor("comserv") * randFloat(0.4, 1.1))),
      sat_hours: Math.max(0, Math.round(targetFor("sat") * randFloat(0.4, 1.1))),
      belingua_status,
      belingua_score: belingua_status === "belum_ambil" ? null : randInt(420, 620),
    });
  }

  return rows;
}

/**
 * Generate failed-course and certification rows for already-persisted students.
 * Each student must have an `id` and `current_semester`.
 */
export function generateChildrenFor(students = []) {
  const failedCourses = [];
  const certifications = [];

  for (const s of students) {
    if (Math.random() < 0.6) {
      const n = randInt(1, 3);
      const used = new Set();
      for (let k = 0; k < n; k++) {
        const course = pick(FAILED_POOL);
        if (used.has(course[0])) continue;
        used.add(course[0]);
        failedCourses.push({
          student_id: s.id,
          kode_mk: course[0],
          nama_mk: course[1],
          sks: course[2],
          nilai: pick(FAILED_GRADES),
          semester_taken: Math.max(1, (s.current_semester || 6) - randInt(1, 2)),
        });
      }
    }

    const certCount = randInt(2, 3);
    const semester = s.current_semester || 6;
    for (let c = 0; c < certCount; c++) {
      const isRequired = c < 2;
      const obtained = isRequired ? Math.random() < semester / 9 : Math.random() < 0.5;
      certifications.push({
        student_id: s.id,
        name: CERT_POOL[c % CERT_POOL.length],
        is_required: isRequired,
        obtained,
        obtained_at: obtained ? `2025-0${randInt(1, 9)}-15` : null,
      });
    }
  }

  return { failedCourses, certifications };
}
