import { initLayout } from "./ui.js";
import {
  loadDashboard, listFailedCourses, listCertifications,
  studentIdsByNim, updateStudent, insertFailedCourses, insertCertifications,
  logAudit,
} from "./data.js";
import { evaluateStudent, STATUS_LABEL } from "./engine.js";
import {
  el, escapeHtml, formatNumber, toast, downloadFile, toCsv, setBusy,
} from "./utils.js";

const TEMPLATES = {
  students: {
    headers: ["nim", "name", "current_semester", "status", "total_sks_passed", "comserv_hours", "sat_hours", "belingua_status", "belingua_score"],
    sample: [["2702314920", "Andi Pratama", "6", "aktif", "126", "26", "20", "proses", "480"]],
    hint: "Required: nim + at least one data column. Existing NIMs are updated.",
  },
  failed_courses: {
    headers: ["nim", "kode_mk", "nama_mk", "sks", "nilai", "semester_taken"],
    sample: [["2702314921", "COMP6047", "Algoritma dan Pemrograman", "4", "D", "2"]],
    hint: "Required: nim, kode_mk, nama_mk. Courses are appended to the student's record.",
  },
  certifications: {
    headers: ["nim", "name", "is_required", "obtained", "obtained_at"],
    sample: [["2702314920", "Sertifikasi Kompetensi Pemrograman", "true", "true", "2025-06-01"]],
    hint: "Required: nim, name. is_required/obtained accept true/false or 1/0.",
  },
};

let state = { students: [], requirements: [], selectedFile: null, canEditRequirements: false };

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
  const entity = el("entity").value;
  const file = state.selectedFile;
  if (!file) return;
  const btn = el("import-btn");
  setBusy(btn, true, "Importing...");
  try {
    const { headers, records } = await recordsFromFile(file);
    const required = TEMPLATES[entity].headers;
    if (!headers.length) throw new Error("The file appears to be empty.");

    const nims = [...new Set(records.map((r) => r.nim).filter(Boolean))];
    const nimMap = await studentIdsByNim(nims);

    const ok = [];
    const errors = [];

    if (entity === "students") {
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const line = i + 2;
        if (!r.nim) { errors.push([line, "Missing 'nim' column value"]); continue; }
        if (!nimMap[r.nim]) { errors.push([line, `NIM ${r.nim} not found in master data`]); continue; }
        const patch = {};
        if (r.current_semester) patch.current_semester = clampInt(r.current_semester, 1, 14);
        if (r.status) patch.status = r.status;
        if (r.total_sks_passed) patch.total_sks_passed = toInt(r.total_sks_passed);
        if (r.comserv_hours) patch.comserv_hours = toNum(r.comserv_hours);
        if (r.sat_hours) patch.sat_hours = toNum(r.sat_hours);
        if (r.belingua_status) patch.belingua_status = r.belingua_status;
        if (r.belingua_score) patch.belingua_score = toNum(r.belingua_score);
        if (!Object.keys(patch).length) { errors.push([line, "No updatable columns provided"]); continue; }
        try { await updateStudent(nimMap[r.nim], patch); ok.push(line); }
        catch (e) { errors.push([line, e.message]); }
      }
    } else if (entity === "failed_courses") {
      const rows = [];
      for (let i = 0; i < records.length; i++) {
        const r = records[i]; const line = i + 2;
        if (!r.nim || !r.kode_mk || !r.nama_mk) { errors.push([line, "nim, kode_mk and nama_mk are required"]); continue; }
        if (!nimMap[r.nim]) { errors.push([line, `NIM ${r.nim} not found`]); continue; }
        rows.push({
          student_id: nimMap[r.nim], kode_mk: r.kode_mk, nama_mk: r.nama_mk,
          sks: toInt(r.sks), nilai: r.nilai || null,
          semester_taken: r.semester_taken ? toInt(r.semester_taken) : null,
        });
        ok.push(line);
      }
      if (rows.length) await insertFailedCourses(rows);
    } else {
      const rows = [];
      for (let i = 0; i < records.length; i++) {
        const r = records[i]; const line = i + 2;
        if (!r.nim || !r.name) { errors.push([line, "nim and name are required"]); continue; }
        if (!nimMap[r.nim]) { errors.push([line, `NIM ${r.nim} not found`]); continue; }
        rows.push({
          student_id: nimMap[r.nim], name: r.name,
          is_required: r.is_required === "" ? true : truthy(r.is_required),
          obtained: truthy(r.obtained),
          obtained_at: r.obtained_at || null,
        });
        ok.push(line);
      }
      if (rows.length) await insertCertifications(rows);
    }

    logAudit({ entity, action: "import", detail: { success: ok.length, failed: errors.length, file: file.name } });
    showResult(entity, ok.length, errors);
  } catch (err) {
    toast(err.message || "Import failed", "error");
  } finally {
    setBusy(btn, false);
  }
}

function showResult(entity, successCount, errors) {
  const card = el("result-card");
  card.classList.remove("hidden");
  el("result-summary").innerHTML = `
    <div class="card kpi safe"><div class="k-label">Imported</div><div class="k-value">${successCount}</div></div>
    <div class="card kpi danger"><div class="k-label">Failed</div><div class="k-value">${errors.length}</div></div>
    <div class="card kpi accent"><div class="k-label">Data type</div><div class="k-value" style="font-size:1.1rem">${escapeHtml(entity)}</div></div>`;
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
  const filtered = students.filter((s) => {
    if (el("x-angkatan").value && String(s.angkatan) !== el("x-angkatan").value) return false;
    if (el("x-semester").value && String(s.current_semester) !== el("x-semester").value) return false;
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
  const status = el("x-status").value;
  return status ? detailed.filter((r) => r.overall === status) : detailed;
}

function toExportRow(r) {
  return {
    NIM: r.student.nim,
    Name: r.student.name,
    Program: r.student.programs?.name || "-",
    Angkatan: r.student.angkatan,
    Semester: r.student.current_semester,
    SKS_passed: r.student.total_sks_passed,
    Comserv_hours: r.student.comserv_hours,
    SAT_hours: r.student.sat_hours,
    Belingua: r.student.belingua_status,
    Overall_status: STATUS_LABEL[r.overall],
    Priority_1: r.priorities[0]?.label || "-",
    Priority_2: r.priorities[1]?.label || "-",
    Priority_3: r.priorities[2]?.label || "-",
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

function renderSettings() {
  const host = el("settings-host");
  const grouped = {};
  for (const r of state.requirements) {
    grouped[r.category] = grouped[r.category] || [];
    grouped[r.category].push(r);
  }
  const semesters = [1, 2, 3, 4, 5, 6, 7, 8];
  host.innerHTML = `
    <div class="table-wrap"><table class="data">
      <thead><tr><th>Category</th><th>Curriculum total</th>${semesters.map((s) => `<th>Sem ${s}</th>`).join("")}</tr></thead>
      <tbody>
        ${Object.values(grouped).map((rows) => {
          const r = rows[0];
          return `<tr>
            <td><strong>${escapeHtml(r.label)}</strong>${r.unit ? ` <span class="muted small">(${r.unit})</span>` : ""}</td>
            <td class="mono">${formatNumber(r.total_required)}</td>
            ${semesters.map((s) => {
              const frac = Number(r.targets?.[s] || 0);
              const abs = Math.round(frac * r.total_required * 100) / 100;
              return `<td class="mono">${frac > 0 ? `${Math.round(frac * 100)}% <span class="muted">(${formatNumber(abs)})</span>` : '<span class="muted">-</span>'}</td>`;
            }).join("")}
          </tr>`;
        }).join("")}
      </tbody>
    </table></div>`;
}

function populateExportFilters() {
  const angkatan = [...new Set(state.students.map((s) => s.angkatan).filter(Boolean))].sort((a, b) => a - b);
  const semester = [...new Set(state.students.map((s) => s.current_semester))].sort((a, b) => a - b);
  el("x-angkatan").innerHTML = `<option value="">All</option>` + angkatan.map((a) => `<option value="${a}">${a}</option>`).join("");
  el("x-semester").innerHTML = `<option value="">All</option>` + semester.map((s) => `<option value="${s}">Semester ${s}</option>`).join("");
}

// ---------------------------------------------------------------- helpers ---

function toInt(v) { const n = parseInt(v, 10); return Number.isNaN(n) ? 0 : n; }
function toNum(v) { const n = Number(v); return Number.isNaN(n) ? 0 : n; }
function clampInt(v, min, max) { return Math.min(max, Math.max(min, toInt(v))); }

function updateTemplateUI() {
  const t = TEMPLATES[el("entity").value];
  el("template-hint").textContent = `${t.hint} Columns: ${t.headers.join(", ")}`;
}

function wire() {
  el("entity").addEventListener("change", updateTemplateUI);
  el("download-template").addEventListener("click", () => {
    const t = TEMPLATES[el("entity").value];
    const csv = toCsv(t.sample, t.headers);
    downloadFile(`template-${el("entity").value}.csv`, csv);
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
}

function setFile(file) {
  if (!file) return;
  state.selectedFile = file;
  el("file-name").textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  el("import-btn").disabled = false;
}

(async function main() {
  const ctx = await initLayout({ active: "import-export.html", title: "Import / Export", subtitle: "Bulk data management" });
  if (!ctx) return;
  wire();
  updateTemplateUI();
  try {
    const { students, requirements } = await loadDashboard();
    state.students = students;
    state.requirements = requirements;
    populateExportFilters();
    renderSettings();
  } catch (err) {
    const box = el("alert");
    box.className = "alert error";
    box.textContent = `Failed to load data: ${err.message}`;
    el("settings-host").innerHTML = "";
  }
})();