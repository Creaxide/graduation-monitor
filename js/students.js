import { initLayout } from "./ui.js";
import { listStudents } from "./data.js";
import { el, escapeHtml, formatNumber, debounce } from "./utils.js";

let state = { students: [], q: "", semester: "" };

function render() {
  const term = state.q.trim().toLowerCase();
  const rows = state.students.filter((s) => {
    if (term && !(s.name.toLowerCase().includes(term) || s.nim.toLowerCase().includes(term))) return false;
    if (state.semester && String(s.current_semester) !== String(state.semester)) return false;
    return true;
  });

  const host = el("table-host");
  if (!rows.length) {
    host.innerHTML = `<div class="empty-state"><div class="big">&#128269;</div>No students found.</div>`;
    return;
  }
  host.innerHTML = `
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>NIM</th><th>Name</th><th>Program</th><th>Semester</th>
            <th>SKS</th><th>Comserv</th><th>SAT</th><th>Belingua</th><th>Status</th>
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((s) => `
            <tr>
              <td class="nim">${escapeHtml(s.nim)}</td>
              <td style="font-weight:600">${escapeHtml(s.name)}</td>
              <td>${escapeHtml(s.programs?.code || "-")}</td>
              <td>${s.current_semester}</td>
              <td class="mono">${s.total_sks_passed}</td>
              <td class="mono">${formatNumber(s.comserv_hours)}</td>
              <td class="mono">${formatNumber(s.sat_hours)}</td>
              <td>${belinguaBadge(s.belingua_status)}</td>
              <td>${statusBadge(s.status)}</td>
              <td class="text-right">
                <a class="btn sm" href="student.html?id=${s.id}">Detail</a>
              </td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function belinguaBadge(v) {
  const map = { lulus: ["safe", "Passed"], proses: ["warn", "In progress"], belum_ambil: ["danger", "Not taken"] };
  const [cls, label] = map[v] || ["neutral", v];
  return `<span class="badge ${cls}">${label}</span>`;
}

function statusBadge(v) {
  const map = { aktif: "safe", cuti: "warn", lulus: "info", do: "danger" };
  return `<span class="badge ${map[v] || "neutral"}">${v}</span>`;
}

function populateSemesterFilter() {
  const semesters = [...new Set(state.students.map((s) => s.current_semester))].sort((a, b) => a - b);
  el("f-semester").innerHTML =
    `<option value="">All</option>` + semesters.map((s) => `<option value="${s}">Semester ${s}</option>`).join("");
}

function wire() {
  el("q").addEventListener("input", debounce((e) => { state.q = e.target.value; render(); }, 200));
  el("f-semester").addEventListener("change", (e) => { state.semester = e.target.value; render(); });
}

(async function main() {
  const ctx = await initLayout({ active: "students.html", title: "Student Master Data", subtitle: "Core records and requirement totals" });
  if (!ctx) return;
  wire();
  try {
    state.students = await listStudents();
    populateSemesterFilter();
    render();
  } catch (err) {
    const box = el("alert");
    box.className = "alert error";
    box.textContent = `Failed to load students: ${err.message}`;
    el("table-host").innerHTML = "";
  }
})();
