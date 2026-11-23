import { initLayout } from "./ui.js?v=binusmaya-1";
import {
  loadDashboard, listFailedCourses, listCertifications, setStudentsActive,
} from "./data.js";
import { evaluateStudent, STATUS_RANK, GRADUATION_SEMESTER } from "./engine.js";
import {
  el, escapeHtml, debounce, toast, isActive,
} from "./utils.js";

// Kolom yang bisa diurutkan. "risk" = tingkat keparahan overall, kolom kategori
// diurutkan dengan aturan yang sama memakai STATUS_RANK dari engine.
const SORT_COLUMNS = {
  risk: { type: "risk" },
  nim: { type: "text" },
  name: { type: "text" },
  semester: { type: "number" },
  sks: { type: "risk" },
  comserv: { type: "risk" },
  sat: { type: "risk" },
  beelingua: { type: "risk" },
  sertifikasi: { type: "risk" },
};

let state = {
  rows: [],
  requirements: [],
  filter: { q: "", semester: "", status: "", active: "semua", kpi: "" },
  sort: { key: "risk", dir: "desc" },
  selected: new Set(),
  canEdit: false,
};

// Pemilihan di layar sentuh: tahan kartu ~500 ms untuk mulai memilih, lalu
// ketuk kartu lain untuk menambah/menghapus pilihan tanpa membuka detail.
const MOBILE_QUERY = "(max-width: 760px)";
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE = 10;

let suppressNextClick = false;
let cancelActivePress = null;

window.addEventListener("scroll", () => cancelActivePress?.(), { passive: true });

function isMobileView() {
  return typeof window.matchMedia === "function" && window.matchMedia(MOBILE_QUERY).matches;
}

function applySelection(id, checked) {
  if (checked) state.selected.add(id);
  else state.selected.delete(id);

  const tr = document.querySelector(`tbody tr[data-id="${id}"]`);
  const box = tr?.querySelector("input.row-check");
  if (box) box.checked = checked;
  tr?.classList.toggle("is-selected", checked);

  document.body.classList.toggle("has-bulk-selection", state.selected.size > 0);
  syncBulkBar();
  syncCheckAll();
}

const STATUS_ID = {
  safe: { label: "AMAN", cls: "safe" },
  warn: { label: "PERHATIAN", cls: "warn" },
  danger: { label: "MENDESAK", cls: "danger" },
  // Kategori yang belum jatuh tempo (mis. Beelingua belum wajib semester ini):  // belum selesai, jadi tidak boleh ditampilkan sebagai AMAN.
  info: { label: "BELUM WAJIB", cls: "info" },
};

function renderFigmaBadge(statusKey) {
  const meta = STATUS_ID[statusKey] || { label: statusKey?.toUpperCase() || "-", cls: "neutral" };
  return `<span class="badge ${meta.cls}">${meta.label}</span>`;
}

function catStatus(row, category) {
  return row.categories.find((c) => c.category === category)?.status || "safe";
}

function urgencyOf(row) {
  return row.priorities[0]?.urgency || 0;
}

// Melewati semester 8 = lewat masa studi normal, perlu tindakan terpisah
// dari tingkat risiko syarat kelulusan.
function isLate(student) {
  return (Number(student.current_semester) || 0) > GRADUATION_SEMESTER;
}

function sortValue(row) {
  switch (state.sort.key) {
    case "nim":
      return String(row.student.nim);
    case "name":
      return String(row.student.name).toLowerCase();
    case "semester":
      return Number(row.student.current_semester) || 0;
    case "risk":
      return STATUS_RANK[row.overall] ?? 0;
    default:
      return STATUS_RANK[catStatus(row, state.sort.key)] ?? 0;
  }
}

function sortRows(rows) {
  const dir = state.sort.dir === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const va = sortValue(a);
    const vb = sortValue(b);
    let cmp = typeof va === "number" && typeof vb === "number"
      ? va - vb
      : String(va).localeCompare(String(vb), "id");

    // Seri pada tingkat risiko: yang urgensinya lebih besar didahulukan.
    if (cmp === 0 && (state.sort.key === "risk" || SORT_COLUMNS[state.sort.key]?.type === "risk")) {
      cmp = urgencyOf(a) - urgencyOf(b);
    }
    if (cmp !== 0) return cmp * dir;

    // Tie-break selalu stabil dan mudah dibaca.
    return String(a.student.name).localeCompare(String(b.student.name), "id");
  });
}

// Predikat kartu KPI: hanya mahasiswa aktif yang cocok dengan kartu yang diklik.
// "total" = semua aktif; danger/warn/safe = overall status; late = melewati semester 8.
function kpiMatch(r, kpi) {
  if (kpi === "total") return true;
  if (kpi === "late") return isLate(r.student);
  return r.overall === kpi;
}

function collectRows() {
  const { q, semester, status, active, kpi } = state.filter;
  const term = q.trim().toLowerCase();

  const base = state.rows.filter((r) => {
    const s = r.student;
    if (term && !(String(s.name).toLowerCase().includes(term) || String(s.nim).toLowerCase().includes(term))) return false;
    if (semester && String(s.current_semester) !== String(semester)) return false;
    if (status && r.overall !== status) return false;
    if (kpi && (!isActive(r.student) || !kpiMatch(r, kpi))) return false;
    return true;
  });

  const aktif = base.filter((r) => isActive(r.student));
  const nonaktif = base.filter((r) => !isActive(r.student));
  const rows = active === "aktif" ? aktif : active === "nonaktif" ? nonaktif : base;

  // Nonaktif selalu di bawah, apa pun kolom pengurutannya.
  const sorted = sortRows(rows).sort((a, b) =>
    isActive(a.student) === isActive(b.student) ? 0 : isActive(a.student) ? -1 : 1
  );

  return { rows: sorted, aktif: aktif.length, nonaktif: nonaktif.length };
}

function kpiFilterLabel() {
  const k = state.filter.kpi;
  if (!k) return "";
  const labels = { total: "Total Mahasiswa", danger: "Mendesak", warn: "Perlu Perhatian", safe: "Aman", late: "Terlambat" };
  return ` · ${labels[k] || k}`;
}

function countLabel({ aktif, nonaktif }) {
  const kpi = kpiFilterLabel();
  if (state.filter.active === "nonaktif") return `${nonaktif} mahasiswa nonaktif${kpi}`;
  if (state.filter.active === "aktif") {
    return nonaktif ? `${aktif} mahasiswa aktif · ${nonaktif} nonaktif disembunyikan${kpi}` : `${aktif} mahasiswa aktif${kpi}`;
  }
  return `${aktif} mahasiswa aktif · ${nonaktif} nonaktif${kpi}`;
}

function sortableTh(key, label, extra = "") {
  const on = state.sort.key === key;
  const arrow = on ? (state.sort.dir === "asc" ? "▲" : "▼") : "↕";
  const ariaSort = on ? (state.sort.dir === "asc" ? "ascending" : "descending") : "none";
  return `<th class="sortable${on ? " on" : ""}" data-sort="${key}" aria-sort="${ariaSort}" tabindex="0" title="Klik untuk mengurutkan" ${extra}>${label}<span class="arw">${arrow}</span></th>`;
}

function renderTable(rows, counts) {
  const host = el("table-host");
  const label = el("count-label");
  if (label) label.textContent = countLabel(counts);

  document.body.classList.toggle(
    "has-bulk-selection",
    state.canEdit && state.selected.size > 0
  );
  syncBulkBar();

  if (!rows.length) {
    host.innerHTML = `<div class="empty-state"><div class="big">🔍</div>Tidak ada mahasiswa yang sesuai filter.</div>`;
    syncCheckAll();
    return;
  }

  const body = rows
    .map((r) => {
      const s = r.student;
      const active = isActive(s);
      const checked = state.selected.has(s.id);
      const checkCell = state.canEdit
        ? `<td class="check-cell"><input type="checkbox" class="row-check" data-id="${s.id}"${
            checked ? " checked" : ""
          } aria-label="Pilih ${escapeHtml(s.name)}"></td>`
        : "";
      const offBadge = active ? "" : ' <span class="badge off">NONAKTIF</span>';
      const lateBadge = isLate(s) ? ' <span class="badge late">TERLAMBAT</span>' : "";
      // Alasan nonaktif ditampilkan langsung di tabel supaya tidak perlu
      // membuka detail tiap mahasiswa.
      const reasonCell = active
        ? ""
        : s.deactivate_reason
          ? `<div class="cell-reason" title="${escapeHtml(s.deactivate_reason)}">Alasan: ${escapeHtml(s.deactivate_reason)}</div>`
          : `<div class="cell-reason muted">Tanpa alasan</div>`;

      return `
        <tr data-id="${s.id}" class="${active ? "" : "is-inactive"}${checked ? " is-selected" : ""}">
          ${checkCell}
          <td class="nim" data-label="NIM">${escapeHtml(s.nim)}</td>
          <td class="cell-name" style="font-weight:700">${escapeHtml(s.name)}${offBadge}${lateBadge}${reasonCell}</td>
          <td class="sem" data-label="Semester">${s.current_semester}</td>
          <td data-label="SKS">${renderFigmaBadge(catStatus(r, "sks"))}</td>
          <td data-label="Comserv">${renderFigmaBadge(catStatus(r, "comserv"))}</td>
          <td data-label="SAT">${renderFigmaBadge(catStatus(r, "sat"))}</td>
          <td data-label="Beelingua">${renderFigmaBadge(catStatus(r, "beelingua"))}</td>
          <td data-label="Sertifikasi">${renderFigmaBadge(catStatus(r, "sertifikasi"))}</td>
          <td class="text-right cell-action">
            <a class="btn btn-detail" href="student.html?id=${s.id}">Detail</a>
          </td>
        </tr>`;
    })
    .join("");

  host.innerHTML = `
    ${state.canEdit ? '<p class="select-hint">Tahan kartu mahasiswa untuk memilih.</p>' : ""}
    <div class="table-wrap">
      <table class="data table-cards">
        <thead>
          <tr>
            ${state.canEdit ? '<th class="check-cell"><input type="checkbox" id="check-all" aria-label="Pilih semua mahasiswa yang tampil"></th>' : ""}
            ${sortableTh("nim", "NIM")}
            ${sortableTh("name", "NAMA")}
            ${sortableTh("semester", "SEM", 'style="text-align:center"')}
            ${sortableTh("sks", "SKS")}
            ${sortableTh("comserv", "COMSERV")}
            ${sortableTh("sat", "SAT")}
            ${sortableTh("beelingua", "BEELINGUA")}
            ${sortableTh("sertifikasi", "SERTIFIKASI")}
            <th></th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;

  wireTable(host);
  syncCheckAll();
}

function setSort(key) {
  if (!SORT_COLUMNS[key]) return;
  if (state.sort.key === key) {
    state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
  } else {
    // Kolom teks/angka mulai dari asc; kolom risiko mulai dari yang terburuk.
    state.sort = { key, dir: SORT_COLUMNS[key].type === "risk" ? "desc" : "asc" };
  }
  const select = el("f-sort");
  if (select) select.value = key;
  render();
}

function wireTable(host) {
  host.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => setSort(th.dataset.sort));
    th.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setSort(th.dataset.sort);
      }
    });
  });

  host.querySelectorAll("input.row-check").forEach((box) => {
    box.addEventListener("change", () => applySelection(box.dataset.id, box.checked));
  });

  const checkAll = host.querySelector("#check-all");
  if (checkAll) {
    checkAll.addEventListener("change", () => {
      host.querySelectorAll("input.row-check").forEach((box) => {
        box.checked = checkAll.checked;
        if (checkAll.checked) state.selected.add(box.dataset.id);
        else state.selected.delete(box.dataset.id);
        box.closest("tr")?.classList.toggle("is-selected", box.checked);
      });
      document.body.classList.toggle("has-bulk-selection", state.selected.size > 0);
      syncBulkBar();
      syncCheckAll();
    });
  }

  host.querySelectorAll("tbody tr").forEach((tr) => {
    tr.addEventListener("click", (e) => {
      if (e.target.closest("a, button, input, label, select")) return;
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      // Setelah ada pilihan, ketuk kartu lain berarti menambah/menghapus
      // pilihan, bukan membuka detail.
      if (isMobileView() && state.selected.size > 0) {
        applySelection(tr.dataset.id, !state.selected.has(tr.dataset.id));
        return;
      }
      window.location.href = `student.html?id=${tr.dataset.id}`;
    });
    wireLongPress(tr);
  });
}

// Tahan kartu untuk memulai pemilihan di layar sentuh. Gerakan jari lebih dari
// LONG_PRESS_MOVE, scroll, atau pointer keluar kartu membatalkan tahanan.
function wireLongPress(tr) {
  let timer = 0;
  let startX = 0;
  let startY = 0;

  const cancel = () => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
    if (cancelActivePress === cancel) cancelActivePress = null;
  };

  // Klik tetap terpicu setelah jari diangkat; tahan sebentar flag-nya supaya
  // klik itu tidak ikut membuka halaman detail.
  const release = () => {
    cancel();
    if (suppressNextClick) {
      window.setTimeout(() => {
        suppressNextClick = false;
      }, 400);
    }
  };

  tr.addEventListener("pointerdown", (e) => {
    if (!state.canEdit || !isMobileView()) return;
    if (e.pointerType === "mouse") return;
    if (e.target.closest("a, button, input, label, select")) return;

    cancel();
    startX = e.clientX;
    startY = e.clientY;
    cancelActivePress = cancel;

    timer = window.setTimeout(() => {
      timer = 0;
      cancelActivePress = null;
      const id = tr.dataset.id;
      applySelection(id, !state.selected.has(id));
      suppressNextClick = true;
      try {
        navigator.vibrate?.(12);
      } catch (_) {
        /* getaran tidak didukung */
      }
    }, LONG_PRESS_MS);
  });

  tr.addEventListener("pointermove", (e) => {
    if (!timer) return;
    if (
      Math.abs(e.clientX - startX) > LONG_PRESS_MOVE ||
      Math.abs(e.clientY - startY) > LONG_PRESS_MOVE
    ) {
      cancel();
    }
  });

  tr.addEventListener("pointerup", release);
  tr.addEventListener("pointercancel", release);
  tr.addEventListener("pointerleave", release);
  tr.addEventListener("contextmenu", (e) => {
    if (isMobileView()) e.preventDefault();
  });
}

function syncCheckAll() {
  const all = el("check-all");
  if (!all) return;
  const boxes = Array.from(document.querySelectorAll("input.row-check"));
  const checked = boxes.filter((b) => b.checked).length;
  all.checked = boxes.length > 0 && checked === boxes.length;
  all.indeterminate = checked > 0 && checked < boxes.length;
}

function syncBulkBar() {
  const bar = el("bulk-bar");
  if (!bar) return;
  const count = state.selected.size;
  if (!state.canEdit || count === 0) {
    bar.classList.add("hidden");
    bar.innerHTML = "";
    return;
  }

  const selectedActive = state.rows.filter((r) => state.selected.has(r.student.id) && isActive(r.student)).length;
  const selectedInactive = count - selectedActive;

  bar.classList.remove("hidden");
  bar.innerHTML = `
    <div class="bulk-count"><b>${count}</b> mahasiswa dipilih${
      selectedInactive ? ` · ${selectedInactive} nonaktif` : ""
    }</div>
    <div class="bulk-actions">
      <button class="btn primary sm" type="button" data-bulk="deactivate"${
        selectedActive ? "" : " disabled"
      }>Nonaktifkan</button>
      <button class="btn sm" type="button" data-bulk="activate"${
        selectedInactive ? "" : " disabled"
      }>Aktifkan</button>
      <button class="btn sm" type="button" data-bulk="clear">Batal</button>
    </div>`;
}

async function applyActive(ids, active, reason = "") {
  if (!ids.length) {
    toast(`Tidak ada mahasiswa yang perlu di${active ? "aktifkan" : "nonaktifkan"}.`, "info");
    return false;
  }

  if (active) {
    const ok = window.confirm(
      `Aktifkan kembali ${ids.length} mahasiswa? Data mahasiswa tidak dihapus, hanya dipantau kembali.`
    );
    if (!ok) return false;
  }

  const buttons = Array.from(document.querySelectorAll("#bulk-bar button[data-bulk]"));
  buttons.forEach((b) => (b.disabled = true));
  try {
    await setStudentsActive(ids, active, reason);
    const stamp = active ? null : new Date().toISOString();
    state.rows.forEach((r) => {
      if (!ids.includes(r.student.id)) return;
      r.student.is_active = active;
      r.student.deactivate_reason = active ? null : reason || null;
      r.student.deactivated_at = active ? null : stamp;
    });
    state.selected.clear();
    updateKpis();
    render();
    toast(`${ids.length} mahasiswa ${active ? "diaktifkan kembali" : "dinonaktifkan"}.`, "success");
    return true;
  } catch (err) {
    toast(`Gagal ${active ? "mengaktifkan" : "menonaktifkan"} mahasiswa: ${err.message}`, "error");
    syncBulkBar();
    return false;
  }
}

// ------------------------------------------------------------ alasan nonaktif --

// Satu aksi nonaktifkan berlaku untuk beberapa mahasiswa sekaligus, jadi
// alasannya disimpan sekali lalu ditulis ke semua mahasiswa yang dipilih.
let pendingDeactivateIds = [];

function idsToToggle(active) {
  return [...state.selected].filter((id) => {
    const row = state.rows.find((r) => r.student.id === id);
    return row && isActive(row.student) !== active;
  });
}

function openDeactivateModal(ids) {
  if (!state.canEdit) {
    toast("Akun Kaprodi hanya bisa melihat data, tidak bisa mengubahnya.", "warn");
    return;
  }
  pendingDeactivateIds = ids;

  const names = ids
    .map((id) => state.rows.find((r) => r.student.id === id)?.student.name)
    .filter(Boolean);
  const target = el("deactivate-target");
  if (target) {
    const preview = names.slice(0, 3).join(", ");
    const more = names.length > 3 ? `, +${names.length - 3} lainnya` : "";
    target.textContent =
      ids.length === 1
        ? `Mahasiswa: ${preview}`
        : `${ids.length} mahasiswa: ${preview}${more}`;
  }

  const box = el("deactivate-reason");
  if (box) box.value = "";

  const modal = el("deactivate-modal");
  if (modal) modal.classList.add("open");
  setTimeout(() => box?.focus(), 30);
}

function closeDeactivateModal() {
  pendingDeactivateIds = [];
  const modal = el("deactivate-modal");
  if (modal) modal.classList.remove("open");
}

async function confirmDeactivate() {
  const ids = pendingDeactivateIds;
  if (!ids.length) {
    closeDeactivateModal();
    return;
  }
  const box = el("deactivate-reason");
  const reason = String(box?.value || "").trim();
  if (!reason) {
    toast("Alasan nonaktifkan wajib diisi.", "warn");
    box?.focus();
    return;
  }

  const btn = el("deactivate-confirm");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Menyimpan...";
  }
  try {
    const ok = await applyActive(ids, false, reason);
    if (ok) closeDeactivateModal();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Nonaktifkan";
    }
  }
}

function wireDeactivateModal() {
  const modal = el("deactivate-modal");
  if (!modal) return;

  const box = el("deactivate-reason");
  el("deactivate-close")?.addEventListener("click", closeDeactivateModal);
  el("deactivate-cancel")?.addEventListener("click", closeDeactivateModal);
  el("deactivate-confirm")?.addEventListener("click", confirmDeactivate);

  el("deactivate-chips")?.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const reason = chip.dataset.reason || "";
    if (!box) return;
    // Klik chip yang sama untuk menghapus alasan yang sudah terpasang,
    // supaya alasan tidak terduplikasi kalau tidak sengaja diklik dua kali.
    const current = String(box.value || "").trim();
    if (current === reason) {
      box.value = "";
    } else if (current.includes(reason)) {
      box.value = current.replace(reason, "").replace(/\s{2,}/g, " ").trim();
    } else {
      box.value = current ? `${current} ${reason}` : reason;
    }
    box.focus();
  });

  // Klik di area gelap di luar modal = batal.
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeDeactivateModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("open")) {
      closeDeactivateModal();
    }
  });
}

function wireBulkBar() {
  const bar = el("bulk-bar");
  if (!bar) return;
  bar.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-bulk]");
    if (!btn || btn.disabled) return;
    const action = btn.dataset.bulk;
    if (action === "clear") {
      state.selected.clear();
      render();
      return;
    }
    if (action === "deactivate") {
      // Menonaktifkan selalu lewat modal supaya alasannya tercatat.
      openDeactivateModal(idsToToggle(false));
      return;
    }
    applyActive(idsToToggle(true), true);
  });
}

function updateKpis() {
  const counts = { danger: 0, warn: 0, safe: 0 };
  // Mahasiswa nonaktif tidak dipantau lagi, jadi tidak ikut dihitung di KPI.
  const active = state.rows.filter((r) => isActive(r.student));
  active.forEach((r) => (counts[r.overall] = (counts[r.overall] || 0) + 1));
  el("k-total").textContent = active.length;
  el("k-danger").textContent = counts.danger || 0;
  el("k-warn").textContent = counts.warn || 0;
  el("k-safe").textContent = counts.safe || 0;
  el("k-late").textContent = active.filter((r) => isLate(r.student)).length;
}

function render() {
  const { rows, aktif, nonaktif } = collectRows();
  // Buang pilihan yang barisnya sudah tidak ada lagi di sumber data.
  const validIds = new Set(state.rows.map((r) => r.student.id));
  [...state.selected].forEach((id) => {
    if (!validIds.has(id)) state.selected.delete(id);
  });
  renderTable(rows, { aktif, nonaktif });
  syncKpiCards();
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
  el("q").addEventListener("input", debounce((e) => { state.filter.q = e.target.value; render(); }, 200));
  el("f-semester").addEventListener("change", (e) => { state.filter.semester = e.target.value; render(); });
  el("f-status").addEventListener("change", (e) => { state.filter.status = e.target.value; render(); });
  el("f-active").addEventListener("change", (e) => { state.filter.active = e.target.value; render(); });
  el("f-sort").addEventListener("change", (e) => {
    const key = e.target.value;
    if (!SORT_COLUMNS[key]) return;
    state.sort = { key, dir: SORT_COLUMNS[key].type === "risk" ? "desc" : "asc" };
    render();
  });
}

// Kartu KPI dapat diklik untuk memfilter tabel ke populasi yang dihitung kartu itu.
// Klik kartu yang sama lagi menghapus filter. Hanya satu filter KPI aktif sekaligus,
// dan berdampingan dengan filter status/semester/keaktifan yang sudah ada.
function kpiKeyOf(card) {
  // Kunci diambil dari kelas modifikator (stat-card--total → total), bukan
  // dari id: id="k-total" menempel pada .k-value di dalam kartu, bukan pada
  // .stat-card itu sendiri.
  return [...card.classList]
    .find((c) => c.startsWith("stat-card--"))
    ?.replace("stat-card--", "") || "";
}

// Status aktif kartu KPI diturunkan langsung dari state.filter.kpi, jadi
// border hanya menyala saat filter-nya memang sedang aktif — bukan karena
// bekas fokus sesudah diklik.
function syncKpiCards() {
  const row = el("kpi-row");
  if (!row) return;
  const active = state.filter.kpi;
  row.querySelectorAll(".stat-card").forEach((card) => {
    const on = active !== "" && kpiKeyOf(card) === active;
    card.classList.toggle("is-active", on);
    card.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function wireKpiCards() {
  const row = el("kpi-row");
  if (!row) return;
  row.querySelectorAll(".stat-card").forEach((card) => {
    const key = kpiKeyOf(card);
    card.setAttribute("role", "button");
    card.tabIndex = 0;
    card.setAttribute("aria-pressed", "false");

    const toggle = () => {
      state.filter.kpi = state.filter.kpi === key ? "" : key;
      render();
    };

    card.addEventListener("click", (e) => {
      toggle();
      // Klik mouse tidak perlu menyisakan fokus (biar cincin fokus tidak
      // tertinggal seperti border). Pengguna keyboard tetap mempertahankan fokus.
      if (e.detail > 0) card.blur();
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
  });
  syncKpiCards();
}

(async function main() {
  const session = await initLayout({
    active: "dashboard.html",
    title: "Dashboard Mahasiswa Bimbingan",
    subtitle: "Dr. Ahmad Fauzi, M.T. - Semester Ganjil 2025/2026"
  });
  if (!session) return;

  // Kaprodi hanya punya akses baca, jadi aksi keaktifan disembunyikan.
  state.canEdit = session.profile?.role !== "kaprodi";

  wireFilters();
  wireKpiCards();
  wireBulkBar();
  wireDeactivateModal();
  try {
    const { students, requirements } = await loadDashboard();
    state.requirements = requirements;
    state.rows = await loadAllStudents(students, requirements);
    updateKpis();
    populateSemesterFilter();
    render();
  } catch (err) {
    el("table-host").innerHTML = "";
    const box = el("alert");
    box.className = "alert error";
    box.textContent = `Gagal memuat data: ${err.message}`;
  }
})();
