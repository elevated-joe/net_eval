// Network assessment engine.
//
// Produces an auto-drafted, per-section network assessment from the intake
// data: an executive summary, an overall risk rating, and one result card per
// form section — each with a dynamic rating, a technical finding, a
// client-facing recommendation, and technical action items — plus a
// risk-priorities table and next steps. All wording is templated and
// rule-based; the UI lets the analyst edit any finding/recommendation.

import { activeIsps, parseChecklist, type EvalData } from './schema'

export type Rating = 'Good' | 'Attention' | 'At Risk' | 'Informational' | 'Not Assessed'

export const RATINGS: Rating[] = ['At Risk', 'Attention', 'Good', 'Informational', 'Not Assessed']

/** The assessment sections, in report order — used for image alignment and placement. */
export const ASSESSMENT_SECTIONS: { id: string; title: string }[] = [
  { id: 'identity', title: 'Identity & Microsoft 365' },
  { id: 'connectivity', title: 'Internet & Connectivity' },
  { id: 'hardware', title: 'Network & Infrastructure Hardware' },
  { id: 'platform', title: 'Virtualization & Data Protection' },
  { id: 'security', title: 'Email & Endpoint Security' },
  { id: 'tools', title: 'Management & Business Tools' },
  { id: 'organization', title: 'Organization & Compliance' },
]

export function isRating(v: string): v is Rating {
  return (RATINGS as string[]).includes(v)
}

export interface AssessmentSection {
  id: string
  title: string
  /** Effective rating (manual override if set, otherwise the auto rating). */
  rating: Rating
  /** The auto-computed rating, before any manual override (set by buildAssessment). */
  autoRating?: Rating
  /** True when the rating was manually overridden (set by buildAssessment). */
  ratingOverridden?: boolean
  /** Technical finding paragraph. */
  finding: string
  /** Plain-language, client-facing recommendation. */
  clientRecommendation: string
  /** Technical action items (auto-generated). */
  actions: string[]
  /** Short risk indicator, present when rating is At Risk / Attention. */
  indicator?: string
  /** Reason line for the risk-priorities table. */
  reason?: string
  /** Excluded from the generated report (set by buildAssessment). */
  hidden?: boolean
}

export interface PriorityRow {
  priority: 'High' | 'Medium'
  area: string
  reason: string
}

export interface Assessment {
  execSummary: string
  overallRating: string
  overall: string
  keyIndicators: string[]
  sections: AssessmentSection[]
  priorities: PriorityRow[]
  nextSteps: string
}

const has = (v: string | undefined): boolean => !!v && v.trim().length > 0
const val = (d: EvalData, k: string): string => (d.fields[k] ?? '').trim()

// Values that mean "not in place" even though the text field is non-empty —
// e.g. a user typing "None" or "N/A" for a solution.
const NEGATIVE = new Set(['none', 'n/a', 'na', 'no', 'nil', 'tbd', 'unknown', 'not in place', 'not present', 'n\\a'])
/** True when a control value is present AND not a negative sentinel. */
const present = (v: string | undefined): boolean => {
  const t = (v ?? '').trim().toLowerCase()
  return t.length > 0 && !NEGATIVE.has(t)
}

// ---------------------------------------------------------------------------
// Context analysis: read the free-text notes for signals of past incidents and
// escalate the related sections. This is deterministic keyword matching, not
// full language understanding, but it lets notes influence the output.
// ---------------------------------------------------------------------------

interface IncidentPattern {
  key: string
  re: RegExp
  sections: string[]
  tech: string
  client: string
  indicator: string
}

const INCIDENT_PATTERNS: IncidentPattern[] = [
  {
    key: 'phishing',
    re: /\b(phish|spoof|spear[- ]?phish|business email compromise|\bbec\b|wire fraud|impersonat)/i,
    sections: ['security', 'identity'],
    tech: 'Notes reference recent phishing/spoofing activity, which sharply raises the importance of end-user training, MFA, and email filtering in this area.',
    client:
      'Your notes mention a recent phishing/spoofing attempt. Because attackers are already targeting your team, strengthening staff training, MFA, and email protection should be treated as an immediate priority.',
    indicator: 'Recent phishing/spoofing activity noted with related controls incomplete.',
  },
  {
    key: 'ransomware',
    re: /\bransom(ware)?\b/i,
    sections: ['security', 'platform'],
    tech: 'Notes reference a ransomware concern, which elevates the importance of endpoint protection and verified, offline/immutable backups.',
    client:
      'Your notes mention ransomware. The most effective protections are endpoint security, staff training, and backups that are tested and stored offline — these should be prioritized.',
    indicator: 'Ransomware concern noted; verify endpoint protection and backups.',
  },
  {
    key: 'breach',
    re: /\b(breach|compromis|hacked|account takeover|stolen (password|credential))/i,
    sections: ['identity', 'security'],
    tech: 'Notes reference a security breach or account compromise, which elevates the priority of MFA coverage and access controls.',
    client:
      'Your notes mention a breach or account compromise. Enforcing multi-factor authentication everywhere and reviewing access is the fastest way to reduce repeat risk.',
    indicator: 'Breach / account compromise noted; MFA and access controls are a priority.',
  },
  {
    key: 'dataloss',
    re: /\b(data loss|lost data|accidental deletion|corrupt(ed)? data)\b/i,
    sections: ['platform'],
    tech: 'Notes reference a data-loss event, which elevates the importance of verified restores and offsite/immutable backups.',
    client:
      'Your notes mention data loss. Confirming that backups are tested and stored offsite is the key protection against a repeat.',
    indicator: 'Data-loss event noted; verify tested, offsite backups.',
  },
  {
    key: 'outage',
    re: /\b(outage|went down|downtime|internet down|isp down)\b/i,
    sections: ['connectivity'],
    tech: 'Notes reference a connectivity outage, which elevates the value of redundant internet with automatic failover.',
    client:
      'Your notes mention an internet outage. A second connection with automatic failover would prevent a repeat from stopping your operations.',
    indicator: 'Connectivity outage noted; redundancy/failover recommended.',
  },
]

/** Concatenate all section-notes text for keyword analysis. */
function notesBlob(d: EvalData): string {
  return Object.entries(d.fields)
    .filter(([k]) => k.startsWith('notes__'))
    .map(([, v]) => v ?? '')
    .join('\n')
}

/** Escalate a rating one step toward At Risk. */
function bumpRating(r: Rating): Rating {
  if (r === 'At Risk') return 'At Risk'
  if (r === 'Attention') return 'At Risk'
  return 'Attention'
}

/**
 * Apply incident context detected in notes: escalate affected sections and
 * append tailored context to their finding and client recommendation.
 * Returns the list of matched incident indicators.
 */
function applyIncidentContext(sections: AssessmentSection[], blob: string): string[] {
  if (!blob.trim()) return []
  const indicators: string[] = []
  for (const pat of INCIDENT_PATTERNS) {
    if (!pat.re.test(blob)) continue
    indicators.push(pat.indicator)
    for (const secId of pat.sections) {
      const s = sections.find((x) => x.id === secId)
      if (!s) continue
      s.rating = bumpRating(s.rating)
      s.finding = `${s.finding} ${pat.tech}`.trim()
      s.clientRecommendation = `${s.clientRecommendation} ${pat.client}`.trim()
      s.indicator = pat.indicator
      s.reason = s.reason ?? pat.indicator
    }
  }
  return indicators
}

/** Join a list into an English phrase: [a,b,c] -> "a, b, and c". */
function englishList(items: string[]): string {
  const p = items.filter(Boolean)
  if (p.length === 0) return ''
  if (p.length === 1) return p[0]
  if (p.length === 2) return `${p[0]} and ${p[1]}`
  return `${p.slice(0, -1).join(', ')}, and ${p[p.length - 1]}`
}

function domainPhrase(domainType: string): string {
  switch (domainType) {
    case 'Domain':
      return 'Active Directory domain joined'
    case 'Entra ID (Azure AD)':
      return 'Entra ID (Azure AD) joined'
    case 'Hybrid (AD + Entra)':
      return 'running a hybrid Active Directory / Entra ID model'
    case 'Workgroup':
      return 'configured as a workgroup (no central directory)'
    default:
      return 'of an undocumented directory model'
  }
}

// ---------------------------------------------------------------------------
// Per-section scoring
// ---------------------------------------------------------------------------

function identitySection(d: EvalData): AssessmentSection {
  const cov = val(d, 'mfaCoverage')
  const domainType = val(d, 'domainType')
  const services = parseChecklist(val(d, 'm365Services'))
  const mfa = val(d, 'mfa')
  const anyData = has(cov) || has(domainType) || services.length > 0 || has(val(d, 'm365Licensing'))

  const base = { id: 'identity', title: 'Identity & Microsoft 365' }
  const actions = [
    'Review all Microsoft 365 authentication paths and disable legacy protocols where feasible.',
    'Implement Conditional Access policies that require MFA across all supported Office 365 services.',
    'Apply stronger sign-in restrictions for privileged or administrative accounts.',
    'Validate exclusions, emergency accounts, and policy testing before full enforcement.',
  ]
  const dirNote = has(domainType) ? `The environment is ${domainPhrase(domainType)}. ` : ''
  const svcNote = services.length ? `Microsoft 365 services in use include ${englishList(services)}. ` : ''

  if (!anyData) {
    return {
      ...base,
      rating: 'Not Assessed',
      finding: 'Identity and Microsoft 365 details were not captured during this assessment.',
      clientRecommendation:
        'We recommend documenting your directory model and Microsoft 365 configuration so identity protections like multi-factor authentication can be verified.',
      actions,
    }
  }

  if (cov === 'All services') {
    return {
      ...base,
      rating: 'Good',
      finding: `${dirNote}${svcNote}Microsoft 365 multifactor authentication appears to be enforced across all services${mfa ? ` using ${mfa}` : ''}. Maintain Conditional Access policies and review exclusions periodically.`,
      clientRecommendation:
        'Your Microsoft 365 accounts are protected with multi-factor authentication across every service — the single strongest, simplest defense against stolen passwords. No action is needed beyond routine policy reviews as your team changes.',
      actions: ['Periodically review Conditional Access policies, exclusions, and emergency accounts.'],
    }
  }

  const isPartial = cov === 'Partial'
  let finding: string
  let clientRec: string
  switch (cov) {
    case 'Webmail only':
      finding = `${dirNote}${svcNote}Microsoft 365 MFA appears to protect webmail access only, rather than all Office 365 services and sign-in methods. Partial enforcement leaves desktop apps, mobile apps, legacy authentication, and services such as SharePoint, OneDrive, and Teams exposed.`
      clientRec =
        'Right now multi-factor authentication only covers webmail, so Teams, SharePoint, OneDrive, and the desktop apps can still be reached with just a password. Extending MFA to every Microsoft 365 sign-in is the highest-impact step you can take to prevent account takeover.'
      break
    case 'Partial':
      finding = `${dirNote}${svcNote}Microsoft 365 MFA and Conditional Access are only partially configured. Gaps in coverage leave some authentication paths and services exposed to account compromise.`
      clientRec =
        'Multi-factor authentication is partially in place. Extending it to every Microsoft 365 sign-in closes the remaining gaps an attacker could still use with only a password.'
      break
    case 'None':
      finding = `${dirNote}${svcNote}Microsoft 365 multifactor authentication does not appear to be enforced. Accounts protected by passwords alone materially increase the risk of account compromise and unauthorized access.`
      clientRec =
        'Accounts are protected by passwords alone today. Because stolen or guessed passwords are the most common way businesses get breached, we strongly recommend turning on multi-factor authentication across Microsoft 365.'
      break
    default:
      finding = `${dirNote}${svcNote}Microsoft 365 multifactor authentication coverage could not be confirmed. Unverified MFA enforcement should be treated as a priority validation item.`
      clientRec =
        "We couldn't confirm how broadly multi-factor authentication is enforced. Confirming — and, where needed, expanding — MFA coverage across Microsoft 365 should be an early priority."
  }

  return {
    ...base,
    rating: isPartial ? 'Attention' : 'At Risk',
    finding,
    clientRecommendation: clientRec,
    actions,
    indicator: 'MFA is not fully enforced across Microsoft 365.',
    reason: 'Incomplete MFA coverage is the most common path to account compromise and unauthorized access.',
  }
}

function connectivitySection(d: EvalData): AssessmentSection {
  const isps = activeIsps(d)
  const failover = val(d, 'failover')
  const base = { id: 'connectivity', title: 'Internet & Connectivity' }
  const actions = [
    'Implement or confirm a secondary internet connection at the primary location with automatic firewall failover.',
    'Evaluate secondary connectivity options for critical remote sites.',
    'Document carrier information, failover behavior, and recovery procedures for each site.',
  ]

  if (isps.length === 0 && !has(failover)) {
    return {
      ...base,
      rating: 'Not Assessed',
      finding: 'Internet connectivity details were not captured during this assessment.',
      clientRecommendation: 'We recommend documenting your internet circuits and whether automatic failover is in place.',
      actions,
    }
  }

  if (isps.length >= 2 && failover === 'Yes') {
    return {
      ...base,
      rating: 'Good',
      finding: `Redundant internet connectivity is present via ${isps.length} circuits with automatic failover configured.`,
      clientRecommendation:
        'You have more than one internet connection with automatic failover, so a single carrier outage will not take email, cloud apps, or remote access offline. We recommend periodic failover testing to keep it reliable.',
      actions: ['Periodically test automatic failover between circuits and document the results.'],
    }
  }

  if (isps.length >= 2) {
    return {
      ...base,
      rating: 'Attention',
      finding: `Multiple internet circuits (${isps.length}) are present, but automatic failover is not confirmed. Without verified failover, an outage on the primary circuit may still disrupt operations.`,
      clientRecommendation:
        'You have more than one internet connection, but we could not confirm that failover happens automatically. Verifying failover ensures the switch-over is seamless during an outage.',
      actions,
      indicator: 'Internet failover is not confirmed.',
      reason: 'Unverified failover can still allow avoidable downtime during a carrier outage.',
    }
  }

  return {
    ...base,
    rating: 'At Risk',
    finding:
      'No redundant internet connectivity was identified. The environment appears to rely on a single internet connection without documented failover capability, creating a single point of failure for cloud applications, email, remote connectivity, and daily operations.',
    clientRecommendation:
      'Your internet runs on a single connection, which is a single point of failure — if it goes down, email, cloud apps, phones, and remote work go with it. We recommend adding a second internet line that automatically takes over so a carrier outage does not stop your day.',
    actions,
    indicator: 'No redundant internet connectivity.',
    reason: 'Single-carrier dependence creates avoidable operational downtime risk.',
  }
}

function hardwareSection(d: EvalData): AssessmentSection {
  const fw = val(d, 'firewall')
  const fwType = val(d, 'firewallType')
  const cond = val(d, 'hardwareCondition')
  const pdu = val(d, 'pdu')
  const ups = val(d, 'ups')
  const base = { id: 'hardware', title: 'Network & Infrastructure Hardware' }
  const anyData = [fw, fwType, cond, pdu, ups, val(d, 'switch'), val(d, 'wireless'), val(d, 'server')].some(has)
  const actions = [
    'Inventory core hardware: model, age, warranty status, firmware level, and business function.',
    'Establish a refresh or virtualization plan for aging or end-of-life equipment.',
    'Install a rack-mounted PDU and verify UPS integration for power protection.',
    'Confirm the firewall is a supported platform with a documented patch and rule-review process.',
  ]

  if (!anyData) {
    return {
      ...base,
      rating: 'Not Assessed',
      finding: 'Network and infrastructure hardware details were not captured during this assessment.',
      clientRecommendation: 'We recommend documenting your firewall, switching, wireless, server, and power equipment so lifecycle and support risks can be evaluated.',
      actions,
    }
  }

  const fwMissing = !present(fw)
  const fwWeak = fwType === 'Open-source' || fwType === 'Unknown' || !has(fwType)
  const condEol = cond === 'End-of-life'
  const condAging = cond === 'Aging' || cond === 'Mixed'
  const noPdu = !present(pdu)
  const noUps = !present(ups)

  const issues: string[] = []
  if (fwMissing) issues.push('no firewall was recorded, so perimeter protection needs to be confirmed')
  else if (fwWeak) issues.push('the firewall is an open-source or unconfirmed platform that depends on disciplined patching and support to stay secure')
  if (condEol) issues.push('some equipment is end-of-life and should be replaced before it fails')
  else if (condAging) issues.push('some equipment is aging and should be planned for refresh')
  if (noPdu) issues.push('there is no rack-mounted power distribution unit (PDU)')
  if (noUps) issues.push('battery backup (UPS) is not confirmed')

  if (issues.length === 0) {
    return {
      ...base,
      rating: 'Good',
      finding: `Core network hardware appears current${fw ? ` (firewall: ${fw})` : ''}, protected by a supported firewall, with rack power protection in place. Maintain firmware updates and periodic reviews.`,
      clientRecommendation:
        'Your core network hardware is current, protected by a supported firewall, and has proper power protection — a solid foundation. We recommend keeping firmware and warranties current.',
      actions: ['Maintain firmware updates, warranty coverage, and periodic firewall rule reviews.'],
    }
  }

  const rating: Rating = fwMissing || condEol ? 'At Risk' : 'Attention'
  return {
    ...base,
    rating,
    finding: `We noted that ${englishList(issues)}. Unknown lifecycle status and weak perimeter or power protection increase the risk of hardware failure, replacement delays, and unmanaged security exposure.`,
    clientRecommendation: `In your network hardware, ${englishList(issues)}. Addressing these improves day-to-day reliability, strengthens perimeter security, and reduces the chance of unexpected downtime.`,
    actions,
    indicator: 'Aging hardware, weak firewall governance, or missing power protection.',
    reason: 'Hardware lifecycle and perimeter/power gaps raise reliability and security concerns.',
  }
}

function dataProtectionSection(d: EvalData): AssessmentSection {
  const backup = val(d, 'backup')
  const tested = val(d, 'backupTested')
  const offsite = val(d, 'backupOffsite')
  const hypervisor = val(d, 'hypervisor')
  const base = { id: 'platform', title: 'Virtualization & Data Protection' }
  const anyData = [backup, tested, offsite, hypervisor].some(has)
  const actions = [
    'Identify the backup platform, scope, schedules, retention, and storage locations.',
    'Confirm servers, shared data, and Microsoft 365 data are protected.',
    'Perform and document restore tests for critical systems and files.',
    'Standardize toward a 3-2-1 backup strategy with at least one offsite or immutable copy.',
  ]

  if (!anyData) {
    return {
      ...base,
      rating: 'Not Assessed',
      finding: 'Backup and virtualization details were not captured during this assessment.',
      clientRecommendation: 'We recommend documenting your backup platform and confirming that restores are tested and stored offsite.',
      actions,
    }
  }

  if (present(backup) && tested === 'Yes' && offsite === 'Yes') {
    return {
      ...base,
      rating: 'Good',
      finding: `Backups are handled by ${backup}, with restore testing confirmed and an offsite/immutable copy in place${hypervisor ? `; virtualization runs on ${hypervisor}` : ''}. Continue routine restore testing and monitoring.`,
      clientRecommendation:
        'Your backups are running, restore-tested, and stored offsite — exactly the safety net you want against ransomware or accidental loss. We recommend continuing routine restore tests.',
      actions: ['Continue scheduled restore testing and periodically validate offsite/immutable copies.'],
    }
  }

  if (!present(backup) || tested === 'No') {
    return {
      ...base,
      rating: 'At Risk',
      finding: !present(backup)
        ? 'The current state of backups is unknown, and working backups could not be confirmed. There is no documented evidence of restore testing, offsite copy validation, or immutable protection.'
        : `A backup solution (${backup}) is in place, but restore testing has not been performed. Untested backups frequently fail at the moment they are needed.`,
      clientRecommendation:
        'We could not confirm working, tested backups. This is the difference between a bad day and a business-ending event during ransomware or hardware failure — validating restores and keeping a protected offsite copy should be a top priority.',
      actions,
      indicator: 'Backups are not clearly documented or regularly tested.',
      reason: 'Unknown or unverified backup status creates major recovery and ransomware risk.',
    }
  }

  return {
    ...base,
    rating: 'Attention',
    finding: `A backup solution (${backup}) is in place, but ${tested !== 'Yes' ? 'restore testing' : 'an offsite/immutable copy'} is not confirmed. The existence of backup jobs alone does not guarantee recoverability.`,
    clientRecommendation: `Backups appear to be in place (${backup}), but we could not confirm ${tested !== 'Yes' ? 'that restores are regularly tested' : 'a protected offsite copy'}. Verifying recovery ensures your safety net actually works when you need it.`,
    actions,
    indicator: 'Backup restore testing or offsite copy is unconfirmed.',
    reason: 'Unverified backups can fail during recovery, extending downtime after an incident.',
  }
}

function securitySection(d: EvalData): AssessmentSection {
  const av = val(d, 'av')
  const spam = val(d, 'spam')
  const contentFilter = val(d, 'contentFilter')
  const training = val(d, 'training')
  const patch = val(d, 'patchManagement')
  const ra = val(d, 'remoteAccess')
  const ramfa = val(d, 'remoteAccessMfa')
  const base = { id: 'security', title: 'Email & Endpoint Security' }
  const anyData = [av, spam, contentFilter, training, patch, ra, val(d, 'mfa')].some(has)
  const actions = [
    'Confirm endpoint protection (EDR/antivirus) is deployed and monitored on all devices.',
    'Enable email spam/phishing filtering and DNS/content filtering.',
    'Roll out recurring security awareness training and phishing simulations.',
    'Ensure patch management is actively managed for operating systems and applications.',
    'Inventory remote access methods and enforce MFA on every approved path.',
  ]

  if (!anyData) {
    return {
      ...base,
      rating: 'Not Assessed',
      finding: 'Email and endpoint security details were not captured during this assessment.',
      clientRecommendation: 'We recommend documenting endpoint protection, email filtering, training, patching, and remote access so security coverage can be evaluated.',
      actions,
    }
  }

  const remoteUnprotected = present(ra) && ramfa !== 'Yes'
  const missing: string[] = []
  if (!present(av)) missing.push('endpoint protection (antivirus/EDR) is not in place')
  if (!present(spam)) missing.push('email spam/phishing filtering is not in place')
  if (!present(training)) missing.push('security awareness training is not in place')
  if (!present(contentFilter)) missing.push('web/DNS content filtering is not in place')
  if (patch !== 'Actively managed') missing.push('patch management is not confirmed as actively managed')
  if (remoteUnprotected) missing.push('remote access is not confirmed to require MFA')

  if (missing.length === 0) {
    return {
      ...base,
      rating: 'Good',
      finding:
        'Core security layers — endpoint protection, email filtering, MFA, content filtering, training, and patch management — appear to be in place. Maintain monitoring and keep tooling current.',
      clientRecommendation:
        'Your core security layers are in place — endpoint protection, email filtering, training, content filtering, and managed patching. We recommend keeping them monitored and current.',
      actions: ['Keep security tooling monitored, licensed, and current; continue recurring training.'],
    }
  }

  const critical = !present(av) || remoteUnprotected || !present(training)
  return {
    ...base,
    rating: critical ? 'At Risk' : 'Attention',
    finding: `Good security relies on layered defenses. During the assessment, ${englishList(missing)}. These gaps increase exposure to phishing, malware, and account compromise.`,
    clientRecommendation: `Strong security works in layers. We noted that ${englishList(missing)}. Closing these gaps meaningfully lowers your risk of phishing, ransomware, and account compromise.`,
    actions,
    indicator: 'Gaps in layered email/endpoint security controls.',
    reason: 'Missing security layers increase exposure to phishing, malware, and compromise.',
  }
}

function toolsSection(d: EvalData): AssessmentSection {
  const remoteTools = val(d, 'remoteTools')
  const lob = val(d, 'lobTools')
  const base = { id: 'tools', title: 'Management & Business Tools' }
  if (!has(remoteTools) && !has(lob)) {
    return {
      ...base,
      rating: 'Not Assessed',
      finding: 'Management and line-of-business tools were not captured during this assessment.',
      clientRecommendation: 'We recommend documenting your key business applications and remote support tools so support and continuity planning account for them.',
      actions: [],
    }
  }
  const parts: string[] = []
  if (has(remoteTools)) parts.push(`remote management via ${remoteTools}`)
  if (has(lob)) parts.push(`line-of-business applications (${lob})`)
  return {
    ...base,
    rating: 'Informational',
    finding: `The environment uses ${englishList(parts)}. These are documented so support, licensing, and continuity planning account for them.`,
    clientRecommendation:
      "We've documented your key applications and support tools so they're factored into support coverage and business continuity planning.",
    actions: [],
  }
}

function organizationSection(d: EvalData): AssessmentSection {
  const compliance = val(d, 'compliance')
  const industry = val(d, 'industry')
  const users = val(d, 'users')
  const devices = val(d, 'devices')
  const locations = val(d, 'locations')
  const base = { id: 'organization', title: 'Organization & Compliance' }

  const scaleParts: string[] = []
  if (has(users)) scaleParts.push(`${users} users`)
  if (has(devices)) scaleParts.push(`${devices} devices`)
  if (has(locations)) scaleParts.push(`${locations} location(s)`)
  const scale = scaleParts.length ? `approximately ${englishList(scaleParts)}` : 'an undocumented number of users and sites'
  const complianceActive = has(compliance) && compliance !== 'None'

  return {
    ...base,
    rating: 'Informational',
    finding: `The environment supports ${scale}${has(industry) ? ` in the ${industry.toLowerCase()} sector` : ''}.${complianceActive ? ` The organization is subject to ${compliance} requirements.` : ''}`,
    clientRecommendation: complianceActive
      ? `Because you're subject to ${compliance}, we recommend mapping the controls above — MFA, tested backups, logging, and training — to that framework so you can demonstrate compliance.`
      : 'This section captures the size and business context that shape the recommendations throughout this report.',
    actions: complianceActive
      ? [`Map recommended security controls to ${compliance} requirements and document evidence.`]
      : [],
  }
}

function ratingFor(atRisk: number, attention: number): string {
  if (atRisk >= 2) return 'Moderate-to-High'
  if (atRisk === 1 || attention >= 3) return 'Moderate'
  if (attention >= 1) return 'Low-to-Moderate'
  return 'Low'
}

export function buildAssessment(d: EvalData): Assessment {
  const client = has(val(d, 'clientName')) ? val(d, 'clientName') : 'The organization'
  const users = val(d, 'users')
  const devices = val(d, 'devices')
  const locations = val(d, 'locations')

  const sections: AssessmentSection[] = [
    identitySection(d),
    connectivitySection(d),
    hardwareSection(d),
    dataProtectionSection(d),
    securitySection(d),
    toolsSection(d),
    organizationSection(d),
  ]

  // Analyze notes for past incidents and escalate the related sections; this
  // becomes part of the auto baseline (manual overrides still take precedence).
  applyIncidentContext(sections, notesBlob(d))

  // Record the auto rating, apply any manual rating override, and mark hidden.
  for (const s of sections) {
    s.autoRating = s.rating
    const ov = d.assessmentText?.[`rating__${s.id}`]
    if (ov && isRating(ov)) {
      s.rating = ov
      s.ratingOverridden = ov !== s.autoRating
    } else {
      s.ratingOverridden = false
    }
    s.hidden = d.hiddenSections?.includes(s.id) ?? false
  }

  // Rollups consider only sections included in the report.
  const visible = sections.filter((s) => !s.hidden)
  const atRisk = visible.filter((s) => s.rating === 'At Risk')
  const attention = visible.filter((s) => s.rating === 'Attention')
  const overallRating = ratingFor(atRisk.length, attention.length)

  const scaleParts: string[] = []
  if (has(users)) scaleParts.push(`approximately ${users} users`)
  if (has(devices)) scaleParts.push(`${devices} devices`)
  const scale = scaleParts.length ? englishList(scaleParts) : 'an unspecified number of users and devices'
  const loc = has(locations) ? `${locations} location(s)` : 'multiple locations'
  const flagged = [...atRisk, ...attention]
  const riskAreas = englishList(flagged.map((s) => s.title.toLowerCase()))

  const execSummary =
    `The ${client} network environment currently supports ${scale} across ${loc}. ` +
    `The environment is ${domainPhrase(val(d, 'domainType'))}, providing ${val(d, 'domainType') === 'Workgroup' ? 'decentralized' : 'baseline centralized'} identity and access management, but several core resilience, security, and infrastructure controls ${flagged.length ? 'require further validation or remediation' : 'were reviewed and appear reasonably managed'}.` +
    (flagged.length
      ? `\n\nThe most significant areas identified during this assessment relate to ${riskAreas}. These gaps increase exposure to service outages, ransomware, unauthorized access, and prolonged recovery times following an incident.`
      : '')

  const overall =
    `Overall, the ${client}'s network risk posture is best characterized as ${overallRating.toLowerCase()}` +
    (flagged.length
      ? `, driven by ${flagged.length} area${flagged.length === 1 ? '' : 's'} requiring attention across resilience, security, and infrastructure management that together increase the likelihood and impact of a cyber incident or prolonged outage.`
      : '. No high-severity gaps were identified, though routine validation and monitoring should continue.')

  const keyIndicators = [...new Set(flagged.map((s) => s.indicator ?? `${s.title} requires attention.`))]

  const priorities: PriorityRow[] = [
    ...atRisk.map((s) => ({ priority: 'High' as const, area: s.title, reason: s.reason ?? `${s.title} requires remediation.` })),
    ...attention.map((s) => ({ priority: 'Medium' as const, area: s.title, reason: s.reason ?? `${s.title} should be reviewed.` })),
  ]

  const highAreas = englishList(atRisk.map((s) => s.title.toLowerCase()))
  const medAreas = englishList(attention.map((s) => s.title.toLowerCase()))
  const nextSteps = atRisk.length
    ? `We recommend the ${client} address ${highAreas} first, as ${atRisk.length === 1 ? 'it presents' : 'they present'} the most immediate cybersecurity and recovery risk.${attention.length ? ` These should be followed by ${medAreas} to further improve resilience and supportability.` : ''}`
    : attention.length
      ? `We recommend the ${client} prioritize ${medAreas} to improve resilience and supportability, followed by routine validation of the remaining controls.`
      : `No high-priority remediation items were identified. We recommend the ${client} maintain current controls and continue routine validation and monitoring.`

  return { execSummary, overallRating, overall, keyIndicators, sections, priorities, nextSteps }
}

/** Effective text for an assessment block, honoring manual overrides. */
export function effectiveText(d: EvalData, blockId: string, autoText: string): string {
  const override = d.assessmentText?.[blockId]
  return override !== undefined && override.trim() !== '' ? override : autoText
}
