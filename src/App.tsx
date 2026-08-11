import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  SECTIONS,
  emptyData,
  notesKey,
  parseChecklist,
  type EvalData,
  type IspEntry,
  type ReportImage,
} from './schema'
import { buildReportHtml } from './report'
import { buildAssessment, RATINGS, ASSESSMENT_SECTIONS } from './assessment'
import { buildAssessmentHtml } from './assessmentReport'
import { runAiAnalysis, AI_MODELS } from './aiAnalysis'
import { DEFAULT_LOGO } from './brand'

const AI_KEY_STORAGE = 'net_eval.ai.key'
const AI_MODEL_STORAGE = 'net_eval.ai.model'
// Company logo lives in its own storage slot (not in EvalData) so it persists
// across clients and Reset, and is excluded from per-client JSON export.
const LOGO_STORAGE = 'net_eval.brand.logo'

const STORAGE_KEY = 'net_eval.data.v2'
const MAX_IMAGE_DIM = 1600
const MAX_LOGO_DIM = 600

type View = 'form' | 'report' | 'assessment'

function hydrate(parsed: Partial<EvalData>): EvalData {
  const base = emptyData()
  const images: ReportImage[] = Array.isArray(parsed.images)
    ? parsed.images.map((im) => ({
        id: im.id,
        name: im.name,
        caption: im.caption ?? '',
        dataUrl: im.dataUrl,
        inAssessment: typeof im.inAssessment === 'boolean' ? im.inAssessment : false,
        section: typeof im.section === 'string' ? im.section : '',
      }))
    : base.images
  return {
    fields: { ...base.fields, ...(parsed.fields ?? {}) },
    isps: Array.isArray(parsed.isps) && parsed.isps.length ? parsed.isps : base.isps,
    images,
    assessmentText:
      parsed.assessmentText && typeof parsed.assessmentText === 'object' ? parsed.assessmentText : base.assessmentText,
    hiddenSections: Array.isArray(parsed.hiddenSections) ? parsed.hiddenSections : base.hiddenSections,
    reportOptions: {
      coverPage: parsed.reportOptions?.coverPage ?? base.reportOptions.coverPage,
      techDetail: parsed.reportOptions?.techDetail ?? base.reportOptions.techDetail,
    },
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
          inAssessment: false,
          section: '',
        })
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

/** Read a logo image, downscale it, and return a data URL (PNG kept for transparency). */
function processLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read failed'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('decode failed'))
      img.onload = () => {
        let { width, height } = img
        if (width > MAX_LOGO_DIM || height > MAX_LOGO_DIM) {
          const scale = MAX_LOGO_DIM / Math.max(width, height)
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
        // Keep PNG for logos (preserves transparency); JPEG only for photos.
        resolve(file.type === 'image/jpeg' ? canvas.toDataURL('image/jpeg', 0.9) : canvas.toDataURL('image/png'))
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
  const logoInput = useRef<HTMLInputElement>(null)

  // Company logo (data URL). Absent storage → ship the default; empty string → no logo.
  const [logo, setLogo] = useState<string>(() => {
    const v = localStorage.getItem(LOGO_STORAGE)
    return v === null ? DEFAULT_LOGO : v
  })

  // Optional AI analysis. The API key lives in its own storage slot — never in
  // EvalData — so it is excluded from JSON export.
  const [aiKey, setAiKey] = useState<string>(() => localStorage.getItem(AI_KEY_STORAGE) ?? '')
  const [aiModel, setAiModel] = useState<string>(() => localStorage.getItem(AI_MODEL_STORAGE) ?? AI_MODELS[0].id)
  const [aiStatus, setAiStatus] = useState<{ state: 'idle' | 'running' | 'done' | 'error'; message?: string }>({
    state: 'idle',
  })
  const [pdfBusy, setPdfBusy] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      /* storage may be unavailable or full (e.g. many large images) */
    }
  }, [data])

  useEffect(() => {
    try {
      localStorage.setItem(LOGO_STORAGE, logo)
    } catch {
      /* storage may be unavailable or full */
    }
  }, [logo])

  const uploadLogo = useCallback(async (file: File) => {
    try {
      setLogo(await processLogoFile(file))
    } catch {
      alert('Could not read that image. Please try a PNG, JPG, or SVG file.')
    }
  }, [])

  const updateField = useCallback((key: string, value: string) => {
    setData((prev) => ({ ...prev, fields: { ...prev.fields, [key]: value } }))
  }, [])

  const toggleChecklist = useCallback((key: string, option: string) => {
    setData((prev) => {
      const current = parseChecklist(prev.fields[key])
      const next = current.includes(option) ? current.filter((o) => o !== option) : [...current, option]
      return { ...prev, fields: { ...prev.fields, [key]: next.join(', ') } }
    })
  }, [])

  const setAssessmentOverride = useCallback((blockId: string, value: string) => {
    setData((prev) => ({ ...prev, assessmentText: { ...prev.assessmentText, [blockId]: value } }))
  }, [])

  const clearAssessmentOverride = useCallback((blockId: string) => {
    setData((prev) => {
      const next = { ...prev.assessmentText }
      delete next[blockId]
      return { ...prev, assessmentText: next }
    })
  }, [])

  const runAi = useCallback(async () => {
    const key = aiKey.trim()
    if (!key) {
      setAiStatus({ state: 'error', message: 'Enter an Anthropic API key first.' })
      return
    }
    localStorage.setItem(AI_KEY_STORAGE, key)
    localStorage.setItem(AI_MODEL_STORAGE, aiModel)
    setAiStatus({ state: 'running' })
    try {
      const overrides = await runAiAnalysis(data, { apiKey: key, model: aiModel })
      setData((prev) => ({ ...prev, assessmentText: { ...prev.assessmentText, ...overrides } }))
      setAiStatus({ state: 'done', message: 'AI analysis applied. Every section is still editable below.' })
    } catch (e) {
      setAiStatus({ state: 'error', message: e instanceof Error ? e.message : 'AI analysis failed.' })
    }
  }, [aiKey, aiModel, data])

  const clearAllOverrides = useCallback(() => {
    if (confirm('Clear all AI/manual edits and rating overrides, returning to the auto-drafted assessment?')) {
      setData((prev) => ({ ...prev, assessmentText: {} }))
      setAiStatus({ state: 'idle' })
    }
  }, [])

  const toggleHiddenSection = useCallback((id: string) => {
    setData((prev) => {
      const hidden = prev.hiddenSections.includes(id)
        ? prev.hiddenSections.filter((x) => x !== id)
        : [...prev.hiddenSections, id]
      return { ...prev, hiddenSections: hidden }
    })
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

  const updateImage = useCallback((id: string, patch: Partial<ReportImage>) => {
    setData((prev) => ({ ...prev, images: prev.images.map((im) => (im.id === id ? { ...im, ...patch } : im)) }))
  }, [])

  const removeImage = useCallback((id: string) => {
    setData((prev) => ({ ...prev, images: prev.images.filter((im) => im.id !== id) }))
  }, [])

  const setReportOption = useCallback((patch: Partial<EvalData['reportOptions']>) => {
    setData((prev) => ({ ...prev, reportOptions: { ...prev.reportOptions, ...patch } }))
  }, [])

  const reportHtml = useMemo(() => buildReportHtml(data, { date: todayIso(), logo }), [data, logo])
  const assessment = useMemo(() => buildAssessment(data), [data])
  const assessmentHtml = useMemo(() => buildAssessmentHtml(data, { date: todayIso(), logo }), [data, logo])

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

  // Export file name: "<Report Name> - <Client Name>.pdf" (illegal path
  // characters stripped, whitespace collapsed).
  const clientName = ((data.fields.clientName ?? '').trim() || 'Client')
  const pdfFilename = (reportName: string) => {
    const clean = (s: string) => s.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim()
    return `${clean(reportName)} - ${clean(clientName)}.pdf`
  }

  const exportJson = () => download(`${clientSlug}-network-evaluation.json`, JSON.stringify(data, null, 2), 'application/json')

  const exportPdf = async (html: string, filename: string) => {
    // Generate the PDF entirely in the browser and download it directly — no
    // print dialog and no new tab, so it works the same on desktop and mobile.
    if (pdfBusy) return
    setPdfBusy(true)
    try {
      // Load the PDF engine (jspdf + html2canvas) on demand to keep initial load light.
      const { exportHtmlAsPdf } = await import('./pdf')
      await exportHtmlAsPdf(html, filename)
    } catch (err) {
      alert(`Could not generate the PDF: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setPdfBusy(false)
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
      </header>

      <nav className="tabs">
        <button className={`tab ${view === 'form' ? 'active' : ''}`} onClick={() => setView('form')}>Form</button>
        <button className={`tab ${view === 'report' ? 'active' : ''}`} onClick={() => setView('report')}>Internal Report</button>
        <button className={`tab ${view === 'assessment' ? 'active' : ''}`} onClick={() => setView('assessment')}>Assessment Report</button>
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
          <section className="card">
            <h2>Company Logo</h2>
            <p className="section-desc">
              Appears on the cover of both reports. Upload your logo (PNG, JPG, or SVG) — it’s saved in this browser and
              reused for every client.
            </p>
            <div className="logo-manager">
              <div className="logo-preview">
                {logo ? <img src={logo} alt="Company logo" /> : <span className="logo-empty">No logo</span>}
              </div>
              <div className="logo-actions">
                <button className="btn" onClick={() => logoInput.current?.click()}>Upload logo</button>
                {logo !== DEFAULT_LOGO && (
                  <button className="btn subtle" onClick={() => setLogo(DEFAULT_LOGO)}>Use Elevated default</button>
                )}
                {logo && <button className="btn subtle" onClick={() => setLogo('')}>Remove</button>}
                <input
                  ref={logoInput}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg"
                  hidden
                  onChange={(e) => {
                    if (e.target.files?.[0]) void uploadLogo(e.target.files[0])
                    e.target.value = ''
                  }}
                />
              </div>
            </div>
          </section>
          {SECTIONS.map((section) => (
            <section key={section.id} className="card">
              <h2>{section.title}</h2>
              {section.description && <p className="section-desc">{section.description}</p>}

              {section.fields.length > 0 && (
                <div className="fields">
                  {section.fields.map((f) => (
                    <div key={f.key} className={`field ${f.type === 'textarea' || f.type === 'checklist' ? 'field-wide' : ''}`}>
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
                      ) : f.type === 'checklist' ? (
                        <div className="checklist">
                          {f.options?.map((opt) => {
                            const selected = parseChecklist(data.fields[f.key]).includes(opt)
                            return (
                              <label key={opt} className={`checkbox ${selected ? 'checked' : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleChecklist(f.key, opt)}
                                />
                                {opt}
                              </label>
                            )
                          })}
                        </div>
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
                            onChange={(e) => updateImage(im.id, { caption: e.target.value })}
                          />
                          <label className="image-include">
                            <input
                              type="checkbox"
                              checked={im.inAssessment}
                              onChange={(e) => updateImage(im.id, { inAssessment: e.target.checked })}
                            />
                            Include in assessment
                          </label>
                          {im.inAssessment && (
                            <select
                              className="image-section"
                              value={im.section}
                              onChange={(e) => updateImage(im.id, { section: e.target.value })}
                            >
                              <option value="">General / appendix</option>
                              {ASSESSMENT_SECTIONS.map((s) => (
                                <option key={s.id} value={s.id}>{s.title}</option>
                              ))}
                            </select>
                          )}
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
              <h2>Internal Report</h2>
              <div className="summary-buttons">
                <button
                  className="btn primary"
                  disabled={pdfBusy}
                  onClick={() => exportPdf(reportHtml, pdfFilename('Internal Report'))}
                >
                  {pdfBusy ? 'Generating PDF…' : 'Download PDF'}
                </button>
              </div>
            </div>
            <p className="section-desc">
              Internal report with your evaluation data and any uploaded photos/diagrams. Download it as a PDF.
            </p>
            <iframe className="report-preview" title="Internal report preview" srcDoc={reportHtml} />
          </section>
        </main>
      )}

      {view === 'assessment' && (
        <main className="assessment-view">
          <section className="card">
            <div className="summary-actions">
              <h2>Assessment Report</h2>
              <div className="summary-buttons">
                <button
                  className="btn primary"
                  disabled={pdfBusy}
                  onClick={() => exportPdf(assessmentHtml, pdfFilename('Assessment Report'))}
                >
                  {pdfBusy ? 'Generating PDF…' : 'Download PDF'}
                </button>
              </div>
            </div>
            <p className="section-desc">
              Narrative assessment auto-drafted from the form. Edit any finding below; edits are saved and used in the report.
              Recommended actions and the risk-priorities table are generated automatically.
            </p>

            <div className="report-options">
              <span className="report-options-label">Report options:</span>
              <label>
                <input
                  type="checkbox"
                  checked={data.reportOptions.coverPage}
                  onChange={(e) => setReportOption({ coverPage: e.target.checked })}
                />
                Cover page
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={data.reportOptions.techDetail}
                  onChange={(e) => setReportOption({ techDetail: e.target.checked })}
                />
                Include technical detail
              </label>
            </div>

            <section className="ai-panel">
              <h3 className="ai-title">AI Analysis (optional)</h3>
              <p className="ai-note">
                Reads the full form (including notes) via the Anthropic API using <strong>your own API key</strong> to draft a
                context-aware assessment that correlates answers across sections. The key is stored only in this browser
                (localStorage) and sent directly to Anthropic; it is <strong>not</strong> included in JSON exports. Runs cost
                money against your account. The rule-based draft below works with no key.
              </p>
              <div className="ai-controls">
                <input
                  type="password"
                  className="ai-key"
                  placeholder="Anthropic API key (sk-ant-...)"
                  value={aiKey}
                  onChange={(e) => setAiKey(e.target.value)}
                  autoComplete="off"
                />
                <select value={aiModel} onChange={(e) => setAiModel(e.target.value)}>
                  {AI_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
                <button className="btn primary" onClick={runAi} disabled={aiStatus.state === 'running'}>
                  {aiStatus.state === 'running' ? 'Analyzing…' : 'Generate with AI'}
                </button>
                <button className="btn subtle" onClick={clearAllOverrides}>Reset to auto-draft</button>
              </div>
              {aiStatus.message && <p className={`ai-status ai-${aiStatus.state}`}>{aiStatus.message}</p>}
            </section>

            <AssessmentEditor
              blockId="exec"
              label="Executive Summary"
              auto={assessment.execSummary}
              value={data.assessmentText.exec}
              onChange={setAssessmentOverride}
              onReset={clearAssessmentOverride}
            />
            <AssessmentEditor
              blockId="overall"
              label={`Overall Risk Assessment — ${assessment.overallRating}`}
              auto={assessment.overall}
              value={data.assessmentText.overall}
              onChange={setAssessmentOverride}
              onReset={clearAssessmentOverride}
            />
            {assessment.sections.map((s) => (
              <div key={s.id} className={`assess-section ${s.hidden ? 'excluded' : ''}`}>
                <div className="assess-section-head">
                  <h3>
                    {s.title}
                    <span className={`ga-pill ${RATING_CLASS[s.rating] ?? 'info'}`}>{s.rating}</span>
                    {s.hidden && <span className="excluded-tag">Excluded</span>}
                  </h3>
                  <div className="rating-control">
                    <label className="exclude-toggle" title="Exclude this section from the report">
                      <input type="checkbox" checked={!!s.hidden} onChange={() => toggleHiddenSection(s.id)} />
                      Exclude
                    </label>
                    <label htmlFor={`rating__${s.id}`}>Impact</label>
                    <select
                      id={`rating__${s.id}`}
                      value={s.rating}
                      disabled={s.hidden}
                      onChange={(e) => setAssessmentOverride(`rating__${s.id}`, e.target.value)}
                    >
                      {RATINGS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                    {s.ratingOverridden && !s.hidden && (
                      <button
                        className="btn subtle rating-reset"
                        onClick={() => clearAssessmentOverride(`rating__${s.id}`)}
                        title={`Reset to auto (${s.autoRating})`}
                      >
                        auto: {s.autoRating} ✕
                      </button>
                    )}
                  </div>
                </div>
                <AssessmentEditor
                  blockId={`client__${s.id}`}
                  label="Client recommendation"
                  auto={s.clientRecommendation}
                  value={data.assessmentText[`client__${s.id}`]}
                  onChange={setAssessmentOverride}
                  onReset={clearAssessmentOverride}
                />
                <AssessmentEditor
                  blockId={`finding__${s.id}`}
                  label="Technical detail"
                  auto={s.finding}
                  actions={s.actions}
                  value={data.assessmentText[`finding__${s.id}`]}
                  onChange={setAssessmentOverride}
                  onReset={clearAssessmentOverride}
                  compact
                />
              </div>
            ))}
            <AssessmentEditor
              blockId="nextSteps"
              label="Recommended Next Steps"
              auto={assessment.nextSteps}
              value={data.assessmentText.nextSteps}
              onChange={setAssessmentOverride}
              onReset={clearAssessmentOverride}
            />
          </section>

          <section className="card">
            <h2>Report Preview</h2>
            <iframe className="report-preview" title="Assessment report preview" srcDoc={assessmentHtml} />
          </section>
        </main>
      )}

      <footer className="app-footer">Data stays in your browser (localStorage). Export before switching devices.</footer>
    </div>
  )
}

interface AssessmentEditorProps {
  blockId: string
  label: string
  auto: string
  value: string | undefined
  badge?: string
  actions?: string[]
  compact?: boolean
  onChange: (blockId: string, value: string) => void
  onReset: (blockId: string) => void
}

/** Map an assessment rating to a pill CSS class. */
const RATING_CLASS: Record<string, string> = {
  'At Risk': 'high',
  Attention: 'medium',
  Good: 'low',
  Informational: 'info',
  'Not Assessed': 'info',
}

function AssessmentEditor({ blockId, label, auto, value, badge, actions, compact, onChange, onReset }: AssessmentEditorProps) {
  const edited = value !== undefined
  const badgeClass = badge ? RATING_CLASS[badge] ?? 'info' : ''
  return (
    <div className={`assess-block ${compact ? 'compact' : ''}`}>
      <div className="assess-head">
        <h3>
          {label}
          {badge && <span className={`ga-pill ${badgeClass}`}>{badge}</span>}
        </h3>
        {edited && (
          <button className="btn subtle" onClick={() => onReset(blockId)} title="Reset to auto-draft">
            Reset to auto-draft
          </button>
        )}
      </div>
      <textarea
        className="assess-text"
        rows={compact ? 3 : 4}
        value={edited ? value : auto}
        onChange={(e) => onChange(blockId, e.target.value)}
      />
      {actions && actions.length > 0 && (
        <div className="assess-actions">
          <span className="assess-actions-label">Recommended actions (auto)</span>
          <ul>
            {actions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
