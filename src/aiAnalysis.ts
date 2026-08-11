// Optional AI-powered assessment analysis.
//
// Sends the full intake data (including free-text notes) to the Anthropic
// Messages API directly from the browser and returns override text for the
// assessment blocks. This genuinely "reads" everything and correlates answers
// with notes, unlike the rule-based engine. It is opt-in: the user supplies
// their own API key, and requests are made client-side.
//
// The result is written into the same override keys the manual editor uses
// (exec, overall, nextSteps, client__<id>, finding__<id>, rating__<id>), so
// AI output stays editable and resettable like any manual edit.

import { SECTIONS, notesKey, parseChecklist, type EvalData } from './schema'
import { RATINGS, isRating } from './assessment'

export const AI_MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5 (most capable)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (balanced)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (fastest / cheapest)' },
]

const SECTION_IDS = ['identity', 'connectivity', 'hardware', 'platform', 'security', 'tools', 'organization']

export interface AiConfig {
  apiKey: string
  model: string
}

/** Build a compact JSON view of the intake for the model. */
function intakeSnapshot(d: EvalData): unknown {
  const fields: Record<string, string> = {}
  for (const [k, v] of Object.entries(d.fields)) {
    if (v && v.trim()) fields[k] = v.trim()
  }
  const notes: Record<string, string> = {}
  for (const s of SECTIONS) {
    const n = (d.fields[notesKey(s.id)] ?? '').trim()
    if (n) notes[s.id] = n
  }
  return {
    fields,
    m365Services: parseChecklist(d.fields.m365Services),
    isps: d.isps.filter((i) => i.provider.trim() || i.speed.trim()),
    notes,
  }
}

function buildPrompt(d: EvalData): string {
  const snapshot = JSON.stringify(intakeSnapshot(d), null, 2)
  return `You are a senior network assessor at a managed IT services provider (MSP). Analyze the following network evaluation intake data and produce a client-facing network assessment.

Read everything, including the free-text notes, and correlate answers across sections:
- If a section's notes mention a security incident or event (e.g. phishing/spoofing, ransomware, breach, outage, data loss), reflect it in that section's finding, recommendation, and rating.
- Consider how gaps combine. For example, "None" for end-user training together with a recent spoofing incident in the notes is a high-priority exposure and should be rated "At Risk" with a recommendation that connects the two.

For each section, produce:
- "rating": exactly one of ${RATINGS.map((r) => `"${r}"`).join(', ')}
- "clientRecommendation": 1-3 sentences, plain language for a non-technical client, written in the MSP's voice ("we recommend...")
- "finding": 1-3 sentences of supporting technical detail

Also produce:
- "execSummary": 1-2 short paragraphs
- "overall": 1 short paragraph on the overall risk posture
- "nextSteps": 1 short paragraph on recommended next steps

Use these exact section ids: ${SECTION_IDS.join(', ')}.

Intake data (JSON):
${snapshot}

Respond with ONLY a JSON object (no markdown, no code fences) of this exact shape:
{"execSummary":"...","overall":"...","nextSteps":"...","sections":[{"id":"identity","rating":"...","clientRecommendation":"...","finding":"..."}]}`
}

/** Extract the first balanced JSON object from a string. */
function extractJson(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (c === '\\') {
      escape = true
      continue
    }
    if (c === '"') inString = !inString
    else if (!inString) {
      if (c === '{') depth++
      else if (c === '}') {
        depth--
        if (depth === 0) return text.slice(start, i + 1)
      }
    }
  }
  return null
}

interface AiResponse {
  execSummary?: string
  overall?: string
  nextSteps?: string
  sections?: Array<{ id?: string; rating?: string; clientRecommendation?: string; finding?: string }>
}

/**
 * Run the AI analysis. Returns a map of override block ids -> text, suitable
 * for merging into EvalData.assessmentText. Throws with a readable message on
 * any failure.
 */
export async function runAiAnalysis(d: EvalData, cfg: AiConfig): Promise<Record<string, string>> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 8000,
      output_config: { effort: 'low' },
      system:
        'You are a precise network-assessment assistant. You always respond with a single valid JSON object and nothing else.',
      messages: [{ role: 'user', content: buildPrompt(d) }],
    }),
  })

  if (!res.ok) {
    let detail = ''
    try {
      const err = await res.json()
      detail = err?.error?.message ? `: ${err.error.message}` : ''
    } catch {
      /* ignore */
    }
    if (res.status === 401) throw new Error('Invalid API key (401). Check your Anthropic API key.')
    if (res.status === 429) throw new Error('Rate limited (429). Wait a moment and try again.')
    throw new Error(`API request failed (${res.status})${detail}`)
  }

  const payload = await res.json()
  if (payload.stop_reason === 'refusal') {
    throw new Error('The model declined to complete this request.')
  }
  const text: string = (payload.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('')
    .trim()

  const jsonStr = extractJson(text)
  if (!jsonStr) throw new Error('Could not parse a JSON response from the model.')

  let parsed: AiResponse
  try {
    parsed = JSON.parse(jsonStr) as AiResponse
  } catch {
    throw new Error('The model returned malformed JSON.')
  }

  const overrides: Record<string, string> = {}
  if (typeof parsed.execSummary === 'string' && parsed.execSummary.trim()) overrides.exec = parsed.execSummary.trim()
  if (typeof parsed.overall === 'string' && parsed.overall.trim()) overrides.overall = parsed.overall.trim()
  if (typeof parsed.nextSteps === 'string' && parsed.nextSteps.trim()) overrides.nextSteps = parsed.nextSteps.trim()

  for (const s of parsed.sections ?? []) {
    if (!s || !s.id || !SECTION_IDS.includes(s.id)) continue
    if (typeof s.clientRecommendation === 'string' && s.clientRecommendation.trim()) {
      overrides[`client__${s.id}`] = s.clientRecommendation.trim()
    }
    if (typeof s.finding === 'string' && s.finding.trim()) {
      overrides[`finding__${s.id}`] = s.finding.trim()
    }
    if (typeof s.rating === 'string' && isRating(s.rating.trim())) {
      overrides[`rating__${s.id}`] = s.rating.trim()
    }
  }

  if (Object.keys(overrides).length === 0) {
    throw new Error('The model response did not contain any usable assessment content.')
  }
  return overrides
}
