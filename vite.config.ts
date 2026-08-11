import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The site is served from https://<user>.github.io/net_eval/ on GitHub Pages,
// so assets must be referenced under the repository sub-path. Locally (dev),
// base falls back to '/'.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/net_eval/' : '/',
}))
