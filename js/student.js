import { initLayout } from "./ui.js";
import { loadStudentBundle } from "./data.js";
import { evaluateStudent, priorityReason, recommendationSentence, STATUS_LABEL } from "./engine.js";
import { el, escapeHtml, formatNumber, toast, printNode } from "./utils.js";

const params = new URLSearchParams(window.location.search);
const studentId = params.get("id");
let current = null;

function categoryCard(cat) {
  const pct = cat.targetValue > 0 ? Math.min(100, Math.round((cat.actual / cat.targetValue) * 100)) : 100;
  const unit = cat.unit ? ` ${cat.unit}` : "";
  let detail = "";
  if (cat.category === "belingua") {
    const map = { belum_ambil: "Not taken", proses: "In progress", lulus: "Passed" };
    detail = `Status: <strong>${map[cat.raw.status] || cat.raw.status}</strong>${
      cat.raw.score ? ` &middot; Score: <strong>${cat.raw.score}</strong>` : ""
    }`;
  } else if (cat.category === "sertifikasi") {
    detail = `Obtained <strong>${cat.actual}</strong> of <strong>${cat.total}</strong> required certifications`;
  } else {
    detail = `Achieved <strong>${formatNumber(cat.actual)}${unit}</strong> of <strong>${formatNumber(cat.targetValue)}${unit}</strong> target`;
  }
  return `
    <div class="card">
      <div class="card-head">
        <h3>${escapeHtml(cat.label)}</h3>
        <span class="badge ${cat.status}">${escapeHtml(cat.statusLabel)}</span>
      </div>
      <div class="progress-row mb-16">
        <div class="progress ${cat.status}"><span style="width:${pct}%"></span></div>
        <span class="pv">${pct}%</span>
      </div>
      <div class="small muted" style="margin-bottom:8px">${detail}</div>
      <div class="small">
        ${cat.gap > 0
          ? `<span class="badge danger">Gap: ${formatNumber(cat.gap)}${unit}</span>`
          : `<span class="badge safe">Target met</span>`}
        <span class="badge neutral">Curriculum total: ${formatNumber(cat.total)}${unit}</span>
      </div>
    </div>`;
}

function priorityPanel(result) {
  if (!result.priorities.length) {
    return `<div class="card"><div class="empty-state"><div class="big">&#9989;</div>
      All graduation requirements meet the norms for semester ${result.student.current_semester}.
    </div></div>`;
  }
  const items = result.priorities
    .map((p) => `
      <div class="priority-item p${Math.min(p.rank, 3)}">
        <div class="rank">${p.rank}</div>
        <div class="body">
          <strong>${escapeHtml(p.label)}</strong>
          <div class="reason">${escapeHtml(priorityReason(p))}</div>
        </div>
        <span class="badge ${p.status}">${escapeHtml(p.statusLabel)}</span>
      </div>`)
    .join("");
  return `<div class="card">
      <div class="card-head"><h2>Priority Recommendations</h2>
        <span class="badge info">Rule-based&nbsp;&middot;&nbsp;Semester ${result.student.current_semester}</span>
      </div>
      <div class="priority-list">${items}</div>
    </div>`;
}

function failedPanel(result) {
  if (!result.failed.length) {
    return `<div class="card"><div class="card-head"><h3>Failed Courses</h3></div>
      <div class="empty-state"><div class="big">&#127881;</div>No failed courses recorded.</div></div>`;
  }
  return `<div class="card">
      <div class="card-head"><h3>Failed Courses &amp; Retake Plan</h3>
        <span class="badge danger">${result.failed.length} course(s)</span>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Code</th><th>Course</th><th>SKS</th><th>Grade</th><th>Taken in</th><th>Recommended retake</th></tr></thead>
          <tbody>
            ${result.failed.map((f) => `
              <tr>
                <td class="nim">${escapeHtml(f.kode_mk)}</td>
                <td>${escapeHtml(f.nama_mk)}</td>
                <td class="mono">${f.sks}</td>
                <td><span class="badge danger">${escapeHtml(f.nilai || "-")}</span></td>
                <td>Sem ${f.semester_taken ?? "-"}</td>
                <td><span class="badge info">Semester ${f.retake_semester}</span></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
}

function certificationPanel(result) {
  const certs = result.categories.find((c) => c.category === "sertifikasi")?.raw.requiredList || [];
  if (!certs.length) return "";
  return `<div class="card">
      <div class="card-head"><h3>Certifications</h3></div>
      <div class="tag-row">
        ${certs.map((c) => `
          <span class="badge ${c.obtained ? "safe" : "danger"}">
            ${c.obtained ? "&#10003;" : "&#10007;"} ${escapeHtml(c.name)}
          </span>`).join("")}
      </div>
    </div>`;
}

function render(result, profile) {
  current = result;
  const s = result.student;
  document.title = `${s.name} - Graduation Monitor`;
  const head = document.querySelector(".page-title");
  if (head) head.innerHTML = `<h1>${escapeHtml(s.name)}</h1><div class="sub">${escapeHtml(s.nim)} &middot; Semester ${s.current_semester}</div>`;
  const overallBadge = `<span class="badge ${result.overall}">${escapeHtml(STATUS_LABEL[result.overall])}</span>`;
  const primary = result.priorities[0];

  el("report").innerHTML = `
    <section class="card">
      <div class="card-head">
        <div style="flex:1">
          <h1 style="margin-bottom:2px">${escapeHtml(s.name)}</h1>
          <div class="muted small">
            ${escapeHtml(s.nim)} &middot; ${escapeHtml(s.programs?.name || "-")}
            &middot; Advisor: ${escapeHtml(s.advisors?.name || "-")}
          </div>
        </div>
        ${overallBadge}
      </div>
      <div class="grid cols-4 mt-16">
        <div class="kpi"><div class="k-label">Current Semester</div><div class="k-value">${s.current_semester}</div>
          <div class="k-foot">${result.categories[0].remainingSemesters} semester(s) to graduation</div></div>
        <div class="kpi"><div class="k-label">SKS Passed</div><div class="k-value">${formatNumber(s.total_sks_passed)}</div>
          <div class="k-foot">of curriculum total</div></div>
        <div class="kpi"><div class="k-label">Top Priority</div>
          <div class="k-value" style="font-size:1.2rem">${primary ? escapeHtml(primary.label) : "None"}</div>
          <div class="k-foot">${primary ? `gap ${formatNumber(primary.gap)}${primary.unit ? " " + primary.unit : ""}` : "all on track"}</div></div>
        <div class="kpi"><div class="k-label">Failed Courses</div><div class="k-value">${result.failed.length}</div>
          <div class="k-foot">need to be retaken</div></div>
      </div>
    </section>

    <section class="grid cols-3 mt-24">
      ${result.categories.map(categoryCard).join("")}
    </section>

    <section class="mt-24">
      ${priorityPanel(result)}
    </section>

    <section class="card mt-24">
      <div class="card-head"><h3>Recommendation Summary</h3></div>
      <p id="rec-text" style="margin:0">"${escapeHtml(recommendationSentence(result))}"</p>
      <div class="small muted mt-16">Generated by the rule-based recommendation engine based on the semester-${s.current_semester} normative targets. Advisory only — final guidance rests with the Academic Advisor.</div>
    </section>

    <section class="mt-24">${failedPanel(result)}</section>
    <section class="mt-24">${certificationPanel(result)}</section>`;

  el("copy-btn").onclick = () => {
    navigator.clipboard
      .writeText(recommendationSentence(result))
      .then(() => toast("Recommendation copied to clipboard.", "success"))
      .catch(() => toast("Copy failed.", "error"));
  };
  el("print-btn").onclick = () => printNode(el("report"));
}

(async function main() {
  if (!studentId) {
    document.getElementById("host").innerHTML =
      `<div class="alert error">Missing student id. Return to the dashboard and pick a student.</div>`;
    return;
  }
  const ctx = await initLayout({ active: "student.html", title: "Student Detail", subtitle: "Requirements & recommendation" });
  if (!ctx) return;
  try {
    const { student, requirements, failed, certs } = await loadStudentBundle(studentId);
    const result = evaluateStudent(student, requirements.filter((r) => r.program_id === student.program_id), failed, certs);
    if (ctx && ctx.profile) result.profile = ctx.profile;
    render(result, ctx.profile);
  } catch (err) {
    el("host").innerHTML = `<div class="alert error">Failed to load student: ${escapeHtml(err.message)}</div>`;
  }
})();
