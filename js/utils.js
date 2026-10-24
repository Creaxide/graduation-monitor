export function el(id) {
  return document.getElementById(id);
}

export function qs(sel, root = document) {
  return root.querySelector(sel);
}

export function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatNumber(n) {
  if (n === null || n === undefined || n === "") return "-";
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return Number.isInteger(num) ? num.toString() : num.toFixed(2).replace(/\.?0+$/, "");
}

export function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function toast(message, type = "info", container) {
  const host = container || document.body;
  const box = document.createElement("div");
  box.className = `alert ${type}`;
  box.style.cssText =
    "position:fixed;top:18px;right:18px;z-index:200;max-width:340px;box-shadow:var(--shadow-lg);margin:0;";
  box.textContent = message;
  host.appendChild(box);
  setTimeout(() => box.remove(), 4000);
}

export function setBusy(button, busy, busyText = "Working...") {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

export function downloadFile(filename, content, mime = "text/csv;charset=utf-8;") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toCsv(rows, headers) {
  const cols = headers || (rows[0] ? Object.keys(rows[0]) : []);
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(",")];
  for (const row of rows) {
    // Baris bisa berupa array (sesuai urutan header) atau object (kunci = header).
    const values = Array.isArray(row)
      ? cols.map((_, i) => row[i])
      : cols.map((c) => row[c]);
    lines.push(values.map(escape).join(","));
  }
  return lines.join("\n");
}

export function printNode(node) {
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  const styles = Array.from(document.styleSheets)
    .map((s) => {
      try { return Array.from(s.cssRules).map((r) => r.cssText).join("\n"); }
      catch { return ""; }
    })
    .join("\n");
  win.document.write(
    `<!DOCTYPE html><html><head><title>Print</title><style>${styles}</style></head><body>${node.outerHTML}</body></html>`
  );
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

// Cetak satu dokumen HTML (string) dan kembalikan true kalau dialog cetaknya
// sudah disiapkan.
//
// Kenapa tidak window.open() + document.write() + print()? Pola itu rapuh di
// Firefox: popup bisa diblokir (terutama kalau pemanggilannya bukan langsung
// dari klik pengguna), dan print() yang berjalan sebelum dokumen selesai
// di-parse bisa mencetak halaman kosong. Dokumen ditaruh di iframe same-origin
// yang dipindahkan ke luar layar, lalu dicetak lewat contentWindow-nya.
// Di Chrome maupun Firefox hanya isi iframe itu yang ikut tercetak, dan tidak
// ada popup yang perlu diizinkan.
export function printHtmlDocument(html, options = {}) {
  const { title = "Print", width = 794, height = 1123, onError } = options;

  const frame = document.createElement("iframe");
  frame.title = title;
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("tabindex", "-1");
  // Sengaja bukan display:none atau visibility:hidden — Firefox tidak
  // menghitung layout iframe yang tidak terlihat, sehingga isinya bisa kosong
  // waktu dicetak. Dipindahkan ke luar layar saja supaya tetap punya viewport
  // nyata selebar A4.
  frame.style.cssText =
    `position:fixed;left:-99999px;top:0;width:${width}px;height:${height}px;` +
    `border:0;padding:0;margin:0;pointer-events:none;`;

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    if (frame.parentNode) frame.parentNode.removeChild(frame);
  };

  let win = null;
  let started = false;
  const doPrint = () => {
    if (!win) return;
    // afterprint didaftarkan lebih dulu: di Firefox print() menahan jalannya
    // sampai dialog cetak ditutup, jadi listener yang dipasang sesudahnya
    // bisa miss event-nya.
    win.addEventListener("afterprint", remove, { once: true });
    try {
      win.focus();
      win.print();
    } catch (err) {
      console.error("Gagal mencetak dokumen:", err);
      remove();
      if (typeof onError === "function") onError(err);
      return;
    }
    // Jaring pengaman kalau afterprint tidak pernah datang.
    setTimeout(remove, 30000);
  };

  const onLoaded = () => {
    if (started) return;
    started = true;
    // Beri browser satu frame untuk menghitung layout sebelum dicetak.
    requestAnimationFrame(doPrint);
  };

  const parent = document.body || document.documentElement;
  if ("srcdoc" in frame) {
    // srcdoc dipasang sebelum iframe masuk DOM supaya event load yang
    // listened hanya milik dokumen laporan (bukan about:blank awal).
    frame.addEventListener("load", onLoaded, { once: true });
    frame.srcdoc = html;
    parent.appendChild(frame);
    win = frame.contentWindow;
    // Jaring pengaman kalau event load tidak pernah datang.
    setTimeout(onLoaded, 2000);
  } else {
    parent.appendChild(frame);
    win = frame.contentWindow;
    const doc = frame.contentDocument;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(onLoaded, 200);
    }
  }

  if (!win || typeof win.print !== "function") {
    remove();
    return printHtmlViaPopup(html, { title });
  }
  return true;
}

// Cadangan kalau iframe tidak bisa dipakai: buka popup, tulis dokumen, lalu
// cetak setelah dokumen selesai dimuat.
function printHtmlViaPopup(html, { title = "Print" } = {}) {
  const win = window.open("", "_blank", "width=900,height=760");
  if (!win) return false;
  try {
    win.document.open();
    win.document.write(html);
    win.document.close();
  } catch (err) {
    console.error("Gagal menyiapkan dokumen cetak:", err);
    win.close();
    return false;
  }
  win.focus();
  let printed = false;
  const doPrint = () => {
    if (printed) return;
    printed = true;
    try {
      win.print();
    } catch (err) {
      console.error("Gagal mencetak dokumen:", err);
    }
  };
  win.addEventListener("load", doPrint, { once: true });
  setTimeout(doPrint, 400);
  return true;
}

export function isActive(s) {
  return s.is_active !== false;
}

export function weightedAverage(ratios) {
  if (!ratios.length) return 0;
  return ratios.reduce((a, b) => a + b, 0) / ratios.length;
}
