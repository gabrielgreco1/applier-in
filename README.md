# AutoApply Local

AutoApply Local is a local-first LinkedIn job application workspace built with Next.js, Playwright, SQLite, and XLSX export support.

The app is designed to:
- collect LinkedIn job listings from a search URL
- open each job detail page
- decide whether to apply based on scoring and user configuration
- fill Easy Apply forms using saved profile data, education data, and custom answers
- export run results to XLSX
- keep run history, logs, and job metadata on the local machine

## What the app does

AutoApply Local has two main surfaces:

- `/config`: the configuration control room
- `/dashboard`: the execution workspace

The home route opens the configuration screen first, so the expected flow is:
1. configure credentials and profile data
2. paste a LinkedIn jobs search URL
3. choose how many pages to scan
4. launch the run from the dashboard

## Features

- Local configuration storage in `data/config.json`
- Local execution history and logs in SQLite (`data/applier.db`)
- LinkedIn search URL normalization, including `f_AL=true`
- Easy Apply-only launch option, enabled by default
- Hard cap of 5 pages per run to reduce account throttling risk
- Live execution log stream
- Job result summary with applied, already applied, needs info, manual, and skipped buckets
- XLSX export with summary and job sheets
- Resume, profile, education, and custom answer fields for form filling
- Basic multilingual matching for Portuguese and English questions

## Requirements

- Node.js 20 or newer
- npm
- A local Chrome/Chromium environment for Playwright
- No `.env` file is required for normal use. The app stores user settings in the local configuration panel and persists them in `data/config.json`.

## Installation

Install dependencies:

```bash
npm install
```

If the native SQLite module needs to be rebuilt on your machine, run:

```bash
npm rebuild better-sqlite3
```

## Run locally

Start the development server:

```bash
npm run dev
```

Then open:

- `http://localhost:3000/config`
- `http://localhost:3000/dashboard`

The home page also routes to the configuration screen.

## Production build

Create a production build:

```bash
npm run build
```

Run the built app:

```bash
npm run start
```

## Configuration

The app stores configuration locally in `data/config.json`.

Environment variables are optional. The repository includes `.env.example` for advanced overrides, but the default flow is entirely config-driven through the app UI.

Important fields:
- LinkedIn email and password
- OpenAI API key, if AI features are enabled
- Resume text
- Personal profile details
- Education details
- Compliance answers
- Custom keyword-based answers

### Search setup

When starting a run, provide a LinkedIn jobs search URL. The app will:
- normalize `/jobs/search-results/` to `/jobs/search/`
- force `f_AL=true`
- remove detail-state query params such as `currentJobId`, `position`, `pageNum`, `trackingId`, and `trk`

The launch modal also enforces:
- Easy Apply mode enabled by default
- a maximum of 5 pages per run
- a warning when the scan depth approaches the usual LinkedIn throttling range

### Profile matching

The profile section is used to answer common fields such as:
- first name and last name
- phone
- city, state, country
- LinkedIn URL
- portfolio / website
- years of experience
- salary fields
- notice period
- on-site acceptance preference

### Education matching

The education section is used when a job application asks for:
- school / university
- city
- degree
- major / field of study
- attendance dates

If the app reaches an education step without enough data to proceed, it cancels that step and continues the application flow instead of stalling on a partial draft.

## Dashboard

The dashboard shows:
- current run status
- processed, applied, needs info, manual, and skipped counts
- live logs
- job result buckets
- historical runs from the local machine
- export to XLSX

### Result buckets

- Applied: successfully submitted applications
- Applied Previously: jobs already marked as applied and skipped
- Needs Info: jobs that require missing data or unsupported fields
- Manual Apply: jobs that need user intervention
- Skipped: jobs rejected by filters or scoring

## Data files

The app writes local data under `data/`:
- `data/config.json` for settings
- `data/applier.db` for run history, logs, and jobs
- `data/resume.txt` if you choose to provide a text resume fallback
- `data/.linkedin_cookies.json` for saved session cookies

These files stay on the machine running the app.

## Scripts

- `npm run dev` - start the dev server
- `npm run build` - build the production app
- `npm run start` - start the production server
- `npm run lint` - run TypeScript validation

## Notes

- LinkedIn automation may violate LinkedIn terms of service.
- LinkedIn often starts throttling search runs around 50 jobs.
- This app intentionally keeps runs conservative and hard-limits search depth to 5 pages.
- Native module compatibility can depend on your local Node.js version. If `better-sqlite3` fails to load, rebuild it with `npm rebuild better-sqlite3`.

## Project layout

- `src/app` - routes and pages
- `src/components` - UI components
- `src/lib` - config, database, orchestration, export, and scoring helpers
- `src/workers` - Playwright automation worker

## License

This project is currently unpublished with no explicit license file. Add one before distributing publicly.
