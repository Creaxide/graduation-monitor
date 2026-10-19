import {
  getCurrentUser, getProfile, signOut, isMock,
  mockHasData, mockClear, seedDummyData,
} from "./data.js";
import { escapeHtml, toast, setBusy, el } from "./utils.js";
import { initTheme, mountThemeToggle } from "./theme.js";

const NAV = [
  { href: "dashboard.html", label: "Dashboard", id: "dashboard", icon: "" },
  { href: "import-export.html", label: "Import / Export", id: "import-export", icon: "⇅" },
];

export async function initLayout({ active, title, subtitle }) {
  initTheme();
  const user = await getCurrentUser();
  if (!user) {
    window.location.replace("index.html");
    return null;
  }
  const profile = (await getProfile(user.id)) || {
    full_name: "Dr. Ahmad Fauzi, M.T.",
    role: "dosen_aa",
  };

  renderHeader(profile, active);
  setPageHeading(title, subtitle);
  wireChrome();
  return { user, profile };
}

function renderHeader(profile, active) {
  let header = document.querySelector(".site-header");
  if (!header) {
    header = document.createElement("header");
    header.className = "site-header";
    document.body.prepend(header);
  }

  const pills = NAV.map((n) => {
    const isActive = n.href === active || (active && active.startsWith(n.id));
    return `
      <a href="${n.href}" class="nav-pill ${isActive ? "active" : ""}">
        ${n.icon ? `<span class="pill-ico">${n.icon}</span>` : ""}
        <span>${escapeHtml(n.label)}</span>
      </a>`;
  }).join("");

  const name = profile.full_name || "Dr. Ahmad Fauzi, M.T.";
  const roleLabel = profile.role === "kaprodi" ? "Kaprodi" : "Dosen AA";

  header.innerHTML = `
    <div class="header-inner">
      <div class="binus-logo-wrap">
        <span class="binus-logo-box" role="img" aria-label="BINUS University">
          <img class="binus-logo binus-logo--light" src="Binusian_logolightmode.png" alt="" />
          <img class="binus-logo binus-logo--dark" src="Binusian_logodarkmode.png" alt="" />
        </span>
        <div class="binus-brand-label">
          <span>School of Computer Science</span>
        </div>
      </div>
      <nav class="nav-pills">${pills}</nav>
      <div class="header-spacer"></div>
      <div class="header-user">
        <div class="u-meta">
          <div class="u-name">${escapeHtml(name)}</div>
          <div class="u-role">${escapeHtml(roleLabel)}</div>
        </div>
        <button class="btn-theme" id="theme-btn" type="button" title="Ganti tema terang/gelap" aria-label="Ganti tema terang/gelap"></button>
        <button class="btn-keluar" id="logout-btn" title="Keluar dari sistem">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          <span>Keluar</span>
        </button>
      </div>
    </div>`;

  mountThemeToggle("theme-btn");
}

function setPageHeading(title, subtitle) {
  const head = document.querySelector(".page-title");
  if (head && title) {
    head.innerHTML = `<h1>${escapeHtml(title)}</h1>${
      subtitle ? `<div class="page-subtitle">${escapeHtml(subtitle)}</div>` : ""
    }`;
  }
}

export function mountTestControls(profile) {
  const btn = el("dummy-btn");
  // Kaprodi is read-only: hide every control that writes.
  if (profile?.role === "kaprodi") {
    el("test-controls")?.classList.add("hidden");
    return;
  }
  const clear = el("dummy-clear");
  const note = el("dummy-note");
  if (!btn) return;

  if (note) {
    note.textContent = isMock
      ? "Menghasilkan data dummy lokal."
      : "Menghasilkan data uji ke Supabase.";
  }
  if (clear && isMock) {
    clear.classList.remove("hidden");
    clear.addEventListener("click", () => {
      if (!mockHasData()) return toast("Tidak ada data dummy untuk dihapus.", "warn");
      if (!window.confirm("Hapus semua data dummy?")) return;
      mockClear();
      toast("Data dummy dibersihkan.", "info");
      setTimeout(() => window.location.reload(), 400);
    });
  }

  btn.addEventListener("click", async () => handleGenerate(btn, 1));
}

function wireChrome() {
  const logout = document.getElementById("logout-btn");
  if (logout) {
    logout.addEventListener("click", async () => {
      await signOut();
      window.location.replace("index.html");
    });
  }

}

export async function handleGenerate(button, forceOne = 0) {
  const countInput = document.getElementById("dummy-count");
  const count = forceOne ? 1 : Math.min(100, Math.max(1, Number(countInput?.value) || 10));

  if (isMock) {
    if (mockHasData() && !window.confirm("Data dummy sudah ada. Hasilkan ulang dan ganti semuanya?")) return;
  } else if (!window.confirm(`Masukkan ${count} data mahasiswa acak ke Supabase? Tindakan ini menulis ke basis data langsung.`)) {
    return;
  }

  setBusy(button, true, "...");
  try {
    const summary = await seedDummyData(count);
    const parts = [`${summary.students} mahasiswa`];
    if (summary.failed) parts.push(`${summary.failed} mata kuliah tidak lulus`);
    if (summary.certs) parts.push(`${summary.certs} sertifikasi`);
    toast(`Berhasil memasukkan ${parts.join(", ")}.`, "success");
    if (summary.errors && summary.errors.length) {
      toast(`${summary.errors.length} data gagal — ${summary.errors[0]}`, "warn");
    }
    setTimeout(() => window.location.reload(), 800);
  } catch (err) {
    toast(err.message || "Gagal menghasilkan data dummy.", "error");
    setBusy(button, false);
  }
}
