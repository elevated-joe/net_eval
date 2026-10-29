// Reference documents attached to an evaluation.
//
// External reports — a vendor audit, a prior assessment, pen-test results —
// can be attached so the AI draft takes them into account alongside the intake
// answers. PDFs are sent to the model as native document blocks, so tables and
// layout survive; Word .docx files are unzipped in the browser and sent as
// extracted text.
//
// Attachments are session-only on purpose: they are held in React state, never
// written to localStorage and never part of a JSON export, because a single
// real report would exhaust the browser's storage budget. They are also input
// only — nothing here is named, quoted, or listed in the generated report.

export type AttachmentKind = 'pdf' | 'docx'

export interface Attachment {
  id: string
  name: string
  kind: AttachmentKind
  sizeBytes: number
  /** Base64 of the original file (PDF only) — sent to the model as-is. */
  base64?: string
  /** Text extracted in the browser (.docx only). */
  text?: string
  /** Optional analyst note describing what the document is. */
  note: string
}

/**
 * Per-file ceiling. The Messages API caps a whole request at 32 MB, and a run
 * sends every attachment plus the intake, so keep a margin under that.
 */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

/** Extracted .docx text is truncated here to keep a run's token cost sane. */
const MAX_TEXT_CHARS = 120_000

export const ATTACHMENT_ACCEPT = 'application/pdf,.pdf,.docx'

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function kindOf(file: File): AttachmentKind | null {
  const name = file.name.toLowerCase()
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.docx')) return 'docx'
  return null
}

/** Base64 payload of a file, without the `data:...;base64,` prefix. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const comma = result.indexOf(',')
      if (comma === -1) {
        reject(new Error(`Could not read ${file.name}.`))
        return
      }
      resolve(result.slice(comma + 1))
    }
    reader.readAsDataURL(file)
  })
}

/** Flatten WordprocessingML to plain text: paragraphs become lines. */
function xmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:br\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Pull the body, footnotes, and endnotes out of a .docx. */
async function docxText(file: File): Promise<string> {
  // Imported on demand so jszip stays out of the initial bundle, the way the
  // pricing tab does it.
  const { default: JSZip } = await import('jszip')
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>
  try {
    // Read the bytes ourselves: jszip only accepts a Blob where the platform
    // supports one, and an ArrayBuffer works everywhere.
    zip = await JSZip.loadAsync(await file.arrayBuffer())
  } catch {
    throw new Error(`${file.name} could not be opened — it may be corrupt or password-protected.`)
  }
  if (!zip.file('word/document.xml')) {
    throw new Error(`${file.name} does not look like a Word document.`)
  }
  const parts: string[] = []
  for (const path of ['word/document.xml', 'word/footnotes.xml', 'word/endnotes.xml']) {
    const entry = zip.file(path)
    if (!entry) continue
    const text = xmlToText(await entry.async('string'))
    if (text) parts.push(text)
  }
  const joined = parts.join('\n\n')
  if (!joined.trim()) {
    throw new Error(`No text could be read from ${file.name} — if it is a scan, attach it as a PDF instead.`)
  }
  return joined.length > MAX_TEXT_CHARS
    ? `${joined.slice(0, MAX_TEXT_CHARS)}\n\n[Document truncated at ${MAX_TEXT_CHARS.toLocaleString()} characters.]`
    : joined
}

/**
 * Turn a picked file into an Attachment. Throws with a message meant to be
 * shown to the analyst as-is.
 */
export async function readAttachment(file: File): Promise<Attachment> {
  const kind = kindOf(file)
  if (!kind) {
    const legacy = file.name.toLowerCase().endsWith('.doc')
    throw new Error(
      legacy
        ? `${file.name} is a legacy Word file — save it as .docx or PDF and attach that.`
        : `${file.name} is not a PDF or Word (.docx) file.`,
    )
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_ATTACHMENT_BYTES)} per file.`,
    )
  }

  const base = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    sizeBytes: file.size,
    note: '',
  }
  return kind === 'pdf'
    ? { ...base, kind, base64: await fileToBase64(file) }
    : { ...base, kind, text: await docxText(file) }
}
