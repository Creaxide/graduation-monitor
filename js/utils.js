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

export function weightedAverage(ratios) {
  if (!ratios.length) return 0;
  return ratios.reduce((a, b) => a + b, 0) / ratios.length;
}
