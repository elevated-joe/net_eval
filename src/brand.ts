// Company branding.
//
// DEFAULT_LOGO is a recreated Elevated MSP mark (a blue-gradient mountain range
// over an "ELEVATED" wordmark with a small "MSP") shipped as an inline SVG data
// URL so report covers are branded out of the box. Users can replace it with
// their own uploaded logo from the form; the uploaded logo is stored in the
// browser (localStorage) and overrides this default.

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 152" width="340" height="152">
  <defs>
    <linearGradient id="elev" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6a7bf7"/>
      <stop offset="1" stop-color="#1b2ea3"/>
    </linearGradient>
  </defs>
  <path fill="url(#elev)" d="M6,104 L62,56 L76,66 L98,36 L120,60 L154,18 L169,7 L185,55 L205,39 L231,67 L268,92 L286,71 L300,81 L334,104 Z"/>
  <text x="168" y="140" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="42" font-weight="700" letter-spacing="3" fill="#111827">ELEVATED</text>
  <text x="322" y="112" text-anchor="middle" font-family="Georgia, serif" font-size="13" font-weight="700" letter-spacing="2" fill="#2540c0">MSP</text>
</svg>`

export const DEFAULT_LOGO = `data:image/svg+xml,${encodeURIComponent(LOGO_SVG)}`
