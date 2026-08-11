import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SECTIONS, emptyData, notesKey, type EvalData, type IspEntry } from './schema'
import { buildGapAnalysis } from './supportPlan'
import { buildReportHtml } from './report'

const STORAGE_KEY = 'net_eval.data.v2'

type View = 'form' | 'gaps' | 'report'

function loadData(): EvalData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<EvalData>
      const base = emptyData()
      return {
        fields: { ...base.fields, ...(parsed.fields ?? {}) },
        isps: Array.isArray(parsed.isps) && parsed.isps.length ? parsed.isps : base.isps,
      }
    }
  } catch {
    /* ignore malformed storage */
  }
  return emptyData()
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function App() {
  const [data, setData] = useState<EvalData>(loadData)
  const [view, setView] = useState<View>('form')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      /* storage may be unavailable (private mode) */
    }
  }, [data])

  const updateField = useCallback((key: string, value: string) => {
    setData((prev) => ({ ...prev, fields: { ...prev.fields, [key]: value } }))
  }, [])

  const updateIsp = useCallback((index: number, patch: Partial<IspEntry>) => {
    setData((prev) => ({
      ...prev,
      isps: prev.isps.map((i, idx) => (idx === index ? { ...i, ...patch } : i)),
    }))
  }, [])

  const addIsp = useCallback(() => {
    setData((prev) => ({ ...prev, isps: [...prev.isps, { provider: '', speed: '' }] }))
  }, [])

  const removeIsp = useCallback((index: number) => {
    setData((prev) => ({
      ...prev,
      isps: prev.isps.length > 1 ? prev.isps.filter((_, idx) => idx !== index) : prev.isps,
    }))
  }, [])

  const gap = useMemo(() => buildGapAnalysis(data), [data])
  const reportHtml = useMemo(() => buildReportHtml(data, { date: todayIso() }), [data])

  const filledCount = useMemo(() => {
    const fieldCount = Object.values(data.fields).filter((v) => v.trim().length > 0).length
    const ispCount = data.isps.filter((i) => i.provider.trim() || i.speed.trim()).length
    return fieldCount + ispCount
  }, [data])

  const download = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const clientSlug =
    (data.fields.clientName || 'client').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'client'

  const exportJson = () => download(`${clientSlug}-network-evaluation.json`, JSON.stringify(data, null, 2), 'application/json')
  const exportReport = () => download(`${clientSlug}-network-evaluation-report.html`, reportHtml, 'text/html')

  const printReport = () => {
    const w = window.open('', '_blank')
    if (!w) {
      alert('Please allow pop-ups to open the printable report.')
      return
    }
    w.document.open()
    w.document.write(reportHtml)
    w.document.close()
    w.onload = () => {
      w.focus()
      w.print()
    }
  }

  const importJson = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Partial<EvalData>
        const base = emptyData()
        setData({
          fields: { ...base.fields, ...(parsed.fields ?? {}) },
          isps: Array.isArray(parsed.isps) && parsed.isps.length ? parsed.isps : base.isps,
        })
      } catch {
        alert('Could not parse that file — expected JSON exported from this tool.')
      }
    }
    reader.readAsText(file)
  }

  const resetForm = () => {
    if (confirm('Clear all fields? This cannot be undone.')) setData(emptyData())
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Network Evaluation</h1>
          <p className="subtitle">Complete the intake form, then review Peace of Mind gaps and generate a client report.</p>
        </div>
        <div className="progress" aria-label="Fields completed">
          <span className="progress-count">{filledCount}</span>
          <span className="progress-label">fields filled</span>
        </div>
      </header>

      <nav className="tabs">
        <button className={`tab ${view === 'form' ? 'active' : ''}`} onClick={() => setView('form')}>Form</button>
        <button className={`tab ${view === 'gaps' ? 'active' : ''}`} onClick={() => setView('gaps')}>
          Support Plan Gaps{gap.gaps.length ? ` (${gap.gaps.length})` : ''}
        </button>
        <button className={`tab ${view === 'report' ? 'active' : ''}`} onClick={() => setView('report')}>Client Report</button>
        <div className="tabs-spacer" />
        <button className="btn" onClick={exportJson}>Export data</button>
        <button className="btn" onClick={() => fileInput.current?.click()}>Import</button>
        <button className="btn subtle" onClick={resetForm}>Reset</button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importJson(f)
            e.target.value = ''
          }}
        />
      </nav>

      {view === 'form' && (
        <main className="form">
          {SECTIONS.map((section) => (
            <section key={section.id} className="card">
              <h2>{section.title}</h2>
              {section.description && <p className="section-desc">{section.description}</p>}

              {section.fields.length > 0 && (
                <div className="fields">
                  {section.fields.map((f) => (
                    <div key={f.key} className={`field ${f.type === 'textarea' ? 'field-wide' : ''}`}>
                      <label htmlFor={f.key}>{f.label}</label>
                      {f.type === 'textarea' ? (
                        <textarea
                          id={f.key}
                          rows={3}
                          placeholder={f.placeholder}
                          value={data.fields[f.key]}
                          onChange={(e) => updateField(f.key, e.target.value)}
                        />
                      ) : f.type === 'select' ? (
                        <select id={f.key} value={data.fields[f.key]} onChange={(e) => updateField(f.key, e.target.value)}>
                          <option value="">— Select —</option>
                          {f.options?.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id={f.key}
                          type={f.type === 'number' ? 'number' : 'text'}
                          placeholder={f.placeholder}
                          value={data.fields[f.key]}
                          onChange={(e) => updateField(f.key, e.target.value)}
                        />
                      )}
                      {f.hint && <span className="hint">{f.hint}</span>}
                    </div>
                  ))}
                </div>
              )}

              {section.isp && (
                <div className="isp-list">
                  {data.isps.map((isp, idx) => (
                    <div key={idx} className="isp-row">
                      <div className="field">
                        <label>Provider {idx + 1}</label>
                        <input
                          type="text"
                          placeholder="e.g. Comcast Business"
                          value={isp.provider}
                          onChange={(e) => updateIsp(idx, { provider: e.target.value })}
                        />
                      </div>
                      <div className="field">
                        <label>Speed</label>
                        <input
                          type="text"
                          placeholder="e.g. 1 Gbps fiber"
                          value={isp.speed}
                          onChange={(e) => updateIsp(idx, { speed: e.target.value })}
                        />
                      </div>
                      <button
                        className="btn subtle isp-remove"
                        onClick={() => removeIsp(idx)}
                        disabled={data.isps.length <= 1}
                        title="Remove this ISP"
                        aria-label="Remove ISP"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button className="btn add-isp" onClick={addIsp}>+ Add ISP</button>
                </div>
              )}

              {section.notes && (
                <div className="field field-wide section-notes">
                  <label htmlFor={notesKey(section.id)}>Section Notes</label>
                  <textarea
                    id={notesKey(section.id)}
                    rows={2}
                    placeholder="Notes for this section (included in the report)"
                    value={data.fields[notesKey(section.id)] ?? ''}
                    onChange={(e) => updateField(notesKey(section.id), e.target.value)}
                  />
                </div>
              )}
            </section>
          ))}
        </main>
      )}

      {view === 'gaps' && (
        <main className="gaps-view">
          <section className="card">
            <h2>Peace of Mind Support Plan — Gap Analysis</h2>
            <div className="rec-banner">
              <strong>{gap.gaps.length}</strong> managed-security gap{gap.gaps.length === 1 ? '' : 's'} identified. Suggested
              starting plan: <strong>{gap.recommendedTier}</strong>.
            </div>
            <p className="section-desc">{gap.rationale}</p>
            <table className="ga-table">
              <thead>
                <tr><th>Managed Control</th><th>Current State</th><th>Status</th></tr>
              </thead>
              <tbody>
                {gap.coverage.map((r) => (
                  <tr key={r.control}>
                    <td>
                      {r.control}
                      <span className="ga-cat">{r.category}</span>
                    </td>
                    <td>{r.currentState}</td>
                    <td>
                      <span className={`ga-pill ${r.status === 'gap' ? 'gap' : 'ok'}`}>
                        {r.status === 'gap' ? 'Gap' : 'In place'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {gap.advisories.length > 0 && (
            <section className="card observations">
              <h2>Resilience & Best-Practice Notes</h2>
              <ul>
                {gap.advisories.map((a, i) => (
                  <li key={i} className={`obs obs-${a.severity}`}>
                    <span className="obs-tag">{a.severity}</span>
                    {a.text}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <h2>Enterprise Managed Hardware</h2>
            <p className="section-desc">Optional upgrade — fold this hardware into Elevated Managed Hardware under the Enterprise plan.</p>
            <table className="ga-table">
              <tbody>
                {gap.managedHardware.map((h) => (
                  <tr key={h.item}>
                    <td>{h.item}</td>
                    <td>Current: {h.currentState}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </main>
      )}

      {view === 'report' && (
        <main className="report-view">
          <section className="card">
            <div className="summary-actions">
              <h2>Client Report</h2>
              <div className="summary-buttons">
                <button className="btn primary" onClick={printReport}>Print / Save as PDF</button>
                <button className="btn" onClick={exportReport}>Download .html</button>
              </div>
            </div>
            <p className="section-desc">
              Client-presentable report with the Peace of Mind gap analysis. Use “Print / Save as PDF” for a PDF deliverable, or
              download the standalone HTML.
            </p>
            <iframe className="report-preview" title="Client report preview" srcDoc={reportHtml} />
          </section>
        </main>
      )}

      <footer className="app-footer">Data stays in your browser (localStorage). Export before switching devices.</footer>
    </div>
  )
}
