import { getCurrentUser, getProfile, signOut, isMock, mockHasData, mockGenerate, mockClear } from "./data.js";
import { escapeHtml, toast } from "./utils.js";

const NAV = [
  { href: "dashboard.html", label: "Dashboard", icon: "\u25A6" },
  { href: "students.html", label: "Students", icon: "\u2637" },
  { href: "import-export.html", label: "Import / Export", icon: "\u21C5" },
];

export async function initLayout({ active, title, subtitle }) {
  const user = await getCurrentUser();
  if (!user) {
    window.location.replace("index.html");
    return null;
  }
  const profile = (await getProfile(user.id)) || {
    full_name: user.email,
    role: "dosen_aa",
  };

  renderSidebar(profile, active);
  const head = document.querySelector(".page-title");
  if (head && title) {
    head.innerHTML = `<h1>${escapeHtml(title)}</h1>${
      subtitle ? `<div class="sub">${escapeHtml(subtitle)}</div>` : ""
    }`;
  }
  wireChrome(profile);
  return { user, profile };
}

function renderSidebar(profile, active) {
  const host = document.querySelector("#sidebar");
  if (!host) return;
  const links = NAV.map(
    (n) =>
      `<a href="${n.href}" class="${n.href === active ? "active" : ""}">
         <span class="ico">${n.icon}</span>${n.label}
       </a>`
  ).join("");

  const mockBox = isMock
    ? `<div class="dummy-box">
         <div class="dummy-tag">Demo mode</div>
         <button class="btn sm dummy-btn" id="dummy-generate" style="width:100%;justify-content:center">
           Generate dummy data
         </button>
         <button class="dummy-clear" id="dummy-clear">Clear dummy data</button>
       </div>`
    : "";

  host.innerHTML = `
    <div class="brand">
      <div class="logo">SM</div>
      <div>
        Graduation Monitor
        <small>Advisor Dashboard</small>
      </div>
    </div>
    <nav class="nav">${links}</nav>
    <div class="spacer"></div>
    ${mockBox}
    <div class="user-box">
      <div class="u-name">${escapeHtml(profile.full_name || "User")}</div>
      <div class="u-role">${escapeHtml((profile.role || "").replace("_", " "))}</div>
      <button class="btn ghost sm" id="logout-btn" style="margin-top:10px;color:#cfd7ea">Sign out</button>
    </div>`;
}

function wireChrome() {
  const logout = document.getElementById("logout-btn");
  if (logout) {
    logout.addEventListener("click", async () => {
      await signOut();
      window.location.replace("index.html");
    });
  }

  const toggle = document.querySelector(".menu-toggle");
  const sidebar = document.querySelector("#sidebar");
  if (toggle && sidebar) {
    toggle.addEventListener("click", () => sidebar.classList.toggle("open"));
  }

  const generate = document.getElementById("dummy-generate");
  if (generate) {
    generate.addEventListener("click", () => {
      if (mockHasData()) {
        const again = window.confirm(
          "Dummy data already exists. Regenerate and replace it?"
        );
        if (!again) return;
      }
      const summary = mockGenerate();
      toast(`Generated ${summary.students} students, ${summary.failed} failed courses, ${summary.certs} certifications.`, "success");
      setTimeout(() => window.location.reload(), 500);
    });
  }

  const clear = document.getElementById("dummy-clear");
  if (clear) {
    clear.addEventListener("click", () => {
      if (!mockHasData()) return toast("No dummy data to clear.", "warn");
      if (!window.confirm("Delete all dummy data?")) return;
      mockClear();
      toast("Dummy data cleared.", "info");
      setTimeout(() => window.location.reload(), 400);
    });
  }
}
