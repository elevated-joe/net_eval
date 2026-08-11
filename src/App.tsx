import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SECTIONS, emptyData, notesKey, type EvalData, type IspEntry, type ReportImage } from './schema'
import { buildReportHtml } from './report'

const STORAGE_KEY = 'net_eval.data.v2'
const MAX_IMAGE_DIM = 1600

type View = 'form' | 'report'

function hydrate(parsed: Partial<EvalData>): EvalData {
  const base = emptyData()
  return {
    fields: { ...base.fields, ...(parsed.fields ?? {}) },
    isps: Array.isArray(parsed.isps) && parsed.isps.length ? parsed.isps : base.isps,
    images: Array.isArray(parsed.images) ? parsed.images : base.images,
  }
}

function loadData(): EvalData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return hydrate(JSON.parse(raw) as Partial<EvalData>)
  } catch {
    /* ignore malformed storage */
  }
  return emptyData()
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Read an image file, downscale to a max dimension, and encode as a data URL. */
function processImageFile(file: File): Promise<ReportImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read failed'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('decode failed'))
      img.onload = () => {
        let { width, height } = img
        if (width > MAX_IMAGE_DIM || height > MAX_IMAGE_DIM) {
          const scale = MAX_IMAGE_DIM / Math.max(width, height)
          width = Math.round(width * scale)
          height = Math.round(height * scale)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('no canvas context'))
          return
        }
        ctx.drawImage(img, 0, 0, width, height)
        const dataUrl =
          file.type === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85)
        resolve({
          id: `${Date.now()}-${Math.round(Math.random() * 1e6)}`,
          name: file.name,
          caption: '',
          dataUrl,
        })
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

export default function App() {
  const [data, setData] = useState<EvalData>(loadData)
  const [view, setView] = useState<View>('form')
  const fileInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      /* storage may be unavailable or full (e.g. many large images) */
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

  const addImages = useCallback(async (files: FileList) => {
    const processed: ReportImage[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      try {
        processed.push(await processImageFile(file))
      } catch {
        /* skip files that fail to decode */
      }
    }
    if (processed.length) setData((prev) => ({ ...prev, images: [...prev.images, ...processed] }))
  }, [])

  const updateImageCaption = useCallback((id: string, caption: string) => {
    setData((prev) => ({ ...prev, images: prev.images.map((im) => (im.id === id ? { ...im, caption } : im)) }))
  }, [])

  const removeImage = useCallback((id: string) => {
    setData((prev) => ({ ...prev, images: prev.images.filter((im) => im.id !== id) }))
  }, [])

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
        setData(hydrate(JSON.parse(String(reader.result)) as Partial<EvalData>))
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
          <p className="subtitle">Complete the intake form, then generate a client-ready report.</p>
        </div>
        <div className="progress" aria-label="Fields completed">
          <span className="progress-count">{filledCount}</span>
          <span className="progress-label">fields filled</span>
        </div>
      </header>

      <nav className="tabs">
        <button className={`tab ${view === 'form' ? 'active' : ''}`} onClick={() => setView('form')}>Form</button>
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

              {section.images && (
                <div className="image-manager">
                  {data.images.length > 0 && (
                    <div className="image-grid">
                      {data.images.map((im) => (
                        <div key={im.id} className="image-item">
                          <div className="image-thumb-wrap">
                            <img className="image-thumb" src={im.dataUrl} alt={im.caption || im.name} />
                            <button
                              className="btn subtle image-remove"
                              onClick={() => removeImage(im.id)}
                              title="Remove image"
                              aria-label="Remove image"
                            >
                              ✕
                            </button>
                          </div>
                          <input
                            type="text"
                            className="image-caption"
                            placeholder="Caption (optional)"
                            value={im.caption}
                            onChange={(e) => updateImageCaption(im.id, e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  <button className="btn add-isp" onClick={() => imageInput.current?.click()}>+ Add images</button>
                  <input
                    ref={imageInput}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={(e) => {
                      if (e.target.files?.length) void addImages(e.target.files)
                      e.target.value = ''
                    }}
                  />
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
              Client-presentable report with your evaluation data and any uploaded photos/diagrams. Use “Print / Save as PDF” for
              a PDF deliverable, or download the standalone HTML.
            </p>
            <iframe className="report-preview" title="Client report preview" srcDoc={reportHtml} />
          </section>
        </main>
      )}

      <footer className="app-footer">Data stays in your browser (localStorage). Export before switching devices.</footer>
    </div>
  )
}
