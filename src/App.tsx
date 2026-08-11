import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SECTIONS, emptyForm, type FormData } from './schema'
import { buildObservations, buildSummary } from './summary'

const STORAGE_KEY = 'net_eval.form.v1'

function loadForm(): FormData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...emptyForm(), ...JSON.parse(raw) }
  } catch {
    /* ignore malformed storage */
  }
  return emptyForm()
}

export default function App() {
  const [data, setData] = useState<FormData>(loadForm)
  const [showSummary, setShowSummary] = useState(false)
  const [copied, setCopied] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // Autosave to localStorage.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      /* storage may be unavailable (private mode) */
    }
  }, [data])

  const update = useCallback((key: string, value: string) => {
    setData((prev) => ({ ...prev, [key]: value }))
  }, [])

  const summary = useMemo(() => buildSummary(data), [data])
  const observations = useMemo(() => buildObservations(data), [data])

  const filledCount = useMemo(
    () => Object.values(data).filter((v) => v.trim().length > 0).length,
    [data],
  )
  const totalCount = Object.keys(data).length

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summary)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked — user can select manually */
    }
  }

  const downloadFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportJson = () => downloadFile('network-evaluation.json', JSON.stringify(data, null, 2), 'application/json')
  const exportSummary = () => downloadFile('executive-summary.txt', summary, 'text/plain')

  const importJson = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        setData({ ...emptyForm(), ...parsed })
      } catch {
        alert('Could not parse that file — expected JSON exported from this tool.')
      }
    }
    reader.readAsText(file)
  }

  const resetForm = () => {
    if (confirm('Clear all fields? This cannot be undone.')) setData(emptyForm())
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Network Evaluation</h1>
          <p className="subtitle">Complete the intake form, then generate an executive summary.</p>
        </div>
        <div className="progress" aria-label="Fields completed">
          <span className="progress-count">{filledCount}/{totalCount}</span>
          <span className="progress-label">fields</span>
        </div>
      </header>

      <div className="toolbar no-print">
        <button className="btn primary" onClick={() => setShowSummary((s) => !s)}>
          {showSummary ? 'Back to form' : 'Generate summary'}
        </button>
        <button className="btn" onClick={exportJson}>Export data (JSON)</button>
        <button className="btn" onClick={() => fileInput.current?.click()}>Import data</button>
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
      </div>

      {!showSummary ? (
        <main className="form">
          {SECTIONS.map((section) => (
            <section key={section.id} className="card">
              <h2>{section.title}</h2>
              {section.description && <p className="section-desc">{section.description}</p>}
              <div className="fields">
                {section.fields.map((f) => (
                  <div key={f.key} className={`field ${f.type === 'textarea' ? 'field-wide' : ''}`}>
                    <label htmlFor={f.key}>{f.label}</label>
                    {f.type === 'textarea' ? (
                      <textarea
                        id={f.key}
                        rows={3}
                        placeholder={f.placeholder}
                        value={data[f.key]}
                        onChange={(e) => update(f.key, e.target.value)}
                      />
                    ) : (
                      <input
                        id={f.key}
                        type={f.type === 'number' ? 'number' : 'text'}
                        placeholder={f.placeholder}
                        value={data[f.key]}
                        onChange={(e) => update(f.key, e.target.value)}
                      />
                    )}
                    {f.hint && <span className="hint">{f.hint}</span>}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </main>
      ) : (
        <main className="summary-view">
          {observations.length > 0 && (
            <section className="card observations no-print">
              <h2>Observations</h2>
              <ul>
                {observations.map((o, i) => (
                  <li key={i} className={`obs obs-${o.severity}`}>
                    <span className="obs-tag">{o.severity}</span>
                    {o.text}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <div className="summary-actions no-print">
              <h2>Executive Summary</h2>
              <div className="summary-buttons">
                <button className="btn" onClick={copySummary}>{copied ? 'Copied!' : 'Copy'}</button>
                <button className="btn" onClick={exportSummary}>Download .txt</button>
                <button className="btn" onClick={() => window.print()}>Print / PDF</button>
              </div>
            </div>
            <pre className="summary-text">{summary}</pre>
          </section>
        </main>
      )}

      <footer className="app-footer no-print">
        Data stays in your browser (localStorage). Export before switching devices.
      </footer>
    </div>
  )
}
