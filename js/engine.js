export const GRADUATION_SEMESTER = 8;
export const MAX_SEMESTER = 14;

// Batas "hampir memenuhi target": kategori dengan capaian >= 75% dari target
// semester hanya menaikkan ringkasan risiko ke PERHATIAN, bukan MENDESAK,
// selama masih ada lebih dari 2 semester untuk mengejar kekurangannya.
export const NEAR_MISS_RATIO = 0.75;

export const CATEGORY_META = {
  sks: { label: "SKS", unit: "SKS", icon: "SKS" },
  comserv: { label: "Comserv", unit: "jam", icon: "CS" },
  sat: { label: "SAT", unit: "point", icon: "SAT" },
  belingua: { label: "Belingua", unit: "", icon: "BL" },
  sertifikasi: { label: "Sertifikasi", unit: "", icon: "CT" },
};

// Satu sumber label untuk status Belingua (dipakai di tabel, detail, laporan PDF).
export const BELINGUA_LABEL = {
  lulus: "Lulus",
  proses: "Sedang Menjalankan",
  belum_ambil: "Belum Menjalankan",
};
// Sanitasi teks untuk mencocokkan nilai enum yang diimpor. Membuang aksen,
// menyeragamkan huruf kecil, dan mengganti semua pemisah menjadi underscore
// sehingga "Lulus", " lulus ", "LULUS", "Sedang Menjalankan", "belum ambil",
// maupun "lulus (100%)" tetap terdeteksi sebagai status yang sama.
export function sanitizeString(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Alias status Belingua (Indonesia/Inggris/boolean) -> status kanonik.
const BELINGUA_ALIASES = {
  lulus: "lulus", lulus_100: "lulus", passed: "lulus", pass: "lulus",
  sudah: "lulus", sudah_lulus: "lulus", true: "lulus", ya: "lulus", yes: "lulus", y: "lulus",
  proses: "proses", process: "proses", in_progress: "proses", on_progress: "proses",
  sedang: "proses", sedang_menjalankan: "proses", menjalankan: "proses",
  belum_ambil: "belum_ambil", belum_menjalankan: "belum_ambil", belum: "belum_ambil",
  belum_lulus: "belum_ambil", false: "belum_ambil", tidak: "belum_ambil", no: "belum_ambil", n: "belum_ambil",
};

// Status Belingua bisa datang dalam beberapa bentuk: string kanonik
// (belum_ambil / proses / lulus), boolean lama (true = lulus), atau angka
// progres (0 / 0.5 / 1). Semua dipetakan ke satu status kanonik supaya label
// selalu mencerminkan kondisi asli — mahasiswa yang sudah lulus tetap "Lulus".
export function normalizeBelinguaStatus(status) {
  if (typeof status === "boolean") return status ? "lulus" : "belum_ambil";
  if (typeof status === "number") {
    if (status > 1 || status < 0) return "belum_ambil";
    return status >= 1 ? "lulus" : status >= 0.5 ? "proses" : "belum_ambil";
  }
  const key = sanitizeString(status);
  if (Object.prototype.hasOwnProperty.call(BELINGUA_LABEL, key)) return key;
  if (/^\d+(_\d+)?$/.test(key)) {
    const num = Number(key.replace("_", "."));
    return num >= 1 ? "lulus" : num >= 0.5 ? "proses" : "belum_ambil";
  }
  return BELINGUA_ALIASES[key] || "belum_ambil";
}

export function belinguaLabel(status) {
  return BELINGUA_LABEL[normalizeBelinguaStatus(status)];
}

// Status akademik mahasiswa (bukan status kelulusan): aktif/cuti/lulus/do.
export const STUDENT_STATUSES = ["aktif", "cuti", "lulus", "do"];
const STUDENT_STATUS_ALIASES = {
  aktif: "aktif", active: "aktif", kuliah: "aktif", aktif_kuliah: "aktif",
  cuti: "cuti", leave: "cuti", cuti_akademik: "cuti", on_leave: "cuti",
  lulus: "lulus", graduate: "lulus", graduated: "lulus", sudah_lulus: "lulus",
  do: "do", dropout: "do", drop_out: "do", dikeluarkan: "do", berhenti: "do",
};

export function normalizeStudentStatus(status) {
  const key = sanitizeString(status);
  if (STUDENT_STATUSES.includes(key)) return key;
  return STUDENT_STATUS_ALIASES[key] || "aktif";
}

// Terapkan sanitasi pada field enum mahasiswa sebelum dikirim ke data layer,
// sehingga nilai dari sumber mana pun (import, form, API) tetap valid dan tidak
// ditolak check constraint database.
export function sanitizeStudentFields(row = {}) {
  const out = { ...row };
  if (out.status !== undefined) out.status = normalizeStudentStatus(out.status);
  if (out.belingua_status !== undefined) out.belingua_status = normalizeBelinguaStatus(out.belingua_status);
  return out;
}

const BELINGUA_PROGRESS = { lulus: 1, proses: 0.5, belum_ambil: 0 };

export function normativeTarget(req, semester) {
  const targets = req?.targets || {};
  let fraction = 0;
  for (const key of Object.keys(targets)) {
    const n = parseInt(key, 10);
    if (!Number.isNaN(n) && n <= semester) {
      fraction = Math.max(fraction, Number(targets[key]) || 0);
    }
  }
  return fraction;
}

function certSummary(certifications = []) {
  // Collapse duplicate rows (same certification name) so legacy/duplicated data
  // can never inflate the count. Prefer a row that is marked obtained.
  const unique = new Map();
  for (const c of certifications) {
    const key = String(c.name || "").trim().toLowerCase() || `#${c.id ?? unique.size}`;
    const prev = unique.get(key);
    if (!prev || (c.obtained && !prev.obtained)) unique.set(key, c);
  }
  const list = [...unique.values()];
  return {
    total: list.length,
    obtained: list.filter((c) => c.obtained).length,
  };
}

// Returns { actual, total, unit } in "real" units for a category
function actualValue(category, student, context) {
  switch (category) {
    case "sks":
      return { actual: Number(student.total_sks_passed) || 0, total: context.req.total_required };
    case "comserv":
      return { actual: Number(student.comserv_hours) || 0, total: context.req.total_required };
    case "sat":
      return { actual: Number(student.sat_hours) || 0, total: context.req.total_required };
    case "belingua": {
      const status = normalizeBelinguaStatus(student.belingua_status);
      const p = BELINGUA_PROGRESS[status] ?? 0;
      const total = context.req.total_required || 1;
      return { actual: p * total, total, status, score: student.belingua_score };
    }
    case "sertifikasi": {
      const { obtained } = context.cert;
      const total = context.req.total_required || 1;
      return { actual: obtained, total, requiredList: context.certifications || [] };
    }
    default:
      return { actual: 0, total: 0 };
  }
}

function statusFromRatio(ratio, gap, remainingSemesters) {
  if (gap <= 0) return "safe";
  if (remainingSemesters <= 2) return "danger";
  if (ratio >= 0.85) return "warn";
  return "danger";
}

export const STATUS_LABEL = {
  safe: "Aman",
  warn: "Perlu Perhatian",
  danger: "Mendesak",
  info: "Info",
};

// Belingua itu biner (lulus / belum), bukan progres bertahap seperti SKS.
// "Sedang menjalankan" belum berarti selesai, jadi tidak boleh mendapat label
// AMAN: AMAN hanya diberikan bila Belingua sudah LULUS.
// Kalau target semester ini belum jatuh tempo dan mahasiswa belum memulai,
// kategorinya berstatus INFO (netral) — belum ada kewajiban, tapi juga belum
// selesai, sehingga tidak boleh ditampilkan sebagai AMAN.
function belinguaStatus(student, remainingSemesters, targetDue) {
  const status = normalizeBelinguaStatus(student.belingua_status);
  if (status === "lulus") return "safe";
  if (status === "proses") return remainingSemesters > 2 ? "warn" : "danger";
  // belum_ambil
  return targetDue ? "danger" : "info";
}

export const STATUS_RANK = { danger: 3, warn: 2, safe: 1, info: 0 };

export function evaluateCategory(category, student, requirements, certifications) {
  const req = requirements.find((r) => r.category === category) || {
    total_required: 0,
    targets: {},
    label: CATEGORY_META[category].label,
    unit: CATEGORY_META[category].unit,
  };
  const semester = student.current_semester;
  const remainingSemesters = Math.max(1, GRADUATION_SEMESTER - semester + 1);
  const targetFraction = normativeTarget(req, semester);

  const isBelingua = category === "belingua";
  const belinguaRaw = normalizeBelinguaStatus(student.belingua_status);

  const ctx = {
    req,
    cert: certSummary(certifications),
    certifications,
    // Status Belingua asli ikut disimpan supaya UI (progress bar, label,
    // alasan prioritas) menampilkan kondisi sebenarnya — "Sedang Menjalankan"
    // tidak boleh tampil sebagai "Belum Menjalankan".
    ...(isBelingua ? { status: belinguaRaw } : {}),
  };
  const { actual, total } = actualValue(category, student, ctx);

  // The target is always a fraction of the category's curriculum total (for
  // certification: the configured number of required certifications). It is
  // deliberately NOT derived from the student's own rows, so duplicated or
  // extra records can't inflate the requirement.
  const targetBase = total;
  const targetValue = targetFraction * targetBase;

  const belinguaPassed = belinguaRaw === "lulus";

  // Belingua: selama belum lulus, seluruh target semester ini dianggap belum terpenuhi.
  // (actual 0.5 untuk "proses" hanya dipakai untuk progress bar, bukan untuk gap.)
  const gap = isBelingua
    ? (belinguaPassed ? 0 : targetValue)
    : Math.max(0, targetValue - actual);
  const ratio = targetValue > 0 ? actual / targetValue : 1;
  const gapFraction = targetBase > 0 ? gap / targetBase : 0;

  let status = targetValue === 0 && gap <= 0
    ? "safe"
    : statusFromRatio(ratio, gap, remainingSemesters);
  // Status Belingua selalu dihitung dari status yang tercatat pada mahasiswa
  // (lulus / proses / belum_ambil), bukan dari gap — supaya "Sedang
  // Menjalankan" tidak pernah ikut tampil sebagai AMAN.
  if (isBelingua) status = belinguaStatus(student, remainingSemesters, targetValue > 0);

  const urgency = gap > 0 ? (gapFraction * 100) / remainingSemesters : 0;

  return {
    category,
    label: req.label || CATEGORY_META[category].label,
    unit: req.unit || CATEGORY_META[category].unit,
    semester,
    remainingSemesters,
    targetFraction,
    targetValue: round(targetValue),
    actual: round(actual),
    total: round(total),
    gap: round(gap),
    gapFraction,
    ratio,
    urgency,
    status,
    statusLabel: STATUS_LABEL[status],
    raw: ctx,
  };
}

export function recommendedRetakeSemester(student) {
  const next = student.current_semester + 1;
  return Math.min(next, MAX_SEMESTER);
}

export function evaluateStudent(student, requirements, failedCourses = [], certifications = []) {
  const categories = ["sks", "comserv", "sat", "belingua", "sertifikasi"]
    .map((c) => evaluateCategory(c, student, requirements, certifications));

  const priorities = categories
    .filter((c) => c.gap > 0)
    .sort((a, b) => b.urgency - a.urgency)
    .map((c, i) => ({ ...c, rank: i + 1 }));

  // Overall bukan sekadar status terburuk. Satu indikator yang tertinggal tipis
  // (masih >= NEAR_MISS_RATIO dari target semester) dan masih punya lebih dari
  // 2 semester tidak boleh menenggelamkan indikator lain yang sudah aman.
  // Badge per kategori tetap jujur MENDESAK; hanya ringkasannya yang SEDANG.
  // Semester 7-8 tetap ketat: di sana tidak ada lagi waktu untuk mengejar.
  const urgent = categories.filter((c) => c.status === "danger");
  const nearMiss = urgent.length === 1
    && urgent[0].remainingSemesters > 2
    && urgent[0].ratio >= NEAR_MISS_RATIO;
  const overall = urgent.length === 0
    ? (categories.some((c) => c.status === "warn") ? "warn" : "safe")
    : nearMiss ? "warn" : "danger";

  const failed = failedCourses.map((f) => ({
    ...f,
    retake_semester: recommendedRetakeSemester(student),
  }));

  return {
    student,
    categories,
    priorities,
    failed,
    overall,
    overallLabel: STATUS_LABEL[overall],
    primary: priorities[0] || null,
  };
}

export function priorityReason(item) {
  const unit = item.unit ? ` ${item.unit}` : "";
  if (item.category === "belingua") {
    return `Belingua berstatus "${belinguaLabel(item.raw.status)}". Perlu lulus untuk memenuhi target semester ${item.semester}.`;
  }
  if (item.category === "sertifikasi") {
    return `Kurang ${item.gap} sertifikat dari target semester ini.`;
  }
  return `Kurang ${item.gap}${unit} dari target semester ${item.semester} (${item.targetValue}${unit}). Sisa ${item.remainingSemesters} semester.`;
}

export function recommendationSentence(result) {
  const s = result.student;
  if (!result.priorities.length) {
    return `${s.name} sudah sesuai target: semua syarat kelulusan memenuhi norma semester ${s.current_semester}.`;
  }
  const parts = result.priorities.slice(0, 3).map((p, i) => {
    if (p.category === "belingua") {
      return `Prioritas ${i + 1}: Belingua` + (p.gap > 0 ? " — belum lulus." : ".");
    }
    if (p.category === "sertifikasi") {
      return `Prioritas ${i + 1}: Sertifikasi — kurang ${p.gap}.`;
    }
    const unit = p.unit ? ` ${p.unit}` : "";
    return `Prioritas ${i + 1}: ${p.label} — kurang ${p.gap}${unit} dari target.`;
  });
  let text = `Rekomendasi untuk ${s.name} — Semester ${s.current_semester}: ` + parts.join(" ");
  if (result.failed.length) {
    const list = result.failed.map((f) => f.nama_mk).join(", ");
    text += ` Mata kuliah tidak lulus: ${list} — disarankan diulang di semester ${result.failed[0].retake_semester}.`;
  }
  return text;
}

function round(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
