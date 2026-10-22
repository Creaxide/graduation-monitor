import { initLayout } from "./ui.js";
import { listStudents } from "./data.js";
import { el, escapeHtml, debounce } from "./utils.js";
import { belinguaLabel, normalizeBelinguaStatus } from "./engine.js";

let state = { students: [], q: "", semester: "", active: "semua" };

const isActive = (s) => s.is_active !== false;

// Kolom ini hanya menampilkan data mentah. Urgensi (Aman/Perhatian/Mendesak)
// dihitung engine.js dan tampil di halaman detail, supaya tidak ada dua aturan berbeda.
function belinguaBadge(v) {
  const status = normalizeBelinguaStatus(v);
  const cls = { lulus: "safe", proses: "info", belum_ambil: "neutral" }[status] || "neutral";
  return `<span class="badge ${cls}">${escapeHtml(belinguaLabel(status))}</span>`;
}

function overallBadge(s) {
  // Status akademik mahasiswa (bukan status kelulusan).
  const map = { aktif: ["safe", "Aktif"], cuti: ["warn", "Cuti"], lulus: ["info", "Lulus"], do: ["danger", "DO"] };
  const [cls, label] = map[s.status] || ["neutral", String(s.status).toUpperCase()];
  return `<span class="badge ${cls}">${label}</span>`;
}

function render() {
  const term = state.q.trim().toLowerCase();
  const rows = state.students.filter((s) => {
    if (term && !(s.name.toLowerCase().includes(term) || s.nim.toLowerCase().includes(term))) return false;
    if (state.semester && String(s.current_semester) !== String(state.semester)) return false;
    if (state.active === "aktif" && !isActive(s)) return false;
    if (state.active === "nonaktif" && isActive(s)) return false;
    return true;
  });

  // Nonaktif selalu di bawah.
  rows.sort((a, b) => (isActive(a) === isActive(b) ? 0 : isActive(a) ? -1 : 1));

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
            <th>SKS</th><th>Comserv</th><th>SAT</th><th>Belingua</th><th>Status Akademik</th>
            <th class="text-right">Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (s) => `
            <tr onclick="window.location.href='student.html?id=${s.id}'" class="${
                isActive(s) ? "" : "is-inactive"
              }" style="cursor:pointer;">
              <td class="nim">${escapeHtml(s.nim)}</td>
              <td style="font-weight:700">${escapeHtml(s.name)}${
                isActive(s) ? "" : ' <span class="badge off">NONAKTIF</span>'
              }${
                isActive(s)
                  ? ""
                  : `<div class="cell-reason" title="${escapeHtml(s.deactivate_reason || "")}">Alasan: ${
                      s.deactivate_reason ? escapeHtml(s.deactivate_reason) : "tidak dicatat"
                    }</div>`
              }</td>
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
  el("f-active").addEventListener("change", (e) => { state.active = e.target.value; render(); });
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
