import { escapeHtml, formatNumber } from "./utils.js";
import { belinguaLabel, priorityReason, recommendationSentence } from "./engine.js";

// --------------------------------------------------------------- label status ---

// Badge status memakai warna yang sama dengan panel di web
// (styles.css: --badge-safe / warn / danger / info).
const STATUS_BADGE = {
  safe: { label: "AMAN", bg: "#16a34a" },
  warn: { label: "PERHATIAN", bg: "#f59e0b" },
  danger: { label: "MENDESAK", bg: "#dc2626" },
  info: { label: "BELUM WAJIB", bg: "#2563eb" },
};

const STATUS_FILL = {
  safe: "#16a34a",
  warn: "#f59e0b",
  danger: "#dc2626",
  info: "#2563eb",
};

// Label pendek untuk baris progress — sama seperti di web supaya tidak
// membungkus ke dua baris.
const REPORT_SHORT_LABELS = {
  sks: "SKS",
  comserv: "Community Svc",
  sat: "SAT",
  belingua: "Belingua",
  sertifikat: "Sertifikasi",
  sertifikasi: "Sertifikasi",
};

// --------------------------------------------------------------- teks laporan ---

export function priorityText(p) {
  if (p.category === "sks") {
    const gap = Math.max(0, Math.ceil(p.gap));
    return { title: "Kejar kekurangan SKS", desc: `Susun kontrak studi maksimal dan prioritaskan ${gap} SKS yang belum lulus.` };
  }
  if (p.category === "comserv") {
    return { title: "Community Service", desc: `Kurang ${Math.ceil(p.gap)} jam dari target ${formatNumber(p.targetValue)} jam semester ini` };
  }
  if (p.category === "sat") {
    return { title: "SAT (Student Activity)", desc: `Kurang ${Math.ceil(p.gap)} point dari target ${formatNumber(p.targetValue)} Point semester ini` };
  }
  if (p.category === "belingua") {
    return { title: "Belingua", desc: `Status saat ini: ${belinguaLabel(p.raw.status)}. Segera mulai menyelesaikan beelingua.` };
  }
  if (p.category === "sertifikasi") {
    return { title: "Sertifikasi", desc: `Kurang ${Math.ceil(p.gap)} sertifikat dari target.` };
  }
  return { title: p.label, desc: priorityReason(p) };
}

// Cara menyebut kekurangan satu indikator dalam kalimat ringkas. Formatnya
// sengaja sama dengan daftar "Rekomendasi prioritas" di atasnya, supaya angka
// yang dibaca Dosen di dua tempat itu sama.
export function categoryShortfallText(cat) {
  if (cat.category === "belingua") {
    return `Belingua belum lulus (${belinguaLabel(cat.raw?.status)})`;
  }
  if (cat.category === "sertifikasi") {
    return `kurang ${Math.ceil(cat.gap)} sertifikat dari target semester ini`;
  }
  const unit = cat.category === "sks" ? "SKS" : cat.category === "comserv" ? "jam" : "poin";
  return `kurang ${formatNumber(cat.gap)} ${unit} dari target semester ini`;
}

// Ringkasan risiko selalu menyebut penyebabnya saat status turun, supaya badge
// SEDANG tidak terlihat bertentangan dengan indikator yang masih MENDESAK.
export function riskTextFor(result) {
  if (result.overall === "danger") return "Berisiko tidak lulus tepat waktu. Tindak lanjuti rekomendasi prioritas segera.";
  if (result.overall === "warn") {
    const urgent = result.categories.filter((c) => c.status === "danger");
    if (urgent.length === 1) {
      const c = urgent[0];
      return `Perlu perhatian. Satu indikator masih mendesak (${c.label} ${categoryShortfallText(c)}), tetapi masih ada ${c.remainingSemesters} semester untuk mengejarnya.`;
    }
    return "Perlu perhatian. Berpotensi lulus tepat waktu jika rekomendasi ditindaklanjuti semester ini.";
  }
  return "Sesuai target. Pertahankan progres agar lulus tepat waktu.";
}

// --------------------------------------------------------------- gaya cetak ---

// Laporan ini memakai design system web (css/styles.css): panel biru
// --card-bg, header tabel oranye --table-head-bg, badge pill, progress bar
// bertrack putih, daftar prioritas dengan kotak ranking — dan tata letak dua
// kolom seperti halaman detail mahasiswa.
//
// Catatan khusus Firefox:
// - Firefox hanya menggambar header/footer bawaan dialog cetak (judul, URL,
//   tanggal, "1 of 2") kalau margin atas/bawah @page lebih besar dari tinggi
//   font header/footernya (10pt ~ 15px). Karena itu margin atas/bawah @page
//   dibuat 0 supaya judul/URL/tanggal/nomor halaman itu tidak muncul sama
//   sekali. Jaraknya dikembalikan lewat padding di dalam dokumen, jadi hasil
//   cetak tetap rapi.
// - `print-color-adjust: exact` (dan alias `color-adjust`) membuat Firefox
//   tetap mencetak warna latar walau kotak "Print backgrounds" tidak dicentang.
// - `border-collapse: collapse` membuat Firefox mengabaikan border-radius pada
//   sel tabel. Dipakai `separate` + `border-spacing: 0` supaya sudut header
//   sama-sama muncul di Firefox dan Chrome.
// - `break-inside` dipakai berdampingan dengan `page-break-inside` supaya panel
//   dan blok tanda tangan tidak terbelah antar halaman.
const REPORT_CSS = `
      @page { size: A4; margin: 0 12mm; }
      * { box-sizing: border-box; }
      html { -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
      body {
        font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: #1a2233; background: #ffffff; margin: 0; padding: 0;
        -webkit-font-smoothing: antialiased; line-height: 1.5;
      }
      .sheet { max-width: none; margin: 0 auto; }

      /* header band — meniru .site-header */
      .head-band {
        display: flex; align-items: center; gap: 12px;
        background: linear-gradient(90deg, #ffffff 0%, #e6f5fb 42%, #0099dd 100%);
        border-bottom: 1px solid #cfeaf6; padding: 5px 0 7px; margin-bottom: 10px;
      }
      .logo-box {
        position: relative; width: 96px; height: 58px; flex-shrink: 0;
        border-radius: 10px; overflow: hidden; background: #ffffff;
      }
      .logo-box img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }
      .brand-text { display: flex; flex-direction: column; line-height: 1.15; color: #0b2a4a; font-weight: 800; font-size: 12px; letter-spacing: 0.02em; }
      .brand-text span:last-child { font-weight: 400; font-size: 10px; opacity: 0.8; }

      /* judul dokumen — meniru .page-title */
      .doc-title { margin: 0 0 9px; }
      .doc-title h1 { font-size: 19px; font-weight: 800; color: #0f1f2e; margin: 0; letter-spacing: -0.01em; }
      .doc-title .sub { color: #0b7fb8; font-size: 12px; font-weight: 500; margin-top: 2px; }

      /* panel biru — meniru .blue-shell */
      .panel {
        background: #1596c9; border: 1.5px solid #0e8ab8; border-radius: 12px;
        color: #ffffff; padding: 12px 14px; margin-bottom: 9px;
        break-inside: avoid; page-break-inside: avoid;
      }
      .panel:last-child { margin-bottom: 0; }
      .panel-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 11px; }
      .panel-head h2 { margin: 0; font-size: 14px; font-weight: 800; color: #ffffff; }
      .panel-head .sub { font-size: 10px; color: rgba(255, 255, 255, 0.85); margin-top: 1px; }
      .panel-head .right { margin-left: auto; font-size: 10px; color: rgba(255, 255, 255, 0.8); font-weight: 600; }
      .panel-label {
        font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase;
        color: rgba(255, 255, 255, 0.88); font-weight: 800; margin-bottom: 7px;
      }

      /* dua kolom — meniru layout halaman detail mahasiswa */
      .cols { display: grid; grid-template-columns: 1.42fr 1fr; gap: 10px; align-items: start; margin-bottom: 9px; }
      .col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }

      /* hero mahasiswa */
      .hero { display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
      .hero-left { display: flex; gap: 14px; align-items: center; flex: 1; min-width: 250px; }
      .avatar {
        width: 52px; height: 52px; border-radius: 999px; background: #0b4a67; color: #fff;
        display: grid; place-items: center; font-weight: 800; font-size: 16px; flex-shrink: 0;
      }
      .hero-main { flex: 1; min-width: 0; }
      .hero-name { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
      .hero-name h1 { margin: 0; font-size: 18px; font-weight: 800; color: #fff; }
      .pill-aktif { background: #16a34a; color: #fff; padding: 4px 11px; border-radius: 999px; font-size: 10px; font-weight: 800; }
      .hero-sub { margin-top: 3px; color: rgba(255, 255, 255, 0.9); font-size: 11px; }
      .hero-note { margin-top: 5px; color: #fde68a; font-size: 10px; font-weight: 600; display: flex; gap: 5px; align-items: center; }
      .hero-stats { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-start; text-align: left; }
      .hero-stat .k { font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.75); }
      .hero-stat .v { font-weight: 700; color: #fff; font-size: 12px; }
      .hero-stat.ipk .v { font-weight: 800; font-size: 16px; margin-top: 1px; }

      /* progress — meniru .prog-item */
      .prog-list { display: flex; flex-direction: column; gap: 10px; }
      .prog-item { display: flex; align-items: center; gap: 8px; }
      .prog-label { width: 88px; flex-shrink: 0; font-size: 11px; font-weight: 700; color: #fff; }
      .prog-bar { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; }
      .track {
        flex: 1; height: 10px; border-radius: 999px; background: #ffffff;
        border: 1px solid rgba(15, 122, 160, 0.45); overflow: hidden;
      }
      .track > span { display: block; height: 100%; border-radius: 999px; background: #0c7fae; }
      .track.safe > span { background: #16a34a; }
      .track.warn > span { background: #f59e0b; }
      .track.danger > span { background: #dc2626; }
      .track.info > span { background: #2563eb; }
      .prog-value { flex-shrink: 0; font-size: 10px; font-weight: 700; color: #fff; min-width: 74px; text-align: right; }
      .prog-badge { flex-shrink: 0; min-width: 76px; justify-content: center; }

      /* badge — meniru .badge */
      .badge {
        display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px;
        border-radius: 999px; font-size: 9px; font-weight: 800; letter-spacing: 0.05em;
        text-transform: uppercase; line-height: 1.5; white-space: nowrap; color: #fff;
      }
      .badge.safe { background: #16a34a; }
      .badge.warn { background: #f59e0b; }
      .badge.danger { background: #dc2626; }
      .badge.info { background: #2563eb; }

      /* tabel — meniru table.data */
      table.data { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 11px; }
      table.data thead th {
        text-align: left; padding: 7px 10px; background: #f58220; color: #ffffff;
        font-size: 9px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap;
      }
      table.data thead th:first-child { border-radius: 9px 0 0 0; }
      table.data thead th:last-child { border-radius: 0 9px 0 0; }
      table.data tbody td {
        padding: 8px 10px; border-bottom: 1px solid rgba(15, 122, 160, 0.45);
        color: #fff; vertical-align: middle;
      }
      table.data tbody td:first-child { font-weight: 600; }
      table.data tbody tr:last-child td { border-bottom: none; }
      .grade-chip {
        display: inline-flex; width: 24px; height: 24px; border-radius: 7px; font-size: 10px;
        font-weight: 800; align-items: center; justify-content: center; background: #dc2626; color: #fff;
      }
      .muted { color: rgba(255, 255, 255, 0.85); font-size: 10px; font-weight: 400; }

      /* daftar prioritas — meniru .priority-item */
      .prio-item { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.18); }
      .prio-item:last-of-type { border-bottom: none; }
      .rank {
        width: 26px; height: 26px; border-radius: 7px; display: grid; place-items: center;
        color: #fff; font-weight: 800; font-size: 12px; background: #1596c9; flex-shrink: 0;
      }
      .rank.p1 { background: #dc2626; }
      .rank.p2 { background: #f59e0b; }
      .rank.p3 { background: #3b82f6; }
      .prio-body { flex: 1; min-width: 0; }
      .prio-title { display: flex; align-items: center; gap: 8px; justify-content: space-between; color: #fff; font-weight: 700; font-size: 12px; margin-bottom: 2px; }
      .prio-desc { color: rgba(255, 255, 255, 0.92); font-size: 11px; line-height: 1.35; }

      /* estimasi risiko */
      .risk-box {
        background: rgba(255, 255, 255, 0.14); border: 1.5px solid rgba(255, 255, 255, 0.2);
        border-radius: 10px; padding: 10px 11px; margin-top: 9px;
        display: flex; flex-direction: column; gap: 5px;
      }
      .risk-head { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
      .risk-label { font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255, 255, 255, 0.9); font-weight: 800; }
      .risk-text { font-size: 11px; color: rgba(255, 255, 255, 0.92); line-height: 1.4; }

      /* ringkasan */
      .quote { margin: 0; color: #fff; font-size: 11px; line-height: 1.45; }
      .foot-note { color: rgba(255, 255, 255, 0.78); font-size: 10px; margin-top: 6px; line-height: 1.4; }

      /* tanda tangan & kaki dokumen */
      .sig { margin-top: 8px; padding: 0 12px; display: flex; justify-content: space-between; gap: 10px; font-size: 10px; color: #1a2233; break-inside: avoid; page-break-inside: avoid; }
      .sig div { text-align: center; width: 190px; }
      .sig .line { margin-top: 26px; border-top: 1px solid #0f1f2e; padding-top: 4px; }
      .doc-foot {
        margin-top: 8px; padding-top: 6px; border-top: 1px solid #e2e8f0;
        display: flex; justify-content: space-between; gap: 10px; font-size: 9px; color: #64708a;
      }

      /* Jarak atas/bawah dibuat di dalam dokumen (bukan lewat margin @page)
         supaya Firefox tidak menggambar header/footer bawaan dialog cetak:
         Firefox hanya menggambarnya kalau margin @page lebih besar dari tinggi
         font header (10pt ~ 15px), dan margin 0 tidak pernah di-clamp ke
         "unwriteable margin" printer. Jarak 8mm di sini menggantikan margin
         8mm yang biasanya dipakai. */
      @media print {
        .sheet {
          padding-top: 8mm; min-height: 100vh;
          display: flex; flex-direction: column;
        }
        .sig { margin-top: auto; }
        .tail { height: 8mm; }
      }

      /* Browsers strip backgrounds unless told otherwise (Chrome + Firefox). */
      *, *::before, *::after {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        color-adjust: exact;
      }
    `;

// --------------------------------------------------------------- laporan ---

// Susun dokumen HTML laporan mahasiswa. Fungsi ini murni (tidak menyentuh
// DOM) supaya bisa dipakai ulang dan diuji terpisah dari alur cetak.
export function buildStudentReportHtml(result) {
  const s = result.student;

  const d = new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
  const overallId = result.overall === "danger" ? "MENDESAK" : result.overall === "warn" ? "PERLU PERHATIAN" : "AMAN";
  const riskLabel = result.overall === "danger" ? "TINGGI" : result.overall === "warn" ? "SEDANG" : "RENDAH";

  const sertCat = result.categories.find((c) => c.category === "sertifikasi");
  const certTotal = Math.max(1, Math.round(sertCat?.total || 0));
  const certActual = Math.min(Math.round(sertCat?.actual || 0), certTotal);
  const totalOf = (k) => result.categories.find((c) => c.category === k)?.total ?? 0;
  const valueMap = {
    sks: `${formatNumber(s.total_sks_passed)} / ${formatNumber(totalOf("sks"))} SKS`,
    comserv: `${formatNumber(s.comserv_hours)} / ${formatNumber(totalOf("comserv"))} Jam`,
    sat: `${formatNumber(s.sat_hours)} / ${formatNumber(totalOf("sat"))} Point`,
    belingua: belinguaLabel(s.belingua_status),
    sertifikasi: `${certActual} / ${certTotal} sertifikat`,
  };

  // Baris progress — meniru .prog-item di halaman detail mahasiswa.
  const progressRows = result.categories
    .map((c) => {
      const badge = STATUS_BADGE[c.status] || STATUS_BADGE.safe;
      const pct = c.targetValue > 0 ? Math.min(100, Math.round((c.actual / c.targetValue) * 100)) : 100;
      const clamped = Math.min(100, Math.max(0, pct));
      return `
              <div class="prog-item">
                <div class="prog-label">${escapeHtml(REPORT_SHORT_LABELS[c.category] || c.label)}</div>
                <div class="prog-bar">
                  <div class="track ${c.status}"><span style="width:${clamped}%;background:${STATUS_FILL[c.status] || STATUS_FILL.safe};"></span></div>
                  <span class="prog-value">${escapeHtml(valueMap[c.category] || "")}</span>
                </div>
                <span class="badge ${c.status} prog-badge">${badge.label}</span>
              </div>`;
    })
    .join("");

  // Rekomendasi prioritas — meniru .priority-item.
  const priorityItems = result.priorities.length
    ? result.priorities
        .slice(0, 3)
        .map((p, i) => {
          const t = priorityText(p);
          const badge = STATUS_BADGE[p.status] || STATUS_BADGE.safe;
          return `
              <div class="prio-item">
                <span class="rank p${i + 1}">${i + 1}</span>
                <div class="prio-body">
                  <div class="prio-title"><span>${escapeHtml(t.title)}</span><span class="badge ${p.status}">${badge.label}</span></div>
                  <div class="prio-desc">${escapeHtml(t.desc)}</div>
                </div>
              </div>`;
        })
        .join("")
    : `<div class="prio-item"><div class="prio-desc">Semua indikator memenuhi target semester ini. Pertahankan progres.</div></div>`;

  const failedRows = result.failed.length
    ? result.failed
        .map(
          (f) => `
              <tr>
                <td>${escapeHtml(f.nama_mk)}<br><span class="muted">${escapeHtml(f.kode_mk)}</span></td>
                <td style="text-align:center;"><span class="grade-chip">${escapeHtml(f.nilai || "-")}</span></td>
                <td style="text-align:center;">${f.semester_taken ? `Sem ${f.semester_taken}` : "-"}</td>
                <td>Ulang di semester ${f.retake_semester}</td>
              </tr>`
        )
        .join("")
    : `<tr><td colspan="4">Tidak ada nilai bermasalah.</td></tr>`;

  const initials = (s.name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const angkatan = s.angkatan || "-";
  const programName = s.programs?.name || "Teknik Informatika";
  const fakultasLine = "Fakultas Teknologi Informasi";
  const ipkText = s.ipk != null && s.ipk !== "" ? Number(s.ipk).toFixed(2).replace(".", ",") : "-";
  const statusText = escapeHtml(String(s.status || "aktif").toUpperCase());

  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Laporan Kelulusan \u2014 ${escapeHtml(s.name)}</title>
    <style>${REPORT_CSS}</style></head><body>
    <div class="sheet">
      <div class="head-band">
        <div class="logo-box"><img src="Binusian_logolightmode.png" alt="BINUS University"></div>
        <div class="brand-text">
          <span>Sistem Monitoring Kelulusan Mahasiswa</span>
          <span>School of Computer Science \u00b7 BINUS University</span>
        </div>
      </div>

      <div class="doc-title">
        <h1>Laporan Rekomendasi Prioritas Kelulusan</h1>
        <div class="sub">Dibuat: ${escapeHtml(d)} \u00b7 Semester ${s.current_semester}</div>
      </div>

      <section class="panel hero">
        <div class="hero-left">
          <div class="avatar">${escapeHtml(initials)}</div>
          <div class="hero-main">
            <div class="hero-name">
              <h1>${escapeHtml(s.name)}</h1>
              <span class="pill-aktif">${statusText}</span>
            </div>
            <div class="hero-sub">${escapeHtml(programName)} \u00b7 ${escapeHtml(fakultasLine)}</div>
            <div class="hero-note">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fde68a" stroke-width="2"><path d="M12 9v4"></path><path d="M12 17h.01"></path><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path></svg>
              <span>Pantau rekomendasi untuk percepatan kelulusan.</span>
            </div>
          </div>
        </div>
        <div class="hero-stats">
          <div class="hero-stat"><div class="k">NIM</div><div class="v">${escapeHtml(s.nim || "-")}</div></div>
          <div class="hero-stat"><div class="k">Angkatan</div><div class="v">${escapeHtml(String(angkatan))}</div></div>
          <div class="hero-stat"><div class="k">Semester</div><div class="v">Semester ${s.current_semester}</div></div>
          <div class="hero-stat ipk"><div class="k">IPK</div><div class="v">${ipkText}</div></div>
        </div>
      </section>

      <div class="cols">
        <div class="col">
          <section class="panel">
            <div class="panel-head">
              <div>
                <h2>Progress Kelulusan</h2>
                <div class="sub">Ringkasan indikator akademik utama mahasiswa</div>
              </div>
              <div class="right">Diperbarui: ${escapeHtml(d)}</div>
            </div>
            <div class="prog-list">${progressRows}</div>
          </section>

          <section class="panel">
            <div class="panel-head">
              <h2>Riwayat Nilai Bermasalah</h2>
              <span class="badge ${result.failed.length ? "danger" : "safe"}" style="margin-left:auto;">${result.failed.length} mata kuliah</span>
            </div>
            <table class="data">
              <thead><tr><th>Mata Kuliah</th><th style="text-align:center;">Nilai</th><th style="text-align:center;">Sem.</th><th>Rekomendasi</th></tr></thead>
              <tbody>${failedRows}</tbody>
            </table>
          </section>
        </div>

        <div class="col">
          <section class="panel">
            <div class="panel-label">Rekomendasi Prioritas</div>
            ${priorityItems}
            <div class="risk-box">
              <div class="risk-head">
                <div class="risk-label">Estimasi Risiko</div>
                <span class="badge ${result.overall === "danger" ? "danger" : result.overall === "warn" ? "warn" : "safe"}">${riskLabel}</span>
              </div>
              <div class="risk-text">${escapeHtml(riskTextFor(result))}</div>
            </div>
          </section>

          <section class="panel">
            <div class="panel-label">Ringkasan Rekomendasi</div>
            <p class="quote">&quot;${escapeHtml(recommendationSentence(result))}&quot;</p>
            <div class="foot-note">
              Dihasilkan oleh mesin rekomendasi berbasis aturan sesuai target normatif semester ${s.current_semester}. Bersifat pendukung keputusan &mdash; arahan akhir tetap pada Dosen AA.
            </div>
          </section>
        </div>
      </div>

      <div class="sig">
        <div>Mengetahui,<br>Dosen Academic Advisor<br><div class="line">${escapeHtml(result.profile?.full_name || "(Nama Dosen AA)")}</div></div>
        <div>Bekasi, ${escapeHtml(d)}<br>Dosen Pembimbing<br><div class="line">&nbsp;</div></div>
      </div>
      <div class="doc-foot">
        <span>Rekomendasi bersifat pendukung keputusan (rule-based, target normatif semester ${s.current_semester}).</span>
        <span>Sistem Monitoring Kelulusan Mahasiswa</span>
      </div>
      <div class="tail" aria-hidden="true"></div>
    </div>
    </body></html>`;
}
