// Assessment report generator.
//
// Renders the per-section narrative network assessment (executive summary,
// overall risk, one result card per section with a rating, a client-facing
// recommendation, a technical finding and actions, a risk-priorities table,
// and next steps) as a standalone, print-ready HTML document. Honors manual
// edits stored in EvalData.assessmentText.

import { type EvalData } from './schema'
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

export interface AssessmentReportOptions {
  date: string
}

export function buildAssessmentHtml(d: EvalData, opts: AssessmentReportOptions): string {
  const a = buildAssessment(d)
  const client = has(v(d, 'clientName')) ? v(d, 'clientName') : 'Client'
  const preparedBy = v(d, 'preparedBy')
  const date = has(v(d, 'evaluationDate')) ? v(d, 'evaluationDate') : opts.date

  const exec = effectiveText(d, 'exec', a.execSummary)
  const overall = effectiveText(d, 'overall', a.overall)
  const nextSteps = effectiveText(d, 'nextSteps', a.nextSteps)

  const indicatorsHtml = a.keyIndicators.length
    ? `<p class="lead">Key areas of focus:</p><ul>${a.keyIndicators.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
    : ''

  const sectionsHtml = a.sections
    .map((s) => {
      const finding = effectiveText(d, `finding__${s.id}`, s.finding)
      const client = effectiveText(d, `client__${s.id}`, s.clientRecommendation)
      const actions = s.actions.length
        ? `<p class="lead">Recommended actions:</p><ul>${s.actions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
        : ''
      return (
        `<section class="domain"><h2>${esc(s.title)} <span class="pill ${pillClass[s.rating]}">${esc(s.rating)}</span></h2>` +
        `<div class="reco"><span class="reco-label">Recommendation</span>${paras(client)}</div>` +
        `<div class="detail"><span class="detail-label">Technical detail</span>${paras(finding)}${actions}</div>` +
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
  .cover { border-bottom: 4px solid #1f6feb; padding-bottom: 1rem; margin-bottom: 1.25rem; }
  .cover .eyebrow { color: #1f6feb; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; font-size: 0.72rem; margin: 0; }
  .cover h1 { margin: 0.35rem 0 0.75rem; font-size: 2rem; }
  .cover .meta { display: flex; flex-wrap: wrap; gap: 0.35rem 2rem; color: #4a5a6a; font-size: 0.9rem; }
  .cover .meta div span { color: #8895a3; }
  h2 { font-size: 1.1rem; color: #1f6feb; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.3rem; margin: 1.6rem 0 0.6rem; display: flex; align-items: center; gap: 0.6rem; }
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
  table.data { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  table.data th, table.data td { text-align: left; padding: 0.5rem 0.65rem; border: 1px solid #e2e8f0; vertical-align: top; }
  table.data thead th { background: #eef3f8; font-weight: 700; }
  .pill { display: inline-block; font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 0.12rem 0.5rem; border-radius: 999px; }
  .pill.high { background: #fde2e1; color: #b42318; }
  .pill.medium { background: #fef0d3; color: #b25e09; }
  .pill.good { background: #d6f2e0; color: #0a6b3b; }
  .pill.info { background: #e2e8f0; color: #475569; }
  footer { margin-top: 2rem; padding-top: 0.75rem; border-top: 1px solid #e2e8f0; color: #8895a3; font-size: 0.75rem; text-align: center; }
  @media print {
    body { background: #fff; }
    .page { box-shadow: none; margin: 0; max-width: none; padding: 0.5in; }
    section.domain { page-break-inside: avoid; }
    h2 { page-break-after: avoid; }
  }
</style>
</head>
<body>
  <div class="page">
    <header class="cover">
      <p class="eyebrow">Network Assessment</p>
      <h1>${esc(client)}</h1>
      <div class="meta">
        <div><span>Date:</span> ${esc(date)}</div>
        ${preparedBy ? `<div><span>Prepared by:</span> ${esc(preparedBy)}</div>` : ''}
      </div>
    </header>

    <section><h2>Executive Summary</h2>${paras(exec)}</section>
    <section><h2>Overall Risk Assessment</h2><div class="rating"><strong>Overall risk:</strong> ${esc(a.overallRating)}</div>${paras(overall)}${indicatorsHtml}</section>
    ${sectionsHtml}
    ${prioritiesHtml}
    <section><h2>Recommended Next Steps</h2>${paras(nextSteps)}</section>

    <footer>Confidential — prepared for ${esc(client)}. Generated by the Network Evaluation tool.</footer>
  </div>
</body>
</html>`
}
