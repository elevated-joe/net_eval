// Field schema for the network evaluation intake form.
//
// This is the single source of truth: the form UI, the executive-summary
// generator, and the client report are all derived from it. Field keys mirror
// the intake template used for network assessments.

export type FieldType = 'text' | 'number' | 'textarea' | 'select' | 'checklist'

export interface FieldDef {
  key: string
  label: string
  type: FieldType
  placeholder?: string
  /** Options for `select` and `checklist` fields. */
  options?: string[]
  /** Optional short helper shown under the input. */
  hint?: string
}

export interface SectionDef {
  id: string
  title: string
  description?: string
  fields: FieldDef[]
  /** Render the repeatable ISP editor in this section. */
  isp?: boolean
  /** Render the image-upload editor in this section. */
  images?: boolean
  /** Show a free-text notes box for this section. */
  notes?: boolean
}

export const COMPLIANCE_OPTIONS = [
  'None',
  'HIPAA',
  'PCI-DSS',
  'SOC 2',
  'ISO 27001',
  'NIST 800-171 / CMMC',
  'GDPR',
  'GLBA',
  'FERPA',
  'SOX',
  'Other',
]

export const M365_SERVICES = ['Exchange', 'SharePoint', 'Teams', 'Intune', 'MDM', 'OneDrive']
export const DOMAIN_OPTIONS = ['Domain', 'Entra ID (Azure AD)', 'Hybrid (AD + Entra)', 'Workgroup']
export const MFA_COVERAGE_OPTIONS = ['All services', 'Webmail only', 'Partial', 'None', 'Unknown']
export const FIREWALL_TYPE_OPTIONS = ['Next-gen (supported)', 'Open-source', 'Unknown']
export const YES_NO_UNKNOWN = ['Yes', 'No', 'Unknown']
export const HARDWARE_CONDITION_OPTIONS = ['Current', 'Mixed', 'Aging', 'End-of-life', 'Unknown']
export const PATCH_MGMT_OPTIONS = ['Actively managed', 'Ad-hoc', 'Unmanaged', 'Unknown']

/** Parse a checklist field's comma-separated value into selected options. */
export function parseChecklist(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export const SECTIONS: SectionDef[] = [
  {
    id: 'client',
    title: 'Client & Engagement',
    description: 'Identifies the client this evaluation is prepared for.',
    notes: true,
    fields: [
      { key: 'clientName', label: 'Client Name', type: 'text', placeholder: 'e.g. Acme Corporation' },
      { key: 'preparedBy', label: 'Prepared By', type: 'text', placeholder: 'Your name / company' },
      { key: 'evaluationDate', label: 'Evaluation Date', type: 'text', placeholder: 'e.g. 2026-08-11 (defaults to today)' },
    ],
  },
  {
    id: 'organization',
    title: 'Organization Overview',
    description: 'Scale and regulatory footprint of the environment.',
    notes: true,
    fields: [
      { key: 'locations', label: 'Number of locations', type: 'number', placeholder: 'e.g. 3' },
      { key: 'users', label: 'Number of users', type: 'number', placeholder: 'e.g. 120' },
      { key: 'devices', label: 'Number of devices', type: 'number', placeholder: 'e.g. 180' },
      {
        key: 'compliance',
        label: 'Compliance Requirements',
        type: 'select',
        options: COMPLIANCE_OPTIONS,
        hint: 'Primary regulatory framework the environment must satisfy.',
      },
    ],
  },
  {
    id: 'identity',
    title: 'Identity & Microsoft 365',
    description: 'Directory model, cloud services in use, and MFA coverage.',
    notes: true,
    fields: [
      {
        key: 'domainType',
        label: 'Domain / Entra / Workgroup',
        type: 'select',
        options: DOMAIN_OPTIONS,
      },
      {
        key: 'm365Services',
        label: 'Microsoft 365 Services Utilized',
        type: 'checklist',
        options: M365_SERVICES,
      },
      { key: 'm365Other', label: 'Other M365 Services', type: 'text', placeholder: 'e.g. Power BI, Bookings' },
      { key: 'm365Licensing', label: 'Microsoft 365 Licensing', type: 'text', placeholder: 'e.g. Business Premium, Apps for business' },
      {
        key: 'mfaCoverage',
        label: 'MFA Coverage',
        type: 'select',
        options: MFA_COVERAGE_OPTIONS,
        hint: 'How broadly MFA is enforced across Microsoft 365.',
      },
    ],
  },
  {
    id: 'connectivity',
    title: 'Internet & Connectivity',
    description: 'Add each internet circuit. Use “+ Add ISP” for multiple providers.',
    isp: true,
    notes: true,
    fields: [
      { key: 'failover', label: 'Automatic Failover Configured', type: 'select', options: YES_NO_UNKNOWN },
    ],
  },
  {
    id: 'hardware',
    title: 'Network & Infrastructure Hardware',
    description: 'Record make and model for each device class.',
    notes: true,
    fields: [
      { key: 'firewall', label: 'Firewall (Make/Model)', type: 'text', placeholder: 'e.g. Fortinet FortiGate 100F' },
      { key: 'firewallType', label: 'Firewall Platform Type', type: 'select', options: FIREWALL_TYPE_OPTIONS },
      { key: 'switch', label: 'Switch (Make/Model)', type: 'text', placeholder: 'e.g. Cisco Catalyst 9200' },
      { key: 'wireless', label: 'Wireless (Make/Model)', type: 'text', placeholder: 'e.g. Ubiquiti UniFi U6-Pro' },
      { key: 'server', label: 'Server (Make/Model)', type: 'text', placeholder: 'e.g. Dell PowerEdge R650' },
      { key: 'pdu', label: 'PDU (Make/Model)', type: 'text', placeholder: 'e.g. APC AP8853' },
      { key: 'ups', label: 'UPS (Make/Model)', type: 'text', placeholder: 'e.g. APC Smart-UPS 3000' },
      {
        key: 'hardwareCondition',
        label: 'Overall Hardware Condition',
        type: 'select',
        options: HARDWARE_CONDITION_OPTIONS,
        hint: 'General age/support status of the network hardware.',
      },
    ],
  },
  {
    id: 'platform',
    title: 'Virtualization & Data Protection',
    notes: true,
    fields: [
      { key: 'hypervisor', label: 'Hypervisor Solution', type: 'text', placeholder: 'e.g. VMware vSphere, Hyper-V' },
      { key: 'backup', label: 'Backup Solution', type: 'text', placeholder: 'e.g. Veeam, Datto' },
      { key: 'backupTested', label: 'Restore Testing Verified', type: 'select', options: YES_NO_UNKNOWN },
      { key: 'backupOffsite', label: 'Offsite / Immutable Copy', type: 'select', options: YES_NO_UNKNOWN },
    ],
  },
  {
    id: 'security',
    title: 'Email & Security',
    notes: true,
    fields: [
      { key: 'email', label: 'Email Solution', type: 'text', placeholder: 'e.g. Microsoft 365, Google Workspace' },
      { key: 'spam', label: 'Spam Solution', type: 'text', placeholder: 'e.g. Proofpoint, Mimecast' },
      { key: 'mfa', label: 'MFA Solution', type: 'text', placeholder: 'e.g. Duo, Microsoft Authenticator' },
      { key: 'av', label: 'AV / Endpoint Solution', type: 'text', placeholder: 'e.g. SentinelOne, CrowdStrike' },
      { key: 'contentFilter', label: 'Content Filtering Solution', type: 'text', placeholder: 'e.g. Cisco Umbrella' },
      { key: 'training', label: 'End-user Training', type: 'text', placeholder: 'e.g. KnowBe4' },
      { key: 'patchManagement', label: 'Patch Management', type: 'select', options: PATCH_MGMT_OPTIONS },
      { key: 'remoteAccess', label: 'Remote Access Methods', type: 'text', placeholder: 'e.g. VPN, RDP, jump box' },
      { key: 'remoteAccessMfa', label: 'Remote Access MFA', type: 'select', options: YES_NO_UNKNOWN },
    ],
  },
  {
    id: 'tools',
    title: 'Management & Business Tools',
    notes: true,
    fields: [
      { key: 'remoteTools', label: 'Remote Tools', type: 'text', placeholder: 'e.g. ConnectWise, TeamViewer' },
      {
        key: 'lobTools',
        label: 'Line-of-Business (LOB) Tools',
        type: 'textarea',
        placeholder: 'Key applications the business depends on',
      },
    ],
  },
  {
    id: 'business',
    title: 'Business Context',
    description: 'Operational and commercial background for the assessment.',
    notes: true,
    fields: [
      { key: 'industry', label: 'Industry', type: 'text', placeholder: 'e.g. Healthcare' },
      { key: 'operationHours', label: 'Operation Hours', type: 'text', placeholder: 'e.g. Mon–Fri 8am–6pm' },
      { key: 'physicalSecurity', label: 'Physical Security', type: 'text', placeholder: 'e.g. Badge access, cameras' },
      { key: 'currentProvider', label: 'Current Provider (Network)', type: 'text', placeholder: 'e.g. In-house / MSP name' },
      { key: 'budget', label: 'Budget', type: 'text', placeholder: 'e.g. $50k annual' },
      { key: 'fiscalYear', label: 'Fiscal Year', type: 'text', placeholder: 'e.g. Jan–Dec' },
    ],
  },
  {
    id: 'images',
    title: 'Photos & Diagrams',
    description: 'Upload network diagrams, rack photos, or screenshots to include in the report.',
    images: true,
    fields: [],
  },
]

export interface IspEntry {
  provider: string
  speed: string
}

export interface ReportImage {
  id: string
  name: string
  caption: string
  /** Downscaled image encoded as a data URL, so the report stays self-contained. */
  dataUrl: string
}

export interface EvalData {
  /** Scalar fields keyed by FieldDef.key, plus per-section notes under `notes__<sectionId>`. */
  fields: Record<string, string>
  /** Repeatable ISP circuits. */
  isps: IspEntry[]
  /** Images embedded into the client report. */
  images: ReportImage[]
  /** Manual edits to auto-drafted assessment text, keyed by block id (e.g. 'exec', 'finding__backup'). */
  assessmentText: Record<string, string>
}

/** localStorage key for section notes: notes__<sectionId>. */
export const notesKey = (sectionId: string): string => `notes__${sectionId}`

/** Flat list of every scalar field, in section order. */
export const ALL_FIELDS: FieldDef[] = SECTIONS.flatMap((s) => s.fields)

export function emptyData(): EvalData {
  const fields: Record<string, string> = {}
  for (const f of ALL_FIELDS) fields[f.key] = ''
  for (const s of SECTIONS) if (s.notes) fields[notesKey(s.id)] = ''
  return { fields, isps: [{ provider: '', speed: '' }], images: [], assessmentText: {} }
}

/** ISP entries that have at least a provider or a speed filled in. */
export function activeIsps(d: EvalData): IspEntry[] {
  return d.isps.filter((i) => (i.provider ?? '').trim() !== '' || (i.speed ?? '').trim() !== '')
}
