// Field schema for the network evaluation intake form.
//
// This is the single source of truth: the form UI and the executive-summary
// generator are both derived from it. Field keys mirror the intake template
// used for network assessments.

export type FieldType = 'text' | 'number' | 'textarea'

export interface FieldDef {
  key: string
  label: string
  type: FieldType
  placeholder?: string
  /** Optional short helper shown under the input. */
  hint?: string
}

export interface SectionDef {
  id: string
  title: string
  description?: string
  fields: FieldDef[]
}

export const SECTIONS: SectionDef[] = [
  {
    id: 'organization',
    title: 'Organization Overview',
    description: 'Scale and regulatory footprint of the environment.',
    fields: [
      { key: 'locations', label: 'Number of locations', type: 'number', placeholder: 'e.g. 3' },
      { key: 'users', label: 'Number of users', type: 'number', placeholder: 'e.g. 120' },
      { key: 'devices', label: 'Number of devices', type: 'number', placeholder: 'e.g. 180' },
      {
        key: 'compliance',
        label: 'Compliance Requirements',
        type: 'text',
        placeholder: 'e.g. HIPAA, PCI-DSS, CMMC',
        hint: 'Regulatory frameworks the environment must satisfy.',
      },
    ],
  },
  {
    id: 'connectivity',
    title: 'Internet & Connectivity',
    fields: [
      { key: 'ispCount', label: 'How many ISP providers', type: 'number', placeholder: 'e.g. 2' },
      {
        key: 'ispSpeed',
        label: 'Speed of ISP providers',
        type: 'text',
        placeholder: 'e.g. 1 Gbps fiber + 500 Mbps cable',
      },
    ],
  },
  {
    id: 'hardware',
    title: 'Network & Infrastructure Hardware',
    description: 'Record make and model for each device class.',
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
    fields: [
      { key: 'hypervisor', label: 'Hypervisor Solution', type: 'text', placeholder: 'e.g. VMware vSphere, Hyper-V' },
      { key: 'backup', label: 'Backup Solution', type: 'text', placeholder: 'e.g. Veeam, Datto' },
    ],
  },
  {
    id: 'security',
    title: 'Email & Security',
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
    fields: [
      { key: 'industry', label: 'Industry', type: 'text', placeholder: 'e.g. Healthcare' },
      { key: 'operationHours', label: 'Operation Hours', type: 'text', placeholder: 'e.g. Mon–Fri 8am–6pm' },
      { key: 'physicalSecurity', label: 'Physical Security', type: 'text', placeholder: 'e.g. Badge access, cameras' },
      { key: 'currentProvider', label: 'Current Provider (Network)', type: 'text', placeholder: 'e.g. In-house / MSP name' },
      { key: 'budget', label: 'Budget', type: 'text', placeholder: 'e.g. $50k annual' },
      { key: 'fiscalYear', label: 'Fiscal Year', type: 'text', placeholder: 'e.g. Jan–Dec' },
      { key: 'misc', label: 'Additional Notes', type: 'textarea', placeholder: 'Anything else relevant to the evaluation' },
    ],
  },
]

/** Flat list of every field key, in section order. */
export const ALL_FIELDS: FieldDef[] = SECTIONS.flatMap((s) => s.fields)

export type FormData = Record<string, string>

export function emptyForm(): FormData {
  const data: FormData = {}
  for (const f of ALL_FIELDS) data[f.key] = ''
  return data
}
