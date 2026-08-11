// Support-plan gap analysis.
//
// Maps the client's current-state intake answers against the Elevated MSP
// "Peace of Mind" (POM) support plan, so the tool surfaces which managed
// controls are missing (gaps the plan would close) and suggests a starting
// tier. Grounded in the POM feature matrix (Co-Managed / Remote / Standard /
// Enterprise).

import { activeIsps, type EvalData } from './schema'

export type PlanTier = 'Co-Managed' | 'Remote' | 'Standard' | 'Enterprise'
export const PLAN_TIERS: PlanTier[] = ['Co-Managed', 'Remote', 'Standard', 'Enterprise']

const has = (v: string | undefined): boolean => !!v && v.trim().length > 0
const val = (d: EvalData, k: string): string => (d.fields[k] ?? '').trim()

/** A POM control that maps to an observable field in the intake form. */
interface ControlDef {
  id: string
  name: string
  category: string
  field: string
  /** Tiers of the POM plan that include this control. */
  includedIn: PlanTier[]
}

// Controls included across all four Peace of Mind tiers (security baseline).
const ALL: PlanTier[] = ['Co-Managed', 'Remote', 'Standard', 'Enterprise']
// Server image backups / backup reporting are Standard and Enterprise only.
const STD_ENT: PlanTier[] = ['Standard', 'Enterprise']

const CONTROLS: ControlDef[] = [
  { id: 'edr', name: 'EDR / Endpoint Protection & Managed SOC', category: 'Security & Data Protection', field: 'av', includedIn: ALL },
  { id: 'mfa', name: 'Multi-Factor Authentication', category: 'Security & Data Protection', field: 'mfa', includedIn: ALL },
  { id: 'spam', name: 'Email Spam Filtering & Identity Protection', category: 'End-user Support', field: 'spam', includedIn: ALL },
  { id: 'training', name: 'Cybersecurity Training & Dark Web Monitoring', category: 'Compliance & Reporting', field: 'training', includedIn: ALL },
  { id: 'saasBackup', name: 'SaaS Backup (Microsoft 365 / Google Workspace)', category: 'Backup, DR & Business Continuity', field: 'backup', includedIn: ALL },
  { id: 'serverBackup', name: 'Server Image Backups & Off-site Replication', category: 'Backup, DR & Business Continuity', field: 'backup', includedIn: STD_ENT },
]

export interface GapRow {
  control: string
  category: string
  currentState: string
  status: 'in-place' | 'gap'
  includedIn: PlanTier[]
}

/** Enterprise-tier fully-managed hardware, shown as optional upgrades. */
export interface ManagedHardwareRow {
  item: string
  currentState: string
}

export interface AdvisoryNote {
  severity: 'risk' | 'gap' | 'note'
  text: string
}

export interface GapAnalysis {
  coverage: GapRow[]
  gaps: GapRow[]
  managedHardware: ManagedHardwareRow[]
  advisories: AdvisoryNote[]
  recommendedTier: PlanTier
  rationale: string
}

export function buildGapAnalysis(d: EvalData): GapAnalysis {
  const coverage: GapRow[] = CONTROLS.map((c) => {
    const present = has(val(d, c.field))
    // Server backup is only meaningful when there is an on-prem server.
    const serverContext = c.id === 'serverBackup' ? has(val(d, 'server')) : true
    const isGap = !present && serverContext
    return {
      control: c.name,
      category: c.category,
      currentState: present ? val(d, c.field) : c.id === 'serverBackup' && !serverContext ? 'No on-prem server recorded' : 'Not recorded',
      status: isGap ? 'gap' : 'in-place',
      includedIn: c.includedIn,
    }
  })

  const gaps = coverage.filter((r) => r.status === 'gap')

  const managedHardware: ManagedHardwareRow[] = [
    { item: 'Elevated Managed Firewall', currentState: has(val(d, 'firewall')) ? val(d, 'firewall') : 'None recorded' },
    { item: 'Elevated Managed Switch', currentState: has(val(d, 'switch')) ? val(d, 'switch') : 'None recorded' },
    { item: 'Elevated Managed Wi-Fi', currentState: has(val(d, 'wireless')) ? val(d, 'wireless') : 'None recorded' },
  ]

  // Resilience / best-practice advisories not represented as POM line items.
  const advisories: AdvisoryNote[] = []
  if (activeIsps(d).length <= 1) {
    advisories.push({ severity: 'risk', text: 'Single internet circuit is a single point of failure — consider a secondary provider or failover for resilience.' })
  }
  if (!has(val(d, 'firewall'))) {
    advisories.push({ severity: 'risk', text: 'No firewall recorded — perimeter security should be confirmed before onboarding.' })
  }
  if (!has(val(d, 'contentFilter'))) {
    advisories.push({ severity: 'gap', text: 'No DNS / content filtering recorded.' })
  }
  if (!has(val(d, 'ups'))) {
    advisories.push({ severity: 'gap', text: 'No UPS recorded — confirm power protection for critical equipment.' })
  }
  const compliance = val(d, 'compliance')
  if (has(compliance) && compliance !== 'None') {
    advisories.push({ severity: 'note', text: `Environment is subject to ${compliance} — the plan's Security Policy Review and Best Practices Report should be mapped to that framework.` })
  }

  // Suggested starting tier.
  const hasServer = has(val(d, 'server'))
  const provider = val(d, 'currentProvider').toLowerCase()
  const hasInternalIt = /in.?house|internal|on.?staff|it dept|it team/.test(provider)

  let recommendedTier: PlanTier
  let rationale: string
  if (hasInternalIt) {
    recommendedTier = 'Co-Managed'
    rationale = 'Client appears to have internal IT staff, so a Co-Managed plan lets Elevated supplement the existing team while providing the security baseline.'
  } else if (hasServer) {
    recommendedTier = 'Standard'
    rationale = 'An on-prem server is present, so Standard adds Datto server image backups, off-site replication, and backup reporting on top of the full security baseline.'
  } else {
    recommendedTier = 'Remote'
    rationale = 'No on-prem server recorded, so a Remote plan delivers the full security and end-user baseline without on-site infrastructure management.'
  }
  if (managedHardware.every((h) => h.currentState !== 'None recorded')) {
    rationale += ' Consider Enterprise to fold the firewall, switch, and Wi-Fi into Elevated Managed Hardware.'
  }

  return { coverage, gaps, managedHardware, advisories, recommendedTier, rationale }
}
