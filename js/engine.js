export const GRADUATION_SEMESTER = 8;
export const MAX_SEMESTER = 14;

export const CATEGORY_META = {
  sks: { label: "SKS", unit: "SKS", icon: "SKS" },
  comserv: { label: "Comserv", unit: "hours", icon: "CS" },
  sat: { label: "SAT", unit: "hours", icon: "SAT" },
  belingua: { label: "Belingua", unit: "", icon: "BL" },
  sertifikasi: { label: "Certification", unit: "", icon: "CT" },
};

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
  const required = certifications.filter((c) => c.is_required);
  const total = required.length;
  const obtained = required.filter((c) => c.obtained).length;
  return { total, obtained };
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
      const p = BELINGUA_PROGRESS[student.belingua_status] ?? 0;
      const total = context.req.total_required || 1;
      return { actual: p * total, total, status: student.belingua_status, score: student.belingua_score };
    }
    case "sertifikasi": {
      const { total, obtained } = context.cert;
      const reqTotal = total || context.req.total_required || 1;
      return { actual: obtained, total: reqTotal, requiredList: context.certifications || [] };
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
  safe: "On Track",
  warn: "Needs Attention",
  danger: "Urgent",
  info: "Info",
};

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

  const ctx = {
    req,
    cert: certSummary(certifications),
    certifications,
  };
  const { actual, total } = actualValue(category, student, ctx);

  // For binary/accumulation categories the target is a fraction of the
  // curriculum total; for certification the target is a fraction of the
  // number of required certifications held by the student.
  const targetBase = category === "sertifikasi" ? ctx.cert.total || req.total_required : req.total_required;
  const targetValue = targetFraction * targetBase;

  const gap = Math.max(0, targetValue - actual);
  const ratio = targetValue > 0 ? actual / targetValue : 1;
  const gapFraction = targetBase > 0 ? gap / targetBase : 0;

  const status = targetValue === 0 && gap <= 0
    ? "safe"
    : statusFromRatio(ratio, gap, remainingSemesters);

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

  const overall = categories.reduce(
    (worst, c) => (STATUS_RANK[c.status] > STATUS_RANK[worst] ? c.status : worst),
    "safe"
  );

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
    const map = { belum_ambil: "not yet taken", proses: "in progress", lulus: "passed" };
    return `Belingua is "${map[item.raw.status] || item.raw.status}". Needed: reach the semester-${item.semester} target.`;
  }
  if (item.category === "sertifikasi") {
    return `Missing ${item.gap} required certification(s) for this semester's target.`;
  }
  return `Short by ${item.gap}${unit} against the semester-${item.semester} target (${item.targetValue}${unit}). ${item.remainingSemesters} semester(s) left.`;
}

export function recommendationSentence(result) {
  const s = result.student;
  if (!result.priorities.length) {
    return `${s.name} is on track — all graduation requirements meet the norms for semester ${s.current_semester}.`;
  }
  const parts = result.priorities.slice(0, 3).map((p, i) => {
    if (p.category === "belingua") {
      return `Priority ${i + 1}: Belingua` + (p.gap > 0 ? " — still not passed." : ".");
    }
    if (p.category === "sertifikasi") {
      return `Priority ${i + 1}: Certification — ${p.gap} still missing.`;
    }
    const unit = p.unit ? ` ${p.unit}` : "";
    return `Priority ${i + 1}: ${p.label} — short by ${p.gap}${unit} of the target.`;
  });
  let text = `Recommendation for ${s.name} — Semester ${s.current_semester}: ` + parts.join(" ");
  if (result.failed.length) {
    const list = result.failed.map((f) => f.nama_mk).join(", ");
    text += ` Failed courses: ${list} — recommended to retake in semester ${result.failed[0].retake_semester}.`;
  }
  return text;
}

function round(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
