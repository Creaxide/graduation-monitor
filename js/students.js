import { initLayout } from "./ui.js";
import { listStudents } from "./data.js";
import { el, escapeHtml, debounce } from "./utils.js";

let state = { students: [], q: "", semester: "" };

const STATUS_ID = {
  safe: "AMAN",
  warn: "PERHATIAN",
  danger: "MENDESAK",
};

function badgeForOverall(catStatuses) {
  // keep engine overall (safe/warn/danger) → Indonesian badge
  const order = { danger: 3, warn: 2, safe: 1 };
  const worst = catStatuses.reduce((w, s) => (order[s] || 0) > (order[w] || 0) ? s : w, "safe");
  return STATUS_ID[worst] || "AMAN";
}

function belinguaBadge(v) {
  const map = {
    lulus: ["safe", "AMAN"],
    proses: ["warn", "PERHATIAN"],
    belum_ambil: ["danger", "MENDESAK"],
  };
  const [cls, label] = map[v] || ["neutral", String(v).toUpperCase()];
  return `<span class="badge ${cls}">${label}</span>`;
}

function overallBadge(s) {
  // Lightweight: use belingua + SKS approximation if engine not available per-row.
  // Students table just shows raw data here — not priority. Keep simple English `status`.
  const map = { aktif: ["safe", "Aktif"], cuti: ["warn", "Cuti"], lulus: ["info", "Lulus"], do: ["danger", "DO"] };
  const [cls, label] = map[s.status] || ["neutral", String(s.status).toUpperCase()];
  return `<span class="badge ${cls}">${label}</span>`;
}

function render() {
  const term = state.q.trim().toLowerCase();
  const rows = state.students.filter((s) => {
    if (term && !(s.name.toLowerCase().includes(term) || s.nim.toLowerCase().includes(term))) return false;
    if (state.semester && String(s.current_semester) !== String(state.semester)) return false;
    return true;
  });

  const host = el("table-host");
  if (!rows.length) {
    host.innerHTML = `<div class="empty-state"><div class="big">🔍</div>Tidak ada mahasiswa yang sesuai filter.</div>`;
    return;
  }

  host.innerHTML = `
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>NIM</th><th>Nama</th><th>Program</th><th>SEM</th>
            <th>SKS</th><th>Comserv</th><th>SAT</th><th>Belingua</th><th>Status</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (s) => `
            <tr onclick="window.location.href='student.html?id=${s.id}'" style="cursor:pointer;">
              <td class="nim">${escapeHtml(s.nim)}</td>
              <td style="font-weight:700">${escapeHtml(s.name)}</td>
              <td style="color:rgba(255,255,255,0.92)">${escapeHtml(s.programs?.code || "-")}</td>
              <td style="text-align:center">${s.current_semester}</td>
              <td class="mono">${s.total_sks_passed}</td>
              <td class="mono">${s.comserv_hours}</td>
              <td class="mono">${s.sat_hours}</td>
              <td>${belinguaBadge(s.belingua_status)}</td>
              <td>${overallBadge(s)}</td>
              <td class="text-right">
                <a class="btn btn-detail" href="student.html?id=${s.id}" onclick="event.stopPropagation()">Detail</a>
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

function populateSemesterFilter() {
  const semesters = [...new Set(state.students.map((s) => s.current_semester))].sort((a, b) => a - b);
  el("f-semester").innerHTML =
    `<option value="">Semua Semester</option>` + semesters.map((s) => `<option value="${s}">Semester ${s}</option>`).join("");
}

function wire() {
  el("q").addEventListener("input", debounce((e) => { state.q = e.target.value; render(); }, 200));
  el("f-semester").addEventListener("change", (e) => { state.semester = e.target.value; render(); });
}

(async function main() {
  const ctx = await initLayout({ active: "students.html", title: "Data Mahasiswa", subtitle: "Rekam data utama mahasiswa" });
  if (!ctx) return;
  wire();
  try {
    state.students = await listStudents();
    populateSemesterFilter();
    render();
  } catch (err) {
    const box = el("alert");
    box.className = "alert error";
    box.textContent = `Gagal memuat data: ${err.message}`;
    el("table-host").innerHTML = "";
  }
})();
