import { initLayout, mountTestControls } from "./ui.js";
import {
  loadDashboard, listFailedCourses, listCertifications,
  isMock, mockHasData, mockAddStudent,
} from "./data.js";
import { evaluateStudent } from "./engine.js";
import {
  el, escapeHtml, debounce, toast,
} from "./utils.js";

let state = { rows: [], requirements: [], filter: { q: "", semester: "", status: "" } };

const STATUS_ID = {
  safe: { label: "AMAN", cls: "safe" },
  warn: { label: "PERHATIAN", cls: "warn" },
  danger: { label: "MENDESAK", cls: "danger" },
};

function renderFigmaBadge(statusKey) {
  const meta = STATUS_ID[statusKey] || { label: statusKey?.toUpperCase() || "-", cls: "neutral" };
  return `<span class="badge ${meta.cls}">${meta.label}</span>`;
}

function applyFilters() {
  const { q, semester, status } = state.filter;
  const term = q.trim().toLowerCase();
  return state.rows.filter((r) => {
    if (term && !(r.student.name.toLowerCase().includes(term) || r.student.nim.toLowerCase().includes(term))) return false;
    if (semester && String(r.student.current_semester) !== String(semester)) return false;
    if (status && r.overall !== status) return false;
    return true;
  });
}

function renderTable(rows) {
  const host = el("table-host");
  const countLabel = el("count-label");
  if (countLabel) countLabel.textContent = `${rows.length} mahasiswa bimbingan ditemukan`;

  if (!rows.length) {
    host.innerHTML = `<div class="empty-state"><div class="big">🔍</div>Tidak ada mahasiswa yang sesuai filter.</div>`;
    return;
  }

  const body = rows
    .map((r) => {
      const s = r.student;
      const getCatStatus = (name) => r.categories.find((c) => c.category === name)?.status || "safe";

      return `
        <tr data-id="${s.id}">
          <td class="nim">${escapeHtml(s.nim)}</td>
          <td style="font-weight:700">${escapeHtml(s.name)}</td>
          <td style="text-align:center">${s.current_semester}</td>
          <td>${renderFigmaBadge(getCatStatus("sks"))}</td>
          <td>${renderFigmaBadge(getCatStatus("comserv"))}</td>
          <td>${renderFigmaBadge(getCatStatus("sat"))}</td>
          <td>${renderFigmaBadge(getCatStatus("belingua"))}</td>
          <td>${renderFigmaBadge(getCatStatus("sertifikasi"))}</td>
          <td class="text-right">
            <a class="btn btn-detail" href="student.html?id=${s.id}">Detail</a>
          </td>
        </tr>`;
    })
    .join("");

  host.innerHTML = `
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>NIM</th>
            <th>NAMA</th>
            <th style="text-align:center">SEM</th>
            <th>SKS</th>
            <th>COMSERV</th>
            <th>SAT</th>
            <th>BILINGUA</th>
            <th>SERTIFIKASI</th>
            <th></th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;

  host.querySelectorAll("tbody tr").forEach((tr) => {
    tr.addEventListener("click", (e) => {
      if (e.target.closest("a") || e.target.closest("button")) return;
      window.location.href = `student.html?id=${tr.dataset.id}`;
    });
  });
}

function updateKpis() {
  const counts = { danger: 0, warn: 0, safe: 0 };
  state.rows.forEach((r) => (counts[r.overall] = (counts[r.overall] || 0) + 1));
  el("k-total").textContent = state.rows.length;
  el("k-danger").textContent = counts.danger || 0;
  el("k-warn").textContent = counts.warn || 0;
  el("k-safe").textContent = counts.safe || 0;
}

async function loadAllStudents(students, requirements) {
  return await Promise.all(
    students.map(async (s) => {
      const [failed, certs] = await Promise.all([
        listFailedCourses(s.id).catch(() => []),
        listCertifications(s.id).catch(() => []),
      ]);
      return evaluateStudent(s, requirements.filter((r) => r.program_id === s.program_id), failed, certs);
    })
  );
}

function populateSemesterFilter() {
  const semesters = [...new Set(state.rows.map((r) => r.student.current_semester))].sort((a, b) => a - b);
  el("f-semester").innerHTML =
    `<option value="">Semua Semester</option>` + semesters.map((s) => `<option value="${s}">Semester ${s}</option>`).join("");
}

function wireFilters() {
  el("q").addEventListener("input", debounce((e) => { state.filter.q = e.target.value; renderTable(applyFilters()); }, 200));
  el("f-semester").addEventListener("change", (e) => { state.filter.semester = e.target.value; renderTable(applyFilters()); });
  el("f-status").addEventListener("change", (e) => { state.filter.status = e.target.value; renderTable(applyFilters()); });
}

function wireDummyTools() {
  if (!isMock) return;
  const banner = el("dummy-banner");
  if (banner) {
    banner.classList.remove("hidden");
    if (!mockHasData()) {
      banner.className = "alert warn";
      banner.innerHTML = "Belum ada data dummy. Gunakan tombol <strong>+ Tambah Dummy</strong> untuk mengisi data uji.";
    } else {
      banner.className = "alert info";
      banner.innerHTML = `<strong>Mode Demo.</strong> Menampilkan ${state.rows.length} mahasiswa hasil generate. Data tersimpan di sesi browser saat ini.`;
    }
  }

  const addBtn = el("add-student-btn");
  addBtn.classList.remove("hidden");
  const modal = el("add-modal");
  const close = () => modal.classList.remove("open");
  addBtn.addEventListener("click", () => modal.classList.add("open"));
  el("add-close").addEventListener("click", close);
  el("add-cancel").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  el("add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      const student = mockAddStudent({
        name: el("a-name").value.trim() || undefined,
        nim: el("a-nim").value.trim() || undefined,
        program_id: el("a-program").value,
        current_semester: Number(el("a-semester").value),
        total_sks_passed: Number(el("a-sks").value),
        comserv_hours: Number(el("a-comserv").value),
        sat_hours: Number(el("a-sat").value),
        belingua_status: el("a-belingua").value,
      });
      toast("Mahasiswa berhasil ditambahkan.", "success");
      window.location.href = `student.html?id=${student.id}`;
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

(async function main() {
  const session = await initLayout({
    active: "dashboard.html",
    title: "Dashboard Mahasiswa Bimbingan",
    subtitle: "Dr. Ahmad Fauzi, M.T. - Semester Ganjil 2025/2026"
  });
  if (!session) return;
  wireFilters();
  mountTestControls();
  try {
    const { students, requirements } = await loadDashboard();
    state.requirements = requirements;
    state.rows = await loadAllStudents(students, requirements);
    updateKpis();
    populateSemesterFilter();
    renderTable(applyFilters());
    wireDummyTools();
  } catch (err) {
    el("table-host").innerHTML = "";
    const box = el("alert");
    box.className = "alert error";
    box.textContent = `Gagal memuat data: ${err.message}`;
  }
})();
