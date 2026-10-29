import { describe, expect, it } from 'vitest'
import { voiceIssues } from './aiAnalysis'
import { buildAssessment } from './assessment'
import { emptyData, type EvalData } from './schema'

describe('voiceIssues', () => {
  it('catches copy that addresses the reader or speaks as the assessor', () => {
    const drifted =
      'Your internet service appears to be a single connection. We recommend reviewing your Comcast circuit.'
    expect(voiceIssues(drifted, '')).toEqual([
      'second person ("you"/"your")',
      'first person ("we"/"our")',
    ])
  })

  it('catches wording that steers toward a service plan', () => {
    expect(voiceIssues('A co-managed arrangement would supplement the internal team.', '')).toContain(
      'plan wording ("co-managed")',
    )
    expect(voiceIssues('This is covered by the Peace of Mind support plan.', '')).toContain(
      'plan name ("Peace of Mind")',
    )
    expect(voiceIssues('Fully managed endpoint coverage would close this.', '')).toContain(
      'plan wording ("fully managed")',
    )
  })

  it('catches the assessor named in the body of a finding', () => {
    expect(voiceIssues('Northstar IT reviewed the firewall rules.', 'Northstar IT')).toContain(
      'the assessor\'s name ("Northstar IT")',
    )
    // A name that was never entered cannot be matched, and short names are skipped.
    expect(voiceIssues('Northstar IT reviewed the firewall rules.', '')).toEqual([])
  })

  it('passes neutral copy', () => {
    expect(
      voiceIssues(
        'Internet service runs on a single connection. Adding a second circuit with automatic failover is recommended.',
        'Northstar IT',
      ),
    ).toEqual([])
  })

  // The detector must not fire on the rule-based baseline, or every run would
  // warn. Covers a populated intake and an empty one, every generated block.
  it('finds nothing in the rule-based assessment', () => {
    const filled = emptyData()
    Object.assign(filled.fields, {
      clientName: 'Harbor Dental Group',
      users: '42',
      devices: '55',
      locations: '2',
      industry: 'Healthcare',
      compliance: 'HIPAA',
      domainType: 'Hybrid (AD + Entra)',
      mfaCoverage: 'Webmail only',
      failover: 'No',
      hardwareCondition: 'Aging',
      backup: 'Datto',
      backupTested: 'No',
      av: 'Defender',
      patchManagement: 'Ad hoc',
      remoteAccess: 'RDP',
      remoteAccessMfa: 'No',
      lobTools: 'Dentrix',
      notes__security: 'Front desk received a spoofed invoice email last month.',
    })

    const blocksOf = (d: EvalData): string[] => {
      const a = buildAssessment(d)
      return [
        a.execSummary,
        a.overall,
        a.nextSteps,
        ...a.keyIndicators,
        ...a.priorities.map((p) => p.reason),
        ...a.sections.flatMap((s) => [s.clientRecommendation, s.finding, ...s.actions]),
      ]
    }

    for (const d of [filled, emptyData()]) {
      for (const text of blocksOf(d)) {
        // 'Northstar IT' is the assessor here, not the client — the client's
        // own name is expected in the summary copy and must not be flagged.
        expect(voiceIssues(text, 'Northstar IT')).toEqual([])
      }
    }
  })
})
