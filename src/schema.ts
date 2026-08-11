// Field schema for the network evaluation intake form.
//
// This is the single source of truth: the form UI, the executive-summary
// generator, and the client report are all derived from it. Field keys mirror
// the intake template used for network assessments.

export type FieldType = 'text' | 'number' | 'textarea' | 'select'

export interface FieldDef {
  key: string
  label: string
  type: FieldType
  placeholder?: string
  /** Options for `select` fields. */
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
    id: 'connectivity',
    title: 'Internet & Connectivity',
    description: 'Add each internet circuit. Use “+ Add ISP” for multiple providers.',
    isp: true,
    notes: true,
    fields: [],
  },
  {
    id: 'hardware',
    title: 'Network & Infrastructure Hardware',
    description: 'Record make and model for each device class.',
    notes: true,
    fields: [
      { key: 'firewall', label: 'Firewall (Make/Model)', type: 'text', placeholder: 'e.g. Fortinet FortiGate 100F' },
      { key: 'switch', label: 'Switch (Make/Model)', type: 'text', placeholder: 'e.g. Cisco Catalyst 9200' },
      { key: 'wireless', label: 'Wireless (Make/Model)', type: 'text', placeholder: 'e.g. Ubiquiti UniFi U6-Pro' },
      { key: 'server', label: 'Server (Make/Model)', type: 'text', placeholder: 'e.g. Dell PowerEdge R650' },
      { key: 'pdu', label: 'PDU (Make/Model)', type: 'text', placeholder: 'e.g. APC AP8853' },
      { key: 'ups', label: 'UPS (Make/Model)', type: 'text', placeholder: 'e.g. APC Smart-UPS 3000' },
    ],
  },
  {
    id: 'platform',
    title: 'Virtualization & Data Protection',
    notes: true,
    fields: [
      { key: 'hypervisor', label: 'Hypervisor Solution', type: 'text', placeholder: 'e.g. VMware vSphere, Hyper-V' },
      { key: 'backup', label: 'Backup Solution', type: 'text', placeholder: 'e.g. Veeam, Datto' },
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
]

export interface IspEntry {
  provider: string
  speed: string
}

export interface EvalData {
  /** Scalar fields keyed by FieldDef.key, plus per-section notes under `notes__<sectionId>`. */
  fields: Record<string, string>
  /** Repeatable ISP circuits. */
  isps: IspEntry[]
}

/** localStorage key for section notes: notes__<sectionId>. */
export const notesKey = (sectionId: string): string => `notes__${sectionId}`

/** Flat list of every scalar field, in section order. */
export const ALL_FIELDS: FieldDef[] = SECTIONS.flatMap((s) => s.fields)

export function emptyData(): EvalData {
  const fields: Record<string, string> = {}
  for (const f of ALL_FIELDS) fields[f.key] = ''
  for (const s of SECTIONS) if (s.notes) fields[notesKey(s.id)] = ''
  return { fields, isps: [{ provider: '', speed: '' }] }
}
