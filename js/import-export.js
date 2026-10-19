import { initLayout } from "./ui.js";
import {
  loadDashboard, listFailedCourses, listCertifications,
  studentIdsByNim, updateStudent, insertStudent,
  listPrograms, listAdvisors, listRequirements, updateRequirements,
  insertFailedCourses, insertCertifications, logAudit,
} from "./data.js";
import { evaluateStudent, STATUS_LABEL, normalizeStudentStatus, normalizeBelinguaStatus } from "./engine.js";
import {
  el, escapeHtml, formatNumber, toast, downloadFile, toCsv, setBusy,
} from "./utils.js";

const STUDENT_FIELDS = ["name", "program_code", "advisor_kode", "angkatan", "current_semester", "status", "total_sks_passed", "comserv_hours", "sat_hours", "belingua_status", "belingua_score"];
const COURSE_FIELDS = ["kode_mk", "nama_mk", "sks", "nilai", "semester_taken"];
const CERT_FIELDS = ["cert_name", "cert_required", "cert_obtained", "cert_obtained_at"];

// Satu template untuk semua data. Satu baris = satu mahasiswa + (opsional) satu MK tidak lulus
// + (opsional) satu sertifikasi. Mahasiswa dengan banyak MK/sertifikasi: ulangi NIM di baris berikutnya.
const TEMPLATE = {
  headers: ["nim", ...STUDENT_FIELDS, ...COURSE_FIELDS, ...CERT_FIELDS],
  sample: [
    ["2702314920", "Andi Pratama", "CS", "D001", "2023", "6", "aktif", "126", "26", "20", "proses", "480", "", "", "", "", "", "Sertifikasi Kompetensi Pemrograman", "true", "true", "2025-06-01"],
    ["2702314921", "Bella Kartika", "IS", "D002", "2023", "5", "aktif", "110", "24", "18", "belum_ambil", "450", "COMP6047", "Algoritma dan Pemrograman", "4", "D", "2", "", "", "", ""],
    ["2702314921", "", "", "", "", "", "", "", "", "", "", "", "COMP6048", "Struktur Data", "4", "E", "3", "", "", "", ""],
    ["2702314922", "Chandra Wijaya", "CS", "D001", "2022", "7", "aktif", "130", "30", "25", "proses", "500", "", "", "", "", "", "", "", "", ""],
  ],
  hint: "Satu file untuk semua data. Wajib: nim (mahasiswa baru juga wajib name). Kolom MK tidak lulus (kode_mk, nama_mk wajib bila diisi) dan sertifikasi (cert_name wajib bila diisi) boleh dikosongkan. Untuk banyak MK/sertifikasi per mahasiswa, ulangi NIM di baris baru. cert_required/cert_obtained menerima true/false atau 1/0.",
};

let state = { students: [], requirements: [], programs: [], advisors: [], selectedFile: null, profile: null, canEditRequirements: false };

function resolveProgram(code) {
  if (!code) return null;
  const c = String(code).trim().toLowerCase();
  return state.programs.find((p) => p.code.toLowerCase() === c) || null;
}

function resolveAdvisor(kode) {
  if (!kode) return null;
  const k = String(kode).trim().toLowerCase();
  return state.advisors.find((a) => a.kode_dosen.toLowerCase() === k) || null;
}

// ---------------------------------------------------------------- parsing ---

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

async function readWorkbook(file) {
  const XLSX = await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
}

async function recordsFromFile(file) {
  const isExcel = /\.xlsx?$/i.test(file.name);
  const matrix = isExcel ? await readWorkbook(file) : parseCsv(await file.text());
  if (!matrix.length) return { headers: [], records: [] };
  const headers = matrix[0].map((h) => String(h).trim().toLowerCase());
  const records = matrix.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = r[i] !== undefined ? String(r[i]).trim() : ""));
    return obj;
  });
  return { headers, records };
}

function truthy(v) {
  return ["true", "1", "yes", "y", "ya"].includes(String(v).trim().toLowerCase());
}

// ---------------------------------------------------------------- import ----

async function runImport() {
  const file = state.selectedFile;
  if (!file) return;
  const btn = el("import-btn");
  setBusy(btn, true, "Importing...");
  try {
    const { headers, records } = await recordsFromFile(file);
    if (!headers.length) throw new Error("The file appears to be empty.");
    if (!headers.includes("nim")) throw new Error("Kolom 'nim' tidak ditemukan di file.");

    const errors = [];
    const badLines = new Set();
    const fail = (line, msg) => { errors.push([line, msg]); badLines.add(line); };
    const stats = { students: 0, courses: 0, certs: 0 };

    // Kelompokkan baris per NIM (baris pertama = sumber data mahasiswa, kolom kosong diisi dari baris lain).
    const groups = new Map();
    records.forEach((r, i) => {
      const line = i + 2;
      if (!r.nim) { fail(line, "Missing 'nim' column value"); return; }
      if (!groups.has(r.nim)) groups.set(r.nim, []);
      groups.get(r.nim).push({ r, line });
    });

    const nimMap = await studentIdsByNim([...groups.keys()]);

    // ---- Tahap 1: mahasiswa (update / insert) ----
    const failedNims = new Set();
    for (const [nim, items] of groups) {
      const line = items[0].line;
      const merged = {};
      for (const f of STUDENT_FIELDS) {
        const hit = items.find((it) => it.r[f] !== undefined && it.r[f] !== "");
        if (hit) merged[f] = hit.r[f];
      }

      // Sanitasi nilai enum agar variasi format dari file (mis. "Aktif",
      // "active", "Lulus", "belum ambil") tetap diterima database.
      const patch = {};
      if (merged.current_semester) patch.current_semester = clampInt(merged.current_semester, 1, 14);
      if (merged.status) patch.status = normalizeStudentStatus(merged.status);
      if (merged.total_sks_passed) patch.total_sks_passed = toInt(merged.total_sks_passed);
      if (merged.comserv_hours) patch.comserv_hours = toNum(merged.comserv_hours);
      if (merged.sat_hours) patch.sat_hours = toNum(merged.sat_hours);
      if (merged.belingua_status) patch.belingua_status = normalizeBelinguaStatus(merged.belingua_status);
      if (merged.belingua_score) patch.belingua_score = toNum(merged.belingua_score);
      if (merged.angkatan) patch.angkatan = toInt(merged.angkatan);

      const program = resolveProgram(merged.program_code);
      const advisor = resolveAdvisor(merged.advisor_kode);
      if (merged.program_code && !program) { fail(line, `Unknown program_code '${merged.program_code}'`); failedNims.add(nim); continue; }
      if (merged.advisor_kode && !advisor) { fail(line, `Unknown advisor_kode '${merged.advisor_kode}'`); failedNims.add(nim); continue; }
      if (program) patch.program_id = program.id;
      if (advisor) patch.advisor_id = advisor.id;

      if (nimMap[nim]) {
        if (!Object.keys(patch).length) continue; // hanya data MK/sertifikasi untuk mahasiswa yang sudah ada
        try { await updateStudent(nimMap[nim], patch); stats.students++; }
        catch (e) { fail(line, e.message); failedNims.add(nim); }
      } else {
        if (!merged.name) { fail(line, "New student requires a 'name'"); failedNims.add(nim); continue; }
        const row = {
          nim,
          name: merged.name,
          program_id: program ? program.id : state.programs[0]?.id || null,
          advisor_id: advisor ? advisor.id : state.advisors[0]?.id || null,
          angkatan: patch.angkatan ?? null,
          current_semester: patch.current_semester ?? 1,
          status: patch.status || "aktif",
          total_sks_passed: patch.total_sks_passed ?? 0,
          comserv_hours: patch.comserv_hours ?? 0,
          sat_hours: patch.sat_hours ?? 0,
          belingua_status: patch.belingua_status || "belum_ambil",
          belingua_score: patch.belingua_score ?? null,
        };
        try { await insertStudent(row); stats.students++; }
        catch (e) { fail(line, e.message); failedNims.add(nim); }
      }
    }

    // Ambil ulang ID supaya mahasiswa yang baru dibuat ikut terbaca.
    const idMap = await studentIdsByNim([...groups.keys()]);

    // ---- Tahap 2: MK tidak lulus & sertifikasi ----
    const courseRows = [];
    const certRows = [];
    const seenCourse = new Set();
    const seenCert = new Set();
    for (const [nim, items] of groups) {
      for (const { r, line } of items) {
        const hasCourse = COURSE_FIELDS.some((f) => r[f]);
        const hasCert = CERT_FIELDS.some((f) => r[f]);
        if (!hasCourse && !hasCert) continue;
        if (failedNims.has(nim)) { fail(line, "Data mahasiswa gagal diproses, MK/sertifikasi dilewati."); continue; }
        if (!idMap[nim]) { fail(line, `NIM ${nim} not found.`); continue; }

        if (hasCourse) {
          if (!r.kode_mk || !r.nama_mk) { fail(line, "kode_mk and nama_mk are required"); continue; }
          const key = `${nim}|${r.kode_mk}|${r.semester_taken}`;
          if (!seenCourse.has(key)) {
            seenCourse.add(key);
            courseRows.push({
              student_id: idMap[nim], kode_mk: r.kode_mk, nama_mk: r.nama_mk,
              sks: toInt(r.sks), nilai: r.nilai || null,
              semester_taken: r.semester_taken ? toInt(r.semester_taken) : null,
            });
          }
        }
        if (hasCert) {
          if (!r.cert_name) { fail(line, "cert_name is required when certification columns are filled"); continue; }
          const key = `${nim}|${r.cert_name.toLowerCase()}`;
          if (!seenCert.has(key)) {
            seenCert.add(key);
            certRows.push({
              student_id: idMap[nim], name: r.cert_name,
              is_required: r.cert_required === "" ? true : truthy(r.cert_required),
              obtained: truthy(r.cert_obtained),
              obtained_at: r.cert_obtained_at || null,
            });
          }
        }
      }
    }
    try {
      if (courseRows.length) { await insertFailedCourses(courseRows); stats.courses = courseRows.length; }
    } catch (e) { errors.push(["MK", e.message]); }
    try {
      if (certRows.length) { await insertCertifications(certRows); stats.certs = certRows.length; }
    } catch (e) { errors.push(["Sertifikasi", e.message]); }

    const okCount = records.length - badLines.size;
    logAudit({ entity: "students", action: "import", detail: { success: okCount, failed: errors.length, file: file.name, ...stats } });
    if (okCount > 0) pushRiwayat();
    showResult(okCount, errors, stats);
  } catch (err) {
    toast(err.message || "Import failed", "error");
  } finally {
    setBusy(btn, false);
  }
}

function showResult(successCount, errors, stats) {
  const card = el("result-card");
  card.classList.remove("hidden");
  el("result-summary").innerHTML = `
    <div class="card kpi safe"><div class="k-label">Imported</div><div class="k-value">${successCount}</div></div>
    <div class="card kpi danger"><div class="k-label">Failed</div><div class="k-value">${errors.length}</div></div>
    <div class="card kpi accent"><div class="k-label">Rincian</div><div class="k-value" style="font-size:0.95rem">${stats.students} mahasiswa · ${stats.courses} MK · ${stats.certs} sertifikasi</div></div>`;
  el("result-detail").innerHTML = errors.length
    ? `<div class="table-wrap"><table class="data"><thead><tr><th>Row</th><th>Issue</th></tr></thead>
        <tbody>${errors.map(([line, msg]) => `<tr><td class="mono">${line}</td><td>${escapeHtml(msg)}</td></tr>`).join("")}</tbody>
       </table></div>`
    : `<div class="alert success">All rows imported successfully.</div>`;
  card.scrollIntoView({ behavior: "smooth" });
}

// ---------------------------------------------------------------- export ----

async function runExport() {
  const format = el("x-format").value;
  const btn = el("export-btn");
  setBusy(btn, true, "Preparing...");
  try {
    const detailed = await detailedRows();
    const rows = detailed.map(toExportRow);
    if (!rows.length) { toast("No data matches the filters.", "warn"); return; }
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "csv") {
      downloadFile(`student-monitoring-${stamp}.csv`, toCsv(rows));
    } else if (format === "xlsx") {
      const XLSX = await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm");
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Monitoring");
      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      downloadFile(`student-monitoring-${stamp}.xlsx`, new Blob([out], { type: "application/octet-stream" }));
    } else {
      exportPdf(rows);
      logAudit({ entity: "students", action: "export_pdf", detail: { count: rows.length } });
      toast("PDF print dialog opened.", "success");
      setBusy(btn, false);
      return;
    }
    logAudit({ entity: "students", action: "export", detail: { count: rows.length, format } });
    toast("Export ready.", "success");
  } catch (err) {
    toast(err.message || "Export failed", "error");
  } finally {
    setBusy(btn, false);
  }
}

async function detailedRows() {
  const { students, requirements } = await loadDashboard();
  const angkatanFilter = el("x-angkatan")?.value || "";
  const semesterFilter = el("x-semester")?.value || "";
  const filtered = students.filter((s) => {
    if (angkatanFilter && String(s.angkatan) !== angkatanFilter) return false;
    if (semesterFilter && String(s.current_semester) !== semesterFilter) return false;
    return true;
  });
  const detailed = await Promise.all(
    filtered.map(async (s) => {
      const [failed, certs] = await Promise.all([
        listFailedCourses(s.id).catch(() => []),
        listCertifications(s.id).catch(() => []),
      ]);
      return evaluateStudent(s, requirements.filter((r) => r.program_id === s.program_id), failed, certs);
    })
  );
  const status = el("x-status")?.value || "";
  return status ? detailed.filter((r) => r.overall === status) : detailed;
}

function toExportRow(r) {
  return {
    NIM: r.student.nim,
    Name: r.student.name,
    Program: r.student.programs?.name || "",
    Angkatan: r.student.angkatan,
    Semester: r.student.current_semester,
    SKS_passed: r.student.total_sks_passed,
    Comserv_hours: r.student.comserv_hours,
    SAT_hours: r.student.sat_hours,
    Belingua: r.student.belingua_status,
    Overall_status: STATUS_LABEL[r.overall],
    Priority_1: r.priorities[0]?.label || "",
    Priority_2: r.priorities[1]?.label || "",
    Priority_3: r.priorities[2]?.label || "",
    Failed_courses: r.failed.map((f) => f.nama_mk).join("; "),
  };
}

function exportPdf(rows) {
  const win = window.open("", "_blank", "width=1000,height=760");
  if (!win) return;
  const head = Object.keys(rows[0]);
  const body = rows.map((r) => `<tr>${head.map((h) => `<td>${escapeHtml(r[h])}</td>`).join("")}</tr>`).join("");
  win.document.write(`
    <!DOCTYPE html><html><head><title>Student Monitoring Report</title>
    <style>
      body{font-family:"Segoe UI",Arial,sans-serif;padding:24px;color:#1a2233}
      h1{font-size:18px;margin:0 0 4px} .sub{color:#64708a;font-size:12px;margin-bottom:16px}
      table{border-collapse:collapse;width:100%;font-size:11px}
      th,td{border:1px solid #d5dbe6;padding:6px 8px;text-align:left}
      th{background:#f4f6fb}
    </style></head><body>
    <h1>Student Graduation Monitoring Report</h1>
    <div class="sub">Generated ${new Date().toLocaleString("en-GB")}</div>
    <table><thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
    <tbody>${body}</tbody></table></body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

// --------------------------------------------------------------- settings ---

// Categories counted in whole units; their curriculum total must stay an integer.
// Hours (comserv, sat) may be fractional.
const INTEGER_TOTAL_CATEGORIES = new Set(["sks", "belingua", "sertifikasi"]);

// Belingua bukan angka 0/1, melainkan status dengan tiga nilai seperti di database
// (belum_ambil / proses / lulus). Target per semester disimpan sebagai fraksi
// 0 / 0.5 / 1 agar tetap kompatibel dengan engine (lihat BELINGUA_PROGRESS).
const BELINGUA_TARGETS = [
  { value: 0, label: "Belum Menjalankan" },
  { value: 0.5, label: "Sedang Menjalankan" },
  { value: 1, label: "Lulus" },
];

function belinguaTargetValue(raw) {
  const n = Number(raw || 0);
  if (n >= 1) return 1;
  if (n >= 0.5) return 0.5;
  return 0;
}

function belinguaTargetLabel(raw) {
  const v = belinguaTargetValue(raw);
  return BELINGUA_TARGETS.find((o) => o.value === v)?.label || BELINGUA_TARGETS[0].label;
}

function canEditTargets() {
  return state.profile?.role !== "kaprodi";
}

function renderSettings() {
  const host = el("settings-host");
  if (!host) return;
  const editable = canEditTargets();
  const grouped = {};
  for (const r of state.requirements) {
    grouped[r.category] = grouped[r.category] || [];
    grouped[r.category].push(r);
  }
  const semesters = [1, 2, 3, 4, 5, 6, 7, 8];
  const selectStyle = "min-width:128px;background:#fff;border:1px solid #cbd5e1;border-radius:6px;padding:4px 6px;font-size:11px;";
  host.innerHTML = `
    <div class="table-wrap"><table class="data">
      <thead><tr><th>Category</th><th>Curriculum total</th>${semesters.map((s) => `<th>Sem ${s}</th>`).join("")}</tr></thead>
      <tbody>
        ${Object.values(grouped).map((rows) => {
          const r = rows[0];
          const isBelingua = r.category === "belingua";
          const totalCell = isBelingua
            ? ""
            : editable
              ? `<input type="number" step="${INTEGER_TOTAL_CATEGORIES.has(r.category) ? "1" : "any"}" min="0" data-req="${r.id}" data-field="total" value="${formatNumber(r.total_required)}" style="width:84px;text-align:right;background:#fff;border:1px solid #cbd5e1;border-radius:6px;padding:4px 6px;" />`
              : formatNumber(r.total_required);
          return `<tr data-req="${r.id}">
            <td><strong>${escapeHtml(r.label)}</strong></td>
            ${semesters.map((s) => {
              if (isBelingua) {
                const current = belinguaTargetValue(r.targets?.[s]);
                if (!editable) return `<td class="mono">${belinguaTargetLabel(current)}</td>`;
                const opts = BELINGUA_TARGETS.map((o) => `<option value="${o.value}"${o.value === current ? " selected" : ""}>${o.label}</option>`).join("");
                return `<td><select data-req="${r.id}" data-sem="${s}" data-belingua="1" style="${selectStyle}" title="target status Belingua per semester">${opts}</select></td>`;
              }
              const frac = Number(r.targets?.[s] || 0);
              const isInt = INTEGER_TOTAL_CATEGORIES.has(r.category);
              const rawTarget = frac * Number(r.total_required || 0);
              const target = isInt ? Math.round(rawTarget) : Math.round(rawTarget * 100) / 100;
              return editable
                ? `<td><input type="number" step="${isInt ? "1" : "0.01"}" min="0" max="${formatNumber(r.total_required)}" data-req="${r.id}" data-sem="${s}" value="${target}" style="width:64px;background:#fff;border:1px solid #cbd5e1;border-radius:6px;padding:4px 6px;" title="target kumulatif per semester (${r.unit || "jumlah"})" /></td>`
                : `<td class="mono">${target > 0 ? formatNumber(target) : ""}</td>`;
            }).join("")}
          </tr>`;
        }).join("")}
      </tbody>
    </table></div>
    <div class="mt-16" style="display:flex; gap:8px; justify-content:flex-end;">
      ${editable ? `<button class="btn primary sm" id="save-targets-btn" type="button">Simpan konfigurasi</button>` : ""}
    </div>`;

  const saveBtn = el("save-targets-btn");
  if (saveBtn) saveBtn.addEventListener("click", saveSettings);
}

async function saveSettings() {
  const btn = el("save-targets-btn");
  setBusy(btn, true, "Menyimpan...");
  try {
    const byId = {};
    for (const r of state.requirements) {
      byId[r.id] = { id: r.id, category: r.category, total_required: r.total_required, targets: { ...(r.targets || {}) } };
    }
    document.querySelectorAll("#settings-host input[data-req], #settings-host select[data-req]").forEach((input) => {
      const id = input.dataset.req;
      const row = byId[id];
      if (!row) return;
      if (input.dataset.belingua) {
        const v = parseFloat(String(input.value).replace(",", "."));
        if (!Number.isNaN(v)) row.targets[input.dataset.sem] = v;
        return;
      }
      const v = parseFloat(String(input.value).replace(",", "."));
      if (input.dataset.field === "total") {
        if (!Number.isNaN(v) && v > 0) {
          row.total_required = INTEGER_TOTAL_CATEGORIES.has(row.category) ? Math.round(v) : v;
        }
      } else if (input.dataset.sem) {
        const total = Number(row.total_required) || 0;
        if (!Number.isNaN(v) && v >= 0 && total > 0) {
          row.targets[input.dataset.sem] = Math.min(1, v / total);
        }
      }
    });
    await updateRequirements(Object.values(byId));
    const reqs = await listRequirements();
    state.requirements = reqs;
    renderSettings();
    toast("Konfigurasi semester tersimpan.", "success");
  } catch (err) {
    toast(err.message || "Gagal menyimpan konfigurasi.", "error");
  } finally {
    setBusy(btn, false);
  }
}

function populateExportFilters() {
  const angkatanEl = el("x-angkatan");
  const semesterEl = el("x-semester");
  const angkatan = [...new Set(state.students.map((s) => s.angkatan).filter(Boolean))].sort((a, b) => a - b);
  const semester = [...new Set(state.students.map((s) => s.current_semester))].sort((a, b) => a - b);
  if (angkatanEl) angkatanEl.innerHTML = `<option value="">Semua Angkatan</option>` + angkatan.map((a) => `<option value="${a}">${a}</option>`).join("");
  if (semesterEl) semesterEl.innerHTML = `<option value="">Semua Semester</option>` + semester.map((s) => `<option value="${s}">Semester ${s}</option>`).join("");
  const angkatanOpts = angkatan.length ? "" : "<!-- no angkatan -->";
  void angkatanOpts;
}

// ---------------------------------------------------------------- helpers ---

function toInt(v) { const n = parseInt(v, 10); return Number.isNaN(n) ? 0 : n; }
function toNum(v) { const n = Number(v); return Number.isNaN(n) ? 0 : n; }
function clampInt(v, min, max) { return Math.min(max, Math.max(min, toInt(v))); }

function updateTemplateUI() {
  el("template-hint").textContent = `${TEMPLATE.hint} Kolom: ${TEMPLATE.headers.join(", ")}`;
}

function wire() {
  el("download-template").addEventListener("click", () => {
    downloadFile("template-data-lengkap.csv", toCsv(TEMPLATE.sample, TEMPLATE.headers));
  });

  const dz = el("dropzone");
  const input = el("file-input");
  dz.addEventListener("click", () => input.click());
  input.addEventListener("change", () => setFile(input.files[0]));
  ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("dragover"); }));
  dz.addEventListener("drop", (e) => setFile(e.dataTransfer.files[0]));

  el("import-btn").addEventListener("click", runImport);
  el("export-btn").addEventListener("click", runExport);

  // Kaprodi is read-only: disable every control that writes.
  if (state.profile?.role === "kaprodi") {
    el("import-btn").disabled = true;
    el("save-targets-btn")?.remove();
    const dzEl = el("dropzone");
    if (dzEl) dzEl.style.opacity = "0.6";
    const note = document.createElement("div");
    note.className = "alert warn";
    note.style.marginTop = "12px";
    note.textContent = "Mode baca saja untuk Kaprodi: import data dan konfigurasi semester dinonaktifkan.";
    dzEl?.parentElement?.appendChild(note);
  }
}

function setFile(file) {
  if (!file) return;
  state.selectedFile = file;
  el("file-name").textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  el("import-btn").disabled = false;
}

function bindExportToggles() {
  const xlsx = el("fmt-xlsx");
  const csv = el("fmt-csv");
  const fmt = el("x-format");
  const apply = (mode) => {
    if (!fmt) return;
    fmt.value = mode;
    xlsx.style.background = mode === "xlsx" ? "#ffffff" : "#eef6fb";
    xlsx.style.color = mode === "xlsx" ? "#0c7fae" : "#0c7fae";
    csv.style.background = mode === "csv" ? "#ffffff" : "#eef6fb";
    csv.style.color = mode === "csv" ? "#0c7fae" : "#0c7fae";
    xlsx.style.borderColor = mode === "xlsx" ? "#0c7fae" : "#cbd5e1";
    csv.style.borderColor = mode === "csv" ? "#0c7fae" : "#cbd5e1";
    xlsx.style.fontWeight = mode === "xlsx" ? "800" : "600";
    csv.style.fontWeight = mode === "csv" ? "800" : "600";
  };
  xlsx.addEventListener("click", () => apply("xlsx"));
  csv.addEventListener("click", () => apply("csv"));
  apply("xlsx");
}

function renderRiwayat() {
  const host = el("riwayat-list");
  const pill = el("riwayat-pill");
  if (!host) return;
  const raw = sessionStorage.getItem("riwayat_import");
  const entries = raw ? JSON.parse(raw) : [];
  if (pill) pill.textContent = `${entries.length} aktivitas`;
  if (!entries.length) {
    host.innerHTML = `<div class="empty-state" style="padding:18px; color:#64748b; font-size:12px;">Belum ada aktivitas import.</div>`;
    return;
  }
  host.innerHTML = entries.slice(-3).reverse().map((e) => `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 14px; border-bottom:1px solid #e2e8f0;">
      <div>
        <div style="font-weight:700; font-size:13px; color:#0f1f2e;">${escapeHtml(e.typeLabel)}</div>
        <div style="font-size:11px; color:#64748b;">${escapeHtml(e.date)} · ${escapeHtml(e.uploader)}</div>
      </div>
      <span class="badge info" style="font-size:10px;">Berhasil</span>
    </div>`).join("");
}

function pushRiwayat() {
  const raw = sessionStorage.getItem("riwayat_import");
  const entries = raw ? JSON.parse(raw) : [];
  const now = new Date();
  const date = now.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const uploader = "Dr. Ahmad Fauzi (demo)";
  entries.push({ typeLabel: "Data Lengkap", date, uploader });
  sessionStorage.setItem("riwayat_import", JSON.stringify(entries));
  renderRiwayat();
}

(async function main() {
  const ctx = await initLayout({ active: "import-export.html", title: "Import / Export", subtitle: "Unggah dan unduh data kelulusan" });
  if (!ctx) return;
  state.profile = ctx.profile || null;
  wire();
  bindExportToggles();
  renderRiwayat();
  updateTemplateUI();
  try {
    const { students, requirements } = await loadDashboard();
    state.students = students;
    state.requirements = requirements;
    const [programs, advisors] = await Promise.all([listPrograms(), listAdvisors()]);
    state.programs = programs;
    state.advisors = advisors;
    populateExportFilters();
    renderSettings();
  } catch (err) {
    const box = el("alert");
    box.className = "alert error";
    box.textContent = `Gagal memuat data: ${err.message}`;
    el("settings-host").innerHTML = "";
  }
})();