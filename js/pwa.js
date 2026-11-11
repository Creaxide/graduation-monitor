// Offline/cache behavior is paused until its scope is agreed; PWA installation remains enabled.
const OFFLINE_FEATURE_ENABLED = false;

const notice = document.createElement("aside");
notice.className = "app-notice";
notice.setAttribute("role", "status");
notice.setAttribute("aria-live", "polite");
notice.hidden = true;
notice.innerHTML = `
  <div class="app-notice-message"></div>
  <div class="app-notice-actions"></div>`;
document.body.append(notice);

const message = notice.querySelector(".app-notice-message");
const actions = notice.querySelector(".app-notice-actions");
let installPrompt = null;
let waitingWorker = null;

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
  window.addEventListener("online", () => {
    notice.hidden = true;
    actions.replaceChildren();
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  if (!isMobileDevice()) return;
  event.preventDefault();
  installPrompt = event;
  if (!navigator.onLine && OFFLINE_FEATURE_ENABLED) return showOfflineNotice();
  showNotice(
    "Install Graduation Monitor di perangkat ini.",
    [makeButton("Install aplikasi", async () => {
      if (!installPrompt) return;
      await installPrompt.prompt();
      installPrompt = null;
      notice.hidden = true;
    }, true)]
  );
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  notice.hidden = true;
});

function showUpdateNotice(registration) {
  waitingWorker = registration.waiting;
  if (!waitingWorker || !navigator.onLine) return;
  showNotice(
    "Pembaruan Graduation Monitor tersedia.",
    [makeButton("Perbarui", () => waitingWorker?.postMessage("SKIP_WAITING"), true)]
  );
}

if ("serviceWorker" in navigator && OFFLINE_FEATURE_ENABLED) {
  window.addEventListener("load", async () => {
    let registration;
    try {
      registration = await navigator.serviceWorker.register("./service-worker.js");
    } catch (error) {
      console.error("Pendaftaran offline app gagal:", error);
      return;
    }

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
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

if ("serviceWorker" in navigator && !OFFLINE_FEATURE_ENABLED) {
  window.addEventListener("load", async () => {
    const workerUrl = new URL("./service-worker.js", window.location.href).href;
    const clearAppCaches = async () => {
      if (!("caches" in window)) return;
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("graduation-monitor-"))
          .map((key) => caches.delete(key))
      );
    };

    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const appRegistrations = registrations.filter((registration) =>
        [registration.active, registration.installing, registration.waiting]
          .filter(Boolean)
          .some((worker) => worker.scriptURL === workerUrl)
      );
      await Promise.all(appRegistrations.map((registration) => registration.unregister()));
      await clearAppCaches();
      window.setTimeout(() => {
        clearAppCaches().catch((error) => console.error("Pembersihan cache offline gagal:", error));
      }, 1500);
    } catch (error) {
      console.error("Penonaktifan cache offline gagal:", error);
    }
  });
}

if (isMobileDevice() && isAppleMobileDevice() && !window.matchMedia("(display-mode: standalone)").matches) {
  showNotice(
    "Install Graduation Monitor di perangkat ini.",
    [makeButton("Cara install", () => {
      showNotice("Di Safari, buka Bagikan lalu pilih Tambahkan ke Layar Utama.");
    }, true)]
  );
}
