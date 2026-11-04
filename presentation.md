# Graduation Monitoring System - Presentation

## Project Overview

**Sistem Monitoring Kelulusan Mahasiswa** (Graduation Monitoring System)

An academic advisor dashboard for monitoring student graduation requirements including SKS, Comserv, SAT, Beelingua, and Certifications with a rule-based priority recommendation engine.

---

## Technology Stack

- **Frontend:** HTML, CSS, vanilla JavaScript (ES modules, no build step)
- **Backend:** Supabase (PostgreSQL + Auth + REST API)
- **Database:** PostgreSQL with RLS (Row Level Security) policies
- **Theme:** Light/dark mode following system preference, with manual override

---

## Key Features

### 1. Authentication & Authorization
- Login via Supabase Auth with role-aware access (email + password)
- Roles: `dosen_aa` (Academic Advisor - full read + write), `kaprodi` (Program Chair - read-only)
- `pending` role for new accounts until admin grants access

### 2. Dashboard
- KPI summary cards (Total students, At-risk, Needs attention, Safe students)
- Searchable/filterable advisee list
- Sortable columns (NIM, name, semester, all requirement categories)
- Bulk "nonaktifkan/aktifkan" for students no longer monitored
- Inactive students remain in list (dimmed, labeled NONAKTIF, sorted last)

### 3. Student Detail Page
- Per-category progress vs. normative semester targets
- Priority recommendations with reasons
- Failed-course retake plan (current semester + 1)
- Certifications overview

### 4. Import/Export
- CSV/XLSX import with row-level validation report
- CSV / Excel / PDF export with filters (angkatan, semester, urgency)
- Configurable semester targets (Dosen can edit on Import/Export page)
- Target configuration stored in `requirements` table

### 5. Theme System
- Default: follows OS preference (no "flash" of wrong theme)
- Manual switch via sun/moon button (stored in `localStorage`)
- BINUS logo crossfade between light/dark modes
- All colors driven by CSS custom properties in `css/styles.css`

### 6. Recommendation Engine
Computes for each category:
1. **Normative target** = cumulative fraction × curriculum total
2. **Gap** = target vs. actual achievement
3. **Urgency score** = gap fraction ÷ remaining semesters to graduation (default: 8)
4. Categories ranked by urgency: highest = Priority 1

**Beelingua status:**
- `lulus` → AMAN (finished)
- `proses` → PERHATIAN (or MENDESAK when ≤ 2 semesters left)
- `belum_ambil` + target due → MENDESAK
- `belum_ambil` + target not due → BELUM WAJIB

---

## Project Structure

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
  config.js           Supabase URL/anon key
  data.js             Data access layer
  supabase-data.js    Supabase implementation
  errors.js           Shared DataError type
  supabase.js         Supabase client (lazy-loaded)
  engine.js           Rule-based recommendation engine
  theme.js            Light/dark/system theme manager
  ui.js               Layout/header/auth guard
  utils.js            Helpers
  dashboard.js / student.js / students.js / import-export.js
sql/
  schema.sql          Tables, RLS policies, triggers (role 'pending' + trigger handle_new_user)
  seed.sql            Demo data
```

---

## Setup Requirements

1. Create Supabase project and run `sql/schema.sql` then `sql/seed.sql`
2. Configure credentials in `js/config.js`
3. Create users and link roles in Supabase Auth
4. Serve over HTTP (not `file://`): `python -m http.server 5500` or `npx serve .`

---

## Login Accounts

| Email | Role |
|-------|------|
| `dosen@binus.ac.id` | `dosen_aa` |
| `kaprodi@binus.ac.id` | `kaprodi` |

---

## Theme Colors

- **Light palette:** `#F8F9FA #E9ecef #dee2e6 #6c7576 #adb5bd #ced4da #adb5bd #6c7576 #3b82f6 #063b2e #3e2b05 #451014`
- **Dark palette:** `#1D2432 #222835 #1B1D2A #202D46 #44464A #4C566A #6C7585 #3B82F6 #063B2E #3E2B05 #451014`

---

## Recommendation Logic

For each category:
1. Normative target for student's current semester
2. Gap between target and actual achievement
3. Urgency score = gap fraction ÷ remaining semesters to graduation
4. Categories ranked: highest urgency = Priority 1

Failed courses listed with recommended retake semester (current + 1).

Targets configurable per program in `requirements` table.

---

## Notes

- Database created before "alasan nonaktif" feature must run `sql/fix_deactivate_columns.sql` once
- Import templates downloadable from Import/Export page
- Engine is advisory only; final guidance rests with Academic Advisor
- All changes traceable via `audit_log` table