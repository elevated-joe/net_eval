# net_eval

A self-contained **network evaluation** web app — a structured intake form that
compiles the collected data into an **executive summary** with automatic
observations (risks and gaps). Built with **React + TypeScript + Vite** and
deployed as a static site to GitHub Pages.

## Features

- Grouped intake form covering organization scale, connectivity, infrastructure
  hardware (make/model), virtualization & backup, the security stack, management
  tools, and business context — mirroring the standard network-assessment
  template.
- One-click **executive summary** generation, fully client-side.
- Automatic **observations**: flags single-ISP dependency, missing MFA, missing
  backups, and other common gaps.
- **Autosave** to `localStorage`, plus **JSON export/import** and
  **copy / download / print-to-PDF** of the summary.
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
│   ├── summary.ts      # executive-summary + observations generator
│   └── styles.css
├── vite.config.ts
└── .github/workflows/deploy.yml
```
