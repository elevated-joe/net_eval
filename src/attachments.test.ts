import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { formatBytes, readAttachment } from './attachments'

/** Build a minimal .docx (a zip with the parts Word writes) as a File. */
async function makeDocx(paragraphs: string[], name = 'audit.docx'): Promise<File> {
  const body = paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('')
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types/>')
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>`)
  const blob = await zip.generateAsync({ type: 'blob' })
  return new File([blob], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}

describe('readAttachment', () => {
  it('extracts text from a .docx, one line per paragraph', async () => {
    const file = await makeDocx(['Firewall: SonicWall TZ400 (end of support)', 'Backups last restore-tested 2023.'])
    const a = await readAttachment(file)

    expect(a.kind).toBe('docx')
    expect(a.name).toBe('audit.docx')
    expect(a.base64).toBeUndefined()
    expect(a.text).toBe('Firewall: SonicWall TZ400 (end of support)\nBackups last restore-tested 2023.')
  })

  it('decodes XML entities rather than leaking markup', async () => {
    const file = await makeDocx(['Ingram &amp; Co. flagged &lt;none&gt; for MFA'])
    const a = await readAttachment(file)
    expect(a.text).toBe('Ingram & Co. flagged <none> for MFA')
  })

  it('rejects a file that is neither PDF nor .docx', async () => {
    const file = new File(['notes'], 'notes.txt', { type: 'text/plain' })
    await expect(readAttachment(file)).rejects.toThrow(/not a PDF or Word/)
  })

  it('points legacy .doc files at a supported format', async () => {
    const file = new File(['old'], 'report.doc', { type: 'application/msword' })
    await expect(readAttachment(file)).rejects.toThrow(/save it as \.docx or PDF/)
  })

  it('rejects a .docx with no readable document part', async () => {
    const zip = new JSZip()
    zip.file('word/styles.xml', '<styles/>')
    const blob = await zip.generateAsync({ type: 'blob' })
    await expect(readAttachment(new File([blob], 'broken.docx'))).rejects.toThrow(/does not look like a Word document/)
  })
})

describe('formatBytes', () => {
  it('scales units', () => {
    expect(formatBytes(900)).toBe('900 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
