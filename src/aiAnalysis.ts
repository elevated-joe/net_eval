// Optional AI-powered assessment analysis.
//
// Output follows the same voice rules as the rule-based engine in
// assessment.ts: impersonal third person, no "you"/"we", and no steer toward
// any particular service plan or engagement model. Because a prompt alone is
// a request and not a guarantee, generated text is checked against those rules
// and sent back for one rewrite pass when it drifts; anything still off is
// reported to the analyst so it can be corrected before the report goes out.
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
import { ASSESSMENT_SECTIONS, RATINGS, isRating } from './assessment'

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

export interface AiAnalysisResult {
  /** Block id -> text, ready to merge into EvalData.assessmentText. */
  overrides: Record<string, string>
  /** Human-readable block labels whose wording still breaks the voice rules. */
  warnings: string[]
}

/**
 * The voice contract. Repeated in the system prompt, at the end of the main
 * prompt, and in the repair prompt — the models follow it far more reliably
 * when it appears in all three places with worked examples.
 */
const VOICE_RULES = `VOICE RULES — these outrank every other instruction. The finished report is presented to a room of people, so copy that addresses the reader singles out whoever answered the intake questions.

1. Third person only. Never write "you", "your", "yours", "we", "our" or "us". Describe the environment, not the reader.
   - Wrong: "Your internet service appears to be a single connection."  Right: "Internet service appears to run on a single connection."
   - Wrong: "Your network gear is standardized on Sophos."              Right: "Network equipment is standardized on Sophos."
2. Never speak as the assessor and never name the assessing company or person. Phrase advice as "Reviewing the Comcast circuit is recommended", "Adding a UPS would ...", or "PoE injectors should be replaced ..." — never "we recommend ..." or "we noted ...".
   - Wrong: "We recommend reviewing your Comcast circuit."              Right: "Reviewing the Comcast circuit is recommended."
3. Never name or imply a service plan, support tier, engagement model or provider — no "co-managed", "fully managed", "managed services", "support plan", "MSP" or "outsourced IT". Recommend technical outcomes and controls only.
4. State what was observed without assigning blame for a gap.`

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
  return `You are a senior network assessor. Analyze the following network evaluation intake data and produce a vendor-neutral, client-facing network assessment.

Read everything, including the free-text notes, and correlate answers across sections:
- If a section's notes mention a security incident or event (e.g. phishing/spoofing, ransomware, breach, outage, data loss), reflect it in that section's finding, recommendation, and rating.
- Consider how gaps combine. For example, "None" for end-user training together with a recent spoofing incident in the notes is a high-priority exposure and should be rated "At Risk" with a recommendation that connects the two.

For each section, produce:
- "rating": exactly one of ${RATINGS.map((r) => `"${r}"`).join(', ')}
- "clientRecommendation": 1-3 sentences, plain language for a non-technical reader
- "finding": 1-3 sentences of supporting technical detail

Also produce:
- "execSummary": 1-2 short paragraphs
- "overall": 1 short paragraph on the overall risk posture
- "nextSteps": 1 short paragraph on recommended next steps

Use these exact section ids: ${SECTION_IDS.join(', ')}.

Intake data (JSON):
${snapshot}

${VOICE_RULES}

Before you answer, re-read every sentence you have written and remove any "you", "your", "we", "our" or service-plan wording.

Respond with ONLY a JSON object (no markdown, no code fences) of this exact shape:
{"execSummary":"...","overall":"...","nextSteps":"...","sections":[{"id":"identity","rating":"...","clientRecommendation":"...","finding":"..."}]}`
}

// ---------------------------------------------------------------------------
// Voice enforcement
// ---------------------------------------------------------------------------

const BANNED_VOICE: Array<{ re: RegExp; label: string }> = [
  { re: /\b(you|your|yours)\b/i, label: 'second person ("you"/"your")' },
  { re: /\b(we|our|ours)\b/i, label: 'first person ("we"/"our")' },
  { re: /\bco-?\s?managed\b/i, label: 'plan wording ("co-managed")' },
  { re: /\bfully[- ]managed\b/i, label: 'plan wording ("fully managed")' },
  { re: /\bmanaged services?\b/i, label: 'plan wording ("managed services")' },
  { re: /\bpeace of mind\b/i, label: 'plan name ("Peace of Mind")' },
  { re: /\b(service|support)\s+(plan|tier|agreement)\b/i, label: 'plan wording ("support plan"/"service tier")' },
  { re: /\bmsps?\b/i, label: '"MSP"' },
  { re: /\boutsourced\b/i, label: '"outsourced"' },
]

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Rule names this text breaks, or [] when the voice is clean. */
export function voiceIssues(text: string, assessor: string): string[] {
  const found = BANNED_VOICE.filter(({ re }) => re.test(text)).map(({ label }) => label)
  // The assessor's own name belongs on the cover, not in the findings.
  if (assessor.length >= 3 && new RegExp(`\\b${escapeRe(assessor)}\\b`, 'i').test(text)) {
    found.push(`the assessor's name ("${assessor}")`)
  }
  return [...new Set(found)]
}

/** Human label for an override block id, for the analyst-facing warning. */
function blockLabel(id: string): string {
  if (id === 'exec') return 'Executive Summary'
  if (id === 'overall') return 'Overall Risk Assessment'
  if (id === 'nextSteps') return 'Recommended Next Steps'
  const [kind, sectionId] = id.split('__')
  const title = ASSESSMENT_SECTIONS.find((s) => s.id === sectionId)?.title ?? sectionId
  return `${title} (${kind === 'client' ? 'recommendation' : 'technical detail'})`
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** One Messages API call returning concatenated text, with readable errors. */
async function callModel(cfg: AiConfig, system: string, user: string, maxTokens: number): Promise<string> {
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
      max_tokens: maxTokens,
      output_config: { effort: 'low' },
      system,
      messages: [{ role: 'user', content: user }],
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
  return ((payload.content ?? []) as Array<{ type: string; text: string }>)
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
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
 * Ask the model to rewrite the passages that broke the voice rules, keeping
 * every fact and recommendation. Returns block id -> rewritten text for
 * whatever came back parseable.
 */
async function repairVoice(offending: Record<string, string>, cfg: AiConfig): Promise<Record<string, string>> {
  const items = Object.entries(offending)
    .map(([id, text]) => `${JSON.stringify(id)}: ${JSON.stringify(text)}`)
    .join(',\n')
  const prompt = `The passages below come from a network assessment report and break its voice rules.

${VOICE_RULES}

Rewrite each passage so it follows the rules. Keep every fact, product name, number and recommendation exactly as it is — change only how it is phrased. Keep each rewrite the same length or shorter.

Passages (JSON object of id -> text):
{
${items}
}

Respond with ONLY a JSON object mapping each id to its rewritten text, no markdown and no code fences.`

  const text = await callModel(cfg, `You rewrite report copy into a neutral third-person voice. You always respond with a single valid JSON object and nothing else.\n\n${VOICE_RULES}`, prompt, 4000)
  const jsonStr = extractJson(text)
  if (!jsonStr) return {}
  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [id, value] of Object.entries(parsed)) {
      if (id in offending && typeof value === 'string' && value.trim()) out[id] = value.trim()
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Run the AI analysis. Returns override text suitable for merging into
 * EvalData.assessmentText, plus warnings for any block whose wording still
 * breaks the voice rules after one repair pass. Throws with a readable
 * message on any failure.
 */
export async function runAiAnalysis(d: EvalData, cfg: AiConfig): Promise<AiAnalysisResult> {
  const text = await callModel(
    cfg,
    `You are a precise network-assessment assistant. You always respond with a single valid JSON object and nothing else.\n\n${VOICE_RULES}`,
    buildPrompt(d),
    8000,
  )

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

  // Enforce the voice rules rather than trusting the prompt: anything that
  // drifted goes back for one rewrite, and a rewrite is only accepted when it
  // is genuinely cleaner than what it replaces.
  const assessor = (d.fields.preparedBy ?? '').trim()
  const prose = (id: string): boolean => !id.startsWith('rating__')
  const offending: Record<string, string> = {}
  for (const [id, value] of Object.entries(overrides)) {
    if (prose(id) && voiceIssues(value, assessor).length) offending[id] = value
  }

  if (Object.keys(offending).length) {
    try {
      const repaired = await repairVoice(offending, cfg)
      for (const [id, value] of Object.entries(repaired)) {
        if (voiceIssues(value, assessor).length < voiceIssues(offending[id], assessor).length) {
          overrides[id] = value
        }
      }
    } catch {
      // Keep the first-pass text; the warnings below tell the analyst what to fix.
    }
  }

  const warnings = Object.keys(overrides)
    .filter((id) => prose(id) && voiceIssues(overrides[id], assessor).length)
    .map(blockLabel)

  return { overrides, warnings }
}
