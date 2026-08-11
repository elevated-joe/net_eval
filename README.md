# net_eval

A self-contained **network evaluation** web app — a structured intake form that
compiles the collected data into an **executive summary** with automatic
observations (risks and gaps). Built with **React + TypeScript + Vite** and
deployed as a static site to GitHub Pages.

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
- **Per-section notes** captured on every section and carried into the report.
- **Support Plan Gap Analysis** — maps the client's current-state answers
  against the Elevated MSP **Peace of Mind** plan (Co-Managed / Remote /
  Standard / Enterprise), flags missing managed controls (EDR, MFA, email
  security, training, backups), lists resilience/best-practice notes, and
  suggests a starting plan tier.
- **Client Report** — a professional, client-presentable document with a cover
  header, per-section data tables, and the Peace of Mind gap analysis. Preview
  it in-app, **download as standalone HTML**, or **Print → Save as PDF**.
- **Autosave** to `localStorage`, plus **JSON export/import**.
- No backend, no network calls — works offline once loaded.

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
│   ├── App.tsx         # form + summary UI
│   ├── schema.ts       # field definitions (single source of truth)
│   ├── supportPlan.ts  # Peace of Mind support-plan gap analysis
│   ├── report.ts       # client-presentable HTML report generator
│   └── styles.css
├── vite.config.ts
└── .github/workflows/deploy.yml
```
