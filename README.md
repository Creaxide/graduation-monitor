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

Then serve the folder over HTTP and open it. Any password works. On the
dashboard, use **Generate dummy data** (sidebar) to create 40 randomized
students, or **+ Add student** to craft a single clear-cut case and jump
straight to its recommendation. **Clear dummy data** removes everything.

Dummy data is generated in memory and stored in `sessionStorage`, so it resets
when the tab closes. No Supabase project is needed while `USE_MOCK = true`.

The engine (`js/engine.js`) tests cleanly against the dummy set: priorities are
always returned in descending urgency order (`evaluateStudent(...).priorities`).

## Features

- **Login** via Supabase Auth (campus SSO-compatible), role-aware.
- **Dashboard** — KPI summary, searchable/filterable advisee list, urgency badges.
- **Student detail** — per-category progress vs. normative semester targets,
  priority recommendations with reasons, failed-course retake plan, certifications.
- **Import / Export** — CSV/XLSX import with row-level validation report;
  CSV / Excel / PDF export with filters (angkatan, semester, urgency).
- **RBAC + RLS** — Academic Advisors see only their advisees; admins manage
  master data and normative targets; Kaprodi (read-only) sees the whole program.

## Project structure

```
index.html            Login page
dashboard.html        Monitoring dashboard
students.html         Student master data
student.html          Student detail + recommendation
import-export.html    Bulk import / export + target config
css/styles.css        Design system
js/
  config.js           <-- USE_MOCK flag + Supabase URL/anon key
  data.js             Data access layer (auto-selects mock or Supabase)
  supabase-data.js    Supabase implementation
  mock-data.js        In-browser dummy data + generator
  errors.js           Shared DataError type
  supabase.js         Supabase client (lazy-loaded)
  engine.js           Rule-based recommendation engine
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

In **Authentication → Users → Add user**, create a user (e.g.
`aad001@binus.ac.id`). A `profiles` row is created automatically. Then run the
matching SQL in the SQL Editor:

```sql
-- Academic Advisor (sees only their advisees)
update profiles
set role = 'dosen_aa',
    advisor_id = (select id from advisors where kode_dosen = 'D001')
where id = '<auth-user-uuid>';

-- Admin akademik (full access)
update profiles set role = 'admin' where id = '<admin-uuid>';

-- Kaprodi (read-only, whole program)
update profiles set role = 'kaprodi' where id = '<kaprodi-uuid>';
```

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

## Notes

- Import templates are downloadable from the Import / Export page.
- The engine is advisory only (decision support); final guidance rests with the
  Academic Advisor.
- All changes can be traced via the `audit_log` table.
