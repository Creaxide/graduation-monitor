// Offline/cache behavior is paused until its scope is agreed; PWA installation remains enabled.
const OFFLINE_FEATURE_ENABLED = false;
const INSTALL_BUTTON_ID = "install-app-btn";

const notice = document.createElement("aside");
notice.className = "app-notice";
notice.setAttribute("role", "status");
notice.setAttribute("aria-live", "polite");
notice.hidden = true;
notice.innerHTML = `
  <div class="app-notice-message"></div>
  <div class="app-notice-actions"></div>`;
(document.body || document.documentElement).append(notice);

const message = notice.querySelector(".app-notice-message");
const actions = notice.querySelector(".app-notice-actions");
let installPrompt = null;
let installButton = null;
let waitingWorker = null;

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function isMobileDevice() {
  const userAgent = navigator.userAgent || "";
  const touchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return Boolean(
    navigator.userAgentData?.mobile ||
    /Android|iPhone|iPad|iPod|IEMobile|Windows Phone/i.test(userAgent) ||
    touchMac
  );
}

function isAppleMobileDevice() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || "") ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function showNotice(text, buttons = []) {
  message.textContent = text;
  actions.replaceChildren(...buttons);
  notice.hidden = false;
  syncInstallButton();
}

function hideNotice() {
  notice.hidden = true;
  actions.replaceChildren();
  syncInstallButton();
}

function makeButton(label, onClick, primary = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (primary) button.className = "primary";
  button.addEventListener("click", onClick);
  return button;
}

function showOfflineNotice() {
  showNotice("Anda sedang offline. Aplikasi tersedia, tetapi data mahasiswa memerlukan koneksi internet.");
}

if (OFFLINE_FEATURE_ENABLED) {
  window.addEventListener("offline", showOfflineNotice);
  window.addEventListener("online", hideNotice);
}

/* ------------------------------------------------------------------ install --- */

// Tombol install selalu terlihat di perangkat mobile, bukan hanya saat browser
// memicu beforeinstallprompt, supaya pengguna tetap punya jalan masuk saat
// prompt native tidak tersedia (iOS, WebView, atau HTTP).
function createInstallButton() {
  if (installButton) return installButton;
  const button = document.createElement("button");
  button.type = "button";
  button.id = INSTALL_BUTTON_ID;
  button.className = "install-fab";
  button.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3v12"></path>
      <path d="m7 10 5 5 5-5"></path>
      <path d="M5 21h14"></path>
    </svg>
    <span>Install aplikasi</span>`;
  button.addEventListener("click", handleInstallClick);
  (document.body || document.documentElement).append(button);
  installButton = button;
  return button;
}

function syncInstallButton() {
  if (!installButton) return;
  const visible = isMobileDevice() && !isStandalone() && notice.hidden;
  installButton.hidden = !visible;
}

function removeInstallUi() {
  installPrompt = null;
  if (installButton) {
    installButton.remove();
    installButton = null;
  }
  hideNotice();
}

function installHelpText() {
  if (!window.isSecureContext) {
    return "Install aplikasi hanya tersedia saat situs dibuka lewat HTTPS.";
  }
  if (isAppleMobileDevice()) {
    return "Di Safari, buka tombol Bagikan lalu pilih “Tambahkan ke Layar Utama”.";
  }
  return "Buka menu browser (⋮) lalu pilih “Install aplikasi” atau “Tambahkan ke layar utama”.";
}

function showInstallHelp() {
  showNotice(installHelpText(), [makeButton("Mengerti", hideNotice, true)]);
}

async function handleInstallClick() {
  if (!installPrompt) {
    showInstallHelp();
    return;
  }
  const promptEvent = installPrompt;
  installPrompt = null;
  try {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice?.outcome === "accepted") removeInstallUi();
  } catch (error) {
    console.error("Prompt install gagal:", error);
    showInstallHelp();
  }
}

window.addEventListener("beforeinstallprompt", (event) => {
  if (!isMobileDevice()) return;
  event.preventDefault();
  installPrompt = event;
  if (isStandalone()) return;
  createInstallButton();
  syncInstallButton();
});

window.addEventListener("appinstalled", removeInstallUi);

if (isMobileDevice() && !isStandalone()) {
  createInstallButton();
  syncInstallButton();
}

/* ---------------------------------------------------------- service worker --- */

// Service worker tetap didaftarkan supaya aplikasi memenuhi syarat installable
// di Chrome/Edge Android. Saat OFFLINE_FEATURE_ENABLED = false worker tidak
// menyimpan cache apa pun dan hanya meneruskan request ke jaringan.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    let registration;
    try {
      registration = await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });
    } catch (error) {
      console.error("Pendaftaran service worker gagal:", error);
      return;
    }

    if (!OFFLINE_FEATURE_ENABLED) return;

    if (registration.waiting) showUpdateNotice(registration);
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          showUpdateNotice(registration);
        }
      });
    });

    if (navigator.onLine) {
      try {
        await registration.update();
      } catch (error) {
        console.warn("Pemeriksaan pembaruan aplikasi gagal:", error);
      }
    }
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!OFFLINE_FEATURE_ENABLED || refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

function showUpdateNotice(registration) {
  waitingWorker = registration.waiting;
  if (!waitingWorker || !navigator.onLine) return;
  showNotice(
    "Pembaruan Graduation Monitor tersedia.",
    [makeButton("Perbarui", () => waitingWorker?.postMessage("SKIP_WAITING"), true)]
  );
}
