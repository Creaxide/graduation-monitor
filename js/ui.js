import {
  getCurrentUser, getProfile, signOut, isMock,
  mockHasData, mockClear, seedDummyData,
} from "./data.js";
import { escapeHtml, toast, setBusy } from "./utils.js";

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

  const mockBox = `
    <div class="dummy-box">
      <div class="dummy-tag">${isMock ? "Demo mode" : "Test data"}</div>
      <div class="dummy-row">
        <input type="number" id="dummy-count" min="1" max="100" value="10" />
        <button class="btn sm dummy-btn" id="dummy-generate">Generate</button>
      </div>
      <div class="dummy-note">
        ${isMock ? "Local only" : "Inserts into Supabase"}
      </div>
      ${isMock ? '<button class="dummy-clear" id="dummy-clear">Clear dummy data</button>' : ""}
    </div>`;

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
  if (generate) generate.addEventListener("click", () => handleGenerate(generate));

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

async function handleGenerate(button) {
  const count = Math.min(100, Math.max(1, Number(document.getElementById("dummy-count").value) || 10));

  if (isMock) {
    if (mockHasData() && !window.confirm("Dummy data already exists. Regenerate and replace it?")) return;
  } else if (!window.confirm(`Insert ${count} random student(s) into Supabase? This writes to the live database.`)) {
    return;
  }

  setBusy(button, true, "...");
  try {
    const summary = await seedDummyData(count);
    const parts = [`${summary.students} student(s)`];
    if (summary.failed) parts.push(`${summary.failed} failed course(s)`);
    if (summary.certs) parts.push(`${summary.certs} certification(s)`);
    toast(`Inserted ${parts.join(", ")}.`, "success");
    if (summary.errors && summary.errors.length) {
      toast(`${summary.errors.length} item(s) failed — ${summary.errors[0]}`, "warn");
    }
    setTimeout(() => window.location.reload(), 800);
  } catch (err) {
    toast(err.message || "Failed to generate dummy data.", "error");
    setBusy(button, false);
  }
}
