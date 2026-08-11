// Network assessment engine.
//
// Produces an auto-drafted, narrative network assessment (executive summary,
// per-domain findings with recommended actions, a risk-priorities table, and
// next steps) from the intake data — modeled on a written assessment report.
// All wording is templated and rule-based; the UI lets the analyst edit any
// finding before generating the report.

import { activeIsps, type EvalData } from './schema'

export type RiskLevel = 'High' | 'Medium' | 'Low' | 'Info'

export interface AssessmentDomain {
  id: string
  title: string
  risk: RiskLevel
  /** Auto-drafted finding paragraph. */
  finding: string
  /** Recommended actions (auto-generated). */
  actions: string[]
  /** Short one-line risk indicator, present when risk is High/Medium. */
  indicator?: string
  /** Short reason for the risk-priorities table, present when risk is High/Medium. */
  reason?: string
}

export interface PriorityRow {
  priority: RiskLevel
  area: string
  reason: string
}

export interface Assessment {
  execSummary: string
  overallRating: string
  overall: string
  keyIndicators: string[]
  domains: AssessmentDomain[]
  priorities: PriorityRow[]
  nextSteps: string
}

const has = (v: string | undefined): boolean => !!v && v.trim().length > 0
const val = (d: EvalData, k: string): string => (d.fields[k] ?? '').trim()

function domainPhrase(domainType: string): string {
  switch (domainType) {
    case 'Domain':
      return 'domain joined'
    case 'Entra ID (Azure AD)':
      return 'Entra ID (Azure AD) joined'
    case 'Hybrid (AD + Entra)':
      return 'configured in a hybrid Active Directory / Entra ID model'
    case 'Workgroup':
      return 'configured as a workgroup'
    default:
      return 'of an undocumented directory model'
  }
}

function buildDomains(d: EvalData): AssessmentDomain[] {
  const domains: AssessmentDomain[] = []

  // Internet Redundancy
  {
    const isps = activeIsps(d)
    if (isps.length <= 1) {
      domains.push({
        id: 'internet',
        title: 'Internet Redundancy',
        risk: 'Medium',
        finding:
          'No redundant internet connectivity was identified. The environment appears to rely on a single internet connection without documented failover capability. This creates a single point of failure for cloud applications, email access, remote connectivity, and any operations that depend on internet availability.',
        actions: [
          'Implement a secondary internet connection at the primary location with automatic firewall failover.',
          'Evaluate secondary connectivity options for critical remote sites.',
          'Document carrier information, failover behavior, and recovery procedures for each site.',
        ],
        indicator: 'No backup redundancy for internet connections.',
        reason: 'Single-carrier dependence creates avoidable operational downtime risk.',
      })
    } else {
      const providers = isps.map((i) => i.provider).filter(Boolean).join(', ')
      domains.push({
        id: 'internet',
        title: 'Internet Redundancy',
        risk: 'Low',
        finding: `Redundant internet connectivity is present via ${isps.length} circuits${providers ? ` (${providers})` : ''}. Confirm that automatic failover is configured and periodically tested so an outage on one carrier does not disrupt operations.`,
        actions: [
          'Verify automatic failover behavior between circuits.',
          'Document carrier details, failover behavior, and recovery procedures.',
        ],
      })
    }
  }

  // Backup and Recovery
  {
    const backup = val(d, 'backup')
    const tested = val(d, 'backupTested')
    const offsite = val(d, 'backupOffsite')
    if (!has(backup) || tested !== 'Yes') {
      const finding = !has(backup)
        ? 'The current state of backups is unknown, and working backups could not be confirmed at the time of assessment. There is no documented evidence of successful restore testing, offsite copy validation, or immutable backup protection.'
        : `A backup solution (${backup}) is in place, but restore testing${tested === 'No' ? ' has not been performed' : ' has not been confirmed'}${offsite !== 'Yes' ? ' and offsite/immutable protection is not verified' : ''}. The existence of backup jobs alone does not guarantee recoverability.`
      domains.push({
        id: 'backup',
        title: 'Backup and Recovery',
        risk: 'High',
        finding,
        actions: [
          'Identify the backup platform, scope, schedules, retention, and storage locations.',
          'Confirm whether servers, shared data, and Microsoft 365 data are protected.',
          'Perform and document restore tests for critical systems and files.',
          'Standardize toward a 3-2-1 backup strategy with at least one protected offsite or immutable copy.',
        ],
        indicator: 'Backups are not clearly documented or regularly tested.',
        reason: 'Unknown or unverified backup status creates major recovery and ransomware risk.',
      })
    } else {
      domains.push({
        id: 'backup',
        title: 'Backup and Recovery',
        risk: 'Low',
        finding: `Backups are handled by ${backup}, with restore testing confirmed${offsite === 'Yes' ? ' and an offsite/immutable copy in place' : ''}. Continue routine restore testing and backup monitoring.`,
        actions: [
          'Continue scheduled restore testing and document results.',
          'Periodically validate offsite/immutable copies and retention.',
        ],
      })
    }
  }

  // Identity Security and MFA
  {
    const coverage = val(d, 'mfaCoverage')
    const mfa = val(d, 'mfa')
    if (coverage === 'All services') {
      domains.push({
        id: 'mfa',
        title: 'Identity Security and MFA',
        risk: 'Low',
        finding: `Microsoft 365 multifactor authentication appears to be enforced across all services${mfa ? ` using ${mfa}` : ''}. Maintain Conditional Access policies and review exclusions and emergency accounts periodically.`,
        actions: [
          'Periodically review Conditional Access policies and exclusions.',
          'Apply stronger sign-in restrictions for privileged accounts.',
        ],
      })
    } else {
      let finding: string
      switch (coverage) {
        case 'Webmail only':
          finding =
            'Microsoft 365 multifactor authentication appears to protect webmail access only, rather than all Office 365 services and sign-in methods. Partial enforcement leaves users and data exposed through desktop applications, mobile applications, legacy authentication, and services such as SharePoint, OneDrive, and Teams.'
          break
        case 'Partial':
          finding =
            'Microsoft 365 multifactor authentication and Conditional Access do not appear to be configured comprehensively; enforcement is partial. Gaps in coverage leave some authentication paths and services exposed to account compromise.'
          break
        case 'None':
          finding =
            'Microsoft 365 multifactor authentication does not appear to be enforced. Accounts protected by passwords alone materially increase the risk of account compromise and unauthorized access.'
          break
        default:
          finding =
            'Microsoft 365 multifactor authentication coverage could not be confirmed during the assessment. Unverified MFA enforcement should be treated as a priority validation item, as broad MFA coverage is a primary control for reducing account compromise risk.'
      }
      domains.push({
        id: 'mfa',
        title: 'Identity Security and MFA',
        risk: 'High',
        finding,
        actions: [
          'Review all Microsoft 365 authentication paths and disable legacy protocols where feasible.',
          'Implement Conditional Access policies that require MFA across all supported Office 365 services.',
          'Apply stronger sign-in restrictions for privileged or administrative accounts.',
          'Validate exclusions, emergency accounts, and policy testing before full enforcement.',
        ],
        indicator: 'MFA is not fully enforced across Microsoft 365.',
        reason: 'Incomplete MFA coverage materially increases the likelihood of account compromise and unauthorized access.',
      })
    }
  }

  // Remote Access Exposure
  {
    const ra = val(d, 'remoteAccess')
    const ramfa = val(d, 'remoteAccessMfa')
    if (!has(ra)) {
      domains.push({
        id: 'remote',
        title: 'Remote Access Exposure',
        risk: 'Info',
        finding:
          'No remote access systems were recorded. Confirm whether any VPN, terminal services, jump boxes, or management tools are in use, and ensure any that exist are inventoried and protected with MFA.',
        actions: [
          'Inventory all remote access services, including VPN, terminal services, jump boxes, and management tools.',
          'Confirm whether each system is still required for operations.',
        ],
      })
    } else if (ramfa !== 'Yes') {
      domains.push({
        id: 'remote',
        title: 'Remote Access Exposure',
        risk: 'High',
        finding: `Remote access is provided via ${ra}, but MFA enforcement and security controls were not confirmed${ramfa === 'No' ? ', and MFA does not appear to be enforced' : ''}. Remote access services are commonly targeted in intrusion and ransomware events, especially when internet-exposed or poorly documented.`,
        actions: [
          'Inventory all remote access services, including VPN, terminal services, jump boxes, and management tools.',
          'Confirm whether each system is still required for operations.',
          'Enforce MFA on all approved remote access methods.',
          'Remove, disable, or isolate unused remote access systems.',
        ],
        indicator: 'Remote access paths are not clearly managed or secured.',
        reason: 'Unclear remote access usage and MFA status can leave high-risk external entry points exposed.',
      })
    } else {
      domains.push({
        id: 'remote',
        title: 'Remote Access Exposure',
        risk: 'Low',
        finding: `Remote access via ${ra} is protected with MFA. Continue to review exposure, patching, logging, and segmentation periodically.`,
        actions: ['Periodically review remote access exposure, patching, and logging.'],
      })
    }
  }

  // Firewall Platform
  {
    const fwType = val(d, 'firewallType')
    const fw = val(d, 'firewall')
    if (fwType === 'Open-source') {
      domains.push({
        id: 'firewall',
        title: 'Firewall Platform',
        risk: 'Medium',
        finding: `The environment appears to use an open-source firewall platform${fw ? ` (${fw})` : ''}. Open-source firewalls can be effective when properly maintained, but they require disciplined patching, configuration management, monitoring, and administrative expertise. Without documented standards for updates, rule review, logging, and support ownership, perimeter security can drift over time and become harder to audit.`,
        actions: [
          'Review firewall model, software version, update cadence, and administrative ownership.',
          'Audit firewall rules, VPN configuration, logging, and security services.',
          'Determine whether the platform should be hardened and retained or replaced with a supported next-generation firewall.',
          'Document a recurring review process for firewall changes and security updates.',
        ],
        indicator: 'Firewall relies on an open-source platform without clear governance.',
        reason: 'Perimeter security depends on proper support, patching, and configuration discipline.',
      })
    } else if (fwType === 'Next-gen (supported)') {
      domains.push({
        id: 'firewall',
        title: 'Firewall Platform',
        risk: 'Low',
        finding: `A supported next-generation firewall${fw ? ` (${fw})` : ''} is in place. Maintain firmware updates, periodic rule review, logging, and security services.`,
        actions: ['Maintain firmware updates and a recurring firewall rule review process.'],
      })
    } else {
      domains.push({
        id: 'firewall',
        title: 'Firewall Platform',
        risk: 'Low',
        finding: `The firewall platform type could not be confirmed${fw ? ` (recorded: ${fw})` : ''}. Confirm whether it is a supported next-generation platform and document its update, logging, and review processes.`,
        actions: [
          'Confirm the firewall model, software version, and support status.',
          'Document a recurring review process for firewall changes and security updates.',
        ],
      })
    }
  }

  // Server and Rack Infrastructure
  {
    const server = val(d, 'server')
    const pdu = val(d, 'pdu')
    const ups = val(d, 'ups')
    if (!has(pdu) || !has(server)) {
      const finding =
        `${has(server) ? `The age and support status of the ${server} server require validation.` : 'Server lifecycle and support status could not be confirmed.'}` +
        `${!has(pdu) ? ' No rack-mounted power distribution unit (PDU) was recorded.' : ''}` +
        `${!has(ups) ? ' UPS/power protection should be verified.' : ''}` +
        ' Unknown server lifecycle increases the risk of hardware failure and replacement delays, and poor rack organization increases the chance of accidental disconnection and unmanaged exposure from legacy devices.'
      domains.push({
        id: 'server',
        title: 'Server and Rack Infrastructure',
        risk: 'Medium',
        finding,
        actions: [
          'Inventory the server: model, age, warranty status, firmware level, operating system, and business function.',
          'Establish a replacement or virtualization plan if the server is beyond normal lifecycle.',
          'Install a rack-mounted PDU and verify UPS integration.',
          'Remove, decommission, or isolate obsolete equipment and clean up rack layout and labeling.',
        ],
        indicator: 'Server/rack uses aging equipment or lacks a PDU and clean layout.',
        reason: 'Aging hardware and poor physical organization raise reliability and support concerns.',
      })
    } else {
      domains.push({
        id: 'server',
        title: 'Server and Rack Infrastructure',
        risk: 'Low',
        finding: `Server (${server}) and rack power (PDU${has(ups) ? ' and UPS' : ''}) are documented. Maintain a lifecycle plan and periodic firmware/warranty review.`,
        actions: ['Maintain a server lifecycle plan and periodic firmware/warranty review.'],
      })
    }
  }

  return domains
}

function ratingFor(high: number, medium: number): string {
  if (high >= 2) return 'Moderate-to-High'
  if (high === 1 || medium >= 3) return 'Moderate'
  if (medium >= 1) return 'Low-to-Moderate'
  return 'Low'
}

/** Join a list into an English phrase: [a,b,c] -> "a, b, and c". */
function englishList(items: string[]): string {
  const p = items.filter(Boolean)
  if (p.length === 0) return ''
  if (p.length === 1) return p[0]
  if (p.length === 2) return `${p[0]} and ${p[1]}`
  return `${p.slice(0, -1).join(', ')}, and ${p[p.length - 1]}`
}

export function buildAssessment(d: EvalData): Assessment {
  const client = has(val(d, 'clientName')) ? val(d, 'clientName') : 'The organization'
  const users = val(d, 'users')
  const devices = val(d, 'devices')
  const locations = val(d, 'locations')

  const domains = buildDomains(d)
  const high = domains.filter((x) => x.risk === 'High')
  const medium = domains.filter((x) => x.risk === 'Medium')
  const overallRating = ratingFor(high.length, medium.length)

  const scaleUsers = has(users) ? `approximately ${users} users` : 'an unspecified number of users'
  const scaleDevices = has(devices) ? ` and ${devices} devices` : ''
  const scaleLoc = has(locations) ? `${locations} location(s)` : 'multiple locations'
  const flagged = [...high, ...medium]
  const riskAreas = englishList(flagged.map((x) => x.title.toLowerCase()))

  const execSummary =
    `The ${client} network environment currently supports ${scaleUsers}${scaleDevices} across ${scaleLoc}. ` +
    `The environment is ${domainPhrase(val(d, 'domainType'))}, providing ${val(d, 'domainType') === 'Workgroup' ? 'decentralized' : 'baseline centralized'} identity and access management, but several core resilience, security, and infrastructure controls ${flagged.length ? 'require further validation or remediation' : 'were reviewed and appear reasonably managed'}.` +
    (flagged.length
      ? `\n\nThe most significant risks identified during this assessment relate to ${riskAreas}. These gaps increase exposure to service outages, ransomware, unauthorized access, and prolonged recovery times following an incident.`
      : '')

  const overall =
    `Overall, the ${client}'s network risk posture is best characterized as ${overallRating.toLowerCase()}` +
    (flagged.length
      ? `, driven by ${flagged.length} overlapping gap${flagged.length === 1 ? '' : 's'} in resilience, security, and infrastructure management that together increase the likelihood and impact of a cyber incident or prolonged outage.`
      : '. No high-severity gaps were identified, though routine validation and monitoring should continue.')

  const keyIndicators = flagged.map((x) => x.indicator!).filter(Boolean)

  const rank: Record<RiskLevel, number> = { High: 0, Medium: 1, Low: 2, Info: 3 }
  const priorities: PriorityRow[] = flagged
    .slice()
    .sort((a, b) => rank[a.risk] - rank[b.risk])
    .map((x) => ({ priority: x.risk, area: x.title, reason: x.reason! }))

  const highAreas = englishList(high.map((x) => x.title.toLowerCase()))
  const medAreas = englishList(medium.map((x) => x.title.toLowerCase()))
  const nextSteps = high.length
    ? `The ${client} should address ${highAreas} first because ${high.length === 1 ? 'it presents' : 'they present'} the most immediate cybersecurity and recovery risk.${medium.length ? ` These items should be followed by ${medAreas} to improve resilience and supportability over the next phase of remediation.` : ''}`
    : medium.length
      ? `The ${client} should prioritize ${medAreas} to improve resilience and supportability, followed by routine validation of remaining controls.`
      : `No high-priority remediation items were identified. The ${client} should maintain current controls and continue routine validation and monitoring.`

  return { execSummary, overallRating, overall, keyIndicators, domains, priorities, nextSteps }
}

/** Effective text for an assessment block, honoring manual overrides. */
export function effectiveText(d: EvalData, blockId: string, autoText: string): string {
  const override = d.assessmentText?.[blockId]
  return override !== undefined && override.trim() !== '' ? override : autoText
}
