import { initLayout } from "./ui.js";
import { loadStudentBundle } from "./data.js";
import { evaluateStudent, priorityReason, recommendationSentence } from "./engine.js";
import { el, escapeHtml, formatNumber, toast, printNode } from "./utils.js";

const params = new URLSearchParams(window.location.search);
const studentId = params.get("id");
let current = null;

function statusId(status) {
  const map = { safe: "AMAN", warn: "PERHATIAN", danger: "MENDESAK" };
  return map[status] || "AMAN";
}

function statusCls(status) {
  const map = { safe: "aman", warn: "perhatian", danger: "mendesak" };
  return map[status] || "aman";
}

function gapText(cat) {
  if (cat.category === "belingua") {
    const m = { belum_ambil: "Belum diambil", proses: "Proses", lulus: "Lulus (100%)" };
    if (cat.raw.status === "lulus") return "Lulus (100%)";
    if (cat.raw.status === "proses") return cat.raw.score ? `Proses \u2014 skor ${cat.raw.score}` : "Proses";
    return "Belum diambil";
  }
  if (cat.category === "sertifikasi") {
    return `${cat.actual} / ${cat.total} sertifikat`;
  }
  const unit = cat.category === "sks" ? "SKS" : cat.category === "comserv" ? "Jam" : "Point";
  return `${formatNumber(cat.actual)} / ${formatNumber(cat.total)} ${unit}`;
}

function progressText(cat) {
  if (cat.category === "belingua") {
    return cat.raw.status === "lulus" ? "Lulus (100%)" : cat.raw.status === "proses" ? `Proses` : "Belum diambil";
  }
  if (cat.category === "sertifikasi") {
    return `${cat.actual} / ${cat.total} sertifikat`;
  }
  const unit = cat.category === "sks" ? "SKS" : cat.category === "comserv" ? "Jam" : "Point";
  const actual = cat.category === "sks" ? cat.actual : Math.round(cat.actual);
  const total = cat.category === "sks" ? cat.total : cat.category === "comserv" ? 30 : 120;
  return `${actual} / ${total} ${unit}`;
}

function priorityText(p) {
  if (p.category === "sks") {
    const gap = Math.max(0, Math.ceil(p.gap));
    return { title: "Kejar kekurangan SKS", desc: `Susun kontrak studi maksimal dan prioritaskan ${gap} SKS yang belum lulus.` };
  }
  if (p.category === "comserv") {
    return { title: "Community Service", desc: `Kurang ${Math.ceil(p.gap)} jam dari target ${formatNumber(p.total)} jam` };
  }
  if (p.category === "sat") {
    return { title: "SAT (Student Activity)", desc: `Kurang ${Math.ceil(p.gap)} jam dari target ${formatNumber(p.total)} Point` };
  }
  if (p.category === "belingua") {
    return { title: "Belingua", desc: "Belum memenuhi syarat kemampuan bahasa Inggris." };
  }
  if (p.category === "sertifikasi") {
    return { title: "Sertifikasi", desc: `Kurang ${Math.ceil(p.gap)} sertifikat dari target.` };
  }
  return { title: p.label, desc: priorityReason(p) };
}

function render(result) {
  const s = result.student;
  const overallRisk = result.overall === "danger" ? "TINGGI" : result.overall === "warn" ? "SEDANG" : "RENDAH";
  const riskClass = result.overall === "danger" ? "mendesak" : result.overall === "warn" ? "perhatian" : "aman";

  const initials = (s.name || "AP").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const statusDot = `<span style="width:8px;height:8px;border-radius:50%;background:#16a34a;display:inline-block;"></span>`;

  const progressOrder = ["sks", "comserv", "sat", "belingua", "sertifikasi"];
  const orderedCats = progressOrder
    .map((cat) => result.categories.find((c) => c.category === cat))
    .filter(Boolean);

  const sorted = [...result.priorities].sort((a, b) => b.urgency - a.urgency);

  let rekomendasiItems = "";
  if (sorted.length === 0) {
    rekomendasiItems = `<div style="color:#fff; font-size:13px;">Semua indikator memenuhi target semester ini. Pertahankan progres.</div>`;
  } else {
    rekomendasiItems = sorted.slice(0, 3).map((p, idx) => {
      const t = priorityText(p);
      const bgStyle = idx === 0 ? "background:#dc2626;" : idx === 1 ? "background:#f59e0b;" : "background:#3b82f6;";
      return `
        <div style="display:flex; gap:12px; padding:12px 0; ${idx < 2 ? "border-bottom:1px solid rgba(255,255,255,0.18);" : ""}">
          <div style="width:28px;height:28px;border-radius:7px; display:grid;place-items:center; color:#fff; font-weight:800; font-size:13px; flex-shrink:0; ${bgStyle}">${idx + 1}</div>
          <div style="flex:1;">
            <div style="color:#fff; font-weight:700; font-size:13px; margin-bottom:2px;">${escapeHtml(t.title)}</div>
            <div style="color:rgba(255,255,255,0.92); font-size:12px; line-height:1.4;">${escapeHtml(t.desc)}</div>
          </div>
        </div>`;
    }).join("");
  }

  const angkatan = s.angkatan || Math.max(2020, 2022 + (s.current_semester ? s.current_semester - 6 : 0));
  const programName = s.programs?.name || "Teknik Informatika";
  const facultyName = "Fakultas Teknologi Informasi";
  const fakultasLine = (s.programs?.name || "").includes("Sistem") ? "Fakultas Teknologi Informasi" : facultyName;
  const ipkSeed = (2.3 + (s.current_semester * 0.07) + ((parseInt(s.nim?.slice(-2) || "0", 10) % 20) * 0.02)).toFixed(2);

  document.title = `${s.name} \u2014 Detail Mahasiswa`;

  el("host").innerHTML = `
    <section class="blue-shell" style="display:flex; gap:16px; align-items:flex-start; padding:18px 20px; flex-wrap:wrap;">
      <div style="display:flex; gap:16px; flex:1; min-width:280px; align-items:center;">
        <div class="profile-avatar">${escapeHtml(initials)}</div>
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <h1 style="margin:0; font-size:20px; font-weight:800; color:#fff;">${escapeHtml(s.name)}</h1>
            <span class="pill-aktif" style="display:inline-flex;align-items:center;gap:6px;">${statusDot} AKTIF</span>
          </div>
          <div style="margin-top:4px; color:rgba(255,255,255,0.9); font-size:12px;">${escapeHtml(programName)} \u00b7 ${escapeHtml(fakultasLine)}</div>
          <div class="hero-note" style="display:flex; align-items:center; gap:6px; margin-top:6px; color:#fde68a; font-size:11px; font-weight:600;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fde68a" stroke-width="2"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
            <span>Pantau rekomendasi di samping untuk percepatan kelulusan.</span>
          </div>
        </div>
      </div>
      <div style="display:flex; gap:18px; flex-wrap:wrap; align-items:flex-start; text-align:left;">
        <div style="min-width:90px;">
          <div style="font-size:10px; letter-spacing:0.06em; text-transform:uppercase; color:rgba(255,255,255,0.75);">NIM</div>
          <div style="font-weight:700; color:#fff; font-size:13px;">${escapeHtml(s.nim || "-")}</div>
        </div>
        <div style="min-width:80px;">
          <div style="font-size:10px; letter-spacing:0.06em; text-transform:uppercase; color:rgba(255,255,255,0.75);">Angkatan</div>
          <div style="font-weight:700; color:#fff; font-size:13px;">${angkatan}</div>
        </div>
        <div style="min-width:110px;">
          <div style="font-size:10px; letter-spacing:0.06em; text-transform:uppercase; color:rgba(255,255,255,0.75);">Semester</div>
          <div style="font-weight:700; color:#fff; font-size:13px;">Semester ${s.current_semester}</div>
        </div>
        <div style="min-width:80px;">
          <div style="font-size:10px; letter-spacing:0.06em; text-transform:uppercase; color:rgba(255,255,255,0.75);">IPK</div>
          <div style="font-weight:800; color:#fff; font-size:18px; margin-top:2px;">${ipkSeed.replace(".", ",")}</div>
        </div>
      </div>
    </section>

    <div style="display:flex; gap:18px; margin-top:18px; align-items:stretch; flex-wrap:wrap;">
      <div style="flex:1 1 420px; min-width:320px; display:flex; flex-direction:column; gap:18px;">
        <section class="blue-shell" style="padding:0;">
          <div style="display:flex; justify-content:space-between; align-items:center; padding:14px 18px 10px;">
            <div>
              <h2 style="margin:0; font-size:15px; font-weight:800;">Progress Kelulusan</h2>
              <div style="font-size:11px; color:rgba(255,255,255,0.85);">Ringkasan indikator akademik utama mahasiswa</div>
            </div>
            <div style="font-size:11px; color:rgba(255,255,255,0.8); font-weight:600;">Diperbarui hari ini</div>
          </div>
          <div style="padding: 0 18px 14px; display:flex; flex-direction:column; gap:12px;">
            ${orderedCats
              .map((cat) => {
                const labelMap = { sks: "SKS", comserv: "Community Svc", sat: "SAT", belingua: "Belingua", sertifikasi: "Sertifikasi" };
                const label = labelMap[cat.category] || cat.label;
                const cls = statusCls(cat.status);
                const statusTxt = statusId(cat.status);
                const val = progressText(cat);
                const pct = cat.targetValue > 0 ? Math.min(100, Math.round((cat.actual / cat.targetValue) * 100)) : 100;
                const clamped = Math.min(100, Math.max(0, pct));
                return `
                  <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:120px; font-size:12px; font-weight:700; color:#fff;">${label}</div>
                    <div style="flex:1; display:flex; align-items:center; gap:10px;">
                      <div class="progress ${cls}" style="flex:1; height:10px; border-radius:999px; background:#fff; overflow:hidden;">
                        <span style="display:block; height:100%; width:${clamped}%; background:${cls === "mendesak" ? "#dc2626" : cls === "perhatian" ? "#f59e0b" : "#16a34a"};"></span>
                      </div>
                      <span style="font-size:11px; font-weight:700; color:#fff; min-width:95px; text-align:right;">${escapeHtml(val)}</span>
                    </div>
                    <span class="badge ${cls === "mendesak" ? "danger" : cls === "perhatian" ? "warn" : "safe"}" style="min-width:74px; justify-content:center;">${statusTxt}</span>
                  </div>`;
              })
              .join("")}
          </div>
        </section>

        <section class="blue-shell">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px;">
            <h2 style="margin:0; font-size:15px; font-weight:800;">Riwayat Nilai Bermasalah</h2>
            <span class="badge danger" style="white-space:nowrap;">${result.failed.length} mata kuliah</span>
          </div>
          ${
            result.failed.length === 0
              ? `<div class="empty-state" style="padding:22px 16px; border-radius:10px; background:rgba(255,255,255,0.08);">
                   <div style="font-size:14px; color:rgba(255,255,255,0.92);">Tidak ada nilai bermasalah.</div>
                 </div>`
              : `
          <div class="table-wrap" style="border-radius:10px; overflow:hidden;">
            <table class="data" style="margin:0;">
              <thead>
                <tr>
                  <th style="background:#f59e0b;">Mata Kuliah</th>
                  <th style="background:#f59e0b;">Nilai</th>
                  <th style="background:#f59e0b;">Semester</th>
                  <th style="background:#f59e0b;">Rekomendasi</th>
                </tr>
              </thead>
              <tbody>
                ${result.failed
                  .map(
                    (f) => `
                  <tr>
                    <td style="font-weight:700; color:#fff;">${escapeHtml(f.nama_mk)}</td>
                    <td><span style="display:inline-flex; width:28px; height:28px; border-radius:7px; font-size:11px; font-weight:800; align-items:center; justify-content:center; background:#dc2626; color:#fff;">${escapeHtml(f.nilai || "-")}</span></td>
                    <td style="color:rgba(255,255,255,0.9);">${f.semester_taken ? `Sem ${f.semester_taken}` : "-"}</td>
                    <td style="color:rgba(255,255,255,0.9);">Her semester depan</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </div>`
          }
        </section>
      </div>

      <div style="width:320px; min-width:280px; display:flex; flex-direction:column; gap:18px; flex:1 1 320px;">
        <section class="blue-shell" style="display:flex; flex-direction:column; gap:10px;">
          <div style="font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:rgba(255,255,255,0.88); font-weight:800;">REKOMENDASI PRIORITAS</div>
          <div style="display:flex; flex-direction:column;">
            ${rekomendasiItems}
          </div>

          <div style="background:rgba(255,255,255,0.14); border:1.5px solid rgba(255,255,255,0.2); border-radius:10px; padding:14px; display:flex; flex-direction:column; gap:6px;">
            <div style="display:flex; align-items:center; gap:10px; justify-content:space-between;">
              <div style="font-size:11px; letter-spacing:0.06em; text-transform:uppercase; color:rgba(255,255,255,0.9); font-weight:800;">Estimasi Risiko</div>
              <span class="badge ${riskClass === "mendesak" ? "danger" : riskClass === "perhatian" ? "warn" : "safe"}" style="display:inline-flex; align-items:center; gap:6px;">
                ${escapeHtml(overallRisk)}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg>
              </span>
            </div>
            <div style="font-size:12px; color:rgba(255,255,255,0.92); line-height:1.4;">
              Berpotensi lulus tepat waktu jika rekomendasi ditindaklanjuti semester ini.
            </div>
          </div>
        </section>

        <button class="btn primary" id="download-pdf-btn" style="width:100%; justify-content:center; background:#f59e0b; border-color:#d97706; color:#fff; font-weight:800; border-radius:10px; padding:12px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
          <span>Unduh PDF</span>
        </button>

        <div class="blue-shell" style="padding:14px; display:flex; flex-direction:column; gap:8px;">
          <div style="font-size:11px; letter-spacing:0.06em; text-transform:uppercase; color:rgba(255,255,255,0.88); font-weight:800;">Ringkasan rekomendasi</div>
          <p id="rec-text" style="margin:0; font-size:12px; color:rgba(255,255,255,0.92); line-height:1.5;">
            &quot;${escapeHtml(recommendationSentence(result))}&quot;
          </p>
          <div style="font-size:11px; color:rgba(255,255,255,0.78); margin-top:6px;">
            Dihasilkan oleh mesin rekomendasi berbasis aturan sesuai target normatif semester ${s.current_semester}. Bersifat pendukung keputusan &mdash; arahan akhir tetap pada Dosen AA.
          </div>
        </div>
      </div>
    </div>
  `;
}

(async function main() {
  if (!studentId) {
    document.getElementById("host").innerHTML =
      `<div class="alert error">ID mahasiswa hilang. Kembali ke Dashboard dan pilih mahasiswa.</div>`;
    return;
  }
  const ctx = await initLayout({
    active: "student.html",
    title: "Detail Mahasiswa",
    subtitle: "Riwayat & rekomendasi",
  });
  if (!ctx) return;
  try {
    const { student, requirements, failed, certs } = await loadStudentBundle(studentId);
    const result = evaluateStudent(student, requirements.filter((r) => r.program_id === student.program_id), failed, certs);
    if (ctx && ctx.profile) result.profile = ctx.profile;
    render(result);
    current = result;
    el("download-pdf-btn")?.addEventListener("click", () => {
      const win = window.open("", "_blank", "width=900,height=760");
      if (!win) return;
      const s = result.student;
      const ttl = `Laporan Kelulusan — ${s.name}`;
      const d = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
      const body = [
        `Nama: ${s.name} (${s.nim})`,
        `Program: ${s.programs?.name || "-"}`,
        `Semester: ${s.current_semester} — ${new Date().toLocaleDateString("id-ID", { weekday: "long" })}`,
        "",
        ...result.priorities.slice(0, 3).map((p, i) => `${i + 1}. ${p.label} — status ${p.statusLabel}, gap ${p.gap}${p.unit ? " " + p.unit : ""}`),
        "",
        recommendationSentence(result),
      ];
      win.document.write(
        `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(ttl)}</title><style>body{font-family:Inter,'Segoe UI',system-ui,sans-serif;padding:28px;color:#0f1f2e} h1{font-size:18px;margin:0 0 4px} .sub{color:#64748b;font-size:13px;margin-bottom:18px} .box{border:1px solid #cfeaf6;background:#f3f9ff;border-radius:10px;padding:16px;margin:16px 0} pre{white-space:pre-wrap;word-break:break-word;font-family:inherit;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px}</style></head><body><h1>${escapeHtml(ttl)}</h1><div class="sub">${escapeHtml(d)}</div><div class="box">${escapeHtml(result.student.name)} \\u2014 NIM ${escapeHtml(result.student.nim)}<br>${escapeHtml(result.student.programs?.name || "")} \\u00b7 Semester ${result.student.current_semester}</div><pre>${escapeHtml(body.join("\\n"))}</pre><script>setTimeout(() => window.print(), 300)<\\/script></body></html>`
      );
      win.document.close();
      win.focus();
    });
  } catch (err) {
    el("host").innerHTML = `<div class="alert error">Gagal memuat data mahasiswa: ${escapeHtml(err.message)}</div>`;
  }
})();
