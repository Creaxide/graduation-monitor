import { initLayout } from "./ui.js";
import {
  loadDashboard, listFailedCourses, listCertifications, logAudit,
  isMock, mockHasData, mockAddStudent,
} from "./data.js";
import { evaluateStudent, STATUS_LABEL } from "./engine.js";
import {
  el, escapeHtml, formatNumber, debounce, downloadFile, toCsv, toast,
} from "./utils.js";

let state = { rows: [], requirements: [], filter: { q: "", semester: "", status: "" } };

function renderBadge(status) {
  return `<span class="badge ${status}">${escapeHtml(STATUS_LABEL[status])}</span>`;
}

function categoryPill(cat) {
  const pct = cat.targetValue > 0 ? Math.min(100, Math.round((cat.actual / cat.targetValue) * 100)) : 100;
  const unit = cat.unit ? ` ${cat.unit}` : "";
  return `
    <div style="margin-bottom:6px">
      <div class="flex between small" style="margin-bottom:3px">
        <span>${escapeHtml(cat.label)}</span>
        <span class="mono muted">${formatNumber(cat.actual)}/${formatNumber(cat.targetValue)}${unit}</span>
      </div>
      <div class="progress ${cat.status}"><span style="width:${pct}%"></span></div>
    </div>`;
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
  if (!rows.length) {
    host.innerHTML = `<div class="empty-state"><div class="big">&#128269;</div>No students match the current filters.</div>`;
    return;
  }
  const body = rows
    .map((r) => {
      const s = r.student;
      const top = r.priorities[0];
      return `
        <tr data-id="${s.id}">
          <td>
            <div style="font-weight:600">${escapeHtml(s.name)}</div>
            <div class="nim">${escapeHtml(s.nim)}</div>
          </td>
          <td><span class="badge neutral">Sem ${s.current_semester}</span></td>
          <td>
            <div class="progress-row">
              <div class="progress ${r.categories.find((c)=>c.category==='sks').status}">
                <span style="width:${Math.min(100, Math.round((r.categories.find((c)=>c.category==='sks').actual / (r.categories.find((c)=>c.category==='sks').total||1)) * 100))}%"></span>
              </div>
              <span class="pv">${formatNumber(s.total_sks_passed)} SKS</span>
            </div>
          </td>
          <td class="nowrap">
            ${top ? `<span class="badge ${top.status}">P1: ${escapeHtml(top.label)}</span>` : `<span class="badge safe">All on track</span>`}
          </td>
          <td>${renderBadge(r.overall)}</td>
          <td class="text-right"><a class="btn sm" href="student.html?id=${s.id}">View</a></td>
        </tr>`;
    })
    .join("");

  host.innerHTML = `
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr>
            <th>Student</th><th>Semester</th><th>SKS Progress</th>
            <th>Top Priority</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;

  host.querySelectorAll("tbody tr").forEach((tr) => {
    tr.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      window.location.href = `student.html?id=${tr.dataset.id}`;
    });
  });
}

function updateKpis() {
  const counts = { danger: 0, warn: 0, safe: 0 };
  state.rows.forEach((r) => (counts[r.overall] += 1));
  el("k-total").textContent = state.rows.length;
  el("k-danger").textContent = counts.danger;
  el("k-warn").textContent = counts.warn;
  el("k-safe").textContent = counts.safe;
}

function exportCsv() {
  const rows = applyFilters().map((r) => ({
    NIM: r.student.nim,
    Name: r.student.name,
    Semester: r.student.current_semester,
    SKS_passed: r.student.total_sks_passed,
    Comserv_hours: r.student.comserv_hours,
    SAT_hours: r.student.sat_hours,
    Belingua: r.student.belingua_status,
    Overall_status: STATUS_LABEL[r.overall],
    Priority_1: r.priorities[0]?.label || "-",
    Priority_2: r.priorities[1]?.label || "-",
    Priority_3: r.priorities[2]?.label || "-",
  }));
  if (!rows.length) return toast("Nothing to export.", "warn");
  downloadFile(`advisees-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  logAudit({ entity: "students", action: "export_csv", detail: { count: rows.length } });
  toast("Export ready.", "success");
}

async function loadAllStudents(students, requirements) {
  const detailed = await Promise.all(
    students.map(async (s) => {
      const [failed, certs] = await Promise.all([
        listFailedCourses(s.id).catch(() => []),
        listCertifications(s.id).catch(() => []),
      ]);
      return evaluateStudent(s, requirements.filter((r) => r.program_id === s.program_id), failed, certs);
    })
  );
  return detailed;
}

function populateSemesterFilter() {
  const semesters = [...new Set(state.rows.map((r) => r.student.current_semester))].sort((a, b) => a - b);
  el("f-semester").innerHTML =
    `<option value="">All</option>` + semesters.map((s) => `<option value="${s}">Semester ${s}</option>`).join("");
}

function wireFilters() {
  el("q").addEventListener("input", debounce((e) => { state.filter.q = e.target.value; renderTable(applyFilters()); }, 200));
  el("f-semester").addEventListener("change", (e) => { state.filter.semester = e.target.value; renderTable(applyFilters()); });
  el("f-status").addEventListener("change", (e) => { state.filter.status = e.target.value; renderTable(applyFilters()); });
  el("export-btn").addEventListener("click", exportCsv);
}

function wireDummyTools() {
  if (!isMock) return;
  const banner = el("dummy-banner");
  banner.classList.remove("hidden");
  if (!mockHasData()) {
    banner.className = "alert warn";
    banner.innerHTML =
      "No dummy data loaded yet. Click <strong>Generate dummy data</strong> in the sidebar, " +
      "or use the <strong>+ Add student</strong> button above.";
  } else if (!state.rows.length) {
    banner.className = "alert warn";
    banner.innerHTML =
      "Dummy data is empty. Regenerate it from the sidebar or add a student with <strong>+ Add student</strong>.";
  } else {
    banner.className = "alert info";
    banner.innerHTML =
      `<strong>Demo mode.</strong> Showing ${state.rows.length} generated student(s). ` +
      "Data lives in this browser session only.";
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
      toast("Dummy student added.", "success");
      window.location.href = `student.html?id=${student.id}`;
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

(async function main() {
  const session = await initLayout({ active: "dashboard.html", title: "Monitoring Dashboard", subtitle: "Graduation requirements overview" });
  if (!session) return;
  wireFilters();
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
    box.textContent = `Failed to load data: ${err.message}. Check your Supabase config (js/config.js) and schema.`;
  }
})();
