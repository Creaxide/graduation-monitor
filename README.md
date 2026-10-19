# Graduation Monitoring System (Sistem Monitoring Kelulusan Mahasiswa)

Advisor dashboard for monitoring student graduation requirements (SKS, Comserv,
SAT, Belingua, Certifications, Failed Courses) with a rule-based priority
recommendation engine.

- **Frontend:** HTML, CSS, vanilla JavaScript (ES modules, no build step)
- **Backend:** [Supabase](https://supabase.com) (PostgreSQL + Auth + REST API)

## Demo mode (no backend required)

The app ships with a browser-only **dummy data** mode so you can test the UI and
the recommendation engine immediately. Set the flag in `js/config.js`:

```js
export const USE_MOCK = true; // false -> use Supabase
```

Then serve the folder over HTTP and open it. On the login page, use one of the
demo accounts shown under **AKUN DEMO**:

| Email | Role |
|---|---|
| `dosen@binus.ac.id` | Dosen AA |
| `kaprodi@binus.ac.id` | Kaprodi |

Any password works in demo mode. After signing in, the profile in the header
reflects the chosen account (`Dosen AA` or `Kaprodi`).

On the dashboard, use **Generate dummy data** (sidebar) to create 40 randomized
students, or **+ Add student** to craft a single clear-cut case and jump
straight to its recommendation. **Clear dummy data** removes everything.

Dummy data is generated in memory and stored in `sessionStorage`, so it resets
when the tab closes. No Supabase project is needed while `USE_MOCK = true`.

The engine (`js/engine.js`) tests cleanly against the dummy set: priorities are
always returned in descending urgency order (`evaluateStudent(...).priorities`).

### Generate dummy data against Supabase

The sidebar **Generate** button also works with `USE_MOCK = false`: it creates
the chosen number of random students (with sample failed courses and
certifications) and **inserts them into Supabase** through the same API the app
uses. It reads your existing `programs`, `advisors` and `requirements` to
produce realistic gaps for the recommendation engine.

You must be signed in as a Dosen AA — the `students`/`failed_courses`/
`certifications` write policies are dosen-only (Kaprodi is read-only). The
button appends rows; it never deletes existing data.


## Features

- **Login** via Supabase Auth (campus SSO-compatible), role-aware.
- **Dashboard** — KPI summary, searchable/filterable advisee list, urgency badges.
- **Student detail** — per-category progress vs. normative semester targets,
  priority recommendations with reasons, failed-course retake plan, certifications.
- **Import / Export** — CSV/XLSX import with row-level validation report;
  CSV / Excel / PDF export with filters (angkatan, semester, urgency).
- **RBAC + RLS** — Dosen AA have full read + write (their advisees' students plus
  all master data and normative targets); Kaprodi is read-only across the
  program. There is no separate admin role.
- **Light / Dark theme** — follows the OS preference by default (like Android
  light/dark), with a sun/moon button in the header to override it manually.

## Theme (light / dark)

- Default: **follow the system** — the page renders in dark mode when the
  device/browser is set to dark, and in light mode otherwise. The choice is
  applied before the first paint, so there is no "flash" of the wrong theme.
- The sun/moon button in the header (login page and app pages) switches the
  theme manually; the manual choice is stored in `localStorage`
  (`gm-theme` = `light` | `dark`) and wins over the system preference.
- Switching the theme animates the color transition (~0.4 s) and crossfades
  the BINUS logo between `Binusian_logolightmode.png` and
  `Binusian_logodarkmode.png`.
- All colors are driven by CSS custom properties in `css/styles.css`; the dark
  palette is `#1D2432 #222835 #1B1D2A #202D46 #44464A #4C566A #6C7585 #3B82F6
  #063B2E #3E2B05 #451014`.

## Project structure

```
index.html            Login page
dashboard.html        Monitoring dashboard
students.html         Student master data
student.html          Student detail + recommendation
import-export.html    Bulk import / export + target config
css/styles.css        Design system (tokens + light/dark theme)
Binusian_logolightmode.png   Logo (light theme)
Binusian_logodarkmode.png    Logo (dark theme)
js/
  config.js           <-- USE_MOCK flag + Supabase URL/anon key
  data.js             Data access layer (auto-selects mock or Supabase)
  supabase-data.js    Supabase implementation
  mock-data.js        In-browser dummy data + generator
  dummy.js            Shared random data generator (mock + Supabase)
  errors.js           Shared DataError type
  supabase.js         Supabase client (lazy-loaded)
  engine.js           Rule-based recommendation engine
  theme.js            Light/dark/system theme manager
  ui.js               Sidebar/layout/auth guard + dummy-data buttons
  utils.js            Helpers
  dashboard.js / student.js / students.js / import-export.js
sql/
  schema.sql          Tables, RLS policies, triggers
  seed.sql            Demo data
```

## Setup (Supabase)

Set `USE_MOCK = false` in `js/config.js` first.

### 1. Create a Supabase project

Go to https://supabase.com, create a project, then open **SQL Editor** and run,
in order:

1. `sql/schema.sql`
2. `sql/seed.sql`

### 2. Configure credentials

Edit `js/config.js`:

```js
export const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR-PUBLIC-ANON-KEY";
```

Find these under **Project Settings → API**. The anon key is safe for the
browser; RLS policies enforce access control.

### 3. Create users and link roles

In **Authentication → Users → Add user**, create the two login accounts shown
in the Figma login screen:

| Email | `profiles.role` |
|---|---|
| `dosen@binus.ac.id` | `dosen_aa` |
| `kaprodi@binus.ac.id` | `kaprodi` |

In the demo/UI both accounts accept any password, against Supabase they use
real Supabase Auth passwords. A `profiles` row is created automatically per
user. Then run the matching SQL in the SQL Editor:

```sql
-- Academic Advisor (sees only their advisees)
update profiles
set role = 'dosen_aa',
    advisor_id = (select id from advisors where kode_dosen = 'D001')
where id = '<dosen-auth-user-uuid>';

-- Kaprodi (read-only, whole program)
update profiles set role = 'kaprodi' where id = '<kaprodi-auth-user-uuid>';
```

Dosen can edit the semester targets (**konfigurasi semester**) directly on the
**Import / Export** page: change the curriculum totals and the per-semester
fractions, then press **Simpan konfigurasi**. The Kaprodi view of the same
table is read-only.

### 4. Run the frontend

Because the pages load ES modules, serve them over HTTP (not `file://`):

```powershell
# From the project folder
python -m http.server 5500
# or
npx serve .
```

Then open http://localhost:5500 and sign in with the user from step 3.

## Recommendation logic

`js/engine.js` computes, for each category:

1. The **normative target** for the student's current semester (cumulative
   fraction × curriculum total, from the `requirements.targets` JSON).
2. The **gap** between target and actual achievement.
3. An **urgency score** = gap fraction ÷ remaining semesters to graduation
   (default graduation semester = 8).
4. Categories with a gap are ranked: highest urgency = **Priority 1**, etc.

Failed courses are listed separately with a recommended retake semester
(current + 1).

Targets are configurable per program in the `requirements` table and are shown
read-only on the **Import / Export** page.

### Status Belingua

Belingua is binary, so its status is derived from the status recorded on the
student — never from a "gap" like SKS or Comserv:

| `belingua_status` | Badge | Meaning |
|---|---|---|
| `lulus` | **AMAN** | finished — the only state that may be *Aman* |
| `proses` | **PERHATIAN** (or **MENDESAK** when ≤ 2 semesters left) | still in progress, not finished yet |
| `belum_ambil` + target already due | **MENDESAK** | not started while the target is already due |
| `belum_ambil` + target not due yet | **BELUM WAJIB** | not required this semester (neutral, does not affect the overall status) |

So a student can never be reported as *Aman* while the Belingua is still
running. `BELUM WAJIB` is a neutral (`info`) status: it does not downgrade the
student's overall status, but it is no longer displayed as *Aman* either.

## Notes

- Import templates are downloadable from the Import / Export page.
- The engine is advisory only (decision support); final guidance rests with the
  Academic Advisor.
- All changes can be traced via the `audit_log` table.
