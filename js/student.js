import { initLayout } from "./ui.js";
import { loadStudentBundle } from "./data.js";
import { evaluateStudent, recommendationSentence, belinguaLabel } from "./engine.js";
import { buildStudentReportHtml, priorityText, riskTextFor } from "./report.js";
import { el, escapeHtml, formatNumber, toast, printHtmlDocument } from "./utils.js";

const params = new URLSearchParams(window.location.search);
const studentId = params.get("id");
let current = null;
// Petunjuk "pilih Simpan ke PDF" cukup ditampilkan sekali per halaman.
let printHintShown = false;

function statusId(status) {
  const map = { safe: "AMAN", warn: "PERHATIAN", danger: "MENDESAK", info: "BELUM WAJIB" };
  return map[status] || "AMAN";
}

function statusCls(status) {
  const map = { safe: "aman", warn: "perhatian", danger: "mendesak", info: "info" };
  return map[status] || "aman";
}

// Badge + warna progress bar untuk sebuah status kategori.
function statusBadge(status) {
  const cls = statusCls(status);
  const badge = { mendesak: "danger", perhatian: "warn", info: "info" }[cls] || "safe";
  const bar = { mendesak: "#dc2626", perhatian: "#f59e0b", info: "#3b82f6" }[cls] || "#16a34a";
  return { cls, badge, bar };
}

function progressText(cat) {
  if (cat.category === "belingua") {
    return belinguaLabel(cat.raw.status);
  }
  if (cat.category === "sertifikasi") {
    return `${Math.min(cat.actual, cat.total)} / ${cat.total} sertifikat`;
  }
  const unit = cat.category === "sks" ? "SKS" : cat.category === "comserv" ? "Jam" : "Point";
  const actual = cat.category === "sks" ? cat.actual : Math.round(cat.actual);
  return `${formatNumber(actual)} / ${formatNumber(cat.total)} ${unit}`;
}

// Unduh laporan mahasiswa: cetak dokumen laporan ke dialog cetak, lalu
// pengguna memilih "Simpan ke PDF" sebagai tujuan printer.
//
// Dokumen dicetak dari iframe tersembunyi (bukan popup) supaya Firefox
// tidak memblokir jendela dan tidak mencetak halaman kosong.
function openStudentReport(result) {
  const html = buildStudentReportHtml(result);
  if (!printHintShown) {
    printHintShown = true;
    toast(
      'Pada dialog cetak, pilih "Simpan ke PDF" (Firefox) atau "Save as PDF" (Chrome) sebagai printer tujuan.',
      "info"
    );
  }
  const started = printHtmlDocument(html, {
    title: `Laporan Kelulusan \u2014 ${result.student.name}`,
    onError: () =>
      toast("Gagal membuka dialog cetak. Coba lagi atau tekan Ctrl+P (Cmd+P) untuk mencetak halaman.", "error"),
  });
  if (!started) {
    toast(
      "Browser memblokir jendela cetak. Izinkan pop-up untuk situs ini lalu coba lagi.",
      "error"
    );
  }
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

  const angkatan = s.angkatan || "-";
  const programName = s.programs?.name || "Teknik Informatika";
  const facultyName = "Fakultas Teknologi Informasi";
  const fakultasLine = (s.programs?.name || "").includes("Sistem") ? "Fakultas Teknologi Informasi" : facultyName;
  const ipkText = s.ipk != null && s.ipk !== "" ? Number(s.ipk).toFixed(2).replace(".", ",") : "-";

  // Mahasiswa yang dinonaktifkan: alasannya yang dicatat saat penonaktifan
  // ditampilkan di atas supaya langsung terlihat tanpa membuka menu lain.
  const isInactive = s.is_active === false;
  const reasonText = String(s.deactivate_reason || "").trim();
  let deactivatedAt = "";
  if (s.deactivated_at) {
    const d = new Date(s.deactivated_at);
    if (!Number.isNaN(d.getTime())) {
      deactivatedAt = d.toLocaleString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  const inactiveBanner = isInactive
    ? `
    <section class="inactive-note">
      <div class="inactive-note-head">
        <span class="inactive-note-badge">NONAKTIF</span>
        <strong>Mahasiswa ini sedang tidak dipantau.</strong>
      </div>
      <div class="inactive-note-body">
        <div class="inactive-note-row">
          <span class="inactive-note-label">Alasan</span>
          <span class="inactive-note-value">${
            reasonText ? escapeHtml(reasonText) : "<em>Tidak dicatat.</em>"
          }</span>
        </div>
        ${
          deactivatedAt
            ? `<div class="inactive-note-row">
                 <span class="inactive-note-label">Dinonaktifkan</span>
                 <span class="inactive-note-value">${escapeHtml(deactivatedAt)}</span>
               </div>`
            : ""
        }
      </div>
      <div class="inactive-note-foot">
        Data akademik mahasiswa tetap tersimpan dan tidak dihapus. Gunakan menu
        <strong>Aktifkan</strong> di dashboard untuk mengembalikannya ke pemantauan.
      </div>
    </section>`
    : "";

  document.title = `${s.name} \u2014 Detail Mahasiswa`;

  el("host").innerHTML = `
    ${inactiveBanner}
    <section class="blue-shell" style="display:flex; gap:16px; align-items:flex-start; padding:18px 20px; flex-wrap:wrap;">
      <div style="display:flex; gap:16px; flex:1; min-width:280px; align-items:center;">
        <div class="profile-avatar">${escapeHtml(initials)}</div>
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <h1 style="margin:0; font-size:20px; font-weight:800; color:#fff;">${escapeHtml(s.name)}</h1>
            <span class="pill-aktif" style="display:inline-flex;align-items:center;gap:6px;">${statusDot} ${escapeHtml(String(s.status || "aktif").toUpperCase())}</span>
            ${isInactive ? '<span class="badge off" style="vertical-align:middle;">NONAKTIF</span>' : ""}
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
          <div style="font-weight:800; color:#fff; font-size:18px; margin-top:2px;">${ipkText}</div>
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
                const { cls, badge, bar } = statusBadge(cat.status);
                const statusTxt = statusId(cat.status);
                const val = progressText(cat);
                const pct = cat.targetValue > 0 ? Math.min(100, Math.round((cat.actual / cat.targetValue) * 100)) : 100;
                const clamped = Math.min(100, Math.max(0, pct));
                return `
                  <div class="prog-item">
                    <div class="prog-label">${label}</div>
                    <div class="prog-bar">
                      <div class="progress ${cls}">
                        <span style="display:block; height:100%; width:${clamped}%; background:${bar};"></span>
                      </div>
                      <span class="prog-value">${escapeHtml(val)}</span>
                    </div>
                    <span class="badge ${badge} prog-badge">${statusTxt}</span>
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
                  <th>Mata Kuliah</th>
                  <th>Nilai</th>
                  <th>Semester</th>
                  <th>Rekomendasi</th>
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
                    <td style="color:rgba(255,255,255,0.9);">Ulang di semester ${f.retake_semester}</td>
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
              ${escapeHtml(riskTextFor(result))}
            </div>
          </div>
        </section>

        <button class="btn primary" id="download-pdf-btn" style="width:100%; justify-content:center; background:var(--primary-bg); border-color:var(--primary-border); color:var(--primary-fg); font-weight:800; border-radius:10px; padding:12px;">
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
    el("download-pdf-btn")?.addEventListener("click", () => openStudentReport(result));
  } catch (err) {
    el("host").innerHTML = `<div class="alert error">Gagal memuat data mahasiswa: ${escapeHtml(err.message)}</div>`;
  }
})();
