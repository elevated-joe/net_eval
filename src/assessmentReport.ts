// Assessment report generator.
//
// Renders the per-section narrative network assessment as a standalone,
// print-ready HTML document: an optional cover page, an executive summary,
// overall risk, one result card per section (client recommendation, optional
// technical detail, and any images aligned to that section), a risk-priorities
// table, and next steps. Honors manual edits in EvalData.assessmentText and the
// output options in EvalData.reportOptions.

import { type EvalData, type ReportImage } from './schema'
import { buildAssessment, effectiveText, type Rating } from './assessment'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function paras(s: string): string {
  return s
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

const has = (v: string | undefined): boolean => !!v && v.trim().length > 0
const v = (d: EvalData, k: string): string => (d.fields[k] ?? '').trim()

const pillClass: Record<Rating, string> = {
  'At Risk': 'high',
  Attention: 'medium',
  Good: 'good',
  Informational: 'info',
  'Not Assessed': 'info',
}

function figures(images: ReportImage[]): string {
  if (!images.length) return ''
  return (
    '<div class="figures">' +
    images
      .map(
        (img) =>
          `<figure><img src="${img.dataUrl}" alt="${esc(img.caption || img.name)}">` +
          (has(img.caption) ? `<figcaption>${esc(img.caption)}</figcaption>` : '') +
          '</figure>',
      )
      .join('') +
    '</div>'
  )
}

export interface AssessmentReportOptions {
  date: string
  /** Optional company logo (data URL) shown on the cover. */
  logo?: string
}

export function buildAssessmentHtml(d: EvalData, opts: AssessmentReportOptions): string {
  const a = buildAssessment(d)
  const client = has(v(d, 'clientName')) ? v(d, 'clientName') : 'Client'
  const preparedBy = v(d, 'preparedBy')
  const date = has(v(d, 'evaluationDate')) ? v(d, 'evaluationDate') : opts.date
  const logo = opts.logo?.trim() ? opts.logo : ''
  const { coverPage, techDetail } = d.reportOptions

  const exec = effectiveText(d, 'exec', a.execSummary)
  const overall = effectiveText(d, 'overall', a.overall)
  const nextSteps = effectiveText(d, 'nextSteps', a.nextSteps)

  const indicatorsHtml = a.keyIndicators.length
    ? `<p class="lead">Key areas of focus:</p><ul>${a.keyIndicators.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
    : ''

  const visibleSections = a.sections.filter((s) => !s.hidden)
  const visibleIds = new Set(visibleSections.map((s) => s.id))
  const includedImages = d.images.filter((img) => img.inAssessment)

  const sectionsHtml = visibleSections
    .map((s) => {
      const clientRec = effectiveText(d, `client__${s.id}`, s.clientRecommendation)
      const finding = effectiveText(d, `finding__${s.id}`, s.finding)
      const actions = s.actions.length
        ? `<p class="lead">Recommended actions:</p><ul>${s.actions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
        : ''
      const detail = techDetail
        ? `<div class="detail"><span class="detail-label">Technical detail</span>${paras(finding)}${actions}</div>`
        : ''
      const imgs = figures(includedImages.filter((img) => img.section === s.id))
      return (
        `<section class="domain"><h2>${esc(s.title)} <span class="pill ${pillClass[s.rating]}">${esc(s.rating)}</span></h2>` +
        `<div class="reco"><span class="reco-label">Recommendation</span>${paras(clientRec)}</div>` +
        detail +
        imgs +
        '</section>'
      )
    })
    .join('')

  const prioritiesHtml = a.priorities.length
    ? '<section><h2>Risk Priorities</h2><table class="data"><thead><tr><th>Priority</th><th>Area</th><th>Reason</th></tr></thead><tbody>' +
      a.priorities
        .map(
          (p) =>
            `<tr><td><span class="pill ${p.priority === 'High' ? 'high' : 'medium'}">${p.priority}</span></td><td>${esc(p.area)}</td><td>${esc(p.reason)}</td></tr>`,
        )
        .join('') +
      '</tbody></table></section>'
    : ''

  // Images marked for the assessment but not aligned with a visible section.
  const appendixImages = includedImages.filter((img) => !visibleIds.has(img.section))
  const appendixHtml = appendixImages.length
    ? `<section class="domain"><h2>Photos &amp; Diagrams</h2>${figures(appendixImages)}</section>`
    : ''

  const coverHtml = coverPage
    ? `<section class="cover-page">
        <div class="cover-top">
          ${logo ? `<img class="cover-logo" src="${logo}" alt="">` : ''}
          <div class="cover-bar"></div>
          <div class="cover-kicker">Network Assessment</div>
          <h1 class="cover-title">${esc(client)}</h1>
          <div class="cover-rule"></div>
        </div>
        <div class="cover-bottom">
          <div class="cover-meta">
            <div><span>Date</span>${esc(date)}</div>
            ${preparedBy ? `<div><span>Prepared by</span>${esc(preparedBy)}</div>` : ''}
          </div>
          <div class="cover-confidential">Confidential — prepared for ${esc(client)}.</div>
        </div>
      </section>`
    : `<header class="inline-head">${logo ? `<img class="cover-logo" src="${logo}" alt="">` : ''}<h1>${esc(client)}</h1><div class="meta"><span>${esc(date)}</span>${preparedBy ? `<span>Prepared by ${esc(preparedBy)}</span>` : ''}</div></header>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Network Assessment — ${esc(client)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1a2432; margin: 0; background: #f4f6f8; line-height: 1.55; }
  .page { max-width: 8.5in; margin: 0 auto; background: #fff; padding: 0.85in 0.85in 1in; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
  .cover-page { min-height: 8.5in; display: flex; flex-direction: column; justify-content: space-between; padding: 0.9in 0 0.8in; }
  .cover-logo { max-height: 84px; max-width: 320px; width: auto; height: auto; display: block; margin-bottom: 2.2rem; }
  .inline-head .cover-logo { max-height: 60px; margin-bottom: 1rem; }
  .cover-bar { height: 6px; width: 3.5in; background: #1f6feb; border-radius: 3px; margin-bottom: 2rem; }
  .cover-kicker { color: #1f6feb; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; font-size: 0.85rem; }
  .cover-title { font-size: 3rem; margin: 0.6rem 0 0; line-height: 1.05; font-weight: 700; }
  .cover-rule { height: 3px; background: #e2e8f0; margin-top: 1.4rem; }
  .cover-meta { display: flex; gap: 3rem; color: #33465a; font-size: 1rem; }
  .cover-meta span { display: block; text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.68rem; color: #8895a3; margin-bottom: 0.15rem; }
  .cover-confidential { margin-top: 1.1rem; padding-top: 0.75rem; border-top: 1px solid #e2e8f0; color: #8895a3; font-size: 0.78rem; }
  .inline-head { border-bottom: 4px solid #1f6feb; padding-bottom: 0.9rem; margin-bottom: 1.25rem; }
  .inline-head h1 { margin: 0 0 0.35rem; font-size: 2rem; }
  .inline-head .meta { display: flex; gap: 1.5rem; color: #4a5a6a; font-size: 0.9rem; }
  h2 { font-size: 1.1rem; color: #1f6feb; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.3rem; margin: 1.9rem 0 0.7rem; display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; }
  p { margin: 0 0 0.7rem; }
  .lead { font-weight: 600; margin-bottom: 0.25rem; }
  ul { margin: 0 0 0.8rem; padding-left: 1.2rem; }
  li { margin: 0.15rem 0; }
  .rating { background: #eef3f8; border-left: 4px solid #1f6feb; padding: 0.6rem 0.85rem; margin: 0.25rem 0 0.75rem; font-size: 0.95rem; }
  .reco { background: #f0f7ff; border-left: 4px solid #1f6feb; border-radius: 4px; padding: 0.6rem 0.85rem; margin: 0.35rem 0 0.6rem; }
  .reco-label, .detail-label { display: block; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; color: #1f6feb; margin-bottom: 0.25rem; }
  .detail { margin-left: 0.1rem; }
  .detail-label { color: #8895a3; }
  .detail p, .detail li { color: #4a5a6a; font-size: 0.9rem; }
  .figures { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 0.6rem 0 0.2rem; }
  .figures figure { margin: 0; flex: 1 1 45%; min-width: 220px; page-break-inside: avoid; }
  .figures img { max-width: 100%; height: auto; border: 1px solid #e2e8f0; border-radius: 6px; display: block; }
  .figures figcaption { font-size: 0.82rem; color: #4a5a6a; margin-top: 0.3rem; }
  table.data { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  table.data th, table.data td { text-align: left; padding: 0.5rem 0.65rem; border: 1px solid #e2e8f0; vertical-align: top; }
  table.data thead th { background: #eef3f8; font-weight: 700; }
  .pill { display: inline-block; font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 0.12rem 0.5rem; border-radius: 999px; }
  .pill.high { background: #fde2e1; color: #b42318; }
  .pill.medium { background: #fef0d3; color: #b25e09; }
  .pill.good { background: #d6f2e0; color: #0a6b3b; }
  .pill.info { background: #e2e8f0; color: #475569; }
  /* Remove the browser's default print header/footer (date, title, URL, page number). */
  @page { size: letter; margin: 0; }
  @media print {
    body { background: #fff; }
    .page { box-shadow: none; margin: 0; max-width: none; padding: 0.5in; }
    .cover-page { min-height: 9in; page-break-after: always; }
    section.domain { page-break-inside: avoid; }
    h2 { page-break-after: avoid; }
  }
</style>
</head>
<body>
  <div class="page">
    ${coverHtml}
    <section><h2>Executive Summary</h2>${paras(exec)}</section>
    <section><h2>Overall Risk Assessment</h2><div class="rating"><strong>Overall risk:</strong> ${esc(a.overallRating)}</div>${paras(overall)}${indicatorsHtml}</section>
    ${sectionsHtml}
    ${prioritiesHtml}
    <section><h2>Recommended Next Steps</h2>${paras(nextSteps)}</section>
    ${appendixHtml}
  </div>
</body>
</html>`
}
