/**
 * Theme helper — Light / Dark / System
 * - "system" (default): mengikuti preferensi sistem (light/dark bawaan perangkat)
 * - "light" / "dark": pilihan manual, disimpan di localStorage
 */

const STORAGE_KEY = "gm-theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";
const ANIM_CLASS = "theme-anim";
const ANIM_MS = 450;

/**
 * Jalankan perubahan tema dengan transisi warna yang halus.
 * @param {() => void} fn
 */
function withTransition(fn) {
  const root = document.documentElement;
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    fn();
    return;
  }
  root.classList.add(ANIM_CLASS);
  fn();
  window.clearTimeout(root.__gmThemeTimer);
  root.__gmThemeTimer = window.setTimeout(() => root.classList.remove(ANIM_CLASS), ANIM_MS);
}

export function getPreference() {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* localStorage tidak tersedia (mode privat) — pakai system */
  }
  return "system";
}

export function systemTheme() {
  try {
    return window.matchMedia && window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function effectiveTheme(pref = getPreference()) {
  return pref === "system" ? systemTheme() : pref;
}

export function applyTheme(pref = getPreference()) {
  const theme = effectiveTheme(pref);
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
  return theme;
}

export function setPreference(pref) {
  try {
    window.localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* abaikan — tema tetap berlaku di session ini */
  }
  return applyTheme(pref);
}

/** Klik tombol: light <-> dark (pilihan manual tersimpan) + transisi halus. */
export function toggleTheme() {
  const next = effectiveTheme() === "dark" ? "light" : "dark";
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* abaikan — tema tetap berlaku di session ini */
  }
  withTransition(() => applyTheme(next));
  return next;
}

const MOON_ICON = `<svg class="ico-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
const SUN_ICON = `<svg class="ico-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;

const mountedButtons = new Set();

function syncButtons() {
  const dark = effectiveTheme() === "dark";
  mountedButtons.forEach((btn) => {
    btn.classList.toggle("btn-theme--on-dark", dark);
    btn.setAttribute("aria-pressed", String(dark));
  });
}

/**
 * Pasang tombol toggle tema.
 * @param {string|HTMLElement} target id atau elemen tombol
 */
export function mountThemeToggle(target) {
  const btn = typeof target === "string" ? document.getElementById(target) : target;
  if (!btn) return null;

  btn.classList.add("btn-theme");
  btn.type = "button";
  btn.innerHTML = MOON_ICON + SUN_ICON;
  btn.setAttribute("aria-label", "Ganti tema terang/gelap");
  btn.title = "Ganti tema terang/gelap";

  btn.addEventListener("click", () => {
    toggleTheme();
    syncButtons();
  });

  mountedButtons.add(btn);
  syncButtons();
  return btn;
}

/** Dipanggil sekali per halaman: terapkan tema + dengarkan perubahan sistem. */
export function initTheme() {
  applyTheme();

  try {
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => {
      if (getPreference() === "system") {
        withTransition(() => applyTheme());
        syncButtons();
      }
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  } catch {
    /* tanpa dukungan matchMedia — tema tetap manual */
  }

  syncButtons();
  return effectiveTheme();
}
