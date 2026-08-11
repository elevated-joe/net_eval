# net_eval

A self-contained **network evaluation** web app — a structured intake form that
compiles the collected data into a client-presentable report. Built with
**React + TypeScript + Vite** and deployed as a static site to GitHub Pages.

## Features

- Grouped intake form covering client details, organization scale, connectivity,
  infrastructure hardware (make/model), virtualization & backup, the security
  stack, management tools, and business context — mirroring the standard
  network-assessment template.
- **Client & engagement** header (client name, prepared-by, date) that brands the
  report.
- **Compliance dropdown** (None, HIPAA, PCI-DSS, SOC 2, ISO 27001,
  NIST 800-171 / CMMC, GDPR, GLBA, FERPA, SOX, Other).
- **Repeatable ISP list** — add/remove circuits with a **+ Add ISP** button.
- **Identity & Microsoft 365** — directory model (Domain / Entra ID / Hybrid /
  Workgroup), M365 services checklist (Exchange, SharePoint, Teams, Intune, MDM,
  OneDrive), licensing, and MFA coverage.
- **Status cues** for reliable scoring — automatic failover, firewall platform
  type, overall hardware condition, backup restore/offsite verification, patch
  management, and remote-access MFA.
- **Per-section notes** captured on every section and carried into the report.
- **Photos & diagrams** — upload network diagrams, rack photos, or screenshots
  (auto-downscaled and embedded as data URLs) with optional captions; they
  appear in the client report.
- **Client Report** — a professional, client-presentable document with a cover
  header, per-section data tables, and the uploaded photos/diagrams.
- **Assessment Report** — an auto-drafted narrative assessment generated from
  the form data: an executive summary, an overall risk rating, and one result
  card **per form section**, each with a dynamic rating (Good / Attention /
  At Risk / Informational / Not Assessed), a plain-language **client-facing
  recommendation**, a technical finding, and technical action items — plus a
  risk-priorities table and next steps. Every recommendation and finding is
  **editable** (with reset-to-auto-draft) before export, and each section's
  **rating can be overridden manually** — the override rolls up into the
  overall risk rating, key focus areas, and priorities table.
- Both reports: preview in-app, **download as standalone HTML**, or
  **Print → Save as PDF**.
- **Autosave** to `localStorage`, plus **JSON export/import** (images included).
- No backend, no network calls — works offline once loaded.

> The Peace of Mind support-plan gap analysis (`src/supportPlan.ts`) is retained
> in the repo but currently unwired from the UI.

## Development

```bash
npm install
npm run dev        # start the dev server
npm run build      # type-check + production build to dist/
npm run preview    # preview the production build
```

## Deployment

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the app
and publishes `dist/` to GitHub Pages. Enable it once under
**Settings → Pages → Build and deployment → Source = GitHub Actions**.

The site is served from `/net_eval/` (the repository sub-path); this is
configured via `base` in `vite.config.ts`.

## Project layout

```
net_eval/
├── index.html
├── src/
│   ├── main.tsx        # React entry point
│   ├── App.tsx         # form + report UI
│   ├── schema.ts          # field definitions (single source of truth)
│   ├── supportPlan.ts     # Peace of Mind gap analysis (currently unwired)
│   ├── assessment.ts      # narrative assessment engine (findings + risk)
│   ├── assessmentReport.ts# assessment report HTML generator
│   ├── report.ts          # client-presentable data-report generator
│   └── styles.css
├── vite.config.ts
└── .github/workflows/deploy.yml
```
