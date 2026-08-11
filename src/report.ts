// Client-presentable report generator.
//
// Produces a complete, standalone HTML document (inline styles, print-optimized
// for US Letter) that presents the evaluation data professionally: a cover
// header, per-section data tables, and any uploaded photos/diagrams. The same
// HTML is used for on-screen preview, download, and Print → Save as PDF, so
// what you see is what you send.

import { activeIsps, SECTIONS, notesKey, type EvalData } from './schema'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const has = (v: string | undefined): boolean => !!v && v.trim().length > 0
const val = (d: EvalData, k: string): string => (d.fields[k] ?? '').trim()

/** Rows of [label, value] for a section's scalar fields that are filled in. */
function sectionRows(d: EvalData, sectionId: string): Array<[string, string]> {
  const section = SECTIONS.find((s) => s.id === sectionId)
  if (!section) return []
  const rows: Array<[string, string]> = []
  for (const f of section.fields) {
    if (f.key === 'clientName' || f.key === 'preparedBy' || f.key === 'evaluationDate') continue
    const v = val(d, f.key)
    if (has(v)) rows.push([f.label, v])
  }
  return rows
}

function tableHtml(rows: Array<[string, string]>): string {
  return (
    '<table class="data"><tbody>' +
    rows
      .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v).replace(/\n/g, '<br>')}</td></tr>`)
      .join('') +
    '</tbody></table>'
  )
}

export interface ReportOptions {
  /** Formatted date string to stamp on the report (caller supplies today's date). */
  date: string
}

export function buildReportHtml(d: EvalData, opts: ReportOptions): string {
  const client = has(val(d, 'clientName')) ? val(d, 'clientName') : 'Client'
  const preparedBy = val(d, 'preparedBy')
  const date = has(val(d, 'evaluationDate')) ? val(d, 'evaluationDate') : opts.date

  const blocks: string[] = []

  for (const section of SECTIONS) {
    const parts: string[] = []

    if (section.isp) {
      const isps = activeIsps(d)
      if (isps.length) {
        const rows =
          '<table class="data"><thead><tr><th>#</th><th>Provider</th><th>Speed</th></tr></thead><tbody>' +
          isps
            .map(
              (i, idx) =>
                `<tr><td>${idx + 1}</td><td>${esc(i.provider) || '&mdash;'}</td><td>${esc(i.speed) || '&mdash;'}</td></tr>`,
            )
            .join('') +
          '</tbody></table>'
        parts.push(rows)
      }
    } else {
      const rows = sectionRows(d, section.id)
      if (rows.length) parts.push(tableHtml(rows))
    }

    // Section notes
    if (section.notes) {
      const note = val(d, notesKey(section.id))
      if (has(note)) parts.push(`<p class="note"><strong>Notes:</strong> ${esc(note).replace(/\n/g, '<br>')}</p>`)
    }

    if (parts.length) {
      blocks.push(`<section><h2>${esc(section.title)}</h2>${parts.join('')}</section>`)
    }
  }

  // Photos & diagrams
  let imagesHtml = ''
  if (d.images.length) {
    imagesHtml =
      '<section class="images"><h2>Photos &amp; Diagrams</h2>' +
      d.images
        .map(
          (img) =>
            `<figure><img src="${img.dataUrl}" alt="${esc(img.caption || img.name)}">` +
            (has(img.caption) ? `<figcaption>${esc(img.caption)}</figcaption>` : '') +
            '</figure>',
        )
        .join('') +
      '</section>'
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Network Evaluation — ${esc(client)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1a2432; margin: 0; background: #f4f6f8; line-height: 1.5;
  }
  .page {
    max-width: 8.5in; margin: 0 auto; background: #fff; padding: 0.85in 0.85in 1in;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  }
  .cover { border-bottom: 4px solid #1f6feb; padding-bottom: 1rem; margin-bottom: 1.5rem; }
  .cover .eyebrow { color: #1f6feb; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; font-size: 0.72rem; margin: 0; }
  .cover h1 { margin: 0.35rem 0 0.75rem; font-size: 2rem; }
  .cover .meta { display: flex; flex-wrap: wrap; gap: 0.35rem 2rem; color: #4a5a6a; font-size: 0.9rem; }
  .cover .meta div span { color: #8895a3; }
  h2 {
    font-size: 1.05rem; color: #1f6feb; border-bottom: 1px solid #e2e8f0;
    padding-bottom: 0.3rem; margin: 1.75rem 0 0.75rem;
  }
  table.data { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  table.data th, table.data td {
    text-align: left; padding: 0.5rem 0.65rem; border: 1px solid #e2e8f0; vertical-align: top;
  }
  table.data tbody th { width: 38%; background: #f7f9fb; font-weight: 600; color: #33465a; }
  table.data thead th { background: #eef3f8; font-weight: 700; }
  .note { font-size: 0.88rem; color: #4a5a6a; margin: 0.6rem 0 0; padding: 0.55rem 0.7rem; background: #f7f9fb; border-left: 3px solid #cbd5e1; }
  .pill { display: inline-block; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 0.12rem 0.5rem; border-radius: 999px; }
  .images figure { margin: 0 0 1.1rem; page-break-inside: avoid; }
  .images img { max-width: 100%; height: auto; border: 1px solid #e2e8f0; border-radius: 6px; display: block; }
  .images figcaption { font-size: 0.82rem; color: #4a5a6a; margin-top: 0.35rem; }
  footer { margin-top: 2rem; padding-top: 0.75rem; border-top: 1px solid #e2e8f0; color: #8895a3; font-size: 0.75rem; text-align: center; }
  /* Remove the browser's default print header/footer (date, title, URL, page number). */
  @page { size: letter; margin: 0; }
  @media print {
    body { background: #fff; }
    .page { box-shadow: none; margin: 0; max-width: none; padding: 0.5in; }
    section { page-break-inside: avoid; }
    h2 { page-break-after: avoid; }
    .images figure { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="page">
    <header class="cover">
      <p class="eyebrow">Network Evaluation</p>
      <h1>${esc(client)}</h1>
      <div class="meta">
        <div><span>Date:</span> ${esc(date)}</div>
        ${preparedBy ? `<div><span>Prepared by:</span> ${esc(preparedBy)}</div>` : ''}
      </div>
    </header>
    ${blocks.join('\n')}
    ${imagesHtml}
    <footer>Confidential — prepared for ${esc(client)}. Generated by the Network Evaluation tool.</footer>
  </div>
</body>
</html>`
}
