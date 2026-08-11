// Executive-summary generator.
//
// Turns the intake data into a readable, plain-text executive summary and a set
// of observations. All logic is client-side and rule-based — no network calls —
// so the app works fully offline as a static page.

import type { EvalData } from './schema'

export interface Observation {
  severity: 'risk' | 'gap' | 'note'
  text: string
}

const has = (v: string | undefined): boolean => !!v && v.trim().length > 0
const val = (d: EvalData, k: string): string => (d.fields[k] ?? '').trim()

/** ISP entries that have at least a provider or a speed filled in. */
export function activeIsps(d: EvalData): { provider: string; speed: string }[] {
  return d.isps.filter((i) => has(i.provider) || has(i.speed))
}

/** Human-friendly join: ["a","b","c"] -> "a, b, and c". */
function list(items: string[]): string {
  const parts = items.filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
}

const hasCompliance = (d: EvalData): boolean => {
  const c = val(d, 'compliance')
  return has(c) && c !== 'None'
}

export function buildObservations(d: EvalData): Observation[] {
  const obs: Observation[] = []

  if (activeIsps(d).length <= 1) {
    obs.push({
      severity: 'risk',
      text: 'Single internet circuit is a single point of failure. Consider a secondary provider or failover circuit for resilience.',
    })
  }

  if (!has(val(d, 'mfa'))) {
    obs.push({
      severity: 'risk',
      text: 'No multi-factor authentication (MFA) solution recorded. MFA is a baseline control against credential-based attacks.',
    })
  }
  if (!has(val(d, 'backup'))) {
    obs.push({
      severity: 'risk',
      text: 'No backup solution recorded. Verify backups exist, are tested, and follow a 3-2-1 strategy.',
    })
  }
  if (!has(val(d, 'firewall'))) {
    obs.push({ severity: 'risk', text: 'No firewall recorded. Perimeter security should be confirmed.' })
  }
  if (!has(val(d, 'av'))) {
    obs.push({ severity: 'gap', text: 'No endpoint / antivirus solution recorded.' })
  }
  if (!has(val(d, 'training'))) {
    obs.push({ severity: 'gap', text: 'No end-user security awareness training recorded.' })
  }
  if (!has(val(d, 'spam'))) {
    obs.push({ severity: 'gap', text: 'No email spam / phishing filtering recorded.' })
  }
  if (!has(val(d, 'contentFilter'))) {
    obs.push({ severity: 'gap', text: 'No DNS / content filtering recorded.' })
  }
  if (!has(val(d, 'ups'))) {
    obs.push({ severity: 'gap', text: 'No UPS recorded. Confirm power protection for critical equipment.' })
  }
  if (hasCompliance(d)) {
    obs.push({
      severity: 'note',
      text: `Environment is subject to ${val(d, 'compliance')} requirements; controls should be mapped against that framework.`,
    })
  }

  return obs
}

export function buildSummary(d: EvalData): string {
  const lines: string[] = []
  const client = has(val(d, 'clientName')) ? val(d, 'clientName') : 'the client'
  const industry = has(val(d, 'industry')) ? `${val(d, 'industry').toLowerCase()} ` : ''

  lines.push('EXECUTIVE SUMMARY — NETWORK EVALUATION')
  lines.push('='.repeat(48))
  lines.push('')

  // Overview paragraph
  const scaleParts: string[] = []
  if (has(val(d, 'locations'))) scaleParts.push(`${val(d, 'locations')} location(s)`)
  if (has(val(d, 'users'))) scaleParts.push(`${val(d, 'users')} user(s)`)
  if (has(val(d, 'devices'))) scaleParts.push(`${val(d, 'devices')} device(s)`)
  const scale = scaleParts.length ? `spanning ${list(scaleParts)}` : 'of undocumented scale'
  lines.push('OVERVIEW')
  lines.push(
    `This assessment covers ${client}, a ${industry}environment ${scale}.` +
      (has(val(d, 'currentProvider')) ? ` Network operations are currently handled by ${val(d, 'currentProvider')}.` : '') +
      (hasCompliance(d) ? ` The organization is subject to ${val(d, 'compliance')} requirements.` : ''),
  )
  lines.push('')

  // Connectivity
  const isps = activeIsps(d)
  if (isps.length) {
    lines.push('CONNECTIVITY')
    lines.push(`Internet is delivered via ${isps.length} circuit(s):`)
    for (const i of isps) {
      const label = [i.provider, i.speed].filter((x) => x && x.trim()).join(' — ')
      lines.push(`  • ${label || '(unspecified)'}`)
    }
    lines.push('')
  }

  // Infrastructure
  const hw: Array<[string, string]> = [
    ['Firewall', val(d, 'firewall')],
    ['Switching', val(d, 'switch')],
    ['Wireless', val(d, 'wireless')],
    ['Server', val(d, 'server')],
    ['PDU', val(d, 'pdu')],
    ['UPS', val(d, 'ups')],
  ]
  const hwPresent = hw.filter(([, v]) => has(v))
  if (hwPresent.length) {
    lines.push('INFRASTRUCTURE')
    for (const [label, v] of hwPresent) lines.push(`  • ${label}: ${v}`)
    lines.push('')
  }

  // Platform & data
  const plat: Array<[string, string]> = [
    ['Hypervisor', val(d, 'hypervisor')],
    ['Backup', val(d, 'backup')],
  ]
  const platPresent = plat.filter(([, v]) => has(v))
  if (platPresent.length) {
    lines.push('VIRTUALIZATION & DATA PROTECTION')
    for (const [label, v] of platPresent) lines.push(`  • ${label}: ${v}`)
    lines.push('')
  }

  // Security stack
  const sec: Array<[string, string]> = [
    ['Email', val(d, 'email')],
    ['Spam filtering', val(d, 'spam')],
    ['MFA', val(d, 'mfa')],
    ['Endpoint / AV', val(d, 'av')],
    ['Content filtering', val(d, 'contentFilter')],
    ['Security training', val(d, 'training')],
  ]
  const secPresent = sec.filter(([, v]) => has(v))
  if (secPresent.length) {
    lines.push('SECURITY STACK')
    for (const [label, v] of secPresent) lines.push(`  • ${label}: ${v}`)
    lines.push('')
  }

  // Tools
  if (has(val(d, 'remoteTools')) || has(val(d, 'lobTools'))) {
    lines.push('MANAGEMENT & BUSINESS TOOLS')
    if (has(val(d, 'remoteTools'))) lines.push(`  • Remote management: ${val(d, 'remoteTools')}`)
    if (has(val(d, 'lobTools'))) lines.push(`  • Line-of-business apps: ${val(d, 'lobTools')}`)
    lines.push('')
  }

  // Business context
  const biz: Array<[string, string]> = [
    ['Operation hours', val(d, 'operationHours')],
    ['Physical security', val(d, 'physicalSecurity')],
    ['Budget', val(d, 'budget')],
    ['Fiscal year', val(d, 'fiscalYear')],
  ]
  const bizPresent = biz.filter(([, v]) => has(v))
  if (bizPresent.length) {
    lines.push('BUSINESS CONTEXT')
    for (const [label, v] of bizPresent) lines.push(`  • ${label}: ${v}`)
    lines.push('')
  }

  // Observations
  const obs = buildObservations(d)
  if (obs.length) {
    lines.push('OBSERVATIONS & RECOMMENDATIONS')
    const order = { risk: 0, gap: 1, note: 2 } as const
    for (const o of [...obs].sort((a, b) => order[a.severity] - order[b.severity])) {
      const tag = o.severity === 'risk' ? '[RISK]' : o.severity === 'gap' ? '[GAP] ' : '[NOTE]'
      lines.push(`  ${tag} ${o.text}`)
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd() + '\n'
}
