// Client-side PDF export.
//
// Turns a standalone report HTML document (the same string used for the
// on-screen preview and the .html download) into a real PDF file and triggers
// a direct download — no browser print dialog and no new tab, on any platform
// including mobile.
//
// The report is rendered off-screen in a same-origin iframe (so its own <style>
// applies and the layout matches the preview exactly), rasterized once with
// html2canvas, then sliced into US-Letter pages. Page breaks snap to element
// boundaries (top-level blocks, figures, tables, headings) so a section or
// image is never cut across two pages, and the cover page always gets a page to
// itself. This preserves the report's real layout — flexbox cover, colored
// callouts, rating pills — which HTML-to-vector converters mangle.

import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

// The report HTML is designed at 8.5in ≈ 816 CSS px wide.
const SOURCE_WIDTH_PX = 816
const SCALE = 2

function waitForImages(doc: Document): Promise<void> {
  return Promise.all(
    Array.from(doc.images).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.onload = () => resolve()
            img.onerror = () => resolve()
          }),
    ),
  ).then(() => undefined)
}

/**
 * Render `html` and save it as `filename` (a direct PDF download).
 * Resolves once the file has been handed to the browser.
 */
export async function exportHtmlAsPdf(html: string, filename: string): Promise<void> {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${SOURCE_WIDTH_PX}px;height:1200px;border:0;background:#fff;`
  document.body.appendChild(iframe)

  try {
    await new Promise<void>((resolve, reject) => {
      iframe.onload = () => resolve()
      iframe.onerror = () => reject(new Error('Report failed to render.'))
      iframe.srcdoc = html
    })

    const doc = iframe.contentDocument
    if (!doc) throw new Error('Report document unavailable.')

    await new Promise((r) => setTimeout(r, 50))
    try {
      await (doc as Document & { fonts?: FontFaceSet }).fonts?.ready
    } catch {
      /* Font Loading API unavailable — ignore */
    }
    await waitForImages(doc)

    const page = (doc.querySelector('.page') as HTMLElement | null) ?? doc.body
    // Strip on-screen chrome that shouldn't bake into the page image.
    page.style.boxShadow = 'none'
    page.style.margin = '0'
    iframe.style.height = `${page.scrollHeight + 200}px`

    const canvas = await html2canvas(page, {
      scale: SCALE,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      windowWidth: SOURCE_WIDTH_PX,
      imageTimeout: 0,
    })
    const W = canvas.width
    const H = canvas.height
    if (!W || !H) throw new Error('Nothing to render.')

    const pdf = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' })
    const pageWpt = pdf.internal.pageSize.getWidth()
    const pageHpt = pdf.internal.pageSize.getHeight()
    const vMargin = 18 // 0.25in top/bottom; horizontal margins come from the page's own padding
    const usableHpt = pageHpt - vMargin * 2
    const pagePx = Math.floor((usableHpt * W) / pageWpt) // canvas px that fit on one page

    // Candidate break offsets (canvas px), measured from the top of the page.
    const pageTop = page.getBoundingClientRect().top
    const breakSet = new Set<number>([0, H])
    const collect = (sel: string) =>
      doc.querySelectorAll(sel).forEach((el) => {
        const y = Math.round((el.getBoundingClientRect().top - pageTop) * SCALE)
        if (y > 0 && y < H) breakSet.add(y)
      })
    collect('.page > *')
    collect('section')
    collect('.figures')
    collect('figure')
    collect('table.data')
    collect('h2')
    const breaks = Array.from(breakSet).sort((a, b) => a - b)

    // Force a page break after the cover page, if present.
    let forced = -1
    const first = page.children[0] as HTMLElement | undefined
    const second = page.children[1] as HTMLElement | undefined
    if (first?.classList.contains('cover-page') && second) {
      forced = Math.round((second.getBoundingClientRect().top - pageTop) * SCALE)
    }

    let y = 0
    let pageIndex = 0
    while (y < H - 1) {
      const hardLimit = y + pagePx
      let end: number
      if (forced > y && forced <= hardLimit) {
        end = forced
      } else {
        const soft = breaks.filter((b) => b > y && b <= hardLimit)
        end = soft.length ? soft[soft.length - 1] : Math.min(hardLimit, H)
      }
      if (end <= y) end = Math.min(hardLimit, H) // safety for a block taller than a page

      const hpx = end - y
      const slice = document.createElement('canvas')
      slice.width = W
      slice.height = hpx
      const ctx = slice.getContext('2d')
      if (ctx) ctx.drawImage(canvas, 0, y, W, hpx, 0, 0, W, hpx)

      if (pageIndex > 0) pdf.addPage()
      const imgHpt = (hpx * pageWpt) / W
      pdf.addImage(slice.toDataURL('image/jpeg', 0.95), 'JPEG', 0, vMargin, pageWpt, imgHpt)

      pageIndex++
      y = end
    }

    pdf.save(filename)
  } finally {
    iframe.remove()
  }
}
